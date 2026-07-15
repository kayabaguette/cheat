# Cheat — Ajustements proposés à la SPEC

89 propositions brutes issues de 8 relecteurs adverses ont été fusionnées et dédoublonnées en **69 ajustements actionnables** (aucun bruit pur écarté ; 16 doublons littéraux fusionnés, ex. le flush `sendBeacon` remonté 3×). Les 14 ajustements majeurs ci-dessous sont des bugs bloquants ou des trous de spéc qui empêchent une implémentation correcte ; suivent les mineurs par catégorie, puis **5 décisions verrouillées à reconsidérer** qui exigent ton accord explicite. Réponds avec les IDs à appliquer (ex. « applique A1, A3, R2 »).

---

## Ajustements majeurs (fort impact)

### A1 — `[fix]` PATCH GORM perd silencieusement les champs à `false`/vide
**Section :** §4.1 / §4.6.6 / §4.6.9
**Problème :** l'API promet une sémantique JSON-Merge-Patch, mais le chemin naïf `db.Model(&x).Updates(struct)` ignore les zero-values Go. `PATCH {done:false}` (décocher une étape — l'action la plus fréquente de l'app), `{sensitive:false}`, `{expanded:false}`, `{desc:""}` sont donc silencieusement perdus. C'est le bug de correction le plus probable de tout le backend.
**Reco :** imposer des updates par `map[string]any` construits depuis le corps décodé (ou `.Select(presentKeys)`), décoder le corps en `map[string]json.RawMessage`/pointeurs pour distinguer absent / present-null / present-false, et le figer en §4.1. Test d'acceptation : « décocher une étape complétée persiste `false` ».

### A2 — `[fix]` L'annulation de suppression réversible est contradictoire et inimplémentable
**Section :** §7.9 (vs §4.4, §8.9)
**Problème :** §4.4 dit que les DELETE partent immédiatement ; §7.9 dit que « Annuler » recrée la ligne + enfants « avec leurs IDs précédents » — impossible car aucun POST n'accepte d'ID client ni de sous-arbre avec champs de progression. §8.9 a déjà résolu ça pour les références en **différant** le DELETE.
**Reco :** adopter le modèle differé-jusqu'à-expiration-du-toast de §8.9 uniformément (référence, phase, étape) : suppression optimiste côté client, DELETE différé jusqu'à fermeture de la fenêtre d'annulation, « Annuler » = no-op client sans round-trip. Amender §4.4 en ce sens et supprimer la branche « recrée avec les IDs précédents ». (Se simplifie fortement si **R2** est accepté.)

### A3 — `[fix]` Le flush au déchargement via `sendBeacon` ne peut pas porter `X-Cheat-Token` (→ 403)
**Section :** §10.2.3 (vs §4.2) — *fusion de 3 signalements*
**Problème :** §4.2 rend `X-Cheat-Token` obligatoire sur tous les `/api` ; `navigator.sendBeacon` ne peut pas fixer d'en-tête custom ni le content-type JSON → 403 FORBIDDEN_TOKEN / 415, perdant en silence la dernière édition que le flush devait sauver.
**Reco :** supprimer `sendBeacon` de §10.2.3, imposer `fetch(url,{keepalive:true, headers:{'X-Cheat-Token':…}})`. Noter le budget keepalive (~64 KB cumulés) pour les drains de file volumineux. Ne jamais exempter le beacon du contrôle de token. (Devient largement caduc si **R1** ou **R2** est accepté.)

### A4 — `[fix]` La réponse de résumé d'import a deux formes incompatibles
**Section :** §4.10 vs §10.4.7 — *fusion de 2 signalements*
**Problème :** même endpoint, deux contrats : §4.10 = `counts` plats + objet `merge` + `migratedFrom` + `snapshotPath` (chemin) ; §10.4.7 = `counts` imbriqués par entité + `snapshotId` (`backup-…`). Le parser SPA ne peut pas satisfaire les deux ; collision d'autorité §4↔§10.
**Reco :** un seul schéma canonique cité par les deux sections. Recommandé : counts imbriqués par entité (`{added,replaced,skipped,reIded}`), un seul champ `snapshotPath`, `migratedFrom` nullable au top-level ; aligner l'exemple §4.10 sur §10.4.7 mot pour mot.

### A5 — `[fix]` États de rendu `empty` vs `undefined` contradictoires entre modules
**Section :** §5.10 (autorité) vs §6.4 / §7.6 / §9.3
**Problème :** §5.10 définit 3 états et rend `empty` (défini, sans valeur) en neutre **sans** pointillés, `undefined` en pointillés atténués. §6.4/§7.6/§9.3 collapsent en 2 états et appliquent le style « dangling » pointillé aux deux — effaçant le signal empty-vs-undefined voulu.
**Reco :** réécrire les récaps §6.4/§7.6/§9.3 pour énumérer les 3 états exactement comme §5.10 (résolu = vert ; empty = placeholder neutre sans pointillés ; undefined = atténué + pointillés).

### A6 — `[fix]` `createdAt`/`updatedAt` absents de l'enveloppe d'export → round-trip d'ordre cassé
**Section :** §10.4.1 vs §4.6 / §4.9 / §3.7 — *fusion de 2 signalements*
**Problème :** §3.7 fait de `createdAt` la clé de tri des collections non réordonnables (références, ordre des onglets roadmap/cheatsheet). L'exemple d'enveloppe §10.4.1 omet les timestamps → à l'import REPLACE, GORM `autoCreateTime` restampe tout à l'heure d'import, l'ordre devient non déterministe, la garantie de round-trip Q139 (test d'acceptation) tombe.
**Reco :** sérialiser `createdAt`/`updatedAt` pour chaque entité de contenu et les préserver verbatim à l'import (désactiver `autoCreateTime`/`autoUpdateTime` dans la transaction d'import).

### A7 — `[fix]` La condition de seeding est double-spécifiée et peut ressusciter des seeds supprimés
**Section :** §3.8 / §10.5.1 / §3.2.11
**Problème :** §3.2.11 gate sur le booléen `db.initialized` ; §3.8/§10.5.1 disent « quand la DB est vide ». Ces conditions ne sont pas équivalentes : un REPLACE vers une DB vide (ou suppression massive) déclencherait un re-seed des 18 catégories + roadmaps, ressuscitant du contenu délibérément retiré — contredit la garantie « pas de tombstones, seeds supprimés jamais ressuscités » (§10.5.2).
**Reco :** épingler le seeding à **une seule** condition : le flag `db.initialized` uniquement (jamais une heuristique de vacuité). REPLACE/MERGE ne doivent pas réinitialiser ce flag ; une DB vide-mais-initialisée est un état terminal valide jamais re-seedé.

### A8 — `[fix]` REPLACE peut laisser un coffre sans built-ins, et `isBuiltin` est falsifiable par l'enveloppe
**Section :** §10.4.5 / §3.2.1 / §3.2.7 — *fusion de 2 signalements*
**Problème :** rien ne garantit après REPLACE la présence des 18 catégories built-in (§3.3) ni des 6 variables standard (§5.4) — un fichier édité à la main peut les omettre (résolveur, cible de repli `utilities`, gouvernance non-supprimable cassés). De plus, `isBuiltin` est chargé tel quel depuis l'enveloppe : on peut rendre les built-ins supprimables ou fabriquer du junk indélébile.
**Reco :** ré-affirmer la baseline canonique (par ID littéral) dans la même transaction après REPLACE/factory-reset ; **dériver** `isBuiltin` de l'ensemble d'identités canoniques (ID ∈ 18 clés / nom ∈ 6 variables), ignorer la valeur de l'enveloppe.

### A9 — `[add]` La réparation d'import ignore la map `notes` → violation FK qui annule tout l'import
**Section :** §10.4.4 (vs §3.2.10)
**Problème :** `notes` est indexée par `commandId` (PK+FK, ON DELETE CASCADE). §10.4.4 répare les `step.commandId`/`entry.commandId` pendants mais ne dit rien d'une clé `notes` pointant vers une commande absente : l'insert viole la FK et, sous transaction atomique `foreign_keys=ON`, avorte tout le REPLACE.
**Reco :** en §10.4.4 étape 4, ajouter : une entrée `notes` liée à une commande absente est droppée et reportée dans `warnings`. (Le pendant MERGE de ce bug est neutralisé si **A12** est accepté.)

### A10 — `[add]` Le correcteur orthographique navigateur est un canal d'exfiltration qui défait le « zéro egress »
**Section :** §12.5 / §5.5 / §9.3
**Problème :** la promesse centrale « zéro egress réseau » est appliquée par CSP, mais le spellcheck natif (Chrome « enhanced spellcheck », intégrations type Grammarly) transmet le **contenu** des champs à un service distant — hors de portée de `connect-src`. Taper `$PASS`, `$IP`, `$USER` ou une note l'expédie chez Google.
**Reco :** imposer `spellcheck="false"` (+ `autocorrect="off"`, `autocapitalize="off"`) sur **tous** les inputs/textarea de l'app (pas seulement les sensibles — une IP dans une note fuit aussi). Ajouter ce contrôle en §12.5 et comme attribut requis en §5.5/§9.3 ; noter au README que les extensions restent hors contrôle.

### A11 — `[fix]` La justification de D7 est un abus : notes, cibles, URLs sont persistées en clair
**Section :** §1.6 (principe 6) / §1.5 / §2.6 / §12.1
**Problème :** D7 (« pas de chiffrement at-rest ») est justifié par « rien de sensible n'est persisté » — vrai seulement pour les **valeurs** de variables. La DB persiste les notes, le `target` des cheatsheets (« HTB — Sauna 10.10.10.5 ») et les URLs de références, qui contiennent IPs/hosts/creds. Le principe « rien de sensible ne touche le disque » est faux tel qu'écrit ; même l'export RAW écrit toujours `target`.
**Reco :** requalifier les affirmations porteuses au périmètre « valeurs de variables uniquement » ; garder D7 comme décision mais corriger le RATIONALE (le texte free-text est sous responsabilité utilisateur, baseline FDE). Rendre le caveat proéminent. (Voir **R5** pour l'option de protection optionnelle.)

### A12 — `[defer]` Couper le mode d'import MERGE ; livrer REPLACE + snapshot seulement
**Section :** §4.10 / §10.4.6
**Problème :** D4 verrouille l'import en REPLACE + snapshot ; MERGE est un ajout par-dessus, portant l'algo le plus lourd (détection de collision par ID, re-ID sous nouveaux ULIDs, réécriture de toutes les réfs internes, merge de variables par nom, upsert de catégories). Pour un outil mono-utilisateur, les workflows réels sont « sauvegarder » et « restaurer/remplacer ».
**Reco :** retirer `mode=merge`, les champs de résumé merge et §10.4.6 ; garder REPLACE + snapshot pré-import ; différer MERGE à v2. **Bénéfice de cascade :** neutralise toute une famille de bugs FK MERGE (collision `UNIQUE(lower(label))` sur catégories, réécriture de la map notes au re-ID, réécriture des templates entrants au renommage de variable). *Si MERGE est conservé, ces trois bugs devront être corrigés.*

### A13 — `[clarify]` Plusieurs cheatsheets par cible sur UN seul jeu de valeurs global : modèle mental incohérent
**Section :** §9.4 (D1 × D2)
**Problème :** D1 encourage les sheets par machine (`Cheatsheet.target = '10.10.10.5'`), mais D2 résout chaque sheet contre l'unique jeu de valeurs global. Une sheet estampillée « 10.10.10.5 » se rend avec le `$IP` global courant — potentiellement une autre box. Changer d'onglet ne change pas `$IP` ; rien ne signale que `target` est décoratif.
**Reco :** deux mitigations v1 qui ne touchent aucun verrou : (a) un pont « Utiliser cette cible » par sheet qui charge le `target` (si host/IP) dans `$IP` en mémoire avec chip de confirmation ; (b) rendre la ligne de chips métadonnées (§9.5) persistante au-dessus des entrées avec une note « valeurs globales, pas par-sheet ». Repositionner le multi-sheet comme scoping par sujet/examen jusqu'aux profils de valeurs par cible (v2, déjà différé).

### A14 — `[add]` Le renommage/fusion/suppression global de tags est cité mais jamais spécifié
**Section :** §6.8 / §8.8 / §4.11 — *fusion de 2 signalements*
**Problème :** §6.8 et §8.8 invoquent une « surface de gestion de tags (Q47) » pour rename/merge/delete globaux et le nettoyage des tags à zéro référence, mais aucun endpoint n'existe dans l'index §4.11, aucune UI/flow n'est décrit, et les tags sont des tableaux JSON dénormalisés (un rename doit réécrire N commandes + références). Fonctionnalité asserée mais inconstruisible.
**Reco :** **(recommandé)** différer explicitement la gestion globale de tags à v2 en §1.5 et retirer les renvois de §6.8/§8.8 (v1 garde l'édition de tags par commande/référence). Alternative : ajouter un panneau + endpoints `POST /api/tags/rename|merge`, `DELETE /api/tags/{name}` avec réécriture transactionnelle et normalisation casse-insensible.

---

## Ajustements mineurs

### Cut
- **A15** `[cut]` §3.2.6 / §4.5 / §10.1.1 — *(résout l'item ouvert §4.5, fusion de 4 signalements)* `step.expanded` est un état de vue transitoire (comme l'accordéon sidebar déjà éphémère en §3.10). Le rendre état React en mémoire ; retirer la colonne, le champ PATCH, sa présence dans state/export → supprime une classe de trafic autosave.
- **A16** `[cut]` §10.2.4 / §4.1 — *(fusion de 2 signalements)* Retirer la synchro cross-tab (BroadcastChannel/storage/focus-refresh + LWW `updatedAt`) ; garder WAL + busy_timeout + writer sérialisé et le verrou second-instance. *Si conservée, définir la précédence face aux éditions optimistes en attente (ne pas écraser les entités avec mutation en vol).*
- **A17** `[cut]` §10.4.3 / §10.5.4 — `POST /api/factory-reset` et `GET /api/backup.sqlite` sont redondants avec « arrêter le binaire + supprimer/copier le fichier DB » (déjà documenté). Retirer les deux, documenter au README ; garder le snapshot JSON pré-import automatique.
- **A18** `[cut]` §4.8 — Supprimer `PUT /api/settings` (§4.8 admet un jeu de clés inscriptibles vide) ; les prefs sont device-local (localStorage). Réintroduire quand un premier réglage server-scoped existe (AutoMigrate).
- **A19** `[cut]` §3.2.7 / §5.4 / §5.5 — Retirer `Variable.hidden` (garder `sensitive`) ; avec ≤ 6 built-ins + quelques customs, masquer des lignes ne résout pas un problème réel. *Neutralise aussi le piège « variable masquée sans moyen de la révéler » (§5.5).*
- **A20** `[cut]` §10.4.4 — Garder un seul `formatVersion: 1` ; accepter `1`, rejeter le reste (`IMPORT_VERSION_TOO_NEW`) ; retirer le moteur de migration forward et `migratedFrom`/`schemaVersion`/`seedVersion` pour v1 (aucune version à migrer).
- **A21** `[cut]` §3.2 / §3.7 — Retirer les colonnes réservées non utilisées en v1 : `CheatsheetEntry.note`, `Command.position` (tri alpha), `Variable.type` (toujours `text`). Les rajouter via AutoMigrate quand la feature différée arrive. Garder `position` seulement où v1 réordonne vraiment (phases, étapes, entrées).
- **A22** `[cut]` §9.7 / §11.8 — Les margin boxes CSS Paged-Media / `position:fixed` par page ne sont pas supportés par Chromium/Firefox. Retirer l'en-tête/pied courant custom et les numéros de page ; rendre le titre/métadonnées une fois en haut de `.printroot`, laisser le navigateur fournir l'entête d'impression.
- **A23** `[cut]` §8.10 — Retirer le toggle de tri 3-états ajouté aux références (absent du prototype, contredit §3.2.3) ; garder l'ordre `createdAt`/insertion. Différer le tri multi-options à v2.
- **A24** `[cut]` §10.5.3 / §4.11 / §3.2.11 — **touche une décision verrouillée** — Couper la machinerie seed-pack (`GET /api/seed-pack`, `POST /api/import/seed-pack`, clé `seed.version`, §10.5.3) : feature de distribution de contenu sans user story v1, dépendante du moteur MERGE. Garder uniquement le seeding first-run gaté par `db.initialized`.
- **A25** `[cut]` §11.6 — **touche une décision verrouillée** — Remplacer la file d'attente bornée avec éviction par 3 slots simples : un toast transitoire/undo (dernier gagne), une bannière d'erreur persistante, des dialogues de confirmation modaux. Conserve tous les niveaux fonctionnels sans la gestion de file.

### Defer
- **A26** `[defer]` §12.6 / §12.1 / §5.9 — *(fusion de 3 signalements)* Différer le « Mode masqué » global (redact) à v2 : il n'a ni emplacement, ni tier de persistance, ni périmètre définis, **et** est inimplémentable tel quel (le modèle de parts du résolveur §5.9 ne porte pas la métadonnée `sensitive`, donc un `$PASS` résolu inline ne peut être masqué). v1 garde le masquage par ligne + `sensitive`. *Si conservé : ajouter `part.sensitive = def.sensitive` en §5.9 et spécifier emplacement/persistance.*
- **A27** `[defer]` §5.7 / §4.6.9 — **touche une décision verrouillée** — Différer la cascade de renommage de variable ($OLD→$NEW dans tous les templates). v1 : autoriser le rename seulement si la variable est non référencée, sinon supprimer/recréer (les tokens pendants se voient déjà, §5.10). Retire la réécriture transactionnelle et le `rewrittenCommandCount`.
- **A28** `[defer]` §6.8 / §7.10 / §4.6.4 — Différer à v2 : Duplicate commande, Duplicate roadmap (deep-clone), restore-defaults (re-seed partiel). Garder `reset-progress` (§4.6.4), cœur du workflow checklist.

### Add
- **A29** `[add]` §12.2 / §4.4 / §10.3.3 — *(fusion de 2 signalements)* Un token per-launch injecté dans `index.html` : après redémarrage du binaire (même `appVersion`), un onglet ouvert garde l'ancien token et boucle en 403. Spécifier qu'un 403 FORBIDDEN_TOKEN est non-retryable et déclenche un reload unique (garde anti-boucle ≥ N s). (Caduc si **R1** accepté.)
- **A30** `[add]` §7.2 / §4.6.4 / §10.5.3 — restore-defaults/seed-pack ré-insèrent des étapes liées à des IDs de commandes seed (n1, s2…) potentiellement supprimées → violation FK. Spécifier que tout `commandId` absent est mis à NULL/droppé et reporté, comme §10.4.4. (Partiellement caduc si **A24** accepté.)
- **A31** `[add]` §10.4.5 / §3.1 — Ordre d'insertion REPLACE non spécifié sous `foreign_keys=ON`. Spécifier un ordre parent→enfant déterministe (categories → commands → notes → references → roadmaps → phases → steps → cheatsheets → entries → variables) **ou** envelopper l'import dans `PRAGMA defer_foreign_keys=ON`.
- **A32** `[add]` §3.1 / §10.3.2 — Documenter la procédure de migration : AutoMigrate limité aux ajouts additifs ; tout changement de contrainte/colonne via migration numérotée avec `foreign_keys` temporairement OFF (impossible en transaction) + `foreign_key_check` après + backup pré-migration.
- **A33** `[add]` §8.7 — Ajouter la chaîne FR verbatim de l'état filtre-vide des références (parallèle à §6.7), ex. « // aucune référence trouvée » / « Modifie ta recherche ou retire le filtre de tag. »
- **A34** `[add]` §10.1.1 — Ajouter `activeRefTag` (et la query de la vue références) à la carte des tiers d'état, en IN-MEMORY ONLY ; mettre la ligne library à `activeCategory/activeTool/activeTags[]/query`.
- **A35** `[add]` §4.11 — `GET /api/seed-pack`, `POST /api/import/seed-pack`, `GET /api/backup.sqlite` sont dans l'index §4.11 mais non décrits en §4. Ajouter des sous-entrées autoritatives (ou noter que l'autorité est déférée à §10). (Caduc si **A24** + **A17** acceptés.)
- **A36** `[add]` §9.6 — Spécifier la valeur `language` de chaque commande seed (bash / powershell / cmd / null), sinon les fences exportées perdent la coloration (régression vs prototype qui forçait ```bash).
- **A37** `[add]` §5.9 — Surfacer la collision `$USER`/`$PASS`/`$PATH`/`$HOME` avec les littéraux shell : dans l'éditeur (§6.8) et au rendu, quand un token correspond à une variable définie ET à un nom shell connu, afficher « jeton reconnu — échappe avec \\$ pour le laisser littéral ».
- **A38** `[add]` §5.5 — Ajouter un toggle œil (reveal) par ligne masquée pour vérifier la saisie (jamais persisté/loggé) + un indice sur le panneau vide au reload (« valeurs de session — à ressaisir »).
- **A39** `[add]` §9.2 / §6.4 — La carte library ne peut ajouter qu'à la sheet active. Donner au « + Cheatsheet » un split/dropdown « Ajouter à… » listant toutes les sheets avec coches (le serveur accepte déjà un `sheetId` explicite, §4.6.8).
- **A40** `[add]` §10.4.5 / §12.11 — Les snapshots auto (pré-import/reset) contiennent des notes/cibles/URLs. Spécifier un dossier `backups/` co-localisé avec la DB (hors repo, configurable) et l'ajouter au `.gitignore` (§12.11) ; étendre l'avertissement OPSEC du README.

### Clarify
- **A41** `[clarify]` §4.4 / §4.6.5 / §4.7 — *(fusion de 2 signalements)* La règle d'ordonnancement des dépendances (tenir les enfants jusqu'à résolution du parent) est énoncée pour les réfs de corps mais pas pour les **parents en paramètre d'URL** ni les reorders. Étendre : tout create/reorder dont l'URL contient un ID `tmp_` est mis en file et réécrit avec l'ULID réel avant flush ; les reorders sont coalescés (seul l'ordre final flush) ; un `tmp_` n'apparaît jamais dans un chemin.
- **A42** `[clarify]` §10.4.4 / §4.10 — Les « limites raisonnables de taille/compte » qui déclenchent 422 IMPORT_SCHEMA_INVALID ne sont jamais chiffrées. Ajouter des plafonds explicites (ex. 20k commandes, 100k étapes, template/note ~64 KiB), tunables via config comme le cap de corps ~32 MiB.
- **A43** `[clarify]` §4.6.1 — `DELETE /api/categories/{id}?reassignTo=` : cas indéfinis. Spécifier : `reassignTo` doit référencer une catégorie existante ≠ `{id}` (inconnue → 404, self → 400) ; défaut vers `utilities` si omis sur catégorie non vide (recommandé).
- **A44** `[clarify]` §6.9 — Fixer pour la catégorie de repli « Autre » : ID littéral `autre` (round-trip stable), couleur fixe (gris `utilities`), `isBuiltin=false`, `position = max+1`, exclue des 18 seeds, créée à la demande.
- **A45** `[clarify]` §4.6.2 vs §3.6 / §6.8 — `categoryId` est requis (schéma/UI) mais « optionnel avec défaut » (API). Trancher : recommandé requis côté API (`VALIDATION_FAILED` si absent), supprimer la clause « défaut info-gathering ».
- **A46** `[clarify]` §4.6.6 / §4.7 — Le move d'étape cross-phase est spécifié 2× (PATCH `phaseId+position` et endpoint reorder). §7.8 commit via reorder → le PATCH-phaseId n'a aucun appelant. Garder un seul chemin (recommandé : reorder pour tout DnD ; retirer `phaseId`/`position` du PATCH).
- **A47** `[clarify]` §3.1 / §3.2.5 / §7.12 — « gap-friendly »/« midpoint insertion » contredit « renumérotation dense 0..n-1 ». Poser que `position` est un entier contigu dense réassigné à chaque commit ; « midpoint » = uniquement l'indicateur visuel de drop.
- **A48** `[clarify]` §3.1 / §10.2.4 — `MaxOpenConns=1` sérialise les lectures derrière les écritures, défaisant WAL. Préférer un mutex d'écriture autour des transactions d'écriture, laissant les lectures concurrentes ; sinon retirer la justification WAL.
- **A49** `[clarify]` §10.4.1 / §10.4.4 — Politique de bump `formatVersion` indéfinie (risque de corruption silencieuse si le shape `data` change sans bump). Poser : tout changement de shape incrémente `formatVersion` ; chaque N→N+1 a une fonction de migration nommée ; `schemaVersion` reste informatif. (Fusionne bien avec **A20**.)
- **A50** `[clarify]` §9.8 / §11.6 / §12.6 — Nommer explicitement le vecteur « gestionnaire de presse-papiers OS → disque » (Klipper, Win+V, Universal Clipboard) qui persiste un `$PASS` copié hors de l'app. Reconsidérer la promotion de l'auto-clear/indicateur secret en v1 (petit, autonome) ; au minimum livrer l'indicateur « copié — contient un secret » (Q182).
- **A51** `[clarify]` §9.4 / §5.13 — Clarifier que `sensitive` protège **le bloc métadonnées seulement**, pas les corps résolus. Ajouter un avertissement pré-export quand un export resolve-ON matérialise un token sensible dans un corps (« Cet export contient des valeurs sensibles ($PASS). Continuer ? »).
- **A52** `[clarify]` §5.3 — Les valeurs vivent dans l'état React par onglet → « jeu de valeurs global unique » faux dès qu'un 2ᵉ onglet existe. Soit synchroniser via BroadcastChannel (message only, rien en store — reste memory-only), soit requalifier la promesse en « par-session, par-onglet » et énoncer l'hypothèse mono-onglet. (Lié à **A13**, **R3**.)
- **A53** `[clarify]` §6.8 — Le picker de catégorie de la modale est décrit comme « Dropdown » mais le prototype utilise des chips/pills + toggle « + ». Restaurer les chips (fidèle) ou justifier explicitement le `<select>`.

### Fix
- **A54** `[fix]` §8.2 vs §4.3 — Les codes d'erreur références sont en minuscules (`url_required`, `duplicate_url`) alors que §4.3 impose SCREAMING_SNAKE_CASE. Remplacer par `VALIDATION_FAILED` (champ `url`) / `DUPLICATE_REFERENCE_URL` (+ `SCHEME_NOT_ALLOWED` si dédié), détail dans `details[]`.
- **A55** `[fix]` §8.1 / §8.2 vs §3.2.3 / §4.6 — Le module références omet `updatedAt` que le schéma/entité imposent et dont dépend le refresh cross-tab. L'ajouter à la table §8.1 et au DTO §8.2.
- **A56** `[fix]` §4.6.4 vs §7.3 — `restore-defaults` renvoie « les roadmaps créées » (§4.6.4) vs `{restored:[ids]}` (§7.3). Standardiser sur les objets Roadmap complets (nested) ; corriger la cellule §7.3.
- **A57** `[fix]` §4.6 — L'exemple JSON de Category enseigne 3 faits faux (ULID au lieu d'ID littéral built-in, label `Énumération` hors des 18, couleur `#3ddc97` = accent réservé). Remplacer par une vraie ligne seed (`id:"infogathering"`, couleur palette) + un exemple custom (ULID, `isBuiltin:false`).
- **A58** `[fix]` §10.2.4 — Le verrou second-instance « fichier DB ou port » ne couvre pas deux instances sur des ports différents pointant la même DB (corruption WAL). Imposer un lockfile (`flock` sur `<db>.lock`) clé sur le chemin DB résolu, pas le port.
- **A59** `[fix]` §6.4 — La carte library gagne un badge outil que le prototype n'a pas (l'outil est déjà porté par le sous-en-tête Catégorie › Outil). Retirer le badge des cartes library ; le garder sur les entrées cheatsheet uniquement. Sinon, backer par une décision explicite.
- **A60** `[fix]` §9.2 / §11.5.1 — D1 dit qu'on crée une cheatsheet via « + Cheatsheet », mais §11.5.1 masque l'ajout top-bar sur la vue Cheatsheet → aucun emplacement. Étendre `showAdd` à la vue Cheatsheet avec un bouton top-bar « + Cheatsheet » (miroir de « + Méthodologie ») et l'énoncer en §11.5.1.
- **A61** `[fix]` §11.5.2 — La ligne sidebar est « Toutes » en §11.5.2 mais « Toutes les commandes » au prototype et en §6.3. Corriger vers « Toutes les commandes ».
- **A62** `[fix]` §4.2 / §12.3 — `[::1]` (loopback IPv6 légitime) n'est pas dans l'allowlist Host → 403 FORBIDDEN_HOST là où `localhost` résout en `::1`. Ajouter `[::1][:port]` à côté de `127.0.0.1`/`localhost`.
- **A63** `[fix]` §12.2 / §12.1 — *(fusion de 2 signalements)* Le token est servi en clair dans `index.html` à quiconque passe le check Host : il ne protège **pas** des autres processus/utilisateurs locaux (n'importe quel `curl` le récupère). Corriger §12.2/§12.1 : le token est une défense CSRF/DNS-rebinding uniquement ; l'isolation multi-utilisateur relève de la séparation OS (hors scope, ou via **R5**). (Caduc si **R1** accepté.)
- **A64** `[fix]` §3.2.2 / §3.2.6 / §3.4 — *(fusion de 2 signalements)* `Step.commandId` à la suppression de commande est spécifié à la fois comme FK `ON DELETE SET NULL` et comme step applicatif. Choisir le FK-level `ON DELETE SET NULL` (cohérent avec `foreign_keys=ON`) et supprimer la phrase « application step, not FK cascade » de §3.2.2.

---

## Décisions verrouillées à reconsidérer (nécessitent ton accord)

Ces 5 items renversent un choix figé. Chacun demande un arbitrage explicite avant application.

### R1 — `[reconsider]` Couper le mode LAN opt-in et tout le sous-système TLS/token
**Section :** §2.6 / §12.2 / §4.2
**Tradeoff :** le produit est « single-user, single-host, localhost-only » (§1.2/§1.5), mais §12.2/§4.2 bâtissent un sous-système entier pour `--bind` non-loopback (génération TLS runtime, token bearer per-launch injecté, chaîne FORBIDDEN_TOKEN tournant aussi sur loopback). En loopback, l'allowlist Host + Origin/Sec-Fetch défont déjà CSRF/DNS-rebinding ; le token, servi en clair, n'ajoute qu'une défense marginale. **Gagner :** ~2 sections de prose, cert gen, meta-injection bootstrap, chemin FORBIDDEN_TOKEN. **Perdre :** le mode LAN (repli documenté = tunnel SSH, zéro code). **Cascade :** rend A3, A29, A63 et l'aspect token de A62 caducs ou triviaux.

### R2 — `[reconsider]` Remplacer l'autosave optimiste + temp-ID + file de retry par des écritures attendues
**Section :** §4.4 / §10.2 (D3)
**Tradeoff :** D3 impose l'autosave optimiste avec file de retry en backoff. En localhost le round-trip est sub-ms et n'échoue quasi jamais, pourtant la spéc bâtit UI optimiste + `tmp_<id>` + réconciliation d'ID avec ordonnancement de dépendances + file backoff + flush keepalive/sendBeacon + drain SIGINT — machinerie systèmes-distribués pour un writer local unique. **Reco :** garder le debounce ~500 ms sur les PATCH de champs texte ; rendre les créations **attendues** (`await POST` → ULID réel), ce qui élimine temp-IDs, réconciliation et ordonnancement. En échec : bannière d'erreur persistante + retry au prochain edit/focus. Conserve l'UX « pas de bouton Save » (esprit D3). **Cascade :** simplifie fortement A2, A3, A29, A41, A52.

### R3 — `[reconsider]` Autoriser une persistance de session opt-in des valeurs de variables
**Section :** §5.3
**Tradeoff :** la thèse produit est « une valeur saisie une fois se résout partout » (§1.6.2), mais §5.3 force à retaper `$IP`/`$LHOST`/`$USER`/`$DOMAIN`/`$PASS` à chaque reload/crash/veille/Cmd-R. Pour un pentester qui garde l'onglet ouvert des heures, la feature phare s'évapore quand elle est le plus utile. **Reco :** garder le mémoire-pur par défaut, mais (1) ajouter un remplissage en masse « coller les valeurs » (KEY=value) ; (2) offrir un opt-in **par défaut OFF** « Conserver les valeurs pour cette session » miroir vers `sessionStorage` (survit F5/crash, purgé à la fermeture, jamais synchronisé/exporté, `$PASS` exclu). Renverse « ne survit jamais à un reload ». (Lié à A52.)

### R4 — `[reconsider]` Abaisser la largeur minimale de 1024 px du shell
**Section :** §11.5 (D8)
**Tradeoff :** la boucle cœur (copier ici, coller au terminal) se fait côte à côte : Cheat sur une moitié d'écran. Sur 1920 px une moitié = ~960 px ; sur un laptop 1366 px, ~683 px. Le plancher dur ~1024 px (D8) jette tout le shell en scroll horizontal en dessous — sabotant la posture d'usage canonique. **Reco :** abaisser le min-width dur à ~900 px et appliquer le min-width à la **région de contenu** (pas sidebar+contenu), pour que le collapse sidebar (Q145) récupère les 272 px avant le plancher. Garder « pas de reflow mobile ». Renverse le plancher ~1024 px de D8.

### R5 — `[reconsider]` Offrir une protection at-rest OPTIONNELLE pour les surfaces free-text
**Section :** §2.6 / §12.6 (D7)
**Tradeoff :** D7 (« pas de chiffrement, jamais ») a été verrouillé sur la prémisse « rien de sensible at-rest » — fausse pour notes/cibles/URLs (voir A11). Sur un jump-box partagé (adversaire listé §12.1), tout utilisateur local lit `cheat.sqlite`. **Reco :** envisager une DB chiffrée par passphrase, opt-in, **par défaut OFF** (SQLCipher pure-Go, ou chiffrement applicatif des champs notes/target/url), pour les engagements sur hôte partagé. Si rejeté comme sur-ingénierie, réaffirmer FDE-comme-seule-mitigation dans le texte de décision ET retirer le rationale trompeur « rien de sensible at-rest ». Étroitement couplé à **A11** (dont la reformulation est requise quel que soit le verdict ici).

---

## Comment procéder

Réponds avec les **IDs à appliquer**, par exemple : « applique A1, A2, A6, A7, A8, A9 » (les corrections de correction/round-trip à faible risque) puis tranche les majeurs de scope (A12, A14) et les 5 verrous R1–R5.

Notes d'enchaînement à garder en tête :
- **R1** accepté → A3, A29, A63 et l'aspect token de A62 tombent ou deviennent triviaux.
- **R2** accepté → A2, A3, A29, A41, A52 se simplifient fortement (plus de file de retry ni de réconciliation temp-ID).
- **A12** accepté → les bugs FK spécifiques à MERGE (collision de label, réécriture notes/templates au re-ID) sont neutralisés ; A9 se réduit au seul chemin REPLACE.
- **A24** + **A17** acceptés → A30 et A35 deviennent en grande partie caducs.
- **A11** est requise quel que soit le sort de **R5** (le rationale actuel de D7 ne peut rester tel quel).

Par défaut, si tu ne réponds rien sur les items verrouillés (R1–R5, A24, A25, A27), ils **ne seront pas** appliqués ; seuls les ajustements ordinaires listés seront intégrés à la SPEC.
