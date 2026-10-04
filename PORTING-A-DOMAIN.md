# Réutiliser Attic pour un autre domaine

Attic est un framework nodal **agnostique du domaine**. Le cœur (`src/core/`) ne
sait rien de l'audio : il transporte des valeurs opaques sur un graphe orienté,
les exécute dans l'ordre topologique, propage les erreurs et sait replier un
sous-graphe en méta-composant. L'audio n'est qu'un *adaptateur* branché dessus.

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
> **Ce qu'ils prouvent est l'agnosticisme du CŒUR, et rien de plus.** Le test
> écrit lui-même ce qu'il fait : « réplique minimale de `useExecutionGraphe` sans
> React ». Il rejoue le moteur plutôt que de l'employer, et **ne touche aucun
> fichier du shell**. Les six poteaux du §6 sont donc prouvés **vides** — un garde
> le tient — mais **jamais prouvés remplissables** : rien ne démontre encore qu'un
> second domaine qui les remplit obtient une interface qui fonctionne. C'est la
> pièce qui manque à ce document, et la connaître vaut mieux que de la découvrir
> en portant.

---

## 0. Ce que vous réutilisez, et ce que vous écrivez

| Couche | Fichiers | Réutilisé tel quel ? |
|---|---|---|
| **Cœur** — registre, tri topologique, validation, métanodes, cache | `src/core/**` | ✅ intégralement, sans modification |
| **Shell** — canevas, palette, inspecteur, exécution, persistance | `src/ui/**` | ⚠️ presque : il demande au lieu d'importer, **sauf cinq fichiers nommés** (voir §6.a) |
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

`TRuntime` peut être `null` si vos plugins n'ont besoin de rien (c'est le cas du
domaine nombre). Il n'a pas à être une classe : un objet de services, un pool de
workers, une connexion — le cœur le transporte sans jamais le regarder.

---

## 2. Écrire l'adaptateur

L'adaptateur est le **seul** endroit où l'on appelle `enregistrer()`. Importer un
module de plugin n'a aucun effet de bord : les fiches sont *exportées*, pas
auto-enregistrées. C'est ce qui rend l'ordre d'import sans importance.

```ts
// src/image/adaptateur.ts
import { creerRegistre } from "../core";
import { configurerRegistreMeta, configurerRegistreNodes } from "../core";
import { toutesLesFiches } from "../plugins-image";
import type { ValeurImage, RuntimeImage } from "./types-domaine";

export const registre = creerRegistre<ValeurImage, RuntimeImage>();

// 1) Les types de flux du domaine : id, couleur du port, libellé.
registre.enregistrerTypeFlux({ id: "image",  couleur: "#7048e8", libelle: "Image" });
registre.enregistrerTypeFlux({ id: "masque", couleur: "#f59f00", libelle: "Masque" });
registre.enregistrerTypeFlux({ id: "nombre", couleur: "#36a2eb", libelle: "Nombre" });

// 2) Les fiches.
for (const fiche of toutesLesFiches) registre.enregistrer(fiche);

// 3) Les modules du cœur qui ont besoin d'un registre (injection, pas singleton).
configurerRegistreMeta(registre);
configurerRegistreNodes(registre);
```

### Types de flux et compatibilité

Par défaut, deux ports sont connectables si leurs `id` sont **égaux**. Pour une
compatibilité plus large (ex. un masque accepté là où une image est attendue),
déclarez `compatible` :

```ts
registre.enregistrerTypeFlux({
  id: "masque", couleur: "#f59f00", libelle: "Masque",
  compatible: (cible) => cible === "masque" || cible === "image",
});
```

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
ctx.noeud              // { id, data } — data porte l'état UI du nœud
ctx.runtime            // votre TRuntime, transmis tel quel
ctx.repertoireTravail  // string
ctx.entree(i)          // valeur du port d'entrée i
ctx.entrees()          // toutes les valeurs branchées, null si non connecté
ctx.paramNombre(nom, defaut)
ctx.paramTexte(nom, defaut)
ctx.onProgress(msg)    // remonte un texte de progression sur le nœud
```

Le cœur **garantit** que `ctx.entree(i)` est non-null pour les ports
obligatoires : `validerGraphe` refuse d'exécuter avant. Un port optionnel se
déclare `requis: false` — c'est alors à votre plugin de gérer le `null`, via
`ctx.entrees()`.

### Ports dynamiques

`dynamique: true` sur un port signale à l'UI qu'il peut être répliqué (un
mélangeur à N entrées, par exemple).

---

## 4. Le contrat d'échec — à lire avant d'écrire le premier plugin

C'est le point le plus facile à rater, et il a coûté un bug réel : un workflow
pouvait se déclarer « terminé » alors qu'une branche entière n'avait rien produit.

**Un plugin qui échoue DOIT le déclarer.** Trois mécanismes, complémentaires :

| # | Mécanisme | Qui le fait |
|---|---|---|
| 1 | `return { valeurs: [...], erreur: true, message: "…" }` | **vous**, dans le plugin |
| 2 | Sortie entièrement nulle sur un nœud *qui a des ports de sortie* ⇒ échec déduit | le moteur, automatiquement |
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

**Cache** — `empreinteParametres(data)` et `empreinteEntrees(nodeId, aretes)`
donnent une empreinte ; un nœud dont ni les paramètres ni les entrées n'ont
changé n'est pas réexécuté. Les branches parallèles indépendantes ne se
réinvalident pas mutuellement.

**Validation** — `valider(def, deps)` refuse une fiche mal formée à
l'enregistrement (résumé manquant, type de flux inconnu…). `validerGraphe`
vérifie avant exécution que les ports obligatoires sont connectés et que les
types reliés sont compatibles.

**Métanodes** — `creerMeta` replie une sélection en composant réutilisable,
`aplatirGraphe` le déplie récursivement à l'exécution (imbrication comprise,
garde anti-boucle), `frontieresPourEdition` synthétise les nœuds ▸entrée/sortie◂
pour éditer l'intérieur, `redériverMeta` répercute une modification.
`enregistrerMeta` / `supprimerMeta` / `surChangementMetas` gèrent le catalogue.
**Tout cela est agnostique du domaine** — vos métanodes fonctionneront sans une
ligne de code supplémentaire.

**Import de nœuds** — `installerNode` / `chargerNodesInstalles` : des nœuds
livrés en `.zip` et installés à chaud.

---

## 6. Brancher l'UI — par la racine de composition

Le *renderer* de nœud (`AtelierNode.tsx`) est générique : en-tête,
documentation, ports colorés par type de flux et statut sont dessinés à partir
de la fiche, quel que soit le domaine. La palette et l'inspecteur se
construisent entièrement à partir des fiches (`univers` / `famille` /
`parametres`).

**Le shell demande au lieu d'importer.** C'est le domaine qui vient se faire
connaître, par **six poteaux** déclarés dans `src/ui/`, chacun **vide par
défaut** et n'important rien du domaine :

| Poteau | Ce que le domaine y dépose |
|---|---|
| `ui/registre-actif.ts` | son registre de fiches, et le type `FicheUI` que le shell emploie |
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

Les dépôts ont lieu dans `src/composition.ts`, **le seul fichier qui connaît les
deux côtés**. Brancher un autre domaine, c'est écrire le vôtre :

```ts
// src/composition.ts
import { registre } from "./images/adaptateur";
import { configurerRegistreUI, type RegistreUI } from "./ui/registre-actif";

configurerRegistreUI(registre as unknown as RegistreUI);
// puis vos vues, vos liens, vos genres de paramètre — ou rien du tout.
```

> **L'ordre des imports est une condition de démarrage.** `ui/App.tsx` fait son
> démarrage au chargement du module (sauvegarde restaurée, méta-composants
> relus) et réclame le registre dès cet instant. `./composition` doit donc être
> le **premier** import de `main.tsx` ; `src/docs/composition.test.ts` le tient.

Ce qui n'est pas déposé n'existe pas, et le shell le supporte : aucune vue
déclarée, aucun bouton de favoris, aucun genre de paramètre propre. Rien ne
casse, rien ne s'affiche à vide.

### 6.a — Ce qui reste couplé, et le garde qui le compte

`src/docs/frontiere-domaine.test.ts` est la **source de vérité** : il relève les
fichiers du shell qui chargent du calcul du domaine, refuse que la liste
grandisse, et exige qu'un fichier délivré en sorte. Ce document ne répète donc
plus un chiffre qui vieillirait — lisez le test.

Il tient aussi quatre faits :

- `src/core/` n'importe rien du domaine, et **n'en nomme aucun type dans son
  code**, pas même une globale comme `AudioBuffer` ou un mot du métier comme
  `"stereo"` ;
- le cœur fonctionne sans domaine : il traite alors un tampon comme n'importe
  quel objet ;
- les six poteaux n'importent rien du domaine ;
- aucun fichier du shell n'importe la déclaration des vues du domaine.

**Les couplages qui restent portent chacun leur raison dans le test**, et le seul
qui ne soit pas mécanique est `ui/hooks/useExecutionGraphe.ts` : ses deux pilotes
de passes ne sont pas des fonctions sur des valeurs mais des **fonctionnalités
que le moteur pilote**. Les sortir demande de reprendre sa structure de boucle.

> **Ce que ce garde ne regarde pas, et vous le saurez avant lui.** Il compte le
> sens shell → domaine. **Le sens inverse n'est ni mesuré ni épinglé** : dix-sept
> fichiers du domaine importent le shell, dont quinze hors des six poteaux. La
> plupart est légitime — une vue de domaine qui emploie un lecteur ou un badge de
> statut est dans le bon sens de dépendance (§6.c). Quatre le sont moins, dont
> trois **exécuteurs** qui lisent un état de l'interface : le résultat du
> composant dépend alors de ce que l'écran affiche.
>
> **Et ce garde a été aveugle quatre fois**, chaque fois parce qu'il décrivait un
> CHEMIN et qu'un chemin change : il ne balayait que `src/ui/`, il ne connaissait
> du domaine que deux répertoires sur six, son motif nommait l'ancien emplacement
> des vues, et il exigeait un `from` — de sorte que l'import d'effet de bord, le
> couplage le plus fort puisqu'il ne nomme rien et charge tout, était le seul
> invisible. Si vous l'étendez, **plantez la faute** et vérifiez qu'il la nomme.

### 6.b — Ce que le cœur demande au domaine

Trois tâches du cœur ont besoin d'une réponse sur des valeurs qu'il ne connaît
pas. Il la **demande**, par `core/services-domaine.ts`, et les réponses sont
neutres par défaut :

| Question | Pourquoi | Défaut |
|---|---|---|
| `empreinte(valeur)` | savoir si une entrée a changé, donc si un nœud se recalcule | `null` |
| `nomDeType(valeur)` + `typesNonSerialisables` | dire ce qu'une sauvegarde JSON va détruire | `null`, `[]` |
| `globalesInstallees` | ce qu'un node installé à chaud a sous la main | `{}` |

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
des deux langues. **Deux cent soixante-dix-neuf des six cent quatre-vingt-douze
fichiers du domaine audio l'importent**, soit deux sur cinq, les notices et les
libellés de paramètres étant bilingues. Votre domaine fera de même. Le mécanisme
se réutilise tel quel ; les textes sont à vous.

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

**Deux obstacles sont tombés**, et cette section les annonçait encore :

- `TypeValeur` ne figure plus dans `core/types.ts`. L'union des valeurs d'un
  domaine est déclarée **par ce domaine** — pour l'audio, `ValeurAudio` dans
  `audio/types-domaine.ts`. Le cœur ne la nomme nulle part.
- `core/metastore.ts` et `core/nodes-installes.ts` n'épinglent plus
  `PluginDef<TypeValeur, AudioContext>` : ils tiennent des
  `PluginDef<unknown, unknown>`. **Il n'y a donc plus rien à y substituer.**

**Deux restent, et ils sont de nature différente :**

| Élément | Conséquence |
|---|---|
| `DEFS_CACHE` (`ui/AtelierNode.tsx`) | cache de fiches partagé par tout le processus, indexé sur l'identifiant de fiche |
| Clé `attic-nodes-installes` (`core/nodes-installes.ts`) | `localStorage` non namespacé — deux domaines se reliraient les nœuds l'un de l'autre |

Pour une vraie cohabitation, il faudrait namespacer ces deux-là. La clé
`attic-metas` n'est pas dans cette liste : elle appartient au shell
(`ui/metasLocaux.ts`), le cœur ne persistant rien lui-même.

---

## 8. Marche à suivre, condensée

1. `src/<domaine>/types-domaine.ts` — `TValeur`, `TRuntime` et les alias.
2. `src/<domaine>/adaptateur.ts` — `creerRegistre`, types de flux, fiches, injection.
3. Un premier plugin source (sans entrée) + un plugin de sortie. Vérifiez que la
   palette les affiche et qu'une arête se connecte.
4. Posez le contrat d'échec (§4) **dès le premier plugin**, pas après.
5. `src/composition.ts` — déposez votre registre sur `ui/registre-actif.ts`, et le
   reste si vous en avez. **Faites-en le premier import de `main.tsx`** : sans
   cela l'application meurt sur « Registre UI non configuré » sans peindre une
   seule fois, les imports s'évaluant avant le corps du module.
6. Répondez aux trois questions du cœur (§6.b) si vos valeurs ne sont pas
   sérialisables, sans quoi un cache et une sauvegarde JSON se tromperont en
   silence.
7. Écrivez le test « baptême » de votre domaine, sur le modèle de
   `domaine-nombre.test.ts` : un petit graphe, un résultat attendu. C'est ce test
   qui vous dira que le moteur exécute correctement *votre* domaine.
8. `npx tsc -b && npx vitest run` doivent être verts — puis **lancez
   l'application et regardez**. Un graphe de modules peut être parfait et une
   interface vide : c'est un cas qui s'est produit, et aucun test ne l'avait dit.

Un plugin mal typé **doit** échouer à la compilation — si `tsc` passe alors que
vous avez oublié de paramétrer un contrat, c'est que vous avez écrit `PluginDef`
nu quelque part. Cherchez-le.

---

## Voir aussi

- `src/docs/frontiere-domaine.test.ts` — **la source de vérité** : ce qui reste couplé, et les quatre cécités dont ce garde s'est relevé
- `src/composition.ts` — la racine de composition du domaine audio, le seul fichier qui connaît les deux côtés
- `src/core/domaine-nombre.test.ts` — un second domaine complet du côté du cœur : registre, types de flux, 4 plugins, graphe, validation
- `src/core/cloisonnement.test.ts` — la preuve que deux domaines n'interfèrent pas
- `ADDING-A-NODE.md` — ajouter un nœud dans le domaine audio existant
- `AGENTS.md` — l'ordre de vérification, les règles de commit et les quatre contrats du dépôt
- `ARCHITECTURE.md` — la feuille de route architecture : le diagnostic d'origine et ce qui en a été fait
