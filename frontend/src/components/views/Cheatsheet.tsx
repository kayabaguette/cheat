import type { CSSProperties } from 'react';

// Cheatsheet — placeholder panel for M0. The real composition module
// (selected commands, reorder, Markdown/PDF export) ships in a later
// milestone. For now we show a centered mono empty-state (§5.10 aesthetic).
const wrap: CSSProperties = {
  padding: '26px 26px 80px',
  display: 'flex',
  justifyContent: 'center',
};
const inner: CSSProperties = { textAlign: 'center', padding: '64px 20px' };
const mono: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: 'var(--faint)',
};
const sub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

export function Cheatsheet() {
  return (
    <div style={wrap}>
      <div style={inner}>
        <div style={mono}>// bientôt</div>
        <div style={sub}>Le module Cheatsheet arrive dans une prochaine étape.</div>
      </div>
    </div>
  );
}
