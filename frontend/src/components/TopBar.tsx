import type { CSSProperties } from 'react';
import { useStore } from '../store';
import type { ViewKey } from '../types';
import { DataMenu } from './DataMenu';
import { ProfileMenu } from './ProfileMenu';

// Fixed 53px top bar: the sidebar fold toggle, logo, the 4-tab segmented
// control, search, a contextual add button, and the theme toggle. Markup/styles
// ported verbatim from the prototype top bar.
//
// Narrow viewports: the bar compacts instead of overflowing. The three pieces
// that give way (the "Cheat" wordmark, the search width, the add-button label)
// are driven by the .tb-brand / .tb-search / .tb-addlabel classes + media
// queries in index.css — CSS, not JS, because an inline width would win over
// any class rule.

// `short` is the abbreviated label swapped in on narrow viewports (CSS only —
// both spans are rendered, media queries decide which one shows).
const TABS: { key: ViewKey; label: string; short: string }[] = [
  { key: 'library', label: 'Bibliothèque', short: 'Biblio' },
  { key: 'method', label: 'Méthodologie', short: 'Métho' },
  { key: 'techniques', label: 'Techniques', short: 'Tech' },
  { key: 'refs', label: 'Références', short: 'Réfs' },
  { key: 'cheatsheet', label: 'Cheatsheet', short: 'Sheet' },
];

const segBase: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  padding: '5px 11px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
  background: 'transparent',
  color: 'var(--muted)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};
const segOn: CSSProperties = { ...segBase, background: 'var(--border2)', color: 'var(--text)' };

// Sidebar fold toggle (Q145) — same 34px square chrome as the theme toggle.
const foldBtn: CSSProperties = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  width: '34px',
  height: '34px',
  fontSize: '14px',
  fontFamily: 'inherit',
  flex: 'none',
};

export function TopBar() {
  const {
    view,
    query,
    cheatsheets,
    activeSheet,
    setView,
    setQuery,
    toggleTheme,
    theme,
    setAdding,
    setNewRmOpen,
    setAddingRef,
    setAddingTechnique,
    addCheatsheet,
    sidebarOpen,
    toggleSidebar,
  } = useStore();

  // Cheatsheet tab badge = entry count of the ACTIVE sheet, BOTH chapters
  // (commands + techniques), so adding a technique visibly bumps the badge.
  const activeSheetObj = cheatsheets.find((s) => s.id === activeSheet);
  const selectedCount =
    (activeSheetObj?.commandIds.length ?? 0) + (activeSheetObj?.techniqueIds?.length ?? 0);
  // The add button is contextual to the active view: library opens the add-command
  // modal, methodology the new-roadmap inline form, references the add-reference
  // modal, and cheatsheet creates a new sheet (A60).
  const addLabel =
    view === 'refs'
      ? 'Référence'
      : view === 'method'
        ? 'Méthodologie'
        : view === 'cheatsheet'
          ? 'Cheatsheet'
          : view === 'techniques'
            ? 'Technique'
            : 'Commande';
  const onAdd = () => {
    if (view === 'method') setNewRmOpen(true);
    else if (view === 'refs') setAddingRef(true);
    else if (view === 'cheatsheet') addCheatsheet();
    else if (view === 'techniques') setAddingTechnique(true);
    else setAdding(true);
  };
  const themeIcon = theme === 'light' ? '☾' : '☀';

  return (
    <div
      className="tb"
      style={{
        height: '53px',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        // gap + horizontal padding live in .tb (index.css) so they can tighten
        // on a narrow viewport.
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Replier le menu' : 'Déplier le menu'}
        aria-label={sidebarOpen ? 'Replier le menu' : 'Déplier le menu'}
        aria-expanded={sidebarOpen}
        style={foldBtn}
      >
        {sidebarOpen ? '☰' : '›'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 'none' }}>
        <div
          style={{
            width: '27px',
            height: '27px',
            flex: 'none',
            background: 'var(--acc-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '17px',
          }}
        >
          💩
        </div>
        {/* The wordmark reads « Cheatsheet », like the window title: a proctor
            glancing at the screen during an exam should not see the word
            « Cheat » standing on its own. */}
        <div
          className="tb-brand"
          style={{ fontWeight: 600, fontSize: '14.5px', letterSpacing: '-.01em' }}
        >
          Cheatsheet
        </div>
      </div>

      <div
        className="tb-tabs"
        style={{
          display: 'flex',
          background: 'var(--elev)',
          border: '1px solid var(--border2)',
          padding: '3px',
          gap: '2px',
          // NB: `flex` is set in .tb-tabs (index.css), not here — the narrow
          // breakpoint needs to make this strip shrinkable + scrollable.
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            style={view === t.key ? segOn : segBase}
          >
            <span className="tb-tab-long">{t.label}</span>
            <span className="tb-tab-short">{t.short}</span>
            {t.key === 'cheatsheet' && selectedCount > 0 && (
              <span
                style={{
                  background: 'var(--acc)',
                  color: 'var(--on-acc)',
                  minWidth: '17px',
                  height: '17px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '0 4px',
                }}
              >
                {selectedCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Width lives in .tb-search (index.css) so the media queries can shrink
          it — an inline width would override them. */}
      <div className="tb-search" style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: '11px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--faint)',
            fontSize: '13px',
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          spellCheck="false"
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            width: '100%',
            background: 'var(--surface2)',
            border: '1px solid var(--border2)',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: '13px',
            padding: '7px 10px 7px 30px',
          }}
        />
      </div>

      <button
        onClick={onAdd}
        title={'Ajouter — ' + addLabel}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flex: 'none',
          border: '1px solid var(--acc-line)',
          background: 'var(--acc)',
          color: 'var(--on-acc)',
          padding: '7px 12px',
          fontSize: '12.5px',
          fontWeight: 600,
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>+</span>
        <span className="tb-addlabel">{addLabel}</span>
      </button>

      <ProfileMenu />

      <DataMenu />

      <button
        onClick={toggleTheme}
        title="Basculer le thème"
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border2)',
          background: 'var(--surface2)',
          color: 'var(--muted)',
          width: '34px',
          height: '34px',
          fontSize: '14px',
          fontFamily: 'inherit',
          flex: 'none',
        }}
      >
        {themeIcon}
      </button>
    </div>
  );
}
