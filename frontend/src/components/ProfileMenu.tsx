import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { Modal } from './Modal';
import { inputBase } from '../lib/ui';

// Profile switcher for the top bar: shows the active profile and a dropdown to
// switch between profiles or manage them (new / rename / delete). A profile is
// one isolated dataset (commands, methodology, references, cheatsheets). Creating
// a profile is either EMPTY or a CLONE of an existing one; cloning copies the
// whole dataset with the same ids into a fresh, isolated profile.

const trigger: CSSProperties = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  height: '34px',
  padding: '0 10px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
  maxWidth: '180px',
};
const menu: CSSProperties = {
  position: 'absolute',
  top: '40px',
  right: 0,
  minWidth: '220px',
  background: 'var(--card)',
  border: '1px solid var(--border2)',
  boxShadow: '0 16px 40px rgba(0,0,0,.4)',
  zIndex: 90,
  padding: '5px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
};
const rowBase: CSSProperties = {
  cursor: 'pointer',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  padding: '7px 9px',
  fontSize: '12.5px',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
};
const rowOn: CSSProperties = { ...rowBase, background: 'var(--border2)' };
const divider: CSSProperties = { height: '1px', background: 'var(--border)', margin: '4px 0' };
const actionRow: CSSProperties = { ...rowBase, color: 'var(--muted)', fontWeight: 600 };
const backdrop: CSSProperties = { position: 'fixed', inset: 0, zIndex: 85 };
const fieldLabel: CSSProperties = { fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' };
const radioRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12.5px',
  cursor: 'pointer',
};
const cancelBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--text)',
  padding: '8px 14px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
const submitBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--acc-line)',
  background: 'var(--acc)',
  color: 'var(--on-acc)',
  padding: '8px 16px',
  fontSize: '12.5px',
  fontWeight: 700,
  fontFamily: 'inherit',
};

export function ProfileMenu() {
  const {
    profiles,
    activeProfileId,
    switchProfile,
    createProfile,
    renameProfile,
    deleteProfile,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // New-profile form state.
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'empty' | 'clone'>('empty');
  const [cloneFrom, setCloneFrom] = useState('');

  const active = profiles.find((p) => p.id === activeProfileId);
  const isLast = profiles.length <= 1;

  const openAdd = () => {
    setOpen(false);
    setName('');
    setMode('empty');
    setCloneFrom(activeProfileId || profiles[0]?.id || '');
    setAdding(true);
  };

  const submitAdd = () => {
    if (!name.trim()) return;
    void createProfile(name, mode === 'clone' ? cloneFrom : undefined);
    // createProfile reloads the app on success; nothing more to do here.
    setAdding(false);
  };

  const doRename = () => {
    setOpen(false);
    if (!active) return;
    const next = window.prompt('Renommer le profil', active.name);
    if (next && next.trim()) void renameProfile(active.id, next);
  };

  const doDelete = () => {
    setOpen(false);
    if (!active || isLast) return;
    if (window.confirm('Supprimer le profil « ' + active.name + ' » et TOUTES ses données ?')) {
      void deleteProfile(active.id);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Profil actif — cliquer pour changer / gérer"
        style={trigger}
      >
        <span style={{ opacity: 0.6, flex: 'none' }}>▦</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active?.name ?? '—'}
        </span>
        <span style={{ opacity: 0.6, flex: 'none' }}>▾</span>
      </button>

      {open && (
        <>
          <div style={backdrop} onClick={() => setOpen(false)} />
          <div style={menu}>
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setOpen(false);
                  switchProfile(p.id);
                }}
                style={p.id === activeProfileId ? rowOn : rowBase}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {p.name}
                </span>
                {p.id === activeProfileId && <span style={{ color: 'var(--acc)' }}>✓</span>}
              </button>
            ))}
            <div style={divider} />
            <button onClick={openAdd} style={actionRow}>
              <span>＋ Nouveau profil</span>
            </button>
            <button onClick={doRename} style={actionRow}>
              <span>✎ Renommer</span>
            </button>
            <button
              onClick={doDelete}
              disabled={isLast}
              title={isLast ? 'Impossible de supprimer le dernier profil' : undefined}
              style={{ ...actionRow, opacity: isLast ? 0.4 : 1, cursor: isLast ? 'default' : 'pointer' }}
            >
              <span>🗑 Supprimer</span>
            </button>
          </div>
        </>
      )}

      {adding && (
        <Modal
          title="Nouveau profil"
          onClose={() => setAdding(false)}
          maxWidth="420px"
          footer={
            <>
              <button onClick={() => setAdding(false)} style={cancelBtn}>
                Annuler
              </button>
              <button onClick={submitAdd} style={submitBtn}>
                Créer
              </button>
            </>
          }
        >
          <div>
            <div style={fieldLabel}>Nom</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
              placeholder="ex. RT — Client X"
              spellCheck="false"
              style={inputBase}
            />
          </div>
          <div>
            <div style={fieldLabel}>Contenu de départ</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={radioRow}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'empty'}
                  onChange={() => setMode('empty')}
                />
                Vide
              </label>
              <label style={radioRow}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'clone'}
                  onChange={() => setMode('clone')}
                />
                Cloner depuis
                <select
                  value={cloneFrom}
                  onChange={(e) => {
                    setCloneFrom(e.target.value);
                    setMode('clone');
                  }}
                  style={{ ...inputBase, flex: 1, minWidth: 0 }}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
