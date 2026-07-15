import type { Part } from '../types';

// Token grammar: $NAME where NAME is [A-Z_][A-Z0-9_]* (SPEC §3.2.7).
// An escaped literal `\$` is NOT treated as a token and renders as a plain '$'.
// The alternation matches an escaped dollar first, otherwise a $TOKEN; when the
// escaped branch matches, capture group 1 is undefined.
const TOKEN_RE = /\\\$|\$([A-Z_][A-Z0-9_]*)/g;

// Single-pass substitution. Only names present with a non-empty value are
// substituted; unknown or empty names keep their literal $TOKEN. An escaped
// \$ collapses to a plain '$'.
export function resolve(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (match, name: string | undefined) => {
    if (name === undefined) return '$'; // escaped \$
    const val = values[name];
    return val != null && val !== '' ? val : match;
  });
}

// Splits a template into typed parts implementing the A5 three render states.
//   resolved : name is defined AND has a non-empty value  -> text = value
//   empty    : name is defined but value is empty          -> text = literal $TOKEN
//   undef    : $TOKEN is not a defined variable name       -> text = literal $TOKEN
//   plain    : ordinary text, and escaped \$ as a '$'
export function toParts(
  template: string,
  values: Record<string, string>,
  definedNames: Set<string>,
): Part[] {
  const parts: Part[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(template)) !== null) {
    if (m.index > last) {
      parts.push({ text: template.slice(last, m.index), state: 'plain' });
    }
    const name = m[1];
    if (name === undefined) {
      // escaped \$ -> literal dollar sign
      parts.push({ text: '$', state: 'plain' });
    } else if (!definedNames.has(name)) {
      parts.push({ text: m[0], state: 'undef' });
    } else {
      const val = values[name];
      if (val != null && val !== '') {
        parts.push({ text: val, state: 'resolved' });
      } else {
        parts.push({ text: m[0], state: 'empty' });
      }
    }
    last = re.lastIndex;
  }

  if (last < template.length) {
    parts.push({ text: template.slice(last), state: 'plain' });
  }
  return parts;
}
