// Persistence layer for the Cheat app (M3).
//
// LEAN CHOICE (deliberate, documented): the API exposes a COARSE whole-AppState
// contract (GET/PUT /api/state) rather than the SPEC's granular per-entity CRUD.
// The frontend keeps its entire state in memory (components/store.tsx) and simply
// snapshots it here; this file gives that snapshot durable, relational storage.
//
// Storage is relational GORM over a PURE-GO SQLite driver (github.com/glebarez/
// sqlite → modernc.org/sqlite) so the distroless static build works with
// CGO_ENABLED=0. Entities (Category/Command/Reference/Roadmap/Phase/Step/
// Cheatsheet) are real rows; the id-keyed maps (notes/checks/openSteps), the
// settings object and the `initialized` flag live in a tiny kv table as JSON.
//
// Variable VALUES are NEVER persisted (SPEC D7, memory-only) — they are not part
// of the AppState contract below.
package main

import (
	"encoding/json"
	"errors"
	"log"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// --- Wire contract (AppState) ----------------------------------------------
// These structs mirror frontend/src/types.ts exactly (field names via json tags)
// and are the canonical JSON exchanged by the API and hydrated by the store.

type CategoryDTO struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Color string `json:"color"`
}

type CommandDTO struct {
	ID       string   `json:"id"`
	Category string   `json:"category"`
	Tool     string   `json:"tool"`
	Title    string   `json:"title"`
	Template string   `json:"template"`
	Desc     string   `json:"desc"`
	Tags     []string `json:"tags"`
	Favorite bool     `json:"favorite"`
}

type ReferenceDTO struct {
	ID    string   `json:"id"`
	Title string   `json:"title"`
	URL   string   `json:"url"`
	Desc  string   `json:"desc"`
	Tags  []string `json:"tags"`
}

type StepDTO struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	CommandID string `json:"commandId,omitempty"`
}

type PhaseDTO struct {
	ID    string    `json:"id"`
	Label string    `json:"label"`
	Steps []StepDTO `json:"steps"`
}

type RoadmapDTO struct {
	ID     string     `json:"id"`
	Label  string     `json:"label"`
	Phases []PhaseDTO `json:"phases"`
}

type CheatsheetDTO struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Target     string   `json:"target"`
	CommandIDs []string `json:"commandIds"`
}

type SettingsDTO struct {
	Theme         string  `json:"theme"`
	ActiveRoadmap *string `json:"activeRoadmap"`
	ActiveSheet   string  `json:"activeSheet"`
}

// AppState is the whole persisted snapshot. Empty/zero when not yet initialized.
type AppState struct {
	Categories  []CategoryDTO     `json:"categories"`
	Commands    []CommandDTO      `json:"commands"`
	References  []ReferenceDTO    `json:"references"`
	Roadmaps    []RoadmapDTO      `json:"roadmaps"`
	Cheatsheets []CheatsheetDTO   `json:"cheatsheets"`
	Notes       map[string]string `json:"notes"`
	Checks      map[string]bool   `json:"checks"`
	OpenSteps   map[string]bool   `json:"openSteps"`
	Results     map[string]string `json:"results"`
	Settings    SettingsDTO       `json:"settings"`
}

// emptyState returns a zeroed-but-non-null AppState (maps/slices initialized so
// the JSON marshals to [] / {} rather than null, matching the frontend shape).
func emptyState() AppState {
	return AppState{
		Categories:  []CategoryDTO{},
		Commands:    []CommandDTO{},
		References:  []ReferenceDTO{},
		Roadmaps:    []RoadmapDTO{},
		Cheatsheets: []CheatsheetDTO{},
		Notes:       map[string]string{},
		Checks:      map[string]bool{},
		OpenSteps:   map[string]bool{},
		Results:     map[string]string{},
		Settings:    SettingsDTO{Theme: "dark", ActiveRoadmap: nil, ActiveSheet: ""},
	}
}

// --- GORM models ------------------------------------------------------------
// Relational rows. String-slice fields (tags, commandIds) are stored as JSON via
// GORM's `serializer:json`. Phase→Roadmap and Step→Phase are FK relations with a
// Position column so array ORDER is preserved on read.

type Category struct {
	Key   string `gorm:"primaryKey"`
	Label string
	Color string
}

type Command struct {
	ID       string `gorm:"primaryKey"`
	Category string
	Tool     string
	Title    string
	Template string
	Desc     string
	Tags     []string `gorm:"serializer:json"`
	Favorite bool
}

type Reference struct {
	ID    string `gorm:"primaryKey"`
	Title string
	URL   string
	Desc  string
	Tags  []string `gorm:"serializer:json"`
}

type Roadmap struct {
	ID       string  `gorm:"primaryKey"`
	Label    string
	Position int
	Phases   []Phase `gorm:"foreignKey:RoadmapID;constraint:OnDelete:CASCADE"`
}

type Phase struct {
	ID        string `gorm:"primaryKey"`
	RoadmapID string `gorm:"index"`
	Label     string
	Position  int
	Steps     []Step `gorm:"foreignKey:PhaseID;constraint:OnDelete:CASCADE"`
}

type Step struct {
	ID        string `gorm:"primaryKey"`
	PhaseID   string `gorm:"index"`
	Text      string
	CommandID string
	Position  int
}

type Cheatsheet struct {
	ID         string `gorm:"primaryKey"`
	Title      string
	Target     string
	Position   int
	CommandIDs []string `gorm:"serializer:json"`
}

// KV is the tiny key/value table for the id-keyed maps, settings and the
// `initialized` flag. All values are JSON.
type KV struct {
	Key   string `gorm:"primaryKey"`
	Value string
}

// kv keys.
const (
	kvInitialized = "initialized"
	kvNotes       = "notes"
	kvChecks      = "checks"
	kvOpenSteps   = "openSteps"
	kvResults     = "results"
	kvSettings    = "settings"
)

// openDB opens SQLite at dbPath, enables WAL + FK enforcement and AutoMigrates
// every model. It fails loud (returns error) if the DB cannot be opened.
func openDB(dbPath string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		// Quiet by default — the minimal Gin access log is the only request log
		// (SPEC Q178 / OPSEC); never echo bound SQL params.
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}
	// WAL for durability + concurrent reads; enforce FKs for the cascade deletes.
	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL;",
		"PRAGMA foreign_keys=ON;",
		"PRAGMA busy_timeout=5000;",
	} {
		if err := db.Exec(pragma).Error; err != nil {
			return nil, err
		}
	}
	if err := db.AutoMigrate(
		&Category{}, &Command{}, &Reference{},
		&Roadmap{}, &Phase{}, &Step{}, &Cheatsheet{},
		&KV{},
	); err != nil {
		return nil, err
	}
	return db, nil
}

// --- Read: assemble AppState from the tables + kv ---------------------------

func loadState(db *gorm.DB) (bool, AppState, error) {
	state := emptyState()

	initialized, err := kvBool(db, kvInitialized)
	if err != nil {
		return false, state, err
	}
	// Not initialized → return the empty/zero state (state stays empty).
	if !initialized {
		return false, state, nil
	}

	var cats []Category
	if err := db.Order("rowid").Find(&cats).Error; err != nil {
		return false, state, err
	}
	for _, c := range cats {
		state.Categories = append(state.Categories, CategoryDTO{Key: c.Key, Label: c.Label, Color: c.Color})
	}

	var cmds []Command
	if err := db.Order("rowid").Find(&cmds).Error; err != nil {
		return false, state, err
	}
	for _, c := range cmds {
		state.Commands = append(state.Commands, CommandDTO{
			ID: c.ID, Category: c.Category, Tool: c.Tool, Title: c.Title,
			Template: c.Template, Desc: c.Desc, Tags: nonNil(c.Tags),
			Favorite: c.Favorite,
		})
	}

	var refs []Reference
	if err := db.Order("rowid").Find(&refs).Error; err != nil {
		return false, state, err
	}
	for _, r := range refs {
		state.References = append(state.References, ReferenceDTO{
			ID: r.ID, Title: r.Title, URL: r.URL, Desc: r.Desc, Tags: nonNil(r.Tags),
		})
	}

	var roadmaps []Roadmap
	if err := db.
		Preload("Phases", func(tx *gorm.DB) *gorm.DB { return tx.Order("phases.position") }).
		Preload("Phases.Steps", func(tx *gorm.DB) *gorm.DB { return tx.Order("steps.position") }).
		Order("position").Find(&roadmaps).Error; err != nil {
		return false, state, err
	}
	for _, r := range roadmaps {
		rd := RoadmapDTO{ID: r.ID, Label: r.Label, Phases: []PhaseDTO{}}
		for _, p := range r.Phases {
			pd := PhaseDTO{ID: p.ID, Label: p.Label, Steps: []StepDTO{}}
			for _, s := range p.Steps {
				pd.Steps = append(pd.Steps, StepDTO{ID: s.ID, Text: s.Text, CommandID: s.CommandID})
			}
			rd.Phases = append(rd.Phases, pd)
		}
		state.Roadmaps = append(state.Roadmaps, rd)
	}

	var sheets []Cheatsheet
	if err := db.Order("position").Find(&sheets).Error; err != nil {
		return false, state, err
	}
	for _, s := range sheets {
		state.Cheatsheets = append(state.Cheatsheets, CheatsheetDTO{
			ID: s.ID, Title: s.Title, Target: s.Target, CommandIDs: nonNil(s.CommandIDs),
		})
	}

	if err := kvUnmarshal(db, kvNotes, &state.Notes); err != nil {
		return false, state, err
	}
	if err := kvUnmarshal(db, kvChecks, &state.Checks); err != nil {
		return false, state, err
	}
	if err := kvUnmarshal(db, kvOpenSteps, &state.OpenSteps); err != nil {
		return false, state, err
	}
	if err := kvUnmarshal(db, kvResults, &state.Results); err != nil {
		return false, state, err
	}
	if err := kvUnmarshal(db, kvSettings, &state.Settings); err != nil {
		return false, state, err
	}

	return true, state, nil
}

// --- Write: full REPLACE of all persisted data in ONE transaction -----------

func saveState(db *gorm.DB, s AppState) error {
	return db.Transaction(func(tx *gorm.DB) error {
		// Wipe every table (children first for FK safety).
		for _, m := range []any{
			&Step{}, &Phase{}, &Roadmap{},
			&Command{}, &Reference{}, &Category{}, &Cheatsheet{},
		} {
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(m).Error; err != nil {
				return err
			}
		}

		// Reinsert entities, stamping Position from array index to preserve order.
		cats := make([]Category, 0, len(s.Categories))
		for _, c := range s.Categories {
			cats = append(cats, Category{Key: c.Key, Label: c.Label, Color: c.Color})
		}
		if err := insertAll(tx, cats); err != nil {
			return err
		}

		cmds := make([]Command, 0, len(s.Commands))
		for _, c := range s.Commands {
			cmds = append(cmds, Command{
				ID: c.ID, Category: c.Category, Tool: c.Tool, Title: c.Title,
				Template: c.Template, Desc: c.Desc, Tags: nonNil(c.Tags),
				Favorite: c.Favorite,
			})
		}
		if err := insertAll(tx, cmds); err != nil {
			return err
		}

		refs := make([]Reference, 0, len(s.References))
		for _, r := range s.References {
			refs = append(refs, Reference{
				ID: r.ID, Title: r.Title, URL: r.URL, Desc: r.Desc, Tags: nonNil(r.Tags),
			})
		}
		if err := insertAll(tx, refs); err != nil {
			return err
		}

		for ri, r := range s.Roadmaps {
			if err := tx.Create(&Roadmap{ID: r.ID, Label: r.Label, Position: ri}).Error; err != nil {
				return err
			}
			for pi, p := range r.Phases {
				if err := tx.Create(&Phase{ID: p.ID, RoadmapID: r.ID, Label: p.Label, Position: pi}).Error; err != nil {
					return err
				}
				for si, st := range p.Steps {
					if err := tx.Create(&Step{
						ID: st.ID, PhaseID: p.ID, Text: st.Text, CommandID: st.CommandID, Position: si,
					}).Error; err != nil {
						return err
					}
				}
			}
		}

		sheets := make([]Cheatsheet, 0, len(s.Cheatsheets))
		for i, sh := range s.Cheatsheets {
			sheets = append(sheets, Cheatsheet{
				ID: sh.ID, Title: sh.Title, Target: sh.Target,
				Position: i, CommandIDs: nonNil(sh.CommandIDs),
			})
		}
		if err := insertAll(tx, sheets); err != nil {
			return err
		}

		// kv maps + settings + initialized flag.
		if err := kvSet(tx, kvNotes, nonNilMap(s.Notes)); err != nil {
			return err
		}
		if err := kvSet(tx, kvChecks, nonNilMap(s.Checks)); err != nil {
			return err
		}
		if err := kvSet(tx, kvOpenSteps, nonNilMap(s.OpenSteps)); err != nil {
			return err
		}
		if err := kvSet(tx, kvResults, nonNilMap(s.Results)); err != nil {
			return err
		}
		if err := kvSet(tx, kvSettings, s.Settings); err != nil {
			return err
		}
		return kvSet(tx, kvInitialized, true)
	})
}

// insertAll batch-inserts a slice (no-op when empty; generics keep it terse).
func insertAll[T any](tx *gorm.DB, rows []T) error {
	if len(rows) == 0 {
		return nil
	}
	return tx.Create(&rows).Error
}

// --- kv helpers -------------------------------------------------------------

func kvSet(db *gorm.DB, key string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return db.Save(&KV{Key: key, Value: string(b)}).Error
}

func kvGet(db *gorm.DB, key string) (string, bool, error) {
	var row KV
	err := db.First(&row, "key = ?", key).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return row.Value, true, nil
}

func kvBool(db *gorm.DB, key string) (bool, error) {
	raw, ok, err := kvGet(db, key)
	if err != nil || !ok {
		return false, err
	}
	var b bool
	if err := json.Unmarshal([]byte(raw), &b); err != nil {
		return false, err
	}
	return b, nil
}

// kvUnmarshal decodes the JSON value at key into dst; a missing key leaves dst
// untouched (it keeps the emptyState default).
func kvUnmarshal(db *gorm.DB, key string, dst any) error {
	raw, ok, err := kvGet(db, key)
	if err != nil || !ok {
		return err
	}
	return json.Unmarshal([]byte(raw), dst)
}

// --- null-safety helpers (keep JSON arrays/maps non-null) -------------------

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
func nonNilMap[K comparable, V any](m map[K]V) map[K]V {
	if m == nil {
		return map[K]V{}
	}
	return m
}

// mustOpenDB opens the DB or exits the process (fail loud, SPEC: DB is required).
func mustOpenDB(dbPath string) *gorm.DB {
	db, err := openDB(dbPath)
	if err != nil {
		log.Fatalf("cheat: cannot open database %q: %v", dbPath, err)
	}
	return db
}
