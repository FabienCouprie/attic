// ui/noeud-atelier.ts — Ce qu'un nœud du canevas porte dans `data`, et le type du nœud lui-même.
//
// IL N'Y EN A PLUS QU'UN. Deux types portaient ce nom jusqu'au 2026-11-11 : celui-ci, sorti
// d'`App.tsx` avec vingt-quatre champs, et celui d'`AtelierNode.tsx`, quarante-trois champs, que les
// vues lisaient. Ni l'un ni l'autre ne contenait l'autre, et aucun ne nommait tout ce que la table des
// saisies déclare : la couleur d'une note, la mélodie jouée au clavier, le découpage d'un montage, le
// patch Pure Data. Ces champs circulaient sur `data` sans que le type les connaisse.
//
// LE TYPE EST RANGÉ PAR CLASSE, et chaque classe dit d'où elle vient. Les saisies et les résultats
// ont leur table dans le cœur, et la structure aussi depuis la pièce 2 ; les rappels sont ceux
// qu'`App.tsx` pose sur chaque nœud par `callbacksNoeud`. L'état d'une passe, statut, progression et
// priorité, a quitté `data` à la pièce 3. Le garde `ui/noeud-atelier.test.ts` tient chaque section à
// sa source, dans les deux sens.
//
// LE SAC RESTE OUVERT (`[key: string]: unknown`) : les vues y lisent encore ce que le canal
// d'affichage fusionne sous des noms qu'aucun type ne déclare. Le fermer est la dernière pièce du
// chantier, `work/plan-donnees-noeud-2026-11-11.md`.
import type { Node } from "@xyflow/react";

/** Une zone choisie sur la forme d'onde d'un nœud, en secondes. */
interface Zone { debut: number; duree: number }

/**
 * Ce que la personne pose sur un nœud, et que rien n'efface jamais.
 *
 * CHAQUE CHAMP EST DÉCLARÉ PAR `core/saisies.ts`, et chaque saisie de la table est nommée ici. Les
 * tableaux que le shell transporte sans les lire, la mélodie et le découpage, n'ont que leur forme :
 * c'est le domaine qui sait ce qu'une note ou un morceau contient.
 */
interface SaisiesDuNoeud {
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
  pureDataFichier?: File;
  sfzChemin?: string; sfzNom?: string;
  sequenceNotes?: unknown[];
  morceaux?: unknown[];
}

/**
 * La place du nœud dans le graphe, et non une matière posée sur lui.
 *
 * CHAQUE CHAMP EST DÉCLARÉ PAR `CHAMPS_DE_STRUCTURE` de `core/saisies.ts`, avec ce que le fichier de
 * projet en fait ; aucun ne suit une copie, aucun n'est effacé par une remise à zéro.
 */
interface StructureDuNoeud {
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
}

/**
 * Ce qu'une exécution a produit, déclaré par `CHAMPS_RESULTAT` de `core/classes-de-champs.ts`.
 *
 * RIEN NE LES ÉCRIT DANS `data` : le nœud les fusionne au moment de s'afficher, depuis
 * `ui/resultats.ts`. Ils sont nommés ici parce que les vues les lisent dans ce `data` fusionné.
 */
interface ResultatsDuNoeud {
  audioResultatUrl?: string;
  audioResultatNom?: string;
  audioResultatBuffer?: AudioBuffer;
  audioResultatMessage?: string;
  midiFichierSortie?: File;
  imageResultatUrl?: string;
  imageResultatFile?: File;
  visualisationUrl?: string;
  tempsExecution?: number;
  /** De combien ce composant a changé le niveau de son entrée, en décibels. Mesuré par le moteur
   *  après chaque exécution ; voir `audio/ecart-niveau.ts`. */
  ecartNiveau?: number;
}

/**
 * Les gestes qu'`App.tsx` pose sur chaque nœud par `callbacksNoeud`, les treize, ni plus ni moins.
 *
 * Deux d'entre eux, l'enregistrement et la découpe, étaient posés sans être déclarés : les vues qui
 * les lisent les affirmaient elles-mêmes. La pièce 4 du chantier les sort de `data`.
 */
interface RappelsDuNoeud {
  onDefinirPrioritaire?: (id: string) => void;
  onReinitialiser?: (id: string) => void;
  onSupprimerNoeud?: (id: string) => void;
  onChargerAudio?: (id: string, fichier: File) => void;
  onChargerMidi?: (id: string, fichier: File) => void;
  onChargerImage?: (id: string, fichier: File) => void;
  onChargerSvg?: (id: string, fichier: File) => void;
  onChargerPdf?: (id: string, fichier: File) => void;
  onChargerIR?: (id: string, fichier: File) => void;
  onChangerEnregistrement?: (id: string, blob: Blob) => void;
  onChangerParametre?: (id: string, nom: string, valeur: string | number) => void;
  onChangerZones?: (id: string, zones: Zone[]) => void;
  onChangerDecoupe?: (id: string, decoupe: Record<string, unknown>) => void;
}

/**
 * Tout ce qu'un nœud porte : les quatre classes, et rien qui n'en soit d'aucune.
 *
 * L'ÉTAT D'UNE PASSE N'EN EST PLUS depuis la pièce 3 : le statut et la progression vivent dans
 * `ui/statuts.ts`, la priorité dans `ui/priorite.ts`, chacun avec un abonnement par nœud.
 */
export interface DonneesNoeud
  extends SaisiesDuNoeud, StructureDuNoeud, ResultatsDuNoeud, RappelsDuNoeud {
  [key: string]: unknown;
}

export type NoeudAtelier = Node<DonneesNoeud, "atelier">;
