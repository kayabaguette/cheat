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

## Un test peut passer pour une autre raison que le mécanisme qu'il nomme (v0.12–0.13)

Deux releases de suite, un test censé garder un mécanisme précis s'est révélé
incapable d'échouer quand on supprimait ce mécanisme :

- **0.12.0** — le test du découpage `ssl/http` passait avec `serviceTokens`
  neutralisé, parce qu'un *fallback par sous-chaîne* rattrapait le cas. Il ne
  testait donc pas le découpage. En creusant, le fallback lui-même était trop
  large : il s'appliquait aussi aux labels que le catalogue connaissait, ce qui
  faisait correspondre « HTTP » sur un hôte purement `https`. Un mauvais test
  cachait un défaut de conception.
- **0.13.0** — le test « la clé de groupe distingue les deux listes » comparait
  une étape OU-seule à une étape ET-seule. Elles diffèrent **aussi** sur la moitié
  OU, donc le test passait avec la moitié ET retirée de la clé. Le cas
  discriminant est deux étapes de **même** liste OU et de listes ET différentes.

**Le motif est le même** : l'assertion est vraie, mais pour une raison
collatérale. Deux cas se ressemblent sur *plusieurs* axes, on croit tester l'axe
qu'on nomme, on teste en fait un autre.

**Ce qui l'attrape** : ne pas se contenter de « le test est vert ». Supprimer le
mécanisme, une ligne à la fois, et vérifier **quel** test rougit. Si aucun ne
rougit, le garde-fou n'existe pas. Si c'est un autre que celui qu'on visait, la
couverture n'est pas là où on la croit.

**Ce qui l'évite à l'écriture** : construire les deux cas d'un test de
discrimination en ne faisant varier **qu'une** chose. Deux étapes de même liste
OU et de listes ET différentes ; pas une étape OU contre une étape ET.
