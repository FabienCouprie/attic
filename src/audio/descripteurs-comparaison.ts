// audio/descripteurs-comparaison.ts — Ce qu'on relève d'un son rendu pour le comparer à un autre.
//
// POURQUOI CE MODULE EXISTE, ET POURQUOI IL N'EST PAS DANS LE BANC. Une empreinte « rms/crête »
// surveille qu'un composant ne CHANGE pas ; elle ne dit pas laquelle de deux réverbérations
// choisir. Le verbe `comparer` a besoin d'axes qui séparent : la durée ajoutée, la couleur, de
// combien le rendu s'écarte de l'entrée, la largeur stéréo.
//
// CE CALCUL A D'ABORD VÉCU DANS `page.evaluate`, DONC HORS D'ATTEINTE DE TOUT CAS. Il rendait un
// tableau bien formé, avec des chiffres plausibles, qu'aucun garde ne pouvait contredire — un canal
// confondu, une entrée et une sortie échangées, un logarithme dans la mauvaise base auraient produit
// exactement la même belle sortie. C'est la forme de faute que ce dépôt paie le plus cher, et la
// sortir du navigateur est la seule chose qui la rende visible.
//
// TOUS LES CHIFFRES VIENNENT DES MODULES DU DÉPÔT, jamais d'un calcul réécrit ici : la sonie de
// `vumetre.ts`, le centroïde de `analyse-descripteurs.ts`, la masse et la dynamique de
// `criteres-schaefferiens.ts`, la corrélation de `ampleur.ts`. Une seconde implémentation
// dériverait — ce dépôt l'a payé quatre fois sur un seul composant.

import { calculerCentroidSpectralMeyda } from "./analyse-descripteurs";
import { correlation } from "./ampleur";
import { dynamique, masse } from "./criteres-schaefferiens";
import { sonieIntegree } from "./vumetre";
import { versDb } from "./decibels";

export interface Descripteurs {
  secondes: number;
  /** La durée rendue rapportée à celle de l'entrée : un étirement double, un filtre ne bouge pas. */
  rapportDuree: number;
  sonieLufs: number;
  creteDb: number;
  centroideHz: number;
  /** L'écart de centroïde à l'entrée, en demi-tons : clair ou sombre, dans une unité qui s'entend. */
  centroideDemiTons: number;
  /** L'espèce de masse schaefferienne : pur, tonique, groupe, nodal, blanc. */
  masse: string;
  hauteurs: number;
  /** La forme dynamique : impulsion, tenue, crescendo, decrescendo, delta. */
  dynamique: string;
  attaqueMs: number;
  /** La corrélation des deux canaux : 1 pour un mono, 0 pour deux canaux indépendants. */
  correlation: number;
  /**
   * De combien le rendu s'écarte de l'entrée, en décibels relatifs à l'entrée. Zéro décibel veut
   * dire « la différence pèse autant que l'entrée », donc un son entièrement refait ; moins vingt,
   * « il l'effleure ».
   *
   * DEUX LIMITES, ÉCRITES PARCE QU'ELLES CHANGENT LA LECTURE. La comparaison est faite ÉCHANTILLON
   * PAR ÉCHANTILLON sur la partie commune : un composant qui retarde le son, même sans le
   * transformer, y paraîtra transformant. Et elle s'arrête à la longueur de l'entrée, pour que la
   * queue d'une réverbération ne se compte pas comme un écart — sans quoi la plus longue passerait
   * pour la plus transformante par construction.
   */
  ecartEntreeDb: number;
}

/** Le niveau d'un silence, en décibels : une valeur finie, pour ne pas propager `-Infinity`. */
export const PLANCHER_DB = -120;

const enDb = (amplitude: number): number =>
  amplitude > 0 ? versDb(amplitude) : PLANCHER_DB;

/** Le canal droit d'un tampon, ou le gauche quand il est mono : un mono est parfaitement corrélé. */
const droite = (b: AudioBuffer): Float32Array =>
  b.getChannelData(b.numberOfChannels > 1 ? 1 : 0);

/**
 * Le niveau de la différence entre deux signaux, rapporté au premier.
 *
 * Séparé et exporté parce que c'est l'axe le moins évident à relire, et celui dont un cas à réponse
 * connue vaut le plus : deux signaux identiques doivent tomber au plancher, et un signal comparé à
 * son double doit rendre exactement zéro décibel — la différence valant alors l'entrée elle-même.
 */
export function ecartRelatifDb(entree: Float32Array, sortie: Float32Array): number {
  const commun = Math.min(entree.length, sortie.length);
  if (commun === 0) return PLANCHER_DB;
  let diff = 0, ref = 0;
  for (let i = 0; i < commun; i++) {
    const w = sortie[i] - entree[i];
    diff += w * w;
    ref += entree[i] * entree[i];
  }
  if (ref <= 0) return PLANCHER_DB;
  if (diff <= 0) return PLANCHER_DB;
  return Math.max(PLANCHER_DB, 10 * Math.log10(diff / ref));
}

/**
 * Les descripteurs d'un rendu, relevés contre l'entrée qui l'a produit.
 *
 * L'ENTRÉE EST UN ARGUMENT, ET NON UNE CONSTANTE DU BANC : les axes relatifs — la durée rapportée,
 * la couleur, l'écart — n'ont de sens que contre le son qui a servi. Les figer rendrait le module
 * inutilisable hors du banc, et c'est justement un module qu'on veut pouvoir éprouver à part.
 */
export function descripteursComparaison(sortie: AudioBuffer, entree: AudioBuffer): Descripteurs {
  const g = sortie.getChannelData(0);

  let crete = 0;
  for (let i = 0; i < g.length; i++) crete = Math.max(crete, Math.abs(g[i]));

  const cEntree = calculerCentroidSpectralMeyda(entree).valeur;
  const cSortie = calculerCentroidSpectralMeyda(sortie).valeur;
  const m = masse(g, sortie.sampleRate);
  const d = dynamique(g, sortie.sampleRate);
  const sonie = sonieIntegree(sortie, sortie.sampleRate, sortie.numberOfChannels, sortie.length);

  return {
    secondes: sortie.duration,
    rapportDuree: entree.duration > 0 ? sortie.duration / entree.duration : 0,
    // Une sonie non finie est celle d'un silence : le plancher dit la même chose sans contaminer
    // les moyennes et les écarts qui la liront.
    sonieLufs: Number.isFinite(sonie.integree) ? sonie.integree : PLANCHER_DB,
    creteDb: enDb(crete),
    centroideHz: cSortie,
    centroideDemiTons: cEntree > 0 && cSortie > 0 ? 12 * Math.log2(cSortie / cEntree) : 0,
    masse: m.espece,
    hauteurs: m.hauteurs,
    dynamique: d.forme,
    attaqueMs: d.attaqueMs,
    correlation: correlation(g, droite(sortie)),
    ecartEntreeDb: ecartRelatifDb(entree.getChannelData(0), g),
  };
}
