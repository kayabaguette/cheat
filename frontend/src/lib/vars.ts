import type { Part } from '../types';

// Token grammar: $NAME where NAME is [A-Za-z_][A-Za-z0-9_]* (SPEC §3.2.7, extended
// in 0.9.0 for snippet locals). An escaped literal `\$` is NOT treated as a token
// and renders as a plain '$'. The alternation matches an escaped dollar first,
// otherwise a $TOKEN; when the escaped branch matches, capture group 1 is undefined.
//
// TWO CLASSES, and a name must be ENTIRELY in one case to belong to either:
//   • GLOBAL  — all upper case / digits / '_', AND at least one letter ($RHOST,
//     $PASS). App-wide, edited in the sidebar.
//   • LOCAL   — all lower case / digits / '_' ($svc_ntlm). Scoped to one snippet and
//     recognised ONLY when the name is DECLARED in that snippet's locals[].
//   • anything MIXED-case is not a token at all and stays plain text.
//
// Those guards are what keep the grammar from swallowing ordinary shell text,
// because shells write `$name` constantly. Mixed case covers PowerShell's own
// variables ($PSVersionTable, $ErrorActionPreference), the declaration requirement
// covers lower case ($env:USERNAME, $file), and the at-least-one-letter rule covers
// `$_` / `$__`. All of them fall through to PLAIN TEXT in toParts, so ordinary
// command text can never be mistaken for a variable.
const TOKEN_RE = /\\\$|\$([A-Za-z_][A-Za-z0-9_]*)/g;

// Fresh stateful regex for the exec-driven loops below (each call owns its
// lastIndex). resolve() intentionally keeps using the shared global TOKEN_RE
// with String.replace, which resets lastIndex on its own.
const freshTokenRe = (): RegExp => new RegExp(TOKEN_RE.source, 'g');

// Class tests. A global name must ALSO contain at least one upper-case LETTER, so
// a name built only from '_' and digits is not a variable: that is what keeps
// PowerShell's and bash's own `$_` (and `$__`, `$_1`) out of the grammar. It used
// to satisfy the leading [A-Z_] and was therefore offered for adoption in the
// sidebar's « Détectées » strip. `$_FOO` still works — only the letter-less names
// are excluded. A name matching neither class is mixed-case: not a token.
const GLOBAL_NAME = /^[A-Z_][A-Z0-9_]*$/;
const GLOBAL_HAS_LETTER = /[A-Z]/;
const LOCAL_NAME = /^[a-z][a-z0-9_]*$/;

export const isGlobalName = (name: string): boolean =>
  GLOBAL_NAME.test(name) && GLOBAL_HAS_LETTER.test(name);
export const isLocalName = (name: string): boolean => LOCAL_NAME.test(name);
// Neither class -> the match is ordinary text and must render untouched.
const isTokenName = (name: string): boolean => isGlobalName(name) || isLocalName(name);

// A $TOKEN name is substituted only when it is present with a non-empty value.
const hasValue = (v: string | undefined): boolean => v != null && v !== '';

// Single-pass substitution. Only names present with a non-empty value are
// substituted; unknown or empty names keep their literal $TOKEN. An escaped
// \$ collapses to a plain '$'. Callers in a snippet context pass globals ∪ the
// context's local values, so an undeclared local is simply absent from `values`
// and survives untouched.
export function resolve(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (match, name: string | undefined) => {
    if (name === undefined) return '$'; // escaped \$
    if (!isTokenName(name)) return match; // mixed case -> ordinary text
    const val = values[name];
    return hasValue(val) ? val : match;
  });
}

// Distinct GLOBAL-class $TOKEN names referenced in a template (escaped \$ and
// every local-class name ignored), in first-seen order. Used to auto-detect
// variables that are not yet defined (the sidebar "Détectées" strip) and to spot
// sensitive values about to be written by a resolved export — neither of which
// must ever see a snippet-local name.
export function extractTokens(template: string): string[] {
  return distinctNames(template, isGlobalName);
}

// Distinct LOCAL-class $token names referenced in a template, in first-seen order.
// Mirror of extractTokens for the snippet editor, which offers to DECLARE a
// lowercase token that is used but not yet in the snippet's locals[].
export function extractLocalTokens(template: string): string[] {
  return distinctNames(template, isLocalName);
}

// Shared first-seen-order scan behind the two extractors above.
function distinctNames(template: string, keep: (name: string) => boolean): string[] {
  const re = freshTokenRe();
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1];
    if (name !== undefined && keep(name) && !seen.has(name)) {
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
//   plain    : ordinary text, an escaped \$ as a '$', AND any UNDECLARED
//              local-class $token (see the grammar note above)
//
// `definedNames` is the union of the global names and — in a snippet context —
// that snippet's declared locals (lib/varsets.ts builds it).
export function toParts(
  template: string,
  values: Record<string, string>,
  definedNames: Set<string>,
): Part[] {
  const parts: Part[] = [];
  const re = freshTokenRe();
  let last = 0;
  let m: RegExpExecArray | null;

  // Adjacent plain runs are COALESCED into a single part. Since 0.9.0 the regex
  // also matches lowercase tokens, which are usually plain text ($env:USERNAME);
  // merging keeps the emitted parts — hence <CodeBlock>'s spans — byte-identical
  // to the pre-0.9.0 output for every template that has no declared local.
  const pushPlain = (text: string) => {
    if (!text) return;
    const tail = parts[parts.length - 1];
    if (tail && tail.state === 'plain') tail.text += text;
    else parts.push({ text, state: 'plain' });
  };

  while ((m = re.exec(template)) !== null) {
    if (m.index > last) {
      pushPlain(template.slice(last, m.index));
    }
    const name = m[1];
    if (name === undefined) {
      // escaped \$ -> literal dollar sign
      pushPlain('$');
    } else if (!definedNames.has(name)) {
      // Mixed case, or an undeclared LOCAL, is ordinary command text
      // ($PSVersionTable, $env:USERNAME, $file…) and must render untouched. Only an
      // unknown GLOBAL keeps the pre-0.9.0 "undef" hint.
      if (isGlobalName(name)) parts.push({ text: m[0], state: 'undef' });
      else pushPlain(m[0]);
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
    pushPlain(template.slice(last));
  }
  return parts;
}
