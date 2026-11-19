# Feuille de route architecture — Attic

## Diagnostic : pourquoi une modification en casse une autre

Le graphe nodal d'Attic est composé de trois couches qui partagent trop d'état et de conventions implicites :

1. **État utilisateur et état de calcul sont mélangés** — ✅ *résolu dans son mécanisme le 2026-10-31, et dans sa forme le 2026-11-11 (relu le 2026-11-19).*  
   Le mécanisme existe : `core/saisies.ts` déclare les saisies par genre, `core/cycle-de-vie.ts`
   classe les champs (utilisateur, résultat, gardés au réglage, média local) et fixe les trois
   transitions ; l'exécuteur rend par les canaux `affichage`, `designe` et `moteur` de
   `core/types.ts`, et plus aucun plugin n'écrit sur `ctx.noeud.data`. Les classes de champs sont
   dans le cœur depuis le lot 1 (`core/classes-de-champs.ts`).
   La forme a suivi le 2026-11-11, en huit PR de la 339 à la 346 : il n'y a plus qu'un
   `DonneesNoeud`, dans `src/ui/noeud-atelier.ts`, rangé en trois classes (saisies, structure,
   résultats), chacune tenue à sa table du cœur par `src/ui/noeud-atelier.test.ts`. Le sac est
   fermé, sans `[key: string]: unknown`. Le statut et la priorité ont quitté `data` pour
   `ui/statuts.ts` et `ui/priorite.ts`, les gestes pour le contexte de `ui/gestes-noeud.ts`, et
   aucun résultat n'est plus écrit dans `data` : le nœud les fusionne en s'affichant, depuis
   `ui/resultats.ts`. `IMPACT.md` dit ce que tiennent ces tables et ce qu'une modification y touche.
   Le diagnostic d'origine suit.
   `NodeData` contient à la fois des données saisies par l'utilisateur (`zonesSelectionnees`, `parametres`, fichiers chargés) et des résultats de l'exécution (`audioResultatUrl`, `audioResultatBuffer`, `mp3Url`, `statut`). Quand un hook comme `useExecutionGraphe` réinitialise un nœud, il ne peut pas distinguer ce qui est calculé de ce qui appartient à l'utilisateur, ce qui efface des sélections de zones ou des paramètres.

2. **Couplage via des chaînes de caractères localisées** — ✅ *résolu en v2.2.2, voir feuille de route ci-dessous.*  
   Plusieurs plugins (ex. `Masque de zones`, `Boucle`, `Porte`) comparent la valeur d'un paramètre `choix` avec la chaîne française affichée (`"Conserver les zones"`). Si l'UI est en anglais, si on renomme un label, ou si la valeur stockée vient d'une ancienne sauvegarde, le plugin interprète mal l'action. La langue d'affichage ne devrait jamais être une clé de logique métier.

3. **Hooks globaux avec des effets de bord larges** — *atténué par le lot 2, puis sorti des crochets pour l'exécution et le cache par l'architecture par messages (relu le 2026-11-19).*  
   Relu le 2026-11-19 : la passe n'est plus une fermeture React. Elle est dans `ui/moteur/passe.ts`,
   sans React, et le moteur de `ui/moteur/moteur.ts` tient le cache, l'ordonnanceur, le contrôleur
   de la passe en cours et l'arrêt du lot ; l'interface ne lui parle que par les commandes de
   `core/protocole-moteur.ts`, et `docs/frontiere-moteur.test.ts` tient la frontière.
   `useExecutionGraphe.ts` n'est plus que le pont, 92 lignes de code pour 153 en tout, et `App.tsx`
   compte 399 lignes de code pour 605. Le diagnostic réclamait un garde-fou par famille de nœud :
   `IMPACT.md` dit, zone par zone, quels gardes tiennent aujourd'hui ce qu'une modification touche.
   Le diagnostic d'origine suit.  
   `App.tsx` et `useExecutionGraphe.ts` concentrent la création des nœuds, la suppression, la réinitialisation, l'exécution, le cache, la gestion des URLs blob, etc. Une modification dans la logique de reset ou de cache peut se propager à l'ensemble des 200+ nœuds, car il n'y a pas de garde-fou par famille de nœud. (`App.tsx` était passé de 437 à 1013 lignes depuis l'extraction de hooks documentée dans `APP-BREAKDOWN.md`, et à 1449 le 2026-10-31 ; `useExecutionGraphe.ts` était à 1777, dont une seule fermeture, `lancerUnePasse`, de 1166 lignes. Relu le 2026-11-06, après le lot 2 : `App.tsx` compte 393 lignes de code pour 575 en tout, `useExecutionGraphe.ts` 289 pour 681, et `lancerUnePasse` 482 lignes, de la ligne 180 à la ligne 661. La passe reste une seule fermeture React.)

4. **Manque de tests d'intégration entre UI et plugins** — ✅ *résolu en v2.2.2, voir feuille de route ci-dessous.*  
   Les tests unitaires couvrent bien les plugins isolés, mais il n'existe pas de tests qui exécutent une chaîne complète : sélection de zones dans le composant React → passage dans le graphe → exécution du plugin. De ce fait, une régression sur un chemin critique (sélecteur → masque) n'est détectée que manuellement.

5. **Absence de contrat explicite entre UI et plugins** — *en grande partie résolu par le lot 1 et par le chantier des réglages par nom (relu le 2026-11-19).*  
   Les `executer` sont typés par inférence depuis le lot 1 (voir la feuille de route ci-dessous),
   tous depuis le 2026-11-11 : celui de `src/plugins/boucle-collection.ts`, qui ne lit pas son
   contexte, s'écrit `async executer()`. Les noms de réglage sont vérifiés par le compilateur depuis
   le 2026-11-13, en neuf PR de la 347 à la 355 : `paramTexte(nom: TNom, defaut)` de
   `src/core/types.ts` ne prend plus qu'un nom que la fiche déclare, par `fiche()` de
   `src/plugins/fiche.ts`. Ce qui reste : les entrées et les sorties ne sont pas vérifiées au build,
   `valeurs` étant une liste de valeurs du domaine et non un type par port ; `core/types-au-port.ts`
   contrôle à l'exécution ce que rend un port dont le type de flux déclare son prédicat, et le
   rapporte sans le refuser. Et des `any` restent dans `src/plugins/` hors tests : 228 par le motif
   `(:|as|<|\|) *any\b`, dont 34 `catch (e: any)`, relevés le 2026-11-19. La revue du 2026-10-31 en
   comptait 221, dont 53 `catch (e: any)`, par un motif qu'elle n'écrit pas : les deux totaux ne se
   comparent pas.
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

> Relu le 2026-11-19 : la couche du milieu existe. Ce qui est pur est dans `src/core/`, la boucle
> d'une passe, sa préparation, l'instantané du graphe, le choix du rendu et le protocole ; le
> moteur qui tient le cache et l'ordonnanceur est dans `src/ui/moteur/`, sans React, et l'interface
> le pilote par commandes.

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

> **Statut re-vérifié le 2026-11-19** contre le code réel d'`origin/master` 42f13986, toujours en
> **v5.1.2**, aucune version n'ayant été publiée depuis (les relevés précédents dataient du
> 2026-11-06, en v5.1.2, du 2026-10-31, en v5.1.0, et du 2026-08-03, en v3.1.5). Chaque case
> porte sa note datée ; `CHANGELOG.md` fait foi pour ce qui a bougé entre deux relevés. Le plan de
> correction en cinq lots qui en découle est dans la revue du 2026-10-31
> (`work/revue-architecture-2026-10-31.md`, non versionné).
>
> Où en sont les cinq lots au 2026-11-06, d'après les pull requests fusionnées :
>
> - **Lot 0, l'outillage** : fait le 2026-10-31 (PR 247). Reste son point A6, reporté avec sa
>   raison dans `CHANGELOG.md` : les URL de médias remplacées n'étaient pas révoquées, l'historique
>   d'annulation et le collage partageant l'URL avec le nœud. Fait le 2026-11-10, en quatre pièces :
>   `src/ui/rechargerFichiers.ts` rend les nœuds rechargés au lieu d'écrire dans le `n.data` de
>   ceux qu'on lui passe (PR 326) ; Ctrl+Y rétablit ce que Ctrl+Z a annulé (PR 327) ; et le
>   registre de `src/ui/urls-medias.ts` révoque une URL quand ni un nœud vivant, ni une entrée
>   d'annulation ou de rétablissement, ni le presse-papiers ne la tiennent (PR 328). Toutes les
>   naissances d'URL de média de l'interface passent par lui, et `src/ui/urls-medias-naissances.test.ts`
>   refuse une URL d'objet créée à côté sans être classée (PR 329). Des deux films posés sur le
>   nœud, celui de la démonstration naît par le registre, et celui du « Générateur vidéo » passe
>   au canal d'affichage ; le moteur révoque désormais un film de ce canal quand un run le remplace
>   ou qu'une annulation abandonne son nœud.
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
>   ne reste que Basic Pitch. Son worker était le seul d'un composant que la base d'empreintes ne couvrait pas, faute
>   de sortie audio : `tests-e2e/transcription-dans-application.spec.ts` en faisait la preuve à sa
>   place. Le composant a été retiré le 2026-11-14, avec son worker, Basic Pitch et cette spec, la
>   « Transcription MIDI » faisant le même travail. Sa neuvième, la « Matrice d'auto-similarité » hors du fil, est fusionnée (PR 304) : sur
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
>   page de 22 à 43 ms dans le Transcripteur polyphonique, a calculé dans le worker d'inférence ONNX
>   jusqu'au retrait de ce composant (PR 309) : 35 ms ramenés à 2 ou 3 sur le son d'essai ; sur deux minutes, ce qui reste est
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
>   lui ont rendu (PR 320). `main.cjs` gardait alors 12 appels `ipcMain.handle(` sur 71, en 600
>   lignes au lieu de 2 103. Relu le 2026-11-19 : il en garde 13 sur 72, le treizième étant
>   `configuration:lire`, né avec le fichier de configuration, en 685 lignes dont 405 de code.
>   Restent les six canaux `node:`, qui feront un septième module, décidé par Fabien le 2026-11-08,
>   et les fenêtres, où `doc:ouvrir` rejoindra `app:quitter` : ni l'un ni l'autre n'est fait au
>   2026-11-19. La norme de taille ne compte que `src/`.
>   Les trois autres propositions, le regroupement par familles, le chargement par catégorie et la
>   règle de nommage, restent à décider.
>
> La dette de taille compte douze fichiers au 2026-11-19, contre quinze le 2026-10-19 : `App.tsx`
> et `useExecutionGraphe.ts` en sont sortis avec le lot 2, et `plugins/index.ts` le 2026-11-14,
> coupé en huit catégories sous `plugins/categories/` (PR 356). La liste est dans
> `src/docs/generer-compte-lignes.test.ts`.

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
  Fait et dépassé : `src/plugins/integration.test.ts` couvre 18 cas au 2026-11-19
  (bien au-delà des 5 scénarios listés à l'origine) : treize sur la bascule
  libellé localisé → id canonique ci-dessus, quatre sur Griffin-Lim et un sur
  l'absence de lecteur de l'Aligneur de piste. Il en comptait 19 : celui du
  Transcripteur MIDI est parti avec le composant, le 2026-11-14. Relu le
  2026-11-06 : ces cas enchaînent les `executer` pris au registre, sans le moteur
  ni React ; le graphe entier, lui, est rejoué par les empreintes des exemples.
- [x] **Documenter les chemins critiques** dans un `IMPACT.md` ou ce fichier.
  Fait le 2026-11-19 : [`IMPACT.md`](IMPACT.md) dit, pour treize zones où une modification porte
  au-delà du fichier touché, où elle vit, ce qu'elle touche, les gardes qui la tiennent et les
  épreuves à relancer à la main, et rattache à leurs gardes les quatre scénarios de la vision
  cible. Il nomme et ne compte pas ; aucun garde ne tient encore ses chemins.

### Moyen terme (prochaines releases)

- [x] **Extraire le runtime d'exécution** de `useExecutionGraphe.ts` dans un module pur (`src/core/execution.ts`) sans dépendance React.
  Fait le 2026-11-11, en cinq pièces décidées par Fabien (`work/plan-runtime-execution-2026-11-11.md`) :
  un garde qui tient le cœur à l'écart du shell (PR 333) ; la pose des statuts et la décision d'avant
  l'exécution (PR 334) ; le retour d'un exécuteur (PR 335) ; la boucle elle-même, `executerLesNoeuds`
  (PR 337) ; les deux répliques du moteur, dans `core/domaine-nombre.test.ts` et
  `core/cache-execution.test.ts`, remplacées par lui. `core/execution.ts` compte 252 lignes de
  code et n'importe que le cœur ; le runtime y est générique, l'`AudioContext` lui étant prêté.
  `useExecutionGraphe.ts` passe de 289 à 179 lignes de code, et `lancerUnePasse` de 482 lignes et
  198 de code à 217 et 94. Le crochet ne garde que React, le contrôleur d'annulation, l'`AudioContext`,
  les publications, les sauts de boucle, la pose des résultats, le ménage et les lecteurs. La boucle
  est éprouvée contre celle d'avant le chantier par `core/execution-boucle.test.ts`, et
  `src/core/` compte 41 fichiers de test.
  Relu le 2026-11-19 : l'architecture par messages a vidé le crochet à son tour (voir le long
  terme). La passe est dans `ui/moteur/passe.ts`, le moteur dans `ui/moteur/moteur.ts`, et
  `useExecutionGraphe.ts` n'est plus que le pont, 92 lignes de code ; `core/execution.ts` en compte
  270, et `src/core/` 47 fichiers de test.
  L'historique qui suit est celui des relevés d'avant.
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
  sont sortis côté interface (`src/ui/correctif-resultat.ts`, `src/ui/moteur/menage-apres-passe.ts`).
  `src/core/` compte 38 fichiers de test. La boucle nœud par nœud reste dans `lancerUnePasse`,
  fermeture React de 482 lignes ; elle n'appelle plus `setNodes` elle-même, elle le prête au
  ménage d'après passe.
- [x] **Générer les types des plugins** à partir de `FicheAudio` pour typer les `executer`. Fait le 2026-10-31 (lot 1 de la revue) : `executer(ctx: any)` était présent 469 fois dans 267 fichiers de `src/plugins/` ; il n'en reste qu'un, `executer(_ctx: any)` de `src/plugins/boucle-collection.ts`, que le lot 0 avait renommé et qui sortait donc du motif (la revue en comptait 470 ; relu le 2026-11-06). L'annotation retirée, le tableau `as FicheAudio[]` type le contexte par inférence ; 33 erreurs sont sorties, dont huit fiches cachées derrière `as unknown as FicheAudio[]` parce que `ValeurAudio` ne déclarait pas la séquence, le spectrogramme ou le cercle qu'elles rendaient. L'union dit désormais les quinze types qui circulent, et les fonctions d'aide prennent `ContexteAudio`. Le dernier, celui de `boucle-collection.ts`, est tombé le 2026-11-11 : son exécuteur ne lit pas son contexte et s'écrit `async executer()`. Le même jour, `plugins/fiche.ts` a fait vérifier les noms de réglage par le compilateur : 334 fiches ne peuvent plus lire qu'un réglage qu'elles déclarent, et 134 dont les noms ne se déduisent pas encore passent par `ficheSansNomsVerifies` (`work/plan-reglages-par-nom-2026-11-11.md`). La pièce 2 du plan les a toutes libérées entre le 2026-11-12 et le 2026-11-13, et 478 fiches sont vérifiées ; la fonction a été retirée le 2026-11-13.
- [x] **Introduire des tests de non-régression** qui rejouent des graphes de référence.
  Fait (relu le 2026-10-31) : `tests-e2e/empreintes.json` surveille 74 composants isolés (84 depuis
  le 2026-11-07, `debruitage-ia`, `criteres-schaefferiens`, `restauration-ecretage`,
  `remplissage-trou`, `reverbe-reseau`, `detecteur-tempo`, `analyse-emotionnelle`,
  `auto-similarite`, `spatialiseur` et `rendu-objets` compris, et 88 au 2026-11-19) et
  `tests-e2e/empreintes-exemples.json` le son de chaque exemple livré, chaîne entière.
  Depuis le 2026-11-17, `tests-e2e/graphe-complexite-dans-application.spec.ts` compare en plus le
  son d'un graphe à trois boucles emboîtées à un attendu calculé à la main (PR 375), et
  `tests-e2e/journal-de-passe.spec.ts` l'ordre des écritures d'une passe dans les magasins (PR 374).
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
  Relu le 2026-11-19 : `App.tsx` 399 et 605, `useExecutionGraphe.ts` 92 et 153, le moteur et la
  passe étant passés dans `ui/moteur/`.

### Long terme

- [x] **Passer à une architecture orientée messages / événements** entre UI et moteur pour éviter que ReactFlow et l'exécution partagent le même objet mutable.
  Fait du 2026-11-16 au 2026-11-19, en dix pièces décidées par Fabien, de P0 à P6, P3, P4 et P5
  ayant été coupées chacune en deux (PR 373, 374 et 377 à 384). Le moteur reste sur le fil principal, derrière une frontière en trois sortes que
  `core/protocole-moteur.ts` écrit en types : les commandes de l'interface, les événements du
  moteur, et les questions synchrones qu'il pose au shell. Une passe lit le graphe copié à son
  départ (`core/instantane-de-graphe.ts`), et une écriture d'exécuteur sur cette copie se relève. Le
  cache est un objet du moteur (`ui/moteur/cache.ts`), que l'interface ne touche que par
  commandes ; la boucle dit des événements qu'un récepteur unique pose dans les trois magasins
  (`ui/recepteur-moteur.ts`) ; le moteur, la passe et ses pilotes vivent sans React dans
  `ui/moteur/`, dont l'index est la seule porte, et `docs/frontiere-moteur.test.ts` tient cette
  frontière par les imports transitifs, types compris. Seule P6 change un comportement : une passe
  ne réécrit plus ce qu'une remise à zéro vient d'effacer, ni sur un graphe qu'on vient
  d'abandonner (`core/remises.ts`). Les pièces de P2 à P5b, qui se disaient sans changement de
  comportement, ont été rejouées par `tests-e2e/journal-de-passe.spec.ts`, qui relève l'ordre des
  écritures d'une passe dans les magasins sur quinze exemples. Pas fait : la version du
  protocole n'est pas une constante, ce qui reste une décision de Fabien ; et l'écriture d'un
  exécuteur sur l'instantané est relevée, non interdite.
- [ ] **Ajouter des feature flags** pour les changements de runtime afin de pouvoir les désactiver rapidement.
  Relu le 2026-11-19 : pas fait. Le fichier de configuration (`CONFIGURATION.md`, PR 392 à 400) règle
  la machine, ses chemins, sa mémoire et le mode hors ligne ; aucune de ses clés ne bascule un
  changement du moteur.
- [x] **Créer un manifeste de compatibilité** des plugins (version de contrat, paramètres, entrées/sorties) pour détecter les ruptures automatiquement.
  Fait le 2026-11-16, pour le socle : `COMPATIBILITE.json` est engendré du registre par
  `npm run docs:compatibilite` et versionné, 513 composants, 2 980 réglages, 1 537 ports, 14 alias,
  tous en version de contrat 1. `src/docs/compatibilite.test.ts` compare le registre à ce fichier et
  sépare dix-sept sortes de rupture de treize sortes de changement compatible ; une rupture échoue
  tant qu'elle n'a ni migration (`nomsHerites`, `optionsHeritees`, `anciensReglages`, `ALIAS`) ni
  déclaration dans `src/docs/ruptures-declarees.json`, vide à sa naissance. Pas fait : l'ouverture
  d'un projet ne lit pas encore le manifeste. Un fichier qui noterait la version de chaque nœud
  permettrait de dire, au chargement, qu'un nœud vient d'un contrat plus récent ou plus ancien ;
  c'est une suite à décider avec le format de projet. Relu le 2026-11-19 : toujours pas fait, aucun
  fichier hors de `src/docs/` ne lit le manifeste. L'export `.attic`, fusionné le 2026-11-16
  (PR 370), compare la version de l'application qui a écrit le paquet, et non celle du contrat de
  chaque nœud.

---

## Ce qu'il faut retenir

- Le problème n'est pas que le programme est « trop centralisé », mais que **les frontières entre couches ne sont pas assez étanches**.
- Le remède n'est pas une réécriture totale, mais une **séparation progressive** des responsabilités et une **formalisation des contrats**.
- **Chaque modification future** doit être accompagnée d'une question : "quelle donnée utilisateur ou quel autre plugin pourrait être affecté ?" et d'un test qui couvre ce chemin. [`IMPACT.md`](IMPACT.md) y répond zone par zone, avec les gardes qui tiennent chaque chemin et les épreuves à relancer.
