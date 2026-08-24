import { describe, expect, it } from 'vitest';

import {
  extractLocalTokens,
  extractTokens,
  isGlobalName,
  isLocalName,
  resolve,
  toParts,
} from './vars';
import { definedNames, definedNamesWithLocals } from './varsets';
import { STANDARD_VARS } from './theme';
import { COMMANDS } from '../data/seed';
import type { Part } from '../types';

// Specification test for the variable tokenizer — the single riskiest piece of
// the app, because every view renders through it and it decides what counts as a
// variable inside arbitrary shell text.
//
// This asserts INTENDED behaviour rather than diffing against a previous
// implementation, so it stays meaningful after the old code is gone. The two
// bugs it was born from are pinned explicitly below: `echo $RHOSTx` substituting
// mid-word (0.9.0) and `$_` being offered as a variable (0.9.1).

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
    for (const n of ['svc_ntlm', 'domain_sid', 'a', 'x2', 'a_b_c']) {
      expect(isLocalName(n), `$${n} should be local`).toBe(true);
      expect(isGlobalName(n), `$${n} must not be global`).toBe(false);
    }
  });

  it('rejects a local name starting with an underscore or a digit', () => {
    for (const n of ['_foo', '1a']) expect(isLocalName(n)).toBe(false);
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
      'for f in $file; do cat "$f"; done',
      'echo $(whoami) && echo ${HOME}',
      "awk '{print $1}' /etc/passwd",
      'echo $RHOSTx',
      'mimikatz # sekurlsa::logonpasswords',
    ]) {
      expect(isAllPlain(t), `${t} should render entirely plain`).toBe(true);
      expect(resolve(t, values), `${t} should survive resolve() untouched`).toBe(t);
    }
  });

  it('coalesces adjacent plain runs into a single part', () => {
    // Three regex matches, all plain, must come back as ONE span.
    const parts = toParts('$env:A $file $_', values, globals);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: '$env:A $file $_', state: 'plain' });
  });

  it('resolves a DECLARED local and leaves an undeclared one as plain text', () => {
    const tpl = '/sid:$domain_sid /rc4:$svc_ntlm /domain:$DOMAIN';
    // Undeclared: only the global resolves; the lower-case tokens are text.
    expect(states(tpl)).toEqual([['resolved', 'corp.local']]);

    const declared = definedNamesWithLocals(values, ['domain_sid', 'svc_ntlm']);
    const vals = { ...values, domain_sid: 'S-1-5-21-1004', svc_ntlm: 'b4b9b02e' };
    expect(states(tpl, declared, vals)).toEqual([
      ['resolved', 'S-1-5-21-1004'],
      ['resolved', 'b4b9b02e'],
      ['resolved', 'corp.local'],
    ]);
  });

  it('marks a declared local with no value as empty, not undef', () => {
    const declared = definedNamesWithLocals(values, ['svc_ntlm']);
    expect(states('/rc4:$svc_ntlm', declared)).toEqual([['empty', '$svc_ntlm']]);
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
});

describe('definedNamesWithLocals', () => {
  it('unions the globals with the declared locals', () => {
    const set = definedNamesWithLocals(values, ['svc_ntlm']);
    expect(set.has('RHOST')).toBe(true);
    expect(set.has('svc_ntlm')).toBe(true);
    expect(set.has('domain_sid')).toBe(false);
  });
});

// The rule the Markdown/PDF export paths depend on. They resolve against the
// GLOBALS map, in which a snippet local simply does not exist — that is what
// keeps a captured hash off the disk (SPEC addendum item 11 / D7). Locked here so
// a future refactor cannot quietly pass the merged map instead.
describe('export invariant: a local is never substituted by the globals map', () => {
  it('keeps $local raw while substituting $GLOBAL', () => {
    const tpl = 'kerberos::golden /sid:$domain_sid /rc4:$svc_ntlm /domain:$DOMAIN /target:$RHOST';
    const out = resolve(tpl, values); // globals only — what exportMd/PrintRoot pass
    expect(out).toContain('/sid:$domain_sid');
    expect(out).toContain('/rc4:$svc_ntlm');
    expect(out).toContain('/domain:corp.local');
    expect(out).toContain('/target:10.10.10.5');
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

  it('contains no snippet-local token (locals belong to snippets, not commands)', () => {
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
