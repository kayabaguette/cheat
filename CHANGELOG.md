# Changelog

All notable changes to **Cheat** are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project is in initial
development (pre-1.0).

## [0.10.0] — 2026-09-10

### Added
- **Local variables in commands, scoped to a tool.** `$MAJUSCULES` are app-wide;
  `$minuscules` are now the app's second variable class in their own right,
  available in the **Bibliothèque** and not only inside a snippet. A local's value
  is shared by every command of the same **category + tool** pair (context key
  `category||tool`): fill `$share` on one `nxc` command of *Active Directory* and
  every other `nxc` command of that category shows it, while no `impacket` command
  does. That is the unit that matches how the data is actually organised — `$share`
  means something to `nxc` and nothing to `sqlmap` — and it is deliberately
  narrower than the global set, which §5.1 keeps unscoped.

  A value set in the Bibliothèque is therefore *already* set on the same command in
  a Cheatsheet or a Méthodologie step. That is intended: it is the same context.

- **Double-click a `$minuscule` to set its value, in the command itself.** No form
  and no sidebar row: the token becomes an inline input exactly where you read it,
  controlled straight from the store — every keystroke lands in the context's value
  map, like the sidebar's global inputs — with Enter / Escape / blur only closing
  the editor. **Emptying the field drops the value and the token reads `$name`
  again**, everywhere in its scope. Hovering a local reveals a dashed outline; at
  rest it shows nothing at all, which is the point (see *Changed*).

### Changed
- **A local no longer has to be declared** (supersedes SPEC addendum item 11 b1).
  Until now a `$minuscule` counted only inside a snippet that listed it in
  `locals[]`, and that declaration was the guard keeping ordinary shell text out of
  the grammar. A `Command` has no such list, so the guard is now a **name ban**,
  enforced in `isLocalName` — declarations included, so no form can mint a name the
  renderer would refuse:

  - a **single-character** name is never a local (`$f`, `$i`, `$x` — shell loop
    variables, `for f in …; do cat "$f"; done`);
  - the **reserved names** `env, global, script, local, private, using, workflow,
    args, input, true, false, null` are never locals;
  - and one **positional** rule, which therefore lives in the tokenizer rather than
    in the name class: a lower-case token immediately followed by **`:`** is a
    PowerShell scope or drive prefix — `$env:USERNAME`, `$global:x`, `$using:v` —
    and never a variable. The colon is the tell, so the single rule covers all of
    them, present and future.

  Everything else in lower case is fair game, which is the whole point: `$share`,
  `$path`, `$file`, `$hash`, `$wordlist`, `$spn`. The trade is explicit — a `$file`
  in a bash one-liner *is* a variable now. It renders as its own literal `$file`,
  pixel for pixel the plain text it was, and only a value typed into it on purpose
  would change the line.

  Measured: all **380 dataset templates and all 27 seed templates render
  byte-identically**, since neither holds a single lower-case or mixed-case token.

- **`Snippet.locals[]` becomes an optional declaration.** It no longer gates
  recognition, and keeps two jobs worth having: it carries the `hint` (a capture
  field's placeholder) and the per-step **« produit »** anchor that puts a capture
  field under the step that yields the value. The « Variables locales » strip and
  the per-step capture fields are **unchanged** and write the same context as the
  double-click, so all three paths stay in lockstep. `definedNamesWithLocals` is
  gone with the requirement it served.

- **A snippet line is copied by its copy button again; clicking the line does
  nothing** (supersedes SPEC addendum item 11 b3). 0.9.0 had made the whole line a
  copy target; that spent the line's click gesture, and a double-click is two
  clicks — entering the value editor would have copied the line twice on the way
  in. Snippet lines now carry the same `.copy-btn` as a command card and a
  cheatsheet entry, so the three surfaces copy identically. The two guards 0.9.0
  needed for a whole-line target (a click ending a text **selection** copies
  nothing; a missing `navigator.clipboard` reports the failure rather than faking
  it) collapse into `<CopyButton>`'s single clipboard path, which already enforces
  the second and no longer needs the first.

- **The sidebar panel is « Variables globales », and holds nothing else.** A local
  belongs to one place, so it has no meaningful row in an app-wide panel; the label
  now says so. Nothing there could have surfaced one anyway — the value rows derive
  from the globals map and `extractTokens` returns the global class only, so the
  « Détectées » strip cannot offer a lower-case name for adoption.

- **No fifth render state; SPEC §5.10 stands untouched.** A local projects onto the
  existing states: `resolved` when valued, `empty` (its own literal `$name`,
  neutral) when not. It is never `undef` — there is no declaration list for it to be
  missing from — so the dotted underline stays reserved for a global pointing at no
  definition. The edit affordance is orthogonal to the state and revealed on
  **hover only**, which is what keeps an unvalued local visually inert.

### Notes
- **OPSEC unchanged, and the guarantee now covers one more surface for free.**
  Command-local values join the same memory-only `localValues` map (never in
  `AppState`, never sent to the API, reset on reload). Both file-export paths —
  `exportMd` and `PrintRoot` — resolve against the **globals map alone**, so
  addendum item 11 b2's rule (a `$local` is never substituted into a file, *even*
  with « résoudre les variables » ON) extends to command locals with **no change to
  either path**. The clipboard still resolves both classes (Q99). Locked by test:
  `resolve('nxc smb $RHOST … --share $share', globals)` must keep `$share` raw.
- **The tokenizer suite grows 28 → 36 assertions**, and the three new bans are each
  proven capable of failing: dropping the single-character rule reddens 4 tests,
  the colon guard 2, the reserved list 2. `make test` green end to end (Go +
  `tsc --noEmit` + Vitest, in containers).

## [0.9.2] — 2026-08-24

### Added
- **Vitest, and a replayable test suite for the variable tokenizer.** The
  non-regression checks that guarded the 0.9.0 grammar change and the 0.9.1 `$_`
  fix were throwaway scripts living outside the repository — they proved the
  change once and then vanished. `frontend/src/lib/vars.test.ts` turns them into
  28 permanent assertions, and `make test` runs both suites in containers (Go +
  Vitest + `tsc --noEmit`), so no host toolchain is required.

  The suite is written as a **specification**, not as a diff against the previous
  implementation: it asserts the two name classes, the four render states, both
  token extractors, and `definedNamesWithLocals`. Two invariants are pinned
  because nothing else enforces them:
  - a snippet **local is never substituted by the globals map** — the structural
    reason a captured hash cannot reach a Markdown/PDF export (SPEC addendum
    item 11 / D7), so a refactor cannot quietly pass the merged map instead;
  - **no shipped seed command references anything but the built-in variables**,
    which would otherwise render as an "undefined variable" hint for every new
    user.

  The two bugs it was born from are pinned as named cases: `echo $RHOSTx`
  substituting mid-word, and `$_` being offered as a variable. Both were verified
  to actually fail the suite when reintroduced (5 and 8 failing tests
  respectively) — a guard that cannot fail is not a guard.

### Documentation
- **How to declare a snippet-local variable.** The per-step « produit » dropdown
  only lists locals that already exist, so on a fresh snippet its only option is
  `(rien)` — which reads as a broken field rather than as an unmet precondition.
  The README now spells out the two ways to declare one (type `$svc_ntlm` in a
  step and click the `détectées` chip, or use `+ variable locale`) and what
  picking it in « produit » actually does. Behaviour is unchanged.

### Notes
- Vitest brings its own newer nested Vite/esbuild; it introduces **no** new
  `npm audit` finding. The two pre-existing dev-only advisories are against the
  project's top-level `vite@5.4.21` / `esbuild@0.21.5` and are unchanged.

## [0.9.1] — 2026-08-24

### Fixed
- **`$_` was offered as a global variable.** The global token class was
  `^[A-Z_][A-Z0-9_]*$`, and a bare `_` satisfies the leading `[A-Z_]` — so
  PowerShell's and bash's own `$_` (and `$__`, `$_1`) was picked up by the
  sidebar's « Détectées » strip with a `+` to adopt it as a variable, and rendered
  with the dimmed "undefined" hint inside commands. A global name must now
  contain **at least one upper-case letter**: a name built only from `_` and
  digits can never be a Cheat variable, so those tokens are now plain text like
  any other shell text. `$_FOO` and friends are unaffected — only the letter-less
  names are excluded. The bug predates 0.9.0 (the old grammar had the same
  leading class); 0.9.0 only made it more visible by also scanning snippet steps.
- **The rename form and the adopt action now share the tokenizer's rule.**
  `renameVar` validated against its own copy of the pattern and `adoptVar`
  validated nothing, so either could mint a variable name (`_`) that the renderer
  would then refuse to treat as one. Both call `isGlobalName` now.

## [0.9.0] — 2026-08-24

### Added
- **Snippets — ordered command chains.** A fifth module for the case one command
  cannot cover: a *technique* whose actions run one after the other, each
  commonly consuming what the previous produced (dump a service account's hash →
  read the domain SID → forge and inject a silver ticket → use it). A snippet is
  **reusable library content**, unlike a Roadmap (per-engagement progress) or a
  Cheatsheet (a deliverable). Shape:
  `Snippet {id, category, title, desc, tags[], steps[], locals[]}`, with
  `SnippetStep {id, label?, template, produces?}` carrying an **inline** template
  (a step never references a command, so a snippet is self-contained) and
  `SnippetLocal {name, hint?}` being a **definition only**. A snippet has a
  category and tags but **no tool**, so its sidebar facet is a flat category list
  instead of the Bibliothèque's category → tool tree.
- **Two classes of variables.** `$MAJUSCULES` stay the app-wide variables edited
  in the sidebar. `$minuscules` are **local to one snippet**, filled from the
  previous step's output, and are what turn an ordered list into an actual chain:
  type the captured hash under the step that produced it and every downstream
  line goes green, resolved and ready to paste.
- **Copy a line by clicking it.** A chain cannot be executed in one go, so each
  line is its own click target and the copy icon flashes at its right end for
  ~900 ms — **on success only**. Two deliberate guards: a click that ends a text
  **selection** copies nothing (selecting a fragment by hand keeps working), and a
  missing `navigator.clipboard` — the norm over plain HTTP on the LAN since
  0.3.0 — reports the failure rather than faking it, so you never paste an empty
  clipboard believing you hold a hash.
- **Snippets in the Méthodologie and the Cheatsheet.** A step may link a
  command, a snippet, or **both** (`Step.snippetId` is cumulative with
  `commandId`); its panel renders the command block, then the chain, then the
  unchanged « Résultat » textarea. A cheatsheet gains a second
  « Snippets » chapter next to « Commandes », independently ordered, exported to
  Markdown and PDF. Chapter headings appear only when both chapters are
  populated, so a commands-only sheet reads exactly as before.

### Changed
- **Token grammar — supersedes SPEC §3.2.7.** `$NAME` widens from
  `[A-Z_][A-Z0-9_]*` to `[A-Za-z_][A-Za-z0-9_]*`, and a name is then classified
  **strictly**: entirely upper case → global; entirely lower case → snippet-local,
  **and only when declared** in that snippet's `locals[]`; anything **mixed-case
  is not a token at all** and stays plain text. Those two guards are what make
  widening safe, because shells write `$name` constantly — mixed case covers
  PowerShell's own variables (`$PSVersionTable`, `$ErrorActionPreference`,
  `$MyInvocation`) and the declaration requirement covers lower case
  (`$env:USERNAME`, `$file`). Verified by diffing the old and new tokenizers over
  the real dataset: **all 380 templates render byte-identically**.
- **Top bar: the long → short tab-label breakpoint moves from 940px to 1200px.**
  Measured, the bar needs 1312px incompressible with five long labels, so the
  fifth tab made it overflow the page between ~940 and ~1150px. The wordmark
  still drops at 940px (the old rule was split in two).
- **The Cheatsheet tab badge counts both chapters** (commands + snippets).

### Fixed
- **`echo $RHOSTx` silently substituted to `10.10.10.5x`.** Under the old
  grammar a token ended at the first lower-case letter, so `$RHOST` matched
  inside a longer word and was replaced mid-word. Mixed-case names are now inert.
- **A variable rename could corrupt plain command text.** The `renameVar`
  cascade's lookahead excluded `[A-Z0-9_]` but not lower case, so renaming
  `$USER` would have rewritten `$USERx` — plain text under the new grammar — into
  `$OWNERx`. Now `[A-Za-z0-9_]`.
- **A pre-0.9.0 dataset became un-re-importable after one import.** The write
  handlers bind into a zero-value `AppState`, so a key absent from the body
  (every older export omits `snippets`) was stored as JSON `null`; the next
  export emitted `null`, and the client's import shape check — which demands an
  array — then rejected the app's own export. Every array and map is now
  normalised in `saveProfileState`, the single choke point both `PUT state` and
  `POST import` go through.

### Security
- **Snippet-local values are memory-only AND never written to a file.**
  Definitions persist with the snippet; the **values never touch the disk** —
  they hold exactly what must not be persisted (an NTLM hash, a SID, a ticket).
  They live outside `AppState`, keyed per **usage context** so one independent set
  exists per place a snippet appears, and they are cleared by a reload. In
  **Markdown and PDF exports a `$local` is never substituted, even with
  « résoudre les variables » enabled**: SPEC §9.6's "raw by default, resolved on
  opt-in" now applies to globals only. This is enforced structurally — the export
  paths resolve against the globals map, in which a local simply does not exist —
  not by a check that could be forgotten. The clipboard still resolves both
  classes (Q99), which is the point of a chain.
- **The sensitive-export guard now scans snippet steps.** A `$PASS` used inside a
  chain was invisible to the old command-only scan; a resolved export would have
  written it to disk with no confirmation.

## [0.8.0] — 2026-07-26

### Added
- **Foldable left sidebar (SPEC Q145).** A ☰ button at the far left of the top bar
  folds/unfolds the 272px sidebar (Variables + Catégories + Tags); the folded
  sidebar is unmounted, so its width goes back to the content region. The state is
  a **device-local** preference persisted in `localStorage['cheat.sidebar']` — the
  only localStorage key the app uses. It is deliberately **not** part of the
  profile `AppState`, so it stays out of the import/export contract and is
  identical across profiles, and it never holds a variable value (D7/OPSEC intact).
- **Auto-fold below 780px — overrides Q145's "manual only, no auto-collapse".**
  A `matchMedia('(max-width: 780px)')` listener folds the sidebar when the viewport
  *crosses into* the narrow range and restores the **manual preference** when it
  crosses back out; on mount, a narrow viewport starts folded. The auto path never
  writes `localStorage`, so the user's own choice survives a trip through a narrow
  window, and a manual toggle still wins at any width (it is only re-evaluated the
  next time the width class changes). Threshold shared with the top-bar compaction
  step, so the whole chrome tightens at once.

### Fixed
- **`Library.tsx` was diffed as a binary file.** The synthetic "Sans catégorie"
  group key was a literal **NUL byte** (`'\0orphan'`), which made git classify the
  whole file as binary — no diffs, no grep hits. Replaced by a named
  `ORPHAN_KEY = '__orphan__'` constant (the key only has to never collide with a
  real `Category.key`, which is always a slug). Behaviour is unchanged: verified
  the group still renders for a command with a dangling category.

### Changed
- **Responsive content region — overrides D8/R4 ("desktop-only strict, no mobile
  reflow").** The hard ~900px `min-width` on the content region is **removed**: the
  Bibliothèque and Références card grids now use `minmax(min(370px|340px, 100%), 1fr)`,
  so `auto-fill` collapses them to a **single stacked column** on a narrow pane
  instead of forcing a horizontal scroll. Above ~900px the layout is byte-for-byte
  unchanged (the `min()` only engages once the pane is narrower than one card).
  Méthodologie and Cheatsheet already used `width:100%; max-width:820/840px`
  columns and reflow as-is. The content pane keeps its `overflow-x: auto` as a
  safety net; wide command templates still scroll inside their own `<pre>`.
- **Top bar compacts instead of overflowing.** Below the breakpoints, in order:
  search shrinks (1080px), the "Cheat" wordmark is dropped and the tab labels
  switch to short forms — Biblio / Métho / Réfs / Cheat — (940px), the add-button
  label is dropped and gaps/padding tighten (780px), the profile name is dropped
  and the tab strip becomes internally scrollable (640px). Nothing overflows the
  viewport down to 480px. Implemented as `.tb-*` classes + media queries in
  `index.css` (no resize listener, no re-render); the affected properties must
  therefore not be set inline in `TopBar.tsx`.

## [0.7.3] — 2026-07-21

### Fixed
- **Custom category had no color.** A category created in an empty profile on an
  earlier build got an undefined palette color (negative index) and was persisted
  colorless, so its dot/bar in the Bibliothèque stayed blank. Categories are now
  healed on load — any category without a color is assigned a deterministic palette
  color (and re-saved), so every category shows one like the built-ins. (The
  creation path was already guarded in 0.7.2; this repairs already-stored data.)

## [0.7.2] — 2026-07-21

### Fixed
- **Category change ignored when editing a command.** The edit form submitted via
  `updateCommand`, which — unlike `addCommand` — didn't handle a newly-created
  category, so assigning a category to an uncategorized command (via the “+” field)
  was silently dropped on save. Category resolution is now shared between add and
  edit (`resolveCategory`): a typed new category is created on edit too, an empty
  selection falls back to « Autre », and the custom-category color no longer breaks
  in an empty profile (negative palette index guarded).

## [0.7.1] — 2026-07-21

### Fixed
- **Command invisible in an empty profile.** A brand-new profile has no built-in
  categories, so a command added without choosing/creating one was saved with an
  empty category and rendered nowhere (though the count still included it). Now the
  add form falls back to a catch-all **« Autre »** category when none is given
  (mirrors the `tool = "Divers"` default), and the Bibliothèque surfaces any command
  whose category is unknown under a **« Sans catégorie »** group — so existing
  orphaned commands (and imported datasets with a dangling category) stay visible
  and editable.

## [0.7.0] — 2026-07-20

### Added
- **Multiple profiles.** A profile is an isolated dataset (its own commands,
  methodology, references and cheatsheets) — e.g. one for OSCP, one per red-team
  engagement. A profile menu in the top bar switches, creates, renames and deletes
  profiles. A **new profile** is either empty or a **clone** of an existing one
  (whole dataset copied). A single command, reference or methodology can be copied
  into another profile with fresh ids (a copied command brings its category + note;
  a copied methodology is structure only — unchecked, no saved results). Deleting
  the last profile is refused.
- **Command card decluttered to two controls** — a favorite star and a **☰ menu**
  folding *Éditer*, *Supprimer* and *Cloner vers <profil>* (the cross-profile copy).

### Changed
- **API is now per-profile.** Each profile is one `AppState` stored as a JSON blob
  in a new `profiles` table. New routes `GET/POST /api/profiles`,
  `PUT/DELETE /api/profiles/:id`, `POST /api/profiles/:id/activate`,
  `GET/PUT /api/profiles/:id/state`; `import`/`export` act on the active profile.
  The former global `GET/PUT /api/state` is removed. An existing single-dataset DB
  is **migrated automatically** on first start into a profile named **OSCP**
  (one-shot, transactional, non-destructive).
- Variable *values* remain global to the session and are **unchanged when switching
  profiles** (a profile scopes content, not values — D7 preserved).

## [0.6.0] — 2026-07-18

### Added
- **Command results in Méthodologie.** Every step — whether or not it links a
  command — has a **Résultat** area in its expandable panel where you can paste
  and save the command's output/findings. Results are **persisted** (a new
  `results` map keyed by step id, part of the import/export `AppState`, stored in
  the same `kv` table as `checks`/`openSteps` — no schema migration). A collapsed
  step whose result is non-empty shows its toggle in the accent colour. Deleting
  a step/phase/roadmap purges its result, but **« Réinitialiser la progression »
  keeps saved results** (they are data, not progress).

### Security / OPSEC
- Captured command output can contain credentials/hashes and is stored in the
  database in **cleartext** (same posture as notes; rely on full-disk
  encryption). The result inputs disable autocomplete/spellcheck.

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
