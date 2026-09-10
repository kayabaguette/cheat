import { describe, expect, it } from 'vitest';

import {
  extractLocalTokens,
  extractTokens,
  isGlobalName,
  isLocalName,
  resolve,
  toParts,
} from './vars';
import { commandContext, definedNames } from './varsets';
import { STANDARD_VARS } from './theme';
import { COMMANDS } from '../data/seed';
import type { Command, Part } from '../types';

// Specification test for the variable tokenizer — the single riskiest piece of
// the app, because every view renders through it and it decides what counts as a
// variable inside arbitrary shell text.
//
// This asserts INTENDED behaviour rather than diffing against a previous
// implementation, so it stays meaningful after the old code is gone. The two
// bugs it was born from are pinned explicitly below: `echo $RHOSTx` substituting
// mid-word (0.9.0) and `$_` being offered as a variable (0.9.1).
//
// v0.10.0 rewrote the local class: a $minuscule no longer has to be DECLARED to be
// recognised, so the NAME BANS (single character, reserved list, colon prefix) are
// now the only thing keeping ordinary shell text out of the grammar — and they are
// asserted here as such.

const STD = STANDARD_VARS.map((v) => v.name);

// A realistic live value set. RPORT is deliberately empty so the 'empty' render
// state is exercised.
const values: Record<string, string> = {
  RHOST: '10.10.10.5',
  RPORT: '',
  LHOST: '10.10.14.7',
  LPORT: '4444',
  USER: 'administrator',
  DOMAIN: 'corp.local',
  PASS: 'Summer2026!',
};
const globals = definedNames(values);

// Adjacent parts sharing a state render identically to one part (<CodeBlock>
// emits one <span> each), so comparisons normalise them — this compares what the
// user SEES, not the array shape.
function render(parts: Part[]): [Part['state'], string][] {
  const out: [Part['state'], string][] = [];
  for (const p of parts) {
    const tail = out[out.length - 1];
    if (tail && tail[0] === p.state) tail[1] += p.text;
    else out.push([p.state, p.text]);
  }
  return out;
}
const states = (t: string, defined = globals, vals = values) =>
  render(toParts(t, vals, defined)).filter(([s]) => s !== 'plain');
const isAllPlain = (t: string, defined = globals, vals = values) =>
  toParts(t, vals, defined).every((p) => p.state === 'plain');

describe('name classes', () => {
  it('accepts a global name: all upper case, with at least one letter', () => {
    for (const n of [...STD, 'A', 'X_2', 'MY_VAR', '_FOO', 'RHOST2']) {
      expect(isGlobalName(n), `$${n} should be global`).toBe(true);
    }
  });

  // Regression: 0.9.1. A bare '_' satisfied the leading [A-Z_] of the class, so
  // PowerShell's and bash's own $_ was collected by extractTokens and offered
  // for adoption in the sidebar's « Détectées » strip.
  it('rejects a letter-less name, so $_ is never a variable', () => {
    for (const n of ['_', '__', '___', '_1', '_99']) {
      expect(isGlobalName(n), `$${n} must not be global`).toBe(false);
      expect(isLocalName(n), `$${n} must not be local`).toBe(false);
    }
  });

  it('rejects a mixed-case name in both classes', () => {
    for (const n of ['PSVersionTable', 'ErrorActionPreference', 'RHOSTx', 'Svc', 'myVar']) {
      expect(isGlobalName(n), `$${n} must not be global`).toBe(false);
      expect(isLocalName(n), `$${n} must not be local`).toBe(false);
    }
  });

  it('accepts a local name: all lower case, leading letter', () => {
    for (const n of ['svc_ntlm', 'domain_sid', 'share', 'x2', 'a_b_c']) {
      expect(isLocalName(n), `$${n} should be local`).toBe(true);
      expect(isGlobalName(n), `$${n} must not be global`).toBe(false);
    }
  });

  it('rejects a local name starting with an underscore or a digit', () => {
    for (const n of ['_foo', '1a']) expect(isLocalName(n)).toBe(false);
  });

  // 0.10.0. A local no longer has to be DECLARED to be recognised, so the name
  // class itself is now what keeps ordinary shell text out of the grammar. These
  // two bans are what replaced the declaration requirement.
  it('rejects a single-character local, so a shell loop variable is never one', () => {
    for (const n of ['f', 'i', 'x', 'n']) {
      expect(isLocalName(n), `$${n} must not be local`).toBe(false);
      expect(isGlobalName(n), `$${n} must not be global`).toBe(false);
    }
  });

  it('rejects a reserved local name but keeps the useful ones', () => {
    for (const n of ['env', 'global', 'script', 'private', 'using', 'true', 'false', 'null']) {
      expect(isLocalName(n), `$${n} must not be local`).toBe(false);
    }
    // Deliberately NOT banned — these are exactly the names the feature is for.
    for (const n of ['file', 'path', 'share', 'hash', 'wordlist', 'spn']) {
      expect(isLocalName(n), `$${n} should be local`).toBe(true);
    }
  });
});

describe('resolve', () => {
  it('substitutes a global that has a non-empty value', () => {
    expect(resolve('nmap -sV $RHOST', values)).toBe('nmap -sV 10.10.10.5');
  });

  it('leaves a defined-but-empty global as its literal token', () => {
    expect(resolve('nmap -p $RPORT $RHOST', values)).toBe('nmap -p $RPORT 10.10.10.5');
  });

  it('leaves an unknown global as its literal token', () => {
    expect(resolve('echo $NOPE', values)).toBe('echo $NOPE');
  });

  it('collapses an escaped \\$ to a plain dollar and stops it from resolving', () => {
    expect(resolve('echo \\$RHOST', values)).toBe('echo $RHOST');
    // Real seed pattern: `$DOMAIN\$USER` — the second token is escaped.
    expect(resolve("-D '$DOMAIN\\$USER'", values)).toBe("-D 'corp.local$USER'");
  });

  // Regression: 0.9.0. Under the old grammar a token ended at the first
  // lower-case letter, so $RHOST matched inside $RHOSTx and was substituted
  // mid-word, silently yielding `10.10.10.5x`.
  it('never substitutes inside a mixed-case name', () => {
    expect(resolve('echo $RHOSTx', values)).toBe('echo $RHOSTx');
    expect(resolve('$PSVersionTable', values)).toBe('$PSVersionTable');
  });

  it('never substitutes a letter-less name', () => {
    expect(resolve('ForEach-Object { $_.Name }', { ...values, _: 'boom' })).toBe(
      'ForEach-Object { $_.Name }',
    );
  });

  // The colon is the tell for a PowerShell scope or drive prefix, and it is
  // POSITIONAL — so this holds even for a name that is otherwise perfectly valid.
  it('never substitutes a scope prefix, whatever the value map holds', () => {
    const poisoned = { ...values, env: 'boom', global: 'boom', file: 'boom' };
    expect(resolve('powershell -c "$env:USERNAME"', poisoned)).toBe(
      'powershell -c "$env:USERNAME"',
    );
    expect(resolve('$global:x = 1', poisoned)).toBe('$global:x = 1');
    expect(resolve('$file:x', poisoned)).toBe('$file:x');
    // …while the very same name resolves normally without the colon.
    expect(resolve('cat $file', poisoned)).toBe('cat boom');
  });

  it('substitutes a local when its value is supplied', () => {
    const withLocal = { ...values, svc_ntlm: 'b4b9b02e' };
    expect(resolve('/rc4:$svc_ntlm', withLocal)).toBe('/rc4:b4b9b02e');
  });
});

describe('toParts render states', () => {
  it('marks a valued global resolved, an empty one empty, an unknown one undef', () => {
    expect(states('nmap -p $RPORT $RHOST $NOPE')).toEqual([
      ['empty', '$RPORT'],
      ['resolved', '10.10.10.5'],
      ['undef', '$NOPE'],
    ]);
  });

  it('renders ordinary shell text entirely plain', () => {
    for (const t of [
      'powershell -c "$env:USERNAME"',
      'Get-ChildItem | ForEach-Object { $_.Name }',
      '$PSVersionTable.PSVersion',
      '$ErrorActionPreference = "Stop"',
      'for f in a b c; do cat "$f"; done',
      'echo $(whoami) && echo ${HOME}',
      "awk '{print $1}' /etc/passwd",
      'echo $RHOSTx',
      'mimikatz # sekurlsa::logonpasswords',
    ]) {
      expect(isAllPlain(t), `${t} should render entirely plain`).toBe(true);
      expect(resolve(t, values), `${t} should survive resolve() untouched`).toBe(t);
    }
  });

  // 0.10.0, and the deliberate consequence of dropping the declaration
  // requirement: an undeclared lower-case token IS a local now. It renders as its
  // own literal `$file` — pixel for pixel the plain text it used to be — but as
  // its OWN part, because that part is the double-click edit target.
  it('turns an undeclared lower-case token into an unvalued local', () => {
    expect(states('for f in $file; do cat "$f"; done')).toEqual([['empty', '$file']]);
    // $f stays plain (single character), and resolve() still leaves the whole line
    // alone, since the globals map holds no `file`.
    expect(resolve('for f in $file; do cat "$f"; done', values)).toBe(
      'for f in $file; do cat "$f"; done',
    );
  });

  it('coalesces adjacent plain runs into a single part', () => {
    // Three regex matches, all plain, must come back as ONE span.
    const parts = toParts('$env:A $global:B $_', values, globals);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: '$env:A $global:B $_', state: 'plain' });
  });

  // …but a local is NEVER merged into a plain run, valued or not: <CodeBlock>
  // needs one span per occurrence to hang the double-click editor on.
  it('never coalesces a local into a plain run', () => {
    expect(toParts('$env:A $share $_', values, globals)).toEqual([
      { text: '$env:A ', state: 'plain' },
      { text: '$share', state: 'empty', name: 'share', local: true },
      { text: ' $_', state: 'plain' },
    ]);
  });

  it('resolves a local from the merged map, with no declaration needed', () => {
    const tpl = '/sid:$domain_sid /rc4:$svc_ntlm /domain:$DOMAIN';
    // No values yet: each local shows its own literal token, the global resolves.
    expect(states(tpl)).toEqual([
      ['empty', '$domain_sid'],
      ['empty', '$svc_ntlm'],
      ['resolved', 'corp.local'],
    ]);

    // The caller merges the usage context's local values into `values`; NOTHING is
    // added to the defined-NAMES set, which stays global-only.
    const vals = { ...values, domain_sid: 'S-1-5-21-1004', svc_ntlm: 'b4b9b02e' };
    expect(states(tpl, globals, vals)).toEqual([
      ['resolved', 'S-1-5-21-1004'],
      ['resolved', 'b4b9b02e'],
      ['resolved', 'corp.local'],
    ]);
  });

  // A local is never "undefined": there is no declaration list for it to be
  // missing from, so it is either filled in or waiting to be. The dotted `undef`
  // hint stays reserved for a GLOBAL pointing at no definition (§5.10).
  it('marks a valueless local empty, never undef', () => {
    expect(states('/rc4:$svc_ntlm')).toEqual([['empty', '$svc_ntlm']]);
    expect(toParts('/rc4:$svc_ntlm', values, globals).some((p) => p.state === 'undef')).toBe(
      false,
    );
  });

  // The two part fields the double-click editor needs: which variable to write,
  // and whether it is writable at all. A global carries the name but not the flag.
  it('marks a local part with its name and the local flag', () => {
    const vals = { ...values, share: 'SYSVOL' };
    expect(toParts('-M spider_plus --share $share', vals, globals)).toEqual([
      { text: '-M spider_plus --share ', state: 'plain' },
      { text: 'SYSVOL', state: 'resolved', name: 'share', local: true },
    ]);
    expect(toParts('$RHOST', values, globals)).toEqual([
      { text: '10.10.10.5', state: 'resolved', name: 'RHOST' },
    ]);
  });
});

describe('extractTokens (global class only)', () => {
  it('returns distinct global names in first-seen order', () => {
    expect(extractTokens('$USER@$DOMAIN -p $PASS ($USER)')).toEqual(['USER', 'DOMAIN', 'PASS']);
  });

  it('never returns a local, a mixed-case or a letter-less name', () => {
    expect(extractTokens('$svc_ntlm $PSVersionTable $_ $__ $RHOSTx')).toEqual([]);
  });

  it('ignores an escaped token', () => {
    expect(extractTokens('echo \\$RHOST')).toEqual([]);
  });
});

describe('extractLocalTokens (local class only)', () => {
  it('returns distinct local names in first-seen order', () => {
    expect(extractLocalTokens('/sid:$domain_sid /rc4:$svc_ntlm /x:$domain_sid')).toEqual([
      'domain_sid',
      'svc_ntlm',
    ]);
  });

  it('never returns a global, a mixed-case or a letter-less name', () => {
    expect(extractLocalTokens('$RHOST $PSVersionTable $_ $_foo')).toEqual([]);
  });

  it('never returns a banned or colon-prefixed name', () => {
    expect(extractLocalTokens('$env:USERNAME $global:x $f $i $true $file:x')).toEqual([]);
  });
});

// definedNames stays GLOBAL-only: since 0.10.0 a local is recognised from its
// name class, never from a defined-name set, which is why the 0.9.0
// `definedNamesWithLocals` helper is gone.
describe('definedNames', () => {
  it('holds the built-ins and the adopted customs, and no local', () => {
    const set = definedNames({ ...values, MYVAR: 'x' });
    expect(set.has('RHOST')).toBe(true);
    expect(set.has('MYVAR')).toBe(true);
    expect(set.has('svc_ntlm')).toBe(false);
  });
});

// The usage context of a COMMAND's local values. 0.12.0 widened it from
// `category||tool` to the category alone, so the scope now matches exactly what a
// sidebar category row selects — which is what let the « Variables locales » form
// live there. Untested until now, and it is a behavioural decision, not an
// implementation detail: pin it.
describe('commandContext', () => {
  const nxc: Command = {
    id: 'a',
    category: 'adenum',
    tool: 'nxc',
    title: '',
    template: '',
    desc: '',
    tags: [],
  };

  it('depends on the category alone, so every tool of one category shares it', () => {
    const impacket: Command = { ...nxc, id: 'b', tool: 'impacket' };
    expect(commandContext(impacket)).toBe(commandContext(nxc));
  });

  it('differs between two categories, even for the same tool', () => {
    const webNxc: Command = { ...nxc, id: 'c', category: 'webapps' };
    expect(commandContext(webNxc)).not.toBe(commandContext(nxc));
  });

  // A snippet's contexts are ids of its own (snippetId / stepId /
  // sheetId:snippetId). The prefix is what keeps a command context from ever
  // colliding with one, whatever a category key happens to be — the job the old
  // '||' separator did for free.
  it('can never collide with a snippet context key', () => {
    const looksLikeASnippetId = 'sn0f8c1e2a-4b7d-4e21-9a55-7c3f1b0d9e42';
    const ctx = commandContext({ ...nxc, category: looksLikeASnippetId });
    expect(ctx).not.toBe(looksLikeASnippetId);
    expect(ctx.startsWith('cat:')).toBe(true);
  });
});

// The rule the Markdown/PDF export paths depend on. They resolve against the
// GLOBALS map, in which a local simply does not exist — that is what keeps a
// captured hash off the disk (SPEC addendum item 11 / D7). Locked here so a
// future refactor cannot quietly pass the merged map instead.
describe('export invariant: a local is never substituted by the globals map', () => {
  it('keeps $local raw while substituting $GLOBAL', () => {
    const tpl = 'kerberos::golden /sid:$domain_sid /rc4:$svc_ntlm /domain:$DOMAIN /target:$RHOST';
    const out = resolve(tpl, values); // globals only — what exportMd/PrintRoot pass
    expect(out).toContain('/sid:$domain_sid');
    expect(out).toContain('/rc4:$svc_ntlm');
    expect(out).toContain('/domain:corp.local');
    expect(out).toContain('/target:10.10.10.5');
  });

  // Same path, same guarantee, for the class of local 0.10.0 added: one living in
  // a COMMAND, scoped to its category+tool pair.
  it('keeps a command local raw while substituting the globals around it', () => {
    const tpl = 'nxc smb $RHOST -u $USER --share $share';
    expect(resolve(tpl, values)).toBe('nxc smb 10.10.10.5 -u administrator --share $share');
  });

  it('does substitute the local once its value is merged in (the clipboard path)', () => {
    const tpl = '/rc4:$svc_ntlm';
    expect(resolve(tpl, { ...values, svc_ntlm: 'b4b9b02e' })).toBe('/rc4:b4b9b02e');
  });
});

// Guards the shipped content itself: a stray or typo'd token in a seed command
// would render as an "undefined variable" hint for every new user.
describe('shipped seed content', () => {
  it('references only built-in variables', () => {
    const offenders: string[] = [];
    for (const c of COMMANDS) {
      for (const tok of extractTokens(c.template)) {
        if (!STD.includes(tok)) offenders.push(`${c.id}: $${tok}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // No longer a prohibition — a command MAY hold a local since 0.10.0 — but the
  // shipped seed deliberately has none: every seed command must render fully
  // resolved from the built-in globals alone, with nothing left to fill in by hand.
  it('contains no local token, so no seed command needs a value filled in', () => {
    const offenders: string[] = [];
    for (const c of COMMANDS) {
      for (const tok of extractLocalTokens(c.template)) offenders.push(`${c.id}: $${tok}`);
    }
    expect(offenders).toEqual([]);
  });

  it('renders every seed template without an undefined-variable hint', () => {
    const offenders: string[] = [];
    for (const c of COMMANDS) {
      const undef = toParts(c.template, values, globals).filter((p) => p.state === 'undef');
      if (undef.length) offenders.push(`${c.id}: ${undef.map((p) => p.text).join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });
});
