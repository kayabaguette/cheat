# Cheat — Software Specification

**Version:** 1.1 (final, review-adjusted)
**Revision:** incorporates all 69 review adjustments A1-A64 + R1-R5 (see `tasks/spec-adjustments.md`).
**Status:** Finalized for implementation, pending user validation (M0 scaffold).
**Date:** 2026-07-15
**Product:** Cheat — a single-user, offline, localhost-only desktop web app for pentest operational knowledge (reusable commands, methodologies, references, target-scoped cheatsheets) with live variable resolution.
**Stack:** Vite + React + TypeScript SPA embedded (`go:embed`) into a Go + Gin + GORM + SQLite single binary, served same-origin on `127.0.0.1`.

> **Documentation language.** This specification, the README, and the CHANGELOG are written in **English**. All user-facing UI strings, labels, placeholders, toasts, and command examples are quoted **verbatim in French**.

> **How to read this document.** Sections 1–12 are the specification. Cross-cutting rules resolved during review are reconciled consistently across every section: loopback-only networking with **no LAN mode, TLS, or API token** (R1); **awaited creates + debounced text PATCH** with no temp-ID/retry-queue (R2); the **three variable render states** `resolved` / `empty` / `undefined` (A5); **REPLACE-only import** with MERGE deferred to v2 (A12); a **single `formatVersion`** with no `schemaVersion`/`seedVersion`/`migratedFrom` in the envelope (A20/A49); and the **D7 rationale requalified to variable-values-only** (A11). **Open Items** collects the remaining non-blocking questions plus the explicit v2 deferrals; **Traceability** maps each locked decision and applied adjustment to its section(s).

> **Implementation status — v0.2–v0.5 (2026-07-17).** The shipped build deliberately diverges from parts of this spec; where they conflict, the following **supersedes** the text below:
> 1. **Standard variable set.** Now **7** variables in the order `RHOST, RPORT, LHOST, LPORT, USER, DOMAIN, PASS`. `RHOST` supersedes the former `IP`; `RPORT` mirrors `LPORT` (msfvenom/pentest convention). This overrides the canonical `IP, LHOST, LPORT, USER, DOMAIN, PASS` order stated throughout §3.2.7, §5.4 and §11. Existing datasets migrate `$IP` → `$RHOST`.
> 2. **Variables are frontend-only and memory-only.** There is **no persisted `VariableDefinition` table and no `/variables` REST surface** — §3.2.7 and §8's variable endpoints describe a model that was not built (consistent with the lean whole-`AppState` API; see the §12 note). Definitions live in the SPA (`STANDARD_VARS` + a `values` map); they are **not** part of import/export, and values reset on reload.
> 3. **Two v2-deferrals are now shipped.** Because definitions are client-side, the previously deferred unknown-`$TOKEN` **auto-detection** and variable **rename cascade** (A27; Open Items) **are implemented**: detected tokens appear in a « Détectées » strip for one-click adoption; rename rewrites `$OLD`→`$NEW` across all command templates (escaped `\$` / longer tokens preserved) and reports the count; delete returns the token to the undefined render state. This overrides the "rename allowed only when unreferenced / cascade deferred" wording in §3.2.7, §4.x, §5 and §8.
> 4. **Networking — LAN-exposed (v0.3), overrides R1/Q168.** The loopback-only posture is dropped: the container runs on a normal bridge network (no `--network host`) with the port published on `0.0.0.0`, and the server binds `0.0.0.0` by default (`CHEAT_HOST` / `--host` to override; e.g. `127.0.0.1` restores loopback). There is still **no auth and no TLS**, so the whole cleartext dataset is readable/writable by anyone who can reach the port. Outbound egress remains zero (self-hosted assets, no telemetry).
> 5. **Bibliothèque tag/tool refinements (v0.2–v0.3).** In the sidebar category → tool tree, each category's tools are sorted **alphabetically** (case/accent-insensitive) rather than by insertion order (refines §5.5/Q50). A command's **own tool name is never one of its tags** (it duplicated the tool grouping): the tool is stripped from tags on add/edit and on load; service/protocol tags that merely share a name with some tool (`ssh`, `git`, `ftp`, `mysql`) are kept.
> 6. **Repository license — resolved (v0.3).** The "remaining open item" (§12.12 / Q193 / Open Items: private-proprietary default, MIT if published) is settled: the repository is **published under the GNU General Public License v3.0** (© 2026 KnackyCorp). This supersedes the proprietary/MIT wording throughout.
> 7. **Command favorites (v0.5).** The `Command` shape gains an optional persisted `favorite` boolean (a plain SQLite column added via AutoMigrate; existing rows default `false`, and it is part of the `commands` import/export contract). A starred command sorts to the top of its **tool** group in the Bibliothèque (stable sort — the relative order of non-favorite commands is unchanged). This extends the Command/AppState contract in §3 and §9.

---

## Table of Contents

1. [Overview, Scope & Principles](#1-overview-scope--principles)
2. [System Architecture](#2-system-architecture)
3. [Data Model (GORM / SQLite)](#3-data-model-gorm--sqlite)
4. [REST API](#4-rest-api)
5. [Variables System](#5-variables-system)
6. [Library Module](#6-library-module)
7. [Methodology Module](#7-methodology-module)
8. [References Module](#8-references-module)
9. [Cheatsheets & Export](#9-cheatsheets--export)
10. [Persistence, Import/Export & Seed Governance](#10-persistence-importexport--seed-governance)
11. [Visual System & UX](#11-visual-system--ux)
12. [Non-Functional, Security/OPSEC & Delivery](#12-non-functional-securityopsec--delivery)
- [Open Items](#open-items)
- [Traceability](#traceability)

---

## 1. Overview, Scope & Principles

### 1.1 Product Purpose

**Cheat** is a single-user, offline desktop web application that centralizes the operational knowledge of a penetration test into one workspace: reusable **commands**, step-by-step **methodologies**, external **references**, and the generation of target-scoped **cheatsheets**. Its defining feature is a set of **live variables** (`$RHOST`, `$RPORT`, `$LHOST`, `$LPORT`, `$USER`, `$DOMAIN`, `$PASS`, plus user-defined ones) that resolve identically everywhere a command is displayed — Bibliothèque, Méthodologie and Cheatsheet — so a value entered once propagates across the whole app.

The product ships as a **single self-contained binary**: a React + TypeScript SPA embedded (`go:embed`) into a Go/Gin/GORM/SQLite backend that serves both the UI and a same-origin REST API, bound to `127.0.0.1`. It is designed to run entirely on the operator's own machine with **zero network egress**.

### 1.2 Target User

- A single **OSCP candidate / professional pentester / red-teamer**, working locally on their own workstation during authorized engagements (proper scope and ROE assumed).
- Comfortable with a terminal, high information density, and keyboard-driven workflows.
- OPSEC-conscious: the tool holds real target IPs and credentials at runtime and must never leak them to the network, and never write variable **values** to disk, without an explicit, deliberate action.
- Single-user, single-host. No multi-user, multi-tenant, or role concerns exist.

### 1.3 Problem It Solves

During an engagement, operational knowledge is normally scattered across throwaway note files, wikis, and shell history, forcing constant context-switching and error-prone manual editing of IPs/ports/creds in every copied command. Cheat removes this by providing a **single source of truth**:

- Each command carries `$TOKEN` placeholders that resolve live from one shared value set — no find-and-replace when the target changes.
- Every methodology step can unfold its linked command in place, with variables already resolved and a copy button, so the operator never leaves the current screen.
- Commands selected across the library compose into named, exportable cheatsheets (per machine / per exam), giving a reproducible, portable record of what was run.

### 1.4 In-Scope Modules (v1)

Four primary modules, reached from a fixed four-tab segmented selector in the top bar. A persistent side panel hosts the variables.

| Module | French label | Responsibility |
|---|---|---|
| Library | **Bibliothèque** | Command catalog over the **18 seeded OSCP categories**, grouped `catégorie → outil`. Search, filters, per-card copy, and selection into cheatsheets. Full CRUD on commands (D6). |
| Methodology | **Méthodologie** | Multiple named roadmaps (create/rename/delete) of phases → checkable steps, with global and per-phase progress and an optional linked command that unfolds in place. Fully editable in an explicit edit mode. Phases and Steps are first-class rows (D5). |
| References | **Références** | External-link library (title, auto-extracted domain, description, tags). Full CRUD (D6); URLs restricted to an `http/https/mailto` allowlist, sanitized on import and on render. |
| Cheatsheet | **Cheatsheet** | **Multiple named cheatsheets** (D1) with a tab bar (create/rename/delete). Each is an ordered composition of selected commands with per-entry notes, reorderable, exportable to Markdown and PDF. |

Cross-cutting in-scope capabilities:

- **Variables panel** — inline add/rename/delete of variable *definitions*; a single global *value* set (D2) shared by all modules.
- **Autosave** — text-field edits persist debounced (~500 ms) per mutated entity; **creations are awaited** (the server mints the ULID before the row is usable), so there are no temp-IDs, no ID reconciliation, and no background retry queue. On failure the UI shows a persistent error banner and retries on the next edit/focus. No "Save" button (D3, revised per R2).
- **Import / Export** — full-dataset JSON export of user content (including variable *definitions*, excluding *values*) and JSON import as a full **REPLACE** with pre-import snapshot and confirmation (D4). REPLACE is the only import mode in v1 (MERGE deferred to v2 — A12).
- **Per-cheatsheet export** — Markdown / PDF, emitting **raw `$TOKEN` by default** (Q99).
- **Optional at-rest encryption** — opt-in, **default OFF** (R5): a passphrase-protected mode that encrypts the persisted free-text surfaces (personal notes, cheatsheet `target`, reference URLs) at rest, intended for engagements on a shared host. By default the DB is stored in clear.
- **First-run seed** — 18 categories plus seeded commands, references, roadmaps, and one default empty cheatsheet (« Cheatsheet — HTB Lab »), all created as ordinary editable/deletable rows (seed is first-run-only; no re-seed on upgrade).
- **Dark / light theme** — `☀ / ☾` toggle; the accent green is re-tuned per theme for legibility.

### 1.5 Out of Scope (explicit)

The following are deliberately excluded from v1 and MUST NOT be implemented:

- **No command execution** — Cheat never runs, spawns, or shells out any command; it only stores, resolves, displays, and copies text.
- **No target connection** — no scanning, no network calls to targets, no live host interaction.
- **No cloud sync / multi-host** — no remote backend, no account server, no synchronization across machines. Portability is achieved solely through manual JSON import/export.
- **No LAN mode, no TLS, no API token** — v1 is localhost-only; the opt-in non-loopback bind, its runtime-generated TLS, and the per-launch bearer token are removed (R1). Remote access, if ever needed, is via an operator-managed SSH tunnel (documented, zero code).
- **No user accounts / auth / multi-user** — single local user; no login, no sessions, no roles. (Loopback bind is the trust boundary; isolation from other local users/processes on a shared host is an OS-level concern — see §12, or the optional at-rest encryption of R5.)
- **No network egress at all** — no telemetry, no CDN, no remote fonts (IBM Plex is self-hosted), no favicon fetching for references, no update checks. A strict CSP enforces this.
- **No mandatory at-rest encryption** — D7 is retained as a decision: encryption is never *forced*, and by default the SQLite DB is stored in clear (no passphrase, no SQLCipher). An **optional** opt-in encrypted mode is available (default OFF, R5; see §1.4). Its original rationale (« nothing sensitive is persisted ») no longer holds as written — see principle 6 and A11.
- **No secret persistence** — variable **values** are never written to SQLite, `localStorage`, or `IndexedDB`. They are memory-only by default; an opt-in per-session `sessionStorage` mirror (default OFF, `$PASS` always excluded, never synced or exported) is available for the current session only (R3).
- **Deferred to v2 (not v1):** switchable value profiles per target, unknown-`$TOKEN` auto-detection, variable typing/validation, per-entry note overrides in cheatsheets, a global cross-category tool view, **JSON import MERGE mode** (v1 ships REPLACE + pre-import snapshot only — A12), **global tag management** (cross-content rename / merge / delete of tags and zero-reference cleanup; v1 keeps per-command / per-reference tag editing — A14), a global **« Mode masqué » / redact mode** (v1 keeps per-line masking via `sensitive` — A26), the **variable-rename cascade** across templates (v1 allows renaming a variable only when it is unreferenced, otherwise delete/recreate; dangling tokens are already visibly flagged — A27), and **Duplicate command**, **Duplicate roadmap** (deep-clone) and **restore-defaults** / partial re-seed (v1 keeps `reset-progress` — A28).

> **Open:** Repository license is not yet locked (proposed default: private/proprietary). Non-blocking for this section. (See §12.12.)

### 1.6 Core Design Principles

1. **Terminal density, not dashboard.** Right angles (0 border-radius), 1px borders, monospace for code/labels/badges, high information density, no superfluous ornamentation. The accent green dresses only active states, selections, and resolved variables.
2. **Variables are the single source of truth.** A value entered once resolves identically in every view. There is one global value set (D2). Definitions live in the DB; values live in memory (with an opt-in per-session `sessionStorage` mirror, default OFF — R3). A `$TOKEN` renders **green only when actually resolved**; a defined-but-empty or undefined token renders in a distinct "dangling/undefined" style (dimmed/dotted), never silently blanked.
3. **Zero context-switch.** Every methodology step unfolds its linked command in place — resolved variables plus copy button — so the operator never changes screen to see or copy the command behind a step.
4. **Dark & light theme.** `☀ / ☾` toggle; the accent green is recomputed per theme so it stays legible on both dark (`--bg #0b0c0f`) and light surfaces. Theme choice is a device-local preference (persisted locally, never on the server).
5. **Frictionless persistence, no explicit save.** Text-field edits autosave debounced (~500 ms). Creations are **awaited** — the server mints the ULID before the entity is usable — so there is no temp-ID reconciliation and no background retry queue; on failure the UI surfaces a persistent error banner and retries on the next edit/focus. No "Save" button (D3, revised per R2).
6. **OPSEC by default — deliberate about what touches disk.** Variable **values** are the only truly ephemeral secret: they are never written to SQLite, and by default live only in memory (with the opt-in per-session `sessionStorage` mirror of R3, default OFF and excluding `$PASS`). File exports emit **raw `$TOKEN` by default**, with an opt-in per-export "resolve variables" toggle; the **clipboard stays resolved** (Copier / Copier tout) as an intentional local paste-to-terminal action (Q99). **However**, the DB does persist free-text content in clear — personal notes, cheatsheet `target` (e.g. « HTB — Sauna 10.10.10.5 »), and reference URLs, which can contain IPs, hostnames, and credentials; even a RAW export always writes `target`. This free-text content is under the operator's responsibility, with full-disk encryption as the baseline mitigation and the optional opt-in at-rest encryption of R5 for shared hosts. D7 is therefore retained only as "no *mandatory* encryption"; its original rationale that "nothing sensitive is persisted" is corrected — **only variable values are never persisted** (A11).
7. **Local-only, zero egress.** Bound to `127.0.0.1` (loopback only); there is no LAN mode and no API token in v1 (R1). Same-origin API; self-hosted IBM Plex fonts; strict CSP; no telemetry.
8. **Desktop-only, strict layout.** A hard `min-width` (~900px) applied to the **content region** (not sidebar + content), so collapsing the sidebar (Q145) reclaims its ~272px before the floor engages; below it the page scrolls horizontally rather than reflowing. No tablet/mobile redesign in v1 (D8, floor lowered per R4). Density and accent constants are fidelity-locked to the approved design and are not exposed as v1 settings.
9. **Stable identity, uniform editability.** All entities carry server-minted ULIDs; Phases and Steps are first-class rows with stable IDs and `position` (D5), so progression keyed by step ID never corrupts on reorder/delete. Seed rows are ordinary editable/deletable rows, not protected content.

### 1.7 Locked Architecture Recap

- **Frontend:** Vite + React + TypeScript SPA, faithful port of the approved visual system (IBM Plex, right angles, accent `#3ddc97`, dark/light).
- **Backend:** Go + Gin + GORM + SQLite, compiled to a **single binary** that embeds the built SPA via `go:embed` and serves a **same-origin** REST API bound to `127.0.0.1`.
- **IDs:** server-minted **ULIDs** for every entity; seed IDs preserved literally.
- **Persistence model:**
  - *Server (SQLite):* all user content (commands, references, categories, roadmaps, phases, steps, variable **definitions**), personal notes, progression (`done`), cheatsheet composition, and titles/targets. Optionally encrypted at rest (opt-in, default OFF — R5). (The methodology linked-command panel open/closed state is **not** persisted — in-memory React state per A15.)
  - *Device-local:* theme, last active view/roadmap/cheatsheet.
  - *In-memory / per-session only:* variable **values** — never written to SQLite; memory-only by default, with an opt-in `sessionStorage` mirror for the current session (default OFF, `$PASS` excluded, never synced or exported — R3).
- **Persistence sync:** debounced (~500 ms) autosave on text fields; awaited creates (real ULID before use); persistent error banner on failure — no temp-ID reconciliation or retry queue (D3, revised per R2).
- **Import/Export:** JSON REPLACE with automatic pre-import snapshot, confirmation, atomic transaction, and a versioned envelope (D4); export excludes variable values. REPLACE only in v1 (MERGE deferred — A12).
- **Language:** UI, labels, and command examples in **French** (verbatim); all in-repo documentation in **English**.
- **Delivery:** single binary + Dockerfile + Makefile; pushed via gitea.

---
## 2. System Architecture

Cheat is a **single-user desktop web application** delivered as **one self-contained Go binary**. The binary embeds the compiled React/TypeScript SPA (via `go:embed`) and serves it, together with a same-origin REST API, from an HTTP server bound to the loopback interface. There are no external services, no CDN dependencies, and no network egress beyond user-initiated clicks on reference links. The design is governed by four locked decisions: **D7** (no at-rest encryption **by default** — variable *values* are never persisted; free-text such as notes/targets/URLs is under user responsibility with FDE as baseline; an **optional, default-OFF** opt-in encryption exists per §12.6, R5), **D8** (desktop-only strict layout), **Q168** (loopback-only bind — hard-bound to `127.0.0.1`; the earlier LAN opt-in is removed per R1), and **Q174** (self-hosted IBM Plex fonts). Supporting security/deployment decisions (Q171, Q173–Q175, Q178–Q179, Q187, Q190–Q195) are reflected below and detailed in §12. (Q170/Q172 — runtime TLS and per-launch token — are dropped together with LAN mode per R1.)

### 2.1 High-level topology

The system is a two-tier local application collapsed into a single process:

- **Presentation tier** — a Vite-built React + TypeScript **SPA** (static assets: one `index.html`, hashed JS/CSS bundles, self-hosted `woff2` font files). No server-side rendering.
- **Application/data tier** — a **Go + Gin** HTTP server exposing a **same-origin REST API** under `/api`, backed by **GORM over SQLite** (single file on disk). The server also serves the embedded SPA for all non-`/api` routes.

The SPA and the API are served from the **same origin** (same scheme, host, port). This eliminates cross-origin/CORS concerns for the loopback case and lets the browser treat all `fetch` calls to `/api/*` as same-origin requests.

```
                          ┌─────────────────────── PRODUCTION (single binary) ───────────────────────┐
                          │                                                                           │
   ┌──────────────┐       │   ┌───────────────────────── cheat (Go process) ─────────────────────┐   │
   │   Browser    │  HTTP │   │                                                                   │   │
   │  (evergreen  │◄──────┼──►│  Gin HTTP server  ── bind 127.0.0.1 / [::1]:<port> (loopback only) │   │
   │  Chromium /  │ same- │   │      │                        (hard-bound; no LAN mode)            │   │
   │  Firefox     │ origin│   │      ├── GET  /            ──► embedded SPA  (go:embed)            │   │
   │  ESR ≥115)   │       │   │      │        /assets/*        · index.html                       │   │
   │              │       │   │      │                         · hashed JS / CSS bundles          │   │
   │  ┌────────┐  │       │   │      │                         · IBM Plex *.woff2 (self-hosted)   │   │
   │  │  SPA   │  │       │   │      │                                                            │   │
   │  │ React  │  │       │   │      ├── /api/*  (REST, JSON) ─► handlers ─► GORM ─► SQLite file   │   │
   │  │  +TS   │  │       │   │      │                                          (cheat.db)         │   │
   │  └────────┘  │       │   │      │                                                            │   │
   │   in-memory  │       │   │      └── middleware: Host/Origin allowlist · security headers ·   │   │
   │   var VALUES │       │   │                      strict CSP · minimal access log              │   │
   │  device-local│       │   │                                                                   │   │
   │  UI prefs    │       │   └───────────────────────────────────────────────────────────────┘   │
   │ (localStorage)│      │                                                                           │
   └──────────────┘       └───────────────────────────────────────────────────────────────────────┘
          │
          │ user-initiated click on a reference link  ── the ONLY outbound egress (new tab, rel=noopener)
          ▼
   [ external site ]
```

```
                          ┌──────────────────────────── DEVELOPMENT ────────────────────────────┐
                          │                                                                      │
   ┌──────────────┐  HTTP │   ┌─────────────────────┐        proxy /api        ┌─────────────┐   │
   │   Browser    │◄──────┼──►│  Vite dev server    │ ───────────────────────► │  Go/Gin     │   │
   │              │ :5173 │   │  (HMR, TS, React)    │   http://127.0.0.1:8787  │  API+GORM   │   │
   │              │       │   │  serves SPA + fonts  │ ◄─────────────────────── │  +SQLite    │   │
   └──────────────┘       │   └─────────────────────┘                          └─────────────┘   │
                          │   Vite `server.proxy` forwards `/api` → Go; SPA and API stay          │
                          │   same-origin from the browser's point of view (origin = :5173).      │
                          └──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Frontend (Vite + React + TypeScript SPA)

- **Build tool:** Vite. Output is a static bundle (`dist/`) with a single `index.html`, content-hashed JS/CSS chunks, and font assets.
- **Framework:** React + TypeScript, client-side only (SPA). State managed in-app; server communication via `fetch` to `/api/*`.
- **Routing:** lightweight client-side routing (hash or path) for the four top-level tabs and the active roadmap/cheatsheet id, so Back/Forward and refresh (F5) preserve position (per Q165). Search/filter state is **not** placed in the URL (Q180 — no sensitive terms in URLs).
- **Styling:** faithful port of the design system — inline styles + CSS custom properties, IBM Plex typography, square corners, accent `#3ddc97`, dark/light themes. The heavy reliance on inline styles is the reason the CSP must permit `style-src 'unsafe-inline'` (see §2.6, §12.4).
- **Fonts (Q174 — LOCKED, self-hosted):** IBM Plex Sans (400/500/600/700) and IBM Plex Mono (400/500/600) are shipped as **self-hosted `woff2`** files bundled into `dist/` and served by the Go binary. **The Google Fonts `<link>`/`preconnect` tags present in the prototype are removed.** `@font-face` uses `font-display: swap` with system fallbacks. This guarantees **zero external font requests**, including for print/PDF export. No CDN, ever.
- **Clipboard & print:** uses the async Clipboard API (works on `http://localhost` — a secure context; loopback-only bind means no TLS is needed for this) and `window.print()` for client-side PDF export. Relies on `color-mix`, `backdrop-filter`, Clipboard API and HTML5 DnD without polyfills (Q160).
- **No service worker / no PWA (Q192):** the server is already local; a plain served SPA covers offline use once fonts are embedded. A manifest may be added later; not in v1.

### 2.3 Backend (Go + Gin + GORM + SQLite)

- **HTTP framework:** Gin. One router with two concerns:
  1. **API routes** under the `/api` prefix — JSON in/out, ULID server-minted IDs, **debounced field autosave** (~500 ms) on text PATCH plus **awaited creates** (`await POST` → real ULID) per entity (D3, as revised by R2 — no optimistic temp-IDs, no ID reconciliation, no retry queue).
  2. **Static/SPA fallback** — all other GET routes serve the embedded SPA (SPA history fallback: unknown non-`/api` paths return `index.html`).
- **ORM & storage:** GORM over **SQLite**, a **single database file** (default `cheat.db`). The DB path is **configurable via flag/env** (`--db` / `CHEAT_DB`) so each engagement can live in its own directory (Q187). No in-app multi-workspace switcher in v1.
- **SQLite driver:** a **pure-Go driver** (e.g. `modernc.org/sqlite`) is used — **no CGO** — to keep cross-compilation (Linux → Windows) trivial (Q190). (If the optional at-rest encryption of R5 is adopted, a pure-Go SQLCipher-compatible driver is used so the no-CGO property is preserved; see §12.6.)
- **Embedding:** the built SPA (`dist/`) is embedded with `go:embed` into the binary at compile time and served from an `embed.FS`. The binary is fully self-contained; no sidecar files are required to run beyond the SQLite DB it creates on first launch.
- **First-run seeding:** on first launch against an empty DB, the curated OSCP dataset is seeded (18 categories, seed commands/roadmaps/references) as ordinary editable rows; the six standard variables are seeded **empty** (no `$PASS` placeholder) (Q188). Seeding is **first-run only** — never re-seeded on upgrade (Q133).
- **Logging (Q178 — release builds):** GORM logger set to **Silent**; Gin access log **minimal** (method, path, status, latency only) with **no request/response bodies, no query params, no bound SQL parameters**. Variable/command/note content must never be logged.
- **Versioning (Q194):** an embedded version string is compiled into the binary. **No auto-update, no update-check ping.** Releases are distributed manually via gitea.

### 2.4 Single-binary packaging & build

| Artifact | Content |
|---|---|
| `cheat` (binary) | Go server + embedded SPA (`go:embed` of `dist/`) + embedded IBM Plex `woff2` + seed dataset |
| `cheat.db` | SQLite DB, created on first launch at the resolved DB path (not shipped) |

- **Build order:** `vite build` → `dist/` → `go build` (embeds `dist/`). Orchestrated by a `Makefile`; a `Dockerfile` produces the binary reproducibly (per delivery conventions, §12.11).
- **Build targets (Q190):** primary **linux/amd64** (plus **linux/arm64**); secondary **windows/amd64**. Pure-Go SQLite driver enables `GOOS`/`GOARCH` cross-compilation without a C toolchain.
- **Release hygiene:** strip debug symbols/metadata from release builds; `.gitignore` excludes `*.db`/`*.sqlite*` and export artifacts (Q183). No binaries/build artifacts committed.

### 2.5 Runtime state topology

State is partitioned across three durability tiers. This partition is the backbone of the OPSEC posture (D7) and dictates what the REST API persists (authoritative field mapping in §10.1).

| Tier | What lives here | Persistence | Rationale / decisions |
|---|---|---|---|
| **Server (SQLite via API)** | Content: commands, references, categories, roadmaps/phases/steps, **variable DEFINITIONS**; per-command notes; methodology progression (`done`); cheatsheet composition + title/target | Durable (DB file) | Q112; **variable VALUES are excluded** — but persisted free-text (notes, cheatsheet `target`, reference URLs) **may contain sensitive strings** (IPs/hosts), see §2.6 |
| **Device-local (browser `localStorage`)** | UI-only prefs: theme, last active view / last active roadmap / last active cheatsheet | Durable, client-side, non-sensitive | Q112 — never holds sensitive data |
| **In-memory (SPA session only)** | **Variable VALUES** (`$IP`, `$LHOST`, `$PASS`, …) | **Never persisted by default** — cleared on every reload. An **opt-in, default-OFF** "keep values for this session" mirror to `sessionStorage` (survives F5/crash, purged on tab close, never exported, `$PASS` excluded) is available per §5.3 (R3) | D2 / structuring decision; single global value set |

Consequences that shape the architecture:

- Variable **definitions** round-trip through the API and JSON export; variable **values** never touch the DB, `localStorage`, IndexedDB, or the JSON export. Resolved (substituted) values are materialized **only** on two explicit local actions: copy-to-clipboard (resolved) and a per-export "resolve variables" opt-in (exports default to **raw `$TOKEN`s**).
- On reload, all resolved views revert to raw tokens until the user re-enters values for the session — unless the opt-in `sessionStorage` mirror (R3, §5.3) is enabled, in which case non-`$PASS` values survive F5/crash for the session.

### 2.6 Security posture (high level)

The trust model is **single user, single machine, loopback**. Accounts, cloud sync and remote multi-node access are explicitly out of scope. Full detail in §12; the essentials:

**Network binding (Q168 — LOCKED, loopback-only per R1)**
- Bind: **hard-bound to `127.0.0.1`** (loopback only; also answers `[::1]` and `localhost`). Not reachable from the network.
- **No LAN mode.** There is no `--bind` to a non-loopback address, no runtime TLS/self-signed certificate generation, and no per-launch bearer token. The entire LAN/TLS/token subsystem is removed (R1): on loopback the Host allowlist plus the Origin/`Sec-Fetch-*` defenses already neutralize CSRF/DNS-rebinding, and a token served in clear would add only marginal defense.
- **Remote access, when genuinely needed,** is the user's responsibility via an **SSH local port-forward tunnel** — the documented fallback, zero application code. Example: `ssh -L 8787:127.0.0.1:8787 utilisateur@hôte`, then browse `http://127.0.0.1:8787` locally.
- **Port (Q195):** default fixed uncommon port (overridable via `--port` / `CHEAT_PORT`). On a port clash, **fail loudly** with a clear message. The final localhost URL is printed at startup.
- **Launch UX (Q191):** foreground process printing its URL; optional `--open` flag opens the default browser. No background service / auto-start.

**Authentication / local isolation**
- On the loopback bind, isolation relies on **OS process/user boundaries** plus the request-origin defenses below. There is **no application-level auth token** (removed with LAN mode, R1). Note (A63): because the loopback server is reachable by any local process/user, it does **not** isolate against other local users on a shared host — that is an **OS-separation concern (out of scope)**, or is mitigated by the opt-in at-rest encryption below (R5).

**CSRF / DNS-rebinding defenses (Q171 — applied on every request)**
- **Host header allowlist:** reject requests whose `Host` is not `127.0.0.1[:port]`, `localhost[:port]`, or **`[::1][:port]`** (A62 — loopback IPv6, needed where `localhost` resolves to `::1`). This neutralizes DNS-rebinding.
- **Origin / `Sec-Fetch-*` checks + required custom header** on state-mutating methods (POST/PUT/PATCH/DELETE): reject cross-origin or forgeable "simple" requests that lack the expected same-origin `Origin`/custom header.

**Data at rest (D7 — LOCKED: no encryption by default; A11 rationale fix; R5 optional opt-in)**
- The DB persists **variable DEFINITIONS (never their values)** *and* free-text that **can contain sensitive material** — per-command notes, cheatsheet `target` (e.g. « HTB — Sauna 10.10.10.5 »), and reference URLs (which may embed IPs/hosts). Resolved variable values (target IPs, `$PASS`, etc.) live in memory only and are never written to disk.
- **Rationale correction (A11 — prominent caveat):** the earlier justification "no sensitive data is persisted" was scoped wrong. Only variable **VALUES** are guaranteed absent from disk; the free-text surfaces above are persisted **in clear**, and even a RAW export always writes `target`. Free-text content is therefore **the user's responsibility**.
- **Baseline mitigation:** OS full-disk encryption plus `.gitignore` protection of the DB/exports (Q183).
- **Optional at-rest protection (R5 — opt-in, default OFF):** for engagements on a shared jump-box, an optional **passphrase-encrypted database** (pure-Go SQLCipher-compatible driver, or application-level encryption of the `notes`/`target`/`url` fields) MAY be enabled. Default remains **OFF**; when OFF, FDE is the sole mitigation. When enabled, a passphrase is required to unlock the DB at launch; there is still **no auto-lock** and no further passphrase lifecycle in v1 (Q184/Q186 remain N/A for the default path). Details in §12.6.

**Zero network egress (Q175 — hard requirement)**
- No telemetry, analytics, crash reporting, update pings, or CDN calls. Fonts are self-hosted (§2.2). The **only** permitted outbound traffic is a user clicking a reference link, opened with `rel="noopener noreferrer"` under `Referrer-Policy: no-referrer` (Q85). Enforced in build review.

**Content-Security-Policy (Q173) & security headers (Q179)** — sent by the Go server for the embedded SPA (full directive list in §12.4):

| Header | Value | Purpose |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` | Self-only; `'unsafe-inline'` on `style-src` is required by the inline-style port; **no external hosts** (forces self-hosted fonts) |
| `X-Content-Type-Options` | `nosniff` | Block MIME sniffing |
| `Referrer-Policy` | `no-referrer` | No referrer leakage on outbound clicks |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), interest-cohort=()` (and similar) | Disable unused powerful features |
| `X-Frame-Options` / `frame-ancestors 'none'` | — | Anti-clickjacking |

### 2.7 Layout constraints (D8 — LOCKED)

- **Desktop-only, strict.** A **hard minimum width (~900px)** is enforced, applied to the **content region** (not sidebar + content), so collapsing the left sidebar (Q145) reclaims its 272px before the floor is hit (per R4, which lowered the earlier ~1024px floor to preserve the side-by-side "copy here, paste in terminal" usage on ~1366px laptops). Below the floor the app **scrolls horizontally** rather than reflowing — no mobile/tablet redesign in v1. This is an architectural constraint on the whole CSS surface: components assume the fixed three-region shell (53px top bar, 272px left sidebar, main content) and are not built to collapse responsively. (Full visual contract in §11.)

### 2.8 Development topology

- **Two processes in dev:** Vite dev server (HMR, TS transpile, port `5173`) and the Go/Gin API (port `8787`).
- **Proxy:** Vite's `server.proxy` forwards `/api` → the Go server (`http://127.0.0.1:8787`). From the browser's perspective everything is same-origin (origin `:5173`), so no CORS config is needed and the same `fetch('/api/...')` code path works unchanged in dev and prod.
- **Prod parity:** in production the same `/api` paths are served by the Go binary directly (no proxy); the SPA is the embedded build rather than Vite-served. Application code is identical across both topologies.

> **Open:** whether the dev proxy target port (`8787`) should be fixed or read from `CHEAT_PORT` for the dev workflow — cosmetic, does not affect the locked architecture.

---
## 3. Data Model (GORM / SQLite)

This section is the **authoritative schema** for the Go/GORM/SQLite backend. It defines every persisted entity, its columns/types/constraints, the relationship graph, cascade rules, uniqueness, ordering, and the seed governance model. It also states explicitly what is **never** persisted.

Locked decisions reflected here: **D1, D2, D5, D6, D7** and **Q1–Q11, Q14, Q17–Q19** (core), plus the data-layer facets of **Q20, Q22, Q24, Q25, Q27, Q28, Q29, Q90, Q95, Q97, Q102, Q112, Q113, Q116, Q133, Q135, Q142**.

---

### 3.1 Global conventions

- **Primary keys — server-minted ULID, `TEXT` column (D5, Q1).** Every entity's PK is a `TEXT` column holding a 26-char Crockford-base32 ULID minted by the backend on `POST`. Clients never mint IDs. The column type is plain `TEXT` (not length-checked) so that **seed rows keep their literal short IDs verbatim** (e.g. command `n1`, roadmap `services`) while all user-created rows get ULIDs. `Date.now()`/count keys from the prototype are abolished.
- **Seed IDs are preserved literally (D5, Q18).** Seed data ships with stable literal IDs; `Step.commandId` references to seed commands (`n1`, `s2`, …) resolve because those exact IDs are inserted. Seed rows are otherwise ordinary, fully editable/deletable rows (Q18).
- **Timestamps (Q142, Q115).** Every content entity carries `createdAt` and `updatedAt` (`DATETIME`, stored ISO-8601 UTC via GORM `autoCreateTime`/`autoUpdateTime`). `createdAt` is the v1 ordering key for collections that are not user-reorderable (references, roadmap/cheatsheet tab order — §3.7); `updatedAt` records the last write. **Both are serialized in the JSON export envelope and preserved verbatim on import** — the import transaction disables `autoCreateTime`/`autoUpdateTime` so a REPLACE round-trips ordering deterministically instead of re-stamping every row to import time (A6, Q139).
- **`position` columns.** Integer (`INTEGER NOT NULL`), a **dense contiguous** ordering key (`0..n-1`) within a parent scope, **reassigned across the affected sibling set on every reorder commit** (A47). There is no gap/midpoint numbering scheme: "midpoint insertion" refers only to the *visual* drop indicator shown during DnD, never to the stored value. See §3.7 for exactly which collections are user-reorderable in v1 vs. reserved-for-forward-compat.
- **Tags (Q6).** `tags` is a JSON array of lowercase strings stored in a single `TEXT` column (GORM `serializer:json`), **not** a join table. Command tags and Reference tags share the same normalization rules but are stored independently per row. The tag filter scans commands only (Q6, Q42).
- **`desc` naming caveat.** `DESC` is a SQL keyword; map the Go field `Description` to column `description`. The **JSON/API and domain field name is `desc`** (used uniformly on the wire and in the export envelope).
- **SQLite pragmas (Q116).** Open with `journal_mode=WAL`, `busy_timeout=5000`, and **`foreign_keys=ON`** (required — the cascade rules below rely on FK enforcement). Writes are serialized by an **application-level write mutex** wrapping each write transaction, **not** `MaxOpenConns=1` (A48): a single connection would serialize reads behind writes and defeat WAL's concurrent-reader benefit; the write mutex leaves reads concurrent.
- **Single-instance lock (A58).** A lockfile (`flock` on `<db>.lock`) keyed on the **resolved DB file path** guards against a second process opening the same database. This is keyed on the DB path, not the listening port — two instances bound to different ports but pointing at the same DB file would otherwise corrupt WAL.
- **Migrations (Q119, A32).** GORM `AutoMigrate` is used **only for additive changes** (new tables/columns — including re-adding a column that was deferred out of v1 when its feature ships). Any constraint or column change `AutoMigrate` cannot express safely goes through an **explicit numbered migration**: take a pre-migration backup, toggle `foreign_keys=OFF` *outside* a transaction (SQLite cannot change this pragma inside one), apply the change, run `PRAGMA foreign_key_check`, then restore `foreign_keys=ON`. The `schema.version` `Setting` row tracks the applied migration level. Never destroy user data.
- **REPLACE insert order (A31).** A REPLACE import runs under `foreign_keys=ON` and inserts in a deterministic **parent→child order** — categories → commands → notes → references → roadmaps → phases → steps → cheatsheets → entries → variables — (or wraps the load in `PRAGMA defer_foreign_keys=ON`) so no child row is ever inserted before its parent. Full import/repair semantics live in §10.

---

### 3.2 Entity catalog

#### 3.2.1 Category (Q3, Q4, Q11, Q17, Q135)

Single first-class table for **both** built-in and custom categories (Q4). All 18 built-ins are persisted rows (Q135), so an export is self-contained.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; built-ins keep literal keys (`infogathering`, `winpriv`, …) |
| `label` | TEXT | NOT NULL, **UNIQUE (case-insensitive)** | Q8: enforced via unique index on `lower(label)` |
| `color` | TEXT | NOT NULL | Hex `#rrggbb`. Default = next palette color round-robin; manual override allowed (Q11) |
| `isBuiltin` | BOOLEAN | NOT NULL, default `false` | Governance flag: built-ins are non-deletable, rename/recolor allowed (Q17). **Derived, not trusted from import — see below (A8)** |
| `position` | INTEGER | NOT NULL | Curated display order; seeds occupy positions 0–17 (Q48) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- Custom-category default-color palette (Q11), assigned round-robin by creation order: `#22d3ee`, `#e879f9`, `#fb923c`, `#4ade80`, `#f43f5e`, `#818cf8`, `#eab308`, `#2dd4bf`.
- **Canonical baseline & derived `isBuiltin` (A8).** The 18 built-in categories (§3.3) form a canonical baseline that is **reasserted by literal ID** in the same transaction after any REPLACE import or factory reset, so a hand-edited envelope can never leave the vault without its built-ins (which would break the resolver, the `utilities` fallback, and non-deletable governance). `isBuiltin` is **derived** from canonical identity — `id ∈` the 18 built-in keys — and the envelope's `isBuiltin` value is **ignored on import**: it cannot be used to make a built-in deletable, nor to forge an indestructible custom row.

#### 3.2.2 Command (Q5, Q6, Q9, Q10, Q14, Q102)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; seed commands keep literal IDs (`n1`, `s1`, `f2`, …) |
| `categoryId` | TEXT | NOT NULL, FK → `categories.id` | Required (§3.6, A45); `ON DELETE RESTRICT` at app layer (Q17); imported unknown key → "Autre" fallback (Q52, A44) |
| `tool` | TEXT | NOT NULL, default `'Divers'` | Free-text column (Q5); trimmed, case-insensitive grouping, first-seen casing kept (Q46). No `tools` table |
| `title` | TEXT | NOT NULL | Required (Q9) |
| `template` | TEXT | NOT NULL | Multi-line command body; the only field variable substitution applies to (Q34) |
| `desc` | TEXT | NULL/`''` | Optional (Q9). Column `description`; wire name `desc` |
| `tags` | TEXT (JSON `[]string`) | NOT NULL, default `[]` | Lowercase, deduped, `#` stripped, no commas (Q47) |
| `language` | TEXT | NULL | Optional per-command fenced-code language hint for Markdown export (Q102); e.g. `powershell`. Null ⇒ bare fence (§9.6) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **No `position` column in v1 (A21).** The library sort is alpha-by-title with a created-at tiebreak (Q48, §3.7); the reserved `position` column is dropped and re-added via `AutoMigrate` if manual command reordering ever ships.
- **On delete (Q14) — allowed, with reference count in the confirm dialog:**
  1. Every `Step.commandId` pointing at it is set `NULL` (step text kept) via the **FK `ON DELETE SET NULL`** (A64).
  2. Every `CheatsheetEntry` referencing it is deleted (**FK `ON DELETE CASCADE`**).
  3. Its `Note` row (if any) is deleted (**FK `ON DELETE CASCADE`**).
- **Imported unknown `categoryId` → "Autre" fallback (Q52, A44).** When an import references a category ID absent from the vault, the command is reassigned to a single fallback category with **literal ID `autre`** (stable round-trip), a **fixed gray color** (the `utilities` gray), `isBuiltin=false`, and `position = max+1`. It is **not** one of the 18 seeds and is **created on demand** the first time it is needed. (Distinct from the *deletion* reassignment fallback, which targets `utilities` — §3.3.)

#### 3.2.3 Reference (Q6, Q9, Q16)

Standalone entity (no FK), CRUD-complete (D6). **No `position` column** — ordered by `createdAt` (Q10).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; seeds `r1`–`r6` literal |
| `title` | TEXT | NOT NULL | Default = domain if empty (Q87). Duplicates allowed (Q8) |
| `url` | TEXT | NOT NULL | Validated against URL parser; allowlist `http`/`https`/`mailto`; normalized-URL duplicate blocked (Q77–Q80). Uniqueness is a validation rule, not a DB constraint |
| `desc` | TEXT | NULL/`''` | Optional (Q9). Column `description`; wire name `desc` |
| `tags` | TEXT (JSON `[]string`) | NOT NULL, default `[]` | Same normalization as Command tags (Q47) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **Derived, non-editable:** `displayDomain` (§8.1) is computed server-side from `url`; not a user-set column beyond `url`.
- **On delete (Q16):** immediate delete with undo toast; no dependents.

#### 3.2.4 Roadmap (Q2, Q10, Q19)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; seeds `services`, `web`, `ad`, `privesc` literal |
| `label` | TEXT | NOT NULL | Duplicate names warned, not blocked (Q75) |
| `position` | INTEGER | NOT NULL | Reserved; v1 tab order = creation order (Q68) — see §3.7 |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **On delete (Q19):** **FK `ON DELETE CASCADE`** → `phases` → `steps`. All progression (`Step.done`) vanishes with the step rows; no orphan resurrection (D5 stable IDs).

#### 3.2.5 Phase (Q2, Q10, Q19)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; first-class row with stable ID (D5, Q2) |
| `roadmapId` | TEXT | NOT NULL, FK → `roadmaps.id` | `ON DELETE CASCADE` |
| `label` | TEXT | NOT NULL | Duplicate phase names allowed (Q75) |
| `position` | INTEGER | NOT NULL | **User-reorderable** (↑/↓ + DnD). Dense contiguous, reassigned on commit; "midpoint" is only the visual drop indicator (A47, Q71–Q73) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **On delete:** **FK `ON DELETE CASCADE`** → `steps` (toast undo per Q70).

#### 3.2.6 Step (Q2, Q7, Q19, Q113, Q58)

First-class row with stable ID (D5, Q2). The prototype's positional `checks`/`openSteps` keying is abolished; **completion (`done`) lives on the step row**, keyed by stable step ID. The linked-command panel open/closed state (prototype `openSteps{}`) is **not** persisted — it is transient React view state (A15), like the library sidebar accordion (§3.10).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; stable — fixes the check-resurrection bug (Q2, Q19) |
| `phaseId` | TEXT | NOT NULL, FK → `phases.id` | `ON DELETE CASCADE`. Cross-phase move = reassign `phaseId` + `position` (Q58) |
| `text` | TEXT | NOT NULL | Inline-editable in edit mode (Q59) |
| `commandId` | TEXT | **NULLABLE**, FK → `commands.id` | Renamed from prototype `note`; explicit 0..1 link (Q7). **FK `ON DELETE SET NULL`** (Q14, A64) |
| `done` | BOOLEAN | NOT NULL, default `false` | Persisted progression (`checks{}` in the prototype), keyed by stable step ID (Q113, D5) |
| `position` | INTEGER | NOT NULL | **User-reorderable** intra- and cross-phase. Dense contiguous, reassigned on commit (A47, Q58, Q71–Q73) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- The prototype's per-step panel `expanded` flag is **not a column** (A15): open/closed is in-memory React state, resolving the former §4.5 open item and removing a class of autosave traffic.
- A per-step free note is **out of scope v1** (Q65).

#### 3.2.7 Variable (definition) (D2, D7, Q20, Q22, Q24, Q25, Q29)

**Definitions only. VALUES ARE NEVER PERSISTED (D2, D7) — see §3.10 and §5.** This table stores the ordered set of variable *definitions*; the single global value set lives in browser memory only.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; the 6 built-ins may keep literal keys equal to their name |
| `name` | TEXT | NOT NULL, **UNIQUE (case-insensitive)** | Bare name, no `$`. Grammar `[A-Z_][A-Z0-9_]*`, auto-uppercased, ≥1 letter, cap ~24 chars; the 6 standard names are reserved for custom (Q22, Q24) |
| `isBuiltin` | BOOLEAN | NOT NULL, default `false` | The 6 standard vars: value-editable only, non-rename/non-delete, fixed at top (Q25). **Derived, not trusted from import — see below (A8)** |
| `sensitive` | BOOLEAN | NOT NULL, default `false` | Masks the value input AND excludes the value from export metadata (`$PASS` etc.) (Q100, Q176) |
| `position` | INTEGER | NOT NULL | Built-ins at fixed top positions; custom appended in creation order (Q25) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **Dropped columns (v1).** `type` (always `text`, reserved for future soft validation) is removed (A21), and `hidden` (row-visibility toggle) is removed (A19): with ≤6 built-ins plus a few customs, hiding rows solves no real problem, and dropping `hidden` also neutralizes the "masked variable with no way to reveal it" trap (§5.5). Only `sensitive` (value masking + export exclusion) is retained. Either column can return via `AutoMigrate` if a future feature needs it.
- **Canonical seed order (D5 recap, Q25) — positions 0–5:** `IP`, `LHOST`, `LPORT`, `USER`, `DOMAIN`, `PASS`. (This follows §4/§5; the prototype `varMeta` order `…USER, PASS, DOMAIN` is superseded.) All 6 seed with `isBuiltin=true`, `sensitive=true` for `PASS` only.
- **Derived `isBuiltin` (A8).** As with categories, `isBuiltin` is **derived** from canonical identity — `name ∈` the 6 standard variable names — and the envelope value is **ignored on import**. The 6 standard variables are reasserted (by name) in the import transaction after REPLACE/factory-reset, so the resolver and governance can never be stripped by a hand-edited envelope.
- **Rename (Q27, A27) — cascade deferred.** In v1 a variable rename is allowed **only when the variable is unreferenced** by any `Command.template`. If it is referenced, rename is blocked; the user deletes and recreates instead (dangling tokens are already surfaced as unresolved, §5.10). The transactional `$OLDNAME`→`$NEWNAME` template rewrite and its updated-command count are **deferred to v2**.
- **Delete (Q28):** custom vars only; allowed with a referencing-command count warning. Tokens are left in templates and render as "dangling/undefined" (unresolved). No DB cascade.

#### 3.2.8 Cheatsheet (D1, Q10, Q89, Q90, Q92)

Multiple named cheatsheets (D1), reusing the roadmap tab CRUD UX.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID |
| `title` | TEXT | NOT NULL | Prototype `sheetTitle` per sheet |
| `target` | TEXT | NULL/`''` | Prototype `sheetTarget` (e.g. "HTB — Sauna"); optional |
| `position` | INTEGER | NOT NULL | Reserved; v1 tab order = creation order (mirrors roadmaps, Q68) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- Composition is persisted (as `CheatsheetEntry` rows) and round-trips through export (Q92).
- Resolution uses the **single global value set** (D2, Q90) — no per-sheet value snapshot in v1.
- **On delete:** **FK `ON DELETE CASCADE`** → `cheatsheet_entries` (Q19).

#### 3.2.9 CheatsheetEntry (D1, Q10, Q92, Q95, Q98)

Join row = one command placed in one cheatsheet, with manual flat ordering.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID |
| `cheatsheetId` | TEXT | NOT NULL, FK → `cheatsheets.id` | `ON DELETE CASCADE` |
| `commandId` | TEXT | NOT NULL, FK → `commands.id` | `ON DELETE CASCADE` (Q14) |
| `position` | INTEGER | NOT NULL | **User-reorderable** flat order via ↑/↓. Dense contiguous, reassigned on commit (A47, Q98) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- The reserved per-entry `note` override column is **not present in v1** (A21, Q95): v1 always displays the shared per-command `Note` (§3.2.10). The column is re-added via `AutoMigrate` when the per-entry override feature ships (v2).
- Recommended composite unique index on `(cheatsheetId, commandId)` to prevent adding the same command twice to one sheet.

#### 3.2.10 Note (per-command) (Q95, Q97, Q14)

Single personal note per command, shared everywhere it appears (library card + cheatsheet entry) in v1 (Q95). Stored as a separate map keyed by command ID (Q97), **not** a column on Command.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `commandId` | TEXT | **PK**, FK → `commands.id` | Natural key = command ID; 1:1 with Command. `ON DELETE CASCADE` (Q14) |
| `text` | TEXT | NOT NULL | The note body |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- Deliberate exception to the ULID-PK convention: the note's identity **is** its command ID (Q97 "map keyed by id"). Serialized in the JSON export as a map `{ commandId: text }`; orphans purged on command delete (Q14). On import, a `notes` entry keyed to a missing command is dropped and reported in `warnings` (§10.4.4), so it cannot abort the FK-enforced REPLACE transaction (A9).

#### 3.2.11 Setting (server metadata) (Q112, Q119, Q133)

Generic key/value store for **server-side singletons and governance metadata**. Note: UI prefs (theme, default/last view, last active roadmap/cheatsheet) are **device-local (localStorage), NOT here** (Q112, §3.10).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `key` | TEXT | **PK** | Namespaced key |
| `value` | TEXT (JSON) | NOT NULL | JSON-encoded scalar/object |
| `updatedAt` | DATETIME | NOT NULL | |

Known v1 keys:

| Key | Value | Purpose |
|---|---|---|
| `schema.version` | integer | Migration tracking (Q119, A32) |
| `db.initialized` | boolean | First-run marker gating one-time seeding — the **sole** seeding condition (Q133, A7) |

- The `seed.version` key is **removed** (A24): with the seed-pack distribution mechanism cut from v1, there is no seed version to display or track.

---

### 3.3 The 18 built-in categories (verbatim from the design — canonical)

Seeded always, positions 0–17 in this exact order (Q3). Hidden in the sidebar when they contain zero commands (display rule only); always listed in the add-command form (Q3). All rows have `isBuiltin` **derived** as true from their canonical `id` (A8).

| position | key (`id`) | label (FR/EN verbatim) | color |
|---|---|---|---|
| 0 | `infogathering` | Information gathering | `#5e9bff` |
| 1 | `vulnscan` | Vulnerability scanning | `#38bdf8` |
| 2 | `webapps` | Web applications | `#c084fc` |
| 3 | `clientside` | Client-side attacks | `#f0abfc` |
| 4 | `avevasion` | Antivirus Evasion & Metasploit | `#a3e635` |
| 5 | `passwords` | Password attacks | `#f472b6` |
| 6 | `winpriv` | Windows privilege escalation | `#facc15` |
| 7 | `linpriv` | Linux privilege escalation | `#fb923c` |
| 8 | `portredir` | Port redirection and manual tunneling | `#2dd4bf` |
| 9 | `tunneling` | Tunneling through tools | `#22d3ee` |
| 10 | `adtheory` | Active Directory theory | `#818cf8` |
| 11 | `adenum` | Active Directory enumeration | `#f0883e` |
| 12 | `adattack` | Active Directory attacking | `#fb7185` |
| 13 | `adlateral` | Active Directory lateral movement | `#e879f9` |
| 14 | `cloud` | Cloud infrastructure | `#60a5fa` |
| 15 | `reports` | Reports writing | `#94a3b8` |
| 16 | `filetransfers` | File transfers | `#4ade80` |
| 17 | `utilities` | Utilities | `#cbd5e1` |

> **Open:** the AV-evasion label is used verbatim as the design's reconciled string (`Antivirus Evasion & Metasploit`, Q3). If a different reconciled wording was intended it can be adjusted at seed time without schema change.

These 18 keys are the canonical identity set that drives derived `isBuiltin` and the post-REPLACE baseline reassertion (§3.2.1, A8). `utilities` doubles as the **deletion** reassignment fallback target when a custom category is deleted (Q17); the separate **import** unknown-key fallback is the on-demand `autre` category (§3.2.2, A44).

---

### 3.4 Relationship & cascade matrix

| Parent → Child | FK column | On parent delete | Decision |
|---|---|---|---|
| Category → Command | `commands.categoryId` | **RESTRICT** (block if non-empty; offer reassign to `utilities`; built-ins never deletable) | Q17 |
| Command → Step (link) | `steps.commandId` (nullable) | **SET NULL** (keep step text) | Q7, Q14, A64 |
| Command → CheatsheetEntry | `cheatsheet_entries.commandId` | **CASCADE** | Q14 |
| Command → Note | `notes.commandId` | **CASCADE** | Q14 |
| Roadmap → Phase | `phases.roadmapId` | **CASCADE** | Q19 |
| Phase → Step | `steps.phaseId` | **CASCADE** | Q19 |
| Cheatsheet → CheatsheetEntry | `cheatsheet_entries.cheatsheetId` | **CASCADE** | Q19 |

- Deleting a Roadmap cascades Phase→Step; all `Step.done` state disappears with the rows (no separate checks table to garbage-collect) — this is the structural fix for the prototype's resurrection bug (Q19, D5).
- `Step.commandId` on command delete is the **FK-level `ON DELETE SET NULL`** (A64), consistent with `foreign_keys=ON` — not an application-layer step.
- Variable rename/delete are **application-layer** operations, not FK relationships: v1 rename is allowed only when unreferenced (else delete/recreate), and delete warns-and-allows leaving dangling tokens (Q27, Q28, A27).

---

### 3.5 Uniqueness & validation constraints (Q8, Q24, Q80)

| Entity | Constraint | Enforcement |
|---|---|---|
| Category | `label` unique, case-insensitive | DB unique index on `lower(label)` (Q8) |
| Variable | `name` unique, case-insensitive; reserved 6 standard names; grammar `[A-Z_][A-Z0-9_]*`; ≥1 letter; ≤~24 chars | DB unique index on `lower(name)` + app validation (Q22, Q24) |
| CheatsheetEntry | `(cheatsheetId, commandId)` unique | DB composite unique index (recommended) |
| Reference | normalized-URL duplicate blocked | App-layer validation, not a DB constraint (Q80) |
| Command | title/template/categoryId required (A45); `(tool, title, template)` exact duplicate **warned, not blocked** | App-layer (Q9, Q54) |
| Roadmap | duplicate label warned, not blocked | App-layer (Q75) |

All other labels/titles/URLs may duplicate freely (Q8).

---

### 3.6 Required vs optional fields (Q9)

- **Command:** `title`, `template`, `categoryId`, `tool` NOT NULL (`tool` defaults `'Divers'`); `desc`, `tags`, `language` optional (empty/null defaults). `template` is multi-line TEXT. `categoryId` is **required at the API** (`VALIDATION_FAILED` if absent) — there is no "default info-gathering" fallback (A45).
- **Reference:** `title`, `url` NOT NULL; `desc`, `tags` optional.
- All `tags` columns default to `[]`, never NULL.

---

### 3.7 Ordering & `position` semantics (Q10, Q48, Q68)

| Collection | v1 behavior | `position` role |
|---|---|---|
| Phases (within roadmap) | User-reorderable (↑/↓ + DnD) | Authoritative, dense contiguous |
| Steps (within phase) | User-reorderable, incl. cross-phase | Authoritative, dense contiguous |
| Cheatsheet entries | User-reorderable, flat ↑/↓ | Authoritative, dense contiguous |
| Categories | Curated seed order (built-ins 0–17); custom appended; manual reorder deferred | Used for display order |
| Commands (within tool) | Sorted alpha by title, created-at tiebreak | **No column** (removed in v1, A21); re-added via AutoMigrate if manual reorder ships |
| Roadmaps / Cheatsheets (tabs) | Creation order | Reserved column (enables future reorder without migration, Q68) |
| References | Creation order (`createdAt`) | No column (Q10) |

Reorders are persisted **once at drop / per ↑/↓ click**, as a single entity update, never on transient `dragover` (Q117). For the reorderable collections, `position` is stored as a **dense contiguous `0..n-1` sequence** reassigned across the affected sibling set on each commit (A47); "midpoint insertion" is only the visual drop indicator, never a stored value. `createdAt` — the ordering key for non-reorderable collections — is preserved verbatim through export/import so this order round-trips deterministically (A6).

---

### 3.8 Seed governance (Q18, Q133, D5)

- **First-run only, single condition (Q133, A7).** Seeding runs in Go at startup **only when `db.initialized` is false** — this single flag is the **sole** seeding condition. No emptiness heuristic is ever used: a REPLACE import or a mass delete does **not** reset `db.initialized`, so an empty-but-initialized vault is a valid terminal state that is never re-seeded. There is no automatic re-seed on binary upgrade. Deleted seed rows stay deleted (no tombstones, no resurrection).
- **Seed rows are ordinary rows (Q18).** All seed content (18 categories, seed commands, 6 references, 4 roadmaps with phases/steps, 6 variable definitions, and one default cheatsheet — empty, titled « Cheatsheet — HTB Lab », with an empty `target`) is inserted as fully editable/deletable rows with the same cascade rules and is exported like any row.
- **Literal seed IDs (D5).** Seed rows use their literal short IDs; `Step.commandId` references (`n1`, `s1`, …) are valid because those exact command IDs are seeded.
- **Governance flags.** `Category.isBuiltin` and `Variable.isBuiltin` mark protected definitions (non-deletable; rename/recolor allowed for categories, value-edit only for the 6 standard vars). Both are **derived** from canonical identity, never trusted from an import envelope (§3.2.1, §3.2.7, A8). There is no generic per-row "is_seed" flag beyond these.
- **Seed-pack distribution is cut from v1 (A24).** There is no importable "seed pack" and no `seed.version` metadata; the only seeding path is the first-run `db.initialized` gate above. Distributing updated seed content is **deferred to v2** (see Open Items).

---

### 3.9 Notes model recap (Q95, Q97)

- **`Note` (per-command, §3.2.10)** — the single shared personal note, authoritative in v1, keyed by command ID, editable from both the library card and the cheatsheet entry (same store, Q96), included in export.
- A **per-entry note override** was the intended v2 extension, but its reserved `CheatsheetEntry.note` column is **not present in v1** (A21, Q95 "override per entry deferred to v2"). The column is re-added via `AutoMigrate` when that feature ships; until then every cheatsheet entry displays the shared per-command note above.

---

### 3.10 What is NOT in the database (D2, D7, Q112)

Explicit non-persistence guarantees. The at-rest guarantee applies precisely to **variable values** (D2, D7): those never touch disk. Free-text surfaces that *are* persisted — notes, cheatsheet `target` (e.g. « HTB — Sauna 10.10.10.5 »), reference `url` — can contain IPs/hosts/credentials and are stored **in clear**; protecting them is the user's responsibility (baseline = full-disk encryption), with an **optional, default-OFF at-rest encryption** available for shared-host engagements (R5, §12.6). The earlier "nothing sensitive is persisted ⇒ no encryption" rationale is corrected accordingly — it was true only of variable values (A11).

- **Variable VALUES — memory only (D2, D7).** The single global value set is held in browser memory, reset on every reload; never written to SQLite, never to localStorage/IndexedDB. Only variable *definitions* (§3.2.7) are persisted. JSON export never contains values; only an explicit cheatsheet export can materialize resolved values (and defaults to raw tokens per Q99).
- **Device-local (localStorage), not DB (Q112):** theme; default/last view; last active roadmap and cheatsheet. Never contains vars/notes/commands.
- **Ephemeral UI (in-memory, not persisted anywhere, Q112):** drag state, modal/draft form state, search query, active filters (category/tool/tag), toast, selection-in-progress, the library sidebar accordion (`expanded{}`) tree state, **and** the methodology step's linked-command panel open/closed state (`openSteps{}`). Neither accordion state is persisted (A15): the step-panel `expanded` column was dropped, so open/closed is transient React state on both surfaces.

Persisted-to-DB content (recap, Q112): categories, commands, references, roadmaps, phases, steps, variable **definitions**, per-command notes, per-step `done` state, cheatsheet composition (entries + order + title/target), and `Setting` metadata.

---
## 4. REST API

The backend is a single Go/Gin binary that embeds the SPA (`go:embed`) and serves it **same-origin** on `127.0.0.1` (loopback) only (Q168). All application data is exchanged over the JSON REST surface below. The SPA hydrates once with `GET /api/state`, then issues per-entity mutations persisted through the debounced-PATCH + awaited-create autosave model (D3, §4.4). SQLite is authoritative; JSON import/export runs server-side (Q132). This section is **authoritative for the REST surface**; module sections (§6–§9) carry harmonized recaps.

> **Hard invariant — variable VALUES never cross this API.** Per D2, D7 and the memory-only decision, only variable *definitions* are persisted and transmitted. No endpoint accepts, returns, or stores a variable value. The dataset export (`GET /api/export`) never contains values. Resolution of `$TOKEN` into concrete values happens only in the SPA (in-memory) and in client-side clipboard/MD/PDF actions.

### 4.1 Conventions

| Aspect | Rule |
|---|---|
| Base path | `/api` (all resources below are relative to it). |
| Transport | HTTP/1.1 over loopback only (`127.0.0.1`, `::1`). There is no LAN/TLS mode in v1 (D8, R1); remote access is a documented SSH-tunnel fallback with zero app code. |
| Media type | Requests and responses are `application/json; charset=utf-8`, except `GET /api/export` (attachment download). |
| Character encoding | UTF-8 everywhere; server normalizes stored text to LF (Q103). |
| IDs | ULID strings, **server-minted** for every entity (D5). Clients never author canonical IDs. Because creates are awaited (§4.4), the client always holds the real ULID before referencing an entity — there are no client-side temporary IDs. Seed rows keep their literal seed IDs. IDs are opaque 26-char Crockford base32 strings. |
| Timestamps | ISO 8601 UTC (`2026-07-15T12:34:56Z`) on the wire and in DB columns (Q142). `createdAt` immutable; `updatedAt` server-set on every write. |
| Field casing | JSON uses `camelCase`. The `desc` field name is used uniformly (never `description`) on the wire. |
| PATCH semantics | JSON Merge Patch: only **present** keys are updated; omitted keys are unchanged; `null` explicitly clears a nullable field. Array fields (e.g. `tags`) are **replaced wholesale**, not merged. **Implementation constraint (A1):** the server decodes the PATCH body into `map[string]json.RawMessage` (or per-field pointers) to distinguish *absent* vs *present-null* vs *present-false/empty*, then builds the GORM update from **only the present keys** (a `map[string]any` update or `.Select(presentKeys)`). The naïve `db.Model(&x).Updates(struct)` path is forbidden because it silently drops Go zero-values, losing `{done:false}` (unchecking a step — the app's most frequent action), `{sensitive:false}`, `{desc:""}`. Acceptance test: *unchecking a completed step persists `false`.* |
| Concurrency | Last-write-wins per entity (Q115); no `If-Match`/version precondition. `updatedAt` is returned as the LWW discriminator (§3.1). There is no active cross-tab sync in v1 (A16). |
| Idempotency | `DELETE` is idempotent: deleting an absent row returns `204`. |
| Pagination | None. Datasets target ~2000 commands (Q189); `GET /api/state` returns everything. |
| Version handshake | The server exposes its embedded build version so a stale cached SPA can detect a mismatch (Q122). Exposed in `meta.appVersion` (state) and the `X-Cheat-Version` response header. |

### 4.2 Request admission (Q168, Q170, Q171, Q179, Q180)

The server is loopback-only (R1): there is no `--bind` to a non-loopback interface, no runtime TLS generation, and no per-launch bearer token. On loopback the Host allowlist plus the Origin / `Sec-Fetch-Site` checks already defeat DNS-rebinding and CSRF, so the former `X-Cheat-Token` subsystem is removed. Every request passes an admission middleware chain **before** routing; rejections short-circuit with a JSON error envelope and never reach a handler.

1. **Host allowlist** — the `Host` header must match a loopback bind: `127.0.0.1:<port>`, `localhost:<port>`, or `[::1]:<port>` (loopback IPv6 — required because `localhost` may resolve to `::1`, A62). Any other value → `403 FORBIDDEN_HOST`. This defeats DNS-rebinding (a rebound hostname will not match the allowlist).
2. **Origin / anti-CSRF on mutating verbs** — for `POST`/`PATCH`/`PUT`/`DELETE`, the request must satisfy at least one of: an `Origin` header equal to the served origin, or `Sec-Fetch-Site: same-origin`. A cross-site `Origin` / `Sec-Fetch-Site` → `403 FORBIDDEN_ORIGIN`. A cross-origin page therefore cannot drive state-changing calls against the local binary.
3. **Security response headers** (Q179) set on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`, and a restrictive `Permissions-Policy`. The strict self-only CSP (Q173) is emitted on the SPA document response (§12.4).

No sensitive data is ever placed in query strings; filtering/search is client-side (Q180). All request payloads that carry content (templates, notes, variable names) travel in request bodies, never in the URL.

### 4.3 Error model

All non-2xx responses use one envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Le titre est requis.",
    "details": [
      { "field": "title", "message": "Le titre est requis." }
    ]
  }
}
```

- `code` — stable machine token (SCREAMING_SNAKE_CASE) the SPA switches on.
- `message` — human-readable, **French** (UI language); safe to surface in a toast/banner.
- `details` — optional array of per-field problems for form validation (400/422).

Server error messages never echo secret-bearing content (Q178). Gin/GORM logging is minimal and excludes bodies/params/SQL args in release builds (Q178).

| Status | When | Representative `code`s |
|---|---|---|
| `200 OK` | Successful `GET`, `PATCH`, `PUT`, reorder, import. | — |
| `201 Created` | Successful entity `POST`. Body = the created entity (with its minted ULID). | — |
| `204 No Content` | Successful `DELETE` (incl. idempotent no-op). | — |
| `400 Bad Request` | Malformed JSON, wrong types, missing required fields, grammar/format violations (incl. URL parse/scheme). | `INVALID_JSON`, `VALIDATION_FAILED`, `SCHEME_NOT_ALLOWED` |
| `403 Forbidden` | Admission chain rejection. | `FORBIDDEN_HOST`, `FORBIDDEN_ORIGIN` |
| `404 Not Found` | Unknown route or referenced parent/entity absent (except idempotent DELETE). | `NOT_FOUND` |
| `409 Conflict` | Uniqueness / integrity violation. | `DUPLICATE_CATEGORY_LABEL`, `DUPLICATE_VARIABLE_NAME`, `DUPLICATE_REFERENCE_URL`, `CATEGORY_NOT_EMPTY`, `BUILTIN_NOT_DELETABLE`, `RESERVED_VARIABLE_NAME`, `VARIABLE_IN_USE` |
| `413 Payload Too Large` | Import body exceeds the configured size cap. | `IMPORT_TOO_LARGE` |
| `415 Unsupported Media Type` | Non-JSON body on a JSON endpoint. | `UNSUPPORTED_MEDIA_TYPE` |
| `422 Unprocessable Entity` | Well-formed but semantically invalid import (bad envelope, incompatible version, dangling internal refs that could not be repaired). | `IMPORT_SCHEMA_INVALID`, `IMPORT_VERSION_TOO_NEW` |
| `500 Internal Server Error` | Unexpected server/DB failure (transaction rolled back). | `INTERNAL` |

### 4.4 Autosave & write semantics (D3, D5, R2, Q111–Q117, Q121)

The SPA is optimistic on the happy path and has **no "Save" button**; the only persistence indicator is **error-only** (D3): nothing is shown on success, and a persistent inline banner appears only when a write ultimately fails (Q196 messaging tiers, §11.6). Per R2 the earlier optimistic temp-ID + retry-queue machinery is replaced by **awaited creates** — appropriate for a single local writer whose round-trip is sub-millisecond and effectively never fails.

**Write categories and timing**

- **Field edits (`PATCH`)** are debounced ~500 ms **per entity** (D3/Q111). Multiple edits to the same entity within the window coalesce into a single `PATCH` carrying the latest values of the changed fields (built as a present-keys map, §4.1/A1). Different entities have independent timers and flush in parallel.
- **Creates (`POST`) are awaited (R2).** The SPA issues the `POST` and **awaits the `201`** to obtain the server-minted ULID before the new entity can be referenced (e.g. as a step's `phaseId`, or a cheatsheet entry's `sheetId`). A child that lives inside a brand-new parent simply awaits the parent's real ULID first. This eliminates client temp-IDs (`tmp_…`), ID reconciliation, and the dependency-ordering write queue — a `tmp_` id never exists and never appears in a URL path.
- **Deletes (`DELETE`) that offer undo** (references §8.9, phases, steps) are **deferred client-side** until the undo/toast window closes (A2): the row is removed optimistically, "Annuler" is a pure client no-op with **no round-trip**, and the `DELETE` is sent only once the undo window expires. This replaces the contradictory "recreate the row with its previous IDs" model. Deletes with no undo affordance are sent immediately.
- **Reorders** are persisted exactly once, **on drop / on ↑↓ click**, as a single reorder call — never on transient `dragover`/`dropIndex` changes (Q117); rapid successive reorders coalesce so only the final order flushes (A41).
- **Modal-based create/edit** (commands §6, references §8) commit on modal submit and surface validation errors inline (the awaited call resolves before the modal closes), rather than fire-and-forget.

**Optimism, failure, and retry (R2, Q114)**

- UI updates apply immediately; there is no rollback for single-user local use (Q114).
- On a failed write there is **no background backoff queue**. The SPA shows the persistent error banner and **retries the pending write on the next edit or on window focus**. This keeps the "no Save button" UX (the spirit of D3) without distributed-systems retry machinery.
- Pending writes are **in-memory only**; per Q112, command/note/variable content never touches `localStorage`/`IndexedDB` (§10.2.2).
- **Flush on unload:** if a debounced `PATCH` is still pending when the tab unloads (`visibilitychange`→hidden / `pagehide`), the SPA flushes it with `fetch(url, { keepalive: true, headers: { 'Content-Type': 'application/json' } })`. `navigator.sendBeacon` is **not** used — it cannot set the JSON content type (A3). Awaited creates leave nothing pending; deferred deletes are flushed the same way.

**Concurrency (Q115, Q116, A16)**

- A single local binary is the sole writer; SQLite writes are serialized (WAL + `busy_timeout` + write mutex — §10.2.4) so no `SQLITE_BUSY` surfaces to the client. `updatedAt` is returned on every write as the last-write-wins discriminator (Q115). There is **no active cross-tab sync** in v1 (A16 removed BroadcastChannel/storage/focus-refresh); a second tab reflects another tab's changes only on manual reload / re-hydration.

### 4.5 `GET /api/state` — full hydration

Returns the entire persisted dataset in one document. Called once on load; the DB is seeded in Go at startup only on first run, gated by the `db.initialized` flag (Q118, Q133, §10.5.1). **Contains no variable values.** All module reads are served from this single hydration payload; module-scoped collection GETs, where mentioned in §5–§8, are granular conveniences over the same data.

`200 OK`

```json
{
  "meta": {
    "schemaVersion": 7,
    "appVersion": "1.0.0",
    "generatedAt": "2026-07-15T12:34:56Z"
  },
  "categories": [ /* Category[] */ ],
  "commands": [ /* Command[] */ ],
  "references": [ /* Reference[] */ ],
  "roadmaps": [ /* Roadmap[] with nested phases[].steps[] */ ],
  "cheatsheets": [ /* Cheatsheet[] with nested entries[] */ ],
  "variableDefinitions": [ /* VariableDefinition[] — definitions only */ ],
  "notes": { "<commandId>": "note libre…" }
}
```

Ordering in the payload:
- `categories` by `position`; `commands`/`references`/`roadmaps` by `createdAt` (Q10). `phases`, `steps`, and cheatsheet `entries` by `position`.
- `notes` is a map keyed by command id (Q95/Q97; per-entry note override deferred to v2 — the v1 note is a single per-command note).
- Device-local UI prefs (theme, last view, active roadmap/cheatsheet) are **not** in this payload — they live in `localStorage` (Q112). There is **no server-persisted `settings` object** in v1 (§4.8, A18).
- `step.expanded` (which methodology linked-command panels are open) is **ephemeral in-memory React state** (A15) — it is not a DB column, is not carried on this payload, and is not exported (mirrors the already-ephemeral library sidebar accordion, §3.10).

### 4.6 Entity resource reference

Entity JSON shapes (response bodies). All timestamps ISO 8601 UTC.

**Category** (Q3, Q4, Q11, Q17)
```json
{ "id": "infogathering", "label": "Information gathering", "color": "#5e9bff", "isBuiltin": true, "position": 0 }
```
A built-in category keeps its **literal seed id** (`infogathering`, `winpriv`, … — never a ULID), a label drawn from the 18 seeds (§3.3), and a palette color (`#3ddc97` is the reserved UI accent and is never a category color). A **custom** category looks like:
```json
{ "id": "01J…", "label": "Pivoting maison", "color": "#e879f9", "isBuiltin": false, "position": 18 }
```

**Command** (Q4, Q5, Q6, Q9, Q102)
```json
{ "id": "01J…", "title": "Nmap scan complet", "template": "nmap -sC -sV -p- $IP",
  "desc": "…", "categoryId": "01J…", "tool": "nmap",
  "tags": ["recon","tcp"], "language": null,
  "createdAt": "…", "updatedAt": "…" }
```
**Reference** (Q9, Q77–Q80, Q87)
```json
{ "id": "01J…", "title": "HackTricks", "url": "https://book.hacktricks.xyz",
  "displayDomain": "book.hacktricks.xyz",
  "desc": "", "tags": ["priv-esc"], "createdAt": "…", "updatedAt": "…" }
```
**Roadmap → Phase → Step** (Q2, Q7, Q10, Q113)
```json
{ "id": "01J…", "label": "Services", "position": 0, "createdAt": "…", "updatedAt": "…",
  "phases": [
    { "id": "01J…", "label": "Découverte", "position": 0,
      "steps": [
        { "id": "01J…", "text": "Scan des ports", "commandId": "01J…",
          "done": false, "position": 0 }
      ] } ] }
```
`step.commandId` is a nullable 0..1 FK (Q7). `step.done` is the persisted per-step completion boolean (Q113). Steps carry no free note field in v1 (Q65 deferred). Linked-command panel open/closed state is **ephemeral React state** (`step.expanded` removed per A15) — never persisted, never on the wire.

**Cheatsheet → Entry** (D1, Q89, Q92, Q93)
```json
{ "id": "01J…", "title": "Machine — Alpha", "target": "10.10.10.5",
  "position": 0, "createdAt": "…", "updatedAt": "…",
  "entries": [ { "id": "01J…", "commandId": "01J…", "position": 0 } ] }
```
A cheatsheet entry is a live reference to a command by id + position (Q93); a command appears at most once per sheet. Entry-level notes are deferred to v2 (Q95).

**VariableDefinition** (D2, Q20, Q22–Q25, Q176)
```json
{ "id": "01J…", "name": "LPORT", "sensitive": false,
  "isBuiltin": true, "position": 2 }
```
`name` is stored **bare** (no `$`), uppercase (Q22/Q23). `sensitive` defaults true for `PASS` (Q176). There is **no `value` field** and no value endpoint (memory-only). There is no `type` field (always `text`; reserved column dropped per A21) and no `hidden` field (row-hiding dropped per A19). The six standard definitions seed in the canonical order `IP, LHOST, LPORT, USER, DOMAIN, PASS` (Q25) at positions 0–5.

---

#### 4.6.1 Categories

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/categories` | Create a custom category. |
| `PATCH` | `/api/categories/{id}` | Rename / recolor / reposition. |
| `DELETE` | `/api/categories/{id}` | Delete a custom, empty category. |

- **Create body:** `{ "label": "…", "color"?: "#RRGGBB" }`. `label` required, **unique case-insensitively** across all categories → `409 DUPLICATE_CATEGORY_LABEL` (Q8). `color` optional; server assigns the next palette color if omitted (Q11). `isBuiltin=false`, appended at end `position` (Q11, Q17 manual reorder deferred).
- **Update body:** any of `label`, `color`, `position`. Builtins are renamable/recolorable but **not deletable** (Q17). Label uniqueness re-checked.
- **Delete:** blocked with `409 BUILTIN_NOT_DELETABLE` for builtins; blocked with `409 CATEGORY_NOT_EMPTY` if the category still has commands **and** `reassignTo` is omitted. The `?reassignTo={categoryId}` query moves every command to the target category in the same transaction, then deletes the category. `reassignTo` cases (A43):
  - `reassignTo` must reference an **existing** category; unknown id → `404 NOT_FOUND`.
  - `reassignTo` must differ from `{id}`; self-reference → `400 VALIDATION_FAILED`.
  - If `reassignTo` is omitted on a **non-empty** category, the server defaults reassignment to the `utilities` fallback category (Q17) rather than failing.
  - Deleting an **empty** custom category needs no `reassignTo`.
  Success `204`.

#### 4.6.2 Commands (D6, Q12–Q14)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/commands` | Create a command. |
| `PATCH` | `/api/commands/{id}` | Edit any field (reuses the Add modal, Q12). |
| `DELETE` | `/api/commands/{id}` | Delete with cascade. |

- **Create body:** `{ "title", "template", "categoryId", "tool"?, "desc"?, "tags"?, "language"? }`. `title`, `template`, and `categoryId` are **required** (Q9, A45) — a missing `categoryId` is `400 VALIDATION_FAILED` (there is no "default to info-gathering" fallback on the API). `categoryId` must reference an existing category, else `404`. `tool` trimmed, defaults `"Divers"` (Q9, Q46). `template` is multi-line TEXT. `tags` normalized (trim, strip leading `#`, lowercase, case-insensitive dedup — Q47).
- **Delete cascade (Q14, Q19):** in one transaction — (a) null `commandId` on any referencing step (FK `ON DELETE SET NULL`, §3.2.6/A64 — keep the step text, flagged unlinked in the UI, Q63); (b) delete every cheatsheet entry referencing it (FK cascade, Q14); (c) delete its orphan note from the notes store (FK cascade, Q14/Q97). Response `204`; the SPA already knows the reference count from local state (destructive confirmation is client-side, Q13).

#### 4.6.3 References (D6, Q15, Q16, Q77–Q80, Q87)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/references` | Create a reference. |
| `PATCH` | `/api/references/{id}` | Edit any field (full mutable set sent from the modal). |
| `DELETE` | `/api/references/{id}` | Delete (client shows immediate ✕ + undo toast, Q16). |

- **Create/Update body:** `{ "url", "title"?, "desc"?, "tags"? }`. `url` required. The server auto-prefixes a missing scheme with `https://`, then **parses**; unparseable → `400 VALIDATION_FAILED` (field `url`, Q77). Scheme must be in the allowlist `http`/`https`/`mailto`, else `400 SCHEME_NOT_ALLOWED` (Q78, A54). URL is normalized (lowercase scheme+host, strip fragment; path/query verbatim — Q79). If `title` is empty it defaults to the extracted domain (Q87). Duplicate on **normalized URL** → `409 DUPLICATE_REFERENCE_URL` (Q80, A54). Full pipeline in §8.3.
- Delete is a hard delete; undo is a client-side deferred send (§8.9, §4.4).

#### 4.6.4 Roadmaps (Q57, Q66, Q67, Q70, Q75)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/roadmaps` | Create an (empty) roadmap. |
| `PATCH` | `/api/roadmaps/{id}` | Rename / reposition. |
| `DELETE` | `/api/roadmaps/{id}` | Delete roadmap + cascade phases/steps. |
| `POST` | `/api/roadmaps/{id}/reset-progress` | Clear `done` on all its steps (Q57). |

- **Create body:** `{ "label" }`, required non-empty. Duplicate names are allowed; the SPA warns without blocking (Q75). `position` appended.
- **Delete:** cascades to phases → steps (and their `done` state) in one transaction (Q19). Destructive confirmation is client-side (Q70).
- **Reset-progress:** sets `done=false` for every step under the roadmap; returns the updated roadmap (nested). This is "Réinitialiser la progression" (Q57), confirmed client-side.

> **Deferred to v2 (A28).** Roadmap **duplicate** (deep-clone with fresh IDs + progress reset) and **restore-defaults** (partial re-seed of missing default roadmaps, which A56 would have returned as full nested Roadmap objects) are cut from v1. Only `reset-progress` — the core checklist workflow — ships. See Open Items.

#### 4.6.5 Phases (Q10, Q58, Q70)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/roadmaps/{roadmapId}/phases` | Create a phase in the roadmap. |
| `PATCH` | `/api/phases/{phaseId}` | Rename / reposition. |
| `DELETE` | `/api/phases/{phaseId}` | Delete phase + its steps (cascade). |
| `POST` | `/api/roadmaps/{roadmapId}/phases/reorder` | Reorder phases (§4.7). |

- **Create body:** `{ "label" }`, required non-empty. Appended `position`. Duplicate phase labels allowed (Q75).
- **Delete:** cascades to its steps and their `done` state (Q19). Client offers toast-undo, and the `DELETE` is deferred until the undo window closes (Q70, §4.4/A2).

#### 4.6.6 Steps (Q7, Q58, Q59, Q60, Q113)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/phases/{phaseId}/steps` | Create a step in the phase. |
| `PATCH` | `/api/steps/{stepId}` | Edit text / link / completion. |
| `DELETE` | `/api/steps/{stepId}` | Delete step + dependent state (cascade). |
| `POST` | `/api/phases/{phaseId}/steps/reorder` | Reorder / receive steps (§4.7, cross-phase). |

- **Create body:** `{ "text", "commandId"? }`. `text` required non-empty. Appended `position`.
- **Update body:** any of `text` (inline edit, Q59), `commandId` (change/add/remove link — `null` clears it, Q60), `done` (completion toggle, Q113). The PATCH is built from present keys only (§4.1/A1) so `{ "done": false }` — unchecking a completed step — persists `false` rather than being dropped as a Go zero-value. **Cross-phase move is committed exclusively through the steps `reorder` endpoint** (§4.7, A46); the step PATCH no longer accepts `phaseId`/`position` (the old PATCH-phaseId path had no caller — §7.8 commits moves via reorder).
- **Delete:** removes the step; because completion lives on the step row and is keyed by stable step ID, no positional-check resurrection bug can occur (Q19/Q129). With undo, the `DELETE` is deferred until the undo window closes (§4.4/A2).

#### 4.6.7 Cheatsheets (D1, Q89, Q92)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cheatsheets` | Create a named cheatsheet (tab). |
| `PATCH` | `/api/cheatsheets/{id}` | Edit title / target / reposition. |
| `DELETE` | `/api/cheatsheets/{id}` | Delete cheatsheet + its entries (cascade). |

- **Create body:** `{ "title"?, "target"? }`. Reuses the roadmap tab/CRUD UX (D1). `title` defaults to an auto name if empty; `target` optional. Appended `position`.
- **Update body:** `title`, `target`, `position`.
- **Delete:** cascades to its entries (Q19). Resolution/values are never involved (composition is stored as command ids; values are memory-only).
- Tab reorder UI is deferred (parallels Q68); the `position` column exists to enable it without migration.

#### 4.6.8 Cheatsheet entries (Q91, Q93, Q98)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cheatsheets/{sheetId}/entries` | Add a command to the addressed sheet. |
| `DELETE` | `/api/cheatsheets/{sheetId}/entries/{entryId}` | Remove an entry. |
| `POST` | `/api/cheatsheets/{sheetId}/entries/reorder` | Reorder entries (§4.7). |

- **Create body:** `{ "commandId" }`. Adds to the **addressed** sheet identified by `{sheetId}` (which need not be the currently active tab — this is what backs the "Ajouter à…" multi-sheet picker, §9.2/A39). If the command is already present on that sheet, the server is idempotent and returns the existing entry (`200`) rather than duplicating (Q93). Appended `position`.
- **Delete:** removes the entry only; the underlying command is untouched.

#### 4.6.9 Variable definitions (D2, Q20, Q22–Q28)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/variables` | Create a custom variable definition. |
| `PATCH` | `/api/variables/{id}` | Rename / toggle sensitive / reposition. |
| `DELETE` | `/api/variables/{id}` | Delete a custom variable definition. |

> **Definitions only.** No endpoint carries a value. Deleting/renaming never transmits values. Values are held in SPA memory and cleared on reload.

- **Create body:** `{ "name", "sensitive"? }`. `name` is validated against grammar `^[A-Z_][A-Z0-9_]*$` after auto-uppercasing, stored bare (Q22/Q23); must be **unique case-insensitively**, ≥1 letter, ≤24 chars (Q24) → `409 DUPLICATE_VARIABLE_NAME` / `400 VALIDATION_FAILED`. Must not collide with a standard variable name → `409 RESERVED_VARIABLE_NAME` (Q24). `isBuiltin=false`, appended at end.
- **Update body:** any of `name` (rename, see below), `sensitive` (toggle), `position`. The PATCH is built from present keys only (§4.1/A1) so `{ "sensitive": false }` persists `false` instead of being dropped. Standard variables are value-editable only — their `name`/deletion are rejected; the `sensitive` toggle is allowed (Q25, Q176).
- **Rename (A27 — cascade deferred to v2):** the transactional `$OLDNAME`→`$NEWNAME` rewrite across all templates is **not** implemented in v1. A rename is accepted **only if the variable is not referenced by any command template**; if it is referenced, the rename is rejected with `409 VARIABLE_IN_USE` and the user must delete/recreate instead (dangling tokens already render in the distinct "undefined/dangling" style, §5.10). The response is the plain updated `VariableDefinition` (no `rewrittenCommandCount`).
- **Delete (Q28):** allowed for custom variables even when still referenced; dangling `$TOKEN`s remain literal in templates and render in the distinct "undefined/dangling" style (Q31). The reference count for the client's warning is computed client-side. Standard variables are not deletable → `409`.

#### 4.6.10 Notes (Q95, Q97)

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/notes/{commandId}` | Upsert the per-command note. |

- **Body:** `{ "text": "…" }`. Notes are stored in a map keyed by command id (Q97), editable from both the Library card and the cheatsheet entry writing to the same store (Q96). An empty/whitespace `text` deletes the note (`200` with `{ "commandId": "…", "text": "" }`). `{commandId}` must reference an existing command → `404` otherwise. Orphan notes are removed by the command-delete cascade (§4.6.2). Notes are included in the dataset export (Q97/Q124) but **never** placed in browser storage (Q112).

### 4.7 Reorder endpoints

All reorder endpoints take the **complete, ordered list of child IDs** for one parent and persist positions in a single transaction on drop / ↑↓ click (Q117). `orderedIds` must be a permutation of exactly the parent's children (plus, for steps, any IDs migrating in from another phase). Unknown IDs → `400 VALIDATION_FAILED`.

| Method | Path | Body | Notes |
|---|---|---|---|
| `POST` | `/api/roadmaps/{roadmapId}/phases/reorder` | `{ "orderedIds": ["…"] }` | Reassigns `position` `0..n-1` to the roadmap's phases. |
| `POST` | `/api/phases/{phaseId}/steps/reorder` | `{ "orderedIds": ["…"] }` | Sets the phase's step list to exactly `orderedIds`. Any listed step currently belonging to another phase is **moved** here (`phaseId` reassigned) and compacted out of its previous phase in the same transaction — this is the **single** path by which cross-phase DnD (Q58) is committed (A46). |
| `POST` | `/api/cheatsheets/{sheetId}/entries/reorder` | `{ "orderedIds": ["…"] }` | Reassigns entry `position` (flat ↑↓ order, Q98). |

Response `200` returns the affected parent with its children in the new order. Positions are reassigned as a **dense contiguous `0..n-1`** range on every commit (§3.7/A47). Roadmap-tab and cheatsheet-tab reordering are not exposed in v1 (position columns exist for later; parallels Q68).

### 4.8 Settings

`PUT /api/settings` is **removed in v1 (A18)**. No user-writable, server-persisted setting was locked for v1: device/UI preferences (theme, last view, active roadmap/cheatsheet) live in `localStorage` (Q112), and export-behavior toggles are per-export choices, not stored settings (Q99/Q101). Consequently `GET /api/state` carries no `settings` object. Read-only build metadata remains available in `meta` (`schemaVersion`, `appVersion`; the former `seedVersion` is removed together with the seed-pack mechanism, A24). The endpoint will be reintroduced (via additive `AutoMigrate`) only when a first genuinely server-scoped setting is designated.

### 4.9 `GET /api/export` — dataset export (D4, Q124, Q128, Q132, Q142)

Streams the full user dataset as a versioned JSON envelope, server-side (Q132), as a downloadable attachment (`Content-Disposition: attachment; filename="cheat-export-<YYYYMMDD-HHmmss>.json"`). The complete envelope shape (a single `formatVersion` plus `createdAt`/`updatedAt` per entity) is authoritative in §10.4.1; the former `schemaVersion`/`seedVersion` envelope fields are removed (A20).

`200 OK`
```json
{
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-07-15T12:34:56Z",
  "data": {
    "categories": [ /* all categories: builtin + custom (Q135) */ ],
    "commands": [ … ],
    "references": [ … ],
    "roadmaps": [ /* nested phases[].steps[] incl. step.done (Q129) */ ],
    "cheatsheets": [ /* nested entries[] (Q92) */ ],
    "variableDefinitions": [ /* definitions ONLY — no values (D2/D7) */ ],
    "notes": { "<commandId>": "…" }
  }
}
```

- **Included:** all durable content + user state — commands, references, all categories (builtin + custom, self-contained per Q135), roadmaps/phases/steps with `done`, cheatsheets with entries + title/target, variable **definitions**, and the per-command notes map (Q124).
- **Excluded (never written):** variable **values** (memory-only, D2/D7), ephemeral view state (filters, drafts, `step.expanded` — A15), and device/UI prefs (theme) (Q124). No `settings` object exists to export (§4.8).
- IDs and `createdAt`/`updatedAt` are preserved verbatim to guarantee round-trip fidelity and stable ordering on REPLACE (Q127/Q139, §10.4.1).
- Progression is keyed by stable IDs (`step.done` embedded per step), so it survives structural edits between export and import (Q129).
- Timestamps ISO 8601 UTC (Q142).

> **Note — raw tokens vs resolved values.** The Q99 rule (exports emit RAW `$TOKEN`s by default; clipboard stays resolved) applies to the **client-side cheatsheet Markdown/PDF** artifacts (Q106/Q132), not to `GET /api/export` — the JSON dataset stores raw templates and contains no values by definition, so there is nothing to resolve here.

### 4.10 `POST /api/import` — dataset import (D4, Q125–Q131, Q135, Q136)

Applies a JSON envelope server-side inside one transaction and returns a summary. **Import always performs a full REPLACE (D4);** the MERGE mode and its collision/re-ID algorithm are **deferred to v2 (A12)**. Full REPLACE flow detail (insertion order, dangling-ref repair, canonical-baseline reassertion) is in §10.4.5.

- **Body:** the export envelope (`{ formatVersion, appVersion?, exportedAt?, data }`), `application/json`. Bodies over the configured cap → `413 IMPORT_TOO_LARGE` (limit exists per Q131; default ~32 MiB, tunable via config — not a locked figure).

**Validation & safety pipeline (Q128, Q130, Q131):**
1. Parse and validate the envelope. Only `formatVersion: 1` is accepted in v1; any newer value → `422 IMPORT_VERSION_TOO_NEW` (clear message). There is no forward-migration engine (nothing to migrate — see §10.4.4).
2. Strict structural/schema validation (types, required fields, and explicit count/size limits, §10.4.4). Truly malformed/incompatible → `422 IMPORT_SCHEMA_INVALID`, nothing applied (Q131).
3. Sanitize all reference URLs against the `http`/`https`/`mailto` allowlist; neutralize/drop others (Q78/Q131).
4. Repair-and-warn for **dangling internal refs** in an otherwise-valid file: a `step.commandId`, a cheatsheet `entry.commandId`, or a `notes` key pointing to an absent command is nulled/dropped and reported, rather than rejecting the whole file (Q131, §10.4.4).
5. **Automatic pre-import snapshot:** before mutating, the server writes a timestamped backup export of the current dataset to disk (Q130, into the co-located `backups/` folder, §10.4.5). Its path is returned in the summary.
6. Apply in a **single atomic transaction**; any error rolls back entirely (Q130). REPLACE wipes the current dataset and loads the envelope **preserving incoming IDs and `createdAt`/`updatedAt`** for round-trip fidelity (Q127/Q139), then reasserts the canonical built-in baseline (§10.4.5).

**Response** `200 OK` — this is the single canonical import-summary schema, mirrored verbatim from §10.4.7 (A4):
```json
{
  "mode": "replace",
  "snapshotPath": "backups/cheat-backup-20260715-140322.json",
  "counts": {
    "commands":   { "added": 24, "replaced": 0, "skipped": 0, "reIded": 0 },
    "references": { "added": 6,  "replaced": 0, "skipped": 0, "reIded": 0 }
  },
  "warnings": [
    "2 étape(s) référençaient une commande absente — lien retiré.",
    "1 note référençait une commande absente — note ignorée.",
    "1 commande référençait une catégorie inconnue — reclassée dans « Autre »."
  ]
}
```
`mode` is always `"replace"` in v1. `counts` are **nested per entity** with the four sub-fields `{added, replaced, skipped, reIded}` — under REPLACE, loaded rows land in `added` and the merge-only counters stay `0`. `snapshotPath` is the single pre-import backup location; the summary carries **no** `formatVersion` and **no** `migratedFrom` field (A20). The former nested `merge` summary object is gone with MERGE (A12). After import the SPA re-hydrates via `GET /api/state`.

> **Factory reset & raw-DB copy removed (A17).** `POST /api/factory-reset` and `GET /api/backup.sqlite` are cut: both are redundant with "stop the binary, then delete or copy the DB file", documented in the README. The automatic pre-import JSON snapshot (step 5) is retained.

### 4.11 Endpoint index

| # | Method | Path | Success |
|---|---|---|---|
| 1 | GET | `/api/state` | 200 |
| 2 | GET | `/api/export` | 200 |
| 3 | POST | `/api/import` | 200 |
| 4 | POST | `/api/categories` | 201 |
| 5 | PATCH | `/api/categories/{id}` | 200 |
| 6 | DELETE | `/api/categories/{id}?reassignTo=` | 204 |
| 7 | POST | `/api/commands` | 201 |
| 8 | PATCH | `/api/commands/{id}` | 200 |
| 9 | DELETE | `/api/commands/{id}` | 204 |
| 10 | POST | `/api/references` | 201 |
| 11 | PATCH | `/api/references/{id}` | 200 |
| 12 | DELETE | `/api/references/{id}` | 204 |
| 13 | POST | `/api/roadmaps` | 201 |
| 14 | PATCH | `/api/roadmaps/{id}` | 200 |
| 15 | DELETE | `/api/roadmaps/{id}` | 204 |
| 16 | POST | `/api/roadmaps/{id}/reset-progress` | 200 |
| 17 | POST | `/api/roadmaps/{roadmapId}/phases` | 201 |
| 18 | PATCH | `/api/phases/{phaseId}` | 200 |
| 19 | DELETE | `/api/phases/{phaseId}` | 204 |
| 20 | POST | `/api/roadmaps/{roadmapId}/phases/reorder` | 200 |
| 21 | POST | `/api/phases/{phaseId}/steps` | 201 |
| 22 | PATCH | `/api/steps/{stepId}` | 200 |
| 23 | DELETE | `/api/steps/{stepId}` | 204 |
| 24 | POST | `/api/phases/{phaseId}/steps/reorder` | 200 |
| 25 | POST | `/api/cheatsheets` | 201 |
| 26 | PATCH | `/api/cheatsheets/{id}` | 200 |
| 27 | DELETE | `/api/cheatsheets/{id}` | 204 |
| 28 | POST | `/api/cheatsheets/{sheetId}/entries` | 201 |
| 29 | DELETE | `/api/cheatsheets/{sheetId}/entries/{entryId}` | 204 |
| 30 | POST | `/api/cheatsheets/{sheetId}/entries/reorder` | 200 |
| 31 | POST | `/api/variables` | 201 |
| 32 | PATCH | `/api/variables/{id}` | 200 |
| 33 | DELETE | `/api/variables/{id}` | 204 |
| 34 | PUT | `/api/notes/{commandId}` | 200 |

Removed from v1 (see cross-refs): `POST /api/factory-reset` and `GET /api/backup.sqlite` (A17); `GET /api/seed-pack` and `POST /api/import/seed-pack` (A24); `PUT /api/settings` (A18); `POST /api/roadmaps/{id}/duplicate` and `POST /api/roadmaps/restore-defaults` (A28). MERGE import mode is deferred (A12).

---
## 5. Variables System

The Variables system lets a command template such as `nmap -sC -sV $IP` render and copy as a concrete command (`nmap -sC -sV 10.10.10.5`) without editing the stored template. It has two strictly separated halves: **definitions** (persisted metadata — the catalogue of variable *names*) and **values** (the substitution set the operator types during a session). This split is the load-bearing OPSEC decision of the app: names live in SQLite, values never touch the app database. By default values are memory-only; a per-session, per-tab persistence to `sessionStorage` is available strictly as an opt-in (default OFF, §5.3).

### 5.1 Definitions vs Values (the core split)

- **Definition** — a persisted record describing *that a variable exists*: its bare name, ordering, built-in flag, and sensitivity flag. Definitions are portable: they are included in the JSON dataset export and round-trip on import. (Q20, D2)
- **Value** — the concrete string the operator assigns to a variable *for the current session* (e.g. `$IP = 10.10.10.5`). Values are **React state** (per session, per tab; §5.3, A52). They are:
  - never written to SQLite / the app database,
  - by default not written to any device store; reset to empty on every page reload,
  - **excluded from the JSON dataset export unconditionally**, even when session persistence is enabled. (memory-only values; Q124, R3)
- A single **opt-in exception** exists to the "reset on reload" rule: an off-by-default *"Conserver les valeurs pour cette session"* toggle mirrors the value map to `sessionStorage` (§5.3, R3). This survives reload/crash within the same tab, is purged when the tab or browser closes, is never synced across tabs/devices, is never exported, and never mirrors `$PASS` (or any `sensitive`-flagged value).
- There is one shared value set within a given tab/session — no per-cheatsheet, per-target, or per-profile value scoping in v1. Because values live in per-tab React state, the "one global value set" promise holds **within a single tab**; the working assumption is single-tab use, and cross-tab convergence (if ever added) would be a message-only `BroadcastChannel` sync that keeps values memory-only with nothing written to a shared store (§5.3, A52). Definitions are modelled separately from values precisely so a future "profiles" layer can be added without a schema migration. (D2, Q21)

> The only paths by which a value reaches disk are *explicit, opt-in* user actions: a cheatsheet export with the "résoudre les variables" toggle enabled (§9, Q99), the clipboard (a deliberate local action; §5.9, §11.6, Q53), and the opt-in `sessionStorage` mirror above. Absent those, nothing sensitive is ever persisted.

### 5.2 Definition data model (persisted)

Definitions are stored in a single ordered table (§3.2.7). IDs are **server-minted ULIDs** (D5).

| Field        | Type                     | Constraints / Notes                                                                                     |
|--------------|--------------------------|---------------------------------------------------------------------------------------------------------|
| `id`         | TEXT (ULID)              | PK, server-minted. Seed rows keep literal seed IDs.                                                     |
| `name`       | TEXT                     | NOT NULL. **Bare** name, no `$` prefix. Stored upper-case. Unique case-insensitively (§5.6).            |
| `isBuiltin`  | BOOLEAN                  | NOT NULL. `true` for the 6 standard variables, `false` for custom. Drives edit/delete permissions.     |
| `sensitive`  | BOOLEAN                  | NOT NULL. `true` ⇒ value masked in the panel AND excluded from export metadata (§5.4, §9.5/Q100).      |
| `position`   | INTEGER                  | NOT NULL. Global ordering. Standard vars seeded `0..5`; custom appended at `max(position)+1`.           |

- No `value`, `default`, or any value-bearing column exists on this table — by construction (D2, memory-only).
- No `default` field per variable in v1. Value reset is a single global action, not per-variable (Q30).
- **All variables are free text in v1** (Q29). The reserved `type` column is dropped from the v1 schema and re-added via AutoMigrate when soft validation is introduced. (A21)
- There is no `hidden` column in v1: with ≤ 6 built-ins plus a few custom rows, hiding rows solves no real problem, and it removed a "hidden variable with no way to reveal it" trap. (A19)

### 5.3 Values (session runtime state)

- Runtime shape: a plain map `Record<string /*bare NAME*/, string /*value*/>`, keyed by the definition's bare upper-case name. Missing key ⇒ the variable has no value yet. This map is **per-session, per-tab** React state (§5.1, A52).
- **Default = memory-only.** Seeded empty on load. Editing a value in the panel updates this map synchronously (controlled input); it triggers immediate re-render of every tokenized command but **no** network write and **no** autosave (definition autosave never applies to values).
- **Opt-in session persistence (default OFF).** A *"Conserver les valeurs pour cette session"* toggle mirrors the value map to `sessionStorage` (R3). When ON:
  - values survive reload / F5 / a tab crash within the same tab;
  - the mirror is purged when the tab or browser closes;
  - it is never synced across tabs or devices and never included in any export;
  - **`$PASS` (and any `sensitive`-flagged value) is never written to the mirror** — it stays memory-only even when persistence is ON and must be re-entered after a reload.
- **Bulk paste — « Coller les valeurs ».** A bulk-fill affordance accepts `KEY=value` lines (one per line), parses them, and merges the results into the value map. Keys are matched case-insensitively to existing definitions; lines whose key matches no definition are ignored. This is an ordinary memory-only value edit (subject to the same persistence rule above). (R3)
- **« Effacer toutes les valeurs »** — a single global action clears the entire map (all keys → removed / empty) and clears any `sessionStorage` mirror. Definitions are untouched. (Q30)
- A value string is used **verbatim**: a value that itself contains `$FOO` or a literal `$` is inserted as typed and is **not** re-scanned for substitution (single-pass; §5.9, Q35).

### 5.4 Standard variables

Six built-in variables are seeded first-run as ordinary rows with `isBuiltin = true`, in this **exact canonical order** (§4 order, reconciling the prototype's `varMeta` order):

| Position | `$` token  | Default `sensitive` |
|----------|------------|---------------------|
| 0        | `$IP`      | false               |
| 1        | `$LHOST`   | false               |
| 2        | `$LPORT`   | false               |
| 3        | `$USER`    | false               |
| 4        | `$DOMAIN`  | false               |
| 5        | `$PASS`    | true                |

Behavior (Q25):

- **Value-editable only.** The operator may set/clear their session value but may **not** rename or delete them. `PATCH name` and `DELETE` on a built-in row are rejected server-side (see §5.12).
- **Fixed at the top** of the panel in the canonical order above; they never reorder.
- **Maskable / non-deletable.** Each row exposes a mask toggle that writes the `sensitive` flag. A masked (sensitive) variable renders its value input as an obscured field in the panel and is excluded from the cheatsheet metadata chip block (Q100). `$PASS` ships masked by default; the others unmasked.

> **Open:** The default `sensitive` state of the six standard variables is not itself a locked decision. The table above (only `$PASS` sensitive by default) is the recommended default; all six remain user-toggleable via the mask affordance.

### 5.5 Custom variables & panel UI

The Variables panel lives in the left sidebar (prototype: an uppercase "Variables" label plus a mono `live` badge signalling the values are session-live). Each definition renders one row: a fixed, non-editable `$`-prefixed name label (accent-coloured, monospace, ~60px) followed by the value input. (Q26)

- **Add** — an inline **« + Variable »** affordance appended below the rows opens an inline name entry (no modal). On submit the name is validated (§5.6), a definition is created via an **awaited** `POST /api/variables` (the client waits for the server-minted ULID before finalizing the row; §5.12, R2), and the new row appears at the bottom in creation order.
- **Rename / Delete (custom only)** — exposed as small per-row affordances revealed **on hover**; no modal. Rename edits the bare name and is **allowed only when the variable is unreferenced** by any command template; if it is referenced, the user deletes and recreates instead (§5.7, A27). Delete removes the definition (§5.8).
- **Mask toggle** — per-row affordance writing the `sensitive` flag (all rows, including standard).
- **Reveal (eye) toggle** — each masked row exposes an eye affordance that temporarily reveals the obscured value input so the operator can verify their entry. The revealed value is **never persisted and never logged**; the toggle is view-only and resets to masked on reload. (A38)
- **Empty-panel hint on reload** — when values are reset (a reload with session persistence OFF), the panel surfaces a lightweight hint that the values are session-scoped and must be re-entered, e.g. « valeurs de session — à ressaisir ». (A38)
- **Bulk fill** — the « Coller les valeurs » affordance (§5.3) sits alongside « Effacer toutes les valeurs ».
- **Ordering** — standard rows first (canonical order §5.4), then custom rows in **creation order** (`position` ascending). Manual reordering of custom variables is deferred; `position` is persisted so it can be added later without migration. (Q25, Q10)

### 5.6 Name grammar & validation

The grammar, tokenizer, resolver, and form validator MUST stay aligned on one definition. (Q22)

- **Displayed / stored form.** The UI shows a fixed, non-editable `$` prefix; the user types only the bare name; the **bare** name (no `$`) is what is validated and stored. (Q23)
- **Grammar.** A valid bare name matches `^[A-Z_][A-Z0-9_]*$` — first character a letter or underscore, subsequent characters letters, digits, or underscore. Digits are allowed non-initially, so `$IP2` is valid; `$2ND` is not. (Q22)
- **Auto-uppercase.** The name input is upper-cased as the user types; lower-case entry is coerced, never rejected for case. (Q22)
- **Uniqueness.** Case-insensitively unique across all definitions (built-in + custom). (Q24)
- **Reserved.** The six standard names (`IP`, `LHOST`, `LPORT`, `USER`, `DOMAIN`, `PASS`) may not be used for a new/renamed custom variable. (Q24)
- **Length / content.** At least one letter; maximum ~24 characters (label overflow guard). (Q24)
- Validation failures block creation/rename with an inline error; they never silently truncate or dedupe.

### 5.7 Rename (custom only, unreferenced)

Renaming a custom variable is a **name-only edit on the definition**; in v1 it does **not** rewrite command templates. (A27)

- The new name is validated against the full §5.6 rules first (grammar, uniqueness, reserved, length).
- **Rename is allowed only if the variable is unreferenced** by any command template. If one or more templates reference `$OLDNAME`, the rename is **rejected** (§5.12); the operator instead deletes the variable and recreates it under the new name. Because deleted-variable tokens become visibly `undefined`/dangling (§5.10), the breakage is already surfaced and there is no silent divergence.
- Built-in variables cannot be renamed (§5.4).

> **Deferred to v2:** the transactional rename **cascade** (rewriting every `$OLDNAME` token to `$NEWNAME` across all command templates in one DB transaction, returning an updated-command count) is deferred. See Open Items.

### 5.8 Delete (custom only)

Deleting a custom variable that is still referenced by one or more command templates is **allowed with a warning**, not blocked. (Q28)

- The confirmation shows the **count of referencing commands**. On confirm, the definition row is deleted.
- **Templates are not modified** on delete: the `$NAME` tokens remain literal text in the templates. Because the name is no longer defined, those tokens resolve as **undefined / dangling** thereafter (§5.10), making the breakage visible rather than silent.
- The variable's in-memory value (if any) is dropped from the value map.
- Built-in variables cannot be deleted (§5.4); a `DELETE` on a built-in row is rejected.

### 5.9 Resolution algorithm (substitution)

Resolution is a **single left-to-right pass** over a template, producing an ordered list of *parts* used both for on-screen tokenized rendering (§5.10) and for the flat resolved string (clipboard / opt-in resolved export). It is **not recursive**. (Q35)

Scan rules, in order:

1. **Escape.** A backslash-dollar `\$` emits a literal `$` into plain output; the backslash is consumed and the `$` is **not** treated as a token start. This is the escape hatch for literal `$WORD` text and for real shell variables the operator wants to keep (`\$HOME`, `\$PATH`, `\$USER`). (Q33)
2. **Token.** An unescaped `$` immediately followed by `[A-Z_][A-Z0-9_]*` is a candidate token. Matching is **maximal munch**: `$IPADDR` captures the whole name `IPADDR`, never `$IP` + `ADDR`.
3. **Only defined names substitute.** The captured bare name is looked up among the definitions:
   - **Defined and value non-empty** → substitute the value **verbatim** (no re-scan). Part state = `resolved`.
   - **Defined but value empty** → **not** substituted; the literal `$NAME` is kept. Part state = `empty`. (Empty is treated as unresolved so `nc -lvnp $LPORT` never collapses to `nc -lvnp `.) (Q32)
   - **Not defined** → left as literal `$NAME`. Part state = `undefined`. (Q33)
4. **Plain text.** Everything else (including a lone `$` not followed by a valid name start, and sequences like `$1` that fail the grammar) is emitted as plain text. Part state = `plain`.

Flat resolved output (clipboard / resolved export) maps parts as: `resolved` → value, `empty` → `$NAME`, `undefined` → `$NAME`, `plain` → text, escaped → literal `$`.

Because only defined names substitute and `\$` escapes, shell tokens are safe by default except where the name collides with a defined variable (notably `$USER`).

- **Shell-literal collision hint (A37).** When a token matches **both** a defined variable **and** a known shell name — the collision set includes at least `USER`, `PASS`, `PATH`, `HOME` — the app surfaces a non-blocking hint, both in the command editor (§6.8) and at render, e.g. « jeton reconnu — échappe avec \$ pour le laisser littéral ». Escaping as `\$USER` keeps the token literal (rule 1); leaving it unescaped substitutes the app value.
- **No `sensitive` metadata on parts (v1).** The parts model carries only the four render states above; it does **not** carry a per-part `sensitive` flag. A resolved `$PASS` therefore cannot be selectively masked inline. The global "Mode masqué" / redact mode that would require this is **deferred to v2** (A26); v1's masking is per-row in the panel via `sensitive` (§5.4).

### 5.10 Rendering states (tokenized display)

On screen, command templates render inside a monospaced `<pre>` (with a non-selectable `$ ` prompt prefix), one `<span>` per resolution part. Three distinct visual states, following the spec over the prototype (the prototype greened every recognised token; the spec greens only truly resolved ones). (Q31, Q32)

**This table is the single authority for command render states across the app.** Every command render surface — library command cards (§6.4), methodology step-linked command panels (§7.6), and cheatsheet entries (§9.3) — conforms to these states; where those sections differed they defer to this table. (A5)

| State       | When                                   | Rendered text | Style                                                        |
|-------------|----------------------------------------|---------------|-------------------------------------------------------------|
| `resolved`  | defined, value non-empty               | the value     | accent (green) foreground on accent-dim background (highlight) |
| `empty`     | defined, value empty                   | `$NAME`       | unresolved — plain/neutral, **not** green; placeholder stays visible |
| `undefined` | name not defined (e.g. deleted var)    | `$NAME`       | distinct **dangling** style — dimmed/muted with a dotted underline |
| `plain`     | ordinary text (and escaped `\$` → `$`) | the text      | default code foreground                                     |

- The distinction between `empty` and `undefined` is intentional: `empty` is "you defined it, fill it in"; `undefined` is "this token points at no definition (typo or deleted variable)."
- Every command render surface uses the same parts model: library command cards, methodology step-linked command panels, and cheatsheet entries all render identically.

### 5.11 Substitution scope (v1)

Substitution applies to **command templates only** (`command.template`). It does **not** apply to personal notes, command titles/descriptions, step text, or the cheatsheet title/target. (Q34)

- Auto-detection of unknown `$TOKEN`s in templates and one-click "create this variable" is **deferred to v2**. A lightweight insertion helper may be considered later; neither is in v1. (Q36)

### 5.12 API surface

Only **definitions** have an API. Values are memory-only (or opt-in `sessionStorage`, §5.3) and have **no endpoint**. Definition **creates are awaited** (the client waits for the server-minted ULID before finalizing the row) and field edits follow the debounced write path (D3 as revised by R2); there is no optimistic temp-ID or retry queue. Definitions are also delivered inside `GET /api/state` (§4.5); the granular endpoints below (authoritative in §4.6.9) are the mutation surface.

| Method & path              | Purpose                        | Body / notes                                                                                          |
|----------------------------|--------------------------------|--------------------------------------------------------------------------------------------------------|
| `POST /api/variables`      | Create custom variable         | `{ name, sensitive? }`. Awaited create; server mints ULID, sets `isBuiltin=false`, `position=max+1`. `400`/`409` on grammar/length/uniqueness/reserved conflict. |
| `PATCH /api/variables/:id` | Rename and/or toggle sensitive | `{ name?, sensitive? }`. On built-in: `sensitive` allowed, `name` rejected (`409`). Rename is **allowed only if the variable is unreferenced** by any command template; a referenced rename is rejected (`409`, delete + recreate instead — §5.7). No cascade rewrite, no updated-command count. |
| `DELETE /api/variables/:id`| Delete custom variable         | Built-in ⇒ `409`. Client warns with referencing-command count; templates are **not** modified (§5.8).  |

- There is deliberately no reorder endpoint in v1 (custom order = creation order; §5.5).
- No endpoint accepts, returns, or persists a variable value, ever.

### 5.13 Edge cases & invariants

- **Empty value never collapses a command** — `empty` parts keep `$NAME` visible (§5.9 rule 3, Q32).
- **Deleted-variable tokens** become `undefined`/dangling, never silently vanish (§5.8, §5.10).
- **Maximal-munch collision** — `$IP` defined, template contains `$IPADDR` ⇒ `$IPADDR` is one undefined token, not a resolved `$IP` followed by `ADDR`.
- **Value containing `$`** — inserted verbatim, never re-scanned (`$IP = "$LHOST"` yields the literal text `$LHOST` in output). (Q35)
- **Escaped token that names a real variable** — `\$USER` stays literal `$USER` even though `USER` is defined; the escape wins (§5.9 rule 1).
- **Rename to an existing/reserved name, or of a referenced variable** — rejected before the definition is touched (§5.6, §5.7).
- **Reload** — with session persistence OFF (default), all values are gone and every previously-resolved token reverts to `empty` (still defined) or `undefined` (if the definition was also removed). With the opt-in mirror ON (§5.3), non-sensitive values are restored from `sessionStorage`, but `$PASS`/`sensitive` values are still gone. Definitions and templates are unchanged either way.
- **Sensitive contract (scope of protection).** The `sensitive` flag protects **the export metadata chip block only** (§9.5/Q100) and masks the panel value input — it does **not** protect *resolved command bodies*. A `sensitive` value can still reach a resolved body via the clipboard or a resolve-toggled export because those are explicit local/opt-in actions (§9/Q99, §11.6/Q53). Accordingly, a resolve-ON export that would materialise a sensitive token in a command body surfaces a pre-export confirmation, e.g. « Cet export contient des valeurs sensibles ($PASS). Continuer ? ». (A51)
- **Clipboard secret indicator (A50).** Copying a resolved command that contains a `sensitive` value surfaces a « copié — contient un secret » indicator alongside the standard « Copié dans le presse-papier » toast. This is a warning, not a guarantee: an OS clipboard manager (Klipper, Win+V history, Universal Clipboard) can persist a copied `$PASS` outside the app's control, which the indicator makes explicit.

### 5.14 Decision traceability

Locked decisions reflected in this section: **Q20, Q21, Q22, Q23, Q24, Q26, Q28, Q29 (free text), Q30, Q31, Q32, Q33, Q34, Q35, Q36, D2, D5 (ID minting), D3 (definition writes), and the memory-only values rule.**

Adjustments applied in this section: **A5** (§5.10 named as the single render-state authority), **A19** (dropped `Variable.hidden` + the hide-row behavior and its reveal trap), **A21** (dropped the reserved `type` column; free text in v1, re-added via AutoMigrate later), **A26** (global redact/"Mode masqué" deferred to v2; parts carry no `sensitive` metadata), **A27** (rename cascade deferred; v1 renames only unreferenced variables, else delete/recreate — supersedes Q27; `Q25` hide affordance removed), **A37** (shell-literal collision hint for `$USER`/`$PASS`/`$PATH`/`$HOME`), **A38** (per-row reveal eye toggle + empty-panel reload hint), **A50/A51** (clipboard secret indicator; `sensitive` protects metadata only, pre-export sensitive-body warning), **A52** (values are per-session, per-tab), **R2** (awaited definition creates; no temp-ID / retry queue), **R3** (opt-in off-by-default `sessionStorage` persistence with `$PASS` excluded + « Coller les valeurs » bulk paste).

**Deferred to v2 (see Open Items):** rename cascade rewrite across templates (A27); global redact / "Mode masqué" mode (A26); the reserved `type` soft-validation column (A21); manual reordering of custom variables (Q25/Q10); template `$TOKEN` auto-detection and one-click create (Q36).

---
## 6. Library Module

The Library (**« Bibliothèque »**, first tab) is the catalogue of reusable OSCP commands. Each command is a card carrying a title, a shell template with live variable highlighting, a description, tags, a personal note, a copy button and a cheatsheet toggle. Commands are grouped into a **Category › Tool › Tag** hierarchy driven by a left sidebar, and narrowed by a per-module search and a set of combinable filters. Full CRUD is available through a reused Add/Edit modal.

All search, filtering, grouping, counting and sort operations described here run **client-side** over the full dataset loaded at boot (single-user localhost SPA). The REST surface in §6.10 exists only for persistence (debounced text-field autosave; **awaited creates**, D3/R2 — see §6.8). Server-minted ULIDs (D5) identify every command and category. Desktop-only strict layout applies (D8); the grid scrolls horizontally below the hard min-width rather than reflowing.

### 6.1 Underlying data surfaces (recap)

Full schema lives in §3; the fields this module reads/writes:

| Entity | Fields used here | Notes |
|---|---|---|
| `Command` | `id` (ULID), `categoryId` (FK), `tool` (free text), `title`, `template` (multi-line TEXT), `desc`, `tags[]` (string array), `language`, `createdAt` | `title`+`template`+`categoryId`+`tool` NOT NULL; `desc`/`tags`/`language` optional (Q9). `tool` defaults to `"Divers"`. Tags are per-entity string arrays, no join table (Q6). |
| `Category` | `id` (ULID / literal seed key), `label`, `color`, `isBuiltin`, `position` | First-class table with FK from `Command` (Q4). Color stored per category (Q11). |
| Personal note | per-command free text, keyed by `commandId` | Distinct from `Step.commandId` (Q7). Excluded from search (Q37); no variable substitution (Q34). Shared with the cheatsheet base note (Q95/Q97, see §9). |

- **`tool` is a free-text column**, not an entity (Q5). The Category › Tool tree is derived at query time by grouping commands on `(categoryId, normalizedTool)`.
- **Tags are free string arrays** on the command (Q6); the tag facet scans commands only (reference tags have their own facet in §8).

### 6.2 Built-in categories (canonical seed)

The **18 prototype categories are the source of truth** (Q3); all 18 are seeded at first run as ordinary, fully editable rows (Q18) and are always present in the DB. `position` follows the order below (identical to §3.3). Labels are stored **verbatim** (they render in the UI as-is).

| # | `id` (literal seed key) | `label` | `color` | `isBuiltin` |
|---|---|---|---|---|
| 1 | `infogathering` | Information gathering | `#5e9bff` | true |
| 2 | `vulnscan` | Vulnerability scanning | `#38bdf8` | true |
| 3 | `webapps` | Web applications | `#c084fc` | true |
| 4 | `clientside` | Client-side attacks | `#f0abfc` | true |
| 5 | `avevasion` | Antivirus Evasion & Metasploit | `#a3e635` | true |
| 6 | `passwords` | Password attacks | `#f472b6` | true |
| 7 | `winpriv` | Windows privilege escalation | `#facc15` | true |
| 8 | `linpriv` | Linux privilege escalation | `#fb923c` | true |
| 9 | `portredir` | Port redirection and manual tunneling | `#2dd4bf` | true |
| 10 | `tunneling` | Tunneling through tools | `#22d3ee` | true |
| 11 | `adtheory` | Active Directory theory | `#818cf8` | true |
| 12 | `adenum` | Active Directory enumeration | `#f0883e` | true |
| 13 | `adattack` | Active Directory attacking | `#fb7185` | true |
| 14 | `adlateral` | Active Directory lateral movement | `#e879f9` | true |
| 15 | `cloud` | Cloud infrastructure | `#60a5fa` | true |
| 16 | `reports` | Reports writing | `#94a3b8` | true |
| 17 | `filetransfers` | File transfers | `#4ade80` | true |
| 18 | `utilities` | Utilities | `#cbd5e1` | true |

- The AV-evasion label is reconciled to **`Antivirus Evasion & Metasploit`** (Q3).
- **`Utilities`** is the reassignment target offered when deleting a non-empty custom category (Q17).
- A reserved fallback category **`Autre`** (see §6.9) is not part of the seeded 18; it is created lazily only when an import needs it.

Built-in categories are **renamable and recolorable but never deletable** (Q17). Custom categories are fully editable and deletable **only when empty**; deleting a non-empty custom category is blocked with an offer to reassign its commands to `Utilities` first (Q17).

### 6.3 Sidebar — Category › Tool › Tag navigation

The left sidebar (below the Variables panel) renders three blocks: **« Toutes les commandes »**, **« Catégories »** (tree), **« Tags »** (facet).

Structure and behavior:

- **« Toutes les commandes »** row (accent dot) with the **global total** command count. Selecting it clears `activeCategory` + `activeTool` (see Q44).
- **Category tree** — one collapsible row per **non-empty** category. Empty categories are **hidden from the sidebar** but still listed in the Add/Edit modal category picker (Q3). Each row shows a category-color dot, the label, and the **global** command count. A chevron (`▸`/`▾`) toggles expansion; expansion state is device-local UI state.
  - **Tool sub-rows** (shown when expanded): one per distinct tool within that category, mono font, category-color tick, and the **global** count for that `(category, tool)` pair. Selecting a tool sets `activeCategory` + `activeTool`.
  - Selecting a category row alone sets `activeCategory` and clears `activeTool`.
- **Tags facet** — chips of every tag present on any command, each with its **global** count. Chips are **multi-select toggles** (Q42, see §6.5). An active tag chip uses the accent selected style.

**Counts are always global totals** (Q50): `catCount`, `toolCount` and `tagCount` are computed over *all* commands, ignoring active filters — the sidebar is a stable navigation map. The result header (§6.5) shows the *filtered* count instead. This asymmetry is intentional and must be documented in-app help.

**Sort order (Q48):**

| Collection | Order |
|---|---|
| Categories | Curated `position` (the table in §6.2; custom appended after) |
| Tools within a category | Alphabetical (case-insensitive), first-seen case preserved |
| Commands within a tool | Alphabetical by `title`, `createdAt` as tiebreak |
| Tags | Alphabetical |

### 6.4 Command card anatomy

Cards render in a responsive grid (`repeat(auto-fill, minmax(370px, 1fr))`), grouped under a category header (color dot + label + filtered count) then a tool sub-header (color tick + tool name + filtered count). Card composition, top to bottom:

| Element | Content / behavior |
|---|---|
| **Title** | `command.title`, bold. |
| **Description** | `command.desc`, muted; hidden when empty. |
| **Code block** | `command.template` rendered with variable highlighting (see below). A non-selectable accent-colored `"$ "` prompt prefixes each block (`user-select:none`, so copy/selection never captures it). Block is `white-space:pre-wrap` (multi-line templates preserved), `overflow-x:auto`. |
| **Copy button** | Top-right of the code block; copies the **resolved** template (see §6.6 copy / Q53). |
| **Tags** | Clickable `#tag` chips; clicking a tag toggles it in the active tag filter set (Q42). |
| **Cheatsheet toggle** | Split control (A39). The **primary button** toggles membership of this command in the **active cheatsheet** (D1): label **« + Cheatsheet »** when not a member, **« Ajoutée ✓ »** (accent style) when a member. A **split/dropdown affordance « Ajouter à… »** lists **all** cheatsheets as checkboxes reflecting per-sheet membership, letting the user add/remove this command to/from **any** sheet (not just the active one). Each toggle posts with an explicit `sheetId` (§4.6.8). Full multi-cheatsheet semantics are owned by §9. |
| **Personal note** | Dashed-border textarea, placeholder **« Note personnelle… »**, `resize:vertical`. Bound to the per-command note (keyed by `commandId`). Autosaved (debounced text field, D3). No variable substitution (Q34). Excluded from search (Q37). |

> The library card carries **no tool badge** (A59): the tool is already surfaced by the Category › Tool sub-header above the card. The mono tool `badge()` styling is reserved for the cheatsheet entries (§9), where the grouping context is absent.

**Variable highlighting in the code block** (governed by §5, authoritative in §5.10 — reflected here):

- Tokenization matches the grammar `$[A-Z_][A-Z0-9_]*` (Q22). `\$` is an escape producing a literal `$` with no substitution (Q33). Substitution is single-pass, values inserted verbatim, and only **defined** variable names substitute (Q33/Q35).
- **Three rendered states, exactly as §5.10** (A5 — the earlier 2-state collapse is fixed):
  - **Resolved** — the variable is defined **and** its (memory-only) value is non-empty: the substituted value is shown **green-highlighted** (`color: var(--acc)`, `background: var(--acc-dim)`).
  - **Empty** — the variable is defined **but its value is empty**: the literal `$TOKEN` is kept visible in a **neutral placeholder style (no dotted underline)**, signalling a known-but-unfilled variable. Never substituted to an empty string.
  - **Undefined** — the variable name is **not defined at all**: the literal `$TOKEN` is kept visible in the distinct **muted / dotted** dangling style. Never substituted.
- Because variable **values are memory-only** (D2/D7), highlighting recomputes live as the user edits values and resets on reload; nothing is persisted.

### 6.5 Search

A single search box (**« Rechercher… »**, top bar) drives the Library.

- **Scope of matched fields (Q37):** `title`, `template` (raw), `desc`, `tags`, `tool`, and the **category label**. The **personal note is excluded**.
- **Raw template only (Q40):** search matches the raw `$TOKEN` template, never the resolved output — results are deterministic and independent of current variable values.
- **Matching = tokenized AND (Q38):** the query is split on whitespace into terms; a command matches only if **every** term is found as a substring somewhere in its haystack. (`nmap scan` matches a command containing both words in any field/order — the prototype's single-substring bug is fixed.)
- **Case- and accent-insensitive (Q39):** both the haystack and each query term are folded — lowercase + Unicode `NFD` normalize + strip combining diacritical marks — before comparison. (`enumeration` matches `Énumération`.)
- **Per-module (Q41):** the query is scoped to the Library and **reset when leaving the module**; the box is hidden/disabled in modules where it has no effect (Methodology, Cheatsheet). It is also active in References (§8.7).

Haystack construction (folded, lowercased):

```
fold( title + " " + desc + " " + template + " " + tool + " " + tags.join(" ") + " " + categoryLabel )
```

### 6.6 Filters

Four filter dimensions combine with the search:

| Dimension | Selection model | Combination |
|---|---|---|
| Category | Single-select (`activeCategory`) | AND |
| Tool | Single-select (`activeTool`), **scoped to the selected category** (Q45) | AND |
| Tags | **Multi-select, OR internal** (`activeTags[]`) — a command matches if it carries **at least one** selected tag (Q42) | AND with other dimensions |
| Query | Tokenized AND (§6.5) | AND |

The Library filter state (`activeCategory`, `activeTool`, `activeTags[]`, `query`) is **in-memory / device-local UI state only**, never persisted (A34 / §10.1.1).

Selecting a second tag **adds** it to the set (it no longer replaces the first — prototype bug fixed). The tool filter stays scoped inside its category; a cross-category "all commands using tool X" view is out of scope for v1 (Q45).

**Match algorithm (client-side):**

```
match(c):
  if activeCategory  && c.categoryId !== activeCategory                    -> false
  if activeTool      && normalizeTool(c.tool) !== normalizeTool(activeTool) -> false
  if activeTags.length && !activeTags.some(t => c.tags.includes(t))         -> false   // OR within tags
  for term in queryTerms:                                                              // tokenized AND
      if !haystack(c).includes(fold(term)) -> false
  return true
```

**Active-filter chips & reset affordances (Q43, Q44):**

- All active filters render as **removable chips** in the result header — one chip per active dimension: category, tool, each selected tag, and the query. Each chip's ✕ clears just that dimension (removing a single tag from the set).
- Two distinct reset affordances, with documented, non-overlapping semantics (Q44):

| Affordance | Location | Clears |
|---|---|---|
| **« Toutes les commandes »** | Sidebar top row | `activeCategory` + `activeTool` **only** (keeps tags + query) |
| **« réinitialiser »** | Result header link | **Everything**: `activeCategory`, `activeTool`, `activeTags[]`, `query` |

- The header also shows the **filtered** command count: `<n> commande(s)`.
- This « réinitialiser » is Library-only and must be visually/textually distinct from the Methodology **« Réinitialiser la progression »** control (Q44/Q57).

**Layout:** Category › Tool grouping is the only layout in v1; category groups are **collapsible** with device-local expansion memory (Q49). No flat/list toggle.

**Copy behavior (Q53 — OPSEC):** the card copy button (and per-step/per-entry copy buttons elsewhere) copies the **resolved** command (variables substituted with current in-memory values) via `navigator.clipboard.writeText`. The toast reflects the **real** clipboard result:

- success → **« Copié dans le presse-papier »**
- failure (rejected promise, insecure context, missing Clipboard API) → an explicit error toast, e.g. **« Échec de la copie »** (the prototype's always-"Copié" behavior is removed).

The resolved copy can contain real IPs/creds; this is an intentional local action for terminal paste and is documented in §12 (reconciles with Q99: exported files stay raw-token by default, the clipboard stays resolved).

### 6.7 Empty states

Two distinct states (Q51):

- **First-run / truly empty** — total command count is `0`: show a first-run empty state inviting the user to add or import commands (distinct copy from the no-match state).
- **No match** — total `> 0` but filtered result is `0`: show the no-match state **« // aucune commande »** / **« Modifie ta recherche ou réinitialise les filtres. »**, pointing at the reset affordances.

### 6.8 CRUD — Add / Edit / Delete / Duplicate

CRUD is complete for commands (D6). A **single reused modal** serves both Add and Edit (Q12).

**Add** — the top-bar **« + Commande »** button opens the modal empty (title **« Nouvelle commande »**, submit **« Ajouter »**). On submit → **awaited `POST /api/commands`** (R2): the server mints the ULID (D5) and returns the full `Command`; the card renders under its category/tool **once the response resolves** — there is no provisional local key, temp-ID or client-side ID reconciliation. On failure a **persistent error banner** is shown and the create is retried on the next edit/focus (the "no Save button" UX of D3 is preserved).

**Edit** — a **pencil** affordance on each card opens the same modal pre-filled from the command, **preserving its `id`** (title **« Modifier la commande »**, submit **« Enregistrer »**). On submit → `PATCH /api/commands/:id`.

**Modal fields** (French labels, verbatim):

| Field | UI | Rules |
|---|---|---|
| Catégorie | **Selectable category chips/pills** for **all** categories (incl. empty built-ins), **single-select** (the active chip uses the accent selected style) + a **« + »** toggle revealing a **« Nom de la nouvelle catégorie »** input (A53 — faithful to the prototype; not a `<select>`) | On-the-fly creation (below). Required. |
| Outil | Free-text input, placeholder **« Nom de l'outil »**, with a `datalist` of existing tools (deduped, sorted) | Trim; empty → **« Divers »** (Q46). |
| Titre de la commande | Text, placeholder **« Ex : Scan complet TCP »** | **Required** (Q54). |
| Commande | Multi-line textarea, hint **« — utilise $IP, $LHOST… »**, placeholder `nmap -sC -sV $IP` | **Required** (Q54). Multi-line preserved. |
| Description | Text, placeholder **« Optionnel »** | Optional. |
| Tags | Clickable chips of existing tags (**« clique pour réutiliser, ou saisis-en de nouveaux »**) + free-text input **« Nouveaux tags séparés par des virgules »** | Merge selected chips + typed tags; normalize (below). |

**Validation (Q54):**

- Require `title` + `template` (non-empty after trim); otherwise block with toast **« Titre et commande requis »**.
- **Warn, do not block**, on an exact duplicate (`title` + `template`) within the same tool.
- Category and tool labels are **deduplicated case-insensitively** (Q54/Q8): typing a category name that matches an existing label (case-insensitive) reuses that category instead of creating a duplicate; likewise a tool name matching an existing tool (case-insensitive) reuses its first-seen casing.

**On-the-fly creation:**

- **Category** — a typed new name (after case-insensitive dedup) creates a custom category via `POST /api/categories`: `color` defaults to the next palette color `['#22d3ee','#e879f9','#fb923c','#4ade80','#f43f5e','#818cf8','#eab308','#2dd4bf']`, overridable; `isBuiltin=false`; `id` is a server ULID (never a mutable count key) (Q11/D5). Toast **« Catégorie « X » créée »**.
- **Tool** — normalized: trim, case-insensitive match keeping first-seen case, empty → `"Divers"` (Q46). No tool entity.
- **Tags** — normalized (Q47): trim, strip a leading `#`, store **lowercase**, dedup case-insensitively, commas act only as separators (a tag may contain spaces), empty tokens dropped. **v1 supports per-command tag editing only through this modal; global tag rename / merge / delete and dropping of zero-reference tags are deferred to v2** (A14 — see §1.5 / Open Items). There is no global tag-management surface or endpoint in v1.

**Post-add navigation (Q55):** after adding a command, set `activeCategory`/`activeTool` to its category/tool, expand that category, **and also clear `activeTags[]` and `query`** so the new card is guaranteed visible. Toast **« Commande ajoutée »**.

**Delete (Q13/Q14/Q19):** a delete action (card and/or modal) opens a **destructive confirmation** dialog reporting the reference count — how many methodology steps link it, how many cheatsheets contain it, whether a personal note exists. On confirm → `DELETE /api/commands/:id`, which cascades:

- **linked steps** → `Step.commandId` nulled, step **text kept** (link shown as broken on affected steps, per §7 / Q63);
- **cheatsheet membership** → removed from every cheatsheet composition (FK cascade);
- **orphan personal note** → deleted;
- dependent view state (selection keyed by this id) is cascade-cleaned (Q19).

**Duplicate (deferred to v2, A28):** command duplication (a **« Dupliquer »** action pre-filling the Add modal from the source command) is **deferred to v2** (see §1.5 / Open Items). v1 ships Add / Edit / Delete only.

### 6.9 Imported unknown categories → « Autre »

On JSON import (REPLACE, D4), any command whose `categoryId` does not resolve to a known category is **remapped to a reserved fallback category `Autre`** (Q52):

- `Autre` is created lazily on first need with a **fixed identity** (A44): literal `id` **`autre`** (stable round-trip), label **« Autre »**, fixed gray color **`#cbd5e1`** (same as `Utilities`), `isBuiltin=false`, `position = max(position) + 1` (positioned last). It is **not** one of the seeded 18 and is **never created except on demand**. It is treated as non-deletable while it holds commands (per Q17 delete rules).
- The import completes and surfaces a **warning** listing the number of remapped commands. No command is ever silently hidden (the prototype counted unknown-key commands but never rendered them — fixed by this remap).

### 6.10 REST surface (persistence only)

Search/filter/grouping/counting are client-side and have **no** endpoints. Library-owned mutation endpoints (debounced text-field autosave + **awaited creates** — D3/R2; ULIDs server-minted — D5; authoritative signatures in §4.6.1–§4.6.2):

| Method | Path | Body | Response | Behavior |
|---|---|---|---|---|
| `POST` | `/api/commands` | `{ categoryId, tool, title, template, desc, tags[], language? }` | `201` `Command` (with ULID) | Awaited by the client (R2). Validates required `title`+`template`; normalizes `tool`/`tags`. |
| `PATCH` | `/api/commands/:id` | partial `{ title?, template?, desc?, categoryId?, tool?, tags[]?, language? }` | `200` `Command` | Field-level update; `id` preserved. Personal-note autosave rides `PUT /api/notes/{commandId}` (§4.6.10). |
| `DELETE` | `/api/commands/:id` | — | `204` | Cascade per §6.8 / Q14; reference counts known client-side. |
| `POST` | `/api/categories` | `{ label, color? }` | `201` `Category` | On-the-fly custom category; label deduped case-insensitively; `color` defaults to next palette slot. |
| `PATCH` | `/api/categories/:id` | `{ label?, color? }` | `200` `Category` | Built-ins: label/color only (never delete). |
| `DELETE` | `/api/categories/:id` | — | `204` / `409` | Custom **and** empty only; otherwise `409` with a reassignment hint toward `Utilities` (Q17). |

### 6.11 Edge cases & invariants

- Selecting a tool without a category is impossible: the tool filter is always scoped to its category (Q45).
- Toggling all tags off (or clearing them) returns to the current category/tool/query scope; it never widens beyond other active dimensions.
- Empty categories vanish from the sidebar the instant their last command is deleted or moved, but remain selectable in the Add/Edit category picker (Q3).
- **Variable rename does not cascade across templates in v1** (A27): a variable may be renamed only while it is **unreferenced**; a referenced variable must be deleted and recreated, after which its former `$TOKEN`s render as **undefined** (muted / dotted, §5.10) until updated. Library cards re-highlight accordingly on next render.
- The personal note shown on the card is the same base note surfaced by the cheatsheet entry (Q95/Q97); editing it here updates both (per-entry override deferred to v2, §9).
- Sidebar counts never change with active filters; only the header count and the rendered groups do (Q50).

> **Open:** global tag management (rename / merge / delete, zero-reference cleanup) and command duplication are **deferred to v2** (A14, A28). All other in-scope questions (Q3–Q6, Q37–Q56) are resolved by the adopted Recos and the decisions log.

---
## 7. Methodology Module

The Methodology module organizes OSCP attack knowledge as **roadmaps → phases → steps**. Each roadmap is a named, fully editable checklist; each phase groups checkable steps; each step optionally links exactly one command that expands inline with resolved display and a copy button. Progress bars are computed per phase and globally. The module reuses the roadmap tab/CRUD pattern that also backs cheatsheets (D1).

This section reflects the following locked decisions: **D5** (server-minted ULIDs; phases/steps are first-class rows with stable IDs + position; progression keyed by step ID; seed IDs preserved literal) and **Q57–Q76**. Cross-cutting decisions referenced here: Q7 (`Step.commandId`), Q10 (position columns), Q18 (seed = ordinary rows), Q19 (cascade of dependent state), Q31/Q32/Q33/Q35 (variable resolution), Q53/Q99 (clipboard resolved, exports raw), Q112 (persistence mapping), Q133 (seed first-run-only), D3 as revised by **R2** (awaited structural creates + debounced text-field edits; no retry queue, no temp IDs).

---

### 7.1 Data model

Phases and Steps are **first-class rows** (D5, Q2), not array indices. Progress (`done`) lives on the step row itself so it follows the step through any reorder or cross-phase move — this eliminates the prototype's positional-key resurrection bug. The linked-command panel open/closed state is **transient in-memory React state** (A15), not a column: it is never persisted, PATCHed, exported, or reset (see §3.2.6, §10.1.1). (Authoritative schema in §3.2.4–§3.2.6.)

**Table `roadmaps`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT (ULID) | PK, server-minted | Seed roadmaps keep their literal IDs (`services`, `web`, `ad`, `privesc`) — D5, Q18. |
| `label` | TEXT | NOT NULL, trimmed, non-empty | Duplicates allowed; UI warns on duplicate (Q75). |
| `position` | INTEGER | NOT NULL | Dense `0..n-1`. Persisted for forward-compat; **tabs are not reorderable in v1** (Q68) — rendered in `position` (creation) order. |
| `createdAt` | TIMESTAMP | NOT NULL | Tiebreaker / audit. |

**Table `phases`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT (ULID) | PK, server-minted | Stable across reorder (D5). |
| `roadmapId` | TEXT | NOT NULL, FK → `roadmaps.id` ON DELETE CASCADE | |
| `label` | TEXT | NOT NULL, trimmed, non-empty | Duplicate phase names allowed (Q75). |
| `position` | INTEGER | NOT NULL | Dense `0..n-1` within the roadmap. |

**Table `steps`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT (ULID) | PK, server-minted | Stable across reorder and cross-phase move (D5, Q58). |
| `phaseId` | TEXT | NOT NULL, FK → `phases.id` ON DELETE CASCADE | Reassigned on cross-phase move. |
| `text` | TEXT | NOT NULL, trimmed, non-empty | Free-text step title, inline-editable (Q59). |
| `commandId` | TEXT | NULLABLE, FK → `commands.id` ON DELETE SET NULL | Exactly one command per step, 0..1 (Q7, Q64). SET NULL implements auto-unlink (Q63). |
| `done` | BOOLEAN | NOT NULL, default `false` | Progression, keyed by stable step ID (D5). Prototype `checks{}`. |
| `position` | INTEGER | NOT NULL | Dense `0..n-1` within the phase. |

> The prototype's `openSteps{}` panel-open map has **no column** here: linked-command panel expansion is transient in-memory React state (A15, §3.2.6, §10.1.1) — never persisted, PATCHed, exported, or reset.

- No per-step free note in v1 (Q65 — deferred). `steps.text` + `commandId` are the only content fields.
- Deleting a parent cascades all dependent state via FK `ON DELETE CASCADE` (`done` lives on the step row, so it vanishes with the row) — Q19.
- The old prototype fields `Step.note`/`checks{}`/`openSteps{}` maps are gone; `commandId` and `done` are typed columns. Panel expansion is in-memory React state, not a column (A15).

---

### 7.2 Seed roadmaps

Four roadmaps are seeded **once, on first run only** (Q18, Q133) as ordinary editable/deletable rows with literal seed IDs. They are exported like any other row and never auto-re-seeded on upgrade.

| Seed `id` | `label` (French, verbatim) | Phases (labels) |
|---|---|---|
| `services` | `Machine — Services` | `Reconnaissance initiale`, `Énumération des services`, `Recherche de vulnérabilités` |
| `web` | `Application web` | `Cartographie`, `Vulnerability scanning`, `Exploitation` |
| `ad` | `Active Directory` | `Énumération`, `Accès & identifiants`, `Mouvement latéral` |
| `privesc` | `Élévation de privilèges` | `Linux`, `Windows` |

Seed steps and their `commandId` links are taken verbatim from the prototype `roadmaps` array (e.g. `services › Reconnaissance initiale`: "Scan TCP complet de tous les ports" → command `n1`, etc.). Seed step IDs are freshly minted ULIDs at seed time; their `commandId` references the literal seed command IDs (`n1`, `s2`, `f1`, …).

**Seed link resolution (A30):** a seed step whose `commandId` would reference a command **absent** from the seeded command set is inserted with `commandId = NULL` (link dropped) and the drop is reported, mirroring the import-repair rule (§10.4.4). This keeps first-run seeding FK-safe under `foreign_keys=ON` and prevents an aborted seed transaction; in the canonical seed set every referenced command is present, so no links are normally dropped.

**Restore defaults — deferred to v2 (A28):** the `Restaurer les méthodologies par défaut` action (partial re-seed of missing seed roadmaps) is deferred to v2; the endpoint and its former `{ restored: [ids] }` response shape are removed from v1 (A56 is subsumed — there is no v1 response to standardize). See Open Items. In v1 the four seed roadmaps exist only from first-run seeding; once deleted they are not recoverable in-app (fall back to JSON import of a prior export).

---

### 7.3 API endpoints (recap — authoritative in §4)

Same-origin REST, bound to `127.0.0.1`. Per **R2**: structural **creates are awaited** (`await POST` returns the server-minted ULID before the new row is treated as real — no `tmp_` IDs, no ID reconciliation, no dependency ordering); **text-field edits** (roadmap/phase labels, step text) are **debounced (~500 ms)** PATCHes; the `done` toggle PATCHes on the spot against the step's real ID; **deletes are deferred** behind the undo window (§7.9). On failure a **persistent error banner** surfaces and the mutation retries on the next edit/focus — there is no retry queue and no explicit Save button (spirit of D3). `done` is backend-persisted content (Q112); the linked-command panel open/closed state is transient in-memory React state (A15) and is never PATCHed. The **active roadmap** and edit-mode state are **not** persisted server-side — active roadmap is device-local (Q69, Q112). Reads arrive via `GET /api/state` (§4.5); the mutation surface (canonical signatures in §4.6.4–§4.6.6 and §4.7):

**Roadmap CRUD**

| Method / Path | Body | Behavior |
|---|---|---|
| `POST /api/roadmaps` | `{ label }` | Mint ULID, `position = max+1`. Awaited (R2). `201` → new roadmap (empty `phases`). |
| `PATCH /api/roadmaps/:id` | `{ label?, position? }` | Rename / reposition. `200`. |
| `DELETE /api/roadmaps/:id` | — | Cascade-delete phases/steps. `204`. |
| `POST /api/roadmaps/:id/reset-progress` | — | Set `done=false` for every step in the roadmap. `200`. |

> **Deferred to v2 (A28):** `POST /api/roadmaps/:id/duplicate` (deep-clone) and `POST /api/roadmaps/restore-defaults` (partial re-seed) are removed from v1. `reset-progress` — the core of the checklist workflow — is retained. See Open Items.

**Phase CRUD / reorder**

| Method / Path | Body | Behavior |
|---|---|---|
| `POST /api/roadmaps/:id/phases` | `{ label }` | `position = max+1`. Awaited (R2). `201`. |
| `PATCH /api/phases/:id` | `{ label?, position? }` | Rename / reposition within roadmap; server splices then renumbers `0..n-1`. `200`. |
| `DELETE /api/phases/:id` | — | Cascade-delete steps. `204`. |
| `POST /api/roadmaps/:id/phases/reorder` | `{ orderedIds }` | Bulk reorder (§4.7). `200`. |

**Step CRUD / state / reorder**

| Method / Path | Body | Behavior |
|---|---|---|
| `POST /api/phases/:id/steps` | `{ text, commandId? }` | `position = max+1`. `commandId` optional (0..1). Awaited (R2). `201`. |
| `PATCH /api/steps/:id` | `{ text?, commandId?, done? }` | Edit text; change linked command (`commandId: null` clears the link, Q60); toggle completion (`done`, Q113). **No `expanded`** — panel open/closed is in-memory React state (A15). **No `phaseId`/`position` on PATCH** — all moves (intra- and cross-phase) go through the reorder endpoint (A46). `200`. |
| `DELETE /api/steps/:id` | — | `204`. |
| `POST /api/phases/:id/steps/reorder` | `{ orderedIds }` | **Single reorder path** for all step DnD and `↑`/`↓`, incl. cross-phase receive (§4.7). Detach from source, insert into target, renumber both phases; `done`/`commandId` preserved (A46). `200`. |

> Reorder normalization (A47): `position` is a **dense contiguous integer** (`0..n-1`) reassigned by the server on every insert/move/delete within a container. There are no gaps and no fractional/"midpoint" stored positions — the midpoint measurement is purely the visual drop indicator (§7.8).

---

### 7.4 View layout & states

Desktop-only strict layout (D8). Centered column, `max-width ~820px` (§11.5.3).

- **Roadmap tabs**: a wrap-flowing row of pill buttons, one per roadmap, in `position` order. The active pill uses the accent-dim style; others the muted surface style. Clicking a pill sets the active roadmap (device-local, Q69). The top-bar Add button in this view reads **`+ Méthodologie`** and opens the inline new-roadmap input.
- **New-roadmap input** (opened by `+ Méthodologie`): a text field (placeholder `Nom de la méthodologie — ex : Machine — Linux`) + **`Créer`** button. On submit (non-empty), the roadmap POST is **awaited** (R2); once the server-minted ULID returns, activate it and **auto-enter edit mode** (Q76).
- **Header row** (when a roadmap exists): roadmap label + progress readout (`{done}/{total} · {pct}%`), a global progress bar underneath, the edit toggle, and the reset button.
- **Edit toggle**: label alternates **`✎ Modifier`** ↔ **`Terminé`**; active state uses the accent-dim button style.

**Empty states**

- **No roadmaps at all** (`noRoadmap`): centered block — mono line `// aucune méthodologie` + `Crée-en une avec le bouton « + Méthodologie ».` (Restore-defaults recovery is deferred to v2 per A28, so it is not offered here; a user who deleted every roadmap recreates one or imports a prior export.)
- **Roadmap with no phases**: header + progress render (in neutral state, §7.5); the phase list is empty. In edit mode the `+ Phase` affordance is the obvious next step (Q76 lands the user here in edit mode).
- **Phase with no steps**: phase card renders its header with a neutral `0/0` count and empty bar. In edit mode it shows the add-step draft row and (Q74) an explicit **drop zone** so a step can be dragged in from another phase.

---

### 7.5 Progress computation

Weighting is **equal per step** globally (Q61): the global bar is `done/total` over *all* steps in the roadmap, so larger phases legitimately carry more weight. Per-phase bars use that phase's own steps.

Rounding and bounds (Q62):

- Let `total` = step count in scope (phase or whole roadmap), `done` = completed count.
- **`total == 0`** (empty roadmap or empty phase): show a **neutral state**, not `0%`. Count reads `0/0`; the progress readout shows `aucune étape` in place of a percentage; the bar is empty (0 width).
- **`done == 0`** (and `total > 0`): exactly `0%`.
- **`done == total`**: exactly `100%`.
- Otherwise: `clamp(round(done/total*100), 1, 99)` — never show `0%` or `100%` for a partially-complete scope (prevents `199/200 → 100%`).
- Header readout format: `{done}/{total} · {pct}%` (e.g. `7/15 · 47%`); empty: `0/0 · aucune étape`.
- Per-phase header shows `{pdone}/{pcount}` plus a compact bar (same clamp rules).

Bars: a track (`--border`) with an accent fill (`--acc`) whose width is the computed percentage.

---

### 7.6 Step row & linked command

Each step renders: an optional drag handle (edit mode), a checkbox, the step text, an optional command-toggle button, and (edit mode) delete + up/down controls.

- **Checkbox**: empty box → filled accent box with `✓` when `done`. Toggling PATCHes `/api/steps/:id { done }` against the step's real ID. Completed steps render their text struck-through and muted.
- **Linked-command toggle**: shown only when the step has a resolvable `commandId`. Collapsed label = **`▸ {tool}`** (the linked command's tool name); expanded label = **`masquer`**. Toggling flips **in-memory React state only** (A15) — no PATCH, nothing persisted; the panel re-collapses on reload.
- **Inline command panel** (when the panel is open and the command resolves): shows the command title as a mono caption, a **`Copier`** button, and a `<pre>` code block prefixed with a non-selectable `$ ` gutter.

**Variable resolution in the inline panel** (reuses the §5 resolver — Q31/Q32/Q33/Q35). Per A5, the panel renders the **three** resolution states exactly as defined in §5.10 (authority) — do **not** collapse `empty` and `undefined` into a single dangling style:

- Tokenize the template; render literal segments plain.
- **Resolved** — a `$TOKEN` whose variable is **defined and non-empty**: substitute its current value, styled accent-green on accent-dim background.
- **Empty** — a `$TOKEN` whose variable is **defined but has no value**: render the raw `$TOKEN` in a **neutral placeholder** style **without** dotted decoration (distinct from both resolved and undefined) — signalling "known variable, awaiting a value".
- **Undefined** — a `$TOKEN` with **no matching variable definition**: render the raw `$TOKEN` in the **muted + dotted (dangling)** style, never green.
- Substitution is single-pass, values verbatim; `\$` escapes a literal `$`; only defined variable names substitute (Q33, Q35).
- Values are **memory-only** (session): the resolved preview reflects the current in-memory variable set and is recomputed live as values change; nothing here is persisted.

**Copy** (Q53, Q99): the `Copier` button writes the **fully-resolved** command to the clipboard (intentional local action for terminal paste) and shows a real success/failure toast (`Copié dans le presse-papier` on success). Exports elsewhere emit raw tokens by default (Q99) — the clipboard is the deliberate resolved exception.

**Linked command deleted (Q63):** deleting a command in the Library sets `steps.commandId = NULL` (FK `ON DELETE SET NULL`). The Library delete confirmation reports the count of affected methodology steps (cross-ref §3.4 / §6.8). The affected step simply reverts to the no-linked-command state (toggle button hidden); it can be re-linked in edit mode. No dangling ID is ever left on the step.

---

### 7.7 Edit mode (pencil)

Entered via **`✎ Modifier`** (→ **`Terminé`** to exit); auto-entered after roadmap creation (Q76). Edit mode reveals the following affordances; outside edit mode steps are read-only except the checkbox and the command toggle.

**Roadmap-level toolbar** (edit mode):
- Rename: `Nom` label + text input bound to the roadmap label (PATCH on debounced input).
- **`Supprimer`** (danger hover): delete the current roadmap — requires confirmation (§7.9).
- *(Duplicate roadmap is deferred to v2 — A28 — so no `Dupliquer` affordance ships in v1.)*

**Per-phase** (edit mode):
- Drag handle `⠿` (title `Glisser pour déplacer la phase`).
- Label input (PATCH on debounced input).
- **`↑` / `↓`** buttons (titles `Monter` / `Descendre`) to reorder the phase — a11y/keyboard/touch-safe path (Q71, Q72). Committed via the phase reorder endpoint (A46).
- **`✕`** delete (title `Supprimer la phase`) — immediate UI removal + deferred DELETE + undo toast (§7.9).
- Add-step draft row: text input (placeholder `Intitulé de la nouvelle étape…`) + a command `<select>` whose first option is **`— aucune commande liée —`** followed by `{tool} — {title}` per command, and a **`+ Étape`** button (the create POST is awaited — R2).

**Per-step** (edit mode):
- Drag handle `⠿` (title `Glisser pour réordonner`).
- Inline text edit — the static text becomes an editable input (Q59); PATCH `/api/steps/:id { text }` on debounced input.
- Linked-command change — a `<select>` (same option list) lets the user change, set, or clear (`— aucune commande liée —` → `commandId: null`) the linked command of any existing step (Q60); PATCH `/api/steps/:id { commandId }`.
- **`↑` / `↓`** buttons (intra-phase reorder; a11y path — Q72) — committed via the step reorder endpoint (A46), never a `position` PATCH.
- **`✕`** delete (title `Supprimer l'étape`) — immediate UI removal + deferred DELETE + undo toast (§7.9).

**Add-phase** (edit mode, below the phase list): text input (placeholder `Nom d'une nouvelle phase…`) + **`+ Phase`** button (awaited create — R2).

Name validation: labels are trimmed and must be non-empty (empty submissions are rejected silently, matching the prototype). Duplicate roadmap names surface a non-blocking warning; duplicate phase names are allowed (Q75).

---

### 7.8 Reordering — drag-and-drop + up/down

Reordering is available in edit mode only. Two mechanisms coexist: mouse DnD (primary) and `↑`/`↓` buttons (keyboard/touch/a11y — Q71, Q72). Both mechanisms commit through the **single reorder endpoint** for the container (A46); no `position` is ever set via a PATCH.

**Scope**
- **Phases**: reorder within their roadmap (DnD via header handle, or `↑`/`↓`).
- **Steps**: reorder within a phase **and across phases** (Q58) via DnD. `↑`/`↓` buttons reorder **intra-phase** only (flat, matching the cheatsheet control); cross-phase relocation is DnD-only.

**Visual feedback**
- **Dragged item dimmed**: the source phase card / step row renders at reduced opacity (~0.35 phase, ~0.45 step) while dragging.
- **Ghost placeholder**: a dashed accent insertion box (`2px dashed --acc`, accent-dim fill, inset glow) marks where the item will land.
- **Insertion semantics unified on midpoint before/after** (Q73): `dragover` measures the cursor against the target's vertical midpoint → insert *before* (top half) or *after* (bottom half); the placeholder renders at exactly that gap, so the drop lands where the indicator shows. Phases and steps use identical logic. The midpoint is **visual only** — on drop the server receives `orderedIds` and reassigns a dense `0..n-1` `position` (A47); no fractional position is ever stored.
- **Empty-phase drop zone** (Q74): because cross-phase moves are enabled, an empty phase renders an explicit "drop here" zone in edit mode so a dragged step has a valid target.

**Progression follows via stable step IDs (D5):** the reorder endpoint changes only `position` (and `phaseId` for cross-phase); `done` and `commandId` are columns on the step row and are never remapped. A completed step dragged to a new phase arrives still completed — no silent progress corruption, no resurrection bug. (Panel open/closed is client-only React state keyed by step ID, A15; it need not survive a server reorder and is not part of the reorder payload.)

**Keyboard/a11y:** `↑`/`↓` are real focusable `<button>`s with `aria-label`s (`Monter` / `Descendre`), disabled at the ends of their container; focus outlines follow §11.7.

---

### 7.9 Confirmations, undo & reset

Per Q70: high-impact destructive actions confirm via dialog; lower-impact deletes use immediate action + undo toast.

| Action | Pattern | French copy |
|---|---|---|
| **Delete roadmap** | Confirmation dialog (destructive) | Title/body e.g. `Supprimer « {label} » ? Cette méthodologie, ses {p} phases et {s} étapes seront définitivement supprimées.` — buttons `Supprimer` (danger) / `Annuler`. |
| **Reset progression** | Confirmation dialog | `Réinitialiser la progression de « {label} » ? Toutes les cases cochées de cette méthodologie seront remises à zéro.` — buttons `Réinitialiser` / `Annuler`. |
| **Delete phase** | Immediate + undo toast | Toast `Phase supprimée` + action `Annuler`. |
| **Delete step** | Immediate + undo toast | Toast `Étape supprimée` + action `Annuler`. |

*(The former "Restore defaults" confirmation dialog is removed — restore-defaults is deferred to v2, A28.)*

**Undo mechanics — deferred delete (A2, aligned with §8.9):** phase/step deletes apply **optimistically to the UI** and the DELETE request is **deferred until the undo window closes** (~6 s). Pressing **`Annuler`** within that window is a pure client-side no-op: the deferred DELETE is discarded and **no request is ever sent** — no round-trip, and no server row was ever touched. If the window elapses without undo, the DELETE flushes. Because the row never left the client, undo restores the full subtree with everything intact (a phase's steps come back with their `done`, `commandId`, and `position`). The old "re-create the row and its children with their previous IDs" branch is **removed** — no POST accepts a client-supplied ID or a progression-bearing subtree, so recreation was never implementable.

**Reset progression (Q57):** the control formerly labelled `Réinitialiser` is relabelled **`Réinitialiser la progression`** to disambiguate it from the Library filter-reset link. It clears `done` for **every step of the current roadmap only** (never structure, never other roadmaps), behind the confirmation above. Endpoint: `POST /api/roadmaps/:id/reset-progress`. (Panel open/closed is in-memory React state, A15 — not touched by reset-progress; the client may collapse open panels locally as a courtesy, but nothing is persisted.)

---

### 7.10 Default roadmap selection

- **Active roadmap on load / after delete (Q69):** the last active roadmap ID is persisted **device-local** (localStorage) and restored on load if it still exists, else the first roadmap by `position`. After deleting the active roadmap, select the **previous tab in order** (index − 1), or the first if the deleted one was first; if none remain, fall back to the no-roadmap empty state (§7.4).
- **Duplicate roadmap — deferred to v2 (A28):** the `Dupliquer` deep-clone (phases + steps + `commandId` links cloned with fresh ULIDs, progression reset, ` (copie)` suffix) is not built in v1. See Open Items.

---

### 7.11 Persistence & autosave mapping (methodology slice)

Per Q112 and D3 as revised by **R2**:

- **Backend-persisted (content + state):** roadmaps, phases, steps (including `text`, `commandId`, `position`), and progression (`done`). Structural **creates are awaited** (real ULID before the row is real); **text-field edits** are **debounced (~500 ms)** PATCHes; the `done` toggle PATCHes on the spot; **deletes are deferred** behind the undo window (§7.9). There is no retry queue and no `tmp_` reconciliation; on failure a **persistent error banner** shows and the mutation retries on the next edit/focus. No explicit Save button (spirit of D3).
- **Device-local (not synced):** active roadmap tab, edit-mode on/off.
- **In-memory only:** variable **values** used to resolve the inline command preview — never persisted (never DB, never localStorage), reset on reload. Also the linked-command panel open/closed state (A15) — transient React state, never persisted, never exported, re-collapsed on reload.
- **Excluded from JSON export:** variable values and panel open/closed state; roadmap/phase/step structure and progression (`done`) are exported like any other content (Q18, Q124).

---

### 7.12 Edge cases

- Toggling a checkbox or command panel is available **outside** edit mode; all structural mutation requires edit mode.
- The reorder endpoint always renumbers to dense `0..n-1` (A47); a move to an out-of-range index clamps to the container bounds.
- A step whose `commandId` was cleared (Q63) or points to a non-existent command renders with no toggle button and cannot be expanded until re-linked.
- Empty roadmap / empty phase never show `0%` — they show the neutral `aucune étape` state (§7.5).
- Cross-phase drop into an empty phase is only reachable via the explicit drop zone (Q74); intra-phase `↑`/`↓` cannot cross phase boundaries.
- Deleting the last remaining phase or step leaves the parent in its empty state, not an error.
## 8. References Module

The References module is a curated list of external links (docs, cheat-sheet sites, tooling) that the operator keeps alongside their commands and methodologies. In v1 it is **standalone**: references are not linked to commands, methodology steps, or cheatsheets, carry no foreign keys, and never appear in exports of a cheatsheet (Q88). Cross-linking is explicitly deferred to a later version.

Because reference URLs are rendered as clickable `<a href>` targets and can enter the system through JSON import (which bypasses the add form), this module is a **security boundary**: URL parsing, a scheme allowlist, and sanitization are enforced at every write and at every render.

### 8.1 Data model

One entity, `references` (§3.2.3). IDs are server-minted ULIDs (D5); the six seed references keep their literal IDs (`r1`…`r6`) so import round-trips and dedup stay stable.

| Field           | Type                     | Constraints / notes                                                                                                   |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `id`            | `string` (ULID, 26 char) | PK, server-minted. Seed IDs preserved literally (Q18, D5).                                                             |
| `title`         | `string` (TEXT)          | NOT NULL. **Optional at input**: if blank on create/edit, defaults to the extracted display domain (Q87). Never fetched from the network. |
| `url`           | `string` (TEXT)          | NOT NULL. Stored **normalized** (see §8.3). Scheme ∈ allowlist. `mailto:` targets allowed.                            |
| `desc`          | `string` (TEXT)          | Optional, default `""` (Q9). Column `description`; wire name `desc`.                                                   |
| `tags`          | `[]string`               | Optional. Stored as a JSON array column (GORM `serializer:json`). Normalized per Q47 (see §8.9). Default `[]`.         |
| `createdAt`     | `timestamp`              | Server-set. Stable ordering key for this non-reorderable collection (Q10, §3.7); references have **no** manual `position` column. |
| `updatedAt`     | `timestamp`              | Server-set, bumped on every write. Part of the entity per §3.2.3; serialized in the export envelope and preserved verbatim on import (§10.4.1, A6). |

**Derived, non-editable fields** (returned in API responses, not user-set, not part of the import/export payload beyond `url`):

| Field           | Type     | Source                                                                                                     |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `displayDomain` | `string` | Computed server-side from `url` at write time: hostname, `www.` stripped, IDN decoded to Unicode (§8.6). For `mailto:`, the domain part after `@`. Neutral marker on failure. |

`displayDomain` is what the "auto-extracted domain" refers to in scope. Computing it on the server (via `golang.org/x/net/idna`) keeps the client free of any punycode dependency and preserves zero egress. It MAY be cached in a column for query convenience but is always a function of `url` — never independently editable.

### 8.2 REST API (recap — authoritative in §4.6.3)

Same-origin, bound to `127.0.0.1` (Q168). The server is the authoritative validator; the client validates too, only for inline UX. Reference create/edit are **synchronous validated writes committed on modal submit** — not fire-and-forget debounced autosave — because a URL can fail parsing/scheme/dedup checks (this is the documented reconciliation with the D3 write rule: inline text edits are debounced awaited writes, while modal-based create/edit for commands and references commit on submit and surface validation errors inline). Reads arrive via `GET /api/state` (§4.5).

| Method   | Path                     | Body                                              | Success           | Errors                                                                 |
| -------- | ------------------------ | ------------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `POST`   | `/api/references`        | `{title, url, desc, tags[]}`                      | `201` `Ref DTO`   | `400 VALIDATION_FAILED` (`url` required / unparseable) / `400 SCHEME_NOT_ALLOWED` / `409 DUPLICATE_REFERENCE_URL` |
| `PATCH`  | `/api/references/:id`    | `{title, url, desc, tags[]}` (full mutable set)   | `200` `Ref DTO`   | `404` / `400 VALIDATION_FAILED` / `400 SCHEME_NOT_ALLOWED` / `409 DUPLICATE_REFERENCE_URL` (excluding self) |
| `DELETE` | `/api/references/:id`    | —                                                 | `204`             | `404`                                                                  |

**Ref DTO** (response shape):

```json
{
  "id": "01J9Z…",
  "title": "HackTricks",
  "url": "https://book.hacktricks.xyz",
  "displayDomain": "book.hacktricks.xyz",
  "desc": "Encyclopédie de techniques d'attaque…",
  "tags": ["general"],
  "createdAt": "2026-07-15T10:22:31Z",
  "updatedAt": "2026-07-15T10:22:31Z"
}
```

**Error envelope** (4xx) follows §4.3 (SCREAMING_SNAKE_CASE codes, per-field detail in `details[]`). `VALIDATION_FAILED` carries the offending field (`url`); for `DUPLICATE_REFERENCE_URL` the `details` also carry the colliding reference id so the SPA can point at it; `SCHEME_NOT_ALLOWED` is a dedicated code for a non-allowlisted scheme.

### 8.3 URL handling pipeline

Applied identically on client (WHATWG `URL`) and server (`net/url` + `x/net/idna`); the server result wins. Order matters.

1. **Trim** the raw input.
2. **Scheme prefixing (Q77).** If the trimmed input does **not** begin (case-insensitive) with an allowlisted scheme prefix — `http://`, `https://`, or `mailto:` — prepend `https://`. (So `book.hacktricks.xyz` → `https://book.hacktricks.xyz`; `mailto:a@b.com` is left as-is; `javascript:alert(1)` is left as-is and rejected in step 4.)
3. **Parse (Q77).** Feed the result to the URL parser. If it throws / fails to parse → **block the save**, show the inline error `URL invalide` (`VALIDATION_FAILED`). Never store an unparseable string (the prototype bug where `"not a url"` became `"https://not a url"` is closed).
4. **Scheme allowlist (Q78).** Read the parsed `protocol`. If it is not one of `http:`, `https:`, `mailto:` → **block the save**, inline error `Schéma d'URL non autorisé (http, https ou mailto uniquement)` (`SCHEME_NOT_ALLOWED`). This is what rejects `javascript:`, `data:`, `file:`, `ftp:`, etc.
5. **Normalize (Q79).** Lowercase the **scheme** and the **host**; **strip the fragment** (`#…`). Leave path, query, and (for `mailto:`) the address local-part **verbatim** — no tracking-param stripping, no default-port stripping, no forced https. This is the exact string persisted in `url` and the key used for dedup. Enough to dedup reliably without altering meaning.
6. **Duplicate detection (Q80).** Compare the normalized `url` against all existing references (case-sensitive on the already-normalized string). On an exact match → **block the save**, inline error `Cette URL existe déjà`, return `409 DUPLICATE_REFERENCE_URL`. Same-host / different-path URLs are **allowed** (`…/a` vs `…/b` are distinct). On edit, the entity being edited is excluded from the comparison.
7. **Title fallback (Q87).** If `title` is blank after trim, set it to the computed `displayDomain`.

### 8.4 Sanitization at both boundaries (Q78)

The scheme allowlist is enforced at **two** independent points so a hostile URL can never become a live link:

- **Import (defense + reporting).** Every reference in an imported JSON payload is run through the §8.3 pipeline (steps 3–5). Any reference whose URL is unparseable or carries a non-allowlisted scheme is **flagged as neutralized** (its `url` is retained for the user to see/repair, but marked invalid so the render layer refuses to link it) and its count is surfaced in the import warning summary — no reference is silently dropped and none is silently trusted. (Import mechanics — REPLACE, pre-import snapshot, atomic transaction, versioned envelope — belong to §10; this module owns only the per-URL validation contract.)
- **Render (hard gate).** At render time the view layer **re-checks** the scheme of every `url` regardless of provenance. If it is not allowlisted (or the row is flagged neutralized), the card renders the title/URL as **inert text** — no `href`, not clickable — and the domain line shows the neutral marker `lien invalide` (§8.6). The render gate is authoritative: even if a bad URL ever reached the DB, it is never emitted into an `href`.

### 8.5 Link opening & privacy (Q85)

All reference links (title link, external-open icon, domain line) that pass the render gate open in a new tab with:

- `target="_blank"`
- `rel="noopener noreferrer"` — the prototype's `rel="noopener"` (which leaked the app origin via `Referer`) is upgraded to include `noreferrer`.

Reinforced globally by:

- A page-level `Referrer-Policy: no-referrer` (served as an HTTP header and mirrored in a `<meta name="referrer" content="no-referrer">`), so no reference navigation ever emits a `Referer`.
- The strict CSP already mandated for zero egress (§12.4); external navigation is a user gesture to a new tab, not an in-page request, and is unaffected by the CSP.

**Copy-URL action (Q85).** Each reference card carries a small copy-URL affordance (icon button). It copies the **raw stored `url`** verbatim to the clipboard and shows a result-based toast per the Q53 pattern — `URL copiée` on success, an explicit failure toast otherwise (never a blind success). Reference URLs contain no variable tokens, so no resolution applies.

### 8.6 Domain rendering (Q82)

The domain line under each title is computed from `url` (server-side `displayDomain`, mirrored by the same rule client-side for the render gate):

- **http/https:** take `hostname`, strip a leading `www.`, decode IDN/punycode labels (`xn--…`) to Unicode for display (e.g. `xn--nxasmq6b.example` → the Unicode form). Ports, userinfo, path, and query are dropped from the domain line (the full URL is still the link target).
- **mailto:** take the substring after the last `@` (lowercased), stripped of any `?…` query (e.g. `mailto:admin@example.com?subject=x` → `example.com`). If there is no `@`, use the neutral marker.
- **Failure / non-allowlisted / neutralized:** render the neutral marker `lien invalide` rather than dumping the raw string (closes the prototype behavior of printing the raw unparsed input).

IDN decoding is done **offline** (server `x/net/idna`, no client punycode fetch) — consistent with zero egress.

**No favicon (Q81).** Reference cards show the **text domain only**. No favicon is fetched from any host, from `/favicon.ico`, or from a third-party favicon service — any of those would be outbound network traffic. If a favicon is ever wanted later, it may only be a locally cached `data:` URI fetched once on an explicit user action, never at display time.

### 8.7 References view — layout & cards

Desktop-only strict layout (D8), faithful to the prototype.

**Header / toolbar (References view):**
- Count line: `<n> référence(s)` (bold count).
- A **search box** (Q41): search is per-module and resets on module change; it is active in the References view (unlike Methodology/Cheatsheet where it is hidden). Matching reuses the library engine — **tokenized AND**, **case- and accent-insensitive** (Q38/Q39) — over `title`, `url`, `desc`, and `tags`.
- A `+ Référence` button opening the create modal.

**Card grid:** `grid-template-columns: repeat(auto-fill, minmax(340px, 1fr))`, gap 13px. Each card (`--card` background, `--border`, hover `--border2`) contains, top to bottom:

1. **Row:** title link (`href={url}`, weight 600, 14px, hover `--acc`) + external-open icon link (14px, hover `--acc`, `title="Ouvrir"`), plus a **copy-URL** icon and, on hover, an **edit (pencil)** and **delete (✕)** affordance.
2. **Domain line:** `displayDomain`, IBM Plex Mono 11px, `--faint`, ellipsis-truncated, also a link to `url`.
3. **Description** (only if non-empty), 12.5px `--muted`.
4. **Tag row:** each tag as `#tag` — now a **clickable filter chip** (Q83, §8.8), IBM Plex Mono 11px.

When a card's URL fails the render gate (§8.4), the title/domain/open-icon are rendered as inert text (no links) and the domain line shows `lien invalide`; the edit/delete/copy affordances remain so the user can repair or remove it.

**Empty states** (module-empty vs filter-empty split, Q51-style, parallel to §6.7 — A33):
- No references at all (fresh/first-run): `// aucune référence` + `Ajoute un lien utile avec le bouton « + Référence ».`
- Search/tag filter active with zero matches (a distinct state, never the same string as the truly-empty one): `// aucune référence trouvée` + `Modifie ta recherche ou retire le filtre de tag.`

### 8.8 Sidebar & tag filtering (Q83 / Q84)

On the References view the left sidebar is **references-specific**:

- The command-oriented **Categories** and command **Tags** sections are **replaced** by a single **reference Tags facet** — a `#tag <count>` chip list where each count reflects the number of references carrying that tag (reference tags only, not command tags). Chips are rendered like the library tag chips (uppercase section header `Tags`, wrap layout).
- The **Variables** panel is **hidden** in the References view: variable substitution applies only to command templates (Q34), so it has no effect here; hiding it removes a control that would otherwise navigate the user away. (Q84 explicitly leaves "keep or hide Variables" to the implementer; hidden is chosen for clarity.)

**Filtering behavior:**
- Clicking a tag chip (in the sidebar facet **or** on a card) toggles a single active reference-tag filter (`activeRefTag`, a scalar, in-memory only — §10.1.1). Clicking the active tag again clears it. Single-select is the v1 default (simplest, mirrors the prototype's scalar `activeTag`); multi-select OR (as adopted for the library in Q42) is a possible later enhancement.
- The active tag filter combines with the search query with **AND** (a reference must match the query *and* carry the active tag).
- Selecting a reference tag must **not** navigate to the Library view (the prototype bug where clicking a tag forced `view:'library'` is closed for reference tags — they stay in References).
- Reference tags share the global tag namespace with command tags (Q6); the References facet simply counts whichever tags currently exist on references. **Global tag management (rename/merge/delete across commands and references, and cleanup of zero-reference tags) is deferred to v2** (A14): v1 has no global tag-rewrite endpoint and offers only per-reference tag editing (§8.9). Editing a reference's tags changes only that reference.

### 8.9 CRUD

Full CRUD (D6). The prototype was add-only; edit and delete are added.

**Create (Q87).** `+ Référence` opens the `Nouvelle référence` modal with fields Titre / URL / Description / Tags (comma-separated). Only **URL is required**; Titre is optional and defaults to `displayDomain` when blank. On submit the URL runs the §8.3 pipeline; on any failure the modal stays open with the field-level inline error; on success the server mints the ULID, persists the normalized row, the modal closes, and a `Référence ajoutée` toast appears.

**Edit (Q15).** A pencil icon on each card reopens the **same modal, prefilled** (title `Modifier la référence`), preserving the `id`. It edits all mutable fields (title, url, desc, tags). Submit runs the identical validation/normalization/dedup pipeline (dedup excludes the row itself). Commit via `PATCH /api/references/:id`; on `409`/`400` the modal stays open with the inline error.

**Delete + undo (Q16).** Deliberately **asymmetric** vs commands (which use a destructive confirmation dialog, Q13): references delete via the `✕` affordance **immediately, with no confirmation dialog**, and show an **undo toast**: `Référence supprimée · Annuler`. This is the deferred-DELETE model that §7.9 now adopts uniformly for reversible deletes (A2). Mechanics (keeps ULIDs stable, no special restore endpoint):
- On `✕`, the reference is removed from client state immediately (optimistic) and the undo toast appears (~5 s).
- The server `DELETE` is **deferred** until the toast dismisses/expires; **Annuler** cancels the deferred request and restores the row verbatim (same ULID) in the UI — no round-trip, because nothing was sent.
- If the toast expires, the `DELETE` flushes as a normal awaited write (R2); on failure a persistent error banner appears and the delete retries on the next edit/focus — there is no background retry queue.
- If the page reloads during the undo window, the reference survives (the DELETE had not been sent) — acceptable, reload never loses data.

**Tag normalization on write (Q47).** The comma-separated tags input is split on commas; each token is trimmed, a leading `#` stripped, lowercased, deduped case-insensitively; commas are forbidden inside a tag (they are the separator), spaces are allowed. Empty tokens are dropped. (This is local, per-reference normalization; there is no global tag-rewrite in v1 — see §8.8, A14.)

### 8.10 Ordering (Q86)

References have no manual reorder (Q10 — no `position` column; a curated list of links does not need drag-reorder). v1 renders references in **`createdAt` (insertion) order**, matching the prototype and the collection's stable ordering key (§3.2.3, §3.7).

The three-state client-side sort toggle (Titre / Domaine / Ajout récent) that an earlier draft added is **removed** (A23): it was absent from the prototype and contradicted the `createdAt`-ordered schema of §3.2.3. Multi-option client-side sorting is **deferred to v2**.

### 8.11 Validation summary & French UI strings

| Condition                             | Behavior                | French inline/toast string (verbatim)                                  |
| ------------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| URL empty                             | block save, inline      | `URL requise`                                                          |
| URL unparseable after prefixing       | block save, inline      | `URL invalide`                                                         |
| Scheme not in allowlist               | block save, inline      | `Schéma d'URL non autorisé (http, https ou mailto uniquement)`         |
| Normalized URL already exists         | block save, inline      | `Cette URL existe déjà`                                                |
| Reference created                     | toast                   | `Référence ajoutée`                                                    |
| Reference deleted (with undo)         | toast + action          | `Référence supprimée · Annuler`                                        |
| Copy-URL success / failure            | toast (real result)     | `URL copiée` / (explicit failure toast, e.g. `Échec de la copie`)      |
| Modal titles                          | header                  | create: `Nouvelle référence` · edit: `Modifier la référence`          |
| Domain unresolvable / neutralized     | domain-line marker      | `lien invalide`                                                        |
| No references (module empty)          | empty-state             | `// aucune référence` + `Ajoute un lien utile avec le bouton « + Référence ».` |
| Search/tag filter, zero matches       | empty-state             | `// aucune référence trouvée` + `Modifie ta recherche ou retire le filtre de tag.` |

(The prototype's blanket `Titre et URL requis` is replaced by field-specific validation, since title is now optional — Q87.)

### 8.12 Edge cases

- `mailto:` with no `@` → domain line shows `lien invalide`; link still opens the mail client.
- Host with default port (`:80`/`:443`) → normalization leaves it verbatim (Q79 does not strip default ports); dedup treats `host` and `host:443` as distinct — accepted, low-risk.
- IDN host that fails to decode → domain line shows `lien invalide`; the (punycode) URL still functions as a link if the scheme is allowlisted.
- Two URLs differing only by fragment (`…#a` vs `…#b`) → both normalize to the same string → the second is a duplicate (blocked). Intentional: fragments are stripped for dedup.
- Whitespace-only title → treated as blank → defaults to `displayDomain`.
- Import brings a `data:`/`javascript:` reference → retained but neutralized; render shows inert text + `lien invalide`; counted in the import warning summary (§8.4).

---
## 9. Cheatsheets & Export

The Cheatsheet module (**« Cheatsheet »**, fourth tab) compiles selected library commands into ordered documents that a pentester exports as Markdown or PDF, or copies straight into a terminal. Unlike the prototype's single global `selected[]`, v1 supports **multiple named cheatsheets** (D1), each a tab reusing the roadmap tab/CRUD UX.

**Multiple cheatsheets are a per-subject / per-exam scoping tool in v1, not per-target value profiles.** Every cheatsheet resolves its command bodies against the **single global variable value set** (D2, Q90) — there is no per-sheet value snapshot. A sheet's `target` is a **descriptive label**, not an active resolution context: switching tabs never changes `$IP` on its own. Per-target value profiles (each sheet carrying its own `$IP`/`$USER`/… set) are **deferred to v2** (already deferred; see Open Items). Two v1 mitigations keep the mental model honest without touching any locked decision: a per-sheet **« Utiliser cette cible »** bridge (§9.3) and a **persistent global-values chip row** labelled as global (§9.3, §9.5).

Two invariants govern this section:

- **Exports emit RAW `$TOKEN`s by default; the clipboard stays RESOLVED** (Q99 / Q53 reconciliation). Markdown and PDF write raw templates unless the user opts in per export; Copier / Copier tout always produce resolved commands, as a deliberate local paste action. Nothing sensitive reaches disk without an explicit opt-in.
- **Variable VALUES never leave the browser.** Resolution happens only in-memory in the SPA and in the client-side clipboard/MD/PDF actions (D2, D7). The persisted cheatsheet composition is a list of command IDs + order + title/target — never values.

Locked decisions reflected here: **D1, D2** and **Q53, Q89–Q110** (with **Q99** as the central OPSEC fork). Cross-cutting: **D3** (debounced optimistic autosave), **D8** (desktop-only strict layout), **Q112** (persistence mapping; active-sheet is device-local), **Q14/Q19** (cascade on command delete), **Q31/Q32/Q33/Q35** (variable resolution semantics), **Q168** (loopback bind, zero egress).

---

### 9.1 Data model recap (authoritative in §3)

| Entity | Purpose | Key fields | Persistence |
|---|---|---|---|
| `Cheatsheet` (§3.2.8) | One named sheet = one tab | `id` (ULID), `title` (NOT NULL), `target` (nullable), `position` (reserved, tab order = creation order), timestamps | SQLite; round-trips in export (Q92) |
| `CheatsheetEntry` (§3.2.9) | One command placed in one sheet | `id`, `cheatsheetId` (FK CASCADE), `commandId` (FK CASCADE), `position` (flat ↑/↓ order), `note` (**reserved, unused in v1**) | SQLite |
| `Note` (§3.2.10) | Single shared per-command note | `commandId` (PK/FK CASCADE), `text` | SQLite; keyed by command ID (Q95/Q97) |

- **Composite unique index** on `(cheatsheetId, commandId)` — a command appears **at most once per sheet** (Q93).
- **On command delete (Q14/Q19):** every referencing `CheatsheetEntry` is removed via FK `ON DELETE CASCADE`; the command silently leaves all sheets and their entry counts update. No dangling entries exist (this supersedes the prototype's live-filter behavior — the entry is hard-deleted, not skipped at render).
- **`CheatsheetEntry.note` is null and unused in v1.** Per-entry note override is deferred to v2 (Q95); v1 displays the single shared per-command `Note`.

---

### 9.2 Multiple cheatsheets — tab bar, CRUD, active sheet (D1, Q89, Q91)

The Cheatsheet view carries a **tab bar** identical in behavior to the Methodology roadmap tabs.

**Tab bar & CRUD (D1/Q89):**

- Tabs render each cheatsheet's `title` in creation order (`position` column reserved for future reorder, Q68 parallel; tab reordering is **not** exposed in v1).
- **Create** — via the **top-bar « + Cheatsheet » button** (mirror of the roadmap view's « + Méthodologie »). The top-bar add affordance (`showAdd`) is **enabled on the Cheatsheet view** (§11.5.1), fixing the prototype gap where no create location existed. Click → `POST /api/cheatsheets` (§4.6.7). The new (empty) sheet becomes active. Default title « Cheatsheet » if none supplied yet. (When the tab bar is in its no-sheets empty state, §9.9, the same « + Cheatsheet » action is offered inline as well.)
- **Rename** — editing the in-panel title input (§9.3) renames the sheet; the tab label updates live (debounced autosave, D3). No separate rename dialog.
- **Delete** — destructive **confirmation** (mirrors roadmap delete, Q70) → `DELETE /api/cheatsheets/{id}`; cascades to its entries (Q19). After deleting the active sheet, the previous tab becomes active (or the first remaining). Deleting the last sheet is allowed → empty tab-bar state (§9.9).

**Active sheet & persistence:**

- Exactly one cheatsheet is **active** at a time. The active-sheet ID is **device-local (localStorage)**, not persisted server-side (Q112) — same treatment as the active roadmap.
- On load: restore the last active sheet; if absent/deleted, fall back to the first sheet.
- **First-run seed:** one empty default cheatsheet titled « Cheatsheet — HTB Lab » (faithful to the prototype default), `target` empty. Seeded first-run-only (Q133); never re-seeded.

**Library card action — add to active, or « Ajouter à… » across sheets (Q91, A39):**

- The Library card action is a **split control**: a primary button that toggles membership in the **active** sheet, plus a dropdown (« Ajouter à… ») that reaches **any** sheet.
- **Primary button (active sheet):**
  - Not present → « + Cheatsheet »; click → `POST /api/cheatsheets/{activeId}/entries` `{commandId}` → label flips to « Ajoutée ✓ »; toast « Ajoutée à la cheatsheet ».
  - Present → « Ajoutée ✓ »; click → `DELETE .../entries/{entryId}` → label flips back; toast « Retirée de la cheatsheet ».
- **« Ajouter à… » dropdown:** opens a list of **all** cheatsheets, each with a **checkbox** reflecting whether the command is already on that sheet. Toggling a checkbox adds/removes the command on that specific sheet via the explicit-`sheetId` endpoints (`POST`/`DELETE /api/cheatsheets/{sheetId}/entries…`, §4.6.8 — the server already accepts an explicit `sheetId`). This lets a single card feed several sheets without switching the active tab.
- The top-nav « Cheatsheet » button shows a **count badge = number of entries in the active sheet**.
- Switching the active tab re-evaluates the **primary** library toggle and the badge against the new active sheet (the « Ajouter à… » checkboxes are always per-sheet and unaffected by which tab is active).
- Add is **idempotent** server-side: re-adding an already-present command returns the existing entry (`200`) rather than duplicating (Q93, composite unique index).

---

### 9.3 Cheatsheet view — header, entries, ordering (Q92, Q93, Q94, Q95, Q96, Q98)

**Header (persisted, round-trips in export — Q92):**

- Title input — placeholder « Titre de la cheatsheet ». Bound to `Cheatsheet.title` (autosaved, D3). Stored verbatim; export/print fall back to « Cheatsheet » when title is empty/whitespace (faithful to prototype `sheetTitle || 'Cheatsheet'`). Empty title shows « Cheatsheet sans titre » on its tab.
- Target input — placeholder « Cible / contexte (ex : HTB — Sauna) ». Bound to `Cheatsheet.target` (optional). Autosaved.
- **« Utiliser cette cible » bridge (A13):** when `target` parses as a host or IP, a small button « Utiliser cette cible » sits next to the target input. Click loads that host/IP into the **in-memory** `$IP` value (§5.3 — memory-only, no persistence, no network write) and shows a confirmation chip « $IP ← `<target>` ». This is the only path by which a sheet's `target` influences resolution; without it, `target` stays purely descriptive. The button is hidden when `target` is empty or does not parse as a host/IP.
- **Global-values chip row (persistent, A13):** a metadata chip row of resolved non-empty **NON-sensitive** variable chips (§9.5) is rendered **persistently above the entries**, always shown on-screen (memory-only values), format `$NAME value`. It carries a fixed label **« valeurs globales — pas par-sheet »** so the user always sees that these values are global and shared across every sheet, not scoped to the current tab.

**Entries (Q93, Q94):**

- **Commands only** in v1 (Q94); no free text, references, or methodology steps.
- Each entry is a **live reference** to its command by ID (Q93): title, template, description, tool badge, and shared note are read live, so editing the underlying command reflects immediately. A command appears **at most once** per sheet.
- Entry rendering (per prototype cheatsheet row): position index, title, **tool badge** (kept on cheatsheet entries, A59 — the badge is retained here even though it is removed from library cards, because the cheatsheet row has no Catégorie › Outil sub-header to carry the tool), ↑ / ↓ / ✕ controls, optional description, code block with per-command copy button, and the shared note.
- **Code-block render states (A5, aligned with §5.10 — three distinct states, not two):**
  - **`resolved`** (defined, value non-empty): the value, rendered in accent **green** highlight.
  - **`empty`** (defined, value empty): `$NAME` kept visible in a **neutral / plain placeholder** style — **not** green and **without** the dotted dangling underline.
  - **`undefined`** (name not defined, e.g. deleted/typo variable): `$NAME` kept visible in the **dangling** style — dimmed/muted with a dotted underline.
  - Plain text (and escaped `\$` → `$`) renders in the default code foreground. This holds on-screen **even when the resolve toggle is ON** (the toggle governs export/print output, not the live view).

**Notes (Q95, Q96, Q97):**

- One shared personal note per command (Q95), stored in the note map keyed by command ID (§3.2.10, Q97).
- **Editable inline from the cheatsheet entry AND the library card**, writing to the same store (Q96) via `PUT /api/notes/{commandId}`. Empty/whitespace deletes the note. Included in JSON export (Q97/Q124); never placed in browser storage (Q112).

**Text-input privacy (A10):** every text input and textarea in this view — the title input, the target input, and the inline note editor — carries `spellcheck="false"`, `autocorrect="off"`, and `autocapitalize="off"`. This is a **required attribute set** (not cosmetic): native/enhanced spellcheck and autocorrect transmit field contents (targets, IPs, notes) to remote services, defeating the zero-egress promise; CSP `connect-src` cannot reach that channel (§12.5). Browser extensions remain outside app control (documented in the README).

**Reorder (Q98):**

- **Flat manual order via ↑ / ↓ buttons.** No DnD, no auto-grouping by category/tool in v1.
- ↑ on the first entry and ↓ on the last are no-ops (disabled). Each move swaps adjacent `position`s and persists via `POST /api/cheatsheets/{sheetId}/entries/reorder` `{orderedIds}` (§4.7), optimistic (D3).
- **Remove** (✕) → `DELETE .../entries/{entryId}`; the underlying command is untouched.

---

### 9.4 Variable resolution & the per-export resolve toggle (D2, Q90, Q99)

- Resolution uses the **single global value set** held in browser memory (D2, Q90). No per-sheet snapshot.
- The **resolver** is the shared §5 resolver: single left-to-right pass (Q35); `\$` escapes a literal `$` (Q33); only **defined AND non-empty** names substitute; both undefined and defined-but-empty tokens remain visible as `$TOKEN` (Q31/Q32) — even when the resolve toggle is ON (the two are styled distinctly on-screen per §9.3/§5.10, but both stay literal in resolved output).

**Per-export resolve toggle (Q99):**

- A checkbox « Résoudre les variables » sits in the cheatsheet toolbar next to the export buttons. **Default OFF (raw).** It is a **transient per-export choice**, not a stored setting (§4.8) — it resets to OFF each session.
- **OFF (default, raw):** Markdown and PDF emit raw `$TOKEN` command bodies and **omit** the variable-value metadata block (no concrete values reach disk — maximal OPSEC posture, Q99).
- **ON (resolved):** command bodies are resolved via the resolver above, and the metadata block is emitted (§9.5).

**Sensitive scope & pre-export warning (A51):**

- `sensitive` (e.g. `$PASS`) protects **the metadata block only**, never resolved command bodies. Sensitive **values are always excluded from the metadata block** (§9.5, Q100), regardless of the toggle. But a sensitive token used **inside a command body** **is** substituted when the resolve toggle is ON — the toggle is the explicit opt-in, and there is no per-token suppression of body substitution in v1.
- Consequently, when a resolve-ON export (Markdown or PDF) would **materialize a defined, non-empty sensitive value inside a command body**, the app shows a **blocking pre-export confirmation** before writing anything: **« Cet export contient des valeurs sensibles ($PASS). Continuer ? »** (the token name reflects the actual sensitive variable(s) involved). Cancel aborts the export with no file written; confirm proceeds. This warning does not fire for raw exports (no substitution) or when no sensitive token resolves in any body.
- **The clipboard is unaffected by this toggle** — Copier / Copier tout are always resolved (§9.8, Q53/Q105).

> **Open:** Q99 (raw-by-default) and Q100 (metadata block) are both locked, but the sources do not state whether the value-metadata block is itself gated by the resolve toggle. This spec gates it (raw export ⇒ no concrete values anywhere), as the only reading consistent with the locked principle « rien de sensible gravé sans action explicite ». Target text and the export date are non-values and are always included. Confirm if a raw export should instead still print non-sensitive variable values in metadata.

### 9.5 Export metadata (Q100, Q101)

A single unified metadata definition drives the on-screen chip row, the Markdown blockquote, and the PDF header (Q100 — same data set and format across all three surfaces):

**Metadata data set (in order):**

1. **Cible** — the sheet `target`, if non-empty. Always included (both raw and resolved exports; it is user free text, not a variable value).
2. **Export date** — `YYYY-MM-DD` (local date). Always included (Q101). Rendered « Exporté le `<date>` ».
3. **Variable values** — every **non-empty, NON-sensitive** variable (standard + custom) in the canonical order `$IP, $LHOST, $LPORT, $USER, $DOMAIN` then custom vars by definition order (Q100). Sensitive variables (`$PASS` by default) are **always excluded**, regardless of the resolve toggle. Emitted in exports **only when the resolve toggle is ON** (§9.4); always shown in the persistent on-screen chip row (labelled « valeurs globales — pas par-sheet », §9.3).

**Canonical textual rendering** — each variable segment is `$NAME = value`; segments joined by `  ·  ` (space-middot-space). The three surfaces share this data set and per-segment format, laying it out per medium (blockquote line / header row / pill chips).

- **Tool/version fingerprint is OFF by default** (Q101, OPSEC): no « Generated by Cheat », no version string, in any surface. There is no v1 option to enable it.

### 9.6 Markdown export (Q102, Q103, Q104, Q109)

Triggered by the « Markdown » toolbar button. Builds a string client-side, wraps it in a `Blob` (`type: "text/markdown;charset=utf-8"`), and downloads via a temporary object-URL anchor. Zero network egress.

**Encoding / EOL (Q103):** UTF-8, **no BOM**, **LF** (`\n`) line endings throughout.

**Canonical layout (Q104)** — adopts the prototype layout with the Q100/Q102/Q103 corrections:

```
# {title | "Cheatsheet"}

> {metadata segments joined by "  ·  "}

---

## {n}. {command title}
`{category label} / {tool}`{"  ·  " + "#tag" joined by " " when tags present}

{description}                       ← only when non-empty

{fence}{language?}
{command body — raw $TOKEN by default, resolved when toggle ON}
{fence}

> Note : {note}                     ← only when the shared note is non-empty (trimmed)

## {n+1}. …
```

- **Blockquote** appears whenever the metadata set is non-empty (the export date alone guarantees it). Raw export ⇒ `> Cible : … · Exporté le …`; resolved export appends the `$NAME = value` segments.
- **Numbering** is 1-based, following entry `position` order.
- **Category label** is the resolved display label (not the raw category key); tool is the command's tool.
- **Fence language (Q102):** bare ` ``` ` fence with **no language by default**; append the command's optional per-command `language` when set (e.g. ` ```powershell `). This uses the `Command.language` field (TEXT NULL) — now part of the authoritative schema (§3.2.2).
- **Seed command languages (A36):** so exported fences keep syntax coloring (the prototype forced ` ```bash ` on every command — a regression this seeds away), each seed command ships an explicit `language` value:

  | `language` | Seed command IDs |
  |---|---|
  | `bash` | `n1`, `n2`, `n3`, `n4`, `s1`, `s2`, `s3`, `s4`, `f1`, `f2`, `f3`, `h1`, `h2`, `ms1`, `l1`, `l2`, `l3`, `m2`, `sh1`, `sh2`, `sh3`, `sh4`, `ft1`, `ft2` |
  | `cmd` | `w1` (`certutil … & winpeas.exe`), `w2` (`whoami /priv`) |
  | `null` (bare fence) | `m1` (mimikatz `sekurlsa::logonpasswords` — a tool-interactive command, no shell dialect) |

  There is no seed shipped as `powershell` in v1; the value is available on the `Command.language` field for user-created or edited commands.
- **Fence-length escaping (Q103):** compute the longest run of consecutive backticks in the (raw or resolved) body; the surrounding fence uses `max(3, longestRun + 1)` backticks so a template containing triple-backticks cannot break out of its block.
- **Literal text (Q103):** title, description, and note are treated as literal text — inserted verbatim, not parsed or sanitized for Markdown, and never interpreted as fences.

**Filename (Q109):**

- ASCII slug of the title: NFD-normalize → strip combining diacritics (`é`→`e`) → lowercase → replace each run of non-`[a-z0-9]` with `-` → trim leading/trailing `-`. Empty result → `cheatsheet`.
- Append the export-date suffix (dash separator): **`{slug}-{YYYYMMDD}.md`**.

**Empty sheet:** if the active sheet has zero entries, the button is a no-op and shows toast « Cheatsheet vide » (no file written). On success: toast « Markdown exporté ».

> **Note (cross-section reconciliation, resolved):** Q102's optional per-command language is a locked decision; it is backed by the `Command.language` column now listed in §3.2.2 (TEXT NULL). When null, the exporter emits a bare fence.

### 9.7 PDF export / print (Q106, Q107, Q108, Q110)

**Mechanism (Q106):** browser `window.print()` on a dedicated `.printroot`, client-side (v1; single-binary simplicity). No server-side PDF generation. Triggered by « Exporter en PDF ». Full print CSS in §11.8.

**Printroot (Q107):**

- A hidden `.printroot` block mirrors the **active** cheatsheet's rendered content: title (H1), target subtitle, metadata header row (§9.5, gated by the resolve toggle per §9.4), a rule, then each entry as `{n}. {title} — {tool badge label}`, optional description, a `<pre>` code block, and the shared note.
- The **title and metadata are rendered once, at the top of `.printroot`** (H1 + subtitle + metadata row + rule); there is no repeating per-page furniture (see below).
- `@media print { .app { display:none } .printroot { display:block } }` — so **Ctrl+P from any view prints the active cheatsheet** (fixes the prototype's unconditional print of whatever view was mounted). The printroot always reflects the active sheet regardless of the current SPA tab.
- **Empty notice (Q107):** if the active sheet has zero entries, the printroot renders a minimal « Cheatsheet vide » notice instead of a blank page, and the « Exporter en PDF » button is a no-op with toast « Cheatsheet vide ».

**Page geometry (Q107, A22):**

- `@page { size: A4; margin: 1.4cm }`.
- **No custom running header/footer and no custom page numbers.** CSS Paged-Media margin boxes (`@bottom-*`) and per-page `position: fixed` repeating blocks are not reliably supported by Chromium/Firefox under `window.print()`, so v1 does **not** attempt a per-page title header, a « Exporté le `<date>` » footer, or page numbers. The title and metadata appear once at the top of `.printroot` (above); the **browser's own print header/footer** (URL/date/page count) supplies any per-page running furniture, per the user's print-dialog settings.
- `break-inside: avoid` on each entry block to avoid splitting a command across pages.

**Visual treatment (Q108):** the PDF stays **flat / monochrome** — dark text on white, light-gray code background, **no green variable highlighting** (faithful to the prototype printroot). Command bodies are raw or resolved per the §9.4 toggle. Browsers may drop backgrounds in print; `print-color-adjust: exact` on the code block is applied best-effort to preserve the code background, but color fidelity is not guaranteed (documented caveat).

**Filename (Q109):** before calling `window.print()`, set `document.title` to `{slug}-{YYYYMMDD}` (same slug rule as §9.6, no extension — the browser appends `.pdf`) so the « Enregistrer en PDF » default filename matches the Markdown slug. Restore the original `document.title` on the `afterprint` event.

**Metadata caveat (Q110):** « Enregistrer en PDF » embeds browser-supplied document metadata (title, creation date, sometimes producer/username). Because generation is delegated to the browser print pipeline, these are outside app control. This is **documented in the README** as an OPSEC caveat (Q110); a controlled server-side PDF generator is deferred to a later version.

### 9.8 Clipboard — Copier / Copier tout (Q53, Q105)

Clipboard actions are **always RESOLVED**, independent of the export toggle — a deliberate local paste action for the terminal (Q53/Q99 reconciliation). Full clipboard behavior lives in §11.6; the cheatsheet specifics:

| Action | Content | Notes |
|---|---|---|
| Per-entry **Copier** (code-block button) | The single command, resolved | Same resolver as §9.4 |
| **Copier tout** (toolbar) | Every entry's resolved command body, in order, joined by `\n` | **Bodies only** — no titles, descriptions, or notes (Q105) |

- Uses `navigator.clipboard.writeText`; localhost is a secure context so the async Clipboard API is available. The toast reflects the **real** promise result (Q53): success → « Copié dans le presse-papier »; rejection → an explicit error toast (no more always-success toast).
- Empty sheet: Copier tout is a no-op with toast « Cheatsheet vide ».
- **« Copié — contient un secret » indicator (A50, Q182):** when the copied text contains a materialized sensitive value (a defined, non-empty `sensitive` variable such as `$PASS` was substituted into the copied body/bodies), the success toast is instead **« Copié — contient un secret »**. This is a small, self-contained in-scope signal that the clipboard now holds a secret, distinct from the ordinary « Copié dans le presse-papier ».
- **OPSEC — OS clipboard-manager vector (A50, Q53):** resolved text may contain sensitive values (e.g. the `$PASS` value). Beyond the app, an **OS clipboard manager** (KDE **Klipper**, Windows **Win+V** clipboard history, macOS **Universal Clipboard**) persists copied entries to disk and/or syncs them across devices, entirely outside app control. This is documented; manual clipboard clearing is recommended, and an optional in-app auto-clear is deferred (§12.6).
- Copier tout is intentionally different from the Markdown export (raw, structured) — documented (Q105).

### 9.9 Empty states & edge cases

- **No cheatsheets at all** (user deleted the last one): the tab bar shows an empty state inviting creation (« + Cheatsheet »); the view body shows no sheet. Export/copy/print are unavailable until one exists.
- **Empty cheatsheet** (0 entries): body shows « // cheatsheet vide » with « Ajoute des commandes depuis la bibliothèque avec le bouton « Cheatsheet ». ». Markdown/PDF/Copier tout are no-ops with toast « Cheatsheet vide ».
- **Empty title:** exports/print fall back to « Cheatsheet »; slug falls back to `cheatsheet`; tab shows « Cheatsheet sans titre ».
- **Command deleted while in a sheet:** its entries are removed via FK cascade (Q14/Q19); counts and badge update; no dangling entry remains.
- **Undefined/empty variable in a resolved export:** the `$TOKEN` is preserved verbatim in the output (Q31/Q32) rather than substituting an empty string (undefined and empty differ only in on-screen styling, §9.3; both stay literal in exported text).

### 9.10 UI strings (French — verbatim)

| Context | String |
|---|---|
| Nav tab | « Cheatsheet » (+ count badge) |
| Top-bar / new-tab action | « + Cheatsheet » |
| Library card — add to other sheets | « Ajouter à… » |
| Target bridge | « Utiliser cette cible » |
| Global-values chip row label | « valeurs globales — pas par-sheet » |
| Toolbar | « Copier tout » · « Markdown » · « Exporter en PDF » |
| Resolve toggle | « Résoudre les variables » |
| Sensitive pre-export warning | « Cet export contient des valeurs sensibles ($PASS). Continuer ? » |
| Title / target placeholders | « Titre de la cheatsheet » · « Cible / contexte (ex : HTB — Sauna) » |
| Selected count | « `{n}` commande(s) sélectionnée(s) » |
| Library card toggle | « + Cheatsheet » / « Ajoutée ✓ » |
| Empty sheet | « // cheatsheet vide » · « Ajoute des commandes depuis la bibliothèque avec le bouton « Cheatsheet ». » |
| Toasts | « Ajoutée à la cheatsheet » · « Retirée de la cheatsheet » · « Cheatsheet vide » · « Markdown exporté » · « Copié dans le presse-papier » · « Copié — contient un secret » |
| Markdown content labels | « Cible : » · « Exporté le `<date>` » · « Note : » |

### 9.11 REST endpoints recap (authoritative in §4)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cheatsheets` | Create a named cheatsheet (tab); becomes active |
| `PATCH` | `/api/cheatsheets/{id}` | Edit `title` / `target` (autosave, D3) |
| `DELETE` | `/api/cheatsheets/{id}` | Delete sheet + cascade entries (confirm) |
| `POST` | `/api/cheatsheets/{sheetId}/entries` | Add command to a sheet by explicit `sheetId` (active tab, or any sheet via « Ajouter à… »); idempotent |
| `DELETE` | `/api/cheatsheets/{sheetId}/entries/{entryId}` | Remove an entry |
| `POST` | `/api/cheatsheets/{sheetId}/entries/reorder` | Flat ↑/↓ reorder (`{orderedIds}`) |
| `PUT` | `/api/notes/{commandId}` | Upsert/delete the shared per-command note |

- Composition (entries + order + title/target) persists in SQLite and round-trips through `GET /api/export` (Q92/Q124). **Markdown and PDF are produced entirely client-side** — they are not `/api` endpoints, and the Q99 raw-token default applies to those artifacts, not to the JSON dataset export (which stores raw templates and no values by definition).

---
## 10. Persistence, Import/Export & Seed Governance

This section defines where every piece of application state lives, how mutations reach durable storage (autosave), how the whole dataset is exported and imported as a versioned JSON envelope, and how shipped seed content coexists with user edits across binary upgrades. It is **authoritative for the state-tier mapping and the bulk export/import endpoints**.

Locked architecture recap that governs this section: Go/Gin/GORM/SQLite single binary (SPA served via `go:embed`, same-origin API, bound to `127.0.0.1`); ULID server-minted IDs; Phases/Steps are first-class rows with stable IDs + `position` (D5); variable **definitions** are persisted but variable **values** are memory-only and never leave the process (D2, D7); multiple named cheatsheets (D1). At-rest storage is unencrypted **by default**, with an **optional passphrase-based encryption** available (R5, default OFF): the SQLite file does persist free-text surfaces (command notes, cheatsheet `target`, reference URLs, command templates) in clear, so **only variable values are guaranteed never at rest** (A11). Authority for the encryption option and its threat model is §12.6.

---

### 10.1 State Persistence Model — three tiers (Q112)

Application state is partitioned into exactly three tiers. This mapping is authoritative: a field lives in **one** tier only.

- **BACKEND (SQLite, authoritative)** — durable domain content and non-ephemeral user state.
- **DEVICE-LOCAL (`localStorage`)** — non-sensitive UI preferences only.
- **IN-MEMORY ONLY (React state, session lifetime)** — variable VALUES and all ephemeral view/interaction state; lost on reload, never persisted anywhere.

#### 10.1.1 Complete field mapping

Every field of the prototype's runtime state (plus the entities introduced by the locked decisions) is classified below.

| State field (prototype → model) | Tier | Persisted form / notes |
|---|---|---|
| `commands[]` | BACKEND | `commands` table (D6 CRUD). |
| `references[]` | BACKEND | `references` table (D6 CRUD). |
| `this.cats` (builtin) + `extraCategories` | BACKEND | Unified `categories` table — **all** categories persisted as rows, builtin and custom (Q4, Q135). |
| `roadmaps[]` → phases → steps | BACKEND | `roadmaps` / `phases` / `steps` tables; phases & steps are first-class rows with stable ID + `position` (D5). |
| variable **definitions** (`{name,sensitive,isBuiltin,position}`) | BACKEND | `variable_definitions` table (D2, Q20). |
| variable **values** (`vars: {IP:…, LHOST:…}`) | **IN-MEMORY ONLY** | Never written to SQLite, `localStorage`, or IndexedDB; reset to empty on every reload (D2, D7). |
| `notes{}` (per-command free notes) | BACKEND | `notes` table keyed by `commandId` (Q95); orphan notes cascade-deleted with their command (Q14). |
| `checks{}` (methodology progression) | BACKEND | Boolean `done` column **on the Step row** — keyed by stable step ID, not by position (Q113, Q129). |
| `openSteps{}` / `step.expanded` (expanded step panels) | **IN-MEMORY ONLY** | Expansion is a transient view state, like the library sidebar accordion — held in React state only, not persisted, not exported (A15). This supersedes the earlier Q112 decision that had marked it backend-persisted. |
| `selected[]` (cheatsheet composition) | BACKEND | `cheatsheet_entries` rows (`cheatsheetId`, `commandId`, `position`) — ordered; **per named cheatsheet** (D1). |
| `sheetTitle` | BACKEND | `cheatsheets.title` (per cheatsheet, D1). |
| `sheetTarget` | BACKEND | `cheatsheets.target` (per cheatsheet, D1). |
| named cheatsheets themselves | BACKEND | `cheatsheets` table (`id`, `title`, `target`, `position`) (D1). |
| `theme` (`'dark'`/`'light'`) | DEVICE-LOCAL | `localStorage["cheat.theme"]`. |
| `view` (last active module: library/methodology/references/cheatsheet) | DEVICE-LOCAL | `localStorage["cheat.lastView"]`. |
| `activeRoadmap` (last active roadmap id) | DEVICE-LOCAL | `localStorage["cheat.lastRoadmapId"]` (Q69). |
| last active cheatsheet id | DEVICE-LOCAL | `localStorage["cheat.lastCheatsheetId"]` — mirrors the roadmap pref (D1 tab UX). |
| `activeCategory`, `activeTool`, `activeTags[]`, `query` (library) | IN-MEMORY ONLY | Library filters/search — reset per module (Q41, A34). |
| `activeRefTag`, `query` (references) | IN-MEMORY ONLY | References view filter/search — reset per module (A34). |
| `expanded{}` (library category/tool tree) | IN-MEMORY ONLY | Accordion state of the **library sidebar**. |
| `methodEdit` (methodology edit-mode toggle) | IN-MEMORY ONLY | |
| `adding`, `newCatOpen`, `addingRef`, `newRmOpen` | IN-MEMORY ONLY | Modal/open-form flags. |
| `draft`, `draftRef`, `stepDrafts`, `addPhaseLabel`, `newRmLabel` | IN-MEMORY ONLY | Unsaved form drafts. |
| `dragStep`, `dragOverSi`, `dragPhase`, `dropIndex` | IN-MEMORY ONLY | Transient drag/drop coordinates — **never** persisted (Q117). |
| `toast` | IN-MEMORY ONLY | Transient notification text. |

#### 10.1.2 Free-text-at-rest & sensitive-data policy (D7, Q112, A11, R5)

- Variable VALUES (which may hold real IPs, credentials, domains) exist **only** in the running SPA's memory. They are never sent to any persistence endpoint, never written to `localStorage`/`sessionStorage`/IndexedDB/Cache Storage, and never included in any export (see §10.4). Variable VALUES are the **only** data guaranteed never persisted at rest.
- `commands`, `references`, `notes`, and variable **definitions** are domain content that lives **only** in SQLite — they are **never** cached in `localStorage`/IndexedDB either (this keeps the "no content in browser storage" rule simple and absolute).
- **Correction to the earlier D7 rationale (A11):** the SQLite file **does** persist free-text surfaces in clear — command notes, cheatsheet `target` (e.g. « HTB — Sauna 10.10.10.5 »), reference `url`, command templates — which can embed IPs/hosts/credentials. The claim "nothing sensitive is ever persisted" was only ever true of variable values. This free-text content is user-authored and under user responsibility; the baseline mitigation is full-disk encryption of the host.
- **Optional at-rest encryption (R5, default OFF):** for engagements on a shared/jump host, an opt-in passphrase-based encryption of the SQLite file (or of the free-text fields) is offered; it is **off by default** and never assumed by any other subsystem. Full specification of the mechanism and threat model is §12.6.
- The only permitted `localStorage` keys are the four device-local preference keys listed above. All are non-sensitive; none carry user content.

> **Open:** none — the tier mapping is fully specified by Q112; the at-rest encryption option is owned by §12.6.

---

### 10.2 Autosave (D3, R2)

The app has **no "Enregistrer" button**. All backend-tier mutations are persisted automatically. Creates are **awaited**; field edits are **debounced**. (API-level write semantics are authoritative in §4.4.)

#### 10.2.1 Debounce, awaited creates & granularity (D3, Q111, Q117, R2)

- **Awaited creates + debounced field edits, keyed per entity.** Entity creation is an **awaited** `POST` (`await POST` → the server-minted ULID is known before the new entity participates in any further mutation). A text-field edit updates React state immediately and schedules a debounced (~500 ms trailing) `PATCH`.
- Debounce is **keyed per entity instance**, so editing two different commands schedules two independent writes; rapid keystrokes on one field collapse into a single trailing write ~500 ms after the last change.
- **Structural reorders persist once, on commit, never during drag** (Q117): a step/phase drag persists the affected roadmap exactly once **on drop**; each cheatsheet `↑/↓` click persists that cheatsheet once. Transient `dragover`/`dropIndex` state is never sent.
- Each write targets the per-entity REST endpoint (PATCH/POST/DELETE `/api/<entity>/<id>` — full catalog in §4). This section owns only the bulk export/import endpoints (§10.4).

#### 10.2.2 Awaited writes & failure indicator (D3, Q114, R2)

- **Writes are awaited, not optimistic-with-queue.** Because creates await the real ULID, there are **no temp-IDs (`tmp_…`), no ID reconciliation, and no dependency ordering** of pending writes: a child create always references an already-persisted parent ID. This replaces the former optimistic-autosave + `tmp_` + background retry-queue machinery (R2) — on a single local writer the round-trip is sub-millisecond and effectively never fails.
- **Indicator policy (D3): success is silent; only errors surface.** There is no persistent "Enregistré/Enregistrement…" badge. On a failed write (backend unreachable — e.g. the embedded binary was stopped with a tab still open) a **persistent, non-blocking error banner** appears, in French, e.g. `« Échec de l'enregistrement — sera réessayé à la prochaine modification »`, and clears once a write succeeds.
- **Retry model:** no background backoff queue. A failed write is retried automatically on the **next edit of that entity** or on **window focus**. The optimistic UI value is kept in view meanwhile; the banner stays until convergence.

#### 10.2.3 Flush on unload / shutdown (Q121, A3, R2)

- **Client:** on `visibilitychange` (hidden) and `beforeunload`, the app synchronously flushes every **pending debounced field write** using `fetch(url, {keepalive:true})`, so a normal tab close does not lose the last edit. `navigator.sendBeacon` is **not** used (A3). No custom auth header is required (the LAN/token subsystem is cut — R1). Mind the keepalive budget (~64 KB cumulative) if many field writes are outstanding.
- **Server:** on `SIGINT`/`SIGTERM`, the backend drains in-flight writes and closes the DB cleanly before exit.
- **Residual data-loss window:** if the tab process is force-killed within the ~500 ms debounce window before an unload flush can run, the last un-flushed keystroke may be lost. This sub-second window is the accepted cost of the debounced-autosave model (D3). Creates are unaffected — they are already awaited and durable.

#### 10.2.4 Concurrency (Q115, Q116, Q123, A16, A48, A58)

- **Multi-tab (same binary):** there is **no cross-tab live sync** in v1 — no BroadcastChannel/`storage` event, no refresh-on-focus reconciliation, and no last-write-wins arbitration layer (A16). Two open tabs write to the same authoritative backend; the DB naturally resolves order. (The `updatedAt` column still exists as a sort key per §3.7, but is not used for a client-side LWW protocol.)
- **SQLite writer discipline:** open the DB in **WAL** mode with a `busy_timeout`, and serialize writes with a **single write mutex** around write transactions — **not** `MaxOpenConns=1`, which would serialize reads behind writes and defeat WAL (A48). Reads stay concurrent; debounced autosaves never raise `SQLITE_BUSY`.
- **Two separate processes on the same DB file:** the binary takes an advisory **file lock (`flock` on `<db>.lock`) keyed on the resolved DB path** at startup (A58) — not on the listen port, so two instances on different ports pointed at the same `--db` cannot both open it. A second instance **refuses to start** with a clear message rather than risking concurrent-writer / WAL corruption (Q123).

---

### 10.3 Persistence infrastructure

#### 10.3.1 DB location & bootstrap (Q118, Q120, A7, A40)

- **DB path:** defaults to a per-user data directory (e.g. `$XDG_DATA_HOME/cheat/cheat.sqlite`, falling back to `~/.local/share/cheat/cheat.sqlite`); overridable via `--db <path>` flag or `CHEAT_DB` env var. Documented as the file-copy backup target (Q137).
- **Backups directory:** automatic snapshots are written to a `backups/` directory **co-located with the DB file** (configurable), added to `.gitignore` (§12.11, A40).
- **Bootstrap flow:** on startup the binary opens/creates the DB, runs migrations (§10.3.2), and **seeds only when the `db.initialized` flag is unset** (§3.2.11, §10.5). The SPA loads the full dataset via a single `GET /api/state` (§4.5), then issues per-entity writes for subsequent mutations (Q118).

#### 10.3.2 Schema versioning & migration (Q119, A32)

- A `schema.version` row is tracked in the DB (`Setting`, §3.2.11). **Additive changes** (new nullable column, new table) use GORM `AutoMigrate`. **Constraint/column changes** use explicit, ordered, numbered migrations.
- **Numbered-migration procedure (A32):** run with `foreign_keys` temporarily **OFF** (a `PRAGMA foreign_keys` change cannot take effect inside a transaction), run a `PRAGMA foreign_key_check` afterwards to catch violations, and take an **automatic file-copy backup of the DB (into `backups/`) before any breaking migration**.
- **Migrations are non-destructive.** User data is never dropped by a migration.

#### 10.3.3 Stale embedded SPA after upgrade (Q122)

- Bundle assets are content-hashed with long cache lifetimes; `index.html` is served `no-cache`.
- The binary exposes its embedded build version (`meta.appVersion` in `GET /api/state` and the `X-Cheat-Version` response header, §4.1). The SPA compares the served API version to its own bundle version and, on mismatch, warns/reloads so a cached old UI never drives a newer API.

---

### 10.4 Export / Import (D4, Q124, Q125, Q132)

All JSON dataset export/import is **server-side** (SQLite is authoritative): the server streams the export and validates+applies the import in one transaction (Q132). Cheatsheet Markdown/PDF remain client-side artifacts and are **out of scope here** (they are export-only, never re-imported — Q140; and are raw-token by default per Q99).

#### 10.4.1 Versioned envelope (Q128, Q142, A6, A20, A49)

Every export is a single JSON envelope (this is the authoritative shape; §4.9 shows a subset view):

```json
{
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "exportedAt": "2026-07-15T14:03:22Z",
  "data": {
    "categories":           [ { "id": "infogathering", "label": "Information Gathering", "color": "#5b8def", "isBuiltin": true, "position": 0, "createdAt": "…", "updatedAt": "…" } ],
    "commands":             [ { "id": "...", "title": "...", "template": "...", "categoryId": "...", "tool": "Divers", "desc": "", "tags": [], "language": null, "createdAt": "…", "updatedAt": "…" } ],
    "references":           [ { "id": "...", "title": "...", "url": "https://...", "desc": "", "tags": [], "createdAt": "…", "updatedAt": "…" } ],
    "variableDefinitions":  [ { "id": "...", "name": "IP", "sensitive": true, "isBuiltin": true, "position": 0 } ],
    "notes":                { "<commandId>": "..." },
    "roadmaps": [ {
        "id": "...", "label": "...", "position": 0, "createdAt": "…", "updatedAt": "…",
        "phases": [ {
            "id": "...", "label": "...", "position": 0,
            "steps": [ { "id": "...", "text": "...", "commandId": "... | null",
                         "done": false, "position": 0 } ]
        } ]
    } ],
    "cheatsheets": [ {
        "id": "...", "title": "...", "target": "", "position": 0, "createdAt": "…", "updatedAt": "…",
        "entries": [ { "id": "...", "commandId": "...", "position": 0 } ]
    } ]
  }
}
```

Envelope rules:

- **Timestamps** — every content entity carries `createdAt`/`updatedAt` (ISO 8601 UTC) in the envelope and in DB columns; the UI/MD/PDF render dates in French locale (`dd.mm.yyyy`) (Q142). These timestamps are **preserved verbatim on import** — GORM `autoCreateTime`/`autoUpdateTime` are **disabled inside the import transaction** — so `createdAt`-ordered collections (references, roadmap/cheatsheet tab order, §3.7) round-trip deterministically (A6, Q139).
- **`formatVersion`** is the single compatibility gate (§10.4.4). v1 ships `formatVersion: 1` only. **Bump policy (A49):** any change to the `data` shape increments `formatVersion`, and each `N→N+1` step ships a named migration function; `appVersion` is informational. The former `schemaVersion` and `seedVersion` fields are **removed** from the envelope (A20).
- **Step expansion is no longer exported** — `step.expanded` is transient view state held in memory only (A15). Only `done` (progression) is embedded on each step.
- **`notes`** is a map keyed by command id (`{ commandId: text }`) — consistent with §3.2.10 / §4.5.
- **Cheatsheet composition** is an ordered `entries[]` list (`commandId` + `position`) — consistent with §3.2.9 / §4.6.
- **Progression is embedded on each step** (`done`) with stable IDs — there is **no separate positional progression map**, so progression survives any reorder/edit between export and import (Q129).

#### 10.4.2 What the export contains — and what it never contains (D4, Q124)

**Included** (all durable content + non-ephemeral user state):

- All `categories` (builtin **and** custom, with colors) — the export is self-contained (Q135).
- All `commands`, `references`, per-command `notes`.
- All `roadmaps` → `phases` → `steps`, including `commandId` links and per-step `done` progression.
- All variable **definitions**.
- All named `cheatsheets` with their ordered `entries`, `title`, and `target` (D1).

**Excluded, always:**

- **Variable VALUES** — never serialized under any option (D2, D7). There is **no** "resolve values" toggle on the JSON export; the JSON dataset is unconditionally value-free. (Only the separate cheatsheet MD/PDF export can materialize resolved values, and even that emits raw `$TOKEN`s by default per Q99.) This hard rule supersedes the softer "toggle sanitised/full" phrasing in the Q124 questionnaire reco.
- **Device-local preferences** (`theme`, last view/roadmap/cheatsheet) — UI prefs stay out of the dataset (Q124).
- **All ephemeral view/interaction state** (filters, query, drafts, drag state, step expansion, modals, toasts, library sidebar tree).

#### 10.4.3 Endpoints (A12, A17, A24)

| Method & path | Purpose | Behavior |
|---|---|---|
| `GET /api/export` | Full dataset export | 200; streams the §10.4.1 envelope; `Content-Disposition: attachment; filename="cheat-export-<YYYYMMDD-HHmmss>.json"`. Never contains variable values. |
| `POST /api/import` | Backup restore (**REPLACE**) | Validate → pre-import snapshot → REPLACE in one transaction → return summary (§10.4.7). |

- Import is **REPLACE-only** in v1 (D4). The `mode` query param is optional; if present it must equal `replace` (any other value → `400`). The **MERGE** mode, the seed-pack import/preview endpoints, the raw `.sqlite` download, and the factory-reset endpoint are all removed from v1 (A12, A24, A17 — see §10.4.6, §10.5.3, §10.5.4).
- The import endpoint accepts the envelope as the request body (uploaded file). Validation, migration, and application happen **entirely server-side** (Q132).

#### 10.4.4 Validation & compatibility policy (Q128, Q131, A9, A20, A42)

Applied before any mutation; on any failure the whole import is rejected with a clear message and **zero** changes:

1. **Structural/schema validation** — reject truly malformed or structurally invalid envelopes; enforce explicit size/count limits (`422 IMPORT_SCHEMA_INVALID`). **Caps (A42, tunable via config like the ~32 MiB body cap):** e.g. ≤ 20 000 commands, ≤ 100 000 steps, per-template / per-note ≤ ~64 KiB.
2. **Version gate (A20)** — accept `formatVersion: 1` only; **reject any other value** (older or newer) with `422 IMPORT_VERSION_TOO_NEW` and a clear "fichier incompatible avec cette version de l'application" message. There is **no forward-migration engine** in v1 (nothing to migrate to; the bump policy in §10.4.1 governs future versions).
3. **URL sanitization** — neutralize/flag any reference `url` outside the `http`/`https`/`mailto` allowlist (Q78, §8.4); no dangerous scheme reaches an `<a href>`.
4. **Dangling internal references — repair-and-warn.** For an otherwise-valid file, nothing is silently discarded; each repair is reported in the summary `warnings`:
   - a `step.commandId` or `cheatsheet.entries[].commandId` pointing at a missing command is nulled/dropped;
   - a `notes` entry keyed by a `commandId` with no matching command is **dropped** — otherwise its insert would violate the `notes` PK/FK and, under the atomic `foreign_keys=ON` transaction, abort the entire REPLACE (A9);
   - an unknown `categoryId` on a command is remapped to `Autre` (Q52, Q135).

#### 10.4.5 REPLACE flow (D4, Q125, Q130, Q127, Q139, A6, A8, A31, A40) — the only import mode

1. **Confirmation.** The UI shows an explicit destructive confirmation, in French, e.g. title `« Remplacer toutes les données ? »`, body noting a backup snapshot is created automatically, buttons `« Annuler »` / `« Remplacer »`.
2. **Automatic pre-import snapshot.** Before touching data, the server writes a timestamped backup (full JSON export and/or DB file copy) into the `backups/` directory (§10.3.1, A40) so the prior state is always recoverable. These snapshots contain free-text notes/targets/URLs — hence the `backups/` gitignore + README OPSEC warning (§12.11).
3. **Atomic all-or-nothing transaction.** The entire dataset is replaced inside one SQLite transaction; any error rolls back completely — the vault is never left half-replaced (Q130).
4. **Deterministic FK-safe insertion (A31).** Rows are inserted in a fixed parent→child order — `categories → commands → notes → references → roadmaps → phases → steps → cheatsheets → entries → variableDefinitions` — **or** the transaction wraps the load in `PRAGMA defer_foreign_keys = ON`, so no intermediate state violates `foreign_keys=ON`.
5. **Timestamps preserved (A6).** `autoCreateTime`/`autoUpdateTime` are disabled for the import transaction; incoming `createdAt`/`updatedAt` are written verbatim.
6. **IDs preserved.** Incoming IDs are kept verbatim for round-trip fidelity; `step.commandId` and cheatsheet `entries` links are preserved as-is (Q127).
7. **Canonical baseline re-asserted (A8).** In the **same transaction**, after the replace, the server re-asserts the canonical baseline by literal identity: the **18 built-in categories** (§3.3, by literal ID) and the **6 standard variable definitions** (§5.4, by name) are ensured present, so a hand-edited file can never leave the vault without built-ins (breaking the resolver, the `utilities`/`Autre` fallback target, or non-deletable governance).
8. **`isBuiltin` is derived, never trusted from the envelope (A8).** `isBuiltin` is computed from the canonical identity sets (category ID ∈ the 18 keys / variable name ∈ the 6 standard names), ignoring whatever value the envelope carried — so a hand-crafted file can neither make built-ins deletable nor fabricate indelible junk.
9. **Round-trip guarantee.** Export → REPLACE-import reproduces an equivalent state including IDs, all user-visible ordering (positions), timestamps, and progression — an acceptance-test requirement (Q139).

#### 10.4.6 MERGE flow — deferred to v2

MERGE import is **cut from v1** (A12). v1 delivers REPLACE + automatic pre-import snapshot only. The MERGE algorithm (ID-collision detection, re-minting ULIDs, rewriting internal references, by-name variable merge, category upsert) is **deferred to v2** — see Open Items.

#### 10.4.7 Import summary (returned to the UI) (A4, A12, A20)

Every import returns a single, canonical machine-readable summary (this shape is authoritative and is mirrored verbatim by §4.10 — A4). The UI renders it as a toast/report:

```json
{
  "mode": "replace",
  "snapshotPath": "backups/cheat-backup-20260715-140322.json",
  "counts": {
    "commands":   { "added": 24, "replaced": 0, "skipped": 0, "reIded": 0 },
    "references": { "added": 6,  "replaced": 0, "skipped": 0, "reIded": 0 }
  },
  "warnings": [
    "2 étape(s) référençaient une commande absente — lien retiré.",
    "1 note référençait une commande absente — note ignorée.",
    "1 commande référençait une catégorie inconnue — reclassée dans « Autre »."
  ]
}
```

- `mode` is always `"replace"` in v1.
- `snapshotPath` is the single canonical snapshot field (the former `snapshotId` and the alternative `snapshotPath`/`migratedFrom` shapes in §4.10 are reconciled to this one — A4). There is **no** `migratedFrom` field (A20).
- `counts` are **nested per entity** with the four sub-fields `{added, replaced, skipped, reIded}` (a stable schema); under REPLACE, rows land in `added` and the merge-only counters stay `0`.

#### 10.4.8 Scope of export/import (Q137, Q138, Q140, Q141, A17, A40)

- **v1 = full-dataset JSON only** (plus the existing cheatsheet MD/PDF client exports). No per-entity/selective JSON export in v1 (Q138). No MERGE import (A12).
- **Raw `.sqlite` backup** is done by **stopping the binary and copying the DB file** (documented in the README), not via an endpoint — the `GET /api/backup.sqlite` route is removed (A17).
- **Backups are manual** (file copy), complemented by the **automatic pre-import** JSON snapshot and the **pre-breaking-migration** DB backup, both written to `backups/` (Q141, A40). No scheduled auto-snapshots in v1.
- Markdown/PDF are cheatsheet-scoped, export-only; **Markdown re-import is not supported** (Q140).

---

### 10.5 Seed governance (Q133, Q134, Q67, Q18, A7)

#### 10.5.1 First-run-only seeding (Q133, A7)

- The binary ships a seed dataset (18 categories, the 6 standard variable **definitions**, the seed commands/references/roadmaps, and one default empty cheatsheet « Cheatsheet — HTB Lab » with an empty `target`) embedded via `go:embed`.
- **The seed is applied exactly once, gated solely on the `db.initialized` flag** (§3.2.11): if the flag is unset at startup, the binary seeds and then sets it; otherwise it never seeds. **No emptiness heuristic** is used (A7).
- **REPLACE never resets `db.initialized`.** An empty-but-initialized DB (e.g. after importing an empty dataset, or after mass deletion) is a **valid terminal state that is never re-seeded** — this is what guarantees the "no tombstones, deleted seeds never resurrected" property (§10.5.2).
- Seeded rows are **ordinary, fully editable/deletable rows** with the same cascade rules as user-created content, and they export like any other row (Q18). Seed IDs are preserved literal (D5).

#### 10.5.2 No automatic re-seed on upgrade (Q133)

- Upgrading the binary **never** re-seeds, upserts, or "refreshes" existing content. A user's edits and deletions are authoritative.
- **Deleted seeds are never resurrected.** Because seeding is gated strictly on the `db.initialized` flag (never on emptiness), deletions are permanent by construction — **no tombstones are needed**.

#### 10.5.3 Updated seed content ("seed pack") — deferred to v2

The optional importable **seed pack** (embedded/downloadable content-update envelope, `GET /api/seed-pack`, `POST /api/import/seed-pack`, the `seed.version` key, and its MERGE-based application) is **cut from v1** (A24): it is a content-distribution feature with no v1 user story and depends on the deferred MERGE engine. v1 ships only the first-run seeding gated by `db.initialized`. Deferred to v2 — see Open Items.

#### 10.5.4 Full reset & restore-defaults (Q134, Q67, A17, A28, A30)

- **Full/factory reset** has **no dedicated endpoint** in v1 (A17). The `POST /api/factory-reset` route is removed. The equivalent is documented in the README: **stop the binary and delete (or move aside) the DB file** — on the next launch the DB is recreated, `db.initialized` is unset, and the first-run seed dataset is re-applied. (Copy the file first if the current data is wanted as a backup.)
- **"Restaurer les méthodologies par défaut"** (Q67, §7.2) — the methodology-scoped partial re-seed of missing default roadmaps — is **deferred to v2 (A28)**. Its endpoint (`POST /api/roadmaps/restore-defaults`) and former `{ restored: [ids] }` response are removed from v1 (§4.6.4, §7.2, §7.3); a user who deleted the default roadmaps recovers them via JSON import of a prior export. When the feature ships, re-inserted default steps that link to seed command IDs the user has since deleted will set any **absent `commandId` to NULL / drop-and-report**, exactly as the first-run seed link resolution and the import repair rule already do (§7.2, §10.4.4, A30).
- Both are distinct from the per-roadmap progression reset (`« Réinitialiser la progression »`, Q57, §7.9).

> **Open:** MERGE import (§10.4.6) and the seed-pack content-update mechanism (§10.5.3) are deferred to v2. Otherwise Q133/Q134 fully specify the v1 seed lifecycle; tombstones are explicitly out by design.

---
## 11. Visual System & UX

This section is the implementation-ready contract for Cheat's visual language and interaction shell. It is a faithful port of the Claude Design prototype (`OSCP_Vault.dc.html`), with the locked deviations required by the decisions log (self-hosted fonts, WCAG 2.1 AA remediation, tiered notifications). All numeric token values below are transcribed **verbatim** from the prototype's `renderVals()`; do not re-derive them.

**Non-negotiable framing (locked):**
- **Density and accent are fixed constants in v1** — they are NOT user settings. Faithful to the design, not configurable (Q157, Q158).
- **Desktop-only strict layout** with a hard minimum width applied to the **content region**; below it the content region scrolls horizontally rather than reflowing (D8, Q143, Q144; floor lowered per R4).
- **Zero network egress**: IBM Plex is self-hosted, the favicon set is self-contained, no CDN, no Google Fonts, no external asset request (Q162; §12.5).
- UI language is **French**; every UI string, label, placeholder, and button caption below is quoted verbatim in French. In-repo code/docs are English.

---

### 11.1 Design Principles

These are global, enforced constraints — not per-component styling choices.

- **Right angles everywhere — `border-radius: 0`.** No element in the app (buttons, inputs, cards, badges, chips, modals, toasts, code blocks) has rounded corners. The CSS reset sets `border-radius: 0` globally; components never re-introduce radius.
- **1px hairline borders.** Structure is expressed with `1px solid var(--border)` / `var(--border2)`, not with shadow or radius. Elevation is expressed by surface color steps (`--bg → --surface → --surface2 → --card → --elev`), not drop shadows.
- **High density.** Compact padding (`--pad: 10px`), tight line-heights, small mono metadata. This is an asserted product value; small type sizes (down to 10px) are intentional (Q154).
- **Accent discipline — accent is a signal, not decoration.** `--acc` (`#3ddc97`) appears ONLY on:
  1. the contextual primary action button (top-bar add, « Créer », « + Étape » hover, « Exporter en PDF »),
  2. selection / count affordances (the Cheatsheet tab count badge, selected-count numerals),
  3. **variable tokens** — `$NAME` labels in the Variables panel, and resolved variable spans inside rendered code (green text on `--acc-dim` background),
  4. links (`<a>`), the focus ring (`--acc-line`), and interactive hover states,
  5. the brand glyph tile (`--acc-dim` background).
  - **The active tab does NOT use accent as its background** — it uses the neutral elevated `--border2` with `--text` (see §11.5). Accent is reserved for action/selection/variables; neutral elevation marks "current tab". This distinction is deliberate and must be preserved.
- **Monospace = machine text.** `IBM Plex Mono` is used for all commands, variable names/values, counts, domains, tags, and code; `IBM Plex Sans` for everything else (§11.2).

---

### 11.2 Typography

**Font families (self-hosted — locked, zero egress):**
- Body / UI: `'IBM Plex Sans', system-ui, sans-serif` — weights **400, 500, 600, 700**.
- Mono / code / metadata: `'IBM Plex Mono', monospace` — weights **400, 500, 600**.

**Self-hosting requirement (supersedes the prototype):** the prototype loads fonts from `fonts.googleapis.com`. This is **removed**. Fonts are bundled as WOFF2 inside the Go binary (`go:embed`), served same-origin, and declared with `@font-face { font-display: swap; }`. No `<link rel="preconnect">` / `<link rel="stylesheet">` to any external host may appear in `<head>`. The strict CSP (§12.4) blocks external font hosts as a backstop.
> **Open:** ship only the 4 Sans + 3 Mono static WOFF2 weights listed above (smallest footprint) rather than the variable-font files, unless a reviewer prefers the variable fonts for size parity.

**Root sizing & rem (Q153 — locked):** the root is `16px`. All font sizes are authored in `rem` so OS/browser zoom and font-scaling work; at default zoom the rendering is pixel-identical to the prototype. Borders and hairlines stay in `px` (`1px`). Base app font-size = `14px` = `0.875rem`.

**Type scale (verbatim from prototype; rem = px ÷ 16):**

| Usage | px | rem |
|---|---|---|
| Cheatsheet title input | 22 | 1.375 |
| Print `<h1>` | 24 | 1.5 |
| Brand glyph emoji | 17 | 1.0625 |
| « + » add glyph, phase drag handle | 15 | 0.9375 |
| Brand wordmark « Cheat » | 14.5 | 0.906 |
| App base, theme icon, phase label input | 14 | 0.875 |
| Search input, search glyph, ref title | 13 | 0.8125 |
| Card `<pre>` code, most body copy, buttons | 12.5 | 0.781 |
| Card note, step code, desc, meta chips | 12 | 0.75 |
| Var `$KEY` label + value input | 11.5 | 0.719 |
| Counts, tags, tool names, domains | 11 | 0.6875 |
| Sidebar section headers, tag counts, badge | 10.5 | 0.656 |
| « live » indicator | 10 | 0.625 |

**Font floor (Q154 — locked):** keep the prototype's small sizes; do **not** hard-clamp above them, but never author a size below `10px`. Legibility at small sizes is guaranteed by rem-based zoom, not by raising the floor.

Section headers (« Variables », « Catégories », « Tags ») use `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: .09em`, color `--faint`.

---

### 11.3 Color Tokens

Tokens are set as CSS custom properties on the app root and recomputed on every theme change (§11.4). Values are transcribed verbatim from `renderVals()`.

**Structural tokens — DARK theme (default):**

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0b0c0f` | app background |
| `--surface` | `#0f1015` | top bar, sidebar |
| `--surface2` | `#14161c` | search field, theme toggle, small controls |
| `--card` | `#15171d` | command / reference cards |
| `--elev` | `#181a21` | segmented control, meta chips, edit toolbars |
| `--code` | `#0a0b0e` | `<pre>` / code / input fields |
| `--code-text` | `#cdd2da` | code foreground |
| `--border` | `#1e2029` | default hairline |
| `--border2` | `#262932` | stronger hairline, active-tab bg, hover border |
| `--text` | `#e8e9ed` | primary text |
| `--text-strong` | `#f2f3f5` | headings, sheet title |
| `--muted` | `#8a8e99` | secondary text, icon buttons |
| `--faint` | `#565a66` | counts, labels, placeholders, domains |

**Structural tokens — LIGHT theme:**

| Token | Value | Role |
|---|---|---|
| `--bg` | `#eceef2` | app background |
| `--surface` | `#ffffff` | top bar, sidebar |
| `--surface2` | `#f1f2f6` | small controls |
| `--card` | `#ffffff` | cards |
| `--elev` | `#ffffff` | segmented control, chips |
| `--code` | `#f5f6f9` | code / inputs |
| `--code-text` | `#1e2530` | code foreground |
| `--border` | `#e2e4ea` | default hairline |
| `--border2` | `#d2d5de` | stronger hairline |
| `--text` | `#1a1d24` | primary text |
| `--text-strong` | `#0b0d11` | headings |
| `--muted` | `#5b6270` | secondary text |
| `--faint` | `#8b909c` → **remediated, see Q152** | counts, labels, placeholders |

**Accent tokens (derived by `color-mix`; formula verbatim):**

Let `accent = #3ddc97` (fixed constant, Q157). Let `isLight = (theme === 'light')`.

```
accVis   = isLight ? color-mix(in srgb, #3ddc97 55%, #04140b) : #3ddc97
--acc      = accVis
--acc-dim  = color-mix(in srgb, accVis  <15% dark | 13% light>  , transparent)
--acc-line = color-mix(in srgb, accVis  42%                     , transparent)
--on-acc   = isLight ? #ffffff : #08110c
```

- `--acc` — accent foreground (links, variable tokens, active hover, primary button bg).
- `--acc-dim` — faint accent wash (brand tile, resolved-variable highlight background, secondary accent buttons like « + Étape », « Exporter en PDF »). Opacity 15% dark / 13% light.
- `--acc-line` — 42%-opacity accent used for borders and the **focus ring** (§11.7).
- `--on-acc` — foreground placed on a solid accent fill (`#08110c` dark, `#ffffff` light).
- On light theme the accent is intentionally darkened (mixed 55% with near-black green `#04140b`) so accent-on-white meets contrast (this is the "light-theme accent adjustment" — Q152 second requirement is satisfied by this mix; verify ≥3:1 for the accent add-button and ≥4.5:1 for accent link text on `--surface`).

**Semantic constant — danger:** destructive-hover styling uses `#e5484d` (verbatim from prototype: « Supprimer » / phase-delete / step-delete `✕` hover border+color). Expose it as `--danger: #e5484d` (same value both themes) so confirm dialogs and destructive buttons share it.

**Selection & scrollbars:**
- `::selection { background: color-mix(in srgb, var(--acc) 30%, transparent); }`
- WebKit scrollbars: `10px`, thumb `--border2`, hover `--faint`, `background-clip: content-box`, `2px` transparent border. Firefox equivalents are added (Q161): `scrollbar-width: thin; scrollbar-color: var(--border2) transparent;`.

**Light-theme contrast remediation (Q152 — locked):** the prototype's light `--faint` (`#8b909c`) is ≈2.9:1 on white — below AA. In v1, **darken light `--faint` to reach ≥4.5:1 on `--surface` (#ffffff) for text-sized use** (≥3:1 permitted only for large/non-essential decorative use). Suggested value: `#676c7a` (validate the exact hex against the 4.5:1 target before shipping — the ratio is authoritative, the hex is a starting point). Re-verify `--muted` (#5b6270 ≈ 5.9:1, passes) and the light accent after this change. Dark-theme tokens are unchanged.
> **Open:** confirm the final remediated light `--faint` hex once a contrast checker is run against `#ffffff`; the constraint (≥4.5:1) is locked, the exact value is not.

---

### 11.4 Theme System

- **Two first-class themes:** dark (default) and light. There is exactly one accent (`#3ddc97`); it is **not runtime-configurable** and there is no color picker (Q157).
- **Initial theme (Q156 — locked):** on first launch, follow the OS `prefers-color-scheme` (fallback **dark** if unknown). Once the user toggles the theme explicitly, persist and always honor that explicit choice on subsequent launches — the OS preference no longer overrides it.
- **Persistence (Q112):** the theme is **device-local** (browser storage), not part of the backend dataset and not part of JSON export/import. Same bucket as "last active view/roadmap".
- **Theme toggle:** the top-bar 34×34 button (`title="Basculer le thème"`) flips the theme. On flip, **all tokens are recomputed** — including the accent derivation (`accVis`, `--acc-dim`, `--acc-line`, `--on-acc`), because the light theme darkens the accent. Implementation sets the full token map on the root element (or toggles `data-theme="light|dark"` on `:root` with two token blocks); recomputation must be atomic (no flash of half-themed UI).
- The toggle icon (`themeIcon`) reflects the target/next theme (sun/moon convention).

---

### 11.5 Layout Shell (Desktop-Only Strict)

**Global frame:** `height: 100vh`, `display: flex; flex-direction: column`. Background `--bg`, base text `--text`, base font 14px/`0.875rem`. Three regions stacked: fixed top bar → (sidebar | content) row filling remaining height.

**Responsive strategy (D8 — locked; min-width lowered and re-scoped per R4, overrides the Q143 "graceful degradation" reco):** the app is **desktop-only strict**. A hard `min-width` is enforced on the **content region** (not on sidebar+content together); **below it the content region scrolls horizontally** (an `overflow-x: auto` on the content pane), it does **not** reflow, wrap, or collapse into a tablet/mobile layout. No mobile redesign in v1.

- **Minimum width (Q144 — locked; lowered per R4):** hard content-region min-width **≈900px** (the shell is authored against a 1280px reference). The floor sits on the **content region only**, so collapsing the sidebar (Q145) reclaims its 272px for content **first**; the horizontal scroll only kicks in once the content region itself would drop below ≈900px. Chrome is never re-laid-out, and there is still **no mobile reflow**.
- **Top-bar overflow (Q146):** D8 supersedes the Q146 "collapse priority" reco. The top bar is **fixed and does not condense/wrap**; when horizontal space is insufficient it participates in the same horizontal scroll as the content region. Do not shrink the search or convert tab labels to icons in v1.

#### 11.5.1 Top bar (53px, fixed)

`height: 53px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--surface)`. Left → right:

| Zone | Spec |
|---|---|
| **Brand** | `27×27` tile, background `--acc-dim`, centered emoji `💩` (17px) + wordmark « Cheat » (14.5px, weight 600, `letter-spacing: -.01em`). Emoji brand kept in-app (Q162). |
| **Segmented control (4 tabs)** | Container: `display:flex; background: var(--elev); border: 1px solid var(--border2); padding: 3px; gap: 2px`. Buttons: base `padding:5px 11px; font-size:12.5px; font-weight:600; background:transparent; color:var(--muted)`; **active** = `background: var(--border2); color: var(--text)` (neutral, not accent). Labels verbatim: **« Bibliothèque »**, **« Méthodologie »**, **« Références »**, **« Cheatsheet »**. |
| **Cheatsheet count badge** | Rendered inside the « Cheatsheet » tab only when ≥1 command is selected: `background: var(--acc); color: var(--on-acc); min-width:17px; height:17px; font-size:10.5px; font-weight:700; padding:0 4px`. Shows the selected-command count (D1 cascade: count is for the **active** cheatsheet). |
| **Spacer** | `flex: 1`. |
| **Per-module search** | Wrapper `width: 280px; position: relative`. Mono glyph `⌕` absolutely positioned left (`--faint`). Input: `width:100%; background:var(--surface2); border:1px solid var(--border2); color:var(--text); font-size:13px; padding:7px 10px 7px 30px`; focus → `border-color: var(--acc-line)`. Placeholder « Rechercher… ». **Search is per-module (Q41):** it drives only Bibliothèque and Références; it is **disabled/hidden** in Méthodologie and Cheatsheet where it has no effect, and its query resets on module change. |
| **Contextual add button** | Rendered only when the current view supports adding (`showAdd`). `border:1px solid var(--acc-line); background:var(--acc); color:var(--on-acc); padding:7px 12px; font-size:12.5px; font-weight:600`; hover `filter: brightness(1.08)`. Leading « + » glyph (15px) + `addLabel`. Label is contextual per view: **« + Commande »** (Bibliothèque), **« + Méthodologie »** (Méthodologie), **« + Référence »** (Références), **« + Cheatsheet »** (Cheatsheet). |
| **Theme toggle** | `34×34; border:1px solid var(--border2); background:var(--surface2); color:var(--muted)`; hover → `border-color: var(--acc-line); color: var(--acc)`. `title="Basculer le thème"`. |

**Add button on the Cheatsheet view (A60):** `showAdd` is extended to the **Cheatsheet** view (the prototype and earlier draft hid the top-bar add there, leaving no location to create a sheet — a D1 gap). The Cheatsheet view now shows a top-bar **« + Cheatsheet »** button — a mirror of « + Méthodologie » — whose action **creates a new cheatsheet** (server accepts the create per §9.2). This is distinct from adding a library command to a sheet (that path stays on the library cards).

> **Modal category picker (A53 — visual fidelity; behavioral authority is §6.8):** in the Add-command modal opened by « + Commande », the « Catégorie » field is a wrapping row of accent-styled **chips/pills** (one `<button>` per category: selected chip uses the accent treatment, unselected uses `background: var(--surface); border: 1px solid var(--border2); color: var(--muted)` with `--acc-line`/`--acc` on hover) followed by a trailing **« + » toggle** (`title="Nouvelle catégorie"`) that reveals the « Nom de la nouvelle catégorie » input. It is **not** a `<select>` dropdown — restore the prototype's chips. (Tags in the same modal use the same chip pattern; §6.8 is authoritative for behavior.)

#### 11.5.2 Left sidebar (272px)

`width: 272px; flex: none; border-right: 1px solid var(--border); background: var(--surface); overflow-y: auto; padding: 17px 14px; display: flex; flex-direction: column; gap: 24px`.

**Contents are view-dependent (Q167 — locked):**
- **Bibliothèque:** full sidebar — **Variables** panel, **Catégories** tree, **Tags** list.
- **Méthodologie & Cheatsheet:** render **only the Variables panel**. Catégories and Tags are hidden (they only make sense in the library and would otherwise navigate the user out of the current tab).
- **Références:** the sidebar renders the reference **Tags facet** (§8.8) and **hides the Variables panel** (variable substitution has no effect on references, Q34/Q84).

Panels:
- **Variables** — header row: « Variables » (section-header style) + « live » (mono, 10px, `--faint`) marking that values are session-memory-only (never persisted). Each row: fixed `$KEY` label (`width:60px; mono 11.5px; color:var(--acc)`) + value `<input>` (`background:var(--code); border:1px solid var(--border); mono 11.5px; padding:5px 8px`; focus → `--acc-line`). The 6 standard variables are pinned on top in canonical order `IP, LHOST, LPORT, USER, DOMAIN, PASS`; custom rows follow with hover rename/delete affordances; an inline « + Variable » row appends. (Full behavior in §5.)
- **Catégories** — header « Catégories »; a total row (`8×8` `--muted` square + « Toutes les commandes » + global count) then the collapsible category→tool tree. Chevron toggle buttons (`--faint`, 16×26). Counts are mono `--faint` and are **global totals**, independent of the active filter.
- **Tags** — header « Tags »; tag buttons rendered `#name` + trailing mono `--faint` count; active tag styled with accent.

**Sidebar collapse (Q145):** a manual collapse toggle is provided in the top bar; collapsed state is persisted **device-local** (same bucket as theme). Because D8 uses hard-min-width + horizontal scroll rather than breakpoint reflow, the reco's "auto-collapse under a breakpoint" is **not** implemented — collapse is manual only. Per R4, this collapse is the first thing that reclaims width (272px) before the content-region floor is reached.
> **Open:** Q145's collapse toggle is adopted-by-default but was flagged "confirm for v1"; if a reviewer wants the leanest v1, the sidebar can ship always-visible (drop the toggle) with no other impact. Recommend keeping the manual toggle.

#### 11.5.3 Content pane & reading-width caps (Q147)

The content pane fills the remaining width and scrolls vertically. **Reading-width caps are asymmetric and locked:**
- **Méthodologie:** capped at `820px`, centered.
- **Cheatsheet:** capped at `840px`, centered.
- **Bibliothèque & Références:** **uncapped** (fill the pane) — density is prioritized over line length for the card grids.

The ≈900px hard min-width (R4, §11.5) is enforced on this content region; below it the content pane scrolls horizontally.

---

### 11.6 Notification & Confirmation Model (Q196 — locked)

The prototype's single-slot, non-interactive, 1.7s auto-dismiss toast (`flash()`) is **replaced** by a tiered messaging contract shared by every feature that needs to communicate. There are four functional message types, mapped onto **three simple UI slots** (see "Slots" below):

| Tier | Trigger | Behavior | Dismissal |
|---|---|---|---|
| **Transient success toast** | Non-destructive success (copy OK, save OK, import summary line, variable rename cascade count) | Toast slot, `aria-live="polite"` region | Auto-dismiss ~2s; no action |
| **Action toast (with Undo)** | Reversible destructive action: reference delete (Q16), phase/step delete (Q70). (Undo is now a client no-op against a deferred DELETE — §7.9/§4.4.) | Shares the toast slot; persists longer (~6–8s) with an « Annuler » action; invoking it cancels the still-pending deferred delete | Auto-dismiss after window, or on « Annuler » / manual close |
| **Persistent error banner** | Save failure (awaited create/PATCH — §4.4/§10.2), import failure, copy failure (Q53) | Its own slot, stays **until explicitly dismissed**; distinct error styling (uses `--danger`); may carry a « Réessayer » action (per R2, save is also retried at the next edit/focus) | Manual dismiss only |
| **Confirm dialog (modal)** | Irreversible / high-impact destructive action: delete command (Q13/Q14), delete category with reassignment (Q17), delete roadmap + « Réinitialiser la progression » (Q57/Q70), REPLACE import (D4) | Blocking `role="dialog"` modal, states the impact + reference/affected count, requires explicit confirm; destructive button uses `--danger` | Confirm / Cancel / Escape (Escape = cancel) |

**Slots (Q196 — simplified per A25):** the earlier bounded queue with eviction is **replaced by three fixed slots**, which together preserve every functional level above without any queue-management logic:
1. **Toast slot — transient + undo, last-wins.** A single bottom/corner slot carries **both** the transient success toast and the action/undo toast. It shows one message at a time; a newer toast simply **replaces** the current one (last-wins). No visible-count cap, no age-out ordering. Wrapped in an `aria-live="polite"` region.
2. **Persistent error banner.** A separate, **independent** slot that stays until explicitly dismissed (distinct `--danger` styling, optional « Réessayer »). It is never evicted by a toast and coexists with the toast slot.
3. **Modal confirm.** Blocking `role="dialog"` confirmations for irreversible/high-impact actions, exactly as in the table above.

**Copy semantics (Q53 / OPSEC):** copy actions report the **real** clipboard result (success or failure), not an always-success toast. The clipboard always receives the **resolved** command (variables substituted) — this is the one deliberate exception to the raw-token export posture (Q99). The OPSEC implication (resolved values incl. `$PASS` reach the clipboard) is documented in §12.6; exported files remain raw by default.

**Secret-in-clipboard indicator (A50 / Q182):** when the copied resolved command contains a value drawn from a `sensitive` variable (e.g. `$PASS`), the success toast additionally flags it — « Copié — contient un secret » — so the user knows a secret now sits on the OS clipboard (and, via the OS clipboard-manager vector named in §12.6 — Klipper, Win+V, Universal Clipboard — potentially on disk / other devices). This indicator ships in v1; broader auto-clear of the clipboard is tracked as an OPSEC consideration in §12.6.

**Live region:** the toast slot container is wrapped in an `aria-live="polite"` region so screen readers announce it (Q151).

---

### 11.7 Accessibility

**Target (Q148 — locked):** **WCAG 2.1 AA** for keyboard operability, contrast, and focus visibility. Full screen-reader parity is **best-effort** given the single-user desktop context.

- **Visible focus (Q149 — locked):** a consistent `:focus-visible` ring using the accent — `outline: 2px solid var(--acc-line)` (or equivalent `box-shadow`), applied to **all** interactive elements **including buttons**. The prototype's `input:focus,textarea:focus{outline:none}` is **removed/replaced**; nothing may suppress the focus ring. The ring must be visible in both themes.
- **ARIA for custom controls (Q150 — locked):**
  - Segmented tabs → `role="tablist"` container, each tab `role="tab"` + `aria-selected`; the tab panels are `role="tabpanel"`.
  - Methodology step toggles (checkbox-style) → `role="checkbox"` + `aria-checked`, keyboard-toggleable with Space.
  - Icon-only buttons (copy, open-link, delete `✕`, chevrons, drag handles) → `aria-label` (FR, matching the visible `title`, e.g. « Copier », « Supprimer », « Ouvrir »).
  - The search input and each variable value input → an associated visually-hidden `<label>`.
- **Modal dialogs (Q151 — locked):** the Add-command / Add-reference modals (and confirm dialogs) implement `role="dialog"` + `aria-modal="true"`, a **focus trap**, **Escape to close/cancel**, focus moved to the first field on open, and focus **restored** to the invoking control on close. The prototype's overlay/`✕`-only closing is upgraded to include Escape + focus management.
- **Keyboard shortcuts (Q164 — locked, minimal set):**
  - **Escape** → close/cancel the open modal (with focus trap + restore).
  - **`/`** → focus the per-module search (only where search is active).
  - **`1`–`4`** → switch to Bibliothèque / Méthodologie / Références / Cheatsheet.
  - Shortcuts are suppressed while typing in an input/textarea (except Escape).
- **Up/down reorder fallbacks (Q71/Q72 — locked):** native HTML5 drag-and-drop is mouse-only and inaccessible. Every reorderable list — methodology phases and steps (edit mode) and cheatsheet entries — provides **↑/↓ buttons** as a keyboard/accessible fallback alongside the mouse DnD. The ↑/↓ buttons are the canonical accessible path; DnD is an enhancement.
- **Relative units / zoom (Q153):** rem-based type (§11.2) ensures OS/browser zoom and font-scaling work without breaking the layout.
- **Reduced motion (Q155 — locked):** a `@media (prefers-reduced-motion: reduce)` block disables non-essential transitions (drag opacity, progress-bar width animation, toast slide, hover filters). Essential state changes remain instant.
- **Scrollbars (Q161):** Firefox `scrollbar-width: thin; scrollbar-color:` set alongside the WebKit rules so both engines get themed scrollbars.
- **Browser support (Q160 — locked):** target current Chromium and Firefox **incl. ESR ≥115**. The app relies on `color-mix()`, `backdrop-filter`, the Clipboard API, and HTML5 DnD **without polyfills**. No legacy/IE support. (color-mix is required for accent derivation — ESR ≥115 covers it.)

---

### 11.8 Print CSS (Cheatsheet PDF via `window.print()`)

PDF export is **client-side** (`window.print()`), v1 (Q106). A dedicated hidden print root (`.printroot`) is rendered and swapped in for print; the interactive app (`.app`) is hidden. (Behavior in §9.7.)

```css
.printroot { display: none; }
@media print {
  .app { display: none !important; }
  .printroot { display: block !important; }
  @page { margin: 1.4cm; }   /* A4 */
}
```

- **No custom running header/footer or page numbers (A22):** CSS Paged-Media margin boxes and per-page `position: fixed` elements are **not** reliably supported by Chromium/Firefox, so the print root uses **none of them**. The cheatsheet title and metadata line are rendered **once** at the top of `.printroot` (they are not repeated per page), and the browser's own print header/footer (URL, date, page numbers) is left in place. No `@page` margin-box content is emitted beyond the `margin: 1.4cm`.
- **Print root styling (light, fixed, verbatim):** `background:#fff; color:#111; font-family:'IBM Plex Sans'`. It is theme-independent (always light) for ink/PDF legibility — it does **not** use the app tokens.
  - Title `<h1>` 24px; target subtitle `#555` 13px; metadata line mono 11px `#333` rendering non-empty **non-sensitive** variables as `$KEY = value` chips (sensitive vars excluded; Q100/Q101). `<hr>` `#ddd`. This title/metadata block appears once, at the top of `.printroot`.
  - Each entry: `break-inside: avoid`; title `700/14px` + badge `— {catégorie / outil}`; optional desc `#444/12px`; command `<pre>` `background:#f4f4f5; border:1px solid #e2e2e5; mono 12px; white-space:pre-wrap; word-break:break-word; color:#111`; optional note as `Note : …` with a `#ccc` left border.
- **Raw vs resolved in exports (Q99 — locked):** Markdown/PDF exports emit **raw `$TOKEN`** by default; the print root's command text is the **raw template unless** the per-export « résoudre les variables » toggle is on. (This differs from the clipboard, which is always resolved — §11.6.) Maximum-OPSEC posture: nothing sensitive is written to a file without an explicit opt-in.
- **Filename / title:** set `document.title` to an ASCII slug of the cheatsheet name + date suffix before calling `print()`, so the browser's PDF filename is meaningful (Q109); restore afterward.
- **Empty state:** if the cheatsheet has no entries, the print root shows the header + an explicit empty notice rather than a blank page (Q107).
- PDF metadata caveat (author/producer strings the browser injects) is documented in the README (Q110); the app cannot strip them from a client-side print.

---

### 11.9 Fixed Constants, Settings Posture & Non-Goals

- **Density = compact, fixed (Q158 — locked):** `--pad: 10px`. No comfortable/compact runtime toggle in v1. `--pad` currently affects card padding only; do not extend its scope.
- **Accent = `#3ddc97`, fixed (Q157 — locked):** no accent picker, no preset palette in v1.
- **Default landing view = Bibliothèque, hardcoded (Q159 — locked):** there is **no settings screen** in v1. If settings ever become necessary they belong in a lightweight top-bar gear popover, not a 5th tab — but none ship in v1. (The last active view/roadmap is still restored device-local per Q112; that is state restoration, not a configurable "default view".)
- **Emoji brand kept; self-contained favicon set (Q162 — locked):** the `💩` glyph remains the in-app brand mark; a self-hosted SVG/PNG favicon set is bundled for consistent, egress-free tab icons.
- **French UI, no i18n framework (Q163 — locked):** UI strings are hardcoded in French; no i18n library. Dataset content (category labels, commands — some English) is treated as **user data**, not localizable UI.
- **Persistence split (Q112) for visual state:** theme and sidebar-collapsed and last-active-view are **device-local** (browser storage); they are never in the backend dataset and never in JSON export/import. Variable **values** are session-memory-only.

**Locked decisions reflected:** D8 (min-width floor lowered/re-scoped per R4), Q41, Q53, Q71/Q72, Q99, Q100/Q101, Q106/Q107/Q109/Q110, Q112, Q143, Q144, Q145, Q146, Q147, Q148, Q149, Q150, Q151, Q152, Q153, Q154, Q155, Q156, Q157, Q158, Q159, Q160, Q161, Q162, Q163, Q164, Q167, Q182 (A50), Q196.

---
## 12. Non-Functional, Security/OPSEC & Delivery

This section defines the threat model, security/OPSEC posture, internationalization, target platforms, performance envelope, launch/runtime behavior, and delivery pipeline for **Cheat**. It reflects the locked decisions log as revised by the approved adjustments: **D7's rationale is requalified to variable-values-only** (A11) and an **optional, opt-in at-rest encryption** is offered (R5); the **LAN opt-in / TLS / per-launch token subsystem is removed** in favor of a loopback-only listener plus a Host/Origin allowlist (R1 / A63); the memory-only-values decision still overrides Q177. Where the decisions log and a questionnaire *Reco* diverge, the adjustments win, then the decisions log.

> In-repo documentation (this spec, README, CHANGELOG) is written in **English**. All user-facing UI strings, labels, toasts, warnings, and command examples remain in **French** verbatim.

---

### 12.1 Threat Model & Trust Boundaries

Cheat is a **single-user, localhost-only desktop web app** used during authorized engagements.

**Assets and where they live**

| Asset | Location | Persisted? | On the wire (local API)? |
|---|---|---|---|
| Curated knowledge base — commands, references, categories, roadmaps/phases/steps, variable **definitions** | SQLite (DB) | Yes | Yes |
| User content — personal **notes**, cheatsheet **titles/targets**, reference **URLs**, progression (`done`), panel state, cheatsheet composition | SQLite (DB) + device-local (theme, last active view/roadmap) | Yes | Yes (DB portion) |
| Variable **values** (incl. secrets such as `$PASS`, target `$IP`, `$USER`, `$DOMAIN`) | **SPA memory only** | **Never** (not DB, not localStorage) | **Never** — never sent to backend |

**Key architectural consequence (load-bearing for the whole threat model):** variable **values are held exclusively in the SPA's in-memory state, substitution/resolution is performed entirely client-side, and values are never transmitted to the Go backend, never written to SQLite or localStorage, and are reset to empty on every reload** (D7 + structural decision). The backend therefore never possesses, logs, or persists any variable value.

> **Prominent OPSEC caveat (A11):** the "nothing sensitive touches disk" claim applies to variable **values only**. The DB **does persist, in cleartext by default**, free-text user content that routinely embeds sensitive data: personal **notes**, cheatsheet **targets** (e.g. « HTB — Sauna 10.10.10.5 ») and reference **URLs** (IPs, hosts, occasionally credentials). Even a RAW export always writes `target`. Protecting this free-text content is the **operator's responsibility**: **full-disk encryption (FDE) is the documented assumed baseline**, and an **optional at-rest encryption** is available for shared hosts (§12.6, R5).

**Adversaries considered**
- Other local processes / users on a shared jump-box that can reach a loopback port.
- Malicious web origins in the operator's browser attempting CSRF / DNS-rebinding against the local API.
- Casual shoulder-surfing / screen-sharing (mitigated by per-line masking + click-to-reveal, §12.6).

**Explicitly out of scope**
- Multi-user authentication, accounts, RBAC, cloud sync (per §1).
- Remote network attackers: there is **no LAN bind mode** (R1). The listener is loopback-only; remote access is achieved by a **user-managed SSH tunnel** (documented, zero app code) and is out of the app's trust boundary.
- **Multi-user isolation on a shared host is an OS-level concern** (file permissions, per-user accounts) — **not** provided by the app itself (A63). Any local user who can read the DB file reads the cleartext free-text content unless the operator enables FDE or the optional at-rest encryption (§12.6, R5).

---

### 12.2 Network Binding & Local Listener

**Q168, Q170, Q172 (adopted, as revised by R1 — LAN opt-in, TLS, and the per-launch token are removed).**

| Concern | v1 behavior |
|---|---|
| Bind address | **Loopback only** — `127.0.0.1` and `[::1]`. There is **no non-loopback bind option**, no `--bind` LAN flag. |
| Transport | **Plain HTTP.** `navigator.clipboard` works on `http://localhost` / `http://127.0.0.1` (secure-context exemption), so no TLS is needed and none is generated. |
| Remote access | Not supported in-app. The documented fallback for remote use is a **user-managed SSH tunnel** to the loopback port — no runtime cert generation, no bearer token. |
| API authentication | **None / no secret token.** Because the listener is loopback-only, protection against other browser origins and CSRF/DNS-rebinding is provided structurally by the Host/Origin allowlist and the custom-header requirement (§12.3), which need no secret. |

> **Why no token (R1 / A63):** a per-launch token served in cleartext inside `index.html` protects nothing against a local process — any local `curl` that passes the Host check reads it. It added a whole subsystem (runtime TLS cert generation, meta-injection bootstrap, a `FORBIDDEN_TOKEN` retry/reload path) for a marginal CSRF benefit that the Host/Origin allowlist already provides on loopback. Isolation between local users is therefore explicitly an **OS-level** responsibility (§12.1), or handled by the optional at-rest encryption (§12.6, R5).

---

### 12.3 CSRF / DNS-Rebinding Defenses

**Q171 (adopted, revised per R1/A62/A63).** The local API is a mutating surface reachable by malicious browser origins, so it is defended **without any secret token**:

- **Host allowlist:** every request's `Host` must match `127.0.0.1:<port>`, `localhost:<port>`, or `[::1]:<port>` (A62 — the IPv6 loopback literal is included so `localhost → ::1` resolution does not spuriously `403`). `Origin`/`Referer`, when present, and `Sec-Fetch-Site` must be same-origin. Mismatches are rejected with `403 FORBIDDEN_HOST`.
- **Custom-header requirement on mutating requests:** all state-changing verbs (`POST`/`PUT`/`PATCH`/`DELETE`) require a fixed **non-secret custom request header** (e.g. `X-Cheat-App: 1`). A cross-origin *simple request* cannot set a custom header, and setting one forces a CORS preflight the server never approves (no permissive CORS is emitted). Missing header → `403`.
- Combined, these defeat both classic CSRF (a foreign page cannot add the custom header nor pass the Host/Origin check) and DNS-rebinding (Host mismatch). No shared secret is involved.

---

### 12.4 HTTP Security Headers & Content-Security-Policy

**Q173, Q179 (adopted).** The Go server sets the following on every response serving the embedded SPA and API:

| Header | Value | Rationale |
|---|---|---|
| `Content-Security-Policy` | see directives below | Confine the app to same-origin; forbid external hosts. |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing. |
| `X-Frame-Options` | `DENY` | Anti-clickjacking (legacy companion to CSP). |
| `Referrer-Policy` | `no-referrer` | No referrer leakage on any navigation/outbound link (Q85). |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), usb=(), payment=(), magnetometer=(), gyroscope=(), interest-cohort=()` | Disable powerful features the app never uses. |

**CSP directives (self-only strict):**

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

- `style-src 'unsafe-inline'` is **required** by the faithful visual port (inline styles + CSS vars). Scripts stay `'self'`; the SPA uses **no inline `<script>`** and reads **no bootstrap secret** from the served HTML (there is no launch token — R1).
- `connect-src 'self'` and the absence of any external host in every directive **mechanically enforce zero network egress** (§12.5), including forcing self-hosted fonts.
- `img-src ... data:` permits embedded/inline icons; no remote images (no reference favicons — Q81).

---

### 12.5 Zero Network Egress

**Q174, Q175, Q81, Q162, Q85 (adopted).** Cheat performs **zero outbound network calls that are not a deliberate user click on a reference link.**

- **Fonts:** IBM Plex Sans / IBM Plex Mono are **self-hosted and embedded via `go:embed`** (only the required weights, `woff2`), served same-origin with `font-display: swap` and system fallbacks. **No Google Fonts / CDN.** Applies to printing/PDF as well (§12.6).
- **Reference favicons:** none fetched — references never trigger a favicon lookup (Q81). Default reference title falls back to the domain (Q87).
- **App favicon / brand:** the playful emoji mark is kept in-app; a self-contained SVG/PNG favicon set is embedded and served same-origin (Q162) — no external fetch.
- **Browser spellcheck / autocorrect as an egress vector (A10):** native "enhanced" spellcheck (Chrome), autocorrect, and third-party writing extensions transmit **field contents** to remote services — outside `connect-src`'s reach. Typing `$PASS`, `$IP`, `$USER`, a target, or a note into a checked field would ship it to a vendor. Therefore **every** input and textarea in the app (not only sensitive ones — an IP typed into a note leaks too) MUST set `spellcheck="false"`, `autocorrect="off"`, and `autocapitalize="off"`. This is a required attribute in §5.5 and §9.3. The README notes that **browser extensions (e.g. Grammarly) remain outside the app's control** and should be disabled during engagements.
- **No telemetry, analytics, crash reporting, or update pings** — this is a **hard requirement enforced in build review** (Q175, Q194). No phone-home of any kind.
- **Outbound links (references):** rendered with `rel="noopener noreferrer"` and governed by `Referrer-Policy: no-referrer` (Q85); a copy-URL affordance is provided so the operator can avoid navigating at all.

---

### 12.6 Secrets Handling & At-Rest Posture

**At-rest posture (D7 rationale requalified per A11; optional protection added per R5).** By default there is **no at-rest encryption**: variable *definitions* and all free-text user content (**notes, cheatsheet targets, reference URLs**) are stored in **cleartext** in SQLite. Variable **values** are never stored (§12.1). **Full-disk encryption (FDE) is the documented assumed baseline.**

**Optional opt-in at-rest encryption (R5), default OFF:**
- For engagements on a shared jump-box (a listed adversary, §12.1), the operator may enable **passphrase-based at-rest encryption**. The implementation is either whole-DB (a pure-Go SQLCipher driver, if used) or **application-level field encryption of the `notes`, cheatsheet `target`, and reference `url` columns** — the field-level path is preferred as it preserves the no-CGO single-binary build (§12.8). *(Uncertainty flagged: a fully pure-Go SQLCipher may not exist; field-level encryption is the safe default.)*
- The feature is **OFF by default**. When enabled, the passphrase is prompted at launch (unlock) and **never persisted**. Auto-lock (Q184) and passphrase rekey/lifecycle (Q186) are relevant **only** when encryption is enabled; v1 ships **enable/disable + launch-unlock only**, and the fuller lifecycle (auto-lock, rekey) is **deferred to v2** (§12.13).

**Variable values & sensitivity (Q176, Q177 — Q177 Reco overridden by the memory-only decision):**
- Each variable **definition** carries a `sensitive` boolean (persisted in DB, part of `{name, sensitive, isBuiltin, position}`). `$PASS` is `sensitive` by default.
- Sensitive value inputs render **masked (password-style) with a per-line click-to-reveal** toggle to verify typing (the revealed value is never persisted or logged, §5.5 A38).
- Values are **never persisted, never exported, never logged** and are **reset to empty on reload**. The six standard variables ship **empty** (no `PASS='password'` placeholder — Q188).
- A prominent **« Effacer toutes les valeurs »** action clears every value in one click (Q30) for engagement/host handoff.
- The **global redact / « Mode masqué »** feature is **deferred to v2** (A26): it has no defined placement or persistence tier and is not implementable against the current resolver part model (a `$PASS` resolved inline cannot be masked without `part.sensitive`). v1 relies on per-line masking + the `sensitive` flag.

**Export vs clipboard posture (Q99, Q53 — reconciled):**
- **Exports (Markdown / PDF) emit RAW `$TOKEN` by default** (Q99). A per-export opt-in toggle « Résoudre les variables » materializes resolved values. Maximum OPSEC: nothing sensitive is written to disk without an explicit action.
- **Clipboard stays resolved** (« Copier » / « Copier tout ») — a deliberate local action for terminal paste (Q53). Copy toasts reflect the **real** clipboard result (success/failure), not an always-success stub.

**Clipboard secret handling (Q182, A50):**
- **Named vector — OS clipboard manager → disk:** a resolved `$PASS` placed on the system clipboard can be **persisted outside the app** by OS clipboard-history managers (KDE **Klipper**, Windows **Win+V** history, Apple **Universal Clipboard**). The app cannot clear those histories.
- **v1 minimum (ships):** when copied resolved text contained a value from a `sensitive` variable, a **secret indicator** in the toast notes it (e.g. « copié — contient un secret »).
- An **optional clipboard auto-clear after N seconds (OFF by default)** is defined; it lives behind the settings gear popover (Q159). If no settings surface ships in v1, only the indicator is present.

**Logging policy (Q178, adopted):** release builds run **GORM `Silent`** and a **minimal Gin access log** (method, path, status only — **no bodies, no query strings, no bound params**). Documented prohibition on logging variable / command template / note content.

**No secrets in URLs (Q180, adopted):** all filtering/search is **client-side**. If any server-side query is ever added it uses POST bodies — never GET query strings — so target names/secrets never land in logs or history. Variable inputs set `autocomplete="off"` / `new-password` and `data-1p-ignore` to suppress browser autofill and password-manager capture, especially on `sensitive` fields (Q181), and carry the anti-egress `spellcheck="false"` attributes (§12.5, A10).

**PDF/print metadata caveat (Q110, Q101):** PDF export is **client-side `window.print()`** in v1. The exported PDF may carry browser/OS-injected metadata (producer, timestamps) outside the app's control — this is **documented in the README as an OPSEC caveat**. In-app export metadata prints the **export date** but keeps the **tool/version fingerprint OFF by default** (Q101). Deterministic server-side PDF is deferred to v2.

**Data lifecycle & repo hygiene (Q183, Q185, A17, A40):**
- **v1 wipe = documented manual deletion of the DB file** (stop the binary, delete the DB file). There is **no in-app factory-reset endpoint and no `GET /api/backup.sqlite`** (removed, A17) — both were redundant with stopping the binary and deleting/copying the file.
- **Backup = stop the binary and copy the DB file** (documented in README, A17). The **automatic JSON pre-import snapshot is kept** (§10.4).
- Automatic snapshots (pre-import) contain notes/targets/URLs, so they live in a **`backups/` folder co-located with the DB** (outside the repo by default, configurable — §12.10), which is added to `.gitignore` (§12.11, A40).
- The **DB file, `backups/`, and export artifacts live outside the repo by default** and `.gitignore` carries explicit patterns (§12.11).
- README carries an **OPSEC warning against committing client data** (extended per A40) and the note that browser extensions/spellcheck remain outside the app's control (A10).

---

### 12.7 Internationalization

**Q163 (adopted).** UI is **French-only in v1** with hardcoded FR strings — **no i18n library / framework** is scaffolded.
- Category labels and command/reference content are treated as **user data**, not localizable UI (so English/mixed category labels remain as authored).
- In-repo documentation stays English; UI strings, labels, and command examples stay French.

---

### 12.8 Target Browsers & Platforms

**Q160, Q161, Q190 (adopted).**

- **Browsers:** current **Chromium** and **Firefox including ESR ≥ 115**. The app relies on `color-mix()`, `backdrop-filter`, the Clipboard API, and HTML5 DnD **without polyfills**. No legacy/IE support.
- **Scrollbars:** themed via `::-webkit-scrollbar` **and** the Firefox equivalents `scrollbar-width: thin; scrollbar-color: …` (Q161).
- **OS / architecture build targets:** `linux/amd64` primary (plus `linux/arm64`); `windows/amd64` secondary.
- **SQLite driver:** use a **pure-Go SQLite driver** (no CGO) to keep single-binary cross-compilation simple (Q190). The optional at-rest encryption (§12.6, R5) is implemented so as to preserve this no-CGO constraint (field-level encryption unless a pure-Go SQLCipher driver is adopted).

---

### 12.9 Performance & Capacity

**Q189, Q192 (adopted).**

- Design target: **~2,000 commands**, fully client-side filtering.
- **Search debounced ~150 ms**; interaction/filter latency target **< 100 ms** (instant-local feel).
- **No pagination or list virtualization** in v1.
- **No PWA / service worker** — the server is already local, so offline is covered once fonts are embedded (Q192). An optional web manifest may come later.
- **Persistence model (R2, A25):** field text edits are **debounced ~500 ms** (D3 spirit — no explicit "Save" button); **entity creates are awaited** (`await POST` → real ULID), which eliminates temp-IDs, ID reconciliation, and the retry queue. On failure, a **persistent inline save-error banner** surfaces (not a fire-and-forget toast) and the write is retried on the next edit/focus — one slot of the tiered messaging model (§11.6).

---

### 12.10 Launch, Configuration & Runtime

**Q187, Q191, Q194, Q195 (adopted).**

| Concern | Behavior |
|---|---|
| Startup mode | **Foreground** process that prints its final localhost URL on stdout. Optional `--open` flag launches the default browser. **No systemd service / auto-start** (Q191). |
| Bind | **Loopback only** (`127.0.0.1` / `[::1]`), no LAN option (R1, §12.2). |
| Default port | Fixed **uncommon high port** (e.g. `48200`), overridable via `--port` / `CHEAT_PORT` (Q195). |
| Port clash | **Fail loud with a clear message** by default; optional auto-increment behind an explicit flag. Always print the final URL actually bound. |
| DB path | **Single DB file** with a **configurable path** via `--db` / `CHEAT_DB` so each engagement gets its own directory (Q187). Automatic snapshots live in a `backups/` folder co-located with the DB (§12.6, A40). **No in-app multi-workspace switcher** in v1. |
| At-rest encryption | **Optional, OFF by default** (R5, §12.6). When enabled, the launch prompts for the passphrase to unlock; the passphrase is never persisted. |
| Seeding | **First-run only** (Q133), gated on the `db.initialized` flag: the curated OSCP seed (commands / roadmaps / references / categories) is inserted once as ordinary editable/deletable rows; **the six standard variables ship empty** (Q188). **Never auto-reseed on upgrade; deleted seeds are not resurrected.** There is **no seed-pack distribution mechanism** in v1 (removed, A24). |
| Version identity | Version string **embedded at build time** (`-ldflags -X`), shown in-app; **no auto-update, no update-check ping** (Q194). |
| Default view | Landing is **Bibliothèque** (hardcoded v1); optional gear popover only if a settings surface is later built (Q159). |

> **Open:** the exact integer for the default port is an implementation choice (Q195 mandates only "fixed, uncommon, overridable, fail-loud-on-clash"). `48200` is a placeholder.

---

### 12.11 Delivery — Build, Packaging & Repository

**Single artifact:** the SPA is built with Vite, embedded into the Go binary via `go:embed`, and served same-origin from the loopback listener — one self-contained binary, no runtime assets.

**Dockerfile (multi-stage):**
1. **Stage 1 — Node build:** `node:*-alpine`; `npm ci` + `vite build` → produces `dist/`.
2. **Stage 2 — Go build:** `golang:*`; copies `dist/` into the embed path, runs `go build` with a pure-Go SQLite driver (no CGO), **release flags `-ldflags "-s -w -X main.version=<v>"`** to strip debug symbols/metadata (OPSEC).
3. **Final stage:** minimal base (`gcr.io/distroless/static` or `scratch`) containing only the single binary; runs as non-root; exposes the default port; **no external network calls at build or run** (verified in build review, Q175).

**Makefile targets** (standalone-project convention):

| Target | Purpose |
|---|---|
| `make dev` | Run Vite dev server + Go backend for local development (hot reload). |
| `make build` | Build the SPA then compile the embedded single binary (release flags, symbols stripped). |
| `make run` | Build (if needed) and run the binary on the default port. |
| `make docker` | Build the multi-stage Docker image. |
| `make test` | Run Go tests and frontend tests. |
| `make clean` | Remove build artifacts (`dist/`, binary, coverage). |

**`.gitignore` (extends the baseline `.env`, `*.exe`, `*.dll`, `*.bin`, `*.o`, `__pycache__/`):**
- `*.db`, `*.sqlite`, `*.sqlite3` (and journal/WAL siblings)
- `/backups/` (automatic pre-import snapshots — contain notes/targets/URLs, A40)
- `/exports/`, exported `*.md` / `*.pdf` artifacts
- `node_modules/`, `/dist/`, the compiled binary
- No binaries or build artifacts committed (Q183). README carries the OPSEC warning against committing client data (extended to cover `backups/`, A40) and the note that browser extensions/spellcheck are outside the app's control (A10).

**Git workflow (gitea):**
- Branches: `feature/<name>`, `fix/<name>`, `research/<name>` (never commit directly to the default branch).
- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, …).
- Push to gitea and open a **draft PR** for review.
- README updated after features; all changes tracked in `CHANGELOG.md`.

---

### 12.12 Licensing — Open Item

**Q193.** Locked default: **private / proprietary, no OSS license.** The repo embeds a curated OSCP knowledge base, so it stays private unless there is explicit intent to publish; if published, **MIT**.

> **Open:** final license choice (private/proprietary vs MIT) is the one remaining minor open item and is not blocking for implementation.

---

### 12.13 v2 Roadmap / Deferred

Explicitly out of v1 scope, deferred to a later version:

- Switchable **variable value profiles per target** (definitions are already modeled separately from values, so this needs **no migration** — D2).
- **Global redact / « Mode masqué »** across the UI (A26 — v1 keeps per-line masking + the `sensitive` flag; the resolver part model lacks the `sensitive` metadata a global inline redact would require).
- **Fuller at-rest encryption lifecycle** — auto-lock (Q184) and passphrase rekey (Q186) — on top of the v1 enable/disable + launch-unlock opt-in (R5, §12.6).
- **Per-entry cheatsheet note overrides** (v1 keeps a single base note map per id — Q95/Q97).
- **References cross-linking** (references are standalone in v1 — Q88).
- **Unknown-token auto-detection helper** for templates (Q36).
- **Server-side deterministic PDF** export (v1 uses client `window.print()` — Q106/Q110).
- **Drag-and-drop parity on the cheatsheet** (v1 reorders via ↑/↓ — Q98).
- **Touch support** for reordering (v1 is desktop/mouse + ↑/↓ buttons — Q71/Q72, D8 desktop-only strict).
- Stretch: in-app **"wipe all data" / reset** action (v1 relies on manual DB-file deletion, A17); optional **clipboard auto-clear** exposed via a settings popover (Q182/Q159 — the secret indicator « copié — contient un secret » already ships in v1, A50).

---
## Open Items

This is the master list of non-blocking open questions and the explicit v2-deferral set. Items resolved by the 69 review adjustments have been removed and are not repeated here (e.g. the PATCH zero-value hazard resolved by A1, the `step.expanded` persistence question resolved by A15, the two conflicting import-summary shapes resolved by A4). The inline `> **Open:**` notes in the sections above are the local authoritative statement of each question; this list consolidates them.

### Genuine open questions (non-blocking for implementation)

1. **Repository license (§12.12) — the one remaining real decision.** Default proposed: **private / proprietary** (the repo embeds a curated OSCP knowledge base); **MIT** only if there is explicit intent to publish. Not blocking.
2. **Light-theme `--faint` remediated hex (§11.3).** The constraint (≥ 4.5:1 on `#ffffff`) is locked; the exact hex (`#676c7a` as a starting point) must be validated with a contrast checker before shipping.
3. **IBM Plex font files to ship (§11.2).** The 4 Sans + 3 Mono static WOFF2 weights (smallest footprint) unless a reviewer prefers the variable-font files for size parity.
4. **Default port integer (§12.10).** Q195 mandates only "fixed, uncommon, overridable, fail-loud-on-clash"; `48200` is a placeholder.
5. **Dev proxy target port (§2.8).** Whether the dev proxy target (`8787`) is fixed or read from `CHEAT_PORT` — cosmetic, no architectural impact.
6. **AV-evasion category label (§3.3).** Used verbatim as `Antivirus Evasion & Metasploit`; adjustable at seed time without a schema change if a different reconciled wording is intended.
7. **Default `sensitive` state of the 6 standard variables (§5.4).** The recommended default (only `$PASS` sensitive) is not itself locked; all six remain user-toggleable via the mask affordance.
8. **Raw-export metadata gating (§9.4).** This spec gates the value-metadata block behind the per-export resolve toggle (a raw export writes no concrete values anywhere). Confirm if a raw export should instead still print non-sensitive variable values in its metadata.
9. **Sidebar collapse toggle for v1 (§11.5.2).** Adopted by default; a leanest-v1 build could ship the sidebar always-visible. Recommendation: keep the manual toggle.

### Deferred to v2 (explicitly out of v1 scope)

These features are intentionally excluded from v1 by the applied adjustments. The data model and API are designed so each can be added later without a breaking migration. The full roadmap is in §12.13.

- **JSON import MERGE mode** — v1 ships **REPLACE + automatic pre-import snapshot only** (A12, D4; §4.10, §10.4.6). The MERGE collision-detection / re-ID / by-name-merge / category-upsert engine is deferred.
- **Global tag management** — cross-content **rename / merge / delete** of tags and **zero-reference cleanup**; v1 keeps per-command / per-reference tag editing only (A14; §6.8, §8.8). No global tag-rewrite endpoint in v1.
- **Duplicate & restore-defaults** — **Duplicate command**, **Duplicate roadmap** (deep-clone), and **restore-defaults** / partial re-seed; v1 keeps `reset-progress` (A28; §4.6.4, §6.8, §7.2, §7.10, §10.5.4).
- **Global redact / « Mode masqué » (and the dropped `hidden` variable column)** — v1 keeps per-line masking via the `sensitive` flag; the resolver part model carries no per-part `sensitive` metadata that a global inline redact would require (A26, A19; §5.9, §12.6).
- **Per-target variable value profiles** — each cheatsheet/target carrying its own value set; v1 resolves every sheet against the **single global value set** (D2; §5.1, §9). Definitions are modeled separately from values so this needs no migration.
- **Per-entry cheatsheet note overrides** — v1 displays the single shared per-command note; the reserved `CheatsheetEntry.note` column is absent and re-added via `AutoMigrate` when the feature ships (A21, Q95; §3.2.9, §9.1).
- **Seed-pack content distribution** — the importable seed-pack update mechanism, its endpoints, and the `seed.version` key are cut; v1 seeds **first-run-only**, gated on `db.initialized` (A24; §3.8, §10.5.3).
- **Further deferrals** enumerated in §12.13: the variable-rename cascade across templates (A27), references cross-linking (Q88), unknown-token auto-detection (Q36), server-side deterministic PDF (Q106/Q110), cheatsheet drag-and-drop / touch parity (Q98/Q71–Q72), the reserved `type` soft-validation column (A21), manual reordering of custom variables, the fuller at-rest-encryption lifecycle — auto-lock / rekey (R5), optional clipboard auto-clear, and an in-app "wipe all data" / reset action.

---

## Traceability

This SPEC.md v1.1 is the review-adjusted successor to v1.0. It reflects the locked decisions **D1–D8** and the structuring decisions of the decisions log (`tasks/spec-decisions.md`), the 196 resolved questionnaire items (`tasks/spec-questions.md`), and **all 69 review adjustments** (A1–A64 + R1–R5) from `tasks/spec-adjustments.md`, applied in full.

### Locked-decision reconsiderations (R1–R5, accepted)

Each R-item overrides or extends a previously locked choice; **A11** is applied unconditionally alongside R5.

| ID | Overrides | Section(s) | Net effect |
|---|---|---|---|
| **R1** | Q168 LAN opt-in | §1.5, §2.6, §4.2, §12.2, §12.3 | Loopback-only bind; **no LAN mode, no runtime TLS, no per-launch bearer token**. Remote access = user-managed SSH tunnel. |
| **R2** | D3 optimistic queue | §1.4, §1.6, §2.3, §4.4, §10.2, §12.9 | **Awaited creates + debounced text PATCH**; no temp-IDs, no ID reconciliation, no retry queue. Persistent error banner + retry on next edit/focus. |
| **R3** | memory-only rule | §1.4, §1.6, §2.5, §5.1, §5.3 | Opt-in, **default-OFF** `sessionStorage` value mirror (`$PASS` excluded, never synced/exported) + « Coller les valeurs » bulk paste. |
| **R4** | D8 ~1024px floor | §1.6, §2.7, §11.5 | Hard min-width lowered to **≈900px** and re-scoped to the **content region** (sidebar collapse reclaims 272px first). |
| **R5** | D7 "never encrypt" | §1.4, §2.6, §10.1.2, §12.6 | **Optional, default-OFF** passphrase at-rest encryption of free-text surfaces for shared hosts. |
| **A11** | D7 rationale | §1.6, §2.6, §3.10, §10.1.2, §12.1 | D7 rationale requalified: only **variable values** are guaranteed never at rest; notes/targets/URLs persist in clear (user responsibility, FDE baseline). Required regardless of R5. |

### Applied adjustments — section map (A1–A64)

| ID | Section(s) | Effect |
|---|---|---|
| A1 | §4.1, §4.6.6, §4.6.9 | PATCH built from a present-keys map/pointers; zero-values (`done:false`, `sensitive:false`, `desc:""`) persist. |
| A2 | §4.4, §7.9, §8.9 | Reversible deletes deferred until the undo window closes; « Annuler » is a client no-op; drop "recreate with previous IDs". |
| A3 | §4.4, §10.2.3 | `sendBeacon` removed; unload flush via `fetch(keepalive:true)` (largely moot under R1/R2). |
| A4 | §4.10, §10.4.7 | Single canonical import-summary schema (nested `counts`, single `snapshotPath`), mirrored verbatim by §4.10. |
| A5 | §5.10, §6.4, §7.6, §9.3 | Three render states (`resolved`/`empty`/`undefined`) consistent everywhere; §5.10 is the sole authority. |
| A6 | §3.1, §3.7, §10.4.1, §8.1 | `createdAt`/`updatedAt` serialized and preserved verbatim on import (autoCreate/Update disabled in the import tx). |
| A7 | §3.2.11, §3.8, §10.5.1 | Seeding gated **solely** on `db.initialized`; no emptiness heuristic; REPLACE never re-seeds. |
| A8 | §3.2.1, §3.2.7, §10.4.5 | Canonical baseline reasserted post-REPLACE; `isBuiltin` **derived** from canonical identity, ignored from the envelope. |
| A9 | §3.2.10, §10.4.4 | Orphan `notes` entry dropped-and-warned so it cannot abort the FK-enforced REPLACE. |
| A10 | §5.5, §9.3, §12.5 | `spellcheck="false"` + `autocorrect`/`autocapitalize` off on **all** inputs/textareas (anti-egress). |
| A11 | §1.6, §2.6, §3.10, §10.1.2, §12.1 | D7 rationale requalified to variable-values-only (see above). |
| A12 | §1.5, §4.10, §10.4.6 | MERGE import deferred to v2; v1 ships REPLACE + snapshot only. |
| A13 | §9 intro, §9.3, §9.5 | Global-value model kept honest: per-sheet « Utiliser cette cible » bridge + persistent « valeurs globales » chip row. |
| A14 | §1.5, §6.8, §8.8 | Global tag rename/merge/delete + zero-ref cleanup deferred to v2. |
| A15 | §3.2.6, §3.10, §4.5, §10.1.1, §10.4.1 | `step.expanded` is in-memory React state — no column, not on the wire, not exported. |
| A16 | §4.4, §10.2.4 | Cross-tab live sync removed; WAL + `busy_timeout` + write mutex + single-instance lock kept. |
| A17 | §4.10, §4.11, §10.4.3, §10.4.8, §10.5.4, §12.6 | `POST /api/factory-reset` and `GET /api/backup.sqlite` removed (documented as stop-binary + file copy/delete). |
| A18 | §4.5, §4.8, §4.11 | `PUT /api/settings` removed (no server-scoped writable setting in v1). |
| A19 | §3.2.7, §4.6.9, §5.2 | `Variable.hidden` dropped (also removes the "hidden with no reveal" trap). |
| A20 | §4.9, §4.10, §10.4.1, §10.4.4 | Single `formatVersion: 1`; `schemaVersion`/`seedVersion`/`migratedFrom` removed from envelope/summary; no forward-migration engine. |
| A21 | §3.2.2, §3.2.7, §3.2.9, §5.2 | Reserved unused columns dropped in v1 (`CheatsheetEntry.note`, `Command.position`, `Variable.type`); re-added via `AutoMigrate`. |
| A22 | §9.7, §11.8 | No CSS Paged-Media margin boxes / per-page fixed header-footer / page numbers; title+metadata once at top. |
| A23 | §8.10 | References 3-state sort toggle removed; `createdAt`/insertion order kept. |
| A24 | §3.2.11, §3.8, §4.11, §10.5.3, §12.10 | Seed-pack machinery cut (endpoints, `seed.version` key, MERGE dependency). |
| A25 | §11.6, §12.9 | Bounded queue replaced by three fixed slots (last-wins toast, persistent error banner, modal confirm). |
| A26 | §5.9, §12.6, §12.13 | Global redact / « Mode masqué » deferred to v2 (parts carry no `sensitive` metadata). |
| A27 | §3.2.7, §4.6.9, §5.7, §6.11 | Variable-rename cascade deferred; v1 renames only an unreferenced variable, else delete/recreate. |
| A28 | §4.6.4, §6.8, §7.2, §7.3, §7.7, §7.10, §10.5.4 | Duplicate command / Duplicate roadmap / restore-defaults deferred; `reset-progress` kept. |
| A29 | §12.2 | Per-launch-token 403 reload-loop concern — moot under R1 (no token). |
| A30 | §7.2, §10.5.4 | Absent seed `commandId` set NULL / dropped-and-reported (first-run seed link resolution). |
| A31 | §3.1, §10.4.5 | Deterministic parent→child REPLACE insert order (or `PRAGMA defer_foreign_keys=ON`). |
| A32 | §3.1, §10.3.2 | `AutoMigrate` additive-only; numbered migrations run FK-off + `foreign_key_check` + pre-migration backup. |
| A33 | §8.7, §8.11 | References filter-empty state string added, parallel to §6.7. |
| A34 | §6.6, §10.1.1 | Library/References filter+search state is IN-MEMORY-ONLY (incl. `activeRefTag`). |
| A35 | §4.11 | Undescribed seed-pack/backup endpoints — moot under A24+A17 (index "Removed" note). |
| A36 | §9.6 | Explicit per-seed-command `language` values (bash / cmd / null) so exported fences keep coloring. |
| A37 | §5.9, §6.8 | Shell-literal collision hint for `$USER`/`$PASS`/`$PATH`/`$HOME` (editor + render). |
| A38 | §5.5 | Per-row reveal (eye) toggle on masked rows + empty-panel reload hint. |
| A39 | §6.4, §9.2 | Library card split control « Ajouter à… » adds to any sheet via explicit `sheetId`. |
| A40 | §10.3.1, §10.4.5, §12.6, §12.11 | Auto-snapshots to a co-located `backups/` folder, `.gitignore`d, with extended README OPSEC warning. |
| A41 | §4.4 | Reorders coalesced (only final order flushes); `tmp_` never in a URL path (moot under R2 awaited creates). |
| A42 | §4.10, §10.4.4 | Explicit import caps (≤ 20k commands, ≤ 100k steps, ~64 KiB per template/note), tunable. |
| A43 | §4.6.1 | `DELETE category ?reassignTo=` cases: must exist (404), ≠ self (400), default to `utilities` when omitted on a non-empty category. |
| A44 | §3.2.2, §6.9 | « Autre » import fallback fixed identity (literal id `autre`, gray, `isBuiltin=false`, created on demand). |
| A45 | §3.2.2, §3.6, §4.6.2 | `categoryId` required at the API (`VALIDATION_FAILED`); no "default info-gathering". |
| A46 | §4.6.6, §4.7, §7.7, §7.8 | Cross-phase move committed **only** via the steps reorder endpoint; step PATCH drops `phaseId`/`position`. |
| A47 | §3.1, §3.7, §4.7, §7.8 | `position` is a dense contiguous `0..n-1` sequence reassigned on commit; "midpoint" is the visual drop indicator only. |
| A48 | §3.1, §10.2.4 | Write mutex around write transactions, **not** `MaxOpenConns=1` (preserves WAL concurrent reads). |
| A49 | §10.4.1 | `formatVersion` bump policy: any `data`-shape change increments it with a named N→N+1 migration (merges with A20). |
| A50 | §5.13, §9.8, §11.6, §12.6 | Clipboard « copié — contient un secret » indicator; OS clipboard-manager vector named (Klipper/Win+V/Universal). |
| A51 | §5.13, §9.4 | `sensitive` protects the metadata block only; pre-export confirmation when a sensitive value would materialize in a body. |
| A52 | §5.1, §5.3 | Values are per-session, per-tab React state; "single global value set" holds within a tab (single-tab assumption). |
| A53 | §6.8, §11.5.1 | Modal category picker restored to chips/pills + « + » toggle (not a `<select>`). |
| A54 | §4.6.3, §8.2, §8.3 | Reference error codes SCREAMING_SNAKE_CASE (`VALIDATION_FAILED`/`DUPLICATE_REFERENCE_URL`/`SCHEME_NOT_ALLOWED`). |
| A55 | §3.2.3, §8.1, §8.2 | `updatedAt` added to the reference table and DTO. |
| A56 | §4.6.4, §7.2, §7.3 | `restore-defaults` response shape subsumed — the feature is deferred (A28), so no v1 response to standardize. |
| A57 | §4.6 | Category JSON example fixed: literal seed id + valid seed label + palette color, plus a custom-category example. |
| A58 | §3.1, §10.2.4 | Single-instance `flock` on `<db>.lock` keyed on the **resolved DB path**, not the listen port. |
| A59 | §6.4, §9.3 | No tool badge on library cards (tool is in the sub-header); badge kept on cheatsheet entries. |
| A60 | §9.2, §11.5.1 | « + Cheatsheet » top-bar add enabled on the Cheatsheet view (fixes the D1 no-create-location gap). |
| A61 | §11.5.2 | Sidebar row label corrected to « Toutes les commandes ». |
| A62 | §2.6, §4.2, §12.3 | `[::1][:port]` (loopback IPv6) added to the Host allowlist. |
| A63 | §2.6, §12.1, §12.2 | Token is a CSRF/DNS-rebinding defense only; multi-user isolation is an OS concern (moot under R1). |
| A64 | §3.2.2, §3.2.6, §3.4 | `Step.commandId` on command delete is the FK-level `ON DELETE SET NULL` (not an application step). |

**Chaining verified in reconciliation.** R1 makes A3/A29/A63 and the token aspect of A62 moot or trivial (all bind text is loopback-only, no token/TLS anywhere). R2 collapses A2/A3/A29/A41/A52 to awaited creates + debounced PATCH (no temp-ID/retry-queue/`sendBeacon` text survives). A12 neutralizes the MERGE-only FK bugs and reduces A9 to the REPLACE path (no MERGE mode referenced anywhere). A24 + A17 render A30/A35 largely moot and remove the seed-pack/factory-reset/`backup.sqlite`/`seed.version` machinery from the endpoint index and prose. A20/A49 leave exactly one `formatVersion` with no `schemaVersion`/`seedVersion`/`migratedFrom` in the envelope or import summary. A5 keeps the three render states identical across §5/§6/§7/§9. A11 requalifies the D7 rationale everywhere it appears (§1, §2, §3, §10, §12).

---
