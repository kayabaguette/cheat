import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { cardIconBtn } from '../lib/ui';

// Per-command overflow ("burger") menu: folds the command's actions — Éditer,
// Supprimer, and Cloner vers <profil> (copy to another profile with fresh ids) —
// behind a single button, so a card shows only two controls (favorite + this).
// The clone section lists the OTHER profiles; it is hidden when there is only one.

const menu: CSSProperties = {
  position: 'absolute',
  top: '26px',
  right: 0,
  minWidth: '190px',
  background: 'var(--card)',
  border: '1px solid var(--border2)',
  boxShadow: '0 16px 40px rgba(0,0,0,.4)',
  zIndex: 70,
  padding: '5px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
};
const row: CSSProperties = {
  cursor: 'pointer',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  padding: '7px 9px',
  fontSize: '12.5px',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const rowDanger: CSSProperties = { ...row, color: '#e5484d' };
const head: CSSProperties = {
  fontSize: '10.5px',
  color: 'var(--muted)',
  padding: '6px 9px 4px',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
};
const divider: CSSProperties = { height: '1px', background: 'var(--border)', margin: '4px 0' };
const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 65 };

const hover = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) =>
    (e.currentTarget.style.background = 'var(--border2)'),
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) =>
    (e.currentTarget.style.background = 'transparent'),
};

export interface CommandMenuProps {
  commandId: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function CommandMenu({ commandId, onEdit, onDelete }: CommandMenuProps) {
  const { profiles, activeProfileId, copyCommandToProfile } = useStore();
  const [open, setOpen] = useState(false);
  const targets = profiles.filter((p) => p.id !== activeProfileId);
  const close = () => setOpen(false);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Options"
        style={cardIconBtn}
      >
        ☰
      </button>
      {open && (
        <>
          <div style={backdrop} onClick={close} />
          <div style={menu} onClick={(e) => e.stopPropagation()}>
            <button
              style={row}
              {...hover}
              onClick={() => {
                close();
                onEdit();
              }}
            >
              ✎ Éditer
            </button>
            <button
              style={rowDanger}
              {...hover}
              onClick={() => {
                close();
                onDelete();
              }}
            >
              ✕ Supprimer
            </button>
            {targets.length > 0 && (
              <>
                <div style={divider} />
                <div style={head}>Cloner vers</div>
                {targets.map((p) => (
                  <button
                    key={p.id}
                    style={row}
                    {...hover}
                    onClick={() => {
                      close();
                      void copyCommandToProfile(commandId, p.id);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
