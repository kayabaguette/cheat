import type { Phase, Step, Trigger } from '../types';

// Conditional steps (v0.11.0) — the pure logic behind them, kept out of the view
// so it can be tested without a DOM, exactly like lib/vars.ts.
//
// A roadmap declares its own vocabulary of TRIGGERS ("FTP", "SMB", "HTTP"), a
// step references the ones that make it apply, and whether a trigger is ON is
// per-target progress (AppState.activeTriggers). An OSCP roadmap has to list the
// enumeration steps for a dozen services; on a given target most of them are off
// topic, and — worse — used to count against the progress bar, so a host running
// 3 services out of 12 could never reach 100%.

// --- activity ---------------------------------------------------------------

// A step applies when it is UNCONDITIONAL (no trigger at all) or when AT LEAST
// ONE of its triggers is on. The OR is deliberate and the only semantics in v1:
// a step needing "FTP *and* SMB" is vanishingly rare, and the field being a list
// already leaves room for an AND later without a model change.
export function isStepActive(step: Step, activeTriggers: Record<string, boolean>): boolean {
  const ids = step.triggerIds;
  if (!ids || ids.length === 0) return true;
  return ids.some((id) => activeTriggers[id] === true);
}

// Does this phase have anything to do on this target? Drives hiding a phase card
// that would otherwise render empty under « masquer les étapes inactives ».
export function phaseHasActiveStep(phase: Phase, activeTriggers: Record<string, boolean>): boolean {
  return phase.steps.some((st) => isStepActive(st, activeTriggers));
}

// --- progress ---------------------------------------------------------------

// Done / total over a step list, counting ACTIVE steps only — numerator AND
// denominator. Excluding an inactive step from the denominator is the whole
// point: it is what lets a target reach 100% without the services it does not
// run. Feeds all three progress readouts (global, per-phase counter, per-phase
// bar) so they can never drift apart.
//
// A checked step that goes inactive KEEPS its `checks` entry — unticking a
// trigger is non-destructive, and re-ticking it restores the state. It just
// stops being counted while inactive.
export function progressOf(
  steps: readonly Step[],
  activeTriggers: Record<string, boolean>,
  checks: Record<string, boolean>,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const st of steps) {
    if (!isStepActive(st, activeTriggers)) continue;
    total += 1;
    if (checks[st.id]) done += 1;
  }
  return { done, total };
}

// Every step of every phase, for the roadmap-wide readout.
export function allSteps(phases: readonly Phase[]): Step[] {
  return phases.flatMap((p) => p.steps);
}

// --- implicit grouping ------------------------------------------------------

// Steps sharing a trigger set are rendered under one `── FTP ──` sub-header, and
// this key is what the view compares against the previous step to decide whether
// to emit one. '' for an unconditional step, which never gets a header — so the
// grouping is a pure rendering effect and adds NO level to the data model.
export function stepGroupKey(step: Step): string {
  const ids = step.triggerIds;
  return ids && ids.length ? ids.join('|') : '';
}

// The labels of a step's triggers, in the roadmap's declaration order, skipping
// any id that no longer resolves (a dangling reference renders as nothing rather
// than as a raw uuid).
export function triggerLabels(step: Step, triggers: readonly Trigger[]): string[] {
  const ids = step.triggerIds;
  if (!ids || !ids.length) return [];
  return triggers.filter((t) => ids.includes(t.id)).map((t) => t.label);
}

// --- detection from a pasted nmap result ------------------------------------

export interface DetectedService {
  port: number;
  service: string;
}

// The line nmap prints for an open port, in its usual flavours:
//   21/tcp   open  ftp
//   445/tcp  open  microsoft-ds  Windows Server 2019
//   80/tcp   open  http          Apache httpd 2.4.41 ((Ubuntu))
//
// Only OPEN counts. `closed` and `filtered` fail the literal, and so does
// `open|filtered` — after `open` comes a '|', not whitespace — which is exactly
// right: a UDP maybe is nmap declining to tell us the service is there.
const PORT_LINE = /^[ \t]*(\d{1,5})\/(?:tcp|udp)[ \t]+open[ \t]+(\S+)/gim;

// Distinct {port, service} pairs for every open port in a pasted result, in
// first-seen order. Anything that is not a port line is ignored, so pasting a
// whole nmap run — banner, host script output and all — is fine.
export function parseServices(text: string): DetectedService[] {
  const re = new RegExp(PORT_LINE.source, 'gim');
  const out: DetectedService[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const port = Number(m[1]);
    const service = m[2].toLowerCase();
    const key = port + '/' + service;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ port, service });
  }
  return out;
}

// Normalise nmap's service column into comparable tokens: `ssl/http` yields both
// 'ssl' and 'http' (so an HTTPS port still answers to an HTTP trigger, which is
// true), and the trailing '?' of an unconfirmed guess is dropped
// (`microsoft-ds?`).
function serviceTokens(service: string): string[] {
  return service.replace(/\?+$/, '').split('/').filter(Boolean);
}

// A trigger label reduced to a comparable key: upper case, letters and digits
// only. So « smb », "SMB" and "smb " are one and the same.
function normLabel(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Port and service-name aliases per canonical label. Deliberately SHORT: it
// covers what a pentester actually meets, and a service it does not know simply
// is not auto-detected — the chip is still one click away. Over-reaching here
// would trade a missing detection (harmless) for a wrong one (confusing).
const CATALOG: { label: string; ports: number[]; names: string[] }[] = [
  { label: 'FTP', ports: [21, 990], names: ['ftp', 'ftps'] },
  { label: 'SSH', ports: [22], names: ['ssh'] },
  { label: 'TELNET', ports: [23], names: ['telnet'] },
  { label: 'SMTP', ports: [25, 465, 587], names: ['smtp', 'smtps'] },
  { label: 'DNS', ports: [53], names: ['domain', 'dns'] },
  { label: 'HTTP', ports: [80, 8000, 8080, 8081, 8888], names: ['http', 'http-alt', 'http-proxy'] },
  { label: 'KERBEROS', ports: [88, 464], names: ['kerberos-sec', 'kerberos', 'kpasswd5'] },
  { label: 'POP3', ports: [110, 995], names: ['pop3', 'pop3s'] },
  { label: 'RPC', ports: [111, 135], names: ['rpcbind', 'msrpc'] },
  { label: 'SMB', ports: [139, 445], names: ['netbios-ssn', 'microsoft-ds', 'smb'] },
  { label: 'IMAP', ports: [143, 993], names: ['imap', 'imaps'] },
  { label: 'SNMP', ports: [161, 162], names: ['snmp'] },
  { label: 'LDAP', ports: [389, 636, 3268, 3269], names: ['ldap', 'ldapssl'] },
  { label: 'HTTPS', ports: [443, 8443], names: ['https', 'https-alt'] },
  { label: 'MSSQL', ports: [1433], names: ['ms-sql-s', 'mssql'] },
  { label: 'ORACLE', ports: [1521], names: ['oracle', 'oracle-tns'] },
  { label: 'NFS', ports: [2049], names: ['nfs'] },
  { label: 'MYSQL', ports: [3306], names: ['mysql'] },
  { label: 'RDP', ports: [3389], names: ['ms-wbt-server', 'rdp'] },
  { label: 'POSTGRES', ports: [5432], names: ['postgresql', 'postgres'] },
  { label: 'VNC', ports: [5900, 5901], names: ['vnc'] },
  { label: 'WINRM', ports: [5985, 5986], names: ['wsman', 'winrm'] },
  { label: 'REDIS', ports: [6379], names: ['redis'] },
  { label: 'MONGODB', ports: [27017], names: ['mongodb', 'mongod'] },
];

// A label the catalogue does NOT know can still match by appearing in the
// service name itself (a trigger called « JENKINS » against `jenkins-listener`).
// Reserved for unknown labels on purpose: a catalogued one is matched precisely,
// by port or by exact service name, so « HTTP » does not tick on an `https`-only
// host just because one string contains the other. Requires 3 characters, so a
// one- or two-letter label cannot match half the services on the host by
// accident.
const MIN_FALLBACK_LEN = 3;

// The ids of the triggers a pasted result vouches for. Returns ONLY ids to turn
// ON: nothing here can ever untick a trigger, so a chip you set by hand always
// wins and the worst case of the « détecter » button is that it found nothing.
export function matchTriggers(text: string, triggers: readonly Trigger[]): string[] {
  const services = parseServices(text);
  if (!services.length || !triggers.length) return [];
  const out: string[] = [];
  for (const t of triggers) {
    const label = normLabel(t.label);
    if (!label) continue;
    const entry = CATALOG.find((c) => c.label === label);
    const lower = label.toLowerCase();
    const hit = services.some((sv) => {
      const tokens = serviceTokens(sv.service);
      if (entry) {
        // Known label: ports and exact service names only — no substring.
        if (entry.ports.includes(sv.port)) return true;
        return tokens.some((n) => entry.names.includes(n));
      }
      if (label.length < MIN_FALLBACK_LEN) return false;
      return tokens.some((n) => n.includes(lower));
    });
    if (hit) out.push(t.id);
  }
  return out;
}
