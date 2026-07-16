// M3 — same-origin client for the LEAN whole-AppState persistence API.
// The backend exposes a coarse GET/PUT /api/state (not granular CRUD): the
// entire persistable AppState is fetched on load and replaced transactionally
// on save. Export/import mirror PUT as a full REPLACE (D4). Variable VALUES are
// never part of AppState (memory-only, D7).

import type { AppState } from '../types';

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error('API ' + res.status + ' ' + res.statusText);
  return (await res.json()) as T;
}

// GET /api/state -> { initialized, state }. `state` is empty/zero when the DB
// has never been initialized; the caller keeps its seed defaults in that case.
export async function getState(): Promise<{ initialized: boolean; state: AppState }> {
  const res = await fetch('/api/state', { headers: { Accept: 'application/json' } });
  return asJson<{ initialized: boolean; state: AppState }>(res);
}

// PUT /api/state -> replaces all persisted data and flips initialized = true.
export async function putState(state: AppState): Promise<void> {
  const res = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  await asJson<{ ok: boolean }>(res);
}

// POST /api/import -> same semantics as PUT (full REPLACE, D4).
export async function importState(state: AppState): Promise<void> {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  await asJson<{ ok: boolean }>(res);
}

// GET /api/export -> the AppState as a downloadable JSON attachment.
export async function exportState(): Promise<AppState> {
  const res = await fetch('/api/export', { headers: { Accept: 'application/json' } });
  return asJson<AppState>(res);
}
