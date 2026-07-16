# Changelog

All notable changes to **Cheat** are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project is in initial
development (pre-1.0).

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
