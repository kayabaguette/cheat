import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store';
import { CATEGORIES, COMMANDS } from '../../data/seed';
import { STANDARD_VARS } from '../../lib/theme';
import { resolve, toParts } from '../../lib/vars';
import type { Command, Part } from '../../types';

// Library — the fully rendered M0 module. Filters COMMANDS by the active
// category/tool/tag/query from the store, groups the results by category then
// by tool (mirroring the prototype), and renders each command as a card with a
// variable-highlighted code block (§5.10) and a copy-to-clipboard button that
// writes the RESOLVED command (Q99).

// Diacritic-insensitive, case-insensitive fold for accent-tolerant search.
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Per-part styling for the three render states (§5.10 — the single authority).
//   resolved  : accent foreground on accent-dim background (highlight)
//   empty     : neutral/plain, NOT green — placeholder $NAME stays visible
//   undefined : dimmed/muted with a dotted underline (dangling)
//   plain     : default code foreground
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

const catByKey = new Map(CATEGORIES.map((c) => [c.key, c]));

// First-seen tool order per category, computed once from the full seed set so
// grouping is stable regardless of the active filter (matches the prototype).
const catToolOrder = new Map<string, string[]>();
for (const c of COMMANDS) {
  const tools = catToolOrder.get(c.category) ?? [];
  if (!tools.includes(c.tool)) tools.push(c.tool);
  catToolOrder.set(c.category, tools);
}

// --- static style objects -------------------------------------------------
const page: CSSProperties = { padding: '22px 26px 70px' };
const headRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '12px',
  marginBottom: '22px',
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
const toolsWrap: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '20px' };
const toolHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '11px',
};
const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))',
  gap: '13px',
};
const card: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  padding: 'var(--pad)',
  display: 'flex',
  flexDirection: 'column',
  gap: '9px',
};
const cardHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '8px' };
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
const codeWrap: CSSProperties = { position: 'relative' };
const copyBtn: CSSProperties = {
  position: 'absolute',
  top: '7px',
  right: '7px',
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  padding: '4px 5px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const pre: CSSProperties = {
  margin: 0,
  background: 'var(--code)',
  border: '1px solid var(--border)',
  padding: '11px 12px',
  paddingRight: '44px',
  overflowX: 'auto',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12.5px',
  lineHeight: 1.65,
  color: 'var(--code-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
const prompt: CSSProperties = { color: 'var(--acc)', userSelect: 'none' };
const tagsRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  flexWrap: 'wrap',
};
const tagBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--faint)',
  fontSize: '11px',
  fontFamily: "'IBM Plex Mono', monospace",
  padding: 0,
};
const emptyWrap: CSSProperties = { textAlign: 'center', padding: '80px 20px' };
const emptyMono: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: 'var(--faint)',
};
const emptySub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

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

interface ToolGroup {
  name: string;
  count: number;
  color: string;
  commands: Command[];
}
interface CatGroup {
  key: string;
  label: string;
  color: string;
  count: number;
  tools: ToolGroup[];
}

export function Library() {
  const {
    values,
    activeCat,
    activeTool,
    activeTag,
    query,
    setActiveTag,
    clearFilters,
  } = useStore();

  // Names considered "defined": the standard variables plus any value key.
  const definedNames = useMemo(
    () => new Set<string>([...STANDARD_VARS.map((v) => v.name), ...Object.keys(values)]),
    [values],
  );

  const filtered = useMemo<Command[]>(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    return COMMANDS.filter((c) => {
      if (activeCat && c.category !== activeCat) return false;
      if (activeTool && c.tool !== activeTool) return false;
      if (activeTag && !c.tags.includes(activeTag)) return false;
      if (tokens.length) {
        const catLabel = catByKey.get(c.category)?.label ?? c.category;
        const hay = fold(
          [c.title, c.template, c.desc, c.tool, c.tags.join(' '), catLabel].join(' '),
        );
        // Tokenized AND: every token must appear in the haystack.
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [activeCat, activeTool, activeTag, query]);

  // Group by category (seed order), then by tool (first-seen order).
  const groups = useMemo<CatGroup[]>(() => {
    const out: CatGroup[] = [];
    for (const cat of CATEGORIES) {
      const inCat = filtered.filter((c) => c.category === cat.key);
      if (!inCat.length) continue;
      const tools: ToolGroup[] = [];
      for (const name of catToolOrder.get(cat.key) ?? []) {
        const cs = inCat.filter((c) => c.tool === name);
        if (cs.length) {
          tools.push({ name, count: cs.length, color: cat.color, commands: cs });
        }
      }
      out.push({ key: cat.key, label: cat.label, color: cat.color, count: inCat.length, tools });
    }
    return out;
  }, [filtered]);

  const scopeLabel = activeCat
    ? (catByKey.get(activeCat)?.label ?? activeCat) + (activeTool ? ' › ' + activeTool : '')
    : activeTag
      ? '#' + activeTag
      : '';

  const copy = (template: string) => {
    try {
      void navigator.clipboard.writeText(resolve(template, values));
    } catch {
      /* clipboard unavailable — no-op in M0 */
    }
  };

  const toggleTag = (t: string) => setActiveTag(activeTag === t ? null : t);

  return (
    <div style={page}>
      <div style={headRow}>
        <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{filtered.length}</span>{' '}
          commande(s)
        </div>
        {scopeLabel && (
          <div style={{ fontSize: '12.5px', color: 'var(--faint)' }}>{scopeLabel}</div>
        )}
        <button
          onClick={clearFilters}
          style={{
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: 'var(--faint)',
            fontSize: '11.5px',
            fontFamily: 'inherit',
          }}
        >
          réinitialiser
        </button>
      </div>

      {groups.length > 0 ? (
        <div style={groupsWrap}>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={groupHead}>
                <span
                  style={{ width: '10px', height: '10px', flex: 'none', background: g.color }}
                />
                <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-.01em' }}>
                  {g.label}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--faint)',
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  {g.count}
                </span>
              </div>
              <div style={toolsWrap}>
                {g.tools.map((tl) => (
                  <div key={tl.name}>
                    <div style={toolHead}>
                      <span
                        style={{ width: '4px', height: '13px', flex: 'none', background: tl.color }}
                      />
                      <span
                        style={{
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontWeight: 600,
                          fontSize: '12.5px',
                          color: 'var(--text)',
                        }}
                      >
                        {tl.name}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--faint)',
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        {tl.count}
                      </span>
                    </div>
                    <div style={grid}>
                      {tl.commands.map((c) => {
                        const parts = toParts(c.template, values, definedNames);
                        return (
                          <div key={c.id} style={card}>
                            <div style={cardHead}>
                              <div style={cardTitle}>{c.title}</div>
                              <span
                                style={{
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  color: g.color,
                                  border: `1px solid ${g.color}`,
                                  whiteSpace: 'nowrap',
                                  flex: 'none',
                                }}
                              >
                                {c.tool}
                              </span>
                            </div>
                            {c.desc && <div style={cardDesc}>{c.desc}</div>}
                            <div style={codeWrap}>
                              <button
                                onClick={() => copy(c.template)}
                                title="Copier"
                                style={copyBtn}
                              >
                                <CopyIcon />
                              </button>
                              <pre style={pre}>
                                <span style={prompt}>$ </span>
                                {parts.map((p, i) => (
                                  <span key={i} style={partStyle(p.state)}>
                                    {p.text}
                                  </span>
                                ))}
                              </pre>
                            </div>
                            <div style={tagsRow}>
                              {c.tags.map((t) => (
                                <button key={t} onClick={() => toggleTag(t)} style={tagBtn}>
                                  #{t}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyWrap}>
          <div style={emptyMono}>// aucune commande</div>
          <div style={emptySub}>Modifie ta recherche ou réinitialise les filtres.</div>
        </div>
      )}
    </div>
  );
}
