# AGENTS.md — travailler sur Attic

Attic est un éditeur nodal pour la musique et le son : Electron, Vite, React 19, TypeScript,
469 composants. Le cœur (`src/core/`) ignore l'audio ; l'audio est un adaptateur branché dessus
(voir `PORTING-A-DOMAIN.md`). L'interface et les notices sont bilingues français / anglais.

**La règle qui gouverne toutes les autres : ici, une affirmation se mesure.** Un chiffre annoncé
sans avoir été relevé est traité comme une faute, pas comme une approximation. Le dépôt porte pour
cela un banc de mesure, une base d'empreintes et seize gardes sur lui-même : ils s'emploient, ils
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
   (section 4) ou exercer le chemin réel. Un comportement non vérifié à l'écran se dit « non
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
- Les tables générées (`COMPONENTS.md`, `LINE-COUNT.md`, `DEPENDANCES-AUDIO.md`, `INTERFACE.md`,
  `MODULABLES.md`) et `tests-e2e/empreintes.json` ne peuvent être cohérentes qu'en un point de
  l'arbre : les régénérer avant de committer, et préférer un commit entier à plusieurs commits dont
  certains échoueraient à leurs propres gardes.

## 3. Les quatre contrats

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

## 4. Les gardes exécutables, et comment s'en servir

Ceux-là ne dépendent d'aucun harnais : `npx vitest run` les heurte tous.

- **`src/docs/*.test.ts`** — seize contrats sur le dépôt lui-même : registre des réglages, graines,
  cœurs par trames, registre anglais, caractères de contrôle, style de documentation, classement
  théorique, contrat de graphe, et la fraîcheur de chaque table générée.
- **`tests-e2e/empreintes.json` + `empreintes.spec.ts`** — l'empreinte du son de 71 composants
  surveillés, valeur efficace et crête à neuf décimales, plus leur message. Toute modification qui
  altère une sortie fait échouer ce test. Pour l'étendre :

```bash
DEV_URL=http://localhost:5175 ECRIRE_EMPREINTES=1 npx playwright test tests-e2e/empreintes.spec.ts
```

  **Relire le diff avant de committer** : une empreinte qui change est soit un progrès voulu, soit
  exactement le défaut que ce fichier existe pour attraper.
- **`src/docs/couverture-empreintes.test.ts`** — refuse qu'un worker de calcul existe sans être
  réclamé par un composant surveillé, et exige que tout dialogue de worker soit inscrit dans la
  liste qu'il consulte. Sortir un calcul du fil force donc à étendre la surveillance.
- **`tests-e2e/banc-mesure.ts`** — l'instrument de mesure d'un composant, qui porte cinq précautions
  écrites en tête de fichier : prouver la version chargée, un composant par page neuve, mesurer le
  gel par `MessageChannel` (zéro message signifie un gel **total**, non l'absence de gel), une
  entrée déterministe, et canoniser les choix comme le moteur le fait. **Ne pas improviser un script
  de mesure : employer ce banc.**
- **Régénérer les tables** après toute modification qui les concerne :

```bash
npm run docs:components && npm run docs:lignes && npm run docs:dependances && npm run docs:interface && npm run docs:modulables
```

**Un défaut qui revient se contractualise.** Le corriger ne suffit pas : il doit devenir un test
permanent, et ce test doit être **prouvé en plantant la faute** qu'il est censé attraper. Un garde
jamais vu rouge ne garde rien.

## 5. Les pièges relevés, et comment ne pas y retomber

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

## 6. Où lire le reste

| Besoin | Fichier |
|---|---|
| Ajouter un composant | `ADDING-A-NODE.md` |
| En retirer un | `REMOVING-A-NODE.md` |
| Réutiliser le cœur pour un autre domaine | `PORTING-A-DOMAIN.md` |
| Comprendre les couches et leurs frontières | `ARCHITECTURE.md`, `APP-BREAKDOWN.md` |
| Savoir ce que fait chaque composant | `COMPONENTS.md` (généré) |
| Savoir ce qu'un module audio peut quitter le fil | `DEPENDANCES-AUDIO.md` (généré) |
| Savoir quel composant une table partagée touche | `INTERFACE.md` (généré) |
| Taille des fichiers, norme de 200 à 400 lignes de code | `LINE-COUNT.md` (généré) |
| Ce qui a été fait, avec les chiffres | `CHANGELOG.md` |

La documentation la plus dense n'est pas dans ces fichiers mais **en tête des modules** : chaque
fichier de `src/audio/`, `src/core/` et `src/plugins/` porte en commentaire ce qu'il fait, pourquoi
il est écrit ainsi, et quelle faute son écriture actuelle empêche. Les lire avant de les modifier
épargne de refaire une erreur déjà payée.
