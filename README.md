# 💩 Cheat

**OSCP notes, cheatsheets & methodology workshop.** A single-user, offline,
**localhost-only** desktop web app that centralizes the operational knowledge of
a penetration test — reusable **commands**, step-by-step **methodologies**,
external **references**, and target-scoped **cheatsheets** — with live
**variables** (`$RHOST`, `$RPORT`, `$LHOST`, `$LPORT`, `$USER`, `$DOMAIN`, `$PASS`, …) resolved
identically wherever a command is shown.

Ported faithfully from a validated Claude Design prototype; `SPEC.md` is the
authoritative specification. UI language is **French**; in-repo docs are English.

> **Status:** functionally complete (v0.1.0) — see [`CHANGELOG.md`](./CHANGELOG.md).

## Features

- **Bibliothèque** — commands grouped by category → tool, tokenized
  accent-insensitive search, category/tool/tag filters, full CRUD with
  on-the-fly categories/tools/tags, per-command notes, resolved copy-to-clipboard,
  add-to-cheatsheet.
- **Méthodologie** — multiple roadmaps of phases and checkable steps with
  per-phase/global progress, a step's linked command expanded & resolved inline,
  edit mode with drag-and-drop reorder (incl. cross-phase), progress reset.
- **Références** — external links with auto-extracted domain and tags, full-text
  + tag filtering, add/edit/delete with URL validation & scheme allowlist.
- **Cheatsheet** — multiple named cheatsheets, ordered entries, editable
  title/target, **Markdown export** (raw `$TOKEN`s by default, opt-in resolve)
  and **PDF export** (browser print).
- **Variables** — live substitution, three render states (resolved / empty /
  undefined); values are **memory-only** (never persisted).
- **Theme** — dark / light, terminal-dense, self-hosted IBM Plex fonts.
- **Persistence** — everything (except variable values) persists to a local
  SQLite database and survives reloads.
- **Import / export** — back up or restore the whole dataset as JSON.

## Architecture

One self-contained **Go binary** (Gin) embeds the compiled **Vite + React +
TypeScript** SPA via `go:embed` and serves it together with a same-origin REST
API, bound to **`127.0.0.1`**. Storage is **pure-Go GORM/SQLite** (no CGO →
static binary). **Zero network egress**: no CDN, self-hosted fonts, no telemetry.

API (lean, whole-`AppState`): `GET`/`PUT /api/state`, `POST /api/import`,
`GET /api/export`, `GET /api/health`.

## Run

Requires a container engine — **podman** (preferred) or **docker** — plus `make`.
Everything runs through a container; nothing is installed on the host.

```sh
make build      # build the image (podman/docker auto-detected)
make up         # run detached  -> http://127.0.0.1:8787   (make logs | make down)
make run        # run in the foreground (Ctrl-C to stop)
make rebuild    # down + build + up (the usual one-shot)
make dev        # containerized dev: Vite HMR (:5173) + Go (:8787)
make clean      # remove container, image and volumes
```

- Change the port: `make up CHEAT_PORT=9000`.
- The SQLite database lives in the `cheat-data` volume (`CHEAT_DB=/data/cheat.db`
  inside the container) so it survives restarts; `make clean` removes it.
- Loopback-only by design: containers use `--network host` so the process binds
  the host's `127.0.0.1`. For remote access use an SSH local port-forward — never
  expose it to a LAN.

## Security / OPSEC

- Binds `127.0.0.1` only; **zero network egress** (self-hosted assets, no
  telemetry); `spellcheck="false"` on every field (prevents field-content
  exfiltration by the browser/extensions); outbound reference links use
  `rel="noopener noreferrer"`.
- Variable **values** (`$PASS`, target IPs, …) are **memory-only** — never
  written to the DB, `localStorage`, or the JSON export. They reset on reload.
- No at-rest encryption: because values are not persisted, the database holds
  only your commands/methodology/references and free-text notes/targets/URLs
  (stored in cleartext — rely on OS full-disk encryption). Markdown/PDF exports
  emit raw `$TOKEN`s by default.

## Dataset format (import / export)

Export produces — and import expects — a **single JSON object** (`AppState`).
Import is a **full REPLACE** (it overwrites everything, so export first to back
up). Variable *values* are never part of the file. The simplest way to obtain a
valid file is to **Export** one and edit it. Every top-level key must be present
(arrays may be empty, maps `{}`); import rejects a file whose `commands` is not
an array.

```json
{
  "categories":  [{ "key": "infogathering", "label": "Information gathering", "color": "#5e9bff" }],
  "commands":    [{ "id": "n1", "category": "infogathering", "tool": "nmap", "title": "Scan complet TCP", "template": "nmap -p- $RHOST", "desc": "Tous les ports", "tags": ["recon"] }],
  "references":  [{ "id": "r1", "title": "HackTricks", "url": "https://book.hacktricks.xyz", "desc": "", "tags": ["general"] }],
  "roadmaps":    [{ "id": "services", "label": "Machine — Services", "phases": [{ "id": "p1", "label": "Reconnaissance", "steps": [{ "id": "s1", "text": "Scan TCP complet", "commandId": "n1" }] }] }],
  "cheatsheets": [{ "id": "cs1", "title": "Cheatsheet — HTB Lab", "target": "", "commandIds": ["n1"] }],
  "notes":       { "n1": "note perso attachée à la commande n1" },
  "checks":      { "s1": true },
  "openSteps":   { "s1": false },
  "settings":    { "theme": "dark", "activeRoadmap": "services", "activeSheet": "cs1" }
}
```

Field reference:

| Key | Shape | Notes |
|---|---|---|
| `categories[]` | `{ key, label, color }` | `color` is a CSS hex; the 18 built-ins keep their canonical keys/labels. |
| `commands[]` | `{ id, category, tool, title, template, desc, tags[] }` | `category` is a `categories[].key`; `template` may contain `$VAR` tokens. |
| `references[]` | `{ id, title, url, desc, tags[] }` | `url` should be `http(s)`/`mailto`. |
| `roadmaps[]` | `{ id, label, phases[] }` | `phases[] = { id, label, steps[] }`, `steps[] = { id, text, commandId? }`. |
| `cheatsheets[]` | `{ id, title, target, commandIds[] }` | each `commandIds` entry → a `commands[].id`. |
| `notes` | `{ [commandId]: string }` | per-command note. |
| `checks` / `openSteps` | `{ [stepId]: boolean }` | methodology progress / expanded state. |
| `settings` | `{ theme, activeRoadmap, activeSheet }` | `theme` = `"dark"`\|`"light"`; `activeRoadmap` = a roadmap id or `null`; `activeSheet` = a cheatsheet id. |

- **IDs** are arbitrary unique strings. Keep cross-references consistent
  (`steps[].commandId`, `cheatsheets[].commandIds`, and the `notes`/`checks`/
  `openSteps` keys); references to a missing id are dropped/ignored.
- Variable **values** (`$RHOST`, `$PASS`, …) are **not** stored in the file — they
  are memory-only and reset on load.

## Repository layout

- `frontend/` — Vite + React + TypeScript SPA.
- `backend/` — Go server (Gin, GORM/SQLite, `go:embed` of the built SPA).
- `SPEC.md` — authoritative specification (12 sections + open items + traceability).
- `tasks/` — spec questionnaire, decisions log, review adjustments.
- `Makefile`, `Dockerfile`, `.dockerignore` — build & delivery.

## License

Proprietary — all rights reserved. See [`LICENSE`](./LICENSE).
