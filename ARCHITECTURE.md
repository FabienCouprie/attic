# Atelier — Spécification technique du framework

> Spec **technique** dérivée du projet *attic* (éditeur audio nodal), pensée pour
> être **réappliquée à d'autres domaines** (image, données/ETL, ML, shaders,
> IoT, ou tout outil pédagogique de « flux de données »).
>
> Complète la spec **conceptuelle** (`Atelier-Specification.md §3` : blocs, ports
> typés, entrées dynamiques, catalogue, inspecteur, états d'exécution,
> méta-composants, documentation obligatoire), qui reste **indépendante du domaine**.
>
> Chaque section distingue **[Actuel]** (ce que fait attic aujourd'hui) et
> **[Cible]** (la généralisation proposée pour d'autres domaines).

---

## 1. Objet & principe

Un **éditeur de graphe de flux** : l'utilisateur pose des **blocs** (nœuds) sur un
canevas, relie leurs **ports typés**, règle leurs **paramètres**, puis exécute le
graphe. Chaque bloc est un **plugin** autonome décrit par une **fiche** (`PluginDef`)
et une fonction `executer(ctx)`. Un moteur DAG évalue le graphe.

Invariants transverses (valables tous domaines) :
- **Ports typés & colorés** : une connexion n'est permise que si les types sont compatibles.
- **Documentation de premier ordre** : tout bloc a résumé + notice ; tout paramètre a une info-bulle. Bilingue. Un garde-fou refuse un bloc sous-documenté.
- **Exécution déterministe & mise en cache** par empreinte (paramètres + entrées).
- **Composition** : des sous-graphes s'encapsulent en **méta-composants** réutilisables.
- **Persistance** : le graphe (et ses méta-composants) se sérialise en JSON.

---

## 2. Architecture en couches

| Couche | Rôle | Dépend du domaine ? |
|---|---|---|
| **`core`** | registre, moteur DAG, méta-composants, validation, i18n, overlay doc | **Non** |
| **Adaptateur de domaine** | types de flux, types de valeurs, plugins, vues, aperçu | **Oui** |
| **`ui` (coquille)** | palette, canevas, inspecteur, fil d'Ariane, nœud générique | Générique, piloté par des registres |

**Règle d'or** : *livrer un nouveau domaine = fournir un adaptateur (types + plugins + vues), sans modifier `core` ni la coquille `ui`.*

[Actuel] `core/*` est déjà agnostique. Les couplages résiduels à extraire :
1. `TypeValeur` (union figée `AudioBuffer|Float32Array|File|…`) dans `core/types.ts` ;
2. les types de ports (`"audio"|"midi"|"controle"|"texte"`) + couleurs codés en dur ;
3. ~18 branches `if (ficheId === …)` dans `ui/AtelierNode.tsx` (rendu spécifique) ;
4. `ctxAudio` / `toutesEntreesAudio()` dans le contexte d'exécution.

---

## 3. Contrat de plugin (`PluginDef`)

Unité de base. Une fiche décrit **tout** ce qu'un bloc expose.

```ts
interface PluginDef<TValeur = unknown> {
  id: string;                 // identifiant stable, kebab-case
  nom: string; nomEn?: string;
  univers: string; famille: string;   // taxonomie catalogue (2 niveaux)
  resume: string; resumeEn?: string;  // phrase toujours visible
  notice?: string; noticeEn?: string; // « en savoir plus »
  entrees: PortDef[]; sorties: PortDef[];
  parametres: ParametreDef[];
  executer: (ctx: ContexteExecution<TValeur>) => Promise<ResultatExec<TValeur>>;
  vue?: string;               // [Cible] id de vue personnalisée (registre de vues)
  alias?: string[];           // [Cible] anciens id (migration) — actuellement map centrale
  etiquettes?: string[];
}

interface PortDef {
  nom: string; nomEn?: string;
  type: string;               // id de type de flux (voir §4)
  sousType?: string;          // ex. "stereo" | "mono"
  dynamique?: boolean;        // entrée variadique (bouton « + »)
}

interface ParametreDef {
  nom: string; nomEn?: string;
  type?: "choix" | "curseur" | "texte" | "dossier";
  options?: string[]; plage?: [number, number]; pas?: number;
  defaut: string | number; unite?: string;
  doc?: string; docEn?: string;   // info-bulle (obligatoire in fine, cf. §7)
}
```

Le contrat est **domaine-neutre** : seuls le contenu des ports (`type`), la nature
des `parametres` et le corps de `executer` sont spécifiques.

---

## 4. Types de flux & de valeurs

### 4.1 Types de flux (les couleurs des ports) — ✅ registre
[Fait] **Registre de types de flux** (`core/typesFlux.ts`), peuplé par l'adaptateur
(`plugins/typesFlux.ts` pour l'audio) :
```ts
interface TypeFlux {
  id: string; couleur: string; libelle?: string;
  compatible?: (cibleId: string) => boolean; // défaut : égalité d'id
}
```
`PortDef.type` est un **id opaque**. La couleur des ports (`couleurFlux(id)`) et la
validation de connexion (`fluxCompatibles(source, cible)`) interrogent le registre —
plus aucune union figée dans le cœur ni l'UI. Le domaine audio déclare
`audio / midi / controle / texte / fichier` ; un domaine « image » déclarerait
p.ex. `image / masque / nombre / courbe`.

### 4.2 Types de valeurs (ce qui circule) — ✅ paramétré
[Fait] Le cœur est **générique sur `TValeur`** : `ContexteExecution<TValeur, TRuntime>`,
`FonctionPlugin<…>`, `PluginDef<…>`. Le cœur ne manipule les valeurs que de façon
opaque (sortie → entrée) ; seuls les plugins les interprètent. Les paramètres ont une
**valeur par défaut** (`TypeValeur` audio / `AudioContext`) pour que les plugins
existants restent inchangés ; un adaptateur fournit son propre `TValeur`.
Reste (polish) : déplacer l'union `TypeValeur` hors de `core` vers le domaine audio.

---

## 5. Contexte d'exécution (`ctx`) — ✅ agnostique

Passé à chaque `executer`. Interface désormais **domaine-neutre** :

```ts
interface ContexteExecution<TValeur = TypeValeur, TRuntime = AudioContext> {
  noeud: { id: string; data: Record<string, unknown> };
  aretes: Arete[];
  resultats: Map<string, TValeur[]>;
  entree: (index: number) => TValeur;      // valeur branchée sur l'entrée i
  entrees: () => TValeur[];                 // toutes les entrées (filtrage = ressort du domaine)
  paramNombre: (nom: string, defaut: number) => number;
  paramTexte:  (nom: string, defaut: string) => string;
  onProgress: (msg: string) => void;
  runtime: TRuntime;         // contexte domaine (audio : AudioContext)
  repertoireTravail: string; // I/O optionnelle
}
```
[Fait] `ctxAudio` → `runtime` (opaque, fourni par l'hôte) ; `toutesEntreesAudio(): AudioBuffer[]`
→ `entrees(): TValeur[]` générique — les plugins audio filtrent eux-mêmes
(`ctx.entrees().filter(v => v instanceof AudioBuffer)`).

`executer` renvoie `{ valeurs: TValeur[]; message?: string }` — un tableau parallèle
aux `sorties` de la fiche.

---

## 6. Moteur d'exécution (`core/engine` + boucle `lancer`)

1. **Tri topologique** du DAG (Kahn) ; option « priorité » = n'exécuter que les ancêtres d'un nœud cible.
2. **Exécution par niveaux** (parallélisme : nœuds indépendants d'un même niveau en `Promise.all`).
3. **Cache par nœud**, invalidé par une **empreinte** `hash(paramètres) + hash(sources entrantes)` ; réutilisé si inchangé et amont non retraité.
4. **Résolution des entrées** : `entree(i)` lit `resultats[source][indexSortie]` via les handles d'arête (`in:i` / `out:j`).
5. **Erreurs bavardes** : toute exception d'un `executer` est capturée, journalisée (`console.error`) et remontée en message sur le nœud (statut `erreur`).

Statuts par nœud : `attente | en_cours | termine | erreur` (spec §3.6).

---

## 7. Documentation & i18n (overlay)

- **Contenu séparé du code** : `plugins/notices.ts` mappe `id → notice` et `nomParam → doc`, appliqué à l'enregistrement (`avecDoc`). Idem noms/labels EN. → la doc se relit/traduit en un seul endroit, sans toucher aux fiches.
- **Deux niveaux** (§3.9) : résumé toujours visible + notice « en savoir plus » repliable ; info-bulle « ? » par paramètre. Bilingue partout (nœud du canevas **et** inspecteur).
- **i18n** : dictionnaire clé→{fr,en} + toggle global.

---

## 8. Méta-composants (sous-graphes, §3.8)

- **Encapsuler** une sélection en un méta-nœud ; **ports exposés = arêtes frontière** (type hérité du port interne) ; sortie interne à fan-out mutualisée.
- **Catalogue** : le méta est enregistré comme plugin (réutilisable, relié comme tout nœud).
- **Exécution par aplatissement** : `aplatirGraphe` remplace récursivement les méta-nœuds par leur intérieur (ids préfixés) avant le moteur → moteur inchangé, imbrication gérée.
- **Édition** : double-clic → ouvre l'intérieur (fil d'Ariane) ; des **nœuds-frontière** matérialisent les ports exposés ; à la sauvegarde, `redériverMeta` reconstruit les ports depuis les frontières (types hérités, index stables).
- **Persistance** : les définitions de méta sont sérialisées avec le graphe.

Logique **pure et testée** dans `core/meta.ts` (créer / aplatir / re-dériver).

---

## 9. Persistance

`{ nodes, edges, metas, viewport }` en JSON. Sérialisation qui **retire les objets non-JSON** (fichiers, blobs) — seules les métadonnées/paramètres sont conservés ; les fichiers sont à recharger. À l'import : ré-enregistrer les `metas` **avant** de reconstruire les nœuds (résolution des méta-nœuds).

---

## 10. Qualité — garde-fou du registre

`enregistrer(def)` applique `valider(def)` :
- **Erreurs bloquantes** (non enregistré) : `id`/`nom`/`resume`/`executer` manquant.
- **Avertissements** (dev) : notice absente, paramètre sans doc.
- **Dédup** : même `id` → remplacement en place (compatible rechargement à chaud, pas de doublon palette).
- **Alias** : table centrale d'anciens id → id actuel (migration des graphes sauvegardés).

---

## 11. Registre de vues (extension UI) — ✅ fait

[Fait] Les ~18 branches `if (ficheId === …)` ont été extraites d'`ui/AtelierNode.tsx`
(520 → 163 l.) vers un **registre** `ui/vues.tsx` : `{ id/predicate → composant, position
avant|après }`. `AtelierNode` est une coquille générique qui résout les vues d'un nœud
(`vuesPourNoeud(ficheId, position)`) et leur passe `{ data, onChanger… }`. Uploader,
enregistreur, sélecteur SoundFont, clavier, export, forme d'onde sont des **vues
enregistrées par le domaine**. → Découple l'UI du domaine **et** fournit le point
d'extension aux autres domaines (image→canvas, données→grille, etc.).

---

## 12. Recette : instancier un nouveau domaine

1. Définir les **types de flux** (`TypeFlux[]`) + couleurs.
2. Définir le type **`TValeur`** du domaine et le **`runtime`** du contexte.
3. Écrire les **plugins** (`PluginDef<TValeur>` + `executer`), rangés par univers/famille.
4. Fournir les **notices/labels** (overlay) — le garde-fou impose la doc.
5. Enregistrer les **vues** personnalisées (aperçus, éditeurs inline) au registre de vues.
6. Choisir la **convention d'aperçu** (lecteur audio / canvas image / grille de données…).

**Exemple (traitement d'image)** : flux `image | masque | nombre` ; `TValeur = ImageBitmap | Float32Array | number` ; plugins `Flou`, `Seuil`, `Composer`, `Convolution` ; vue « aperçu » = `<canvas>` ; aperçu final = image téléchargeable. Le cœur, la palette, l'inspecteur, les méta-composants, la doc et la persistance **restent identiques**.

---

## 13. Maintenabilité — dette résorbée

Les quatre gros fichiers ont été découpés (voir `ROADMAP.md` / `DECOUPAGE-APP.md`) :

| Fichier d'origine | Avant | Après |
|---|---|---|
| `audio/_audio_backup.ts` | 3474 l. | → 7 modules `audio/*` (io, effets-*, generation, midi, analyse) |
| `ui/App.tsx` | 839 l. | **437 l.** + 3 hooks `ui/hooks/*` (persistance, méta, exécution) |
| `plugins/complements.ts` | 664 l. | → 6 fichiers par famille (`generateurs`, `montage`, `collections`…) |
| `ui/AtelierNode.tsx` | 520 l. | **163 l.** (coquille) + registre `ui/vues.tsx` (§11) |

---

## 14. État actuel vs cible (synthèse honnête)

**Déjà générique** : registre, moteur DAG + cache, méta-composants (création /
aplatissement / navigation / re-dérivation), validation/garde-fou, alias, i18n,
overlay doc, persistance, palette/inspecteur/canevas génériques.

**Les 4 extractions multi-domaines sont faites** :
1. ✅ `TValeur` paramétré — `ContexteExecution/FonctionPlugin/PluginDef<TValeur, TRuntime>` (défauts audio).
2. ✅ Registre de types de flux — `core/typesFlux.ts` (couleur + compatibilité), peuplé par le domaine.
3. ✅ Registre de vues — `ui/vues.tsx` (plus de `if ficheId===` dans `AtelierNode`).
4. ✅ `runtime` générique — `ctxAudio`→`runtime`, `toutesEntreesAudio`→`entrees()`.

*attic* est désormais un **framework d'éditeur de flux réutilisable** : un nouveau
domaine s'écrit comme un **adaptateur** (types de flux + `TValeur`/`runtime` + plugins
+ vues + notices), sans réécrire le cœur ni l'UI (recette §12).

**Contrainte §14.1 — Registre mono-domaine** : le registre global est
mono-domaine — un seul adaptateur est enregistré par instance de l'app. Le
cast de frontière (`trouverDefAudio` dans `audio/index.ts`) suppose que toute
fiche dans le registre est audio. Un garde-fou runtime vérifie `univers` et
lève une erreur explicite si une fiche étrangère remonte. Si deux domaines
devaient coexister, il faudrait passer à un `Registre<TV, TR>` instancié par
domaine (le cast disparaîtrait). Ce n'est pas un cas d'usage actuel.

**Prouvé par le domaine fantôme** : `core/domaine-nombre.test.ts` crée un
domaine `number`/`null` avec 4 micro-plugins, calcule `(4×2)+3 = 11` sans
modifier le cœur, et teste `validerGraphe` (types incompatibles + ports requis).
57 tests protègent le cœur, dont 16 dans le domaine fantôme.
