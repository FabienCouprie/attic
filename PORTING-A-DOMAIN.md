# Réutiliser Attic pour un autre domaine

Attic est un framework nodal **agnostique du domaine**. Le cœur (`src/core/`) ne
sait rien de l'audio : il transporte des valeurs opaques sur un graphe orienté,
les exécute dans l'ordre topologique, propage les erreurs et sait replier un
sous-graphe en méta-composant. L'audio n'est qu'un *adaptateur* branché dessus.

Ce document décrit les étapes pour brancher un **nouveau domaine** — traitement
d'images, données tabulaires, simulation, texte, robotique — en réutilisant le
cœur, la propagation, les métanodes et l'UI, **sans modifier `src/core/`**.

> **Preuve que ça marche.** `src/core/domaine-nombre.test.ts` est un second
> domaine complet et fonctionnel (`TValeur = number | string`, `TRuntime = null`,
> 4 micro-plugins, calcule `(4×2)+3 = 11`). Il tourne dans la CI à chaque commit.
> `src/core/cloisonnement.test.ts` prouve que deux registres coexistent sans
> se marcher dessus. Lisez ces deux fichiers : ce sont les exemples de référence,
> et ils sont plus courts que ce guide.

---

## 0. Ce que vous réutilisez, et ce que vous écrivez

| Couche | Fichiers | Réutilisé tel quel ? |
|---|---|---|
| **Cœur** — registre, tri topologique, validation, métanodes, cache | `src/core/**` | ✅ intégralement, sans modification |
| **UI** — canevas, palette, inspecteur, exécution, persistance | `src/ui/**` | ⚠️ largement, mais couplé à l'audio par des imports (voir §6) |
| **Adaptateur** — registre typé, types de flux, câblage | `src/audio/adaptateur.ts` | ❌ vous en écrivez un (≈ 30 lignes) |
| **Plugins** — les nœuds eux-mêmes | `src/plugins/**` | ❌ vous écrivez les vôtres |

Le travail réel est donc : **un fichier de types + un adaptateur + vos plugins**.

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
bouton ▶ d'un nœud), `resoudreEntree` / `valeursEntrantes` pour le câblage.

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

## 6. Brancher l'UI — le point de friction

C'est la seule partie qui demande une intervention. Le *renderer* de nœud
(`AtelierNode.tsx`) est déjà générique : en-tête, documentation, ports colorés
par type de flux et statut sont dessinés à partir de la fiche, quel que soit le
domaine. La palette et l'inspecteur se construisent aussi entièrement à partir
des fiches (`univers` / `famille` / `parametres`).

**Mais** il reste deux couplages distincts, d'ampleur très différente.

### 6.a — Le registre importé en dur (5 fichiers)

```ts
import { registre } from "../audio/adaptateur";
```

| Fichier | Rôle |
|---|---|
| `ui/App.tsx` | catalogue, création de nœuds (+ 2 imports d'effet de bord) |
| `ui/AtelierNode.tsx` | résolution de fiche, couleur des ports |
| `ui/hooks/useExecutionGraphe.ts` | résolution de plugin à l'exécution |
| `ui/hooks/useMetaComposants.ts` | (dés)enregistrement des métas |
| `ui/metasLocaux.ts` | persistance des métas |

`Palette.tsx`, `Inspector.tsx` et `vues.tsx` n'importent, eux, que le **type**
`FicheAudio` : aucun couplage à l'exécution, un simple alias de type les
substitue. Pour réutiliser l'UI telle quelle, remplacez les 5 imports ci-dessus
par une **injection unique** configurée par la racine de composition
(`main.tsx`) :

```ts
// src/ui/registre-actif.ts
let actif: Registre<any, any> | null = null;
export function configurerRegistreUI(r: Registre<any, any>) { actif = r; }
export function registreUI() {
  if (!actif) throw new Error("Registre UI non configuré");
  return actif;
}
```

`main.tsx` appelle alors `configurerRegistreUI(registre)` avec **votre**
adaptateur, avant le premier rendu. Attention au `DEFS_CACHE` d'`AtelierNode.tsx`
(un `Map` module-global) : il doit être vidé ou clefé par domaine.

> **Statut honnête :** ce découplage est identifié et planifié (« item 3 » de la
> table de risques), pas encore fait. En attendant, la voie la plus rapide pour
> un nouveau domaine est de garder ces imports et de substituer votre adaptateur
> à `audio/adaptateur.ts`.

### 6.b — Les fonctions audio importées par des composants d'UI

Plus profond, et **non résolu par l'injection du registre** : certains fichiers
d'UI importent des fonctions du module audio.

| Fichier | Import |
|---|---|
| `ui/hooks/useExecutionGraphe.ts` | `bufferVersWavBlob` (export du résultat) |
| `ui/vues.tsx` | `COULEURS` |
| `ui/SequenceurBatterie.tsx` | `decoderMotif`, `encoderMotif` |
| `ui/SequenceurMelodique.tsx` | `decoderMotifMelodique`, `encoderMotifMelodique`, `NB_RANGEES_MELO`, `nomNotePourRangee` |
| `ui/VuMetre.tsx` | `mesurerNiveau` |

Les quatre derniers sont des **widgets spécifiques à des nœuds audio** : leur
place naturelle est à côté du domaine, pas dans le shell générique. Un autre
domaine ne les charge simplement pas — ils sont atteints par le registre de vues
(§6, *Vues spécifiques*), donc inertes si aucune fiche ne les réclame. Seul
`useExecutionGraphe` pose un vrai problème, puisqu'il est sur le chemin
d'exécution de tout le monde : l'export du résultat devra passer par un service
fourni par l'adaptateur.

### Vues spécifiques à un nœud

Un nœud qui a besoin d'une UI propre (un lecteur, un éditeur, un canevas) ajoute
une entrée au registre de vues de `src/ui/vues.tsx` :

```ts
{ correspond: parId("image:flou"), vue: VueApercuImage, position: "avant" }
```

`correspond` est un prédicat sur le `ficheId` (donc un préfixe ou une famille
entière marche aussi), `position` place la vue avant ou après la zone générique.
Une vue reçoit `{ id, data, def }`. Le renderer générique n'a **pas** à être
modifié pour ajouter une vue.

---

## 7. Ce qui suppose « un domaine par process »

Trois éléments restent globaux au processus. Ils n'empêchent **pas** de réutiliser
le framework pour un autre domaine — ils empêchent seulement de faire tourner
**deux domaines différents dans la même fenêtre**, ce qui n'est pas un cas
d'usage actuel.

| Élément | Conséquence |
|---|---|
| `TypeValeur` dans `core/types.ts` | union audio, encore référencée par le cœur |
| `core/metastore.ts`, `core/nodes-installes.ts` | épinglent `PluginDef<TypeValeur, AudioContext>` |
| `DEFS_CACHE` (`AtelierNode.tsx`) | cache de fiches partagé |
| Clés `attic-metas`, `attic-nodes-installes` | `localStorage` non namespacé |

Pour un nouveau domaine mono-process, il suffit de substituer votre union et
votre runtime dans les deux modules du cœur. Pour une vraie cohabitation, il
faudrait namespacer les quatre. Voir `ARCHITECTURE.md §14`.

---

## 8. Marche à suivre, condensée

1. `src/<domaine>/types-domaine.ts` — `TValeur`, `TRuntime` et les alias.
2. `src/<domaine>/adaptateur.ts` — `creerRegistre`, types de flux, fiches, injection.
3. Un premier plugin source (sans entrée) + un plugin de sortie. Vérifiez que la
   palette les affiche et qu'une arête se connecte.
4. Posez le contrat d'échec (§4) **dès le premier plugin**, pas après.
5. Branchez `main.tsx` sur votre adaptateur.
6. Écrivez le test « baptême » de votre domaine, sur le modèle de
   `domaine-nombre.test.ts` : un petit graphe, un résultat attendu. C'est ce test
   qui vous dira que le moteur exécute correctement *votre* domaine.
7. `npx tsc -b && npx vitest run` doivent être verts.

Un plugin mal typé **doit** échouer à la compilation — si `tsc` passe alors que
vous avez oublié de paramétrer un contrat, c'est que vous avez écrit `PluginDef`
nu quelque part. Cherchez-le.

---

## Voir aussi

- `ARCHITECTURE.md` — les couches, les règles protégées par mutation, l'état honnête (§14)
- `ADDING-A-NODE.md` — ajouter un nœud dans le domaine audio existant
- `src/core/domaine-nombre.test.ts` — un second domaine complet : registre, types de flux, 4 plugins, graphe, validation
- `src/core/cloisonnement.test.ts` — la preuve que deux domaines n'interfèrent pas
