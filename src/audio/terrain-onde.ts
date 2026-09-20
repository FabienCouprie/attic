// audio/terrain-onde.ts — Synthèse par terrain d'onde.
//
// Un oscillateur à table d'onde lit une courbe à une dimension. La synthèse par terrain
// d'onde en lit une à DEUX : une surface `z = f(x, y)`, parcourue par une orbite qui s'y
// promène. Le son est l'altitude du terrain sous l'orbite. L'idée vient des années 1970
// (Bischoff, Gold, Horton ; Mitsuhashi, 1982) et Curtis Roads en donne l'exposé de
// référence dans « The Computer Music Tutorial ».
//
// Ce qui la rend intéressante est la séparation des rôles. L'ORBITE décide de la période,
// donc de la hauteur ; le TERRAIN décide de la forme d'onde, donc du timbre. Élargir
// l'orbite sur un terrain accidenté change tout le spectre sans toucher à la note, et une
// orbite qui dérive lentement fait évoluer le timbre indéfiniment sans jamais se répéter.
//
// Deux conséquences à connaître, parce qu'elles surprennent, et parce qu'elles sont de la
// géométrie et non des défauts. La SYMÉTRIE du terrain multiplie la fréquence : sur une
// selle `z = x² − y²`, un tour d'orbite passe deux fois par le même relief, et l'on entend
// l'octave au-dessus de la vitesse de rotation. Et un terrain fait de cercles concentriques
// est CONSTANT le long d'un cercle centré : il ne donne alors aucun son, et il faut décaler
// le centre de l'orbite pour l'entendre.

export type Terrain = "classique" | "selle" | "produit" | "ondes" | "personnalise";
export type Orbite = "cercle" | "ellipse" | "lissajous" | "spirale";

export interface ConfigTerrain {
  terrain: Terrain;
  /** Formule en x et y, pour le terrain personnalisé. */
  formule?: string;
  orbite: Orbite;
  /** Tours par seconde de l'orbite : la période de base du son. */
  frequence: number;
  duree: number;
  frequenceEch: number;
  /** Rayon de l'orbite : c'est le réglage de timbre. */
  rayon: number;
  /** Écrasement de l'ellipse, de 0,1 à 1. */
  aplatissement: number;
  /** Rapports de fréquence de l'orbite de Lissajous. */
  rapportX: number;
  rapportY: number;
  /** Dérive du rayon sur la durée, de −1 à 1 : le timbre évolue. */
  derive: number;
  /** Décalage du centre de l'orbite, qui déplace la zone explorée. */
  centreX: number;
  centreY: number;
}

/**
 * Les terrains fournis.
 *
 * « Classique » est celui que Mitsuhashi donne en exemple et que toute la littérature
 * reprend : un produit de facteurs qui creuse des vallées le long des droites x = ±1 et
 * y = ±1, et dont le relief change beaucoup selon la distance au centre. « Selle » est le
 * plus simple des terrains symétriques, et sert à entendre le doublement de fréquence.
 */
export function altitude(terrain: Terrain, x: number, y: number): number {
  switch (terrain) {
    case "selle":
      return x * x - y * y;
    case "produit":
      return Math.sin(2 * Math.PI * x) * Math.sin(2 * Math.PI * y);
    case "ondes":
      return Math.sin(2 * Math.PI * (x * x + y * y));
    case "classique":
    default:
      return (x - y) * (x - 1) * (x + 1) * (y - 1) * (y + 1);
  }
}

export interface Point { x: number; y: number }

/** L'orbite à l'instant donné, en tours accomplis. */
export function positionOrbite(config: ConfigTerrain, tours: number, rayon: number): Point {
  const a = 2 * Math.PI * tours;
  switch (config.orbite) {
    case "ellipse":
      return {
        x: config.centreX + rayon * Math.cos(a),
        y: config.centreY + rayon * config.aplatissement * Math.sin(a),
      };
    case "lissajous":
      return {
        x: config.centreX + rayon * Math.cos(a * config.rapportX),
        y: config.centreY + rayon * Math.sin(a * config.rapportY),
      };
    case "spirale": {
      // L'orbite s'enroule : le rayon tourne lui-même, donc le relief exploré change.
      const r = rayon * (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(a / 8)));
      return { x: config.centreX + r * Math.cos(a), y: config.centreY + r * Math.sin(a) };
    }
    case "cercle":
    default:
      return { x: config.centreX + rayon * Math.cos(a), y: config.centreY + rayon * Math.sin(a) };
  }
}

export interface ResultatTerrain {
  signal: Float32Array;
  /** Altitude minimale et maximale rencontrées : dit si l'orbite explore du relief. */
  minimum: number;
  maximum: number;
}

/**
 * Parcourt le terrain.
 *
 * `evaluer` permet de brancher une formule compilée pour le terrain personnalisé, sans que
 * ce module dépende d'une bibliothèque de calcul symbolique.
 */
export function synthetiserTerrain(
  config: ConfigTerrain,
  evaluer?: (x: number, y: number) => number,
): ResultatTerrain {
  const fs = config.frequenceEch;
  const longueur = Math.max(1, Math.ceil(config.duree * fs));
  const signal = new Float32Array(longueur);
  const f = Math.max(0.1, config.frequence);
  const hauteurEn = config.terrain === "personnalise" && evaluer
    ? evaluer
    : (x: number, y: number) => altitude(config.terrain, x, y);

  let minimum = Infinity, maximum = -Infinity;
  for (let i = 0; i < longueur; i++) {
    const avance = i / longueur;
    const rayon = Math.max(0, config.rayon * (1 + config.derive * avance));
    const p = positionOrbite(config, (i * f) / fs, rayon);
    let z = hauteurEn(p.x, p.y);
    if (!Number.isFinite(z)) z = 0;
    signal[i] = z;
    if (z < minimum) minimum = z;
    if (z > maximum) maximum = z;
  }

  // Le relief peut être très asymétrique : on retire la composante continue avant de
  // normaliser, sans quoi un terrain toujours positif donnerait un signal décentré.
  let somme = 0;
  for (let i = 0; i < longueur; i++) somme += signal[i];
  const moyenne = somme / longueur;
  let crete = 0;
  for (let i = 0; i < longueur; i++) {
    signal[i] -= moyenne;
    crete = Math.max(crete, Math.abs(signal[i]));
  }
  if (crete > 1e-12) {
    const g = 0.9 / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return { signal, minimum, maximum };
}
