# Changelog

All notable changes to **Cheat** are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project is in initial
development (pre-1.0).

## [0.5.0] — 2026-07-17

### Added
- **Command favorites.** A star toggle on each command card in the Bibliothèque
  pins the command to the top of its **tool** group. The flag is **persisted** —
  it is part of the `commands` import/export shape as an optional `favorite`
  boolean and survives reload; existing datasets default to not-favorite (the
  SQLite column is added automatically on startup). Sorting is stable, so the
  relative order of non-favorite commands is unchanged.

## [0.4.0] — 2026-07-17

Security-review pass. A full read-only audit (backend, frontend, delivery,
secrets/OPSEC) found the posture solid — no SQLi/XSS/path-traversal, zero
network egress, a non-root distroless image, a clean git history, and the
memory-only variable-value guarantee upheld in the persistence layer. This
release fixes the one real breach of that guarantee plus a set of hardening
items, delivered as three focused PRs (#14 export, #15 backend/delivery,
#16 frontend).

### Security / OPSEC
- **Cheatsheet exports are now raw `$TOKEN` by default in BOTH Markdown and
  PDF.** The PDF export previously resolved every variable value
  unconditionally — including the sensitive `$PASS` — into the printed
  document, and the Markdown export emitted the `RHOST/LHOST/USER/DOMAIN` value
  block even in raw mode. A single export-resolution toggle (memory-only,
  default off) now governs both formats; resolving is an explicit opt-in and a
  confirmation guards any resolved export that would write a sensitive value to
  disk (SPEC §9.6).
- **Request bodies are capped at 8 MiB** on `PUT /api/state` and
  `POST /api/import` (`http.MaxBytesReader`). They were unbounded — a
  LAN-reachable memory-exhaustion DoS given the `0.0.0.0` / no-auth bind.
- **Defense-in-depth response headers** — a strict `Content-Security-Policy`
  (no `unsafe-inline`), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Reference URLs are re-sanitized on load** (not only on add/edit): any
  disallowed scheme (`javascript:`, `data:`, …) in an imported dataset is
  neutralized so a hostile file can never yield a clickable link.
- **Variable-value inputs set `autocomplete="off"`** so browser form-autofill
  never retains memory-only values (incl. `$PASS`).
- **`.dockerignore` excludes `**/.env*`** so a local `VITE_`-prefixed secret
  cannot be inlined into the served bundle.

### Changed
- **Container image hardening** — base images pinned by digest; explicit
  `USER 65532:65532`; a `WORKDIR` under the nonroot home so the default
  `CHEAT_DB` is writable without a volume (the volumeless `docker run` example
  now works); a `HEALTHCHECK` via a new `cheat -healthcheck` self-probe
  (`make build` emits a Docker-format image so podman preserves it).
- **`make clean` no longer deletes your data** — it keeps the `cheat-data`
  volume; the new **`make purge`** removes it.
- **Import validation** rejects a malformed dataset (a wrong-typed top-level
  key) up front instead of wiping the current data and then failing to hydrate.
- Bumped indirect Go dependencies `golang.org/x/net` (0.25 → 0.57) and
  `golang.org/x/crypto` (0.23 → 0.54).
- The export `?date=` filename hint is validated (`YYYY-MM-DD`) before it
  reaches the `Content-Disposition` header.
- The Markdown export HTML-escapes interpolated prose (titles, descriptions,
  notes, tags, target); fenced code blocks are unaffected.

### Notes
- Accepted-by-design items are unchanged: no auth / no TLS with the LAN
  `0.0.0.0` bind, and the cleartext at-rest database.

## [0.3.0] — 2026-07-17

### Added
- **Alphabetical tool ordering** — the sidebar's category → tool tree now sorts
  each category's tools alphabetically (case- and accent-insensitive) instead of
  by first-seen/insertion order.

### Changed
- **Networking — LAN exposure (overrides the loopback-only R1 posture).** The
  container no longer uses `--network host`: it runs on a normal bridge network
  with the port published on `0.0.0.0` (`-p 0.0.0.0:8787:8787`), and the server
  binds `0.0.0.0` by default. The bind host is configurable via `CHEAT_HOST`
  (or `--host`); the publish mapping via the `PUBLISH` make variable. `make dev`
  moves to a shared user-defined network with the Vite proxy retargeted to the
  API container.
- **A tool name is never one of a command's tags** — the OSCP import had seeded
  each command with its own tool as a tag, duplicating the category → tool
  grouping. The tool is now stripped from a command's tags on add/edit and on
  load. Service/protocol tags that merely share a name with a tool (`ssh`,
  `git`, `ftp`, `mysql`, carried by commands of *other* tools) are kept.
- **License — now open source (GPL-3.0).** Relicensed from the previous
  proprietary / all-rights-reserved terms to the **GNU General Public License
  v3.0** ahead of publishing the repository. Copyright © 2026 KnackyCorp.

### Security / OPSEC
- **The app is now reachable on the LAN with no authentication and no TLS.**
  Anyone who can reach the host on `CHEAT_PORT` has full read/write access to
  the whole (cleartext) dataset and the API. Restore loopback-only with
  `make up CHEAT_HOST=127.0.0.1 PUBLISH='-p 127.0.0.1:8787:8787'`, firewall the
  port, or use an SSH local port-forward. Outbound egress is still zero.

## [0.2.0] — 2026-07-17

Variable-system overhaul: custom variables become first-class, and the default
variable set adopts the RHOST/RPORT pentest convention.

### Added
- **Variable auto-detection** — any `$TOKEN` used in a command template but not
  yet defined is surfaced in a **« Détectées »** strip in the sidebar; click `+`
  to adopt it (assign a value) so it resolves live everywhere.
- **Custom-variable rename (cascade)** — renaming a variable rewrites `$OLD` →
  `$NEW` across **every** command template (escaped `\$` and longer tokens left
  intact), carries its value over, and toasts the number of commands updated.
- **Custom-variable delete** — removes the variable so its `$TOKEN` reverts to
  the "undefined" render state in commands and returns to the detected strip.

### Changed
- **Default variables** — the standard set is now `$RHOST`, `$RPORT`, `$LHOST`,
  `$LPORT`, `$USER`, `$DOMAIN`, `$PASS` (paired remote/local + credentials).
  `$RHOST` supersedes the former `$IP`; `$RPORT` mirrors `$LPORT`
  (msfvenom/pentest convention). Seed commands, the `AddCommand` hint, cheatsheet
  metadata chips and the README were updated accordingly; existing datasets
  migrate `$IP` → `$RHOST`.

### Notes
- Variables remain **frontend-only and memory-only**: definitions are not
  persisted and are not part of the import/export `AppState`, and values reset on
  reload. Auto-detection therefore re-surfaces tokens from the (persisted)
  command templates after a reload — the intended, OPSEC-consistent behavior.

## [0.1.0] — 2026-07-16

First functionally-complete build: the four modules, theming, SQLite
persistence, and dataset import/export. Ported faithfully from the validated
Claude Design prototype (`OSCP Vault.dc.html`); see `SPEC.md` for the finalized
specification.

### Added
- **Specification** — finalized `SPEC.md` v1.1 (196-question elicitation →
  locked decisions in `tasks/spec-decisions.md` → 69 review adjustments applied).
- **App shell** — fixed top bar (4-tab segmented nav, per-module search,
  contextual add button, theme toggle), 272 px sidebar (live Variables panel,
  expandable Categories → tools tree, Tags facet), dark/light theme with the
  design's token system and self-hosted IBM Plex fonts. Desktop-only strict.
- **Variables** — live `$IP`/`$LHOST`/`$LPORT`/`$USER`/`$DOMAIN`/`$PASS`
  substitution rendered green wherever a command is shown; three render states
  (resolved / empty / undefined); values are memory-only.
- **Bibliothèque** — command cards grouped category → tool, tokenized
  accent-insensitive search, category/tool/tag filters, full CRUD
  (add/edit/delete) with on-the-fly categories/tools/tags, per-command notes,
  copy-to-clipboard (resolved) with feedback, add-to-cheatsheet toggle.
- **Méthodologie** — multiple roadmaps (tabs + create/rename/delete), phases &
  checkable steps with per-phase and global progress, step → linked-command
  inline expander (resolved + copy), edit mode with drag-and-drop reorder
  (incl. cross-phase) and ↑/↓ fallback, "Réinitialiser la progression".
- **Références** — link cards (auto-extracted domain, tags), full-text +
  tag-facet filtering, add/edit/delete with URL validation/normalization and
  scheme allowlist; outbound links `rel="noopener noreferrer"`.
- **Cheatsheet** — multiple named cheatsheets, add-from-library, ordered entries
  (↑/↓/remove), editable title/target, metadata chips; Markdown export
  (raw `$TOKEN`s by default + opt-in "resolve variables") and PDF export
  (`window.print`); "Copier tout" (resolved).
- **Persistence** — lean Go backend (Gin) with pure-Go GORM/SQLite storing the
  whole dataset; `GET`/`PUT /api/state`, `POST /api/import`, `GET /api/export`,
  `GET /api/health`. The SPA hydrates on load and autosaves (debounced 500 ms);
  variable values are never persisted (memory-only).
- **Import / export** — top-bar buttons to download the dataset as dated JSON and
  to import one (destructive REPLACE with confirmation).
- **Reusable `TagPicker`** — existing tags as clickable chips + a free-text
  field, used by every add/edit form.
- **Delivery** — single self-contained binary embedding the SPA (`go:embed`),
  container-only `Makefile` (podman-preferred, docker fallback:
  `build`/`up`/`run`/`down`/`rebuild`/`logs`/`dev`) with `--network host`
  loopback binding and a `cheat-data` volume for the SQLite file; multi-stage
  `Dockerfile`; `.dockerignore`.

### Fixed
- Toggle buttons (tags, roadmap tabs, edit toggle) kept a stale border color
  after deselect (mixed `border` shorthand + `borderColor` longhand) — now use
  the full `border` shorthand.
- Copy button had no visible feedback — added hover/active states, a check-icon
  swap and a toast.
- Sidebar categories could expand but not collapse on re-click; "réinitialiser"
  now also collapses the tree and returns to "Toutes les commandes".
- Library command cards no longer show a spurious tool badge (tool stays a group
  sub-header; badge kept on cheatsheet entries).

### Security / OPSEC
- Loopback-only bind (`127.0.0.1`); zero network egress (self-hosted fonts, no
  CDN, no telemetry); `spellcheck="false"` on all inputs (prevents field-content
  exfiltration); no at-rest encryption because variable *values* are never
  persisted (free-text notes/targets/URLs are stored in cleartext — rely on OS
  full-disk encryption); exports default to raw `$TOKEN`s.

### Notes
- The backend intentionally uses a coarse whole-`AppState` `GET`/`PUT` API rather
  than the granular per-entity REST surface described in `SPEC.md` (kept lean).
