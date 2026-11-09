# Feuille de route architecture — Attic

## Diagnostic : pourquoi une modification en casse une autre

Le graphe nodal d'Attic est composé de trois couches qui partagent trop d'état et de conventions implicites :

1. **État utilisateur et état de calcul sont mélangés** — *résolu dans son mécanisme, pas dans sa forme (relu le 2026-10-31).*  
   Le mécanisme existe : `core/saisies.ts` déclare les saisies par genre, `core/cycle-de-vie.ts`
   classe les champs (utilisateur, résultat, gardés au réglage, média local) et fixe les trois
   transitions ; l'exécuteur rend par les canaux `affichage`, `designe` et `moteur` de
   `core/types.ts`, et plus aucun plugin n'écrit sur `ctx.noeud.data`. Ce qui reste : le type réel
   du nœud, `DonneesNoeud` dans `src/ui/AtelierNode.tsx`, est un sac ouvert qui mêle encore saisies,
   résultats matérialisés (`audioResultatUrl`, `audioResultatBuffer`) et onze callbacks React. Les
   classes de champs, elles, sont dans le cœur depuis le lot 1 (`core/classes-de-champs.ts`).
   Relu le 2026-11-06 : inchangé, et ce type a un homonyme, le `DonneesNoeud` de
   `src/ui/noeud-atelier.ts`, sorti d'`App.tsx` le 2026-11-01, sans les callbacks et ouvert lui
   aussi par `[key: string]: unknown`.
   Le diagnostic d'origine suit.
   `NodeData` contient à la fois des données saisies par l'utilisateur (`zonesSelectionnees`, `parametres`, fichiers chargés) et des résultats de l'exécution (`audioResultatUrl`, `audioResultatBuffer`, `mp3Url`, `statut`). Quand un hook comme `useExecutionGraphe` réinitialise un nœud, il ne peut pas distinguer ce qui est calculé de ce qui appartient à l'utilisateur, ce qui efface des sélections de zones ou des paramètres.

2. **Couplage via des chaînes de caractères localisées** — ✅ *résolu en v2.2.2, voir feuille de route ci-dessous.*  
   Plusieurs plugins (ex. `Masque de zones`, `Boucle`, `Porte`) comparent la valeur d'un paramètre `choix` avec la chaîne française affichée (`"Conserver les zones"`). Si l'UI est en anglais, si on renomme un label, ou si la valeur stockée vient d'une ancienne sauvegarde, le plugin interprète mal l'action. La langue d'affichage ne devrait jamais être une clé de logique métier.

3. **Hooks globaux avec des effets de bord larges** — *atténué par le lot 2, pas résolu (relu le 2026-11-06).*  
   `App.tsx` et `useExecutionGraphe.ts` concentrent la création des nœuds, la suppression, la réinitialisation, l'exécution, le cache, la gestion des URLs blob, etc. Une modification dans la logique de reset ou de cache peut se propager à l'ensemble des 200+ nœuds, car il n'y a pas de garde-fou par famille de nœud. (`App.tsx` était passé de 437 à 1013 lignes depuis l'extraction de hooks documentée dans `APP-BREAKDOWN.md`, et à 1449 le 2026-10-31 ; `useExecutionGraphe.ts` était à 1777, dont une seule fermeture, `lancerUnePasse`, de 1166 lignes. Relu le 2026-11-06, après le lot 2 : `App.tsx` compte 393 lignes de code pour 575 en tout, `useExecutionGraphe.ts` 289 pour 681, et `lancerUnePasse` 482 lignes, de la ligne 180 à la ligne 661. La passe reste une seule fermeture React.)

4. **Manque de tests d'intégration entre UI et plugins** — ✅ *résolu en v2.2.2, voir feuille de route ci-dessous.*  
   Les tests unitaires couvrent bien les plugins isolés, mais il n'existe pas de tests qui exécutent une chaîne complète : sélection de zones dans le composant React → passage dans le graphe → exécution du plugin. De ce fait, une régression sur un chemin critique (sélecteur → masque) n'est détectée que manuellement.

5. **Absence de contrat explicite entre UI et plugins** — *en partie résolu par le lot 1 (relu le 2026-11-06).*  
   Les `executer` sont typés par inférence depuis le lot 1 (voir la feuille de route ci-dessous),
   sauf un, `executer(_ctx: any)` dans `src/plugins/boucle-collection.ts`, qui ne lit pas son
   contexte. Ce qui reste : un réglage se lit toujours par un nom en chaîne,
   `paramTexte(nom: string, defaut)` de `src/core/types.ts`, que le build ne rapproche pas des
   paramètres déclarés ; et 221 `any` restent dans `src/plugins/` hors tests, relevés par motif,
   dont 53 `catch (e: any)`.
   Le diagnostic d'origine suit.
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

> **Statut re-vérifié le 2026-11-06** contre le code réel d'`origin/master`, en **v5.1.2** (les
> relevés précédents dataient du 2026-10-31, en v5.1.0, et du 2026-08-03, en v3.1.5). Chaque case
> porte sa note datée ; `CHANGELOG.md` fait foi pour ce qui a bougé entre deux relevés. Le plan de
> correction en cinq lots qui en découle est dans la revue du 2026-10-31
> (`work/revue-architecture-2026-10-31.md`, non versionné).
>
> Où en sont les cinq lots au 2026-11-06, d'après les pull requests fusionnées :
>
> - **Lot 0, l'outillage** : fait le 2026-10-31 (PR 247). Reste son point A6, reporté avec sa
>   raison dans `CHANGELOG.md` : les URL de médias remplacées ne sont pas révoquées, l'historique
>   d'annulation et le collage partageant l'URL avec le nœud. Et `src/ui/rechargerFichiers.ts`
>   écrit toujours dans `n.data` en place, sans passer par `setNodes`.
> - **Lot 1, le contrat des exécuteurs** : fait le 2026-10-31 (PR 250).
> - **Lot 2, les trois géants** : fait pour `App.tsx` le 2026-11-01, en neuf PR entre la 257 et la
>   267, pour `useExecutionGraphe.ts` le 2026-11-02, en sept PR entre la 271 et la 280, et pour
>   `usePersistance` du 2026-11-08 au 2026-11-10, en quatre PR à partir de la 322. Ce troisième
>   géant n'était pas dans le plan du lot. Sa fonction passe de 434 à 131 lignes, et ses quatre
>   pièces sont sorties dans `ui/projet-a-ecrire.ts`, `hooks/useJournalDeSession.ts`,
>   `hooks/useImportProjet.ts` et `ui/ecriture-projet.ts`. Pas fait : la norme de cent vingt
>   lignes par fonction que le lot proposait d'ajouter à `src/docs/generer-compte-lignes.test.ts`.
>   `usePersistance` y resterait au-dessus, à 131 lignes, et la fonction de `useImportProjet`
>   aussi, à 129.
> - **Lot 3, hors du fil** : fait du 2026-11-06 au 2026-11-07. Sa première pièce est fusionnée
>   le 2026-11-06 (PR 292) :
>   « Débruitage IA » et le séparateur MDX-Net calculent dans un worker, avec le wasm d'onnxruntime
>   livré dans `dist/` (gel relevé de 769 à 16 ms et de 9 811 à 25 ms), et le découpage du MDX est
>   corrigé. Sa deuxième, « Critères schaefferiens » hors du fil (un gel total de 379 ms ramené à
>   2 ms), est fusionnée le même jour (PR 294). Sa troisième, « Restauration d'écrêtage » hors du
>   fil (2 875 ms de gel total ramenés à 9 ms au seuil de 0,5), est fusionnée dans la nuit (PR 295),
>   et sa quatrième, « Remplissage de trou » hors du fil (8 094 ms de gel total ramenés à 10 ms sur
>   les silences détectés à −12 dB), le 2026-11-07 (PR 297), comme sa cinquième, « Réverbération à
>   réseau » hors du fil (105 ms de gel total ramenés à 1 ms, PR 298). Sa sixième, le tempo
>   d'`analyse` hors du fil (un gel total de 112 ms ramené à 1 ms pour le « Détecteur de tempo », de
>   111 ms à 1 ms pour l'« Analyse audio »), est fusionnée le même jour (PR 299), comme sa
>   septième, l'« Analyse émotionnelle » hors du fil (211 ms de gel total, PR 300). CES GELS
>   D'APRÈS SONT REMESURÉS : la sonde du banc ne comptait pas le bloc qu'un composant fait avant sa
>   première attente. Avec la sonde corrigée, le 2026-11-07, ils valent 20 ms pour le débruitage,
>   30 ms pour le MDX, 2 ms pour les critères, 8 ms pour l'écrêtage, 2 ms pour le trou et pour la
>   réverbération, de 1 à 3 ms pour le tempo, et 2 ms pour l'émotion, une fois le mélange de ses
>   canaux passé au worker : la page le faisait avant d'envoyer, et gelait de 9 à 10 ms (PR 302).
>   Sa huitième, le « Transcripteur MIDI » hors du fil, est fusionnée (PR 303) : 127 ms de gel
>   total ramenés à 2 ms en monophonique, et de 96 à 119 ms ramenés à 22-43 ms en polyphonique, où
>   ne reste que Basic Pitch. Son worker est le seul d'un composant que la base d'empreintes ne couvre pas, faute
>   de sortie audio : `tests-e2e/transcription-dans-application.spec.ts` en fait la preuve à sa
>   place. Sa neuvième, la « Matrice d'auto-similarité » hors du fil, est fusionnée (PR 304) : sur
>   deux minutes de son, 1 128 ms de gel total ramenés à 10 ms. CE QUI RESTE SE MESURE SUR UN SON
>   LONG, trois secondes ne suffisant plus à départager. Sa dixième, `multicanal` hors du fil, est
>   fusionnée (PR 305) : sur deux minutes, le « Rendu d'objets » passe de 872 ms d'un bloc à 35 ms,
>   et le « Spatialiseur » de 663 à 36 ms. La page recopiait ensuite deux fois les douze canaux dans
>   le tampon qu'elle bâtit ; une seule copie depuis, et il reste de 21 à 27 ms. Le point 2 du lot,
>   ses sept modules, est ainsi épuisé. Son point 3 a sa première moitié fusionnée le même jour
>   (PR 306) : les neuf handlers IPC de `main.cjs` qui lisent ou écrivent un fichier entier le font
>   par `fs.promises`, et la lecture d'un fichier de 258 Mo ne rend plus le processus principal
>   sourd que 98 à 143 ms au lieu de 234 à 411, le reste étant l'envoi des octets à la page.
>   `electron/fichiers-entiers-ipc.test.ts` refuse depuis qu'un handler lise ou écrive un fichier
>   entier d'un bloc, hormis quatre exceptions déclarées. L'autre moitié, les sondes Python et Julia
>   au lancement, reste telle quelle, décidé par Fabien le 2026-11-07, comme l'écriture synchrone de
>   leurs chemins et de leurs scripts : ce sont les quatre exceptions. Basic Pitch, qui gelait la
>   page de 22 à 43 ms dans le Transcripteur polyphonique, calcule dans le worker d'inférence ONNX
>   (PR 309) : 35 ms ramenés à 2 ou 3 sur le son d'essai ; sur deux minutes, ce qui reste est
>   l'envoi de l'entrée au worker, 20 ms pour deux canaux. Reste dans la page l'analyse du genre,
>   qui ne se mesure pas au banc, son modèle ne se lisant que par le pont d'Electron. Le point 4 du
>   lot, la borne en octets de `cacheExec`, n'est pas fait, et ne le sera pas sans autre raison :
>   `src/core/cache-execution.ts` consigne la mesure du 2026-10-26, ce cache ne gardant que des
>   tampons que le magasin des résultats retient déjà.
> - **Lot 4, les canoniques ignorés** : fait du 2026-10-31 au 2026-11-01, en six PR, de la 251 à
>   la 256. `ia.ts` garde sa STFT, et `CHANGELOG.md` dit pourquoi.
> - **Lot 5, à décider** : une seule de ses quatre propositions est décidée, par Fabien le
>   2026-11-07 : `electron/main.cjs` en six modules `ipc-*.cjs`, par famille de canaux, une PR par
>   module et aucun comportement changé. Le premier, `ipc-maj.cjs`, reprend les six canaux `maj:`
>   (PR 311). Le deuxième, `ipc-scripts.cjs`, reprend les neuf canaux `python:`, `julia:` et
>   `scripts:` avec la détection des deux interprètes (PR 312). Le troisième, `ipc-fichiers.cjs`,
>   reprend les vingt canaux `fichier:`, `dossier:`, `exemples:` et `mp3:` avec le dossier de travail
>   par défaut (PR 315). Le quatrième, `ipc-modeles.cjs`, reprend les cinq canaux `telecharger:url`,
>   `modeles:` et `travail:annuler`, et rend aux deux moteurs qui prennent eux-mêmes leur paquet le
>   téléchargement et de quoi savoir s'il en tourne un (PR 319). Le cinquième, `ipc-moteurs.cjs`,
>   reprend les vingt canaux des moteurs, Ollama compris, et reçoit de `main.cjs` ce que les modèles
>   lui ont rendu, sur la branche `travaux/ipc-moteurs`. `main.cjs` garde 12 appels
>   `ipcMain.handle(` sur 71, en 600 lignes au lieu de 2 103. Restent les six canaux `node:`, qui
>   feront un septième module, décidé par Fabien le 2026-11-08, et les fenêtres, où `doc:ouvrir`
>   rejoindra `app:quitter`. La norme de taille ne compte que `src/`.
>   Les trois autres propositions, le regroupement par familles, le chargement par catégorie et la
>   règle de nommage, restent à décider.
>
> La dette de taille compte treize fichiers, contre quinze le 2026-10-19 : `App.tsx` et
> `useExecutionGraphe.ts` en sont sortis, et aucun autre.

### Court terme (avant la prochaine release)

- [x] **Identifier tous les plugins qui comparent des libellés localisés** et les faire utiliser un id canonique.  
  Fait en v2.2.2 : `ParametreDef.optionIds` ajouté, `0` comparaison à un libellé
  localisé restante dans `src/plugins/` (grep vérifié). Ancien exemple
  (« Conserver les zones ») corrigé le premier ; le mécanisme a ensuite été
  généralisé à tous les paramètres `choix` sensibles (gate/expandeur,
  aligneur de piste, comparateur A/B, grille tonale, quantisation MIDI,
  rythme de Cantor, spectrogramme fractal, Magenta, transcripteur MIDI…).
- [x] **Marquer explicitement les champs utilisateur** dans `NodeData` et exclure ces champs de `reinitialiserNoeud`.
  Fait (relu le 2026-10-31) : `core/saisies.ts` déclare les saisies, `core/cycle-de-vie.ts` les
  classes et les transitions, `src/plugins/cycle-de-vie-noeuds.test.ts` les éprouve sur toutes les
  fiches. `CLASSES` et `CHAMPS_RESULTAT` ont rejoint le cœur (`core/classes-de-champs.ts`) avec le
  lot 1 de la revue du 2026-10-31.
- [x] **Ajouter des tests d'intégration** pour les scénarios les plus sensibles.
  Fait et dépassé : `src/plugins/integration.test.ts` couvre 19 cas
  (bien au-delà des 5 scénarios listés à l'origine) : quatorze sur la bascule
  libellé localisé → id canonique ci-dessus, quatre sur Griffin-Lim et un sur
  l'absence de lecteur de l'Aligneur de piste. Relu le
  2026-11-06 : ces cas enchaînent les `executer` pris au registre, sans le moteur
  ni React ; le graphe entier, lui, est rejoué par les empreintes des exemples.
- [ ] **Documenter les chemins critiques** dans un `IMPACT.md` ou ce fichier. Pas de `IMPACT.md` ; non fait (ROADMAP.md joue un rôle voisin mais ne remplace pas un tel document).

### Moyen terme (prochaines releases)

- [ ] **Extraire le runtime d'exécution** de `useExecutionGraphe.ts` dans un module pur (`src/core/execution.ts`) sans dépendance React.
  Partiellement fait : `src/core/execution.ts` existe et teste
  `estResultatEnErreur` (la règle « tout-null = échec », testée), mais c'est
  un extrait ciblé, pas l'extraction complète de l'ordonnancement/cache/
  résolution — ceux-ci vivent déjà dans `core/graphe.ts` depuis le
  refactoring documenté dans `APP-BREAKDOWN.md` (antérieur à cette feuille de
  route). Relu le 2026-10-31 : le moteur pur s'est étendu depuis dans `core/cache-execution.ts`,
  `core/cycle-de-vie.ts`, `core/memoire.ts`, `core/conteneurs.ts`, `core/boucle-graphe.ts`,
  `core/saut-de-boucle.ts` et `core/services-domaine.ts` (34 fichiers de test dans `src/core/`),
  mais `useExecutionGraphe.ts` est monté à 1777 lignes (1624 depuis que les classes de champs sont
  dans `core/classes-de-champs.ts`, lot 1) et la passe elle-même, `lancerUnePasse`, reste une
  fermeture React de 1166 lignes.
  Relu le 2026-11-06 : le lot 2 a mis dans le cœur la préparation de la passe
  (`core/preparation-passe.ts`), les graines (`core/graines-de-passe.ts`) et le contexte passé à
  l'exécuteur (`core/contexte-de-passe.ts`) ; le correctif de résultat et le ménage d'après passe
  sont sortis côté interface (`src/ui/correctif-resultat.ts`, `src/ui/menage-apres-passe.ts`).
  `src/core/` compte 38 fichiers de test. La boucle nœud par nœud reste dans `lancerUnePasse`,
  fermeture React de 482 lignes ; elle n'appelle plus `setNodes` elle-même, elle le prête au
  ménage d'après passe.
- [x] **Générer les types des plugins** à partir de `FicheAudio` pour typer les `executer`. Fait le 2026-10-31 (lot 1 de la revue) : `executer(ctx: any)` était présent 469 fois dans 267 fichiers de `src/plugins/` ; il n'en reste qu'un, `executer(_ctx: any)` de `src/plugins/boucle-collection.ts`, que le lot 0 avait renommé et qui sortait donc du motif (la revue en comptait 470 ; relu le 2026-11-06). L'annotation retirée, le tableau `as FicheAudio[]` type le contexte par inférence ; 33 erreurs sont sorties, dont huit fiches cachées derrière `as unknown as FicheAudio[]` parce que `ValeurAudio` ne déclarait pas la séquence, le spectrogramme ou le cercle qu'elles rendaient. L'union dit désormais les quinze types qui circulent, et les fonctions d'aide prennent `ContexteAudio`.
- [x] **Introduire des tests de non-régression** qui rejouent des graphes de référence.
  Fait (relu le 2026-10-31) : `tests-e2e/empreintes.json` surveille 74 composants isolés (84 depuis
  le 2026-11-07, `debruitage-ia`, `criteres-schaefferiens`, `restauration-ecretage`,
  `remplissage-trou`, `reverbe-reseau`, `detecteur-tempo`, `analyse-emotionnelle`,
  `auto-similarite`, `spatialiseur` et `rendu-objets` compris) et
  `tests-e2e/empreintes-exemples.json` le son de chaque exemple livré, chaîne entière.
- [x] **Limiter la taille des fichiers `App.tsx` et `useExecutionGraphe.ts`** en extrayant des hooks spécialisés (cache, reset, persistance, URL blob).
  Pas fait au relevé du 2026-08-03 — et la tendance s'est inversée : `App.tsx` était descendu à 437
  lignes après l'extraction documentée dans `APP-BREAKDOWN.md`, il est
  remonté à **1013 lignes** avec les fonctionnalités ajoutées depuis
  (couleurs de nœuds, badges de temps d'exécution, placement de notes/cadres,
  éditeur de formules, etc.). `useExecutionGraphe.ts` : 538 lignes.
  Relu le 2026-10-31 : `App.tsx` 1449 lignes (37 états, 35 `useCallback`, 13 `useEffect`, sept
  hooks métier), `useExecutionGraphe.ts` 1777, puis 1624 après le lot 1. Les deux sont dans la dette de `LINE-COUNT.md`.
  Fait pour `App.tsx` le 2026-11-01, en neuf sorties (lot 2 de la revue) : 392 lignes de code,
  574 en tout, vingt-deux crochets importés de `src/ui/hooks/`, et il a quitté la dette.
  Fait pour `useExecutionGraphe.ts` le 2026-11-02, en sept sorties : 289 lignes de code, 681 en
  tout, les pilotes et les remises à zéro en crochets, les graines, le contexte et la préparation
  dans `src/core/`, le correctif de résultat et le ménage d'après passe dans `src/ui/`, et il a
  quitté la dette à son tour.
  Relu le 2026-11-06 : `App.tsx` 393 lignes de code et 575 en tout, `useExecutionGraphe.ts` 289 et
  681 ; ni l'un ni l'autre n'est revenu dans la dette.

### Long terme

- [ ] **Passer à une architecture orientée messages / événements** entre UI et moteur pour éviter que ReactFlow et l'exécution partagent le même objet mutable.
- [ ] **Ajouter des feature flags** pour les changements de runtime afin de pouvoir les désactiver rapidement.
- [ ] **Créer un manifeste de compatibilité** des plugins (version de contrat, paramètres, entrées/sorties) pour détecter les ruptures automatiquement.

---

## Ce qu'il faut retenir

- Le problème n'est pas que le programme est « trop centralisé », mais que **les frontières entre couches ne sont pas assez étanches**.
- Le remède n'est pas une réécriture totale, mais une **séparation progressive** des responsabilités et une **formalisation des contrats**.
- **Chaque modification future** doit être accompagnée d'une question : "quelle donnée utilisateur ou quel autre plugin pourrait être affecté ?" et d'un test qui couvre ce chemin.
