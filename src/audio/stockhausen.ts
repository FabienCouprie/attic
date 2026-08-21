// audio/stockhausen.ts — Le continuum hauteur ↔ rythme, d'après la découverte
// que Karlheinz Stockhausen formule en composant « Kontakte » (1960) et expose
// dans « … wie die Zeit vergeht … ».
//
// L'idée est d'une simplicité déroutante et pourtant contre-intuitive : hauteur,
// timbre et rythme ne sont pas trois phénomènes distincts mais UN SEUL, observé
// à trois échelles de temps. Une impulsion répétée 200 fois par seconde s'entend
// comme une note de 200 Hz ; ralentie mille fois, la même impulsion répétée
// s'entend comme une pulsation toutes les cinq secondes. Entre les deux, rien ne
// change dans le signal sinon l'échelle — et pourtant l'oreille bascule d'une
// catégorie perceptive à l'autre, quelque part autour de 20 Hz.
//
// Ce que ce module produit n'est donc pas un effet de plus : c'est une
// DÉMONSTRATION. On fait traverser cette frontière à un son, continûment, et
// l'on entend l'endroit exact où la hauteur se décompose en rythme.
//
// Mécaniquement, c'est une lecture à vitesse variable — la même opération que le
// mode « bande » du glissando de Risset. Ce qui change tout est l'AMPLITUDE du
// balayage : là où un glissando parcourt quelques octaves, il en faut ici une
// dizaine pour franchir la frontière, soit un facteur mille.

import { boucleSansCouture } from "./risset";

export interface OptionsContinuum {
  /** Durée du son produit. */
  dureeSec: number;
  /** Nombre d'octaves parcourues. Dix suffisent à passer d'une hauteur à une pulsation. */
  octaves: number;
  /** true = du rythme vers la hauteur (accélération) ; false = de la hauteur vers le rythme. */
  versLaHauteur: boolean;
  fonduBoucleSec?: number;
}

/**
 * Facteur de vitesse à l'instant `t`.
 *
 * La progression est EXPONENTIELLE et non linéaire, parce que la perception de
 * la hauteur l'est : passer de 400 à 200 Hz et de 4 à 2 Hz sont le même
 * intervalle pour l'oreille, alors que ce sont des écarts de 200 Hz et de 2 Hz.
 * Une descente linéaire passerait des aigus en un éclair pour s'éterniser dans
 * les graves.
 */
export function vitesseContinuum(t: number, options: OptionsContinuum): number {
  const duree = Math.max(1e-9, options.dureeSec);
  const progression = Math.min(1, Math.max(0, t / duree));
  const sens = options.versLaHauteur ? 1 : -1;
  return Math.pow(2, sens * options.octaves * progression);
}

/**
 * Fréquence de répétition attendue à l'instant `t`, pour une source dont la
 * période vaut `periodeSourceSec`.
 *
 * C'est la grandeur qui rend la démonstration vérifiable plutôt
 * qu'impressionniste : on peut prédire, et donc mesurer, à quel moment le son
 * franchit la frontière des ~20 Hz sous laquelle l'oreille cesse d'entendre une
 * hauteur pour entendre un rythme.
 */
export function frequenceAttendue(t: number, periodeSourceSec: number, options: OptionsContinuum): number {
  if (periodeSourceSec <= 0) return 0;
  return vitesseContinuum(t, options) / periodeSourceSec;
}

/** Lecture interpolée linéairement, rebouclée sur la source. */
function lire(canal: Float32Array, pos: number): number {
  const len = canal.length;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = canal[((i % len) + len) % len];
  const b = canal[(((i + 1) % len) + len) % len];
  return a * (1 - f) + b * f;
}

export function continuumHauteurRythme(buffer: AudioBuffer, options: OptionsContinuum): AudioBuffer {
  const sr = buffer.sampleRate;
  const nCanaux = buffer.numberOfChannels;
  const nSorties = Math.max(1, Math.round(options.dureeSec * sr));

  // La source est bouclée : ralentie mille fois, elle ne fournirait sinon qu'une
  // fraction de milliseconde de matériau étirée sur toute la durée.
  const src = boucleSansCouture(buffer, options.fonduBoucleSec ?? 0.02);
  const canaux: Float32Array[] = [];
  for (let c = 0; c < nCanaux; c++) canaux.push(src.getChannelData(c));

  const out = new AudioBuffer({ numberOfChannels: nCanaux, length: nSorties, sampleRate: sr });
  const sorties: Float32Array[] = [];
  for (let c = 0; c < nCanaux; c++) sorties.push(out.getChannelData(c));

  // La position est INTÉGRÉE échantillon par échantillon. La déduire de `t`
  // supposerait une vitesse constante depuis le début, et ferait sauter la
  // lecture à chaque changement — ce qui, sur un balayage de dix octaves,
  // reviendrait à ne rien lire de cohérent.
  let pos = 0;
  for (let n = 0; n < nSorties; n++) {
    const vitesse = vitesseContinuum(n / sr, options);
    for (let c = 0; c < nCanaux; c++) sorties[c][n] = lire(canaux[c], pos);
    pos += vitesse;
    if (pos >= src.length) pos -= src.length;
  }
  return out;
}
