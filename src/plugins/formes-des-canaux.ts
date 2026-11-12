// plugins/formes-des-canaux.ts — Ce que chaque exécuteur montre et désigne, et que ses vues lisent.
//
// POURQUOI CE MODULE, et c'est la pièce 5b du plan `work/plan-donnees-noeud-2026-11-11.md`. Les deux
// canaux déclarés d'un exécuteur, `affichage` et `designe`, ont la forme qu'il choisit : un cercle,
// une séquence, les infos d'un film… Les vues les relisaient sous vingt-trois affirmations de type,
// dans dix fichiers, chacune écrite pour son compte : trois en `any`, dix en passant par `unknown`,
// deux qui lisaient des champs en `any`. Rien ne tenait la forme écrite à la forme lue : un
// exécuteur qui renommait un champ laissait sa vue lire `undefined`, sans un mot du compilateur.
//
// CHAQUE FORME EST DÉCLARÉE ICI UNE FOIS, à côté des exécuteurs, par famille. L'exécuteur la vérifie
// en l'écrivant (`satisfies`) ; la vue la lit par `affichageDe` ou `designeDe` de
// `vues-domaine/lire-canaux.ts`, la seule affirmation qui reste. Un champ renommé d'un côté fait
// désormais tomber `tsc` de l'autre.
//
// UN MODULE ET NON UN PAR EXÉCUTEUR : plusieurs formes ont plusieurs auteurs. Le film produit en a
// cinq, le profil de goût trois.
//
// DES ALIAS DE TYPE, ET NON DES INTERFACES. Le canal d'un exécuteur est un `Record<string, unknown>`
// (`core/types.ts`), et une interface n'y entre pas : elle n'a pas de signature d'index, un alias
// si. Écrites en interfaces, ces formes compilaient tant que chaque fiche se vérifiait à travers
// l'affirmation `as FicheAudio[]` de son tableau ; quand `plugins/fiche.ts` a fait vérifier chaque
// fiche seule, le 2026-11-12, dix exécuteurs sont tombés. C'est le piège que React Flow avait déjà
// tendu à `DonneesNoeud`.
import type { Accordage } from "../audio/accordage";
import type { AnalyseEsthetique } from "../audio/esthetique";
import type { Sequence } from "../audio/sequence";
import type { InfosFilm } from "../vues-domaine/MontageVideo";
import type { ColonneVue } from "../vues-domaine/montage-video-geometrie";
import type { PisteMontage } from "../vues-domaine/ligne-temps-calcul";
import type { PisteVue } from "../vues-domaine/PistesMultiples";

// ── Ce qu'un exécuteur MONTRE, sous `affichage` ──

/** Le cercle que « Cercle de gamme » produit. La vue en vérifie la forme par `estCercle`. */
export type AffichageCercle = { cercle?: unknown };

/** La carte écrite sur le disque par « Carte sonore » et « Coordonnées sur carte ». */
export type AffichageCarte = { htmlPath?: string; carte?: unknown };

/** La galerie écrite sur le disque par « Galerie d'exposition », et ses pistes. */
export type AffichageGalerie = { htmlPath?: string; pistes?: { nom: string; url: string }[] };

/** Le profil de goût d'un son, que « Goût », « Parfum » et « Accord mets » produisent. */
export type AffichageProfilGout = { profilGout?: { gout: string; part: number }[] };

/** L'animation SVG que « Cercle pulsant » dessine. */
export type AffichageAnimation = { animationSvg?: string };

/** L'analyse esthétique d'un son, ou la comparaison de deux. */
export type AffichageEsthetique = { analyse?: AnalyseEsthetique };
export type AffichageComparaisonEsthetique = { a?: AnalyseEsthetique; b?: AnalyseEsthetique };

/** Le MP3 que « Sortie conversion » écrit. */
export type AffichageMp3 = { mp3Url?: string };

/** Le film de la démonstration, et sa taille en octets. */
export type AffichageDemonstration = { videoUrl?: string; taille?: number };

/** Un film produit, à enregistrer : cinq exécuteurs vidéo le rendent. */
export type AffichageFilm = { url?: string; nom?: string; octets?: number };

// ── Ce qu'un exécuteur DÉSIGNE de ses entrées, sous `designe` ──

/** Le cercle reçu par « Retouche de cercle ». */
export type DesigneCercle = { cercle?: unknown };

/** L'accordage reçu par le clavier isomorphe. */
export type DesigneAccordage = { accordage?: Accordage };

/** La séquence reçue par le rouleau. */
export type DesigneSequence = { sequence?: Sequence };

/** Le texte reçu par « Modifier le texte ». */
export type DesigneTexte = { texteRecu?: string };

/** Les pistes branchées sur le visualiseur multipiste. */
export type DesignePistesMultiples = { pistes?: PisteVue[] };

/** Les pistes d'un montage ou les boîtes d'une maquette : durées, tampons et notes. */
export type DesigneMontage = {
  /** Les durées réelles des pistes ou des boîtes, que seule l'exécution connaît. */
  durees?: PisteMontage[];
  /** Les tampons des pistes du Montage : l'onde s'y lit, et l'écoute vivante y joue. */
  sons?: Record<number, AudioBuffer>;
  /** Les notes des boîtes de la Maquette, en fractions de leur durée propre. */
  notes?: Record<number, { debut: number; duree: number; note: number }[]>;
};

/** Le film reçu par « Extrait vidéo ». */
export type DesigneExtraitVideo = { infos?: InfosFilm };

/** Le film reçu par « Montage vidéo », et les sons posés dessous. */
export type DesigneMontageVideo = {
  infos?: InfosFilm;
  pistes?: { piste: number; dureeSec: number; crete: number; colonnes: ColonneVue[] }[];
  sons?: Record<string, AudioBuffer>;
};
