// ui/noeud-atelier.ts — Ce qu'un nœud du canevas porte dans `data`, et le type du nœud lui-même.
//
// IL N'Y EN A PLUS QU'UN. Deux types portaient ce nom jusqu'au 2026-11-11 : celui-ci, sorti
// d'`App.tsx` avec vingt-quatre champs, et celui d'`AtelierNode.tsx`, quarante-trois champs, que les
// vues lisaient. Ni l'un ni l'autre ne contenait l'autre, et aucun ne nommait tout ce que la table des
// saisies déclare : la couleur d'une note, la mélodie jouée au clavier, le découpage d'un montage, le
// patch Pure Data. Ces champs circulaient sur `data` sans que le type les connaisse.
//
// LE TYPE EST RANGÉ PAR CLASSE, et chaque classe dit d'où elle vient. Les saisies et les résultats
// ont leur table dans le cœur, et la structure aussi depuis la pièce 2. L'état d'une passe, statut,
// progression et priorité, a quitté `data` à la pièce 3, et les gestes à la pièce 4. Le garde
// `ui/noeud-atelier.test.ts` tient chaque section à sa source, dans les deux sens.
//
// LE SAC EST FERMÉ depuis la pièce 5 : plus de `[key: string]: unknown`, un champ qu'aucune section
// ne nomme ne se lit plus ni ne s'écrit. LES SECTIONS SONT DES ALIAS DE TYPE, et non des interfaces,
// parce que React Flow demande un `data` qui soit un `Record<string, unknown>` : un alias d'objet s'y
// range de lui-même, une interface sans signature ouverte ne s'y range pas.
import type { Node } from "@xyflow/react";

/** Une zone choisie sur la forme d'onde d'un nœud, en secondes. */
export interface Zone { debut: number; duree: number }

/**
 * Ce que la personne pose sur un nœud, et que rien n'efface jamais.
 *
 * CHAQUE CHAMP EST DÉCLARÉ PAR `core/saisies.ts`, et chaque saisie de la table est nommée ici. Les
 * tableaux que le shell transporte sans les lire, la mélodie et le découpage, n'ont que leur forme :
 * c'est le domaine qui sait ce qu'une note ou un morceau contient.
 */
type SaisiesDuNoeud = {
  ficheId: string;
  parametres: Record<string, number | string>;
  /** Le texte d'une note ou d'un cadre, et sa version anglaise quand il en a une. */
  nom?: string;
  nomEn?: string;
  zonesSelectionnees?: Zone[];
  nomFichier?: string;
  couleur?: string;
  audioFichier?: File; audioNom?: string; audioUrl?: string; audioChemin?: string;
  midiFichier?: File; midiNom?: string; midiUrl?: string;
  imageFichier?: File; imageNom?: string; imageUrl?: string;
  svgFichier?: File; svgNom?: string; svgUrl?: string;
  pdfFichier?: File; pdfNom?: string;
  irFichier?: File; irNom?: string;
  enregistrementBlob?: Blob; enregistrementUrl?: string;
  modeleFichier?: File;
  pureDataFichier?: File; pureDataNom?: string;
  sfzChemin?: string; sfzNom?: string;
  sequenceNotes?: unknown[];
  morceaux?: unknown[];
};

/**
 * La place du nœud dans le graphe, et non une matière posée sur lui.
 *
 * CHAQUE CHAMP EST DÉCLARÉ PAR `CHAMPS_DE_STRUCTURE` de `core/saisies.ts`, avec ce que le fichier de
 * projet en fait ; aucun ne suit une copie, aucun n'est effacé par une remise à zéro.
 */
type StructureDuNoeud = {
  /** La bulle à laquelle le nœud appartient, par son identifiant. */
  bulle?: string;
  bulleOuverte?: boolean;
  /** Vrai quand une bulle fermée cache ce nœud ; posé par `core/bulles.ts`. */
  cacheParBulle?: boolean;
  replie?: boolean;
  portsVisibles?: number;
  portsVisiblesSortie?: number;
  /** Le nom d'un port exposé, sur l'entrée ou la sortie d'une vue interne de méta-composant. */
  frontiereNom?: string;
};

/**
 * Ce qu'une exécution a produit, déclaré par `CHAMPS_RESULTAT` de `core/classes-de-champs.ts`, et la
 * table entière : un résultat qu'elle déclare et que le type ne nommait pas se lisait par une
 * affirmation de type.
 *
 * RIEN NE LES ÉCRIT DANS `data` : le nœud les fusionne au moment de s'afficher, depuis
 * `ui/resultats.ts`. Ils sont nommés ici parce que les vues les lisent dans ce `data` fusionné.
 *
 * LES DEUX CANAUX DÉCLARÉS, `_affichage` et `_designe`, ont la forme que chaque exécuteur choisit :
 * le type n'en dit rien de plus qu'`unknown`, et une vue y lit la forme de sa famille.
 */
type ResultatsDuNoeud = {
  audioResultatUrl?: string;
  audioResultatNom?: string;
  audioResultatBuffer?: AudioBuffer;
  audioResultatMessage?: string;
  mp3Url?: string;
  scriptGenere?: string;
  /** Les valeurs d'une courbe, pour son dessin. */
  apercuCourbe?: number[];
  midiFichierSortie?: File;
  imageResultatUrl?: string;
  imageResultatFile?: File;
  visualisationUrl?: string;
  tempsExecution?: number;
  /** De combien ce composant a changé le niveau de son entrée, en décibels. Mesuré par le moteur
   *  après chaque exécution ; voir `audio/ecart-niveau.ts`. */
  ecartNiveau?: number;
  /** Le film de l'application que la démonstration enregistre, et sa taille en octets. */
  _demoAppVideoUrl?: string;
  _demoAppVideoTaille?: number;
  _affichage?: unknown;
  _designe?: unknown;
};

/**
 * Tout ce qu'un nœud porte : les trois classes, et rien qui n'en soit d'aucune.
 *
 * L'ÉTAT D'UNE PASSE N'EN EST PLUS depuis la pièce 3 : le statut et la progression vivent dans
 * `ui/statuts.ts`, la priorité dans `ui/priorite.ts`, chacun avec un abonnement par nœud. LES GESTES
 * NON PLUS depuis la pièce 4 : ils viennent d'un contexte, `ui/gestes-noeud.ts`, qui les déclare.
 */
export type DonneesNoeud = SaisiesDuNoeud & StructureDuNoeud & ResultatsDuNoeud;

export type NoeudAtelier = Node<DonneesNoeud, "atelier">;
