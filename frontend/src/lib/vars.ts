import type { Part } from '../types';

// Token grammar: $NAME where NAME is [A-Za-z_][A-Za-z0-9_]* (SPEC §3.2.7, extended
// in 0.9.0 for technique locals). An escaped literal `\$` is NOT treated as a token
// and renders as a plain '$'. The alternation matches an escaped dollar first,
// otherwise a $TOKEN; when the escaped branch matches, capture group 1 is undefined.
//
// TWO CLASSES, and a name must be ENTIRELY in one case to belong to either:
//   • GLOBAL  — all upper case / digits / '_', AND at least one letter ($RHOST,
//     $PASS). App-wide, edited in the sidebar.
//   • LOCAL   — all lower case / digits / '_' ($share, $svc_ntlm). Scoped to one
//     USAGE CONTEXT (a technique, or a category+tool pair for a command) and edited
//     in place by double-clicking it inside the command.
//   • anything MIXED-case is not a token at all and stays plain text.
//
// 0.10.0 — A LOCAL NO LONGER HAS TO BE DECLARED (supersedes the 0.9.0 rule that a
// $minuscule counted only when listed in its technique's locals[]). That declaration
// was what kept ordinary shell text out of the grammar, and commands have no such
// list, so the guard is now a NAME BAN: the reserved list plus the two rules below.
// That is what lets `$share` in a command be a variable while `$env:USERNAME` and
// `for f in $file; do cat "$f"; done` keep their `$env` and `$f` as plain text.
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

// Lower-case names that are ALWAYS a shell or PowerShell construct and never a
// Cheat variable. `env` earns its place on its own (`$env:USERNAME`), the
// PowerShell scope prefixes for the same reason, and the three literals because a
// resolved `$true` would be nonsense.
//
// Deliberately SHORT. Over-banning takes exactly the names a pentester wants
// ($file, $path, $hash, $share, $spn, $wordlist) away from them, and a merely
// unusual name is harmless: an unvalued local renders as its own literal `$name`,
// pixel for pixel what plain text renders as.
const RESERVED_LOCALS = new Set([
  'env',
  'global',
  'script',
  'local',
  'private',
  'using',
  'workflow',
  'args',
  'input',
  'true',
  'false',
  'null',
]);

export const isGlobalName = (name: string): boolean =>
  GLOBAL_NAME.test(name) && GLOBAL_HAS_LETTER.test(name);

// A local name must ALSO be longer than one character and not reserved. The
// single-character rule covers the shell's own loop variables — `for f in …; do
// cat "$f"; done`, `$i`, `$x` — which nobody ever wants to fill in. Applied to
// DECLARATIONS too (store.cleanLocals, the technique editor), so no form can mint a
// name the renderer would then refuse to treat as a variable.
export const isLocalName = (name: string): boolean =>
  LOCAL_NAME.test(name) && name.length > 1 && !RESERVED_LOCALS.has(name);

// A lower-case token immediately followed by ':' is a PowerShell scope or drive
// prefix — $env:USERNAME, $global:x, $script:y, $using:v, $private:z. The colon is
// the tell, so this one syntactic rule covers all of them, present and future.
// POSITIONAL, hence not expressible in isLocalName: `end` is the index just past
// the token in `template`.
const isLocalTokenAt = (name: string, template: string, end: number): boolean =>
  isLocalName(name) && template[end] !== ':';

// Neither class -> the match is ordinary text and must render untouched.
const isTokenAt = (name: string, template: string, end: number): boolean =>
  isGlobalName(name) || isLocalTokenAt(name, template, end);

// A $TOKEN name is substituted only when it is present with a non-empty value.
const hasValue = (v: string | undefined): boolean => v != null && v !== '';

// Single-pass substitution. Only names present with a non-empty value are
// substituted; unknown or empty names keep their literal $TOKEN. An escaped
// \$ collapses to a plain '$'. Callers in a usage context pass globals ∪ that
// context's local values; a local absent from `values` survives untouched, which
// is what keeps a captured secret out of a file export (D7).
export function resolve(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN_RE, (match: string, name: string | undefined, offset: number) => {
    if (name === undefined) return '$'; // escaped \$
    // Mixed case, a banned local, or a PowerShell scope prefix -> ordinary text.
    if (!isTokenAt(name, template, offset + match.length)) return match;
    const val = values[name];
    return hasValue(val) ? val : match;
  });
}

// Distinct GLOBAL-class $TOKEN names referenced in a template (escaped \$ and
// every local-class name ignored), in first-seen order. Used to auto-detect
// variables that are not yet defined (the sidebar "Détectées" strip) and to spot
// sensitive values about to be written by a resolved export — neither of which
// must ever see a local name.
export function extractTokens(template: string): string[] {
  return distinctNames(template, (name) => isGlobalName(name));
}

// Distinct LOCAL-class $token names referenced in a template, in first-seen order.
// Mirror of extractTokens for the technique editor, which offers to DECLARE a
// lowercase token so it can carry a hint and a « produit » anchor. Since 0.10.0
// declaring is optional — the token already resolves without it.
export function extractLocalTokens(template: string): string[] {
  return distinctNames(template, (name, end) => isLocalTokenAt(name, template, end));
}

// Shared first-seen-order scan behind the two extractors above. `keep` receives
// the index just past the token so it can apply the positional colon guard.
function distinctNames(template: string, keep: (name: string, end: number) => boolean): string[] {
  const re = freshTokenRe();
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1];
    if (name !== undefined && keep(name, re.lastIndex) && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

// Splits a template into typed parts implementing the A5 render states.
//   resolved : name is defined AND has a non-empty value  -> text = value
//   empty    : name is defined but value is empty          -> text = literal $TOKEN
//   undef    : $TOKEN is not a defined GLOBAL variable     -> text = literal $TOKEN
//   plain    : ordinary text, an escaped \$ as a '$', AND any banned or
//              colon-prefixed local-class $token (see the grammar note above)
//
// `definedNames` is the set of GLOBAL names (lib/varsets.ts builds it). A LOCAL is
// not looked up in it: since 0.10.0 it needs no declaration, so it is never
// "undefined" — it is either filled in (`resolved`) or waiting to be (`empty`).
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
  // also matches lowercase tokens, and the banned ones among those are plain
  // text; merging keeps the emitted parts — hence <CodeBlock>'s spans — identical
  // to the pre-0.9.0 output for every template that has no local.
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
    } else if (isLocalTokenAt(name, template, re.lastIndex)) {
      // LOCAL class. Its value comes from the usage context's own map, which the
      // caller has merged into `values`. Always emitted as its OWN part — never
      // coalesced, even unvalued — because it is an inline EDIT TARGET: the
      // renderer needs one span per occurrence to hang the double-click on.
      const val = values[name];
      parts.push(
        hasValue(val)
          ? { text: val, state: 'resolved', name, local: true }
          : { text: m[0], state: 'empty', name, local: true },
      );
    } else if (!definedNames.has(name)) {
      // Mixed case, a banned local, or a PowerShell scope prefix is ordinary
      // command text ($PSVersionTable, $env:USERNAME, $f…) and must render
      // untouched. Only an unknown GLOBAL keeps the pre-0.9.0 "undef" hint.
      if (isGlobalName(name)) parts.push({ text: m[0], state: 'undef', name });
      else pushPlain(m[0]);
    } else {
      const val = values[name];
      if (hasValue(val)) {
        parts.push({ text: val, state: 'resolved', name });
      } else {
        parts.push({ text: m[0], state: 'empty', name });
      }
    }
    last = re.lastIndex;
  }

  if (last < template.length) {
    pushPlain(template.slice(last));
  }
  return parts;
}
