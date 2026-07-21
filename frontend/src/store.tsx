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

// Deep-ish clone: new roadmap + phase objects and fresh step arrays, so a
// mutation never aliases the previous state (mirrors the prototype's _mutRoadmaps).
function cloneRoadmaps(rms: Roadmap[]): Roadmap[] {
  return rms.map((r) => ({ ...r, phases: r.phases.map((p) => ({ ...p, steps: p.steps.slice() })) }));
}

// Every step id inside a roadmap — used to purge progression/open state.
function stepIdsOf(rm: Roadmap): string[] {
  return rm.phases.flatMap((p) => p.steps.map((s) => s.id));
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
  query: string;
  // Which sidebar categories are expanded to reveal their tool list.
  expanded: Record<string, boolean>;
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
  newRmOpen: boolean;
  // --- M1: References ---
  references: Reference[];
  activeRefTag: string | null;
  addingRef: boolean;
  // null = add reference, an id = editing that reference.
  editingRefId: string | null;
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
  setView: (v: ViewKey) => void;
  setValue: (name: string, val: string) => void;
  // Variables: adopt a detected token, delete a custom var, or rename one
  // (cascades $OLD -> $NEW across all command templates). Standard vars are
  // value-only (adopt/delete/rename are no-ops on them). All memory-only.
  adoptVar: (name: string) => void;
  deleteVar: (name: string) => void;
  renameVar: (oldName: string, next: string) => number;
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
  addStep: (roadmapId: string, phaseId: string, text: string, commandId?: string) => void;
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
  toggleOpenStep: (stepId: string) => void;
  setResult: (stepId: string, text: string) => void;
  resetProgress: (roadmapId: string) => void;
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
}

export type Store = StoreState & StoreActions;

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
  const [query, setQuery] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
  const [newRmOpen, setNewRmOpen] = useState<boolean>(false);
  const [references, setReferences] = useState<Reference[]>(() => REFERENCES.slice());
  const [activeRefTag, setActiveRefTag] = useState<string | null>(null);
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

  const setValue = useCallback((name: string, val: string) => {
    setValues((v) => ({ ...v, [name]: val }));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveCat(null);
    setActiveTool(null);
    setActiveTag(null);
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
  // variable. No-op if it already exists (standard or already adopted).
  const adoptVar = useCallback((name: string) => {
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
      if (!/^[A-Z_][A-Z0-9_]*$/.test(next)) {
        flash('Nom de variable invalide');
        return -1;
      }
      if (next === oldName) return 0;
      const defined = definedNames(valuesRef.current);
      if (defined.has(next)) {
        flash('Ce nom existe déjà');
        return -1;
      }
      const re = new RegExp('(?<!\\\\)\\$' + oldName + '(?![A-Z0-9_])', 'g');
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
    (roadmapId: string, phaseId: string, text: string, commandId?: string) => {
      const t = text.trim();
      if (!t) return;
      setRoadmaps((rms) => {
        const next = cloneRoadmaps(rms);
        const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
        if (p) p.steps.push({ id: mint('st'), text: t, commandId: commandId || undefined });
        return next;
      });
    },
    [],
  );

  const deleteStep = useCallback((roadmapId: string, phaseId: string, stepId: string) => {
    const ids = new Set([stepId]);
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
  }, [purgeProgress]);

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
      { id, title: (title || '').trim() || 'Nouvelle cheatsheet', target: '', commandIds: [] },
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
      notes,
      checks,
      openSteps,
      results,
      settings: { theme, activeRoadmap, activeSheet },
    }),
    [
      categories,
      commands,
      references,
      roadmaps,
      cheatsheets,
      notes,
      checks,
      openSteps,
      results,
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
    setCategories(state.categories);
    // Enforce "a tool name is never a tag" on any loaded dataset (DB or a
    // freshly-imported one), independent of add/edit-time enforcement.
    setCommands(state.commands.map((c) => ({ ...c, tags: dropToolTag(c.tags, c.tool) })));
    // Re-sanitize imported URLs on load (mirrors the add/edit path and the
    // command tag normalization above): scheme-complete valid links and
    // neutralize any disallowed scheme (e.g. javascript:) to '' so a hostile
    // imported dataset can never yield a clickable link — independent of the
    // render-time guard in References.
    setReferences(state.references.map((r) => ({ ...r, url: sanitizeUrl(r.url) ?? '' })));
    setRoadmaps(state.roadmaps);
    setCheatsheets(state.cheatsheets);
    setNotes(state.notes ?? {});
    setChecks(state.checks ?? {});
    setOpenSteps(state.openSteps ?? {});
    setResults(state.results ?? {});
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
            steps: p.steps.map((s) => ({ id: mint('st'), text: s.text, commandId: s.commandId })),
          })),
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
      query,
      expanded,
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
      newRmOpen,
      references,
      activeRefTag,
      addingRef,
      editingRefId,
      toggleTheme,
      setView,
      setValue,
      adoptVar,
      deleteVar,
      renameVar,
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
      setActiveRoadmap,
      toggleMethodEdit,
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
      toggleOpenStep,
      setResult,
      resetProgress,
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
      query,
      expanded,
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
      newRmOpen,
      references,
      activeRefTag,
      addingRef,
      editingRefId,
      toggleTheme,
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
      toggleOpenStep,
      setResult,
      resetProgress,
      setAddingRef,
      addReference,
      openEditRef,
      updateReference,
      deleteReference,
      restoreReference,
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
