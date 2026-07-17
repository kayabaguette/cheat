import type { ThemeName, VariableDef } from '../types';

// Accent green — dresses only active states, selections, and resolved variables.
const ACCENT = '#3ddc97';

// The 7 standard (built-in) variables, paired remote/local then credentials.
// All built-in; only PASS is sensitive. RHOST replaces the former IP and RPORT
// mirrors LPORT (msfvenom/pentest convention).
export const STANDARD_VARS: VariableDef[] = [
  { name: 'RHOST', isBuiltin: true, sensitive: false },
  { name: 'RPORT', isBuiltin: true, sensitive: false },
  { name: 'LHOST', isBuiltin: true, sensitive: false },
  { name: 'LPORT', isBuiltin: true, sensitive: false },
  { name: 'USER', isBuiltin: true, sensitive: false },
  { name: 'DOMAIN', isBuiltin: true, sensitive: false },
  { name: 'PASS', isBuiltin: true, sensitive: true },
];

// Argument-independent token maps — hoisted to module scope so they are allocated
// once, not rebuilt on every themeTokens call. Only ever read (spread), never mutated.
const DARK: Record<string, string> = {
  '--bg': '#0b0c0f',
  '--surface': '#0f1015',
  '--surface2': '#14161c',
  '--card': '#15171d',
  '--elev': '#181a21',
  '--code': '#0a0b0e',
  '--code-text': '#cdd2da',
  '--border': '#1e2029',
  '--border2': '#262932',
  '--text': '#e8e9ed',
  '--text-strong': '#f2f3f5',
  '--muted': '#8a8e99',
  '--faint': '#565a66',
};
const LIGHT: Record<string, string> = {
  '--bg': '#eceef2',
  '--surface': '#ffffff',
  '--surface2': '#f1f2f6',
  '--card': '#ffffff',
  '--elev': '#ffffff',
  '--code': '#f5f6f9',
  '--code-text': '#1e2530',
  '--border': '#e2e4ea',
  '--border2': '#d2d5de',
  '--text': '#1a1d24',
  '--text-strong': '#0b0d11',
  '--muted': '#5b6270',
  '--faint': '#8b909c',
};

// Reproduces the prototype's renderVals() token maps and accent derivations verbatim.
// Returns the CSS custom properties that the root element applies to drive the theme.
export function themeTokens(theme: ThemeName): Record<string, string> {
  const isLight = theme === 'light';
  const tok = isLight ? LIGHT : DARK;
  // In light mode the accent is darkened so it stays legible on white surfaces.
  const accVis = isLight ? `color-mix(in srgb, ${ACCENT} 55%, #04140b)` : ACCENT;

  return {
    ...tok,
    '--acc': accVis,
    '--acc-dim': `color-mix(in srgb, ${accVis} ${isLight ? '13' : '15'}%, transparent)`,
    '--acc-line': `color-mix(in srgb, ${accVis} 42%, transparent)`,
    '--on-acc': isLight ? '#ffffff' : '#08110c',
    '--pad': '10px',
  };
}
