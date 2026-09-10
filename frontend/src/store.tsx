import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AppState,
  Category,
  Cheatsheet,
  Command,
  ProfileMeta,
  Reference,
  Roadmap,
  Snippet,
  SnippetLocal,
  Trigger,
  SnippetStep,
  ThemeName,
  ViewKey,
} from './types';
import { CATEGORIES, COMMANDS, INITIAL_VALUES, REFERENCES, ROADMAPS } from './data/seed';
import {
  createProfile as apiCreateProfile,
  deleteProfile as apiDeleteProfile,
  getProfileState,
  listProfiles as apiListProfiles,
  putProfileState,
  renameProfile as apiRenameProfile,
  setActiveProfile as apiSetActiveProfile,
} from './lib/api';
import { STANDARD_VARS } from './lib/theme';
import { sanitizeUrl, slug } from './lib/format';
import { definedNames } from './lib/varsets';
import { isGlobalName, isLocalName } from './lib/vars';

// Names of the 6 built-in variables — value-editable only (never renamed/deleted).
const STD_NAMES = new Set(STANDARD_VARS.map((v) => v.name));

// Palette used to color a user-created custom category (ported from the
// prototype `addCommand` extra-category palette). Indexed by the count of
// custom categories already present so successive customs cycle through it.
const CUSTOM_CAT_PALETTE = [
  '#22d3ee',
  '#e879f9',
  '#fb923c',
  '#4ade80',
  '#f43f5e',
  '#818cf8',
  '#eab308',
  '#2dd4bf',
];

// Dedupe + trim a tag list (order preserved, empties dropped).
function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

// A tool name must NEVER be a tag: the tool is already its own grouping/facet in
// the sidebar, so tagging a command with its own tool is pure redundancy.
// Comparison is case- and separator-insensitive.
function dropToolTag(tags: string[], tool: string): string[] {
  const ts = slug(tool);
  return ts ? tags.filter((t) => slug(t) !== ts) : tags;
}

// Id source for user-minted roadmaps/phases/steps/references. Uses
// crypto.randomUUID() so client-minted ids stay STABLE & UNIQUE across reloads:
// a per-session counter would restart at 0 each load and collide with ids
// already persisted in the DB. The readable prefix is kept for legibility; seed
// ids stay literal and are never regenerated.
const mint = (prefix: string): string => prefix + crypto.randomUUID();

// Keep only well-formed, de-duplicated snippet-local DEFINITIONS. A name outside
// the local token class (lib/vars.ts) could never resolve, so storing it would
// just be a dead declaration. Module-scope and pure, like cleanTags/dropToolTag,
// so the load-time normaliser can use it from a stable useCallback.
function cleanLocals(locals: SnippetLocal[]): SnippetLocal[] {
  const seen = new Set<string>();
  const out: SnippetLocal[] = [];
  for (const l of locals) {
    const name = (l.name || '').trim();
    if (!isLocalName(name) || seen.has(name)) continue;
    seen.add(name);
    const hint = (l.hint || '').trim();
    out.push(hint ? { name, hint } : { name });
  }
  return out;
}

// Drop empty snippet steps and normalise the optional fields, so `label` and
// `produces` are either a meaningful string or absent (never '').
function cleanSteps(steps: SnippetStep[]): SnippetStep[] {
  return steps
    .map((st) => {
      const template = (st.template || '').trim();
      const label = (st.label || '').trim();
      const produces = (st.produces || '').trim();
      return {
        id: st.id || mint('ss'),
        template,
        ...(label ? { label } : {}),
        ...(isLocalName(produces) ? { produces } : {}),
      };
    })
    .filter((st) => st.template !== '');
}

// Deep-ish clone: new roadmap + phase objects and fresh step arrays, so a
// mutation never aliases the previous state (mirrors the prototype's _mutRoadmaps).
function cloneRoadmaps(rms: Roadmap[]): Roadmap[] {
  return rms.map((r) => ({ ...r, phases: r.phases.map((p) => ({ ...p, steps: p.steps.slice() })) }));
}

// Every step id inside a roadmap — AND every substep id (v0.13.0), since a
// checklist item's done state lives in the same `checks` map under its own id.
// Widening this one helper is what makes deleteRoadmap / deletePhase /
// resetProgress purge checklist state too, with no change of their own.
function stepIdsOf(rm: Roadmap): string[] {
  return rm.phases.flatMap((p) =>
    p.steps.flatMap((s) => [s.id, ...(s.substeps ?? []).map((sb) => sb.id)]),
  );
}

// Every trigger id a roadmap declares — used to purge their ON state, which
// belongs to the roadmap exactly as `checks` belongs to its steps (v0.11.0).
function triggerIdsOf(rm: Roadmap): string[] {
  return (rm.triggers ?? []).map((t) => t.id);
}

// Normalise loaded roadmaps (v0.11.0): keep only well-formed, de-duplicated
// triggers, and drop any step triggerId referencing a trigger its roadmap does
// not declare. A dangling reference would gate the step on a condition nothing
// can ever turn on — permanently inactive, with no way to fix it from the UI.
// Mirrors cleanSteps/cleanLocals: normalise once, at the load boundary.
function cleanRoadmaps(rms: Roadmap[]): Roadmap[] {
  return rms.map((r) => {
    const seen = new Set<string>();
    const triggers: Trigger[] = [];
    for (const t of r.triggers ?? []) {
      const id = (t?.id || '').trim();
      const label = (t?.label || '').trim();
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      triggers.push({ id, label });
    }
    const phases = r.phases.map((p) => ({
      ...p,
      steps: p.steps.map((st) => {
        const kept = (st.triggerIds ?? []).filter((id) => seen.has(id));
        // A hand-edited file could list one trigger in BOTH lists; the OR list
        // wins, so a trigger always has exactly one mode on a given step.
        const keptAll = (st.allTriggerIds ?? []).filter(
          (id) => seen.has(id) && !kept.includes(id),
        );
        const subs = (st.substeps ?? [])
          .map((sb) => ({ id: sb.id || mint('sb'), text: (sb.text || '').trim() }))
          .filter((sb) => sb.text !== '');
        return {
          ...st,
          triggerIds: kept.length ? kept : undefined,
          allTriggerIds: keptAll.length ? keptAll : undefined,
          substeps: subs.length ? subs : undefined,
        };
      }),
    }));
    return { ...r, triggers: triggers.length ? triggers : undefined, phases };
  });
}

// Drop any key present in `ids` from an id-keyed map (booleans or strings).
function purge<T>(obj: Record<string, T>, ids: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(obj)) if (!ids.has(k)) out[k] = obj[k];
  return out;
}

// Return `obj` without `key` (a fresh object), or `obj` unchanged when the key
// is absent — so an untouched map keeps its referential identity for React.
function omitKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  if (!(key in obj)) return obj;
  const { [key]: _drop, ...rest } = obj;
  return rest;
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));

// In-memory app state. Variable VALUES live here only — never persisted to the
// DB, localStorage, or the JSON export (SPEC §2.6, D2/D7). They are seeded with
// the prototype's demo values so variable resolution is visible immediately.
export interface StoreState {
  // M3: false until the initial GET /api/state completes (success OR error).
  // The app renders a loading placeholder while false so seed data is never
  // flashed and then overwritten by the hydrated DB state.
  hydrated: boolean;
  // Multi-profile: the list of profiles (id+name) and the id of the active one.
  // Each profile is an isolated AppState; switching re-hydrates via a full reload.
  profiles: ProfileMeta[];
  activeProfileId: string;
  theme: ThemeName;
  view: ViewKey;
  values: Record<string, string>;
  activeCat: string | null;
  activeTool: string | null;
  activeTag: string | null;
  // v0.11.0 — the « Favoris » scope of the Bibliothèque. A pseudo-category, so
  // it is its own flag rather than a sentinel activeCat that would match no
  // command and break the category → tool grouping.
  favOnly: boolean;
  query: string;
  // Which sidebar categories are expanded to reveal their tool list.
  expanded: Record<string, boolean>;
  // Left sidebar folded/unfolded (SPEC Q145 — manual toggle, no auto-collapse).
  // Device-local UI preference: persisted in localStorage, NOT in the profile
  // state, so it is out of the import/export contract and identical across
  // profiles. It never holds a variable value, so D7/OPSEC is unaffected.
  sidebarOpen: boolean;
  // Per-command personal notes (memory-only in M0).
  notes: Record<string, string>;
  // Transient status message (auto-dismisses); shown by <Toast>.
  toast: string;
  // --- M2: Commands & categories (now mutable, seeded from the static tables) ---
  commands: Command[];
  categories: Category[];
  // Add/edit command modal state. adding = modal open; editingCommandId null =
  // add mode, an id = editing that command.
  adding: boolean;
  editingCommandId: string | null;
  // --- M2: Cheatsheets (D1 — multiple named sheets over the live global values) ---
  cheatsheets: Cheatsheet[];
  activeSheet: string;
  // --- M1: Methodology ---
  roadmaps: Roadmap[];
  activeRoadmap: string | null;
  methodEdit: boolean;
  // Progression + panel-open state, keyed by STABLE step id (never positional),
  // so reordering steps/phases needs no key remap (SPEC A5 / KEY DECISIONS).
  checks: Record<string, boolean>;
  openSteps: Record<string, boolean>;
  // Per-step captured command output (keyed by stable step id, like checks/openSteps).
  results: Record<string, string>;
  // v0.11.0 — which triggers are ON, keyed by triggerId ("this target has an
  // FTP"). Per-engagement PROGRESS like `checks`, hence persisted and cleared by
  // « Réinitialiser la progression ».
  activeTriggers: Record<string, boolean>;
  // Hide the steps whose triggers are all off. A view preference, so MEMORY-ONLY
  // like methodEdit — but held in the store rather than in the view so it
  // survives a trip through another tab.
  hideInactiveSteps: boolean;
  newRmOpen: boolean;
  // --- M1: References ---
  references: Reference[];
  activeRefTag: string | null;
  addingRef: boolean;
  // null = add reference, an id = editing that reference.
  editingRefId: string | null;
  // --- v0.9.0: Snippets (reusable ordered command chains) ---
  snippets: Snippet[];
  // Own facet state, like activeRefTag: the Snippets view filters independently
  // of the Library so switching tabs never cross-contaminates the filters.
  activeSnipCat: string | null;
  activeSnipTag: string | null;
  addingSnippet: boolean;
  // null = add snippet, an id = editing that snippet.
  editingSnippetId: string | null;
  // Snippet-local variable VALUES. MEMORY-ONLY: excluded from persistableState,
  // never sent to the API, never exported (D7 — they hold captured secrets such
  // as an NTLM hash). Keyed by USAGE CONTEXT then by local name, so the same
  // snippet used in two places has two independent value sets:
  //   snippetId              -> the Snippets view
  //   stepId                 -> a Methodology step
  //   sheetId + ':' + snipId -> a Cheatsheet entry
  localValues: Record<string, Record<string, string>>;
}

export interface StoreActions {
  // --- Profiles ---
  // Switch/create/delete re-hydrate the whole app via a full reload (reusing the
  // mount hydration path); rename patches the local list in place.
  switchProfile: (id: string) => void;
  createProfile: (name: string, cloneFrom?: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  // Copy a single entity into ANOTHER (non-active) profile with fresh ids.
  copyCommandToProfile: (commandId: string, targetProfileId: string) => Promise<void>;
  copyReferenceToProfile: (referenceId: string, targetProfileId: string) => Promise<void>;
  copyRoadmapToProfile: (roadmapId: string, targetProfileId: string) => Promise<void>;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setView: (v: ViewKey) => void;
  setValue: (name: string, val: string) => void;
  // Variables: adopt a detected token, delete a custom var, or rename one
  // (cascades $OLD -> $NEW across all command templates). Standard vars are
  // value-only (adopt/delete/rename are no-ops on them). All memory-only.
  adoptVar: (name: string) => void;
  deleteVar: (name: string) => void;
  renameVar: (oldName: string, next: string) => number;
  setFavOnly: (b: boolean) => void;
  setActiveCat: (k: string | null) => void;
  setActiveTool: (t: string | null) => void;
  setActiveTag: (t: string | null) => void;
  setQuery: (q: string) => void;
  clearFilters: () => void;
  toggleExpand: (k: string) => void;
  setNote: (id: string, note: string) => void;
  flash: (msg: string) => void;
  // --- M1: Methodology ---
  setActiveRoadmap: (id: string | null) => void;
  toggleMethodEdit: () => void;
  setNewRmOpen: (b: boolean) => void;
  addRoadmap: (label: string) => void;
  renameRoadmap: (id: string, label: string) => void;
  deleteRoadmap: (id: string) => void;
  addPhase: (roadmapId: string, label: string) => void;
  renamePhase: (roadmapId: string, phaseId: string, label: string) => void;
  deletePhase: (roadmapId: string, phaseId: string) => void;
  addStep: (
    roadmapId: string,
    phaseId: string,
    text: string,
    commandId?: string,
    snippetId?: string,
    triggerIds?: string[],
    allTriggerIds?: string[],
  ) => void;
  // v0.13.0 — a step's checklist.
  addSubstep: (roadmapId: string, phaseId: string, stepId: string, text: string) => void;
  deleteSubstep: (
    roadmapId: string,
    phaseId: string,
    stepId: string,
    substepId: string,
  ) => void;
  deleteStep: (roadmapId: string, phaseId: string, stepId: string) => void;
  moveStep: (
    roadmapId: string,
    fromPhaseId: string,
    toPhaseId: string,
    stepId: string,
    toIndex: number,
  ) => void;
  movePhase: (roadmapId: string, phaseId: string, toIndex: number) => void;
  toggleCheck: (stepId: string) => void;
  // Tick or untick several ids at once — the derived box of a step with a
  // checklist covers the whole block, and a burst of toggleCheck would race.
  setChecked: (ids: readonly string[], value: boolean) => void;
  toggleOpenStep: (stepId: string) => void;
  setResult: (stepId: string, text: string) => void;
  resetProgress: (roadmapId: string) => void;
  // --- v0.11.0: conditional steps ---
  setHideInactiveSteps: (b: boolean) => void;
  addTrigger: (roadmapId: string, label: string) => void;
  renameTrigger: (roadmapId: string, triggerId: string, label: string) => void;
  deleteTrigger: (roadmapId: string, triggerId: string) => void;
  toggleTrigger: (triggerId: string) => void;
  // Turn a set of triggers ON, never off (the « détecter depuis le résultat »
  // path — a chip ticked by hand always wins).
  activateTriggers: (triggerIds: readonly string[]) => void;
  setStepTriggers: (
    roadmapId: string,
    phaseId: string,
    stepId: string,
    triggerIds: string[],
    allTriggerIds: string[],
  ) => void;
  // --- M1: References ---
  setActiveRefTag: (tag: string | null) => void;
  setAddingRef: (b: boolean) => void;
  addReference: (input: { title: string; url: string; desc: string; tags: string[] }) => boolean;
  openEditRef: (id: string) => void;
  updateReference: (
    id: string,
    patch: { title?: string; url?: string; desc?: string; tags?: string[] },
  ) => boolean;
  deleteReference: (id: string) => Reference | null;
  restoreReference: (ref: Reference, index: number) => void;
  // --- M2: Commands & categories ---
  setAdding: (b: boolean) => void;
  openEditCommand: (id: string) => void;
  addCommand: (input: {
    category: string;
    newCategory?: string;
    tool: string;
    title: string;
    template: string;
    desc: string;
    tags: string[];
  }) => boolean;
  updateCommand: (
    id: string,
    patch: {
      category?: string;
      newCategory?: string;
      tool?: string;
      title?: string;
      template?: string;
      desc?: string;
      tags?: string[];
    },
  ) => boolean;
  deleteCommand: (id: string) => void;
  toggleFavorite: (id: string) => void;
  // --- M2: Cheatsheets ---
  setActiveSheet: (id: string) => void;
  addCheatsheet: (title?: string) => void;
  renameCheatsheet: (id: string, title: string) => void;
  setCheatsheetTarget: (id: string, target: string) => void;
  deleteCheatsheet: (id: string) => void;
  toggleInSheet: (commandId: string) => void;
  removeFromSheet: (sheetId: string, commandId: string) => void;
  moveInSheet: (sheetId: string, commandId: string, dir: -1 | 1) => void;
  // --- v0.9.0: Snippets ---
  setActiveSnipCat: (k: string | null) => void;
  setActiveSnipTag: (t: string | null) => void;
  setAddingSnippet: (b: boolean) => void;
  openEditSnippet: (id: string) => void;
  addSnippet: (input: {
    category: string;
    newCategory?: string;
    title: string;
    desc: string;
    tags: string[];
    steps: SnippetStep[];
    locals: SnippetLocal[];
  }) => boolean;
  updateSnippet: (
    id: string,
    patch: {
      category?: string;
      newCategory?: string;
      title?: string;
      desc?: string;
      tags?: string[];
      steps?: SnippetStep[];
      locals?: SnippetLocal[];
    },
  ) => boolean;
  deleteSnippet: (id: string) => void;
  // Set one local's value in one usage context (memory-only).
  setLocalValue: (contextId: string, name: string, val: string) => void;
  // Cheatsheet « Snippets » chapter — mirrors the command chapter's three actions.
  toggleSnippetInSheet: (snippetId: string) => void;
  removeSnippetFromSheet: (sheetId: string, snippetId: string) => void;
  moveSnippetInSheet: (sheetId: string, snippetId: string, dir: -1 | 1) => void;
}

export type Store = StoreState & StoreActions;

// The ONLY localStorage key used by the app: the device-local sidebar
// folded/unfolded preference (Q145). Deliberately no variable value, no dataset
// and no theme here — those live in memory / in the profile state (D2, D7).
const SIDEBAR_KEY = 'cheat.sidebar';

// Below this viewport width the sidebar folds ITSELF: with it open the content
// pane would be left ~450px. Same threshold as the top-bar compaction step in
// index.css, so the whole chrome tightens at once. The auto-fold never writes
// SIDEBAR_KEY — the manual preference is remembered and restored on the way back
// up, and a manual toggle still wins at any width.
const NARROW_QUERY = '(max-width: 780px)';

// Both guarded: localStorage throws in some hardened/private contexts, and
// matchMedia is absent in a non-DOM (test) environment.
function readSidebarPref(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== '0';
  } catch {
    return true;
  }
}
function isNarrowViewport(): boolean {
  try {
    return window.matchMedia(NARROW_QUERY).matches;
  } catch {
    return false;
  }
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [view, setView] = useState<ViewKey>('library');
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...INITIAL_VALUES }));
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState<boolean>(false);
  const [query, setQuery] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // The user's own choice, read once at mount ('0' = folded) and updated only by
  // a manual toggle — the auto-fold deliberately leaves it alone so the choice
  // survives a trip through a narrow window.
  const sidebarPref = useRef<boolean>(readSidebarPref());
  // Effective state: folded on a narrow viewport at mount, otherwise the pref.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => !isNarrowViewport() && sidebarPref.current,
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- M2 state ---
  const [commands, setCommands] = useState<Command[]>(() => COMMANDS.slice());
  const [categories, setCategories] = useState<Category[]>(() => CATEGORIES.slice());
  const [adding, setAddingState] = useState<boolean>(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [cheatsheets, setCheatsheets] = useState<Cheatsheet[]>(() => [
    { id: 'cs1', title: 'Cheatsheet — HTB Lab', target: '', commandIds: [] },
  ]);
  const [activeSheet, setActiveSheetState] = useState<string>('cs1');

  // --- M1 state ---
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>(() => cloneRoadmaps(ROADMAPS));
  const [activeRoadmap, setActiveRoadmap] = useState<string | null>(ROADMAPS[0]?.id ?? null);
  const [methodEdit, setMethodEdit] = useState<boolean>(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [activeTriggers, setActiveTriggers] = useState<Record<string, boolean>>({});
  const [hideInactiveSteps, setHideInactiveSteps] = useState<boolean>(false);
  const [newRmOpen, setNewRmOpen] = useState<boolean>(false);
  const [references, setReferences] = useState<Reference[]>(() => REFERENCES.slice());
  const [activeRefTag, setActiveRefTag] = useState<string | null>(null);
  // --- v0.9.0 snippet state (localValues is memory-only, see StoreState) ---
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [activeSnipCat, setActiveSnipCat] = useState<string | null>(null);
  const [activeSnipTag, setActiveSnipTag] = useState<string | null>(null);
  const [addingSnippet, setAddingSnippetState] = useState<boolean>(false);
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [localValues, setLocalValues] = useState<Record<string, Record<string, string>>>({});
  const [addingRef, setAddingRefState] = useState<boolean>(false);
  const [editingRefId, setEditingRefId] = useState<string | null>(null);

  // Always-fresh views for cross-state reads (e.g. purging checks / cascading
  // deletes / reading the active sheet) without forcing every action to depend
  // on the corresponding state.
  const roadmapsRef = useRef(roadmaps);
  roadmapsRef.current = roadmaps;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const cheatsheetsRef = useRef(cheatsheets);
  cheatsheetsRef.current = cheatsheets;
  const activeSheetRef = useRef(activeSheet);
  activeSheetRef.current = activeSheet;
  const referencesRef = useRef(references);
  referencesRef.current = references;
  const snippetsRef = useRef(snippets);
  snippetsRef.current = snippets;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const activeProfileIdRef = useRef(activeProfileId);
  activeProfileIdRef.current = activeProfileId;
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      sidebarPref.current = next;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* non-persistent context — the toggle still works for this session */
      }
      return next;
    });
  }, []);

  // Auto-fold: fold when the viewport CROSSES into the narrow range, restore the
  // manual preference when it crosses back out. Only transitions are handled (the
  // mount case is the useState initializer above), so a manual toggle taken while
  // narrow is never overridden until the width class actually changes.
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(NARROW_QUERY);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) =>
      setSidebarOpen(e.matches ? false : sidebarPref.current);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setValue = useCallback((name: string, val: string) => {
    setValues((v) => ({ ...v, [name]: val }));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCat(null);
    setActiveTool(null);
    setActiveTag(null);
    setFavOnly(false);
    setQuery('');
    // Reset also collapses the whole category tree and returns to
    // « Toutes les commandes » (activeCat = null).
    setExpanded({});
  }, []);

  const toggleExpand = useCallback((k: string) => {
    setExpanded((e) => ({ ...e, [k]: !e[k] }));
  }, []);

  const setNote = useCallback((id: string, note: string) => {
    setNotes((n) => ({ ...n, [id]: note }));
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1700);
  }, []);

  // Adopt a detected token: create an (empty-valued) key so it becomes a defined
  // variable. No-op if it already exists (standard or already adopted), or if the
  // name is not of the global class — the strip should never offer such a name,
  // and adopting one would create a key no template could ever resolve.
  const adoptVar = useCallback((name: string) => {
    if (!isGlobalName(name)) return;
    setValues((v) => (name in v ? v : { ...v, [name]: '' }));
  }, []);

  // Delete a custom variable: drop its value key so the $TOKEN reverts to the
  // "undefined" render state in commands (and returns to the detected strip).
  // Standard variables are never deletable.
  const deleteVar = useCallback((name: string) => {
    if (STD_NAMES.has(name)) return;
    setValues((v) => omitKey(v, name));
  }, []);

  // Rename a custom variable, cascading $OLD -> $NEW across every command
  // template (escaped \$OLD and $OLDER left intact). Carries the value over.
  // Returns the number of commands rewritten, or -1 if the rename was rejected.
  const renameVar = useCallback(
    (oldName: string, nextRaw: string): number => {
      const next = nextRaw.trim().toUpperCase();
      if (STD_NAMES.has(oldName)) {
        flash('Variable standard non renommable');
        return -1;
      }
      // Same rule as the tokenizer's global class (lib/vars.ts), so the form can
      // never mint a name the renderer would refuse to treat as a variable —
      // notably a letter-less one like '_'.
      if (!isGlobalName(next)) {
        flash('Nom de variable invalide');
        return -1;
      }
      if (next === oldName) return 0;
      const defined = definedNames(valuesRef.current);
      if (defined.has(next)) {
        flash('Ce nom existe déjà');
        return -1;
      }
      // The lookahead must exclude LOWER case too (0.9.0): a name that continues
      // into lower case is mixed-case, hence not a token at all, so `$USERx` must
      // survive a rename of $USER untouched. Excluding only [A-Z0-9_] would have
      // rewritten it into `$NEWx` and silently corrupted plain command text.
      const re = new RegExp('(?<!\\\\)\\$' + oldName + '(?![A-Za-z0-9_])', 'g');
      let n = 0;
      const rewritten = commandsRef.current.map((c) => {
        const nt = c.template.replace(re, '$' + next);
        if (nt === c.template) return c;
        n++;
        return { ...c, template: nt };
      });
      if (n > 0) setCommands(rewritten);
      setValues((v) => {
        const val = v[oldName] ?? '';
        const { [oldName]: _drop, ...rest } = v;
        return { ...rest, [next]: val };
      });
      flash(`${n} commande(s) mise(s) à jour`);
      return n;
    },
    [flash],
  );

  // --- M1: Methodology actions (ported from DCLogic, adapted to id-keyed state) ---

  const toggleMethodEdit = useCallback(() => setMethodEdit((m) => !m), []);

  const addRoadmap = useCallback(
    (label: string) => {
      const l = label.trim();
      if (!l) return;
      const id = mint('rm');
      setRoadmaps((rms) => [...rms, { id, label: l, phases: [] }]);
      setActiveRoadmap(id);
      setNewRmOpen(false);
      flash('Méthodologie créée');
    },
    [flash],
  );

  const renameRoadmap = useCallback((id: string, label: string) => {
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const r = next.find((x) => x.id === id);
      if (r) r.label = label;
      return next;
    });
  }, []);

  // Drop progression + panel-open state for a set of step ids (shared by the
  // roadmap/phase/step delete actions and resetProgress).
  const purgeProgress = useCallback((ids: Set<string>, alsoResults = false) => {
    setChecks((c) => purge(c, ids));
    setOpenSteps((o) => purge(o, ids));
    // Saved command output is DATA, not progression: purge it only when the steps
    // are actually deleted (alsoResults), never on a plain progress reset.
    if (alsoResults) setResults((r) => purge(r, ids));
  }, []);

  const deleteRoadmap = useCallback(
    (id: string) => {
      const target = roadmapsRef.current.find((r) => r.id === id);
      const ids = new Set(target ? stepIdsOf(target) : []);
      purgeProgress(ids, true);
      // A trigger belongs to its roadmap, so its ON state goes with it (v0.11.0).
      const tgIds = new Set(target ? triggerIdsOf(target) : []);
      if (tgIds.size) setActiveTriggers((a) => purge(a, tgIds));
      setRoadmaps((rms) => rms.filter((r) => r.id !== id));
      setActiveRoadmap((prev) => {
        if (prev !== id) return prev;
        const remaining = roadmapsRef.current.filter((r) => r.id !== id);
        return remaining[0]?.id ?? null;
      });
      flash('Méthodologie supprimée');
    },
    [flash, purgeProgress],
  );

  const addPhase = useCallback((roadmapId: string, label: string) => {
    const l = label.trim();
    if (!l) return;
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const r = next.find((x) => x.id === roadmapId);
      if (r) r.phases.push({ id: mint('ph'), label: l, steps: [] });
      return next;
    });
  }, []);

  const renamePhase = useCallback((roadmapId: string, phaseId: string, label: string) => {
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
      if (p) p.label = label;
      return next;
    });
  }, []);

  const deletePhase = useCallback((roadmapId: string, phaseId: string) => {
    const r = roadmapsRef.current.find((x) => x.id === roadmapId);
    const p = r?.phases.find((ph) => ph.id === phaseId);
    const ids = new Set(p ? p.steps.map((s) => s.id) : []);
    purgeProgress(ids, true);
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const rr = next.find((x) => x.id === roadmapId);
      if (rr) rr.phases = rr.phases.filter((ph) => ph.id !== phaseId);
      return next;
    });
  }, [purgeProgress]);

  const addStep = useCallback(
    (
      roadmapId: string,
      phaseId: string,
      text: string,
      commandId?: string,
      snippetId?: string,
      triggerIds?: string[],
      allTriggerIds?: string[],
    ) => {
      const t = text.trim();
      if (!t) return;
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
        // A step may link a command, a snippet, or both (cumulative).
        if (p)
          p.steps.push({
            id: mint('st'),
            text: t,
            commandId: commandId || undefined,
            snippetId: snippetId || undefined,
            // Absent/empty = unconditional, which is the default (v0.11.0).
            triggerIds: triggerIds && triggerIds.length ? triggerIds : undefined,
            allTriggerIds: allTriggerIds && allTriggerIds.length ? allTriggerIds : undefined,
          });
        return next;
      });
    },
    [],
  );

  const deleteStep = useCallback((roadmapId: string, phaseId: string, stepId: string) => {
    // The step's own id AND its checklist's (v0.13.0), which hold their done
    // state in the same map.
    const target = roadmapsRef.current
      .find((r) => r.id === roadmapId)
      ?.phases.find((ph) => ph.id === phaseId)
      ?.steps.find((st) => st.id === stepId);
    const ids = new Set([stepId, ...(target?.substeps ?? []).map((sb) => sb.id)]);
    purgeProgress(ids, true);
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
      if (p) p.steps = p.steps.filter((s) => s.id !== stepId);
      return next;
    });
  }, [purgeProgress]);

  // Cross-phase drag is allowed. Array reorder only — step ids are stable, so
  // checks/openSteps need NO remap (SPEC KEY DECISIONS).
  const moveStep = useCallback(
    (roadmapId: string, fromPhaseId: string, toPhaseId: string, stepId: string, toIndex: number) => {
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        const r = next.find((x) => x.id === roadmapId);
        if (!r) return rms;
        const from = r.phases.find((ph) => ph.id === fromPhaseId);
        const to = r.phases.find((ph) => ph.id === toPhaseId);
        if (!from || !to) return rms;
        const fromIdx = from.steps.findIndex((s) => s.id === stepId);
        if (fromIdx < 0) return rms;
        const [moved] = from.steps.splice(fromIdx, 1);
        to.steps.splice(clamp(toIndex, to.steps.length), 0, moved);
        return next;
      });
    },
    [],
  );

  const movePhase = useCallback((roadmapId: string, phaseId: string, toIndex: number) => {
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const r = next.find((x) => x.id === roadmapId);
      if (!r) return rms;
      const fromIdx = r.phases.findIndex((ph) => ph.id === phaseId);
      if (fromIdx < 0) return rms;
      const [moved] = r.phases.splice(fromIdx, 1);
      r.phases.splice(clamp(toIndex, r.phases.length), 0, moved);
      return next;
    });
  }, []);

  const toggleCheck = useCallback((stepId: string) => {
    setChecks((c) => ({ ...c, [stepId]: !c[stepId] }));
  }, []);

  // Tick or untick a whole set in ONE update. The derived box of a step with a
  // checklist covers every item, and N toggleCheck calls would each start from
  // the same pre-update object and overwrite one another.
  const setChecked = useCallback((ids: readonly string[], value: boolean) => {
    if (!ids.length) return;
    setChecks((c) => {
      const next = { ...c };
      for (const id of ids) next[id] = value;
      return next;
    });
  }, []);

  // --- v0.13.0: a step's checklist ------------------------------------------
  // Made for the enumeration steps whose content is a dozen one-liners too
  // trivial for the Bibliothèque but worth ticking off. An item's done state goes
  // in `checks` under its own id, so nothing new is persisted.

  const addSubstep = useCallback(
    (roadmapId: string, phaseId: string, stepId: string, text: string) => {
      const t = text.trim();
      if (!t) return;
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
        if (!p) return rms;
        p.steps = p.steps.map((st) =>
          st.id === stepId
            ? { ...st, substeps: [...(st.substeps ?? []), { id: mint('sb'), text: t }] }
            : st,
        );
        return next;
      });
    },
    [],
  );

  const deleteSubstep = useCallback(
    (roadmapId: string, phaseId: string, stepId: string, substepId: string) => {
      purgeProgress(new Set([substepId]), true);
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
        if (!p) return rms;
        p.steps = p.steps.map((st) => {
          if (st.id !== stepId) return st;
          const kept = (st.substeps ?? []).filter((sb) => sb.id !== substepId);
          return { ...st, substeps: kept.length ? kept : undefined };
        });
        return next;
      });
    },
    [purgeProgress],
  );

  const toggleOpenStep = useCallback((stepId: string) => {
    setOpenSteps((o) => ({ ...o, [stepId]: !o[stepId] }));
  }, []);

  // Save the captured output/result for a step (per-step free text, persisted
  // like notes; keyed by stable step id).
  const setResult = useCallback((stepId: string, text: string) => {
    setResults((r) => ({ ...r, [stepId]: text }));
  }, []);

  const resetProgress = useCallback((roadmapId: string) => {
    const r = roadmapsRef.current.find((x) => x.id === roadmapId);
    const ids = new Set(r ? stepIdsOf(r) : []);
    purgeProgress(ids);
    // The triggers describe the TARGET ("this host runs an FTP"), so they are
    // part of the progress being reset — otherwise the next target silently
    // inherits the previous one's service list (v0.11.0).
    const tgIds = new Set(r ? triggerIdsOf(r) : []);
    if (tgIds.size) setActiveTriggers((a) => purge(a, tgIds));
  }, [purgeProgress]);

  // --- v0.11.0: conditional steps -------------------------------------------
  // A roadmap owns its trigger VOCABULARY (structure, persisted with it); which
  // triggers are ON is per-target PROGRESS, in its own map next to `checks`.

  const addTrigger = useCallback((roadmapId: string, label: string) => {
    const l = label.trim();
    if (!l) return;
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const r = next.find((x) => x.id === roadmapId);
      if (!r) return rms;
      const triggers = r.triggers ?? [];
      // Case-insensitive uniqueness: two chips reading « FTP » and « ftp » would
      // be indistinguishable on screen yet both need ticking.
      if (triggers.some((t) => t.label.toLowerCase() === l.toLowerCase())) return rms;
      r.triggers = [...triggers, { id: mint('tg'), label: l }];
      return next;
    });
  }, []);

  const renameTrigger = useCallback((roadmapId: string, triggerId: string, label: string) => {
    const l = label.trim();
    if (!l) return;
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const r = next.find((x) => x.id === roadmapId);
      if (!r?.triggers) return rms;
      r.triggers = r.triggers.map((t) => (t.id === triggerId ? { ...t, label: l } : t));
      return next;
    });
  }, []);

  // Deleting a trigger has to reach THREE places: the roadmap's vocabulary, the
  // triggerIds of every step referencing it — otherwise those steps stay gated on
  // a condition nothing can turn on, i.e. permanently inactive — and its ON state.
  const deleteTrigger = useCallback((roadmapId: string, triggerId: string) => {
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const r = next.find((x) => x.id === roadmapId);
      if (!r) return rms;
      r.triggers = (r.triggers ?? []).filter((t) => t.id !== triggerId);
      if (!r.triggers.length) r.triggers = undefined;
      for (const p of r.phases) {
        p.steps = p.steps.map((st) => {
          const inAny = st.triggerIds?.includes(triggerId);
          const inAll = st.allTriggerIds?.includes(triggerId);
          if (!inAny && !inAll) return st;
          const kept = (st.triggerIds ?? []).filter((id) => id !== triggerId);
          const keptAll = (st.allTriggerIds ?? []).filter((id) => id !== triggerId);
          return {
            ...st,
            triggerIds: kept.length ? kept : undefined,
            allTriggerIds: keptAll.length ? keptAll : undefined,
          };
        });
      }
      return next;
    });
    setActiveTriggers((a) => omitKey(a, triggerId));
  }, []);

  const toggleTrigger = useCallback((triggerId: string) => {
    setActiveTriggers((a) => ({ ...a, [triggerId]: !a[triggerId] }));
  }, []);

  // Turn a set of triggers ON, never off — what the « détecter depuis le
  // résultat » button calls. Nothing here can untick a chip, so a trigger set by
  // hand always wins and the worst case of a bad parse is "it found nothing".
  const activateTriggers = useCallback((triggerIds: readonly string[]) => {
    if (!triggerIds.length) return;
    setActiveTriggers((a) => {
      let changed = false;
      const nextMap = { ...a };
      for (const id of triggerIds) {
        if (!nextMap[id]) {
          nextMap[id] = true;
          changed = true;
        }
      }
      return changed ? nextMap : a;
    });
  }, []);

  // Attach/detach a step's triggers WITHOUT recreating the step: its id carries
  // its checks, its result and its snippet-local values, so delete-and-recreate
  // would silently drop all three. This is the narrow action the feature needs —
  // there is still no generic updateStep.
  const setStepTriggers = useCallback(
    (
      roadmapId: string,
      phaseId: string,
      stepId: string,
      triggerIds: string[],
      allTriggerIds: string[],
    ) => {
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
        if (!p) return rms;
        p.steps = p.steps.map((st) =>
          st.id === stepId
            ? {
                ...st,
                triggerIds: triggerIds.length ? triggerIds : undefined,
                allTriggerIds: allTriggerIds.length ? allTriggerIds : undefined,
              }
            : st,
        );
        return next;
      });
    },
    [],
  );

  // --- M1: References actions ---

  // Close/open the AddReference modal; closing always drops any edit target so
  // the modal re-opens in add mode next time.
  const setAddingRef = useCallback((b: boolean) => {
    setAddingRefState(b);
    if (!b) setEditingRefId(null);
  }, []);

  const openEditRef = useCallback((id: string) => {
    setAddingRefState(true);
    setEditingRefId(id);
  }, []);

  // Shared title/URL validation for add/update reference: flashes the matching
  // error and returns null on failure, or the sanitized URL on success.
  const resolveRefUrl = useCallback(
    (title: string, raw: string): string | null => {
      if (!title || !raw) {
        flash('Titre et URL requis');
        return null;
      }
      const url = sanitizeUrl(raw);
      if (!url) {
        flash('URL invalide');
        return null;
      }
      return url;
    },
    [flash],
  );

  const addReference = useCallback(
    (input: { title: string; url: string; desc: string; tags: string[] }): boolean => {
      const title = input.title.trim();
      const raw = input.url.trim();
      // Sanitize: prefix https:// when scheme-less; only web + mail schemes are
      // allowed (blocks javascript:, data:, …).
      const url = resolveRefUrl(title, raw);
      if (!url) return false;
      const id = mint('ref');
      setReferences((refs) => [
        ...refs,
        { id, title, url, desc: input.desc.trim(), tags: cleanTags(input.tags) },
      ]);
      setAddingRef(false);
      flash('Référence ajoutée');
      return true;
    },
    [flash, resolveRefUrl, setAddingRef],
  );

  const updateReference = useCallback(
    (
      id: string,
      patch: { title?: string; url?: string; desc?: string; tags?: string[] },
    ): boolean => {
      const cur = referencesRef.current.find((r) => r.id === id);
      if (!cur) return false;
      const title = (patch.title ?? cur.title).trim();
      const raw = (patch.url ?? cur.url).trim();
      const url = resolveRefUrl(title, raw);
      if (!url) return false;
      const desc = patch.desc !== undefined ? patch.desc.trim() : cur.desc;
      const tags = patch.tags !== undefined ? cleanTags(patch.tags) : cur.tags;
      setReferences((refs) =>
        refs.map((r) => (r.id === id ? { ...r, title, url, desc, tags } : r)),
      );
      setAddingRef(false);
      flash('Référence modifiée');
      return true;
    },
    [flash, resolveRefUrl, setAddingRef],
  );

  const deleteReference = useCallback(
    (id: string): Reference | null => {
      const idx = referencesRef.current.findIndex((r) => r.id === id);
      if (idx < 0) return null;
      const removed = referencesRef.current[idx];
      setReferences((refs) => refs.filter((r) => r.id !== id));
      flash('Référence supprimée');
      return removed;
    },
    [flash],
  );

  // Re-insert a previously removed reference at its original index (undo).
  const restoreReference = useCallback((ref: Reference, index: number) => {
    setReferences((refs) => {
      const a = refs.slice();
      a.splice(clamp(index, a.length), 0, ref);
      return a;
    });
  }, []);

  // --- M2: Command & category actions (ported from DCLogic addCommand) ---

  const setAdding = useCallback((b: boolean) => {
    setAddingState(b);
    if (!b) setEditingCommandId(null);
  }, []);

  const openEditCommand = useCallback((id: string) => {
    setAddingState(true);
    setEditingCommandId(id);
  }, []);

  // Create a custom category from a free-text label; returns its key. Color cycles
  // the palette (guarded against a negative index in an empty profile, where the
  // custom count is below the seed baseline).
  const addCustomCategory = useCallback((label: string): string => {
    const n = categoriesRef.current.length - CATEGORIES.length;
    const key = 'x-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) + '-' + n;
    const L = CUSTOM_CAT_PALETTE.length;
    const color = CUSTOM_CAT_PALETTE[((n % L) + L) % L];
    setCategories((cs) => [...cs, { key, label, color }]);
    return key;
  }, []);

  // Resolve the category key for an add/edit: a typed new category creates one; an
  // empty selection falls back to a catch-all « Autre » (created once, reused);
  // otherwise the chosen key is kept. Shared by addCommand and updateCommand so
  // creating a category works identically on add AND on edit.
  const resolveCategory = useCallback(
    (inputCategory: string, newCategoryRaw?: string): string => {
      const nc = (newCategoryRaw || '').trim();
      if (nc) return addCustomCategory(nc);
      if (!inputCategory) {
        if (!categoriesRef.current.some((c) => c.key === 'x-autre')) {
          setCategories((cs) => [...cs, { key: 'x-autre', label: 'Autre', color: '#8a8f98' }]);
        }
        return 'x-autre';
      }
      return inputCategory;
    },
    [addCustomCategory],
  );

  const addCommand = useCallback(
    (input: {
      category: string;
      newCategory?: string;
      tool: string;
      title: string;
      template: string;
      desc: string;
      tags: string[];
    }): boolean => {
      const title = input.title.trim();
      const template = input.template.trim();
      if (!title || !template) {
        flash('Titre et commande requis');
        return false;
      }
      const nc = (input.newCategory || '').trim();
      // Resolve the category (typed new category → created; empty → « Autre »
      // fallback so a command in a brand-new empty profile is never orphaned).
      const category = resolveCategory(input.category, input.newCategory);
      const tool = input.tool.trim() || 'Divers';
      const id = mint('u');
      const cmd: Command = {
        id,
        category,
        tool,
        title,
        template,
        desc: input.desc.trim(),
        tags: dropToolTag(cleanTags(input.tags), tool),
      };
      setCommands((cs) => [...cs, cmd]);
      setAdding(false);
      flash(nc ? 'Catégorie « ' + nc + ' » créée' : 'Commande ajoutée');
      return true;
    },
    [flash, setAdding, resolveCategory],
  );

  const updateCommand = useCallback(
    (
      id: string,
      patch: {
        category?: string;
        newCategory?: string;
        tool?: string;
        title?: string;
        template?: string;
        desc?: string;
        tags?: string[];
      },
    ): boolean => {
      const cur = commandsRef.current.find((c) => c.id === id);
      if (!cur) return false;
      const title = (patch.title ?? cur.title).trim();
      const template = (patch.template ?? cur.template).trim();
      if (!title || !template) {
        flash('Titre et commande requis');
        return false;
      }
      // Resolve the category the same way as add: a typed new category is created
      // here too (previously edit dropped it), otherwise the chosen/current key.
      const category = resolveCategory(patch.category ?? cur.category, patch.newCategory);
      const tool = patch.tool !== undefined ? patch.tool.trim() || 'Divers' : cur.tool;
      const desc = patch.desc !== undefined ? patch.desc.trim() : cur.desc;
      const tags = dropToolTag(patch.tags !== undefined ? cleanTags(patch.tags) : cur.tags, tool);
      setCommands((cs) =>
        cs.map((c) => (c.id === id ? { ...c, category, tool, title, template, desc, tags } : c)),
      );
      setAdding(false);
      flash('Commande modifiée');
      return true;
    },
    [flash, setAdding, resolveCategory],
  );

  const deleteCommand = useCallback(
    (id: string) => {
      setCommands((cs) => cs.filter((c) => c.id !== id));
      // CASCADE: drop from every cheatsheet, unlink from roadmap steps, purge note.
      setCheatsheets((shs) =>
        shs.map((s) =>
          s.commandIds.includes(id)
            ? { ...s, commandIds: s.commandIds.filter((x) => x !== id) }
            : s,
        ),
      );
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        for (const r of next)
          for (const p of r.phases)
            p.steps = p.steps.map((s) => (s.commandId === id ? { ...s, commandId: undefined } : s));
        return next;
      });
      setNotes((n) => omitKey(n, id));
      flash('Commande supprimée');
    },
    [flash],
  );

  // Toggle a command's favorite flag — pins it to the top of its tool group in
  // the Library. Persisted via persistableState like any other command field.
  const toggleFavorite = useCallback((id: string) => {
    setCommands((cs) => cs.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c)));
  }, []);

  // --- M2: Cheatsheet actions ---

  const addCheatsheet = useCallback((title?: string) => {
    const id = mint('cs');
    setCheatsheets((shs) => [
      ...shs,
      {
        id,
        title: (title || '').trim() || 'Nouvelle cheatsheet',
        target: '',
        commandIds: [],
        snippetIds: [],
      },
    ]);
    setActiveSheetState(id);
  }, []);

  const renameCheatsheet = useCallback((id: string, title: string) => {
    setCheatsheets((shs) => shs.map((s) => (s.id === id ? { ...s, title } : s)));
  }, []);

  const setCheatsheetTarget = useCallback((id: string, target: string) => {
    setCheatsheets((shs) => shs.map((s) => (s.id === id ? { ...s, target } : s)));
  }, []);

  const deleteCheatsheet = useCallback((id: string) => {
    setCheatsheets((shs) => shs.filter((s) => s.id !== id));
    setActiveSheetState((prev) => {
      if (prev !== id) return prev;
      const remaining = cheatsheetsRef.current.filter((s) => s.id !== id);
      return remaining[0]?.id ?? '';
    });
  }, []);

  const toggleInSheet = useCallback(
    (commandId: string) => {
      const sid = activeSheetRef.current;
      if (!sid) return;
      const cur = cheatsheetsRef.current.find((s) => s.id === sid);
      const has = cur ? cur.commandIds.includes(commandId) : false;
      setCheatsheets((shs) =>
        shs.map((s) =>
          s.id === sid
            ? {
                ...s,
                commandIds: has
                  ? s.commandIds.filter((x) => x !== commandId)
                  : [...s.commandIds, commandId],
              }
            : s,
        ),
      );
      flash(has ? 'Retirée de la cheatsheet' : 'Ajoutée à la cheatsheet');
    },
    [flash],
  );

  const removeFromSheet = useCallback((sheetId: string, commandId: string) => {
    setCheatsheets((shs) =>
      shs.map((s) =>
        s.id === sheetId ? { ...s, commandIds: s.commandIds.filter((x) => x !== commandId) } : s,
      ),
    );
  }, []);

  const moveInSheet = useCallback((sheetId: string, commandId: string, dir: -1 | 1) => {
    setCheatsheets((shs) =>
      shs.map((s) => {
        if (s.id !== sheetId) return s;
        const a = s.commandIds.slice();
        const i = a.indexOf(commandId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= a.length) return s;
        [a[i], a[j]] = [a[j], a[i]];
        return { ...s, commandIds: a };
      }),
    );
  }, []);


  // --- v0.9.0: Snippet actions ---

  // Opening OR closing the add form clears any edit target, so the modal always
  // reopens in add mode (mirrors setAdding/openEditCommand).
  const setAddingSnippet = useCallback((b: boolean) => {
    setAddingSnippetState(b);
    setEditingSnippetId(null);
  }, []);

  const openEditSnippet = useCallback((id: string) => {
    setEditingSnippetId(id);
    setAddingSnippetState(true);
  }, []);

  const addSnippet = useCallback(
    (input: {
      category: string;
      newCategory?: string;
      title: string;
      desc: string;
      tags: string[];
      steps: SnippetStep[];
      locals: SnippetLocal[];
    }): boolean => {
      const title = input.title.trim();
      const steps = cleanSteps(input.steps);
      if (!title || steps.length === 0) {
        flash('Titre et au moins une étape requis');
        return false;
      }
      const category = resolveCategory(input.category, input.newCategory);
      const id = mint('sn');
      setSnippets((sns) => [
        ...sns,
        {
          id,
          category,
          title,
          desc: input.desc.trim(),
          tags: cleanTags(input.tags),
          steps,
          locals: cleanLocals(input.locals),
        },
      ]);
      flash('Snippet ajouté');
      return true;
    },
    [flash, resolveCategory],
  );

  const updateSnippet = useCallback(
    (
      id: string,
      patch: {
        category?: string;
        newCategory?: string;
        title?: string;
        desc?: string;
        tags?: string[];
        steps?: SnippetStep[];
        locals?: SnippetLocal[];
      },
    ): boolean => {
      const cur = snippetsRef.current.find((sn) => sn.id === id);
      if (!cur) return false;
      const title = patch.title !== undefined ? patch.title.trim() : cur.title;
      const steps = patch.steps !== undefined ? cleanSteps(patch.steps) : cur.steps;
      if (!title || steps.length === 0) {
        flash('Titre et au moins une étape requis');
        return false;
      }
      // Same shared resolution as the add path (a category typed into the "+"
      // field is created on edit too — the 0.7.2 fix, applied here from the start).
      const category =
        patch.category !== undefined || patch.newCategory !== undefined
          ? resolveCategory(patch.category ?? cur.category, patch.newCategory)
          : cur.category;
      setSnippets((sns) =>
        sns.map((sn) =>
          sn.id === id
            ? {
                ...sn,
                category,
                title,
                desc: patch.desc !== undefined ? patch.desc.trim() : sn.desc,
                tags: patch.tags !== undefined ? cleanTags(patch.tags) : sn.tags,
                steps,
                locals: patch.locals !== undefined ? cleanLocals(patch.locals) : sn.locals,
              }
            : sn,
        ),
      );
      flash('Snippet modifié');
      return true;
    },
    [flash, resolveCategory],
  );

  const deleteSnippet = useCallback(
    (id: string) => {
      setSnippets((sns) => sns.filter((sn) => sn.id !== id));
      // CASCADE, mirroring deleteCommand: drop from every cheatsheet's snippet
      // chapter, unlink from every roadmap step, and forget the memory-only local
      // values of every context that used it.
      setCheatsheets((shs) =>
        shs.map((sh) =>
          (sh.snippetIds ?? []).includes(id)
            ? { ...sh, snippetIds: (sh.snippetIds ?? []).filter((x) => x !== id) }
            : sh,
        ),
      );
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        for (const r of next)
          for (const ph of r.phases)
            ph.steps = ph.steps.map((st) =>
              st.snippetId === id ? { ...st, snippetId: undefined } : st,
            );
        return next;
      });
      setLocalValues((lv) => {
        const out: Record<string, Record<string, string>> = {};
        for (const k of Object.keys(lv)) {
          // Contexts are keyed by snippetId, by stepId, or by 'sheetId:snippetId'.
          if (k === id || k.endsWith(':' + id)) continue;
          out[k] = lv[k];
        }
        return out;
      });
      flash('Snippet supprimé');
    },
    [flash],
  );

  // Memory-only: never persisted, never exported (D7).
  const setLocalValue = useCallback((contextId: string, name: string, val: string) => {
    setLocalValues((lv) => ({ ...lv, [contextId]: { ...(lv[contextId] ?? {}), [name]: val } }));
  }, []);

  // --- Cheatsheet « Snippets » chapter (mirrors toggleInSheet/removeFromSheet/moveInSheet) ---

  const toggleSnippetInSheet = useCallback(
    (snippetId: string) => {
      const sid = activeSheetRef.current;
      if (!sid) return;
      const cur = cheatsheetsRef.current.find((sh) => sh.id === sid);
      const has = cur ? (cur.snippetIds ?? []).includes(snippetId) : false;
      setCheatsheets((shs) =>
        shs.map((sh) => {
          if (sh.id !== sid) return sh;
          const ids = sh.snippetIds ?? [];
          return {
            ...sh,
            snippetIds: has ? ids.filter((x) => x !== snippetId) : [...ids, snippetId],
          };
        }),
      );
      flash(has ? 'Retiré de la cheatsheet' : 'Ajouté à la cheatsheet');
    },
    [flash],
  );

  const removeSnippetFromSheet = useCallback((sheetId: string, snippetId: string) => {
    setCheatsheets((shs) =>
      shs.map((sh) =>
        sh.id === sheetId
          ? { ...sh, snippetIds: (sh.snippetIds ?? []).filter((x) => x !== snippetId) }
          : sh,
      ),
    );
  }, []);

  const moveSnippetInSheet = useCallback((sheetId: string, snippetId: string, dir: -1 | 1) => {
    setCheatsheets((shs) =>
      shs.map((sh) => {
        if (sh.id !== sheetId) return sh;
        const a = (sh.snippetIds ?? []).slice();
        const i = a.indexOf(snippetId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= a.length) return sh;
        [a[i], a[j]] = [a[j], a[i]];
        return { ...sh, snippetIds: a };
      }),
    );
  }, []);

  // The single canonical persistable snapshot (STATE CONTRACT). Ephemeral,
  // memory-only slices (values/view/query/filters/expanded/modal & edit flags/
  // toast/hydrated + profiles/activeProfileId) are intentionally excluded — only
  // a profile's own durable data is sent.
  const persistableState = useMemo<AppState>(
    () => ({
      categories,
      commands,
      references,
      roadmaps,
      cheatsheets,
      snippets,
      notes,
      checks,
      openSteps,
      results,
      activeTriggers,
      settings: { theme, activeRoadmap, activeSheet },
    }),
    [
      categories,
      commands,
      references,
      roadmaps,
      cheatsheets,
      snippets,
      notes,
      checks,
      openSteps,
      results,
      activeTriggers,
      theme,
      activeRoadmap,
      activeSheet,
    ],
  );

  // Always-fresh view of the snapshot so hydration / profile-switch flush can
  // persist without depending on (and re-running for) every slice.
  const persistableRef = useRef(persistableState);
  persistableRef.current = persistableState;

  // Hydrate a slice set from a fetched AppState (shared shape with the seed).
  const hydrateFromState = useCallback((state: AppState) => {
    // Heal categories that were persisted without a color (created on an older
    // build where a custom category in an empty profile got an undefined palette
    // index) — assign a deterministic palette color so every category shows one,
    // like the built-ins. Mirrors the tag/URL load-time normalization below.
    setCategories(
      state.categories.map((c, i) =>
        c.color ? c : { ...c, color: CUSTOM_CAT_PALETTE[i % CUSTOM_CAT_PALETTE.length] },
      ),
    );
    // Enforce "a tool name is never a tag" on any loaded dataset (DB or a
    // freshly-imported one), independent of add/edit-time enforcement.
    setCommands(state.commands.map((c) => ({ ...c, tags: dropToolTag(c.tags, c.tool) })));
    // Re-sanitize imported URLs on load (mirrors the add/edit path and the
    // command tag normalization above): scheme-complete valid links and
    // neutralize any disallowed scheme (e.g. javascript:) to '' so a hostile
    // imported dataset can never yield a clickable link — independent of the
    // render-time guard in References.
    setReferences(state.references.map((r) => ({ ...r, url: sanitizeUrl(r.url) ?? '' })));
    // Roadmaps used to be hydrated raw. Since 0.11.0 they carry a trigger
    // vocabulary that steps reference by id, so they go through a normaliser like
    // commands' tags and references' URLs.
    setRoadmaps(cleanRoadmaps(state.roadmaps));
    // A pre-0.9.0 sheet has no snippet chapter: normalise it to [] on load so
    // every consumer can treat snippetIds as present.
    setCheatsheets(state.cheatsheets.map((sh) => ({ ...sh, snippetIds: sh.snippetIds ?? [] })));
    // Absent from every pre-0.9.0 dataset. Steps/locals are re-normalised on load
    // (mirrors the command tag / reference URL normalisation above) so a
    // hand-edited or imported dataset cannot inject an unusable local name.
    setSnippets(
      (state.snippets ?? []).map((sn) => ({
        ...sn,
        tags: cleanTags(sn.tags ?? []),
        steps: cleanSteps(sn.steps ?? []),
        locals: cleanLocals(sn.locals ?? []),
      })),
    );
    setNotes(state.notes ?? {});
    setChecks(state.checks ?? {});
    setOpenSteps(state.openSteps ?? {});
    setResults(state.results ?? {});
    // Absent from every pre-0.11.0 dataset.
    setActiveTriggers(state.activeTriggers ?? {});
    setTheme(state.settings.theme);
    setActiveRoadmap(state.settings.activeRoadmap);
    setActiveSheetState(state.settings.activeSheet);
  }, []);

  // --- Profiles: switch/create/delete re-hydrate IN PLACE (no full reload) so
  // the memory-only variable VALUES survive a profile switch (decision: values
  // are global/session, unchanged across profiles — D7). Copy actions target
  // ANOTHER profile's stored state without touching the active one.

  const profileName = useCallback(
    (id: string) => profilesRef.current.find((p) => p.id === id)?.name ?? 'profil',
    [],
  );

  // Point the backend at `id`, load its dataset and hydrate every slice, then
  // update the local profile list/active pointer and clear transient filters.
  const activateAndHydrate = useCallback(
    async (id: string, list?: ProfileMeta[]) => {
      await apiSetActiveProfile(id);
      const { state } = await getProfileState(id);
      hydrateFromState(state);
      if (list) setProfiles(list);
      setActiveProfileId(id);
      clearFilters();
    },
    [hydrateFromState, clearFilters],
  );

  const switchProfile = useCallback(
    (id: string) => {
      if (id === activeProfileIdRef.current) return;
      void (async () => {
        try {
          // Flush the current profile first so no pending edit is lost, then
          // hydrate the target in place (values stay untouched).
          if (activeProfileIdRef.current) {
            await putProfileState(activeProfileIdRef.current, persistableRef.current);
          }
          await activateAndHydrate(id);
          flash('Profil : ' + profileName(id));
        } catch {
          flash('Échec du changement de profil');
        }
      })();
    },
    [flash, profileName, activateAndHydrate],
  );

  const createProfile = useCallback(
    async (name: string, cloneFrom?: string) => {
      const n = name.trim();
      if (!n) {
        flash('Nom de profil requis');
        return;
      }
      try {
        // Flush current profile before leaving it.
        if (activeProfileIdRef.current) {
          await putProfileState(activeProfileIdRef.current, persistableRef.current);
        }
        const meta = await apiCreateProfile(n, cloneFrom);
        const list = await apiListProfiles();
        await activateAndHydrate(meta.id, list.profiles);
        flash(cloneFrom ? 'Profil cloné' : 'Profil créé');
      } catch {
        flash('Échec de la création du profil');
      }
    },
    [flash, activateAndHydrate],
  );

  const renameProfile = useCallback(
    async (id: string, name: string) => {
      const n = name.trim();
      if (!n) {
        flash('Nom de profil requis');
        return;
      }
      try {
        await apiRenameProfile(id, n);
        setProfiles((ps) => ps.map((p) => (p.id === id ? { ...p, name: n } : p)));
        flash('Profil renommé');
      } catch {
        flash('Échec du renommage');
      }
    },
    [flash],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      try {
        await apiDeleteProfile(id);
        const { profiles: list, activeId } = await apiListProfiles();
        if (id === activeProfileIdRef.current) {
          // Backend re-pointed active to the first remaining profile — load it.
          await activateAndHydrate(activeId || list[0]?.id || '', list);
        } else {
          setProfiles(list);
        }
        flash('Profil supprimé');
      } catch {
        flash('Suppression impossible');
      }
    },
    [flash, activateAndHydrate],
  );

  const copyCommandToProfile = useCallback(
    async (commandId: string, targetProfileId: string) => {
      const cmd = commandsRef.current.find((c) => c.id === commandId);
      if (!cmd) return;
      try {
        const { state } = await getProfileState(targetProfileId);
        const newId = mint('u');
        const next: AppState = {
          ...state,
          commands: [
            ...state.commands,
            { ...cmd, id: newId, favorite: false, tags: dropToolTag(cleanTags(cmd.tags), cmd.tool) },
          ],
        };
        // Bring the command's category if the target profile lacks it.
        if (!next.categories.some((c) => c.key === cmd.category)) {
          const cat = categoriesRef.current.find((c) => c.key === cmd.category);
          if (cat) next.categories = [...next.categories, cat];
        }
        // Bring the personal note, re-keyed to the new command id.
        const note = notesRef.current[commandId];
        if (note && note.trim()) next.notes = { ...(next.notes ?? {}), [newId]: note };
        await putProfileState(targetProfileId, next);
        flash('Commande copiée vers « ' + profileName(targetProfileId) + ' »');
      } catch {
        flash('Échec de la copie');
      }
    },
    [flash, profileName],
  );

  const copyReferenceToProfile = useCallback(
    async (referenceId: string, targetProfileId: string) => {
      const ref = referencesRef.current.find((r) => r.id === referenceId);
      if (!ref) return;
      try {
        const { state } = await getProfileState(targetProfileId);
        const next: AppState = {
          ...state,
          references: [...state.references, { ...ref, id: mint('ref') }],
        };
        await putProfileState(targetProfileId, next);
        flash('Référence copiée vers « ' + profileName(targetProfileId) + ' »');
      } catch {
        flash('Échec de la copie');
      }
    },
    [flash, profileName],
  );

  const copyRoadmapToProfile = useCallback(
    async (roadmapId: string, targetProfileId: string) => {
      const rm = roadmapsRef.current.find((r) => r.id === roadmapId);
      if (!rm) return;
      try {
        const { state } = await getProfileState(targetProfileId);
        // Deep-clone with FRESH ids at every level; progress (checks/results) is
        // NOT copied — the copy is structure only.
        const cloned: Roadmap = {
          id: mint('rm'),
          label: rm.label,
          phases: rm.phases.map((p) => ({
            id: mint('ph'),
            label: p.label,
            // Every linked/optional field has to be listed here or it is silently
            // lost on copy. `snippetId` WAS being dropped since 0.9.0 — fixed
            // while adding `triggerIds` (0.11.0). Trigger ids stay valid because
            // the cloned roadmap keeps the same trigger objects, ids included:
            // only the roadmap/phase/step ids are re-minted, so the references
            // still resolve inside the clone.
            steps: p.steps.map((s) => ({
              id: mint('st'),
              text: s.text,
              commandId: s.commandId,
              snippetId: s.snippetId,
              triggerIds: s.triggerIds,
              allTriggerIds: s.allTriggerIds,
              // Fresh substep ids for the same reason as the step's: they are
              // progress keys, and progress is deliberately not copied.
              substeps: s.substeps?.map((sb) => ({ id: mint('sb'), text: sb.text })),
            })),
          })),
          // The vocabulary travels with the roadmap; its ON state does NOT —
          // activeTriggers is progress, and a cross-profile copy is structural by
          // design (same rule as checks/results).
          triggers: rm.triggers,
        };
        const next: AppState = { ...state, roadmaps: [...state.roadmaps, cloned] };
        await putProfileState(targetProfileId, next);
        flash('Méthodologie copiée vers « ' + profileName(targetProfileId) + ' »');
      } catch {
        flash('Échec de la copie');
      }
    },
    [flash, profileName],
  );

  // --- M3: persistence (hydrate on mount, then debounced autosave) ---
  // (persistableState / persistableRef / hydrateFromState are defined above the
  // profile actions so those can reference them.)

  // On mount, once: resolve the profile list + active profile, then hydrate that
  // profile's state. A fresh DB (no profiles) is bootstrapped by creating a first
  // profile ("OSCP") seeded with the in-memory seed defaults. On any error we
  // still flip hydrated so the app works offline from the seed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { profiles: list, activeId } = await apiListProfiles();
        if (cancelled) return;
        if (list.length === 0) {
          // Bootstrap: seed the first profile with the current (seed) defaults.
          const meta = await apiCreateProfile('OSCP');
          await putProfileState(meta.id, persistableRef.current);
          await apiSetActiveProfile(meta.id);
          if (cancelled) return;
          setProfiles([meta]);
          setActiveProfileId(meta.id);
        } else {
          const id = activeId || list[0].id;
          const { state } = await getProfileState(id);
          if (cancelled) return;
          hydrateFromState(state);
          setProfiles(list);
          setActiveProfileId(id);
        }
      } catch {
        // Offline / backend unavailable: fall back to seed defaults.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateFromState]);

  // Debounced autosave: whenever any persistable slice changes, PUT the whole
  // snapshot of the ACTIVE profile ~500 ms later. Guarded on `hydrated` (never
  // clobber before the initial load) and on a known active profile id.
  useEffect(() => {
    if (!hydrated || !activeProfileId) return;
    const t = setTimeout(() => {
      void putProfileState(activeProfileId, persistableState).catch(() => {
        /* transient save failure — retried on the next change */
      });
    }, 500);
    return () => clearTimeout(t);
  }, [hydrated, activeProfileId, persistableState]);

  const store = useMemo<Store>(
    () => ({
      hydrated,
      profiles,
      activeProfileId,
      theme,
      view,
      values,
      activeCat,
      activeTool,
      activeTag,
      favOnly,
      query,
      expanded,
      sidebarOpen,
      notes,
      toast,
      commands,
      categories,
      adding,
      editingCommandId,
      cheatsheets,
      activeSheet,
      roadmaps,
      activeRoadmap,
      methodEdit,
      checks,
      openSteps,
      results,
      activeTriggers,
      hideInactiveSteps,
      newRmOpen,
      references,
      activeRefTag,
      addingRef,
      editingRefId,
      snippets,
      activeSnipCat,
      activeSnipTag,
      addingSnippet,
      editingSnippetId,
      localValues,
      toggleTheme,
      toggleSidebar,
      setView,
      setValue,
      adoptVar,
      deleteVar,
      renameVar,
      setFavOnly,
      setActiveCat,
      setActiveTool,
      setActiveTag,
      setQuery,
      clearFilters,
      toggleExpand,
      setNote,
      flash,
      switchProfile,
      createProfile,
      renameProfile,
      deleteProfile,
      copyCommandToProfile,
      copyReferenceToProfile,
      copyRoadmapToProfile,
      setAdding,
      openEditCommand,
      addCommand,
      updateCommand,
      deleteCommand,
      toggleFavorite,
      setActiveSheet: setActiveSheetState,
      addCheatsheet,
      renameCheatsheet,
      setCheatsheetTarget,
      deleteCheatsheet,
      toggleInSheet,
      removeFromSheet,
      moveInSheet,
      setActiveSnipCat,
      setActiveSnipTag,
      setAddingSnippet,
      openEditSnippet,
      addSnippet,
      updateSnippet,
      deleteSnippet,
      setLocalValue,
      toggleSnippetInSheet,
      removeSnippetFromSheet,
      moveSnippetInSheet,
      setActiveRoadmap,
      toggleMethodEdit,
      setHideInactiveSteps,
      setNewRmOpen,
      addRoadmap,
      renameRoadmap,
      deleteRoadmap,
      addPhase,
      renamePhase,
      deletePhase,
      addStep,
      deleteStep,
      moveStep,
      movePhase,
      toggleCheck,
      setChecked,
      addSubstep,
      deleteSubstep,
      toggleOpenStep,
      setResult,
      resetProgress,
      addTrigger,
      renameTrigger,
      deleteTrigger,
      toggleTrigger,
      activateTriggers,
      setStepTriggers,
      setActiveRefTag,
      setAddingRef,
      addReference,
      openEditRef,
      updateReference,
      deleteReference,
      restoreReference,
    }),
    [
      hydrated,
      profiles,
      activeProfileId,
      theme,
      view,
      values,
      activeCat,
      activeTool,
      activeTag,
      favOnly,
      query,
      expanded,
      sidebarOpen,
      notes,
      toast,
      commands,
      categories,
      adding,
      editingCommandId,
      cheatsheets,
      activeSheet,
      roadmaps,
      activeRoadmap,
      methodEdit,
      checks,
      openSteps,
      results,
      activeTriggers,
      hideInactiveSteps,
      newRmOpen,
      references,
      activeRefTag,
      addingRef,
      editingRefId,
      snippets,
      activeSnipCat,
      activeSnipTag,
      addingSnippet,
      editingSnippetId,
      localValues,
      toggleTheme,
      toggleSidebar,
      setValue,
      adoptVar,
      deleteVar,
      renameVar,
      clearFilters,
      toggleExpand,
      setNote,
      flash,
      switchProfile,
      createProfile,
      renameProfile,
      deleteProfile,
      copyCommandToProfile,
      copyReferenceToProfile,
      copyRoadmapToProfile,
      setAdding,
      openEditCommand,
      addCommand,
      updateCommand,
      deleteCommand,
      toggleFavorite,
      addCheatsheet,
      renameCheatsheet,
      setCheatsheetTarget,
      deleteCheatsheet,
      toggleInSheet,
      removeFromSheet,
      moveInSheet,
      toggleMethodEdit,
      addRoadmap,
      renameRoadmap,
      deleteRoadmap,
      addPhase,
      renamePhase,
      deletePhase,
      addStep,
      deleteStep,
      moveStep,
      movePhase,
      toggleCheck,
      setChecked,
      addSubstep,
      deleteSubstep,
      toggleOpenStep,
      setResult,
      resetProgress,
      addTrigger,
      renameTrigger,
      deleteTrigger,
      toggleTrigger,
      activateTriggers,
      setStepTriggers,
      setAddingRef,
      addReference,
      openEditRef,
      updateReference,
      deleteReference,
      restoreReference,
      setAddingSnippet,
      openEditSnippet,
      addSnippet,
      updateSnippet,
      deleteSnippet,
      setLocalValue,
      toggleSnippetInSheet,
      removeSnippetFromSheet,
      moveSnippetInSheet,
    ],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useStore must be used within a <StoreProvider>');
  }
  return ctx;
}
