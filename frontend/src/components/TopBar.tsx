import type { CSSProperties } from 'react';
import { useStore } from '../store';
import type { ViewKey } from '../types';

// Fixed 53px top bar: logo, the 4-tab segmented control, search, a contextual
// add button, and the theme toggle. Markup/styles ported verbatim from the
// prototype top bar.

const TABS: { key: ViewKey; label: string }[] = [
  { key: 'library', label: 'Bibliothèque' },
  { key: 'method', label: 'Méthodologie' },
  { key: 'refs', label: 'Références' },
  { key: 'cheatsheet', label: 'Cheatsheet' },
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

export function TopBar() {
  const { view, query, selected, setView, setQuery, toggleTheme, theme } = useStore();

  const selectedCount = selected.length;
  // Add button is contextual and shown everywhere except the cheatsheet. It is a
  // placeholder no-op in M0 (the create dialogs land in later milestones).
  const showAdd = view === 'library' || view === 'refs' || view === 'method';
  const addLabel = view === 'refs' ? 'Référence' : view === 'method' ? 'Méthodologie' : 'Commande';
  const themeIcon = theme === 'light' ? '☾' : '☀';

  return (
    <div
      style={{
        height: '53px',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <div
          style={{
            width: '27px',
            height: '27px',
            background: 'var(--acc-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '17px',
          }}
        >
          💩
        </div>
        <div style={{ fontWeight: 600, fontSize: '14.5px', letterSpacing: '-.01em' }}>Cheat</div>
      </div>

      <div
        style={{
          display: 'flex',
          background: 'var(--elev)',
          border: '1px solid var(--border2)',
          padding: '3px',
          gap: '2px',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            style={view === t.key ? segOn : segBase}
          >
            {t.label}
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

      <div style={{ position: 'relative', width: '280px' }}>
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

      {showAdd && (
        <button
          onClick={() => {
            /* M0: create dialogs are implemented in later milestones. */
          }}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
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
          <span style={{ fontSize: '15px', lineHeight: 1 }}>+</span> {addLabel}
        </button>
      )}

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
