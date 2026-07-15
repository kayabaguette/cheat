import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { STANDARD_VARS } from '../lib/theme';
import { CATEGORIES, COMMANDS } from '../data/seed';

// Left sidebar (272px): the live Variables panel, the Categories list with
// per-category command counts, and the Tags chips with counts. Filters drive the
// store (setActiveCat / setActiveTag). Markup/styles ported from the prototype.

const labelStyle: CSSProperties = {
  fontSize: '10.5px',
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--faint)',
  fontWeight: 600,
};

const rowBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  flex: 1,
  minWidth: 0,
  cursor: 'pointer',
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: '12.5px',
  fontFamily: 'inherit',
  textAlign: 'left',
};
const rowOn: CSSProperties = {
  ...rowBase,
  background: 'var(--acc-dim)',
  color: 'var(--text-strong)',
  border: '1px solid var(--acc-line)',
};

const tagBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  padding: '3px 9px',
  fontSize: '11.5px',
  fontFamily: 'inherit',
  display: 'inline-flex',
  gap: '5px',
  alignItems: 'center',
};
const tagOn: CSSProperties = {
  ...tagBase,
  background: 'var(--acc-dim)',
  color: 'var(--text-strong)',
  borderColor: 'var(--acc-line)',
};

const countStyle: CSSProperties = {
  fontFamily: "'IBM Plex Mono',monospace",
  fontSize: '11px',
  color: 'var(--faint)',
};

export function Sidebar() {
  const { values, view, activeCat, activeTag, setView, setValue, setActiveCat, setActiveTool, setActiveTag } =
    useStore();

  const isLibrary = view === 'library';

  // Per-category command counts, computed once from the seed.
  const catCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of COMMANDS) m[c.category] = (m[c.category] || 0) + 1;
    return m;
  }, []);

  // Tag counts, sorted alphabetically (matches the prototype's tagList).
  const tagList = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of COMMANDS) for (const t of c.tags) m[t] = (m[t] || 0) + 1;
    return Object.keys(m)
      .sort()
      .map((name) => ({ name, count: m[name] }));
  }, []);

  // Only categories that actually carry commands are listed (prototype filter).
  const cats = CATEGORIES.filter((c) => catCount[c.key]);

  const selectCat = (key: string) => {
    setView('library');
    setActiveCat(key);
    setActiveTool(null);
  };
  const selectAll = () => {
    setView('library');
    setActiveCat(null);
    setActiveTool(null);
  };
  const toggleTag = (name: string) => {
    setView('library');
    setActiveTag(activeTag === name ? null : name);
  };

  const allActive = isLibrary && !activeCat;

  return (
    <div
      style={{
        width: '272px',
        flex: 'none',
        borderRight: '1px solid var(--border)',
        background: 'var(--surface)',
        overflowY: 'auto',
        padding: '17px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Variables */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <span style={labelStyle}>Variables</span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', fontFamily: "'IBM Plex Mono',monospace" }}>
            live
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {STANDARD_VARS.map((v) => (
            <label key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '60px',
                  flex: 'none',
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: '11.5px',
                  color: 'var(--acc)',
                }}
              >
                ${v.name}
              </span>
              <input
                value={values[v.name] ?? ''}
                onChange={(e) => setValue(v.name, e.target.value)}
                spellCheck="false"
                autoCorrect="off"
                autoCapitalize="off"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--code)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: '11.5px',
                  padding: '5px 8px',
                }}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div>
        <div style={{ ...labelStyle, marginBottom: '9px' }}>Catégories</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button onClick={selectAll} style={allActive ? rowOn : rowBase}>
            <span style={{ width: '8px', height: '8px', flex: 'none', background: 'var(--muted)' }} />
            <span style={{ flex: 1, minWidth: 0 }}>Toutes les commandes</span>
            <span style={countStyle}>{COMMANDS.length}</span>
          </button>
          {cats.map((c) => {
            const active = isLibrary && activeCat === c.key;
            return (
              <button key={c.key} onClick={() => selectCat(c.key)} style={active ? rowOn : rowBase}>
                <span style={{ width: '8px', height: '8px', flex: 'none', background: c.color }} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                </span>
                <span style={countStyle}>{catCount[c.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div>
        <div style={{ ...labelStyle, marginBottom: '9px' }}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {tagList.map((tg) => (
            <button
              key={tg.name}
              onClick={() => toggleTag(tg.name)}
              style={activeTag === tg.name ? tagOn : tagBase}
            >
              #{tg.name}
              <span style={{ color: 'var(--faint)', fontFamily: "'IBM Plex Mono',monospace" }}>{tg.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
