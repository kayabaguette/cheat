// Same-origin client for the LEAN whole-AppState persistence API, scoped per
// PROFILE. A profile is one isolated dataset; its entire AppState is fetched on
// load and replaced transactionally on save. Export/import mirror a full REPLACE
// of the ACTIVE profile (D4). Variable VALUES are never part of AppState
// (memory-only, D7).

import type { AppState, ProfileMeta } from '../types';

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error('API ' + res.status + ' ' + res.statusText);
  return (await res.json()) as T;
}

// --- Profiles ---------------------------------------------------------------

// GET /api/profiles -> { profiles, activeId }. activeId is '' when no profile
// exists yet (fresh DB — the caller bootstraps the first profile).
export async function listProfiles(): Promise<{ profiles: ProfileMeta[]; activeId: string }> {
  const res = await fetch('/api/profiles', { headers: { Accept: 'application/json' } });
  return asJson<{ profiles: ProfileMeta[]; activeId: string }>(res);
}

// POST /api/profiles -> create a profile. cloneFrom copies an existing profile's
// whole dataset; omit it for an empty profile. Returns the new {id,name}.
export async function createProfile(name: string, cloneFrom?: string): Promise<ProfileMeta> {
  const res = await fetch('/api/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, cloneFrom: cloneFrom ?? '' }),
  });
  return asJson<ProfileMeta>(res);
}

export async function renameProfile(id: string, name: string): Promise<void> {
  const res = await fetch('/api/profiles/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await asJson<{ ok: boolean }>(res);
}

export async function deleteProfile(id: string): Promise<void> {
  const res = await fetch('/api/profiles/' + encodeURIComponent(id), { method: 'DELETE' });
  await asJson<{ ok: boolean }>(res);
}

export async function setActiveProfile(id: string): Promise<void> {
  const res = await fetch('/api/profiles/' + encodeURIComponent(id) + '/activate', {
    method: 'POST',
  });
  await asJson<{ ok: boolean }>(res);
}

// --- Per-profile state ------------------------------------------------------

// GET /api/profiles/:id/state -> { initialized, state }.
export async function getProfileState(
  id: string,
): Promise<{ initialized: boolean; state: AppState }> {
  const res = await fetch('/api/profiles/' + encodeURIComponent(id) + '/state', {
    headers: { Accept: 'application/json' },
  });
  return asJson<{ initialized: boolean; state: AppState }>(res);
}

// PUT /api/profiles/:id/state -> replaces that profile's whole dataset.
export async function putProfileState(id: string, state: AppState): Promise<void> {
  const res = await fetch('/api/profiles/' + encodeURIComponent(id) + '/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  await asJson<{ ok: boolean }>(res);
}

// --- Import / export (ACTIVE profile) ---------------------------------------

// POST /api/import -> full REPLACE of the active profile (D4).
export async function importState(state: AppState): Promise<void> {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  await asJson<{ ok: boolean }>(res);
}

// GET /api/export -> the active profile's AppState as a downloadable attachment.
export async function exportState(): Promise<AppState> {
  const res = await fetch('/api/export', { headers: { Accept: 'application/json' } });
  return asJson<AppState>(res);
}
