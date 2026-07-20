// Persistence layer for the Cheat app.
//
// LEAN CHOICE (deliberate, documented): the API exposes a COARSE whole-AppState
// contract rather than the SPEC's granular per-entity CRUD. The frontend keeps
// its entire state in memory (components/store.tsx) and simply snapshots it here.
//
// PROFILES: a profile (e.g. OSCP, RT) is nothing but one whole AppState. Because
// the access pattern is always "load whole / save whole", each profile is stored
// as a SINGLE `profiles` row holding its AppState serialized as JSON (Profile.State)
// — no per-entity relational rows, no profile_id scoping, isolation for free.
//
// The pre-profiles builds stored ONE AppState relationally (Category/Command/…
// tables + a kv table). Those models + the legacy read path (legacyLoadState) are
// retained ONLY to migrate an existing single-dataset DB into a first profile on
// startup (migrateToProfiles); afterwards those tables are dormant and untouched.
//
// Storage uses GORM over a PURE-GO SQLite driver (github.com/glebarez/sqlite →
// modernc.org/sqlite) so the distroless static build works with CGO_ENABLED=0.
//
// Variable VALUES are NEVER persisted (SPEC D7, memory-only) — they are not part
// of the AppState contract below.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"strings"

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
//
// In the pre-profiles schema this held the id-keyed maps + settings for the
// single dataset. Post-profiles it holds only GLOBAL flags (`initialized`,
// `activeProfileId`); the per-profile maps live inside each Profile.State blob.
type KV struct {
	Key   string `gorm:"primaryKey"`
	Value string
}

// kv keys. kvInitialized..kvSettings are LEGACY (read by legacyLoadState during
// migration only). kvActiveProfile is the current global pointer to the active
// profile id.
const (
	kvInitialized   = "initialized"
	kvNotes         = "notes"
	kvChecks        = "checks"
	kvOpenSteps     = "openSteps"
	kvResults       = "results"
	kvSettings      = "settings"
	kvActiveProfile = "activeProfileId"
)

// Profile is one named dataset. State is the whole AppState serialized as JSON;
// Position preserves the display order of the profile switcher.
type Profile struct {
	ID       string `gorm:"primaryKey"`
	Name     string
	Position int
	State    string // AppState as JSON
}

// ProfileMeta is the lightweight {id,name} pair returned by the profile list.
type ProfileMeta struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// newID mints a random hex id for a server-created profile (16 bytes → 32 hex
// chars), prefixed for legibility. Uses crypto/rand (no external dep).
func newID(prefix string) string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return prefix + hex.EncodeToString(b[:])
}

// maxProfileNameLen bounds a profile name (the server binds 0.0.0.0 with no auth;
// keep stored/reflected text sane).
const maxProfileNameLen = 100

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
		&Profile{},
		// Legacy content tables — retained so a pre-profiles DB can be migrated
		// once into a first profile (see migrateToProfiles); dormant afterwards.
		&Category{}, &Command{}, &Reference{},
		&Roadmap{}, &Phase{}, &Step{}, &Cheatsheet{},
		&KV{},
	); err != nil {
		return nil, err
	}
	if err := migrateToProfiles(db); err != nil {
		return nil, err
	}
	return db, nil
}

// migrateToProfiles is a one-shot, idempotent, NON-destructive migration: if no
// profiles exist yet but a legacy single-dataset is present (kvInitialized set),
// it wraps that dataset into a first profile named "OSCP" and marks it active.
// The legacy tables are left intact. On a fresh DB it does nothing (the frontend
// seeds the first profile on load).
func migrateToProfiles(db *gorm.DB) error {
	var n int64
	if err := db.Model(&Profile{}).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return nil // already migrated / profiles exist
	}
	legacyInit, err := kvBool(db, kvInitialized)
	if err != nil {
		return err
	}
	if !legacyInit {
		return nil // fresh DB — nothing to migrate
	}
	// Reassemble the legacy AppState and store it as the first profile.
	state, err := legacyLoadState(db)
	if err != nil {
		return err
	}
	blob, err := json.Marshal(state)
	if err != nil {
		return err
	}
	id := newID("p")
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&Profile{ID: id, Name: "OSCP", Position: 0, State: string(blob)}).Error; err != nil {
			return err
		}
		return kvSet(tx, kvActiveProfile, id)
	})
}

// --- LEGACY read: assemble the pre-profiles AppState from the old tables + kv.
// Used ONLY by migrateToProfiles to wrap an existing single dataset into the
// first profile. Not on the live request path.

func legacyLoadState(db *gorm.DB) (AppState, error) {
	state := emptyState()

	var cats []Category
	if err := db.Order("rowid").Find(&cats).Error; err != nil {
		return state, err
	}
	for _, c := range cats {
		state.Categories = append(state.Categories, CategoryDTO{Key: c.Key, Label: c.Label, Color: c.Color})
	}

	var cmds []Command
	if err := db.Order("rowid").Find(&cmds).Error; err != nil {
		return state, err
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
		return state, err
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
		return state, err
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
		return state, err
	}
	for _, s := range sheets {
		state.Cheatsheets = append(state.Cheatsheets, CheatsheetDTO{
			ID: s.ID, Title: s.Title, Target: s.Target, CommandIDs: nonNil(s.CommandIDs),
		})
	}

	if err := kvUnmarshal(db, kvNotes, &state.Notes); err != nil {
		return state, err
	}
	if err := kvUnmarshal(db, kvChecks, &state.Checks); err != nil {
		return state, err
	}
	if err := kvUnmarshal(db, kvOpenSteps, &state.OpenSteps); err != nil {
		return state, err
	}
	if err := kvUnmarshal(db, kvResults, &state.Results); err != nil {
		return state, err
	}
	if err := kvUnmarshal(db, kvSettings, &state.Settings); err != nil {
		return state, err
	}

	return state, nil
}

// --- Profiles: each profile is one AppState stored as a JSON blob ------------

// listProfiles returns the {id,name} of every profile, ordered by position.
func listProfiles(db *gorm.DB) ([]ProfileMeta, error) {
	var ps []Profile
	if err := db.Order("position").Find(&ps).Error; err != nil {
		return nil, err
	}
	out := make([]ProfileMeta, 0, len(ps))
	for _, p := range ps {
		out = append(out, ProfileMeta{ID: p.ID, Name: p.Name})
	}
	return out, nil
}

// getActiveProfileID returns the active profile id, or "" if none is set.
func getActiveProfileID(db *gorm.DB) (string, error) {
	var id string
	if err := kvUnmarshal(db, kvActiveProfile, &id); err != nil {
		return "", err
	}
	return id, nil
}

// setActiveProfileID persists the active profile pointer after checking the
// profile exists. Returns gorm.ErrRecordNotFound for an unknown id.
func setActiveProfileID(db *gorm.DB, id string) error {
	if err := db.First(&Profile{}, "id = ?", id).Error; err != nil {
		return err
	}
	return kvSet(db, kvActiveProfile, id)
}

// loadProfileState unmarshals a profile's AppState blob. Missing profile →
// gorm.ErrRecordNotFound. An empty blob decodes to the emptyState default.
func loadProfileState(db *gorm.DB, id string) (AppState, error) {
	state := emptyState()
	var p Profile
	if err := db.First(&p, "id = ?", id).Error; err != nil {
		return state, err
	}
	if p.State == "" {
		return state, nil
	}
	if err := json.Unmarshal([]byte(p.State), &state); err != nil {
		return state, err
	}
	return state, nil
}

// saveProfileState replaces a profile's AppState blob. Missing profile →
// gorm.ErrRecordNotFound (never creates a profile implicitly).
func saveProfileState(db *gorm.DB, id string, s AppState) error {
	blob, err := json.Marshal(s)
	if err != nil {
		return err
	}
	res := db.Model(&Profile{}).Where("id = ?", id).Update("state", string(blob))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// createProfile mints a profile. When cloneFrom is non-empty its AppState blob
// is copied verbatim (whole-profile clone); otherwise the profile starts empty.
// The new profile is appended (max position + 1). Returns its metadata.
func createProfile(db *gorm.DB, name, cloneFrom string) (ProfileMeta, error) {
	name = trimName(name)
	if name == "" {
		return ProfileMeta{}, errEmptyName
	}
	blob := ""
	if cloneFrom != "" {
		var src Profile
		if err := db.First(&src, "id = ?", cloneFrom).Error; err != nil {
			return ProfileMeta{}, err
		}
		blob = src.State
	}
	if blob == "" {
		b, err := json.Marshal(emptyState())
		if err != nil {
			return ProfileMeta{}, err
		}
		blob = string(b)
	}
	var maxPos struct{ Max int }
	if err := db.Model(&Profile{}).Select("COALESCE(MAX(position), -1) AS max").Scan(&maxPos).Error; err != nil {
		return ProfileMeta{}, err
	}
	p := Profile{ID: newID("p"), Name: name, Position: maxPos.Max + 1, State: blob}
	if err := db.Create(&p).Error; err != nil {
		return ProfileMeta{}, err
	}
	return ProfileMeta{ID: p.ID, Name: p.Name}, nil
}

// renameProfile updates a profile's name. Missing profile / empty name error out.
func renameProfile(db *gorm.DB, id, name string) error {
	name = trimName(name)
	if name == "" {
		return errEmptyName
	}
	res := db.Model(&Profile{}).Where("id = ?", id).Update("name", name)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// deleteProfile removes a profile. It refuses to delete the LAST profile
// (errLastProfile). If the deleted profile was active, the active pointer moves
// to the first remaining profile (by position).
func deleteProfile(db *gorm.DB, id string) error {
	var n int64
	if err := db.Model(&Profile{}).Count(&n).Error; err != nil {
		return err
	}
	if n <= 1 {
		return errLastProfile
	}
	return db.Transaction(func(tx *gorm.DB) error {
		res := tx.Delete(&Profile{}, "id = ?", id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		active, err := getActiveProfileID(tx)
		if err != nil {
			return err
		}
		if active == id {
			var first Profile
			if err := tx.Order("position").First(&first).Error; err != nil {
				return err
			}
			return kvSet(tx, kvActiveProfile, first.ID)
		}
		return nil
	})
}

// trimName trims whitespace and bounds the length of a profile name.
func trimName(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > maxProfileNameLen {
		s = s[:maxProfileNameLen]
	}
	return s
}

var (
	errEmptyName   = errors.New("profile name required")
	errLastProfile = errors.New("cannot delete the last profile")
)

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

// mustOpenDB opens the DB or exits the process (fail loud, SPEC: DB is required).
func mustOpenDB(dbPath string) *gorm.DB {
	db, err := openDB(dbPath)
	if err != nil {
		log.Fatalf("cheat: cannot open database %q: %v", dbPath, err)
	}
	return db
}
