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

---

## Task — Vitest + test rejouable du tokenizer (v0.9.2, 2026-08-24)

**Ask (utilisateur) :** « ajoute vitest et rends ce test rejouable ». Les
non-régressions qui avaient validé la grammaire 0.9.0 et le correctif `$_` de la
0.9.1 étaient des scripts jetés hors dépôt : ils prouvaient le changement une
fois, puis disparaissaient.

- [x] `vitest` en devDependency + scripts `test` / `test:watch`.
- [x] `frontend/vitest.config.ts` — config **propre**, pour ne PAS charger le
      `vite.config.ts` de l'app : le test est de la logique pure, donc plugin
      React et proxy `/api` sont du poids mort (et le Vite plus récent embarqué
      par Vitest râlait sur les options esbuild dépréciées du plugin à chaque run).
      `environment: 'node'` → pas de jsdom, aucune dépendance en plus.
- [x] `frontend/src/lib/vars.test.ts` — **28 tests**, écrits comme une
      *spécification* et non comme un diff contre l'ancienne implémentation, pour
      rester utiles quand l'ancien code a disparu.
- [x] Cible `make test` — Go + Vitest + `tsc --noEmit`, **en conteneur**
      (réutilise `GO_IMAGE` / `NODE_IMAGE` déjà définis), donc aucun toolchain
      hôte requis. Respecte la convention conteneur-only du Makefile.
- [x] Docs : section « Tests » du README, `[0.9.2]` au CHANGELOG.

### Résultats

**Le test est prouvé capable d'échouer** (un garde-fou qui ne peut pas échouer
n'en est pas un). Les deux bugs d'origine réintroduits un par un :

- classe globale sans exigence de lettre (le bug `$_`) → **5 tests rouges** ;
- `TOKEN_RE` remise en `[A-Z_][A-Z0-9_]*` (le bug `$RHOSTx`) → **8 tests rouges** ;
- restauration → 28/28 verts.

**Deux invariants épinglés** parce que rien d'autre ne les fait respecter :

1. une **locale n'est jamais substituée par la map des globales** — c'est la
   raison *structurelle* pour laquelle un hash capturé ne peut pas atteindre un
   export MD/PDF (addendum SPEC item 11 / D7). Sans ce test, un refactor qui
   passerait la map fusionnée casserait la garantie en silence.
2. **aucune commande du seed ne référence autre chose que les 7 built-ins**, sinon
   un nouvel utilisateur voit un indice « variable non définie » dès l'install.

**`make test` vérifié de bout en bout** : `go test` OK, `tsc --noEmit` OK,
28/28 vitest OK, dans les conteneurs, sans rien sur l'hôte.

**Audit npm** : vitest embarque ses propres Vite/esbuild imbriqués et **plus
récents** → **aucune** nouvelle vulnérabilité. Les deux advisories existantes
visent le `vite@5.4.21` / `esbuild@0.21.5` de premier niveau du projet (dev-server
uniquement) et sont inchangées. Monter Vite 5→6/7 est une décision séparée, non
prise ici.

### Reste ouvert

- Couverture limitée à `lib/vars.ts` + `lib/varsets.ts` (logique pure). Le store,
  les cascades de suppression et les vues restent non testés — ça demanderait
  jsdom + `@testing-library/react`, non demandé.
- Pas de CI qui exécute `make test` automatiquement (aucun runner configuré sur le
  dépôt gitea) : le test est *rejouable*, pas encore *automatique*.

---

## v0.10.0 — Variables locales scopées par outil + double-clic d'édition

**Demande.** Séparer locales (minuscules) et globales (majuscules) dans le menu de
gauche ; dans les commandes, double-cliquer une variable minuscule pour modifier sa
valeur, propagée au même outil/catégorie ; vider la valeur réaffiche `$nom`. Revoir
le même fonctionnement pour les snippets, où un clic sur la ligne copiait dans le
presse-papier — retirer cette copie et remettre le bouton comme pour les commandes.

### Décisions prises avec l'utilisateur (avant tout code)

- [x] **Reconnaissance automatique**, sans déclaration, mais avec une **liste de
      noms bannis** — l'utilisateur a explicitement demandé « on ban certains noms
      de variable pouvant poser problème comme `$env:` ».
- [x] **Portée = `catégorie || outil`** (et non catégorie seule ni outil seul).
- [x] **Aucune locale dans la sidebar** — l'utilisateur : « on ne voit jamais les
      locales dans la sidebar uniquement les globales ». La séparation demandée est
      donc un *étiquetage* : le panneau devient « Variables globales » et n'accueille
      rien d'autre. Pas de section « Locales ».
- [x] **Champs de capture des snippets conservés** (bandeau « Variables locales » +
      champ sous l'étape « produit ») ; le double-clic est un troisième chemin vers
      la même valeur.

### Implémentation

- [x] `types.ts` — `Part` gagne `name?` / `local?`. **Aucun cinquième état de
      rendu** : une locale se projette sur `resolved` / `empty`, donc §5.10 du SPEC
      reste l'autorité unique et n'est pas touchée.
- [x] `lib/vars.ts` — les trois règles de bannissement. Deux sont dans
      `isLocalName` (mono-caractère, liste réservée) donc elles s'appliquent aussi
      aux **déclarations** (`cleanLocals`) ; la troisième est **positionnelle**
      (token minuscule suivi de `:`) et vit donc dans le tokenizer, câblée dans
      `toParts`, `distinctNames` et le callback de `resolve` via son `offset`.
- [x] `lib/varsets.ts` — `definedNamesWithLocals` supprimée (la déclaration n'étant
      plus le critère de reconnaissance, la fonction n'avait plus d'objet) ;
      `commandContext(cmd)` ajoutée comme clé de portée unique, réutilisée par les
      quatre vues.
- [x] `CodeBlock.tsx` — l'éditeur inline. Contrôlé **directement par le store**, sans
      brouillon : chaque frappe atterrit dans la map du contexte, comme les inputs
      globaux de la sidebar, donc les trois chemins de saisie restent synchronisés
      sans étape de validation. Une locale est **toujours son propre part**, valuée
      ou non, sinon il n'y a pas de span sur lequel accrocher le double-clic.
- [x] `index.css` — `.var-local`, affordance révélée **au survol seulement**.
      Contour *tireté* et non pointillé : §5.10 réserve le pointillé à `undef`.
- [x] `CommandLine.tsx` — copier-au-clic retiré, `<CopyButton variant="class"
      swapIcon />` partagé à la place. Le composant tombe à 55 lignes.
- [x] Les quatre vues (`Library`, `Snippets`, `Cheatsheet`, `Methodology`) —
      contexte, valeurs fusionnées et handler d'édition. Les chemins
      **presse-papier** fusionnent les locales (Q99) ; les chemins **export** non.
- [x] `Sidebar.tsx` — « Variables globales », plus le commentaire qui explique
      pourquoi aucune locale ne peut y apparaître.
- [x] Docs : `CHANGELOG.md` `[0.10.0]`, `README.md` (section « Live variables »
      restructurée en deux classes + tableau de ce qui n'est *pas* une variable),
      `SPEC.md` addendum **item 12** (supersède item 11 b1 et b3, étend §5.1).

### Résultats

**`make test` vert de bout en bout** (Go + `tsc --noEmit` + Vitest, en conteneurs).
Suite du tokenizer **28 → 36 assertions**.

**Les trois nouveaux garde-fous sont prouvés capables d'échouer** — un garde-fou qui
ne peut pas échouer n'en est pas un, cf. 0.9.2. Retirés un par un :

- règle mono-caractère → **4 tests rouges** ;
- garde `:` → **2 tests rouges** ;
- liste réservée → **2 tests rouges** ;
- restauration → 36/36 verts.

**Non-régression sur les données réelles** : les 380 commandes du dataset et les 27
du seed ne contiennent **aucun** token minuscule ni mixte (mesuré avant d'écrire une
ligne de code), donc leur rendu est inchangé au pixel. C'est ce qui a rendu le
relâchement du garde-fou 0.9.0 acceptable.

**D7 couvert gratuitement** : `exportMd` et `PrintRoot` résolvaient déjà contre la
map des globales seule. Les locales de commande héritent donc de la garantie
« jamais substituée dans un fichier, même avec « résoudre les variables » ON » sans
toucher un seul de ces deux chemins.

### Reste ouvert

- La liste réservée est un jugement, pas une preuve. `$file` et `$path` sont
  volontairement **autorisés** (ce sont des locales utiles) : dans un one-liner
  bash ils deviennent donc des variables. Inoffensif tant qu'aucune valeur n'est
  saisie, corrupteur si on leur en donne une par mégarde. À rouvrir si ça mord.
- Une locale déjà déclarée dans un snippet avec un nom désormais banni (`$f`,
  `$env`) est purgée au chargement par `cleanLocals`. Aucun snippet dans le seed.
- Toujours pas de test de rendu (`CodeBlock`, le double-clic) : il faudrait jsdom +
  `@testing-library/react`. La logique est couverte, l'interaction ne l'est pas.

---

## v0.11.0 — Pseudo-catégorie « Favoris » + étapes conditionnelles

**Demande.** (1) Une catégorie « Favoris » au-dessus de « Toutes les commandes »,
seulement s'il existe au moins un favori. (2) Des étapes conditionnelles dans la
Méthodologie — « dans discovery, s'il y a un FTP, alors faire l'énumération FTP » —
avec une proposition de conception à valider.

### Décisions prises avec l'utilisateur (avant tout code)

- [x] **Déclencheurs nommés** déclarés au niveau de la roadmap, référencés par les
      étapes — retenu contre la condition en texte libre (aucune réutilisation :
      6 étapes FTP = 6 fois la même chaîne) et contre l'étape parente (un port
      ouvert n'est pas une tâche qu'on accomplit).
- [x] **Étapes inactives grisées, non cochables, hors progression**, avec un
      interrupteur « masquer les inactives ».
- [x] **Auto-détection maintenant** (et non plus tard) : bouton « détecter depuis
      le résultat » qui lit la sortie nmap déjà collée.
- [x] **Favoris groupés catégorie › outil**, comme n'importe quelle autre portée.

### Implémentation

- [x] `types.ts` — `Trigger {id,label}`, `Roadmap.triggers?`, `Step.triggerIds?`
      (sémantique **OU**), `AppState.activeTriggers?`. Tous **optionnels** : aucun
      export antérieur ne casse, motif de `Step.snippetId?` en 0.9.0.
- [x] **`backend/store.go` — obligatoire, pas optionnel.** Le PUT est démarshallé
      dans des structs typées puis re-marshallé : un champ absent du DTO est
      supprimé au premier autosave. `StepDTO.TriggerIDs`, `TriggerDTO` sur
      `RoadmapDTO`, `AppState.ActiveTriggers` + son init dans `emptyState()`.
- [x] `lib/triggers.ts` — toute la logique **pure** : `isStepActive`,
      `progressOf`, `phaseHasActiveStep`, `stepGroupKey`, `triggerLabels`,
      `parseServices`, `matchTriggers`. Sortie de la vue précisément pour être
      testable sans DOM, comme `lib/vars.ts`.
- [x] `store.tsx` — `favOnly` ; `activeTriggers` + `hideInactiveSteps` ; les
      actions `addTrigger` / `renameTrigger` / `deleteTrigger` / `toggleTrigger` /
      `activateTriggers` / `setStepTriggers` ; les cascades ; `cleanRoadmaps` au
      chargement ; `copyRoadmapToProfile`.
- [x] `Sidebar.tsx` / `Library.tsx` — la ligne « ★ Favoris » et le prédicat de
      filtre. `DataMenu.tsx` — `activeTriggers` dans la liste blanche d'import.
- [x] `Methodology.tsx` — bande de pastilles, interrupteur, sous-titres de groupe
      implicites, pastilles par étape + sélecteur en mode édition, case désactivée,
      bouton de détection, troisième `<select>` du brouillon d'ajout.
- [x] Docs : `CHANGELOG.md` `[0.11.0]`, `README.md` (nouvelle section
      « Conditional steps » + contrat d'import/export), `SPEC.md` addendum
      **item 13**.

### Résultats

**`make test` vert** (Go + `tsc --noEmit` + Vitest, en conteneurs). Nouvelle suite
`lib/triggers.test.ts`, **31 assertions** → 67 au total.

**Les cinq garde-fous sont prouvés capables d'échouer** :

- filtre d'activité dans `progressOf` → **3 tests rouges** ;
- exigence `open` dans la ligne de port → **2** ;
- plancher de 3 caractères du fallback → **1** ;
- normalisation `ssl/` + `?` → **2** ;
- fallback restreint aux labels inconnus du catalogue → **1**.

**Un test bidon attrapé au passage.** La première version du test `ssl/http`
passait *aussi bien avec le découpage supprimé* : le fallback par sous-chaîne
rattrapait le cas. Cela a révélé un vrai défaut de conception — un label de 3+
caractères correspondait par sous-chaîne **même quand le catalogue le connaissait**,
donc « HTTP » se déclenchait sur un hôte purement `https`. Le catalogue est
désormais **précis** (ports et noms exacts), le fallback réservé aux labels
inconnus, et les deux tests isolent vraiment ce qu'ils nomment.

**Vérifié dans le navigateur** (dév isolé, base neuve, conteneurs tués après) :
ligne Favoris absente puis présente au premier ★, filtre et regroupement, retour
par « réinitialiser » ; progression **0/10 → 0/6** dès que 4 étapes deviennent
conditionnelles, **0/6 → 0/8** en cochant SMB ; étapes HTTP grisées à 0.42 avec
case `disabled` ; deux sous-titres `HTTP · INACTIF` pour deux étapes non
consécutives (correct) ; interrupteur qui masque ; détection nmap → FTP + HTTP
cochés, `3389/tcp closed` ignoré, progression 0/10 ; **rechargement** → `triggers`,
`triggerIds` et `activeTriggers` relus depuis l'API (la preuve que le backend est
fait) ; reset qui décoche les déclencheurs ; suppression d'un déclencheur qui le
détache des deux étapes, lesquelles redeviennent inconditionnelles (0/6 → 0/8).

### Reste ouvert

- **Sémantique OU seulement.** Une étape exigeant FTP **et** SMB n'est pas
  exprimable. Le champ étant une liste, le ET s'ajouterait sans changer le modèle.
- **Le catalogue nmap est un jugement**, pas une preuve : ~24 services. Un service
  exotique n'est pas détecté et reste à cocher à la main — le bouton ne décochant
  jamais rien, le pire cas est « il n'a rien trouvé ».
- **Poule et œuf mineur** : le bouton `＋ déclencheur` d'une étape n'apparaît que
  si la roadmap déclare déjà un déclencheur. Documenté dans le README.
- Toujours aucun test de rendu (jsdom + `@testing-library/react` non installés) :
  la logique est couverte, l'interaction ne l'est que par la passe navigateur.

---

## v0.12.0 — Locales par catégorie + formulaire dans la sidebar

**Demande.** « Je voudrais que les variables locales soient communes à une
catégorie peu importe l'outil à l'intérieur. De plus, quand tu cliques sur une
catégorie, afficher comme pour les variables globales un formulaire avec les
variables locales sur la gauche. »

Deux corrections de la 0.10.0, tirées de l'usage réel. Elles **reviennent chacune
sur une décision** que l'utilisateur avait prise à l'époque — c'est assumé et
documenté comme tel, pas glissé sous le tapis.

### Implémentation

- [x] `lib/varsets.ts` — `commandContext` renvoie `'cat:' + cmd.category`. Une
      seule ligne pour les trois vues, parce que la fonction est le **point de
      passage unique** (`Library`, `Cheatsheet` ×2, `Methodology`).
      Le préfixe `cat:` reprend le rôle de l'ancien séparateur `||` : garantir
      *structurellement* qu'un contexte de commande ne peut pas collisionner avec
      un contexte de snippet, quelle que soit la clé de catégorie.
- [x] **Aucune migration, par construction** : les valeurs locales sont en mémoire
      seule (D7), donc les clés `cat||outil` orphelines ne survivent pas au
      rechargement qui introduit le changement. Rien sur disque, rien dans un
      export, rien à réconcilier. Zéro ligne de backend.
- [x] `components/Sidebar.tsx` — le panneau « Variables locales », frère de celui
      des globales. Liste **dérivée** des templates via `extractLocalTokens`
      (déjà exporté, déjà utilisé par l'éditeur de snippet), jamais stockée : elle
      suit une édition de commande gratuitement. Le `✕` vide la **valeur**, pas la
      variable — une locale n'a pas de définition à supprimer, elle existe parce
      qu'un template la mentionne — et garde sa place dans la mise en page via
      `visibility`, pour que l'input ne se redimensionne pas à la première frappe.
- [x] `lib/vars.test.ts` — `commandContext` n'était pas couvert alors que la portée
      est une **décision de comportement**, pas un détail d'implémentation.
- [x] Docs : `CHANGELOG.md` `[0.12.0]`, `README.md` (section `$locales` réécrite :
      portée, les deux façons de saisir, le compromis), `SPEC.md` addendum
      **item 14** qui supersède deux affirmations de l'item 12.

### Résultats

**`make test` vert**, 70 assertions. Les deux nouveaux garde-fous sont prouvés
capables d'échouer : retour à `category||tool` → 1 test rouge ; suppression du
préfixe anti-collision → 1 test rouge.

**Vérifié dans le navigateur** — voir la passe ci-dessous.

### Pourquoi la 0.10.0 avait tranché l'inverse, et pourquoi ce n'était pas une erreur

Utile à garder pour la prochaine fois : en 0.10.0 la portée `catégorie+outil` ne
correspondait à **aucune ligne unique** du menu de gauche, donc « pas de locales
dans la sidebar » était le bon appel *à ce moment-là* — il n'y avait pas de rangée
à laquelle une locale puisse appartenir. C'est l'élargissement de la portée qui
rend le formulaire possible, pas un changement d'avis sur l'esthétique. Les deux
décisions sont liées ; c'est pour ça qu'elles arrivent dans la même release.

### Reste ouvert

- **La portée est plus large, donc plus collisionnable** : deux outils d'une même
  catégorie qui emploient le même nom pour deux choses différentes (`$path` chemin
  web pour `ffuf`, chemin SMB pour `smbclient`) partagent désormais une valeur. Le
  remède est le nommage (`$web_path`, `$smb_path`) ; aucune surcharge par outil
  n'est introduite, et ce serait le premier endroit à regarder si ça mord.
- Toujours aucun test de rendu : le formulaire n'est couvert que par la passe
  navigateur.

---

## v0.13.0 — Sous-étapes, ET/OU sur les déclencheurs, retouches d'ergonomie

**Demande.** Six correctifs : (1) retirer la croix du formulaire des locales,
(2) survol pour lire un nom de variable tronqué, (3) des sous-étapes cochables
dans la Méthodologie (énumérations Windows/Linux), (4) les déclencheurs en
pastilles plutôt qu'en liste déroulante dans le brouillon d'ajout, (5) les
déclencheurs à gauche du libellé de l'étape, (6) un cycle trois états
absent → OU → ET sur chaque déclencheur.

### Décisions prises avec l'utilisateur

- [x] **L'étape reste l'unité de progression** : elle compte pour 1 et est
      terminée quand toutes ses sous-étapes le sont. Retenu contre « chaque
      sous-étape compte pour 1 » (une énumération de 12 items pèserait la moitié
      du pourcentage) et contre « checklist hors progression ».
- [x] **La checklist s'affiche dans le panneau dépliable existant**, pas en
      permanence sous l'étape ni derrière un second chevron.

### Implémentation

- [x] `types.ts` / `backend/store.go` — `SubStep`, `Step.substeps?`,
      `Step.allTriggerIds?` ; `SubstepDTO`, `StepDTO.Substeps`,
      `StepDTO.AllTriggerIDs`. **Le backend n'est jamais optionnel ici** : le PUT
      passe par des structs typées, un champ absent du DTO disparaît au premier
      autosave (leçon 0.11.0, appliquée d'emblée cette fois).
- [x] `lib/triggers.ts` — `isStepDone`, `substepProgress`, `stepTriggerMode`,
      `cycleStepTrigger`, `stepTriggers`, `describeStepTriggers` ; `isStepActive`
      et `stepGroupKey` étendus aux deux listes. Tout est pur, donc testable.
- [x] `store.tsx` — `addSubstep`, `deleteSubstep`, `setChecked(ids, valeur)` en
      **une** mise à jour (une rafale de `toggleCheck` se marcherait dessus) ;
      `stepIdsOf` élargi aux sous-étapes, ce qui suffit à faire cascader
      `deleteRoadmap` / `deletePhase` / `resetProgress` sans les toucher.
- [x] `Methodology.tsx` — points 3 à 6. `Sidebar.tsx` — points 1 et 2.

### Résultats

**`make test` vert**, **70 → 89 assertions**. Les cinq garde-fous sont prouvés
capables d'échouer : sémantique ET (1 rouge), `isStepDone` (3), `progressOf` qui
l'utilise (1), l'ordre du cycle (1), la liste ET dans la clé de groupe (1).

**Un test bidon attrapé, pour la deuxième release d'affilée** — le test de la clé
de groupe passait avec la moitié ET retirée. Le motif est consigné dans
`tasks/lessons.md` : construire un test de discrimination en ne faisant varier
qu'une seule chose.

### Reste ouvert

- La case dérivée retire la possibilité de marquer une étape faite en sautant un
  item : il faut cocher les 12, ou supprimer la sous-étape non pertinente. C'est
  le corollaire de « l'étape reste l'unité ».
- Une seule OU à côté d'une ET se comporte comme deux ET. Inhérent à la
  composition, épinglé par test pour que personne ne le « corrige » par erreur.
- Toujours aucun test de rendu : la checklist et le cycle de pastilles ne sont
  couverts que par la passe navigateur.

---

## v0.14.0 — Le ET/OU devient une propriété de l'étape

**Demande.** « Pour le ET et le OU, je veux juste le contour, n'ajoute pas de ET
OU sur le label. De plus, c'est ET ou OU pour tous les tags, il n'y a pas de tag
en pointillé et de tag plein. »

### Ce que ça corrige dans la 0.13.0

La 0.13.0 avait modélisé l'opérateur en **deux listes** (`triggerIds` = OU,
`allTriggerIds` = ET). C'était plus riche que nécessaire : ça autorisait
exactement le mélange dont l'utilisateur ne veut pas, et ça imposait une
composition `(any OU) ET (all ET)` dont le corollaire — « une seule OU à côté
d'une ET se comporte comme deux ET » — était assez déroutant pour devoir être
épinglé par test. **Une liste plus un mode fait disparaître le corollaire avec le
modèle qui le produisait.** La contrainte posée par l'utilisateur est plus simple
*et* plus juste que ce que j'avais construit : on ne perd aucune expressivité
utile, on gagne un modèle qui dit ce que l'écran montre.

### Un arbitrage renvoyé à l'utilisateur

L'option qu'il avait d'abord retenue — « le 1er clic ajoute sans changer le
mode » — **n'était pas implémentable telle que je l'avais dessinée** : un clic ne
voit que *(assignée ?, mode de l'étape)*, donc « assignée + étape en ET » ne peut
déclencher qu'une seule action. Si c'est « retirer », on ne revient jamais de ET à
OU sans vider l'étape. Je l'ai signalé avec les trois issues possibles plutôt que
de livrer un compromis bancal ; il a choisi le cycle littéral et son effet de bord.

### Implémentation

- [x] `types.ts` / `backend/store.go` — `triggerMode?: 'any' | 'all'` ;
      `allTriggerIds` déprécié mais **conservé dans le DTO Go**, sinon le champ
      serait supprimé au chargement et la migration ne le verrait jamais.
- [x] `lib/triggers.ts` — `normalizeStepTriggers` (pure, donc **testable** : c'est
      tout l'intérêt de ne pas l'enterrer dans un callback React), `modeOf`,
      `cycleStepTrigger` et `stepTriggerMode` réécrits, `isStepActive` simplifié.
- [x] `store.tsx` — `cleanRoadmaps` délègue la migration ; `setStepTriggers`,
      `addStep`, `deleteTrigger` et `copyRoadmapToProfile` sur une liste + un mode.
- [x] `Methodology.tsx` — préfixes `OU `/`ET ` retirés des trois emplacements de
      pastilles ; les infobulles disent l'opérateur *et* ce que fera le prochain
      clic, puisque le libellé ne le porte plus.

### Résultats

**89 assertions, à effectif constant** : les tests des deux listes (table de
composition, corollaire) ont été **supprimés avec le modèle qu'ils décrivaient**,
et ceux de la migration et du cycle ont pris leur place. `make test` vert.

Les cinq garde-fous sont prouvés capables d'échouer, dont deux qui méritaient de
l'être :

- **l'effet de bord du cycle** (1er clic → OU même sur une étape en ET) est
  épinglé, avec un commentaire disant *pourquoi* ne pas le « corriger » ;
- **la clé de groupe** — celle qui était un faux garde-fou en 0.13.0 — est
  maintenant isolée par deux étapes de **même liste** et de modes différents.

### Reste ouvert

- L'effet de bord subsiste : ajouter une pastille à une étape en ET la repasse en
  OU. Assumé, documenté, testé. La seule façon de l'éviter serait un contrôle
  d'opérateur séparé, écarté par l'utilisateur.
- `StepDTO.AllTriggerIDs` reste dans le DTO Go le temps que les profils écrits par
  la 0.13.0 soient relus une fois. À supprimer plus tard.

---

## v0.14.1 — Détection web réparée, et le mot « Cheat » quitte l'écran

**Demande.** « Il y a un bug pour le détecteur HTTP/HTTPS, tu ne le prends pas en
compte dans la détection automatique. Il faudrait aussi changer le nom de la
fenêtre en cheatsheet, j'ai peur que le proctor le prenne mal. »

### Le bug, reproduit avant d'être corrigé

Plutôt que de deviner, j'ai sondé la détection avec onze lignes nmap réalistes.
Deux trous, tous deux laissant une étape web inactive sur une vraie cible :

| ligne nmap | avant | après |
|---|---|---|
| `443/tcp open https` | HTTPS seul | **HTTP + HTTPS** |
| `9443/tcp open ssl/http` | HTTP seul | **HTTP + HTTPS** |
| `80/tcp open http` | HTTP | HTTP *(inchangé)* |
| `10443/tcp open ssl` | rien | rien *(inchangé, à raison)* |

- [x] **HTTP couvre https.** Un service web est un service web : les étapes
      d'énumération derrière ce déclencheur s'appliquent avec ou sans TLS.
- [x] **HTTPS reconnaît le tunnel, pas le port.** nmap écrit `ssl/http` ou
      `tls/http` sur le port qu'il veut ; l'entrée du catalogue gagne un prédicat
      `also(tokens)` pour ce que la recherche par nom exact ne sait pas dire.
- [x] **L'asymétrie est volontaire et épinglée** : HTTP = « il y a une app web »,
      HTTPS = « il y a du TLS devant ». Leurs étapes diffèrent, donc HTTPS doit
      rester le plus étroit des deux et ne jamais s'allumer sur un `http` nu.

### Le nom

- [x] Titre de la fenêtre → « Cheatsheet » (demandé).
- [x] **Étendu, même raison** : le wordmark de la barre du haut et le libellé court
      de l'onglet Cheatsheet, qui affichait « Cheat » seul sous 1200px. Un proctor
      regarde l'écran, pas l'onglet — corriger le seul titre n'aurait résolu que la
      moitié du problème énoncé.
- [x] Wordmark plus long **mesuré** contre la compaction de la barre : pas de
      débordement à 1205px, la largeur la plus serrée où les libellés longs
      s'affichent encore. La barre absorbe en rétrécissant la recherche (150px,
      son plancher étant à 104px).

### Hors périmètre, trouvé en vérifiant

Deux mélanges `border` / `borderColor` **préexistants** (identiques sur
`origin/main`), dans `Methodology.tsx` et `Library.tsx` — la classe de bug que
`Sidebar.tsx:115` documente déjà et que j'avais corrigée pour les pastilles en
0.13.0 : React laisse une couleur de bordure périmée quand l'état rebascule.
Corrigés, une ligne chacun, signalés comme hors demande.

### Résultats

**89 → 94 assertions**, `make test` vert. Les trois garde-fous de la détection
sont prouvés capables d'échouer. Console propre.

Vérifié dans l'app sur le scénario exact du rapport : un scan ne contenant que
`443/tcp open https`, bouton « détecter » → « 2 déclencheur(s) activé(s) : HTTP,
HTTPS », et les deux étapes taguées s'activent. Avant le correctif, l'étape HTTP
restait grisée.

---

## v0.15.0 — Mode édition utilisable, étapes éditables, réinitialisation totale

**Demande.** « En mode modification de méthodologie, je ne veux pas qu'il y ait
des étapes en gris clair, c'est difficile pour éditer. De même en mode
modification je veux pouvoir éditer une étape (déclencheur, libellé, commande).
Quand je clique sur réinitialiser la progression, cela réinitialise la totalité
(donc les résultats des commandes). »

### Implémentation

- [x] **Plus rien de grisé en mode édition.** L'opacité 0.42 rapporte un état de
      *progression* — « cette cible n'a pas ce service » — sans objet quand on
      édite la *structure*. Les cases suivent (`disabled` hors édition seulement) :
      une ligne non grisée avec une case morte aurait l'air cassée. Le suffixe
      `· inactif` reste, ce n'est pas lui qui gênait.
- [x] **`updateStep` — la dette M1 soldée.** Depuis M1 le store n'exposait aucune
      action d'édition d'étape, et la vue le documentait en commentaire depuis
      quatre milestones. Une seule action prend un patch
      `{ text?, commandId?, snippetId? }` et **patche l'étape sans toucher à son
      id** — donc sa coche, son résultat collé et ses variables locales de snippet
      survivent à une édition. Le seul moyen de renommer jusqu'ici,
      supprimer/recréer, détruisait les trois.
- [x] **La réinitialisation efface tout, résultats compris.** Le drapeau
      `alsoResults` de `purgeProgress` n'avait alors plus qu'une valeur possible à
      ses cinq points d'appel : **il disparaît**. Le code est donc plus court après
      le changement qu'avant.

### Un revirement assumé

La 0.11.0 avait décidé que les résultats survivaient à une réinitialisation, au
motif qu'une sortie de commande est une donnée et non de la progression. C'est
défendable — mais sur une nouvelle cible on repart propre. Noté comme tel dans le
CHANGELOG et l'addendum SPEC (item 18) plutôt que glissé comme un détail.

### Résultats

`make test` vert, 94 assertions inchangées : rien de neuf n'est *pur* ici (action
de store + vue), donc la suite sert de filet de non-régression et la couverture
réelle est la passe navigateur.

Vérifié dans l'app :

| Vérification | Résultat |
|---|---|
| mode lecture | étape inactive à 0.42, case désactivée *(inchangé)* |
| mode édition | **toutes** les lignes à opacité 1, cases actives, libellé en `<input>`, 2 `<select>` |
| éditer le libellé + lier une commande | bouton de dépliage passé à `▸ nmap` |
| **id de l'étape après édition** | `services-p0-s1` conservé → **coche et résultat intacts** |
| délier la commande | retour à `▸ résultat` |
| réinitialiser | `checks`, `results` et `activeTriggers` vidés ; libellé édité et déclencheurs déclarés intacts |

Console propre.

### Reste ouvert

- L'édition écrit à chaque frappe, comme le renommage de phase existant. Pas de
  debounce local : l'autosave du store est déjà débouncé à 500 ms.

---

## Mission RT — methodology generated from the RT mindmap (2026-09-14)

Source: `RT-Checklist-TEMPLATE.json` (mindmap export, 200 nodes / 196 edges,
4 disconnected roots, depth up to 8, 33 wiki/repo links).

Decisions locked with the user:

- **Destination**: a new roadmap `Mission RT` appended to the **`Red Team`
  profile**, alongside `Méthodologie OSCP`. Delivered as an importable
  `AppState` JSON built from that profile's current state (import = full replace
  of the active profile, so the file must carry everything it already had).
- **Split**: ~12 fine-grained phases (operational milestones), not the 6 raw
  mindmap branches. Level below = steps, everything deeper = substeps.
- **Links & notes**: the 33 URLs become `references` entries tagged `mission-rt`;
  the executable snippets carried in the mindmap notes become `commands` in the
  Library, linked to their step via `commandId`.

### Tasks

- [x] Parse the mindmap into a clean tree (label / links / notes separated)
- [x] Map the tree onto the ~12 phases, steps and substeps
- [x] Extract the URLs into `references` (tag `mission-rt`)
- [x] Extract the executable snippets into `commands` + link them to their step
- [x] Build the export file from the live `Red Team` profile state
- [x] Validate against `frontend/src/types.ts` (ids unique, commandId resolvable)
- [x] Report: counts, how to import, what was dropped

### Results

| Sortie | Volume |
|---|---|
| Méthodologie `Mission RT` | 13 phases / 83 étapes / 104 sous-étapes |
| Commandes ajoutées (`rt1`–`rt24`) | 24, dont 21 liées à une étape |
| Références ajoutées (`rtr1`–`rtr35`) | 35 — les 35 URL distinctes de la mindmap, taguées `mission-rt` |
| Profil Red Team après import | 405 commandes (381 + 24), 64 références (29 + 35), 2 méthodologies |

Couverture : les 200 nœuds de la mindmap sont représentés. 15 remontent
« non appariés » par le contrôle automatique : ce sont des nœuds de structure
absorbés dans un libellé de phase (`RT-Checklist`, `💼 Préparation d'un exercice`,
`📽️ Scénarios`, `🔎 Reconnaissance du poste de travail infecté`) ou des
reformulations (`Au niveau de nos PDT` → « Au niveau de nos postes de travail »).

Deux libertés prises, à valider :

1. `🎯 Accès initial au S.I` est un nœud **sans enfant** dans la mindmap (présent
   deux fois, en séparateur visuel). Rendu en phase à une seule étape-jalon —
   c'est le trou à combler dans la mindmap source.
2. Le C² MultiCC, Sherpa, PS-Share-listing, TechRecon, Anystack, PEST et Pingo
   sont des outils internes : aucune ligne de commande n'est dans la mindmap,
   donc aucune commande créée. Seules les références pointent vers leur repo.

Vérification : import testé sur une **copie** de la base dans une instance
isolée (port 8788, image reconstruite depuis les sources, volume jetable).
Round-trip backend intact (13/83/104, 0 `commandId` orphelin), rendu confirmé
dans l'interface. Instance et volume détruits après le test ; la base et les
images de l'utilisateur n'ont pas été touchées.

> L'image `cheat:latest` installée date de 7 semaines et **ignore les
> sous-étapes** (ajoutées en v0.13.0) : elles sont silencieusement supprimées à
> l'import. Un `make build` est nécessaire avant d'importer.

---

# 0.16.0 — Renommage « snippets » → « Techniques »

Décision utilisateur : renommage **total** — libellés UI, identifiants de code
ET format JSON (tags des DTO). Libellé FR : « Techniques » / « technique »
(féminin : « Nouvelle technique », « Technique ajoutée »).

## Constats de cartographie

- 329 occurrences de `snippet` dans le code (18 fichiers), 78 dans les docs.
- Les 3 datasets à la racine (`mission-rt.cheat.json`, `oscp-solis.cheat.json`,
  `RT-Checklist-TEMPLATE.json`) **n'ont aucune clé `snippets`** → aucune
  conversion de fichier à faire.
- Les valeurs de variables locales sont mémoire-seule (D7) : les clés de
  contexte `snippetId` / `sheetId:snippetId` ne sont jamais persistées.
- Seule donnée réellement à risque : les blobs `AppState` en base SQLite
  (profils ayant des snippets créés depuis 0.9.0) et tout export fait depuis
  l'app après 0.9.0.

## Stratégie de compatibilité

Un **alias de lecture côté Go** plutôt qu'une migration SQLite : trois
`UnmarshalJSON` custom (`AppState`, `CheatsheetDTO`, `StepDTO`) qui acceptent
l'ancienne clé quand la nouvelle est absente. C'est le point de passage unique
de `GET /state`, `PUT /state` et `POST /import`, donc ça couvre d'un coup les
blobs existants et les vieux exports. Le blob se ré-écrit aux nouvelles clés au
premier autosave — **la migration one-shot devient redondante, je la retire**.

## Étapes

### 1. Backend — `backend/store.go`
- [x] `SnippetDTO` → `TechniqueDTO`, `SnippetStepDTO` → `TechniqueStepDTO`,
      `SnippetLocalDTO` → `TechniqueLocalDTO`
- [x] `AppState.Snippets` → `Techniques`, tag `json:"techniques"`
- [x] `CheatsheetDTO.SnippetIDs` → `TechniqueIDs`, tag `json:"techniqueIds"`
- [x] `StepDTO.SnippetID` → `TechniqueID`, tag `json:"techniqueId"`
- [x] `emptyState()`, `nonNilState()`, `legacyLoadState()` suivent
- [x] 3 × `UnmarshalJSON` (alias legacy `snippets` / `snippetIds` / `snippetId`)
- [x] Commentaires de section (`--- Snippets (v0.9.0) ---`) réécrits

### 2. Frontend — contrat `frontend/src/types.ts`
- [x] `Snippet` → `Technique`, `SnippetStep` → `TechniqueStep`,
      `SnippetLocal` → `TechniqueLocal`
- [x] `Cheatsheet.snippetIds` → `techniqueIds`, `Step.snippetId` → `techniqueId`,
      `AppState.snippets` → `techniques`
- [x] `ViewKey: 'snippets'` → `'techniques'`

### 3. Frontend — `frontend/src/store.tsx` (116 occ.)
- [x] Slices : `snippets`/`setSnippets`/`snippetsRef`, `addingSnippet`,
      `editingSnippetId` → équivalents `technique*`
- [x] Actions : `addSnippet`, `updateSnippet`, `deleteSnippet`,
      `setAddingSnippet`, `openEditSnippet`, `toggleSnippetInSheet`,
      `removeSnippetFromSheet`, `moveSnippetInSheet` → `*Technique*`
- [x] `persistableState` / `hydrateFromState` alignés sur les nouvelles clés
- [x] Flashes FR : « Technique ajoutée / modifiée / supprimée »

### 4. Frontend — composants et vues
- [x] `git mv components/AddSnippet.tsx components/AddTechnique.tsx`
- [x] `git mv components/views/Snippets.tsx components/views/Techniques.tsx`
- [x] `TopBar.tsx` : onglet `label: 'Techniques'`, `short: 'Tech'`, bouton
      d'ajout contextuel
- [x] `Sidebar.tsx` : « Toutes les techniques », facette de tags
- [x] `Cheatsheet.tsx` : chapitre « Techniques », export MD `# Techniques`,
      texte vide « Ajoute des commandes ou des techniques… »
- [x] `PrintRoot.tsx` : `<h2>Techniques</h2>`
- [x] `App.tsx`, `Methodology.tsx`, `CodeBlock.tsx`, `CommandLine.tsx`
- [x] `DataMenu.tsx` : `arrayKeys` accepte `techniques` **et** `snippets`
      (un vieux fichier doit continuer à passer le contrôle de forme)
- [x] `lib/vars.ts`, `lib/varsets.ts`, `lib/vars.test.ts`, `index.css` (commentaire)
- [x] Identifiants locaux : `sn`→`tq`, `sns`→`tqs`, `snipById`→`tqById`,
      `snipItems`→`tqItems`, `snipStep*`/`snipCap*` → `tqStep*`/`tqCap*`
      ⚠ jamais de `sed` aveugle sur `sn` : `snapshot` et `snmp` collisionnent

### 5. Docs
- [x] `README.md` (31 lignes) et `SPEC.md` (12 lignes) mis à jour
- [x] `CHANGELOG.md` : nouvelle entrée 0.16.0. Les entrées passées ne sont
      **pas** réécrites — elles décrivent ce qui s'est passé à l'époque.

### 6. Vérification
- [x] `make down` avant toute chose (rien ne doit tourner sur :8787)
- [x] `make test` : `go test ./...` + `npm run typecheck` + vitest (94 assertions)
- [x] `make build && make up`, passe navigateur : onglet Techniques,
      création / édition / suppression, chapitre Cheatsheet, export MD, impression
- [x] Round-trip export → import JSON
- [x] Import d'un export **legacy** portant `snippets` → doit charger sans perte
- [x] `make down` après les tests

## Branche

`feature/rename-techniques` → commit conventionnel `refactor:` → PR gitea.

## Écarts par rapport au plan validé

1. **SPEC.md n'est pas réécrit.** Ses 12 occurrences étaient toutes dans le
   journal « Implementation status » (items 1–18), daté version par version :
   réécrire l'item 11 aurait falsifié ce que la v0.9 avait livré. Il reçoit un
   **item 19** à la place, et l'en-tête passe à « v0.2–v0.16 ». Même traitement
   que le CHANGELOG, pour la même raison.
2. **Le préfixe d'id reste `sn`.** Non prévu au plan, découvert en route :
   `mint('sn')` produit des ids persistés. Les renommer aurait coupé l'espace
   d'ids en deux sans rien apporter — ils sont opaques et jamais affichés.
3. **Aucune conversion des trois `.cheat.json`** : la cartographie a montré
   qu'aucun ne porte de clé `snippets`. Rien à convertir.
4. **4 tests Go ajoutés** (`backend/store_legacykeys_test.go`) — pas au plan, mais
   l'alias legacy était la pièce la plus risquée et n'avait aucun filet.

## Résultat

- `make test` : 94 assertions vitest + typecheck + `go test ./...` — tout vert.
- Passe navigateur sur une instance jetable (port 8788, volume dédié, détruits
  après) : onglet « Techniques », création, chapitre Cheatsheet, étape de
  méthodologie liée, modale « Nouvelle technique », dropdowns
  « — aucune technique liée — ».
- Import d'un dataset **legacy** (clés `snippets` / `snippetIds` / `snippetId`)
  par le chemin client complet : contrôle de forme franchi, conversion correcte,
  étapes / locals / liens intacts, aucune clé legacy réécrite en base.
- La base de dév de l'utilisateur (`cheat-data`) n'a pas été touchée.


---

# 0.17.0 — Déclencheurs : bascule OU/ET, et la couleur dit le bon état

Deux choses, liées par le même malentendu : en mode édition, l'affichage parle de
**progression** là où il devrait parler de **structure**.

## Le bug

`Methodology.tsx` lignes 1450 et 1781, les deux pickers :

```js
chipStyle(mode !== 'off' && !!activeTriggers[t.id], mode)
```

La couleur vient de `activeTriggers` — « ce service tourne sur la cible » — et non
de « ce déclencheur est choisi pour cette étape ». Conséquence : une puce choisie
mais non détectée reste grise. Sur une étape dont aucun déclencheur n'est détecté,
les cinq puces du picker sont **indiscernables** et la sélection est invisible.
Quand ça semble marcher, c'est une coïncidence : la puce est verte parce qu'elle
est détectée, pas parce qu'elle est choisie.

Précédent qui tranche : la 0.15.0 a retiré le grisé en mode édition au motif que
l'état de progression n'a rien à dire sur l'édition de la structure. Même règle
ici.

## L'opérateur

Aujourd'hui il ne s'écrit nulle part dans l'éditeur : il tient dans le style de
bordure d'une puce de 10px (pointillés = inutilisé, tirets = OU, plein = ET), et
le clic cycle sur trois états en changeant le mode de **toute l'étape**. Décision
utilisateur : une **bascule segmentée `OU | ET`**, contrôle séparé, à partir de
2 déclencheurs choisis (avec 0 ou 1, ET et OU disent la même condition).

## Étapes

### 1. `frontend/src/lib/triggers.ts`
- [x] `cycleStepTrigger` → `toggleStepTrigger(step, triggerId)` : ajoute ou
      retire, le mode est préservé. La puce redevient un oui/non.
- [x] Normalisation : si le résultat a moins de 2 déclencheurs, le mode retombe à
      `'any'`. Sans ça un `'all'` resterait stocké pendant que la bascule est
      masquée, et ressortirait tout seul à l'ajout d'un deuxième déclencheur.
- [x] `stepTriggerMode` devient **mort** (ses deux seuls appelants sont les
      pickers) → supprimé avec ses tests. Le picker n'a plus besoin que de
      « choisi ou non », et la ligne lit son mode via `modeOf`.
- [x] Pas de nouvel helper pour le mode : la vue appelle directement
      `setStepTriggers(rm.id, ph.id, st.id, st.triggerIds ?? [], mode)`.

### 2. `frontend/src/components/views/Methodology.tsx`
- [x] Séparer les deux sens de la couleur au lieu d'un `chipStyle` à double
      usage :
      - `chipStyle(detected, mode)` — hors édition, inchangé (couleur = détecté,
        bordure = opérateur)
      - `pickChipStyle(selected)` — dans l'éditeur (couleur = choisi, bordure
        neutre : c'est la bascule qui porte l'opérateur)
- [x] Picker d'étape existante : puces en bascule simple + contrôle `OU | ET`
      rendu à partir de 2 déclencheurs choisis.
- [x] Picker du brouillon « nouvelle étape » : idem, sur `d.triggerIds` /
      `d.triggerMode`.
- [x] Puces à gauche du libellé : en mode édition elles rendent « choisi »
      (accent), plus de couleur de détection. Hors édition, inchangé.
- [x] Infobulles : plus de « Cliquer : passer toute l'étape en ET ». La puce dit
      « ajouter à l'étape » / « retirer de l'étape », la bascule porte la sienne.
      L'info « détecté sur la cible » reste dans l'infobulle en mode édition,
      donc rien n'est perdu.
- [x] Style : reprendre l'idiome `segBase` / `segOn` de `TopBar.tsx` à l'échelle
      de la puce (10px, MONO) plutôt que d'inventer un contrôle.

### 3. `frontend/src/lib/triggers.test.ts`
- [x] Réécrire le bloc `stepTriggerMode / cycleStepTrigger` pour
      `toggleStepTrigger` : ajout, retrait, mode préservé, mode normalisé
      sous 2 déclencheurs.
- [x] Épingler la disparition du quirk : ajouter un déclencheur à une étape en ET
      la **laisse** en ET (l'ancien test épinglait le contraire).

### 4. Docs
- [x] `README.md` : la section « Several triggers on one step combine as OR *or*
      AND » décrit le cycle à trois états et son quirk — réécrite.
- [x] `CHANGELOG.md` : entrée 0.17.0.
- [x] `SPEC.md` : item 20 (les items 1–19 ne sont pas réécrits).

### 5. Vérification
- [x] `make down` d'abord
- [x] `make test` (Go + typecheck + vitest)
- [x] Passe navigateur sur une **instance jetable** avec un jeu de déclencheurs :
      sélection visible quel que soit l'état de détection, bascule OU/ET,
      apparition/disparition de la bascule au 2e déclencheur, brouillon de
      nouvelle étape, rendu hors édition inchangé
- [x] `make down` après

## Hors périmètre

Le rendu **hors** mode édition ne bouge pas : la bordure y porte toujours
l'opérateur, et le sous-en-tête de groupe l'écrit déjà en toutes lettres
(`── SMB OU FTP ──`). C'est la *gestion* du ET/OU qui était demandée, pas sa
lecture.

## Écart par rapport au plan validé

**La normalisation du mode se fait dans les deux sens, pas seulement à la
descente.** Le plan disait « si le résultat a moins de 2 déclencheurs, le mode
retombe à `'any'` ». Un test l'a pris en défaut : une étape d'avant la 0.17
portant un seul déclencheur et un `'all'` stocké — l'ancien cycle pouvait la
produire en retirant une puce — ressuscitait en ET à l'ajout d'un deuxième, soit
exactement l'état invisible que la normalisation devait empêcher. La règle
devient : le mode ne survit que tant que l'étape **reste** à 2 déclencheurs ou
plus, c'est-à-dire tant que la bascule est à l'écran.

`TriggerMode` a été supprimé en plus de `stepTriggerMode` : c'était son type de
retour, sans autre usage.

## Résultat

- `make test` : 98 assertions (94 + 4), typecheck, `go test ./...` — tout vert.
- Passe navigateur sur instance jetable (port 8790, volume dédié, détruits après) :
  - picker : `SMB` / `FTP` en accent, les trois autres en gris, bascule `OU|ET`
    en fin de ligne
  - clic sur `ET` → le sous-en-tête passe de `SMB OU FTP` à `SMB ET FTP`
  - retrait de `FTP` → la bascule disparaît, le sous-en-tête tombe à `SMB`
  - `FTP` remis → la bascule revient sur **OU**, l'ancien ET n'est pas ressuscité
  - brouillon de nouvelle étape : `SMB` et `MySQL` choisis apparaissent en accent
    alors qu'aucun n'est détecté, `HTTP/HTTPS` et `SSH` détectés restent gris —
    l'inversion demandée
  - rendu hors édition identique à avant
- La base de dév de l'utilisateur n'a pas été touchée.


---

# 0.18.0 — « réinitialiser » dit ce qu'il fait, et la bibliothèque peut être vidée

## Constat

`réinitialiser` (`Library.tsx:318`) appelle `clearFilters` : catégorie, outil, tag,
favoris, recherche, arbre replié. Il n'a jamais touché aux commandes. Ce n'est pas
une panne, c'est le libellé qui ment par omission — l'état vide de la même vue dit
déjà « Modifie ta recherche ou réinitialise **les filtres** » (`Library.tsx:461`).

Aggravant : le bouton est affiché en permanence. Sans filtre actif, le clic ne
produit rien à l'écran, ce qui ressemble à un bouton cassé.

Décision utilisateur : **les deux** — clarifier le libellé ET ajouter un vrai
vidage, pour que les deux ne puissent plus être confondus.

## Étapes

### 1. Le libellé
- [x] `Library.tsx` et `Techniques.tsx` : « réinitialiser » → « réinitialiser les
      filtres ».
- [x] Masqué tant qu'aucun filtre n'est actif. Prédicat sur les filtres
      seulement (catégorie, outil, tag, favoris, recherche) — pas sur l'arbre
      déplié, qui n'est pas un filtre et a ses propres bascules.

### 2. Vider la bibliothèque
- [x] `store.tsx` : action `clearCommands()`, même cascade que `deleteCommand`
      mais en gros :
      - `commands` → `[]`
      - chaque cheatsheet : `commandIds` → `[]`
      - chaque étape de méthodologie : `commandId` → `undefined`
      - `notes` purgées (elles ne sont clavetées que par id de commande)
- [x] **Les catégories sont conservées.** Supprimer aujourd'hui la dernière
      commande d'une catégorie ne supprime pas la catégorie ; le vidage en gros
      suit la même règle plutôt que d'en inventer une autre.
- [x] `Library.tsx` : bouton « Vider la bibliothèque » poussé à droite de la
      ligne d'en-tête (`marginLeft: auto`), séparé du reset de filtres — les
      coller serait recréer la confusion qu'on corrige.
- [x] Confirmation énonçant le **total** et la cascade. Elle porte toujours sur
      toute la bibliothèque, jamais sur le sous-ensemble filtré : le compte
      affiché dans l'en-tête est celui des commandes filtrées, et faire porter
      l'action dessus serait le piège suivant.

### 3. Reliquats du renommage 0.16.0
- [x] `activeSnipCat`/`activeSnipTag`/`setActiveSnip*` (store), `selectSnipAll`/
      `selectSnipCat`/`toggleSnipTag` (Sidebar) et leurs 14 usages dans
      `Techniques.tsx` → préfixe `tq`, celui déjà retenu en 0.16.0 (`tqById`,
      `tqItems`, `tqTagList`). Mon regex d'alors exigeait une frontière de mot
      avant `snip` et a manqué le `Snip` capitalisé en milieu d'identifiant.
      État interne uniquement : rien d'affiché, rien de persisté.

### 4. Docs
- [x] `README.md` : la section Bibliothèque décrit-elle le bouton ? à vérifier,
      et documenter le vidage.
- [x] `CHANGELOG.md` : entrée 0.18.0.
- [x] `SPEC.md` : item 21.

### 5. Vérification
- [x] `make down` d'abord
- [x] `make test`
- [x] Passe navigateur sur **instance jetable**, avec des cheatsheets et une
      méthodologie qui référencent des commandes :
      - le bouton de filtres n'apparaît qu'avec un filtre actif, et son libellé
        dit « les filtres »
      - vidage : confirmation, puis bibliothèque vide, cheatsheets délestées de
        leurs commandes, étapes déliées, notes parties, catégories conservées,
        techniques / références / méthodologies intactes
      - annuler la confirmation ne touche à rien
- [x] `make down` après

## Pas de test unitaire

La cascade vit dans le store, et le projet ne teste unitairement que la logique
pure de `lib/` — les actions du store sont couvertes par la passe navigateur.
Je suis la convention plutôt que d'extraire une fonction pour la seule occasion.

## Résultat

- `make test` : 98 assertions, typecheck, `go test ./...` — tout vert.
- Passe navigateur sur instance jetable (port 8791, volume dédié, détruits après),
  avec un jeu où deux cheatsheets, deux étapes de méthodologie et deux notes
  pointent vers les commandes :
  - sans filtre : pas de lien de reset, « Vider la bibliothèque » seul à droite
  - avec le filtre Recon : « réinitialiser les filtres » apparaît, les deux
    contrôles aux deux bouts de la ligne
  - confirmation annulée → 3 commandes, 2 notes, liens intacts : rien touché
  - confirmation acceptée → 0 commande, notes `{}`, `commandIds` des deux
    cheatsheets vidés, `commandId` des trois étapes délié
  - **préservés** : les 2 catégories (et toujours proposées par le formulaire
    d'ajout), la technique, la référence, la méthodologie, et les
    `techniqueIds` / `techniqueId` qui cohabitaient avec les commandes
  - Cheatsheet et Méthodologie se rendent sans casse après le vidage
  - vue Techniques : même libellé, même règle d'apparition
- La base de dév de l'utilisateur n'a pas été touchée.

