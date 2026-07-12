# Découpage d'`App.tsx` — terminé ✅

**État : les 3 hooks sont extraits.** `App.tsx` est passé de **839 à 437 lignes**
(`usePersistance` + `useMetaComposants` + `useExecutionGraphe` dans `src/ui/hooks/`),
sans régression : `tsc` 0 erreur · 19 tests · build OK · flux réels revérifiés au
navigateur à chaque étape. Ce document retrace la méthode et sert de check-list de
non-régression pour toute reprise.

But : décomposer `ui/App.tsx` (~800 l., composant « Dieu ») en hooks **sans
régression**. La difficulté n'est pas le typage (couvert par `tsc`) mais la
**vérification comportementale** : les régressions runtime (closures périmées,
refs non mises à jour, ordre des effets) sont invisibles à la compilation, et une
partie des flux (drag-connexion, lecture audio, dialogues Electron, Demucs) n'est
pas pilotable automatiquement.

Méthode : **tests de caractérisation d'abord, refactor ensuite** (rouge→vert).

---

## Étape 1 — faite : logique de graphe pure + tests

La logique de graphe, jusque-là **inline dans la boucle `lancer`**, est extraite
en fonctions **pures, domaine-neutres, testées** :

**`src/core/graphe.ts`**
| Fonction | Rôle |
|---|---|
| `ordreTopologique(ids, aretes)` | tri topologique (Kahn) → ordre d'exécution |
| `ancetres(cible, aretes)` | amont transitif d'un nœud (mode « priorité ») |
| `empreinteEntrees(nodeId, aretes)` | clé de cache « sources entrantes » |
| `empreinteParametres(data)` | clé de cache « paramètres » (actuelle, audio-teintée) |
| `resoudreEntree(nodeId, i, aretes, resultats)` | valeur branchée sur l'entrée `i` |
| `valeursEntrantes(nodeId, aretes, resultats)` | toutes les entrées (variadiques) |

**`src/core/graphe.test.ts`** — 9 tests figeant le comportement : chaîne, diamant,
nœuds isolés, cycle (renvoie l'acyclique), ancêtres, empreintes stables/sensibles,
résolution via handles (`out:2 → in:1`), entrées nulles non calculées.

**`App.tsx` délègue désormais à ces fonctions** (l'inline a été remplacé) : elles
sont la **source unique de vérité** de l'ordonnancement et du cache. Toute future
décomposition en hooks ne re-touchera plus cette logique — elle est figée + testée.

Vérifié : `tsc` **0 erreur** · **19 tests** (dont 9 nouveaux) · build OK · exécution
réelle d'un nœud dans le navigateur → statut « Done » + lecteur audio (la boucle
`lancer` passe bien par les fonctions extraites).

---

## Étapes suivantes — décomposition en hooks

Ordre proposé, du moins couplé au plus couplé, **une étape à la fois** :

1. ✅ **`usePersistance`** — export/import JSON. **Fait.** Extrait dans
   `src/ui/hooks/usePersistance.ts` (avec `serialiserMeta`), `App.tsx` appelle
   `usePersistance({...})` et branche `onExporter={exporter}` / `onImporter={importer}`.
   Extraction **à l'identique** (aucun changement de comportement). App.tsx : 808 → 703 l.
   Vérifié : `tsc` 0 erreur · 19 tests · build OK · **round-trip navigateur** (déposer
   un nœud → Export capture un JSON valide → modif d'un paramètre → Import → le nœud
   et le paramètre modifié sont restaurés, 0 erreur console).
2. ✅ **`useMetaComposants`** — grouper / dégrouper / navigation. **Fait.** Extrait
   dans `src/ui/hooks/useMetaComposants.ts` (`grouper`, `degrouper`,
   `sauvegarderContexteCourant`, `ouvrirMeta`, `remonterA` ; le helper `idUnique`
   partagé est passé dans `src/ui/ids.ts`). La logique pure reste dans `core/meta.ts`
   (testée) ; le hook ne fait que l'orchestrer avec l'état React. Extraction **à
   l'identique**. App.tsx : 703 → 596 l. Vérifié : `tsc` 0 erreur · 19 tests · build
   OK · **cycle méta complet dans le navigateur** (sélection de 2 nœuds → **Grouper**
   → double-clic ouvre l'intérieur + fil d'Ariane « Atelier / Groupe 1 » → **Atelier**
   revient à la racine → **Dégrouper** ré-expose les 2 sous-nœuds).
3. ✅ **`useExecutionGraphe`** — la boucle `lancer` + réinitialisation en cascade +
   statuts. **Fait.** Extrait dans `src/ui/hooks/useExecutionGraphe.ts` ; App récupère
   `{ lancer, reinitialiserNoeud }` et conserve `lancerRef.current = lancer` (utilisé
   par `ajouterNoeud`/`callbacksNoeud`/`usePersistance`). L'ordonnancement/cache/résolution
   restent dans `core/graphe.ts` (testé). Extraction **à l'identique** + nettoyage de 12
   imports `core`/`audio` devenus inutiles. App.tsx : 596 → 437 l. Vérifié : `tsc` 0 erreur ·
   19 tests · build OK · **exécution réelle dans le navigateur** (nœud *Random Melody* →
   **Run** / ▶ « lancer ce bloc » / barre espace → statut « termine », via le `lancer` extrait).

**Bonus — bug préexistant corrigé au passage** : le bouton **Run** de la barre d'outils
(`onLancer={lancer}` + `onClick={onLancer}`) passait l'événement du clic comme
`noeudPrioritaireId` → `priorite` devenait un objet Event, `ancetres()` ne trouvait aucun
nœud et le bouton ne lançait **rien** (seul le raccourci barre-espace, qui appelle
`onLancer()` sans argument, fonctionnait). Corrigé en `onLancer={() => lancer()}`. Bug
antérieur au refactor (ni cette ligne JSX ni `BarreOutils` n'avaient été touchés) —
découvert grâce à la vérification navigateur post-extraction.

Chaque étape :
- `tsc` + `vitest` + `build` verts ;
- **check-list manuelle** dans l'app de bureau sur la zone touchée ;
- copie de sauvegarde avant (rollback quasi gratuit).

---

## Ce que les tests NE couvrent pas (→ check-list manuelle)

Les tests unitaires figent la **logique pure**. Restent à vérifier à la main, dans
l'app de bureau, après chaque étape :
- ajouter 2 nœuds, **les relier au drag**, **Lancer** → un son sort ;
- un effet, un générateur, un **séparateur (Demucs natif)** ;
- **grouper → double-clic ouvre l'intérieur → dégrouper** ;
- **Exporter** puis **Importer** le JSON → graphe (et un méta) restaurés ;
- changer d'onglet, changer de langue, dialogues **Electron** (dossiers).

Un **workflow témoin** (`.json` exporté depuis une version qui marche) sert de
« golden file » : l'importer après refactor et comparer.

---

## Résumé

Décomposition **terminée**. Le cœur risqué de `lancer` (ordonnancement + cache +
résolution d'entrées) a d'abord été **isolé et testé** dans `core/graphe.ts` (le
filet), puis les trois hooks (`usePersistance`, `useMetaComposants`,
`useExecutionGraphe`) ont été extraits un par un vers `src/ui/hooks/`, chacun
vérifié `tsc`/tests/build + flux réel au navigateur. `App.tsx` : **839 → 437 l.**,
sans régression. Restent à `App.tsx` l'orchestration (état, onglets, JSX) et les
callbacks de nœud (`ajouterNoeud`, `callbacksNoeud`) — cohérents à y laisser.

Structure finale :

| Fichier | Rôle |
|---|---|
| `core/graphe.ts` | logique de graphe pure (topo, cache, résolution) — **testée** |
| `ui/ids.ts` | génération d'ids de nœuds (partagé) |
| `ui/hooks/usePersistance.ts` | export / import JSON (+ méta) |
| `ui/hooks/useMetaComposants.ts` | grouper / dégrouper / navigation (§3.8) |
| `ui/hooks/useExecutionGraphe.ts` | boucle `lancer` + reset + statuts |
| `ui/App.tsx` | orchestration (état, onglets, JSX, callbacks de nœud) |
