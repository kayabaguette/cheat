import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Reference, Roadmap, ThemeName, ViewKey } from './types';
import { INITIAL_VALUES, REFERENCES, ROADMAPS } from './data/seed';

// Monotonic id source for user-minted roadmaps/phases/steps/references. A module
// counter is used instead of Date.now() (unavailable/non-deterministic in some
// contexts). Prefixes are distinct from the seeded ids (services / *-p0 / *-p0-s0
// / r1…) so minted ids can never collide with them.
let idCounter = 0;
const mint = (prefix: string): string => prefix + ++idCounter;

// Deep-ish clone: new roadmap + phase objects and fresh step arrays, so a
// mutation never aliases the previous state (mirrors the prototype's _mutRoadmaps).
function cloneRoadmaps(rms: Roadmap[]): Roadmap[] {
  return rms.map((r) => ({ ...r, phases: r.phases.map((p) => ({ ...p, steps: p.steps.slice() })) }));
}

// Every step id inside a roadmap — used to purge progression/open state.
function stepIdsOf(rm: Roadmap): string[] {
  return rm.phases.flatMap((p) => p.steps.map((s) => s.id));
}

// Drop any key present in `ids` from an id-keyed boolean map.
function purge(obj: Record<string, boolean>, ids: Set<string>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(obj)) if (!ids.has(k)) out[k] = obj[k];
  return out;
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));

// In-memory app state. Variable VALUES live here only — never persisted to the
// DB, localStorage, or the JSON export (SPEC §2.6, D2/D7). They are seeded with
// the prototype's demo values so variable resolution is visible immediately.
export interface StoreState {
  theme: ThemeName;
  view: ViewKey;
  values: Record<string, string>;
  activeCat: string | null;
  activeTool: string | null;
  activeTag: string | null;
  query: string;
  selected: string[];
  // Which sidebar categories are expanded to reveal their tool list.
  expanded: Record<string, boolean>;
  // Per-command personal notes (memory-only in M0).
  notes: Record<string, string>;
  // Transient status message (auto-dismisses); shown by <Toast>.
  toast: string;
  // --- M1: Methodology ---
  roadmaps: Roadmap[];
  activeRoadmap: string | null;
  methodEdit: boolean;
  // Progression + panel-open state, keyed by STABLE step id (never positional),
  // so reordering steps/phases needs no key remap (SPEC A5 / KEY DECISIONS).
  checks: Record<string, boolean>;
  openSteps: Record<string, boolean>;
  newRmOpen: boolean;
  // --- M1: References ---
  references: Reference[];
  activeRefTag: string | null;
  addingRef: boolean;
}

export interface StoreActions {
  toggleTheme: () => void;
  setView: (v: ViewKey) => void;
  setValue: (name: string, val: string) => void;
  setActiveCat: (k: string | null) => void;
  setActiveTool: (t: string | null) => void;
  setActiveTag: (t: string | null) => void;
  setQuery: (q: string) => void;
  clearFilters: () => void;
  toggleSelected: (id: string) => void;
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
  resetProgress: (roadmapId: string) => void;
  // --- M1: References ---
  setActiveRefTag: (tag: string | null) => void;
  setAddingRef: (b: boolean) => void;
  addReference: (input: { title: string; url: string; desc: string; tags: string[] }) => boolean;
}

export type Store = StoreState & StoreActions;

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [view, setView] = useState<ViewKey>('library');
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...INITIAL_VALUES }));
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- M1 state ---
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>(() => cloneRoadmaps(ROADMAPS));
  const [activeRoadmap, setActiveRoadmap] = useState<string | null>(ROADMAPS[0]?.id ?? null);
  const [methodEdit, setMethodEdit] = useState<boolean>(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const [newRmOpen, setNewRmOpen] = useState<boolean>(false);
  const [references, setReferences] = useState<Reference[]>(() => REFERENCES.slice());
  const [activeRefTag, setActiveRefTag] = useState<string | null>(null);
  const [addingRef, setAddingRef] = useState<boolean>(false);

  // Always-fresh view of roadmaps for cross-state reads (e.g. purging checks on
  // delete) without forcing every action to depend on `roadmaps`.
  const roadmapsRef = useRef(roadmaps);
  roadmapsRef.current = roadmaps;

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

  const toggleSelected = useCallback((id: string) => {
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
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

  const deleteRoadmap = useCallback(
    (id: string) => {
      const target = roadmapsRef.current.find((r) => r.id === id);
      const ids = new Set(target ? stepIdsOf(target) : []);
      setChecks((c) => purge(c, ids));
      setOpenSteps((o) => purge(o, ids));
      setRoadmaps((rms) => rms.filter((r) => r.id !== id));
      setActiveRoadmap((prev) => {
        if (prev !== id) return prev;
        const remaining = roadmapsRef.current.filter((r) => r.id !== id);
        return remaining[0] ? remaining[0].id : null;
      });
      flash('Méthodologie supprimée');
    },
    [flash],
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
    setChecks((c) => purge(c, ids));
    setOpenSteps((o) => purge(o, ids));
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const rr = next.find((x) => x.id === roadmapId);
      if (rr) rr.phases = rr.phases.filter((ph) => ph.id !== phaseId);
      return next;
    });
  }, []);

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
    setChecks((c) => purge(c, ids));
    setOpenSteps((o) => purge(o, ids));
    setRoadmaps((rms) => {
      const next = cloneRoadmaps(rms);
      const p = next.find((x) => x.id === roadmapId)?.phases.find((ph) => ph.id === phaseId);
      if (p) p.steps = p.steps.filter((s) => s.id !== stepId);
      return next;
    });
  }, []);

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

  const resetProgress = useCallback((roadmapId: string) => {
    const r = roadmapsRef.current.find((x) => x.id === roadmapId);
    const ids = new Set(r ? stepIdsOf(r) : []);
    setChecks((c) => purge(c, ids));
    setOpenSteps((o) => purge(o, ids));
  }, []);

  // --- M1: References actions ---

  const addReference = useCallback(
    (input: { title: string; url: string; desc: string; tags: string[] }): boolean => {
      const title = input.title.trim();
      const raw = input.url.trim();
      if (!title || !raw) {
        flash('Titre et URL requis');
        return false;
      }
      let url = raw;
      // Prefix https:// when no scheme is present (prototype behaviour, generalised
      // so an explicit mailto: is left untouched instead of being double-schemed).
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) url = 'https://' + url;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        flash('URL invalide');
        return false;
      }
      // Sanitize: only web + mail schemes are allowed (blocks javascript:, data:, …).
      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        flash('URL invalide');
        return false;
      }
      const tags = input.tags.map((t) => t.trim()).filter(Boolean);
      const id = mint('ref');
      setReferences((refs) => [...refs, { id, title, url, desc: input.desc.trim(), tags }]);
      setAddingRef(false);
      flash('Référence ajoutée');
      return true;
    },
    [flash],
  );

  const store = useMemo<Store>(
    () => ({
      theme,
      view,
      values,
      activeCat,
      activeTool,
      activeTag,
      query,
      selected,
      expanded,
      notes,
      toast,
      roadmaps,
      activeRoadmap,
      methodEdit,
      checks,
      openSteps,
      newRmOpen,
      references,
      activeRefTag,
      addingRef,
      toggleTheme,
      setView,
      setValue,
      setActiveCat,
      setActiveTool,
      setActiveTag,
      setQuery,
      clearFilters,
      toggleSelected,
      toggleExpand,
      setNote,
      flash,
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
      resetProgress,
      setActiveRefTag,
      setAddingRef,
      addReference,
    }),
    [
      theme,
      view,
      values,
      activeCat,
      activeTool,
      activeTag,
      query,
      selected,
      expanded,
      notes,
      toast,
      roadmaps,
      activeRoadmap,
      methodEdit,
      checks,
      openSteps,
      newRmOpen,
      references,
      activeRefTag,
      addingRef,
      toggleTheme,
      setValue,
      clearFilters,
      toggleSelected,
      toggleExpand,
      setNote,
      flash,
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
      resetProgress,
      addReference,
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
