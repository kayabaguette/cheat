import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { STANDARD_VARS } from '../lib/theme';

// Left sidebar (272px): the live Variables panel, the expandable Categories tree
// (each category unfolds to its tools, which filter the Library by tool), and the
// Tags chips. Markup/styles ported faithfully from the prototype's catTree.

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

const subBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  cursor: 'pointer',
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '4px 8px',
  fontSize: '12px',
  fontFamily: 'inherit',
  textAlign: 'left',
};
const subOn: CSSProperties = {
  ...subBase,
  color: 'var(--text-strong)',
  background: 'var(--acc-dim)',
  border: '1px solid var(--acc-line)',
};

const chevBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--faint)',
  width: '16px',
  height: '26px',
  fontSize: '10px',
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const ellipsis: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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
  // Use the `border` shorthand (not the borderColor longhand): mixing them makes
  // React leave a stale border-color when toggling back to tagBase.
  border: '1px solid var(--acc-line)',
};

const countStyle: CSSProperties = {
  fontFamily: "'IBM Plex Mono',monospace",
  fontSize: '11px',
  color: 'var(--faint)',
};
const subCountStyle: CSSProperties = {
  fontFamily: "'IBM Plex Mono',monospace",
  fontSize: '10.5px',
  color: 'var(--faint)',
};

export function Sidebar() {
  const {
    values,
    view,
    activeCat,
    activeTool,
    activeTag,
    expanded,
    commands,
    categories,
    references,
    activeRefTag,
    setView,
    setValue,
    setActiveCat,
    setActiveTool,
    setActiveTag,
    setActiveRefTag,
    toggleExpand,
  } = useStore();

  const isLibrary = view === 'library';
  const isRefs = view === 'refs';

  // Per-category counts, first-seen tool order, and per-tool counts — derived
  // live from store.commands so added/edited/deleted commands are reflected.
  const { catCount, catToolOrder, toolCount } = useMemo(() => {
    const catCount: Record<string, number> = {};
    const catToolOrder: Record<string, string[]> = {};
    const toolCount: Record<string, number> = {};
    for (const c of commands) {
      catCount[c.category] = (catCount[c.category] || 0) + 1;
      toolCount[c.category + '||' + c.tool] = (toolCount[c.category + '||' + c.tool] || 0) + 1;
      const tools = (catToolOrder[c.category] ??= []);
      if (!tools.includes(c.tool)) tools.push(c.tool);
    }
    return { catCount, catToolOrder, toolCount };
  }, [commands]);

  const tagList = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of commands) for (const t of c.tags) m[t] = (m[t] || 0) + 1;
    return Object.keys(m)
      .sort()
      .map((name) => ({ name, count: m[name] }));
  }, [commands]);

  // Distinct tags across references, with per-tag counts — the References view's
  // own Tags facet (replaces the library Categories/Tags sections).
  const refTagList = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of references) for (const t of r.tags) m[t] = (m[t] || 0) + 1;
    return Object.keys(m)
      .sort()
      .map((name) => ({ name, count: m[name] }));
  }, [references]);

  const cats = categories.filter((c) => catCount[c.key]);

  const selectAll = () => {
    setView('library');
    setActiveCat(null);
    setActiveTool(null);
  };
  const selectCat = (key: string) => {
    setView('library');
    setActiveCat(key);
    setActiveTool(null);
    // Clicking the category row toggles its tool list: expand on first click,
    // collapse on re-click (the chevron does the same).
    toggleExpand(key);
  };
  const selectTool = (key: string, tool: string) => {
    setView('library');
    setActiveCat(key);
    setActiveTool(tool);
  };
  const toggleTag = (name: string) => {
    setView('library');
    setActiveTag(activeTag === name ? null : name);
  };
  const toggleRefTag = (name: string) => {
    setActiveRefTag(activeRefTag === name ? null : name);
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

      {/* References view: a references-specific Tags facet in place of the
          library Categories/Tags sections. */}
      {isRefs && (
        <div>
          <div style={{ ...labelStyle, marginBottom: '9px' }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {refTagList.map((tg) => (
              <button
                key={tg.name}
                onClick={() => toggleRefTag(tg.name)}
                style={activeRefTag === tg.name ? tagOn : tagBase}
              >
                #{tg.name}
                <span style={{ color: 'var(--faint)', fontFamily: "'IBM Plex Mono',monospace" }}>
                  {tg.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Categories (expandable → tools) — library view only */}
      {!isRefs && (
      <div>
        <div style={{ ...labelStyle, marginBottom: '9px' }}>Catégories</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button onClick={selectAll} style={{ ...(allActive ? rowOn : rowBase), marginLeft: '18px' }}>
            <span style={{ width: '8px', height: '8px', flex: 'none', background: 'var(--muted)' }} />
            <span style={{ flex: 1, minWidth: 0 }}>Toutes les commandes</span>
            <span style={countStyle}>{commands.length}</span>
          </button>

          {cats.map((c) => {
            const catActive = isLibrary && activeCat === c.key && !activeTool;
            const isOpen = !!expanded[c.key];
            const tools = catToolOrder[c.key] ?? [];
            return (
              <div key={c.key} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <button
                    onClick={() => toggleExpand(c.key)}
                    style={chevBtn}
                    title={isOpen ? 'Replier' : 'Déplier'}
                  >
                    {isOpen ? '▾' : '▸'}
                  </button>
                  <button onClick={() => selectCat(c.key)} style={catActive ? rowOn : rowBase}>
                    <span style={{ width: '8px', height: '8px', flex: 'none', background: c.color }} />
                    <span style={ellipsis}>{c.label}</span>
                    <span style={countStyle}>{catCount[c.key]}</span>
                  </button>
                </div>
                {isOpen && (
                  <div
                    style={{
                      paddingLeft: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1px',
                      margin: '2px 0 4px',
                    }}
                  >
                    {tools.map((name) => {
                      const toolActive = isLibrary && activeCat === c.key && activeTool === name;
                      return (
                        <button
                          key={name}
                          onClick={() => selectTool(c.key, name)}
                          style={toolActive ? subOn : subBase}
                        >
                          <span
                            style={{
                              width: '3px',
                              height: '11px',
                              flex: 'none',
                              background: c.color,
                              opacity: toolActive ? 1 : 0.6,
                            }}
                          />
                          <span style={{ ...ellipsis, fontFamily: "'IBM Plex Mono',monospace" }}>{name}</span>
                          <span style={subCountStyle}>{toolCount[c.key + '||' + name]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Tags — library view only */}
      {!isRefs && (
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
      )}
    </div>
  );
}
