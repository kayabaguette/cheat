# Leçons

Notes courtes, tirées d'un problème réellement rencontré. Une leçon par section,
avec ce qui a mordu et ce qu'il faut faire à la place.

## Un port occupé : on tue le conteneur, on ne contourne pas (v0.10.0)

Un conteneur `cheat` tournait depuis 7 semaines sur `:8787`. Au `make dev`, le
conteneur `cheat-api` n'a donc pas pu binder :

```
Error: rootlessport listen tcp 0.0.0.0:8787: bind: address already in use
```

…mais **`make dev` n'échoue pas pour autant** : la cible lance les deux conteneurs
en parallèle avec `&` puis `wait`, donc Vite démarre normalement et annonce
« ready ». Deux conséquences vicieuses :

1. `GET /api/profiles` renvoie 500 à travers le proxy Vite, et la SPA **retombe sur
   le seed** (27 commandes). Une app qui affiche 27 commandes au lieu de 380
   ressemble *exactement* à une app qui marche — rien à l'écran ne dit « seed ».
2. Tout `curl http://localhost:8787/api/...` atteint le conteneur déjà là, pas le
   dev qu'on croit piloter.

**À faire : `make down`.** Ce dépôt est un environnement de **dév** ; un conteneur
qui traîne sur le port se tue, il ne se contourne pas. Le lancer ailleurs
(`make dev CHEAT_PORT=8799`) marche mais laisse deux instances et une ambiguïté sur
laquelle on teste — c'est justement ce qui fait perdre du temps. `make down` est
sans risque : les données vivent dans le volume `cheat-data`, pas dans le conteneur.

**Et à la fin des tests, on tue les conteneurs de test** (`make down`, ou
`podman rm -f cheat-web cheat-api`). Ne rien laisser tourner.

**Piste d'amélioration non faite** : `make dev` pourrait échouer vite si le port est
occupé, et la SPA pourrait signaler visuellement qu'elle affiche le seed faute d'API.

## Mesurer avant de relâcher un invariant (v0.10.0)

Supprimer l'exigence de déclaration des variables locales (0.9.0) revenait à
relâcher le garde-fou qui protégeait le texte shell. Avant d'écrire une ligne de
code, comptage des tokens minuscules et mixtes sur les **380 commandes du dataset
réel et les 27 du seed** : **zéro** des deux. C'est cette mesure — et non une
intuition — qui a rendu le compromis défendable, et elle a directement dicté la
liste de noms bannis (seuls `$env:`, les préfixes de portée PowerShell et les
variables de boucle mono-caractère avaient besoin d'être couverts).

## Un garde-fou ne vaut que ce que son échec prouve (v0.9.2, confirmé v0.10.0)

Pratique reprise de 0.9.2 : chaque nouvelle règle de bannissement a été retirée
**une par une** pour vérifier que la suite passe au rouge — règle mono-caractère
4 tests, garde `:` 2 tests, liste réservée 2 tests. Un test qui ne peut pas échouer
ne protège rien ; le vérifier coûte trois minutes.
