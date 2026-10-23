// audio/granulation-spectrale.ts — Le grain dans le domaine des fréquences.
//
// D'APRÈS Stefano Fasciani, « Spectral Granular Synthesis », Proceedings of the International
// Computer Music Conference, Daegu, 2018, p. 99-103.
//
// CE QUI SÉPARE CETTE MÉTHODE D'UNE GRANULATION ORDINAIRE. Une granulation découpe des morceaux
// d'onde, les enveloppe et les additionne : la taille du grain écrit EST celle du grain lu, et le
// recouvrement doit compenser l'enveloppe, faute de quoi la somme bat. Ici le grain ne garde que
// son SPECTRE D'AMPLITUDE, la phase est jetée, et l'on reconstruit la phase de toute la suite à la
// fin. Deux conséquences, qui sont toute la raison d'être du procédé :
//
//   LA TAILLE LUE ET LA TAILLE ÉCRITE SE SÉPARENT. Le spectre d'un grain de 2048 points se
//   redimensionne à 512 bins ou à 8192 en gardant sa FORME, et le grain se resynthétise donc à une
//   autre échelle de temps sans transposition ni étirement de l'onde.
//
//   LE RECOUVREMENT NE SERT PLUS À RECOLLER UNE ONDE, mais à décider combien de trames se
//   superposent dans le spectrogramme avant que la phase ne soit calculée. Il change la texture,
//   non la continuité.
//
// LA PHASE EST LA MOITIÉ COÛTEUSE, ET LE DÉPÔT L'AVAIT DÉJÀ. `audio/pghi.ts` porte l'intégration
// par tas du gradient de phase, que l'article nomme comme la méthode à employer en temps réel, et
// son Griffin-Lim sur la même fenêtre. On ne réécrit rien : on leur donne un spectrogramme de
// modules, ils rendent le son.

import { fft } from "./fft";
import { pghi, synthetiser, griffinLim } from "./pghi";
import { creerAleatoire } from "../core/hasard";

/** Les fenêtres d'extraction que l'article propose. La gaussienne de la resynthèse est ailleurs. */
export type FenetreGrain = "hann" | "hamming" | "blackman";

/** D'où vient le grain suivant dans le son lu. */
export type ExtractionGrain = "fixe" | "sequentielle" | "aleatoire";

/** Comment la phase du spectrogramme écrit est retrouvée. */
export type PhaseGrain = "pghi" | "griffin" | "nulle";

export interface OptionsGranulationSpectrale {
  /** Durée du son rendu, en secondes. */
  dureeS: number;
  /** Taille du grain LU, en échantillons. Puissance de deux. */
  tailleLue: number;
  /** Taille du grain ÉCRIT, en échantillons. Puissance de deux, indépendante de la précédente. */
  tailleEcrite: number;
  /** Part d'une trame écrite que la suivante recouvre, de 0 à 0,95. */
  recouvrement: number;
  fenetre: FenetreGrain;
  extraction: ExtractionGrain;
  /** Où lire, en part du son reçu : point fixe, ou point de départ du parcours séquentiel. */
  position: number;
  /** Vitesse du parcours séquentiel, en parts de son par seconde. Négative, il remonte. */
  vitesse: number;
  /** Écart aléatoire autour du point de lecture, en part du son reçu. */
  dispersion: number;
  /** Rotation circulaire du spectre de chaque grain, en part de la demi-bande. De −1 à 1. */
  decalage: number;
  phase: PhaseGrain;
  /** Tours de Griffin-Lim, quand c'est lui qui rend la phase. */
  iterations: number;
  graine: number;
  sampleRate: number;
}

export interface ResultatGranulationSpectrale {
  son: Float32Array;
  /** Nombre de trames écrites. */
  trames: number;
  /** Part des points du spectrogramme que PGHI a pu intégrer ; zéro pour les autres phases. */
  partIntegree: number;
}

/**
 * Une voie, pour le travailleur hors du fil.
 *
 * CHAQUE CANAL TIRE SON PROPRE HASARD, et c'est ce que l'article demande : un stéréo dont les deux
 * voies liraient les mêmes grains aux mêmes instants serait un mono dédoublé. Le décalage de graine
 * est fixe, donc le rendu reste reproductible d'une exécution à l'autre.
 */
export function granulationSpectraleVoie(
  voie: Float32Array, o: OptionsGranulationSpectrale, canal: number,
): ResultatGranulationSpectrale {
  return granulerSpectre(voie, { ...o, graine: (o.graine + canal * 7919) >>> 0 });
}

/**
 * Les trois fenêtres, écrites une fois.
 *
 * ELLES ENVELOPPENT LE GRAIN LU, et non la trame écrite : la resynthèse a sa propre fenêtre
 * gaussienne, celle que PGHI exige. Le choix se fait donc sur ce qu'on EXTRAIT, et il s'entend sur
 * la largeur des raies du spectre retenu.
 */
export function fenetreDeGrain(type: FenetreGrain, n: number): Float64Array {
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / (n - 1);
    if (type === "hann") f[i] = 0.5 - 0.5 * Math.cos(x);
    else if (type === "hamming") f[i] = 0.54 - 0.46 * Math.cos(x);
    else f[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
  return f;
}

/**
 * Le spectre d'amplitude d'un grain, redimensionné au nombre de bins demandé.
 *
 * L'INTERPOLATION EST LINÉAIRE, et c'est ce que fait l'article : elle garde la FORME du spectre en
 * la plaquant sur une autre largeur. Agrandir revient à bourrer de zéros dans le temps, ce qui
 * ajoute une modulation d'amplitude ; l'article la traite comme un effet du procédé et non comme
 * un défaut, et c'est pourquoi rien ne la corrige ici.
 */
export function redimensionnerSpectre(source: Float32Array, bins: number): Float32Array {
  const sortie = new Float32Array(bins);
  if (source.length === 0 || bins === 0) return sortie;
  if (source.length === 1) { sortie.fill(source[0]); return sortie; }
  for (let k = 0; k < bins; k++) {
    const x = bins === 1 ? 0 : (k * (source.length - 1)) / (bins - 1);
    const i = Math.min(source.length - 2, Math.floor(x));
    const t = x - i;
    sortie[k] = source[i] * (1 - t) + source[i + 1] * t;
  }
  return sortie;
}

/**
 * La rotation circulaire d'un spectre, en bins.
 *
 * CIRCULAIRE ET NON GLISSÉE : ce qui sort par le haut rentre par le bas. Un décalage glissé
 * perdrait l'aigu et laisserait du vide dans le grave, ce qui est une transposition pauvre ; la
 * rotation garde toute l'énergie et replie le spectre sur lui-même, ce qui est le geste que
 * l'article décrit.
 */
export function tournerSpectre(modules: Float32Array, bins: number): Float32Array {
  const n = modules.length;
  const sortie = new Float32Array(n);
  if (n === 0) return sortie;
  for (let k = 0; k < n; k++) sortie[(((k + bins) % n) + n) % n] = modules[k];
  return sortie;
}

const puissanceDeDeux = (n: number) => n >= 2 && (n & (n - 1)) === 0;

/**
 * La granulation spectrale d'un son.
 *
 * LA MARCHE EST CELLE DE L'ARTICLE : extraire un grain, l'enveloppe, le transformer, n'en garder
 * que les modules, les tourner, les redimensionner à la taille écrite, les poser comme une trame
 * du spectrogramme de sortie ; puis, une fois toutes les trames posées, retrouver la phase de
 * l'ensemble et repasser au temps.
 */
export function granulerSpectre(
  entree: Float32Array, o: OptionsGranulationSpectrale,
): ResultatGranulationSpectrale {
  if (!puissanceDeDeux(o.tailleLue) || !puissanceDeDeux(o.tailleEcrite)) {
    throw new Error(`taille de grain non puissance de deux : ${o.tailleLue} et ${o.tailleEcrite}`);
  }
  const binsEcrits = o.tailleEcrite / 2 + 1;
  const recouvrement = Math.max(0, Math.min(0.95, o.recouvrement));
  const saut = Math.max(1, Math.round(o.tailleEcrite * (1 - recouvrement)));
  const longueur = Math.max(1, Math.round(o.dureeS * o.sampleRate));
  const nTrames = Math.max(1, Math.ceil(longueur / saut) + 2);

  const hasard = creerAleatoire(o.graine);
  const fenetre = fenetreDeGrain(o.fenetre, o.tailleLue);
  const re = new Float64Array(o.tailleLue), im = new Float64Array(o.tailleLue);
  const binsLus = o.tailleLue / 2 + 1;
  const modules: Float32Array[] = [];

  // UN SON PLUS COURT QUE LE GRAIN SE LIT QUAND MÊME : le reste est du silence, et le spectre
  // obtenu est celui de ce qu'il y avait. Jeter le grain laisserait un trou dans le spectrogramme.
  const derniereLecture = Math.max(0, entree.length - o.tailleLue);
  let avance = o.position;

  for (let t = 0; t < nTrames; t++) {
    let part: number;
    if (o.extraction === "aleatoire") part = hasard();
    else if (o.extraction === "sequentielle") {
      // LE PARCOURS SE COMPTE EN SECONDES DE SORTIE, non en trames : changer le recouvrement ne
      // doit pas changer la vitesse à laquelle on traverse le son lu.
      avance = o.position + (o.vitesse * (t * saut)) / o.sampleRate;
      part = ((avance % 1) + 1) % 1;
    } else part = o.position;
    if (o.dispersion > 0) part += (hasard() * 2 - 1) * o.dispersion;
    const debut = Math.round(Math.max(0, Math.min(1, ((part % 1) + 1) % 1)) * derniereLecture);

    im.fill(0);
    for (let i = 0; i < o.tailleLue; i++) {
      const j = debut + i;
      re[i] = (j >= 0 && j < entree.length ? entree[j] : 0) * fenetre[i];
    }
    fft(re, im, false);

    const brut = new Float32Array(binsLus);
    for (let k = 0; k < binsLus; k++) brut[k] = Math.hypot(re[k], im[k]);
    const m = o.decalage !== 0 ? tournerSpectre(brut, Math.round(o.decalage * (binsLus - 1))) : brut;
    modules.push(redimensionnerSpectre(m, binsEcrits));
  }

  // LA LONGUEUR EST CELLE QU'ON DEMANDE, ET RIEN N'EST À RECOUPER : `synthetiser` rend déjà la
  // tranche utile, décalée du bourrage d'une fenêtre que l'analyse ajoute de chaque côté.
  if (o.phase === "griffin") {
    const son = griffinLim(modules, o.tailleEcrite, saut, longueur, Math.max(1, Math.round(o.iterations)));
    return { son, trames: modules.length, partIntegree: 0 };
  }
  if (o.phase === "nulle") {
    const phases = modules.map(() => new Float32Array(binsEcrits));
    return { son: synthetiser({ modules, phases, taille: o.tailleEcrite, saut, longueur }), trames: modules.length, partIntegree: 0 };
  }
  const { phases, partIntegree } = pghi(modules, o.tailleEcrite, saut);
  return { son: synthetiser({ modules, phases, taille: o.tailleEcrite, saut, longueur }), trames: modules.length, partIntegree };
}
