import type { CSSProperties } from 'react';
import type { Part } from '../types';

// Shared inline-style objects + the render-state style map, extracted VERBATIM
// from the views/forms so the visual output stays identical. Where a style
// differs BETWEEN call sites, only the common BASE is exported and callers spread
// their own overrides (never collapsing two different value sets into one).

// Mono font stack. This is the WITH-SPACE literal used by the four view files and
// References (28 uses). NOTE: Sidebar.tsx and TopBar.tsx use a distinct NO-SPACE
// literal ("'IBM Plex Mono',monospace") -- see the manifest; those are functionally
// equal but NOT byte-identical, so do not blindly swap them for MONO.
export const MONO = "'IBM Plex Mono', monospace";

// Per-part styling for the three A5 render states (SPEC 5.10 -- the single
// authority). VERBATIM (identical) from Library/Cheatsheet/Methodology partStyle().
export function partStyle(state: Part['state']): CSSProperties {
  switch (state) {
    case 'resolved':
      return { color: 'var(--acc)', background: 'var(--acc-dim)' };
    case 'undef':
      return { color: 'var(--muted)', textDecoration: 'underline dotted' };
    case 'empty':
    default:
      return {};
  }
}

// --- command code block ----------------------------------------------------
// Relative wrapper hosting the absolutely-positioned copy button. Identical in
// Library.tsx (104) and Cheatsheet.tsx (236).
export const codeWrap: CSSProperties = { position: 'relative' };
// The leading "$ " prompt span. Identical in all three views.
export const prompt: CSSProperties = { color: 'var(--acc)', userSelect: 'none' };
// The <pre> used by Library and Cheatsheet (BYTE-IDENTICAL in both).
export const codePre: CSSProperties = {
  margin: 0,
  background: 'var(--code)',
  border: '1px solid var(--border)',
  padding: '11px 12px',
  paddingRight: '44px',
  overflowX: 'auto',
  fontFamily: MONO,
  fontSize: '12.5px',
  lineHeight: 1.65,
  color: 'var(--code-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
// Methodology.tsx stepPre (308-321): same block but padding 10px 12px, fontSize
// 12px, lineHeight 1.6. Kept SEPARATE -- three values differ from codePre.
export const codePreCompact: CSSProperties = {
  margin: 0,
  background: 'var(--code)',
  border: '1px solid var(--border)',
  padding: '10px 12px',
  paddingRight: '44px',
  overflowX: 'auto',
  fontFamily: MONO,
  fontSize: '12px',
  lineHeight: 1.6,
  color: 'var(--code-text)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// --- card shell (Library + References) -------------------------------------
// Shared card scaffold. Library card adds gap '9px'; References card adds gap
// '8px' (the ONLY difference) -- callers spread this then add their own gap.
export const cardBase: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  padding: 'var(--pad)',
  display: 'flex',
  flexDirection: 'column',
};
// cardHead / cardIconBtn / tagBtn are BYTE-IDENTICAL in Library.tsx and References.tsx.
export const cardHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '8px' };
export const cardIconBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  width: '24px',
  height: '24px',
  fontSize: '12px',
  lineHeight: 1,
  fontFamily: 'inherit',
  flex: 'none',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
export const tagBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--faint)',
  fontSize: '11px',
  fontFamily: MONO,
  padding: 0,
};

// --- empty state (all four views) ------------------------------------------
// Default padding '80px 20px' matches Library, References and Cheatsheet's tall
// variant. Methodology uses '70px 20px' and Cheatsheet's non-tall uses '64px 20px'
// -- pass a padding override (see <EmptyState/>). emptyMono/emptySub are identical
// in all four views.
export const emptyWrap: CSSProperties = { textAlign: 'center', padding: '80px 20px' };
export const emptyMono: CSSProperties = {
  fontFamily: MONO,
  fontSize: '13px',
  color: 'var(--faint)',
};
export const emptySub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

// --- pill tab bar (Cheatsheet + Methodology, IDENTICAL) --------------------
export const tabBar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '7px',
  marginBottom: '14px',
  alignItems: 'center',
};
export const pillBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  padding: '6px 12px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
export const pillOn: CSSProperties = {
  ...pillBase,
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  border: '1px solid var(--acc-line)',
};

// --- text inputs (AddCommand, AddReference, TagPicker) ----------------------
// BYTE-IDENTICAL inputBase (AddCommand 91-99) / inputBase (AddReference 54-62) /
// input (TagPicker 29-37).
export const inputBase: CSSProperties = {
  width: '100%',
  background: 'var(--code)',
  border: '1px solid var(--border2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: '13px',
  padding: '8px 10px',
};
// BYTE-IDENTICAL AddCommand monoInput (106-110) / AddReference urlInput (63-67).
export const monoInput: CSSProperties = {
  ...inputBase,
  fontFamily: MONO,
  fontSize: '12.5px',
};

// --- chip toggles (AddCommand + TagPicker, IDENTICAL) ----------------------
export const optBase: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'var(--surface)',
  color: 'var(--muted)',
  padding: '5px 10px',
  fontSize: '11.5px',
  fontFamily: 'inherit',
};
export const optOn: CSSProperties = {
  ...optBase,
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  border: '1px solid var(--acc-line)',
};

// --- sidebar section header ------------------------------------------------
// Sidebar.tsx labelStyle (uppercase tracking header). Currently Sidebar-only;
// callers spread it for size variants (e.g. the 'Detectees' 9.5px label).
export const sectionLabel: CSSProperties = {
  fontSize: '10.5px',
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--faint)',
  fontWeight: 600,
};

// --- toast chrome ----------------------------------------------------------
// Shared fixed bottom-center toast chrome. Toast.tsx uses zIndex 100 + gap '8px';
// References.tsx undoToast uses zIndex 101 + gap '12px' -- callers spread this and
// add their own zIndex + gap (the only differences).
export const toastShell: CSSProperties = {
  position: 'fixed',
  bottom: '22px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--elev)',
  border: '1px solid var(--acc-line)',
  color: 'var(--text)',
  padding: '9px 16px',
  fontSize: '12.5px',
  boxShadow: '0 8px 30px rgba(0,0,0,.35)',
  display: 'flex',
  alignItems: 'center',
};
// The small accent square. Identical in Toast.tsx (27) and References.tsx (281).
export const toastDot: CSSProperties = {
  width: '7px',
  height: '7px',
  flex: 'none',
  background: 'var(--acc)',
};

// --- progress bar (Methodology) --------------------------------------------
// Shared track. Roadmap barTrack (117) adds height '6px'; phaseBarTrack (187) adds
// width '70px' + height '5px'. The fill stays inline at the call sites:
//   { height: '100%', width: <progress.width>, background: 'var(--acc)' }
export const barTrackBase: CSSProperties = { background: 'var(--border)', overflow: 'hidden' };
