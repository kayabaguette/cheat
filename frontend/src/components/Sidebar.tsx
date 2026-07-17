import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { STANDARD_VARS } from '../lib/theme';
import { extractTokens } from '../lib/vars';
import { sectionLabel } from '../lib/ui';
import { definedNames } from '../lib/varsets';

// Names of the 6 built-in variables (value-only; not renamable/deletable).
const STD = new Set(STANDARD_VARS.map((v) => v.name));

// Mono font stack (no-space variant used throughout the sidebar). Kept local: the
// shared lib/ui MONO is the with-space literal used by the views — functionally
// equal but not byte-identical, so it is intentionally not swapped for it here.
const MONO = "'IBM Plex Mono',monospace";

// Left sidebar (272px): the live Variables panel, the expandable Categories tree
// (each category unfolds to its tools, which filter the Library by tool), and the
// Tags chips. Markup/styles ported faithfully from the prototype's catTree.

// Section header: the uppercase tracking label plus the 9px bottom gap shared by
// the Categories and Tags section headers.
const sectionHead: CSSProperties = { ...sectionLabel, marginBottom: '9px' };

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
  fontFamily: MONO,
  fontSize: '11px',
  color: 'var(--faint)',
};
const subCountStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: '10.5px',
  color: 'var(--faint)',
};

// Count tag occurrences across a collection, returning sorted { name, count }
// entries. Shared by the commands-tags and references-tags facets.
function countBy<T>(items: T[], tagsOf: (item: T) => string[]): { name: string; count: number }[] {
  const m: Record<string, number> = {};
  for (const it of items) for (const t of tagsOf(it)) m[t] = (m[t] || 0) + 1;
  return Object.keys(m)
    .sort()
    .map((name) => ({ name, count: m[name] }));
}

// A Tags facet: the section header plus a flex-wrap row of toggleable tag chips.
// Rendered for both the commands-tags (library view) and references-tags (refs
// view) facets. The caller supplies the active value and the toggle handler, so
// the handlers' differing side-effects are preserved — toggleTag also switches
// the view to the library, toggleRefTag does not.
function TagFacet({
  tags,
  active,
  onToggle,
}: {
  tags: { name: string; count: number }[];
  active: string | null;
  onToggle: (name: string) => void;
}) {
  return (
    <div>
      <div style={sectionHead}>Tags</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {tags.map((tg) => (
          <button key={tg.name} onClick={() => onToggle(tg.name)} style={active === tg.name ? tagOn : tagBase}>
            #{tg.name}
            <span style={{ color: 'var(--faint)', fontFamily: MONO }}>{tg.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

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
    adoptVar,
    deleteVar,
    renameVar,
  } = useStore();

  const isLibrary = view === 'library';
  const isRefs = view === 'refs';

  // Adopted custom variables (a value key that is not one of the 6 built-ins).
  const customVars = useMemo(() => Object.keys(values).filter((k) => !STD.has(k)), [values]);
  // Tokens used in command templates but not yet defined -> the "Détectées" strip.
  const detected = useMemo(() => {
    const known = definedNames(values);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of commands) {
      for (const tok of extractTokens(c.template)) {
        if (!known.has(tok) && !seen.has(tok)) {
          seen.add(tok);
          out.push(tok);
        }
      }
    }
    return out;
  }, [commands, values]);

  // Inline rename state for a custom variable (no modal, SPEC Q26).
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Per-category counts, tools sorted alphabetically (case-insensitive,
  // locale-aware), and per-tool counts — derived live from store.commands so
  // added/edited/deleted commands are reflected.
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
    for (const tools of Object.values(catToolOrder)) {
      tools.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    return { catCount, catToolOrder, toolCount };
  }, [commands]);

  const tagList = useMemo(() => countBy(commands, (c) => c.tags), [commands]);

  // Distinct tags across references, with per-tag counts — the References view's
  // own Tags facet (replaces the library Categories/Tags sections).
  const refTagList = useMemo(() => countBy(references, (r) => r.tags), [references]);

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
          <span style={sectionLabel}>Variables</span>
          <span style={{ fontSize: '10px', color: 'var(--faint)', fontFamily: MONO }}>
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
                  fontFamily: MONO,
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
                  fontFamily: MONO,
                  fontSize: '11.5px',
                  padding: '5px 8px',
                }}
              />
            </label>
          ))}

          {/* Adopted custom variables: value-editable + inline rename + delete. */}
          {customVars.map((name) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {renaming === name ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renameVar(name, draft) !== -1) setRenaming(null);
                    } else if (e.key === 'Escape') {
                      setRenaming(null);
                    }
                  }}
                  onBlur={() => setRenaming(null)}
                  spellCheck="false"
                  autoCorrect="off"
                  autoCapitalize="off"
                  style={{
                    width: '60px',
                    flex: 'none',
                    background: 'var(--code)',
                    border: '1px solid var(--acc-line)',
                    color: 'var(--acc)',
                    fontFamily: MONO,
                    fontSize: '11.5px',
                    padding: '4px',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(name);
                    setDraft(name);
                  }}
                  title="Renommer (répercuté dans les commandes)"
                  style={{
                    width: '60px',
                    flex: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--acc)',
                    fontFamily: MONO,
                    fontSize: '11.5px',
                    padding: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ${name}
                </button>
              )}
              <input
                value={values[name] ?? ''}
                onChange={(e) => setValue(name, e.target.value)}
                spellCheck="false"
                autoCorrect="off"
                autoCapitalize="off"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--code)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: MONO,
                  fontSize: '11.5px',
                  padding: '5px 8px',
                }}
              />
              <button
                type="button"
                onClick={() => deleteVar(name)}
                title="Supprimer la variable"
                style={{
                  flex: 'none',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--faint)',
                  fontSize: '13px',
                  lineHeight: 1,
                  padding: '2px 4px',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Auto-detected tokens not yet defined — click + to adopt as a variable. */}
        {detected.length > 0 && (
          <div style={{ marginTop: '11px' }}>
            <div style={{ ...sectionLabel, fontSize: '9.5px', marginBottom: '7px' }}>Détectées</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {detected.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => adoptVar(name)}
                  title="Ajouter cette variable"
                  style={{
                    cursor: 'pointer',
                    border: '1px dashed var(--border2)',
                    background: 'transparent',
                    color: 'var(--faint)',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontFamily: MONO,
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'center',
                  }}
                >
                  ${name}
                  <span style={{ color: 'var(--acc)', fontWeight: 700 }}>+</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* References view: a references-specific Tags facet in place of the
          library Categories/Tags sections. */}
      {isRefs && <TagFacet tags={refTagList} active={activeRefTag} onToggle={toggleRefTag} />}

      {/* Categories (expandable → tools) — library view only */}
      {!isRefs && (
      <div>
        <div style={sectionHead}>Catégories</div>
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
                          <span style={{ ...ellipsis, fontFamily: MONO }}>{name}</span>
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
      {!isRefs && <TagFacet tags={tagList} active={activeTag} onToggle={toggleTag} />}
    </div>
  );
}
