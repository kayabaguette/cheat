import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { cardIconBtn } from '../lib/ui';

// Small "copy to another profile" control: an icon button that opens a popover
// listing the OTHER profiles; clicking one copies the entity there with fresh
// ids (structure only for methodologies). Renders nothing when there is only one
// profile (nowhere to copy to).

const menu: CSSProperties = {
  position: 'absolute',
  top: '26px',
  right: 0,
  minWidth: '180px',
  background: 'var(--card)',
  border: '1px solid var(--border2)',
  boxShadow: '0 16px 40px rgba(0,0,0,.4)',
  zIndex: 70,
  padding: '5px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
};
const head: CSSProperties = {
  fontSize: '10.5px',
  color: 'var(--muted)',
  padding: '4px 9px 6px',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
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
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 65 };

export interface CopyToProfileProps {
  kind: 'command' | 'reference' | 'roadmap';
  id: string;
}

export function CopyToProfile({ kind, id }: CopyToProfileProps) {
  const {
    profiles,
    activeProfileId,
    copyCommandToProfile,
    copyReferenceToProfile,
    copyRoadmapToProfile,
  } = useStore();
  const [open, setOpen] = useState(false);

  const targets = profiles.filter((p) => p.id !== activeProfileId);
  if (targets.length === 0) return null;

  const copy = (targetId: string) => {
    setOpen(false);
    if (kind === 'command') void copyCommandToProfile(id, targetId);
    else if (kind === 'reference') void copyReferenceToProfile(id, targetId);
    else void copyRoadmapToProfile(id, targetId);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Copier vers un autre profil…"
        style={cardIconBtn}
      >
        ⧉
      </button>
      {open && (
        <>
          <div style={backdrop} onClick={() => setOpen(false)} />
          <div style={menu} onClick={(e) => e.stopPropagation()}>
            <div style={head}>Copier vers</div>
            {targets.map((p) => (
              <button
                key={p.id}
                onClick={() => copy(p.id)}
                style={row}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
