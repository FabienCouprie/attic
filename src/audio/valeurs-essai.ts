// audio/valeurs-essai.ts — Une valeur d'essai par type de flux, pour nourrir un composant au banc.
//
// POURQUOI CE MODULE EXISTE, ET C'EST UN CHIFFRE QUI L'A RÉCLAMÉ. Le banc ne savait fabriquer qu'un
// SON. Sur les 367 composants du catalogue qui rendent de l'audio, 307 s'en contentent — 71 sources
// sans aucune entrée, 236 qui n'attendent que de l'audio. Les soixante autres exigent d'abord autre
// chose, et aucun des trois verbes ne pouvait les atteindre : ni `mesurer`, ni `comparer`, ni
// `écouter`. Ils étaient hors de portée de toute mesure du dépôt.
//
// ET CE N'EST PAS SOIXANTE CONTEXTES À ÉCRIRE, MAIS DIX TYPES. Relevé sur `DESCRIPTION.json` :
// quinze veulent une séquence, dix-sept un MIDI, quatorze un texte, six un contrôle, trois une
// image, deux un accordage, deux une banque, et un chacun pour l'objet, la vidéo et le
// spectrogramme. Quatre types couvrent cinquante-deux des soixante.
//
// CE QU'UNE VALEUR D'ESSAI DOIT ÊTRE, et ce qui la distingue d'un exemple : DÉTERMINISTE, parce que
// deux empreintes ne se comparent pas autrement ; PETITE, parce qu'elle est fabriquée des centaines
// de fois ; et BANALE, parce qu'un composant mesuré sur un cas particulier rend un chiffre
// particulier. Elle ne cherche pas à être musicale, elle cherche à être la même.

import { accordageEgal, type Accordage } from "./accordage";
import { construireBanque, type Banque } from "./clavier-banque";
import { calculerProfilBruit } from "./effets-bruit";
import { notesVersFichierMidi } from "./midi-ecriture";
import { CONTENUS_CONTROLE } from "./sous-types-controle";
import { CONTENUS_TEXTE } from "./sous-types-texte";
import { estSequence, type Sequence } from "./sequence";

export interface OptionsEssai {
  /** Le son d'essai, quand la valeur demandée en a besoin. C'est l'appelant qui le détient. */
  source?: AudioBuffer;
}

/**
 * LE SON D'ESSAI N'EST PAS ICI, ET C'EST UNE DÉCISION.
 *
 * Il reste au banc, dont il est la quatrième précaution. Le déplacer dans `src/` paraissait un
 * progrès — un cas aurait pu l'atteindre — mais `core/hasard-prive.test.ts` l'a refusé : son
 * générateur congruentiel est un générateur écrit à la main, et ce garde en interdit de nouveaux.
 * La table qu'il tient avait été VIDÉE, et l'y réinscrire pour une valeur d'essai aurait rouvert
 * ce que le dépôt avait fermé.
 *
 * LE REMPLACER PAR `creerAleatoire` N'ÉTAIT PAS UNE OPTION : le son changerait, et les
 * soixante-douze empreintes de `tests-e2e/empreintes.json` ont été relevées sur CELUI-LÀ. Elles
 * tomberaient toutes sans qu'un seul composant ait bougé. Ces empreintes sont d'ailleurs un verrou
 * plus serré qu'un cas unitaire ne le serait.
 *
 * Ce module fabrique donc les AUTRES types, qui sont précisément ceux que le banc ne savait pas
 * faire.
 */

/**
 * Huit notes d'essai : une gamme montante, une noire chacune à cent vingt.
 *
 * ELLE N'EST NI VIDE NI D'UNE SEULE NOTE, et les deux comptent. Un composant qui transpose, qui
 * quantifie ou qui cherche une tonalité ne montre rien sur une note unique, et beaucoup rendent
 * simplement l'entrée sur une séquence vide. Huit degrés d'un do majeur suffisent à ce qu'un
 * traitement se voie, et tiennent en quatre secondes.
 */
export function sequenceDEssai(): Sequence {
  const DEGRES = [0, 2, 4, 5, 7, 9, 11, 12];
  return {
    notes: DEGRES.map((demi, i) => ({
      note: 60 + demi, velocite: 100, debut: i * 0.5, fin: i * 0.5 + 0.45, canal: 0,
    })),
    tempo: 120,
  };
}

/** Le même matériau, écrit en fichier MIDI : c'est ce qu'attend un port « midi ». */
export function midiDEssai(): File {
  return notesVersFichierMidi(
    sequenceDEssai().notes.map((n) => ({ ...n, canal: 0 })), 120, 0,
  );
}

/**
 * Un texte d'essai, choisi selon le CONTENU que le port déclare.
 *
 * UN PORT TEXTE N'ATTEND PAS « DU TEXTE », et les sous-types de contenu le disent depuis qu'ils
 * existent : une notation `C4 0.5`, un ABC, des paroles, un plan de chanson et une invite de modèle
 * sont cinq choses. Donner la même chaîne aux cinq ferait rendre un refus à quatre d'entre eux, et
 * l'on mesurerait un refus plutôt qu'un composant.
 */
export function texteDEssai(sousType?: string): string {
  switch (sousType) {
    case "notation": return "C4 0.5 D4 0.5 E4 0.5 F4 0.5 G4 1.0";
    case "abc": return "X:1\nT:Essai\nM:4/4\nL:1/4\nK:C\nC D E F | G2 z2 |";
    case "paroles": return "une phrase chantee sur quatre temps\net une seconde pour la suite";
    case "plan": return "intro 4 mesures\ncouplet 8 mesures\nrefrain 8 mesures";
    case "prompt": return "un motif simple, tempo moyen, sans voix";
    default: return "un texte d'essai, court et sans accent particulier";
  }
}

/** Un accordage d'essai : le tempérament égal à douze degrés, le plus banal qui soit. */
export function accordageDEssai(): Accordage {
  return accordageEgal(12);
}

/**
 * Une banque d'essai : le son d'essai étalé en demi-tons sur deux octaves.
 *
 * ÉTROITE À DESSEIN. Une banque sur quatre-vingt-huit touches coûte dix-neuf transpositions, soit
 * plusieurs secondes, à chaque composant mesuré ; deux octaves en coûtent cinq et suffisent à ce
 * qu'un lecteur de banque trouve une zone sous n'importe quelle note raisonnable.
 */
export function banqueDEssai(source: AudioBuffer): Banque {
  return construireBanque(source, {
    racineSource: 60, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 72,
  });
}

/**
 * Une valeur de contrôle, selon le CONTENU que le port déclare.
 *
 * LE TYPE `controle` PORTE QUATRE CHOSES, et c'est pourquoi il a fallu lui donner des contenus
 * avant de pouvoir le nourrir : une seule valeur ne peut pas être à la fois un `Float32Array` et un
 * tableau de zones. Vingt-sept ports les portent désormais.
 *
 * LES FORMES SONT CELLES DE LEURS CONSOMMATEURS, lues et non supposées : une zone est
 * `{ debut, duree }` — ce que `zonesValides` vérifie dans `plugins/montage.ts` —, une durée est la
 * même chose avec une seule entrée, ce que « Sortie audio » rend déjà. Et le profil n'est pas
 * fabriqué du tout : il est CALCULÉ sur le son d'essai par `calculerProfilBruit`, la fonction du
 * dépôt. Inventer sa taille aurait été inventer un nombre de bandes.
 */
export function controleDEssai(sousType: string | undefined, source?: AudioBuffer): unknown {
  const secondes = source?.duration ?? 3;
  switch (sousType) {
    case "zones":
      // Deux zones franches, à l'intérieur du son, avec du son entre elles : une seule ne
      // montrerait pas qu'un composant sait les traiter l'une après l'autre.
      return [
        { debut: secondes * 0.1, duree: secondes * 0.2 },
        { debut: secondes * 0.5, duree: secondes * 0.25 },
      ];
    case "duree":
      return { debut: 0, duree: secondes };
    case "tempo":
      return 120;
    case "profil":
      return source ? calculerProfilBruit(source) : null;
    default:
      return null;
  }
}

/**
 * Les types de flux pour lesquels ce module ne fabrique RIEN, et pourquoi.
 *
 * LA LISTE EST AUSSI UNE DÉCISION, et elle est tenue par un cas : un type de flux neuf doit soit
 * recevoir une valeur d'essai, soit être inscrit ici avec sa raison. Sans cela un seizième type
 * arriverait, personne ne le nourrirait, et les composants qui en dépendent sortiraient de la
 * mesure sans que rien ne le dise — ce qui est exactement l'état d'où ce module vient.
 */
export const SANS_VALEUR_DESSAI: Record<string, string> = {
  // Le son d'essai reste au banc, dont il est une precaution : voir l'en-tete de ce fichier.
  audio: "le son d'essai appartient au banc, qui le tient deterministe depuis l'origine",
  // Une forme qui dépend du composant qui la produit : un profil de bruit, une zone, une enveloppe.
  // En fabriquer une au hasard ferait mesurer un refus plutôt qu'un traitement.
  // qui l'analyse : il est donc monte par l'appelant, qui seul le connait.
  spectrogramme: "se fabrique a partir du son d'essai, au parametrage de l'appelant",
  image: "trois composants ; une image d'essai demande de choisir ce qu'elle represente",
  video: "un seul composant, et une video d'essai pese trop pour etre fabriquee a chaque mesure",
  objet: "un seul composant, et la forme n'est pas decrite ailleurs que chez lui",
  fichier: "un chemin sur le disque, qui n'a pas de sens hors d'une machine",
  cercle: "une figure produite par un composant de visualisation, jamais attendue en entree",
  courbe: "aucun composant qui rend de l'audio n'en exige une",
  frontiere: "une marque d'assemblage, posee par le moteur et non par un composant",
};

/**
 * La valeur d'essai d'un type de flux, ou `null` quand ce module n'en fabrique pas.
 *
 * `sousType` sert aux ports qui déclarent un contenu : c'est lui qui distingue une notation d'un
 * ABC, et le donner change ce qui est rendu.
 */
export function valeurDEssai(type: string, sousType?: string, o: OptionsEssai = {}): unknown {
  switch (type) {
    case "sequence": return sequenceDEssai();
    case "midi": return midiDEssai();
    case "texte": return texteDEssai(sousType);
    case "accordage": return accordageDEssai();
    case "banque": return o.source ? banqueDEssai(o.source) : null;
    case "controle": return controleDEssai(sousType, o.source);
    default: return null;
  }
}

/** Les contenus de texte déclarés par le domaine, pour qu'un cas puisse les confronter un à un. */
export const CONTENUS_FABRIQUES: readonly string[] = Object.keys(CONTENUS_TEXTE);

/**
 * Les types de flux qui portent des CONTENUS, et lesquels.
 *
 * UN TYPE À CONTENUS NE SE NOURRIT PAS SANS SON CONTENU, et `controle` l'a montré : une valeur par
 * défaut nourrirait trois de ses quatre ports avec la mauvaise forme — un tableau de zones là où
 * l'on attend un `Float32Array`. Le dire ici permet au garde de couverture de demander à chaque
 * type ce qu'il sait rendre, au lieu de l'interroger sans contenu et de conclure qu'il ne rend rien.
 */
export const CONTENUS_PAR_TYPE: Record<string, readonly string[]> = {
  texte: Object.keys(CONTENUS_TEXTE),
  controle: Object.keys(CONTENUS_CONTROLE),
};
