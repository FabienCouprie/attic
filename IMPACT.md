# IMPACT.md — les chemins critiques

`ARCHITECTURE.md` part d'un constat, « pourquoi une modification en casse une autre », et finit sur
une question à poser avant chaque modification : quelle donnée de la personne, ou quel autre
composant, pourrait être affecté, et quel test couvre ce chemin ? Ce fichier y répond zone par
zone. Pour chaque zone où une modification porte au-delà du fichier touché, il dit **où elle vit**,
**ce qu'une modification y touche**, **ce qui la tient** et **ce qu'il faut relancer** à la main.

**Il nomme, il ne compte pas.** Un nombre de composants, de cas ou de fichiers écrit ici vieillirait
sans que rien ne le dise. Les gardes et les tables générées tiennent leurs propres comptes : ce
fichier y renvoie.

---

## Ce que la vérification ordinaire voit, et ce qu'elle ne voit pas

L'ordre de vérification d'`AGENTS.md` (`npx tsc -b`, `npx oxlint`, `npx vitest run`) heurte tous les
gardes de vitest, ceux de `src/docs/` compris. La CI (`.github/workflows/ci.yml`) lance en plus deux
épreuves Playwright, et deux seulement : `npm run test:electron`, qui ouvre l'application construite
(`tests-e2e/pont-electron-vivant.spec.ts`), et `npm run test:empreintes`, la base du son des
composants surveillés (`tests-e2e/empreintes.json`).

**Toute autre épreuve de `tests-e2e/` ne tourne que si on la lance.** C'est l'objet des lignes
« À relancer » ci-dessous. Trois précautions valent pour toutes :

- une épreuve qui ouvre Electron sur `dist/` **s'ignore sans build**, et le dit par un « skipped » :
  `npm run build` d'abord, puis lire « passed », jamais le seul code de sortie ;
- une épreuve qui sème un graphe attend qu'un SoundFont soit chargé, et sur un profil neuf c'est
  en général `public/sf2/FluidR3_GM.sf2` qui le pose : sans lui, `semer` échoue au bout de
  `DELAI_SOUNDFONT_MS` en le disant, et les références de la base du son et du journal de passe ont
  été mesurées avec lui. Git l'ignore, et un arbre séparé installé par `npm ci --ignore-scripts` ne
  l'a donc pas ;
- un graphe se pilote par `tests-e2e/pilote-graphe.ts`, et une spec neuve qui sème un graphe se
  déclare parmi ses appelants (`src/docs/contrat-pilote-de-graphe.test.ts`).

---

## 1. Le contrat d'un composant, tel qu'un graphe enregistré en dépend

- **Où** : chaque fiche de `src/plugins/`, ses ports, ses réglages et leurs valeurs de choix ; les
  migrations `nomsHerites`, `optionsHeritees` et `anciensReglages` sur la fiche, et `ALIAS` dans
  `src/audio/alias.ts`, que l'adaptateur remet au registre.
- **Ce qu'une modification touche** : tout graphe déjà enregistré qui emploie le composant, ceux de
  la personne comme ceux de `exemples/` et les méta-composants. Une arête tient un port **par son
  rang**, une valeur de réglage tient **par le nom** du réglage : renommer, retirer ou déplacer l'un
  ou l'autre fait retomber le graphe en silence sur un défaut ou une arête perdue.
- **Ce qui le tient** :
  - `src/docs/compatibilite.test.ts` compare le registre à `COMPATIBILITE.json`, range chaque écart
    en compatible ou en rupture, et refuse une rupture sans sa migration ou sa déclaration dans
    `src/docs/ruptures-declarees.json` ;
  - `src/docs/contrat-cles-de-reglage.test.ts` exige qu'une valeur enregistrée dans un graphe livré
    soit encore lue ;
  - `src/plugins/repli-du-defaut.test.ts` tient le défaut déclaré contre le littéral d'un appel ;
  - le compilateur refuse la lecture d'un réglage que la fiche ne déclare pas (`src/plugins/fiche.ts`).
- **Ce qu'il ne voit pas** : le son. Un réglage ajouté est compatible si son défaut rend l'ancien son,
  et seules les empreintes le disent.
- **À relancer** : `npm run docs:compatibilite` pour un changement compatible ; `npm run
  test:empreintes` si le composant est surveillé ; `npm run test:empreintes-exemples` si un exemple
  l'emploie.

## 2. Ce qu'un nœud porte : saisies, structure, résultats

- **Où** : `src/core/saisies.ts` déclare ce que la personne pose sur un nœud et ce que le projet en
  écrit ; `src/core/classes-de-champs.ts` dit ce qu'une remise à zéro efface, ce qu'un réglage garde
  et ce qu'une copie emporte ; `src/core/cycle-de-vie.ts` applique ces transitions ; `src/ui/noeud-atelier.ts`
  en tire le type `DonneesNoeud`. L'état d'une passe n'est pas dans `data` : le statut vit dans
  `src/ui/statuts.ts`, la priorité dans `src/ui/priorite.ts`, les résultats dans `src/ui/resultats.ts`,
  les gestes dans `src/ui/gestes-noeud.ts`.
- **Ce qu'une modification touche** : les données de la personne. Un champ que ces tables ne déclarent
  pas est perdu à la sauvegarde ; un champ mal classé est effacé par une remise à zéro, ou emporté par
  un copier-coller.
- **Ce qui le tient** : `src/core/saisies.test.ts` (rien ne se perd entre les deux bouts de la
  persistance), `src/plugins/cycle-de-vie-noeuds.test.ts` (une remise à zéro n'épargne aucun résultat
  et ne touche à aucune saisie, sur toutes les fiches), `src/ui/noeud-atelier.test.ts` (le type tenu
  à ses sources, dans les deux sens).
- **À relancer** : `npx playwright test tests-e2e/persistance-aller-retour.spec.ts` après `npm run
  build`, l'aller-retour d'un projet par le disque dans l'application construite.

## 3. La passe d'exécution : le cœur et le moteur

- **Où** :
  - dans le cœur, sans React : `src/core/preparation-passe.ts` (`preparerLaPasse`),
    `src/core/execution.ts` (la boucle `executerLesNoeuds`, et ce que le moteur fait du retour d'un
    exécuteur), `src/core/contexte-de-passe.ts`, `src/core/graines-de-passe.ts`,
    `src/core/rendu-du-visible.ts` (ce que montre le nœud visible), `src/core/instantane-de-graphe.ts`
    (le graphe copié au départ de la passe) et `src/core/protocole-moteur.ts` (commandes, événements,
    questions) ;
  - dans le shell, sans React non plus : `src/ui/moteur/`, dont `src/ui/moteur/index.ts` est la seule
    porte ;
  - le pont et la pose dans les magasins : `src/ui/hooks/useExecutionGraphe.ts` (`useMoteur`,
    `useExecutionGraphe`), `src/ui/recepteur-moteur.ts`, `src/ui/correctif-resultat.ts`.
- **Ce qu'une modification touche** : tous les composants et tous les graphes, l'ordre dans lequel
  ils tournent, les statuts, ce que chaque nœud montre et ce qui part au cache.
- **Ce qui le tient** :
  - `src/core/execution-boucle.test.ts`, le témoin : la boucle d'avant le chantier du runtime,
    recopiée, contre laquelle la boucle actuelle doit rendre le même journal ;
  - `src/core/instantane-de-graphe.test.ts` : un réglage lu après une attente garde la valeur du
    départ, et une écriture d'exécuteur sur `ctx.noeud.data` est relevée ;
  - `src/core/rendu-du-visible.test.ts`, `src/core/protocole-moteur.test.ts`,
    `src/ui/recepteur-moteur.test.ts` et les tests de `src/ui/moteur/` ;
  - `src/docs/frontiere-moteur.test.ts` : rien du dossier du moteur n'atteint React, React Flow ni les
    trois magasins, et l'interface n'importe de ce dossier que son index ;
  - `src/docs/indices-moteur.test.ts` : chaque indice d'`IndicesMoteur` (`src/core/types.ts`), ce que
    la passe, le cache, le correctif et la relance lisent sur une fiche, est porté par une vraie fiche
    d'un exemple que jouent les deux épreuves ci-dessous, ou déclaré non éprouvé ou hors de portée
    avec sa raison. `exemples/ce-que-le-moteur-lit-sur-un-noeud.json` porte ceux qu'aucun autre
    exemple ne portait.
- **À relancer** : `npm run test:journal-de-passe`, qui relève dans l'application l'ordre de toutes
  les écritures d'une passe dans les trois magasins, Lancer, ▶ et ↺ compris ;
  `npm run test:empreintes-exemples` ; `npm run test:graphe-complexite` ; et
  `GRAPHE=<exemple> npm run executer`, en lisant « 1 passed ».

## 4. Le cache, les remises à zéro et les événements périmés

- **Où** : `src/ui/moteur/cache.ts` (le cache, un objet et non une `Map` partagée),
  `src/ui/moteur/commandes.ts` (`oublier`, `regler`, `remettreAZero`, `exporterCache`,
  `importerCache`), `src/core/cache-execution.ts` (quand un composant rend son résultat d'avant et
  quand il rejoue), `src/core/remises.ts` (ce qui a été remis à zéro ou oublié, et à quel numéro de
  passe), `src/core/saut-de-boucle.ts`.
- **Ce qu'une modification touche** : un résultat périmé servi comme frais, ou un recalcul inutile ;
  une passe qui réécrit ce qu'on vient d'effacer ; et le paquet `.attic`, qui emporte les clés du
  cache.
- **Ce qui le tient** : `src/core/cache-execution.test.ts` (la règle et son exception),
  `src/ui/moteur/cache.test.ts`, `src/ui/moteur/commandes.test.ts`, le cas de la clé de cache de
  `src/core/instantane-de-graphe.test.ts`, et `src/ui/paquet/format-v1.test.ts`, qui fige le format 1
  du paquet par un témoin versionné. Ces cas éprouvent `jamaisCache` sur des fiches fabriquées ;
  `src/docs/indices-moteur.test.ts` tient qu'une vraie fiche le porte dans un exemple que le journal
  de passe joue.
- **À relancer** : `npm run test:journal-de-passe`, dont le scénario des gestes refait Lancer après
  un ↺ et voit donc un nœud repris du cache qui aurait dû tourner ;
  `npx playwright test tests-e2e/evenements-perimes-dans-application.spec.ts` ;
  `npx playwright test tests-e2e/paquet-attic-dans-application.spec.ts` après `npm run build`.

## 5. Méta-composants, bulles et boucles

- **Où** : `src/core/meta.ts` (construire un méta, aplatir le graphe avant exécution),
  `src/core/fiches-du-coeur.ts` (les deux nœuds-frontière d'un méta et le type de leur port, que
  tout domaine inclut), `src/core/metastore.ts`, `src/core/bulles.ts`, `src/core/conteneurs.ts` (ce qu'une bulle ou un
  méta contient et ce que son statut en dit), `src/core/boucle-graphe.ts` (une boucle de graphe
  dépliée en chaîne, le rôle de chaque nœud lu sur sa fiche : `debutDeBoucle`, `finDeBoucle`,
  `boucleParPasses`), et les pilotes des boucles par passes et du lot dans `src/ui/moteur/pilotes.ts`.
- **Ce qu'une modification touche** : tout graphe qui emboîte ; un défaut n'y apparaît souvent qu'à
  la rencontre de deux conteneurs, jamais sur un composant seul.
- **Ce qui le tient** : `src/core/meta.test.ts`, `src/core/fiches-du-coeur.test.ts` (un domaine de
  nombres édite un méta sans écrire de fiche-frontière), `src/core/bulles.test.ts`,
  `src/core/conteneurs.test.ts`, `src/core/boucle-graphe.test.ts`, `src/core/saut-de-boucle.test.ts`,
  `src/core/boucle-role.test.ts` et `src/plugins/boucle-role.test.ts` (le rôle déclaré, et la fin
  posée sous un ancien identifiant), et `src/docs/indices-moteur.test.ts` pour les trois indices.
- **À relancer** : `npm run test:graphe-complexite`, trois boucles emboîtées, une bulle dans une
  bulle et un méta, dont le son est comparé à un attendu calculé à la main ; et les specs
  `tests-e2e/conteneurs-dans-application.spec.ts`, `tests-e2e/boucle-dans-lot-dans-application.spec.ts`,
  `tests-e2e/boucle-reprise-dans-application.spec.ts`, `tests-e2e/boucle-collection.spec.ts`,
  `tests-e2e/lot-verif.spec.ts` et `tests-e2e/zones-dans-une-boucle-dans-application.spec.ts`.
  Pour le dépliage d'une boucle de graphe et celui de l'instrument (`src/core/instrument-graphe.ts`),
  `EXEMPLE=un-echo-en-boucle-et-un-instrument` sur `npm run test:empreintes-exemples` et sur
  `npm run test:journal-de-passe` : c'est le seul exemple surveillé qui les porte, et les deux gardes
  y ont vu rouge des tours qui ne se chaînent plus et une note qui n'est plus posée dans ses copies.

## 6. Les valeurs de choix et la langue

- **Où** : `optionIds` et `optionsHeritees` sur un réglage à choix (`src/core/types.ts`),
  `valeurCanoniqueChoix` dans `src/i18n.tsx`, que le contexte de passe prête à l'exécuteur
  (`src/core/contexte-de-passe.ts`).
- **Ce qu'une modification touche** : un exécuteur qui comparerait un libellé affiché change de
  comportement avec la langue de l'interface, et un projet enregistré dans l'autre langue retombe sur
  une autre valeur.
- **Ce qui le tient** : `src/plugins/integration.test.ts` (des composants enchaînés par leurs ids
  canoniques, et la valeur anglaise d'un ancien projet ramenée à son id),
  `src/docs/anglais-registre.test.ts`, `src/docs/vues-anglais.test.ts` (le texte en dur des vues), et
  `src/docs/croisement-nomenclatures.test.ts`, qui tient, dans la passe ordinaire, l'instrument du
  croisement et ses inscriptions, sans lancer les composants.
- **À relancer** : `ANGLAIS=1 npm run messages-anglais`, seul à voir un message composé à
  l'exécution ; `npm run croisement`, la passe elle-même, qui lance chaque nœud à choix sous chaque
  valeur et vérifie que ses autres réglages agissent encore, avec les précautions qu'en dit
  `AGENTS.md`.

## 7. Les frontières entre le cœur, le shell et le domaine

- **Où** : `src/core/` (le cœur), les six poteaux de `src/ui/` décrits au §6 de
  `PORTING-A-DOMAIN.md`, et `src/composition.ts`, seul fichier qui connaît les deux côtés.
- **Ce qu'une modification touche** : la possibilité de brancher un autre domaine, et l'exécution
  sans interface. Un import du domaine dans le shell, ou du shell dans le cœur, passe `tsc`, `oxlint`
  et toute la suite tant qu'aucun garde ne le cherche.
- **Ce qui le tient** : `src/docs/frontiere-domaine.test.ts` (le cœur n'importe ni ne nomme rien du
  domaine, tout ce qu'il importe se résout dans `src/core/`, les poteaux n'importent rien du domaine,
  et aucun exécuteur neuf ne lit l'interface), `src/docs/frontiere-identifiants.test.ts` (aucune
  chaîne neuve du cœur ne vaut un identifiant de fiche, trois dettes épinglées), `src/docs/composition.test.ts` (la racine de
  composition est le premier import de `src/main.tsx`), `src/core/cloisonnement.test.ts` et
  `src/core/domaine-nombre.test.ts` (un second domaine, par le vrai moteur).

## 8. Les modules audio partagés

- **Où** : `src/audio/`, que les fiches de `src/plugins/` importent.
- **Ce qu'une modification touche** : chaque composant qui importe le module, directement ou par un
  autre module. **Aucune table générée ne dit cette liste** : `DEPENDANCES-AUDIO.md` dit la classe de
  chaque module (rendu, récipient, pur), et non ses importateurs. Elle se cherche par les imports.
- **Ce qui le tient** : la base du son des composants surveillés, `tests-e2e/empreintes.json`, et
  celle des exemples, `tests-e2e/empreintes-exemples.json`. Un composant hors de ces deux bases n'a
  aucun garde sur son son ; `src/docs/couverture-empreintes.test.ts` exige seulement qu'un worker de
  calcul soit réclamé par un composant surveillé.
- **À relancer** : `npm run test:empreintes` et `npm run test:empreintes-exemples` ; pour un
  composant non surveillé, `COMPOSANT=<id> npm run mesurer`, et `COMPOSANT=<id> REGLAGE=<nom>
  VALEURS=a,b npm run varier` pour voir ce qu'un réglage change.

## 9. L'habillage des nœuds : vues, tailles, lecteur

- **Où** : `src/vues-domaine/vues.tsx` (la vue de chaque nœud), `src/ui/tailles-noeuds.ts` (sa taille
  à la création), `src/ui/AtelierNode.tsx` (le lecteur générique et l'indicateur de niveau).
- **Ce qu'une modification touche** : un composant qu'on ne voulait pas toucher, parce que ces tables
  sont partagées.
- **Ce qui le tient** : `INTERFACE.md`, versionné pour rendre visible dans un diff le composant
  qu'une modification touche, et `src/docs/generer-inventaire-ui.test.ts`, qui tombe quand ce fichier
  ne correspond plus aux tables, et quand un composant perd son lecteur sans qu'on l'ait vu ; et
  `src/docs/contrat-vues-image.test.ts`.
- **À relancer** : `npm run docs:interface`, puis **relire le diff d'`INTERFACE.md`** : une ligne qui
  change est un composant à rouvrir.

## 10. Le hasard et les graines

- **Où** : `src/core/hasard.ts`, le générateur commun, et le rôle `graine: true` d'un réglage.
- **Ce qu'une modification touche** : la reproductibilité de chaque composant à graine, donc les
  empreintes de ceux qui sont surveillés.
- **Ce qui le tient** : `src/docs/hasard-commun.test.ts` (aucun module n'écrit son propre générateur)
  et `src/docs/contrat-graines.test.ts`, qui tient la déclaration et ne lance aucun composant.
- **À relancer** : `npm run graines`, qui lance chaque composant à graine deux fois à la même graine
  et compare ce qu'il entend.

## 11. L'oreille : la borne des formules et le niveau d'écoute

- **Où** : `securiserAmplitude` de `src/audio/math-formules.ts`, que tout chemin qui évalue une
  formule appelle ; `NIVEAU_ECOUTE` de `src/ui/niveau-ecoute.ts` ; `IndicateurNiveau` de
  `src/ui/AtelierNode.tsx`.
- **Ce qu'une modification touche** : le casque de la personne. La règle entière est au §4
  d'`AGENTS.md`.
- **Ce qui le tient** : `src/audio/math-formules.test.ts` (une formule hors plage est bornée),
  `src/ui/niveau-ecoute.test.ts` (aucun lecteur de composant ne s'ouvre à pleine puissance), et le
  contrat `scripts/contrat-noeud.mjs` sous Claude Code.
- **Ce qu'il ne voit pas** : le niveau d'un générateur sans formule, que rien ne borne (`AGENTS.md`,
  §4).

## 12. Le projet sur le disque : format, paquet `.attic`, URL de médias

- **Où** : `src/core/format-projet.ts` (la version du format et ce qu'un chargement a perdu),
  `src/ui/projet-a-ecrire.ts`, `src/ui/ecriture-projet.ts`, `src/ui/hooks/useImportProjet.ts`,
  `src/ui/paquet/`, et `src/ui/urls-medias.ts`, le registre qui révoque une URL de média quand plus
  rien ne la tient.
- **Ce qu'une modification touche** : chaque projet déjà enregistré, et l'annulation : une URL
  révoquée trop tôt rend un média mort à Ctrl+Z.
- **Ce qui le tient** : `src/ui/projet-a-ecrire.test.ts`, `src/ui/paquet/format-v1.test.ts`,
  `src/ui/urls-medias.test.ts` et `src/ui/urls-medias-naissances.test.ts`, qui refuse une URL d'objet
  créée à côté du registre.
- **À relancer** : `npx playwright test tests-e2e/format-projet.spec.ts`,
  `tests-e2e/urls-medias-dans-application.spec.ts` et `tests-e2e/retablir-dans-application.spec.ts` ;
  après `npm run build`, `tests-e2e/persistance-aller-retour.spec.ts` et
  `tests-e2e/paquet-attic-dans-application.spec.ts`.

## 13. Le pont Electron et le fichier de configuration

- **Où** : `electron/main.cjs`, les modules `electron/ipc-*.cjs` par famille de canaux,
  `electron/preload.cjs`, et `electron/configuration.cjs`, que `CONFIGURATION.md` documente.
- **Ce qu'une modification touche** : tout composant qui passe par le pont, et le démarrage de
  l'application construite, que le serveur de développement ne montre pas.
- **Ce qui le tient** : `electron/pont-canaux.test.ts`, `electron/fichiers-entiers-ipc.test.ts`
  (aucun handler ne lit ni n'écrit un fichier entier d'un bloc, hors exceptions déclarées),
  `electron/frontiere-des-modules.test.ts`, `electron/configuration.test.ts`, et
  `src/docs/configuration.test.ts` (aucune clé du fichier sans lecteur ni sans sa ligne dans
  `CONFIGURATION.md`).
- **À relancer** : `npm run build` puis `npm run test:electron`, et
  `tests-e2e/deux-fenetres-dans-application.spec.ts` si le changement touche les fenêtres.

---

## Les scénarios que la feuille de route nommait

La vision cible d'`ARCHITECTURE.md` nomme quatre scénarios critiques. Chacun a aujourd'hui son garde :

| Scénario | Ce qui le tient |
|---|---|
| Sélecteur multi-zones → Masque de zones, Supprimer et Conserver | `src/plugins/integration.test.ts`, les deux cas « sélecteur → masque » |
| Entrée audio → effet → sortie audio | `src/plugins/integration.test.ts` enchaîne des exécuteurs ; le graphe entier se rejoue par `npm run test:empreintes-exemples` et `GRAPHE=<exemple> npm run executer` |
| Changement de langue sans rupture de réglage | `src/plugins/integration.test.ts`, le cas de la valeur anglaise d'un ancien projet ; `src/docs/contrat-cles-de-reglage.test.ts` |
| La remise à zéro d'un nœud amont ne perd pas les zones en aval | `src/plugins/cycle-de-vie-noeuds.test.ts`, le cas « elle ne touche jamais à ce que la personne a saisi » |

Les cas de `src/plugins/integration.test.ts` enchaînent des exécuteurs pris au registre, sans le
moteur ni React. Le moteur et l'interface ne sont éprouvés ensemble que par les specs de
`tests-e2e/`.

## Ce que ce fichier ne dit pas

- **La liste des importateurs d'un module.** Elle se cherche par les imports, à chaque fois (§8).
- **Le comportement d'un composant.** `COMPONENTS.md` le dit, et `npm run comparer` mesure ce qui
  sépare deux composants d'une même famille.
- **Ses propres chemins ne sont tenus par aucun garde.** Un module déplacé laisse ici un chemin mort
  jusqu'à la relecture suivante. Ce fichier a été relevé contre `master` le 2026-11-19.
