// core/classes-de-champs.ts — Les classes de champs d'un nœud : ce qu'une remise à zéro efface,
// ce qu'un réglage garde, ce qu'une copie emporte.
//
// ELLES VIVAIENT DANS `ui/hooks/useExecutionGraphe.ts`, avec le moteur qui les applique, et c'est
// de là qu'elles viennent, commentaires compris. Ce qu'on en FAIT était déjà dans le cœur
// (`core/cycle-de-vie.ts`) ; ce qu'elles SONT y est désormais aussi, pour trois raisons. Un banc qui
// les éprouve sur les quatre cent quarante-huit fiches n'a plus à charger le crochet React qui les
// portait. Le copier-coller, qui ne lit que deux de ces ensembles, n'importe plus le moteur entier
// pour les avoir. Et le crochet, à son plafond de dette, perd cent soixante lignes qui ne
// décrivaient pas une passe.
//
// RIEN ICI NE NOMME LE DOMAINE : ce sont des noms de champs, et le cœur les transporte comme il
// transporte les valeurs, sans savoir ce qu'ils désignent.

import { CHAMPS_DE_SAISIE, CHAMPS_MEDIA } from "./saisies";
import type { ClassesDeChamps } from "./cycle-de-vie";

// LA TROISIÈME CLASSE A DISPARU, ET C'EST UN RÉSULTAT. `CHAMPS_SIGNAL_UNIQUE` nommait ici trois
// champs qu'un composant posait sur un nœud pour parler au MOTEUR : un graphe à créer, un graphe
// trouvé dans un fichier, une palette à relire. Le moteur les relisait puis les remettait à
// `undefined`. C'était une quatrième liste de noms tenue à la main, et un cinquième champ, celui de
// l'export, écrivait la même chose sans y figurer.
//
// Ces demandes passent désormais par `moteur`, dans le retour de l'exécuteur : rien ne se pose sur
// le nœud, donc il n'y a ni classe à décider, ni remise à zéro à prévoir, ni champ à oublier. Il ne
// reste que deux classes, la troisième n'ayant jamais décrit que des champs qui n'avaient pas à être
// là. Voir `DemandeAuMoteur` dans `core/types.ts`.

// Champs saisis par l'utilisateur : ils ne doivent JAMAIS être réinitialisés par
// une cascade de reset. Seuls les résultats de calcul (URLs blob, buffers,
// statuts, messages, cache) peuvent être effacés.
// Exporté : sert aussi d'allowlist au copier-coller (App.tsx) — copier UNIQUEMENT
// ces champs plutôt que tout `data` sans filtre, pour ne jamais dupliquer un
// résultat calculé (buffer audio, URL blob…) sur un nœud qui n'a pas encore
// tourné lui-même. Voir le commit qui a introduit ce commentaire pour le détail
// du bug : un nœud collé affichait/jouait le résultat de l'original avant même
// sa première exécution, car `audioResultatBuffer`/`audioResultatUrl` etc.
// étaient copiés par erreur avec le reste de `data`.
/**
 * Ce que la personne a posé sur un nœud, et que rien n'efface jamais.
 *
 * DÉRIVÉ, ET NON PLUS ÉNUMÉRÉ. Vingt-cinq noms étaient écrits ici à la main, et les sept autres
 * endroits qui décrivaient le même savoir en avaient chacun un sous-ensemble différent. La table des
 * genres de saisie, dans `core/saisies.ts`, les déclare une fois ; ceci n'est plus qu'un nom pour
 * elle. Sert aussi d'allowlist au copier-coller, privée des médias locaux.
 */
export const CHAMPS_UTILISATEUR: ReadonlySet<string> = CHAMPS_DE_SAISIE;

// Média chargé par l'utilisateur SUR CE NŒUD précis.
//
// Ces champs restent dans CHAMPS_UTILISATEUR — ils doivent absolument survivre
// à une cascade de réinitialisation, sans quoi lancer le graphe ferait perdre à
// l'utilisateur le fichier qu'il a chargé. Mais ils ne doivent pas être
// DUPLIQUÉS : un « Entrée audio » collé arrivait avec le fichier de l'original,
// donc un lecteur affichant déjà une durée de piste, alors que ce nœud n'a rien
// reçu ni rien exécuté. Un nœud copié doit arriver vierge, prêt à recevoir son
// propre fichier.
//
// La distinction ne vaut que pour la COPIE (Ctrl+C). Un couper-coller (Ctrl+X)
// est un déplacement, pas une duplication : l'original disparaît, donc le média
// doit suivre — l'oublier là reviendrait à le détruire.
/** Les médias chargés sur CE nœud, dérivés de la même table : voir `core/saisies.ts`. */
export const CHAMPS_MEDIA_LOCAL: ReadonlySet<string> = CHAMPS_MEDIA;

/** Champs retenus par un copier-coller (Ctrl+C) : saisie utilisateur, média exclu. */
export const CHAMPS_COPIABLES = new Set(
  [...CHAMPS_UTILISATEUR].filter((c) => !CHAMPS_MEDIA_LOCAL.has(c)),
);

/**
 * Ce qu'une exécution DÉPOSE sur un nœud, et que la réinitialisation doit donc retirer.
 *
 * POURQUOI CETTE LISTE EXISTE, relevé par Fabien : le dessin du générateur de courbe restait à
 * l'écran après un reset. Le nœud repassait bien « en attente », son message et son bouton de copie
 * disparaissaient, et la courbe continuait de s'afficher comme si elle venait d'être calculée. La
 * cause n'est pas dans le composant : la remise à zéro énumérait à la main les champs à effacer, et
 * trois de ceux que l'exécution écrit n'y figuraient pas. `apercuCourbe` dessine la courbe,
 * `midiFichierSortie` offre le fichier à télécharger, `ecartNiveau` affiche la pastille en
 * décibels : les trois survivaient à la remise à zéro du nœud qui les avait produits.
 *
 * LA LISTE EST DONC UNIQUE, et c'est la seule protection qui tienne. Une énumération écrite là où
 * l'on efface ne peut pas savoir ce qu'on a ajouté là où l'on écrit ; deux listes divergent, et
 * celle du réalisateur de démonstration avait déjà divergé de celle-ci, dans l'autre sens. Un champ
 * ajouté ici disparaît partout.
 *
 * AUCUN DE CES CHAMPS N'APPARTIENT À L'UTILISATEUR. Un recouvrement avec `CHAMPS_UTILISATEUR`
 * serait un fichier chargé qui s'évapore au premier lancement ; un test tient les deux disjoints.
 */
export const CHAMPS_RESULTAT = new Set([
  "audioResultatUrl",
  "audioResultatNom",
  "audioResultatBuffer",
  "audioResultatMessage",
  "mp3Url",
  "scriptGenere",
  "apercuCourbe",
  "midiFichierSortie",
  "imageResultatUrl",
  "imageResultatFile",
  "visualisationUrl",
  "tempsExecution",
  "ecartNiveau",
  // ── L'ANCIEN RÉGIME EST VIDE ──
  //
  // VINGT-NEUF CHAMPS Y FIGURAIENT, sur douze composants. Vingt-six sont passés au canal
  // d'affichage, deux ont été retirés parce que rien ne les lisait, et le dernier, `_grapheExport`,
  // est parti par le canal du moteur : il ne décrivait pas ce qu'on voit, il disait au moteur quoi
  // embarquer dans le fichier écrit — et ce canal-là a été retiré à son tour le 2026-11-01.
  //
  // Ce qui précède est ce que le MOTEUR lui-même dépose sur un nœud : l'URL du son rendu, son
  // message, le temps d'exécution. Un composant, lui, n'écrit plus rien.

  // ── LE CANAL DÉCLARÉ, et ce qu'il remplace ──
  //
  // Ces deux clés seules valent pour tout composant qui rend `affichage` ou `designe` : la classe
  // ne se déclare plus champ par champ dans cette liste, elle est portée par le canal. Un composant
  // migré n'ajoute donc plus rien ici, et n'a plus rien à y oublier. Les vingt-neuf entrées
  // ci-dessus sont ce qui reste de l'ancien régime, et elles s'en iront composant par composant.
  "_affichage",
  "_designe",
]);

/**
 * Ce qu'un CHANGEMENT DE RÉGLAGE ne périme pas, bien que le run l'ait déposé.
 *
 * POURQUOI CE SECOND AXE EXISTE, relevé par Fabien : « l'écoute vivante fonctionnait hier et ne
 * fonctionne plus ». C'est cette liste-ci qui manquait. Un réglage modifié passe par la même remise
 * à zéro que le bouton, et depuis que les tampons du Montage s'effacent au reset — ce qu'il fallait
 * pour que le dessin ne survive pas à l'exécution qui l'a produit — bouger un gain les effaçait
 * aussi : le graphe vivant n'avait plus rien à jouer et s'arrêtait. Régler en écoutant redevenait
 * impossible, ce qui est le défaut même qu'il corrigeait.
 *
 * LE CRITÈRE : un réglage périme ce que le nœud a CALCULÉ, jamais ce qu'il a DÉSIGNÉ DE SES ENTRÉES.
 * Les tampons des pistes sont ceux des composants d'amont, les durées mesurées sont celles des sons
 * reçus, les notes sont celles des boîtes branchées : changer un début ou un gain ne touche à aucun
 * des trois. Le bouton de remise à zéro, lui, les efface comme le reste, le nœud repassant « en
 * attente ». Ce n'est donc pas une quatrième classe, c'est la portée d'un geste.
 *
 * ET CELA NE VAUT QUE POUR LE NŒUD DONT LE RÉGLAGE A CHANGÉ. Un montage situé en aval, lui, voit ses
 * entrées changer pour de bon : ses tampons sont périmés, et la cascade les efface.
 *
 * Le dépôt avait déjà rencontré ce conflit, sur les zones, et l'avait résolu par le choix entre
 * `reinitialiserNoeud` et `reinitialiserAval` : « effacer le nœud ferait disparaître sa forme d'onde
 * et son lecteur à chaque zone ajoutée ». Ici le résultat calculé EST périmé, donc il faut effacer le
 * nœud ; seule la matière d'affichage venue des entrées doit rester.
 */
export const CHAMPS_GARDES_AU_REGLAGE = new Set([
  // LE CANAL DÉCLARÉ : `designe` dit ce que le run a reçu, qu'un réglage ne périme pas. Un
  // composant migré est couvert par cette seule entrée, quel que soit ce qu'il désigne.
  //
  // ELLE EST SEULE, ET C'EST LA MESURE DE CE QUE LE CANAL CHANGE. Trois champs y figuraient, un par
  // besoin d'un composant ; le Montage et la Maquette passés au canal, il n'en reste aucun, et le
  // prochain composant qui désignera quelque chose de ses entrées n'aura rien à ajouter ici.
  "_designe",
]);

/**
 * Les quatre classes réunies, telles que `core/cycle-de-vie.ts` les attend.
 *
 * Un banc peut prendre cet objet tel quel et éprouver les transitions sur les quatre cent
 * quarante-huit fiches, sans monter React : `plugins/cycle-de-vie-noeuds.test.ts` le fait.
 */
export const CLASSES: ClassesDeChamps = {
  utilisateur: CHAMPS_UTILISATEUR,
  resultat: CHAMPS_RESULTAT,
  gardesAuReglage: CHAMPS_GARDES_AU_REGLAGE,
  mediaLocal: CHAMPS_MEDIA_LOCAL,
};
