import { Fragment, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store';
import { STANDARD_VARS } from '../../lib/theme';
import { resolve, toParts } from '../../lib/vars';
import type { Part } from '../../types';

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
// NOTE: the M1 store contract exposes no "edit step text" action, and the
// prototype renders step text as a plain (struck-through when checked) div even
// in edit mode — so step text is NOT an inline input here. It matches the
// prototype exactly; a rename action + inline field can be added later.

// Per-part styling for the three A5 render states (§5.10 — the single authority),
// identical to the Library code blocks.
function partStyle(state: Part['state']): CSSProperties {
  switch (state) {
    case 'resolved':
      return { color: 'var(--acc)', background: 'var(--acc-dim)' };
    case 'undef':
      return { color: 'var(--muted)', textDecoration: 'underline dotted' };
    case 'empty':
    default:
      return {};
  }
}

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

const tabBar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '7px',
  marginBottom: '14px',
  alignItems: 'center',
};
const pillBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  padding: '6px 12px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
const pillOn: CSSProperties = {
  ...pillBase,
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  border: '1px solid var(--acc-line)',
};

const newRmRow: CSSProperties = { display: 'flex', gap: '8px', marginBottom: '18px' };
const newRmInput: CSSProperties = {
  flex: 1,
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
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

const emptyWrap: CSSProperties = { textAlign: 'center', padding: '70px 20px' };
const emptyMono: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: 'var(--faint)',
};
const emptySub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

const headerRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' };
const rmTitle: CSSProperties = { fontWeight: 700, fontSize: '16px', letterSpacing: '-.01em' };
const rmProgressText: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12px',
  color: 'var(--muted)',
};
const barTrack: CSSProperties = { height: '6px', background: 'var(--border)', overflow: 'hidden' };
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
const resetBtn: CSSProperties = { ...editBtnBase };

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
  flex: 1,
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
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
const dragHandle: CSSProperties = {
  cursor: 'grab',
  color: 'var(--faint)',
  fontSize: '15px',
  lineHeight: 1,
  userSelect: 'none',
  flex: 'none',
};
const phaseLabel: CSSProperties = { fontWeight: 600, fontSize: '13.5px', flex: 1 };
const monoCount: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '11px',
  color: 'var(--faint)',
};
const phaseBarTrack: CSSProperties = { width: '70px', height: '5px', background: 'var(--border)', overflow: 'hidden' };
const phaseRenameInput: CSSProperties = {
  flex: 1,
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
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
  cursor: 'grab',
  color: 'var(--faint)',
  fontSize: '13px',
  lineHeight: 1.4,
  marginTop: '1px',
  userSelect: 'none',
  flex: 'none',
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
  fontFamily: "'IBM Plex Mono', monospace",
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
  fontFamily: "'IBM Plex Mono', monospace",
};
const copyBtn: CSSProperties = {
  position: 'absolute',
  top: '22px',
  right: '7px',
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--code)',
  color: 'var(--muted)',
  padding: '4px 5px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const stepPre: CSSProperties = {
  margin: 0,
  background: 'var(--code)',
  border: '1px solid var(--border)',
  padding: '10px 12px',
  paddingRight: '44px',
  overflowX: 'auto',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12px',
  lineHeight: 1.6,
  color: 'var(--code-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
const prompt: CSSProperties = { color: 'var(--acc)', userSelect: 'none' };

const addStepWrap: CSSProperties = {
  marginTop: '6px',
  padding: '11px 0 3px',
  borderTop: '1px dashed var(--border2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};
const addStepInput: CSSProperties = {
  width: '100%',
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: '12.5px',
  padding: '7px 10px',
};
const addStepSelect: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
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
  flex: 1,
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
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

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <rect x="9" y="9" width="12" height="12" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

interface StepDraft {
  text: string;
  commandId: string;
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
    roadmaps,
    activeRoadmap,
    methodEdit,
    checks,
    openSteps,
    newRmOpen,
    setActiveRoadmap,
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
    flash,
  } = useStore();

  // Inline create/draft form state (transient, memory-only).
  const [newRmLabel, setNewRmLabel] = useState('');
  const [addPhaseLabel, setAddPhaseLabel] = useState('');
  const [stepDrafts, setStepDrafts] = useState<Record<string, StepDraft>>({});
  // Transient drag state — never touches the store (SPEC §3.7, Q117).
  const [dragStep, setDragStep] = useState<DragStep | null>(null);
  const [dragOver, setDragOver] = useState<DragOver | null>(null);
  const [dragPhaseIdx, setDragPhaseIdx] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const definedNames = useMemo(
    () => new Set<string>([...STANDARD_VARS.map((v) => v.name), ...Object.keys(values)]),
    [values],
  );

  // Command lookup for step→command links, derived live from the store so
  // added/edited/deleted commands are reflected in the select and the panels.
  const cmdById = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands]);

  const rm = roadmaps.find((r) => r.id === activeRoadmap) ?? roadmaps[0] ?? null;

  const copyCmd = (template: string) => {
    try {
      const p = navigator.clipboard?.writeText(resolve(template, values));
      if (p && typeof p.then === 'function') {
        p.then(() => flash('Copié dans le presse-papier'), () => flash('Échec de la copie'));
      } else {
        flash('Copié dans le presse-papier');
      }
    } catch {
      flash('Échec de la copie');
    }
  };

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

  const draftFor = (phaseId: string): StepDraft => stepDrafts[phaseId] ?? { text: '', commandId: '' };
  const setDraft = (phaseId: string, patch: Partial<StepDraft>) =>
    setStepDrafts((s) => ({ ...s, [phaseId]: { ...draftFor(phaseId), ...patch } }));

  const submitStep = (phaseId: string) => {
    if (!rm) return;
    const d = draftFor(phaseId);
    const text = d.text.trim();
    if (!text) return;
    addStep(rm.id, phaseId, text, d.commandId || undefined);
    setStepDrafts((s) => ({ ...s, [phaseId]: { text: '', commandId: '' } }));
  };

  const onReset = () => {
    if (!rm) return;
    if (window.confirm('Réinitialiser la progression de cette méthodologie ?')) resetProgress(rm.id);
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
          <div style={emptyWrap}>
            <div style={emptyMono}>// aucune méthodologie</div>
            <div style={emptySub}>Crée-en une avec le bouton « + Méthodologie ».</div>
          </div>
        ) : (
          (() => {
            // Global progress over every step in the roadmap (equal weight, Q61).
            let rmDone = 0;
            let rmTotal = 0;
            for (const ph of rm.phases) {
              for (const st of ph.steps) {
                rmTotal += 1;
                if (checks[st.id]) rmDone += 1;
              }
            }
            const rmProg = progress(rmDone, rmTotal);

            return (
              <>
                {/* Header: label + progress readout + bar + edit toggle + reset */}
                <div style={headerRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '7px' }}>
                      <span style={rmTitle}>{rm.label}</span>
                      <span style={rmProgressText}>{rmProg.readout}</span>
                    </div>
                    <div style={barTrack}>
                      <div style={{ height: '100%', width: rmProg.width, background: 'var(--acc)' }} />
                    </div>
                  </div>
                  <button onClick={toggleMethodEdit} style={methodEdit ? editBtnOn : editBtnBase}>
                    {methodEdit ? 'Terminé' : '✎ Modifier'}
                  </button>
                  <button onClick={onReset} style={resetBtn}>
                    Réinitialiser la progression
                  </button>
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

                {/* Phases */}
                <div style={phaseList}>
                  {rm.phases.map((ph, pi) => {
                    let pdone = 0;
                    for (const st of ph.steps) if (checks[st.id]) pdone += 1;
                    const phProg = progress(pdone, ph.steps.length);
                    const isDraggingPhase = dragPhaseIdx === pi;
                    const showPlaceholderBefore =
                      dragPhaseIdx != null &&
                      dropIndex === pi &&
                      !(dropIndex === dragPhaseIdx || dropIndex === dragPhaseIdx + 1);
                    const d = draftFor(ph.id);

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
                                <button
                                  onClick={() => movePhase(rm.id, ph.id, pi - 1)}
                                  disabled={pi === 0}
                                  title="Monter la phase"
                                  style={pi === 0 ? arrowBtnDisabled : arrowBtn}
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => movePhase(rm.id, ph.id, pi + 1)}
                                  disabled={pi === nPhases - 1}
                                  title="Descendre la phase"
                                  style={pi === nPhases - 1 ? arrowBtnDisabled : arrowBtn}
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => deletePhase(rm.id, ph.id)}
                                  title="Supprimer la phase"
                                  style={phaseDelBtn}
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <>
                                <span style={phaseLabel}>{ph.label}</span>
                                <span style={monoCount}>{pdone + '/' + ph.steps.length}</span>
                                <div style={phaseBarTrack}>
                                  <div style={{ height: '100%', width: phProg.width, background: 'var(--acc)' }} />
                                </div>
                              </>
                            )}
                          </div>

                          {/* Steps */}
                          <div style={phaseBody}>
                            {ph.steps.map((st, si) => {
                              const checked = !!checks[st.id];
                              const cmd = st.commandId ? cmdById.get(st.commandId) : undefined;
                              const showNote = !!openSteps[st.id] && !!cmd;
                              const isDragged = dragStep?.stepId === st.id;
                              const isOver =
                                dragStep != null &&
                                dragOver != null &&
                                dragOver.phaseId === ph.id &&
                                dragOver.index === si &&
                                dragStep.stepId !== st.id;
                              return (
                                <div
                                  key={st.id}
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
                                    opacity: isDragged ? 0.45 : 1,
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
                                      onClick={() => toggleCheck(st.id)}
                                      style={checked ? checkOn : checkOff}
                                    >
                                      {checked ? '✓' : ''}
                                    </button>
                                    <div style={stepTextWrap}>
                                      <div style={checked ? stepTextDone : stepText}>{st.text}</div>
                                    </div>
                                    {cmd && (
                                      <button onClick={() => toggleOpenStep(st.id)} style={noteBtn}>
                                        {showNote ? 'masquer' : '▸ ' + cmd.tool}
                                      </button>
                                    )}
                                    {methodEdit && (
                                      <>
                                        <button
                                          onClick={() => moveStep(rm.id, ph.id, ph.id, st.id, si - 1)}
                                          disabled={si === 0}
                                          title="Monter l'étape"
                                          style={si === 0 ? arrowBtnDisabled : arrowBtn}
                                        >
                                          ↑
                                        </button>
                                        <button
                                          onClick={() => moveStep(rm.id, ph.id, ph.id, st.id, si + 1)}
                                          disabled={si === ph.steps.length - 1}
                                          title="Descendre l'étape"
                                          style={si === ph.steps.length - 1 ? arrowBtnDisabled : arrowBtn}
                                        >
                                          ↓
                                        </button>
                                        <button
                                          onClick={() => deleteStep(rm.id, ph.id, st.id)}
                                          title="Supprimer l'étape"
                                          style={stepDelBtn}
                                        >
                                          ✕
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {showNote && cmd && (
                                    <div style={notePanel}>
                                      <div style={cmdTitleLine}>{cmd.title}</div>
                                      <button onClick={() => copyCmd(cmd.template)} title="Copier" style={copyBtn}>
                                        <CopyIcon />
                                      </button>
                                      <pre style={stepPre}>
                                        <span style={prompt}>$ </span>
                                        {toParts(cmd.template, values, definedNames).map((p, i) => (
                                          <span key={i} style={partStyle(p.state)}>
                                            {p.text}
                                          </span>
                                        ))}
                                      </pre>
                                    </div>
                                  )}
                                </div>
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
                                  fontFamily: "'IBM Plex Mono', monospace",
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
                                    {commands.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.tool} — {c.title}
                                      </option>
                                    ))}
                                  </select>
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
