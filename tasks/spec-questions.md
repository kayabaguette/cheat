# Cheat — Questionnaire de spécification finale

Ce questionnaire fige les décisions ouvertes de l'app Cheat. **Chaque question porte un défaut recommandé (Reco)** : confirmez en bloc ou surchargez au cas par cas. Répondez par numéro (voir « Comment répondre » en fin de document).

---

## Decisions bloquantes (a trancher en premier)

Ces forks conditionnent le schéma, l'API et la CSS ; ils recoupent des questions détaillées plus bas (renvois entre parenthèses).

**D1. UN cheatsheet global ou PLUSIEURS cheatsheets nommés (par machine / par examen) ?** (cf. Q101)
- Un seul global (prototype : `selected[]` + titre + cible)
- Plusieurs nommés avec barre d'onglets + create/rename/delete (réutilise l'UX roadmap)
- Un seul maintenant, schéma extensible plus tard
- **Reco:** Plusieurs cheatsheets nommés réutilisant le pattern onglets/CRUD des roadmaps — le libellé « par machine ou par examen » l'implique et cela cascade sur notes, variables, sélection et export.

**D2. Valeurs de variables : jeu global unique ou profils commutables (par cible / par cheatsheet) ?** (cf. Q29, Q102)
- Jeu actif global unique (prototype)
- Définitions globales + profils de valeurs commutables (un par machine)
- Valeurs par cheatsheet / par roadmap
- **Reco:** Jeu global unique en v1, mais définitions modélisées séparément des valeurs pour ajouter une couche « profils » sans migration ; confirmer si les profils par cible sont voulus dès maintenant.

**D3. Quand/comment le SPA persiste vers le backend Go/SQLite, et les écritures sont-elles optimistes ?** (cf. Q124)
- Autosave optimiste débouncé (~500 ms) par entité, sans bouton, toast d'erreur
- Autosave au blur / à la navigation
- Bouton « Enregistrer » explicite (pas d'autosave)
- **Reco:** Autosave optimiste débouncé (~500 ms) par entité mutée, file de retry en arrière-plan, indicateur d'erreur uniquement — définit toute la surface REST et la fenêtre de perte de données.

**D4. L'import JSON REMPLACE ou FUSIONNE, et que contient l'export « dataset complet » ?** (cf. Q142, Q143)
- REPLACE complet (backup/restore) avec snapshot pré-import obligatoire + confirmation
- MERGE par id avec gestion de collision
- Les deux, défaut REPLACE
- **Reco:** REPLACE par défaut avec snapshot pré-restore automatique, transaction atomique et enveloppe versionnée ; export = contenu utilisateur + état, hors état de vue éphémère et (par défaut) valeurs sensibles.

**D5. Stratégie d'ID, et Phases/Steps deviennent-ils des lignes de première classe (IDs stables + position) ?** (cf. Q1, Q2)
- ULID/UUID serveur pour toutes les lignes ; IDs phase/step stables ; progression clé par step ID ; IDs de seed conservés littéraux
- Clés positionnelles + remap à chaque mutation
- Clés `Date.now()`/count (prototype, non sûr)
- **Reco:** ULID/UUID serveur pour chaque entité ; phases/steps avec IDs stables + position ; checks/openSteps clés par step ID — supprime la corruption silencieuse de progression et fiabilise le round-trip d'import.

**D6. Commands et References : CRUD complet (edit + delete) ou add-only (prototype) ?** (cf. Q12, Q13, Q19, Q20)
- CRUD complet pour les deux
- Add + edit uniquement
- Add-only (prototype)
- **Reco:** CRUD complet pour les deux — prérequis des règles de cascade de suppression et d'une bibliothèque utilisable.

**D7. Modèle de confiance / données au repos (bind, chiffrement, auth) pour un outil détenant IPs et creds ?** (cf. Q168, Q169, Q170)
- Bind loopback + SQLite en clair (chiffrement disque OS)
- Bind loopback + SQLCipher (passphrase au lancement) + token API par lancement
- Bind LAN configurable + TLS + token
- **Reco:** Bind 127.0.0.1 par défaut (LAN opt-in avec avertissement + token) ; SQLCipher sur toute la DB gardé par passphrase au lancement (flag opt-out) ; zéro egress externe ; défenses Host/Origin + token contre CSRF/DNS-rebinding localhost.

**D8. Layout desktop fixe (min-width dure) ou adaptation tablette/mobile ?** (cf. Q167)
- Desktop-only, min-width ~1024-1280px, scroll horizontal en dessous
- Desktop-first, dégradation gracieuse jusqu'à ~768px
- Entièrement responsive incl. mobile
- **Reco:** Desktop-first avec min-width dure (~1024px) et dégradation gracieuse ; pas de refonte mobile en v1 — décision qui structure toute la CSS.

---

## Modele de donnees & IDs

**Q1. Stratégie de clé primaire/ID canonique pour toutes les entités : qui frappe les IDs (serveur vs client), quel type, les IDs de seed sont-ils préservés ?**
*Contexte: le prototype mélange IDs sémantiques ('n1','services'), IDs timestamp (Date.now()) et clés count (x-slug-n) ; les IDs sont porteurs (Step.note, selected[]).*
- ULID/UUID serveur pour toutes les lignes, IDs de seed conservés littéraux
- Int autoincrement + slug externe stable
- UUIDv4 client
- Garder Date.now()/count (non sûr)
- **Reco:** ULID/UUID serveur en PK pour toutes les entités ; préserver les IDs de seed littéraux ; jamais Date.now() ni clé-count mutable. **[bloquant]**

**Q2. Phases et Steps deviennent-ils des lignes de première classe (IDs stables + colonne position) plutôt qu'adressés par index de tableau ?**
*Contexte: checks/openSteps sont clés positionnellement 'rmId-pi-si' ; addStep/deleteStep/deletePhase ne remappent PAS, désalignant chaque case après mutation.*
- IDs stables + position entière sur Phase et Step ; progression clé par step ID
- Clés positionnelles + remap complet à chaque mutation
- Phases/steps en blobs JSON, clés positionnelles acceptées
- **Reco:** Phase et Step deviennent des lignes avec IDs stables et colonne position ; état coché stocké en booléen sur le step (ou clé par step ID). **[bloquant]**

**Q3. Quel jeu exact de catégories intégrées (clés, libellés, couleurs, ordre) est canonique, et toutes sont-elles présentes même à zéro commande ?**
*Contexte: le spec §05 en liste ~16, le prototype 18 (split winpriv/linpriv, filetransfers/clientside). La sidebar masque les vides ; le formulaire d'ajout les liste toutes.*
- Adopter les 18 du prototype verbatim ; hide-empty = règle d'affichage
- Adopter la liste du spec §05
- Curer un jeu OSCP réconcilié avec l'utilisateur
- **Reco:** Adopter les 18 catégories du prototype comme source de vérité (DCLogic fait foi) ; seeder les 18 toujours présentes ; réconcilier seulement le libellé AV-evasion. **[bloquant]**

**Q4. Category est-elle une entité de première classe (id/label/color/is_builtin/position) avec FK depuis Command, ou un enum pour builtins + table annexe pour custom ?**
*Contexte: builtins hardcodés ; custom dans une map runtime ; Command.category = clé string bare.*
- Table unique categories (id,label,color,is_builtin,position) + FK depuis commands
- Enum pour 18 builtins + table custom
- Colonne string libre, liste builtin en code
- **Reco:** Table unique categories avec flag is_builtin et position, FK depuis commands ; seeder les 18 au premier lancement. **[haut]**

**Q5. 'tool' est-il une colonne texte libre sur Command, ou une entité de première classe (table tools) ?**
*Contexte: tool = string libre défaut 'Divers' ; clés de groupe category+'||'+tool ; datalist de suggestion.*
- Colonne texte libre, groupes dérivés à la requête
- Table tools globale
- Table tools par catégorie
- **Reco:** Garder tool comme colonne texte libre normalisée ; dériver l'arbre category>tool à la requête (comme le prototype). **[haut]**

**Q6. Les tags sont-ils une entité globale ou des tableaux de strings par entité, et les tags Command et Reference partagent-ils le même namespace ?**
*Contexte: tableaux de strings des deux côtés ; le comptage sidebar ne scanne que les commands ; les tags de référence n'ont pas de filtre UI.*
- Tableaux libres par entité, pas de table ; filtre tag ne scanne que commands
- Tableaux libres mais tags command+reference unifiés dans un filtre
- Table tags globale avec tables de jointure partagées
- **Reco:** Tags = tableaux de strings libres par entité, sans table ; filtre tag scanne les commands ; confirmer que les tags de référence sont bien display-only (voir Q42). **[haut]**

**Q7. Renommer le champ Step->Command de 'note' en champ de lien explicite (commandId), et confirmer FK unique nullable (0..1) vs many ?**
*Contexte: le spec dit Step { text, note -> Command.id } mais il existe AUSSI un store de notes perso — deux concepts partagent 'note'.*
- Renommer en commandId (FK nullable 0..1) ; réserver 'note' au texte perso
- Garder 'note' mais documenter qu'il contient un ID de command
- Autoriser 0..n liens (table de jointure)
- **Reco:** Renommer en commandId (FK nullable 0..1) et réserver 'note' exclusivement aux notes libres perso. **[haut]**

**Q8. Quelles contraintes d'unicité au-delà des PK (libellé catégorie, URL référence, titre command, libellés roadmap/phase/step) ?**
*Contexte: le prototype n'impose que les IDs ; une catégorie custom peut dupliquer un libellé builtin.*
- IDs uniques seulement
- IDs + libellé catégorie unique (insensible casse)
- + URL référence et titre command uniques aussi
- **Reco:** IDs uniques + contrainte unique insensible à la casse sur le libellé catégorie ; autoriser URLs/titres/labels dupliqués (avertir sur nom de roadmap dupliqué). **[moyen]**

**Q9. Quels champs sont requis vs optionnels (NOT NULL) par entité, et les templates multi-lignes sont-ils supportés ?**
*Contexte: addCommand requiert title+template (tool défaut 'Divers', category 'infogathering') ; addReference requiert title+url ; templates rendus pre-wrap multi-lignes.*
- Command: title/template/category/tool NOT NULL (tool défaut 'Divers'), desc/tags optionnels, template TEXT multi-lignes ; Reference: title/url NOT NULL, desc/tags optionnels
- desc/tags NOT NULL avec défauts vides
- tool requis explicitement
- **Reco:** Command requiert title, template (TEXT multi-lignes), category, tool (défaut 'Divers') ; Reference requiert title et url ; desc/tags optionnels. **[moyen]**

**Q10. Comment l'ordre est-il représenté et persisté pour chaque collection ordonnée (commands d'un tool, phases, steps, entrées cheatsheet, roadmaps, références) ?**
*Contexte: commands/refs/roadmaps en ordre d'insertion ; phases/steps par index avec drag ; cheatsheet par ordre selected[] avec up/down.*
- Colonnes position sur phases, steps, entrées cheatsheet ; commands/refs/roadmaps par created-at
- Colonnes position sur toutes les entités ordonnées
- Ordre d'insertion / IDs
- **Reco:** Colonnes position explicites pour phases, steps et entrées cheatsheet (réordonnables à la main) ; commands/refs/roadmaps par date de création en v1. **[moyen]**

**Q11. Comment les couleurs de catégories custom sont-elles choisies/stockées et la clé rendue stable ?**
*Contexte: couleurs auto-assignées par index sur palette de 8 ; clé 'x-'+slug+'-'+n (instable après delete).*
- Stocker couleur explicite par catégorie ; défaut palette, override permis
- Auto-assign seulement, palette élargie
- Toujours laisser choisir
- **Reco:** Stocker la couleur par catégorie (défaut prochaine couleur palette, override manuel) ; dériver les clés de la stratégie d'ID, pas d'un count mutable. **[moyen]**

---

## CRUD & integrite referentielle

**Q12. Peut-on éditer les commands existants (title, template, desc, category, tool, tags), et depuis où (carte inline ou modal) ?**
*Contexte: le prototype n'ajoute que ; les cartes n'ont pas d'edit ; delete+re-add perdrait l'id.*
- Edit complet via la modal Add réutilisée, ouverte par un crayon sur chaque carte
- Édition inline des champs sur la carte
- Pas d'edit (delete + re-add)
- **Reco:** Édition complète de tous les champs via la modal Add réutilisée (crayon sur carte), en préservant l'id. **[bloquant]**

**Q13. Peut-on supprimer des commands, avec quelle confirmation et quelle portée (single / tool / catégorie) ?**
*Contexte: aucune suppression ; commands seulement appendables.*
- Delete single avec confirmation destructive
- Delete single sans confirm
- Delete en masse par tool/catégorie
- **Reco:** Delete single depuis la carte/modal avec confirmation destructive ; pas de delete en masse en v1. **[bloquant]**

**Q14. Quand un Command est supprimé, qu'advient-il (a) des steps liés, (b) de son appartenance cheatsheet, (c) de sa note perso ?**
*Contexte: byId[stp.note] null → panneau disparaît silencieusement, id reste ; selected.filter drop l'affichage mais garde l'array ; notes[id] orphelin.*
- Bloquer la suppression tant que référencé (montrer où)
- Autoriser : nuller les liens step (garder texte), retirer des sélections, supprimer note orpheline ; confirmer avec compte de références
- Cascade-delete des steps liés
- Laisser dangling (prototype)
- **Reco:** Autoriser ; nuller les liens step (garder le texte), retirer de toutes les sélections cheatsheet, supprimer la note orpheline, confirmer avec compte de références ; entrées cheatsheet en FK cascade. **[bloquant]**

**Q15. Peut-on éditer les références existantes (title, URL, desc, tags), via quelle UX ?**
*Contexte: module références add-only ; seul module de contenu sans mutation au-delà du create.*
- Réutiliser la modal « Nouvelle référence » pré-remplie en édition (crayon)
- Champs inline éditables
- Pas d'edit
- **Reco:** Réutiliser la modal add pré-remplie comme dialogue d'édition, déclenchée par une icône sur chaque carte. **[haut]**

**Q16. Peut-on supprimer des références, avec confirmation et/ou undo ?**
*Contexte: pas de delete pour références (contrairement à deleteStep/Phase/Roadmap).*
- Delete via ✕ + dialogue de confirmation
- Delete via ✕ immédiat + toast undo
- Delete immédiat sans confirm
- Pas de delete
- **Reco:** Delete via ✕, immédiat avec toast undo — cohérent avec l'édition low-friction. **[haut]**

**Q17. Les catégories builtin sont-elles renommables/recolorables/supprimables, les custom éditables/supprimables, et que deviennent les commands d'une catégorie supprimée ?**
*Contexte: prototype ne crée que du custom ; pas de rename/recolor/delete ; cascade indéfinie.*
- Builtins renommables/recolorables non supprimables ; custom pleinement éditables ; delete bloqué tant que la catégorie contient des commands (offrir réassignation vers Utilities)
- Builtins verrouillés ; custom supprimables si vides seulement
- Toute catégorie supprimable ; réassigner vers fallback
- Cascade-delete des commands
- **Reco:** Builtins renommables/recolorables non supprimables ; custom pleinement éditables ; delete bloqué tant que la catégorie contient des commands (offrir réassignation vers Utilities) ; réordre manuel différé. **[haut]**

**Q18. Les items seed (commands, références, roadmaps) sont-ils des lignes ordinaires éditables/supprimables, même si des steps référencent des IDs de command seed ?**
*Contexte: 24 commands, 6 refs, 4 roadmaps seedés ; steps référencent des IDs seed (note:'n1') ; aucun flag de provenance.*
- Seed = lignes ordinaires éditables/supprimables ; règles de cascade uniformes ; exportées comme toute ligne
- Lignes seed read-only/protégées
- Pas de seed, démarrage vide
- **Reco:** Seed au premier lancement comme lignes ordinaires pleinement éditables/supprimables avec les mêmes cascades ; exportées comme toute ligne. **[haut]**

**Q19. À la suppression d'un parent (step/phase/roadmap/catégorie), l'état dépendant (checks, openSteps, notes, sélection) est-il nettoyé en cascade ou laissé orphelin ?**
*Contexte: nettoyage incohérent ; deleteRoadmap purge les checks mais pas deleteStep ; avec clés positionnelles, un check stale ressuscite sur le step qui glisse à l'index (bug de résurrection).*
- Cascade-delete de tout l'état dépendant à chaque suppression de parent
- Garbage-collection périodique au load
- Laisser orphelins
- **Reco:** Cascade-delete de l'état dépendant (checks, openSteps, notes, entrées de sélection) à chaque suppression ; les step IDs stables éliminent aussi le bug de résurrection. **[haut]**

---

## Variables

**Q20. Quelle forme de stockage concrète pour une variable, et les DÉFINITIONS (noms/ordre/type/sensibilité) sont-elles séparées des VALEURS ?**
*Contexte: prototype = map name→value + tableau d'ordre hardcodé ; une UI custom-vars a besoin d'ordre, flag builtin, métadonnées.*
- Liste ordonnée d'enregistrements {name,value,type,default,sensitive,is_builtin,position}, définitions séparables des valeurs
- Map + tableau d'ordre séparé
- Map simple (prototype)
- **Reco:** Modéliser les variables en liste ordonnée d'enregistrements avec métadonnées ; traiter définitions (portables) et valeurs (locales, export optionnel) distinctement. **[bloquant]**

**Q21. Les VALEURS sont-elles un jeu global unique, ou scopées/commutables (profils par cible, par cheatsheet/roadmap) ?**
*Contexte: un seul state.vars substitué partout ; mais sheetTarget suggère du travail par cible.*
- Jeu de valeurs actif global unique
- Définitions globales + profils commutables
- Valeurs par cheatsheet / roadmap
- **Reco:** Jeu global unique en v1, schéma prêt pour une couche « profils » sans migration ; confirmer si les profils sont voulus maintenant. **[bloquant]**

**Q22. La grammaire des noms de variable autorise-t-elle les chiffres (ex. $IP2), et comment la casse est-elle gérée dans le formulaire ?**
*Contexte: le tokenizer utilise /\$([A-Z_]+)/ — majuscules + underscore, PAS de chiffres.*
- Autoriser [A-Z_][A-Z0-9_]* (chiffres non initiaux) + auto-uppercase du champ
- Garder [A-Z_] seulement, auto-uppercase
- Toute casse, résolution insensible à la casse
- **Reco:** Élargir la grammaire à $[A-Z_][A-Z0-9_]* et auto-uppercase le nom ; mettre à jour resolver, tokenizer et validation ensemble. **[haut]**

**Q23. Dans le formulaire, l'utilisateur saisit le nom AVEC ou SANS le '$' initial, et le '$' est-il stocké ?**
*Contexte: l'affichage concatène '$'+key ; les clés d'état sont bare ('IP').*
- Préfixe '$' fixe dans le champ, l'utilisateur tape le nom seul
- L'utilisateur tape '$NAME', l'app strippe le '$'
- Stocké verbatim avec '$'
- **Reco:** Afficher un préfixe '$' non éditable ; stocker et valider le nom bare. **[moyen]**

**Q24. Règles d'unicité, noms réservés et longueur pour les noms de variable ?**
*Contexte: aucune validation ; collision possible avec un nom standard ; label 60px déborde.*
- Unique (insensible casse), bloquer les 6 noms standard, ≥1 lettre, cap ~24 car.
- Unique seulement
- Autoriser doublons (last-wins)
- **Reco:** Unicité insensible à la casse, interdire les 6 noms standard, ≥1 lettre, cap ~24 caractères. **[moyen]**

**Q25. Les 6 variables standard (IP, LHOST, LPORT, USER, PASS, DOMAIN) sont-elles fixes/protégées ou renommables/supprimables comme les custom, et dans quel ordre ?**
*Contexte: hardcodées dans varMeta, référencées par nom dans les templates seed ; ordre varMeta (…USER,PASS,DOMAIN) ≠ spec §04 (…USER,DOMAIN,PASS).*
- Standard value-editable seulement (pas rename/delete), fixes en haut ; optionnellement masquables ; custom en ordre de création
- Standard pleinement éditables comme custom (avec cascade)
- Entièrement réordonnables incl. standard
- **Reco:** Standard value-editable seulement, fixes en haut ; masquables mais non supprimables ; custom appendées en ordre de création ; confirmer l'ordre canonique. **[haut]**

**Q26. Comment l'UI add/edit/delete des variables est-elle exposée dans le panneau Variables ?**
*Contexte: le panneau ne rend que des lignes label+input statiques ; pas de '+', edit ni delete.*
- Ligne inline '+ Variable' + rename/delete par ligne au hover
- Toggle mode édition façon Méthodologie
- Modal dédiée façon +Commande/+Référence
- **Reco:** Ligne inline '+ Variable' avec rename/delete via petite affordance par ligne (pas de modal) pour garder le panneau dense. **[haut]**

**Q27. Au renommage d'une variable, tous les tokens $OLDNAME des templates sont-ils réécrits automatiquement, ou laissés dangling ?**
*Contexte: pas de précédent ; les tokens sont du texte littéral dans les templates.*
- Cascade rename sur tous les templates en une transaction
- Renommer la définition seule ; laisser dangling
- Interdire le rename
- **Reco:** Cascade du rename sur tous les templates en une transaction ; afficher le compte de commands mises à jour dans la confirmation. **[haut]**

**Q28. Que se passe-t-il à la suppression d'une variable encore référencée par des templates ?**
*Contexte: après delete le $TOKEN reste littéral mais toujours stylé vert (dangling).*
- Avertir avec compte de références, autoriser (tokens non résolus)
- Bloquer tant que des références existent
- Delete silencieux
- Delete et strip/convertir les tokens orphelins
- **Reco:** Avertir avec le compte de commands référençantes ; autoriser ; rendre le token non résolu de façon distincte (voir Q35). **[haut]**

**Q29. Les variables sont-elles typées ($LPORT numérique, $IP format IP) avec validation, ou toutes texte libre ?**
*Contexte: tout est string avec substitution texte pure, sans validation.*
- Toutes texte libre (v1)
- Type optionnel par variable avec validation souple
- Typées avec validation bloquante
- **Reco:** Toutes texte libre en v1 ; réserver un champ type optionnel pour validation souple plus tard. **[moyen]**

**Q30. Une variable a-t-elle une 'valeur par défaut' distincte de sa valeur courante (reset par engagement) ?**
*Contexte: prototype = une seule valeur courante ; pas de concept default/reset.*
- Pas de champ default ; valeur courante unique + « effacer toutes les valeurs » global
- Default optionnel par variable + reset-to-defaults
- Aucun default
- **Reco:** Pas de default par variable en v1 ; fournir une action unique « effacer toutes les valeurs ». **[bas]**

**Q31. Comment un token de variable NON RÉSOLU doit-il se rendre — texte non surligné (spec) ou vert (prototype) ?**
*Contexte: contradiction directe : le spec dit vert seulement si résolu ; _toParts marque tout $UPPERCASE vert.*
- Spec : vert seulement si valeur existe, non résolu en texte simple
- Prototype : tous les tokens reconnus verts
- Trois états : résolu=vert, défini-mais-vide=style X, indéfini=avertissement (pointillé/rouge)
- **Reco:** Suivre le spec (vert seulement si résolu) + ajouter un style « indéfini/dangling » distinct (atténué ou pointillé) pour voir les tokens cassés. **[haut]**

**Q32. Comment une variable DÉFINIE-mais-VIDE se rend/substitue vs une indéfinie ?**
*Contexte: les standards existant toujours, une valeur vide « définie » substitue en chaîne vide ('nc -lvnp ' perd LPORT), alors qu'un nom indéfini garde son $TOKEN.*
- Vide substitue en rien (prototype)
- Vide garde le $TOKEN visible jusqu'à remplissage
- Vide substitue en rien mais montre un marqueur subtil
- **Reco:** Traiter les variables vides comme non résolues et garder le placeholder $TOKEN visible. **[moyen]**

**Q33. Existe-t-il un échappement/délimiteur pour du texte $WORD littéral, sachant que les variables shell ($USER, $HOME, $PATH) collisionnent ?**
*Contexte: la regex capture tout $WORD majuscule ; $USER dans une vraie commande bash serait remplacé ; $1 positionnel est sûr.*
- Pas d'échappement (prototype)
- Supporter \$ pour littéraux ; garder $NAME bare
- Exiger ${NAME} pour substitution ; $WORD bare littéral
- Substituer seulement les noms définis
- **Reco:** Ajouter un échappement \$ pour les littéraux et garder la substitution $NAME bare ; documenter que seuls les noms définis substituent. **[haut]**

**Q34. Au-delà du code des commands, où d'autre la substitution s'applique-t-elle — notes perso, titres/descriptions, texte des steps, titre/cible cheatsheet ?**
*Contexte: substitution seulement sur template ; le reste est brut.*
- Templates de code seulement (prototype)
- Code + notes perso
- Code + notes + titre/cible cheatsheet
- Partout où un $TOKEN apparaît
- **Reco:** Templates de code seulement en v1 ; revisiter notes/cible sur demande. **[moyen]**

**Q35. Confirmer que la substitution est single-pass (pas de récursion) ; définir le comportement si une valeur contient un $TOKEN ou un '$' littéral.**
*Contexte: _resolve fait un seul passage ; IP='$LHOST' est inséré littéralement.*
- Single-pass, valeurs verbatim (prototype)
- Récursif jusqu'à stabilité avec garde de cycle
- **Reco:** Garder single-pass, valeurs verbatim ; documenter explicitement. **[bas]**

**Q36. L'app doit-elle auto-détecter les $TOKENS inconnus dans les templates et proposer de les créer, et/ou fournir un helper d'insertion de variable ?**
*Contexte: les utilisateurs tapent les tokens à la main ; pas de découverte ni de helper.*
- Pas d'auto-détection/helper (prototype)
- Détecter les tokens inconnus, proposer création en 1 clic
- Picker/bouton d'insertion dans le formulaire
- Les deux
- **Reco:** Différer en v2 ; pour v1 envisager un helper d'insertion léger. Confirmer si la détection de tokens inconnus est voulue maintenant. **[bas]**

---

## Bibliotheque — recherche, filtres, groupement, etats vides

**Q37. Quels champs la recherche full-text couvre-t-elle — inclure tool et libellé catégorie ; exclure la note perso ?**
*Contexte: spec §05 dit title/code/desc/tags ; le prototype ajoute tool mais exclut le libellé catégorie ; la note jamais.*
- Jeu spec (title/code/desc/tags)
- Jeu prototype (+tool)
- + libellé catégorie
- Tout incl. note
- **Reco:** Rechercher title, code/template, description, tags, tool ET libellé catégorie ; exclure la note perso. **[haut]**

**Q38. Quel modèle de matching — substring sur toute la chaîne, AND de tokens split-espace, ou fuzzy ?**
*Contexte: match() fait includes() sur une chaîne concaténée, donc 'nmap scan' échoue même si les deux mots existent.*
- Substring sur haystack concaténé (actuel)
- Tokenized AND
- Fuzzy
- Tokenized AND + ciblage par champ (tag:web)
- **Reco:** Tokenized AND : split sur espaces, chaque terme doit matcher quelque part. **[haut]**

**Q39. La recherche doit-elle être insensible aux accents (diacritiques) en plus de la casse ?**
*Contexte: les deux côtés en minuscules mais sans folding ; contenu 'énumération'.*
- Insensible casse seulement
- Insensible casse + accents
- **Reco:** Insensible casse et accents (normalize NFD + strip combining marks des deux côtés). **[moyen]**

**Q40. La recherche matche-t-elle la commande résolue (variables substituées) ou seulement le template brut ?**
*Contexte: match() cherche c.template brut ; chercher '10.10.10.5' ne trouve rien.*
- Template brut seulement
- Aussi le résolu
- Les deux
- **Reco:** Rechercher les templates bruts seulement, résultats déterministes indépendants des valeurs. **[bas]**

**Q41. La recherche est-elle un filtre global partagé (persiste entre onglets) ou par module, et faut-il la masquer/désactiver où elle ne fait rien ?**
*Contexte: une seule query pilote Library et References et persiste ; la boîte est inerte en Méthodologie et Cheatsheet.*
- Global partagé (actuel)
- Par module, reset au changement d'onglet
- Global mais masqué/désactivé où inutile
- **Reco:** Recherche par module réinitialisée au changement de module ; masquer/désactiver la boîte où elle n'a pas d'effet. **[moyen]**

**Q42. Les filtres catégorie/tool/tag/recherche se combinent-ils strictement en AND, et une dimension (surtout tags) doit-elle permettre le multi-select (OR interne) ?**
*Contexte: match() AND les quatre ; chaque dimension est un scalaire — sélectionner un 2e tag remplace le 1er.*
- Single-select chacune, AND global (actuel)
- Multi-select tags (OR interne), AND avec cat/tool/query
- Multi-select catégories et tags
- **Reco:** Garder AND entre dimensions ; ajouter multi-select tags avec OR-interne ; catégorie et tool restent single-select. **[haut]**

**Q43. Quand plusieurs filtres et une query sont actifs, comment l'état est-il affiché et effacé individuellement ?**
*Contexte: scopeLabel montre catégorie(+tool) OU tag, jamais les deux, jamais la query.*
- Label de scope unique (actuel)
- Chips de filtre supprimables par dimension
- Fil d'ariane complet
- **Reco:** Afficher tous les filtres actifs en chips supprimables (catégorie, tool, tag(s), query) + reset global. **[moyen]**

**Q44. Définir le comportement canonique de chaque affordance de reset : « Toutes les commandes » vs le lien « réinitialiser ».**
*Contexte: « Toutes » n'efface que cat+tool ; « réinitialiser » efface cat+tool+tag+query.*
- « Toutes » efface cat+tool seulement ; « réinitialiser » efface tout (documenté)
- Les deux effacent tout
- Renommer pour désambiguïser
- **Reco:** « Toutes les commandes » efface catégorie+tool seulement ; « réinitialiser » efface tout incl. tags et query ; documenter et distinguer du reset méthodologie. **[moyen]**

**Q45. Le filtre tool reste-t-il scopé par catégorie, ou offre-t-il une vue globale « toutes les commandes du tool X » ?**
*Contexte: sélectionner un tool fixe activeCat et activeTool ; le même tool apparaît dans plusieurs catégories sans vue transversale.*
- Scopé catégorie (actuel)
- Filtre tool global transversal
- Les deux
- **Reco:** Garder l'arbre tool scopé catégorie en v1 ; le filtre tool global est hors scope sauf demande. **[moyen]**

**Q46. Comment les noms de tool sont-ils normalisés, et peut-on renommer/fusionner ? Confirmer 'Divers' comme défaut vide.**
*Contexte: la string brute est la clé de groupe donc 'nmap'/'Nmap' fragmentent ; addCommand trim + fallback 'Divers'.*
- Trim + match insensible casse, garder casse first-seen ; rename/merge ; garder 'Divers'
- Match exact (prototype)
- Forcer minuscule ; renommer le défaut
- **Reco:** Trim + match insensible à la casse (garder casse first-seen), autoriser rename/merge, garder 'Divers' par défaut. **[moyen]**

**Q47. Règles de normalisation/validation des tags, et rename/merge/delete global (commands et références cohéremment) ?**
*Contexte: tags command dédupliqués via Set mais casse préservée ; tags référence non dédupliqués ; 'web'/'Web' comptés à part.*
- Trim, strip '#' initial, minuscules, dédup insensible casse, interdire virgules, autoriser espaces ; rename/merge/delete global ; auto-retirer tags zéro-ref
- Préserver casse, trim/dédup seulement
- Format slug imposé
- **Reco:** Trim, strip '#' initial, stocker en minuscules avec dédup insensible casse (pour commands ET références), interdire virgules, autoriser espaces ; rename/merge/delete global ; drop des tags zéro-référence. **[moyen]**

**Q48. Quel ordre de tri pour catégories, tools dans une catégorie, commands dans un tool, et tags ?**
*Contexte: prototype mélange curé (catégories), first-appearance (tools), création (commands), alphabétique (tags).*
- Catégories curées, tools alpha, commands par titre (création en tiebreak), tags alpha
- Tout alphabétique
- Ordre création/apparition
- Ordre contrôlé par l'utilisateur
- **Reco:** Ordre catégorie curé ; tools alpha ; commands alpha par titre avec création en tiebreak ; tags alpha. **[moyen]**

**Q49. Le groupement catégorie→tool à deux niveaux est-il le seul layout, et les groupes doivent-ils être repliables avec état mémorisé ?**
*Contexte: résultats toujours groupés, tous dépliés, pas de liste plate ni de repli.*
- Groupé seulement, toujours déplié (actuel)
- Groupé, groupes repliables
- Toggle groupé/plat
- **Reco:** Garder catégorie→tool comme unique layout en v1 mais rendre les groupes catégorie repliables. **[bas]**

**Q50. Les compteurs sidebar catégorie/tool/tag reflètent-ils le filtre courant ou toujours les totaux globaux ?**
*Contexte: compteurs sur TOUTES les commands ignorant les filtres, alors que l'en-tête montre le compte filtré.*
- Totaux globaux (actuel)
- Refléter les filtres actifs
- Filtré/total
- **Reco:** Garder les compteurs sidebar en totaux globaux (carte de navigation stable) ; l'en-tête donne le compte filtré ; documenter. **[moyen]**

**Q51. Une bibliothèque réellement vide (zéro command) doit-elle avoir un état vide de premier lancement distinct de « aucun résultat pour ce filtre » ?**
*Contexte: le bloc noResults dit « modifie ta recherche ou réinitialise les filtres » même à zéro command totale.*
- États distincts premier-lancement vs aucun-match
- État vide unique partagé (actuel)
- **Reco:** État vide de premier lancement distinct (inviter à ajouter/importer), séparé de l'état aucun-match filtré. **[moyen]**

**Q52. Comment la Bibliothèque gère-t-elle les commands dont la clé de catégorie est inconnue (dataset importé) ?**
*Contexte: les groupes n'itèrent que les clés connues avec count>0 ; une clé inconnue est comptée mais jamais rendue.*
- Auto-créer une catégorie depuis la clé inconnue
- Regrouper sous 'Uncategorized / Autre' + avertissement à l'import
- Rejeter/réparer les catégories inconnues à l'import
- **Reco:** Regrouper les commands à catégorie inconnue sous 'Uncategorized/Autre' et avertir à l'import — aucune command silencieusement masquée. **[moyen]**

**Q53. Les échecs de copie doivent-ils remonter une vraie erreur au lieu du toast toujours-succès, et y a-t-il des contraintes OPSEC à écrire des commandes résolues (IPs/creds réels) au presse-papiers ?**
*Contexte: copyText avale les échecs et affiche toujours 'Copié' ; copie le RÉSOLU incl. $PASS ; échoue hors contexte sécurisé.*
- Toast succès/échec réel ; copier résolu (documenter OPSEC)
- Copier résolu + auto-clear optionnel du presse-papiers
- Offrir copy-raw vs copy-resolved
- **Reco:** Toast basé sur le résultat réel du presse-papiers ; garder la copie résolue ; documenter l'implication OPSEC (auto-clear en section Sécurité). **[moyen]**

**Q54. Quelle validation Add/Edit pour champs requis, doublons de command, unicité des libellés catégorie/tool ?**
*Contexte: seuls title+template requis ; pas de détection de doublon ; libellé catégorie non vérifié.*
- title+template requis seulement (actuel)
- + avertir sur command dupliquée
- + imposer unicité libellés catégorie/tool
- + valider la syntaxe des variables du template
- **Reco:** Requérir title+template ; avertir (sans bloquer) sur doublon exact title+template dans le même tool ; dédupliquer libellés catégorie et tool insensiblement à la casse. **[moyen]**

**Q55. Après ajout d'une command, faut-il effacer tous les filtres et la query pour la rendre visible, ou juste naviguer vers sa catégorie/tool ?**
*Contexte: addCommand fixe category/tool et déplie mais n'efface PAS activeTag ni query.*
- Effacer tag+query à l'ajout
- Naviguer catégorie/tool seulement (actuel)
- Effacer tous les filtres et montrer « Toutes les commandes »
- **Reco:** À l'ajout, effacer aussi activeTag et query pour que la nouvelle command soit toujours affichée. **[bas]**

**Q56. Peut-on dupliquer/cloner une command existante comme point de départ ?**
*Contexte: la modal Add s'ouvre toujours vide ; beaucoup de commandes OSCP sont des variantes.*
- Ajouter une action dupliquer/cloner
- Pas de clonage en v1
- **Reco:** Ajouter une action « dupliquer » pré-remplissant la modal Add ; priorité basse en v1. **[bas]**

---

## Methodologie

**Q57. Que doit faire le « Réinitialiser » méthodologie — effacer seulement les checks de la roadmap courante, aussi replier les panneaux, ou restaurer la structure seed — et comment désambiguïser du « réinitialiser » filtres ?**
*Contexte: onResetRoadmap efface seulement les checks de la roadmap active ; collision de nom avec le lien Library.*
- Checks seulement, roadmap courante (prototype)
- Checks + repli des openSteps de la roadmap
- Restauration structurelle complète (destructif, confirm)
- Garder le reset des checks mais renommer
- **Reco:** Garder la sémantique prototype (checks de la roadmap courante) + reset des openSteps de cette roadmap ; ajouter une confirmation ; renommer un contrôle (ex. « Réinitialiser la progression »). **[bloquant]**

**Q58. Peut-on glisser un step d'une phase à une autre (cross-phase), ou le réordre reste-t-il intra-phase ?**
*Contexte: le drag ne se déclenche que si dragStep.pi===pi ; moveStep mute un seul tableau de phase.*
- Intra-phase seulement (prototype)
- DnD cross-phase
- Cross-phase via menu « déplacer vers phase »
- **Reco:** Autoriser le DnD cross-phase, conditionné aux step IDs stables. **[haut]**

**Q59. Après création, le texte d'un step est-il éditable ?**
*Contexte: en mode édition le texte est un div statique ; seuls drag + delete existent. Les labels phase et roadmap SONT éditables.*
- Ajouter l'édition inline du texte de step en mode édition
- Garder delete-and-recreate seulement
- **Reco:** Ajouter l'édition inline du texte de step en mode édition, cohérent avec le renommage phase/roadmap. **[haut]**

**Q60. Après création, la command liée à un step peut-elle être changée, ajoutée ou retirée ?**
*Contexte: le lien est choisi uniquement à la création via un select ; aucune UI d'édition.*
- Autoriser changer/ajouter/retirer la command liée par step en mode édition
- Lien éditable seulement à la création
- **Reco:** Autoriser l'édition de la command liée de tout step existant en mode édition. **[haut]**

**Q61. Comment pondérer la progression globale d'une roadmap — chaque step à égalité, ou chaque phase à égalité quel que soit son nombre de steps ?**
*Contexte: progression globale = done/total sur tous les steps, donc les grosses phases dominent.*
- Égal par step (prototype)
- Moyenne des pourcentages par phase
- Montrer les deux
- **Reco:** Garder égal-par-step globalement ; reflète le travail réel. **[moyen]**

**Q62. Comment arrondir la progression et afficher les bornes 0%/100% et roadmaps/phases vides ?**
*Contexte: Math.round fait afficher 100% à 199/200 ; une roadmap fraîche montre '0/0 · 0%'.*
- Réserver 100% pour done==total et 0% pour done==0, clamp 1-99 sinon ; état neutre 'aucune étape' pour les vides
- Garder Math.round et '0/0 · 0%'
- Montrer done/total brut
- **Reco:** Réserver 100% pour done==total et 0% pour done==0 (clamp sinon) ; état neutre 'aucune étape' pour roadmaps/phases vides. **[bas]**

**Q63. Quand une command liée à un step est supprimée, qu'advient-il du lien du step ?**
*Contexte: cmd=byId[stp.note] ; une command manquante donne null et le panneau disparaît silencieusement, l'id dangling reste.*
- Avertir + confirmer avant de supprimer une command liée
- Auto-délier et signaler visiblement les steps affectés
- Drop silencieux du lien (prototype)
- Bloquer tant que référencé
- **Reco:** Auto-délier à la suppression mais afficher un indicateur sur les steps affectés plutôt que masquer silencieusement (aligné sur la cascade Q14). **[moyen]**

**Q64. Un step peut-il lier plus d'une command, ou exactement une par step ?**
*Contexte: dropdown single-select ; step.note tient un ID ; spec §09 singulier.*
- Exactement une (prototype)
- Autoriser plusieurs commands liées
- **Reco:** Garder une command par step pour l'instant ; revisiter si des alternatives sont nécessaires. **[bas]**

**Q65. Un step de méthodologie doit-il supporter sa propre note libre, distincte de sa command liée ?**
*Contexte: les steps n'ont que texte + command liée.*
- Pas de note par step (prototype)
- Note libre optionnelle par step
- **Reco:** Différer — pas de note par step sauf si des annotations d'engagement sont voulues en méthodologie. **[bas]**

**Q66. Peut-on dupliquer une roadmap existante (phases, steps, liens) en une copie éditable ?**
*Contexte: addRoadmap crée toujours une roadmap vide.*
- Ajouter une action « Dupliquer »
- Pas de duplication
- **Reco:** Ajouter une action « Dupliquer » clonant la structure avec IDs neufs et progression remise à zéro. **[moyen]**

**Q67. Les 4 roadmaps de départ sont-elles seed permanent, templates réinstanciables ou défauts pleinement supprimables — et restaurables après suppression ?**
*Contexte: hardcodées et copiées dans l'état ; deleteRoadmap les retire définitivement.*
- Seed une fois, appartiennent à l'utilisateur/supprimables, pas de restauration
- Templates réinstanciables + « restaurer défauts »
- Bibliothèque de templates read-only séparée
- **Reco:** Seed une fois comme roadmaps ordinaires éditables + action optionnelle « restaurer les méthodologies par défaut » réajoutant les manquantes. **[moyen]**

**Q68. L'ordre des onglets roadmap doit-il être contrôlable (réordonnable), et sinon selon quelle règle ?**
*Contexte: onglets en ordre d'array ; nouvelles roadmaps appendées ; pas de réordre.*
- Ordre de création fixe
- Drag-to-reorder
- Alphabétique
- Ordre manuel via mode édition
- **Reco:** Garder l'ordre de création en v1 mais persister un champ d'ordre explicite pour ajouter le réordre sans migration. **[bas]**

**Q69. Quelle roadmap est active au chargement, et laquelle le devient après suppression de la courante ?**
*Contexte: activeRoadmap défaut 'services' ; après delete fallback rms[0] ; tout supprimé → état vide.*
- Défaut hardcodé + première restante (prototype)
- Mémoriser la dernière active entre sessions
- Défaut sur la première en ordre
- **Reco:** Persister et restaurer la dernière roadmap active ; après suppression sélectionner l'onglet précédent (ou le premier). **[bas]**

**Q70. Les actions destructives méthodologie (Réinitialiser, delete roadmap/phase/step) requièrent-elles confirmation et/ou undo ?**
*Contexte: aucune ne prompt ; delete roadmap/phase peut jeter beaucoup de travail en un clic.*
- Pas de confirmation (prototype)
- Confirmer les deletes à fort impact + reset
- Confirmer tout + toast undo
- Toast-undo au lieu de dialogues
- **Reco:** Confirmer la suppression de roadmap et Réinitialiser ; toast-with-undo pour la suppression de phase/step. **[moyen]**

**Q71. Le DnD de réordre doit-il fonctionner au tactile, et par quel mécanisme (le DnD HTML5 natif ne se déclenche pas au touch) ?**
*Contexte: réordre phase/step via draggable natif, non fonctionnel sur la plupart des navigateurs tactiles.*
- Desktop/souris seulement
- DnD pointer-event fonctionnant aussi au touch
- Boutons ↑/↓ comme chemin touch-safe
- **Reco:** Desktop primaire + boutons ↑/↓ couvrant touch et accessibilité sans réécrire en pointer-DnD. **[moyen]**

**Q72. Le réordre méthodologie doit-il offrir des boutons ↑/↓ (comme le cheatsheet) en fallback clavier/accessible du DnD ?**
*Contexte: le cheatsheet réordonne via ↑/↓ ; la méthodologie n'offre que le DnD souris.*
- Ajouter ↑/↓ pour phases et steps en mode édition
- DnD seulement
- DnD + drag clavier complet
- **Reco:** Ajouter ↑/↓ en mode édition en plus du DnD, comme le cheatsheet. **[moyen]**

**Q73. Quelle sémantique d'insertion de step, sachant que l'indicateur de drop (bordure haute) ne correspond pas où le step atterrit ?**
*Contexte: indicateur bordure-haute mais moveStep splice puis insère à l'index brut, atterrissant APRÈS la ligne ; les phases utilisent l'insertion midpoint.*
- Unifier sur midpoint before/after (comme phases) avec indicateur assorti
- Garder target-index mais corriger l'indicateur
- Laisser tel quel
- **Reco:** Unifier steps et phases sur insertion midpoint before/after avec une ligne d'insertion cohérente. **[moyen]**

**Q74. Un step peut-il être déposé dans une phase vide, et quel est l'état visuel/interaction ?**
*Contexte: les phases vides ne rendent aucune ligne donc aucun dragover ne s'y déclenche.*
- Les phases vides montrent une zone « déposer ici » (nécessite cross-phase)
- Phases vides inertes (prototype)
- N/A si les steps ne changent jamais de phase
- **Reco:** Si le cross-phase est activé, rendre une zone de drop explicite dans les phases vides ; sinon les documenter inertes. **[bas]**

**Q75. Les noms de roadmap et phase doivent-ils être uniques, et y a-t-il des contraintes longueur/caractères au-delà du non-vide ?**
*Contexte: addRoadmap/addPhase ne rejettent que le vide ; doublons autorisés rendant les onglets indistincts.*
- Autoriser doublons (prototype)
- Noms de roadmap uniques, phases dupliquées permises
- Uniques pour les deux
- **Reco:** Avertir sur nom de roadmap dupliqué sans bloquer ; autoriser les noms de phase dupliqués. **[bas]**

**Q76. À la création d'une nouvelle roadmap, l'app doit-elle auto-entrer en mode édition (ou inviter à ajouter la 1re phase) ?**
*Contexte: addRoadmap active la roadmap mais n'active pas methodEdit, laissant une roadmap vide sans étape suivante évidente.*
- Auto-entrer en mode édition après création
- Laisser le mode édition off (prototype)
- **Reco:** Auto-entrer en mode édition immédiatement après création d'une nouvelle roadmap. **[bas]**

---

## References

**Q77. Quelle rigueur de validation d'URL à la soumission — tout accepter + auto-préfixer, ou rejeter l'inanalysable ?**
*Contexte: addReference requiert le non-vide puis préfixe https:// ; pas de parse-check, donc 'not a url' devient 'https://not a url'.*
- Valider avec le parser URL après préfixage ; bloquer + erreur inline si inanalysable
- Tout accepter, auto-préfixer (prototype)
- Accepter mais signaler visuellement si non parsable
- **Reco:** Valider contre le parser URL après auto-préfixage ; bloquer la sauvegarde avec erreur inline s'il ne parse toujours pas. **[haut]**

**Q78. Quels schémas d'URL sont permis pour un href, et comment gérer les schémas dangereux (javascript:, data:, file:) — surtout pour les références arrivant par import JSON qui contournent le formulaire ?**
*Contexte: le formulaire neutralise incidemment via https:// mais l'import JSON charge le tableau directement dans <a href>.*
- Allowlist http/https(/mailto), sanitize à l'import ET au rendu, drop/flag le reste
- Autoriser http/https/mailto, sanitize le reste
- Sanitize seulement au rendu
- Pas de sanitization
- **Reco:** Allowlist http/https(/mailto) et sanitize à l'import ET au rendu ; refuser ou signaler visiblement tout autre schéma. **[haut]**

**Q79. Que doit faire la normalisation d'URL au-delà du préfixage de schéma (host minuscule, strip fragment/tracking, forcer https) ?**
*Contexte: le prototype ne préfixe que https:// et stocke le reste verbatim.*
- Verbatim sauf préfixe de schéma (prototype)
- Minuscule scheme+host seulement
- Canonicalisation complète (host minuscule, strip ports par défaut, drop fragment)
- + strip params de tracking
- **Reco:** Minuscule scheme+host et strip du fragment, path/query verbatim — assez pour un dédup fiable sans altérer le sens. **[moyen]**

**Q80. L'app doit-elle détecter/empêcher (ou avertir) les références dupliquées, et sur quelle clé — URL exacte, URL normalisée, ou domaine ?**
*Contexte: addReference ne fait aucun check de doublon.*
- Bloquer sur match URL normalisée avec message inline
- Avertir mais autoriser (dédup souple)
- Dédup par domaine
- Pas de dédup
- **Reco:** Bloquer sur match URL normalisée avec message inline clair ; autoriser librement même-domaine-path-différent. **[moyen]**

**Q81. Les cartes de référence doivent-elles montrer un favicon, et si oui d'où le sourcer vu l'OPSEC zéro-egress ?**
*Contexte: le prototype montre seulement le domaine texte ; récupérer des favicons = requêtes sortantes.*
- Pas de favicon, domaine texte seulement
- Fetch depuis /favicon.ico de chaque host
- Service favicon tiers
- Favicon data-URI mis en cache local, fetché une fois sur action explicite
- **Reco:** Pas de favicon par défaut (zéro-egress) ; si voulu plus tard, seulement un data-URI mis en cache local fetché une fois sur action explicite, jamais à l'affichage. **[moyen]**

**Q82. Comment rendre le domaine extrait pour les URLs non standard — IPs brutes, ports/userinfo, punycode/IDN, chaînes inanalysables ?**
*Contexte: _domain ne strippe que 'www.', drop ports/paths, montre IDN en punycode, et dump la chaîne brute en cas d'échec.*
- Comme le prototype
- + décoder punycode en Unicode
- + placeholder neutre en cas d'échec
- + montrer host:port pour ports non-défaut
- **Reco:** Garder hostname + strip 'www.', décoder IDN en Unicode, et sur échec afficher un marqueur neutre 'lien invalide' plutôt que la chaîne brute. **[bas]**

**Q83. Les tags de référence doivent-ils être cliquables pour filtrer la liste, avec une facette de tags spécifique aux références ?**
*Contexte: les tags command sont des filtres cliquables ; les tags référence sont de simples spans ; le filtrage des refs n'utilise que la query globale.*
- Tags ref cliquables → filtrer les références
- Facette de tags référence dédiée dans la sidebar sur la vue References
- Les deux
- Garder display-only
- **Reco:** Rendre les tags ref cliquables pour filtrer les références, avec une facette de tags référence affichée dans la sidebar seulement en vue References. **[moyen]**

**Q84. Que doit afficher la sidebar gauche en vue References — elle montre actuellement Variables/Catégories/Tags des commands qui ne s'appliquent pas et font naviguer ailleurs ?**
*Contexte: la sidebar est rendue inconditionnellement ; cliquer une catégorie force view:'library'.*
- Facettes spécifiques références (tags, éventuellement domaines) en References
- Masquer catégories/tags, garder seulement Variables
- Masquer toute la sidebar (grille pleine largeur)
- Laisser inerte (prototype)
- **Reco:** Remplacer les sections Catégories/Tags par des facettes spécifiques références (tags) en References ; Variables peut rester ou être masqué. **[moyen]**

**Q85. Comment les liens de référence s'ouvrent-ils (nouvel onglet vs in-app) et quelle politique referrer/privacy ?**
*Contexte: liens en target=_blank rel='noopener' (PAS noreferrer), donc le Referer fuit l'origine de l'app.*
- rel='noopener noreferrer' + Referrer-Policy: no-referrer sur tous les liens
- Garder rel='noopener' seulement
- Confirmation par ouverture
- Affordance copy-URL en plus/au lieu de l'ouverture
- **Reco:** Ajouter rel='noopener noreferrer' (et une politique no-referrer globale) sur tous les liens + offrir une action copy-URL. **[moyen]**

**Q86. Dans quel ordre les références s'affichent-elles, et peut-on trier/réordonner ?**
*Contexte: ordre d'insertion ; nouvelles entrées appendées ; pas de tri ni drag.*
- Ordre d'insertion, plus récent en dernier
- Alphabétique par titre avec toggle de tri (titre/domaine/récent)
- Drag-reorder manuel
- Plus récent en premier
- **Reco:** Défaut alphabétique par titre avec petit toggle de tri (titre/domaine/ajouté récemment) ; pas de réordre manuel pour une liste de liens. **[bas]**

**Q87. Quels champs de référence sont obligatoires, et le titre doit-il se suggérer depuis l'URL quand vide plutôt que bloquer ?**
*Contexte: addReference requiert title ET url ; pas d'auto-titre (nécessiterait un fetch réseau).*
- Requérir title+URL, pas de fetch (prototype)
- Requérir seulement URL ; défaut titre = domaine si vide
- Requérir seulement URL ; fetch du <title> (egress)
- Requérir URL+title+≥1 tag
- **Reco:** Requérir seulement l'URL et défaut d'un titre vide au domaine extrait (pas de réseau) ; jamais de fetch de métadonnées. **[bas]**

**Q88. Les références doivent-elles être liables/attachables aux commands, steps de méthodologie ou cheatsheet, ou rester une liste autonome ?**
*Contexte: les références sont totalement isolées ; pas de FK.*
- Liste autonome (prototype)
- Attacher aux steps de méthodologie
- Attacher aux commands
- Inclure les liens dans le cheatsheet/export
- **Reco:** Garder les références autonomes en v1 ; revisiter le cross-linking en amélioration ultérieure. **[bas]**

---

## Cheatsheets & export (Markdown/PDF)

**Q89. UN cheatsheet global unique, ou PLUSIEURS nommés créables/commutables/renommables/supprimables ?** (cf. D1)
*Contexte: prototype hardcode un seul selected[]/sheetTitle/sheetTarget ; spec §08 dit « éditable par machine ou par examen ».*
- Un global (prototype)
- Plusieurs nommés avec barre d'onglets + CRUD (réutilise l'UX roadmap)
- Plusieurs via liste/switcher simple
- **Reco:** Plusieurs cheatsheets nommés réutilisant le pattern onglets+CRUD des roadmaps — correspond à « par machine ou par examen ». **[bloquant]**

**Q90. Si plusieurs cheatsheets, chacun porte-t-il ses propres valeurs/snapshot de variables, ou résout-il sur le jeu global unique ?**
*Contexte: le prototype résout tout sur un vars global ; un sheet par machine cible un host avec ses propres $IP/$USER/$PASS.*
- Vars globales seulement ; sheet rendu sur les vars live courantes
- Chaque cheatsheet stocke son propre jeu/overrides pour affichage + export
- Global pour l'édition, l'export fige un snapshot par export
- **Reco:** Si plusieurs cheatsheets adoptés, donner à chacun son snapshot/overrides de variables pour affichage et export ; sinon global. **[bloquant]**

**Q91. Avec plusieurs cheatsheets, à quel sheet le toggle « + Cheatsheet » ajoute-t-il, et une command peut-elle appartenir à plusieurs sheets ?**
*Contexte: appartenance = booléen unique contre le selected global ; le badge nav montre un seul compte.*
- Ajouter au cheatsheet actif ; bouton + badge reflètent le sheet actif
- Popover sélecteur de sheet à l'ajout
- Autoriser l'appartenance à plusieurs sheets
- **Reco:** Ajouter au cheatsheet actif ; l'état « Ajoutée ✓ » et le badge nav reflètent le sheet actif seulement. **[haut]**

**Q92. La composition du cheatsheet (IDs sélectionnés + ordre, notes par item, titre, cible, vars par sheet) est-elle persistée en SQLite et incluse dans l'export dataset complet ?**
*Contexte: prototype garde selected/notes/title/target en état éphémère ; un reload les perd.*
- Persister et round-trip tout
- Persister le contenu mais sélection session-only
- Persister seulement titre/cible
- **Reco:** Persister toute la composition du cheatsheet et l'inclure dans l'export JSON. **[haut]**

**Q93. De quoi une entrée cheatsheet est-elle composée — référence live + position seulement, overrides par entrée, ou snapshot figé — une même command peut-elle apparaître deux fois, et que se passe-t-il à la suppression/édition de la command sous-jacente ?**
*Contexte: chaque entrée = un id ; titre/template/note lus live ; une command supprimée disparaît silencieusement ; toggleSheet empêche les doublons.*
- Entrée = réf command + position, lue live ; occurrence unique ; drop silencieux + purge notes orphelines
- + note par entrée
- Snapshot figé au moment de l'ajout
- Autoriser entrées dupliquées avec notes indépendantes
- **Reco:** Entrée = référence command + position, lue live, occurrence unique, avec indicateur subtil quand la command d'une entrée a été retirée ; note par entrée seulement si plusieurs cheatsheets. **[moyen]**

**Q94. Le cheatsheet est-il strictement une compilation de commands de la bibliothèque, ou permet-il aussi steps de méthodologie, références, ou sections texte/titres libres ?**
*Contexte: spec §08 le définit comme compilation de commands sélectionnées ; prototype n'ajoute que des ids de command.*
- Commands seulement
- Commands + blocs texte/titres libres
- Commands + références
- Commands + steps de méthodologie
- **Reco:** Commands seulement en v1 ; confirmer et différer le contenu enrichi. **[bas]**

**Q95. La note perso est-elle une annotation unique par command partagée entre carte Bibliothèque et entrée Cheatsheet, ou une note par entrée de cheatsheet ?**
*Contexte: notes clé par id de command ; la même valeur s'affiche partout — une note par command, globale.*
- Note unique par command partagée partout (prototype)
- Note par entrée de cheatsheet
- Les deux : note de base + override par entrée
- **Reco:** Note unique par command en v1 si cheatsheet unique ; basculer sur notes par entrée si plusieurs cheatsheets adoptés. **[haut]**

**Q96. La note perso est-elle éditable inline en vue Cheatsheet, ou seulement depuis la carte Bibliothèque ?**
*Contexte: la note Library est un textarea éditable ; le cheatsheet la rend read-only.*
- Éditable aux deux endroits
- Library seulement (actuel)
- Cheatsheet seulement
- **Reco:** Rendre la note éditable dans la carte Library ET l'entrée Cheatsheet, écrivant dans le même store. **[moyen]**

**Q97. La note perso est-elle stockée sur l'enregistrement Command ou dans une map séparée clé par id, et incluse dans l'export/import JSON ?**
*Contexte: spec §09 Command n'a pas de champ note ; les notes vivent dans une map transverse.*
- Map séparée clé par id, incluse dans l'export
- Fusionner la note dans l'enregistrement Command
- Local/session seulement, exclue de l'export
- **Reco:** Garder les notes en map séparée clé par id, l'inclure dans l'export JSON, et nettoyer les orphelins à la suppression. **[moyen]**

**Q98. Le réordre cheatsheet utilise-t-il ↑/↓ (actuel) ou DnD, et les items sont-ils groupables par catégorie/tool ?**
*Contexte: cheatsheet réordonne via ↑/↓ (ordre plat) ; méthodologie via DnD ; exports plats et numérotés.*
- Garder ↑/↓ + ordre plat manuel
- Ajouter DnD, ordre plat
- Auto-grouper par catégorie/tool avec titres
- **Reco:** Garder l'ordre plat manuel ; ajouter le DnD pour la parité plus tard ; pas d'auto-groupement en v1. **[moyen]**

**Q99. Les exports émettent-ils des commandes RÉSOLUES (variables substituées) ou des $TOKENS BRUTS, et comment gérer les vars sensibles ($PASS) en MD/PDF/presse-papiers ?**
*Contexte: exports et presse-papiers substituent tout incl. $PASS ; un cheatsheet partagé grave les creds/IPs live dans un fichier.*
- Toujours résolu (actuel)
- Toujours tokens bruts
- Toggle par export « résoudre les variables »
- Rédiger/tokeniser les vars sensibles en MD/PDF par défaut ; verbatim sur copie explicite
- **Reco:** Défaut résolu mais garder les vars sensibles en $TOKEN (ou masqué) en Markdown/PDF sauf opt-in ; ajouter un toggle « résoudre les variables » ; verbatim au presse-papiers comme action locale intentionnelle. **[bloquant]**

**Q100. Quel jeu exact de métadonnées embarquer et unifier entre Markdown, PDF et en-tête à l'écran (ils diffèrent actuellement), et les vars sensibles/custom sont-elles incluses ?**
*Contexte: trois jeux incohérents ; MD = Cible/IP/LHOST ; PDF/écran = IP/LHOST/USER/DOMAIN ; LPORT, PASS et custom n'apparaissent jamais.*
- Sous-ensemble fixe comme aujourd'hui
- Toutes les variables non-vides incl. custom
- Toutes les non-vides NON-sensibles (custom incluses)
- Sélectionnable par export
- **Reco:** Embarquer toutes les variables non-vides NON-sensibles (standard + custom) avec un format cohérent en MD/PDF/en-tête ; toujours exclure les vars sensibles. **[haut]**

**Q101. Les exports embarquent-ils une date/heure de génération et une identité outil (« Generated by Cheat ») ?**
*Contexte: ni timestamp ni marqueur outil/version ; les artefacts datés aident au reporting d'examen mais une empreinte est un enjeu OPSEC.*
- Pas de métadonnées (actuel)
- Date d'export seulement
- Date + outil/version
- Configurable, off par défaut
- **Reco:** Inclure une date d'export ; rendre toute empreinte outil/version optionnelle et off par défaut pour l'OPSEC. **[moyen]**

**Q102. Quel langage pour le fence de code Markdown — hardcodé ```bash alors que beaucoup de commandes ne sont pas bash ?**
*Contexte: mimikatz, certutil, PowerShell, impacket-python tous emballés en bash.*
- Toujours ```bash
- Fence nu ``` (sans langage)
- Champ langage optionnel par command
- Heuristique par tool/catégorie
- **Reco:** Fence nu par défaut, avec un champ langage optionnel par command pour ceux qui veulent la coloration. **[moyen]**

**Q103. Comment l'exporteur Markdown se prémunit-il du contenu qui casse le format (triple-backticks dans un template, caractères spéciaux dans titre/desc/note) et quel encodage/EOL est garanti ?**
*Contexte: template brut injecté dans un ```bash fence sans échappement ; Blob text/markdown sans charset explicite.*
- Adapter la longueur du fence + traiter titre/desc/note comme littéral ; figer UTF-8/LF
- Laisser brut
- **Reco:** Adapter la longueur du fence (ou indenter), traiter titre/desc/note comme texte littéral, figer UTF-8 + LF. **[moyen]**

**Q104. La structure Markdown exportée (H1, blockquote meta, '## N. titre' + cat/tool + tags + desc + code + note) doit-elle être figée comme template canonique ?**
*Contexte: le prototype définit un layout numéroté spécifique.*
- Adopter le layout prototype comme canonique
- Ajuster ordre titres/métadonnées
- Ajouter une table des matières pour les longs sheets
- **Reco:** Adopter le layout prototype comme canonique (avec les corrections métadonnées/échappement ci-dessus). **[moyen]**

**Q105. Que doit copier « Copier tout » — commandes résolues brutes jointes par newline (actuel), le Markdown complet, ou commandes avec en-têtes en commentaire ?**
*Contexte: onCopyAll joint seulement les templates résolus par newline — sans titres/desc/notes.*
- Commandes résolues brutes, séparées par newline
- Chacune précédée d'un commentaire '# titre'
- Markdown complet identique au .md
- **Reco:** Garder les commandes résolues brutes jointes par newline (paste terminal) et documenter que c'est intentionnellement différent de l'export Markdown. **[moyen]**

**Q106. L'export PDF est-il le window.print()/'Enregistrer en PDF' du navigateur, ou un PDF déterministe généré côté serveur Go ?**
*Contexte: exportPdf appelle window.print() après 60ms ; dépend du dialogue/moteur navigateur ; injecte en-tête/pied navigateur ; pas de contrôle de nom.*
- window.print() côté client (actuel)
- PDF headless-chromium côté serveur
- Librairie PDF pure-Go côté serveur
- Offrir les deux
- **Reco:** Garder window.print() côté client en v1 (simplicité mono-binaire), affiner la CSS print, documenter les caveats cross-browser ; revisiter le serveur seulement si le déterminisme devient une exigence dure. **[bloquant]**

**Q107. Quelle taille de page, marges, en-tête/pied courant et pagination pour la sortie imprimée/PDF, et l'impression est-elle limitée au cheatsheet avec notice d'état vide ?**
*Contexte: seul @page{margin:1.4cm} ; pas de taille (A4 vs Letter) ni furniture ; @media print rend inconditionnellement, donc un Ctrl+P depuis n'importe quelle vue imprime un cheatsheet quasi-vide.*
- A4 + en-tête courant (titre) + numéros/date ; notice d'état vide si rien de sélectionné
- A4 fixe, sans furniture
- Défauts navigateur (actuel)
- **Reco:** Fixer A4 avec marge 1.4cm ; ajouter pied courant (numéro + date) et en-tête (titre) ; notice « cheatsheet vide » minimale si rien de sélectionné ; documenter que l'impression navigateur peut ajouter son propre chrome. **[moyen]**

**Q108. Le PDF doit-il reproduire le traitement visuel à l'écran (surlignage vert des vars résolues, fond des blocs de code) ou rester plat/monochrome ?**
*Contexte: printroot rend du texte plat avec fond gris code mais sans print-color-adjust:exact (certains navigateurs droppent le fill) et sans surlignage.*
- Plat monochrome, sans surlignage (accepter les fonds droppés)
- Forcer print-color-adjust:exact + reproduire le surlignage
- Texte plat mais forcer le fond code seulement
- **Reco:** Confirmer la fidélité voulue ; si matcher l'app, ajouter print-color-adjust:exact et reproduire le surlignage ; sinon confirmer que l'impression reste claire/monochrome avec texte résolu plat. **[moyen]**

**Q109. Quelles règles canoniques de nom de fichier pour l'export Markdown (et, si contrôlable, PDF) ?**
*Contexte: MD slug le titre (é→'_', minuscule, non-alnum→'_') ; cible/date non inclus ; nom PDF non contrôlé sous window.print().*
- Slug ASCII du titre (actuel)
- + suffixe date
- + cible dans le slug
- Préserver unicode / séparateurs tiret
- **Reco:** Slug ASCII du titre avec suffixe date optionnel et séparateurs tiret ; fixer document.title avant window.print() pour que le nom PDF reflète le slug MD. **[moyen]**

**Q110. Comment gérer les métadonnées du PDF, sachant qu'il est généré via le dialogue d'impression navigateur ?**
*Contexte: 'Enregistrer en PDF' embarque titre, date de création, parfois producer/username ; l'OPSEC baseline strippe les métadonnées.*
- Accepter les défauts navigateur, documenter le caveat
- PDF serveur avec métadonnées sanitisées
- Préférer Markdown, PDF best-effort
- **Reco:** Garder le PDF browser-print en v1 mais documenter le caveat métadonnées dans le README ; envisager une génération serveur contrôlée plus tard. **[bas]**

---

## Persistance & sync

**Q111. Quand l'état frontend est-il écrit vers le backend Go/SQLite — autosave débouncé par mutation, save explicite, au blur, ou par frappe ?** (cf. D3)
*Contexte: le prototype n'a aucune persistance ; chaque édit mute l'état React.*
- Autosave débouncé (~500ms) par entité, sans bouton
- Autosave au blur + navigation
- Bouton « Enregistrer » explicite
- PATCH par frappe
- **Reco:** Autosave débouncé (~500ms) par entité mutée, sans bouton, avec indicateur d'erreur uniquement. **[bloquant]**

**Q112. Lesquels des ~35 champs d'état sont persistés au backend, lesquels en stockage device-local, lesquels purement in-memory (et le SPA peut-il cacher des données sensibles dans localStorage/IndexedDB) ?**
*Contexte: l'état mélange données domaine durables et état UI (view/filters/expanded/openSteps/drafts/toast/drag/theme).*
- DB : données domaine + vars + notes + sélection/ordre + checks ; localStorage : theme/defaultView ; memory : drag/drafts/modal/filters/query/expanded/openSteps/toast
- Persister tout incl. filtres/dernière vue
- Persister seulement les entités de contenu
- **Reco:** Split trois-niveaux : données domaine en DB ; seulement les prefs UI non-sensibles (theme, defaultView) en localStorage ; form/drag/modal/filter/query/expanded/openSteps éphémères. Jamais de vars/notes/commands en stockage navigateur. **[bloquant]**

**Q113. La progression méthodologie (état coché par step) est-elle une donnée domaine persistée, clé comment, et openSteps persiste-t-il ?**
*Contexte: checks/openSteps clés positionnellement 'rmId-pi-si' ; nettoyage incohérent.*
- Persister la complétion par step en booléen lié au step ID stable
- Map de progression séparée clé par step ID
- Ne pas persister la progression
- **Reco:** Persister la complétion par step en booléen lié au step ID stable pour survivre aux reloads et éditions structurelles ; traiter openSteps comme état UI éphémère. **[haut]**

**Q114. Les mises à jour UI sont-elles optimistes ou autoritatives, et que se passe-t-il en échec de save ou backend injoignable (binaire arrêté avec un onglet ouvert) ?**
*Contexte: le prototype est intrinsèquement optimiste sans chemin d'erreur ; le binaire embarqué peut mourir onglet ouvert.*
- Optimiste + retry arrière-plan + toast erreur + file retry localStorage
- Optimiste avec rollback sur échec persistant
- Autoritatif (désactiver l'édition jusqu'à confirmation)
- **Reco:** Écritures optimistes avec retry arrière-plan, file retry localStorage courte flushée à la reconnexion, et indicateur saving/saved/error ; pas de rollback pour du single-user local. **[haut]**

**Q115. Quelle sémantique de concurrence avec plusieurs onglets navigateur contre le même binaire local — last-write-wins, détection de conflit optimiste, ou sync live ?**
*Contexte: un binaire same-origin autorise N onglets ; avec autosave deux onglets courent.*
- Last-write-wins par entité + updatedAt + refresh cross-tab (BroadcastChannel/storage event)
- Concurrence optimiste (409 sur conflit, reload)
- Sync live (SSE/WebSocket)
- Verrou single-writer
- **Reco:** Last-write-wins par entité avec colonne updatedAt + refresh cross-tab léger (BroadcastChannel ou storage event) ; refresh au focus fenêtre. Éviter SSE lourd pour un outil local mono-utilisateur. **[haut]**

**Q116. Comment gérer les écritures SQLite concurrentes (journal mode, busy timeout, sérialisation) sous autosave débouncé ?**
*Contexte: SQLite ne permet qu'un writer ; le pool GORM + autosave peut produire SQLITE_BUSY.*
- WAL + busy_timeout, pool plafonné à 1 writer
- Sérialiser les écritures via une goroutine/mutex unique
- Défauts (non sûr)
- **Reco:** Activer WAL + busy_timeout et sérialiser les écritures (max-open-conns=1 ou write mutex). **[moyen]**

**Q117. Comment les opérations de réordre structurel (drag step/phase, ↑/↓ cheatsheet) sont-elles persistées — une écriture par drop, jamais pendant dragover ?**
*Contexte: dragover met à jour dropIndex en continu ; un autosave naïf martèlerait la DB.*
- Persister la roadmap/sélection affectée une fois au drop (et par clic ↑/↓)
- Persister à chaque changement d'état incl. dragover
- Persister sur action explicite
- **Reco:** Persister seulement au drop (et à chaque clic ↑/↓) en une seule mise à jour d'entité ; jamais l'état transitoire dragover/dropIndex. **[moyen]**

**Q118. Quel est le flux de chargement initial/bootstrap, et où se fait le seeding d'une DB vide (Go au démarrage vs premier appel API) ?**
*Contexte: le prototype tient tout le dataset en mémoire dès le départ ; componentDidMount lit une prop build-time sans fetch.*
- Seed en Go au démarrage si vide ; un GET bootstrap renvoie le dataset complet ; PATCH par entité pour les mutations
- Seed lazy au premier GET ; multiples endpoints ressource
- Seed via un endpoint one-time
- **Reco:** Seed en Go au démarrage si DB vide ; exposer un GET bootstrap pour le dataset complet, puis endpoints par entité pour les mutations. **[moyen]**

**Q119. Quelle stratégie de migration de schéma SQLite entre versions du binaire (GORM AutoMigrate additif-seulement vs migrations versionnées explicites), et les migrations doivent-elles être non-destructives ?**
*Contexte: le modèle évoluera (step/phase IDs stables, custom vars, provenance) ; AutoMigrate ne gère que l'additif.*
- AutoMigrate additif seulement
- AutoMigrate + migrations numérotées explicites + ligne schemaVersion + backup pré-migration
- Drop-and-reseed (destructif)
- **Reco:** Tracker un schemaVersion ; AutoMigrate pour l'additif et migrations explicites ordonnées pour le breaking ; backup automatique avant toute migration breaking ; jamais détruire les données utilisateur. **[haut]**

**Q120. Où vit le fichier DB SQLite sur disque relativement au binaire, et le chemin est-il configurable (flag/env) ?**
*Contexte: ni spec ni prototype ne le précisent ; l'OPSEC déconseille les chemins hardcodés.*
- À côté du binaire (app-folder portable)
- Répertoire de données OS/XDG par défaut
- Configurable via --db/CHEAT_DB avec défaut XDG
- **Reco:** Défaut sur un répertoire de données par utilisateur (ex. XDG_DATA_HOME/cheat/cheat.sqlite) surchargeable via --db ou CHEAT_DB ; documenter comme cible du backup par copie de fichier. **[moyen]**

**Q121. Comment les autosaves débouncés en attente sont-ils flushés à la fermeture de l'onglet ou à l'arrêt du binaire (SIGINT/SIGTERM) en plein débounce ?**
*Contexte: une frappe suivie immédiatement d'une fermeture perd le dernier édit — le timer de débounce ne se déclenche jamais ; pas de handler beforeunload ni de flush serveur.*
- Flush synchrone sur beforeunload/visibilitychange + drain serveur sur SIGTERM
- Raccourcir le débounce et accepter une perte sub-seconde
- Flush au blur/navigation seulement
- **Reco:** Côté client, flush toute écriture en attente sur visibilitychange/beforeunload ; côté serveur, drainer la file sur SIGINT/SIGTERM avant sortie, pour qu'une fermeture normale ne perde jamais le dernier édit. **[moyen]**

**Q122. Comment gérer un SPA embarqué périmé après upgrade du binaire — éviter que le navigateur serve un vieux index.html/bundle en cache contre une nouvelle API, et l'app détecte-t-elle un mismatch de version client/serveur ?**
*Contexte: le SPA est servi same-origin via go:embed ; un cache par défaut peut charger une vieille UI contre un nouveau backend.*
- Filenames d'assets content-hashés + no-cache sur index.html ; le client fetch la version embarquée
- no-store sur tout (refetch systématique)
- Pas de gestion de cache ; hard-refresh manuel après upgrade
- **Reco:** Servir des bundles content-hashés avec cache long et index.html en no-cache ; exposer une version embarquée et avertir/recharger si la version API servie diffère du bundle chargé. **[moyen]**

**Q123. Que se passe-t-il si deux processus binaires distincts (pas juste deux onglets) sont lancés contre le même fichier SQLite ?**
*Contexte: la question multi-onglets couvre N onglets d'un process ; un utilisateur peut lancer deux copies pointant le même --db ; avec SQLCipher et WAL cela pose des questions de verrou, second writer, cohérence passphrase.*
- Verrou fichier consultatif : la 2e instance refuse de démarrer avec message clair
- Autoriser les process concurrents, s'appuyer sur WAL + busy_timeout
- Détecter et attacher le navigateur à l'instance déjà lancée
- **Reco:** Prendre un verrou consultatif sur le fichier DB (ou le port) au démarrage ; une 2e instance sur la même DB refuse avec un message clair plutôt que risquer une corruption concurrent-writer. **[moyen]**

---

## Import / export & backup

**Q124. Exactement quelles entités/état l'export JSON dataset complet inclut-il (commands, références, roadmaps+phases+steps, catégories custom + couleurs, définitions de variables, valeurs, notes par command, progression/checks, openSteps, sélection cheatsheet+ordre, titre/cible, theme, settings) ?** (cf. D4)
*Contexte: le contexte figé dit « import/export JSON du dataset complet » mais n'énumère jamais les champs.*
- Contenu seulement (commands/refs/roadmaps/custom cats/noms vars)
- Contenu + état utilisateur (ajoute valeurs/notes/checks/sélection/meta sheet)
- Tout incl. settings/theme
- Snapshot verbatim incl. état de vue transitoire
- **Reco:** Inclure tout le contenu durable + état utilisateur (sélection/ordre, notes, checks clés par step ID, titre/cible sheet, catégories custom+couleurs, définitions de variables ; valeurs selon le toggle sanitisé/complet). Exclure l'état de vue éphémère et garder les prefs UI (theme/settings) hors du dataset. **[bloquant]**

**Q125. L'import JSON REMPLACE tout le dataset (restore backup) ou FUSIONNE dans l'existant, et lequel par défaut ? Offrir les deux ?** (cf. D4)
*Contexte: pas d'import dans le prototype ; export cadré comme snapshot complet.*
- Replace seulement (backup/restore pur)
- Merge seulement (additif)
- Les deux, défaut Replace
- Les deux, défaut Merge
- **Reco:** Offrir les deux ; défaut REPLACE (restore complet) avec backup pré-import automatique et confirmation explicite ; exposer MERGE comme action distincte étiquetée. **[bloquant]**

**Q126. En mode MERGE, comment résoudre les collisions d'id quand un id entrant existe déjà (par entité) ?**
*Contexte: IDs non-namespacés mélangeant ids seed stables et ids timestamp/slug ; deux machines seedées du même build partagent les ids seed.*
- Entrant gagne (écrase local)
- Local gagne (skip entrant)
- Garder les deux : re-id l'entrant et réécrire ses liens internes
- Prompt par conflit
- **Reco:** Sur collision, garder le local par défaut ; si l'entrant est du contenu utilisateur dont l'id collisionne mais le contenu diffère, importer sous id neuf et réécrire ses références entrantes ; rapport added/skipped/re-ided par entité. **[haut]**

**Q127. À l'import, les IDs sont-ils préservés ou réassignés, et si réassignés comment réécrire Step.note (un Command.id) et selected[] du cheatsheet (des Command.ids) ?**
*Contexte: Step résout via byId[stp.note] ; si l'id d'une command change sans réécriture, le lien casse silencieusement.*
- Toujours préserver les ids entrants
- Toujours réassigner + réécrire toutes les références
- Préserver en REPLACE ; réassigner+réécrire seulement sur collisions MERGE
- **Reco:** Préserver les ids en REPLACE (fidélité round-trip) ; en MERGE re-id atomiquement en réécrivant chaque Step.note et entrée selected[] référençants dans la même transaction ; jamais de référence dangling. **[haut]**

**Q128. L'export JSON porte-t-il des métadonnées de version (version schéma/format, version app, timestamp), et quelle politique d'import sur mismatch (ancien/récent) ?**
*Contexte: pas d'enveloppe ; un export v1 peut être importé par v2 après changement de modèle.*
- Pas de versioning
- formatVersion entier seulement
- Enveloppe complète {formatVersion, appVersion, exportedAt, data}
- Enveloppe + hints de migration/checksum
- **Reco:** Envelopper dans {formatVersion, appVersion, exportedAt, data} ; migrations forward pour versions anciennes ; refuser (message clair) les fichiers plus récents que le binaire. **[haut]**

**Q129. Comment la progression positionnelle (checks/openSteps clés 'roadmapId-phaseIndex-stepIndex') est-elle représentée dans l'export pour survivre au réordre/édition entre export et import ?**
*Contexte: l'export sous clés positionnelles mis-mappe chaque check si la roadmap cible diffère d'un seul step.*
- Garder les clés positionnelles (progression casse au changement structurel)
- Ajouter phase/step IDs stables ; clé checks par (roadmapId, phaseId, stepId)
- Embarquer step.done dans chaque step au lieu d'une map séparée
- **Reco:** Clé checks/openSteps par (roadmapId, phaseId, stepId) stables en DB et export (ou embarquer step.done sur chaque step) ; abandonner les clés positionnelles. **[haut]**

**Q130. Pour un REPLACE/restore, quel workflow de sécurité — confirmation, transaction atomique all-or-nothing avec rollback, snapshot pré-restore automatique ?**
*Contexte: REPLACE détruit le vault courant ; SQLite rend atomique + copie fichier faisables.*
- Confirmation + transaction atomique + snapshot pré-restore automatique
- Confirmation + atomique, sans snapshot
- Best-effort, sans transaction
- **Reco:** Confirmation explicite ; import entier en une transaction rollbackée sur toute erreur ; backup pré-restore horodaté écrit automatiquement avant application. **[haut]**

**Q131. Comment l'import gère-t-il les fichiers malformés/partiels/schéma-invalides et les références internes dangling (un Step.note ou selected[] sans command correspondante) ?**
*Contexte: le prototype drop silencieusement les dangling au rendu ; l'import est une entrée non fiable.*
- Strict : rejeter tout le fichier sur toute anomalie
- Lenient : importer ce qui parse, drop silencieux du reste
- Strict sur la structure, repair-and-warn sur les refs internes dangling + limites taille/schéma
- **Reco:** Valider strictement contre le schéma (rejeter le vraiment-malformé/incompatible, limites taille/count, neutraliser les URLs non-http(s)) ; pour les refs dangling d'un fichier par ailleurs valide, repair-and-warn avec résumé de ce qui a été nettoyé. **[haut]**

**Q132. L'export/import JSON se fait-il côté serveur (SQLite autoritatif) ou côté client (navigateur sérialise/upload) ? Quel côté valide et applique ?**
*Contexte: stack figé : mono-binaire, API same-origin, SQLite source de vérité ; les exports MD/PDF du prototype sont des blobs client faute de backend.*
- Côté serveur (GET export stream + POST import upload)
- Côté client (sérialiser navigateur, endpoint bulk-write)
- Hybride : MD/PDF client, serveur possède le JSON dataset
- **Reco:** Côté serveur : GET /api/export stream l'enveloppe ; POST /api/import valide+migre+applique en une transaction et renvoie un résumé ; garder MD/PDF cheatsheet en artefacts client. **[haut]**

**Q133. Comment le dataset seed livré coexiste-t-il avec les édits utilisateur quand un NOUVEAU binaire livre du contenu seed mis à jour/ajouté — first-run-only, upsert, namespacé, ou seed pack importable — et faut-il des tombstones pour éviter de ressusciter les seeds supprimés ?**
*Contexte: seeds hardcodés devenant des lignes 'seed' ; pas de provenance seed-vs-user.*
- Seed seulement au premier lancement/DB vide ; ne plus toucher (+ seed pack importable pour les updates)
- Upsert seed par id stable à chaque démarrage, écrasant seulement les lignes non modifiées (dirty flag)
- Namespacer seed vs user ; insérer nouveaux seeds, jamais modifier/supprimer l'existant
- Livrer le seed comme JSON importable appliqué manuellement
- **Reco:** Seed seulement au premier lancement + action explicite « importer un seed pack mis à jour » pour les refresh ultérieurs ; first-run-only rend les suppressions permanentes et supprime le besoin de tombstones ; tracker un seedVersion pour affichage. **[bloquant]**

**Q134. Une action « factory reset » / re-seed globale est-elle dans le scope (wipe données user et restaurer défauts), distincte du reset progression par-roadmap et du « restaurer les méthodologies par défaut » ?**
*Contexte: le prototype n'a pas de reset global.*
- Reset global gardé qui backup puis re-seed en défauts factory
- Pas de reset global (s'appuyer sur import-replace d'un seed frais)
- Reset par entité seulement
- **Reco:** Fournir un reset global gardé qui déclenche d'abord un export de backup, puis wipe et re-seed, avec confirmation explicite ; l'étiqueter clairement à part du reset de progression méthodologie. **[moyen]**

**Q135. Quelle info catégorie voyage dans l'export, et que se passe-t-il à l'import si le catalogue builtin de l'app tournante diffère (libellé renommé, couleur changée, clé retirée) ?**
*Contexte: le prototype merge builtin + extraCategories au rendu ; une command référence sa catégorie par clé.*
- Exporter seulement extraCategories, s'appuyer sur le frontend pour les builtins
- Exporter la map catégories mergée complète, upsert à l'import
- Catégories = constantes frontend, clés inconnues fallback brut
- **Reco:** Persister TOUTES les catégories (builtin + custom) en lignes et exporter la map complète auto-contenue ; upsert par clé à l'import et garder libellé/couleur entrants pour les clés inconnues, sans orpheliner de command. **[moyen]**

**Q136. À l'import, les DÉFINITIONS de variables custom fusionnent ou remplacent, et les VALEURS entrantes écrasent-elles les valeurs courantes (peut-être live-engagement) de l'utilisateur ?**
*Contexte: pas d'import dans le prototype ; des définitions importées pourraient collisionner et des valeurs clobberer des creds live.*
- Remplacer tout le dataset (définitions + valeurs)
- Merge définitions par nom (skip/rename sur conflit), jamais écraser les valeurs
- Merge définitions, écraser les valeurs
- Prompt par conflit
- **Reco:** Merge définitions par nom (conflits renommés/skippés) ; NE PAS écraser les valeurs existantes sauf choix explicite d'un REPLACE complet. **[moyen]**

**Q137. Au-delà du JSON, l'app doit-elle exposer le fichier SQLite brut en download/upload comme canal de backup ?**
*Contexte: le contexte figé nomme SQLite + JSON mais pas si le fichier DB est un artefact utilisateur.*
- JSON seulement ; fichier brut non supporté
- JSON canonique + .sqlite brut documenté comme backup rapide
- Les deux first-class dans l'UI
- **Reco:** JSON canonique ; documenter (et optionnellement download 1-clic) le .sqlite brut comme backup rapide même-version, en notant qu'il n'est pas garanti portable entre versions. **[moyen]**

**Q138. Au-delà de l'export dataset complet, voulez-vous un export sélectif/partiel (une roadmap, références seules, bibliothèque seule, un cheatsheet) ?**
*Contexte: le prototype n'exporte que le cheatsheet courant MD/PDF.*
- Dataset complet seulement (+ MD/PDF cheatsheet existant)
- Ajouter export JSON references-only et library-only
- Bundles auto-contenus par entité (roadmap/catégorie/cheatsheet)
- **Reco:** v1 : JSON dataset complet + MD/PDF cheatsheet existant seulement ; différer les exports par entité sauf besoin de partage inter-équipiers maintenant. **[moyen]**

**Q139. Une garantie de round-trip est-elle requise — export puis import REPLACE doit reproduire un état équivalent incl. ids et tout ordre/progression visible ?**
*Contexte: l'ordre est signifiant (selected[], phases/steps, groupement) ; les ids timestamp ne sont pas des identifiants stables user-facing.*
- Fidélité complète (ids + tout ordre) comme exigence dure
- Équivalence de contenu seulement (ordre peut normaliser)
- Fidélité pour le contenu, best-effort pour progression/ordre
- **Reco:** Exiger la fidélité round-trip complète pour REPLACE (ids + tout ordre user-visible préservé) et en faire un test d'acceptation. **[moyen]**

**Q140. Comment les exports MD/PDF du cheatsheet se rapportent-ils au backup JSON — features/boutons distincts, et un ré-import Markdown est-il jamais attendu ?**
*Contexte: la vue Cheatsheet a déjà Markdown/PDF/Copier-tout ; l'export JSON dataset est une préoccupation séparée.*
- Coexistent ; MD/PDF cheatsheet-only, JSON dataset-only, pas d'import MD
- Unifier tous les exports sous un menu
- Supporter aussi le ré-import Markdown
- **Reco:** Garder MD/PDF comme livrables cheatsheet-scopés export-only (pas d'import MD) ; mettre l'export/import JSON dataset dans une zone Data/Backup séparée. **[bas]**

**Q141. Le backup est-il manuel-seulement, ou l'app doit-elle prendre des snapshots locaux automatiques/périodiques avec rétention et historique de points de restore in-app ?**
*Contexte: rien dans prototype/spec sur les backups automatiques.*
- Manuel seulement (+ snapshot pré-restore)
- Manuel + snapshots auto périodiques avec rétention
- Historique complet de points de restore avec browse/restore in-app
- **Reco:** v1 : export/import manuel + snapshot pré-restore automatique ; optionnellement des snapshots périodiques légers avec rotation si un filet de sécurité est voulu. **[bas]**

**Q142. Quel format date/heure, fuseau et locale pour les timestamps d'export et toute date stockée/affichée ?**
*Contexte: l'inclusion de date d'export est recommandée mais aucun format figé ; la date du spec est FR (15.07.2026) ; l'UI est FR, les docs repo EN ; une enveloppe JSON portable a besoin d'une forme machine.*
- ISO 8601 UTC dans l'enveloppe JSON ; date FR dd.mm.yyyy (+ heure) en MD/PDF/UI
- ISO 8601 partout incl. sortie humaine
- Chaînes heure-locale seulement (non portable)
- **Reco:** Stocker/sérialiser en ISO 8601 UTC dans l'enveloppe JSON et les colonnes DB ; rendre les dates en locale FR à l'écran et en MD/PDF. **[bas]**

---

## Visuel, responsive & accessibilite

**Q143. Quelle stratégie responsive — layout desktop fixe fidèle, desktop-first avec dégradation, ou entièrement responsive tablette/mobile ?** (cf. D8)
*Contexte: le prototype est un layout desktop fixe (100vh, top bar 53px, sidebar 272px, preview 1280x840) sans media query sauf print.*
- Desktop-only, min-width + scroll horizontal en dessous
- Desktop-first, dégradation jusqu'à ~768px
- Entièrement responsive incl. mobile
- Port fixe fidèle, pas de responsive
- **Reco:** Desktop-first : shell fixe au-dessus du breakpoint avec dégradation gracieuse ; pas de refonte mobile en v1. **[haut]**

**Q144. Quelle largeur de viewport minimale supportée, et que se passe-t-il en dessous — scroll horizontal ou reflow ?**
*Contexte: sidebar 272px + cluster top-bar non-wrap débordent bien avant ~1000px.*
- min-width 1280px
- min-width 1024px
- min-width 768px
- Pas de minimum, tout reflow
- **Reco:** Min-width d'app dure ~1024px ; en dessous, scroll horizontal du shell plutôt que reflow du chrome, sauf si mobile est dans le scope. **[haut]**

**Q145. La sidebar 272px doit-elle être repliable/masquable, et est-ce persisté ?**
*Contexte: la sidebar est toujours visible sans toggle.*
- Pas de repli
- Toggle manuel, persisté
- Auto-repli sous un breakpoint seulement
- Manuel + auto
- **Reco:** Ajouter un toggle de repli dans le top bar, persister l'état, et auto-replier sous le breakpoint choisi ; confirmer que c'est voulu en v1. **[moyen]**

**Q146. Comment le top bar se comporte-t-il quand l'espace horizontal est insuffisant (brand, 4 onglets FR longs, search 280px, bouton add, toggle theme) ?**
*Contexte: le bar est une flex-row sans wrap ; rien ne rétrécit.*
- Wrap sur une 2e ligne
- Condenser les onglets en icônes + search extensible
- Rétrécir la search d'abord, puis masquer les labels
- Fixe, s'appuyer sur min-width + scroll horizontal
- **Reco:** Priorité de collapse : rétrécir/ancrer la search, puis condenser les labels d'onglet en icônes, garder add + theme ; ne pas wrapper le bar. **[moyen]**

**Q147. Sur écrans ultra-larges, les grilles Bibliothèque/References doivent-elles être plafonnées à une largeur de lecture max comme Méthodologie/Cheatsheet ?**
*Contexte: Méthodologie (820px) et Cheatsheet (840px) plafonnés ; Library et References remplissent le pane.*
- Laisser non plafonné (densité d'abord)
- Plafonner toutes les vues
- Plafonner References seulement
- **Reco:** Laisser Library/References non plafonné pour la densité, mais confirmer plutôt que supposer. **[bas]**

**Q148. Quel niveau de conformité accessibilité viser en v1 (aucun/best-effort, WCAG A, AA, ou AA pour clavier+contraste avec SR best-effort) ?**
*Contexte: le prototype a zéro ARIA, contrôles custom, outlines de focus retirés, DnD souris-seulement.*
- Pas de cible formelle
- WCAG 2.1 A
- WCAG 2.1 AA
- AA pour clavier+contraste, SR best-effort
- **Reco:** Viser WCAG 2.1 AA pour l'opérabilité clavier, le contraste et la visibilité de focus ; parité lecteur d'écran complète en best-effort vu le contexte mono-utilisateur desktop. **[haut]**

**Q149. Quel système d'indicateur de focus visible pour les utilisateurs clavier ?**
*Contexte: input:focus/textarea:focus{outline:none} et les boutons n'ont pas de style focus.*
- Anneau :focus-visible accent (outline/box-shadow 2px)
- Border-color + inset shadow
- Outline navigateur par défaut
- Pas d'indicateur
- **Reco:** Définir un anneau :focus-visible cohérent avec --acc sur tous les éléments interactifs incl. boutons. **[haut]**

**Q150. Quelles sémantiques ARIA les contrôles custom (non natifs) doivent-ils exposer (groupe d'onglets, toggles de step style checkbox, boutons icône, inputs search/var non labellisés) ?**
*Contexte: boutons stylés faisant office d'onglets (pas de tablist), checkboxes step (pas de role), actions icône (pas d'aria-label).*
- Mapping ARIA complet pour tous les contrôles custom
- Labels sur boutons icône + roles tab/checkbox seulement
- aria-label sur boutons icône seulement
- Pas d'ARIA
- **Reco:** Mapper onglets→tablist/tab/aria-selected, toggles step→role=checkbox/aria-checked, boutons icône→aria-label, search→label visuellement caché ; profondeur selon la cible WCAG. **[haut]**

**Q151. Quel comportement d'accessibilité et de fermeture les modals Add-command / Add-reference doivent-ils implémenter, et le toast doit-il être une live region ?**
*Contexte: les modals ne ferment que par overlay/✕ — pas de role=dialog, focus trap, Escape, focus initial ; le toast n'a pas d'aria-live.*
- A11y modal complète + toast live region
- Escape + focus management seulement
- Attributs role/aria seulement
- Laisser tel quel
- **Reco:** Ajouter role=dialog + aria-modal, focus trap, Escape pour fermer, focus premier champ à l'ouverture et restauration à la fermeture ; wrapper le toast en aria-live=polite. **[haut]**

**Q152. Le theme clair a-t-il besoin d'une remédiation de contraste, en particulier pour le texte --faint ?**
*Contexte: --faint #8b909c sur blanc ≈2.9:1 (sous AA 4.5:1) mais utilisé partout pour compteurs, labels, placeholders, domaines.*
- Assombrir --faint à AA et re-vérifier les tokens clairs
- AA seulement pour texte ≥14px, garder faint pour le décoratif
- Garder les valeurs prototype
- **Reco:** Assombrir --faint en theme clair à ≥4.5:1 (ou ≥3:1 si large/non-essentiel) et re-vérifier accent-sur-blanc. **[haut]**

**Q153. Les tailles de police doivent-elles utiliser des unités relatives (rem) pour respecter le zoom/scaling OS, ou rester en px fixe pour la fidélité ?**
*Contexte: toutes les tailles en px fixe, beaucoup très petites ; px ne scale pas avec la préférence font-size.*
- rem partout (root 16px)
- rem pour le texte, px pour bordures/hairlines
- Garder px (fidélité d'abord)
- **Reco:** Porter les tailles en rem sur un root 16px pour que le zoom/scaling fonctionne, en gardant le même rendu au zoom par défaut. **[moyen]**

**Q154. Y a-t-il un plancher de taille de police lisible, vu que plusieurs labels rendent à 10-10.5px ?**
*Contexte: compteurs de tags et headers descendent à 10-11px.*
- Imposer 12px minimum
- 11px minimum
- Pas de plancher, garder les tailles prototype
- **Reco:** Garder les petites tailles du prototype (la densité est une valeur affirmée) mais assurer le zoom ; ne pas descendre sous 10px en dur. **[bas]**

**Q155. L'app doit-elle honorer prefers-reduced-motion ?**
*Contexte: mouvement limité (drag opacity, progress-bar width) sans gestion reduced-motion.*
- Honorer prefers-reduced-motion
- Ignorer
- **Reco:** Ajouter un bloc prefers-reduced-motion: reduce désactivant les transitions non-essentielles. **[bas]**

**Q156. Le theme initial suit-il l'OS prefers-color-scheme, ou démarre-t-il toujours en sombre ?**
*Contexte: theme initial hardcodé sombre ; seul un toggle manuel existe ; spec §02 traite sombre & clair en first-class.*
- Toujours sombre
- Suivre prefers-color-scheme au 1er lancement, puis persister
- Toujours clair
- Persister le dernier utilisé, défaut sombre
- **Reco:** Suivre prefers-color-scheme au premier lancement (fallback sombre) ; après un toggle utilisateur, persister et respecter le choix explicite. **[moyen]**

**Q157. La couleur d'accent est-elle configurable au runtime, ou fixée à #3ddc97 ?**
*Contexte: DCLogic expose accent en prop design-time (défaut #3ddc97) sans UI ; le contexte figé fixe l'accent.*
- Fixe #3ddc97 (pas d'UI)
- Palette de presets
- Color picker libre
- Picker libre avec clamping de contraste
- **Reco:** Garder l'accent fixe à #3ddc97 en v1 (correspond au contexte figé) ; pas de picker sauf demande explicite. **[haut]**

**Q158. La densité (comfortable/compact) est-elle un réglage runtime user-facing, et quel défaut ? Doit-elle affecter plus que le padding des cartes ?**
*Contexte: density = prop design-time défaut 'compact' mappée seulement à --pad, appliquée seulement aux cartes.*
- Compact fixe
- Comfortable fixe
- Toggle utilisateur, défaut compact (padding seulement)
- Toggle + échelle élargie (gaps/hauteurs/polices)
- **Reco:** Livrer 'compact' fixe par défaut en v1 ; exposer un toggle densité seulement si une surface de settings est construite, et limiter sa portée au padding sauf échelle définie convenue. **[haut]**

**Q159. La vue par défaut/landing est-elle un réglage configurable, et où vivrait une UI de settings (il n'y en a aucune) ?**
*Contexte: defaultView = prop design-time défaut 'library' ; pas d'écran de settings.*
- Fixe à Library
- Vue par défaut configurable / restaurer la dernière vue
- Ajouter un popover gear dans le top bar
- Modal settings dédiée / 5e onglet
- **Reco:** Hardcoder Library comme landing en v1 ; si des settings deviennent nécessaires, ajouter un popover gear léger dans le top bar plutôt qu'un onglet. **[moyen]**

**Q160. Quels navigateurs et versions minimales supporter, vu la dépendance à color-mix, backdrop-filter, Clipboard API et DnD HTML5 ?**
*Contexte: color-mix (~2023+) ; Kali livre souvent Firefox ESR ; les vieux ESR précèdent color-mix.*
- Chromium & Firefox derniers seulement
- Chromium courant + Firefox ESR ≥115
- Support large avec polyfills/fallbacks
- **Reco:** Viser Chromium courant et Firefox incl. ESR ≥115 ; s'appuyer sur color-mix et Clipboard API sans polyfills ; pas de legacy/IE. **[moyen]**

**Q161. Un style de scrollbar custom est-il attendu dans les navigateurs non-WebKit (Firefox) ?**
*Contexte: scrollbars thémées seulement via ::-webkit-scrollbar ; Firefox a les scrollbars OS par défaut.*
- Ajouter scrollbar-width/scrollbar-color Firefox
- WebKit-only
- Pas de scrollbars custom
- **Reco:** Ajouter les équivalents Firefox scrollbar-width: thin; scrollbar-color à côté des règles WebKit. **[bas]**

**Q162. La marque emoji / favicon doit-elle rester emoji, ou être remplacée par un logo vectoriel ?**
*Contexte: l'icône est un emoji littéral ; les emoji rendent différemment par OS et rasterisent mal en favicon.*
- Garder l'emoji partout
- Emoji in-app mais set de favicon vectoriel
- Logo SVG monochrome custom
- **Reco:** Garder l'emoji comme marque ludique mais livrer un set favicon SVG/PNG auto-contenu pour des icônes d'onglet cohérentes. **[bas]**

**Q163. L'UI est-elle FR-only avec strings hardcodés, ou faut-il scaffolder une couche i18n, et le contenu dataset (libellés catégorie EN/mixte) est-il traité comme donnée et non UI ?**
*Contexte: UI figée en FR ; libellés catégorie EN alors que chrome/seed sont FR.*
- Hardcoder les strings FR, pas d'i18n ; le contenu reste tel qu'écrit
- Framework i18n avec FR seule locale
- UI bilingue FR/EN
- **Reco:** Hardcoder les strings UI FR (pas de librairie i18n) ; traiter le contenu catégorie/command comme donnée utilisateur, pas comme UI localisable. **[moyen]**

**Q164. Quelle portée de raccourcis clavier est requise — et Esc doit-il fermer les modals (actuellement seulement backdrop/✕) ?**
*Contexte: aucun raccourci ; modals sans Esc/focus trap ; pas de hotkey search ; changement d'onglet souris-seulement.*
- Pas de raccourcis
- Minimal : Esc ferme les modals, '/' ou Ctrl+K focus search, 1-4 changent d'onglet
- Navigation vim-style étendue
- **Reco:** Jeu minimal : Esc ferme les modals (avec focus trap), '/' focus la search, touches 1-4 changent d'onglet. **[moyen]**

**Q165. La vue active (et optionnellement roadmap/cheatsheet actif / filtres) doit-elle se refléter dans l'URL via routing client, pour que Back/forward et un refresh (F5) se comportent sensément ?**
*Contexte: `view` est pur état React ; pas d'History API ni de router ; un refresh perd l'onglet, Back sort de l'app.*
- Pas de routing ; refresh reset à la landing, Back sort (prototype)
- Routing hash/path pour les 4 onglets seulement (Back/forward/refresh préservent l'onglet)
- Routing onglet + sous-état (roadmap/cheatsheet actif, filtres) pour deep-links
- **Reco:** Ajouter un routing hash ou path léger pour les quatre onglets (et l'id roadmap/cheatsheet actif) pour que Back/forward et refresh préservent la position ; garder les filtres/search hors de l'URL. Confirmer la profondeur. **[moyen]**

**Q166. Enter doit-il soumettre les inputs d'ajout inline (nouvelle roadmap, phase, step, tag) et les modals Add-command/Add-reference, et chaque input/modal ouvert doit-il autofocus ?**
*Contexte: chaque input ne câble que onInput ; pas de onKeyDown/onSubmit ni de <form> ; créer requiert un clic.*
- Enter soumet les inputs single-line et modals ; textarea garde le newline (Ctrl/Cmd+Enter soumet)
- Enter soumet partout sauf la textarea template
- Pas de soumission Enter (clic-seulement, prototype)
- **Reco:** Envelopper les flux d'ajout dans de vrais forms pour qu'Enter soumette les inputs single-line ; dans la textarea template, Enter insère un newline et Ctrl/Cmd+Enter soumet ; autofocus le premier champ à l'ouverture. **[moyen]**

**Q167. Que doit afficher la sidebar gauche sur les vues Méthodologie et Cheatsheet, vu que ses contrôles Catégories/Tags n'ont de sens qu'en Bibliothèque et yankent l'utilisateur ailleurs ?**
*Contexte: la sidebar est rendue inconditionnellement ; cliquer une catégorie/tag en Méthodologie/Cheatsheet appelle setState({view:'library'}), sortant de l'onglet.*
- Montrer seulement le panneau Variables en Méthodologie & Cheatsheet (masquer Catégories/Tags)
- Garder la sidebar complète mais rendre Catégories/Tags no-op/désactivés hors-Library
- Garder tel quel (cliquer navigue vers Library)
- **Reco:** En Méthodologie et Cheatsheet, rendre seulement le panneau Variables ; réserver Catégories/Tags (et leur effet de navigation) à la vue Bibliothèque. **[moyen]**

---

## Securite & OPSEC

**Q168. Sur quelle interface réseau le serveur Go/Gin doit-il binder par défaut — loopback seulement, ou adresse LAN configurable ?** (cf. D7)
*Contexte: spec §01 exclut les comptes, mais le stack introduit un vrai serveur HTTP détenant target IP 10.10.10.5, LHOST, USER/PASS/DOMAIN.*
- 127.0.0.1 seulement, hardcodé
- Loopback par défaut, configurable via flag/env (risque documenté)
- 0.0.0.0 pour LAN
- **Reco:** Loopback (127.0.0.1) seulement par défaut ; autoriser un override --bind pour LAN avancé, documenté comme risque OPSEC et opt-in explicite. **[bloquant]**

**Q169. La DB SQLite doit-elle être chiffrée au repos, et comment ?**
*Contexte: la DB tient IPs cibles, usernames, domaines, $PASS en clair et notes contenant souvent des creds/hashes.*
- Pas de chiffrement app-level ; documenter la dépendance au FDE
- SQLCipher sur toute la DB déverrouillée par passphrase au lancement
- Chiffrement field-level pour vars/notes seulement
- Clé depuis keyring OS, pas de passphrase interactive
- **Reco:** SQLCipher sur toute la DB gardé par passphrase au lancement, FDE documenté comme baseline assumée ; chiffrement par défaut avec flag opt-out explicite. **[bloquant]**

**Q170. Même en loopback, l'API REST locale doit-elle requérir une authentification (token par lancement), ou s'appuyer sur l'isolation process/user OS ?**
*Contexte: comptes hors scope, mais l'API lit/mute/exporte une DB de secrets clients ; sur un jump-box partagé tout process local peut atteindre le port loopback.*
- Pas d'auth (loopback + permissions fichier)
- Token bearer généré au démarrage injecté dans le SPA servi, requis sur tous les appels
- Token dans un fichier config 0600
- Auto-requérir un token seulement sur binds non-loopback
- **Reco:** Générer un token par lancement, l'injecter dans le SPA embarqué au moment du serve, et le requérir sur tous les appels API (bloque aussi l'accès navigateur d'autres origines) ; au minimum auto-requérir un token dès bind non-loopback. **[haut]**

**Q171. Comment l'API se défend-elle contre CSRF / DNS-rebinding depuis d'autres origines navigateur frappant le serveur localhost ?**
*Contexte: une API loopback no-auth avec endpoints mutants est atteignable par CSRF/DNS-rebinding.*
- Valider Host/Origin contre une allowlist et rejeter les mismatches
- Requérir un header custom que les simple requests cross-origin ne peuvent forger
- Cookies SameSite + token CSRF
- Validation Host + header/token custom requis
- **Reco:** Imposer une allowlist Host/Origin + un header custom requis (ou le token de lancement), rejetant tout le reste sur les requêtes mutantes. **[haut]**

**Q172. Le serveur local tourne-t-il en HTTP simple ou HTTPS — et la copie presse-papiers doit-elle fonctionner hors-localhost ?**
*Contexte: navigator.clipboard requiert un contexte sécurisé ; marche sur http://localhost mais échoue silencieusement sur http://<LAN-IP>.*
- HTTP sur loopback seulement (clipboard marche)
- TLS auto-signé pour garder le contexte sécurisé sur LAN
- HTTP partout + fallback execCommand
- **Reco:** HTTP sur loopback (clipboard marche d'emblée) ; si bind LAN activé, livrer un TLS auto-signé et documenter la confiance. **[haut]**

**Q173. Quelle Content-Security-Policy le serveur Go doit-il envoyer pour le SPA embarqué ?**
*Contexte: le port fidèle s'appuie beaucoup sur les inline styles ; servi via go:embed ; pas de CSP dans le prototype ; les fonts CDN forceraient à whitelister Google.*
- Self-only strict : default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; pas de hosts externes
- Idem mais whitelister Google Fonts (si CDN gardé)
- Pas de CSP
- **Reco:** CSP self-only strict avec style-src 'unsafe-inline' (requis par le port inline-style), connect-src 'self' seulement et aucun host externe — ce qui force aussi les fonts self-hosted. **[haut]**

**Q174. Les fonts IBM Plex doivent-elles être self-hosted/embarquées (go:embed) plutôt que chargées depuis Google Fonts, et self-hosted pour l'impression aussi ?**
*Contexte: le prototype charge IBM Plex Sans/Mono depuis le CDN Google ; le contexte figé est mono-binaire same-origin sans appels externes.*
- Self-host/embed IBM Plex woff2 via go:embed (zéro requête externe) + fallback système
- Garder le CDN Google
- Fonts système seulement
- **Reco:** Self-host et embarquer IBM Plex (poids nécessaires seulement) via go:embed avec font-display:swap et les fallbacks système ; zéro requête font externe, impression incluse. **[haut]**

**Q175. Le spec doit-il mandater zéro appel réseau sortant (pas de télémétrie, analytics, crash reporting, update pings, CDN) ?**
*Contexte: les seuls appels sortants du prototype sont les fonts ; les liens de référence externes sont user-initiés.*
- Strictement zéro egress non-user-initié
- Update check opt-in seulement
- Analytics local-only anonyme
- **Reco:** Verrouiller une exigence dure no-telemetry/no-phone-home imposée en revue de build ; le seul egress permis est un clic utilisateur sur un lien de référence. **[haut]**

**Q176. $PASS (et toute variable secret-typée) doit-elle être masquée dans l'UI avec toggle de reveal, un flag 'sensitive' par variable, et un mode redact global ?**
*Contexte: le panneau rend chaque var incl. PASS en input clair (seed PASS='password') ; les commandes résolues montrent les mots de passe en clair partout.*
- Masquer $PASS seulement avec toggle reveal
- Flag 'sensitive' par variable (PASS sensible par défaut) + masquage + reveal
- + mode redact global pour le screen-sharing
- Pas de masquage
- **Reco:** Ajouter un flag 'sensitive' par variable (PASS sensible par défaut) avec input masqué + click-to-reveal, et un mode redact global pour les démos. **[haut]**

**Q177. Les VALEURS de variables (incl. sensibles) sont-elles persistées en SQLite en clair entre sessions et incluses dans l'export JSON dataset, et existe-t-il une action 'clear all values / wipe' ?**
*Contexte: prototype garde les valeurs en mémoire seulement ; le contexte figé ajoute SQLite + export JSON, avec livraison via gitea.*
- Persister tout incl. sensible ; tout inclure dans l'export
- Persister mais exclure le sensible de l'export par défaut (opt-in)
- Persister définitions seulement ; valeurs éphémères, jamais exportées
- Persister tout + wipe 1-clic + chiffrement at-rest
- **Reco:** Persister définitions et valeurs localement (outil mono-utilisateur utilisable) mais exclure les valeurs sensibles de l'export par défaut (opt-in seulement), s'appuyer sur le chiffrement at-rest, et fournir un « effacer les variables » proéminent pour le handoff ; livrer des valeurs vides (pas de PASS par défaut). **[haut]**

**Q178. Quelle politique de logging pour Gin et GORM, vu que requêtes et queries peuvent porter des secrets ?**
*Contexte: le logger Gin par défaut et GORM Info peuvent émettre des détails de requête et du SQL avec paramètres liés incl. $PASS/IPs/notes.*
- Release : GORM Silent + Gin access log minimal (method/path/status, sans bodies/params/query)
- Info-level avec redaction de champs
- Logging Gin/GORM par défaut
- **Reco:** Build release : GORM Silent, Gin access log minimal sans bodies/params/query, et interdiction documentée de logger le contenu variable/command/note. **[haut]**

**Q179. Quels headers HTTP de sécurité additionnels le serveur doit-il poser (anti-clickjacking, MIME sniffing, permissions, referrer) ?**
*Contexte: serveur Gin same-origin sans politique de headers ; l'UI peut être framée et les réponses MIME-sniffées.*
- frame-ancestors 'none' + nosniff + Referrer-Policy: no-referrer + Permissions-Policy restrictive
- Seulement frame-ancestors + nosniff
- Aucun
- **Reco:** Poser frame-ancestors 'none', X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, et une Permissions-Policy désactivant geolocation/camera/microphone/etc. **[moyen]**

**Q180. Le design doit-il interdire de mettre des données sensibles (termes de recherche, vars) dans les query strings d'URL, en gardant le filtrage côté client ?**
*Contexte: le filtrage est côté client dans le prototype ; un GET serveur avec noms cibles/secrets fuirait dans les logs et l'historique.*
- Garder le filtrage côté client
- Recherche côté serveur via POST body, jamais GET query
- GET serveur avec logging query-string supprimé
- **Reco:** Garder le filtrage côté client comme le prototype ; si une query serveur est ajoutée, utiliser des POST bodies et jamais placer de termes sensibles dans les URLs. **[moyen]**

**Q181. Les inputs de variables secrètes doivent-ils désactiver l'autofill navigateur / la capture password-manager ?**
*Contexte: le champ 'tool' pose autocomplete=off mais pas les inputs de variables (incl. PASS).*
- Poser autocomplete=off / new-password + data-1p-ignore sur les inputs secrets
- Laisser les défauts
- **Reco:** Désactiver l'autofill/capture manager sur tous les inputs de variables, surtout ceux flaggés secret. **[bas]**

**Q182. Copier une commande résolue contenant un secret doit-il avoir un traitement spécial (timeout d'auto-clear, avertissement, opt-out) ?**
*Contexte: copyText copie le template résolu, pouvant inclure $PASS en clair ; les presse-papiers système sont lus par les managers/sync.*
- Auto-clear optionnel après N secondes
- Avertir/indiquer quand le contenu copié contenait un secret
- Pas de traitement spécial
- **Reco:** Offrir un auto-clear presse-papiers optionnel (off par défaut) et un indicateur subtil quand le texte copié contenait un secret. **[moyen]**

**Q183. Le repo/build doit-il livrer un .gitignore excluant la DB SQLite et les exports, et un README avertissant contre le commit de données client ?**
*Contexte: livraison via gitea ; le .gitignore baseline couvre .env/binaires mais pas *.sqlite ni les artefacts d'export.*
- Ajouter *.db/*.sqlite*/exports/ au .gitignore + note OPSEC README
- Stocker DB/exports hors du repo par défaut
- Les deux
- **Reco:** Stocker la DB et les exports hors du repo par défaut ET ajouter des patterns .gitignore explicites plus un avertissement README. **[moyen]**

**Q184. Si le chiffrement par passphrase est adopté, l'app doit-elle se verrouiller (re-prompt) après inactivité ou sur demande ?**
*Contexte: une app déverrouillée laissée tournante sur un host d'engagement expose tout le dataset déchiffré.*
- Action 'lock' manuelle seulement
- Lock manuel + auto-lock d'inactivité configurable
- Pas de lock (déverrouiller une fois par lancement)
- **Reco:** Si passphrase choisie, fournir un lock manuel + un auto-lock d'inactivité optionnel ; sinon N/A. **[bas]**

**Q185. Une capacité 'wipe all data' / panic-reset est-elle nécessaire au-delà de la suppression manuelle de la DB ?**
*Contexte: l'app stocke creds et données cibles ; tout effacer requiert sinon de supprimer le fichier.*
- Suppression manuelle du fichier DB (documentée)
- 'wipe all data' in-app avec confirmation
- Chiffrement + wipe par destruction de clé
- **Reco:** S'appuyer sur la suppression documentée du fichier DB en v1 ; traiter une action reset-all in-app comme stretch goal. **[bas]**

**Q186. Si le chiffrement SQLCipher par passphrase est adopté, quels comportements pour perte de passphrase, changement de passphrase, et tentatives erronées ?**
*Contexte: la passphrase de lancement est établie mais pas son cycle de vie : une perte = perte de données irrécupérable ; pas de flux de rekey ; pas de politique sur les tentatives erronées.*
- Pas de recovery (documenté), ajouter une action rekey + tentatives locales illimitées avec avertissement
- Pas de recovery, ajouter rekey, ajouter throttling/lockout
- Pas de rekey (export/re-import pour changer de passphrase)
- **Reco:** Si chiffrement choisi : documenter qu'une passphrase perdue est irrécupérable by design, fournir un change-passphrase (rekey) in-app, autoriser des tentatives locales illimitées (le throttling n'apporte peu contre une DB offline) avec avertissement clair, et optionnellement afficher une jauge de force. **[bas]**

---

## Perimetre produit, NFR & deploiement

**Q187. Cheat est-il un dataset unique partagé, ou doit-il supporter plusieurs datasets/workspaces isolés (un par engagement), et un contrôle secure-wipe / ségrégation est-il dans le scope ?**
*Contexte: spec §01 exclut cloud sync et comptes mais ne dit rien sur plusieurs datasets locaux ; le prototype a un état global.*
- Dataset global unique (une DB)
- Chemin DB configurable par lancement (ségréguer par répertoire/flag), pas d'UI in-app
- Workspaces nommés in-app avec switcher
- Vaults par engagement + secure wipe
- **Reco:** Fichier DB unique avec chemin configurable (flag/env) pour que chaque engagement ait son répertoire ; pas d'UI multi-workspace in-app en v1 ; confirmer si un switcher est voulu. **[haut]**

**Q188. Le binaire livré doit-il être pré-seedé avec le dataset OSCP d'exemple, et les six variables livrées vides (pas de PASS placeholder) ?**
*Contexte: le prototype livre 24-27 commands, 4 roadmaps, 6 références et des vars par défaut incl. PASS='password', USER='admin', DOMAIN='corp.local', IP='10.10.10.5'.*
- Livrer le seed complet mais variables vides
- Livrer complètement vide
- Livrer un seed JSON importable avec DB vide
- Livrer tel quel avec secret placeholder
- **Reco:** Livrer le seed OSCP curé (commands/roadmaps/références) avec les six variables vides par défaut. **[moyen]**

**Q189. Quelles cibles de taille dataset et de performance viser, et pagination/virtualisation/débounce de recherche sont-ils requis ?**
*Contexte: filtrage côté client par substring sur toute la liste avec re-render à chaque frappe ; dataset prototype ~27 commands.*
- Petit ≤500, tout côté client
- Jusqu'à ~2000, côté client + search débouncée, sans virtualisation
- Grand : recherche serveur + pagination
- **Reco:** Concevoir pour ~2000 commands avec filtrage côté client, search débouncée ~150ms, latence <100ms ; pas de pagination/virtualisation en v1. **[bas]**

**Q190. Quelles cibles OS/architecture le mono-binaire doit-il builder, et CGO vs driver SQLite pure-Go ?**
*Contexte: stack figé = mono-binaire Go ; env utilisateur Linux avec cross-compilation Windows ; GORM+SQLite requiert souvent CGO.*
- linux/amd64 seulement
- linux/amd64 + arm64
- + windows/amd64
- + darwin arm64/amd64
- **Reco:** linux/amd64 primaire (plus arm64), windows/amd64 secondaire ; choisir un driver SQLite pure-Go pour simplifier la cross-compilation. **[moyen]**

**Q191. Comment le serveur démarre-t-il et l'UI s'ouvre-t-elle — binaire foreground imprimant l'URL, auto-open navigateur, ou service background ?**
*Contexte: l'UX de lancement/premier-open est non spécifiée.*
- Foreground, imprimer l'URL localhost
- Auto-open le navigateur par défaut
- Installer en service systemd
- **Reco:** Binaire foreground imprimant son URL localhost, avec un flag --open optionnel ; pas de service/auto-start. **[bas]**

**Q192. L'installabilité PWA / un service worker est-il requis, ou un SPA servi simplement suffit-il ?**
*Contexte: le SPA étant servi par un binaire local, l'offline est largement couvert une fois les fonts embarquées.*
- SPA servi simple, pas de PWA
- Manifest pour installabilité seulement
- PWA complète avec cache service-worker
- **Reco:** SPA servi simple, pas de service worker (le serveur est déjà local) ; un manifest optionnel peut venir plus tard. **[bas]**

**Q193. Quelle licence le dépôt porte-t-il — privé/propriétaire ou open-source ?**
*Contexte: livraison via gitea mais aucune licence indiquée ; l'outil embarque une base de connaissances OSCP curée.*
- Privé/propriétaire, pas de licence OSS
- MIT/Apache-2.0
- GPL
- **Reco:** Repo privé sans licence OSS sauf intention de publier ; si publié, MIT. **[bas]**

**Q194. Comment les nouvelles versions sont-elles distribuées, et un mécanisme d'auto-update/check est-il voulu (attendu : aucun) ?**
*Contexte: livraison gitea push/PR ; l'OPSEC interdit le phone-home ; l'identité de version est indéfinie.*
- Releases gitea manuelles + string de version embarquée, pas d'auto-update
- Update check in-app
- Distribution par package-manager
- **Reco:** Releases gitea manuelles avec string de version embarquée ; pas d'auto-update ni de requête update-check. **[bas]**

**Q195. Sur quel port TCP le serveur écoute-t-il par défaut, est-il configurable, et que se passe-t-il si le port est déjà utilisé ?**
*Contexte: la section Sécurité fige l'interface de bind mais aucun ne traite le numéro de port ; un pentester lance souvent plusieurs services locaux.*
- Port fixe (ex. 8787), échouer bruyamment si pris
- Défaut fixe surchargeable via --port/CHEAT_PORT, échouer si pris
- Défaut configurable, auto-sélectionner le prochain port libre et imprimer l'URL
- Port éphémère (0) choisi par l'OS à chaque lancement, imprimer l'URL + --open optionnel
- **Reco:** Port par défaut fixe peu commun surchargeable via --port/CHEAT_PORT ; sur clash, échouer avec message clair (ou auto-incrément derrière un flag) ; imprimer l'URL localhost finale au démarrage. **[moyen]**

**Q196. Quel modèle de notification/confirmation, vu que le seul mécanisme actuel est un toast mono-slot non-interactif auto-dismiss en 1.7s ?**
*Contexte: flash() pose une string toast sur un timeout 1700ms partagé — un nouveau message remplace l'ancien, non dismissible, sans actions ; or plusieurs features recommandées ont besoin de plus (undo-toasts, résumés d'import, erreurs de save, confirmations destructives).*
- Garder le toast transitoire pour les succès ; ajouter toasts actionnables (undo), banner d'erreur persistant, confirms modaux pour actions destructives
- Composant toast unique plus riche avec actions + dismiss manuel pour tout
- Garder le toast fire-and-forget du prototype seulement
- **Reco:** Définir un modèle par paliers : toast transitoire pour succès, toasts actionnables/undo pour deletes réversibles, banner inline persistant pour erreurs save/import, confirms modaux pour actions destructives — un contrat partagé par toutes les features dépendantes du messaging. **[moyen]**

---

## Comment repondre

Répondez simplement par : **« défauts sauf Qx: ..., Qy: ... »** pour accepter toutes les recommandations (Reco) sauf les questions listées, en précisant votre choix (option ou texte libre) pour chacune. Les décisions bloquantes D1-D8 renvoient aux questions détaillées correspondantes ; répondre à la question détaillée suffit. Vous pouvez aussi trancher uniquement les [bloquant] et [haut] d'abord si vous préférez itérer.
