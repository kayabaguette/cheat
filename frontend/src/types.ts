// Core domain types for the Cheat app (M0 scaffold).
// Faithful port of the DCLogic prototype's data shapes, restructured per the SPEC.

export interface Category {
  key: string;
  label: string;
  color: string;
}

export interface Command {
  id: string;
  category: string;
  tool: string;
  title: string;
  template: string;
  desc: string;
  tags: string[];
  // Pinned to the top of its tool group in the Library. Optional/absent = not a favorite.
  favorite?: boolean;
}

export interface Reference {
  id: string;
  title: string;
  url: string;
  desc: string;
  tags: string[];
}

export interface Cheatsheet {
  id: string;
  title: string;
  target: string;
  commandIds: string[];
  // Second, independently ordered chapter: the sheet's techniques. Optional so a
  // pre-0.9.0 export stays importable unchanged.
  techniqueIds?: string[];
}

// --- v0.9.0: techniques (ordered command chains) ----------------------------
// A technique is REUSABLE: an ordered set of commands run one after the other,
// where a step commonly consumes what the previous one produced (dump a hash ->
// craft a ticket -> use it). Unlike a Roadmap it carries no progress state, and
// unlike a Cheatsheet it is library-level content.
//
// Called a "technique" until v0.16.0 — the persisted keys were renamed with it,
// and the backend still READS the legacy ones (backend/store.go).

export interface TechniqueStep {
  id: string;
  // Short human label for the action ("Dump du hash du compte de service").
  label?: string;
  // The command line itself. INLINE only — a step never references a Command,
  // so a technique is self-contained.
  template: string;
  // Name of the local variable this step yields, when any. Purely an anchor: it
  // places the capture field under the step that produces the value. The
  // authoritative declaration list is Technique.locals.
  produces?: string;
}

// DEFINITION of a technique-local variable. Values are NOT here: they are
// memory-only and never persisted (D7), exactly like the global variable values.
export interface TechniqueLocal {
  // Lower case, ^[a-z][a-z0-9_]*$ — the token class checked in lib/vars.ts.
  name: string;
  // Optional reminder of what to paste ("hash NTLM du compte de service").
  hint?: string;
}

export interface Technique {
  id: string;
  // Same key space as Command.category. A technique has no `tool`.
  category: string;
  title: string;
  desc: string;
  tags: string[];
  steps: TechniqueStep[];
  locals: TechniqueLocal[];
}

// --- v0.11.0: conditional steps -------------------------------------------
// A TRIGGER is one named condition a roadmap can branch on — a service found on
// the target ("FTP", "SMB", "HTTP"). Declared per roadmap, so each roadmap owns
// its own condition vocabulary. Whether a trigger is actually ON is per-target
// PROGRESS, not structure: it lives in AppState.activeTriggers, next to `checks`.
export interface Trigger {
  id: string;
  // Free label, shown as a chip. Matched case-insensitively against nmap service
  // names by the « détecter depuis le résultat » helper (lib/triggers.ts).
  label: string;
}

// v0.13.0 — one item of a step's checklist. Made for the enumeration steps whose
// content is a dozen one-liners too trivial to earn a Commandes entry, but
// worth ticking off one by one. Its DONE state lives in AppState.checks under its
// own id, exactly like a step's, so the whole purge/reset machinery applies to it
// unchanged.
export interface SubStep {
  id: string;
  text: string;
}

export interface Step {
  id: string;
  text: string;
  commandId?: string;
  // A step may link a command, a technique, or BOTH (they are cumulative).
  techniqueId?: string;
  // The triggers this step needs, and how they combine. Absent or empty list =
  // the step is UNCONDITIONAL and always applies.
  triggerIds?: string[];
  // v0.14.0 — the operator is a property of the STEP, not of each trigger: all of
  // a step's chips share it, so a step is never half OR and half AND. Absent
  // means 'any', which is exactly what pre-0.14 steps meant, so nothing to
  // migrate there.
  //   'any' — at least one of triggerIds is on
  //   'all' — every one of them is on
  // An inactive step is dimmed, not checkable, and excluded from progress —
  // numerator AND denominator, which is what lets a target with 3 services out of
  // 12 still reach 100%.
  triggerMode?: 'any' | 'all';
  /**
   * @deprecated v0.13.0 only. The AND list of the short-lived two-list model;
   * `normalizeStepTriggers` (lib/triggers.ts) folds it into triggerIds +
   * triggerMode:'all' on load. Read on load, never written; remove once no
   * profile carries it.
   */
  allTriggerIds?: string[];
  // The step's checklist. A step that has one is DONE when every item is ticked,
  // and still counts as ONE unit of progress — so a 12-item enumeration cannot
  // swamp a 14-step roadmap.
  substeps?: SubStep[];
}

export interface Phase {
  id: string;
  label: string;
  steps: Step[];
}

export interface Roadmap {
  id: string;
  label: string;
  phases: Phase[];
  // This roadmap's condition vocabulary. Optional so every pre-0.11.0 export
  // stays importable unchanged.
  triggers?: Trigger[];
}

export interface VariableDef {
  name: string;
  isBuiltin: boolean;
  sensitive: boolean;
}

// A profile is one isolated dataset (OSCP, RT, a given client…). Each profile
// owns its whole AppState; the switcher lists them by {id,name}. Variable VALUES
// are NOT per-profile — they stay global/session (memory-only, D7).
export interface ProfileMeta {
  id: string;
  name: string;
}

export type ViewKey = 'library' | 'method' | 'techniques' | 'refs' | 'cheatsheet';

export type ThemeName = 'dark' | 'light';

// M3 — the canonical persisted state contract exchanged with the Go backend.
// Variable VALUES are intentionally excluded (memory-only, D7). Field names are
// exact and must match the backend's GORM-backed JSON shape.
export interface AppState {
  categories: Category[];
  commands: Command[];
  references: Reference[];
  roadmaps: Roadmap[];
  cheatsheets: Cheatsheet[];
  // Optional: absent from every pre-0.9.0 export, which must stay importable.
  techniques?: Technique[];
  notes?: Record<string, string>;
  checks?: Record<string, boolean>;
  openSteps?: Record<string, boolean>;
  // Per-step captured command output/result (keyed by stepId, like checks/openSteps).
  results?: Record<string, string>;
  // Which triggers are ON, keyed by triggerId — "this target has an FTP". This is
  // per-engagement PROGRESS, exactly like `checks`, so it is persisted and it is
  // what « Réinitialiser la progression » clears. Optional: absent from every
  // pre-0.11.0 export.
  activeTriggers?: Record<string, boolean>;
  settings: {
    theme: ThemeName;
    activeRoadmap: string | null;
    activeSheet: string;
  };
}

// A5 — the four variable render states, plus untouched literal text.
//   resolved : name is defined AND has a non-empty value
//   empty    : name is defined but its value is empty
//   undef    : the $TOKEN is not a defined variable name
//   plain    : ordinary text (or an escaped \$ rendered as '$')
//
// v0.10.0: a LOCAL-class token ($minuscule) projects onto the SAME states —
// `resolved` when it holds a value, `empty` when it does not — so SPEC §5.10
// stays the single authority and gains no fifth state. What sets a local apart is
// carried in separate fields: `local` marks the part as an inline EDIT TARGET
// (double-click to set the value) and `name` says which variable to write.
// `name` is filled on global tokens too, so any token part can be addressed.
export interface Part {
  text: string;
  state: 'plain' | 'resolved' | 'empty' | 'undef';
  // The bare $TOKEN name this part renders. Absent on plain text.
  name?: string;
  // True for a local-class ($minuscule) token: editable in place.
  local?: boolean;
}
