import { describe, expect, it } from 'vitest';

import {
  allSteps,
  isStepActive,
  matchTriggers,
  parseServices,
  phaseHasActiveStep,
  progressOf,
  stepGroupKey,
  cycleStepTrigger,
  describeStepTriggers,
  isStepDone,
  modeOf,
  normalizeStepTriggers,
  stepTriggerMode,
  stepTriggers,
  substepProgress,
} from './triggers';
import type { Phase, Step, Trigger } from '../types';

// Specification test for conditional steps (v0.11.0). Two things here carry real
// risk and are therefore asserted rather than assumed:
//
//   • the PROGRESS arithmetic — an inactive step must leave the denominator, or a
//     target running 3 services out of 12 can never reach 100%, which is the
//     whole reason the feature exists;
//   • the nmap PARSER — it reads text a human pasted from a tool we do not
//     control, so every flavour it must survive is pinned as a case.
//
// The parser is also the one place that could do damage by being clever, so the
// contract "matchTriggers only ever returns ids to turn ON" is locked below: a
// bad parse can then only ever mean "it found nothing".

const TRIGGERS: Trigger[] = [
  { id: 'tg-ftp', label: 'FTP' },
  { id: 'tg-smb', label: 'SMB' },
  { id: 'tg-http', label: 'HTTP' },
  { id: 'tg-ldap', label: 'LDAP' },
];

const step = (id: string, triggerIds?: string[], triggerMode?: 'any' | 'all'): Step => ({
  id,
  text: id,
  ...(triggerIds ? { triggerIds } : {}),
  ...(triggerMode ? { triggerMode } : {}),
});
// A step carrying a checklist; the items' ids are `${id}-1`, `${id}-2`, …
const withSubs = (id: string, n: number): Step => ({
  id,
  text: id,
  substeps: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i + 1}`, text: `sub ${i + 1}` })),
});

// A realistic `nmap -sV` run, including the lines that must NOT be picked up.
const NMAP = `Starting Nmap 7.94 ( https://nmap.org ) at 2026-09-10 09:00 CEST
Nmap scan report for 10.10.10.5
Host is up (0.021s latency).
Not shown: 995 closed tcp ports (reset)
PORT     STATE         SERVICE       VERSION
21/tcp   open          ftp           vsftpd 3.0.3
22/tcp   open          ssh           OpenSSH 8.2p1 Ubuntu
445/tcp  open          microsoft-ds  Windows Server 2019
3389/tcp closed        ms-wbt-server
139/tcp  filtered      netbios-ssn
161/udp  open|filtered snmp
Service Info: OS: Unix; CPE: cpe:/o:linux:linux_kernel`;

describe('parseServices', () => {
  it('returns the open ports of a full nmap -sV run, in first-seen order', () => {
    expect(parseServices(NMAP)).toEqual([
      { port: 21, service: 'ftp' },
      { port: 22, service: 'ssh' },
      { port: 445, service: 'microsoft-ds' },
    ]);
  });

  // The three exclusions matter individually: `closed` and `filtered` are not
  // there, and `open|filtered` is nmap declining to say — treating a UDP maybe as
  // a hit would tick a trigger on a service that may not exist.
  it('ignores closed, filtered and open|filtered ports', () => {
    const services = parseServices(NMAP);
    expect(services.map((s) => s.port)).not.toContain(3389);
    expect(services.map((s) => s.port)).not.toContain(139);
    expect(services.map((s) => s.port)).not.toContain(161);
  });

  it('reads a bare port line with no version column', () => {
    expect(parseServices('21/tcp open ftp')).toEqual([{ port: 21, service: 'ftp' }]);
  });

  it('lower-cases the service and de-duplicates identical lines', () => {
    expect(parseServices('80/tcp open HTTP\n80/tcp open http')).toEqual([
      { port: 80, service: 'http' },
    ]);
  });

  it('finds nothing in text that is not an nmap run', () => {
    expect(parseServices('')).toEqual([]);
    expect(parseServices('rien à voir ici')).toEqual([]);
    // A port-looking string that is not a port line must not be mistaken for one.
    expect(parseServices('the ratio was 21/tcp open to debate')).toEqual([]);
  });
});

describe('matchTriggers', () => {
  it('matches on the port', () => {
    // 445 is SMB's port; the service name here is not the literal "smb".
    expect(matchTriggers('445/tcp open microsoft-ds', TRIGGERS)).toEqual(['tg-smb']);
  });

  it('matches on the service name', () => {
    // 139 is also SMB's, but assert the NAME path with a non-catalogued port.
    expect(matchTriggers('4445/tcp open netbios-ssn', TRIGGERS)).toEqual(['tg-smb']);
  });

  it('matches every trigger a run vouches for, and only those', () => {
    expect(matchTriggers(NMAP, TRIGGERS)).toEqual(['tg-ftp', 'tg-smb']);
  });

  it('is case- and whitespace-insensitive on the label', () => {
    const odd: Trigger[] = [{ id: 'x', label: ' smb ' }];
    expect(matchTriggers('445/tcp open microsoft-ds', odd)).toEqual(['x']);
  });

  // nmap reports a TLS-wrapped service as `ssl/http`. The port here is NOT in
  // HTTP's list and `ssl/http` is not one of its service names, so only the
  // token split can match it — which is what makes this a real guard rather
  // than one the port lookup would pass anyway.
  it('splits a ssl/-prefixed service so a TLS-wrapped one still matches', () => {
    expect(matchTriggers('9443/tcp open ssl/http', TRIGGERS)).toEqual(['tg-http']);
  });

  // Likewise 4445 is not SMB's port, so only the '?'-stripped name can match.
  it("drops the trailing '?' of an unconfirmed guess", () => {
    expect(matchTriggers('4445/tcp open microsoft-ds?', TRIGGERS)).toEqual(['tg-smb']);
  });

  // A catalogued label is matched PRECISELY — by port or by exact service name —
  // never by loose substring, or « HTTP » would tick on an `https`-only host and
  // the catalogue would be decoration. The substring fallback below exists for
  // the labels the catalogue does not know, and only for those.
  it('does not match a catalogued label by substring', () => {
    expect(matchTriggers('9999/tcp open https-only-thing', TRIGGERS)).toEqual([]);
  });

  it('falls back to the label appearing in the service name for an unknown label', () => {
    const custom: Trigger[] = [{ id: 'jk', label: 'JENKINS' }];
    expect(matchTriggers('9999/tcp open jenkins-listener', custom)).toEqual(['jk']);
  });

  // A one- or two-letter label would otherwise match half the services on the
  // host: 'microsoft-ds' contains "ds".
  it('refuses the fallback for a label shorter than three characters', () => {
    const tiny: Trigger[] = [{ id: 'ds', label: 'DS' }];
    expect(matchTriggers('445/tcp open microsoft-ds', tiny)).toEqual([]);
  });

  // THE contract: the function can express "turn this on" and nothing else, so a
  // wrong parse can never destroy a chip the user ticked by hand.
  it('only ever returns ids to turn ON, never a removal', () => {
    const ids = matchTriggers(NMAP, TRIGGERS);
    const known = TRIGGERS.map((t) => t.id);
    expect(ids.every((id) => known.includes(id))).toBe(true);
    // LDAP is nowhere in the run, so it simply is not mentioned — the caller has
    // nothing to act on for it, which is what keeps a manual tick alive.
    expect(ids).not.toContain('tg-ldap');
  });

  it('returns nothing for empty input on either side', () => {
    expect(matchTriggers('', TRIGGERS)).toEqual([]);
    expect(matchTriggers(NMAP, [])).toEqual([]);
    expect(matchTriggers(NMAP, [{ id: 'blank', label: '   ' }])).toEqual([]);
  });
});

describe('isStepActive', () => {
  it('treats a step with no trigger as always applicable', () => {
    expect(isStepActive(step('s1'), {})).toBe(true);
    expect(isStepActive({ ...step('s1'), triggerIds: [] }, {})).toBe(true);
  });

  it('activates on ANY of its triggers, not all of them', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb']);
    expect(isStepActive(s, { 'tg-smb': true })).toBe(true);
    expect(isStepActive(s, { 'tg-ftp': true, 'tg-smb': true })).toBe(true);
  });

  it('is inactive while every trigger is off, absent or explicitly false', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb']);
    expect(isStepActive(s, {})).toBe(false);
    expect(isStepActive(s, { 'tg-ftp': false })).toBe(false);
    expect(isStepActive(s, { 'tg-http': true })).toBe(false);
  });

  // v0.14.0 — the operator belongs to the STEP, so every one of its triggers
  // must be on in 'all' mode.
  it("requires every trigger in 'all' mode", () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    expect(isStepActive(s, {})).toBe(false);
    expect(isStepActive(s, { 'tg-ftp': true })).toBe(false);
    expect(isStepActive(s, { 'tg-ftp': true, 'tg-smb': true })).toBe(true);
  });

  it("treats an absent mode as 'any', which is what pre-0.14 steps meant", () => {
    const s = step('s1', ['tg-ftp', 'tg-smb']);
    expect(modeOf(s)).toBe('any');
    expect(isStepActive(s, { 'tg-ftp': true })).toBe(true);
  });

  it('is unconditional when the list is empty, whatever the mode', () => {
    expect(isStepActive(step('s1', []), {})).toBe(true);
    expect(isStepActive(step('s1', [], 'all'), {})).toBe(true);
  });
});

// The v0.13.0 two-list model lived for one release. Folding it in is what keeps
// an already-saved AND condition from silently becoming unconditional.
describe('normalizeStepTriggers', () => {
  it('folds a legacy AND list into the single list with mode all', () => {
    const legacy: Step = { id: 's1', text: 's1', allTriggerIds: ['tg-ftp', 'tg-smb'] };
    const out = normalizeStepTriggers(legacy);
    expect(out.triggerIds).toEqual(['tg-ftp', 'tg-smb']);
    expect(out.triggerMode).toBe('all');
    expect(out.allTriggerIds).toBeUndefined();
    // and the condition it expressed is preserved
    expect(isStepActive(out, { 'tg-ftp': true })).toBe(false);
    expect(isStepActive(out, { 'tg-ftp': true, 'tg-smb': true })).toBe(true);
  });

  it('merges both legacy lists without duplicating an id', () => {
    const legacy: Step = {
      id: 's1',
      text: 's1',
      triggerIds: ['tg-ftp'],
      allTriggerIds: ['tg-ftp', 'tg-smb'],
    };
    expect(normalizeStepTriggers(legacy).triggerIds).toEqual(['tg-ftp', 'tg-smb']);
  });

  it('leaves a current step alone and always drops the dead field', () => {
    const cur = step('s1', ['tg-ftp'], 'all');
    expect(normalizeStepTriggers(cur)).toEqual(cur);
    expect('allTriggerIds' in normalizeStepTriggers(step('s1'))).toBe(false);
  });
});

// v0.13.0 — the three-state chip: absent → OU → ET → absent.
describe('stepTriggerMode / cycleStepTrigger', () => {
  // A chip wears the STEP's mode, so every assigned chip reports the same one.
  it('reports the step mode for an assigned chip, off for the others', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    expect(stepTriggerMode(s, 'tg-ftp')).toBe('all');
    expect(stepTriggerMode(s, 'tg-smb')).toBe('all');
    expect(stepTriggerMode(s, 'tg-http')).toBe('off');
  });

  it('cycles off → any → all → off and comes back to the start', () => {
    let s: Step = step('s1');
    const click = () => {
      s = { ...s, ...cycleStepTrigger(s, 'tg-ftp') };
      return stepTriggerMode(s, 'tg-ftp');
    };
    expect(click()).toBe('any');
    expect(click()).toBe('all');
    expect(click()).toBe('off');
    expect(s.triggerIds).toEqual([]);
  });

  // THE known side effect, pinned so nobody "fixes" it into an unreachable
  // state: the first click sets 'any', so adding a chip to an 'all' step flips
  // the WHOLE step back to 'any'. One more click puts it back.
  it("flips the whole step back to 'any' when a chip is added to an 'all' step", () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    const added = cycleStepTrigger(s, 'tg-http');
    expect(added.triggerIds).toEqual(['tg-ftp', 'tg-smb', 'tg-http']);
    expect(added.triggerMode).toBe('any');
    // and one more click on that chip restores 'all' for every one of them
    const back = cycleStepTrigger({ ...s, ...added }, 'tg-http');
    expect(back.triggerMode).toBe('all');
    expect(back.triggerIds).toEqual(['tg-ftp', 'tg-smb', 'tg-http']);
  });

  it('flipping the mode from any chip restyles the step, not just that chip', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb']);
    const next = { ...s, ...cycleStepTrigger(s, 'tg-smb') };
    expect(stepTriggerMode(next, 'tg-ftp')).toBe('all');
    expect(stepTriggerMode(next, 'tg-smb')).toBe('all');
  });

  it('removes only the clicked chip and keeps the mode', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    const next = cycleStepTrigger(s, 'tg-smb');
    expect(next.triggerIds).toEqual(['tg-ftp']);
    expect(next.triggerMode).toBe('all');
  });
});

// v0.13.0 — a step with a checklist is done when every item is, and its own
// `checks` entry is then ignored: the row's box is derived, so the two cannot
// disagree.
describe('isStepDone / substepProgress', () => {
  it('falls back to the step\'s own box when there is no checklist', () => {
    expect(isStepDone(step('s1'), {})).toBe(false);
    expect(isStepDone(step('s1'), { s1: true })).toBe(true);
    expect(substepProgress(step('s1'), {})).toEqual({ done: 0, total: 0 });
  });

  it('is done only when every item of the checklist is ticked', () => {
    const s = withSubs('s1', 3);
    expect(isStepDone(s, { 's1-1': true, 's1-2': true })).toBe(false);
    expect(isStepDone(s, { 's1-1': true, 's1-2': true, 's1-3': true })).toBe(true);
  });

  it("ignores the step's own box once it has a checklist", () => {
    const s = withSubs('s1', 2);
    expect(isStepDone(s, { s1: true })).toBe(false);
  });

  it('counts the ticked items', () => {
    expect(substepProgress(withSubs('s1', 3), { 's1-1': true, 's1-3': true })).toEqual({
      done: 2,
      total: 3,
    });
  });
});

describe('progressOf', () => {
  const steps = [
    step('a'), // unconditional
    step('b', ['tg-ftp']),
    step('c', ['tg-http']),
    step('d', ['tg-http']),
  ];

  // The reason the feature exists: without this, a host running FTP but not HTTP
  // is stuck at 2/4 forever.
  it('leaves an inactive step out of BOTH the numerator and the denominator', () => {
    const checks = { a: true, b: true };
    expect(progressOf(steps, { 'tg-ftp': true }, checks)).toEqual({ done: 2, total: 2 });
  });

  it('counts every step once no condition is in play', () => {
    expect(progressOf(steps, { 'tg-ftp': true, 'tg-http': true }, { a: true })).toEqual({
      done: 1,
      total: 4,
    });
  });

  // Unticking a trigger must not destroy work: the check survives, it just stops
  // being counted, and re-ticking restores it.
  it('ignores a check on an inactive step without discarding it', () => {
    const checks = { c: true };
    expect(progressOf(steps, {}, checks)).toEqual({ done: 0, total: 1 });
    expect(progressOf(steps, { 'tg-http': true }, checks)).toEqual({ done: 1, total: 3 });
    expect(checks.c).toBe(true);
  });

  // A checklist refines a step, it does not multiply it: a 12-item enumeration
  // must not swamp a 14-step roadmap.
  it('counts a step with a checklist as ONE unit, done only when all items are', () => {
    const steps = [step('a'), withSubs('b', 3)];
    expect(progressOf(steps, {}, { a: true, 'b-1': true })).toEqual({ done: 1, total: 2 });
    expect(progressOf(steps, {}, { a: true, 'b-1': true, 'b-2': true, 'b-3': true })).toEqual({
      done: 2,
      total: 2,
    });
  });

  it('reports 0/0 for a scope where nothing applies', () => {
    expect(progressOf([step('b', ['tg-ftp'])], {}, {})).toEqual({ done: 0, total: 0 });
    expect(progressOf([], {}, {})).toEqual({ done: 0, total: 0 });
  });
});

describe('phaseHasActiveStep', () => {
  const phase = (steps: Step[]): Phase => ({ id: 'p', label: 'p', steps });

  it('is true as soon as one step applies', () => {
    expect(phaseHasActiveStep(phase([step('a', ['tg-ftp']), step('b')]), {})).toBe(true);
  });

  it('is false when every step is gated on an off trigger', () => {
    expect(phaseHasActiveStep(phase([step('a', ['tg-ftp']), step('b', ['tg-smb'])]), {})).toBe(
      false,
    );
  });

  // An empty phase is EMPTY, not inactive — the caller must not hide it.
  it('is false for a phase with no step at all', () => {
    expect(phaseHasActiveStep(phase([]), {})).toBe(false);
  });
});

describe('allSteps', () => {
  it('flattens every phase in order', () => {
    const phases: Phase[] = [
      { id: 'p1', label: 'p1', steps: [step('a'), step('b')] },
      { id: 'p2', label: 'p2', steps: [step('c')] },
    ];
    expect(allSteps(phases).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('stepGroupKey', () => {
  it('is empty for an unconditional step, so it never gets a sub-header', () => {
    expect(stepGroupKey(step('a'))).toBe('');
    expect(stepGroupKey({ ...step('a'), triggerIds: [] })).toBe('');
  });

  it('is shared by steps carrying the same trigger set, and differs otherwise', () => {
    expect(stepGroupKey(step('a', ['tg-ftp']))).toBe(stepGroupKey(step('b', ['tg-ftp'])));
    expect(stepGroupKey(step('a', ['tg-ftp']))).not.toBe(stepGroupKey(step('b', ['tg-smb'])));
  });

  // `A ou B` and `A et B` are different conditions and must not share a header.
  // Same list, different mode, is the case that isolates the mode half of the key.
  it('keys the mode into the group, not just the list', () => {
    expect(stepGroupKey(step('a', ['tg-ftp', 'tg-smb']))).not.toBe(
      stepGroupKey(step('b', ['tg-ftp', 'tg-smb'], 'all')),
    );
  });
});

describe('stepTriggers', () => {
  it('follows the roadmap declaration order, not the click order', () => {
    const s = step('a', ['tg-http', 'tg-ftp']);
    expect(stepTriggers(s, TRIGGERS).map((t) => t.label)).toEqual(['FTP', 'HTTP']);
  });

  // A dangling id renders as nothing rather than as a raw uuid. The load-time
  // normaliser (store.cleanRoadmaps) prunes them, so this is belt and braces.
  it('skips an id no trigger declares', () => {
    expect(stepTriggers(step('a', ['tg-ftp', 'tg-gone']), TRIGGERS).map((t) => t.label)).toEqual([
      'FTP',
    ]);
    expect(stepTriggers(step('a'), TRIGGERS)).toEqual([]);
  });
});

// The sub-header and the inactive-step tooltip need the OPERATOR, which a bare
// list of labels does not convey.
describe('describeStepTriggers', () => {
  it('is empty for an unconditional step', () => {
    expect(describeStepTriggers(step('a'), TRIGGERS)).toBe('');
  });

  it('joins with « ou » or « et » according to the step mode', () => {
    expect(describeStepTriggers(step('a', ['tg-ftp', 'tg-smb']), TRIGGERS)).toBe('FTP ou SMB');
    expect(describeStepTriggers(step('a', ['tg-ftp', 'tg-smb'], 'all'), TRIGGERS)).toBe(
      'FTP et SMB',
    );
  });
});
