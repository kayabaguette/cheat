# Cheat — Journal des décisions de spécification

> Réponses verrouillées avec l'utilisateur pendant la finalisation des specs. Source de vérité pour rédiger `SPEC.md`.
> Statut : **en cours** — questionnaire complet dans `tasks/spec-questions.md` (196 questions, 12 thèmes).

## Contexte technique verrouillé (pré-questionnaire)

- Frontend **Vite + React + TypeScript**, port fidèle du système visuel du design (styles inline + CSS-vars, IBM Plex, angles droits, accent `#3ddc97`, thème sombre/clair).
- Backend **Go + Gin + GORM + SQLite**, **binaire unique** embarquant la SPA (`go:embed`), API même-origine.
- Persistance **SQLite** + **import/export JSON** du dataset.
- UI d'ajout de **variables personnalisées** souhaitée.
- UI en **français**, docs repo en **anglais**. Livraison via **gitea** (push/PR).
- Rule 7 / frontend-design : non requis pour ce port (design déjà approuvé).

## Décisions bloquantes

- **D1 — Cheatsheets : PLUSIEURS cheatsheets nommés** (barre d'onglets + create/rename/delete, réutilise l'UX roadmap). Cascade sur notes, variables, sélection, export. ✅
- **D2 — Valeurs de variables : jeu global unique** ; les *définitions* sont modélisées séparément des *valeurs* (extensible vers des profils plus tard sans migration). ✅
- **D7 — Sécurité : la DB ne stocke QUE les définitions de variables, jamais leurs valeurs → aucune donnée sensible au repos → PAS de chiffrement.** (Plus de SQLCipher/passphrase.) ✅
- **D8 — Layout : desktop-only strict**, min-width dure (~1024–1280px), scroll horizontal en dessous. ✅

## Décisions structurantes (confirmées)

- **Valeurs de variables — MÉMOIRE SEULE (session)** : les valeurs ne sont jamais persistées (ni DB, ni localStorage), remises à zéro à chaque rechargement. Corollaire : l'export JSON ne contient jamais de valeurs ; seul l'export d'un cheatsheet (action explicite) matérialise les valeurs résolues. ✅
- **D3 — Persistance backend : autosave optimiste débouncé (~500 ms)** par entité mutée, file de retry en arrière-plan, indicateur d'erreur uniquement, pas de bouton « Enregistrer ». ✅
- **D4 — Import JSON : REPLACE complet** + snapshot automatique pré-import + confirmation + transaction atomique + enveloppe versionnée. Export = contenu utilisateur (définitions de vars incluses, valeurs exclues). ✅
- **D5 — IDs : ULID/UUID frappés serveur** pour toutes les entités ; **Phases/Steps = lignes de 1ʳᵉ classe** (ID stable + colonne position) ; progression clée par step ID ; IDs de seed conservés littéraux. ✅
- **D6 — CRUD complet** (création + édition + suppression) pour Commandes **et** Références, avec règles de cascade. ✅

## Thèmes du questionnaire (196 Q) — statut

- [x] Modèle de données & IDs (11) · [x] CRUD & intégrité référentielle (8) · [x] Variables (17)
- [x] Bibliothèque (20) · [x] Méthodologie (20) · [x] Références (12)
- [x] Cheatsheets & export (22) · [x] Persistance & sync (10) · [x] Import/export & backup (18)
- [x] Visuel, responsive & a11y (22) · [x] Sécurité & OPSEC (18) · [x] Périmètre, NFR & déploiement (8)

**Toutes les 196 questions sont résolues** (recos adoptées + forks D1–D8 + Q99).

✅ **`SPEC.md` rédigée** (racine du repo, ~2950 lignes, 12 sections + Open Items + Traceability), critique de cohérence passée (3 problèmes mineurs corrigés). En attente de relecture/validation par l'utilisateur avant l'implémentation (M0 scaffold). Points ouverts non bloquants listés dans `SPEC.md` §Open Items (dont la **licence du dépôt** = seule vraie décision restante).

_(les recos adoptées font foi : voir `tasks/spec-questions.md` pour le texte complet de chaque Reco. Seules les décisions notables/dérogations sont détaillées ci-dessous.)_

### Thèmes 1–3 — recos adoptées (« ok pour les recos »)

**Modèle de données (Q1–Q11)** — points notables :
- Q3 : **18 catégories du prototype** = source de vérité (DCLogic fait foi), toujours seedées, masquées en sidebar si vides. Libellé AV-evasion réconcilié.
- Q4 : table unique `categories(id,label,color,is_builtin,position)` + FK depuis `commands`.
- Q5 : `tool` = colonne texte libre ; arbre catégorie › outil dérivé à la requête.
- Q6 : tags = tableaux de strings par entité (pas de table) ; filtre tag scanne les commandes uniquement.
- Q7 : **renommer `Step.note` → `Step.commandId`** (FK nullable 0..1) ; `note` réservé aux notes perso libres.
- Q10 : colonnes `position` sur phases / steps / entrées cheatsheet ; commands/refs/roadmaps par date de création.
- Q11 : couleur stockée par catégorie (défaut = prochaine couleur palette, override manuel).

**CRUD & intégrité (Q12–Q19)** — points notables :
- Q14 : suppression d'une commande → nuller les liens step (garder le texte), retirer de toutes les cheatsheets, supprimer la note orpheline, confirmer avec compte de références.
- **Q16 (dérogation assumée)** : références = **✕ immédiat + toast undo** (asymétrie voulue vs Q13 commandes = confirmation destructive).
- Q17 : catégories builtin renommables/recolorables **non supprimables** ; custom pleinement éditables ; delete d'une catégorie bloqué si elle contient des commandes (proposer réassignation vers Utilities).
- Q18 : items seed = lignes ordinaires éditables/supprimables (mêmes cascades), exportées comme toute ligne.
- Q19 : cascade-delete de l'état dépendant (checks/openSteps/notes/sélection) à chaque suppression de parent.

**Variables (Q20–Q36)** — points notables :
- Q20 : variables = liste ordonnée d'enregistrements `{name,type,sensitive,is_builtin,position}` ; **définitions en DB, valeurs JAMAIS persistées (mémoire seule)**.
- Q22 : grammaire élargie `$[A-Z_][A-Z0-9_]*` + auto-uppercase (resolver + tokenizer + validation alignés).
- **Q25** : 6 variables standard value-editable seulement (pas rename/delete), fixes en haut, masquables ; custom en ordre de création. **Ordre canonique = spec §04 : `IP, LHOST, LPORT, USER, DOMAIN, PASS`.**
- Q26 : UI variables = ligne inline « + Variable » + rename/delete au survol (pas de modal).
- Q27 : rename d'une variable → réécriture cascade de `$OLDNAME` dans tous les templates (une transaction), compte affiché.
- **Q31 (spec > prototype)** : token **vert seulement si résolu** (suit la spec) + style « dangling/indéfini » distinct (atténué/pointillé) pour les tokens cassés.
- **Q33** : échappement `\$` pour littéraux ; ne substituer que les noms définis (évite de manger `$USER`/`$HOME` shell). Single-pass, valeurs verbatim (Q35).
- Q29 : variables tout texte libre en v1 (champ `type` réservé). Q30 : pas de default par variable ; action « effacer toutes les valeurs ». Q34 : substitution sur templates de code seulement.
- Q36 : auto-détection de tokens inconnus différée v2 ; helper d'insertion léger à confirmer plus tard.

### Thèmes 4–12 — recos adoptées par défaut (« prends les défauts sauf si vraiment bloquant »)

Toutes les recos de `tasks/spec-questions.md` pour les thèmes 4→12 sont **adoptées telles quelles**. Défauts notables pinés :

**Bibliothèque (4)** : Q37 recherche = title/template/desc/tags/tool + libellé catégorie (hors note) ; Q38 matching **tokenized AND** ; Q39 insensible casse+accents ; Q41 recherche **par module** ; Q42 **multi-select tags (OR interne)**, cat/tool single ; Q43 chips de filtre supprimables ; Q47 tags normalisés minuscules + rename/merge/delete global ; Q50 compteurs sidebar = totaux globaux ; Q52 catégorie inconnue → « Autre » + avertissement ; **Q53 (OPSEC)** toast copie succès/échec réel, copie résolue documentée.

**Méthodologie (5)** : **Q57** reset = checks+openSteps de la roadmap courante + confirmation + renommé « Réinitialiser la progression » ; **Q58 DnD cross-phase autorisé** ; Q59/Q60 édition inline texte + command liée en mode édition ; Q66 dupliquer roadmap ; Q67 seed ordinaire + « restaurer les défauts » ; Q70 confirm delete roadmap/reset, toast-undo phase/step ; Q71/Q72 boutons ↑/↓ (a11y) en plus du DnD souris ; Q76 auto-entrée en mode édition à la création.

**Références (6)** : **Q77/Q78 (sécurité)** validation URL par parser + **allowlist `http/https/mailto`** + sanitize à l'import ET au rendu ; Q79 normalisation host/scheme ; Q80 blocage doublon URL normalisée ; **Q81 (OPSEC) pas de favicon** (zéro egress) ; Q83/Q84 tags ref cliquables + facette dédiée en vue References ; **Q85 (OPSEC)** `rel="noopener noreferrer"` + Referrer-Policy `no-referrer` + copy-URL ; Q87 titre défaut = domaine ; Q88 refs autonomes v1.

**Cheatsheets & export (7)** : Q89 **plusieurs cheatsheets nommés** (D1) ; **Q90 → résolution sur le jeu de valeurs GLOBAL** (cohérent D2 ; pas de snapshot par sheet en v1) ; Q92 composition persistée + round-trip export ; Q95/Q97 notes en map par id (base + override par entrée différé v2) ; Q98 réordre ↑/↓ plat ; **Q99 → soumis à l'utilisateur (voir ci-dessous)** ; Q100 métadonnées = toutes vars non-vides NON-sensibles, format unifié MD/PDF/écran ; Q101 date d'export oui, **empreinte outil/version OFF par défaut (OPSEC)** ; Q102 fence ``` nu + langage optionnel par command ; Q103 échappement fence + UTF-8/LF ; Q104 layout MD prototype canonique ; Q105 « Copier tout » = commandes résolues brutes ; **Q106 → window.print() client** (v1, CSS print affinée) ; Q107 A4 + en-tête/pied + notice vide ; Q109 slug ASCII + suffixe date + `document.title` avant print ; **Q110 (OPSEC)** caveat métadonnées PDF documenté au README.

**Persistance & sync (8)** : Q111 autosave débouncé (D3) ; **Q112 mapping d'état** — backend : contenu (commands/refs/catégories/roadmaps/phases/steps/définitions de variables) + notes + progression(checks)/openSteps + composition cheatsheets + titre/cible ; device-local : thème, dernière vue/roadmap active ; **in-memory only : VALEURS de variables** ; jamais de donnée sensible en localStorage/IndexedDB.

**Import/export & backup (9)** : Q124 export = tout le contenu utilisateur + état non-éphémère, **valeurs de variables exclues** ; Q125 REPLACE (D4) ; **Q133 → seed first-run-only** (jamais de re-seed automatique à l'upgrade ; contenu seed mis à jour livré comme « seed pack » importable optionnel ; pas de résurrection des seeds supprimés).

**Visuel, responsive & a11y (10)** : D8 desktop-only strict (min-width dure) ; densité/accent = constantes fidèles au design (non exposées en réglages v1) ; a11y = focus visibles, navigation clavier, contrastes thème clair vérifiés (recos adoptées).

**Sécurité & OPSEC (11)** : **Q168 bind 127.0.0.1** par défaut (LAN opt-in avec avertissement + token) ; **Q169 pas de chiffrement DB** (D7, aucune donnée sensible) ; **zéro egress réseau** — polices IBM Plex **auto-hébergées** (pas de Google Fonts CDN), aucun appel externe ; CSP stricte ; pas de télémétrie (recos adoptées).

**Périmètre, NFR & déploiement (12)** : mono-utilisateur localhost ; UI français only v1 ; binaire unique + Docker + Makefile ; navigateurs evergreen ; **licence repo à confirmer** (défaut proposé : propriétaire/privé — voir question ouverte).

### Point OPSEC tranché

- **Q99 — exports = TOKENS BRUTS par défaut.** Les exports Markdown/PDF émettent les `$TOKEN` **non résolus** par défaut ; un toggle « résoudre les variables » opt-in par export permet la résolution. Posture OPSEC maximale (rien de sensible gravé sans action explicite).
- **Réconciliation avec Q53 (adopté)** : le **presse-papier reste résolu** (boutons Copier / Copier tout) — action locale intentionnelle pour paste terminal (spec §11). Donc : fichiers exportés = bruts par défaut ; presse-papier = résolu. Aucune donnée sensible n'atterrit sur disque sans opt-in.

### Méta — rédaction de la SPEC finale

- **SPEC.md rédigée en ANGLAIS** (règle « docs repo en anglais »). Chaînes UI, libellés et exemples de commandes restent en **français**. _(à confirmer si l'utilisateur préfère le français.)_

### Question ouverte mineure (non bloquante)

- Licence du dépôt (MIT / propriétaire-privé / autre) — défaut proposé : privé/propriétaire.

---

## Ajustements de revue — TOUS appliqués → SPEC v1.1

Une revue critique adversariale (8 lentilles) a produit **69 ajustements** (`tasks/spec-adjustments.md`, A1–A64 + R1–R5). L'utilisateur a répondu **« applique tout »**. Les 69 ont été appliqués à `SPEC.md` (régénération par section + intégration + vérification ID-par-ID + correctifs) → **SPEC passe en v1.1 (final, review-adjusted)**. **Ces ajustements PRIMENT sur les entrées ci-dessus en cas de conflit.**

Reversals de décisions verrouillées (R1–R5) :
- **R1** — plus de mode LAN / TLS runtime / token API ; **bind `127.0.0.1` dur** ; allowlist Host + Origin/Sec-Fetch conservés ; accès distant = tunnel SSH (hors code).
- **R2** — plus d'autosave optimiste + file de retry + temp-IDs ; **créations attendues** (vrai ULID) + debounce ~500 ms sur les PATCH texte ; bannière d'erreur persistante + retry au prochain edit/focus (esprit D3, pas de bouton Save).
- **R3** — mémoire-pur par défaut **+ opt-in `sessionStorage`** (défaut OFF, `$PASS` exclu, purgé à la fermeture, jamais exporté) **+ collage en masse** `KEY=value`.
- **R4** — min-width dur **900 px** appliqué à la **zone de contenu** (le collapse sidebar récupère 272 px d'abord).
- **R5** — **chiffrement at-rest OPTIONNEL** (défaut OFF, passphrase ; SQLCipher ou chiffrement applicatif de notes/target/url).

Cross-cutting notables : **A11** rationale de D7 requalifié (seules les *valeurs* de variables ne sont jamais persistées) · **A12** import **REPLACE seulement** (MERGE→v2) · **A1** fix GORM zero-value (PATCH par map) · **A10** `spellcheck=false` partout (canal d'exfiltration) · **A15** `step.expanded` = état React en mémoire · cuts : seed-pack, `PUT /settings`, sync cross-tab, file de notifs bornée, colonnes réservées, factory-reset/backup endpoints. Déferrés v2 : MERGE, gestion globale de tags, duplicate/restore-defaults, mode masqué, profils de valeurs par cible, notes par entrée de cheatsheet.

**Reste ouvert (non bloquant) :** licence du dépôt.
