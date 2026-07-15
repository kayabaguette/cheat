# Cheat — Final Specification

| Field | Value |
|---|---|
| **Title** | Cheat — Final Specification |
| **Version** | 1.0 (final) |
| **Status** | Approved for implementation |
| **Platform** | Desktop web app (single Go binary) |
| **UI language** | French (all UI strings, labels, placeholders, and command examples are French verbatim; in-repo documentation is English) |
| **Date** | 2026-07-15 |

**Cheat** is a single-user, offline, localhost-only desktop web application that centralizes the operational knowledge of a penetration test — reusable **commands**, step-by-step **methodologies**, external **references**, and target-scoped **cheatsheets** — into one workspace, and resolves a set of **live variables** (`$IP`, `$LHOST`, `$LPORT`, `$USER`, `$DOMAIN`, `$PASS`, plus user-defined ones) identically wherever a command is displayed. It ships as one self-contained Go binary that embeds a Vite + React + TypeScript SPA (`go:embed`) and serves it together with a same-origin REST API bound to `127.0.0.1`, with **zero network egress** and no sensitive data ever written to disk. This document is the authoritative specification; where a subsection is marked authoritative for a topic (e.g. §3 for the schema, §4 for the REST surface), that section wins on conflicts, and other sections carry harmonized recaps.

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

**Locked forks referenced throughout:** D1 (multiple named cheatsheets), D2 (single global variable value set; definitions modelled separately from values), D3 (debounced optimistic autosave), D4 (JSON import = full REPLACE with pre-import snapshot), D5 (server-minted ULIDs; Phases/Steps first-class rows; progression keyed by step ID), D6 (full CRUD for commands and references), D7 (no at-rest encryption — no sensitive data persisted), D8 (desktop-only strict layout). Q99 is the central OPSEC fork (exports raw by default; clipboard resolved).

---

## 1. Overview, Scope & Principles

### 1.1 Product Purpose

**Cheat** is a single-user, offline desktop web application that centralizes the operational knowledge of a penetration test into one workspace: reusable **commands**, step-by-step **methodologies**, external **references**, and the generation of target-scoped **cheatsheets**. Its defining feature is a set of **live variables** (`$IP`, `$LHOST`, `$LPORT`, `$USER`, `$DOMAIN`, `$PASS`, plus user-defined ones) that resolve identically everywhere a command is displayed — Bibliothèque, Méthodologie and Cheatsheet — so a value entered once propagates across the whole app.

The product ships as a **single self-contained binary**: a React + TypeScript SPA embedded (`go:embed`) into a Go/Gin/GORM/SQLite backend that serves both the UI and a same-origin REST API, bound to `127.0.0.1`. It is designed to run entirely on the operator's own machine with **zero network egress**.

### 1.2 Target User

- A single **OSCP candidate / professional pentester / red-teamer**, working locally on their own workstation during authorized engagements (proper scope and ROE assumed).
- Comfortable with a terminal, high information density, and keyboard-driven workflows.
- OPSEC-conscious: the tool holds real target IPs and credentials at runtime and must never leak them to disk or the network without an explicit, deliberate action.
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
| Methodology | **Méthodologie** | Multiple named roadmaps (create/rename/delete/duplicate) of phases → checkable steps, with global and per-phase progress and an optional linked command that unfolds in place. Fully editable in an explicit edit mode. Phases and Steps are first-class rows (D5). |
| References | **Références** | External-link library (title, auto-extracted domain, description, tags). Full CRUD (D6); URLs restricted to an `http/https/mailto` allowlist, sanitized on import and on render. |
| Cheatsheet | **Cheatsheet** | **Multiple named cheatsheets** (D1) with a tab bar (create/rename/delete). Each is an ordered composition of selected commands with per-entry notes, reorderable, exportable to Markdown and PDF. |

Cross-cutting in-scope capabilities:

- **Variables panel** — inline add/rename/delete of variable *definitions*; a single global *value* set (D2) shared by all modules.
- **Autosave** — debounced optimistic persistence (~500 ms) per mutated entity, background retry queue, error indicator only, no "Save" button (D3).
- **Import / Export** — full-dataset JSON export of user content (including variable *definitions*, excluding *values*) and JSON import as a full **REPLACE** with pre-import snapshot and confirmation (D4).
- **Per-cheatsheet export** — Markdown / PDF, emitting **raw `$TOKEN` by default** (Q99).
- **First-run seed** — 18 categories plus seeded commands, references, roadmaps, and one default empty cheatsheet (« Cheatsheet — HTB Lab »), all created as ordinary editable/deletable rows (seed is first-run-only; no re-seed on upgrade).
- **Dark / light theme** — `☀ / ☾` toggle; the accent green is re-tuned per theme for legibility.

### 1.5 Out of Scope (explicit)

The following are deliberately excluded from v1 and MUST NOT be implemented:

- **No command execution** — Cheat never runs, spawns, or shells out any command; it only stores, resolves, displays, and copies text.
- **No target connection** — no scanning, no network calls to targets, no live host interaction.
- **No cloud sync / multi-host** — no remote backend, no account server, no synchronization across machines. Portability is achieved solely through manual JSON import/export.
- **No user accounts / auth / multi-user** — single local user; no login, no sessions, no roles. (Loopback bind is the trust boundary; a token guards the opt-in LAN mode only.)
- **No network egress at all** — no telemetry, no CDN, no remote fonts (IBM Plex is self-hosted), no favicon fetching for references, no update checks. A strict CSP enforces this.
- **No at-rest encryption** — because no sensitive data is ever persisted (see §1.6), the SQLite database is stored in clear; there is no passphrase, no SQLCipher (D7).
- **No secret persistence** — variable **values** are memory-only; they are never written to SQLite, `localStorage`, or `IndexedDB`.
- **Deferred to v2 (not v1):** switchable value profiles per target, unknown-`$TOKEN` auto-detection, variable typing/validation, per-entry note overrides in cheatsheets, and a global cross-category tool view.

> **Open:** Repository license is not yet locked (proposed default: private/proprietary). Non-blocking for this section. (See §12.12.)

### 1.6 Core Design Principles

1. **Terminal density, not dashboard.** Right angles (0 border-radius), 1px borders, monospace for code/labels/badges, high information density, no superfluous ornamentation. The accent green dresses only active states, selections, and resolved variables.
2. **Variables are the single source of truth.** A value entered once resolves identically in every view. There is one global value set (D2). Definitions live in the DB; values live only in memory. A `$TOKEN` renders **green only when actually resolved**; a defined-but-empty or undefined token renders in a distinct "dangling/undefined" style (dimmed/dotted), never silently blanked.
3. **Zero context-switch.** Every methodology step unfolds its linked command in place — resolved variables plus copy button — so the operator never changes screen to see or copy the command behind a step.
4. **Dark & light theme.** `☀ / ☾` toggle; the accent green is recomputed per theme so it stays legible on both dark (`--bg #0b0c0f`) and light surfaces. Theme choice is a device-local preference (persisted locally, never on the server).
5. **Frictionless, optimistic persistence.** No explicit save. Mutations autosave debounced (~500 ms) and optimistically; the UI only surfaces an error indicator on failure (D3).
6. **OPSEC by default — nothing sensitive touches disk without intent.** Values are memory-only and reset on reload. File exports emit **raw `$TOKEN` by default**, with an opt-in per-export "resolve variables" toggle; the **clipboard stays resolved** (Copier / Copier tout) as an intentional local paste-to-terminal action (Q99). The DB persists only variable *definitions*, never their values (D7), which is why no at-rest encryption is required.
7. **Local-only, zero egress.** Bound to `127.0.0.1` by default (LAN is opt-in, with a warning + API token); same-origin API; self-hosted IBM Plex fonts; strict CSP; no telemetry.
8. **Desktop-only, strict layout.** A hard `min-width` (~1024–1280px); below it the page scrolls horizontally rather than reflowing. No tablet/mobile redesign in v1 (D8). Density and accent constants are fidelity-locked to the approved design and are not exposed as v1 settings.
9. **Stable identity, uniform editability.** All entities carry server-minted ULIDs; Phases and Steps are first-class rows with stable IDs and `position` (D5), so progression keyed by step ID never corrupts on reorder/delete. Seed rows are ordinary editable/deletable rows, not protected content.

### 1.7 Locked Architecture Recap

- **Frontend:** Vite + React + TypeScript SPA, faithful port of the approved visual system (IBM Plex, right angles, accent `#3ddc97`, dark/light).
- **Backend:** Go + Gin + GORM + SQLite, compiled to a **single binary** that embeds the built SPA via `go:embed` and serves a **same-origin** REST API bound to `127.0.0.1`.
- **IDs:** server-minted **ULIDs** for every entity; seed IDs preserved literally.
- **Persistence model:**
  - *Server (SQLite):* all user content (commands, references, categories, roadmaps, phases, steps, variable **definitions**), personal notes, progression (`done`/`expanded`), cheatsheet composition, and titles/targets.
  - *Device-local:* theme, last active view/roadmap/cheatsheet.
  - *In-memory only:* variable **values** (never persisted anywhere).
- **Sync:** debounced optimistic autosave with background retry (D3).
- **Import/Export:** JSON REPLACE with automatic pre-import snapshot, confirmation, atomic transaction, and a versioned envelope (D4); export excludes variable values.
- **Language:** UI, labels, and command examples in **French** (verbatim); all in-repo documentation in **English**.
- **Delivery:** single binary + Dockerfile + Makefile; pushed via gitea.

---

## 2. System Architecture

Cheat is a **single-user desktop web application** delivered as **one self-contained Go binary**. The binary embeds the compiled React/TypeScript SPA (via `go:embed`) and serves it, together with a same-origin REST API, from an HTTP server bound to the loopback interface. There are no external services, no CDN dependencies, and no network egress beyond user-initiated clicks on reference links. The design is governed by four locked decisions: **D7** (no at-rest encryption — no sensitive data is persisted), **D8** (desktop-only strict layout), **Q168** (loopback bind by default, LAN opt-in), and **Q174** (self-hosted IBM Plex fonts). Supporting security/deployment decisions (Q170–Q175, Q178–Q179, Q187, Q190–Q195) are reflected below and detailed in §12.

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
   │  (evergreen  │◄──────┼──►│  Gin HTTP server  ── bind 127.0.0.1:<port>  (LAN = opt-in flag)   │   │
   │  Chromium /  │ same- │   │      │                                                            │   │
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
- **Clipboard & print:** uses the async Clipboard API (works on `http://localhost` — a secure context) and `window.print()` for client-side PDF export. Relies on `color-mix`, `backdrop-filter`, Clipboard API and HTML5 DnD without polyfills (Q160).
- **No service worker / no PWA (Q192):** the server is already local; a plain served SPA covers offline use once fonts are embedded. A manifest may be added later; not in v1.

### 2.3 Backend (Go + Gin + GORM + SQLite)

- **HTTP framework:** Gin. One router with two concerns:
  1. **API routes** under the `/api` prefix — JSON in/out, ULID server-minted IDs, debounced optimistic autosave semantics (D3) handled per-entity.
  2. **Static/SPA fallback** — all other GET routes serve the embedded SPA (SPA history fallback: unknown non-`/api` paths return `index.html`).
- **ORM & storage:** GORM over **SQLite**, a **single database file** (default `cheat.db`). The DB path is **configurable via flag/env** (`--db` / `CHEAT_DB`) so each engagement can live in its own directory (Q187). No in-app multi-workspace switcher in v1.
- **SQLite driver:** a **pure-Go driver** (e.g. `modernc.org/sqlite`) is used — **no CGO** — to keep cross-compilation (Linux → Windows) trivial (Q190).
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
| **Server (SQLite via API)** | Content: commands, references, categories, roadmaps/phases/steps, **variable DEFINITIONS**; per-command notes; methodology progression (`done`) & panel state (`expanded`); cheatsheet composition + title/target | Durable (DB file) | Q112; **variable VALUES are excluded** |
| **Device-local (browser `localStorage`)** | UI-only prefs: theme, last active view / last active roadmap / last active cheatsheet | Durable, client-side, non-sensitive | Q112 — never holds sensitive data |
| **In-memory (SPA session only)** | **Variable VALUES** (`$IP`, `$LHOST`, `$PASS`, …) | **Never persisted** — cleared on every reload | D2 / structuring decision; single global value set |

Consequences that shape the architecture:

- Variable **definitions** round-trip through the API and JSON export; variable **values** never touch the DB, `localStorage`, IndexedDB, or the JSON export. Resolved (substituted) values are materialized **only** on two explicit local actions: copy-to-clipboard (resolved) and a per-export "resolve variables" opt-in (exports default to **raw `$TOKEN`s**).
- On reload, all resolved views revert to raw tokens until the user re-enters values for the session.

### 2.6 Security posture (high level)

The trust model is **single user, single machine, loopback**. Accounts, cloud sync and remote multi-node access are explicitly out of scope. Full detail in §12; the essentials:

**Network binding (Q168 — LOCKED)**
- Default bind: **`127.0.0.1`** (loopback only). Not reachable from the network.
- **LAN opt-in** via `--bind <addr>` (e.g. `0.0.0.0`): prints a **loud OPSEC warning**, and on any **non-loopback** bind the server **auto-enables a per-launch bearer token** (injected into the served SPA at serve time and required on all API calls) and a **self-signed TLS** listener so the browser retains a secure context (clipboard keeps working) (Q170, Q172). LAN mode is an explicit, documented risk.
- **Port (Q195):** default fixed uncommon port (overridable via `--port` / `CHEAT_PORT`). On a port clash, **fail loudly** with a clear message. The final localhost URL is printed at startup.
- **Launch UX (Q191):** foreground process printing its URL; optional `--open` flag opens the default browser. No background service / auto-start.

**Authentication (loopback case — per scope)**
- On the default loopback bind, isolation relies on OS process/user boundaries plus the request-origin defenses below and the per-launch token (§4.2). A token is mandatory when a non-loopback bind is enabled.

**CSRF / DNS-rebinding defenses (Q171 — applied on every request)**
- **Host header allowlist:** reject requests whose `Host` is not `127.0.0.1[:port]` / `localhost[:port]` (or the explicitly configured LAN host). This neutralizes DNS-rebinding.
- **Origin / `Sec-Fetch-*` checks + required custom header** on state-mutating methods (POST/PUT/PATCH/DELETE): reject cross-origin or forgeable "simple" requests that lack the expected same-origin `Origin`/custom header (and, in LAN mode, the launch token).

**Data at rest (D7 — LOCKED: NO encryption)**
- The DB stores **only variable DEFINITIONS, never their values**; resolved secrets (target IPs, `$PASS`, etc.) live in memory only and are never written to disk. Therefore **no sensitive data is persisted → no application-level encryption (no SQLCipher, no passphrase).** This supersedes the earlier Q169 SQLCipher recommendation.
- Residual free-text (notes, reference URLs) is the user's responsibility: the documented baseline is OS full-disk encryption plus `.gitignore` protection of the DB/exports (Q183). There is no lock/auto-lock and no passphrase lifecycle (Q184/Q186 N/A).

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

- **Desktop-only, strict.** A **hard minimum width (~1024–1280px)** is enforced; below it the app **scrolls horizontally** rather than reflowing. No mobile/tablet redesign in v1. This is an architectural constraint on the whole CSS surface: components assume the fixed three-region shell (53px top bar, 272px left sidebar, main content) and are not built to collapse responsively. (Full visual contract in §11.)

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
- **Timestamps (Q142, Q115).** Every content entity carries `createdAt` and `updatedAt` (`DATETIME`, stored ISO-8601 UTC via GORM `autoCreateTime`/`autoUpdateTime`). `updatedAt` is the last-write-wins discriminator for multi-tab concurrency (Q115). `createdAt` is the v1 ordering key for collections that are not user-reorderable.
- **`position` columns.** Integer (`INTEGER NOT NULL`), gap-friendly ordering within a parent scope. See §3.7 for exactly which collections are user-reorderable in v1 vs. reserved-for-forward-compat.
- **Tags (Q6).** `tags` is a JSON array of lowercase strings stored in a single `TEXT` column (GORM `serializer:json`), **not** a join table. Command tags and Reference tags share the same normalization rules but are stored independently per row. The tag filter scans commands only (Q6, Q42).
- **`desc` naming caveat.** `DESC` is a SQL keyword; map the Go field `Description` to column `description`. The **JSON/API and domain field name is `desc`** (used uniformly on the wire and in the export envelope).
- **SQLite pragmas (Q116).** Open with `journal_mode=WAL`, `busy_timeout=5000`, and **`foreign_keys=ON`** (required — the cascade rules below rely on FK enforcement). Writes are serialized (`max-open-conns=1` or a write mutex) under debounced autosave.
- **Migrations (Q119).** GORM `AutoMigrate` for additive changes; a `schema.version` row (see `Setting`) plus explicit ordered migrations for breaking changes, with an automatic pre-migration backup. Never destroy user data.

---

### 3.2 Entity catalog

#### 3.2.1 Category (Q3, Q4, Q11, Q17, Q135)

Single first-class table for **both** built-in and custom categories (Q4). All 18 built-ins are persisted rows (Q135), so an export is self-contained.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; built-ins keep literal keys (`infogathering`, `winpriv`, …) |
| `label` | TEXT | NOT NULL, **UNIQUE (case-insensitive)** | Q8: enforced via unique index on `lower(label)` |
| `color` | TEXT | NOT NULL | Hex `#rrggbb`. Default = next palette color round-robin; manual override allowed (Q11) |
| `isBuiltin` | BOOLEAN | NOT NULL, default `false` | Governance flag: built-ins are non-deletable, rename/recolor allowed (Q17) |
| `position` | INTEGER | NOT NULL | Curated display order; seeds occupy positions 0–17 (Q48) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- Custom-category default-color palette (Q11), assigned round-robin by creation order: `#22d3ee`, `#e879f9`, `#fb923c`, `#4ade80`, `#f43f5e`, `#818cf8`, `#eab308`, `#2dd4bf`.

#### 3.2.2 Command (Q5, Q6, Q9, Q10, Q14, Q102)

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; seed commands keep literal IDs (`n1`, `s1`, `f2`, …) |
| `categoryId` | TEXT | NOT NULL, FK → `categories.id` | `ON DELETE RESTRICT` at app layer (Q17); imported unknown key → "Autre" fallback (Q52) |
| `tool` | TEXT | NOT NULL, default `'Divers'` | Free-text column (Q5); trimmed, case-insensitive grouping, first-seen casing kept (Q46). No `tools` table |
| `title` | TEXT | NOT NULL | Required (Q9) |
| `template` | TEXT | NOT NULL | Multi-line command body; the only field variable substitution applies to (Q34) |
| `desc` | TEXT | NULL/`''` | Optional (Q9). Column `description`; wire name `desc` |
| `tags` | TEXT (JSON `[]string`) | NOT NULL, default `[]` | Lowercase, deduped, `#` stripped, no commas (Q47) |
| `language` | TEXT | NULL | Optional per-command fenced-code language hint for Markdown export (Q102); e.g. `powershell`. Null ⇒ bare fence (§9.6) |
| `position` | INTEGER | NOT NULL | Reserved; v1 library sort is alpha-by-title, created-at tiebreak (Q48) — see §3.7 |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **On delete (Q14) — allowed, with reference count in the confirm dialog:**
  1. Every `Step.commandId` pointing at it is set `NULL` (step text kept) — application step, not FK cascade.
  2. Every `CheatsheetEntry` referencing it is deleted (**FK `ON DELETE CASCADE`**).
  3. Its `Note` row (if any) is deleted (**FK `ON DELETE CASCADE`**).

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
| `position` | INTEGER | NOT NULL | **User-reorderable** (↑/↓ + DnD), midpoint insertion (Q71–Q73) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **On delete:** **FK `ON DELETE CASCADE`** → `steps` (toast undo per Q70).

#### 3.2.6 Step (Q2, Q7, Q19, Q113, Q58)

First-class row with stable ID (D5, Q2). The prototype's positional `checks`/`openSteps` keying is abolished; **both completion (`done`) and panel state (`expanded`) live on the step row**, keyed by stable step ID.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; stable — fixes the check-resurrection bug (Q2, Q19) |
| `phaseId` | TEXT | NOT NULL, FK → `phases.id` | `ON DELETE CASCADE`. Cross-phase move = reassign `phaseId` + `position` (Q58) |
| `text` | TEXT | NOT NULL | Inline-editable in edit mode (Q59) |
| `commandId` | TEXT | **NULLABLE**, FK → `commands.id` | Renamed from prototype `note`; explicit 0..1 link (Q7). `ON DELETE SET NULL` (Q14) |
| `done` | BOOLEAN | NOT NULL, default `false` | Persisted progression (`checks{}` in the prototype), keyed by stable step ID (Q113, D5) |
| `expanded` | BOOLEAN | NOT NULL, default `false` | Persisted linked-command panel open/closed state (`openSteps{}` in the prototype). Persisted per decisions-log Q112 (see the §4.5 Open item) |
| `position` | INTEGER | NOT NULL | **User-reorderable** intra- and cross-phase (Q58, Q71–Q73) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- A per-step free note is **out of scope v1** (Q65).

#### 3.2.7 Variable (definition) (D2, D7, Q20, Q22, Q24, Q25, Q29)

**Definitions only. VALUES ARE NEVER PERSISTED (D2, D7) — see §3.10 and §5.** This table stores the ordered set of variable *definitions*; the single global value set lives in browser memory only.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK | ULID; the 6 built-ins may keep literal keys equal to their name |
| `name` | TEXT | NOT NULL, **UNIQUE (case-insensitive)** | Bare name, no `$`. Grammar `[A-Z_][A-Z0-9_]*`, auto-uppercased, ≥1 letter, cap ~24 chars; the 6 standard names are reserved for custom (Q22, Q24) |
| `type` | TEXT | NOT NULL, default `'text'` | Reserved for future soft validation; all free-text in v1 (Q29) |
| `isBuiltin` | BOOLEAN | NOT NULL, default `false` | The 6 standard vars: value-editable only, non-rename/non-delete, fixed at top (Q25) |
| `sensitive` | BOOLEAN | NOT NULL, default `false` | Masks the value input AND excludes the value from export metadata (`$PASS` etc.) (Q100, Q176) |
| `hidden` | BOOLEAN | NOT NULL, default `false` | Row visibility flag — hides an (unused) variable row in the panel (Q25 "masquables"). Distinct from `sensitive` (value masking) |
| `position` | INTEGER | NOT NULL | Built-ins at fixed top positions; custom appended in creation order (Q25) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- **Canonical seed order (D5 recap, Q25) — positions 0–5:** `IP`, `LHOST`, `LPORT`, `USER`, `DOMAIN`, `PASS`. (This follows §4/§5; the prototype `varMeta` order `…USER, PASS, DOMAIN` is superseded.) All 6 seed with `isBuiltin=true`, `sensitive=true` for `PASS` only.
- **Rename (Q27):** a variable rename triggers an application-layer, single-transaction cascade rewrite of `$OLDNAME`→`$NEWNAME` across all `Command.template` values; the count of updated commands is shown. Not a DB-level cascade.
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
| `note` | TEXT | NULL | **Reserved for v2 per-entry note override; NOT written in v1** (Q95). v1 displays the shared per-command `Note` (§3.2.10) |
| `position` | INTEGER | NOT NULL | **User-reorderable** flat order via ↑/↓ (Q98) |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- Recommended composite unique index on `(cheatsheetId, commandId)` to prevent adding the same command twice to one sheet.

#### 3.2.10 Note (per-command) (Q95, Q97, Q14)

Single personal note per command, shared everywhere it appears (library card + cheatsheet entry) in v1 (Q95). Stored as a separate map keyed by command ID (Q97), **not** a column on Command.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| `commandId` | TEXT | **PK**, FK → `commands.id` | Natural key = command ID; 1:1 with Command. `ON DELETE CASCADE` (Q14) |
| `text` | TEXT | NOT NULL | The note body |
| `createdAt` / `updatedAt` | DATETIME | NOT NULL | |

- Deliberate exception to the ULID-PK convention: the note's identity **is** its command ID (Q97 "map keyed by id"). Serialized in the JSON export as a map `{ commandId: text }`; orphans purged on command delete (Q14).

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
| `schema.version` | integer | Migration tracking (Q119) |
| `seed.version` | integer | Seed pack version for display; bumped when a new seed pack is shipped (Q133) |
| `db.initialized` | boolean | First-run marker gating one-time seeding (Q133) |

---

### 3.3 The 18 built-in categories (verbatim from the design — canonical)

Seeded always, positions 0–17 in this exact order (Q3). Hidden in the sidebar when they contain zero commands (display rule only); always listed in the add-command form (Q3). All rows `isBuiltin=true`.

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

`utilities` doubles as the reassignment fallback target when a custom category is deleted (Q17).

---

### 3.4 Relationship & cascade matrix

| Parent → Child | FK column | On parent delete | Decision |
|---|---|---|---|
| Category → Command | `commands.categoryId` | **RESTRICT** (block if non-empty; offer reassign to `utilities`; built-ins never deletable) | Q17 |
| Command → Step (link) | `steps.commandId` (nullable) | **SET NULL** (keep step text) | Q7, Q14 |
| Command → CheatsheetEntry | `cheatsheet_entries.commandId` | **CASCADE** | Q14 |
| Command → Note | `notes.commandId` | **CASCADE** | Q14 |
| Roadmap → Phase | `phases.roadmapId` | **CASCADE** | Q19 |
| Phase → Step | `steps.phaseId` | **CASCADE** | Q19 |
| Cheatsheet → CheatsheetEntry | `cheatsheet_entries.cheatsheetId` | **CASCADE** | Q19 |

- Deleting a Roadmap cascades Phase→Step; all `Step.done`/`Step.expanded` state disappears with the rows (no separate checks table to garbage-collect) — this is the structural fix for the prototype's resurrection bug (Q19, D5).
- Variable rename/delete are **application-layer** operations (template rewrite / warn-and-allow), not FK relationships (Q27, Q28).

---

### 3.5 Uniqueness & validation constraints (Q8, Q24, Q80)

| Entity | Constraint | Enforcement |
|---|---|---|
| Category | `label` unique, case-insensitive | DB unique index on `lower(label)` (Q8) |
| Variable | `name` unique, case-insensitive; reserved 6 standard names; grammar `[A-Z_][A-Z0-9_]*`; ≥1 letter; ≤~24 chars | DB unique index on `lower(name)` + app validation (Q22, Q24) |
| CheatsheetEntry | `(cheatsheetId, commandId)` unique | DB composite unique index (recommended) |
| Reference | normalized-URL duplicate blocked | App-layer validation, not a DB constraint (Q80) |
| Command | title/template required; `(tool, title, template)` exact duplicate **warned, not blocked** | App-layer (Q9, Q54) |
| Roadmap | duplicate label warned, not blocked | App-layer (Q75) |

All other labels/titles/URLs may duplicate freely (Q8).

---

### 3.6 Required vs optional fields (Q9)

- **Command:** `title`, `template`, `categoryId`, `tool` NOT NULL (`tool` defaults `'Divers'`); `desc`, `tags`, `language` optional (empty/null defaults). `template` is multi-line TEXT.
- **Reference:** `title`, `url` NOT NULL; `desc`, `tags` optional.
- All `tags` columns default to `[]`, never NULL.

---

### 3.7 Ordering & `position` semantics (Q10, Q48, Q68)

| Collection | v1 behavior | `position` role |
|---|---|---|
| Phases (within roadmap) | User-reorderable (↑/↓ + DnD, midpoint insert) | Authoritative |
| Steps (within phase) | User-reorderable, incl. cross-phase | Authoritative |
| Cheatsheet entries | User-reorderable, flat ↑/↓ | Authoritative |
| Categories | Curated seed order (built-ins 0–17); custom appended; manual reorder deferred | Used for display order |
| Commands (within tool) | Sorted alpha by title, created-at tiebreak | Reserved column, unused for sort in v1 |
| Roadmaps / Cheatsheets (tabs) | Creation order | Reserved column (enables future reorder without migration, Q68) |
| References | Creation order (`createdAt`) | No column (Q10) |

Reorders are persisted **once at drop / per ↑/↓ click**, as a single entity update, never on transient `dragover` (Q117).

---

### 3.8 Seed governance (Q18, Q133, D5)

- **First-run only (Q133).** Seeding runs in Go at startup **only when `db.initialized` is false / DB empty**. There is no automatic re-seed on binary upgrade. Deleted seed rows stay deleted (no tombstones, no resurrection).
- **Seed rows are ordinary rows (Q18).** All seed content (18 categories, seed commands, 6 references, 4 roadmaps with phases/steps, 6 variable definitions, and one default cheatsheet — empty, titled « Cheatsheet — HTB Lab », with an empty `target`) is inserted as fully editable/deletable rows with the same cascade rules and is exported like any row.
- **Literal seed IDs (D5).** Seed rows use their literal short IDs; `Step.commandId` references (`n1`, `s1`, …) are valid because those exact command IDs are seeded.
- **Governance flags.** `Category.isBuiltin` and `Variable.isBuiltin` mark protected definitions (non-deletable; rename/recolor allowed for categories, value-edit only for the 6 standard vars). There is no generic per-row "is_seed" flag beyond these.
- **Updated seed content** ships as an optional importable "seed pack" (never auto-applied); `seed.version` is tracked for display (Q133). See §10.5.

---

### 3.9 Notes model recap (Q95, Q97)

Two distinct note concepts, both modeled:

1. **`Note` (per-command, §3.2.10)** — the single shared personal note, authoritative in v1, keyed by command ID, editable from both the library card and the cheatsheet entry (same store, Q96), included in export.
2. **`CheatsheetEntry.note` (§3.2.9)** — reserved column for a future **per-entry override**; **null and unused in v1** (Q95 "override per entry deferred to v2").

---

### 3.10 What is NOT in the database (D2, D7, Q112)

Explicit non-persistence guarantees — critical for the OPSEC posture (no sensitive data at rest ⇒ no encryption, D7):

- **Variable VALUES — memory only (D2, D7).** The single global value set is held in browser memory, reset on every reload; never written to SQLite, never to localStorage/IndexedDB. Only variable *definitions* (§3.2.7) are persisted. JSON export never contains values; only an explicit cheatsheet export can materialize resolved values (and defaults to raw tokens per Q99).
- **Device-local (localStorage), not DB (Q112):** theme; default/last view; last active roadmap and cheatsheet. Never contains vars/notes/commands.
- **Ephemeral UI (in-memory, not persisted anywhere, Q112):** drag state, modal/draft form state, search query, active filters (category/tool/tag), toast, selection-in-progress, and the library sidebar accordion (`expanded{}`) tree state. (Note: the *methodology step* `expanded` column IS persisted per §3.2.6; the *library sidebar* accordion state is not.)

Persisted-to-DB content (recap, Q112): categories, commands, references, roadmaps, phases, steps, variable **definitions**, per-command notes, per-step `done`/`expanded` state, cheatsheet composition (entries + order + title/target), and `Setting` metadata.

---

## 4. REST API

The backend is a single Go/Gin binary that embeds the SPA (`go:embed`) and serves it **same-origin** on `127.0.0.1` (loopback) by default (Q168). All application data is exchanged over the JSON REST surface below. The SPA hydrates once with `GET /api/state`, then issues per-entity mutations that are persisted through the debounced optimistic autosave engine (D3). SQLite is authoritative; JSON import/export runs server-side (Q132). This section is **authoritative for the REST surface**; module sections (§6–§9) carry harmonized recaps.

> **Hard invariant — variable VALUES never cross this API.** Per D2, D7 and the memory-only decision, only variable *definitions* are persisted and transmitted. No endpoint accepts, returns, or stores a variable value. The dataset export (`GET /api/export`) never contains values. Resolution of `$TOKEN` into concrete values happens only in the SPA (in-memory) and in client-side clipboard/MD/PDF actions.

### 4.1 Conventions

| Aspect | Rule |
|---|---|
| Base path | `/api` (all resources below are relative to it). |
| Transport | HTTP/1.1 over loopback. HTTPS only when `--bind` targets a non-loopback interface (Q172, §12.2). |
| Media type | Requests and responses are `application/json; charset=utf-8`, except `GET /api/export` (attachment download) and the optional raw-DB download (§10.4.3). |
| Character encoding | UTF-8 everywhere; server normalizes stored text to LF (Q103). |
| IDs | ULID strings, **server-minted** for every entity (D5). Clients never author canonical IDs. Seed rows keep their literal seed IDs. IDs are opaque 26-char Crockford base32 strings. |
| Timestamps | ISO 8601 UTC (`2026-07-15T12:34:56Z`) on the wire and in DB columns (Q142). `createdAt` immutable; `updatedAt` server-set on every write. |
| Field casing | JSON uses `camelCase`. The `desc` field name is used uniformly (never `description`) on the wire. |
| PATCH semantics | JSON Merge Patch: only present keys are updated; omitted keys are unchanged. Array fields (e.g. `tags`) are **replaced wholesale**, not merged. `null` explicitly clears a nullable field. |
| Concurrency | Last-write-wins per entity (Q115); no `If-Match`/version precondition. `updatedAt` is returned so the SPA can do lightweight focus/cross-tab refresh. |
| Idempotency | `DELETE` is idempotent: deleting an absent row returns `204` (retry-safe under the autosave retry queue). |
| Pagination | None. Datasets target ~2000 commands (Q189); `GET /api/state` returns everything. |
| Version handshake | The server exposes its embedded build version so a stale cached SPA can detect a mismatch (Q122). Exposed in `meta.appVersion` (state) and the `X-Cheat-Version` response header. |

### 4.2 Transport security & request admission (Q168, Q170, Q171, Q179, Q180)

Every request passes an admission middleware chain **before** routing. Rejections short-circuit with a JSON error envelope and never reach a handler.

1. **Host allowlist** — the `Host` header must match the served bind (`127.0.0.1:<port>`, `localhost:<port>`, or the explicitly configured `--bind` host). Any other value → `403 FORBIDDEN_HOST`. This defeats DNS-rebinding (a rebound hostname will not match the allowlist).
2. **Origin/anti-CSRF on mutating verbs** — for `POST`/`PATCH`/`PUT`/`DELETE`, the request must EITHER carry an `Origin` header equal to the served origin, OR (for same-origin `fetch`, which omits `Origin` on some verbs) satisfy the custom-header check below. Cross-origin `Origin` → `403 FORBIDDEN_ORIGIN`.
3. **Launch-token / custom header** — all `/api` calls must send `X-Cheat-Token: <launch token>`. The token is minted per process launch and injected into the embedded SPA at serve time (details in §12.2). A missing/incorrect token → `403 FORBIDDEN_TOKEN`. Because it is a non-simple header, a cross-origin browser form/`<img>`/simple request cannot forge it, so this doubles as the anti-CSRF custom-header requirement (Q171). On loopback the token is still required (defense against other local processes / other browser origins); on non-loopback binds it is mandatory.
4. **Security response headers** (Q179) set on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`, and a restrictive `Permissions-Policy`. The strict self-only CSP (Q173) is emitted on the SPA document response (§12.4).

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
| `400 Bad Request` | Malformed JSON, wrong types, missing required fields, grammar/format violations (incl. URL parse/scheme). | `INVALID_JSON`, `VALIDATION_FAILED` |
| `403 Forbidden` | Admission chain rejection. | `FORBIDDEN_HOST`, `FORBIDDEN_ORIGIN`, `FORBIDDEN_TOKEN` |
| `404 Not Found` | Unknown route or referenced parent/entity absent (except idempotent DELETE). | `NOT_FOUND` |
| `409 Conflict` | Uniqueness / integrity violation. | `DUPLICATE_CATEGORY_LABEL`, `DUPLICATE_VARIABLE_NAME`, `DUPLICATE_REFERENCE_URL`, `CATEGORY_NOT_EMPTY`, `BUILTIN_NOT_DELETABLE`, `RESERVED_VARIABLE_NAME` |
| `413 Payload Too Large` | Import body exceeds the configured size cap. | `IMPORT_TOO_LARGE` |
| `415 Unsupported Media Type` | Non-JSON body on a JSON endpoint. | `UNSUPPORTED_MEDIA_TYPE` |
| `422 Unprocessable Entity` | Well-formed but semantically invalid import (bad envelope, incompatible version, dangling internal refs that could not be repaired). | `IMPORT_SCHEMA_INVALID`, `IMPORT_VERSION_TOO_NEW` |
| `500 Internal Server Error` | Unexpected server/DB failure (transaction rolled back). | `INTERNAL` |

### 4.4 Autosave & write semantics (D3, D5, Q111–Q117, Q121)

The SPA is optimistic and driven by a per-entity autosave engine. There is **no "Save" button** and only an **error-only** persistence indicator (D3): the UI shows nothing on the happy path and surfaces a persistent inline banner only when a write ultimately fails (Q196 messaging tiers, §11.6).

**Write categories and timing**

- **Field edits (`PATCH`)** are debounced ~500 ms **per entity** (D3/Q111). Multiple edits to the same entity within the window coalesce into a single `PATCH` carrying the latest values of the changed fields. Different entities have independent timers and flush in parallel.
- **Creates (`POST`)** and **deletes (`DELETE`)** are sent **immediately** (not debounced) so canonical ULIDs are obtained promptly and cascades run without lag.
- **Reorders** are persisted exactly once, **on drop / on ↑↓ click**, as a single reorder call — never on transient `dragover`/`dropIndex` changes (Q117).
- **Modal-based create/edit** (commands §6, references §8) commit on modal submit and surface validation errors inline, rather than fire-and-forget debounced autosave, because they can fail validation.

**Optimistic create & temp-ID reconciliation (D5)**

Because IDs are server-minted, an optimistic create uses a client-local temporary id (`tmp_<nanoid>`), then reconciles:
1. SPA inserts the entity locally with a `tmp_` id and issues `POST`.
2. On `201`, the SPA replaces every local occurrence of the `tmp_` id (including references such as `commandId` on a step, or `commandId` on a cheatsheet entry) with the returned ULID.
3. **Dependency ordering:** a child that references a not-yet-persisted parent (e.g., a step created inside a brand-new phase) is held in the write queue until the parent's `POST` resolves and its real id is known. `tmp_` ids are never sent to the server.

**Optimism, failure, and retry (Q114, Q121)**

- UI updates apply immediately; there is no rollback for single-user local use (Q114).
- Failed writes enter a **background retry queue with exponential backoff**. On success the error indicator clears; on repeated failure the persistent error banner is shown.
- The retry queue is **in-memory only**. Per Q112, command/note/variable content must never touch `localStorage`/`IndexedDB`, so the queue is *not* persisted to browser storage (reconciles Q114's "retry queue" with Q112's storage prohibition — see §4 invariant and §10.2.2).
- **Flush on exit (Q121):** the SPA flushes all pending debounced/queued writes synchronously on `visibilitychange`→hidden and `beforeunload`. Server-side, the process drains in-flight writes on `SIGINT`/`SIGTERM` before exit, so a normal close never loses the last edit.

**Concurrency (Q115, Q116)**

- Multiple tabs against the one local binary use **last-write-wins per entity**; the server serializes SQLite writes (WAL + `busy_timeout`, single writer — Q116) so no `SQLITE_BUSY` surfaces to the client. `updatedAt` is returned on every write; the SPA refreshes on window focus and (optionally) via a cross-tab channel.

### 4.5 `GET /api/state` — full hydration

Returns the entire persisted dataset in one document. Called once on load; the DB is seeded in Go at startup if empty (Q118, Q133). **Contains no variable values.** All module reads are served from this single hydration payload; module-scoped collection GETs, where mentioned in §5–§8, are granular conveniences over the same data.

`200 OK`

```json
{
  "meta": {
    "schemaVersion": 7,
    "seedVersion": 3,
    "appVersion": "1.0.0",
    "generatedAt": "2026-07-15T12:34:56Z"
  },
  "categories": [ /* Category[] */ ],
  "commands": [ /* Command[] */ ],
  "references": [ /* Reference[] */ ],
  "roadmaps": [ /* Roadmap[] with nested phases[].steps[] */ ],
  "cheatsheets": [ /* Cheatsheet[] with nested entries[] */ ],
  "variableDefinitions": [ /* VariableDefinition[] — definitions only */ ],
  "notes": { "<commandId>": "note libre…" },
  "settings": { /* server-persisted app settings, see §4.8 */ }
}
```

Ordering in the payload:
- `categories` by `position`; `commands`/`references`/`roadmaps` by `createdAt` (Q10). `phases`, `steps`, and cheatsheet `entries` by `position`.
- `notes` is a map keyed by command id (Q95/Q97; per-entry note override deferred to v2 — the v1 note is a single per-command note).
- Device-local UI prefs (theme, last view, active roadmap/cheatsheet) are **not** in this payload — they live in `localStorage` (Q112).

> **Open:** the decisions log (Q112, line 82) places `openSteps` (which methodology step accordions are expanded) in the backend-persisted tier, while the original questionnaire reco (Q113) had marked it ephemeral. This spec **persists** it as the `step.expanded` column (§3.2.6, §10.1) and carries it on the API (§4.6 step shape, §4.6.6 PATCH). Confirm before implementation if `expanded` should instead be ephemeral UI state not carried by the API. (Independently, the *library sidebar* accordion state remains ephemeral — §3.10.)

### 4.6 Entity resource reference

Entity JSON shapes (response bodies). All timestamps ISO 8601 UTC.

**Category** (Q3, Q4, Q11, Q17)
```json
{ "id": "01J…", "label": "Énumération", "color": "#3ddc97", "isBuiltin": true, "position": 0 }
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
          "done": false, "expanded": false, "position": 0 }
      ] } ] }
```
`step.commandId` is a nullable 0..1 FK (Q7). `step.done` is the persisted per-step completion boolean (Q113); `step.expanded` is the persisted linked-command panel state (§3.2.6). Steps carry no free note field in v1 (Q65 deferred).

**Cheatsheet → Entry** (D1, Q89, Q92, Q93)
```json
{ "id": "01J…", "title": "Machine — Alpha", "target": "10.10.10.5",
  "position": 0, "createdAt": "…", "updatedAt": "…",
  "entries": [ { "id": "01J…", "commandId": "01J…", "position": 0 } ] }
```
A cheatsheet entry is a live reference to a command by id + position (Q93); a command appears at most once per sheet. Entry-level notes are deferred to v2 (Q95).

**VariableDefinition** (D2, Q20, Q22–Q25, Q176)
```json
{ "id": "01J…", "name": "LPORT", "type": "text", "sensitive": false,
  "isBuiltin": true, "hidden": false, "position": 2 }
```
`name` is stored **bare** (no `$`), uppercase (Q22/Q23). `type` is reserved and always `"text"` in v1 (Q29). `sensitive` defaults true for `PASS` (Q176). `hidden` toggles row visibility (Q25). There is **no `value` field** and no value endpoint (memory-only). The six standard definitions seed in the canonical order `IP, LHOST, LPORT, USER, DOMAIN, PASS` (Q25) at positions 0–5.

---

#### 4.6.1 Categories

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/categories` | Create a custom category. |
| `PATCH` | `/api/categories/{id}` | Rename / recolor / reposition. |
| `DELETE` | `/api/categories/{id}` | Delete a custom, empty category. |

- **Create body:** `{ "label": "…", "color"?: "#RRGGBB" }`. `label` required, **unique case-insensitively** across all categories → `409 DUPLICATE_CATEGORY_LABEL` (Q8). `color` optional; server assigns the next palette color if omitted (Q11). `isBuiltin=false`, appended at end `position` (Q11, Q17 manual reorder deferred).
- **Update body:** any of `label`, `color`, `position`. Builtins are renamable/recolorable but **not deletable** (Q17). Label uniqueness re-checked.
- **Delete:** blocked with `409 BUILTIN_NOT_DELETABLE` for builtins; blocked with `409 CATEGORY_NOT_EMPTY` if the category still has commands, unless `?reassignTo={categoryId}` is supplied — then all its commands move to the target category in the same transaction and the category is deleted (Q17, fallback = `utilities`). Success `204`.

#### 4.6.2 Commands (D6, Q12–Q14)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/commands` | Create a command. |
| `PATCH` | `/api/commands/{id}` | Edit any field (reuses the Add modal, Q12). |
| `DELETE` | `/api/commands/{id}` | Delete with cascade. |

- **Create body:** `{ "title", "template", "categoryId", "tool"?, "desc"?, "tags"?, "language"? }`. `title` and `template` are required (Q9). `tool` trimmed, defaults `"Divers"` (Q9, Q46). `categoryId` must reference an existing category (else `404`/`400`); if omitted, defaults to the info-gathering category (prototype default). `template` is multi-line TEXT. `tags` normalized (trim, strip leading `#`, lowercase, case-insensitive dedup — Q47).
- **Delete cascade (Q14, Q19):** in one transaction — (a) null `commandId` on any referencing step (keep the step text, flag it as unlinked in the UI, Q63); (b) delete every cheatsheet entry referencing it (FK cascade, Q14); (c) delete its orphan note from the notes store (Q14/Q97). Response `204`; the SPA already knows the reference count from local state (destructive confirmation is client-side, Q13).

#### 4.6.3 References (D6, Q15, Q16, Q77–Q80, Q87)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/references` | Create a reference. |
| `PATCH` | `/api/references/{id}` | Edit any field (full mutable set sent from the modal). |
| `DELETE` | `/api/references/{id}` | Delete (client shows immediate ✕ + undo toast, Q16). |

- **Create/Update body:** `{ "url", "title"?, "desc"?, "tags"? }`. `url` required. The server auto-prefixes a missing scheme with `https://`, then **parses**; unparseable → `400 VALIDATION_FAILED` (Q77). Scheme must be in the allowlist `http`/`https`/`mailto` → otherwise `400` (Q78). URL is normalized (lowercase scheme+host, strip fragment; path/query verbatim — Q79). If `title` is empty it defaults to the extracted domain (Q87). Duplicate on **normalized URL** → `409 DUPLICATE_REFERENCE_URL` (Q80). Full pipeline in §8.3.
- Delete is a hard delete; undo is a client-side deferred send (§8.9).

#### 4.6.4 Roadmaps (Q57, Q66, Q67, Q70, Q75)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/roadmaps` | Create an (empty) roadmap. |
| `PATCH` | `/api/roadmaps/{id}` | Rename / reposition. |
| `DELETE` | `/api/roadmaps/{id}` | Delete roadmap + cascade phases/steps. |
| `POST` | `/api/roadmaps/{id}/duplicate` | Deep-clone with fresh IDs, progress reset (Q66). |
| `POST` | `/api/roadmaps/{id}/reset-progress` | Clear `done`/`expanded` on all its steps (Q57). |
| `POST` | `/api/roadmaps/restore-defaults` | Re-add missing default roadmaps (Q67). |

- **Create body:** `{ "label" }`, required non-empty. Duplicate names are allowed; the SPA warns without blocking (Q75). `position` appended.
- **Delete:** cascades to phases → steps (and their `done`/`expanded` state) in one transaction (Q19). Destructive confirmation is client-side (Q70).
- **Duplicate:** clones roadmap + phases + steps with new server-minted ULIDs, preserving structure/order and `commandId` links, with all `done=false`/`expanded=false` (Q66). Returns the new roadmap (nested).
- **Reset-progress:** sets `done=false` and `expanded=false` for every step under the roadmap; returns the updated roadmap. This is "Réinitialiser la progression" (Q57), confirmed client-side.
- **Restore-defaults:** re-inserts only the default roadmaps that are currently absent (never resurrecting user-deleted seed rows beyond this explicit action, and never duplicating existing ones) (Q67, Q133). Returns the created roadmaps.

#### 4.6.5 Phases (Q10, Q58, Q70)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/roadmaps/{roadmapId}/phases` | Create a phase in the roadmap. |
| `PATCH` | `/api/phases/{phaseId}` | Rename / reposition. |
| `DELETE` | `/api/phases/{phaseId}` | Delete phase + its steps (cascade). |
| `POST` | `/api/roadmaps/{roadmapId}/phases/reorder` | Reorder phases (§4.7). |

- **Create body:** `{ "label" }`, required non-empty. Appended `position`. Duplicate phase labels allowed (Q75).
- **Delete:** cascades to its steps and their `done`/`expanded` state (Q19). Client offers toast-undo (Q70).

#### 4.6.6 Steps (Q7, Q58, Q59, Q60, Q113)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/phases/{phaseId}/steps` | Create a step in the phase. |
| `PATCH` | `/api/steps/{stepId}` | Edit text / link / completion / panel / move phase. |
| `DELETE` | `/api/steps/{stepId}` | Delete step + dependent state (cascade). |
| `POST` | `/api/phases/{phaseId}/steps/reorder` | Reorder / receive steps (§4.7, cross-phase). |

- **Create body:** `{ "text", "commandId"? }`. `text` required non-empty. Appended `position`.
- **Update body:** any of `text` (inline edit, Q59), `commandId` (change/add/remove link — `null` clears it, Q60), `done` (completion toggle — the debounced autosave persists this per-step boolean, Q113), `expanded` (linked-command panel toggle — persisted per §3.2.6/§4.5), `phaseId` (single-step cross-phase move, Q58) and `position`. When `phaseId` changes, the step is renumbered into the target phase and both phases are compacted in one transaction.
- **Delete:** removes the step; because completion lives on the step row and is keyed by stable step ID, no positional-check resurrection bug can occur (Q19/Q129).

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
| `POST` | `/api/cheatsheets/{sheetId}/entries` | Add a command to the active sheet. |
| `DELETE` | `/api/cheatsheets/{sheetId}/entries/{entryId}` | Remove an entry. |
| `POST` | `/api/cheatsheets/{sheetId}/entries/reorder` | Reorder entries (§4.7). |

- **Create body:** `{ "commandId" }`. Adds to the addressed (active) sheet (Q91). If the command is already present on that sheet, the server is idempotent and returns the existing entry (`200`) rather than duplicating (Q93). Appended `position`.
- **Delete:** removes the entry only; the underlying command is untouched.

#### 4.6.9 Variable definitions (D2, Q20, Q22–Q28)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/variables` | Create a custom variable definition. |
| `PATCH` | `/api/variables/{id}` | Rename / toggle sensitive / hide / reposition. |
| `DELETE` | `/api/variables/{id}` | Delete a custom variable definition. |

> **Definitions only.** No endpoint carries a value. Deleting/renaming never transmits values. Values are held in SPA memory and cleared on reload.

- **Create body:** `{ "name", "sensitive"? }`. `name` is validated against grammar `^[A-Z_][A-Z0-9_]*$` after auto-uppercasing, stored bare (Q22/Q23); must be **unique case-insensitively**, ≥1 letter, ≤24 chars (Q24) → `409 DUPLICATE_VARIABLE_NAME` / `400 VALIDATION_FAILED`. Must not collide with a standard variable name → `409 RESERVED_VARIABLE_NAME` (Q24). `isBuiltin=false`, appended at end.
- **Update (rename) cascade (Q27):** renaming a variable rewrites `$OLDNAME` → `$NEWNAME` across **all command templates** in a single transaction. The response reports how many commands were rewritten:
  ```json
  { "variable": { /* VariableDefinition */ }, "rewrittenCommandCount": 7 }
  ```
  The SPA merges the rewritten templates (either from the response or by refetching affected commands). Standard variables are value-editable only — their `name`/deletion are rejected; `sensitive`/`hidden` toggles are allowed (Q25, Q176).
- **Delete (Q28):** allowed for custom variables even when still referenced; dangling `$TOKEN`s remain literal in templates and render in the distinct "undefined/dangling" style (Q31). The reference count for the client's warning is computed client-side. Standard variables are not deletable → `409` (they are hideable via `hidden`, Q25).

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
| `POST` | `/api/phases/{phaseId}/steps/reorder` | `{ "orderedIds": ["…"] }` | Sets the phase's step list to exactly `orderedIds`. Any listed step currently belonging to another phase is **moved** here (`phaseId` reassigned) and compacted out of its previous phase in the same transaction — this is how cross-phase DnD (Q58) is committed. |
| `POST` | `/api/cheatsheets/{sheetId}/entries/reorder` | `{ "orderedIds": ["…"] }` | Reassigns entry `position` (flat ↑↓ order, Q98). |

Response `200` returns the affected parent with its children in the new order. Roadmap-tab and cheatsheet-tab reordering are not exposed in v1 (position columns exist for later; parallels Q68).

### 4.8 Settings (Q112, Q124)

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/settings` | Upsert server-persisted app settings. |

Server settings hold **non-device, non-sensitive** application configuration only. Per Q112, all device/UI preferences (theme, last view, active roadmap/cheatsheet) live in `localStorage` and are **not** sent here; per Q99/Q101, export-behavior toggles are per-export choices, not stored settings. The current settings object and read-only metadata are returned inside `GET /api/state` (`settings` and `meta`). `meta` (`schemaVersion`, `seedVersion`, `appVersion`) is read-only and cannot be set via `PUT`. Settings are **excluded** from the dataset export (Q124).

- **Body:** a partial settings object; server validates keys against a bounded allowlist and rejects unknown keys → `400`. Returns the merged settings.

> **Open:** No user-writable server-persisted setting was locked for v1 (device/UI prefs are `localStorage`; export options are per-action). The endpoint and validation are specified for forward-compatibility, but its writable key set is empty until a preference is explicitly designated server-scoped.

### 4.9 `GET /api/export` — dataset export (D4, Q124, Q128, Q132, Q142)

Streams the full user dataset as a versioned JSON envelope, server-side (Q132), as a downloadable attachment (`Content-Disposition: attachment; filename="cheat-export-<YYYYMMDD-HHmmss>.json"`). The complete envelope shape (including `schemaVersion`/`seedVersion`) is authoritative in §10.4.1.

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
    "roadmaps": [ /* nested phases[].steps[] incl. step.done/expanded (Q129) */ ],
    "cheatsheets": [ /* nested entries[] (Q92) */ ],
    "variableDefinitions": [ /* definitions ONLY — no values (D2/D7) */ ],
    "notes": { "<commandId>": "…" }
  }
}
```

- **Included:** all durable content + user state — commands, references, all categories (builtin + custom, self-contained per Q135), roadmaps/phases/steps with `done`/`expanded`, cheatsheets with entries + title/target, variable **definitions**, and the per-command notes map (Q124).
- **Excluded (never written):** variable **values** (memory-only, D2/D7), ephemeral view state (filters, drafts), and device/UI prefs (theme/settings) (Q124).
- IDs are preserved verbatim to guarantee round-trip fidelity on REPLACE (Q127/Q139).
- Progression is keyed by stable IDs (`step.done`/`step.expanded` embedded per step), so it survives structural edits between export and import (Q129).
- Timestamps ISO 8601 UTC (Q142).

> **Note — raw tokens vs resolved values.** The Q99 rule (exports emit RAW `$TOKEN`s by default; clipboard stays resolved) applies to the **client-side cheatsheet Markdown/PDF** artifacts (Q106/Q132), not to `GET /api/export` — the JSON dataset stores raw templates and contains no values by definition, so there is nothing to resolve here.

### 4.10 `POST /api/import` — dataset import (D4, Q125–Q131, Q135, Q136)

Applies a JSON envelope server-side inside one transaction and returns a summary. Full REPLACE/MERGE flow detail in §10.4.5–§10.4.6.

- **Query:** `mode=replace` (default) or `mode=merge` (distinct, explicitly labeled action — Q125).
- **Body:** the export envelope (`{ formatVersion, appVersion?, exportedAt?, data }`), `application/json`. Bodies over the configured cap → `413 IMPORT_TOO_LARGE` (limit exists per Q131; default ~32 MiB, tunable via config — not a locked figure).

**Validation & safety pipeline (Q128, Q130, Q131):**
1. Parse and validate the envelope. `formatVersion` newer than the binary → `422 IMPORT_VERSION_TOO_NEW` (clear message). Older versions are forward-migrated (Q128).
2. Strict structural/schema validation (types, required fields, count limits). Truly malformed/incompatible → `422 IMPORT_SCHEMA_INVALID`, nothing applied (Q131).
3. Sanitize all reference URLs against the `http`/`https`/`mailto` allowlist; neutralize/drop others (Q78/Q131).
4. Repair-and-warn for **dangling internal refs** in an otherwise-valid file: a `step.commandId` or a cheatsheet `entry.commandId` pointing to an absent command is nulled/dropped and reported, rather than rejecting the whole file (Q131).
5. **Automatic pre-import snapshot:** before mutating, the server writes a timestamped backup export of the current dataset to disk (Q130). Its path is returned in the summary.
6. Apply in a **single atomic transaction**; any error rolls back entirely (Q130).

**Mode semantics:**
- **REPLACE** (default): wipes the current dataset and loads the envelope, **preserving incoming IDs** for round-trip fidelity (Q127/Q139).
- **MERGE** (Q125–Q127, Q136): keep-local on collision by default; incoming user content whose ID collides but whose content differs is re-inserted under a fresh ULID with all its internal references rewritten in the same transaction (Q126/Q127). Categories upsert by key (Q135). Variable **definitions** merge by name (conflicts renamed/skipped); no values are ever imported or overwritten — values do not exist in the envelope (Q136 reconciled with the memory-only decision).

**Response** `200 OK`:
```json
{
  "mode": "replace",
  "formatVersion": 1,
  "migratedFrom": null,
  "snapshotPath": "…/backups/cheat-pre-import-20260715T123456Z.json",
  "counts": { "categories": 18, "commands": 240, "references": 12,
              "roadmaps": 4, "phases": 20, "steps": 130,
              "cheatsheets": 3, "variableDefinitions": 8, "notes": 15 },
  "merge": { "added": {}, "skipped": {}, "reIded": {} },
  "warnings": [ "3 liens de commande orphelins nettoyés." ]
}
```
After import the SPA re-hydrates via `GET /api/state`.

**Factory reset (Q134):** `POST /api/factory-reset` — guarded global reset that first writes a backup snapshot (as in step 5), then wipes and re-seeds the first-run dataset in one transaction; returns the same summary shape plus `snapshotPath`. This is distinct from per-roadmap reset-progress (§4.6.4) and restore-defaults. (See §10.5.4.)

### 4.11 Endpoint index

| # | Method | Path | Success |
|---|---|---|---|
| 1 | GET | `/api/state` | 200 |
| 2 | GET | `/api/export` | 200 |
| 3 | POST | `/api/import?mode=replace\|merge` | 200 |
| 4 | POST | `/api/factory-reset` | 200 |
| 5 | GET | `/api/seed-pack` | 200 |
| 6 | POST | `/api/import/seed-pack` | 200 |
| 7 | GET | `/api/backup.sqlite` | 200 |
| 8 | PUT | `/api/settings` | 200 |
| 9 | POST | `/api/categories` | 201 |
| 10 | PATCH | `/api/categories/{id}` | 200 |
| 11 | DELETE | `/api/categories/{id}?reassignTo=` | 204 |
| 12 | POST | `/api/commands` | 201 |
| 13 | PATCH | `/api/commands/{id}` | 200 |
| 14 | DELETE | `/api/commands/{id}` | 204 |
| 15 | POST | `/api/references` | 201 |
| 16 | PATCH | `/api/references/{id}` | 200 |
| 17 | DELETE | `/api/references/{id}` | 204 |
| 18 | POST | `/api/roadmaps` | 201 |
| 19 | PATCH | `/api/roadmaps/{id}` | 200 |
| 20 | DELETE | `/api/roadmaps/{id}` | 204 |
| 21 | POST | `/api/roadmaps/{id}/duplicate` | 201 |
| 22 | POST | `/api/roadmaps/{id}/reset-progress` | 200 |
| 23 | POST | `/api/roadmaps/restore-defaults` | 200 |
| 24 | POST | `/api/roadmaps/{roadmapId}/phases` | 201 |
| 25 | PATCH | `/api/phases/{phaseId}` | 200 |
| 26 | DELETE | `/api/phases/{phaseId}` | 204 |
| 27 | POST | `/api/roadmaps/{roadmapId}/phases/reorder` | 200 |
| 28 | POST | `/api/phases/{phaseId}/steps` | 201 |
| 29 | PATCH | `/api/steps/{stepId}` | 200 |
| 30 | DELETE | `/api/steps/{stepId}` | 204 |
| 31 | POST | `/api/phases/{phaseId}/steps/reorder` | 200 |
| 32 | POST | `/api/cheatsheets` | 201 |
| 33 | PATCH | `/api/cheatsheets/{id}` | 200 |
| 34 | DELETE | `/api/cheatsheets/{id}` | 204 |
| 35 | POST | `/api/cheatsheets/{sheetId}/entries` | 201 |
| 36 | DELETE | `/api/cheatsheets/{sheetId}/entries/{entryId}` | 204 |
| 37 | POST | `/api/cheatsheets/{sheetId}/entries/reorder` | 200 |
| 38 | POST | `/api/variables` | 201 |
| 39 | PATCH | `/api/variables/{id}` | 200 |
| 40 | DELETE | `/api/variables/{id}` | 204 |
| 41 | PUT | `/api/notes/{commandId}` | 200 |

---

## 5. Variables System

The Variables system lets a command template such as `nmap -sC -sV $IP` render and copy as a concrete command (`nmap -sC -sV 10.10.10.5`) without editing the stored template. It has two strictly separated halves: **definitions** (persisted metadata — the catalogue of variable *names*) and **values** (the in-memory substitution set the operator types during a session). This split is the load-bearing OPSEC decision of the app: names live in SQLite, values never touch disk.

### 5.1 Definitions vs Values (the core split)

- **Definition** — a persisted record describing *that a variable exists*: its bare name, ordering, built-in flag, sensitivity flag, and a reserved type field. Definitions are portable: they are included in the JSON dataset export and round-trip on import. (Q20, D2)
- **Value** — the concrete string the operator assigns to a variable *for the current session only* (e.g. `$IP = 10.10.10.5`). Values are **React state only**. They are:
  - never written to SQLite,
  - never written to `localStorage` / `IndexedDB` / any device store,
  - reset to empty on every page reload,
  - excluded from the JSON dataset export unconditionally. (memory-only values; Q124)
- There is exactly **one global value set** shared across every cheatsheet, roadmap, and library view — no per-cheatsheet, per-target, or per-profile value scoping in v1. Definitions are modelled separately from values precisely so a future "profiles" layer can be added without a schema migration. (D2, Q21)

> The only path by which a value reaches disk is an *explicit, opt-in* user action: a cheatsheet export with the "résoudre les variables" toggle enabled (§9, Q99). The clipboard is the other resolved surface, and it is a deliberate local action (§5.9, §11.6, Q53). Absent those, nothing sensitive is ever persisted.

### 5.2 Definition data model (persisted)

Definitions are stored in a single ordered table (§3.2.7). IDs are **server-minted ULIDs** (D5).

| Field        | Type                     | Constraints / Notes                                                                                     |
|--------------|--------------------------|---------------------------------------------------------------------------------------------------------|
| `id`         | TEXT (ULID)              | PK, server-minted. Seed rows keep literal seed IDs.                                                     |
| `name`       | TEXT                     | NOT NULL. **Bare** name, no `$` prefix. Stored upper-case. Unique case-insensitively (§5.6).            |
| `type`       | TEXT                     | NOT NULL, default `'text'`. Reserved for future soft validation; **all variables are free text in v1** (Q29). |
| `isBuiltin`  | BOOLEAN                  | NOT NULL. `true` for the 6 standard variables, `false` for custom. Drives edit/delete permissions.     |
| `sensitive`  | BOOLEAN                  | NOT NULL. `true` ⇒ value masked in the panel AND excluded from export metadata (§5.4, §9.5/Q100).      |
| `hidden`     | BOOLEAN                  | NOT NULL, default `false`. Hides the row in the panel (Q25 "masquables"); distinct from `sensitive`.   |
| `position`   | INTEGER                  | NOT NULL. Global ordering. Standard vars seeded `0..5`; custom appended at `max(position)+1`.           |

- No `value`, `default`, or any value-bearing column exists on this table — by construction (D2, memory-only).
- No `default` field per variable in v1. Value reset is a single global action, not per-variable (Q30).

### 5.3 Values (memory-only runtime state)

- Runtime shape: a plain map `Record<string /*bare NAME*/, string /*value*/>`, keyed by the definition's bare upper-case name. Missing key ⇒ the variable has no value yet.
- Seeded empty on load. Editing a value in the panel updates this map synchronously (controlled input); it triggers immediate re-render of every tokenized command but **no** network write and **no** autosave (D3 applies to definitions, never to values).
- **« Effacer toutes les valeurs »** — a single global action clears the entire map (all keys → removed / empty). Definitions are untouched. (Q30)
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
- **Hideable.** A standard row may additionally be hidden from the panel via the `hidden` flag (Q25 "masquables") — distinct from `sensitive` value masking.

> **Open:** The default `sensitive` state of the six standard variables is not itself a locked decision. The table above (only `$PASS` sensitive by default) is the recommended default; all six remain user-toggleable via the mask affordance.

### 5.5 Custom variables & panel UI

The Variables panel lives in the left sidebar (prototype: an uppercase "Variables" label plus a mono `live` badge signalling the values are session-live). Each definition renders one row: a fixed, non-editable `$`-prefixed name label (accent-coloured, monospace, ~60px) followed by the value input. (Q26)

- **Add** — an inline **« + Variable »** affordance appended below the rows opens an inline name entry (no modal). On submit the name is validated (§5.6), a definition is created via `POST /api/variables`, and the new row appears at the bottom in creation order.
- **Rename / Delete (custom only)** — exposed as small per-row affordances revealed **on hover**; no modal. Rename edits the bare name; delete removes the definition (§5.7, §5.8).
- **Mask toggle** — per-row affordance writing the `sensitive` flag (all rows, including standard).
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

### 5.7 Rename (cascade rewrite)

Renaming a custom variable rewrites every `$OLDNAME` token to `$NEWNAME` across **all command templates**, in **one database transaction**. (Q27)

- The new name is validated against the full §5.6 rules first (grammar, uniqueness, reserved, length).
- The rewrite uses the same tokenizer as resolution: only **whole-name, unescaped** `$OLDNAME` tokens are replaced. `$OLDNAMEX` (a longer token) is left untouched, and an escaped literal `\$OLDNAME` is **not** rewritten (it is a literal, §5.9).
- Scope of rewrite = `command.template` fields only, matching the substitution scope (§5.11). Notes, titles, descriptions, step text, and cheatsheet title/target are not scanned and not rewritten.
- The confirmation surfaces the **count of commands updated** (e.g. « 7 commande(s) mise(s) à jour »). (Q27)
- Built-in variables cannot be renamed (§5.4).

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

Because only defined names substitute and `\$` escapes, shell tokens are safe by default except where the name collides with a defined variable (notably `$USER`); in that case escape as `\$USER` to keep it literal.

### 5.10 Rendering states (tokenized display)

On screen, command templates render inside a monospaced `<pre>` (with a non-selectable `$ ` prompt prefix), one `<span>` per resolution part. Three distinct visual states, following the spec over the prototype (the prototype greened every recognised token; the spec greens only truly resolved ones). (Q31, Q32)

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

Only **definitions** have an API. Values are memory-only and have **no endpoint** (§5.3). Definition mutations go through the standard debounced optimistic autosave path (D3); the rename cascade is one atomic server transaction. Definitions are also delivered inside `GET /api/state` (§4.5); the granular endpoints below (authoritative in §4.6.9) are the mutation surface.

| Method & path              | Purpose                        | Body / notes                                                                                          |
|----------------------------|--------------------------------|--------------------------------------------------------------------------------------------------------|
| `POST /api/variables`      | Create custom variable         | `{ name, sensitive? }`. Server mints ULID, sets `isBuiltin=false`, `type='text'`, `position=max+1`. `400`/`409` on grammar/length/uniqueness/reserved conflict. |
| `PATCH /api/variables/:id` | Rename and/or toggle sensitive/hidden | `{ name?, sensitive?, hidden? }`. On built-in: `sensitive`/`hidden` allowed, `name` rejected (`409`). Rename runs the cascade rewrite (§5.7) in one transaction and returns the updated-command count. |
| `DELETE /api/variables/:id`| Delete custom variable         | Built-in ⇒ `409`. Client warns with referencing-command count; templates are **not** modified (§5.8).  |

- There is deliberately no reorder endpoint in v1 (custom order = creation order; §5.5).
- No endpoint accepts, returns, or persists a variable value, ever.

### 5.13 Edge cases & invariants

- **Empty value never collapses a command** — `empty` parts keep `$NAME` visible (§5.9 rule 3, Q32).
- **Deleted-variable tokens** become `undefined`/dangling, never silently vanish (§5.8, §5.10).
- **Maximal-munch collision** — `$IP` defined, template contains `$IPADDR` ⇒ `$IPADDR` is one undefined token, not a resolved `$IP` followed by `ADDR`.
- **Value containing `$`** — inserted verbatim, never re-scanned (`$IP = "$LHOST"` yields the literal text `$LHOST` in output). (Q35)
- **Escaped token that names a real variable** — `\$USER` stays literal `$USER` even though `USER` is defined; the escape wins (§5.9 rule 1).
- **Rename to an existing/reserved name** — rejected before any template is touched (§5.6, §5.7).
- **Reload** — all values are gone; every previously-resolved token reverts to `empty` (still defined) or `undefined` (if the definition was also removed). Definitions and templates are unchanged.
- **Sensitive contract** — a `sensitive` variable is masked in the panel and omitted from the export metadata chip block (§9.5/Q100); its value can still reach the clipboard or a resolve-toggled export because those are explicit local/opt-in actions (§9/Q99, §11.6/Q53).

### 5.14 Decision traceability

Locked decisions reflected in this section: **Q20, Q21, Q22, Q23, Q24, Q25, Q26, Q27, Q28, Q29, Q30, Q31, Q32, Q33, Q34, Q35, Q36, D2, D5 (ID minting), D3 (definition autosave), and the memory-only values rule.**

---

## 6. Library Module

The Library (**« Bibliothèque »**, first tab) is the catalogue of reusable OSCP commands. Each command is a card carrying a title, a shell template with live variable highlighting, a description, tags, a personal note, a tool badge, a copy button and a cheatsheet toggle. Commands are grouped into a **Category › Tool › Tag** hierarchy driven by a left sidebar, and narrowed by a per-module search and a set of combinable filters. Full CRUD is available through a reused Add/Edit modal.

All search, filtering, grouping, counting and sort operations described here run **client-side** over the full dataset loaded at boot (single-user localhost SPA). The REST surface in §6.10 exists only for persistence (optimistic debounced autosave, D3). Server-minted ULIDs (D5) identify every command and category. Desktop-only strict layout applies (D8); the grid scrolls horizontally below the hard min-width rather than reflowing.

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
- **Category tree** — one collapsible row per **non-empty** category. Empty categories are **hidden from the sidebar** but still listed in the Add/Edit modal dropdown (Q3). Each row shows a category-color dot, the label, and the **global** command count. A chevron (`▸`/`▾`) toggles expansion; expansion state is device-local UI state.
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
| **Tool badge** | Small mono badge showing `command.tool`, **colored by the command's category color** (§11): `color: <category.color>`, `background: color-mix(in srgb, <category.color> 15%, transparent)`. Same `badge()` styling used by the cheatsheet entries, for visual consistency. |
| **Description** | `command.desc`, muted; hidden when empty. |
| **Code block** | `command.template` rendered with variable highlighting (see below). A non-selectable accent-colored `"$ "` prompt prefixes each block (`user-select:none`, so copy/selection never captures it). Block is `white-space:pre-wrap` (multi-line templates preserved), `overflow-x:auto`. |
| **Copy button** | Top-right of the code block; copies the **resolved** template (see §6.6 copy / Q53). |
| **Tags** | Clickable `#tag` chips; clicking a tag toggles it in the active tag filter set (Q42). |
| **Cheatsheet toggle** | Button reflecting membership of this command in the **active cheatsheet** (D1): label **« + Cheatsheet »** when not a member, **« Ajoutée ✓ »** (accent style) when a member. Clicking toggles membership in the active cheatsheet. Full multi-cheatsheet semantics are owned by §9. |
| **Personal note** | Dashed-border textarea, placeholder **« Note personnelle… »**, `resize:vertical`. Bound to the per-command note (keyed by `commandId`). Autosaved (debounced, D3). No variable substitution (Q34). Excluded from search (Q37). |

**Variable highlighting in the code block** (governed by §5 — reflected here):

- Tokenization matches the grammar `$[A-Z_][A-Z0-9_]*` (Q22). `\$` is an escape producing a literal `$` with no substitution (Q33). Substitution is single-pass, values inserted verbatim, and only **defined** variable names substitute (Q33/Q35).
- Two rendered states (Q31/Q32):
  - **Resolved** — the variable is defined **and** its (memory-only) value is non-empty: the substituted value is shown **green-highlighted** (`color: var(--acc)`, `background: var(--acc-dim)`).
  - **Unresolved** — the variable is undefined, or defined but empty: the literal `$TOKEN` is kept visible in a distinct **dangling/undefined** style (muted / dotted), never substituted to an empty string.
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

**Add** — the top-bar **« + Commande »** button opens the modal empty (title **« Nouvelle commande »**, submit **« Ajouter »**). On submit → `POST /api/commands`; the server mints the ULID (D5). Optimistic: the card appears immediately under its category/tool with a provisional local key, reconciled to the server ULID on response (D3).

**Edit** — a **pencil** affordance on each card opens the same modal pre-filled from the command, **preserving its `id`** (title **« Modifier la commande »**, submit **« Enregistrer »**). On submit → `PATCH /api/commands/:id`.

**Modal fields** (French labels, verbatim):

| Field | UI | Rules |
|---|---|---|
| Catégorie | Dropdown of **all** categories (incl. empty built-ins) + a **« + »** toggle revealing **« Nom de la nouvelle catégorie »** input | On-the-fly creation (below). Required. |
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
- **Tags** — normalized (Q47): trim, strip a leading `#`, store **lowercase**, dedup case-insensitively, commas act only as separators (a tag may contain spaces), empty tokens dropped. Global tag rename/merge/delete and dropping of zero-reference tags are covered by the tag-management surface (Q47).

**Post-add navigation (Q55):** after adding a command, set `activeCategory`/`activeTool` to its category/tool, expand that category, **and also clear `activeTags[]` and `query`** so the new card is guaranteed visible. Toast **« Commande ajoutée »**.

**Delete (Q13/Q14/Q19):** a delete action (card and/or modal) opens a **destructive confirmation** dialog reporting the reference count — how many methodology steps link it, how many cheatsheets contain it, whether a personal note exists. On confirm → `DELETE /api/commands/:id`, which cascades:

- **linked steps** → `Step.commandId` nulled, step **text kept** (link shown as broken on affected steps, per §7 / Q63);
- **cheatsheet membership** → removed from every cheatsheet composition (FK cascade);
- **orphan personal note** → deleted;
- dependent view state (selection keyed by this id) is cascade-cleaned (Q19).

**Duplicate (Q56):** a **« Dupliquer »** action opens the Add modal **pre-filled** from the source command (title suffixed **« (copie) »** to avoid tripping the duplicate warning); on submit a new command with a fresh ULID is created. Low priority for v1 but specified.

### 6.9 Imported unknown categories → « Autre »

On JSON import (REPLACE, D4), any command whose `categoryId` does not resolve to a known category is **remapped to a reserved fallback category `Autre`** (Q52):

- `Autre` is created lazily on first need (label **« Autre »**, positioned last, treated as non-deletable while it holds commands, per Q17 delete rules); it is **not** one of the seeded 18.
- The import completes and surfaces a **warning** listing the number of remapped commands. No command is ever silently hidden (the prototype counted unknown-key commands but never rendered them — fixed by this remap).

### 6.10 REST surface (persistence only)

Search/filter/grouping/counting are client-side and have **no** endpoints. Library-owned mutation endpoints (optimistic, debounced autosave — D3; ULIDs server-minted — D5; authoritative signatures in §4.6.1–§4.6.2):

| Method | Path | Body | Response | Behavior |
|---|---|---|---|---|
| `POST` | `/api/commands` | `{ categoryId, tool, title, template, desc, tags[], language? }` | `201` `Command` (with ULID) | Validates required `title`+`template`; normalizes `tool`/`tags`. |
| `PATCH` | `/api/commands/:id` | partial `{ title?, template?, desc?, categoryId?, tool?, tags[]?, language? }` | `200` `Command` | Field-level update; `id` preserved. Personal-note autosave rides `PUT /api/notes/{commandId}` (§4.6.10). |
| `DELETE` | `/api/commands/:id` | — | `204` | Cascade per §6.8 / Q14; reference counts known client-side. |
| `POST` | `/api/categories` | `{ label, color? }` | `201` `Category` | On-the-fly custom category; label deduped case-insensitively; `color` defaults to next palette slot. |
| `PATCH` | `/api/categories/:id` | `{ label?, color? }` | `200` `Category` | Built-ins: label/color only (never delete). |
| `DELETE` | `/api/categories/:id` | — | `204` / `409` | Custom **and** empty only; otherwise `409` with a reassignment hint toward `Utilities` (Q17). |

### 6.11 Edge cases & invariants

- Selecting a tool without a category is impossible: the tool filter is always scoped to its category (Q45).
- Toggling all tags off (or clearing them) returns to the current category/tool/query scope; it never widens beyond other active dimensions.
- Empty categories vanish from the sidebar the instant their last command is deleted or moved, but remain selectable in the Add/Edit dropdown (Q3).
- Renaming a variable cascades `$OLDNAME → $NEWNAME` across all command templates (one transaction, §5 / Q27); Library cards re-highlight accordingly on next render.
- The personal note shown on the card is the same base note surfaced by the cheatsheet entry (Q95/Q97); editing it here updates both (per-entry override deferred to v2, §9).
- Sidebar counts never change with active filters; only the header count and the rendered groups do (Q50).

> **Open:** none for this module — all in-scope questions (Q3–Q6, Q37–Q56) are resolved by the adopted Recos and the decisions log.

---

## 7. Methodology Module

The Methodology module organizes OSCP attack knowledge as **roadmaps → phases → steps**. Each roadmap is a named, fully editable checklist; each phase groups checkable steps; each step optionally links exactly one command that expands inline with resolved display and a copy button. Progress bars are computed per phase and globally. The module reuses the roadmap tab/CRUD pattern that also backs cheatsheets (D1).

This section reflects the following locked decisions: **D5** (server-minted ULIDs; phases/steps are first-class rows with stable IDs + position; progression keyed by step ID; seed IDs preserved literal) and **Q57–Q76**. Cross-cutting decisions referenced here: Q7 (`Step.commandId`), Q10 (position columns), Q18 (seed = ordinary rows), Q19 (cascade of dependent state), Q31/Q32/Q33/Q35 (variable resolution), Q53/Q99 (clipboard resolved, exports raw), Q112 (persistence mapping), Q133 (seed first-run-only), D3 (debounced optimistic autosave).

---

### 7.1 Data model

Phases and Steps are **first-class rows** (D5, Q2), not array indices. Progress (`done`) and panel state (`expanded`) live on the step row itself so they follow the step through any reorder or cross-phase move — this eliminates the prototype's positional-key resurrection bug. (Authoritative schema in §3.2.4–§3.2.6.)

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
| `expanded` | BOOLEAN | NOT NULL, default `false` | Linked-command panel unfolded state. Prototype `openSteps{}`. Persisted per Q112 (see §4.5 Open item). |
| `position` | INTEGER | NOT NULL | Dense `0..n-1` within the phase. |

- No per-step free note in v1 (Q65 — deferred). `steps.text` + `commandId` are the only content fields.
- Deleting a parent cascades all dependent state via FK `ON DELETE CASCADE` (`done`/`expanded` live on the step row, so they vanish with the row) — Q19.
- The old prototype fields `Step.note`/`checks{}`/`openSteps{}` maps are gone; `commandId`, `done`, `expanded` are typed columns.

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

**Restore defaults (Q67):** action `Restaurer les méthodologies par défaut` re-adds only the seed roadmaps whose seed ID (`services`/`web`/`ad`/`privesc`) is **absent** from the current dataset. It never overwrites an existing seed roadmap (even if edited), never resurrects seeds automatically, and never touches user-created roadmaps. Restored steps start with `done=false`, `expanded=false`.

---

### 7.3 API endpoints (recap — authoritative in §4)

Same-origin REST, bound to `127.0.0.1`. All mutations are applied optimistically in the SPA and flushed via the debounced autosave queue (D3). `done`/`expanded` are backend-persisted content (Q112). The **active roadmap** and edit-mode state are **not** persisted server-side — active roadmap is device-local (Q69, Q112). Reads arrive via `GET /api/state` (§4.5); the mutation surface (canonical signatures in §4.6.4–§4.6.6 and §4.7):

**Roadmap CRUD**

| Method / Path | Body | Behavior |
|---|---|---|
| `POST /api/roadmaps` | `{ label }` | Mint ULID, `position = max+1`. `201` → new roadmap (empty `phases`). |
| `PATCH /api/roadmaps/:id` | `{ label?, position? }` | Rename / reposition. `200`. |
| `DELETE /api/roadmaps/:id` | — | Cascade-delete phases/steps. `204`. |
| `POST /api/roadmaps/:id/duplicate` | — | Deep clone with fresh ULIDs, `done/expanded` reset to `false`, `commandId` links copied verbatim, appended `position = max+1`. `201` → new roadmap. |
| `POST /api/roadmaps/restore-defaults` | — | Re-add missing seed roadmaps (see §7.2). `200` → `{ restored: [ids] }`. |
| `POST /api/roadmaps/:id/reset-progress` | — | Set `done=false, expanded=false` for every step in the roadmap. `200`. |

**Phase CRUD / reorder**

| Method / Path | Body | Behavior |
|---|---|---|
| `POST /api/roadmaps/:id/phases` | `{ label }` | `position = max+1`. `201`. |
| `PATCH /api/phases/:id` | `{ label?, position? }` | Rename / reposition within roadmap; server splices then renumbers `0..n-1`. `200`. |
| `DELETE /api/phases/:id` | — | Cascade-delete steps. `204`. |
| `POST /api/roadmaps/:id/phases/reorder` | `{ orderedIds }` | Bulk reorder (§4.7). `200`. |

**Step CRUD / state / reorder**

| Method / Path | Body | Behavior |
|---|---|---|
| `POST /api/phases/:id/steps` | `{ text, commandId? }` | `position = max+1`. `commandId` optional (0..1). `201`. |
| `PATCH /api/steps/:id` | `{ text?, commandId?, done?, expanded?, phaseId?, position? }` | Edit text; change linked command (`commandId: null` clears the link, Q60); toggle completion (`done`, Q113); toggle linked-command panel (`expanded`); intra- **or** cross-phase move (`phaseId`+`position`, Q58 — detach from source phase, insert into target at `position`, renumber both phases; `done`/`expanded`/`commandId` preserved). `200`. |
| `DELETE /api/steps/:id` | — | `204`. |
| `POST /api/phases/:id/steps/reorder` | `{ orderedIds }` | Reorder / receive steps, incl. cross-phase (§4.7). `200`. |

> Reorder normalization: the server always compacts `position` to a dense `0..n-1` sequence after any insert/move/delete within a container.

---

### 7.4 View layout & states

Desktop-only strict layout (D8). Centered column, `max-width ~820px` (§11.5.3).

- **Roadmap tabs**: a wrap-flowing row of pill buttons, one per roadmap, in `position` order. The active pill uses the accent-dim style; others the muted surface style. Clicking a pill sets the active roadmap (device-local, Q69). The top-bar Add button in this view reads **`+ Méthodologie`** and opens the inline new-roadmap input.
- **New-roadmap input** (opened by `+ Méthodologie`): a text field (placeholder `Nom de la méthodologie — ex : Machine — Linux`) + **`Créer`** button. On submit (non-empty), POST the roadmap, activate it, and **auto-enter edit mode** (Q76).
- **Header row** (when a roadmap exists): roadmap label + progress readout (`{done}/{total} · {pct}%`), a global progress bar underneath, the edit toggle, and the reset button.
- **Edit toggle**: label alternates **`✎ Modifier`** ↔ **`Terminé`**; active state uses the accent-dim button style.

**Empty states**

- **No roadmaps at all** (`noRoadmap`): centered block — mono line `// aucune méthodologie` + `Crée-en une avec le bouton « + Méthodologie ».` Also surface the `Restaurer les méthodologies par défaut` action here so a user who deleted everything can recover the seeds.
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

- **Checkbox**: empty box → filled accent box with `✓` when `done`. Toggling PATCHes `/api/steps/:id { done }` optimistically. Completed steps render their text struck-through and muted.
- **Linked-command toggle**: shown only when the step has a resolvable `commandId`. Collapsed label = **`▸ {tool}`** (the linked command's tool name); expanded label = **`masquer`**. Toggling PATCHes `/api/steps/:id { expanded }`.
- **Inline command panel** (when `expanded` and the command resolves): shows the command title as a mono caption, a **`Copier`** button, and a `<pre>` code block prefixed with a non-selectable `$ ` gutter.

**Variable resolution in the inline panel** (reuses the §5 resolver — Q31/Q32/Q33/Q35):

- Tokenize the template; render literal segments plain.
- A `$TOKEN` whose variable is **defined and non-empty** → substitute its current value, styled accent-green on accent-dim background (resolved).
- A `$TOKEN` that is **undefined or defined-but-empty** → render the raw `$TOKEN` in the distinct **dangling** style (muted/dotted), never green (Q31, Q32).
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
- **`Dupliquer`**: duplicate the current roadmap (§7.8, §7.10).

**Per-phase** (edit mode):
- Drag handle `⠿` (title `Glisser pour déplacer la phase`).
- Label input (PATCH on debounced input).
- **`↑` / `↓`** buttons (titles `Monter` / `Descendre`) to reorder the phase — a11y/keyboard/touch-safe path (Q71, Q72).
- **`✕`** delete (title `Supprimer la phase`) — immediate + undo toast (§7.9).
- Add-step draft row: text input (placeholder `Intitulé de la nouvelle étape…`) + a command `<select>` whose first option is **`— aucune commande liée —`** followed by `{tool} — {title}` per command, and a **`+ Étape`** button.

**Per-step** (edit mode):
- Drag handle `⠿` (title `Glisser pour réordonner`).
- Inline text edit — the static text becomes an editable input (Q59); PATCH `/api/steps/:id { text }` on debounced input.
- Linked-command change — a `<select>` (same option list) lets the user change, set, or clear (`— aucune commande liée —` → `commandId: null`) the linked command of any existing step (Q60); PATCH `/api/steps/:id { commandId }`.
- **`↑` / `↓`** buttons (intra-phase reorder; a11y path — Q72).
- **`✕`** delete (title `Supprimer l'étape`) — immediate + undo toast (§7.9).

**Add-phase** (edit mode, below the phase list): text input (placeholder `Nom d'une nouvelle phase…`) + **`+ Phase`** button.

Name validation: labels are trimmed and must be non-empty (empty submissions are rejected silently, matching the prototype). Duplicate roadmap names surface a non-blocking warning; duplicate phase names are allowed (Q75).

---

### 7.8 Reordering — drag-and-drop + up/down

Reordering is available in edit mode only. Two mechanisms coexist: mouse DnD (primary) and `↑`/`↓` buttons (keyboard/touch/a11y — Q71, Q72).

**Scope**
- **Phases**: reorder within their roadmap (DnD via header handle, or `↑`/`↓`).
- **Steps**: reorder within a phase **and across phases** (Q58) via DnD. `↑`/`↓` buttons reorder **intra-phase** only (flat, matching the cheatsheet control); cross-phase relocation is DnD-only.

**Visual feedback**
- **Dragged item dimmed**: the source phase card / step row renders at reduced opacity (~0.35 phase, ~0.45 step) while dragging.
- **Ghost placeholder**: a dashed accent insertion box (`2px dashed --acc`, accent-dim fill, inset glow) marks where the item will land.
- **Insertion semantics unified on midpoint before/after** (Q73): `dragover` measures the cursor against the target's vertical midpoint → insert *before* (top half) or *after* (bottom half); the placeholder renders at exactly that gap, so the drop lands where the indicator shows. Phases and steps use identical logic.
- **Empty-phase drop zone** (Q74): because cross-phase moves are enabled, an empty phase renders an explicit "drop here" zone in edit mode so a dragged step has a valid target.

**Progression follows via stable step IDs (D5):** reorder/move endpoints change only `position` (and `phaseId` for cross-phase); `done`, `expanded`, and `commandId` are columns on the step row and are never remapped. A completed, expanded step dragged to a new phase arrives still completed and expanded — no silent progress corruption, no resurrection bug.

**Keyboard/a11y:** `↑`/`↓` are real focusable `<button>`s with `aria-label`s (`Monter` / `Descendre`), disabled at the ends of their container; focus outlines follow §11.7.

---

### 7.9 Confirmations, undo & reset

Per Q70: high-impact destructive actions confirm via dialog; lower-impact deletes use immediate action + undo toast.

| Action | Pattern | French copy |
|---|---|---|
| **Delete roadmap** | Confirmation dialog (destructive) | Title/body e.g. `Supprimer « {label} » ? Cette méthodologie, ses {p} phases et {s} étapes seront définitivement supprimées.` — buttons `Supprimer` (danger) / `Annuler`. |
| **Reset progression** | Confirmation dialog | `Réinitialiser la progression de « {label} » ? Toutes les cases cochées et les commandes dépliées de cette méthodologie seront remises à zéro.` — buttons `Réinitialiser` / `Annuler`. |
| **Restore defaults** | Confirmation dialog (additive) | `Restaurer les méthodologies par défaut manquantes ? Vos méthodologies existantes ne sont pas modifiées.` — buttons `Restaurer` / `Annuler`. |
| **Delete phase** | Immediate + undo toast | Toast `Phase supprimée` + action `Annuler`. |
| **Delete step** | Immediate + undo toast | Toast `Étape supprimée` + action `Annuler`. |

**Undo mechanics (autosave-aware):** phase/step deletes apply optimistically to the UI and enqueue the DELETE. The undo toast persists ~6s; pressing **`Annuler`** cancels the enqueued mutation before flush (or, if already flushed, re-creates the row and its children with their prior IDs, `done`, `expanded`, `commandId`, and `position` restored). Undo restores the full subtree (a phase's steps come back with their progress intact).

**Reset progression (Q57):** the control formerly labelled `Réinitialiser` is relabelled **`Réinitialiser la progression`** to disambiguate it from the Library filter-reset link. It clears `done` **and** `expanded` for **every step of the current roadmap only** (never structure, never other roadmaps), behind the confirmation above. Endpoint: `POST /api/roadmaps/:id/reset-progress`.

---

### 7.10 Duplicate & default roadmap selection

- **Duplicate (Q66):** the `Dupliquer` action deep-clones the active roadmap — phases, steps, and `commandId` links — with fresh ULIDs, `position = max+1`, and progression reset (`done=false`, `expanded=false`). The copy's label is the source label with a ` (copie)` suffix. The new roadmap becomes active.
- **Active roadmap on load / after delete (Q69):** the last active roadmap ID is persisted **device-local** (localStorage) and restored on load if it still exists, else the first roadmap by `position`. After deleting the active roadmap, select the **previous tab in order** (index − 1), or the first if the deleted one was first; if none remain, fall back to the no-roadmap empty state (§7.4).

---

### 7.11 Persistence & autosave mapping (methodology slice)

Per Q112 / D3:

- **Backend-persisted (content + state):** roadmaps, phases, steps (including `text`, `commandId`, `position`), and progression (`done`, `expanded`). Every mutation in §7.3 flushes through the debounced (~500 ms) optimistic autosave queue with background retry and an error-only indicator; there is no explicit Save button.
- **Device-local (not synced):** active roadmap tab, edit-mode on/off.
- **In-memory only:** variable **values** used to resolve the inline command preview — never persisted (never DB, never localStorage), reset on reload.
- **Excluded from JSON export:** variable values only; roadmap/phase/step structure and progression are exported like any other content (Q18, Q124).

---

### 7.12 Edge cases

- Toggling a checkbox or command panel is available **outside** edit mode; all structural mutation requires edit mode.
- Reordering endpoints always renumber to dense `0..n-1`; a move to an out-of-range index clamps to the container bounds.
- A step whose `commandId` was cleared (Q63) or points to a non-existent command renders with no toggle button and cannot be expanded until re-linked.
- Empty roadmap / empty phase never show `0%` — they show the neutral `aucune étape` state (§7.5).
- Cross-phase drop into an empty phase is only reachable via the explicit drop zone (Q74); intra-phase `↑`/`↓` cannot cross phase boundaries.
- Deleting the last remaining phase or step leaves the parent in its empty state, not an error.

> **Open:** Duplicate label collision — a ` (copie)` suffix may itself duplicate an existing name; per Q75 this only triggers the non-blocking duplicate-name warning, so no numbering scheme (`(copie 2)`) is specified for v1.

---

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
| `createdAt`     | `timestamp`              | Server-set. Stable tiebreak for ordering (Q10); references have **no** manual `position` column.                      |

**Derived, non-editable fields** (returned in API responses, not user-set, not part of the import/export payload beyond `url`):

| Field           | Type     | Source                                                                                                     |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `displayDomain` | `string` | Computed server-side from `url` at write time: hostname, `www.` stripped, IDN decoded to Unicode (§8.6). For `mailto:`, the domain part after `@`. Neutral marker on failure. |

`displayDomain` is what the "auto-extracted domain" refers to in scope. Computing it on the server (via `golang.org/x/net/idna`) keeps the client free of any punycode dependency and preserves zero egress. It MAY be cached in a column for query convenience but is always a function of `url` — never independently editable.

### 8.2 REST API (recap — authoritative in §4.6.3)

Same-origin, bound to `127.0.0.1` (Q168). The server is the authoritative validator; the client validates too, only for inline UX. Reference create/edit are **synchronous validated writes committed on modal submit** — not fire-and-forget debounced autosave — because a URL can fail parsing/scheme/dedup checks (this is the documented reconciliation with the D3 autosave rule: D3 governs inline optimistic edits; modal-based create/edit for commands and references commit on submit and surface validation errors inline). Reads arrive via `GET /api/state` (§4.5).

| Method   | Path                     | Body                                              | Success           | Errors                                                                 |
| -------- | ------------------------ | ------------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| `POST`   | `/api/references`        | `{title, url, desc, tags[]}`                      | `201` `Ref DTO`   | `400 url_required` / `400 invalid_url` / `400 scheme_not_allowed` / `409 duplicate_url` |
| `PATCH`  | `/api/references/:id`    | `{title, url, desc, tags[]}` (full mutable set)   | `200` `Ref DTO`   | `404` / `400 …` / `409 duplicate_url` (excluding self)                 |
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
  "createdAt": "2026-07-15T10:22:31Z"
}
```

**Error envelope** (4xx) follows §4.3; for `duplicate_url` the `details` carry the colliding reference id so the SPA can point at it.

### 8.3 URL handling pipeline

Applied identically on client (WHATWG `URL`) and server (`net/url` + `x/net/idna`); the server result wins. Order matters.

1. **Trim** the raw input.
2. **Scheme prefixing (Q77).** If the trimmed input does **not** begin (case-insensitive) with an allowlisted scheme prefix — `http://`, `https://`, or `mailto:` — prepend `https://`. (So `book.hacktricks.xyz` → `https://book.hacktricks.xyz`; `mailto:a@b.com` is left as-is; `javascript:alert(1)` is left as-is and rejected in step 4.)
3. **Parse (Q77).** Feed the result to the URL parser. If it throws / fails to parse → **block the save**, show the inline error `URL invalide`. Never store an unparseable string (the prototype bug where `"not a url"` became `"https://not a url"` is closed).
4. **Scheme allowlist (Q78).** Read the parsed `protocol`. If it is not one of `http:`, `https:`, `mailto:` → **block the save**, inline error `Schéma d'URL non autorisé (http, https ou mailto uniquement)`. This is what rejects `javascript:`, `data:`, `file:`, `ftp:`, etc.
5. **Normalize (Q79).** Lowercase the **scheme** and the **host**; **strip the fragment** (`#…`). Leave path, query, and (for `mailto:`) the address local-part **verbatim** — no tracking-param stripping, no default-port stripping, no forced https. This is the exact string persisted in `url` and the key used for dedup. Enough to dedup reliably without altering meaning.
6. **Duplicate detection (Q80).** Compare the normalized `url` against all existing references (case-sensitive on the already-normalized string). On an exact match → **block the save**, inline error `Cette URL existe déjà`, return `409`. Same-host / different-path URLs are **allowed** (`…/a` vs `…/b` are distinct). On edit, the entity being edited is excluded from the comparison.
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

**Empty states:**
- No references at all (fresh/first-run): `// aucune référence` + `Ajoute un lien utile avec le bouton « + Référence ».`
- Search/filter active with zero matches: a distinct "no match for this filter" message (per the module-empty vs filter-empty split adopted for the library, Q51-style), inviting the user to clear the search/tag filter — not the same string as the truly-empty state.

### 8.8 Sidebar & tag filtering (Q83 / Q84)

On the References view the left sidebar is **references-specific**:

- The command-oriented **Categories** and command **Tags** sections are **replaced** by a single **reference Tags facet** — a `#tag <count>` chip list where each count reflects the number of references carrying that tag (reference tags only, not command tags). Chips are rendered like the library tag chips (uppercase section header `Tags`, wrap layout).
- The **Variables** panel is **hidden** in the References view: variable substitution applies only to command templates (Q34), so it has no effect here; hiding it removes a control that would otherwise navigate the user away. (Q84 explicitly leaves "keep or hide Variables" to the implementer; hidden is chosen for clarity.)

**Filtering behavior:**
- Clicking a tag chip (in the sidebar facet **or** on a card) toggles a single active reference-tag filter (`activeRefTag`, a scalar). Clicking the active tag again clears it. Single-select is the v1 default (simplest, mirrors the prototype's scalar `activeTag`); multi-select OR (as adopted for the library in Q42) is a possible later enhancement.
- The active tag filter combines with the search query with **AND** (a reference must match the query *and* carry the active tag).
- Selecting a reference tag must **not** navigate to the Library view (the prototype bug where clicking a tag forced `view:'library'` is closed for reference tags — they stay in References).
- Reference tags share the global tag namespace with command tags (Q6): a global tag rename/merge/delete (Q47) rewrites reference tags too. The References facet simply counts whichever tags currently exist on references.

### 8.9 CRUD

Full CRUD (D6). The prototype was add-only; edit and delete are added.

**Create (Q87).** `+ Référence` opens the `Nouvelle référence` modal with fields Titre / URL / Description / Tags (comma-separated). Only **URL is required**; Titre is optional and defaults to `displayDomain` when blank. On submit the URL runs the §8.3 pipeline; on any failure the modal stays open with the field-level inline error; on success the server mints the ULID, persists the normalized row, the modal closes, and a `Référence ajoutée` toast appears.

**Edit (Q15).** A pencil icon on each card reopens the **same modal, prefilled** (title `Modifier la référence`), preserving the `id`. It edits all mutable fields (title, url, desc, tags). Submit runs the identical validation/normalization/dedup pipeline (dedup excludes the row itself). Commit via `PATCH /api/references/:id`; on `409`/`400` the modal stays open with the inline error.

**Delete + undo (Q16).** Deliberately **asymmetric** vs commands (which use a destructive confirmation dialog, Q13): references delete via the `✕` affordance **immediately, with no confirmation dialog**, and show an **undo toast**: `Référence supprimée · Annuler`. Mechanics (keeps ULIDs stable, no special restore endpoint):
- On `✕`, the reference is removed from client state immediately (optimistic) and the undo toast appears (~5 s).
- The server `DELETE` is **deferred** until the toast dismisses/expires; **Annuler** cancels the deferred request and restores the row verbatim (same ULID) in the UI — no round-trip, because nothing was sent.
- If the toast expires, the `DELETE` flushes through the normal write/retry path.
- If the page reloads during the undo window, the reference survives (the DELETE had not been sent) — acceptable, reload never loses data.

**Tag normalization on write (Q47).** The comma-separated tags input is split on commas; each token is trimmed, a leading `#` stripped, lowercased, deduped case-insensitively; commas are forbidden inside a tag (they are the separator), spaces are allowed. Empty tokens are dropped.

### 8.10 Ordering & sort (Q86)

References have no manual reorder (Q10 — no `position` column; a curated list of links does not need drag-reorder). The References view offers a small client-side **sort toggle** with three options — **Titre** (default), **Domaine**, **Ajout récent** (by `createdAt` descending). Default sort is **alphabetical by title**, case/accent-insensitive, with `createdAt` as the tiebreak.

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

The Cheatsheet module (**« Cheatsheet »**, fourth tab) compiles selected library commands into ordered, target-scoped documents that a pentester exports as Markdown or PDF, or copies straight into a terminal. Unlike the prototype's single global `selected[]`, v1 supports **multiple named cheatsheets** (D1), each a tab reusing the roadmap tab/CRUD UX. Every cheatsheet resolves its command bodies against the **single global variable value set** (D2, Q90) — there is no per-sheet value snapshot in v1.

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
- **Create** — a « + Cheatsheet » affordance → `POST /api/cheatsheets` (§4.6.7). The new (empty) sheet becomes active. Default title « Cheatsheet » if none supplied yet.
- **Rename** — editing the in-panel title input (§9.3) renames the sheet; the tab label updates live (debounced autosave, D3). No separate rename dialog.
- **Delete** — destructive **confirmation** (mirrors roadmap delete, Q70) → `DELETE /api/cheatsheets/{id}`; cascades to its entries (Q19). After deleting the active sheet, the previous tab becomes active (or the first remaining). Deleting the last sheet is allowed → empty tab-bar state (§9.9).

**Active sheet & persistence:**

- Exactly one cheatsheet is **active** at a time. The active-sheet ID is **device-local (localStorage)**, not persisted server-side (Q112) — same treatment as the active roadmap.
- On load: restore the last active sheet; if absent/deleted, fall back to the first sheet.
- **First-run seed:** one empty default cheatsheet titled « Cheatsheet — HTB Lab » (faithful to the prototype default), `target` empty. Seeded first-run-only (Q133); never re-seeded.

**Add-to-active toggle & nav badge (Q91):**

- The Library card action toggles membership in the **active** sheet only:
  - Not present → « + Cheatsheet »; click → `POST /api/cheatsheets/{activeId}/entries` `{commandId}` → label flips to « Ajoutée ✓ »; toast « Ajoutée à la cheatsheet ».
  - Present → « Ajoutée ✓ »; click → `DELETE .../entries/{entryId}` → label flips back; toast « Retirée de la cheatsheet ».
- The top-nav « Cheatsheet » button shows a **count badge = number of entries in the active sheet**.
- Switching the active tab re-evaluates **every** library toggle and the badge against the new active sheet.
- Add is **idempotent** server-side: re-adding an already-present command returns the existing entry (`200`) rather than duplicating (Q93, composite unique index).

---

### 9.3 Cheatsheet view — header, entries, ordering (Q92, Q93, Q94, Q95, Q96, Q98)

**Header (persisted, round-trips in export — Q92):**

- Title input — placeholder « Titre de la cheatsheet ». Bound to `Cheatsheet.title` (autosaved, D3). Stored verbatim; export/print fall back to « Cheatsheet » when title is empty/whitespace (faithful to prototype `sheetTitle || 'Cheatsheet'`). Empty title shows « Cheatsheet sans titre » on its tab.
- Target input — placeholder « Cible / contexte (ex : HTB — Sauna) ». Bound to `Cheatsheet.target` (optional). Autosaved.
- Metadata chip row — resolved non-empty NON-sensitive variable chips (§9.5); always shown on-screen (memory-only values), format `$NAME value`.

**Entries (Q93, Q94):**

- **Commands only** in v1 (Q94); no free text, references, or methodology steps.
- Each entry is a **live reference** to its command by ID (Q93): title, template, description, tool badge, and shared note are read live, so editing the underlying command reflects immediately. A command appears **at most once** per sheet.
- Entry rendering (per prototype cheatsheet row): position index, title, tool badge, ↑ / ↓ / ✕ controls, optional description, code block with per-command copy button, and the shared note.
- Code block shows variable parts with resolved-only green highlighting on-screen (§5 resolver): resolved tokens green, undefined/empty tokens rendered in the distinct dangling style (Q31/Q32).

**Notes (Q95, Q96, Q97):**

- One shared personal note per command (Q95), stored in the note map keyed by command ID (§3.2.10, Q97).
- **Editable inline from the cheatsheet entry AND the library card**, writing to the same store (Q96) via `PUT /api/notes/{commandId}`. Empty/whitespace deletes the note. Included in JSON export (Q97/Q124); never placed in browser storage (Q112).

**Reorder (Q98):**

- **Flat manual order via ↑ / ↓ buttons.** No DnD, no auto-grouping by category/tool in v1.
- ↑ on the first entry and ↓ on the last are no-ops (disabled). Each move swaps adjacent `position`s and persists via `POST /api/cheatsheets/{sheetId}/entries/reorder` `{orderedIds}` (§4.7), optimistic (D3).
- **Remove** (✕) → `DELETE .../entries/{entryId}`; the underlying command is untouched.

---

### 9.4 Variable resolution & the per-export resolve toggle (D2, Q90, Q99)

- Resolution uses the **single global value set** held in browser memory (D2, Q90). No per-sheet snapshot.
- The **resolver** is the shared §5 resolver: single left-to-right pass (Q35); `\$` escapes a literal `$` (Q33); only **defined AND non-empty** names substitute; undefined or defined-but-empty tokens remain visible as `$TOKEN` (Q31/Q32) — even when the resolve toggle is ON.

**Per-export resolve toggle (Q99):**

- A checkbox « Résoudre les variables » sits in the cheatsheet toolbar next to the export buttons. **Default OFF (raw).** It is a **transient per-export choice**, not a stored setting (§4.8) — it resets to OFF each session.
- **OFF (default, raw):** Markdown and PDF emit raw `$TOKEN` command bodies and **omit** the variable-value metadata block (no concrete values reach disk — maximal OPSEC posture, Q99).
- **ON (resolved):** command bodies are resolved via the resolver above, and the metadata block is emitted (§9.5). Sensitive variables resolve too (the toggle is the explicit opt-in); sensitive **values are still excluded from the metadata block** (§9.5, Q100), but a sensitive token used inside a command body **is** substituted when resolve is ON.
- **The clipboard is unaffected by this toggle** — Copier / Copier tout are always resolved (§9.8, Q53/Q105).

> **Open:** Q99 (raw-by-default) and Q100 (metadata block) are both locked, but the sources do not state whether the value-metadata block is itself gated by the resolve toggle. This spec gates it (raw export ⇒ no concrete values anywhere), as the only reading consistent with the locked principle « rien de sensible gravé sans action explicite ». Target text and the export date are non-values and are always included. Confirm if a raw export should instead still print non-sensitive variable values in metadata.

### 9.5 Export metadata (Q100, Q101)

A single unified metadata definition drives the on-screen chip row, the Markdown blockquote, and the PDF header (Q100 — same data set and format across all three surfaces):

**Metadata data set (in order):**

1. **Cible** — the sheet `target`, if non-empty. Always included (both raw and resolved exports; it is user free text, not a variable value).
2. **Export date** — `YYYY-MM-DD` (local date). Always included (Q101). Rendered « Exporté le `<date>` ».
3. **Variable values** — every **non-empty, NON-sensitive** variable (standard + custom) in the canonical order `$IP, $LHOST, $LPORT, $USER, $DOMAIN` then custom vars by definition order (Q100). Sensitive variables (`$PASS` by default) are **always excluded**, regardless of the resolve toggle. Emitted in exports **only when the resolve toggle is ON** (§9.4); always shown in the on-screen chip row.

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
- `@media print { .app { display:none } .printroot { display:block } }` — so **Ctrl+P from any view prints the active cheatsheet** (fixes the prototype's unconditional print of whatever view was mounted). The printroot always reflects the active sheet regardless of the current SPA tab.
- **Empty notice (Q107):** if the active sheet has zero entries, the printroot renders a minimal « Cheatsheet vide » notice instead of a blank page, and the « Exporter en PDF » button is a no-op with toast « Cheatsheet vide ».

**Page geometry & running furniture (Q107):**

- `@page { size: A4; margin: 1.4cm }`.
- **Running header** = cheatsheet title; **running footer** = « Exporté le `<date>` » plus a page number, implemented via `@page` margin boxes (`@bottom-*`) where supported and `position: fixed` repeating blocks otherwise. Reliable per-page page numbers are not guaranteed across engines under `window.print()`; the browser's own print header/footer may supply them.
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
- **OPSEC (Q53):** resolved text may contain sensitive values (e.g. the `$PASS` value). This is documented; manual clipboard clearing is recommended and an optional auto-clear is deferred (§12.6).
- Copier tout is intentionally different from the Markdown export (raw, structured) — documented (Q105).

### 9.9 Empty states & edge cases

- **No cheatsheets at all** (user deleted the last one): the tab bar shows an empty state inviting creation (« + Cheatsheet »); the view body shows no sheet. Export/copy/print are unavailable until one exists.
- **Empty cheatsheet** (0 entries): body shows « // cheatsheet vide » with « Ajoute des commandes depuis la bibliothèque avec le bouton « Cheatsheet ». ». Markdown/PDF/Copier tout are no-ops with toast « Cheatsheet vide ».
- **Empty title:** exports/print fall back to « Cheatsheet »; slug falls back to `cheatsheet`; tab shows « Cheatsheet sans titre ».
- **Command deleted while in a sheet:** its entries are removed via FK cascade (Q14/Q19); counts and badge update; no dangling entry remains.
- **Undefined/empty variable in a resolved export:** the `$TOKEN` is preserved verbatim in the output (Q31/Q32) rather than substituting an empty string.

### 9.10 UI strings (French — verbatim)

| Context | String |
|---|---|
| Nav tab | « Cheatsheet » (+ count badge) |
| New tab action | « + Cheatsheet » |
| Toolbar | « Copier tout » · « Markdown » · « Exporter en PDF » |
| Resolve toggle | « Résoudre les variables » |
| Title / target placeholders | « Titre de la cheatsheet » · « Cible / contexte (ex : HTB — Sauna) » |
| Selected count | « `{n}` commande(s) sélectionnée(s) » |
| Library card toggle | « + Cheatsheet » / « Ajoutée ✓ » |
| Empty sheet | « // cheatsheet vide » · « Ajoute des commandes depuis la bibliothèque avec le bouton « Cheatsheet ». » |
| Toasts | « Ajoutée à la cheatsheet » · « Retirée de la cheatsheet » · « Cheatsheet vide » · « Markdown exporté » · « Copié dans le presse-papier » |
| Markdown content labels | « Cible : » · « Exporté le `<date>` » · « Note : » |

### 9.11 REST endpoints recap (authoritative in §4)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cheatsheets` | Create a named cheatsheet (tab); becomes active |
| `PATCH` | `/api/cheatsheets/{id}` | Edit `title` / `target` (autosave, D3) |
| `DELETE` | `/api/cheatsheets/{id}` | Delete sheet + cascade entries (confirm) |
| `POST` | `/api/cheatsheets/{sheetId}/entries` | Add command to the active sheet (idempotent) |
| `DELETE` | `/api/cheatsheets/{sheetId}/entries/{entryId}` | Remove an entry |
| `POST` | `/api/cheatsheets/{sheetId}/entries/reorder` | Flat ↑/↓ reorder (`{orderedIds}`) |
| `PUT` | `/api/notes/{commandId}` | Upsert/delete the shared per-command note |

- Composition (entries + order + title/target) persists in SQLite and round-trips through `GET /api/export` (Q92/Q124). **Markdown and PDF are produced entirely client-side** — they are not `/api` endpoints, and the Q99 raw-token default applies to those artifacts, not to the JSON dataset export (which stores raw templates and no values by definition).

---

## 10. Persistence, Import/Export & Seed Governance

This section defines where every piece of application state lives, how mutations reach durable storage (autosave), how the whole dataset is exported and imported as a versioned JSON envelope, and how shipped seed content coexists with user edits across binary upgrades. It is **authoritative for the state-tier mapping and the bulk export/import endpoints**.

Locked architecture recap that governs this section: Go/Gin/GORM/SQLite single binary (SPA served via `go:embed`, same-origin API, bound to `127.0.0.1`); ULID server-minted IDs; Phases/Steps are first-class rows with stable IDs + `position` (D5); variable **definitions** are persisted but variable **values** are memory-only and never leave the process (D2, D7); multiple named cheatsheets (D1); no at-rest encryption because no sensitive data is ever persisted (D7).

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
| variable **definitions** (`{name,type,sensitive,hidden,isBuiltin,position}`) | BACKEND | `variable_definitions` table (D2, Q20). |
| variable **values** (`vars: {IP:…, LHOST:…}`) | **IN-MEMORY ONLY** | Never written to SQLite, `localStorage`, or IndexedDB; reset to empty on every reload (D2, D7). |
| `notes{}` (per-command free notes) | BACKEND | `notes` table keyed by `commandId` (Q95); orphan notes cascade-deleted with their command (Q14). |
| `checks{}` (methodology progression) | BACKEND | Boolean `done` column **on the Step row** — keyed by stable step ID, not by position (Q113, Q129). |
| `openSteps{}` (expanded step panels) | BACKEND | Boolean `expanded` column on the Step row. Per Q112 (decisions log) `openSteps` is backend-persisted; this supersedes the questionnaire's Q113 reco that had marked it ephemeral (see the §4.5 Open item). |
| `selected[]` (cheatsheet composition) | BACKEND | `cheatsheet_entries` rows (`cheatsheetId`, `commandId`, `position`) — ordered; **per named cheatsheet** (D1). |
| `sheetTitle` | BACKEND | `cheatsheets.title` (per cheatsheet, D1). |
| `sheetTarget` | BACKEND | `cheatsheets.target` (per cheatsheet, D1). |
| named cheatsheets themselves | BACKEND | `cheatsheets` table (`id`, `title`, `target`, `position`) (D1). |
| `theme` (`'dark'`/`'light'`) | DEVICE-LOCAL | `localStorage["cheat.theme"]`. |
| `view` (last active module: library/methodology/references/cheatsheet) | DEVICE-LOCAL | `localStorage["cheat.lastView"]`. |
| `activeRoadmap` (last active roadmap id) | DEVICE-LOCAL | `localStorage["cheat.lastRoadmapId"]` (Q69). |
| last active cheatsheet id | DEVICE-LOCAL | `localStorage["cheat.lastCheatsheetId"]` — mirrors the roadmap pref (D1 tab UX). |
| `activeCat`, `activeTool`, `activeTag`, `query` | IN-MEMORY ONLY | Library filters/search — reset per module (Q41). |
| `expanded{}` (library category/tool tree) | IN-MEMORY ONLY | Accordion state of the **library sidebar** (distinct from the persisted methodology `step.expanded`). |
| `methodEdit` (methodology edit-mode toggle) | IN-MEMORY ONLY | |
| `adding`, `newCatOpen`, `addingRef`, `newRmOpen` | IN-MEMORY ONLY | Modal/open-form flags. |
| `draft`, `draftRef`, `stepDrafts`, `addPhaseLabel`, `newRmLabel` | IN-MEMORY ONLY | Unsaved form drafts. |
| `dragStep`, `dragOverSi`, `dragPhase`, `dropIndex` | IN-MEMORY ONLY | Transient drag/drop coordinates — **never** persisted (Q117). |
| `toast` | IN-MEMORY ONLY | Transient notification text. |

#### 10.1.2 Sensitive-data prohibition (hard constraint — D7, Q112)

- Variable VALUES (which may hold real IPs, credentials, domains) exist **only** in the running SPA's memory. They are never sent to any persistence endpoint, never written to `localStorage`/`sessionStorage`/IndexedDB/Cache Storage, and never included in any export (see §10.4).
- `commands`, `references`, `notes`, and variable **definitions** are domain content that lives **only** in SQLite — they are **never** cached in `localStorage`/IndexedDB either (this keeps the "no content in browser storage" rule simple and absolute).
- The only permitted `localStorage` keys are the four device-local preference keys listed above. All are non-sensitive; none carry user content.
- Because nothing sensitive is ever persisted at rest, the SQLite file is stored **unencrypted** (D7) — there is no SQLCipher, no passphrase.

> **Open:** none — the tiering is fully specified by Q112 and D7.

---

### 10.2 Autosave (D3)

The app has **no "Enregistrer" button**. All backend-tier mutations are persisted automatically and optimistically. (API-level write semantics are authoritative in §4.4.)

#### 10.2.1 Debounce & granularity (D3, Q111, Q117)

- **Optimistic + per-entity + debounced ~500 ms.** A mutation updates React state immediately (UI never blocks on the network) and schedules a debounced write of the affected entity.
- Debounce is **keyed per entity instance**, so editing two different commands schedules two independent writes; rapid keystrokes on one field collapse into a single trailing write ~500 ms after the last change.
- **Structural reorders persist once, on commit, never during drag** (Q117): a step/phase drag persists the affected roadmap exactly once **on drop**; each cheatsheet `↑/↓` click persists that cheatsheet once. Transient `dragover`/`dropIndex` state is never sent.
- Each debounced write targets the per-entity REST endpoint (PATCH/POST/DELETE `/api/<entity>/<id>` — full catalog in §4). This section owns only the bulk export/import endpoints (§10.4).

#### 10.2.2 Optimistic writes, retry, and failure indicator (D3, Q114)

- Writes are optimistic with a **background retry queue**. On a failed write, the mutation is re-queued with backoff and retried; retries also flush automatically when the window regains focus / connectivity returns.
- **The retry queue is IN-MEMORY ONLY.** It is **not** persisted to `localStorage`, because queued mutations can contain command/note content, which §10.1.2 forbids in browser storage. This is a deliberate reconciliation: the Q114 reco floated a short `localStorage` retry queue, but the higher-priority Q112/D7 constraint overrides it — the queue stays in memory.
- **Indicator policy (D3): success is silent; only errors surface.** There is no persistent "Enregistré/Enregistrement…" badge. When a write fails persistently (retries exhausted or backend unreachable — e.g. the embedded binary was stopped with a tab still open), a non-blocking indicator/toast appears, in French, e.g. `« Échec de l'enregistrement — nouvelle tentative en cours »`, and clears once the queue drains.
- **No rollback.** For a single-user local tool, optimistic edits are kept in the UI even while a write is pending/failing; the retry queue is responsible for eventual convergence (Q114).

#### 10.2.3 Flush on unload / shutdown (Q121)

- **Client:** on `visibilitychange` (hidden) and `beforeunload`, the app synchronously flushes every pending debounced write and drains the retry queue using `fetch(..., {keepalive:true})` / `navigator.sendBeacon`, so a normal tab close does not lose the last edit.
- **Server:** on `SIGINT`/`SIGTERM`, the backend drains in-flight writes and closes the DB cleanly before exit.
- **Residual data-loss window:** if the tab process is force-killed within the ~500 ms debounce window before an unload flush can run, the last un-flushed keystroke may be lost. This sub-second window is the accepted cost of the debounced-autosave model (D3).

#### 10.2.4 Concurrency (Q115, Q116, Q123)

- **Multi-tab (same binary):** last-write-wins per entity, using an `updatedAt` column. A lightweight cross-tab refresh (BroadcastChannel or `storage` event) plus refresh-on-window-focus keeps open tabs reasonably converged. No SSE/WebSocket live sync in v1.
- **SQLite writer discipline:** open the DB in **WAL** mode with a `busy_timeout`, and serialize writes (max-open-conns = 1 or a single write mutex) so debounced autosaves never raise `SQLITE_BUSY`.
- **Two separate processes on the same DB file:** the binary takes an advisory lock (on the DB file or the listen port) at startup; a second instance pointed at the same `--db` **refuses to start** with a clear message rather than risking concurrent-writer corruption (Q123).

---

### 10.3 Persistence infrastructure

#### 10.3.1 DB location & bootstrap (Q118, Q120)

- **DB path:** defaults to a per-user data directory (e.g. `$XDG_DATA_HOME/cheat/cheat.sqlite`, falling back to `~/.local/share/cheat/cheat.sqlite`); overridable via `--db <path>` flag or `CHEAT_DB` env var. Documented as the file-copy backup target (Q137).
- **Bootstrap flow:** on startup the binary opens/creates the DB, runs migrations (§10.3.2), and **seeds only if the DB is empty** (§10.5). The SPA loads the full dataset via a single `GET /api/state` (§4.5), then issues per-entity writes for subsequent mutations (Q118).

#### 10.3.2 Schema versioning & migration (Q119)

- A `schema.version` row is tracked in the DB (`Setting`, §3.2.11). Additive changes use GORM `AutoMigrate`; breaking changes use explicit, ordered, numbered migrations.
- **Migrations are non-destructive** and **an automatic file-copy backup of the DB is taken before any breaking migration**. User data is never dropped by a migration.

#### 10.3.3 Stale embedded SPA after upgrade (Q122)

- Bundle assets are content-hashed with long cache lifetimes; `index.html` is served `no-cache`.
- The binary exposes its embedded build version (`meta.appVersion` in `GET /api/state` and the `X-Cheat-Version` response header, §4.1). The SPA compares the served API version to its own bundle version and, on mismatch, warns/reloads so a cached old UI never drives a newer API.

---

### 10.4 Export / Import (D4, Q124, Q125, Q132)

All JSON dataset export/import is **server-side** (SQLite is authoritative): the server streams the export and validates+applies the import in one transaction (Q132). Cheatsheet Markdown/PDF remain client-side artifacts and are **out of scope here** (they are export-only, never re-imported — Q140; and are raw-token by default per Q99).

#### 10.4.1 Versioned envelope (Q128, Q142)

Every export is a single JSON envelope (this is the authoritative shape; §4.9 shows a subset view):

```json
{
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "schemaVersion": 7,
  "seedVersion": 3,
  "exportedAt": "2026-07-15T14:03:22Z",
  "data": {
    "categories":           [ { "id": "...", "label": "...", "color": "#3ddc97", "isBuiltin": true,  "position": 0 } ],
    "commands":             [ { "id": "...", "title": "...", "template": "...", "categoryId": "...", "tool": "Divers", "desc": "", "tags": [], "language": null } ],
    "references":           [ { "id": "...", "title": "...", "url": "https://...", "desc": "", "tags": [] } ],
    "variableDefinitions":  [ { "id": "...", "name": "IP", "type": "text", "sensitive": true, "hidden": false, "isBuiltin": true, "position": 0 } ],
    "notes":                { "<commandId>": "..." },
    "roadmaps": [ {
        "id": "...", "label": "...", "position": 0,
        "phases": [ {
            "id": "...", "label": "...", "position": 0,
            "steps": [ { "id": "...", "text": "...", "commandId": "... | null",
                         "done": false, "expanded": false, "position": 0 } ]
        } ]
    } ],
    "cheatsheets": [ {
        "id": "...", "title": "...", "target": "", "position": 0,
        "entries": [ { "id": "...", "commandId": "...", "position": 0 } ]
    } ]
  }
}
```

Envelope rules:

- **Timestamps** are ISO 8601 UTC in the envelope and in DB columns; the UI/MD/PDF render dates in French locale (`dd.mm.yyyy`) (Q142).
- **`formatVersion`** gates import compatibility (§10.4.4). `appVersion` and `seedVersion` are informational; `schemaVersion` documents the source schema.
- **`notes`** is a map keyed by command id (`{ commandId: text }`) — consistent with §3.2.10 / §4.5.
- **Cheatsheet composition** is an ordered `entries[]` list (`commandId` + `position`) — consistent with §3.2.9 / §4.6.
- **Progression is embedded on each step** (`done`, `expanded`) with stable IDs — there is **no separate positional progression map**, so progression survives any reorder/edit between export and import (Q129).

#### 10.4.2 What the export contains — and what it never contains (D4, Q124)

**Included** (all durable content + non-ephemeral user state):

- All `categories` (builtin **and** custom, with colors) — the export is self-contained (Q135).
- All `commands`, `references`, per-command `notes`.
- All `roadmaps` → `phases` → `steps`, including `commandId` links and per-step `done`/`expanded` progression.
- All variable **definitions**.
- All named `cheatsheets` with their ordered `entries`, `title`, and `target` (D1).

**Excluded, always:**

- **Variable VALUES** — never serialized under any option (D2, D7). There is **no** "resolve values" toggle on the JSON export; the JSON dataset is unconditionally value-free. (Only the separate cheatsheet MD/PDF export can materialize resolved values, and even that emits raw `$TOKEN`s by default per Q99.) This hard rule supersedes the softer "toggle sanitised/full" phrasing in the Q124 questionnaire reco.
- **Device-local preferences** (`theme`, last view/roadmap/cheatsheet) — UI prefs stay out of the dataset (Q124).
- **All ephemeral view/interaction state** (filters, query, drafts, drag state, modals, toasts, library sidebar tree).

#### 10.4.3 Endpoints

| Method & path | Purpose | Behavior |
|---|---|---|
| `GET /api/export` | Full dataset export | 200; streams the §10.4.1 envelope; `Content-Disposition: attachment; filename="cheat-export-<YYYYMMDD-HHmmss>.json"`. Never contains variable values. |
| `POST /api/import?mode=replace` | Backup restore (**default**) | Validate → snapshot → REPLACE in one transaction → return summary (§10.4.7). |
| `POST /api/import?mode=merge` | Additive merge (distinct action) | Validate → snapshot → MERGE in one transaction → return summary (§10.4.7). |
| `POST /api/import/seed-pack` | Apply the binary's embedded updated seed pack | MERGE semantics against the embedded pack (§10.5.3). |
| `GET /api/seed-pack` | Preview the embedded seed pack envelope | 200; same envelope shape; read-only. |
| `POST /api/factory-reset` | Guarded wipe + re-seed | Auto-export backup → wipe all tables → re-seed first-run dataset → return summary + `snapshotPath` (§10.5.4). |
| `GET /api/backup.sqlite` | Optional raw DB download | Streams a consistent copy of the SQLite file as a same-version quick backup (Q137); not guaranteed portable across versions. |

- **`mode`** query param defaults to `replace` when omitted. Only `replace` and `merge` are accepted; any other value → `400`.
- All import endpoints accept the envelope as the request body (uploaded file). Validation, migration, and application happen **entirely server-side** (Q132).

#### 10.4.4 Validation & compatibility policy (Q128, Q131)

Applied before any mutation; on any failure the whole import is rejected with a clear message and **zero** changes:

1. **Structural/schema validation** — reject truly malformed or structurally invalid envelopes; enforce sane size/count limits (`422 IMPORT_SCHEMA_INVALID`).
2. **Version gate** — forward-migrate envelopes with an **older** `formatVersion`; **refuse** envelopes with a `formatVersion` newer than the running binary (`422 IMPORT_VERSION_TOO_NEW`), with a clear "fichier plus récent que l'application" message.
3. **URL sanitization** — neutralize/flag any reference `url` outside the `http`/`https`/`mailto` allowlist (Q78, §8.4); no dangerous scheme reaches an `<a href>`.
4. **Dangling internal references** — for an otherwise-valid file, **repair-and-warn**: a `step.commandId` or `cheatsheet.entries[].commandId` pointing at a missing command is nulled/dropped and reported in the summary; unknown `categoryId` on a command is remapped to `Autre` (Q52, Q135). Nothing is silently discarded.

#### 10.4.5 REPLACE flow (D4, Q125, Q130, Q127, Q139) — the default

1. **Confirmation.** The UI shows an explicit destructive confirmation, in French, e.g. title `« Remplacer toutes les données ? »`, body noting a backup snapshot is created automatically, buttons `« Annuler »` / `« Remplacer »`.
2. **Automatic pre-import snapshot.** Before touching data, the server writes a timestamped backup (full JSON export and/or DB file copy) so the prior state is always recoverable.
3. **Atomic all-or-nothing transaction.** The entire dataset is replaced inside one SQLite transaction; any error rolls back completely — the vault is never left half-replaced (Q130).
4. **IDs preserved.** Incoming IDs are kept verbatim for round-trip fidelity; `step.commandId` and cheatsheet `entries` links are preserved as-is (Q127).
5. **Round-trip guarantee.** Export → REPLACE-import reproduces an equivalent state including IDs and all user-visible ordering (positions) and progression — an acceptance-test requirement (Q139).

#### 10.4.6 MERGE flow (Q125, Q126, Q127, Q136) — distinct, opt-in

- Exposed as a **separately labeled action**, never the default. Also pre-snapshots before applying.
- **ID collisions (Q126, Q127):** local wins by default; if incoming **user** content shares an ID but differs in content, it is imported under a **new server-minted ID** and its internal references (`step.commandId`, cheatsheet `entries`) are rewritten in the same transaction — never a dangling link.
- **Variable definitions (Q136):** merged **by name** (conflicts renamed or skipped). Variable **VALUES are irrelevant to import** — they are memory-only and are never present in the envelope, so a merge can never clobber a live-engagement value.
- **Categories (Q135):** upserted by ID/key; incoming label/color kept for unknown keys; no command is orphaned.
- Returns the same summary as REPLACE.

#### 10.4.7 Import summary (returned to the UI)

Every import returns a machine-readable summary the UI renders as a toast/report:

```json
{
  "mode": "replace",
  "snapshotId": "backup-20260715-140322",
  "counts": {
    "commands":   { "added": 24, "replaced": 0, "skipped": 0, "reIded": 0 },
    "references": { "added": 6,  "replaced": 0, "skipped": 0, "reIded": 0 }
  },
  "warnings": [
    "2 étape(s) référençaient une commande absente — lien retiré.",
    "1 commande référençait une catégorie inconnue — reclassée dans « Autre »."
  ]
}
```

#### 10.4.8 Scope of export/import (Q137, Q138, Q140, Q141)

- **v1 = full-dataset JSON only** (plus the existing cheatsheet MD/PDF client exports). No per-entity/selective JSON export in v1 (Q138).
- **Raw `.sqlite`** download is offered as a documented same-version quick backup (Q137), not the canonical portable format.
- **Backups are manual**, complemented by the automatic pre-import/pre-reset/pre-breaking-migration snapshots (Q141). No scheduled auto-snapshots in v1.
- Markdown/PDF are cheatsheet-scoped, export-only; **Markdown re-import is not supported** (Q140).

---

### 10.5 Seed governance (Q133, Q134, Q67, Q18)

#### 10.5.1 First-run-only seeding (Q133)

- The binary ships a seed dataset (18 categories, the standard variable **definitions**, the seed commands/references/roadmaps, and one default empty cheatsheet « Cheatsheet — HTB Lab » with an empty `target`) embedded via `go:embed`.
- **The seed is applied exactly once: at first run, only when the DB is empty.** After that the seed logic never touches the DB again.
- Seeded rows are **ordinary, fully editable/deletable rows** with the same cascade rules as user-created content, and they export like any other row (Q18). Seed IDs are preserved literal (D5).

#### 10.5.2 No automatic re-seed on upgrade (Q133)

- Upgrading the binary **never** re-seeds, upserts, or "refreshes" existing content. A user's edits and deletions are authoritative.
- **Deleted seeds are never resurrected.** Because seeding is strictly first-run-only, deletions are permanent by construction — **no tombstones are needed**.

#### 10.5.3 Updated seed content = optional importable "seed pack" (Q133)

- When a newer binary ships updated/added seed content, that content is delivered as an **optional, importable seed pack** (a standard versioned JSON envelope, embedded in the binary and/or downloadable).
- The user pulls it in explicitly via `POST /api/import/seed-pack` (or the standard MERGE import), surfaced in French as e.g. `« Importer le pack de contenu par défaut »`.
- Applied with **MERGE** semantics: it **adds** new seed items and **never overwrites** the user's edited rows and **never** re-creates rows the user deleted.
- A `seed.version` is tracked and displayed so the user can see whether a newer pack is available; it is informational only and does not trigger any automatic action.

#### 10.5.4 Factory reset (Q134) & restore-defaults (Q67)

- **Factory reset** (`POST /api/factory-reset`) is a distinct, explicitly guarded action: it **first exports an automatic backup**, then wipes all user data and re-seeds the first-run dataset. Confirmed in French, e.g. `« Réinitialisation d'usine »`, and clearly separated in the UI from methodology progression reset.
- **"Restaurer les méthodologies par défaut"** (Q67, §7.2) is a narrower, methodology-scoped action that re-adds only the default roadmaps missing from the current set (fresh IDs, zeroed progression). It is not a global reset and does not touch other content.
- Both are distinct from the per-roadmap progression reset (`« Réinitialiser la progression »`, Q57, §7.9).

> **Open:** none — Q133/Q134 fully specify seed lifecycle; tombstones are explicitly out by design.

---

## 11. Visual System & UX

This section is the implementation-ready contract for Cheat's visual language and interaction shell. It is a faithful port of the Claude Design prototype (`OSCP_Vault.dc.html`), with the locked deviations required by the decisions log (self-hosted fonts, WCAG 2.1 AA remediation, tiered notifications). All numeric token values below are transcribed **verbatim** from the prototype's `renderVals()`; do not re-derive them.

**Non-negotiable framing (locked):**
- **Density and accent are fixed constants in v1** — they are NOT user settings. Faithful to the design, not configurable (Q157, Q158).
- **Desktop-only strict layout** with a hard minimum width; below it the shell scrolls horizontally rather than reflowing (D8, Q143, Q144).
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

**Responsive strategy (D8 — locked, overrides the Q143 "graceful degradation" reco):** the app is **desktop-only strict**. A hard `min-width` is enforced on the app shell; **below it the entire shell scrolls horizontally** (a single outer `overflow-x: auto`), it does **not** reflow, wrap, or collapse into a tablet/mobile layout. No mobile redesign in v1.

- **Minimum width (Q144 — locked):** hard app min-width **≈1024px** (the shell is authored against a 1280px reference). Below 1024px → horizontal scroll of the shell, chrome is never re-laid-out.
- **Top-bar overflow (Q146):** D8 supersedes the Q146 "collapse priority" reco. The top bar is **fixed and does not condense/wrap**; when space is insufficient it participates in the shell's horizontal scroll. Do not shrink the search or convert tab labels to icons in v1.

#### 11.5.1 Top bar (53px, fixed)

`height: 53px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--surface)`. Left → right:

| Zone | Spec |
|---|---|
| **Brand** | `27×27` tile, background `--acc-dim`, centered emoji `💩` (17px) + wordmark « Cheat » (14.5px, weight 600, `letter-spacing: -.01em`). Emoji brand kept in-app (Q162). |
| **Segmented control (4 tabs)** | Container: `display:flex; background: var(--elev); border: 1px solid var(--border2); padding: 3px; gap: 2px`. Buttons: base `padding:5px 11px; font-size:12.5px; font-weight:600; background:transparent; color:var(--muted)`; **active** = `background: var(--border2); color: var(--text)` (neutral, not accent). Labels verbatim: **« Bibliothèque »**, **« Méthodologie »**, **« Références »**, **« Cheatsheet »**. |
| **Cheatsheet count badge** | Rendered inside the « Cheatsheet » tab only when ≥1 command is selected: `background: var(--acc); color: var(--on-acc); min-width:17px; height:17px; font-size:10.5px; font-weight:700; padding:0 4px`. Shows the selected-command count (D1 cascade: count is for the **active** cheatsheet). |
| **Spacer** | `flex: 1`. |
| **Per-module search** | Wrapper `width: 280px; position: relative`. Mono glyph `⌕` absolutely positioned left (`--faint`). Input: `width:100%; background:var(--surface2); border:1px solid var(--border2); color:var(--text); font-size:13px; padding:7px 10px 7px 30px`; focus → `border-color: var(--acc-line)`. Placeholder « Rechercher… ». **Search is per-module (Q41):** it drives only Bibliothèque and Références; it is **disabled/hidden** in Méthodologie and Cheatsheet where it has no effect, and its query resets on module change. |
| **Contextual add button** | Rendered only when the current view supports adding (`showAdd`). `border:1px solid var(--acc-line); background:var(--acc); color:var(--on-acc); padding:7px 12px; font-size:12.5px; font-weight:600`; hover `filter: brightness(1.08)`. Leading « + » glyph (15px) + `addLabel`. Label is contextual per view: **« + Commande »** (Bibliothèque), **« + Méthodologie »** (Méthodologie), **« + Référence »** (Références). Hidden on Cheatsheet. |
| **Theme toggle** | `34×34; border:1px solid var(--border2); background:var(--surface2); color:var(--muted)`; hover → `border-color: var(--acc-line); color: var(--acc)`. `title="Basculer le thème"`. |

#### 11.5.2 Left sidebar (272px)

`width: 272px; flex: none; border-right: 1px solid var(--border); background: var(--surface); overflow-y: auto; padding: 17px 14px; display: flex; flex-direction: column; gap: 24px`.

**Contents are view-dependent (Q167 — locked):**
- **Bibliothèque:** full sidebar — **Variables** panel, **Catégories** tree, **Tags** list.
- **Méthodologie & Cheatsheet:** render **only the Variables panel**. Catégories and Tags are hidden (they only make sense in the library and would otherwise navigate the user out of the current tab).
- **Références:** the sidebar renders the reference **Tags facet** (§8.8) and **hides the Variables panel** (variable substitution has no effect on references, Q34/Q84).

Panels:
- **Variables** — header row: « Variables » (section-header style) + « live » (mono, 10px, `--faint`) marking that values are session-memory-only (never persisted). Each row: fixed `$KEY` label (`width:60px; mono 11.5px; color:var(--acc)`) + value `<input>` (`background:var(--code); border:1px solid var(--border); mono 11.5px; padding:5px 8px`; focus → `--acc-line`). The 6 standard variables are pinned on top in canonical order `IP, LHOST, LPORT, USER, DOMAIN, PASS`; custom rows follow with hover rename/delete affordances; an inline « + Variable » row appends. (Full behavior in §5.)
- **Catégories** — header « Catégories »; a total row (`8×8` `--muted` square + « Toutes » + global count) then the collapsible category→tool tree. Chevron toggle buttons (`--faint`, 16×26). Counts are mono `--faint` and are **global totals**, independent of the active filter.
- **Tags** — header « Tags »; tag buttons rendered `#name` + trailing mono `--faint` count; active tag styled with accent.

**Sidebar collapse (Q145):** a manual collapse toggle is provided in the top bar; collapsed state is persisted **device-local** (same bucket as theme). Because D8 uses hard-min-width + horizontal scroll rather than breakpoint reflow, the reco's "auto-collapse under a breakpoint" is **not** implemented — collapse is manual only.
> **Open:** Q145's collapse toggle is adopted-by-default but was flagged "confirm for v1"; if a reviewer wants the leanest v1, the sidebar can ship always-visible (drop the toggle) with no other impact. Recommend keeping the manual toggle.

#### 11.5.3 Content pane & reading-width caps (Q147)

The content pane fills the remaining width and scrolls vertically. **Reading-width caps are asymmetric and locked:**
- **Méthodologie:** capped at `820px`, centered.
- **Cheatsheet:** capped at `840px`, centered.
- **Bibliothèque & Références:** **uncapped** (fill the pane) — density is prioritized over line length for the card grids.

---

### 11.6 Notification & Confirmation Model (Q196 — locked)

The prototype's single-slot, non-interactive, 1.7s auto-dismiss toast (`flash()`) is **replaced** by a tiered messaging contract shared by every feature that needs to communicate. Four tiers + a small queue:

| Tier | Trigger | Behavior | Dismissal |
|---|---|---|---|
| **Transient success toast** | Non-destructive success (copy OK, save OK, import summary line, variable rename cascade count) | Bottom/corner slot, `aria-live="polite"` region | Auto-dismiss ~2s; no action |
| **Action toast (with Undo)** | Reversible destructive action: reference delete (Q16), phase/step delete (Q70) | Persists longer (~6–8s) with an « Annuler » action; invoking it reverses the mutation | Auto-dismiss after window, or on « Annuler » / manual close |
| **Persistent error toast/banner** | Save failure, import failure, retry-queue error, copy failure (Q53) | Stays **until explicitly dismissed**; distinct error styling (uses `--danger`); may carry a « Réessayer » action | Manual dismiss only |
| **Confirm dialog (modal)** | Irreversible / high-impact destructive action: delete command (Q13/Q14), delete category with reassignment (Q17), delete roadmap + « Réinitialiser la progression » (Q57/Q70), REPLACE import (D4) | Blocking `role="dialog"` modal, states the impact + reference/affected count, requires explicit confirm; destructive button uses `--danger` | Confirm / Cancel / Escape (Escape = cancel) |

**Queue (Q196):** notifications are managed by a **small bounded queue** (not a single replaceable slot). Concurrent messages stack; the queue has a small cap (e.g. 3–4 visible), older transient toasts age out first. Error toasts are not evicted by the cap — they persist independently until dismissed.

**Copy semantics (Q53 / OPSEC):** copy actions report the **real** clipboard result (success or failure), not an always-success toast. The clipboard always receives the **resolved** command (variables substituted) — this is the one deliberate exception to the raw-token export posture (Q99). The OPSEC implication (resolved values incl. `$PASS` reach the clipboard) is documented in §12.6; exported files remain raw by default.

**Live region:** the transient/error toast container is wrapped in an `aria-live="polite"` region so screen readers announce it (Q151).

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

- **Print root styling (light, fixed, verbatim):** `background:#fff; color:#111; font-family:'IBM Plex Sans'`. It is theme-independent (always light) for ink/PDF legibility — it does **not** use the app tokens.
  - Title `<h1>` 24px; target subtitle `#555` 13px; metadata line mono 11px `#333` rendering non-empty **non-sensitive** variables as `$KEY = value` chips (sensitive vars excluded; Q100/Q101). `<hr>` `#ddd`.
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

**Locked decisions reflected:** D8, Q41, Q53, Q71/Q72, Q99, Q100/Q101, Q106/Q107/Q109/Q110, Q112, Q143, Q144, Q145, Q146, Q147, Q148, Q149, Q150, Q151, Q152, Q153, Q154, Q155, Q156, Q157, Q158, Q159, Q160, Q161, Q162, Q163, Q164, Q167, Q196.

---

## 12. Non-Functional, Security/OPSEC & Delivery

This section defines the threat model, security/OPSEC posture, internationalization, target platforms, performance envelope, launch/runtime behavior, and delivery pipeline for **Cheat**. It reflects the locked decisions log (D7 overrides the questionnaire on encryption; the memory-only-values decision overrides Q177) and the adopted questionnaire recommendations. Where the decisions log and a questionnaire *Reco* diverge, the decisions log wins.

> In-repo documentation (this spec, README, CHANGELOG) is written in **English**. All user-facing UI strings, labels, toasts, warnings, and command examples remain in **French** verbatim.

---

### 12.1 Threat Model & Trust Boundaries

Cheat is a **single-user, localhost-only desktop web app** used during authorized engagements. The security design follows directly from **D7**: because no sensitive data is ever persisted, the at-rest attack surface is intentionally empty.

**Assets and where they live**

| Asset | Location | Persisted? | On the wire (local API)? |
|---|---|---|---|
| Curated knowledge base — commands, references, categories, roadmaps/phases/steps, variable **definitions** | SQLite (DB) | Yes | Yes |
| User content — personal notes, progression (`done`), panel state (`expanded`), cheatsheet composition, titles/targets | SQLite (DB) + device-local (theme, last active view/roadmap) | Yes | Yes (DB portion) |
| Variable **values** (incl. secrets such as `$PASS`, target `$IP`, `$USER`, `$DOMAIN`) | **SPA memory only** | **Never** (not DB, not localStorage) | **Never** — never sent to backend |

**Key architectural consequence (load-bearing for the whole threat model):** variable **values are held exclusively in the SPA's in-memory state, substitution/resolution is performed entirely client-side, and values are never transmitted to the Go backend, never written to SQLite or localStorage, and are reset to empty on every reload** (D7 + structural decision). The backend therefore never possesses, logs, or persists any secret or target-specific value. The only content that touches disk is the user's curated knowledge base and non-ephemeral state — none of which is a live credential.

**Adversaries considered**
- Other local processes / users on a shared jump-box that can reach a loopback port.
- Malicious web origins in the operator's browser attempting CSRF / DNS-rebinding against the local API.
- Casual shoulder-surfing / screen-sharing (mitigated by masking + redact mode, §12.6).

**Explicitly out of scope**
- Multi-user authentication, accounts, RBAC, cloud sync (per §1).
- Remote network attackers beyond the loopback boundary (unless LAN bind is explicitly opted in, §12.2).
- At-rest encryption of the DB (**D7 — no sensitive data at rest → no SQLCipher, no passphrase**). Full-disk encryption (FDE) is the **documented assumed baseline**, not an app responsibility.

---

### 12.2 Network Binding & Local API Authentication

**Q168, Q170, Q172 (adopted, consistent with D7).**

| Concern | v1 behavior |
|---|---|
| Default bind | `127.0.0.1` (loopback) only. |
| LAN opt-in | `--bind <addr>` flag (also `CHEAT_BIND` env). Any non-loopback bind is an explicit, documented **OPSEC risk**: on startup the binary prints a clear warning and the UI surfaces a persistent banner. |
| Transport (loopback) | Plain HTTP. `navigator.clipboard` works on `http://localhost`/`http://127.0.0.1` (secure-context exemption), so no TLS needed for the default case. |
| Transport (LAN opt-in) | When bound non-loopback, the binary generates and serves a **self-signed TLS certificate** so the browser keeps a secure context (clipboard keeps working) — trust caveat documented in README. |
| API auth token | A **per-launch bearer token** is minted at startup and injected into the served `index.html` as a non-executable bootstrap value (a `<meta>` tag / data attribute read by the SPA — **no inline `<script>`, so CSP `script-src 'self'` is preserved**). The SPA attaches it as the `X-Cheat-Token` header on **all** API calls (§4.2). The token is **mandatory on any non-loopback bind** and used on loopback as well (it also blocks other browser origins from driving the API). |

Because the backend holds no secrets (§12.1), the token's purpose is to protect the **knowledge base** from other local origins/processes and to serve as the CSRF/DNS-rebinding guard (§12.3), not to protect at-rest secrets.

---

### 12.3 CSRF / DNS-Rebinding Defenses

**Q171 (adopted).** The local API is a mutating surface reachable by malicious browser origins, so:

- **Host/Origin allowlist:** every request's `Host` (and `Origin`/`Referer` when present) must match an allowlist — `127.0.0.1:<port>`, `localhost:<port>`, and the explicitly configured LAN host if opted in. Mismatches are rejected with `403`.
- **Custom-header requirement on mutating requests:** all state-changing verbs (`POST`/`PUT`/`PATCH`/`DELETE`) require the per-launch token in a **custom request header** that a cross-origin *simple request* cannot forge. Missing/invalid → `403`.
- Combined, these defeat both classic CSRF (no custom header from a foreign page) and DNS-rebinding (Host mismatch).

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

- `style-src 'unsafe-inline'` is **required** by the faithful visual port (inline styles + CSS vars). Scripts stay `'self'` — the launch token is injected as data, never as inline script.
- `connect-src 'self'` and the absence of any external host in every directive **mechanically enforce zero network egress** (§12.5), including forcing self-hosted fonts.
- `img-src ... data:` permits embedded/inline icons; no remote images (no reference favicons — Q81).

---

### 12.5 Zero Network Egress

**Q174, Q175, Q81, Q162, Q85 (adopted).** Cheat performs **zero outbound network calls that are not a deliberate user click on a reference link.**

- **Fonts:** IBM Plex Sans / IBM Plex Mono are **self-hosted and embedded via `go:embed`** (only the required weights, `woff2`), served same-origin with `font-display: swap` and system fallbacks. **No Google Fonts / CDN.** Applies to printing/PDF as well (§12.6).
- **Reference favicons:** none fetched — references never trigger a favicon lookup (Q81). Default reference title falls back to the domain (Q87).
- **App favicon / brand:** the playful emoji mark is kept in-app; a self-contained SVG/PNG favicon set is embedded and served same-origin (Q162) — no external fetch.
- **No telemetry, analytics, crash reporting, or update pings** — this is a **hard requirement enforced in build review** (Q175, Q194). No phone-home of any kind.
- **Outbound links (references):** rendered with `rel="noopener noreferrer"` and governed by `Referrer-Policy: no-referrer` (Q85); a copy-URL affordance is provided so the operator can avoid navigating at all.

---

### 12.6 Secrets Handling & At-Rest Posture

**No at-rest encryption (D7 — overrides Q169).** The DB stores only the knowledge base and variable *definitions*; it never stores a live secret, so SQLCipher / launch passphrase are **not** implemented. Consequently **Q184 (auto-lock) and Q186 (passphrase lifecycle/rekey) are N/A** in v1 (they were conditional on adopting passphrase encryption).

**Variable values & sensitivity (Q176, Q177 — Q177 Reco overridden by D7/memory-only decision):**
- Each variable **definition** carries a `sensitive` boolean (persisted in DB, part of `{name, type, sensitive, hidden, isBuiltin, position}`). `$PASS` is `sensitive` by default.
- Sensitive value inputs render **masked (password-style) with a click-to-reveal** toggle.
- A **global redact mode** (« Mode masqué » / redact toggle) hides all sensitive values across the UI for demos/screen-sharing.
- Values are **never persisted, never exported, never logged** and are **reset to empty on reload**. The six standard variables ship **empty** (no `PASS='password'` placeholder — Q188).
- A prominent **« Effacer toutes les valeurs »** action clears every value in one click (Q30) for engagement/host handoff.

**Export vs clipboard posture (Q99, Q53 — reconciled):**
- **Exports (Markdown / PDF) emit RAW `$TOKEN` by default** (Q99). A per-export opt-in toggle « Résoudre les variables » materializes resolved values. Maximum OPSEC: nothing sensitive is written to disk without an explicit action.
- **Clipboard stays resolved** (« Copier » / « Copier tout ») — a deliberate local action for terminal paste (Q53). Copy toasts reflect the **real** clipboard result (success/failure), not an always-success stub.

**Clipboard secret handling (Q182, adopted):**
- When copied resolved text contained a value from a `sensitive` variable, a **subtle indicator** in the toast notes it (e.g. « copié — contient un secret »).
- An **optional clipboard auto-clear after N seconds (OFF by default)** is defined; it lives behind the settings gear popover (Q159). If no settings surface ships in v1, only the indicator is present.

**Logging policy (Q178, adopted):** release builds run **GORM `Silent`** and a **minimal Gin access log** (method, path, status only — **no bodies, no query strings, no bound params**). Documented prohibition on logging variable / command template / note content.

**No secrets in URLs (Q180, adopted):** all filtering/search is **client-side**. If any server-side query is ever added it uses POST bodies — never GET query strings — so target names/secrets never land in logs or history. Variable inputs set `autocomplete="off"` / `new-password` and `data-1p-ignore` to suppress browser autofill and password-manager capture, especially on `sensitive` fields (Q181).

**PDF/print metadata caveat (Q110, Q101):** PDF export is **client-side `window.print()`** in v1. The exported PDF may carry browser/OS-injected metadata (producer, timestamps) outside the app's control — this is **documented in the README as an OPSEC caveat**. In-app export metadata prints the **export date** but keeps the **tool/version fingerprint OFF by default** (Q101). Deterministic server-side PDF is deferred to v2.

**Data lifecycle & repo hygiene (Q183, Q185, adopted):**
- **v1 wipe = documented manual deletion of the DB file**; an in-app "wipe all data / reset" is a stretch goal (Q185) — the guarded factory-reset (§10.5.4) partially covers it.
- The **DB file and export artifacts live outside the repo by default** (configurable DB path — §12.10) **and** `.gitignore` carries explicit patterns (§12.11).
- README carries an **OPSEC warning against committing client data**.

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
- **SQLite driver:** use a **pure-Go SQLite driver** (no CGO) to keep single-binary cross-compilation simple (Q190).

---

### 12.9 Performance & Capacity

**Q189, Q192 (adopted).**

- Design target: **~2,000 commands**, fully client-side filtering.
- **Search debounced ~150 ms**; interaction/filter latency target **< 100 ms** (instant-local feel).
- **No pagination or list virtualization** in v1.
- **No PWA / service worker** — the server is already local, so offline is covered once fonts are embedded (Q192). An optional web manifest may come later.
- Autosave is optimistic and debounced (~500 ms per mutated entity, D3); a persistent inline **save-error banner** (not a fire-and-forget toast) surfaces retry-queue failures (Q196 tiered messaging model, §11.6).

---

### 12.10 Launch, Configuration & Runtime

**Q187, Q191, Q194, Q195 (adopted).**

| Concern | Behavior |
|---|---|
| Startup mode | **Foreground** process that prints its final localhost URL on stdout. Optional `--open` flag launches the default browser. **No systemd service / auto-start** (Q191). |
| Default port | Fixed **uncommon high port** (e.g. `48200`), overridable via `--port` / `CHEAT_PORT` (Q195). |
| Port clash | **Fail loud with a clear message** by default; optional auto-increment behind an explicit flag. Always print the final URL actually bound. |
| DB path | **Single DB file** with a **configurable path** via `--db` / `CHEAT_DB` so each engagement gets its own directory (Q187). **No in-app multi-workspace switcher** in v1. |
| Seeding | **First-run only** (Q133): the curated OSCP seed (commands / roadmaps / references / categories) is inserted once as ordinary editable/deletable rows; **the six standard variables ship empty** (Q188). Never auto-reseed on upgrade; deleted seeds are not resurrected; an updated seed pack is delivered as an **optional importable file** (§10.5.3). |
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
- `/exports/`, exported `*.md` / `*.pdf` artifacts
- `node_modules/`, `/dist/`, the compiled binary
- No binaries or build artifacts committed (Q183). README carries the OPSEC warning against committing client data.

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
- **Per-entry cheatsheet note overrides** (v1 keeps a single base note map per id — Q95/Q97).
- **References cross-linking** (references are standalone in v1 — Q88).
- **Unknown-token auto-detection helper** for templates (Q36).
- **Server-side deterministic PDF** export (v1 uses client `window.print()` — Q106/Q110).
- **Drag-and-drop parity on the cheatsheet** (v1 reorders via ↑/↓ — Q98).
- **Touch support** for reordering (v1 is desktop/mouse + ↑/↓ buttons — Q71/Q72, D8 desktop-only strict).
- Stretch: in-app **"wipe all data" / reset** action (v1 relies on manual DB-file deletion + guarded factory-reset — Q185); optional **clipboard auto-clear** exposed via a settings popover (Q182/Q159).

---

## Open Items

All `> **Open:**` callouts raised in the sections above, collected. None are blocking for implementation; each names a small choice to confirm or a hex/integer to validate.

| # | Section | Open item |
|---|---|---|
| 1 | §1.5 / §12.12 | **Repository license** not yet locked — proposed default private/proprietary (MIT if published). The one remaining minor open item. |
| 2 | §2.8 | Whether the **dev proxy target port** (`8787`) is fixed or read from `CHEAT_PORT` for the dev workflow — cosmetic, does not affect the locked architecture. |
| 3 | §3.3 | The **AV-evasion category label** is used verbatim as the reconciled string `Antivirus Evasion & Metasploit`; adjustable at seed time without schema change if a different wording was intended. |
| 4 | §4.5 | **`step.expanded` (openSteps) persistence.** This spec persists it (per decisions-log Q112, §3.2.6, §10.1) and carries it on the API; the original Q113 reco had marked it ephemeral. Confirm before implementation whether it should be ephemeral instead. (Library sidebar accordion state remains ephemeral regardless.) |
| 5 | §4.8 | No **user-writable server-persisted setting** was locked for v1; the `PUT /api/settings` endpoint exists for forward-compatibility with an empty writable key set. |
| 6 | §5.4 | The **default `sensitive` state of the six standard variables** (only `$PASS` sensitive) is a recommended default, not itself locked; all six remain user-toggleable. |
| 7 | §6.11 | **Library module: none** — all in-scope questions resolved. |
| 8 | §7.12 | **Duplicate roadmap label collision:** a ` (copie)` suffix may itself duplicate a name; per Q75 this only triggers the non-blocking warning — no `(copie 2)` numbering scheme specified for v1. |
| 9 | §9.4 | Whether the **export value-metadata block is gated by the resolve toggle.** This spec gates it (raw export ⇒ no concrete values anywhere); confirm if a raw export should still print non-sensitive variable values in metadata. |
| 10 | §10.1.2 | **State tiering: none** — fully specified by Q112 and D7. |
| 11 | §10.5.4 | **Seed lifecycle: none** — Q133/Q134 fully specify it; tombstones are explicitly out by design. |
| 12 | §11.2 | Ship only the **4 Sans + 3 Mono static WOFF2 weights** (smallest footprint) vs. the variable-font files — confirm preference. |
| 13 | §11.3 | Confirm the final **remediated light `--faint` hex** once a contrast checker is run against `#ffffff`; the constraint (≥4.5:1) is locked, the exact value (`#676c7a` suggested) is not. |
| 14 | §11.5.2 | **Sidebar collapse toggle** is adopted-by-default but flagged "confirm for v1"; the sidebar could ship always-visible with no other impact. Recommendation: keep the manual toggle. |
| 15 | §12.10 | The **exact default port integer** is an implementation choice (`48200` placeholder); Q195 mandates only "fixed, uncommon, overridable, fail-loud-on-clash". |

---

## Traceability

Each section mapped to the decision themes and D-forks it implements. Forks: **D1** multiple named cheatsheets · **D2** single global value set, definitions ≠ values · **D3** debounced optimistic autosave · **D4** JSON import = full REPLACE + snapshot · **D5** server-minted ULIDs, first-class Phases/Steps, progression keyed by step ID · **D6** full CRUD (commands + references) · **D7** no at-rest encryption (no sensitive data persisted) · **D8** desktop-only strict layout · **Q99** exports raw / clipboard resolved (OPSEC fork).

| Section | Decision themes / questionnaire coverage | D-forks & key Q-forks |
|---|---|---|
| **§1 Overview, Scope & Principles** | Scope, product framing, in/out-of-scope, core principles; v2 deferrals | D1–D8 (all), Q99 |
| **§2 System Architecture** | Architecture, deployment topology, dev/prod parity, high-level security posture | D7, D8, Q168, Q170–Q175, Q178–Q179, Q187, Q190–Q195 |
| **§3 Data Model** | Modèle de données & IDs; CRUD & referential integrity; data-layer of variables/cheatsheets/notes; seed governance | D1, D2, D5, D6, D7; Q1–Q11, Q14, Q17–Q19, Q20/Q22/Q24/Q25/Q27–Q29, Q90/Q95/Q97, Q102, Q112/Q113/Q116/Q133/Q135/Q142 |
| **§4 REST API** | REST surface, transport admission, error model, autosave semantics, export/import endpoints | D2, D3, D4, D5, D6, D7; Q111–Q117, Q121, Q124–Q132, Q168–Q173, Q179–Q180 |
| **§5 Variables System** | Variables (definitions vs values, grammar, resolver, rename/delete, memory-only) | D2, D5, D3 (definitions), Q99; Q20–Q36 |
| **§6 Library Module** | Bibliothèque — search, filters, grouping, counts, CRUD, on-the-fly category/tool/tags | D5, D6, D8, Q99/Q53; Q3–Q6, Q37–Q56 |
| **§7 Methodology Module** | Méthodologie — roadmaps/phases/steps, edit mode, DnD + ↑/↓, progress, reset/duplicate/restore | D1, D3, D5, D8, Q99/Q53; Q2, Q7, Q10, Q18–Q19, Q57–Q76, Q112–Q113, Q129, Q133 |
| **§8 References Module** | Références — URL pipeline/allowlist, render gate, domain rendering, CRUD, tag facet | D6, D8; Q6, Q9, Q15–Q16, Q41, Q47, Q77–Q88 |
| **§9 Cheatsheets & Export** | Cheatsheets & export — multi-sheet tabs, entries, resolve toggle, Markdown/PDF/clipboard | D1, D2, D8, D3; **Q99** (central), Q53, Q89–Q110 |
| **§10 Persistence, Import/Export & Seed Governance** | Persistance & sync; import/export & backup; seed governance | D1, D2, D3, D4, D5, D7; Q111–Q142 (persistence/backup slice), Q18, Q67, Q133–Q134 |
| **§11 Visual System & UX** | Visuel, responsive & a11y; notification/confirmation model; print CSS; fixed constants | D8, Q99, Q53, Q71/Q72; Q143–Q164, Q167, Q196, Q100/Q101, Q106/Q107/Q109/Q110, Q112 |
| **§12 Non-Functional, Security/OPSEC & Delivery** | Sécurité & OPSEC; périmètre, NFR & déploiement; i18n; delivery pipeline | D7 (overrides Q169), memory-only (overrides Q177), D8, Q99/Q53; Q160–Q163, Q168–Q195 |

**Fork-to-section index:**

- **D1** (multiple named cheatsheets): §1.4, §3.2.8–§3.2.9, §4.6.7–§4.6.8, §9 (whole), §10.1.
- **D2** (single global value set; definitions ≠ values): §1.6, §2.5, §3.2.7/§3.10, §5 (whole), §9.4, §10.1, §12.1.
- **D3** (debounced optimistic autosave): §4.4, §6.10, §7.11, §9.2, §10.2.
- **D4** (JSON import = full REPLACE + snapshot): §4.10, §10.4.5.
- **D5** (server-minted ULIDs; first-class Phases/Steps; progression by step ID): §3.1/§3.2, §4.1/§4.4, §5.2, §7.1, §10.1.
- **D6** (full CRUD, commands + references): §6.8/§6.10, §8.9.
- **D7** (no at-rest encryption): §1.5, §2.6, §3.10, §10.1.2, §12.1/§12.6.
- **D8** (desktop-only strict layout): §2.7, §6/§7/§8/§9 (layout notes), §11.5.
- **Q99** (exports raw / clipboard resolved): §1.6, §5.13, §9.4/§9.8, §11.6/§11.8, §12.6.





