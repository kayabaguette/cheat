import { STANDARD_VARS } from './theme';

// The set of GLOBAL variable names treated as "defined" for the A5 render states:
// every built-in STANDARD_VARS name plus every currently-adopted custom var key.
// Reproduces VERBATIM the inline
//   new Set<string>([...STANDARD_VARS.map((v) => v.name), ...Object.keys(values)])
// built identically in Library.tsx, Cheatsheet.tsx and Methodology.tsx.
// Sidebar.tsx builds the same contents via its STD set.
//
// LOCALS ARE NOT IN THIS SET. Since 0.10.0 a $minuscule needs no declaration, so
// it is never checked against a defined-name set — lib/vars.ts recognises it from
// its own name class and reads its value straight out of the merged value map.
// (The 0.9.0 `definedNamesWithLocals` helper is gone with that requirement.)
export function definedNames(values: Record<string, string>): Set<string> {
  return new Set<string>([...STANDARD_VARS.map((v) => v.name), ...Object.keys(values)]);
}

// The USAGE CONTEXT of a command's local values (0.10.0). Every command sharing a
// category AND a tool shares one set of local values, so filling `$share` on one
// nxc command fills it on every other nxc command of that category — and on none
// of impacket's. Same key shape as the sidebar's per-tool command counter
// (Sidebar.tsx), which is where the category+tool pair is already the unit.
//
// Snippets keep their own context keys (snippetId / stepId / sheetId:snippetId),
// so the two classes of context never collide: '||' cannot appear in an id.
export function commandContext(cmd: { category: string; tool: string }): string {
  return cmd.category + '||' + cmd.tool;
}
