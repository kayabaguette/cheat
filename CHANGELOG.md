# Changelog

All notable changes to **Cheat** are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project is in initial
development (pre-1.0).

## [0.17.0] — 2026-09-17

### Fixed
- **In the trigger picker, the colour said the wrong thing.** It came from
  `activeTriggers` — whether the current target runs that service — and not from
  whether the trigger is part of the step you are editing. So a trigger you had
  just picked stayed grey whenever the target did not run it, and on a step whose
  triggers are all undetected the picker rendered its chips **identically**: the
  selection was invisible. When it appeared to work it was a coincidence — the
  chip was accent because it was detected, not because it was chosen.

  In edit mode the colour now means one thing, "part of this step", in the picker
  and on the chips left of the label alike. Detection moves to the tooltip, where
  it cannot be mistaken for the selection, and the group sub-header still says
  `· inactif`. Same reasoning as 0.15.0 dropping the dimming in edit mode:
  progress state has no business steering a structural editor.

### Changed
- **The step's operator gets its own `OU | ET` switch.** It used to live in the
  border style of a 10px chip — dotted unused, dashed OU, solid ET — with a chip
  click cycling through three states and the middle one silently restyling every
  other chip of the step. The switch sits at the end of the picker row and appears
  once **two** triggers are selected; below that OU and ET are the same condition,
  so there is no choice to offer.

  A chip is now a plain in/out toggle. That kills the quirk 0.13.0 documented and
  pinned by test: because the first click set OU, adding a trigger to a step
  already in ET flipped the whole step back to OU. The old comment argued the
  quirk was the price of driving a step-level operator from a per-chip control —
  correct, and the price is no longer owed now that the operator has a control of
  its own.

  `cycleStepTrigger` becomes `toggleStepTrigger`. `stepTriggerMode` and the
  `TriggerMode` type existed only to serve the three-state chip and are **gone**.

### Notes
- The operator survives only while the step **stays** at two triggers or more —
  exactly when the switch is on screen. Below that it normalises to `'any'`. Both
  directions matter: normalising only on the way down would still let a pre-0.17
  step carrying one trigger and a stored `'all'` — the old cycle could produce
  that — come back as ET the moment a second trigger is added, which is the
  invisible state this rules out.
- **The read view is untouched.** Outside edit mode the border still carries the
  operator and the colour still carries detection, and the group sub-header still
  spells the condition out (`── SMB OU FTP ──`). It was the *handling* of ET/OU
  that needed the work, not its reading.
- No contract, DTO or import/export change: the model was already one list plus
  one mode per step (0.14.0), and only the gestures that write it moved.
- 98 assertions, up from 94: the `cycleStepTrigger` block is rewritten for the
  toggle, and the deleted quirk gets a test asserting its opposite.

## [0.16.0] — 2026-09-17

### Changed
- **« Snippets » are now « Techniques », everywhere.** The name was wrong from the
  start: 0.9.0's own note called the entity "a *reusable technique*", while
  "snippet" means a short fragment — the opposite of an ordered chain of commands
  where each step consumes what the last one produced. The rename goes all the way
  down rather than staying a label: the tab and every French string (feminine —
  « Nouvelle technique », « Technique ajoutée », « Toutes les techniques »), the
  TS types `Technique` / `TechniqueStep` / `TechniqueLocal`, the Go DTOs, and the
  **persisted keys** `techniques`, `techniqueIds`, `techniqueId`.

  Nothing about the entity itself moves — same shape, same scope rules, same
  cascade on delete. `AddSnippet.tsx` and `views/Snippets.tsx` are renamed with it.

### Added
- **The pre-0.16 keys are still read.** This is the first rename to reach the wire
  contract, so every profile blob already in the DB and every export sitting on a
  disk spells it the old way. `AppState`, `CheatsheetDTO` and `StepDTO` each got an
  `UnmarshalJSON` falling back to `snippets` / `snippetIds` / `snippetId` **only
  when the current key is absent** — a fallback, never a merge, so a current
  document is untouched. `GET`/`PUT` state and `POST /import` all decode through
  that one choke point, which is what lets it cover stored blobs and imported
  files at once. The client's import shape whitelist keeps `snippets` beside
  `techniques` so a legacy file is not rejected before it ever reaches the server.

  Four Go tests pin the behaviour: the legacy read (including the nested steps and
  locals, and the sibling fields of each aliased one), new-wins-over-legacy, the
  rewrite-to-new-keys on save, and the absent-key normalisation to `[]`.

### Notes
- **No migration pass over the `profiles` table**, unlike the 0.7.0 one-shot. The
  read alias plus the existing save path do it for free: a blob is read with the
  old keys and rewritten with the new ones at the first autosave. A profile that
  is never touched again keeps the old spelling and keeps loading, which is the
  point of a fallback that stays.
- **Ids keep their `sn` prefix.** They are opaque and every technique already
  stored carries one, so re-prefixing would only split the id space in two for
  nothing.
- Local-value context keys follow the rename (`techniqueId`, `sheetId:techniqueId`)
  at no cost: those values are memory-only (D7) and do not survive the reload that
  introduces the change.
- The CHANGELOG entries and SPEC items below/above this one are **not** rewritten —
  they record what those versions shipped, when "snippet" was the name. SPEC gains
  item 19 instead.

## [0.15.0] — 2026-09-10

### Added
- **A step is editable in place.** Its label, its linked command and its linked
  snippet could only be set at creation: since M1 the store exposed no
  edit-a-step action, a debt the view had been carrying in a comment for four
  milestones. In edit mode the label is now an input and the two links are
  dropdowns, on one extra row under the label alongside the trigger picker that
  was already there.

  All of it goes through a single `updateStep(roadmapId, phaseId, stepId, patch)`,
  which **patches the step and leaves its id alone** — so its checks, its pasted
  result and its snippet-local values survive an edit. Delete-and-recreate, the
  only way to change a label until now, destroyed all three. An empty string in
  the patch unlinks, the convention `addStep` already used at creation.

### Changed
- **Nothing is dimmed in edit mode.** The 0.42 opacity on an inactive step reports
  *progress* state — "this target does not run that service" — which has no bearing
  on editing the *structure*, and it made the rows genuinely hard to work with. The
  dimming, and the greyed group sub-header, now apply outside edit mode only. The
  `· inactif` suffix stays: it is true and useful, and it is not what got in the
  way.

  The step and sub-step checkboxes follow: `disabled` only outside edit mode, since
  an undimmed row with a dead box would just look broken.

- **« Réinitialiser la progression » now clears the pasted results too**, and its
  confirm says so. 0.11.0 had deliberately spared them — "saved command output is
  data, not progression" — which is defensible, but a new target should start
  clean. That decision was implemented by an `alsoResults` flag on `purgeProgress`;
  with the reset now clearing everything, the flag had a single possible value at
  all five call sites and is **gone**, so the code is shorter than before the
  change.

### Notes
- No type, DTO or import/export change: `updateStep` writes fields that already
  exist, and the purge touches maps that already exist.
- Nothing new here is pure logic, so the 94 assertions stand as the non-regression
  net and the coverage is the browser pass — as for every UI change in this
  project.

## [0.14.1] — 2026-09-10

### Fixed
- **The HTTP / HTTPS pair was half-blind in « détecter depuis le résultat ».** Two
  holes, both of which left a web-tagged step inactive on a real target:
  - a trigger named **HTTP did not fire on an `https` service**. `443/tcp open
    https` ticked HTTPS only, so a host serving nothing but TLS left every
    HTTP-tagged step dark. A web service is a web service: the enumeration steps
    behind an HTTP trigger apply whether or not there is TLS in front, so HTTP now
    covers the https ports and service names too;
  - **HTTPS only recognised a TLS tunnel through the port number.** nmap describes
    one as `ssl/http` or `tls/http`, on whatever port it happens to be, so
    `9443/tcp open ssl/http` was missed entirely. The tunnel, not the port, is what
    says TLS, and the catalogue entry now says so with its own predicate.

  The asymmetry is deliberate and pinned by test: **HTTP means "there is a web
  app"** (TLS or not), **HTTPS means "there is TLS in front of it"** — their steps
  differ, so HTTPS must stay the narrower of the two and never fire on a plain
  `http` service. A bare `ssl` service fires neither: it is TLS in front of
  something nmap could not name, and guessing "web" would be wrong.

### Changed
- **The window title reads « Cheatsheet ».** A proctor glancing at a screen during
  an exam should not read the word « Cheat » on its own. The same rename is
  applied to the two other places it stood alone — the wordmark in the top bar and
  the abbreviated « Cheatsheet » tab label on narrow viewports, which read
  « Cheat » — plus the dev-build fallback page. The tab labels, the module names
  and the data are untouched.

### Notes
- 89 → 94 assertions. The three guards behind the detection fix were each verified
  to redden the suite when reverted.

## [0.14.0] — 2026-09-10

Two corrections to the AND/OR shipped in 0.13.0, one of which simplifies the
model rather than adding to it.

### Changed
- **The operator belongs to the STEP, not to each trigger.** 0.13.0 modelled it as
  two lists (`triggerIds` = OR, `allTriggerIds` = AND), which allowed a step to be
  half dashed and half solid — a mix the screen never wanted — and forced the
  composition *(any OR) and (all AND)*, whose corollary ("a lone OR beside an AND
  behaves like a second AND") had to be pinned by test so nobody would treat it as
  a bug.

  One list plus one `triggerMode` (`'any'` default, `'all'`) replaces both. A step
  is active when it has no trigger, or one of them is on in `'any'`, or every one
  of them is on in `'all'`. **The corollary disappears with the model that caused
  it** — the constraint asked for here is both simpler and more truthful than what
  it replaces.

  `triggerMode` absent means `'any'`, so pre-0.13 steps need no migration. A step
  saved by **0.13.0** does: `normalizeStepTriggers` folds `allTriggerIds` into the
  list and sets `'all'`, and `cleanRoadmaps` calls it on load. It is a pure
  function in `lib/triggers.ts` precisely so the migration is testable rather than
  buried in a React callback — without it, an AND condition would have gone
  silently unconditional on the first load after the upgrade. `StepDTO.AllTriggerIDs`
  stays in the Go DTO, deprecated and read-only, or the field would be stripped
  before the client ever saw it; it disappears from stored state after the first
  save.

- **The chips carry no `OU `/`ET ` text any more.** The border says it — dashed OU,
  solid ET — and it now says it for every chip of a step at once, which the model
  guarantees instead of leaving it to convention. An unassigned chip in the picker
  keeps its finer dotted border, distinct from both. Since the operator left the
  label, the tooltip spells it out, and it also says what the next click will do.

### Notes
- **The three-state cycle is unchanged in spirit and now drives a step-level
  property**: unused → OU → ET → unused, where the middle state restyles the whole
  step. It is stateless — a click only ever sees *(assigned?, step mode)*, which is
  exactly three cases.

  **One deliberate side effect, pinned by test**: because the first click sets
  `'any'`, adding a chip to a step already in `'all'` flips the whole step back to
  `'any'`; one more click restores it. That is the price of driving a step-level
  operator from a per-chip control. The alternative — having the first click
  preserve the mode — makes the second click ambiguous (flip, or remove?) and
  locks a step in `'all'` with no way back, so the test says so out loud.
- 89 assertions, unchanged in count: the two-list tests (the composition table and
  the corollary) were **deleted along with the model they described**, and the
  migration and cycle tests took their place. Five guards verified to redden the
  suite when broken, including the group key — the one that was a fake guard last
  release, now isolated by two steps with the same list and different modes.

## [0.13.0] — 2026-09-10

### Added
- **A checklist under a step.** An enumeration step is a dozen one-liners too
  trivial to earn a Bibliothèque entry, but you still want to tick them off.
  `Step.substeps` holds them; an item's done state goes in `checks` under its own
  id, so nothing new is persisted and every existing purge applies to it unchanged
  — widening `stepIdsOf` to return substep ids is what makes `deleteRoadmap`,
  `deletePhase` and `resetProgress` cascade, with no change of their own.

  **The step stays the unit of progress.** It counts for **1** in the phase and
  roadmap fractions and is *done* when every item is — a new `isStepDone` that
  `progressOf` calls, so the three readouts (global, phase counter, phase bar)
  cannot drift apart. A 12-item enumeration therefore refines a 14-step roadmap
  instead of swamping it.

  The row's box becomes **derived** once a checklist exists: `✓` when all are
  ticked, `–` when some are, and clicking it covers the whole block via a new
  `setChecked(ids, value)` — one state update, where a burst of `toggleCheck`
  would have raced on the same object. The row shows `3/12` so the state reads
  without unfolding. The list itself lives at the top of the **existing**
  expandable panel, above the linked command and the « Résultat », so there is no
  second folding mechanism to learn; `+ sous-étape` and a per-item `✕` appear in
  edit mode only, like everything else in that view.

- **AND / OR on a step's triggers.** 0.11.0 shipped OR only. A step now carries
  two lists — `triggerIds` (OR, unchanged meaning) and the new `allTriggerIds`
  (AND) — and is active when:

  > (no OR list, or one of them is on) **and** (all of the AND list are on)

  | OR | AND | active when |
  |---|---|---|
  | ∅ | ∅ | always — unconditional |
  | A, B | ∅ | A **or** B |
  | ∅ | A, B | A **and** B |
  | A, B | C | (A **or** B) **and** C |

  Because `triggerIds` keeps exactly the meaning it had, **no pre-0.13 step needs
  migrating** — the optional-field pattern again.

  One corollary is asserted in the suite so nobody "fixes" it by accident: a lone
  OR next to an AND behaves like a second AND, since both halves must hold.

  A chip cycles on click: **absent → OU → ET → absent**. The visual encoding is
  two independent axes rather than four styles — the **border** says the mode
  (dashed OU, solid ET) and the **colour** says whether the target has that
  trigger. The group sub-header now names the operator (`FTP ou SMB`,
  `(FTP ou SMB) et LDAP`) instead of the `·` that said nothing.

### Changed
- **A step's triggers move to the LEFT of its label**, where they read as a
  condition prefix rather than as an afterthought. They are display-only there;
  all editing happens in the picker below the label, which keeps the row short.
- **The add-step form drops its trigger dropdown for chips** on the same
  three-state cycle as a step's row, so there is one gesture to learn instead of
  two. The draft now carries the two lists rather than a single optional id.
- **The « Variables locales » form loses its `✕`.** Emptying the field already
  clears the value and brings `$nom` back in the commands — the button duplicated
  the backspace key.
- **A long local name is readable on hover.** The label is a 60px cell with an
  ellipsis, so `$wordlist_directories` read `$wordlist_…`; it now carries a
  `title`.

### Notes
- **Backend, again not optional**: `StepDTO.Substeps`, the new `SubstepDTO` and
  `StepDTO.AllTriggerIDs`. A field absent from the typed DTO is dropped on the
  next autosave, so the feature would have worked in memory and died on reload.
  Both additions are optional, so pre-0.13 exports import unchanged.
- **89 assertions** (70 before). Five guards were each verified to redden the
  suite when broken: the AND semantics, `isStepDone`, `progressOf` using it, the
  cycle order, and the AND list being part of the group key.
- **One of those five started as a fake guard, for the second release running.**
  The group-key test compared an OR-only step with an AND-only step — which
  differ on the OR half too, so it passed with the AND half removed from the key.
  The discriminating case is two steps with the *same* OR list and *different* AND
  lists. Recorded in `tasks/lessons.md`: an assertion that passes for a reason
  other than the mechanism it names is not a guard, and only deleting the
  mechanism proves which.

## [0.12.0] — 2026-09-10

Two corrections to 0.10.0, both from actually using the thing.

### Changed
- **A local variable's scope widens from `category + tool` to the CATEGORY.**
  0.10.0 keyed a command's locals on the pair, so `$share` filled on an `nxc`
  command of *Active Directory* did not follow onto that category's `impacket`
  commands. In use that is too narrow: a `$share`, a `$spn`, a `$wordlist`
  describes the target or the goal, not the tool that consumes it, so the value
  had to be retyped tool by tool inside one category.

  `commandContext` (`lib/varsets.ts`) is still the single choke point, so this is
  one line for all three views. The key is now `cat:<category>`, and the `cat:`
  prefix does the job the old `||` separator did for free — it guarantees
  **structurally** that a command context cannot collide with a snippet's
  (`snippetId` / `stepId` / `sheetId:snippetId`), whatever a category key happens
  to be.

  **No migration, by construction**: local values are memory-only (D7), so the
  keys the widening orphans do not survive the reload that introduces it. Nothing
  on disk, nothing in an export, nothing to reconcile.

  The trade is accepted rather than hidden: two tools of one category using the
  same *name* for different things now share one value — `$path` as a web path for
  `ffuf` and as an SMB path for `smbclient`. The remedy is naming (`$web_path`,
  `$smb_path`); no per-tool override is introduced.

### Added
- **A « Variables locales » form in the sidebar, under the global one.** 0.10.0
  deliberately kept locals out of the sidebar — and that was right *at the time*:
  a category+tool pair matched no single row of that menu, so a local had no row to
  belong to. A category **is** a row. Clicking one now reveals a form of its
  locals, built from the same row shape as a global (a `$name` label plus a value
  input), so the two panels read as one system.

  - Shown only in the Bibliothèque with a **category active**. Picking a tool
    inside it keeps the form, since the scope is the category; « Toutes les
    commandes » and « ★ Favoris » show none, there being no scope to edit.
  - Hidden when that category's commands reference no `$minuscule` at all — an
    empty form is pure noise.
  - The list is **derived** from the templates (`extractLocalTokens`), never
    stored, so adding or editing a command updates the form for free.
  - The `✕` clears the **value**, not the variable: a local has no definition to
    delete, it exists because a template mentions it. It keeps its slot in the
    layout (`visibility`) rather than unmounting, so the input does not resize the
    moment you type the first character.
  - The form writes the same context as the in-command double-click, so the two
    stay in lockstep — the form is the overview, the double-click the shortcut.

  « Variables globales » is untouched and still cannot surface a lower-case name:
  `extractTokens` returns the global class only and `customVars` derives from the
  globals-only value map.

### Notes
- Supersedes two rulings of SPEC addendum item 12; recorded as **item 14**.
- No type, DTO or import/export contract change — local values have never been
  persisted, so the backend is untouched.
- `commandContext` was not covered by a test, and the scope is a behavioural
  decision rather than an implementation detail, so it is pinned now: every tool of
  one category shares a context, two categories do not, and a command context can
  never look like a snippet's. Both new guards were verified to redden the suite
  when broken (reverting to `category||tool`, and dropping the prefix). 70
  assertions in total.

## [0.11.0] — 2026-09-10

### Added
- **A « Favoris » pseudo-category in the Bibliothèque sidebar.** The star has been
  a *sort* affordance since 0.5 — it pins a command to the top of its tool group
  and that is all, so there was no way to see *your* commands among 380. A
  « ★ Favoris » row now sits above « Toutes les commandes », appearing only once
  something is starred, so the scope can never be an empty dead end. Its counter
  is a global total like every other sidebar counter (Q50), and the results stay
  grouped by category → tool: knowing a favourite is an `nxc` of *Active
  Directory* is part of what makes it findable.

  It is a scope, not a category — a sibling of « Toutes les commandes » and of a
  category row, so picking any one of the three clears the other two — and like
  them it deliberately leaves the active tag and the search box alone (SPEC:1376),
  so « Favoris » + `#kerberos` + a search term compose.

- **Conditional steps in the Méthodologie, driven by named triggers.** A generic
  OSCP roadmap has to list the enumeration steps for FTP, SMB, HTTP, SMTP, SNMP,
  LDAP, MSSQL… while on any given target most of them are off topic. Worse, they
  counted against the progress bar, so a host running 3 services out of 12 could
  never reach 100%.

  A roadmap now declares its own **trigger vocabulary** (`Roadmap.triggers`), a
  step references the ones that make it apply (`Step.triggerIds`, OR'd), and which
  triggers are ON is per-target progress (`AppState.activeTriggers`). Tick « FTP »
  once in the « Détecté sur la cible » strip and every FTP step lights up, **in
  every phase at once** — which is the reason the condition is a first-class named
  thing rather than a per-step string: the same fact gates enumeration,
  exploitation and post-exploitation steps, and a roadmap stays reusable from one
  target to the next.

  - **An inactive step is dimmed, not checkable, and out of the progress maths** —
    numerator *and* denominator, which is what lets a target reach 100% without
    the services it does not run. A « ☐ masquer les inactives » switch hides them
    when you want a clean view; it appears only on a roadmap that has a
    conditional step, and is **ignored in edit mode**, because you must be able to
    edit what this target does not need. A phase whose every step is inactive is
    hidden too, or the switch would leave an empty card behind.
  - **Unticking a trigger destroys nothing.** A checked step that goes inactive
    keeps its check; it just stops being counted, and re-ticking restores it.
  - **Consecutive steps sharing a trigger set render under a `── FTP ──`
    sub-header**, so the chain reads as a block. This adds **no level to the data
    model**: the grouping is computed at render time from the steps' own trigger
    sets.
  - **`⚡ détecter depuis le résultat`** reads the nmap output already pasted in a
    step's « Résultat » and ticks the triggers it vouches for, reporting what it
    changed. It matches on port *and* on service name — `445` or `microsoft-ds`
    both mean SMB — splits a TLS-wrapped `ssl/http`, and drops the trailing `?` of
    an unconfirmed guess. A label the built-in catalogue does not know still
    matches by appearing in the service name, provided it is at least 3 characters
    (or « DS » would tick on `microsoft-ds`). It is a **pre-fill you correct, not a
    source of truth**: it can only ever tick, never untick, so a chip you set by
    hand always wins and a bad parse can only ever mean "it found nothing".
  - **Attaching a trigger keeps the step's id**, hence its check, its pasted
    result and its snippet-local values — the new `setStepTriggers` action exists
    precisely so this is not a delete-and-recreate.

### Changed
- **« Réinitialiser la progression » now also unticks the detected triggers**, and
  says so in its confirm. They describe the *target* ("this host runs an FTP"), so
  they are progress; leaving them behind would silently hand the next target the
  previous one's service list. Pasted results are still kept, as before.
- **Deleting a trigger reaches three places**: the roadmap's vocabulary, the
  `triggerIds` of every step referencing it, and its ON state. Skipping the second
  would leave those steps gated on a condition nothing can ever turn on —
  permanently inactive, with no way to fix it from the UI.
- **Roadmaps are normalised on load** (`cleanRoadmaps`), like commands' tags and
  references' URLs before them: triggers de-duplicated by id, and any step
  `triggerId` referencing a trigger its roadmap does not declare is dropped. They
  used to be hydrated raw.
- **`copyRoadmapToProfile` carries the trigger vocabulary** (its ON state does not
  — a cross-profile copy is structural, same rule as `checks`/`results`). While
  rewriting that clone literal, the **`snippetId` it had been silently dropping
  since 0.9.0** is fixed: every optional step field has to be listed there or it
  vanishes on copy.

### Notes
- **The backend was not optional here.** `saveProfileState` unmarshals the PUT
  into typed DTOs and re-marshals before storing, so any `Step` field not declared
  in `StepDTO` is silently dropped on the next 500 ms autosave — a frontend-only
  feature would have worked in memory and died on reload. `StepDTO.triggerIds`,
  the new `TriggerDTO` on `RoadmapDTO`, and `AppState.activeTriggers` are all
  present, the last initialised in `emptyState()` so it marshals to `{}` and not
  `null`. Both new fields are **optional**, so every pre-0.11.0 export stays
  importable with no migration — the `Step.snippetId?` pattern from 0.9.0.
- **New suite: `frontend/src/lib/triggers.test.ts`, 31 assertions** (67 in total
  with the tokenizer's), covering the two things that carry real risk — the
  progress arithmetic and the nmap parser, which reads text a human pasted from a
  tool we do not control. Five guards were each verified to redden the suite when
  removed: the activity filter in `progressOf` (3 tests), the `open` requirement in
  the port line (2), the 3-character floor on the substring fallback (1), the
  `ssl/` + `?` normalisation (2), and restricting that fallback to labels the
  catalogue does not know (1).

  That last one is why the catalogue lookup is now **precise** — ports and exact
  service names, no substring. The first version let any label of 3+ characters
  match by substring even when the catalogue knew it, which made « HTTP » tick on
  an `https`-only host *and* made the `ssl/` splitting unobservable: its test
  passed with the splitting removed. A guard that cannot fail is not a guard.
- Progress has no document-export surface (`PrintRoot` and the Markdown export
  render cheatsheets only), so there was nothing to update there. The JSON dataset
  export does carry `activeTriggers`, which is why it joins `DataMenu`'s
  import-shape whitelist — otherwise a legitimate export would be refused on
  import.

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
