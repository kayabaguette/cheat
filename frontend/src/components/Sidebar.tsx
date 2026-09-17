import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { STANDARD_VARS } from '../lib/theme';
import { extractTokens, extractLocalTokens } from '../lib/vars';
import { sectionLabel } from '../lib/ui';
import { commandContext, definedNames } from '../lib/varsets';

// Names of the 6 built-in variables (value-only; not renamable/deletable).
const STD = new Set(STANDARD_VARS.map((v) => v.name));

// Mono font stack (no-space variant used throughout the sidebar). Kept local: the
// shared lib/ui MONO is the with-space literal used by the views — functionally
// equal but not byte-identical, so it is intentionally not swapped for it here.
const MONO = "'IBM Plex Mono',monospace";

// Left sidebar (272px): the live Variables panel, the expandable Categories tree
// (each category unfolds to its tools, which filter the Library by tool), and the
// Tags chips. Markup/styles ported faithfully from the prototype's catTree.
//
// TWO variable panels since 0.12.0. « Variables globales » is app-wide and holds
// nothing else — `customVars` derives from the globals-only `values` map and
// `extractTokens` returns the GLOBAL class only, so the « Détectées » strip cannot
// offer a lower-case name for adoption. « Variables locales » appears BELOW it
// when a category is picked, because a local's scope is exactly a category
// (0.12.0 widened it from category+tool), which is exactly what a category row
// selects. Before that widening the scope matched no single row in this menu,
// which is why locals were deliberately kept out of the sidebar in 0.10.0.

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
    favOnly,
    expanded,
    commands,
    localValues,
    categories,
    references,
    activeRefTag,
    techniques,
    activeTqCat,
    activeTqTag,
    setView,
    setValue,
    setLocalValue,
    setFavOnly,
    setActiveCat,
    setActiveTool,
    setActiveTag,
    setActiveRefTag,
    setActiveTqCat,
    setActiveTqTag,
    toggleExpand,
    adoptVar,
    deleteVar,
    renameVar,
  } = useStore();

  const isLibrary = view === 'library';
  const isRefs = view === 'refs';
  const isTechniques = view === 'techniques';

  // Adopted custom variables (a value key that is not one of the 6 built-ins).
  const customVars = useMemo(() => Object.keys(values).filter((k) => !STD.has(k)), [values]);
  // Tokens used in command templates but not yet defined -> the "Détectées" strip.
  const detected = useMemo(() => {
    const known = definedNames(values);
    const seen = new Set<string>();
    const out: string[] = [];
    const scan = (template: string) => {
      for (const tok of extractTokens(template)) {
        if (!known.has(tok) && !seen.has(tok)) {
          seen.add(tok);
          out.push(tok);
        }
      }
    };
    for (const c of commands) scan(c.template);
    // Also scan technique steps, so a global used ONLY inside a technique is still
    // detected. extractTokens returns the GLOBAL class only, so a technique-local
    // ($svc_ntlm) can never surface here and pollute the app-wide panel.
    for (const tq of techniques) for (const st of tq.steps) scan(st.template);
    return out;
  }, [commands, techniques, values]);

  // The $minuscules the ACTIVE category's commands reference — i.e. exactly the
  // contents of the « Variables locales » form. DERIVED from the templates and
  // never stored, so adding or editing a command updates the form for free.
  // Empty unless a category is picked in the Bibliothèque, which is also what
  // gates the panel.
  const catLocals = useMemo(() => {
    if (!isLibrary || !activeCat) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of commands) {
      if (c.category !== activeCat) continue;
      for (const tok of extractLocalTokens(c.template)) {
        if (seen.has(tok)) continue;
        seen.add(tok);
        out.push(tok);
      }
    }
    return out;
  }, [commands, isLibrary, activeCat]);
  // The same context key the command cards and the double-click editor write, so
  // the form and the in-command editor stay in lockstep.
  const catCtx = activeCat ? commandContext({ category: activeCat }) : '';
  const catLocalValues = localValues[catCtx] ?? {};

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

  // How many commands are starred (v0.11.0). Like every other sidebar counter
  // this is a GLOBAL total, independent of the active filters (SPEC Q50) — so
  // `commands`, never `filtered`. The « Favoris » row exists only when there is
  // at least one, so the scope can never be an empty dead end.
  const favCount = useMemo(() => commands.filter((c) => c.favorite).length, [commands]);

  // Techniques view facets: per-category counts (FLAT — a technique has no tool, so
  // there is no expandable tool tree) and its own tag list.
  const tqCatCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tq of techniques) m[tq.category] = (m[tq.category] || 0) + 1;
    return m;
  }, [techniques]);
  const tqTagList = useMemo(() => countBy(techniques, (tq) => tq.tags), [techniques]);
  const tqCats = categories.filter((c) => tqCatCount[c.key]);

  // Distinct tags across references, with per-tag counts — the References view's
  // own Tags facet (replaces the library Categories/Tags sections).
  const refTagList = useMemo(() => countBy(references, (r) => r.tags), [references]);

  const cats = categories.filter((c) => catCount[c.key]);

  // « Favoris » is a SIBLING scope of « Toutes les commandes » and of a category,
  // so picking any one of them clears the other two. Like them it deliberately
  // leaves the active tag and the search box alone (SPEC:1376), so the scopes
  // compose with those.
  const selectAll = () => {
    setView('library');
    setFavOnly(false);
    setActiveCat(null);
    setActiveTool(null);
  };
  const selectFav = () => {
    setView('library');
    setFavOnly(true);
    setActiveCat(null);
    setActiveTool(null);
  };
  const selectCat = (key: string) => {
    setView('library');
    setFavOnly(false);
    setActiveCat(key);
    setActiveTool(null);
    // Clicking the category row toggles its tool list: expand on first click,
    // collapse on re-click (the chevron does the same).
    toggleExpand(key);
  };
  const selectTool = (key: string, tool: string) => {
    setView('library');
    setFavOnly(false);
    setActiveCat(key);
    setActiveTool(tool);
  };
  const toggleTag = (name: string) => {
    setView('library');
    setActiveTag(activeTag === name ? null : name);
  };
  const selectTqAll = () => {
    setView('techniques');
    setActiveTqCat(null);
  };
  const selectTqCat = (key: string) => {
    setView('techniques');
    setActiveTqCat(activeTqCat === key ? null : key);
  };
  const toggleTqTag = (name: string) => {
    setView('techniques');
    setActiveTqTag(activeTqTag === name ? null : name);
  };
  const toggleRefTag = (name: string) => {
    setActiveRefTag(activeRefTag === name ? null : name);
  };

  const allActive = isLibrary && !activeCat && !favOnly;
  const favActive = isLibrary && favOnly;

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
          <span style={sectionLabel}>Variables globales</span>
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
                autoComplete="off"
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
                autoComplete="off"
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

      {/* Variables locales — the picked category's $minuscules (0.12.0). A local
          is scoped to a category, which is exactly what a category row selects,
          so the form shows up when one is picked and nowhere else: under
          « Toutes les commandes » or « ★ Favoris » there is no scope to edit.
          Hidden when the category references none — an empty form is only noise. */}
      {catLocals.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginBottom: '10px',
            }}
          >
            <span style={sectionLabel}>Variables locales</span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--faint)',
                fontFamily: MONO,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {categories.find((c) => c.key === activeCat)?.label ?? activeCat}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {catLocals.map((name) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* 60px with an ellipsis, so a long name reads « $wordlist_… ».
                    The native tooltip is what makes it readable on hover. */}
                <span
                  title={'$' + name}
                  style={{
                    width: '60px',
                    flex: 'none',
                    fontFamily: MONO,
                    fontSize: '11.5px',
                    color: 'var(--acc)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ${name}
                </span>
                <input
                  value={catLocalValues[name] ?? ''}
                  onChange={(e) => setLocalValue(catCtx, name, e.target.value)}
                  spellCheck="false"
                  autoCorrect="off"
                  autoCapitalize="off"
                  autoComplete="off"
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* References view: a references-specific Tags facet in place of the
          library Categories/Tags sections. */}
      {isRefs && <TagFacet tags={refTagList} active={activeRefTag} onToggle={toggleRefTag} />}

      {/* Techniques view: FLAT categories (no tool tree) + its own tag facet, in
          place of the library Categories/Tags sections. */}
      {isTechniques && (
        <div>
          <div style={sectionHead}>Catégories</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              onClick={selectTqAll}
              style={{ ...(!activeTqCat ? rowOn : rowBase), marginLeft: '18px' }}
            >
              <span style={{ width: '8px', height: '8px', flex: 'none', background: 'var(--muted)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>Toutes les techniques</span>
              <span style={countStyle}>{techniques.length}</span>
            </button>
            {tqCats.map((c) => (
              <button
                key={c.key}
                onClick={() => selectTqCat(c.key)}
                style={{
                  ...(activeTqCat === c.key ? rowOn : rowBase),
                  marginLeft: '18px',
                }}
              >
                <span style={{ width: '8px', height: '8px', flex: 'none', background: c.color }} />
                <span style={ellipsis}>{c.label}</span>
                <span style={countStyle}>{tqCatCount[c.key]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {isTechniques && (
        <TagFacet tags={tqTagList} active={activeTqTag} onToggle={toggleTqTag} />
      )}

      {/* Categories (expandable → tools) — library view only */}
      {!isRefs && !isTechniques && (
      <div>
        <div style={sectionHead}>Catégories</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* « Favoris » — a pseudo-category, shown only once something is starred.
              Same recipe as the rows below (the marginLeft:'18px' re-aligns the
              swatch with the category rows, which are preceded by a 16px chevron
              plus a 2px gap), with the accent swatch and the ★ tying it to the
              star button on the cards. */}
          {favCount > 0 && (
            <button onClick={selectFav} style={{ ...(favActive ? rowOn : rowBase), marginLeft: '18px' }}>
              <span style={{ width: '8px', height: '8px', flex: 'none', background: 'var(--acc)' }} />
              <span style={{ flex: 1, minWidth: 0 }}>★ Favoris</span>
              <span style={countStyle}>{favCount}</span>
            </button>
          )}
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
      {!isRefs && !isTechniques && (
        <TagFacet tags={tagList} active={activeTag} onToggle={toggleTag} />
      )}
    </div>
  );
}
