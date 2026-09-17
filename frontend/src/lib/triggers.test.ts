import { describe, expect, it } from 'vitest';

import {
  allSteps,
  isStepActive,
  matchTriggers,
  parseServices,
  phaseHasActiveStep,
  progressOf,
  stepGroupKey,
  toggleStepTrigger,
  describeStepTriggers,
  isStepDone,
  modeOf,
  normalizeStepTriggers,
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

  // A catalogued label is matched PRECISELY — by port, by exact service name, or
  // by its own predicate — never by loose substring, or the catalogue would be
  // decoration. The substring fallback below exists for the labels the catalogue
  // does not know, and only for those.
  it('does not match a catalogued label by substring', () => {
    expect(matchTriggers('9999/tcp open some-httpd-thing', TRIGGERS)).toEqual([]);
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

// v0.14.1 — the web pair, which had two holes: « HTTP » ignored an `https`
// service outright, and « HTTPS » only recognised a TLS tunnel through the port
// number, so `ssl/http` on 9443 was missed. The asymmetry is deliberate and is
// what these cases pin: HTTP is "there is a web app" (TLS or not), HTTPS is
// "there is TLS in front of it", because their steps differ.
describe('matchTriggers — the HTTP / HTTPS pair', () => {
  const WEB: Trigger[] = [
    { id: 'http', label: 'HTTP' },
    { id: 'https', label: 'HTTPS' },
  ];
  const hit = (line: string) => matchTriggers(line, WEB).sort();

  it('fires HTTP alone on a plain web service', () => {
    expect(hit('80/tcp open http Apache httpd 2.4.41')).toEqual(['http']);
    expect(hit('3000/tcp open http Node.js Express')).toEqual(['http']);
    expect(hit('8080/tcp open http-proxy')).toEqual(['http']);
  });

  // THE bug: a target serving only https left an HTTP-tagged step inactive.
  it('fires HTTP as well as HTTPS on an https service', () => {
    expect(hit('443/tcp open https')).toEqual(['http', 'https']);
    expect(hit('443/tcp open https?')).toEqual(['http', 'https']);
    expect(hit('8443/tcp open ssl/https-alt')).toEqual(['http', 'https']);
  });

  // THE other bug: the tunnel, not the port, is what says TLS.
  it('fires HTTPS on a ssl/ or tls/ tunnel at any port', () => {
    expect(hit('443/tcp open ssl/http')).toEqual(['http', 'https']);
    expect(hit('9443/tcp open ssl/http')).toEqual(['http', 'https']);
    expect(hit('9443/tcp open tls/http')).toEqual(['http', 'https']);
  });

  // HTTPS must stay narrower than HTTP, or its TLS-specific steps would light up
  // on a plain http host.
  it('never fires HTTPS on a plain http service', () => {
    expect(hit('80/tcp open http')).not.toContain('https');
    expect(hit('3000/tcp open http')).not.toContain('https');
  });

  // A bare `ssl` service is TLS in front of something nmap could not name — it
  // may be smtps or ldaps, so guessing "web" would be wrong.
  it('fires neither on a bare ssl service', () => {
    expect(hit('10443/tcp open ssl OpenSSL')).toEqual([]);
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

// v0.17.0 — the chip is a plain in/out toggle, and the step's operator is set by
// its own OU|ET switch. Until v0.16 the chip cycled absent → OU → ET → absent,
// which is what forced the mode flip pinned by the deleted test below.
describe('toggleStepTrigger', () => {
  it('adds a trigger that is absent, at the end of the list', () => {
    const s = step('s1', ['tg-ftp']);
    const next = toggleStepTrigger(s, 'tg-smb');
    expect(next.triggerIds).toEqual(['tg-ftp', 'tg-smb']);
  });

  it('removes only the clicked trigger and leaves the others alone', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb', 'tg-http'], 'all');
    const next = toggleStepTrigger(s, 'tg-smb');
    expect(next.triggerIds).toEqual(['tg-ftp', 'tg-http']);
  });

  it('two clicks on the same trigger return to the start', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb']);
    const once = toggleStepTrigger(s, 'tg-http');
    const twice = toggleStepTrigger({ ...s, ...once }, 'tg-http');
    expect(twice.triggerIds).toEqual(['tg-ftp', 'tg-smb']);
  });

  // THE v0.13-v0.16 quirk, now gone: the chip used to set 'any' on the way in, so
  // adding one to an 'all' step silently loosened the whole condition. The
  // operator has its own control now, and a chip no longer touches it.
  it("keeps 'all' when a trigger is added to a step already in ET", () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    const next = toggleStepTrigger(s, 'tg-http');
    expect(next.triggerIds).toEqual(['tg-ftp', 'tg-smb', 'tg-http']);
    expect(next.triggerMode).toBe('all');
  });

  it("keeps 'all' when a trigger is removed and two remain", () => {
    const s = step('s1', ['tg-ftp', 'tg-smb', 'tg-http'], 'all');
    expect(toggleStepTrigger(s, 'tg-http').triggerMode).toBe('all');
  });

  // Below two triggers 'any' and 'all' are the SAME condition and the switch is
  // hidden, so an 'all' left behind would be invisible state that comes back on
  // its own the moment a second trigger is added.
  it("normalises the mode to 'any' when only one trigger is left", () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    const next = toggleStepTrigger(s, 'tg-smb');
    expect(next.triggerIds).toEqual(['tg-ftp']);
    expect(next.triggerMode).toBe('any');
  });

  it("normalises the mode to 'any' when the last trigger is removed", () => {
    const s = step('s1', ['tg-ftp'], 'all');
    const next = toggleStepTrigger(s, 'tg-ftp');
    expect(next.triggerIds).toEqual([]);
    expect(next.triggerMode).toBe('any');
  });

  // Adding the SECOND trigger is the click that makes the switch appear; it must
  // arrive on the default operator rather than on a stale one.
  it("adds the second trigger with 'any', whatever the step carried before", () => {
    const s = step('s1', ['tg-ftp'], 'all');
    const next = toggleStepTrigger(s, 'tg-smb');
    expect(next.triggerIds).toEqual(['tg-ftp', 'tg-smb']);
    expect(next.triggerMode).toBe('any');
  });

  it('never mutates the step it is given', () => {
    const s = step('s1', ['tg-ftp', 'tg-smb'], 'all');
    toggleStepTrigger(s, 'tg-http');
    expect(s.triggerIds).toEqual(['tg-ftp', 'tg-smb']);
    expect(s.triggerMode).toBe('all');
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
