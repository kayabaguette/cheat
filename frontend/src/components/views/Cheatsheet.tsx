import { useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { useStore } from '../../store';
import { resolve, extractTokens } from '../../lib/vars';
import { definedNames as buildDefinedNames } from '../../lib/varsets';
import { STANDARD_VARS } from '../../lib/theme';
import { dateStamp } from '../../lib/format';
import { codeWrap, tabBar, pillBase, pillOn } from '../../lib/ui';
import { CodeBlock } from '../CodeBlock';
import { EmptyState } from '../EmptyState';
import type { Command } from '../../types';

// Cheatsheet — faithful port of the prototype's cheatsheet view (~lines 332-408),
// extended for the M2 model (D1 multiple named sheets, D2 single global value
// set). A roadmap-style pill tab bar switches the active sheet; the sheet's
// title/target are editable inputs; a meta-chip strip surfaces the non-empty
// non-sensitive variables; the ordered entries (each a store command resolved on
// the LIVE global values) show index, title, a category-coloured tool badge, the
// variable-highlighted code block, the command's read-only base note, and
// ↑/↓/✕ reorder+remove controls.
//
// Toolbar exports (Q99): « Copier tout » copies the RESOLVED commands to the
// clipboard; « Markdown » downloads a .md that emits RAW $TOKENS by default with
// an opt-in « résoudre les variables » toggle; « Exporter en PDF » calls
// window.print() over the print-only <PrintRoot>. All exports are zero-egress
// (clipboard / Blob object-URL only).

// Non-sensitive meta variables surfaced as chips (PASS/LPORT excluded, matching
// the prototype's cheatsheet meta strip).
const META_KEYS = ['RHOST', 'LHOST', 'USER', 'DOMAIN'] as const;

// Bare, fence-length-safe code fence: at least ``` but always one backtick longer
// than the longest backtick run inside the code, so templates containing fences
// can never break out of the block.
function fence(code: string): string {
  const runs = code.match(/`+/g) ?? [];
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

// HTML-neutralize prose interpolated into the Markdown export so self-authored
// content (titles, descriptions, notes, tags…) cannot inject raw HTML when the
// .md is opened in a viewer that renders embedded HTML. Fenced code blocks are
// left intact (fence() already guarantees they cannot break out).
function mdEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ASCII slug of a title for the export filename (diacritics stripped, non
// alphanumerics collapsed to '-').
function slug(s: string): string {
  const out = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return out || 'cheatsheet';
}

// --- static style objects (ported from the prototype) ---------------------
const page: CSSProperties = { padding: '26px 26px 80px', display: 'flex', justifyContent: 'center' };
const column: CSSProperties = { width: '100%', maxWidth: '840px' };

const addPill: CSSProperties = {
  cursor: 'pointer',
  border: '1px dashed var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  padding: '6px 12px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '18px',
  flexWrap: 'wrap',
};
const toolbarInfo: CSSProperties = { fontSize: '12.5px', color: 'var(--muted)', flex: 1 };
const outlineBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--text)',
  padding: '7px 12px',
  fontSize: '12.5px',
  fontWeight: 600,
  fontFamily: 'inherit',
};
const pdfBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--acc-line)',
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
  padding: '7px 14px',
  fontSize: '12.5px',
  fontWeight: 700,
  fontFamily: 'inherit',
};
const resolveToggleBase: CSSProperties = {
  cursor: 'pointer',
  padding: '6px 10px',
  fontSize: '11.5px',
  fontWeight: 600,
  fontFamily: "'IBM Plex Mono', monospace",
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};
const resolveToggleOn: CSSProperties = {
  ...resolveToggleBase,
  border: '1px solid var(--acc-line)',
  background: 'var(--acc-dim)',
  color: 'var(--acc)',
};

const sheetCard: CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  overflow: 'hidden',
};
const sheetHead: CSSProperties = {
  padding: '22px 26px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface)',
};
const titleRow: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '8px' };
const titleInput: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-strong)',
  fontSize: '22px',
  fontWeight: 700,
  fontFamily: 'inherit',
  letterSpacing: '-.01em',
};
const targetInput: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--muted)',
  fontSize: '13px',
  fontFamily: 'inherit',
  marginTop: '5px',
};
const deleteSheetBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  width: '26px',
  height: '26px',
  fontSize: '13px',
  lineHeight: 1,
  fontFamily: 'inherit',
  flex: 'none',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const metaStrip: CSSProperties = { display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: '12px' };
const metaChip: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '11px',
  color: 'var(--muted)',
  background: 'var(--elev)',
  border: '1px solid var(--border2)',
  padding: '3px 8px',
};

const itemRow: CSSProperties = {
  padding: '16px 26px',
  borderTop: '1px solid var(--border)',
  display: 'flex',
  gap: '14px',
};
const itemIndex: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '12px',
  color: 'var(--faint)',
  paddingTop: '3px',
  width: '20px',
  flex: 'none',
};
const itemHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' };
const itemTitle: CSSProperties = { fontWeight: 600, fontSize: '13.5px', flex: 1, minWidth: 0 };
const ctrlBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border2)',
  background: 'transparent',
  color: 'var(--muted)',
  width: '26px',
  height: '24px',
  fontSize: '12px',
  fontFamily: 'inherit',
  padding: 0,
};
const itemDesc: CSSProperties = { fontSize: '12px', color: 'var(--muted)', marginBottom: '7px' };
const noteBlock: CSSProperties = {
  marginTop: '8px',
  fontSize: '12px',
  color: 'var(--muted)',
  borderLeft: '2px solid var(--acc-line)',
  paddingLeft: '10px',
  lineHeight: 1.45,
};

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <rect x="9" y="9" width="12" height="12" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// Tool badge coloured by the command's category (prototype `badge(c)`).
function badgeStyle(color: string): CSSProperties {
  return {
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    padding: '2px 7px',
    color,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    whiteSpace: 'nowrap',
  };
}

interface CheatsheetProps {
  // Shared export-resolution preference (lifted to <App>): governs BOTH the
  // Markdown and the PDF export so they stay raw-by-default in lockstep.
  exportResolve: boolean;
  setExportResolve: Dispatch<SetStateAction<boolean>>;
}

export function Cheatsheet({ exportResolve, setExportResolve }: CheatsheetProps) {
  const {
    values,
    commands,
    categories,
    notes,
    cheatsheets,
    activeSheet,
    setActiveSheet,
    addCheatsheet,
    renameCheatsheet,
    setCheatsheetTarget,
    deleteCheatsheet,
    removeFromSheet,
    moveInSheet,
    flash,
  } = useStore();

  // Export opt-in (`exportResolve`) resolves $TOKENS in the Markdown AND PDF
  // output (Q99/§9.6 — raw by default). Clipboard copy stays resolved regardless.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const definedNames = useMemo(() => buildDefinedNames(values), [values]);
  const cmdById = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands]);
  const catByKey = useMemo(() => new Map(categories.map((c) => [c.key, c])), [categories]);

  const sheet = cheatsheets.find((s) => s.id === activeSheet) ?? null;

  // Entries = the active sheet's ordered command ids, resolved to live commands
  // (defensive filter — the store cascade already prunes deleted ids).
  const items: Command[] = sheet
    ? sheet.commandIds
        .map((id) => cmdById.get(id))
        .filter((c): c is Command => c !== undefined)
    : [];

  const metaChips = META_KEYS.map((k) => ({ k, v: values[k] ?? '' })).filter((x) => x.v);

  // Clipboard write with real-result toast (Q53), matching the other views.
  const copyText = (text: string, onOk?: () => void) => {
    const done = () => {
      onOk?.();
      flash('Copié dans le presse-papier');
    };
    try {
      const p = navigator.clipboard?.writeText(text);
      if (p && typeof p.then === 'function') {
        p.then(done, () => flash('Échec de la copie'));
      } else {
        done();
      }
    } catch {
      flash('Échec de la copie');
    }
  };

  const copyOne = (c: Command) => {
    const done = () => {
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((cur) => (cur === c.id ? null : cur)), 1200);
      flash('Copié dans le presse-papier');
    };
    try {
      const p = navigator.clipboard?.writeText(resolve(c.template, values));
      // Success is flashed ONLY when writeText resolves; a missing clipboard API,
      // a rejected promise, or a synchronous throw all surface the failure toast
      // (no false success — matches the shared CopyButton fix).
      if (p && typeof p.then === 'function') {
        p.then(done, () => flash('Échec de la copie'));
      } else {
        flash('Échec de la copie');
      }
    } catch {
      flash('Échec de la copie');
    }
  };

  // « Copier tout » — RESOLVED commands, one per line (Q99: clipboard resolves).
  const copyAll = () => {
    if (!items.length) {
      flash('Cheatsheet vide');
      return;
    }
    copyText(items.map((c) => resolve(c.template, values)).join('\n'));
  };

  // A resolved export that would substitute a sensitive variable value (e.g.
  // $PASS) into the on-disk artifact requires explicit confirmation (SPEC §9.6).
  // Raw exports — or resolved exports with no sensitive value in play — pass through.
  const confirmSensitiveExport = (): boolean => {
    if (!exportResolve) return true;
    const sensitive = STANDARD_VARS.filter((v) => v.sensitive).map((v) => v.name);
    const used = new Set(items.flatMap((c) => extractTokens(c.template)));
    const leaks = sensitive.filter((n) => used.has(n) && (values[n] ?? '').trim() !== '');
    if (leaks.length === 0) return true;
    return window.confirm(
      'Cet export résolu inscrira des valeurs sensibles en clair sur le disque (' +
        leaks.map((n) => '$' + n).join(', ') +
        '). Continuer ?',
    );
  };

  // « Markdown » — build the document then download via a Blob object-URL anchor
  // (zero egress). RAW $TOKENS by default; resolved only when the toggle is on,
  // and the variable-value meta block is emitted ONLY in resolved mode (§9.6).
  const exportMd = () => {
    if (!sheet || !items.length) {
      flash('Cheatsheet vide');
      return;
    }
    if (!confirmSensitiveExport()) return;
    const title = sheet.title.trim() || 'Cheatsheet';
    let md = '# ' + mdEsc(title) + '\n\n';
    const meta: string[] = [];
    if (sheet.target.trim()) meta.push('Cible : ' + mdEsc(sheet.target.trim()));
    if (exportResolve) for (const mc of metaChips) meta.push(mc.k + ' : ' + mdEsc(mc.v));
    if (meta.length) md += '> ' + meta.join('  ·  ') + '\n\n';
    md += '---\n\n';
    items.forEach((c, i) => {
      const catLabel = catByKey.get(c.category)?.label ?? c.category;
      md += '## ' + (i + 1) + '. ' + mdEsc(c.title) + '\n';
      md +=
        '`' + catLabel + ' / ' + c.tool + '`' +
        (c.tags.length ? '  ·  ' + c.tags.map((t) => '#' + mdEsc(t)).join(' ') : '') +
        '\n\n';
      if (c.desc) md += mdEsc(c.desc) + '\n\n';
      const code = exportResolve ? resolve(c.template, values) : c.template;
      const f = fence(code);
      md += f + '\n' + code + '\n' + f + '\n';
      const note = notes[c.id];
      if (note && note.trim()) md += '\n> Note : ' + mdEsc(note.trim()) + '\n';
      md += '\n';
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = slug(title) + '_' + dateStamp() + '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Markdown exporté');
  };

  // « Exporter en PDF » — the print stylesheet swaps in <PrintRoot>; a short
  // deferral lets any pending render flush before the print dialog opens.
  const exportPdf = () => {
    if (!items.length) {
      flash('Cheatsheet vide');
      return;
    }
    if (!confirmSensitiveExport()) return;
    setTimeout(() => window.print(), 60);
  };

  const askDeleteSheet = () => {
    if (!sheet) return;
    if (window.confirm('Supprimer la cheatsheet « ' + (sheet.title || 'sans titre') + ' » ?')) {
      deleteCheatsheet(sheet.id);
    }
  };

  return (
    <div style={page}>
      <div style={column}>
        {/* Sheet tab bar (roadmap-pill pattern) + « + » create pill */}
        <div style={tabBar}>
          {cheatsheets.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSheet(s.id)}
              style={s.id === activeSheet ? pillOn : pillBase}
            >
              {s.title || 'Sans titre'}
            </button>
          ))}
          <button onClick={() => addCheatsheet()} title="Nouvelle cheatsheet" style={addPill}>
            +
          </button>
        </div>

        {!sheet ? (
          <EmptyState mono="// aucune cheatsheet" sub="Crée-en une avec le bouton « + » ci-dessus." />
        ) : (
          <>
            {/* Export toolbar */}
            <div style={toolbar}>
              <div style={toolbarInfo}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{items.length}</span> commande(s)
                sélectionnée(s)
              </div>
              <button
                onClick={() => setExportResolve((v) => !v)}
                title="Résoudre les variables dans les exports Markdown et PDF"
                style={exportResolve ? resolveToggleOn : resolveToggleBase}
              >
                {exportResolve ? '☑' : '☐'} résoudre les variables
              </button>
              <button onClick={copyAll} style={outlineBtn}>
                Copier tout
              </button>
              <button onClick={exportMd} style={outlineBtn}>
                Markdown
              </button>
              <button onClick={exportPdf} style={pdfBtn}>
                Exporter en PDF
              </button>
            </div>

            <div style={sheetCard}>
              {/* Editable title + target + meta chips */}
              <div style={sheetHead}>
                <div style={titleRow}>
                  <input
                    value={sheet.title}
                    onChange={(e) => renameCheatsheet(sheet.id, e.target.value)}
                    placeholder="Titre de la cheatsheet"
                    spellCheck="false"
                    autoCorrect="off"
                    autoCapitalize="off"
                    style={titleInput}
                  />
                  <button onClick={askDeleteSheet} title="Supprimer la cheatsheet" style={deleteSheetBtn}>
                    ✕
                  </button>
                </div>
                <input
                  value={sheet.target}
                  onChange={(e) => setCheatsheetTarget(sheet.id, e.target.value)}
                  placeholder="Cible / contexte (ex : HTB — Sauna)"
                  spellCheck="false"
                  autoCorrect="off"
                  autoCapitalize="off"
                  style={targetInput}
                />
                {metaChips.length > 0 && (
                  <div style={metaStrip}>
                    {metaChips.map((mc) => (
                      <span key={mc.k} style={metaChip}>
                        <span style={{ color: 'var(--acc)' }}>${mc.k}</span> {mc.v}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Ordered entries, or the « cheatsheet vide » empty state */}
              {items.length > 0 ? (
                <div>
                  {items.map((c, i) => {
                    const color = catByKey.get(c.category)?.color ?? '#8a8e99';
                    const note = notes[c.id];
                    const hasNote = !!(note && note.trim());
                    return (
                      <div key={c.id} style={itemRow}>
                        <div style={itemIndex}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={itemHead}>
                            <div style={itemTitle}>{c.title}</div>
                            <span style={badgeStyle(color)}>{c.tool}</span>
                            <button
                              onClick={() => moveInSheet(sheet.id, c.id, -1)}
                              title="Monter"
                              style={ctrlBtn}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveInSheet(sheet.id, c.id, 1)}
                              title="Descendre"
                              style={ctrlBtn}
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => removeFromSheet(sheet.id, c.id)}
                              title="Retirer"
                              style={ctrlBtn}
                            >
                              ✕
                            </button>
                          </div>
                          {c.desc && <div style={itemDesc}>{c.desc}</div>}
                          <div style={codeWrap}>
                            <button
                              onClick={() => copyOne(c)}
                              title="Copier"
                              className={copiedId === c.id ? 'copy-btn copied' : 'copy-btn'}
                            >
                              <CopyIcon />
                            </button>
                            <CodeBlock template={c.template} values={values} definedNames={definedNames} />
                          </div>
                          {hasNote && <div style={noteBlock}>{note}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  mono="// cheatsheet vide"
                  sub="Ajoute des commandes depuis la bibliothèque avec le bouton « + Cheatsheet »."
                  padding="64px 20px"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
