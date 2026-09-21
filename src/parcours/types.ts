// parcours/types.ts — Ce qu'est un exercice, et sur quoi il se valide.
//
// LA DÉCISION QUI TIENT TOUT LE RESTE : UN EXERCICE NE SE VALIDE PAS EN CLIQUANT « J'AI COMPRIS ».
// Un tutoriel qui déroule des pages et demande de cliquer « suivant » n'apprend rien qu'une
// documentation n'apprendrait mieux, et il ment sur un point : il prétend que l'on a fait le
// geste. Ici, la validation se lit sur deux choses réelles, et jamais sur une déclaration :
//
//   1. L'ATELIER — le graphe que l'on est en train de construire. « Pose un générateur, relie-le à
//      une sortie, lance » se vérifie en regardant les nœuds et les arêtes. Si rien n'est posé,
//      rien ne se coche.
//   2. LE SON RENDU — ce qui sort du nœud branché sur l'entrée du parcours. « Amène-moi un son
//      dont la sonie tient à −14 LUFS sans dépasser −1 dBTP » se vérifie en le mesurant. C'est ce
//      qu'on appelle ici une ÉPREUVE : elle ne demande pas un geste, elle demande un résultat, et
//      elle laisse libre le chemin pour y arriver.
//
// LA CONDITION EST LA LISTE DE CONTRÔLE. Une condition ne rend pas un booléen mais une liste de
// points, chacun avec son état et sa phrase — « il manque une réverbération », « le générateur
// n'est pas encore relié ». La vue se contente de l'afficher : la liste se coche toute seule
// pendant qu'on travaille, et le dernier point qui reste rouge dit exactement ce qui manque. Un
// exercice qui refuserait de se valider sans dire pourquoi serait une énigme, pas une leçon.
//
// TOUT EST BILINGUE DÈS LA NAISSANCE, y compris la phrase d'un critère. Un parcours dont la
// moitié des exercices tombent en français au milieu d'une session anglaise serait pire que pas de
// parcours du tout : c'est la première chose qu'un débutant lit du logiciel.

/** Ce à quoi un nœud doit ressembler pour qu'un exercice le compte. */
export interface Critere {
  /** L'un de ces identifiants de fiche exactement. */
  fiches?: string[];
  /** Ou bien : n'importe quel nœud de cette famille. */
  famille?: string;
  /** Ou bien : n'importe quel nœud de cet univers. */
  univers?: string;
  /** Un réglage à vérifier sur le nœud retenu. */
  parametre?: ExigenceParametre;
  /** Le nœud doit avoir produit un résultat, c'est-à-dire avoir été lancé. */
  rendu?: boolean;
  /** Comment le nommer dans la liste de contrôle — « un générateur de fréquence ». */
  quoi: string;
  quoiEn: string;
}

/**
 * Une exigence sur un réglage : au moins, au plus, ou exactement.
 *
 * `nomEn` existe parce que la clé d'un paramètre est française dans tout le logiciel, y compris
 * quand l'interface est en anglais : sans lui, la liste de contrôle anglaise annonçait
 * « « Fréquence » must be 220 ». Le test du contenu vérifie qu'il correspond au nom anglais que
 * la fiche donne à ce réglage — il ne peut donc pas dériver de son côté.
 */
export interface ExigenceParametre {
  nom: string;
  nomEn?: string;
  min?: number;
  max?: number;
  vaut?: string | number;
}

/**
 * Ce qu'un exercice demande de l'atelier.
 *
 * « relie » se lit en cheminant : il suffit que le son PARVIENNE de l'amont à l'aval, fût-ce à
 * travers dix nœuds. C'est ce qui compte pédagogiquement — « ton générateur arrive bien à la
 * sortie » — et c'est ce qui laisse à l'élève la liberté d'ajouter ce qu'il veut entre les deux.
 * `direct` exige l'arête elle-même, pour les rares exercices qui portent sur le branchement.
 */
export type Condition =
  | { sorte: "present"; critere: Critere; nombre?: number }
  | { sorte: "relie"; amont: Critere; aval: Critere; direct?: boolean }
  | { sorte: "absent"; critere: Critere }
  | { sorte: "toutes"; conditions: Condition[] };

/** Les grandeurs qu'une épreuve peut exiger du son soumis. */
export type Grandeur =
  | "duree"          // secondes
  | "canaux"         // 1 ou 2
  | "lufs"           // sonie intégrée, LUFS
  | "vraiPic"        // vrai pic, dBTP
  | "crete"          // crête, dBFS
  | "facteurCrete"   // crête moins RMS, dB
  | "plageDynamique" // écart de sonie, dB
  | "correlation"    // entre les deux canaux, de −1 à 1
  | "equilibre"      // écart de niveau entre canaux, dB
  | "partGrave"      // part d'énergie sous 200 Hz, en pour-cent
  | "partAigu"       // part d'énergie au-dessus de 4 kHz, en pour-cent
  | "hauteur"        // hauteur médiane des trames tenues, en hertz
  | "justesse"       // écart au demi-ton le plus proche, en cents
  | "partVoisee";    // part des trames où une hauteur se tient, en pour-cent

/** Une exigence mesurée sur le son soumis. */
export interface Cible {
  grandeur: Grandeur;
  min?: number;
  max?: number;
  /** L'exigence en clair — « la sonie tient entre −15 et −13 LUFS ». */
  exigence: string;
  exigenceEn: string;
}

/** Un exercice : ce qu'on demande, comment s'y prendre, et ce que cela apprend. */
export interface Exercice {
  id: string;
  /** L'identifiant du chapitre auquel il appartient. */
  chapitre: string;
  titre: string;
  titreEn: string;
  /** Ce qu'il faut faire. Une phrase, deux au plus. */
  enonce: string;
  enonceEn: string;
  /** Comment s'y prendre, montré à la demande — jamais d'office. */
  indice: string;
  indiceEn: string;
  /** Ce que l'exercice apprend, montré une fois réussi. C'est la vraie matière. */
  lecon: string;
  leconEn: string;
  /** Ce que l'atelier doit contenir. */
  condition?: Condition;
  /** Ce que le son soumis doit mesurer. */
  cibles?: Cible[];
  /** Une épreuve ferme un chapitre : elle demande un résultat, pas un geste. */
  epreuve?: true;
}

/** Un chapitre : une étape du voyage, avec ce qu'on saura en la quittant. */
export interface Chapitre {
  id: string;
  titre: string;
  titreEn: string;
  /** Ce que le chapitre promet d'apprendre, montré en l'ouvrant. */
  promesse: string;
  promesseEn: string;
}

/** Un point de la liste de contrôle : un état, et la phrase qui le dit. */
export interface Point {
  satisfait: boolean;
  texte: string;
  texteEn: string;
}

/** La phrase d'un point dans la langue demandée. */
export const phrase = (p: Point, en: boolean): string => (en ? p.texteEn : p.texte);

/** Le titre d'un exercice dans la langue demandée. */
export const titreLangue = (x: Exercice | Chapitre, en: boolean): string => (en ? x.titreEn : x.titre);
