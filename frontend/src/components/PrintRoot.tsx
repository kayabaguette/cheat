import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { resolve } from '../lib/vars';
import type { Command } from '../types';

// PrintRoot — the print-only rendering of the ACTIVE cheatsheet. It is hidden on
// screen and revealed only under `@media print` (the `.printroot` rules in
// index.css toggle `.app` off / this block on), so « Exporter en PDF » —
// window.print() from the Cheatsheet toolbar — produces a clean, light-themed
// document. Faithful port of the prototype's `.printroot` block (~lines 391-407):
// fixed #fff/#111 colours (never the theme tokens), numbered RESOLVED entries.
// Variables resolve on the GLOBAL store.values (D2).

// Meta variables surfaced as a chip strip — the non-sensitive subset shown on
// screen too (PASS/LPORT excluded). Identical to Cheatsheet.tsx.
const META_KEYS = ['RHOST', 'LHOST', 'USER', 'DOMAIN'] as const;

const root: CSSProperties = {
  background: '#fff',
  color: '#111',
  fontFamily: "'IBM Plex Sans', sans-serif",
};
const inner: CSSProperties = { padding: '22px 26px' };
const h1: CSSProperties = { margin: 0, fontSize: '24px' };
const target: CSSProperties = { color: '#555', fontSize: '13px', marginTop: '4px' };
const metaRow: CSSProperties = {
  marginTop: '8px',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '11px',
  color: '#333',
};
const metaItem: CSSProperties = { marginRight: '14px' };
const rule: CSSProperties = { border: 'none', borderTop: '1px solid #ddd', margin: '14px 0' };
const entry: CSSProperties = { marginBottom: '16px', breakInside: 'avoid' };
const entryTitle: CSSProperties = { fontWeight: 700, fontSize: '14px' };
const entryBadge: CSSProperties = { fontWeight: 500, color: '#666', fontSize: '12px' };
const entryDesc: CSSProperties = { fontSize: '12px', color: '#444', margin: '3px 0' };
const entryPre: CSSProperties = {
  background: '#f4f4f5',
  border: '1px solid #e2e2e5',
  padding: '9px 11px',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  margin: '5px 0',
  color: '#111',
};
const entryNote: CSSProperties = {
  fontSize: '12px',
  color: '#555',
  borderLeft: '3px solid #ccc',
  paddingLeft: '8px',
};

export function PrintRoot() {
  const { values, commands, notes, categories, cheatsheets, activeSheet } = useStore();

  const sheet = cheatsheets.find((s) => s.id === activeSheet) ?? null;
  const cmdById = new Map(commands.map((c) => [c.id, c]));
  const catByKey = new Map(categories.map((c) => [c.key, c]));

  const items: Command[] = sheet
    ? sheet.commandIds
        .map((id) => cmdById.get(id))
        .filter((c): c is Command => c !== undefined)
    : [];

  const metaChips = META_KEYS.map((k) => ({ k, v: values[k] ?? '' })).filter((x) => x.v);

  return (
    <div className="printroot" style={root}>
      <div style={inner}>
        <h1 style={h1}>{sheet ? sheet.title : ''}</h1>
        {sheet && sheet.target && <div style={target}>{sheet.target}</div>}
        <div style={metaRow}>
          {metaChips.map((mc) => (
            <span key={mc.k} style={metaItem}>
              ${mc.k} = {mc.v}
            </span>
          ))}
        </div>
        <hr style={rule} />
        {items.map((c, i) => {
          const catLabel = catByKey.get(c.category)?.label ?? c.category;
          const note = notes[c.id];
          const hasNote = !!(note && note.trim());
          return (
            <div key={c.id} style={entry}>
              <div style={entryTitle}>
                {i + 1}. {c.title} <span style={entryBadge}>— {catLabel} / {c.tool}</span>
              </div>
              {c.desc && <div style={entryDesc}>{c.desc}</div>}
              <pre style={entryPre}>{resolve(c.template, values)}</pre>
              {hasNote && <div style={entryNote}>Note : {note.trim()}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
