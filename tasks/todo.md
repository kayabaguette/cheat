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
