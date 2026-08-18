# Feuille de route architecture — Attic

## Diagnostic : pourquoi une modification en casse une autre

Le graphe nodal d'Attic est composé de trois couches qui partagent trop d'état et de conventions implicites :

1. **État utilisateur et état de calcul sont mélangés**  
   `NodeData` contient à la fois des données saisies par l'utilisateur (`zonesSelectionnees`, `parametres`, fichiers chargés) et des résultats de l'exécution (`audioResultatUrl`, `audioResultatBuffer`, `mp3Url`, `statut`). Quand un hook comme `useExecutionGraphe` réinitialise un nœud, il ne peut pas distinguer ce qui est calculé de ce qui appartient à l'utilisateur, ce qui efface des sélections de zones ou des paramètres.

2. **Couplage via des chaînes de caractères localisées** — ✅ *résolu en v2.2.2, voir feuille de route ci-dessous.*  
   Plusieurs plugins (ex. `Masque de zones`, `Boucle`, `Porte`) comparent la valeur d'un paramètre `choix` avec la chaîne française affichée (`"Conserver les zones"`). Si l'UI est en anglais, si on renomme un label, ou si la valeur stockée vient d'une ancienne sauvegarde, le plugin interprète mal l'action. La langue d'affichage ne devrait jamais être une clé de logique métier.

3. **Hooks globaux avec des effets de bord larges** — toujours vrai, voire aggravé.  
   `App.tsx` et `useExecutionGraphe.ts` concentrent la création des nœuds, la suppression, la réinitialisation, l'exécution, le cache, la gestion des URLs blob, etc. Une modification dans la logique de reset ou de cache peut se propager à l'ensemble des 200+ nœuds, car il n'y a pas de garde-fou par famille de nœud. (`App.tsx` est passé de 437 à 1013 lignes depuis l'extraction de hooks documentée dans `APP-BREAKDOWN.md`.)

4. **Manque de tests d'intégration entre UI et plugins** — ✅ *résolu en v2.2.2, voir feuille de route ci-dessous.*  
   Les tests unitaires couvrent bien les plugins isolés, mais il n'existe pas de tests qui exécutent une chaîne complète : sélection de zones dans le composant React → passage dans le graphe → exécution du plugin. De ce fait, une régression sur un chemin critique (sélecteur → masque) n'est détectée que manuellement.

5. **Absence de contrat explicite entre UI et plugins**  
   Chaque plugin lit `ctx.paramTexte`, `ctx.entree(0)`, etc. sans contrat fort sur le type, le format attendu, ou la valeur canonique des paramètres. Le type `any` est très répandu dans les fonctions `executer`, ce qui empêche TypeScript de détecter les ruptures.

Ces problèmes ne viennent pas du paradigme nodal en lui-même, mais du fait que les frontières entre UI, moteur d'exécution et logique métier des plugins ne sont pas assez étanches.

---

## Vision cible

Attic devrait être organisé en trois couches avec des interfaces explicites :

```
┌─────────────────────────────────────┐
│  UI (React)                         │  ← gère l'affichage, la sélection,
│  App / Inspector / Node views         │    la sauvegarde de l'interface
├─────────────────────────────────────┤
│  Moteur d'exécution (pur)           │  ← ordonnancement, cache, résolution
│  graphe, cache, runtime             │    des entrées, pas de React
├─────────────────────────────────────┤
│  Plugins (déclaratifs)              │  ← contrat clair : entrées, sorties,
│  FicheAudio + executeur             │    paramètres canoniques, message
└─────────────────────────────────────┘
```

**Principes non négociables**

1. **User data ≠ computed data**  
   Une réinitialisation du cache ne doit jamais effacer une donnée saisie par l'utilisateur. Les champs utilisateur doivent être marqués explicitement et ignorés par les fonctions de reset.

2. **Valeurs canoniques pour les paramètres de choix**  
   Chaque option a un id stable (`"keep"`, `"mute"`, `"gate"`, `"expander"`, etc.). L'UI traduit cet id en libellé. Le plugin ne reçoit que l'id. Plus jamais de comparaison avec des phrases en français ou en anglais.

3. **Contrat de plugin typé**  
   Le `executer` reçoit un contexte fortement typé (`ctx.param<Nom>` généré à partir de la définition du plugin). Les entrées et sorties sont vérifiées au build.

4. **Tests d'intégration par scénario métier**  
   Un scénario = un graphe en JSON + un flux d'événements utilisateur + une assertion sur le résultat final. Exemples critiques à couvrir :
   - `Sélecteur multi-zones` → `Masque de zones` (Supprimer / Conserver)
   - `Entrée audio` → `Effet` → `Sortie audio`
   - `Changement de langue` sans rupture de paramètres
   - `Reset` d'un nœud amont ne perd pas les zones en aval

5. **Refactoring progressif, pas réécriture**  
   Le code actuel fonctionne. Il faut isoler des briques une par une : d'abord les paramètres canoniques, puis le runtime, puis les tests d'intégration.

---

## Feuille de route concrète

> **Statut re-vérifié le 2026-08-03** contre le code réel (l'app était alors
> restée sur cette feuille de route depuis ~v2.2.1). Voir la note sous chaque
> case. L'app est aujourd'hui en **v3.1.2** : les cases ci-dessous n'ont pas
> été re-vérifiées depuis, `CHANGELOG.md` fait foi.

### Court terme (avant la prochaine release)

- [x] **Identifier tous les plugins qui comparent des libellés localisés** et les faire utiliser un id canonique.  
  Fait en v2.2.2 : `ParametreDef.optionIds` ajouté, `0` comparaison à un libellé
  localisé restante dans `src/plugins/` (grep vérifié). Ancien exemple
  (« Conserver les zones ») corrigé le premier ; le mécanisme a ensuite été
  généralisé à tous les paramètres `choix` sensibles (gate/expandeur,
  aligneur de piste, comparateur A/B, grille tonale, quantisation MIDI,
  rythme de Cantor, spectrogramme fractal, Magenta, transcripteur MIDI…).
- [ ] **Marquer explicitement les champs utilisateur** dans `NodeData` et exclure ces champs de `reinitialiserNoeud`. Toujours pas fait.
- [x] **Ajouter des tests d'intégration** pour les scénarios les plus sensibles.
  Fait et dépassé : `src/plugins/integration.test.ts` couvre 14 chaînes
  UI → graphe → plugin (bien au-delà des 5 scénarios listés à l'origine),
  toutes centrées sur la bascule libellé localisé → id canonique ci-dessus.
- [ ] **Documenter les chemins critiques** dans un `IMPACT.md` ou ce fichier. Pas de `IMPACT.md` ; non fait (ROADMAP.md joue un rôle voisin mais ne remplace pas un tel document).

### Moyen terme (prochaines releases)

- [ ] **Extraire le runtime d'exécution** de `useExecutionGraphe.ts` dans un module pur (`src/core/execution.ts`) sans dépendance React.
  Partiellement fait : `src/core/execution.ts` existe et teste
  `estResultatEnErreur` (la règle « tout-null = échec », testée), mais c'est
  un extrait ciblé, pas l'extraction complète de l'ordonnancement/cache/
  résolution — ceux-ci vivent déjà dans `core/graphe.ts` depuis le
  refactoring documenté dans `APP-BREAKDOWN.md` (antérieur à cette feuille de
  route). `useExecutionGraphe.ts` reste à 538 lignes et continue d'orchestrer
  React + logique métier ensemble.
- [ ] **Générer les types des plugins** à partir de `FicheAudio` pour typer les `executer`. Pas fait : `executer(ctx: any)` reste présent dans 60 fichiers de `src/plugins/` (vérifié par grep).
- [ ] **Introduire des tests de non-régression** qui rejouent des graphes de référence. Pas fait : aucun fichier de graphe "golden" trouvé.
- [ ] **Limiter la taille des fichiers `App.tsx` et `useExecutionGraphe.ts`** en extrayant des hooks spécialisés (cache, reset, persistance, URL blob).
  Pas fait — et la tendance s'est inversée : `App.tsx` était descendu à 437
  lignes après l'extraction documentée dans `APP-BREAKDOWN.md`, il est
  remonté à **1013 lignes** avec les fonctionnalités ajoutées depuis
  (couleurs de nœuds, badges de temps d'exécution, placement de notes/cadres,
  éditeur de formules, etc.). `useExecutionGraphe.ts` : 538 lignes.

### Long terme

- [ ] **Passer à une architecture orientée messages / événements** entre UI et moteur pour éviter que ReactFlow et l'exécution partagent le même objet mutable.
- [ ] **Ajouter des feature flags** pour les changements de runtime afin de pouvoir les désactiver rapidement.
- [ ] **Créer un manifeste de compatibilité** des plugins (version de contrat, paramètres, entrées/sorties) pour détecter les ruptures automatiquement.

---

## Ce qu'il faut retenir

- Le problème n'est pas que le programme est « trop centralisé », mais que **les frontières entre couches ne sont pas assez étanches**.
- Le remède n'est pas une réécriture totale, mais une **séparation progressive** des responsabilités et une **formalisation des contrats**.
- **Chaque modification future** doit être accompagnée d'une question : "quelle donnée utilisateur ou quel autre plugin pourrait être affecté ?" et d'un test qui couvre ce chemin.
