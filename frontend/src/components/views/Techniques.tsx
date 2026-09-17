import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store';
import { fold } from '../../lib/format';
import { definedNames as buildDefinedNames } from '../../lib/varsets';
import { MONO, cardBase, cardHead, cardIconBtn, codePreCompact, tagBtn } from '../../lib/ui';
import { CommandLine } from '../CommandLine';
import { EmptyState } from '../EmptyState';
import type { Technique } from '../../types';

// Techniques — reusable ordered command chains (v0.9.0). A technique is a technique
// (silver ticket, kerberoast → crack → reuse…) whose steps are run one after the
// other, each commonly consuming what the previous one produced.
//
// LAYOUT: a SINGLE centred column, like Méthodologie and Cheatsheet, not the
// Library's card grid. The content is sequential and code-heavy — the mimikatz
// golden-ticket line alone is ~120 chars — so a 370px grid track would wrap every
// command over four lines. The column reflows on a narrow pane for free.
//
// Two variable classes are live here (lib/vars.ts):
//   $GLOBALES   app-wide, edited in the sidebar
//   $locales    captured from a step's output; their VALUES are memory-only, keyed
//               per USAGE CONTEXT (here: the technique id), and never persisted or
//               exported (D7).
//
// v0.10.0 — a local no longer has to be DECLARED in locals[] to be recognised, so
// there are now three ways into the same value: the « Variables locales » strip
// (for a local no step produces), the capture field under the step that produces
// it, and a double-click on the token inside any line. All three write the same
// context, so they stay in lockstep. locals[] still earns its keep: it carries the
// `hint` and the « produit » anchor that place a capture field under a given step.

const page: CSSProperties = { padding: '22px 26px 70px', display: 'flex', justifyContent: 'center' };
const column: CSSProperties = { width: '100%', maxWidth: '840px' };
const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '12px',
  marginBottom: '22px',
};
// Mirrors the Library's — the two head rows read as one control.
const resetLink: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--faint)',
  fontSize: '11.5px',
  fontFamily: 'inherit',
};
const groupsWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '30px' };
const groupHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  paddingBottom: '10px',
  borderBottom: '1px solid var(--border)',
  marginBottom: '16px',
};
const cardsWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '13px' };
const card: CSSProperties = { ...cardBase, gap: '11px' };
const cardTitle: CSSProperties = {
  fontWeight: 600,
  fontSize: '13.5px',
  lineHeight: 1.35,
  flex: 1,
  minWidth: 0,
};
const cardDesc: CSSProperties = {
  fontSize: '12px',
  color: 'var(--muted)',
  lineHeight: 1.45,
  marginTop: '-2px',
};
const stepsWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '10px' };
const stepHead: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  marginBottom: '5px',
};
const stepNum: CSSProperties = {
  fontFamily: MONO,
  fontSize: '11px',
  color: 'var(--acc)',
  flex: 'none',
};
const stepLabel: CSSProperties = { fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.4 };
const capRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '6px',
};
const capName: CSSProperties = { fontFamily: MONO, fontSize: '11.5px', flex: 'none' };
const capInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--code)',
  border: '1px dashed var(--border2)',
  color: 'var(--text)',
  fontFamily: MONO,
  fontSize: '12px',
  padding: '5px 8px',
};
const localsStrip: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '9px 10px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
};
const tagsRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  flexWrap: 'wrap',
};
const addBase: CSSProperties = {
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '4px 10px',
  fontSize: '11.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
const addOff: CSSProperties = {
  ...addBase,
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
};
const addOn: CSSProperties = {
  ...addBase,
  border: '1px solid var(--acc-line)',
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
};

// Mirrors Library's synthetic group for a technique whose category is unknown
// (dangling category in an imported dataset) so it never renders nowhere.
const ORPHAN_KEY = '__orphan__';

interface CatGroup {
  key: string;
  label: string;
  color: string;
  techniques: Technique[];
}

export function Techniques() {
  const {
    values,
    query,
    techniques,
    categories,
    cheatsheets,
    activeSheet,
    activeTqCat,
    activeTqTag,
    localValues,
    setActiveTqTag,
    setActiveTqCat,
    setQuery,
    setLocalValue,
    openEditTechnique,
    deleteTechnique,
    toggleTechniqueInSheet,
  } = useStore();

  const catByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);

  // GLOBAL names only, and identical for every technique: since 0.10.0 a local no
  // longer has to be declared to be recognised, so the set no longer depends on
  // which technique is being rendered.
  const definedNames = useMemo(() => buildDefinedNames(values), [values]);

  // Membership of the ACTIVE sheet's « Techniques » chapter — drives the toggle.
  const sheetIds = useMemo(() => {
    const s = cheatsheets.find((x) => x.id === activeSheet);
    return new Set(s?.techniqueIds ?? []);
  }, [cheatsheets, activeSheet]);

  const filtered = useMemo<Technique[]>(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    return techniques.filter((tq) => {
      if (activeTqCat && tq.category !== activeTqCat) return false;
      if (activeTqTag && !tq.tags.includes(activeTqTag)) return false;
      if (tokens.length) {
        const catLabel = catByKey.get(tq.category)?.label ?? tq.category;
        const hay = fold(
          [
            tq.title,
            tq.desc,
            tq.tags.join(' '),
            catLabel,
            tq.steps.map((st) => st.template + ' ' + (st.label ?? '')).join(' '),
          ].join(' '),
        );
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [techniques, catByKey, activeTqCat, activeTqTag, query]);

  const groups = useMemo<CatGroup[]>(() => {
    const out: CatGroup[] = [];
    for (const cat of categories) {
      const inCat = filtered.filter((tq) => tq.category === cat.key);
      if (inCat.length) out.push({ key: cat.key, label: cat.label, color: cat.color, techniques: inCat });
    }
    const known = new Set(categories.map((c) => c.key));
    const orphans = filtered.filter((tq) => !known.has(tq.category));
    if (orphans.length) {
      out.push({
        key: ORPHAN_KEY,
        label: 'Sans catégorie',
        color: 'var(--faint)',
        techniques: orphans,
      });
    }
    return out;
  }, [filtered, categories]);

  const scopeLabel = activeTqCat
    ? (catByKey.get(activeTqCat)?.label ?? activeTqCat)
    : activeTqTag
      ? '#' + activeTqTag
      : '';

  const reset = () => {
    setActiveTqCat(null);
    setActiveTqTag(null);
    setQuery('');
  };

  const filtering = !!(activeTqCat || activeTqTag || query.trim());

  const askDelete = (tq: Technique) => {
    if (window.confirm('Supprimer la technique « ' + tq.title + ' » ?')) deleteTechnique(tq.id);
  };

  return (
    <div style={page}>
      <div style={column}>
        <div style={headRow}>
          <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{filtered.length}</span> technique(s)
          </div>
          {scopeLabel && <div style={{ fontSize: '12.5px', color: 'var(--faint)' }}>{scopeLabel}</div>}
          {/* Same wording and same visibility rule as the Library's: it clears
              filters, it says so, and it stays out of the way when there is
              nothing to clear. */}
          {filtering && (
            <button onClick={reset} style={resetLink}>
              réinitialiser les filtres
            </button>
          )}
        </div>

        {groups.length > 0 ? (
          <div style={groupsWrap}>
            {groups.map((g) => (
              <div key={g.key}>
                <div style={groupHead}>
                  <span style={{ width: '10px', height: '10px', flex: 'none', background: g.color }} />
                  <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-.01em' }}>
                    {g.label}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--faint)', fontFamily: MONO }}>
                    {g.techniques.length}
                  </span>
                </div>
                <div style={cardsWrap}>
                  {g.techniques.map((tq) => {
                    // The usage context: in this view a technique's local values are
                    // keyed by its own id. A Methodology step keys them by stepId,
                    // so the same technique used there holds independent values.
                    const ctx = tq.id;
                    const locals = localValues[ctx] ?? {};
                    // Locals win over a same-named global: they are the narrower
                    // scope. Cannot actually collide (one is lower case, the other
                    // upper), but merging in this order keeps the intent explicit.
                    const merged = { ...values, ...locals };
                    const produced = new Set(
                      tq.steps.map((st) => st.produces).filter((n): n is string => !!n),
                    );
                    const unbound = tq.locals.filter((l) => !produced.has(l.name));
                    const inSheet = sheetIds.has(tq.id);

                    const capture = (name: string, hint?: string) => (
                      <div style={capRow} key={name}>
                        <span
                          style={{
                            ...capName,
                            color: locals[name] ? 'var(--acc)' : 'var(--muted)',
                          }}
                        >
                          ${name}
                        </span>
                        <input
                          value={locals[name] ?? ''}
                          onChange={(e) => setLocalValue(ctx, name, e.target.value)}
                          placeholder={hint || 'valeur issue de la sortie…'}
                          spellCheck="false"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          style={capInput}
                        />
                      </div>
                    );

                    return (
                      <div key={tq.id} style={card}>
                        <div style={cardHead}>
                          <div style={cardTitle}>{tq.title}</div>
                          <span
                            style={{ fontSize: '11px', color: 'var(--faint)', fontFamily: MONO, flex: 'none' }}
                          >
                            {tq.steps.length} étape(s)
                          </span>
                          <button
                            onClick={() => openEditTechnique(tq.id)}
                            title="Modifier"
                            style={cardIconBtn}
                          >
                            ✎
                          </button>
                          <button onClick={() => askDelete(tq)} title="Supprimer" style={cardIconBtn}>
                            ✕
                          </button>
                        </div>
                        {tq.desc && <div style={cardDesc}>{tq.desc}</div>}

                        {/* Locals no step produces: captured up front rather than inline. */}
                        {unbound.length > 0 && (
                          <div style={localsStrip}>
                            <span style={{ fontSize: '10.5px', letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600 }}>
                              Variables locales
                            </span>
                            {unbound.map((l) => capture(l.name, l.hint))}
                          </div>
                        )}

                        <div style={stepsWrap}>
                          {tq.steps.map((st, i) => {
                            const prodHint = st.produces
                              ? tq.locals.find((l) => l.name === st.produces)?.hint
                              : undefined;
                            return (
                              <div key={st.id}>
                                <div style={stepHead}>
                                  <span style={stepNum}>{String(i + 1).padStart(2, '0')}</span>
                                  {st.label && <span style={stepLabel}>{st.label}</span>}
                                </div>
                                <CommandLine
                                  template={st.template}
                                  values={merged}
                                  definedNames={definedNames}
                                  preStyle={codePreCompact}
                                  onSetLocal={(name, val) => setLocalValue(ctx, name, val)}
                                />
                                {/* The capture sits right under the step that yields
                                    it, so the output is pasted where it is produced
                                    and the next step turns green immediately. */}
                                {st.produces && produced.has(st.produces) && capture(st.produces, prodHint)}
                              </div>
                            );
                          })}
                        </div>

                        <div style={tagsRow}>
                          {tq.tags.map((t) => (
                            <button
                              key={t}
                              onClick={() => setActiveTqTag(activeTqTag === t ? null : t)}
                              style={tagBtn}
                            >
                              #{t}
                            </button>
                          ))}
                          <div style={{ flex: 1 }} />
                          <button
                            onClick={() => toggleTechniqueInSheet(tq.id)}
                            style={inSheet ? addOn : addOff}
                          >
                            {inSheet ? 'Ajouté ✓' : '+ Cheatsheet'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            mono="// aucune technique"
            sub="Crée un enchaînement avec « + Technique », ou réinitialise les filtres."
          />
        )}
      </div>
    </div>
  );
}
