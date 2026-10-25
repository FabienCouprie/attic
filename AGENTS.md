# AGENTS.md — travailler sur Attic

Attic est un éditeur nodal pour la musique et le son : Electron, Vite, React 19, TypeScript,
507 composants. Le cœur (`src/core/`) ignore l'audio ; l'audio est un adaptateur branché dessus
(voir `PORTING-A-DOMAIN.md`). L'interface et les notices sont bilingues français / anglais.

**La règle qui gouverne toutes les autres : ici, une affirmation se mesure.** Un chiffre annoncé
sans avoir été relevé est traité comme une faute, pas comme une approximation. Le dépôt porte pour
cela un banc de mesure, une base d'empreintes et vingt-deux gardes sur lui-même : ils s'emploient, ils
ne se réinventent pas.

---

## 1. L'ordre de vérification, avant d'annoncer quoi que ce soit

Dans cet ordre, et les quatre étapes :

```bash
npx tsc -b
```

```bash
npx vitest run
```

3. **Vérifier dans l'application.** Un test vert ne dit pas qu'un composant fait ce qu'il annonce.
   Lancer le serveur de développement (`npm run dev`), puis mesurer le composant par le banc
   (section 5) ou exercer le chemin réel. Un comportement non vérifié à l'écran se dit « non
   vérifié », jamais « corrigé ».
4. **Écrire l'entrée de CHANGELOG**, avec les chiffres relevés.

Ce qui reste bloqué, écarté ou non fait se dit explicitement, avec sa raison. Livrer la moitié d'un
travail en laissant croire qu'il est entier est le défaut que tout l'appareil de ce dépôt existe
pour empêcher.

## 2. Commits et publication

- **Aucun commit sans ordre explicite.** Travailler, vérifier, rendre compte ; attendre la demande.
- **Aucune publication sans accord séparé** : pousser et ouvrir une pull request sont deux
  décisions distinctes de celle de committer.
- **Messages de commit en français, sans accents**, dans la forme `type(portee): resume`. Corps en
  paragraphes courts et capitalisés, qui disent ce qui a été mesuré. Terminer par la ligne de
  co-signature que l'outil impose.
- **Un commit ne contient que ce qui a été demandé.** Un nettoyage repéré en passant se signale, il
  ne se glisse pas dans le diff.
- Les tables générées (`COMPONENTS.md`, `DEPENDANCES-AUDIO.md`, `INTERFACE.md`,
  `MODULABLES.md`) et `tests-e2e/empreintes.json` ne peuvent être cohérentes qu'en un point de
  l'arbre : les régénérer avant de committer, et préférer un commit entier à plusieurs commits dont
  certains échoueraient à leurs propres gardes.

## 3. Les cinq contrats

Ils sont vérifiés automatiquement sous Claude Code, par les hooks déclarés dans
`.claude/settings.json`. **Un autre harnais ne les déclenchera pas : ils s'appliquent quand même.**
Chacun est né d'une faute réelle, et le script porte l'histoire en tête de fichier.

### `scripts/contrat-heredoc.mjs` — comment une retouche s'écrit

Une retouche d'un ou deux fichiers se fait avec l'outil d'édition, **jamais par un script** :
l'édition compare les octets déjà lus, donc ni l'encodage ni les fins de ligne ne peuvent mordre.
Un script ne se justifie que pour un travail répétitif sur beaucoup de fichiers ; il s'écrit alors
dans un fichier, se lance avec `PYTHONUTF8=1`, et lit et écrit en `encoding='utf-8', newline=''`.

**Est refusé** : du code passé au shell en argument de `-c` ou `-e`, et les heredocs porteurs de
code. Un accent grave y est une substitution de commande, et des guillemets imbriqués s'échappent à
la main.

### `scripts/contrat-notice.mjs` — ce qu'une notice peut dire

Une notice est un mode d'emploi : ton neutre et professionnel, références scientifiques si besoin,
rien d'autre. Elle dit, dans cet ordre, ce que le composant **fait** (première phrase, indicatif
présent, sujet le composant), comment chaque réglage agit, puis ce que rend chaque sortie. Chaque
terme employé doit se retrouver à l'écran : nom de port, nom de paramètre, libellé d'option.

**Ponctuation** : le tiret cadratin et le demi-cadratin sont interdits ; point, virgule,
point-virgule ou deux points.

**Sont proscrits** : la figure de style ; le journal de conception (« ce qui manquait », « un
premier jet ») ; le relevé d'essai (« mesuré », « vérifié ») ; **la comparaison avec un autre
composant** et le nom de l'application ; la recette et l'adresse au lecteur (« branchez »,
« réglez », « idéal pour ») ; l'annonce de plan ; la défense (« ce n'est pas un bogue »).

Un paramètre ajouté, retiré ou renommé s'écrit dans la notice, **dans les deux langues**.

### `scripts/contrat-noeud.mjs` — ce qu'un exécuteur a le droit de faire

1. **Un exécuteur n'écrit rien sur le nœud.** Il rend ce qu'il a à dire par trois canaux déclarés
   dans le retour de `executer` (voir `src/core/types.ts`) : `affichage` pour ce que le run a
   produit, `designe` pour ce qu'il a désigné de ses entrées, `moteur` pour ce qu'il demande au
   moteur. Écrire dans `ctx.noeud.data` est la faute que ce contrat existe pour empêcher : un champ
   posé là n'a pas de classe, donc rien ne l'efface, et il décrit à l'écran une exécution qui n'a
   plus lieu. Une vue n'écrit pas davantage dans ces canaux.
2. **Tous les paramètres déclarés agissent au run.** Un réglage lu puis versé dans un champ que
   personne ne consomme ne compte pas. La vérification se fait réglage par réglage : changer la
   valeur doit changer le résultat. Un réglage légitimement inerte porte sa raison écrite à côté de
   lui.
3. **Un lecteur de composant ne s'ouvre pas à pleine puissance** : tout ce qui se fait entendre
   depuis un nœud passe par `NIVEAU_ECOUTE` de `src/ui/niveau-ecoute.ts`.

### `scripts/contrat-graphe.mjs` — ce qu'un graphe livré a le droit d'être

Dans un éditeur de nœuds, **un nœud sans câble ne participe à rien**. Le script compte les câbles
dans les graphes de `exemples/`, `presets/`, `tests-e2e/` et de la racine : nœuds orphelins, arêtes
pendantes, identifiants en double. Ce qui demande le registre vit dans
`src/docs/contrat-graphe.test.ts`.

`presets/` n'est pas versionné : c'est là qu'on travaille, et un graphe en cours de câblage y est
incomplet par nature. `exemples/` est versionné et livré : ce qui s'y trouve est montré à quelqu'un
d'autre, et n'a pas le droit d'être à moitié fait.

### `scripts/contrat-poussee.mjs` — ce qu'une poussée laisse derrière elle

**Après chaque `git push`, vérifier que la branche de base a bien reçu les commits.** Une pull
request fusionnée pendant que la poussée tourne prend la branche à l'état où elle était : les
commits qui arrivent restent sur une branche dont la pull request est close, et **rien ne
l'annonce** — la poussée réussit, la branche distante est à jour, et c'est la ligne principale qui
ne les a pas.

Le signe à lire : parmi les commits que la base a et que la tête n'a pas, une fusion dont le
**second parent est un ancêtre de la tête**. Cette fusion a pris la branche en vol, et tout ce qui
suit le point pris est dehors.

```bash
git fetch origin && git rev-list --merges --parents HEAD..origin/master
```

**La sortie** : repartir d'une branche neuve sur la base à jour, y reporter les commits par
`git cherry-pick`, pousser cette branche et ouvrir une pull request pour elle. La même condition
couvre la règle voisine : **une branche neuve après chaque fusion**, un commit ajouté sur une
branche déjà fusionnée n'étant dans aucune pull request.

## 4. La règle de sécurité pour l'oreille

**Une formule peut rendre 1000, et personne ne doit l'entendre.** Un composant qui calcule ses
échantillons par une expression mathématique ne connaît pas l'échelle de ce qu'il rend : `mag *
10000` est une formule comme une autre, et le casque de quelqu'un est au bout de la chaîne. La
règle a été fixée au début du projet et elle tient en quatre temps, dans cet ordre.

1. **L'échantillon est bridé à [-0,5 ; 0,5] avant toute autre chose.** C'est
   `securiserAmplitude(buffer, 0.5)` de `src/audio/math-formules.ts`, que tout chemin évaluant une
   formule doit appeler. Que l'expression rende 1000 ou `mag * 10000`, la sortie reste dans la
   plage audio usuelle, à la moitié de la pleine échelle.
2. **Le réglage « Volume » du composant s'applique ensuite**, sur un signal déjà borné. C'est ce
   qui garantit que le niveau final reste sous contrôle quoi qu'on règle : le curseur multiplie
   0,5, il ne multiplie pas 1000.
3. **Le « Volume » de ces composants vaut 30 % par défaut.** Un composant à formule s'ouvre bas.
4. **Amplifier est un acte explicite** : qui veut plus fort pose un composant d'amplification
   après, ayant écouté d'abord. Le gain n'est jamais donné d'avance.

**ET CE QUI SE FAIT ENTENDRE EST MESURÉ À L'ÉCRAN, par mesure de précaution.** Tout nœud qui
montre un lecteur montre au-dessus de lui son indicateur d'intensité, en code couleur du vert au
rouge : vert sous 0,3 de crête, ambre à partir de 0,3, rouge à partir de 0,7 (`IndicateurNiveau`
de `src/ui/AtelierNode.tsx`). Et le lecteur s'ouvre à `NIVEAU_ECOUTE = 0,3`
(`src/ui/niveau-ecoute.ts`), ce que le contrat de composant exige de tout ce qui se fait entendre
depuis un nœud.

**CE QUE CETTE RÈGLE NE COUVRE PAS.** Elle borne ce qui sort d'une formule, et non le niveau des
générateurs qui n'en emploient aucune : ceux-là s'alignent par l'usage, entre 0,5 et 1,0 de crête,
et cet alignement n'est écrit nulle part. Un composant qui sort dix fois plus fort que ses voisins
se relève donc à l'oreille, et non par un garde.

## 5. Les gardes exécutables, et comment s'en servir

Ceux-là ne dépendent d'aucun harnais : `npx vitest run` les heurte tous.

- **`src/docs/*.test.ts`** — vingt-deux contrats sur le dépôt lui-même : registre des réglages, graines,
  cœurs par trames, registre anglais, caractères de contrôle, style de documentation, classement
  théorique, contrat de graphe, générateur commun du hasard, frontière du domaine, couverture des
  empreintes, le serveur des specs de bout en bout, le pilote d'un graphe entier, le classement des
  écarts d'une famille comparée, et la fraîcheur des tables générées. **La norme de taille y est contraignante** :
  aucun fichier neuf ne dépasse quatre cents lignes de code, les quinze qui la dépassaient déjà ne
  grossissent plus, et celui qui redescend dans la norme sort de la dette. Elle ne peut que
  décroître, et la liste est dans `src/docs/generer-compte-lignes.test.ts`.
- **`tests-e2e/empreintes.json` + `empreintes.spec.ts`** — l'empreinte du son de 72 composants
  surveillés, valeur efficace et crête à neuf décimales, plus leur message. Toute modification qui
  altère une sortie fait échouer ce test. Pour l'étendre :

```bash
DEV_URL=http://localhost:5175 ECRIRE_EMPREINTES=1 npx playwright test tests-e2e/empreintes.spec.ts
```

  **Relire le diff avant de committer** : une empreinte qui change est soit un progrès voulu, soit
  exactement le défaut que ce fichier existe pour attraper.
- **`tests-e2e/empreintes-exemples.json` + `empreintes-exemples.spec.ts`** — l'empreinte du son que
  rend **chaque exemple livré**, chaîne entière, un relevé par aperçu audio. Là où la base
  précédente surveille des composants **isolés** nourris d'un son d'essai, celle-ci surveille ce
  qu'on **entend** en ouvrant un exemple et en pressant Lancer : un défaut né de la rencontre de
  deux composants n'est visible que d'ici. C'est ce qui manquait le jour où « Étaler sur le
  clavier » a rendu cent trente cents de faux avec tous les nœuds au vert.

```bash
npm run test:empreintes-exemples
EXEMPLE=un-son-projete-en-microtonal npm run test:empreintes-exemples
ECRIRE_EMPREINTES_EXEMPLES=1 npm run test:empreintes-exemples
```

  Il **mesure son propre bruit** avant de surveiller : l'établissement joue chaque exemple trois
  fois et déclare *variable* ce qui ne se reproduit pas. La comparaison tolère un pour cent sur la
  valeur efficace et cinq sur la crête — une crête est **un seul échantillon sur des millions**,
  donc la statistique la plus fragile du relevé. Les exemples qui attendent un fichier de
  l'utilisateur sont hors de portée, mécaniquement.
- **`src/docs/couverture-empreintes.test.ts`** — refuse qu'un worker de calcul existe sans être
  réclamé par un composant surveillé, et exige que tout dialogue de worker soit inscrit dans la
  liste qu'il consulte. Sortir un calcul du fil force donc à étendre la surveillance.
- **`tests-e2e/banc-mesure.ts`** — l'instrument de mesure d'un composant, qui porte cinq précautions
  écrites en tête de fichier : prouver la version chargée, un composant par page neuve, mesurer le
  gel par `MessageChannel` (zéro message signifie un gel **total**, non l'absence de gel), une
  entrée déterministe, et canoniser les choix comme le moteur le fait. **Ne pas improviser un script
  de mesure : employer ce banc**, par le guichet qui le rend joignable sur un seul composant :

```bash
COMPOSANT=echo-ping-pong npm run mesurer
```

  Il rend la durée, le gel du fil, le message du nœud et l'empreinte de chaque sortie, et son code de
  sortie vaut un si le composant lève. `PARAMETRES` prend un objet JSON de réglages, `MARQUEURS` une
  liste de motifs à chercher dans la source exécutée, `ENTREES` les rangs d'entrée à nourrir.
- **Comparer une famille** plutôt que de l'affirmer. Devant huit réverbérations, la question n'est
  pas ce que fait chacune mais **laquelle, et pourquoi pas une autre** — et cette réponse n'est dans
  aucun fichier : le registre dit les ports et les réglages, il ne dit pas que l'une allonge le son
  trois fois et l'autre pas du tout. Elle se **mesure**, sur le même banc et le même son d'essai :

```bash
FAMILLE=Réverbération npm run comparer
COMPOSANTS=echo,echo-ping-pong,delay-stereo npm run comparer
```

  Il rend ce qui les sépare — durée rendue, couleur, écart à l'entrée, largeur stéréo, masse et forme
  schaefferiennes, coût — classé par ce que chaque axe dépasse de son propre seuil, puis ce qu'elles
  ont en commun. **Ne jamais écrire cette comparaison à la main** : une seconde description tenue à
  côté du dépôt vieillit sans que rien ne le dise, et c'est la faute que ce dépôt paie le plus cher.
- **Écouter**, parce que ce logiciel produit des sons et non des graphes. Les quatre verbes
  précédents rendent du texte ; celui-ci rend des WAV, sur le même son d'essai déterministe :

```bash
COMPOSANT=reverbe-hachee npm run ecouter
FAMILLE=Écho npm run ecouter
```

  Les fichiers vont dans `ECOUTE/`, une sortie audio par fichier, **toujours suffixée de son rang** —
  sans quoi un composant à deux sorties en écraserait une sans rien dire. Le son d'essai part avec,
  sous `_entree.wav` : on ne juge pas un effet sans entendre ce qui y est entré.
- **Exécuter un graphe entier**, parce que les cinq verbes précédents ne voient qu'un composant
  **isolé** sur un banc, ou un registre. Un défaut né de la **rencontre** de deux composants n'est
  visible que d'ici — et le défaut des cent trente cents de « Étaler sur le clavier » en était un :
  deux chemins de construction de banque dont chacun, pris seul, était juste.

```bash
GRAPHE=un-son-projete-en-microtonal npm run executer
GRAPHE=exemples/canon-de-proportions.json npm run executer
```

  Il rend l'état et le message de **chaque** nœud — pas seulement de ceux qui ont levé, car un nœud
  « Terminé » qui ne fait rien entendre est le symptôme d'un câble oublié — puis écrit dans
  `EXECUTION/<graphe>/` le WAV de chaque aperçu, suffixé de son rang, avec son rapport. Son code de
  sortie vaut un si un nœud a levé, jamais sur ce qu'on a entendu : exécuter n'est pas juger.

  **Le pilotage est dans `tests-e2e/pilote-graphe.ts`, et ne se recopie pas.** Semer un graphe,
  presser Lancer, savoir quand le run est fini et quand les aperçus se sont posés : trois
  corrections y sont écrites, chacune payée d'une mesure fausse. `empreintes-exemples.spec.ts`
  l'emploie aussi, et c'est tout ce qui les sépare.
- **Entendre tout le catalogue d'un coup**, parce que savoir ce que fait un composant qu'on n'a
  jamais employé demandait encore de le poser, de le câbler et de le lancer — cinq cents fois ce
  geste. Un clip par sortie audio, tous sur **le même son**, et ce son seul sous `_reference.wav` :

```bash
CATALOGUE=1 npm run catalogue
CATALOGUE=1 COMPOSANTS=reverbe-hachee,distorsion npm run catalogue
```

  **Quatre décisions le définissent, et elles sont de Fabien.** Le son de référence est un fichier
  versionné, `tests-e2e/son-de-reference.wav`, et **non** le son d'essai du banc : celui-ci est fait
  pour mesurer, et une réverbération sur deux sinus ne dit rien à l'oreille. Les clips sont en
  **32 bits flottants**, bornés à **six secondes** — une sortie ne fait pas la durée de son entrée,
  mesuré : deux secondes à l'entrée de `paulstretch` en rendent 16,043 — et le son est rééchantillonné
  à 48 kHz pour que deux clips voisins se comparent. **Le relevé dit toujours les deux durées**,
  celle qu'on entend et celle qui a été rendue.

  **Ce son plafonne à 12 kHz**, étant échantillonné à 24 kHz : aucun composant qui agit dans l'octave
  du haut ne montrera quoi que ce soit ici. C'est le périmètre du catalogue, et il est écrit.

  **Ce n'est pas un garde** : il ne tombe que si l'instrument est cassé, aucun clip produit. Un
  composant qui demande un modèle absent ou l'application de bureau n'est pas une faute ; le relevé
  le dit, nœud par nœud, dans `CATALOGUE/catalogue.json`.

  **Le dernier catalogue rendu vit sur la release `assets`**, plutôt que dans git : 312 Mo de clips,
  194 Mio compressés. Il se récupère sans le refabriquer, ce qui coûte vingt-deux minutes :

```bash
gh release download assets -p catalogue-sonore-2026-10-25.zip
sha256sum catalogue-sonore-2026-10-25.zip   # 6aa1fc8233d19a664644e70a27e1eb9d3b4b9959c7e5871128b05ee97853f5c4
```

  **SON NOM PORTE SA DATE, ET C'EST LA RÈGLE DU DÉPÔT QUI LE VEUT** : `gh release upload` est lancé
  sans `--clobber`, de sorte qu'un asset de même nom au contenu différent est refusé — les
  installations vérifient une empreinte, et deux contenus sous un seul nom la feraient mentir. Un
  catalogue régénéré change donc de nom, et l'ancien reste téléchargeable tel qu'il a été entendu.
  Le relevé de ce catalogue-ci : les **367 composants qui rendent de l'audio**, **288 clips**, zéro
  erreur, 89 sans sortie audio.
- **Faire varier un réglage**, parce que **ce qui est intéressant n'est pas un son mais une
  différence entre au moins deux**. C'est Fabien qui l'a formulé, et c'est par ce trou qu'un défaut
  est passé : `comparer` et `écouter` savent mettre côte à côte N composants **différents**, mais
  leur `PARAMETRES` est un seul jeu appliqué à **tous** les membres. Un composant à trois valeurs
  d'un même curseur leur était hors d'atteinte — et « Déréverbération » y a caché un réglage presque
  inerte pendant toute sa vie.

```bash
COMPOSANT=dereverberation REGLAGE=Mémoire VALEURS=5,10,20 npm run varier
COMPOSANT=distorsion REGLAGE=Drive VALEURS=0,25,50,75,100 npm run varier
COMPOSANT=dereverberation REGLAGE=Mémoire VALEURS=5,20 SON=un/son/reverbere.wav npm run varier
```

  **Il rend un tableau par tranches** — une ligne par demi-seconde, une colonne par valeur, plus
  celle de l'entrée — et **deux relevés qu'il ne faut pas confondre** : ce que le composant *fait*,
  écart le plus grand à l'entrée, et ce que le réglage *change*, écart à la première valeur. Un
  réglage qui ne bouge ni l'énergie ni la crête de plus d'un demi-décibel est **déclaré inerte**.

  **LE RÉSUMÉ NE CHERCHE QUE DANS CE QUI S'ENTEND**, soixante décibels sous la tranche la plus forte
  de l'entrée. Sans cette borne il annonçait le même « −40 dB » pour trois réglages différents, dans
  la seule tranche inaudible du fichier : c'est la troisième fois que ce dépôt paie un nombre unique
  pris sur un signal qui décroît.

  **Et une variation n'est visible que sur une matière que le composant peut travailler.** Sur le
  son de référence, qui est sec, faire varier une déréverbération ne montre rien. `SON=` est là pour
  cela.
- **Régénérer les tables** après toute modification qui les concerne :

```bash
npm run docs:components && npm run docs:lignes && npm run docs:dependances && npm run docs:interface && npm run docs:modulables
```

**Un défaut qui revient se contractualise.** Le corriger ne suffit pas : il doit devenir un test
permanent, et ce test doit être **prouvé en plantant la faute** qu'il est censé attraper. Un garde
jamais vu rouge ne garde rien.

## 6. Les pièges relevés, et comment ne pas y retomber

- **Le substitut pris pour la propriété.** `grep AudioBuffer` n'est pas « dépend du Web Audio » ;
  `rmsApres < rmsAvant` n'est pas « le bruit a été retiré ». `DEPENDANCES-AUDIO.md` dit la classe de
  chaque module audio — *rendu*, *récipient*, *pur* : la lire au lieu de la deviner.
- **Un garde cherche une FORME, jamais un nom.** Chercher un nom de fonction là où c'est l'import
  qui dit la dépendance a laissé passer des cas entiers.
- **Un balayage du catalogue se fait en trois classes, jamais en une** : les composants audio vers
  audio, ceux qui prennent de l'audio sans en rendre, et ceux sans entrée audio. Un relevé publié
  sur la seule première classe a manqué les deux pires cas du dépôt. Tout chiffre annoncé sur « le
  catalogue » porte le dénominateur de ce qui a été balayé.
- **L'instrument qui mesure sa propre cécité.** Avant de croire un banc, lui faire mesurer un cas
  dont la réponse est déjà connue. Un banc de conformité porte une assertion sur le nombre de cas
  réellement éprouvés, sinon il passe au vert en n'exerçant plus rien.
- **Les séquences d'échappement.** Les outils d'écriture et les heredocs écrivent de **vrais**
  caractères de contrôle : un `\n` voulu littéral doit passer par une construction explicite.
  `src/docs/caracteres-controle.test.ts` attrape ce qui aurait filé.
- **Un champ posé sur un nœud est perdu à la sauvegarde** tant qu'il n'est pas déclaré dans
  `src/core/saisies.ts`, dont la table pilote les deux bouts de la persistance.
- **Le hasard se tire du générateur commun** (`src/core/hasard.ts`), jamais d'un générateur local :
  quinze modules avaient écrit le leur, et il perdait ses bits de poids faible.
- **Un diagnostic s'annonce avec l'expérience qui le réfuterait**, énoncée et exécutée dans le même
  geste.

## 7. Où lire le reste

| Besoin | Fichier |
|---|---|
| Ajouter un composant | `ADDING-A-NODE.md` |
| En retirer un | `REMOVING-A-NODE.md` |
| Réutiliser le cœur pour un autre domaine | `PORTING-A-DOMAIN.md` |
| Comprendre les couches et leurs frontières | `ARCHITECTURE.md`, `APP-BREAKDOWN.md` |
| Savoir ce que fait chaque composant | `COMPONENTS.md` (généré) |
| Savoir ce qu'un module audio peut quitter le fil | `DEPENDANCES-AUDIO.md` (généré) |
| Savoir quel composant une table partagée touche | `INTERFACE.md` (généré) |
| Taille des fichiers, norme de 200 à 400 lignes de code, **contraignante** | `src/docs/generer-compte-lignes.test.ts` ; `npm run docs:lignes` pour la table, engendrée à la demande et hors du dépôt |
| Lire le catalogue en **données** plutôt qu'en prose | `npm run decrire` écrit `DESCRIPTION.json` : ports, contenus, réglages et leurs bornes, sans les notices, engendré à la demande et hors du dépôt |
| Relire un graphe **écrit à la main** avant de le lancer | `GRAPHE=chemin.json npm run valider` : contenus mal branchés, fiches inconnues, entrées obligatoires en l'air |
| Mesurer **un composant** sans improviser de script | `COMPOSANT=id npm run mesurer` : durée, gel du fil, message, empreinte de chaque sortie, par le banc et ses cinq précautions |
| Choisir **entre des composants** qui couvrent le même besoin | `FAMILLE=nom npm run comparer` : ce qui les sépare et de combien, mesuré sur le même son d'essai — jamais écrit à la main |
| **Entendre** ce qu'un composant ou une famille produit | `COMPOSANT=id npm run ecouter`, ou `FAMILLE=nom` : des WAV dans `ECOUTE/`, le son d'essai sec avec eux |
| **Lancer un graphe entier** et entendre ce qu'il rend | `GRAPHE=nom npm run executer` : l'état et le message de chaque nœud, le WAV de chaque aperçu dans `EXECUTION/` — le seul verbe qui voie des composants **câblés ensemble** |
| **Entendre tout le catalogue** sur un même son | `CATALOGUE=1 npm run catalogue` : un clip par sortie des 367 composants qui rendent de l'audio, bornés à six secondes, dans `CATALOGUE/` avec leur manifeste |
| Savoir **ce qu'un réglage change**, et non ce qu'il vaut | `COMPOSANT=id REGLAGE=nom VALEURS=a,b,c npm run varier` : un clip par valeur, un tableau par tranches avec la colonne de l'entrée, et le réglage déclaré **inerte** s'il ne bouge ni l'énergie ni la crête |
| Ce qui a été fait, avec les chiffres | `CHANGELOG.md` |

La documentation la plus dense n'est pas dans ces fichiers mais **en tête des modules** : chaque
fichier de `src/audio/`, `src/core/` et `src/plugins/` porte en commentaire ce qu'il fait, pourquoi
il est écrit ainsi, et quelle faute son écriture actuelle empêche. Les lire avant de les modifier
épargne de refaire une erreur déjà payée.
