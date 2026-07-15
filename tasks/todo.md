# Cheat — Implementation Plan

> OSCP notes / cheatsheets / methodology workshop.
> Ported from the Claude Design prototype `OSCP Vault.dc.html` (DCLogic runtime) into a real deployable full-stack app.
> UI language: **French**. In-repo docs: **English**.

## Decisions (locked with user)

- **Frontend**: Vite + React + TypeScript. Exact visual system preserved (inline styles + CSS variables, IBM Plex Sans/Mono, right angles, dark/light theme, accent `#3ddc97`). TanStack Query for server state.
- **Backend**: Go + Gin + GORM + SQLite. Relational content model + key-value settings for transverse UI state.
- **Persistence**: SQLite file. Plus full dataset JSON import/export.
- **Delivery**: single Go binary embedding the built SPA (`go:embed`), served same-origin (no CORS in prod). Dev: Vite proxies `/api` → Go. Dockerfile (multi-stage) + Makefile.
- **Deviation from spec** (documented in CHANGELOG): spec describes a client-only prototype; user chose a Go backend. Custom variables: design UI exposes 6 fixed vars only — we stay faithful to the design (vars stored as a map so custom keys are data-supported, no extra UI).

## Architecture

```
cheat/
  backend/
    main.go                 # Gin server + go:embed SPA + /api routes
    internal/
      models/               # Category, Command, Reference, Roadmap, Phase, Step, Setting
      db/                   # GORM init, automigrate, seed-on-empty
      seed/                 # seed data ported verbatim from the design
      handlers/             # REST handlers (content CRUD, settings, import/export)
    go.mod
  frontend/
    src/
      api/                  # fetch client + TanStack Query hooks
      lib/theme.ts          # dark/light token maps + accent color-mix
      lib/vars.ts           # variable resolution ($X) -> parts / resolved string
      types.ts
      components/           # TopBar, Sidebar, Library, Methodology, References, Cheatsheet, PrintRoot, modals, Toast
      App.tsx
    index.html
    package.json / vite.config.ts / tsconfig.json
  Dockerfile                # node build -> go build (embed) -> scratch/distroless
  Makefile                  # dev, build, run, docker, test, clean
  README.md
  CHANGELOG.md
  SPEC.md                   # functional spec (French, reference)
  tasks/todo.md / lessons.md
```

## Data model (GORM)

- **Category** { key PK, label, color, builtin }  — 18 built-in + custom.
- **Command** { id PK, category FK, tool, title, template, desc, tags (JSON []string) }
- **Reference** { id PK, title, url, desc, tags (JSON []string) }
- **Roadmap** { id PK, label, position }
- **Phase** { id PK, roadmap_id FK, label, position }
- **Step** { id PK, phase_id FK, text, command_id (nullable FK), position }
- **Setting** { key PK, value (JSON) } — transverse UI state: vars, theme, selected[], notes{}, checks{}, openSteps{}, sheetTitle, sheetTarget, activeRoadmap.

## REST API

- `GET  /api/state` — hydrate everything (categories, commands, references, roadmaps+phases+steps, settings).
- `PUT  /api/settings` — upsert transverse state keys (debounced from client).
- Commands: `POST /api/commands`, `PUT /api/commands/:id`, `DELETE /api/commands/:id`.
- References: `POST /api/references`, `PUT /api/references/:id`, `DELETE /api/references/:id`.
- Categories: `POST /api/categories` (create on the fly).
- Roadmaps: `POST /api/roadmaps`, `PUT/DELETE /api/roadmaps/:id`.
- Phases: `POST /api/roadmaps/:id/phases`, `PUT/DELETE /api/phases/:id`.
- Steps: `POST /api/phases/:id/steps`, `PUT/DELETE /api/steps/:id`.
- Reorder: `PUT /api/roadmaps/:id/reorder` (ordered phase/step ids).
- Export/Import: `GET /api/export` (full JSON), `POST /api/import` (replace dataset).

## Milestones

- [ ] **M0 — Scaffold**: git init, SPEC.md, CHANGELOG.md, README skeleton, backend+frontend skeletons, Makefile, Dockerfile, `.gitignore`.
- [ ] **M1 — Backend**: models + automigrate + seed-on-empty (verbatim from design), all handlers, import/export, Go unit tests. Verify with curl.
- [ ] **M2 — Frontend**: port DCLogic component faithfully to React (theme, var resolution, 4 modules, drag-drop phases/steps with ghost placeholder + check remap, modals, MD/PDF export, toasts). Wire to API via TanStack Query with optimistic updates.
- [ ] **M3 — Integration & delivery**: `go:embed` SPA into binary, single-origin serve, Docker multi-stage, Makefile targets, end-to-end verify (Playwright), README + CHANGELOG.

## Fidelity checklist (port must match the prototype)

- [ ] 18 categories with exact colors; tool grouping; tag counts.
- [ ] Variable substitution regex `/\$([A-Z_]+)/g`; unresolved token shown literally; resolved token green-highlighted.
- [ ] Library: search over title/desc/template/tool/tags; hierarchical cat › tool + tag filters; add-command modal with on-the-fly category/tool/tags.
- [ ] Methodology: per-phase + global progress bars; step→command inline expand with copy; edit mode; add/rename/delete roadmap/phase/step; DnD reorder with ghost placeholder; checks follow moved item; reset.
- [ ] References: auto domain extraction; full-text search; add-reference modal.
- [ ] Cheatsheet: ordered selection, up/down/remove, editable title/target, meta chips, copy-all, MD export, PDF via print.
- [ ] Theme toggle dark/light with accent recomputed via `color-mix`.

## Notes / results
_(updated as work progresses)_
