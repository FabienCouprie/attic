# Plan : les seize identifiants de fiche que le cœur nomme encore

Écrit le 2026-11-20, à faire relire par Fabien. **Aucune ligne de code n'a été modifiée.** Ce
fichier est dans `work/`, que git ignore (`.gitignore:90`) : il est ajouté de force, à la demande de
Fabien, pour être relu dans une PR. Il est le seul fichier de cette PR.

Base relue : `master` à `00bb68bc` (PR #408 fusionnée), et la branche de la PR #409
(`travaux/garde-identifiants-du-coeur`), **encore ouverte** au moment de l'écrire. Le garde
`src/docs/frontiere-identifiants.test.ts` n'est donc pas encore sur `master`.

Le contrat de départ : le cœur ne nomme rien du domaine. Le garde de la PR #409 épingle seize
chaînes qui le contredisent, en quatre fichiers. Pour chacun, ce plan relève les lecteurs, pèse les
sorties et découpe le travail en pièces, chacune avec ses épreuves. Les décisions qui reviennent à
Fabien sont au §4, une par une.

---

## 0. Relevé fait avant d'écrire, et ce qu'il change au plan

### 0.1 Les deux épreuves demandées ne traversent aujourd'hui aucun des quatre mécanismes

La base du son (`npm run test:empreintes-exemples`) et le journal de passe
(`npm run test:journal-de-passe`) jouent les mêmes **seize exemples**, ceux que liste
`tests-e2e/empreintes-exemples.json`. Relevé par `grep` sur les 22 graphes de `exemples/` :

| Mécanisme | Fiches | Dans un exemple surveillé ? |
|---|---|---|
| Boucle de graphe (dépliage) | `boucle-graphe-debut`, `boucle-plan-debut`, `boucle-graphe-fin`, `-fin-b`, `-fin-c` | **aucun** |
| Boucles par passes | `boucle-voix-*`, `boucle-creneau-*`, `cercle-boucle-*` | `gestion_graphe_complexite` seul |
| Instrument | `frontiere-note`, `instrument-fin` | **aucun** |
| Nœuds-frontière d'un méta | `__entree-frontiere`, `__sortie-frontiere` | **aucun** (et jamais enregistrés : `redériverMeta` les retire) |
| Liaison de « Courbe » | `generateur-courbe` | deux, mais la liaison ne joue qu'à un changement de réglage, et les deux gardes ne font que Lancer, ▶ et ↺ |

`deplierBoucles` rend le graphe tel quel quand il ne trouve ni début ni fin de boucle de graphe
(`core/boucle-graphe.ts:231-235`), et `deplierInstruments` de même (`core/instrument-graphe.ts:137-141`).
Sur les seize exemples, **les deux dépliages prennent donc toujours ce raccourci**. Le refus d'une
boucle par passes dans un ventre (`boucle-par-passe-dedans`) n'est atteint par aucun d'eux non plus,
`gestion_graphe_complexite` n'ayant pas de boucle de graphe.

**Conséquence** : une faute qui casserait le dépliage d'une vraie boucle laisserait la base du son et
le journal verts. Ils restent nécessaires, puisqu'ils tiennent le chemin de la passe et le raccourci,
mais ils ne suffisent pas. D'où la pièce P0, qui leur donne de quoi voir (décision D3).

Ce qui traverse vraiment ces mécanismes aujourd'hui :

- **à l'unité** : `core/boucle-graphe.test.ts`, `core/boucle-plan.test.ts`, `core/cache-execution.test.ts`,
  `core/execution-boucle.test.ts`, `core/saut-de-boucle.test.ts`, `core/preparation-passe.test.ts`,
  `core/instrument-graphe.test.ts`, `core/meta.test.ts`, `core/validation-frontiere.test.ts`,
  `core/reglages-lies.test.ts`, `ui/moteur/copies-du-moteur.test.ts`, `plugins/boucle-deux-mecaniques.test.ts` ;
- **dans l'application** : `boucle-reprise-dans-application.spec.ts` (début et fin C),
  `copies-remises-a-zero-dans-application.spec.ts` (une boucle et un instrument),
  `zones-dans-une-boucle-dans-application.spec.ts` (début et fin A),
  `inspecteur-echantillon-dans-application.spec.ts` (`frontiere-note`),
  `graphe-complexite-dans-application.spec.ts` (les boucles par passes, dans des bulles et un méta).

**Aucun spec n'ouvre l'intérieur d'un méta** : ni `ouvrirMeta`, ni les boutons de `ui/BarreMeta.tsx`.
Les nœuds-frontière ne sont tenus qu'à l'unité. **Aucun spec ne change la « Forme » d'une Courbe** :
la liaison n'est tenue qu'à l'unité.

### 0.2 Un défaut latent, mesuré : l'alias d'une fin de boucle ne referme rien

`audio/alias.ts:33` déclare `boucle-graphe-fin-a` → `boucle-graphe-fin`, « pour qui l'écrirait de
la façon attendue » (commentaire de `core/boucle-graphe.ts:70-72`). Le chargement ne réécrit pas un
alias dans `data.ficheId` ; c'est le registre qui le résout à chaque recherche. Or le dépliage
compare l'identifiant brut à `FINS`, qui ne contient pas l'alias.

**Mesuré le 2026-11-20** par une sonde jetable, retirée depuis, qui passe par `preparerLaPasse` et le
vrai registre audio :

- le registre ouvre bien « Fin de boucle A » sous `boucle-graphe-fin-a` ;
- avec `boucle-graphe-fin`, une boucle de trois tours est dépliée, et l'on a cinq nœuds exécutés ;
- avec `boucle-graphe-fin-a`, **aucune boucle n'est dépliée**, le début reçoit `debut-sans-fin`, et
  l'on a quatre nœuds exécutés, soit un seul passage au lieu de trois.

Ce qu'en voit la personne n'est **pas vérifié dans l'application**. Le code dit : un seul tour, et le
message `boucle.probleme.debut-sans-fin` sur le début. Toute sortie qui lit le rôle par `trouverDef`
répare ce défaut ; une liste d'identifiants le garde, sauf à lui faire résoudre les alias (D4).

### 0.3 Le garde voit les identifiants, et pas le reste de ce que ces mécanismes nomment

Les mêmes quatre fichiers lisent aussi des **noms de réglage** et des **valeurs** du domaine, qu'aucun
garde ne cherche :

| Fichier | Ce qu'il nomme en plus |
|---|---|
| `core/boucle-graphe.ts` | le réglage `"Tours"` (l. 219), le réglage `"Graines"` et sa valeur `"Une par tour"` (l. 216, 356) |
| `core/instrument-graphe.ts` | le réglage `"Note"`, qu'il **écrit** dans chaque copie (l. 214) ; `"Largeur de zone"`, `"Note basse"`, `"Note haute"` (l. 64-66) ; les bornes du piano, 21 et 108 |
| `core/reglages-lies.ts` | les réglages `"Forme"` et `"Fréquence"`, les valeurs `"logistique"` et `"aleatoire"` |
| `core/meta.ts` (et `core/types-au-port.ts:96`) | le type de flux `"frontiere"`, que le domaine déclare (`audio/adaptateur.ts:62`) |

Payer les seize identifiants sans eux laisserait le même couplage sous un autre nom (D2). Les sorties
recommandées plus bas emportent ceux de l'instrument et de « Courbe » sans travail de plus ; pour les
boucles et le méta, c'est un choix.

### 0.4 La règle « le cœur ne lit pas les fiches » ne tient déjà plus là où le dépliage est appelé

Le commentaire de `core/boucle-graphe.ts:92` et celui de la l. 55 défendent la liste par la règle
« le moteur nomme les identifiants dont il dépend, il ne lit pas les fiches ». Elle est vraie du
**dépliage**, fonction pure de `(noeuds, aretes)`. Elle ne l'est plus de la **préparation** qui
l'appelle. `core/preparation-passe.ts:147` lit `executerEnDernier` sur la fiche, par le `trouverDef`
qu'on lui prête. Et les neuf indices d'`IndicesMoteur` (`core/types.ts:358`) existent, selon leur
propre en-tête, « pour que le moteur n'ait jamais à tester un id de plugin en dur ».

D'où vient la règle : des commits `9d35e1f4` (2026-09-30, boucles par passes) et `b3f91aa7`
(2026-10-24, boucle sur un plan). **Aucun des deux ne l'attribue à Fabien** ; elle est écrite par
l'agent, en passant, comme justification d'un choix de placement. La renverser touche quand même le
chemin d'une passe, et c'est pourquoi elle est la décision D4 plutôt qu'un détail de la pièce.

### 0.5 Ce qui précède toute pièce

La PR #409 doit être fusionnée : chaque pièce retire son entrée de `DETTES` dans
`src/docs/frontiere-identifiants.test.ts`, et le troisième cas de ce garde **exige** qu'une dette
payée en sorte (D1).

---

## 1. Les quatre fichiers, lecteur par lecteur

### 1.1 `core/meta.ts` : `__entree-frontiere`, `__sortie-frontiere`

**Le sens de la dépendance est déjà le bon** : c'est le cœur qui définit les deux identifiants
(`ID_ENTREE_FRONTIERE`, `ID_SORTIE_FRONTIERE`), et le domaine qui les **importe** pour y accrocher ses
fiches (`plugins/frontiere.ts:6`). Ce qui est dans le domaine, c'est la fiche : ses ports de type
`frontiere`, son nom dans les deux langues, sa notice, son exécuteur qui ne rend rien.

| Côté | Lecteur | Ce qu'il en fait |
|---|---|---|
| cœur | `core/meta.ts:59-62` | définit, `estFrontiere` |
| cœur | `core/meta.ts:291, 298` | `frontieresPourEdition` **écrit** ces identifiants sur les nœuds qu'il synthétise |
| cœur | `core/meta.ts:312, 324-325` | `redériverMeta` les filtre et les trie |
| cœur | `core/validation.ts:129` | pas de contrôle de type sur un câble qui touche une frontière |
| cœur | `core/types-au-port.ts:96` | saute un port de type `"frontiere"` (type que le domaine déclare) |
| cœur | `core/index.ts:4` | exporte |
| shell | `ui/App.tsx:546` | retire les deux fiches de la palette |
| shell | `ui/AtelierNode.tsx:115, 515, 594` | catégorie « autre », classe CSS `frontiere` |
| shell | `ui/BarreMeta.tsx:30-31` | les boutons « ➕ entrée » et « ➕ sortie » posent un nœud de ces fiches |
| shell | `ui/validerGraphe.ts:24, 66-67` | une connexion vers une frontière est toujours permise |
| shell | `ui/hooks/useMetaComposants.ts:113, 130` | par `redériverMeta` et `frontieresPourEdition` |
| domaine | `plugins/frontiere.ts` | déclare les deux fiches, en important les constantes du cœur |
| domaine | `audio/adaptateur.ts:62`, `audio/valeurs-essai.ts:199` | déclare le type de flux `frontiere` et sa valeur d'essai |
| domaine | `plugins/prompt-graphe.ts:196, 250`, `plugins/gestion-nodes.ts:22`, `quiz/catalogue.ts:43` | écartent par le préfixe `__` (voir §5) |
| tables | `COMPATIBILITE.json:4, 12`, `COMPONENTS.md`, `INTERFACE.md:134-135`, `plugins/ordre-du-catalogue.txt:395-396` | |
| tests | `core/meta.test.ts`, `core/validation-frontiere.test.ts`, `plugins/sans-sortie.test.ts:30` | |

Aucun graphe livré, aucun spec ne porte ces identifiants.

**Sortie recommandée : la chose entre dans le cœur, et non l'inverse.** Ni « la fiche déclare son
rôle » ni « le domaine remet la liste » ne conviennent ici. Le cœur doit **écrire** l'identifiant
(`frontieresPourEdition`), pas seulement le reconnaître : un rôle lu sur la fiche l'obligerait à
chercher dans le registre « la fiche dont le rôle est entrée », et une liste remise lui ferait
recevoir ce qu'il possède déjà. Les deux fiches sont agnostiques : aucun port audio, un exécuteur
qui rend `[null]` ou rien. Elles vont donc dans `core/`, avec le type de flux `frontiere`, et le
domaine les inclut dans son catalogue par un import (variante M-a de D5). Un second domaine obtient alors des méta-composants
sans redéclarer ces fiches, ce que `PORTING-A-DOMAIN.md` §6.a lui demande aujourd'hui.

**Écartées** : un rôle sur la fiche (`frontiere?: "entree" | "sortie"`), qui ferait passer
`trouverDef` à six lecteurs du shell pour un fait que le cœur porte déjà ; une liste remise par le
domaine, qui fait recevoir au cœur ses propres identifiants.

### 1.2 `core/boucle-graphe.ts` : onze débuts et fins

| Côté | Lecteur | Ce qu'il en fait |
|---|---|---|
| cœur | `core/boucle-graphe.ts:21-106` | `FICHES_DEBUT`, `FICHES_FIN`, `REBOUCLENT`, `FICHES_BOUCLE_PAR_PASSE`, et les trois prédicats |
| cœur | `core/boucle-graphe.ts:219, 356` | lit les réglages `Tours` et `Graines` |
| cœur | `core/preparation-passe.ts:118` | **seul appelant** de `deplierBoucles` hors tests |
| cœur | `core/saut-de-boucle.ts`, `core/graines-de-passe.ts` | lisent le `ResultatDepliage`, aucun identifiant |
| shell | `ui/moteur/menage-apres-passe.ts:18, 124`, `ui/moteur/passe.ts` | `COPIES_MAX` et les codes de problème ; aucun identifiant |
| domaine | `plugins/montage.ts:316, 354, 378, 398` | déclare début et fins A, B, C, **en littéraux**, sans importer le cœur |
| domaine | `plugins/boucle-plan.ts:35` | déclare le début sur un plan, en littéral |
| domaine | `plugins/boucleSequencesGlobal.ts:27-32, 42, 173, 177` | déclare les six identifiants par passes, et **ses propres listes** des débuts, des fins et de leur appariement |
| domaine | `plugins/boucle-voix.ts`, `boucle-creneau.ts`, `cercle-boucle.ts` | déclarent par ces constantes |
| domaine | `audio/alias.ts:33`, `plugins/sortie-audio.ts:32`, `plugins/familles-palette.ts:142`, `docs/modulables.ts:73`, `audio/croisement-choix.ts:24, 145` | |
| tests | les sept fichiers du §0.1, et `plugins/montage.test.ts` | |

**`FICHES_BOUCLE_PAR_PASSE` est un doublon.** Le cœur recopie les six identifiants que
`plugins/boucleSequencesGlobal.ts` déclare déjà, et `plugins/boucle-deux-mecaniques.test.ts` tient les
deux listes égales. Le commentaire le dit : le cœur ne pouvant pas vérifier sa liste, c'est un
garde du domaine qui l'y oblige.

**Sortie recommandée : la fiche déclare son rôle, et le cœur le lit** sur le modèle d'`IndicesMoteur`.
Trois indices distincts, et non un seul champ à quatre valeurs :

- `debutDeBoucle?: "reboucle" | "repete"` : `boucle-graphe-debut` reboucle, `boucle-plan-debut` répète ;
- `finDeBoucle?: true` : les trois fins ;
- `boucleParPasses?: true` : les six fiches de `boucleSequencesGlobal.ts`.

**Pourquoi trois et non un** : `docs/indices-moteur.test.ts` tient chaque indice par un représentant
dans un exemple surveillé. Un champ unique serait réputé « joué » dès qu'une boucle par passes de
`gestion_graphe_complexite` le porte, pendant qu'aucune boucle de graphe ne joue nulle part : c'est
le substitut pris pour la propriété, que `AGENTS.md` §6 nomme en premier.

`deplierBoucles(noeuds, aretes, roleDe)` reste pure : elle reçoit une fonction et non le registre.
`preparerLaPasse` la forme à partir du `trouverDef` qu'on lui prête déjà, ce qui **résout les alias**
(§0.2). Le doublon disparaît : les six fiches par passes se déclarent elles-mêmes, et le premier cas
de `boucle-deux-mecaniques.test.ts` devient « toute fiche des listes du pilote porte `boucleParPasses`,
et aucune autre ».

**Les réglages `Tours` et `Graines`** : le cœur définit le contrat d'une boucle, et un début de boucle
a ces réglages-là. Recommandé : le cœur exporte `REGLAGE_TOURS`, `REGLAGE_GRAINES` et
`GRAINES_PAR_TOUR`, et `plugins/montage.ts` et `plugins/boucle-plan.ts` les importent pour leurs
déclarations, comme `plugins/frontiere.ts` importe aujourd'hui les identifiants du méta (D2).

**Écartée, et ce qu'elle a pour elle** : le domaine remet les listes (`audio/boucles.ts`, sur le modèle
d'`audio/alias.ts`). Elle garde les cas de test plus courts et ne touche pas `IndicesMoteur`. Mais elle
garde le défaut de l'alias, sauf à faire résoudre les alias à la table, et elle ne met pas les boucles
sous le garde des indices.

### 1.3 `core/instrument-graphe.ts` : `frontiere-note`, `instrument-fin`

| Côté | Lecteur | Ce qu'il en fait |
|---|---|---|
| cœur | `core/instrument-graphe.ts:23-24, 137-138, 152, 211` | reconnaît la note et la fin, injecte `Note` dans la copie |
| cœur | `core/instrument-graphe.ts:63-75` | `racinesInstrument` lit trois réglages de la fin |
| cœur | `core/preparation-passe.ts:18, 103-111` | seul appelant ; range les problèmes sous « Instrument de graphe » |
| shell | aucun | |
| domaine | `plugins/instrument-graphe.ts:21` | **importe du cœur** `NOTE_MIN`, `NOTE_MAX`, `apparierRendus`, `racinesInstrument` |
| domaine | `plugins/instrument-graphe.ts:89, 142` | déclare les deux fiches en littéraux |
| domaine | `plugins/familles-palette.ts:119`, `plugins/categories/electroacoustique.ts:40`, `docs/modulables.ts:235` | |
| tests | `core/instrument-graphe.test.ts`, `core/preparation-passe.test.ts:16` | |

Un instrument de 88 touches, ses bornes MIDI, la note injectée, ses trois réglages : rien ici n'est
générique, et le domaine importe déjà du cœur la moitié de ce qui le fait marcher.

**Sortie recommandée : la chose quitte le cœur.** `deplierInstruments`, `racinesInstrument`,
`apparierRendus` et leurs bornes vont dans le domaine, à l'identique : `audio/instrument-depliage.ts`
s'il se classe *pur* dans `DEPENDANCES-AUDIO.md`, sinon à côté de ses fiches dans `plugins/`. Le cœur
gagne une **couture générique** : `preparerLaPasse` reçoit `depliagesDuDomaine`, une liste de
transformations `(noeuds, aretes) => { noeuds, aretes, origines, problemes }`, qu'il applique dans
l'ordre après l'aplatissement et **avant** les boucles. C'est l'ordre d'aujourd'hui, qui permet
qu'une chaîne d'instrument contienne une boucle. Le shell les reçoit du domaine par
`ui/services-orchestration.ts` (`ORCHESTRATION_AUDIO`), comme il en reçoit déjà ce qu'il publie autour
d'une passe, et les passe à `preparerLaPasse` dans `ui/moteur/passe.ts:139`.

**Ce qui doit rester identique** : la forme des identifiants de copie `fin@k::noeud`. Les remises et
le cache passent par la table `origines` (`core/remises.ts:18-22`), mais la règle du `::` du cache
coupe au premier `::`, et `copies-remises-a-zero-dans-application.spec.ts` tient ce comportement.

**Écartée** : généraliser dans le cœur un « déploiement en éventail » dont la fiche déclarerait la
source, la fin et les valeurs à injecter. Le dépliage des boucles et celui de l'instrument sont
presque jumeaux (`deplierUne` et `deplierUn`), et la boucle sur un plan, qui ne reboucle pas, est un
éventail sans injection. Mais l'unifier est une réécriture du chemin d'une passe, et le gain, pour
un seul domaine, est de la beauté.

### 1.4 `core/reglages-lies.ts` : `generateur-courbe`

| Côté | Lecteur | Ce qu'il en fait |
|---|---|---|
| cœur | `core/reglages-lies.ts:51-58` | la seule liaison, avec `Forme`, `Fréquence`, `logistique`, `aleatoire` |
| shell | `ui/hooks/useRelanceApresReglage.ts:20, 97` | **seul appelant**, à chaque changement de réglage |
| domaine | `plugins/courbe.ts:66, 102-103` | déclare la fiche ; la notice de « Fréquence » décrit la liaison |
| tests | `core/reglages-lies.test.ts` | |

La règle générique, ne jamais réécrire une valeur choisie, n'est pas du domaine. Son **contenu**
l'est entièrement, et la notice de la fiche le décrit déjà comme un comportement du composant.

**Sortie recommandée : la fiche déclare la liaison, en données, sur le réglage.** Sur « Fréquence » :
`defautSelon: { reglage: "Forme", valeurs: { logistique: 2, aleatoire: 2 } }`, toute autre forme
prenant le `defaut` déclaré, 0,5. `core/reglages-lies.ts` garde la règle et lit la déclaration :
`reglagesApresChangement(def, parametres, nom, valeur)`, et le hook la lui passe par le `trouverDef`
qu'il lit déjà pour `relanceAutomatique` (l. 43). Des données plutôt qu'une fonction : elles se
sérialisent, se documentent, et un garde peut vérifier que chaque clé est une valeur du réglage
nommé.

**Écartée** : une fonction `liaisons` sur la fiche. Elle marche, mais une fonction ne se relit ni
dans `DESCRIPTION.json` ni dans `COMPATIBILITE.json`, et ne se contrôle pas contre les `optionIds`.

---

## 2. Les pièces

Chaque pièce est une PR. Chacune suit l'ordre de `AGENTS.md` §1 (`npx tsc -b`, `npx oxlint`,
`npx vitest run`, vérification dans l'application, CHANGELOG), retire sa ligne de `DETTES`, et met à
jour `PORTING-A-DOMAIN.md` §6.a et `IMPACT.md`. Les épreuves de bout en bout se lancent **une à la
fois, en file avec les autres sessions**, jamais pendant une passe complète, et dans un arbre muni de
son `node_modules` (`npm ci --ignore-scripts`).

### P0 : donner aux deux épreuves de quoi voir les dépliages

**But** : qu'une faute du dépliage d'une boucle ou d'un instrument fasse tomber la base du son et le
journal de passe. **Avant toute pièce qui touche la passe**, parce qu'elle établit la référence sur le
code d'aujourd'hui.

- **Un exemple livré neuf** (D3) : une source déterministe → « Début de boucle » à quelques tours →
  une transposition → « Fin de boucle A » → écoute ; et à côté « Note d'instrument » → un traitement →
  « Fin d'instrument » sur une étendue étroite, pour rester bref. La boucle sur un plan n'y entre
  vraisemblablement pas : son corps demande le moteur de chanson, que les deux gardes n'ont pas.
  **À mesurer**, et sinon `repete` sera déclaré au garde des indices avec cette raison.
- **Fichiers** : `exemples/<nom>.json`, `tests-e2e/empreintes-exemples.json`,
  `tests-e2e/journaux-de-passe.json`, `CHANGELOG.md`.
- **Épreuves** :
  - `GRAPHE=<nom> npm run executer` : chaque nœud au vert, les deux aperçus écoutés ;
  - `npx vitest run src/docs/contrat-graphe.test.ts` et `node scripts/contrat-graphe.mjs` : aucun orphelin ;
  - établir la base du son pour **ce seul exemple**, sans réécrire les quinze autres : copier
    la base, établir, la remettre, insérer l'entrée par Edit (piège relevé : `EXEMPLE=` avec
    `ECRIRE_EMPREINTES_EXEMPLES` réécrit toute la base avec ce seul exemple) ;
  - établir le journal de passe pour ce seul exemple, de la même façon ;
  - **vu rouge, deux fautes plantées puis retirées** : `REBOUCLENT` vidé (les tours ne se chaînent
    plus), et l'injection de `Note` retirée de `deplierUn` ; la base du son doit tomber sur ce seul
    exemple, et le journal sur la progression du début (`boucle.depliee`) pour la première.
- **Tables** : aucune.

### P1 : méta, les fiches-frontière passent dans le cœur

- **Fichiers** : `core/frontiere.ts` (neuf, les deux fiches génériques et le type de flux), `core/index.ts`,
  `plugins/frontiere.ts` (retiré), l'index du catalogue (qui inclut les fiches du cœur),
  `audio/adaptateur.ts:62` (le type de flux ne s'y déclare plus), `plugins/ordre-du-catalogue.txt`,
  `src/docs/frontiere-identifiants.test.ts` (sa règle exclut les fiches que le cœur déclare, et
  l'entrée `core/meta.ts` sort de `DETTES`), `core/domaine-nombre.test.ts`.
- **Épreuves** :
  - `core/meta.test.ts`, `core/validation-frontiere.test.ts`, inchangés et verts ;
  - **un cas neuf dans `core/domaine-nombre.test.ts`** : l'intérieur édité d'un méta du domaine
    « nombre », frontières comprises, se valide sans fiche inconnue, ce domaine n'ayant écrit aucune
    fiche-frontière ; **vu rouge** en retirant l'inclusion des fiches du cœur. La forme exacte du cas
    est à établir en écrivant la pièce : ce que `validerGraphe` dit d'un nœud sans fiche n'a pas été
    relevé ici ;
  - `src/docs/compatibilite.test.ts` : **aucune rupture**, les deux fiches restant dans le catalogue ;
  - les gardes de fiche qui lisent `toutesLesFiches` (notice, anglais, compatibilité) les voient
    toujours, par l'inclusion ;
  - **dans l'application**, puisqu'aucun spec ne le fait : ouvrir un méta, voir « ▸ Entrée exposée »
    et « Sortie exposée ◂ », en ajouter une par la barre, la relier, remonter ; le méta porte le port
    neuf, du bon type. **Vu rouge** : l'inclusion retirée ; ce que l'écran montre alors est à relever,
    non à prédire.
  - base du son et journal : **non concernés**, aucune frontière n'étant dans un exemple surveillé.
    Le dire, sans les lancer pour rien.
- **Tables** : `npm run docs:components`, `docs:interface`, `docs:compatibilite` doivent rendre
  un diff vide. Un diff non vide est une faute de la pièce.

### P2 : boucles, le rôle déclaré par la fiche

- **Fichiers** : `core/types.ts` (trois indices dans `IndicesMoteur`), `core/boucle-graphe.ts` (les
  listes retirées, `roleDe` en paramètre, les constantes de réglage exportées), `core/preparation-passe.ts`
  (`FicheDePreparation` porte les trois indices), `plugins/montage.ts`, `plugins/boucle-plan.ts`,
  `plugins/boucle-voix.ts`, `plugins/boucle-creneau.ts`, `plugins/cercle-boucle.ts`,
  `plugins/boucle-deux-mecaniques.test.ts`, les sept fichiers de test du cœur et du moteur qui
  emploient ses constantes (un `roleDe` d'essai, sur des identifiants neutres),
  `src/docs/indices-moteur.test.ts` (trois déclarations), `DETTES`.
- **Contrainte de taille** : `core/boucle-graphe.test.ts` est dans la dette à 465 lignes de code
  (`src/docs/generer-compte-lignes.test.ts:182`) et **ne doit pas grossir**. Les cas neufs vont dans
  un fichier à part.
- **Épreuves** :
  - `npx vitest run` complet ;
  - **un cas neuf** : une fin posée sous `boucle-graphe-fin-a` referme sa boucle. Rouge aujourd'hui
    (§0.2), vert après ; c'est la preuve que le rôle passe par `trouverDef` ;
  - **vu rouge, trois fautes plantées** : `roleDe` qui lit l'identifiant brut (le cas de l'alias
    tombe) ; `boucleParPasses` retiré de `cercle-boucle-debut` (`boucle-deux-mecaniques` tombe) ;
    `debutDeBoucle: "repete"` remplacé par `"reboucle"` sur la boucle sur un plan (`boucle-plan.test.ts`
    tombe, comme sa faute plantée d'origine) ;
  - `npm run test:empreintes-exemples` et `npm run test:journal-de-passe` **identiques à la référence
    de P0**, sans rien réécrire ;
  - `npm run test:graphe-complexite`, `boucle-reprise-dans-application`,
    `copies-remises-a-zero-dans-application`, `zones-dans-une-boucle-dans-application`, chacun seul ;
  - `src/docs/indices-moteur.test.ts` : `debutDeBoucle` et `finDeBoucle` « joués » par l'exemple de P0,
    leur faute plantée vue rouge ; `boucleParPasses` « non éprouvé », sa porteuse étant dans
    `gestion_graphe_complexite` sans que le refus y soit atteint.
- **Tables** : aucune attendue. `COMPATIBILITE.json` ne porte pas les indices ; le vérifier par
  `npm run docs:compatibilite`.

### P3 : l'instrument quitte le cœur

- **Fichiers** : `core/instrument-graphe.ts` déplacé dans le domaine, à l'identique ;
  `core/preparation-passe.ts` (la couture `depliagesDuDomaine`, et un libellé d'avertissement fourni
  par la transformation au lieu d'« Instrument de graphe ») ; `ui/services-orchestration.ts` et
  `plugins/orchestration-domaine.ts` ; `ui/moteur/passe.ts:139` ; `plugins/instrument-graphe.ts`
  (son import) ; `core/instrument-graphe.test.ts` déplacé ; `core/preparation-passe.test.ts` (son cas
  d'équivalence emploie une transformation d'essai) ; `DETTES`.
- **Épreuves** :
  - les cas de `instrument-graphe.test.ts`, déplacés **sans retouche de leurs attendus** ;
  - **un cas neuf, côté domaine** : le vrai instrument passe par `preparerLaPasse` avec la couture,
    et rend autant de copies qu'il y a de racines ; **vu rouge** en ne passant pas la couture ;
  - le cas d'ordre : une boucle dans une chaîne d'instrument se déplie encore, ce qui prouve que la
    couture passe avant les boucles ;
  - base du son et journal identiques à la référence de P0 ;
  - `copies-remises-a-zero-dans-application` et `inspecteur-echantillon-dans-application`, seuls ;
  - `src/docs/frontiere-domaine.test.ts` : le cœur n'importe rien du module déplacé.
- **Tables** : `npm run docs:dependances` (un module audio neuf, s'il va dans `audio/`), `docs:lignes`.

### P4 : la liaison de « Courbe » déclarée par la fiche

- **Fichiers** : `core/types.ts` (`defautSelon` sur `ParametreDef`), `core/reglages-lies.ts` (la règle
  lit la déclaration ; son en-tête dit encore « deux endroits dans `App.tsx` », ce qui n'est plus vrai
  depuis `useRelanceApresReglage.ts`, et se réécrit avec le module), `ui/hooks/useRelanceApresReglage.ts`,
  `plugins/courbe.ts`, `core/reglages-lies.test.ts` (sur une déclaration d'essai), un test du domaine
  qui rejoue les neuf cas d'aujourd'hui sur la vraie fiche, `DETTES` (vide après cette pièce). Le cas
  « à la cadence naturelle » appelle déjà le générateur de la Courbe depuis un test du cœur : il
  revient au domaine.
- **Épreuves** :
  - les neuf cas de `reglages-lies.test.ts`, mêmes attendus, dont « une valeur choisie n'est jamais
    réécrite » et « l'objet reçu n'est jamais modifié » ;
  - **un garde neuf, petit** : chaque clé de `defautSelon.valeurs` est un `optionId` du réglage
    nommé. **Vu rouge** en écrivant `logistic` ;
  - **dans l'application** : une Courbe neuve, « Forme » sur « Chaos logistique » → « Fréquence » à 2 ;
    retour sur « Sinus » → 0,5 ; « Fréquence » à 3, puis changer de forme → 3 reste. **Vu rouge** en
    retirant la déclaration de la fiche. Spec permanent ou vérification ponctuelle : D8 ;
  - base du son et journal : **non concernés**, la liaison ne jouant qu'à un changement de réglage.
- **Tables** : `docs:compatibilite`, si D7 fait entrer `defautSelon` dans le manifeste.

---

## 3. Ordre et dépendances

```
PR #409 fusionnée
   ├── P0 (référence)  ──>  P2 (boucles)  ──>  P3 (instrument)
   ├── P1 (méta)            indépendante
   └── P4 (Courbe)          indépendante
```

- P2 et P3 touchent toutes deux `core/preparation-passe.ts` : l'une après l'autre, jamais en
  parallèle. P2 d'abord, parce qu'elle répare un défaut (§0.2).
- P1 et P4 ne touchent pas la passe et peuvent partir en même temps que P0, chacune sur sa
  branche. Fichiers partagés : toutes les pièces retirent une ligne de `DETTES`, et P2 comme P4
  touchent `core/types.ts`. La seconde fusionnée se rebase.
- **Une branche neuve après chaque fusion**, et `E:\attic` remis à jour par `pull --ff-only`.

---

## 4. Les décisions qui reviennent à Fabien

**D1. Fusionner la PR #409 avant tout.** Les pièces en dépendent (§0.5). *Recommandé : oui.*

**D2. La portée : les seize identifiants, ou aussi les noms de réglage que les mêmes mécanismes
lisent.** §0.3. L'instrument et « Courbe » les emportent d'eux-mêmes. Pour les boucles, *recommandé* :
le cœur exporte `Tours`, `Graines` et `Une par tour` comme le contrat d'un début de boucle, et les
fiches les importent. Pour le méta, le type de flux `frontiere` suit les fiches dans le cœur (P1).
Étendre le garde aux noms de réglage n'est **pas** proposé ici : une liste de noms à surveiller
serait le garde qui cherche un nom et non une forme.

**D3. Un exemple livré neuf qui porte une boucle de graphe et un instrument (P0).** Sans lui, la
base du son et le journal ne voient aucune des pièces P2 et P3 (§0.1). *Recommandé : un exemple
neuf* plutôt qu'étendre `ce-que-le-moteur-lit-sur-un-noeud.json`, dont les déclarations du garde des
indices citent les mesures du 2026-11-19, et qu'il faudrait toutes refaire. Son nom est à choisir.

**D4. Les boucles : la fiche déclare son rôle (recommandé), ou le domaine remet les listes.** Le
premier renverse la règle écrite dans `core/boucle-graphe.ts`, qui n'est pas la sienne (§0.4), met
les boucles sous le garde des indices, et répare l'alias. Le second garde la règle et les cas de test
plus courts, et garde le défaut de l'alias sauf travail de plus.

**D5. Le méta : les fiches-frontière dans le cœur.** Deux variantes :
*(M-a, recommandée)* le cœur les déclare, le catalogue du domaine les inclut par un import : rien
ne bouge dans les tables ni dans les gardes de fiche. *(M-b)* le registre les inscrit de lui-même à
sa création : un second domaine n'a même pas l'import à faire, mais `compatibilite.test.ts:148` et les
gardes qui lisent `toutesLesFiches` ne les verraient plus sans être adaptés. *(M-c)* ne rien déplacer,
et déclarer au garde qu'un identifiant que le domaine **reçoit** du cœur n'est pas une dette : rien ne
change pour un second domaine, qui doit toujours redéclarer les fiches.

**D6. L'instrument : la chose quitte le cœur par une couture générique (recommandé)**, ou le cœur
généralise un déploiement en éventail que la fiche paramètre (§1.3, écartée).

**D7. « Courbe » : `defautSelon` en données sur le réglage (recommandé), ou une fonction sur la
fiche.** Et, si `defautSelon` : entre-t-il dans `COMPATIBILITE.json` ? *Recommandé : non*, il ne
change pas ce qu'un graphe enregistré ouvre, seulement ce qu'un geste à l'inspecteur fait.

**D8. La liaison de « Courbe » : un spec permanent dans l'application, ou une vérification
ponctuelle au volet navigateur.** Aucun spec ne la tient aujourd'hui (§0.1). *Recommandé* : la
vérification ponctuelle, chiffrée dans le CHANGELOG ; un spec ne se justifierait que si le défaut
revenait.

**D9. Le défaut de l'alias (§0.2) se répare dans P2, et change ce que fait un graphe qui porte
`boucle-graphe-fin-a`** : un tour aujourd'hui, le nombre réglé demain. *Recommandé : oui*, c'est ce
que l'alias promettait. À dire au CHANGELOG comme une réparation, non comme un effet de bord.

---

## 5. Relevé en passant, hors de ce plan

Signalés, non traités, aucun n'entrant dans une pièce sans qu'on le demande :

1. **`core/preparation-passe.ts:226` nomme `"comment"` et `"frame"`.** Ce ne sont pas des fiches du
   catalogue, et le garde ne les voit donc pas : ce sont les notes et les cadres du shell
   (`ui/hooks/useNotesEtCadres.ts`). Le cœur nomme là deux identifiants du shell.
2. **Le filtre par préfixe `startsWith("frontiere")` écarte aussi `frontiere-note`, « Note
   d'instrument »**, de la grammaire de la dictée (`plugins/prompt-graphe.ts:250`), du vocabulaire de
   génération de graphe (`:196`), du quiz (`quiz/catalogue.ts:43`) et des composants récents
   (`plugins/gestion-nodes.ts:22`). Lu dans le code, **non vérifié dans l'application**.
   Vraisemblablement fortuit : le préfixe visait les nœuds-frontière, qui commencent par `__`. Les
   deux fiches-frontière marquées `horsCatalogue` rendraient ces quatre filtres inutiles.
3. **Le garde ne voit pas les noms de réglage** (§0.3) : c'est écrit ici pour mémoire, sans
   proposition (D2).
