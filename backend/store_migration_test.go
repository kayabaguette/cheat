package main

import (
	"path/filepath"
	"testing"
)

// TestMigrateToProfiles verifies the one-shot migration wraps a legacy
// single-dataset (pre-profiles) DB into a first profile named "OSCP" without
// losing data, and marks it active.
func TestMigrateToProfiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")

	// openDB creates the full schema; on an empty (uninitialized) DB the
	// migration is a no-op, so we can seed a legacy dataset by hand next.
	db, err := openDB(path)
	if err != nil {
		t.Fatalf("openDB: %v", err)
	}

	// Seed legacy content tables + the legacy `initialized` flag + settings,
	// exactly as the pre-profiles build stored a single dataset.
	if err := db.Create(&Category{Key: "recon", Label: "Recon", Color: "#fff"}).Error; err != nil {
		t.Fatalf("seed category: %v", err)
	}
	if err := db.Create(&Command{ID: "c1", Category: "recon", Tool: "nmap", Title: "scan", Template: "nmap $RHOST"}).Error; err != nil {
		t.Fatalf("seed command: %v", err)
	}
	if err := kvSet(db, kvSettings, SettingsDTO{Theme: "dark", ActiveSheet: "cs1"}); err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	if err := kvSet(db, kvInitialized, true); err != nil {
		t.Fatalf("seed initialized: %v", err)
	}

	// Run the migration (idempotent).
	if err := migrateToProfiles(db); err != nil {
		t.Fatalf("migrateToProfiles: %v", err)
	}

	profiles, err := listProfiles(db)
	if err != nil {
		t.Fatalf("listProfiles: %v", err)
	}
	if len(profiles) != 1 || profiles[0].Name != "OSCP" {
		t.Fatalf("expected one profile named OSCP, got %+v", profiles)
	}

	active, err := getActiveProfileID(db)
	if err != nil {
		t.Fatalf("getActiveProfileID: %v", err)
	}
	if active != profiles[0].ID {
		t.Fatalf("active profile = %q, want %q", active, profiles[0].ID)
	}

	state, err := loadProfileState(db, active)
	if err != nil {
		t.Fatalf("loadProfileState: %v", err)
	}
	if len(state.Commands) != 1 || state.Commands[0].ID != "c1" {
		t.Fatalf("migrated command missing: %+v", state.Commands)
	}
	if len(state.Categories) != 1 || state.Categories[0].Key != "recon" {
		t.Fatalf("migrated category missing: %+v", state.Categories)
	}
	if state.Settings.Theme != "dark" {
		t.Fatalf("migrated settings lost: %+v", state.Settings)
	}

	// Idempotent: a second run must not create a duplicate profile.
	if err := migrateToProfiles(db); err != nil {
		t.Fatalf("migrateToProfiles (2nd): %v", err)
	}
	profiles2, _ := listProfiles(db)
	if len(profiles2) != 1 {
		t.Fatalf("migration not idempotent, got %d profiles", len(profiles2))
	}
}

// TestProfileCRUD exercises create (empty + clone), rename, active pointer, and
// the last-profile delete guard.
func TestProfileCRUD(t *testing.T) {
	path := filepath.Join(t.TempDir(), "crud.db")
	db, err := openDB(path)
	if err != nil {
		t.Fatalf("openDB: %v", err)
	}

	a, err := createProfile(db, "OSCP", "")
	if err != nil {
		t.Fatalf("create A: %v", err)
	}
	// Give A some content, then clone it.
	st := emptyState()
	st.Commands = append(st.Commands, CommandDTO{ID: "x1", Tool: "nmap", Title: "t", Template: "nmap"})
	if err := saveProfileState(db, a.ID, st); err != nil {
		t.Fatalf("save A: %v", err)
	}
	b, err := createProfile(db, "RT", a.ID)
	if err != nil {
		t.Fatalf("clone B: %v", err)
	}
	bState, _ := loadProfileState(db, b.ID)
	if len(bState.Commands) != 1 || bState.Commands[0].ID != "x1" {
		t.Fatalf("clone did not copy content: %+v", bState.Commands)
	}

	// Deleting a non-last profile works; deleting the last is refused.
	if err := deleteProfile(db, b.ID); err != nil {
		t.Fatalf("delete B: %v", err)
	}
	if err := deleteProfile(db, a.ID); err == nil {
		t.Fatalf("expected last-profile delete to be refused")
	}

	// Rename.
	if err := renameProfile(db, a.ID, "OSCP-2024"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	ps, _ := listProfiles(db)
	if len(ps) != 1 || ps[0].Name != "OSCP-2024" {
		t.Fatalf("rename not applied: %+v", ps)
	}
}
