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

// The USAGE CONTEXT of a command's local values. Every command of a CATEGORY
// shares one set, whatever tool it belongs to: filling `$share` on an nxc command
// of Active Directory fills it on that category's impacket commands too, and on
// no other category's.
//
// 0.12.0 widened this from `category||tool` (0.10.0), which proved too narrow in
// use — a `$share`, a `$spn`, a `$wordlist` describes the target or the goal, not
// the tool that consumes it, so the value had to be retyped tool by tool. The
// trade is that two tools of one category using the same NAME for different
// things now share a value ($path as a web path for ffuf and as an SMB path for
// smbclient): name them apart.
//
// The `cat:` prefix does the job the old `||` separator did for free — it
// guarantees STRUCTURALLY that a command context can never collide with a
// technique's (techniqueId / stepId / sheetId:techniqueId), whatever a category key
// happens to be.
export function commandContext(cmd: { category: string }): string {
  return 'cat:' + cmd.category;
}
