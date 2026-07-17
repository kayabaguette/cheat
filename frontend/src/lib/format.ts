// Pure, framework-free string helpers shared across the app. Every function here
// is extracted VERBATIM from a per-view / per-store implementation so search,
// URL, tag and filename-stamp behavior stays byte-for-byte identical to the
// originals. See the migration manifest for the helpers that were intentionally
// NOT unified (the export-filename slug and the two date-stamp formats differ).

// Accent-insensitive lowercasing used by the Library and References full-text
// search (NFD normalize + strip combining marks U+0300-U+036F + lowercase).
// Extracted verbatim from Library.tsx:17-19 and References.tsx:13-15 (identical).
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Prefix a bare URL with https:// and reject non web/mail schemes. Returns the
// (scheme-completed) absolute URL string, or null when it cannot be parsed / is
// not allowed. Extracted VERBATIM from store.tsx sanitizeUrl (36-47). Note: this
// returns the scheme-completed input, NOT a normalized parsed.href.
export function sanitizeUrl(raw: string): string | null {
  let url = raw;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) url = 'https://' + url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return null;
  return url;
}

// Parse once; returns null when the URL is unparseable. Internal helper backing
// extractDomain (mirrors References.tsx parseUrl 18-24).
function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

// Human-readable origin shown under a reference title (www. stripped; the address
// for mailto: links; the raw string as a last resort). Extracted VERBATIM from
// References.tsx domainOf (36-41).
export function extractDomain(url: string): string {
  const u = parseUrl(url);
  if (!u) return url;
  if (u.protocol === 'mailto:') return u.pathname;
  return u.hostname.replace(/^www\./, '') || url;
}

// Zero-pad to two digits. The shared primitive behind both export-filename
// stamps. Verbatim from DataMenu.tsx pad2 (44) / Cheatsheet.tsx's inline `p`.
export const pad2 = (n: number): string => String(n).padStart(2, '0');

// Local YYYY-MM-DD stamp for the Markdown export filename. Extracted VERBATIM
// from Cheatsheet.tsx dateStamp (62-66) — keeps its own local `p` on purpose.
export function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Local YYYYMMDD-HHMMSS stamp for the JSON dataset export filename. Extracted
// VERBATIM from DataMenu.tsx doExport (54-56). DIFFERENT format from dateStamp()
// above — the two were never a single helper, so they stay separate.
export function fileStamp(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
  );
}

// Tag slug used by the store's dropToolTag tag-matching (trim, lowercase, collapse
// non-alphanumerics to '-', strip edge dashes). Extracted VERBATIM from store.tsx
// tagSlug (57-58). IMPORTANT: this is NOT the same rule as Cheatsheet.tsx slug()
// (the export-filename slug), which additionally NFD-strips diacritics, keeps
// A-Z before lowercasing, and falls back to 'cheatsheet'. Do NOT use this for
// filenames; the Cheatsheet migration keeps its own local slug. Never change
// tag-matching behavior.
export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
