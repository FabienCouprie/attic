# Réutiliser Attic pour un autre domaine

Attic est un framework nodal **agnostique du domaine**. Le cœur (`src/core/`)
n'importe rien de l'audio : il transporte des valeurs opaques sur un graphe orienté,
les exécute dans l'ordre topologique, propage les erreurs et sait replier un
sous-graphe en méta-composant. L'audio n'est qu'un *adaptateur* branché dessus.
Les quelques mots du métier qu'il porte encore sont nommés au §6.a et au §7.

Ce document décrit les étapes pour brancher un **nouveau domaine** — traitement
d'images, données tabulaires, simulation, texte, robotique — en réutilisant le
cœur, la propagation, les métanodes et l'UI, **sans modifier `src/core/`**.

> **Preuve que ça marche — et jusqu'où elle va exactement.**
> `src/core/domaine-nombre.test.ts` est un second domaine complet
> (`TValeur = number | string`, `TRuntime = null`, 4 micro-plugins, calcule
> `(4×2)+3 = 11`). Il tourne dans la CI à chaque commit, et
> `src/core/cloisonnement.test.ts` prouve que deux registres coexistent sans se
> marcher dessus. Lisez ces deux fichiers : ce sont les exemples de référence, et
> ils sont plus courts que ce guide.
>
> **Ce qu'ils prouvent est l'agnosticisme du CŒUR, et rien de plus.** Depuis le
> 2026-11-11, le test emploie la vraie boucle du cœur, `preparerLaPasse`, les sauts
> de boucle puis `executerLesNoeuds`, appelée comme le moteur de l'interface
> l'appelle : une faute plantée dans la boucle le fait tomber. Mais il **ne touche
> aucun fichier du shell** : il recopie les réponses neutres de
> `ui/services-apercu.ts`, et n'emploie ni `ui/moteur/` ni aucun poteau. Les six
> poteaux du §6 sont donc prouvés **sans domaine** — un garde tient qu'ils n'en
> importent rien, et que le registre des vues reste vide tant que le domaine ne
> s'est pas déclaré — mais **jamais prouvés remplissables** : rien ne démontre
> encore qu'un second domaine qui les remplit obtient une interface qui
> fonctionne. C'est la pièce qui manque à ce document, et la connaître vaut mieux
> que de la découvrir en portant.

---

## 0. Ce que vous réutilisez, et ce que vous écrivez

| Couche | Fichiers | Réutilisé tel quel ? |
|---|---|---|
| **Cœur** — registre, tri topologique, validation, métanodes, cache, boucle d'exécution | `src/core/**` | ✅ intégralement, sans modification |
| **Shell** — canevas, palette, inspecteur, moteur, persistance | `src/ui/**` | ⚠️ presque : il demande au lieu d'importer, **sauf les fichiers que `src/docs/frontiere-domaine.test.ts` épingle** (voir §6.a) |
| **Traductions** — les libellés, les notices, les deux langues | `src/i18n.tsx` | ✅ le mécanisme ; vos textes sont à vous (voir §6.c) |
| **Racine de composition** — ce qui joint les deux | `src/composition.ts` | ❌ vous écrivez la vôtre (≈ 15 lignes) |
| **Adaptateur** — registre typé, types de flux, câblage | `src/audio/adaptateur.ts` | ❌ vous en écrivez un (≈ 30 lignes) |
| **Plugins** — les nœuds eux-mêmes | `src/plugins/**` | ❌ vous écrivez les vôtres |
| **Vues de nœud** — ce qu'un nœud montre sous son en-tête | `src/vues-domaine/**` | ❌ facultatif ; les vôtres, dans votre répertoire |

Le travail réel est donc : **un fichier de types + un adaptateur + une racine de
composition + vos plugins**.

Des vues de nœud propres à votre domaine, des liens de barre d'outils et des
genres de paramètre se déposent de la même façon, et sont **facultatifs** : ce
que vous ne déposez pas n'existe pas, et rien ne casse.

> **Le shell n'est pas un répertoire, et c'est ce qui a coûté le plus cher.**
> `src/core/` en est un : y toucher se voit dans un diff. La frontière entre le
> shell et le domaine n'en était pas une, si bien qu'aucun geste ne se
> reconnaissait comme la franchissant — et la rupture a été exactement
> proportionnelle à cette absence de contrôle. C'est pourquoi les vues du domaine
> ont leur répertoire à elles, et pourquoi un garde compte ce qui reste (§6.a).

---

## 1. Déclarer les types du domaine

Le cœur est générique sur deux paramètres, **sans valeur par défaut** :

- `TValeur` — l'union des valeurs qui circulent sur les arêtes ;
- `TRuntime` — l'environnement d'exécution opaque, transmis tel quel aux plugins.

L'absence de défaut est délibérée : elle **empêche** un nouveau domaine de se
lier silencieusement à l'union audio. Le compilateur vous force à les nommer.

`ContexteExecution` et `FonctionPlugin` en prennent un troisième, `TNom`, l'union
des noms de réglage que la fiche déclare. Il vaut `string` par défaut, et c'est
lui qui fait vérifier par le compilateur le nom passé à `paramNombre` et
`paramTexte` (voir §3).

Créez `src/<domaine>/types-domaine.ts` — un fichier feuille qui n'importe que
depuis `core`, donc aucun risque de cycle :

```ts
// src/image/types-domaine.ts
import type { PluginDef, ContexteExecution, FonctionPlugin } from "../core";

// L'union de tout ce qui peut circuler sur une arête de VOTRE domaine.
export type ValeurImage = ImageBitmap | ImageData | File | string | null;

// Ce dont vos plugins ont besoin pour s'exécuter. Le cœur ne le lit jamais.
export type RuntimeImage = OffscreenCanvasRenderingContext2D;

export type FicheImage     = PluginDef<ValeurImage, RuntimeImage>;
export type ContexteImage  = ContexteExecution<ValeurImage, RuntimeImage>;
export type FonctionImage  = FonctionPlugin<ValeurImage, RuntimeImage>;
```

**Règle :** vos plugins et votre UI utilisent `FicheImage`, **jamais `PluginDef`
nu**. C'est exactement ce que fait le domaine audio avec `FicheAudio`
(`src/audio/types-domaine.ts`).

Le domaine audio va un cran plus loin : chaque fiche passe par `fiche({...})` de
`src/plugins/fiche.ts`, qui déduit `TNom` de ses `parametres`, si bien qu'un nom de
réglage mal écrit fait tomber `tsc`, et `src/plugins/fiche.test.ts` exige ce
passage de chaque fiche. Ce module importe les types audio : votre domaine en
écrit l'équivalent sur ses propres types.

`TRuntime` peut être `null` si vos plugins n'ont besoin de rien (c'est le cas du
domaine nombre). Il n'a pas à être une classe : un objet de services, un pool de
workers, une connexion — le cœur le transporte sans jamais le regarder.

---

## 2. Écrire l'adaptateur

L'adaptateur est le **seul** endroit où le domaine inscrit ses fiches natives par
`enregistrer()`. Le cœur et le shell y inscrivent ensuite des fiches dérivées, un
méta-composant (`core/metastore.ts`), un nœud installé (`core/nodes-installes.ts`),
une bulle (`ui/fichesBulles.ts`), sans que vous ayez à les écrire. Importer un
module de plugin n'a aucun effet de bord : les fiches sont *exportées*, pas
auto-enregistrées. C'est ce qui rend l'ordre d'import sans importance.

```ts
// src/image/adaptateur.ts
import { creerRegistre, type Registre } from "../core";
import { configurerRegistreMeta, configurerRegistreNodes } from "../core";
import { toutesLesFiches } from "../plugins-image";
import type { ValeurImage, RuntimeImage } from "./types-domaine";

// Un domaine neuf n'a pas d'ancien identifiant. Le jour où il renomme une fiche,
// il remet la table à son registre : `creerRegistre<…>({ alias: ALIAS })`, comme
// `audio/adaptateur.ts` avec `audio/alias.ts`. Le cœur n'en porte aucune.
export const registre = creerRegistre<ValeurImage, RuntimeImage>();

// 1) Les types de flux du domaine : id, couleur du port, libellé.
registre.enregistrerTypeFlux({ id: "image",  couleur: "#7048e8", libelle: "Image" });
registre.enregistrerTypeFlux({ id: "masque", couleur: "#f59f00", libelle: "Masque" });
registre.enregistrerTypeFlux({ id: "nombre", couleur: "#36a2eb", libelle: "Nombre" });

// 2) Les fiches, puis le socle figé : un nœud installé ou un méta reçu ne
//    pourra plus prendre l'identifiant d'une fiche native.
for (const fiche of toutesLesFiches) registre.enregistrer(fiche);
registre.figerLesNatifs();

// 3) Les modules du cœur qui ont besoin d'un registre (injection, pas singleton).
//    Ils fabriquent des fiches dérivées et attendent `Registre<unknown, unknown>` :
//    `Registre` étant invariant, le transtypage se dit, côté domaine.
const commeGenerique = registre as unknown as Registre<unknown, unknown>;
configurerRegistreMeta(commeGenerique);
configurerRegistreNodes(commeGenerique);
```

### Types de flux et compatibilité

Un type de flux porte encore, au besoin, une `forme` de port, et un prédicat
`estDuType` par lequel le moteur rapporte, à l'exécution, une valeur qui ne
correspond pas au type de son port (`core/types-au-port.ts`) : il la rapporte et ne
la refuse pas, et un type sans prédicat n'est pas vérifié.

Par défaut, deux ports sont connectables si leurs `id` sont **égaux**. Pour une
compatibilité plus large (ex. un masque accepté là où une image est attendue),
déclarez `compatible` :

```ts
registre.enregistrerTypeFlux({
  id: "masque", couleur: "#f59f00", libelle: "Masque",
  compatible: (cible) => cible === "masque" || cible === "image",
});
```

### Le contenu d'un port, quand le type ne suffit plus

Un type de flux dit le **transport**. Il arrive qu'il ne dise pas assez : dans le
domaine audio, une notation `C4 0.5`, un ABC, un prompt de modèle et un plan de
chanson sont tous du `texte`, et le graphe autorisait donc toutes les
combinaisons — relier « Prompt → graphe », qui rend un plan, à « Texte → MIDI »,
qui attend une notation, était licite, aux couleurs accordées, et rendait zéro
note. Un port déclare donc, en plus de son type, un `sousType` :

```ts
registre.enregistrerTypeFlux({
  id: "texte", couleur: "#9775fa", libelle: "Texte",
  // Deux contenus DÉCLARÉS et différents se refusent ; un contenu absent passe partout.
  sousTypesCompatibles: (source, cible) => !source || !cible || source === cible,
});

// puis, sur la fiche :
entrees: [{ nom: "Notation", type: "texte", sousType: "notation" }],
```

**Le cœur ne lit jamais ce que `sousType` contient.** C'est une chaîne que le
domaine interprète, exactement comme la couleur et la forme : ce que le cœur a
gagné est un **emplacement** pour la règle, que le domaine fournit en fermeture.

> **LE REFUS EST AU GESTE, ET JAMAIS À LA LECTURE, et c'est l'asymétrie qui rend
> le resserrement sûr.** `registre.fluxCompatibles(source, cible, sousTypeSource,
> sousTypeCible)` prend les deux derniers en **facultatifs** : la pose d'une arête
> à la souris les passe et se fait refuser, la relecture d'un graphe déjà
> enregistré ne les passe pas et accepte ce qu'elle a toujours accepté.
> **Resserrer une règle ne doit pas effacer du travail déjà fait.** Si vous posez
> une telle règle, le cas à écrire n'est pas sur la règle elle-même — il passerait
> au vert en cassant l'asymétrie — mais sur ses **appelants** : la relecture, qui ne
> passe pas les sous-types, et les deux qui les passent, la pose d'une arête et
> `validerAssemblage` de `core/validation.ts`, qui relit un graphe écrit à la main
> avant qu'il soit lancé.

Un contenu peut n'être qu'une **destination** : dans le catalogue audio, `prompt`
n'a aucun producteur et compte quand même, parce qu'il refuse ce qui va vers lui.

Les types de flux vivent **dans la fermeture du registre**, pas dans un `Map`
global. Deux domaines peuvent déclarer un type homonyme (`"nombre"` existe dans
le domaine nombre *et* pourrait exister chez vous) sans collision — c'est
précisément ce que verrouille `cloisonnement.test.ts`.

---

## 3. Écrire un plugin

Une fiche décrit **tout** ce que le cœur et l'UI ont besoin de savoir : identité,
classement dans la palette, documentation, ports typés, paramètres, et la
fonction d'exécution.

```ts
// src/plugins-image/flou.ts
import type { FicheImage } from "../image/types-domaine";

export const fiches: FicheImage[] = [
  {
    id: "image:flou",
    nom: "Flou gaussien",
    nomEn: "Gaussian blur",
    univers: "Traitement",        // 1er niveau de la palette
    famille: "Filtres",           // 2e niveau
    resume: "Applique un flou gaussien.",          // OBLIGATOIRE
    resumeEn: "Applies a Gaussian blur.",
    notice: "Le rayon est exprimé en pixels…",     // recommandé (avertissement en DEV si absent)
    entrees:  [{ nom: "Image", type: "image" }],
    sorties:  [{ nom: "Image", type: "image" }],
    parametres: [
      { nom: "Rayon", nomEn: "Radius", plage: [0, 50], defaut: 5, unite: "px" },
    ],
    async executer(ctx) {
      const src = ctx.entree(0);
      if (!(src instanceof ImageBitmap)) return { valeurs: [null], erreur: true, message: "Aucune image." };
      const rayon = ctx.paramNombre("Rayon", 5);
      ctx.onProgress("Flou en cours…");
      return { valeurs: [await flouter(src, rayon, ctx.runtime)], message: `Flou ${rayon} px` };
    },
  },
];
```

### Le contexte reçu par `executer`

```ts
ctx.noeud              // { id, data } — data porte ce que la personne a posé sur le nœud, en lecture
ctx.runtime            // votre TRuntime, transmis tel quel
ctx.repertoireTravail  // string
ctx.entree(i)          // valeur du port d'entrée i, null s'il n'est pas branché
ctx.entrees()          // une valeur par câble entrant, dans l'ordre des arêtes
ctx.sortieBranchee?.(i) // une sortie de ce nœud est-elle branchée ? (facultatif)
ctx.paramNombre(nom, defaut)  // nom : un réglage que la fiche déclare (TNom)
ctx.paramTexte(nom, defaut)
ctx.onProgress(msg)    // remonte un texte de progression sur le nœud
ctx.signal             // AbortSignal du run, à consulter dans une boucle longue (facultatif)
```

Le cœur **garantit** que `ctx.entree(i)` est non-null pour les ports
obligatoires : `validerGraphe` refuse d'exécuter avant. Un port optionnel se
déclare `requis: false` — c'est alors à votre plugin de gérer le `null` que
`ctx.entree(i)` rend quand il n'est pas branché. `ctx.entrees()` ne suit pas les
rangs des ports : il rend une valeur par câble entrant, `null` pour une source qui
n'a encore rien rendu, et c'est la lecture d'un port qui reçoit plusieurs câbles.

### Ce que rend `executer`

`valeurs` est un tableau parallèle aux `sorties`, un élément par port déclaré,
même en échec. `message` s'affiche sur le nœud, `erreur: true` déclare l'échec
(§4). Trois canaux disent le reste, et **un exécuteur n'écrit rien sur
`ctx.noeud.data`** : `affichage`, ce que le run a produit et que la vue montre,
qu'une remise à zéro et un changement de réglage effacent ; `designe`, ce qu'il a
désigné de ses entrées, qu'un réglage garde ; `moteur`, ce qu'il demande au moteur
(`DemandeAuMoteur` de `core/types.ts`). Une passe lit d'ailleurs une copie du
graphe prise à son départ, et une écriture sur `data` s'y relève
(`core/instantane-de-graphe.ts`).

### Ports à plusieurs câbles, ports extensibles

`dynamique: true` sur un port d'entrée lui fait accepter plusieurs câbles, là où
un câble neuf remplace sinon le précédent ; le plugin les lit par `ctx.entrees()`.
Un nœud dont les ports s'allongent à la demande déclare `entreesExtensibles` ou
`sortiesExtensibles` sur sa fiche.

---

## 4. Le contrat d'échec — à lire avant d'écrire le premier plugin

C'est le point le plus facile à rater, et il a coûté un bug réel : un workflow
pouvait se déclarer « terminé » alors qu'une branche entière n'avait rien produit.

**Un plugin qui échoue DOIT le déclarer.** Trois mécanismes, complémentaires :

| # | Mécanisme | Qui le fait |
|---|---|---|
| 1 | `return { valeurs: [...], erreur: true, message: "…" }` | **vous**, dans le plugin |
| 2 | Sortie entièrement nulle sur un nœud *qui a des ports de sortie* ⇒ échec déduit, sauf si la fiche déclare `sortieNullePermise` | le moteur, automatiquement |
| 3 | Une entrée en erreur ⇒ le nœud est marqué en erreur sans être exécuté | le moteur, automatiquement |

Le filet (2) rattrape les plugins qui oublient `erreur: true`, mais **ne vous
dispense pas** de le poser : lui seul porte un message exploitable, et un nœud
sans sortie (un exporteur, un afficheur) n'est pas couvert par le filet.

L'erreur se propage ensuite transitivement le long des arêtes : toute la
descendance d'un nœud fautif passe en `erreur` avec la mention de la source.
Une exception levée dans `executer` est capturée, journalisée
(`console.error`) et traitée comme un échec.

**Métanodes :** dès qu'un nœud *interne* échoue, le méta-nœud qui le contient
passe en erreur immédiatement — via la table `expansions` retournée par
`aplatirGraphe`, qui remonte chaque id aplati vers son méta d'origine. Sans ce
mécanisme, un méta suivant s'exécutait « comme si de rien n'était ».

---

## 5. Ce que le cœur vous donne gratuitement

Rien de ce qui suit n'est à réécrire.

**Exécution** — `ordreTopologique(ids, aretes)` (tri de Kahn, cycles exclus),
`ancetres(cible, aretes)` pour n'exécuter que ce dont un nœud dépend (le
bouton ▶ d'un nœud), son symétrique `descendants(depart, aretes)` pour savoir ce
qu'un changement périme, `ordreDeLecture` pour présenter un graphe de l'amont
vers l'aval, `resoudreEntree` / `valeursEntrantes` pour le câblage.

> **L'asymétrie entre `ancetres` et `descendants` est voulue et documentée à
> l'endroit du piège** : `ancetres` inclut sa cible, `descendants` l'exclut.
> C'est au point d'appel de dire lequel des deux modes il veut.

**Boucle d'exécution** — `preparerLaPasse` (`core/preparation-passe.ts`), les sauts
de boucle (`core/saut-de-boucle.ts`), puis `creerTablesDePasse` et
`executerLesNoeuds` (`core/execution.ts`) : la boucle nœud par nœud, ce que le
moteur fait du retour d'un exécuteur, et les événements qu'elle émet. Ces modules ne
sont pas réexportés par `core/index.ts` : on les importe par leur chemin, comme le
fait `domaine-nombre.test.ts`, qui montre l'appel minimal. Les commandes, les
événements et les questions qui séparent l'interface du moteur sont écrits en
types dans `core/protocole-moteur.ts`.

**Cache** — un nœud rend son résultat d'avant quand ni ses réglages, ni le câblage
de ses entrées, ni les valeurs qu'il reçoit, ni, s'il l'a consulté par
`sortieBranchee`, le câblage de ses sorties n'ont changé : ce sont les quatre
empreintes de `core/cache-execution.ts`. Une fiche `jamaisCache` rejoue toujours,
et un nœud qui a tourné entraîne sa descendance. Les branches parallèles
indépendantes ne se réinvalident pas mutuellement.

**Validation** — `valider(def, deps)` refuse une fiche mal formée à
l'enregistrement (résumé manquant, type de flux inconnu…). `validerGraphe`
vérifie avant exécution que les ports obligatoires sont connectés et que les
types reliés sont compatibles.

**Métanodes** — `creerMeta` replie une sélection en composant réutilisable,
`aplatirGraphe` le déplie récursivement à l'exécution (imbrication comprise,
garde anti-boucle), `frontieresPourEdition` synthétise les nœuds ▸entrée/sortie◂
pour éditer l'intérieur, `redériverMeta` répercute une modification.
`enregistrerMeta` / `supprimerMeta` / `surChangementMetas` gèrent le catalogue.
**Tout cela est agnostique du domaine.** Vos métanodes fonctionneront avec deux
lignes : l'inclusion des deux nœuds-frontière que le cœur fournit, et celle de leur
type de flux, décrites au §6.a.

**Import de nœuds** — `installerNode` / `chargerNodesInstalles` : des nœuds
livrés en `.zip` et installés à chaud.

### Les verbes de pilotage — ce que vous n'héritez pas

Le dépôt se pilote de l'extérieur par des commandes, que le §5 d'`AGENTS.md`
décrit toutes. Six en sont la base : `npm run decrire`
projette le catalogue en données, `GRAPHE=… npm run valider` relit un graphe écrit
à la main, `COMPOSANT=… npm run mesurer` passe un composant au banc,
`FAMILLE=… npm run comparer` dit ce qui sépare des composants interchangeables,
`COMPOSANT=… npm run ecouter` en rend le **son**, et `GRAPHE=… npm run executer`
lance un graphe **câblé** et rend ce que chaque nœud fait entendre. Cinq autres
les ont rejointes : `catalogue`, `varier`, `graines`, `croisement` et
`messages-anglais`.

**Toutes appartiennent au domaine audio, et aucune ne vous est donnée.**
`plugins/description.ts` et `plugins/assemblage.ts` importent
`audio/adaptateur` ; le banc nourrit les composants d'un **son** d'essai et ses
descripteurs sont des descripteurs sonores. Vous en écrirez d'autres.

Ce qui se reprend est leur **forme**, et elle vaut d'être copiée :

- `validerAssemblage` est dans le cœur : la moitié dure de `valider` est gratuite.
- Un guichet **se tait** quand on ne lui désigne rien, et traverse donc une passe
  complète sans la déranger.
- Son **code de sortie porte le verdict**, sans quoi aucun script ne peut s'en
  servir, et son message dit si c'est le composant ou le dépôt qui est en cause.
- `décrire`, `valider` et `mesurer` **projettent** une vérité qui existe déjà.
  `comparer` est le seul dont la réponse n'est nulle part dans la source — et
  c'est précisément celui qu'il est tentant d'écrire à la main. **Ne le faites
  pas** : une seconde description tenue à côté du dépôt vieillit sans que rien ne
  le dise, et c'est la faute que ce dépôt a payée le plus souvent.
- **Toutes, sauf une, ne voient qu'un composant isolé, ou un registre.** `exécuter`
  est le seul qui regarde des composants **câblés ensemble**, et c'est là que
  vivent les défauts qu'aucun composant seul ne porte : celui des cent trente
  cents naissait de la rencontre de deux chemins dont chacun, pris seul, était
  juste. Si vous n'en reprenez qu'un, reprenez celui-là.
- **Le pilotage d'un graphe se met en commun** (`tests-e2e/pilote-graphe.ts`) :
  semer, lancer, savoir quand c'est fini, relire les aperçus. Six corrections y
  sont écrites en tête, chacune payée d'une mesure fausse, et
  `src/docs/contrat-pilote-de-graphe.test.ts` tient la liste de ses appelants. Un
  second exemplaire les aurait perdues une à une.

---

## 6. Brancher l'UI — par la racine de composition

Le *renderer* de nœud (`AtelierNode.tsx`) est générique : en-tête,
documentation, ports colorés par type de flux et statut sont dessinés à partir
de la fiche, quel que soit le domaine. La palette et l'inspecteur se
construisent à partir des fiches (`univers` / `famille` / `parametres`). Les
trois portent encore chacun un couplage au domaine audio, épinglé au §6.a :
l'écoute multicanal du nœud, l'ordre des univers de la palette, les courbes de
l'inspecteur.

**Le shell demande au lieu d'importer.** C'est le domaine qui vient se faire
connaître, par **six poteaux** déclarés dans `src/ui/`, chacun **vide par
défaut** et n'important rien du domaine :

| Poteau | Ce que le domaine y dépose |
|---|---|
| `ui/registre-actif.ts` | son registre de fiches ; le poteau déclare lui-même `FicheUI`, la fiche telle que le shell la lit |
| `ui/registre-vues.ts` | ce que chaque nœud montre sous son en-tête |
| `ui/favoris.ts` | les liens que la barre d'outils propose |
| `ui/widgets-parametre.ts` | ses genres de paramètre, avec leur saisie |
| `ui/services-apercu.ts` | ce qu'une valeur produite donne à voir et à entendre |
| `ui/services-orchestration.ts` | ce que le moteur pose et demande autour d'un run |

> **`FicheUI` est `Omit<PluginDef<unknown, unknown>, "executer">`, et le `Omit`
> n'est pas cosmétique.** Le shell **lit** une fiche — son nom, ses ports, ses
> paramètres, sa notice — et ne l'exécute jamais. Or `executer` est une propriété
> de type fonction : sous `strictFunctionTypes` son paramètre est strictement
> contravariant, de sorte qu'une fiche concrète ne peut pas entrer dans une fiche
> générique. Retirer le seul membre que le shell n'emploie pas a fait tomber
> trente-trois erreurs de compilation à neuf.

Les dépôts ont lieu dans `src/composition.ts`, **le seul fichier qui devrait
connaître les deux côtés**. Brancher un autre domaine, c'est écrire le vôtre :

```ts
// src/composition.ts
import { registre } from "./image/adaptateur";
import { configurerRegistreUI, type RegistreUI } from "./ui/registre-actif";

configurerRegistreUI(registre as unknown as RegistreUI);
// puis vos vues, vos liens, vos genres de paramètre — ou rien du tout.
```

> **L'ordre des imports est une condition de démarrage.** `ui/App.tsx` fait son
> démarrage au chargement du module (sauvegarde restaurée, méta-composants
> relus) et réclame le registre dès cet instant. `./composition` doit donc être
> le **premier** import de `main.tsx` ; `src/docs/composition.test.ts` le tient.

> **Et `ui/App.tsx` importe encore l'adaptateur audio et les métas d'exemple**
> (`../audio/adaptateur`, `../plugins/meta-exemples`), une dette épinglée au §6.a.
> L'adaptateur audio configure au chargement de son module le metastore, les nœuds
> installés et les services du domaine (`configurerRegistreMeta`,
> `configurerRegistreNodes`, `configurerServicesDomaine`) : tant que ces imports
> restent, il s'évalue après votre racine de composition et réécrit ce que votre
> adaptateur avait configuré. Ce sont les premiers imports à retirer en portant.

Ce qui n'est pas déposé n'existe pas, et le shell le supporte : aucune vue
déclarée, aucun bouton de favoris, aucun genre de paramètre propre. Rien ne
casse, rien ne s'affiche à vide.

### 6.a — Ce qui reste couplé, et le garde qui le compte

`src/docs/frontiere-domaine.test.ts` est la **source de vérité** : il relève les
fichiers du shell qui chargent du calcul du domaine, refuse que la liste
grandisse, et exige qu'un fichier délivré en sorte. Ce document ne répète donc
plus un chiffre qui vieillirait — lisez le test.

Il tient aussi six faits :

- `src/core/` n'importe rien du domaine, et **n'en nomme dans son code aucun des
  mots que le garde énumère**, `AudioBuffer`, `AudioContext`, `"stereo"`, `"mono"`,
  `"sf2instrument"` ;
- `src/core/` n'importe rien du shell non plus : tout chemin qu'il demande se
  résout dans `src/core/` ;
- le cœur fonctionne sans domaine : il traite alors un tampon comme n'importe
  quel objet ;
- les six poteaux n'importent rien du domaine ;
- aucun fichier du shell n'importe la déclaration des vues du domaine ;
- le registre des vues est vide tant que le domaine ne s'est pas déclaré.

La liste des mots ne vaut que ce qu'elle énumère : `core/meta.ts` retombe encore
sur le type `"audio"` pour un port exposé qu'il ne résout pas, et
`core/execution.ts` nomme la fréquence de travail dans les questions qu'il pose
au domaine (`porterALaFrequenceDeTravail`, `frequencesMelees`).

**Les identifiants de fiche ont leur garde à part**, `src/docs/frontiere-identifiants.test.ts`,
né le 2026-11-20 quand la table `ALIAS` a quitté le cœur : aucun des deux cas ci-dessus
ne pouvait la voir, une table de chaînes n'important rien et ne contenant aucun des mots
énumérés. Il lit les chaînes du code de `src/core/` par l'arbre syntaxique, et refuse
celle qui vaut l'identifiant d'une fiche du catalogue ou un de ses anciens identifiants.
Les fiches que le cœur déclare lui-même n'en sont pas, et un cas tient qu'elles ne portent
que des types de flux du cœur. **Quatorze y restent, en trois fichiers, épinglées comme
dettes** avec leur raison : les bouts des boucles (`core/boucle-graphe.ts`), l'instrument
rejoué touche par touche (`core/instrument-graphe.ts`) et la liaison des réglages de
« Courbe » (`core/reglages-lies.ts`). La liste refuse de grandir, et une dette payée doit
en sortir. Un second domaine qui voudrait des boucles devrait donc, aujourd'hui, déclarer
des fiches sous ces identifiants-là.

**Les nœuds-frontière des méta-composants sont fournis par le cœur** depuis le 2026-11-21 :
`core/fiches-du-coeur.ts` déclare leurs deux fiches, `fichesDuCoeur()`, et le type de leur
port, `typesFluxDuCoeur()`. Votre domaine les inclut en deux lignes, la première dans son
catalogue, la seconde dans son registre :

```ts
const fiches = [...mesFiches, ...fichesDuCoeur<MaValeur, MonRuntime>()];
for (const t of typesFluxDuCoeur()) registre.enregistrerTypeFlux(t);
```

Les deux vont ensemble : le registre refuse une fiche dont un port porte un type qu'il n'a
pas. Votre type de valeur doit admettre `null`, que la frontière d'entrée rend.
`src/core/fiches-du-coeur.test.ts` le fait pour un domaine de nombres.

**Le runtime n'est pas encore déposable.** Le moteur du shell crée un
`AudioContext` et le passe à tout exécuteur, `executerLesNoeuds<AudioContext>`
dans `ui/moteur/passe.ts`, l'`AudioContext` étant construit par
`ui/hooks/useExecutionGraphe.ts`. Aucun poteau ne laisse un domaine fournir le
sien : un autre domaine recevrait un `AudioContext` dans `ctx.runtime`. Le garde
ne le voit pas, `AudioContext` étant une globale et non un import.

**Les couplages qui restent portent chacun leur raison dans le test**, et trois ne
sont pas mécaniques. `ui/moteur/pilotes.ts` : ses deux pilotes de passes ne sont
pas des fonctions sur des valeurs mais des **fonctionnalités que le moteur
pilote**, et les sortir demande de reprendre leur structure de boucle.
`ui/dictee/useDictee.ts` porte le couplage du geste, ce qui écoute le micro étant
le shell et ce qu'il doit reconnaître le catalogue du domaine ; un autre domaine
réécrit ce seul fichier. `ui/SelecteurFrequenceDeTravail.tsx` porte celui du
réglage lui-même, une fréquence d'échantillonnage étant une notion audio ; un
autre domaine retire ce fichier et la ligne qui le pose.

> **Le sens inverse est compté lui aussi, mais pas de la même façon.** Relevé le
> 2026-10-25, **trente-deux** fichiers du domaine importent le shell. Quatre sont
> les **dépôts** eux-mêmes — `audio/favoris.ts`, `plugins/apercu-domaine.ts`,
> `plugins/orchestration-domaine.ts` et `vues-domaine/vues.tsx` —, et trois des
> quatre ne prennent qu'un **type**. Vingt-six sont des vues qui emploient un
> lecteur, un badge de statut ou un bouton de copie : bon sens de dépendance
> (§6.c), et **aucune règle ne les gêne**.
>
> **Ce qui est épinglé est la seule part qui pose problème : un EXÉCUTEUR qui lit
> l'interface.** `AUCUN EXÉCUTEUR NEUF NE LIT L'INTERFACE` refuse qu'un fichier du
> domaine, hors des vues, prenne une **valeur** au shell — le résultat du composant
> dépendrait alors de ce que l'écran affiche, donc ne se calculerait plus sans
> interface. Deux dettes y sont inscrites avec leur raison :
> `plugins/boucle-collection.ts`, qui y prend une profondeur d'export, et
> `plugins/message-modele.ts`, un état de téléchargement.
>
> **La définition est mécanique et n'exempte aucun fichier par son nom** : les
> dépôts en sortent parce qu'ils ne prennent qu'un type, non parce qu'on les a
> écartés. Un second cas tient le revers — **une vue a le droit de prendre au
> shell** —, sans quoi la règle serait un interdit général déguisé.
>
> **Pourquoi ce garde existe, et c'est ce document qui l'a réclamé.** Il portait
> ces chiffres à la main : dix-sept, puis trente-deux sans que personne ne le
> sache, pendant que la part qui pose problème descendait de trois à deux. Un
> chiffre écrit dans un document **est** une liste tenue à la main. Le nombre total
> reste écrit ici, et vieillira ; celui qui compte, non.
>
> **Et ce garde a été aveugle quatre fois**, chaque fois parce qu'il décrivait un
> CHEMIN et qu'un chemin change : il ne balayait que `src/ui/`, il ne connaissait
> du domaine que deux répertoires sur six, son motif nommait l'ancien emplacement
> des vues, et il exigeait un `from` — de sorte que l'import d'effet de bord, le
> couplage le plus fort puisqu'il ne nomme rien et charge tout, était le seul
> invisible. Si vous l'étendez, **plantez la faute** et vérifiez qu'il la nomme.

### 6.b — Ce que le cœur demande au domaine

Plusieurs tâches du cœur ont besoin d'une réponse sur des valeurs qu'il ne connaît
pas. Il la **demande**, par `core/services-domaine.ts`, et les réponses sont
neutres par défaut :

| Question | Pourquoi | Défaut |
|---|---|---|
| `empreinte(valeur)` | savoir si une entrée a changé, donc si un nœud se recalcule | `null` |
| `nomDeType(valeur)` + `typesNonSerialisables` | dire ce qu'une sauvegarde JSON va détruire | `null`, `[]` |
| `globalesInstallees` | ce qu'un node installé à chaud a sous la main | `{}` |
| `reglagesDeProjet()` + `appliquerReglagesDeProjet(json)` | les réglages du domaine qui voyagent dans le fichier de projet | `{}`, rien |
| `versTransport(valeur)` + `depuisTransport(valeur)` | faire traverser une valeur jusqu'au cadre isolé d'un node installé | la valeur telle quelle |
| `versPaquet(valeur)` + `depuisPaquet(forme)` | écrire une valeur dans un paquet `.attic`, et la relire | `null` |

Le cœur connaît de son côté ce qui vient du langage et du navigateur :
primitifs, `File`, `Blob`, `ArrayBuffer`, tableaux typés, tableaux et objets
simples. Côté audio, les réponses sont dans `audio/adaptateur.ts`.

### 6.c — Ce que votre domaine a le droit d'importer du shell

La règle n'est pas « le domaine n'importe rien du shell » : ce serait absurde,
une vue de nœud étant du React qui a besoin des briques de l'interface. La règle
est **une question de sens**.

**Le domaine peut dépendre du shell. Le shell ne doit pas dépendre du domaine.**
Un domaine qui disparaît emporte ses vues avec lui et le shell tient encore ; un
shell qui nomme un domaine ne peut plus en accueillir d'autre. C'est pourquoi le
garde du §6.a ne compte qu'un seul des deux sens.

Concrètement, une vue de domaine emploie sans scrupule les briques du shell —
lecteur, badge de statut, bouton de copie, niveau d'écoute. **Ce qui mérite d'y
regarder à deux fois, c'est un EXÉCUTEUR qui lit l'interface** : le résultat d'un
composant devient alors fonction de ce que l'écran affiche, ce qui le rend
difficile à tester et impossible à exécuter sans interface.

**Les traductions sont le quatrième locataire, et ce document les oubliait.**
`src/i18n.tsx` n'est ni le cœur, ni le shell, ni un domaine : c'est le mécanisme
des deux langues. **Trois cent quatorze des sept cent soixante et un fichiers du
domaine audio l'importent** — relevé le 2026-10-25, tests exclus —, soit un peu
plus de deux sur cinq, les notices et les libellés de paramètres étant bilingues.
La proportion n'a pas bougé depuis le relevé précédent (279 sur 692) ; le domaine,
lui, a grossi de dix pour cent. Votre domaine fera de même. Le mécanisme se
réutilise tel quel ; les textes sont à vous.

### Vues spécifiques à un nœud

Un nœud qui a besoin d'une UI propre (un lecteur, un éditeur, un canevas) ajoute
une entrée à la déclaration de son domaine. Pour l'audio, c'est
`src/vues-domaine/vues.tsx` ; un autre domaine écrit la sienne et la fait
importer par sa racine de composition :

```ts
{ correspond: parId("image:flou"), vue: VueApercuImage, position: "avant" }
```

`correspond` est un prédicat sur le `ficheId` (donc un préfixe ou une famille
entière marche aussi), `position` place la vue avant ou après la zone générique.
Une vue reçoit `{ id, data, def }`. Le renderer générique n'a **pas** à être
modifié pour ajouter une vue.

---

## 7. Ce qui suppose « un domaine par process »

Ce qui suit n'empêche **pas** de réutiliser le framework pour un autre domaine —
seulement de faire tourner **deux domaines différents dans la même fenêtre**, ce
qui n'est pas un cas d'usage actuel.

**Trois obstacles sont tombés**, et cette section les annonçait encore :

- `TypeValeur` ne figure plus dans `core/types.ts`. L'union des valeurs d'un
  domaine est déclarée **par ce domaine** — pour l'audio, `ValeurAudio` dans
  `audio/types-domaine.ts`. Le cœur ne la nomme nulle part.
- `core/metastore.ts` et `core/nodes-installes.ts` n'épinglent plus
  `PluginDef<TypeValeur, AudioContext>` : ils tiennent des
  `PluginDef<unknown, unknown>`. **Il n'y a donc plus rien à y substituer.**
- La table des anciens identifiants n'est plus une constante de
  `core/registre.ts`, que tout registre résolvait. Chaque domaine remet la sienne
  à son registre, `creerRegistre({ alias })` ; pour l'audio, `audio/alias.ts`.
  Une fiche d'un autre domaine nommée `filtre` se trouve donc sous son nom, et
  `enregistrer` refuse un identifiant qui est un alias de son registre, en
  nommant la fiche qui l'ouvre : inscrite, elle ne serait jamais trouvée.

**Deux restent :**

| Élément | Conséquence |
|---|---|
| `DEFS_CACHE` (`ui/AtelierNode.tsx`) | cache de fiches partagé par tout le processus, indexé sur l'identifiant de fiche |
| Clés `attic-node-installe:<id>` (`core/nodes-installes.ts`) | `localStorage` non namespacé — deux domaines se reliraient les nœuds l'un de l'autre |

Pour une vraie cohabitation, il faudrait namespacer ces deux-là. Les clés
`attic-meta:<id>` ne sont pas dans cette liste : elles appartiennent au shell
(`ui/metasLocaux.ts`), le cœur ne persistant rien lui-même.

---

## 8. Marche à suivre, condensée

1. `src/<domaine>/types-domaine.ts` — `TValeur`, `TRuntime` et les alias.
2. `src/<domaine>/adaptateur.ts` — `creerRegistre` (avec ses alias, s'il en a), types de flux, fiches, `figerLesNatifs`, injection.
3. Un premier plugin source (sans entrée) + un plugin de sortie. Vérifiez que la
   palette les affiche et qu'une arête se connecte.
4. Posez le contrat d'échec (§4) **dès le premier plugin**, pas après.
5. `src/composition.ts` — déposez votre registre sur `ui/registre-actif.ts`, et le
   reste si vous en avez. **Faites-en le premier import de `main.tsx`** : sans
   cela l'application meurt sur « Registre UI non configuré » sans peindre une
   seule fois, les imports s'évaluant avant le corps du module. Retirez ensuite
   d'`ui/App.tsx` ses imports de l'adaptateur audio et des métas d'exemple, qui
   réécriraient votre configuration (§6).
6. Répondez aux questions du cœur (§6.b) si vos valeurs ne sont pas
   sérialisables, sans quoi un cache et une sauvegarde JSON se tromperont en
   silence.
7. Écrivez le test « baptême » de votre domaine, sur le modèle de
   `domaine-nombre.test.ts` : un petit graphe, un résultat attendu. C'est ce test
   qui vous dira que le moteur exécute correctement *votre* domaine.
8. L'ordre de vérification d'`AGENTS.md`, `npx tsc -b`, `npx oxlint` et
   `npx vitest run`, doit être vert — puis **lancez l'application et regardez**. Un graphe de modules peut être parfait et une
   interface vide : c'est un cas qui s'est produit, et aucun test ne l'avait dit.

Un plugin mal typé **doit** échouer à la compilation — si `tsc` passe alors que
vous avez oublié de paramétrer un contrat, c'est que vous avez écrit `PluginDef`
nu quelque part. Cherchez-le.

---

## Voir aussi

- `src/docs/frontiere-domaine.test.ts` — **la source de vérité** : ce qui reste couplé, et les quatre cécités dont ce garde s'est relevé
- `src/docs/frontiere-identifiants.test.ts` — les identifiants de fiche que le cœur nomme encore, et la raison de chacun
- `src/composition.ts` — la racine de composition du domaine audio, le seul fichier qui connaît les deux côtés
- `src/core/domaine-nombre.test.ts` — un second domaine complet du côté du cœur : registre, types de flux, 4 plugins, graphe, validation, et la vraie boucle d'exécution
- `IMPACT.md` — pour chaque zone du dépôt, ce qu'une modification y touche, les gardes qui la tiennent et les épreuves à relancer
- `src/core/cloisonnement.test.ts` — la preuve que deux domaines n'interfèrent pas
- `ADDING-A-NODE.md` — ajouter un nœud dans le domaine audio existant
- `AGENTS.md` — l'ordre de vérification, les règles de commit et les cinq contrats du dépôt
- `ARCHITECTURE.md` — la feuille de route architecture : le diagnostic d'origine et ce qui en a été fait
