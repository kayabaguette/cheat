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

---

## Task — Collapsible sidebar + responsive content (v0.8.0, 2026-07-26)

**Ask:** fold the left sidebar; make the right region reflow to a **single command
column** on narrow screens. Deliberately **overrides SPEC D8/R4** ("desktop-only
strict, hard ~900px content floor, no reflow") — the floor is what blocks the
single-column reflow today (`App.tsx:71`). Implements the sidebar toggle already
foreseen by **Q145** (manual toggle in the top bar, persisted device-local).

- [x] `store.tsx` — `sidebarOpen: boolean` + `toggleSidebar()`, initialised from
      and persisted to `localStorage['cheat.sidebar']` (UI pref only; never a
      variable value, so D7/OPSEC is untouched). Not part of `persistableState`
      → stays out of the profile state / import-export contract.
- [x] `TopBar.tsx` — ☰ toggle left of the logo (Q145) + compaction hooks
      (classes `tb`, `tb-brand`, `tb-tabs`, `tb-tab-long/short`, `tb-search`,
      `tb-addlabel`) + `tb-profile-label` in `ProfileMenu.tsx`.
- [x] `App.tsx` — render `<Sidebar>` only when open; drop the `minWidth: 900px`
      wrapper (keep `overflowX:auto` as a safety net for wide code blocks).
- [x] `Library.tsx` / `References.tsx` — `minmax(min(370px|340px, 100%), 1fr)`
      so `auto-fill` degrades to one column instead of overflowing.
- [x] `index.css` — top bar media queries at 1080 / 940 / 780 / 640px.
- [x] Verify with Playwright at 1440 / 900 / 760 / 700 / 640 / 480px, sidebar
      open + folded, all four views.
- [x] CHANGELOG 0.8.0 + SPEC implementation-status note (item 10) + README.

### Results

- `npx tsc --noEmit` clean; `npm run build` OK; 0 console errors/warnings.
- Measured top-bar `scrollWidth` vs viewport: fits exactly at 700px and 640px
  (tab strip then scrolls internally), nothing overflows the page at 480px.
- Single command column confirmed at 900px **with the sidebar open** (content
  pane ≈ 580px) and at 480px folded. 2 columns at 1440 open / 3 folded —
  identical to pre-change behaviour above ~900px.
- Verified fold persistence across a reload (`cheat.sidebar=0` → sidebar absent,
  button flips to « Déplier le menu »).
**Follow-up (same day, on request):**

- [x] **Auto-fold below 780px** — `matchMedia` listener in the store; folds on
      crossing INTO the narrow range, restores the manual pref on crossing out,
      folded at mount if already narrow. The auto path never writes
      `localStorage`, so the manual choice survives; a manual toggle wins until
      the width class changes again. Overrides Q145's "manual only" ruling.
      Verified: 1280→700 auto-folds with `pref` untouched; manual open at 700
      sticks; manual fold at 1280 survives a 700 round-trip; reload at 700 with
      `pref=open` mounts folded then reopens on widening.
- [x] **`Library.tsx` NUL byte fixed** — the "Sans catégorie" group key was a
      literal `\0` (present in HEAD), which made git treat the file as binary and
      hid it from grep. Now `ORPHAN_KEY = '__orphan__'`. Verified by injecting a
      command with a dangling category into a scratch profile: the group and card
      render, no React key warnings. `file` now reports UTF-8 text.
- Test setup gotcha: `:8787` was the user's live instance; the throwaway Go API
  was run on `:8899` with a scratch DB and Vite pointed at it via
  `VITE_API_TARGET`, so the debounced autosave never touched real data.

---

## Task — Snippets: enchaînements de commandes (v0.9.0, 2026-08-24)

**Ask:** une commande seule ne suffit pas toujours (ex. silver ticket via mimikatz) —
il faut un objet **réutilisable** décrivant une suite d'actions où chaque étape
consomme ce que la précédente a produit. Plan approuvé :
`~/.claude/plans/mossy-honking-steele.md`.

Décisions verrouillées : (1) étape = template **inline** · (2) chapitre « Snippets »
dans le Cheatsheet à côté de « Commandes » · (3) valeurs des locales
**mémoire-seule** ET **jamais résolues en export fichier** · (4) snippet =
catégorie + tags (pas d'outil) · (5) valeurs locales **distinctes par usage** ·
(6) « Snippets » partout dans l'UI · (7) **une seule PR** gitea.

Déviations SPEC assumées : **§3.2.7** (grammaire de tokens étendue),
**§9.x** (Cheatsheet à deux chapitres), **§9.6/Q99** (le « résolu sur option »
ne vaut que pour les globales).

### Palier 1 — grammaire des tokens (bloquant)

- [x] `lib/vars.ts` — `TOKEN_RE` élargi à `[A-Za-z_][A-Za-z0-9_]*`, puis **deux
      classes strictes** : un nom doit être **entièrement** en majuscules (global)
      ou **entièrement** en minuscules (local) ; la **casse mixte n'est plus un
      token** et reste du texte brut. Une locale n'est reconnue que si elle est
      **déclarée** dans les `locals[]` du snippet.
- [x] Fusion des parts `plain` adjacentes dans `toParts()` → sortie DOM
      byte-identique à l'avant-0.9.0 pour tout template sans locale déclarée.
- [x] `extractTokens()` = classe globale **uniquement** (bande « Détectées » et
      garde-fou d'export sensible préservés) ; nouveau `extractLocalTokens()`.
- [x] `lib/varsets.ts` — `definedNamesWithLocals()`.
- [x] `store.tsx` — **bug évité** : le lookahead de la cascade `renameVar`
      excluait `[A-Z0-9_]` mais pas les minuscules, donc renommer `$USER` aurait
      réécrit `$USERx` (désormais du texte brut) en `$OWNERx`. → `[A-Za-z0-9_]`.

### Paliers suivants

- [x] **2 — Modèle + store** : `types.ts` (`Snippet`/`SnippetStep`/`SnippetLocal`),
      slice `snippets`, CRUD, `localValues` (hors `persistableState`), cascade de
      suppression, hydratation.
- [x] **3 — Persistance** : `backend/store.go` (DTO + `AppState.Snippets`),
      `DataMenu.tsx` (`arrayKeys`).
- [x] **4 — Vue + onglet** : `Snippets.tsx`, `AddSnippet.tsx`, `CommandLine.tsx`
      (copie au clic), `App.tsx`, `TopBar.tsx`, `index.css`, `Sidebar.tsx`.
- [x] **5 — Intégrations** : `Methodology.tsx` (`Step.snippetId`),
      `Cheatsheet.tsx` + `PrintRoot.tsx` (chapitre « Snippets » + exports).
- [x] **6 — Docs** : README, CHANGELOG `[0.9.0]`, addendum SPEC pt. 11.

### Résultats — palier 1

Non-régression vérifiée en comparant les **deux implémentations réelles** (ancienne
extraite de git, nouvelle du disque, toutes deux bundlées par esbuild), comparaison
sur le rendu (parts de même état fusionnées des deux côtés), 4 gates :

- **GATE 1** — 380 chaînes du dataset OSCP + seed (`toParts` + `resolve` +
  `extractTokens`) : **0 différence**.
- **GATE 2** — 10 textes shell/PowerShell (`$env:USERNAME`, `$_`, `$file`,
  `$(whoami)`, `${HOME}`, `awk '{print $1}'`, `\$literal`, `'$DOMAIN\$USER'`) :
  **0 régression**.
- **GATE 3** — casse mixte désormais inerte (changement assumé) : `$PSVersionTable`
  ne souligne plus `$PSV`, `$ErrorActionPreference` plus `$E`, `$MyInvocation` plus
  `$M`. Le plus important : **`echo $RHOSTx` substituait silencieusement en
  `10.10.10.5x`** et rend maintenant le texte tel quel. 0 mixed-case dans le
  dataset réel ⇒ aucun contenu existant affecté.
- **GATE 4** — locales : non déclarée → texte brut ; déclarée + valuée →
  substituée ; `extractTokens` ne remonte que les globales ; `extractLocalTokens`
  remonte les locales dans l'ordre.

`npx tsc --noEmit` + `npm run build` verts. Script de vérification jetable (hors
repo — pas de runner de test front installé, on n'ajoute pas vitest pour l'instant).

### Résultats — paliers 2 à 6

**Écart au plan (assumé, en mieux) — palier 3 bien plus léger que prévu.** Le plan
annonçait une nouvelle table GORM + `serializer:json`. Vérification faite, l'état
d'un profil est un **blob JSON** (`Profile.State`) depuis la v0.7 : les modèles
relationnels sont *legacy* (lus seulement par `legacyLoadState` lors de la
migration pré-profils). Étendre la struct `AppState` a donc suffi — **aucune
table, aucune migration**, et le clonage de profil embarque les snippets
gratuitement.

**Écart au plan (assumé) — palier 4, mise en page.** Le plan disait « grille de
cartes façon Bibliothèque ». Livré en **colonne unique centrée (max-width 840px)**
comme Méthodologie/Cheatsheet : le contenu est séquentiel et dense en code (la
ligne `kerberos::golden` fait ~120 caractères), une piste de grille à 370px la
replierait sur quatre lignes.

**Trois bugs évités/corrigés en route** (aucun n'était dans le périmètre demandé) :

1. `renameVar` — le lookahead de la cascade excluait `[A-Z0-9_]` mais pas les
   minuscules : renommer `$USER` aurait réécrit `$USERx` (désormais du texte brut).
2. `echo $RHOSTx` substituait silencieusement en `10.10.10.5x` sous l'ancienne
   grammaire (un token s'arrêtait à la première minuscule). La casse mixte est
   maintenant inerte.
3. Un dataset pré-0.9 devenait **non ré-importable** après un import : les
   handlers bindent dans un `AppState` zéro, donc une clé absente (`snippets`)
   était stockée en `null`, ré-exportée en `null`, puis **rejetée** par le
   contrôle de forme du client. `nonNilState()` normalise tout dans
   `saveProfileState` (point de passage unique des deux écrivains).

**Vérifications** (backend jeté sur `:8899` + DB scratch, Vite via
`VITE_API_TARGET` — l'instance live `:8787` jamais touchée) :

- `tsc --noEmit`, `npm run build`, `go build`, `go vet`, `go test` : tous verts.
- **Persistance** : import d'un dataset pré-0.9 → `snippets: []` et
  `snippetIds: []` (jamais `null`), reste ré-importable ; round-trip d'un snippet
  4 étapes fidèle au bit, y compris une étape portant `commandId` **et**
  `snippetId` ; clone de profil OK ; aucune valeur locale en base.
- **Chaînage** : saisir le hash/SID capturés fait passer la ligne mimikatz avale
  en résolu vert, et la copie rend la commande entièrement résolue.
- **Décision 5** : le même snippet dans deux étapes de méthodologie garde deux
  jeux de valeurs indépendants (étape 1 résolue, étape 2 encore en tokens bruts).
- **Copie au clic** : icône ~900 ms au succès seulement ; sélection de texte
  active ⇒ aucune copie ; `navigator.clipboard` absent (contexte non sécurisé,
  le cas réel en LAN HTTP) ⇒ toast d'échec, pas d'icône, aucun faux succès.
- **OPSEC export** (le point verrouillé) : Blob Markdown réel capturé avec
  « résoudre les variables » **activé** → globales substituées, **`$svc_ntlm` /
  `$domain_sid` restent bruts**, les secrets saisis n'apparaissent nulle part.
  `PrintRoot` idem. Le garde-fou `$PASS` **se déclenche désormais depuis une étape
  de snippet** (invisible à l'ancien scan commandes-seules) : refuser bloque
  l'export, accepter substitue `$PASS` mais laisse les locales brutes.
- **Responsive** : régression réelle trouvée et corrigée — avec 5 labels longs la
  barre exige **1312px incompressibles**, elle débordait donc la page entre ~940 et
  ~1150px. Palier labels longs→courts déplacé de 940px à **1200px** (bloc scindé,
  le wordmark tombe toujours à 940px). Revérifié à 1500/1200/1000/480px : aucun
  débordement, sidebar auto-repliée et lignes qui passent à la ligne à 480px.
- **0 erreur / 0 avertissement console** sur les 5 vues au chargement propre.

**Note d'outillage** : la non-régression de grammaire a comparé les **deux
implémentations réelles** (ancienne extraite de git, nouvelle du disque, bundlées
par esbuild), sur le rendu (parts de même état fusionnées des deux côtés). Script
jeté, hors repo : aucun runner de test front n'est installé et on n'a pas ajouté
vitest pour l'occasion.
