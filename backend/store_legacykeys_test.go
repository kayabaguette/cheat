package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// v0.16.0 renamed "snippets" to "techniques", JSON keys included. Every blob
// written before it — a stored profile or an exported file the user still has
// on disk — carries the old keys, so AppState/CheatsheetDTO/StepDTO read both.
// These tests pin that both directions hold: the legacy key is honoured, and a
// current document is never polluted by it.

const legacyState = `{
  "commands": [],
  "cheatsheets": [
    {"id":"cs1","title":"Sheet","target":"10.0.0.1","commandIds":["c1"],"snippetIds":["sn1","sn2"]}
  ],
  "roadmaps": [
    {"id":"r1","label":"RM","phases":[
      {"id":"p1","label":"Phase","steps":[{"id":"s1","text":"Step","snippetId":"sn1"}]}
    ]}
  ],
  "snippets": [
    {"id":"sn1","category":"recon","title":"Kerberoast","desc":"","tags":["ad"],
     "steps":[{"id":"ss1","template":"GetUserSPNs.py","produces":"hash"}],
     "locals":[{"name":"hash","hint":"NTLM"}]},
    {"id":"sn2","category":"recon","title":"AS-REP","desc":"","tags":[],"steps":[],"locals":[]}
  ]
}`

func TestLegacySnippetKeysAreRead(t *testing.T) {
	var s AppState
	if err := json.Unmarshal([]byte(legacyState), &s); err != nil {
		t.Fatalf("unmarshal legacy state: %v", err)
	}

	if len(s.Techniques) != 2 {
		t.Fatalf("techniques from legacy `snippets`: got %d, want 2", len(s.Techniques))
	}
	if s.Techniques[0].Title != "Kerberoast" {
		t.Errorf("technique title: got %q, want %q", s.Techniques[0].Title, "Kerberoast")
	}
	// The nested shapes have no legacy key of their own, but they must survive
	// being decoded through the alias struct.
	if len(s.Techniques[0].Steps) != 1 || s.Techniques[0].Steps[0].Produces != "hash" {
		t.Errorf("technique steps lost through the alias: %+v", s.Techniques[0].Steps)
	}
	if len(s.Techniques[0].Locals) != 1 || s.Techniques[0].Locals[0].Name != "hash" {
		t.Errorf("technique locals lost through the alias: %+v", s.Techniques[0].Locals)
	}

	sheet := s.Cheatsheets[0]
	if len(sheet.TechniqueIDs) != 2 || sheet.TechniqueIDs[0] != "sn1" {
		t.Errorf("cheatsheet techniqueIds from legacy `snippetIds`: %+v", sheet.TechniqueIDs)
	}
	// Sibling fields of the aliased one must still land.
	if len(sheet.CommandIDs) != 1 || sheet.Title != "Sheet" {
		t.Errorf("cheatsheet lost sibling fields: %+v", sheet)
	}

	step := s.Roadmaps[0].Phases[0].Steps[0]
	if step.TechniqueID != "sn1" {
		t.Errorf("step techniqueId from legacy `snippetId`: got %q, want %q", step.TechniqueID, "sn1")
	}
	if step.Text != "Step" {
		t.Errorf("step lost sibling fields: %+v", step)
	}
}

// A document carrying BOTH spellings must keep the new one: the legacy key is a
// fallback, never a merge.
func TestNewKeysWinOverLegacy(t *testing.T) {
	both := `{
	  "techniques":[{"id":"tq1","title":"new"}],
	  "snippets":[{"id":"sn1","title":"old"}],
	  "cheatsheets":[{"id":"cs1","techniqueIds":["tq1"],"snippetIds":["sn1"]}],
	  "roadmaps":[{"id":"r1","phases":[{"id":"p1","steps":[
	    {"id":"s1","techniqueId":"tq1","snippetId":"sn1"}
	  ]}]}]
	}`
	var s AppState
	if err := json.Unmarshal([]byte(both), &s); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(s.Techniques) != 1 || s.Techniques[0].ID != "tq1" {
		t.Errorf("legacy `snippets` overrode `techniques`: %+v", s.Techniques)
	}
	if got := s.Cheatsheets[0].TechniqueIDs; len(got) != 1 || got[0] != "tq1" {
		t.Errorf("legacy `snippetIds` overrode `techniqueIds`: %+v", got)
	}
	if got := s.Roadmaps[0].Phases[0].Steps[0].TechniqueID; got != "tq1" {
		t.Errorf("legacy `snippetId` overrode `techniqueId`: %q", got)
	}
}

// Reading a legacy blob and saving it back must emit the NEW keys only — this
// is what lets a stored profile self-heal on its first autosave, and is why no
// migration pass over the profiles table is needed.
func TestLegacyStateRewritesToNewKeysOnSave(t *testing.T) {
	var s AppState
	if err := json.Unmarshal([]byte(legacyState), &s); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	blob, err := json.Marshal(nonNilState(s))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	out := string(blob)
	for _, legacy := range []string{`"snippets"`, `"snippetIds"`, `"snippetId"`} {
		if strings.Contains(out, legacy) {
			t.Errorf("re-marshalled state still carries %s", legacy)
		}
	}
	for _, want := range []string{`"techniques"`, `"techniqueIds"`, `"techniqueId"`} {
		if !strings.Contains(out, want) {
			t.Errorf("re-marshalled state is missing %s", want)
		}
	}
}

// A state with neither spelling must still normalise to an empty array, not
// null — the pre-0.9.0 case nonNilState exists for.
func TestStateWithoutTechniquesNormalises(t *testing.T) {
	var s AppState
	if err := json.Unmarshal([]byte(`{"commands":[]}`), &s); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	blob, err := json.Marshal(nonNilState(s))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(blob), `"techniques":[]`) {
		t.Errorf("absent techniques did not normalise to []: %s", blob)
	}
}
