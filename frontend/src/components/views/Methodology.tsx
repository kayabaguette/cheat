import type { CSSProperties } from 'react';

// Méthodologie — placeholder panel for M0. The real roadmap/checklist module
// (drag-reorder phases, step-linked command panels, progress bars) ships in a
// later milestone. For now we show a centered mono empty-state (§5.10 aesthetic).
const wrap: CSSProperties = {
  padding: '24px 26px 80px',
  display: 'flex',
  justifyContent: 'center',
};
const inner: CSSProperties = { textAlign: 'center', padding: '70px 20px' };
const mono: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: 'var(--faint)',
};
const sub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

export function Methodology() {
  return (
    <div style={wrap}>
      <div style={inner}>
        <div style={mono}>// bientôt</div>
        <div style={sub}>Le module Méthodologie arrive dans une prochaine étape.</div>
      </div>
    </div>
  );
}
