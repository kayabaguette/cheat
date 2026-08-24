import { STANDARD_VARS } from './theme';

// The set of variable names treated as "defined" for the A5 three render states:
// every built-in STANDARD_VARS name plus every currently-adopted custom var key.
// Reproduces VERBATIM the inline
//   new Set<string>([...STANDARD_VARS.map((v) => v.name), ...Object.keys(values)])
// built identically in Library.tsx (250-253), Cheatsheet.tsx (324-327) and
// Methodology.tsx (453-456). Sidebar.tsx builds the same contents via its STD set.
export function definedNames(values: Record<string, string>): Set<string> {
  return new Set<string>([...STANDARD_VARS.map((v) => v.name), ...Object.keys(values)]);
}

// Same set widened with a snippet's DECLARED local names, for rendering that
// snippet's step templates. Only declared locals count: an undeclared lowercase
// $token stays plain text (see lib/vars.ts). Values live in a separate
// memory-only map (never persisted, D7) and are merged by the caller.
export function definedNamesWithLocals(
  values: Record<string, string>,
  localNames: readonly string[],
): Set<string> {
  const set = definedNames(values);
  for (const n of localNames) set.add(n);
  return set;
}
