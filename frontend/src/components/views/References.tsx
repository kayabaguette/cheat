import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from '../../store';
import type { Reference } from '../../types';

// Références — faithful port of the prototype's refs panel (~lines 303-330):
// a responsive grid of reference cards (title link, external-open icon, an
// auto-extracted domain, optional description and tag chips). The list is
// filtered by the store's full-text query AND the active ref tag. Each href is
// sanitized at render (only http/https/mailto are clickable). Tag chips toggle
// the active ref-tag facet.

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

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

// Human-readable origin shown under the title (www. stripped; the address for
// mailto: links; the raw string as a last resort).
function domainOf(raw: string): string {
  const u = parseUrl(raw);
  if (!u) return raw;
  if (u.protocol === 'mailto:') return u.pathname;
  return u.hostname.replace(/^www\./, '') || raw;
}

const page: CSSProperties = { padding: '22px 26px 70px' };
const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '13px',
};
const card: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  padding: 'var(--pad)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};
const cardHead: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '8px' };
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
  fontFamily: "'IBM Plex Mono', monospace",
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
const tagBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--faint)',
  fontSize: '11px',
  fontFamily: "'IBM Plex Mono', monospace",
  padding: 0,
};
const tagBtnOn: CSSProperties = { ...tagBtn, color: 'var(--acc)' };
const emptyWrap: CSSProperties = { textAlign: 'center', padding: '80px 20px' };
const emptyMono: CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '13px',
  color: 'var(--faint)',
};
const emptySub: CSSProperties = { fontSize: '13px', marginTop: '6px', color: 'var(--muted)' };

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
  const { references, query, activeRefTag, setActiveRefTag } = useStore();

  const filtered = useMemo<Reference[]>(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    return references.filter((r) => {
      if (activeRefTag && !r.tags.includes(activeRefTag)) return false;
      if (tokens.length) {
        const hay = fold(
          [r.title, r.url, r.desc, r.tags.join(' '), domainOf(r.url)].join(' '),
        );
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [references, query, activeRefTag]);

  const toggleTag = (t: string) => setActiveRefTag(activeRefTag === t ? null : t);

  return (
    <div style={page}>
      <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '20px' }}>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{filtered.length}</span> référence(s)
      </div>

      {filtered.length > 0 ? (
        <div style={grid}>
          {filtered.map((r) => {
            const href = sanitizeHref(r.url);
            const domain = domainOf(r.url);
            return (
              <div key={r.id} style={card}>
                <div style={cardHead}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" style={titleLink}>
                      {r.title}
                    </a>
                  ) : (
                    <span style={titlePlain}>{r.title}</span>
                  )}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ouvrir"
                      style={openIcon}
                    >
                      <ExternalIcon />
                    </a>
                  )}
                </div>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={domainStyle}>
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
        <div style={emptyWrap}>
          <div style={emptyMono}>// aucune référence</div>
          <div style={emptySub}>Ajoute un lien utile avec le bouton « + Référence ».</div>
        </div>
      )}
    </div>
  );
}
