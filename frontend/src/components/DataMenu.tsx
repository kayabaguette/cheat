import { useRef } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { useStore } from '../store';
import { exportState, importState } from '../lib/api';
import type { AppState } from '../types';

// Dataset backup: export the whole AppState to a JSON file, or import one
// (full REPLACE, D4 — the backend snapshots/replaces transactionally). Two small
// top-bar buttons next to the theme toggle. Variable VALUES are never part of the
// dataset (memory-only, D7).

const btn: CSSProperties = {
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  width: '34px',
  height: '34px',
  flex: 'none',
};

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function DataMenu() {
  const { flash } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    try {
      const state = await exportState();
      const d = new Date();
      const stamp =
        `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
        `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cheat-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash('Données exportées');
    } catch {
      flash("Échec de l'export");
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      flash('Fichier JSON invalide');
      return;
    }
    // Minimal shape check before a destructive replace.
    if (!data || typeof data !== 'object' || !Array.isArray((data as AppState).commands)) {
      flash('Format de dataset invalide');
      return;
    }
    const ok = window.confirm(
      `Importer « ${file.name} » ?\n\nCela REMPLACE toutes tes données actuelles. ` +
        `Exporte d'abord si tu veux une sauvegarde. Continuer ?`,
    );
    if (!ok) return;
    try {
      await importState(data as AppState);
      // Re-hydrate from the freshly replaced dataset.
      window.location.reload();
    } catch {
      flash("Échec de l'import");
    }
  };

  return (
    <>
      <button onClick={doExport} title="Exporter les données (JSON)" style={btn}>
        <DownloadIcon />
      </button>
      <button onClick={() => fileRef.current?.click()} title="Importer un dataset (JSON)" style={btn}>
        <UploadIcon />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        style={{ display: 'none' }}
      />
    </>
  );
}
