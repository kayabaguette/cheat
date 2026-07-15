import type { CSSProperties } from 'react';

// Références — placeholder panel for M0. The real reference-cards module
// (grid of external links with domain/tags, add/edit) ships in a later
// milestone. For now we show a centered mono empty-state (§5.10 aesthetic).
const wrap: CSSProperties = { padding: '22px 26px 70px' };
const inner: CSSProperties = { textAlign: 'center', padding: '80px 20px' };
const mono: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: 'var(--faint)',
};
const sub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

export function References() {
  return (
    <div style={wrap}>
      <div style={inner}>
        <div style={mono}>// bientôt</div>
        <div style={sub}>Le module Références arrive dans une prochaine étape.</div>
      </div>
    </div>
  );
}
