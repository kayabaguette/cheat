import { Fragment, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store';
import { resolve } from '../../lib/vars';
import { definedNames, commandContext } from '../../lib/varsets';
import {
  allSteps,
  isStepActive,
  matchTriggers,
  phaseHasActiveStep,
  progressOf,
  stepGroupKey,
  cycleStepTrigger,
  describeStepTriggers,
  isStepDone,
  modeOf,
  stepTriggerMode,
  stepTriggers,
  substepProgress,
} from '../../lib/triggers';
import { MONO, tabBar, pillBase, pillOn, barTrackBase, codePreCompact } from '../../lib/ui';
import { CodeBlock } from '../CodeBlock';
import { CommandLine } from '../CommandLine';
import { CopyToProfile } from '../CopyToProfile';
import { EmptyState } from '../EmptyState';
import { CopyButton } from '../CopyButton';
import type { TriggerMode } from '../../lib/triggers';
import type { Step } from '../../types';

// Méthodologie — faithful port of the prototype's roadmap/checklist view
// (prototype markup ~lines 186-301, logic ~1047-1149), restructured to React.
//
// Two deliberate M1 adaptations of the prototype (per SPEC §7 / the M1 store
// contract), the rest matches the design verbatim:
//   • Progression (checks) and linked-command panel state (openSteps) are keyed
//     by STABLE step ID, not positional `rm-pi-si` keys — so reorders need NO
//     remap (the prototype's positional-key resurrection bug is gone). Drag/drop
//     just reorders arrays via the store's moveStep/movePhase.
//   • Cross-phase step drag is allowed (moveStep receives from/to phase ids).
//   • Reset is « Réinitialiser la progression » and confirms before clearing.
//   • ↑/↓ buttons are an accessible reorder fallback in edit mode (SPEC §3.7).
// Transient drag state lives in local React state, never the store.
//
// v0.15.0 — a step is EDITABLE IN PLACE in edit mode: its label is an input, its
// command and snippet links are dropdowns, and its triggers a chip picker. All of
// it goes through `updateStep` / `setStepTriggers`, which patch the step and leave
// its id alone — so its checks, its pasted result and its snippet-local values
// survive an edit, which a delete-and-recreate would have destroyed. (This
// replaces the M1 note that said step text was deliberately not an input because
// the store exposed no action for it.)

// SPEC §7.5 progress: neutral state for empty scopes, never 0%/100% for a
// partially-complete scope.
function progress(done: number, total: number): { readout: string; width: string } {
  if (total === 0) return { readout: '0/0 · aucune étape', width: '0%' };
  let pct: number;
  if (done === 0) pct = 0;
  else if (done === total) pct = 100;
  else pct = Math.min(99, Math.max(1, Math.round((done / total) * 100)));
  return { readout: `${done}/${total} · ${pct}%`, width: `${pct}%` };
}

// --- static style objects (ported from the prototype) ---------------------
const page: CSSProperties = { padding: '24px 26px 80px', display: 'flex', justifyContent: 'center' };
const column: CSSProperties = { width: '100%', maxWidth: '820px' };

// Shared code-field base for this view's text inputs/selects: the four
// declarations every input repeated. Each input spreads this, then adds its own
// flex/width/fontSize/padding/fontWeight/cursor overrides.
const inputBase: CSSProperties = {
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
};

const newRmRow: CSSProperties = { display: 'flex', gap: '8px', marginBottom: '18px' };
const newRmInput: CSSProperties = {
  ...inputBase,
  flex: 1,
  fontSize: '12.5px',
  padding: '8px 10px',
};
const newRmBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--acc-line)',
  background: 'var(--acc)',
  color: 'var(--on-acc)',
  padding: '6px 18px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const headerRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' };
const rmTitle: CSSProperties = { fontWeight: 700, fontSize: '16px', letterSpacing: '-.01em' };
const rmProgressText: CSSProperties = {
  fontFamily: MONO,
  fontSize: '12px',
  color: 'var(--muted)',
};
const barTrack: CSSProperties = { ...barTrackBase, height: '6px' };
const editBtnBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
const editBtnOn: CSSProperties = {
  ...editBtnBase,
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  border: '1px solid var(--acc-line)',
};

const rmEditBar: CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
  marginBottom: '16px',
  background: 'var(--elev)',
  border: '1px solid var(--border)',
  padding: '10px 12px',
};
const rmEditInput: CSSProperties = {
  ...inputBase,
  flex: 1,
  fontSize: '12.5px',
  padding: '6px 9px',
};
const deleteRmBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '6px 12px',
  fontSize: '12px',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const phaseList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '16px' };
const phPlaceholder: CSSProperties = {
  height: '46px',
  border: '2px dashed var(--acc)',
  background: 'var(--acc-dim)',
  boxShadow: 'inset 0 0 24px color-mix(in srgb, var(--acc) 22%, transparent)',
};
const grabHandleBase: CSSProperties = {
  cursor: 'grab',
  color: 'var(--faint)',
  userSelect: 'none',
  flex: 'none',
};
const dragHandle: CSSProperties = {
  ...grabHandleBase,
  fontSize: '15px',
  lineHeight: 1,
};
const phaseLabel: CSSProperties = { fontWeight: 600, fontSize: '13.5px', flex: 1 };
const monoCount: CSSProperties = {
  fontFamily: MONO,
  fontSize: '11px',
  color: 'var(--faint)',
};
const phaseBarTrack: CSSProperties = { ...barTrackBase, width: '70px', height: '5px' };
const phaseRenameInput: CSSProperties = {
  ...inputBase,
  flex: 1,
  fontSize: '13px',
  fontWeight: 600,
  padding: '5px 8px',
};
const phaseBody: CSSProperties = { padding: '4px 16px 10px' };
const arrowBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  width: '24px',
  height: '24px',
  fontSize: '11px',
  lineHeight: 1,
  fontFamily: 'inherit',
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const arrowBtnDisabled: CSSProperties = { ...arrowBtn, cursor: 'default', opacity: 0.35 };
const phaseDelBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '4px 9px',
  fontSize: '12px',
  lineHeight: 1,
  fontFamily: 'inherit',
  flex: 'none',
};

const stepInner: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '11px' };
const stepDragHandle: CSSProperties = {
  ...grabHandleBase,
  fontSize: '13px',
  lineHeight: 1.4,
  marginTop: '1px',
};
const checkOff: CSSProperties = {
  cursor: 'pointer',
  width: '18px',
  height: '18px',
  flex: 'none',
  border: '1.5px solid var(--border2)',
  background: 'transparent',
  color: 'transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontFamily: 'inherit',
  marginTop: '1px',
};
const checkOn: CSSProperties = {
  ...checkOff,
  border: '1.5px solid var(--acc-line)',
  background: 'var(--acc)',
  color: 'var(--on-acc)',
};
const stepTextWrap: CSSProperties = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' };
const stepText: CSSProperties = { color: 'var(--text)', fontSize: '13px', lineHeight: 1.4 };
const stepTextDone: CSSProperties = {
  textDecoration: 'line-through',
  color: 'var(--faint)',
  fontSize: '13px',
  lineHeight: 1.4,
};
const noteBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--acc)',
  padding: '2px 8px',
  fontSize: '11px',
  fontFamily: MONO,
  whiteSpace: 'nowrap',
  flex: 'none',
};
const stepDelBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '2px 8px',
  fontSize: '12px',
  lineHeight: 1,
  fontFamily: 'inherit',
  flex: 'none',
};
const notePanel: CSSProperties = { margin: '9px 0 2px 29px', position: 'relative' };
const cmdTitleLine: CSSProperties = {
  fontSize: '11px',
  color: 'var(--faint)',
  marginBottom: '5px',
  fontFamily: MONO,
};
const resultLabel: CSSProperties = {
  fontSize: '11px',
  color: 'var(--faint)',
  margin: '9px 0 4px',
  fontFamily: MONO,
};
const resultArea: CSSProperties = {
  width: '100%',
  minHeight: '58px',
  resize: 'vertical',
  background: 'var(--code)',
  border: '1px solid var(--border)',
  color: 'var(--code-text)',
  fontFamily: MONO,
  fontSize: '11.5px',
  lineHeight: 1.5,
  padding: '7px 9px',
};
const addStepWrap: CSSProperties = {
  marginTop: '6px',
  padding: '11px 0 3px',
  borderTop: '1px dashed var(--border2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};
const addStepInput: CSSProperties = {
  ...inputBase,
  width: '100%',
  fontSize: '12.5px',
  padding: '7px 10px',
};
// --- v0.11.0: conditional steps -------------------------------------------
// The chip strip under the roadmap header: what discovery found on this target.
const trigStrip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '6px',
  padding: '9px 11px',
  marginBottom: '14px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
};
const trigStripLabel: CSSProperties = {
  fontSize: '10.5px',
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--faint)',
  fontWeight: 600,
  marginRight: '4px',
};
const chipBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '3px 9px',
  fontSize: '11.5px',
  fontFamily: MONO,
  display: 'inline-flex',
  gap: '6px',
  alignItems: 'center',
};
const chipOn: CSSProperties = {
  ...chipBase,
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  border: '1px solid var(--acc-line)',
};
const chipXBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  padding: 0,
  fontSize: '11px',
  lineHeight: 1,
  fontFamily: 'inherit',
};
const chipLabelBtn: CSSProperties = {
  ...chipXBtn,
  fontFamily: MONO,
  fontSize: '11.5px',
};
const trigInput: CSSProperties = {
  ...inputBase,
  width: '104px',
  fontSize: '11.5px',
  padding: '3px 7px',
  fontFamily: MONO,
};
// The `── FTP ──` sub-header. Consecutive steps sharing a trigger set get one,
// so the grouping is a pure rendering effect and the data model stays flat.
const groupHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '11px 0 2px',
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
};
const groupRule: CSSProperties = { flex: 1, height: '1px', background: 'var(--border)' };
// Per-step trigger chips, under the step text (stepTextWrap is already a column).
const stepChipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '5px',
  alignItems: 'center',
};
const miniChipBase: CSSProperties = {
  padding: '1px 6px',
  fontSize: '10px',
  fontFamily: MONO,
  display: 'inline-flex',
  gap: '4px',
  alignItems: 'center',
};

// A trigger chip carries TWO independent things, and both are resolved into ONE
// `border` shorthand on purpose: mixing the shorthand with a `borderStyle`
// longhand makes React leave a stale value behind when the mode toggles — the
// very trap Sidebar.tsx's `tagOn` documents, and it showed up as a console
// warning the first time this was written with a longhand override.
//   the border STYLE says the mode — dotted = inutilisé, dashed = OU, solid = ET
//   the COLOUR says the target     — accent when that trigger is detected on it
const chipStyle = (detected: boolean, mode: TriggerMode): CSSProperties => {
  const line = mode === 'all' ? 'solid' : mode === 'any' ? 'dashed' : 'dotted';
  return detected
    ? {
        ...miniChipBase,
        border: `1px ${line} var(--acc-line)`,
        background: 'var(--acc-dim)',
        color: 'var(--acc)',
      }
    : {
        ...miniChipBase,
        border: `1px ${line} var(--border2)`,
        background: 'transparent',
        color: 'var(--faint)',
      };
};
const miniBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px dashed var(--border2)',
  background: 'transparent',
  color: 'var(--faint)',
  padding: '1px 6px',
  fontSize: '10px',
  fontFamily: MONO,
};
// Row of assigned chips, now to the LEFT of the step label (v0.13.0).
const stepTrigLeft: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  alignItems: 'center',
  flex: 'none',
  maxWidth: '190px',
};
// --- the checklist, at the top of the expanded panel ---
const subList: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px' };
const subRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };
const subText: CSSProperties = { flex: 1, minWidth: 0, fontSize: '12.5px', lineHeight: 1.4 };
const subTextDone: CSSProperties = {
  ...subText,
  textDecoration: 'line-through',
  color: 'var(--faint)',
};
const subAddRow: CSSProperties = { display: 'flex', gap: '6px', marginTop: '6px' };
const subAddInput: CSSProperties = {
  ...inputBase,
  flex: 1,
  minWidth: 0,
  fontSize: '12px',
  padding: '4px 8px',
};
const subRule: CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border)',
  margin: '10px 0 0',
};

// v0.15.0 — a step edited in place. The label mirrors phaseRenameInput; the
// relink row keeps the two dropdowns and the trigger button on ONE line, so
// editing a step costs one extra row rather than two.
const stepRenameInput: CSSProperties = {
  ...inputBase,
  width: '100%',
  fontSize: '13px',
  padding: '3px 7px',
};
const stepEditRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  alignItems: 'center',
  marginTop: '2px',
};
const stepEditSelect: CSSProperties = {
  ...inputBase,
  flex: '1 1 150px',
  minWidth: 0,
  fontSize: '11.5px',
  padding: '2px 5px',
};

const detectBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '2px 8px',
  fontSize: '10.5px',
  fontFamily: 'inherit',
  marginLeft: '9px',
};

const addStepSelect: CSSProperties = {
  ...inputBase,
  flex: 1,
  minWidth: 0,
  fontSize: '12px',
  padding: '7px 9px',
  cursor: 'pointer',
};
const addStepBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--acc-line)',
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  padding: '6px 16px',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};
const addPhaseInput: CSSProperties = {
  ...inputBase,
  flex: 1,
  fontSize: '12.5px',
  padding: '8px 10px',
};
const addPhaseBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px dashed var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '7px 18px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

// Progress bar: track + accent fill. Both the roadmap bar and each phase bar
// render this identical markup, differing only in the track style + fill width.
function Bar({ track, width }: { track: CSSProperties; width: string }) {
  return (
    <div style={track}>
      <div style={{ height: '100%', width, background: 'var(--acc)' }} />
    </div>
  );
}

// Reorder (↑/↓) + delete edit-control trio, shared by the phase header and each
// step row. Index math and callbacks stay at the call sites so the semantics are
// identical; the delete button's style differs per site (phaseDelBtn vs
// stepDelBtn) and is threaded through `delStyle`.
function ReorderControls({
  onUp,
  onDown,
  onDelete,
  disableUp,
  disableDown,
  upTitle,
  downTitle,
  delTitle,
  delStyle,
}: {
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  disableUp: boolean;
  disableDown: boolean;
  upTitle: string;
  downTitle: string;
  delTitle: string;
  delStyle: CSSProperties;
}) {
  return (
    <>
      <button onClick={onUp} disabled={disableUp} title={upTitle} style={disableUp ? arrowBtnDisabled : arrowBtn}>
        ↑
      </button>
      <button
        onClick={onDown}
        disabled={disableDown}
        title={downTitle}
        style={disableDown ? arrowBtnDisabled : arrowBtn}
      >
        ↓
      </button>
      <button onClick={onDelete} title={delTitle} style={delStyle}>
        ✕
      </button>
    </>
  );
}

// Embedded snippet chain inside a methodology step panel — same scale as the
// Snippets view, on the compact code block the panel already uses.
const snipStepHead: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  margin: '9px 0 4px',
};
const snipStepNum: CSSProperties = {
  fontFamily: MONO,
  fontSize: '11px',
  color: 'var(--acc)',
  flex: 'none',
};
const snipStepLabel: CSSProperties = { fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 };
const snipCapRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '6px',
};
const snipCapName: CSSProperties = { fontFamily: MONO, fontSize: '11.5px', flex: 'none' };
const snipCapInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--code)',
  border: '1px dashed var(--border2)',
  color: 'var(--text)',
  fontFamily: MONO,
  fontSize: '12px',
  padding: '5px 8px',
};

interface StepDraft {
  text: string;
  commandId: string;
  // A step may link a command, a snippet, or both (cumulative).
  snippetId: string;
  // The draft's triggers, in the same shape a Step uses: one list plus one
  // step-wide operator (v0.14.0).
  triggerIds: string[];
  triggerMode: 'any' | 'all';
}
interface DragStep {
  phaseId: string;
  stepId: string;
}
interface DragOver {
  phaseId: string;
  index: number;
}

export function Methodology() {
  const {
    values,
    commands,
    snippets,
    localValues,
    roadmaps,
    activeRoadmap,
    methodEdit,
    checks,
    openSteps,
    results,
    activeTriggers,
    hideInactiveSteps,
    newRmOpen,
    setActiveRoadmap,
    toggleMethodEdit,
    setHideInactiveSteps,
    addRoadmap,
    renameRoadmap,
    deleteRoadmap,
    addPhase,
    renamePhase,
    deletePhase,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    movePhase,
    toggleCheck,
    setChecked,
    addSubstep,
    deleteSubstep,
    toggleOpenStep,
    setResult,
    setLocalValue,
    resetProgress,
    addTrigger,
    renameTrigger,
    deleteTrigger,
    toggleTrigger,
    activateTriggers,
    setStepTriggers,
    flash,
  } = useStore();

  // Inline create/draft form state (transient, memory-only).
  const [newRmLabel, setNewRmLabel] = useState('');
  const [addPhaseLabel, setAddPhaseLabel] = useState('');
  const [stepDrafts, setStepDrafts] = useState<Record<string, StepDraft>>({});
  // Transient drag state — never touches the store (SPEC §3.7, Q117).
  const [dragStep, setDragStep] = useState<DragStep | null>(null);
  const [dragOver, setDragOver] = useState<DragOver | null>(null);
  // One « nouvelle sous-étape » draft per step (v0.13.0), transient like the
  // step drafts above.
  const [subDrafts, setSubDrafts] = useState<Record<string, string>>({});
  const [dragPhaseIdx, setDragPhaseIdx] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // Conditional steps (v0.11.0), all transient: which chip is being renamed, the
  // « + déclencheur » draft, and which step has its trigger picker unfolded.
  const [renamingTrig, setRenamingTrig] = useState<string | null>(null);
  const [trigDraft, setTrigDraft] = useState('');
  const [newTrigLabel, setNewTrigLabel] = useState('');
  const [pickerStep, setPickerStep] = useState<string | null>(null);

  const defNames = useMemo(() => definedNames(values), [values]);

  // Command lookup for step→command links, derived live from the store so
  // added/edited/deleted commands are reflected in the select and the panels.
  const cmdById = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands]);
  // Commands offered when linking a step, sorted alphabetically by their visible
  // "tool — title" label (case/accent-insensitive) instead of insertion/id order.
  const sortedCommands = useMemo(
    () =>
      [...commands].sort((a, b) =>
        `${a.tool} — ${a.title}`.localeCompare(`${b.tool} — ${b.title}`, undefined, {
          sensitivity: 'base',
        }),
      ),
    [commands],
  );
  // Same for snippets: lookup for step→snippet links + an alphabetical list for
  // the picker (mirrors the command sort of PR #20).
  const snipById = useMemo(() => new Map(snippets.map((sn) => [sn.id, sn])), [snippets]);
  const sortedSnippets = useMemo(
    () =>
      [...snippets].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      ),
    [snippets],
  );

  const rm = roadmaps.find((r) => r.id === activeRoadmap) ?? roadmaps[0] ?? null;

  const submitNewRm = () => {
    const label = newRmLabel.trim();
    if (!label) return;
    addRoadmap(label);
    setNewRmLabel('');
  };

  const submitPhase = () => {
    if (!rm) return;
    const label = addPhaseLabel.trim();
    if (!label) return;
    addPhase(rm.id, label);
    setAddPhaseLabel('');
  };

  const draftFor = (phaseId: string): StepDraft =>
    stepDrafts[phaseId] ?? {
      text: '',
      commandId: '',
      snippetId: '',
      triggerIds: [],
      triggerMode: 'any',
    };
  const setDraft = (phaseId: string, patch: Partial<StepDraft>) =>
    setStepDrafts((s) => ({ ...s, [phaseId]: { ...draftFor(phaseId), ...patch } }));

  const submitStep = (phaseId: string) => {
    if (!rm) return;
    const d = draftFor(phaseId);
    const text = d.text.trim();
    if (!text) return;
    addStep(
      rm.id,
      phaseId,
      text,
      d.commandId || undefined,
      d.snippetId || undefined,
      d.triggerIds.length ? d.triggerIds : undefined,
      d.triggerMode,
    );
    setStepDrafts((s) => ({
      ...s,
      [phaseId]: { text: '', commandId: '', snippetId: '', triggerIds: [], triggerMode: 'any' },
    }));
  };

  const setSubDraft = (stepId: string, text: string) =>
    setSubDrafts((d) => ({ ...d, [stepId]: text }));
  const submitSubstep = (phaseId: string, stepId: string) => {
    if (!rm) return;
    const text = (subDrafts[stepId] ?? '').trim();
    if (!text) return;
    addSubstep(rm.id, phaseId, stepId, text);
    setSubDrafts((d) => ({ ...d, [stepId]: '' }));
  };

  const onReset = () => {
    if (!rm) return;
    // Say exactly what it clears. Since 0.15.0 that is EVERYTHING per-step, the
    // pasted results included; the detected triggers go too (0.11.0) because they
    // describe the TARGET and would otherwise be inherited by the next one.
    const msg = (rm.triggers ?? []).length
      ? 'Réinitialiser la progression de cette méthodologie ?\n\nLes cases cochées, les sous-étapes, les résultats collés ET les déclencheurs détectés seront effacés.'
      : 'Réinitialiser la progression de cette méthodologie ?\n\nLes cases cochées, les sous-étapes et les résultats collés seront effacés.';
    if (window.confirm(msg)) resetProgress(rm.id);
  };

  // Attach/detach one trigger on an EXISTING step. The step keeps its id, and
  // therefore its checks, its pasted result and its snippet-local values — which
  // a delete-and-recreate would silently drop (there is no updateStep action).
  // One click on a chip advances it: unused → OU → ET → unused. The operator is a
  // property of the STEP, so the middle step of that cycle restyles every chip of
  // the step at once. The step keeps its id, and therefore its checks, its result
  // and its snippet-local values — which a delete-and-recreate would drop.
  const cycleStepTriggerOn = (phaseId: string, step: Step, triggerId: string) => {
    if (!rm) return;
    const next = cycleStepTrigger(step, triggerId);
    setStepTriggers(rm.id, phaseId, step.id, next.triggerIds, next.triggerMode);
  };

  // The same cycle on the add-step draft, which carries a step's trigger shape
  // without being one.
  const cycleDraftTrigger = (phaseId: string, triggerId: string) => {
    const d = draftFor(phaseId);
    const next = cycleStepTrigger(
      { id: '', text: '', triggerIds: d.triggerIds, triggerMode: d.triggerMode },
      triggerId,
    );
    setDraft(phaseId, { triggerIds: next.triggerIds, triggerMode: next.triggerMode });
  };

  // « détecter depuis le résultat » — read a pasted nmap run and tick the
  // triggers it vouches for. The delta is computed HERE, against the store's
  // current map, so the toast reports what actually changed; and nothing is ever
  // unticked, so a chip set by hand always wins (lib/triggers.ts).
  const onDetect = (stepId: string) => {
    if (!rm) return;
    const triggers = rm.triggers ?? [];
    const ids = matchTriggers(results[stepId] ?? '', triggers);
    if (!ids.length) {
      flash('Aucun service reconnu dans le résultat');
      return;
    }
    const added = ids.filter((id) => !activeTriggers[id]);
    if (!added.length) {
      flash('Déclencheurs déjà à jour');
      return;
    }
    activateTriggers(added);
    const labels = triggers.filter((t) => added.includes(t.id)).map((t) => t.label);
    flash(added.length + ' déclencheur(s) activé(s) : ' + labels.join(', '));
  };

  const clearStepDrag = () => {
    setDragStep(null);
    setDragOver(null);
  };
  const clearPhaseDrag = () => {
    setDragPhaseIdx(null);
    setDropIndex(null);
  };

  const nPhases = rm ? rm.phases.length : 0;
  // Phase drop placeholders (prototype ~1102-1139): suppress the placeholder at
  // the dragged phase's own current slot (`di === from` / `di === from + 1`).
  const showTailPlaceholder =
    dragPhaseIdx != null && dropIndex === nPhases && dropIndex !== dragPhaseIdx + 1;

  return (
    <div style={page}>
      <div style={column}>
        {/* Roadmap tab bar */}
        <div style={tabBar}>
          {roadmaps.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRoadmap(r.id)}
              style={rm && r.id === rm.id ? pillOn : pillBase}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* « + Méthodologie » inline create flow (driven by store.newRmOpen) */}
        {newRmOpen && (
          <div style={newRmRow}>
            <input
              value={newRmLabel}
              onChange={(e) => setNewRmLabel(e.target.value)}
              placeholder="Nom de la méthodologie — ex : Machine — Linux"
              spellCheck="false"
              autoCorrect="off"
              autoCapitalize="off"
              style={newRmInput}
            />
            <button onClick={submitNewRm} style={newRmBtn}>
              Créer
            </button>
          </div>
        )}

        {!rm ? (
          <EmptyState
            mono="// aucune méthodologie"
            sub="Crée-en une avec le bouton « + Méthodologie »."
            padding="70px 20px"
          />
        ) : (
          (() => {
            // Global progress over every step in the roadmap (equal weight, Q61).
            // Since 0.11.0 an INACTIVE step is out of the numerator AND the
            // denominator (lib/triggers.ts), which is what lets a target running
            // 3 services out of 12 still reach 100%.
            const rmCount = progressOf(allSteps(rm.phases), activeTriggers, checks);
            const rmProg = progress(rmCount.done, rmCount.total);
            const roadmapTriggers = rm.triggers ?? [];
            // The « masquer les inactives » switch is pointless on a roadmap with
            // no conditional step at all, so it only appears once there is one.
            const hasConditional = rm.phases.some((ph) =>
              ph.steps.some((st) => (st.triggerIds ?? []).length > 0),
            );

            return (
              <>
                {/* Header: label + progress readout + bar + edit toggle + reset */}
                <div style={headerRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '7px' }}>
                      <span style={rmTitle}>{rm.label}</span>
                      <span style={rmProgressText}>{rmProg.readout}</span>
                    </div>
                    <Bar track={barTrack} width={rmProg.width} />
                  </div>
                  <button onClick={toggleMethodEdit} style={methodEdit ? editBtnOn : editBtnBase}>
                    {methodEdit ? 'Terminé' : '✎ Modifier'}
                  </button>
                  {hasConditional && (
                    <button
                      onClick={() => setHideInactiveSteps(!hideInactiveSteps)}
                      title="Les étapes dont aucun déclencheur n'est coché"
                      style={hideInactiveSteps ? editBtnOn : editBtnBase}
                    >
                      {hideInactiveSteps ? '☑' : '☐'} masquer les inactives
                    </button>
                  )}
                  <button onClick={onReset} style={editBtnBase}>
                    Réinitialiser la progression
                  </button>
                  <CopyToProfile kind="roadmap" id={rm.id} />
                </div>

                {/* Roadmap rename / delete (edit mode) */}
                {methodEdit && (
                  <div style={rmEditBar}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Nom</span>
                    <input
                      value={rm.label}
                      onChange={(e) => renameRoadmap(rm.id, e.target.value)}
                      spellCheck="false"
                      autoCorrect="off"
                      autoCapitalize="off"
                      style={rmEditInput}
                    />
                    <button onClick={() => deleteRoadmap(rm.id)} style={deleteRmBtn}>
                      Supprimer
                    </button>
                  </div>
                )}

                {/* « Détecté sur la cible » — this roadmap's condition vocabulary.
                    Tick what discovery found and every step carrying that trigger
                    becomes active, in every phase at once. Rendered as soon as the
                    roadmap declares one, and always in edit mode so the first one
                    can be created. */}
                {(methodEdit || roadmapTriggers.length > 0) && (
                  <div style={trigStrip}>
                    <span style={trigStripLabel}>Détecté sur la cible</span>
                    {roadmapTriggers.map((t) =>
                      renamingTrig === t.id ? (
                        <input
                          key={t.id}
                          autoFocus
                          value={trigDraft}
                          onChange={(e) => setTrigDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameTrigger(rm.id, t.id, trigDraft);
                              setRenamingTrig(null);
                            } else if (e.key === 'Escape') {
                              setRenamingTrig(null);
                            }
                          }}
                          onBlur={() => {
                            renameTrigger(rm.id, t.id, trigDraft);
                            setRenamingTrig(null);
                          }}
                          spellCheck="false"
                          autoCorrect="off"
                          autoCapitalize="off"
                          style={trigInput}
                        />
                      ) : (
                        <span key={t.id} style={activeTriggers[t.id] ? chipOn : chipBase}>
                          {/* In edit mode the label edits the vocabulary; outside
                              it, it ticks the target. Same split as the rest of
                              this view: edit mode edits, read mode uses. */}
                          <button
                            type="button"
                            onClick={() => {
                              if (methodEdit) {
                                setTrigDraft(t.label);
                                setRenamingTrig(t.id);
                              } else {
                                toggleTrigger(t.id);
                              }
                            }}
                            title={methodEdit ? 'Renommer' : 'Présent sur la cible ?'}
                            style={chipLabelBtn}
                          >
                            {!methodEdit && activeTriggers[t.id] ? '✓ ' : ''}
                            {t.label}
                          </button>
                          {methodEdit && (
                            <button
                              type="button"
                              onClick={() => deleteTrigger(rm.id, t.id)}
                              title="Supprimer ce déclencheur (retiré de toutes les étapes)"
                              style={chipXBtn}
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      ),
                    )}
                    {methodEdit && (
                      <>
                        <input
                          value={newTrigLabel}
                          onChange={(e) => setNewTrigLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addTrigger(rm.id, newTrigLabel);
                              setNewTrigLabel('');
                            }
                          }}
                          placeholder="FTP, SMB…"
                          spellCheck="false"
                          autoCorrect="off"
                          autoCapitalize="off"
                          style={trigInput}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addTrigger(rm.id, newTrigLabel);
                            setNewTrigLabel('');
                          }}
                          style={miniBtn}
                        >
                          + déclencheur
                        </button>
                      </>
                    )}
                    {!methodEdit && roadmapTriggers.length === 0 && (
                      <span style={{ fontSize: '11.5px', color: 'var(--faint)' }}>
                        aucun — passe en « ✎ Modifier » pour en déclarer
                      </span>
                    )}
                  </div>
                )}

                {/* Phases */}
                <div style={phaseList}>
                  {rm.phases.map((ph, pi) => {
                    const phCount = progressOf(ph.steps, activeTriggers, checks);
                    const phProg = progress(phCount.done, phCount.total);
                    // Hide a phase whose every step is inactive, or the switch
                    // leaves an empty card behind. NEVER in edit mode: you must be
                    // able to edit what this target does not need. A phase with no
                    // step at all is empty, not inactive, so it stays.
                    const phaseHidden =
                      !methodEdit &&
                      hideInactiveSteps &&
                      ph.steps.length > 0 &&
                      !phaseHasActiveStep(ph, activeTriggers);
                    // Which rows render, and where a `── FTP ──` sub-header goes.
                    // Precomputed so a hidden step cannot leave a duplicate header
                    // behind. `si` stays the REAL index in ph.steps — what
                    // moveStep and the ↑↓ bounds need, so drag & drop is untouched.
                    const visible = ph.steps
                      .map((st, si) => ({ st, si, active: isStepActive(st, activeTriggers) }))
                      .filter((x) => methodEdit || !hideInactiveSteps || x.active);
                    let lastGroup = '';
                    const rows = visible.map((x) => {
                      const key = stepGroupKey(x.st);
                      const head =
                        key !== '' && key !== lastGroup
                          ? describeStepTriggers(x.st, roadmapTriggers)
                          : null;
                      lastGroup = key;
                      return { ...x, head };
                    });
                    const isDraggingPhase = dragPhaseIdx === pi;
                    const showPlaceholderBefore =
                      dragPhaseIdx != null &&
                      dropIndex === pi &&
                      !(dropIndex === dragPhaseIdx || dropIndex === dragPhaseIdx + 1);
                    const d = draftFor(ph.id);

                    if (phaseHidden) return null;

                    return (
                      <Fragment key={ph.id}>
                        {showPlaceholderBefore && <div style={phPlaceholder} />}
                        <div
                          style={{
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            transition: 'opacity .12s',
                            opacity: isDraggingPhase ? 0.35 : 1,
                          }}
                          onDragOver={(e) => {
                            if (dragPhaseIdx == null) return;
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const ins = e.clientY - rect.top > rect.height / 2 ? pi + 1 : pi;
                            if (dropIndex !== ins) setDropIndex(ins);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragPhaseIdx != null && dropIndex != null) {
                              // dropIndex is the VISUAL insertion index (0..n).
                              // movePhase wants a post-removal splice index, so we
                              // shift down by one when inserting after the source.
                              const target = dropIndex > dragPhaseIdx ? dropIndex - 1 : dropIndex;
                              movePhase(rm.id, rm.phases[dragPhaseIdx].id, target);
                            }
                            clearPhaseDrag();
                          }}
                        >
                          {/* Phase header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '12px 16px',
                              borderBottom: '1px solid var(--border)',
                              cursor: methodEdit ? 'grab' : 'default',
                            }}
                          >
                            {methodEdit ? (
                              <>
                                <span
                                  draggable
                                  onDragStart={(e) => {
                                    try {
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', 'phase-' + pi);
                                    } catch {
                                      /* dataTransfer unavailable */
                                    }
                                    setDragPhaseIdx(pi);
                                    setDropIndex(pi);
                                  }}
                                  onDragEnd={clearPhaseDrag}
                                  title="Glisser pour déplacer la phase"
                                  style={dragHandle}
                                >
                                  ⠿
                                </span>
                                <input
                                  value={ph.label}
                                  onChange={(e) => renamePhase(rm.id, ph.id, e.target.value)}
                                  spellCheck="false"
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  style={phaseRenameInput}
                                />
                                {/* Accessible reorder fallback. movePhase takes a
                                    post-removal splice index (like moveStep), so a
                                    neighbour swap is up = pi-1, down = pi+1. */}
                                <ReorderControls
                                  onUp={() => movePhase(rm.id, ph.id, pi - 1)}
                                  onDown={() => movePhase(rm.id, ph.id, pi + 1)}
                                  onDelete={() => deletePhase(rm.id, ph.id)}
                                  disableUp={pi === 0}
                                  disableDown={pi === nPhases - 1}
                                  upTitle="Monter la phase"
                                  downTitle="Descendre la phase"
                                  delTitle="Supprimer la phase"
                                  delStyle={phaseDelBtn}
                                />
                              </>
                            ) : (
                              <>
                                <span style={phaseLabel}>{ph.label}</span>
                                <span style={monoCount}>{phCount.done + '/' + phCount.total}</span>
                                <Bar track={phaseBarTrack} width={phProg.width} />
                              </>
                            )}
                          </div>

                          {/* Steps */}
                          <div style={phaseBody}>
                            {rows.map(({ st, si, active, head }) => {
                              const subs = st.substeps ?? [];
                              const subIds = subs.map((sb) => sb.id);
                              const subProg = substepProgress(st, checks);
                              // DERIVED once the step has a checklist: the row's
                              // box mirrors its items, so the two can never
                              // disagree (lib/triggers.isStepDone).
                              const checked = isStepDone(st, checks);
                              const partial = subProg.total > 0 && subProg.done > 0 && !checked;
                              // The step's triggers WITH their mode, in the
                              // roadmap's declaration order (v0.13.0).
                              const stepTrigs = stepTriggers(st, roadmapTriggers);
                              const stepMode = modeOf(st);
                              const cond = describeStepTriggers(st, roadmapTriggers);
                              const cmd = st.commandId ? cmdById.get(st.commandId) : undefined;
                              const snip = st.snippetId ? snipById.get(st.snippetId) : undefined;
                              // A linked command's LOCALS live in its own
                              // category+tool context (0.10.0) — the same one the
                              // Library uses — NOT in the step's context, which
                              // belongs to the linked snippet below.
                              const cmdCtx = cmd ? commandContext(cmd) : '';
                              const cmdValues = cmd
                                ? { ...values, ...(localValues[cmdCtx] ?? {}) }
                                : values;
                              const expanded = !!openSteps[st.id];
                              const hasResult = !!results[st.id]?.trim();
                              const isDragged = dragStep?.stepId === st.id;
                              const isOver =
                                dragStep != null &&
                                dragOver != null &&
                                dragOver.phaseId === ph.id &&
                                dragOver.index === si &&
                                dragStep.stepId !== st.id;
                              return (
                                <Fragment key={st.id}>
                                  {head && (
                                    <div
                                      style={{
                                        ...groupHead,
                                        color: methodEdit || active ? 'var(--acc)' : 'var(--faint)',
                                      }}
                                    >
                                      <span>
                                        {head}
                                        {active ? '' : ' · inactif'}
                                      </span>
                                      <span style={groupRule} />
                                    </div>
                                  )}
                                  <div
                                    draggable={methodEdit}
                                    onDragStart={(e) => {
                                      try {
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', st.id);
                                      } catch {
                                        /* dataTransfer unavailable */
                                      }
                                      setDragStep({ phaseId: ph.id, stepId: st.id });
                                      setDragOver({ phaseId: ph.id, index: si });
                                    }}
                                    onDragOver={(e) => {
                                      if (!dragStep) return;
                                      e.preventDefault();
                                      if (dragOver?.phaseId !== ph.id || dragOver?.index !== si) {
                                        setDragOver({ phaseId: ph.id, index: si });
                                      }
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      if (dragStep) {
                                        moveStep(rm.id, dragStep.phaseId, ph.id, dragStep.stepId, si);
                                      }
                                      clearStepDrag();
                                    }}
                                    onDragEnd={clearStepDrag}
                                    style={{
                                      padding: '9px 0',
                                      borderTop: isOver ? '2px solid var(--acc)' : '1px solid var(--border)',
                                      // An inactive step is dimmed rather than
                                      // hidden, so you can see what this target
                                      // does not need — and why. NEVER in edit
                                      // mode though: the dimming reports progress
                                      // state, which has no bearing on editing the
                                      // structure, and it made the rows hard to
                                      // work with (v0.15.0).
                                      opacity: isDragged ? 0.45 : methodEdit || active ? 1 : 0.42,
                                      cursor: methodEdit ? 'grab' : 'default',
                                    }}
                                  >
                                    <div style={stepInner}>
                                      {methodEdit && (
                                        <span title="Glisser pour réordonner" style={stepDragHandle}>
                                          ⠿
                                        </span>
                                      )}
                                      <button
                                        onClick={() =>
                                          subs.length
                                            ? setChecked(subIds, !checked)
                                            : toggleCheck(st.id)
                                        }
                                        disabled={!methodEdit && !active}
                                        title={
                                          !active
                                            ? 'Étape inactive — condition : ' + cond
                                            : subs.length
                                              ? 'Cocher ou décocher les ' + subs.length + ' sous-étapes'
                                              : undefined
                                        }
                                        style={checked ? checkOn : checkOff}
                                      >
                                        {checked ? '✓' : partial ? '–' : ''}
                                      </button>
                                      {/* Assigned triggers, to the LEFT of the
                                          label. Display only — all editing happens
                                          in the picker below, so the row stays
                                          readable. The BORDER carries the step's
                                          operator (dashed OU / solid ET, the same
                                          for every chip of a step) and the COLOUR
                                          carries whether the target has it. Since
                                          the chip shows no text for the operator,
                                          the tooltip spells it out. */}
                                      {stepTrigs.length > 0 && (
                                        <div style={stepTrigLeft}>
                                          {stepTrigs.map((trigger) => (
                                            <span
                                              key={trigger.id}
                                              title={
                                                trigger.label +
                                                (activeTriggers[trigger.id]
                                                  ? ' — détecté sur la cible'
                                                  : ' — non détecté') +
                                                ' · condition : ' +
                                                cond
                                              }
                                              style={chipStyle(
                                                !!activeTriggers[trigger.id],
                                                stepMode,
                                              )}
                                            >
                                              {trigger.label}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      <div style={stepTextWrap}>
                                        {/* In edit mode the label is an input and
                                            the links are dropdowns — all patched
                                            through updateStep, which leaves the
                                            step's id (and so its checks, its
                                            result and its local values) alone. */}
                                        {methodEdit ? (
                                          <input
                                            value={st.text}
                                            onChange={(e) =>
                                              updateStep(rm.id, ph.id, st.id, {
                                                text: e.target.value,
                                              })
                                            }
                                            spellCheck="false"
                                            autoCorrect="off"
                                            autoCapitalize="off"
                                            style={stepRenameInput}
                                          />
                                        ) : (
                                          <div style={checked ? stepTextDone : stepText}>
                                            {st.text}
                                          </div>
                                        )}
                                        {methodEdit && (
                                          <div style={stepEditRow}>
                                            <select
                                              value={st.commandId ?? ''}
                                              onChange={(e) =>
                                                updateStep(rm.id, ph.id, st.id, {
                                                  commandId: e.target.value,
                                                })
                                              }
                                              style={stepEditSelect}
                                            >
                                              <option value="">— aucune commande liée —</option>
                                              {sortedCommands.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                  {c.tool} — {c.title}
                                                </option>
                                              ))}
                                            </select>
                                            <select
                                              value={st.snippetId ?? ''}
                                              onChange={(e) =>
                                                updateStep(rm.id, ph.id, st.id, {
                                                  snippetId: e.target.value,
                                                })
                                              }
                                              style={stepEditSelect}
                                            >
                                              <option value="">— aucun snippet lié —</option>
                                              {sortedSnippets.map((sn) => (
                                                <option key={sn.id} value={sn.id}>
                                                  {sn.title}
                                                </option>
                                              ))}
                                            </select>
                                            {roadmapTriggers.length > 0 && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setPickerStep(pickerStep === st.id ? null : st.id)
                                                }
                                                style={miniBtn}
                                              >
                                                {stepTrigs.length
                                                  ? '⚙ déclencheurs'
                                                  : '＋ déclencheur'}
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        {/* The picker, unfolded for ONE step at a
                                            time so a roadmap with a dozen triggers
                                            does not turn edit mode into a wall of
                                            chips. One click advances the chip:
                                            absent → OU → ET → absent. The OU/ET
                                            prefix here is what teaches the border
                                            encoding used on the row. */}
                                        {methodEdit && pickerStep === st.id && (
                                          <div style={stepChipRow}>
                                            {roadmapTriggers.map((t) => {
                                              const mode = stepTriggerMode(st, t.id);
                                              return (
                                                <button
                                                  key={t.id}
                                                  type="button"
                                                  onClick={() =>
                                                    cycleStepTriggerOn(ph.id, st, t.id)
                                                  }
                                                  title={
                                                    mode === 'off'
                                                      ? t.label +
                                                        ' — inutilisé. Cliquer : ajouter (OU)'
                                                      : mode === 'any'
                                                        ? t.label +
                                                          ' — OU. Cliquer : passer toute l’étape en ET'
                                                        : t.label +
                                                          ' — ET. Cliquer : retirer de l’étape'
                                                  }
                                                  // An unassigned chip is always
                                                  // muted: its colour would
                                                  // otherwise claim a role it
                                                  // does not have on this step.
                                                  style={chipStyle(
                                                    mode !== 'off' && !!activeTriggers[t.id],
                                                    mode,
                                                  )}
                                                >
                                                  {t.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      {/* `3/12` — the checklist's state, readable
                                          without unfolding the panel. */}
                                      {subProg.total > 0 && (
                                        <span style={monoCount}>
                                          {subProg.done + '/' + subProg.total}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => toggleOpenStep(st.id)}
                                        title={hasResult ? 'Résultat enregistré' : undefined}
                                        style={
                                          !expanded && hasResult
                                            ? // The `border` SHORTHAND, not the
                                              // borderColor longhand: mixing them
                                              // makes React leave a stale colour
                                              // when the state flips back (the trap
                                              // Sidebar.tsx's tagOn documents).
                                              {
                                                ...noteBtn,
                                                background: 'var(--acc-dim)',
                                                border: '1px solid var(--acc-line)',
                                              }
                                            : noteBtn
                                        }
                                      >
                                        {expanded
                                          ? 'masquer'
                                          : cmd
                                            ? '▸ ' + cmd.tool
                                            : snip
                                              ? '▸ snippet'
                                              : subs.length
                                                ? '▸ sous-étapes'
                                                : '▸ résultat'}
                                      </button>
                                      {methodEdit && (
                                        <ReorderControls
                                          onUp={() => moveStep(rm.id, ph.id, ph.id, st.id, si - 1)}
                                          onDown={() => moveStep(rm.id, ph.id, ph.id, st.id, si + 1)}
                                          onDelete={() => deleteStep(rm.id, ph.id, st.id)}
                                          disableUp={si === 0}
                                          disableDown={si === ph.steps.length - 1}
                                          upTitle="Monter l'étape"
                                          downTitle="Descendre l'étape"
                                          delTitle="Supprimer l'étape"
                                          delStyle={stepDelBtn}
                                        />
                                      )}
                                    </div>
                                    {expanded && (
                                      <div style={notePanel}>
                                        {/* The checklist comes first: it is the
                                            step's own content, where the linked
                                            command and the « Résultat » are
                                            attachments to it. */}
                                        {(subs.length > 0 || methodEdit) && (
                                          <>
                                            <div style={subList}>
                                              {subs.map((sb) => {
                                                const sbDone = !!checks[sb.id];
                                                return (
                                                  <div key={sb.id} style={subRow}>
                                                    <button
                                                      onClick={() => toggleCheck(sb.id)}
                                                      disabled={!methodEdit && !active}
                                                      style={sbDone ? checkOn : checkOff}
                                                    >
                                                      {sbDone ? '✓' : ''}
                                                    </button>
                                                    <span style={sbDone ? subTextDone : subText}>
                                                      {sb.text}
                                                    </span>
                                                    {methodEdit && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          deleteSubstep(rm.id, ph.id, st.id, sb.id)
                                                        }
                                                        title="Supprimer la sous-étape"
                                                        style={stepDelBtn}
                                                      >
                                                        ✕
                                                      </button>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                            {methodEdit && (
                                              <div style={subAddRow}>
                                                <input
                                                  value={subDrafts[st.id] ?? ''}
                                                  onChange={(e) => setSubDraft(st.id, e.target.value)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') submitSubstep(ph.id, st.id);
                                                  }}
                                                  placeholder="Nouvelle sous-étape…"
                                                  spellCheck="false"
                                                  autoCorrect="off"
                                                  autoCapitalize="off"
                                                  style={subAddInput}
                                                />
                                                <button
                                                  onClick={() => submitSubstep(ph.id, st.id)}
                                                  style={addStepBtn}
                                                >
                                                  + Sous-étape
                                                </button>
                                              </div>
                                            )}
                                            {(cmd || snip) && <hr style={subRule} />}
                                          </>
                                        )}
                                        {cmd && (
                                          <>
                                            <div style={cmdTitleLine}>{cmd.title}</div>
                                            <CopyButton
                                              variant="inline"
                                              text={resolve(cmd.template, cmdValues)}
                                            />
                                            <CodeBlock
                                              template={cmd.template}
                                              values={cmdValues}
                                              definedNames={defNames}
                                              preStyle={codePreCompact}
                                              onSetLocal={(name, val) =>
                                                setLocalValue(cmdCtx, name, val)
                                              }
                                            />
                                          </>
                                        )}
                                        {snip && (
                                          <>
                                            <div style={cmdTitleLine}>{snip.title}</div>
                                            {snip.steps.map((ss, k) => (
                                              <div key={ss.id}>
                                                <div style={snipStepHead}>
                                                  <span style={snipStepNum}>
                                                    {String(k + 1).padStart(2, '0')}
                                                  </span>
                                                  {ss.label && <span style={snipStepLabel}>{ss.label}</span>}
                                                </div>
                                                <CommandLine
                                                  template={ss.template}
                                                  values={{ ...values, ...(localValues[st.id] ?? {}) }}
                                                  definedNames={defNames}
                                                  preStyle={codePreCompact}
                                                  onSetLocal={(name, val) =>
                                                    setLocalValue(st.id, name, val)
                                                  }
                                                />
                                                {ss.produces && (
                                                  <div style={snipCapRow}>
                                                    <span
                                                      style={{
                                                        ...snipCapName,
                                                        color: (localValues[st.id] ?? {})[ss.produces]
                                                          ? 'var(--acc)'
                                                          : 'var(--muted)',
                                                      }}
                                                    >
                                                      ${ss.produces}
                                                    </span>
                                                    <input
                                                      value={(localValues[st.id] ?? {})[ss.produces] ?? ''}
                                                      onChange={(e) =>
                                                        setLocalValue(st.id, ss.produces!, e.target.value)
                                                      }
                                                      placeholder={
                                                        snip.locals.find((l) => l.name === ss.produces)?.hint ||
                                                        'valeur issue de la sortie…'
                                                      }
                                                      spellCheck="false"
                                                      autoComplete="off"
                                                      autoCorrect="off"
                                                      autoCapitalize="off"
                                                      style={snipCapInput}
                                                    />
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </>
                                        )}
                                        <div style={resultLabel}>
                                          Résultat
                                          {/* Reads THIS step's pasted output and
                                              ticks the triggers it vouches for. A
                                              pre-fill you can correct, never a
                                              source of truth: it only ever ticks. */}
                                          {roadmapTriggers.length > 0 &&
                                            (results[st.id] ?? '').trim() !== '' && (
                                              <button
                                                type="button"
                                                onClick={() => onDetect(st.id)}
                                                title="Lire la sortie nmap collée et cocher les déclencheurs trouvés"
                                                style={detectBtn}
                                              >
                                                ⚡ détecter depuis le résultat
                                              </button>
                                            )}
                                        </div>
                                        <textarea
                                          value={results[st.id] ?? ''}
                                          onChange={(e) => setResult(st.id, e.target.value)}
                                          placeholder="Colle la sortie de la commande…"
                                          rows={20}
                                          spellCheck="false"
                                          autoCorrect="off"
                                          autoCapitalize="off"
                                          autoComplete="off"
                                          style={resultArea}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </Fragment>
                              );
                            })}

                            {/* Empty-phase drop zone: the only way to receive a
                                cross-phase step drag into a phase with no rows
                                (SPEC §7.4, Q74). Only shown mid-drag. */}
                            {dragStep && ph.steps.length === 0 && (
                              <div
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  if (dragOver?.phaseId !== ph.id || dragOver?.index !== 0) {
                                    setDragOver({ phaseId: ph.id, index: 0 });
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (dragStep) moveStep(rm.id, dragStep.phaseId, ph.id, dragStep.stepId, 0);
                                  clearStepDrag();
                                }}
                                style={{
                                  height: '40px',
                                  margin: '6px 0',
                                  border: '2px dashed var(--acc)',
                                  background: 'var(--acc-dim)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '11px',
                                  color: 'var(--acc)',
                                  fontFamily: MONO,
                                }}
                              >
                                déposer l'étape ici
                              </div>
                            )}

                            {/* Add-step draft row (edit mode) */}
                            {methodEdit && (
                              <div style={addStepWrap}>
                                <input
                                  value={d.text}
                                  onChange={(e) => setDraft(ph.id, { text: e.target.value })}
                                  placeholder="Intitulé de la nouvelle étape…"
                                  spellCheck="false"
                                  autoCorrect="off"
                                  autoCapitalize="off"
                                  style={addStepInput}
                                />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <select
                                    value={d.commandId}
                                    onChange={(e) => setDraft(ph.id, { commandId: e.target.value })}
                                    style={addStepSelect}
                                  >
                                    <option value="">— aucune commande liée —</option>
                                    {sortedCommands.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.tool} — {c.title}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={d.snippetId}
                                    onChange={(e) => setDraft(ph.id, { snippetId: e.target.value })}
                                    style={addStepSelect}
                                  >
                                    <option value="">— aucun snippet lié —</option>
                                    {sortedSnippets.map((sn) => (
                                      <option key={sn.id} value={sn.id}>
                                        {sn.title}
                                      </option>
                                    ))}
                                  </select>
                                  {/* The draft's triggers, on the SAME three-state
                                      cycle as a step's row (v0.13.0 — it used to be
                                      a single-choice dropdown), so there is one
                                      gesture to learn. Offered once the roadmap
                                      declares a vocabulary. */}
                                  {roadmapTriggers.length > 0 && (
                                    <div style={stepChipRow}>
                                      {roadmapTriggers.map((t) => {
                                        const mode = stepTriggerMode(
                                          {
                                            id: '',
                                            text: '',
                                            triggerIds: d.triggerIds,
                                            triggerMode: d.triggerMode,
                                          },
                                          t.id,
                                        );
                                        return (
                                          <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => cycleDraftTrigger(ph.id, t.id)}
                                            title={
                                              mode === 'off'
                                                ? t.label + ' — inutilisé. Cliquer : ajouter (OU)'
                                                : mode === 'any'
                                                  ? t.label + ' — OU. Cliquer : tout passer en ET'
                                                  : t.label + ' — ET. Cliquer : retirer'
                                            }
                                            style={chipStyle(
                                              mode !== 'off' && !!activeTriggers[t.id],
                                              mode,
                                            )}
                                          >
                                            {t.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <button onClick={() => submitStep(ph.id)} style={addStepBtn}>
                                    + Étape
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}

                  {showTailPlaceholder && <div style={phPlaceholder} />}

                  {/* Add-phase form (edit mode) */}
                  {methodEdit && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        value={addPhaseLabel}
                        onChange={(e) => setAddPhaseLabel(e.target.value)}
                        placeholder="Nom d'une nouvelle phase…"
                        spellCheck="false"
                        autoCorrect="off"
                        autoCapitalize="off"
                        style={addPhaseInput}
                      />
                      <button onClick={submitPhase} style={addPhaseBtn}>
                        + Phase
                      </button>
                    </div>
                  )}
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
