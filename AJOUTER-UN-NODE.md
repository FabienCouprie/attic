# Ajouter un nœud (bloc) à Attic

Guide pas-à-pas pour créer un nouveau nœud, illustré par un nœud **neutre** : le
**Point d'écoute** (`point-ecoute`) — un passe-plat qui auditionne le signal sans
interrompre la chaîne. C'est le cas le plus simple : **une fiche + un enregistrement
+ une notice**, rien d'autre. Les fonctionnalités avancées (vue custom, taille,
nouveau type de flux…) sont en fin de guide, chacune optionnelle.

> Rappels d'architecture : un nœud = un **plugin** décrit par une fiche `PluginDef`
> et une fonction `executer(ctx)`. Le cœur, la palette, l'inspecteur, la doc, les
> méta-composants et la persistance sont **génériques** — tu ne touches qu'à tes
> fichiers de domaine. Voir `ARCHITECTURE.md`.

---

## Anatomie du nœud « Point d'écoute »

Fichier : [`src/plugins/sortie-conversion.ts`](src/plugins/sortie-conversion.ts)

```ts
{
  id: "point-ecoute", nom: "Point d'écoute", nomEn: "Listening Point",
  univers: "Sorties", famille: "Écoute",
  resume: "Auditionne le signal sans interrompre la chaîne.",
  resumeEn: "Auditions the signal at a point in the chain without interrupting it.",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [],
  async executer(ctx: any) {
    const a = ctx.entree(0);
    if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée connectée." };
    return { valeurs: [a] };            // passe l'entrée telle quelle sur la sortie
  },
}
```

Puis en bas du fichier, **une seule ligne** enregistre toutes les fiches du fichier :

```ts
] as PluginDef[]) enregistrer(avecDoc(def));
```

Et sa notice (documentation pédagogique) dans
[`src/plugins/notices.ts`](src/plugins/notices.ts) :

```ts
"point-ecoute": {
  fr: "Point d'écoute intermédiaire : permet d'auditionner le signal à un endroit de la chaîne sans l'interrompre.",
  en: "Intermediate listening point: lets you audition the signal at a spot in the chain without interrupting it.",
},
```

C'est tout. Le nœud apparaît dans la palette (univers *Sorties* / famille *Écoute*),
avec ses ports colorés, son résumé, sa notice « en savoir plus » bilingue, et il
s'exécute dans le graphe.

---

## Les champs de la fiche (`PluginDef`)

Défini dans [`src/core/types.ts`](src/core/types.ts).

| Champ | Obligatoire | Rôle |
|---|---|---|
| `id` | ✅ | Identifiant unique, kebab-case stable (sert au catalogue, aux arêtes, à la persistance). **Ne pas le changer** après publication (sinon casser les graphes sauvegardés → voir *Alias*). |
| `nom` | ✅ | Nom FR affiché. |
| `nomEn` | recommandé | Nom EN (sinon repli sur `nom`, ou sur la table `NOMS_EN`). |
| `univers` / `famille` | ✅ | Rangement dans la palette (univers = colonne/couleur, famille = sous-groupe). Réutilise les existants (`Entrées`, `Traitement`, `Sorties`…) ou en crée. |
| `resume` / `resumeEn` | `resume` ✅ | Phrase courte toujours visible (sur le nœud et l'inspecteur). |
| `notice` / `noticeEn` | recommandé | Explication « en savoir plus » (§3.9). Fournie ici **ou** via `notices.ts` (voir plus bas). Son absence déclenche un *avertissement* console en dev. |
| `entrees` / `sorties` | ✅ (tableaux, possiblement vides) | Ports. Voir ci-dessous. |
| `parametres` | ✅ (tableau, possiblement vide) | Réglages exposés dans l'inspecteur. Voir ci-dessous. |
| `executer` | ✅ | La fonction de calcul. Voir le contrat plus bas. |
| `etiquettes` | optionnel | Mots-clés de recherche. |

### Les ports (`PortDef`)

```ts
{ nom: "Audio", type: "audio", sousType?: "stereo"|"mono", dynamique?: true }
```

- `type` = **id d'un type de flux** (registre `core/typesFlux`). Le domaine audio
  fournit : `audio`, `midi`, `controle`, `texte`, `fichier`. La **couleur** du port
  et la **compatibilité de connexion** en découlent automatiquement — tu n'écris
  aucune couleur. (Pour un type inédit → *Créer un type de flux*, plus bas.)
- `dynamique: true` sur une entrée = **fan-in variadique** (plusieurs arêtes sur le
  même port ; ex. le `fusionneur`). Récupère alors les valeurs avec `ctx.entrees()`.

### Les paramètres (`ParametreDef`)

```ts
{ nom: "Volume", nomEn: "Volume", plage: [0,100], pas: 1, defaut: 100, unite: "%",
  doc: "…", docEn: "…" }
```

| `type` | Rendu inspecteur | Champs utiles |
|---|---|---|
| *(omis)* + `plage` | curseur (slider) | `plage: [min,max]`, `pas`, `unite` |
| `"choix"` | menu déroulant | `options: string[]` |
| `"texte"` | champ texte | — |
| `"dossier"` | sélecteur de dossier (Electron) | — |

Le `defaut` (nombre ou chaîne) est appliqué à la création du nœud. `doc`/`docEn`
alimentent l'info-bulle « ? » du paramètre (sinon repli sur `DOCS_PARAM`).

---

## Le contrat de `executer(ctx)`

`ctx` est le **contexte d'exécution** ([`core/types.ts`](src/core/types.ts),
`ContexteExecution<TValeur, TRuntime>`). La plupart des plugins le typent `any` par
concision ; tu peux aussi l'annoter `ContexteExecution` pour l'autocomplétion.

**Lire les entrées / paramètres :**
| Appel | Renvoie |
|---|---|
| `ctx.entree(i)` | la valeur branchée sur l'entrée `i` (ou `null` si non connectée) |
| `ctx.entrees()` | **toutes** les valeurs d'entrée (tableau, `null` inclus) — pour les ports `dynamique`. Filtre toi-même par type : `ctx.entrees().filter(v => v instanceof AudioBuffer)` |
| `ctx.paramNombre(nom, defaut)` | valeur numérique d'un paramètre |
| `ctx.paramTexte(nom, defaut)` | valeur texte d'un paramètre |
| `ctx.noeud.data` | données du nœud (params bruts **et** fichiers chargés : `audioFichier`, `midiFichier`, `enregistrementBlob`…) |
| `ctx.runtime` | l'environnement du domaine — ici l'`AudioContext` (ex. `decoderFichier(f, ctx.runtime)`) |
| `ctx.repertoireTravail` | dossier de travail (I/O Electron) |
| `ctx.onProgress(msg)` | met à jour le message d'état du nœud pendant un calcul long |

**Valeurs manipulées** (domaine audio, type `TypeValeur`) :
`AudioBuffer | Float32Array | File | string | { debut; duree } | null`.

**Retour** : `{ valeurs: TValeur[]; message?: string; mp3Url?: string }`
- `valeurs` est un **tableau parallèle à `sorties`** : `valeurs[j]` = ce qui sort du
  port de sortie `j`. (Point d'écoute : 1 sortie → `valeurs: [a]`.)
- `message` s'affiche sur le nœud (utile pour signaler « aucune entrée », un résumé…).
- En cas d'entrée absente/invalide, renvoie `{ valeurs: [null, …], message: "…" }`
  (autant de `null` que de sorties) plutôt que de lever une exception.

Toute exception est de toute façon **capturée** par le moteur, journalisée et
remontée en statut `erreur` sur le nœud.

---

## Les 3 étapes (nœud neutre)

### 1. Écrire la fiche
Ajoute l'objet `PluginDef` dans le fichier de **famille** approprié de `src/plugins/`
(par domaine/thème) : `entrees.ts`, `effets.ts`, `generateurs.ts`, `montage.ts`,
`analyse.ts`, `sorties.ts`, `sortie-conversion.ts`… Chaque fichier finit par
`… as PluginDef[]) enregistrer(avecDoc(def));` → ta fiche est enregistrée
automatiquement. (Nouveau fichier ? importe-le dans
[`src/plugins/index.ts`](src/plugins/index.ts).)

### 2. Enregistrer
Rien de plus si tu ajoutes à un fichier existant : la boucle `enregistrer(avecDoc(def))`
s'en charge. `avecDoc` complète la notice, le nom EN et la doc des paramètres depuis
les tables de `notices.ts`.

### 3. Documenter (notice)
Ajoute l'entrée dans `NOTICES` de [`src/plugins/notices.ts`](src/plugins/notices.ts)
(`"mon-id": { fr, en }`). Le **garde-fou** du registre exige `id`/`nom`/`resume`/
`executer` (sinon la fiche est **rejetée**) et *avertit* si la notice ou une doc de
paramètre manque. La doc est de premier ordre dans ce projet (but pédagogique).

---

## Étapes optionnelles (au-delà du neutre)

Le Point d'écoute n'en a besoin d'aucune. Ajoute-les seulement si pertinent :

- **Nom EN / doc de paramètre partagés** — plutôt que `nomEn`/`doc` sur la fiche,
  renseigne les tables centrales `NOMS_EN`, `PARAMS_EN`, `DOCS_PARAM` de
  `notices.ts` (mutualisées entre nœuds).

- **Taille par défaut du nœud** — un nœud neutre prend la taille standard. Pour un
  nœud plus grand (vue custom), ajoute un cas dans `tailleDefaut()` de
  [`src/ui/App.tsx`](src/ui/App.tsx).

- **Vue personnalisée** (uploader, forme d'onde, clavier, aperçu…) — enregistre un
  composant dans le registre `REGISTRE` de [`src/ui/vues.tsx`](src/ui/vues.tsx) :
  `{ correspond: parId("mon-id"), vue: MaVue, position: "avant"|"apres" }`. La vue
  reçoit `{ id, data, def }` et se rend au-dessus/au-dessous du lecteur générique.
  (C'est le point d'extension UI — cf. ARCHITECTURE.md §11.)

- **Nouveau type de flux** (port d'un type inédit) — enregistre-le dans
  [`src/plugins/typesFlux.ts`](src/plugins/typesFlux.ts) :
  `enregistrerTypeFlux({ id: "mon-flux", couleur: "#…", libelle: "…" })`. Couleur et
  compatibilité de connexion suivent automatiquement.

- **Renommer un nœud existant** — ne change jamais un `id` publié « sec ». Ajoute
  `ancien-id → nouvel-id` dans la table `ALIAS` de
  [`src/core/registre.ts`](src/core/registre.ts) : les graphes sauvegardés se
  rechargent toujours.

---

## Vérifier

```sh
# depuis G:\attic (Node portable dans le PATH)
npx tsc -b --noEmit      # 0 erreur
npx vitest run           # tous les tests passent
npm run build            # build OK
```

Puis dans l'app (dev) : glisser le nœud depuis la palette → il s'affiche avec ses
ports colorés ; le relier ; **Lancer** (bouton Run ou barre espace) → il produit un
résultat ; survoler « ? » → la notice et les docs de paramètre s'affichent (FR/EN).

---

## Gabarit à copier

Un nœud neutre « Marqueur » : passe l'audio tel quel + un paramètre d'étiquette
(illustre un paramètre texte). À coller dans un fichier de `src/plugins/` :

```ts
{
  id: "marqueur", nom: "Marqueur", nomEn: "Marker",
  univers: "Sorties", famille: "Écoute",
  resume: "Repère un point de la chaîne ; laisse passer le signal inchangé.",
  resumeEn: "Marks a spot in the chain; passes the signal through unchanged.",
  entrees: [{ nom: "Audio", type: "audio" }],
  sorties: [{ nom: "Audio", type: "audio" }],
  parametres: [
    { nom: "Étiquette", nomEn: "Label", type: "texte", defaut: "repère",
      doc: "Texte libre affiché comme repère.", docEn: "Free label shown as a marker." },
  ],
  async executer(ctx: any) {
    const a = ctx.entree(0);
    if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: "Aucune entrée connectée." };
    const etiquette = ctx.paramTexte("Étiquette", "repère");
    return { valeurs: [a], message: `Marqueur : ${etiquette}` };
  },
}
```

Et sa notice dans `notices.ts` :

```ts
"marqueur": {
  fr: "Repère visuel/nominatif à un endroit de la chaîne, sans effet sur le signal (passe-plat).",
  en: "A named/visual marker at a spot in the chain, with no effect on the signal (pass-through).",
},
```
