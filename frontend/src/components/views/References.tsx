import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store';
import type { Reference } from '../../types';
import { fold, extractDomain } from '../../lib/format';
import { MONO, cardBase, cardHead, cardIconBtn, tagBtn, toastShell, toastDot } from '../../lib/ui';
import { CopyToProfile } from '../CopyToProfile';
import { EmptyState } from '../EmptyState';

// Références — faithful port of the prototype's refs panel (~lines 303-330):
// a responsive grid of reference cards (title link, external-open icon, an
// auto-extracted domain, optional description and tag chips). The list is
// filtered by the store's full-text query AND the active ref tag. Each href is
// sanitized at render (only http/https/mailto are clickable). Tag chips toggle
// the active ref-tag facet.

// Parse once; returns null when the URL is unparseable.
function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// Only web + mail schemes are clickable; anything else renders inert (blocks
// javascript:, data:, … that could have slipped in).
function sanitizeHref(raw: string): string | null {
  const u = parseUrl(raw);
  if (!u) return null;
  return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
}

const page: CSSProperties = { padding: '22px 26px 70px' };
const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '13px',
};
// Card gap is References-specific (8px vs Library's 9px) — spread the shared base.
const card: CSSProperties = { ...cardBase, gap: '8px' };
const titleLink: CSSProperties = {
  fontWeight: 600,
  fontSize: '14px',
  lineHeight: 1.3,
  flex: 1,
  minWidth: 0,
  color: 'var(--text)',
};
const titlePlain: CSSProperties = { ...titleLink, cursor: 'default' };
const openIcon: CSSProperties = { color: 'var(--muted)', flex: 'none', display: 'flex' };
const domainStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: '11px',
  color: 'var(--faint)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const descStyle: CSSProperties = { fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.5 };
const tagsRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '2px',
};
const tagBtnOn: CSSProperties = { ...tagBtn, color: 'var(--acc)' };
// Undo toast (Q16) — same bottom-center chrome as the store <Toast>, above it
// (zIndex 101), with an « Annuler » action that restores the deleted reference.
const undoToast: CSSProperties = { ...toastShell, zIndex: 101, gap: '12px' };
const undoBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--acc)',
  fontSize: '12.5px',
  fontWeight: 700,
  fontFamily: 'inherit',
  padding: 0,
};
// Shared open-in-new-tab contract for every anchor in a reference card.
const extLinkProps = { target: '_blank', rel: 'noopener noreferrer' } as const;

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}

export function References() {
  const { references, query, activeRefTag, setActiveRefTag, openEditRef, deleteReference, restoreReference } =
    useStore();

  // Undo affordance: the just-removed reference + its original index, kept until
  // the toast expires (~5 s) or « Annuler » restores it.
  const [undo, setUndo] = useState<{ ref: Reference; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const del = (id: string) => {
    const index = references.findIndex((r) => r.id === id);
    const removed = deleteReference(id);
    if (!removed) return;
    setUndo({ ref: removed, index });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };

  const doUndo = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (undo) restoreReference(undo.ref, undo.index);
    setUndo(null);
  };

  const filtered = useMemo<Reference[]>(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    return references.filter((r) => {
      if (activeRefTag && !r.tags.includes(activeRefTag)) return false;
      if (tokens.length) {
        const hay = fold(
          [r.title, r.url, r.desc, r.tags.join(' '), extractDomain(r.url)].join(' '),
        );
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [references, query, activeRefTag]);

  const toggleTag = (t: string) => setActiveRefTag(activeRefTag === t ? null : t);

  return (
    <>
    <div style={page}>
      <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '20px' }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{filtered.length}</span> référence(s)
      </div>

      {filtered.length > 0 ? (
        <div style={grid}>
          {filtered.map((r) => {
            const href = sanitizeHref(r.url);
            const domain = extractDomain(r.url);
            return (
              <div key={r.id} style={card}>
                <div style={cardHead}>
                  {href ? (
                    <a href={href} {...extLinkProps} style={titleLink}>
                      {r.title}
                    </a>
                  ) : (
                    <span style={titlePlain}>{r.title}</span>
                  )}
                  {href && (
                    <a
                      href={href}
                      {...extLinkProps}
                      title="Ouvrir"
                      style={openIcon}
                    >
                      <ExternalIcon />
                    </a>
                  )}
                  <button onClick={() => openEditRef(r.id)} title="Modifier" style={cardIconBtn}>
                    ✎
                  </button>
                  <button onClick={() => del(r.id)} title="Supprimer" style={cardIconBtn}>
                    ✕
                  </button>
                  <CopyToProfile kind="reference" id={r.id} />
                </div>
                {href ? (
                  <a href={href} {...extLinkProps} style={domainStyle}>
                    {domain}
                  </a>
                ) : (
                  <span style={domainStyle}>{domain}</span>
                )}
                {r.desc && <div style={descStyle}>{r.desc}</div>}
                {r.tags.length > 0 && (
                  <div style={tagsRow}>
                    {r.tags.map((t) => (
                      <button
                        key={t}
                        onClick={() => toggleTag(t)}
                        style={activeRefTag === t ? tagBtnOn : tagBtn}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          mono="// aucune référence"
          sub="Ajoute un lien utile avec le bouton « + Référence »."
        />
      )}
    </div>
    {undo && (
      <div style={undoToast}>
        <span style={toastDot} />
        Référence supprimée
        <button onClick={doUndo} style={undoBtn}>
          Annuler
        </button>
      </div>
    )}
    </>
  );
}
