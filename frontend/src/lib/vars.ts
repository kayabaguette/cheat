import type { Part } from '../types';

// Token grammar: $NAME where NAME is [A-Z_][A-Z0-9_]* (SPEC §3.2.7).
// An escaped literal `\$` is NOT treated as a token and renders as a plain '$'.
// The alternation matches an escaped dollar first, otherwise a $TOKEN; when the
// escaped branch matches, capture group 1 is undefined.
const TOKEN_RE = /\\\$|\$([A-Z_][A-Z0-9_]*)/g;

// Fresh stateful regex for the exec-driven loops below (each call owns its
// lastIndex). resolve() intentionally keeps using the shared global TOKEN_RE
// with String.replace, which resets lastIndex on its own.
const freshTokenRe = (): RegExp => new RegExp(TOKEN_RE.source, 'g');

// A $TOKEN name is substituted only when it is present with a non-empty value.
const hasValue = (v: string | undefined): boolean => v != null && v !== '';

// Single-pass substitution. Only names present with a non-empty value are
// substituted; unknown or empty names keep their literal $TOKEN. An escaped
// \$ collapses to a plain '$'.
export function resolve(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (match, name: string | undefined) => {
    if (name === undefined) return '$'; // escaped \$
    const val = values[name];
    return hasValue(val) ? val : match;
  });
}

// Distinct $TOKEN names referenced in a template (escaped \$ ignored), in
// first-seen order. Used to auto-detect variables that are not yet defined.
export function extractTokens(template: string): string[] {
  const re = freshTokenRe();
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1];
    if (name !== undefined && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
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
  const re = freshTokenRe();
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
      if (hasValue(val)) {
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
