// audio/miroir.ts — Le miroir de l'inversion : les graves deviennent aigus.
//
// LA PROPRIÉTÉ. L'inversion géométrique par rapport à un cercle échange
// l'intérieur et l'extérieur : un point à distance r du centre va à R²/r. Le
// cercle lui-même ne bouge pas, et appliquée deux fois, l'inversion rend chaque
// point à sa place — c'est une involution.
//
// EN AUDIO. Le cercle est une fréquence pivot f₀ ; une composante à f va à
// f₀²/f. Sur une échelle logarithmique, c'est un miroir exact autour du pivot :
// une octave au-dessus devient une octave au-dessous. Avec f₀ = 632 Hz, moyenne
// géométrique de 20 Hz et 20 kHz, la bande audible est renvoyée sur elle-même :
// 20 Hz ↔ 20 kHz, 100 Hz ↔ 4 kHz, 440 Hz ↔ 908 Hz.
//
// LA MÉTHODE. Un vocodeur de phase. Pour chaque case de fréquence, on mesure la
// fréquence INSTANTANÉE de ce qui s'y trouve (par l'avance de phase d'une trame à
// l'autre), plutôt que la fréquence du centre de la case. Mesuré en retirant
// cette estimation : 440 Hz ressortait à 24,8 Hz de sa cible de 908 Hz, et un
// partiel au pivot à 6 Hz du pivot — la grille des cases, espacées de 21,5 Hz,
// et étirée par le miroir. L'énergie est déposée à la fréquence renvoyée, et la phase de
// sortie avance à cette fréquence-là.
//
// CE QUI SE PERD, ET POURQUOI. Le miroir étire le grave et comprime l'aigu. Une
// composante sous f₀²/Nyquist est renvoyée au-delà de Nyquist et disparaît : à
// f₀ = 632 Hz et 44,1 kHz, tout ce qui est sous 18 Hz. À l'inverse, les
// nombreuses cases aiguës s'entassent dans peu de cases graves. Le message
// chiffre la part d'énergie perdue, et le niveau de sortie est ramené à celui de
// l'énergie conservée.
//
// PAS DE ROTATION CONTINUE. Contrairement à l'anneau de Möbius, il n'existe pas
// de chemin continu entre l'identité et ce miroir : faire glisser l'un vers
// l'autre écraserait tout le spectre sur le pivot à mi-chemin. D'où les
// « Tours », qui alternent miroir et original par fondu enchaîné — l'involution
// s'entend en passant de l'un à l'autre.

import { analyseSynthese } from "./stft";
import { enchainerAvecFondu, rms } from "./geometrie-sonore";

export const miroirFrequence = (f: number, pivot: number) => (pivot * pivot) / f;

const TAILLE = 2048;
const HOP = TAILLE / 4;

const princarg = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Un canal renvoyé dans le miroir. Rend aussi la part d'énergie perdue hors bande. */
export function miroirCanal(x: Float32Array, pivot: number, sampleRate: number): { y: Float32Array; perdue: number } {
  const moitie = TAILLE / 2;
  const phasePrec = new Float64Array(moitie);
  const phaseSortie = new Float64Array(moitie);
  const E = new Float64Array(moitie), F = new Float64Array(moitie);
  let energieTotale = 0, energiePerdue = 0;

  const [brut] = analyseSynthese(x, TAILLE, 1, (re, im, sRe, sIm) => {
    E.fill(0); F.fill(0);
    for (let k = 1; k < moitie; k++) {
      const mag2 = re[k] * re[k] + im[k] * im[k];
      const phase = Math.atan2(im[k], re[k]);
      const attendue = (2 * Math.PI * k * HOP) / TAILLE;
      const ecart = princarg(phase - phasePrec[k] - attendue);
      phasePrec[k] = phase;
      if (mag2 < 1e-20) continue;
      energieTotale += mag2;
      const fInst = ((k + (ecart * TAILLE) / (2 * Math.PI * HOP)) * sampleRate) / TAILLE;
      if (fInst <= 0) { energiePerdue += mag2; continue; }
      const fRenvoyee = miroirFrequence(fInst, pivot);
      const j = (fRenvoyee * TAILLE) / sampleRate;
      if (j < 1 || j >= moitie - 1) { energiePerdue += mag2; continue; }
      const j0 = Math.floor(j), fr = j - j0;
      E[j0] += mag2 * (1 - fr); F[j0] += mag2 * (1 - fr) * fRenvoyee;
      E[j0 + 1] += mag2 * fr; F[j0 + 1] += mag2 * fr * fRenvoyee;
    }
    for (let j = 1; j < moitie; j++) {
      if (E[j] <= 0) continue;
      const f = F[j] / E[j];
      phaseSortie[j] += (2 * Math.PI * f * HOP) / sampleRate;
      const a = Math.sqrt(E[j]);
      const c = a * Math.cos(phaseSortie[j]), s = a * Math.sin(phaseSortie[j]);
      sRe[0][j] = c; sIm[0][j] = s;
      sRe[0][TAILLE - j] = c; sIm[0][TAILLE - j] = -s; // conjugué : signal réel
    }
  });

  // Niveau ramené à celui de l'énergie conservée. L'amplitude du vocodeur n'est
  // pas celle de l'entrée — un partiel dont la cloche de Hann couvrait quatre
  // cases est ramassé en une ou deux — et cette normalisation, plutôt qu'un
  // facteur supposé, rend le niveau indépendant de la nature du son.
  const perdue = energieTotale > 0 ? energiePerdue / energieTotale : 0;
  const cible = rms(x) * Math.sqrt(1 - perdue);
  const actuel = rms(brut);
  if (actuel > 1e-12) for (let i = 0; i < brut.length; i++) brut[i] *= cible / actuel;
  return { y: brut, perdue };
}

export type OptionsMiroir = { pivotHz: number; tours: number; fonduSec: number };

export function miroirCanaux(entree: Float32Array[], sampleRate: number, o: OptionsMiroir) {
  const pivot = Math.max(20, Math.min(sampleRate / 4, o.pivotHz));
  const tours = Math.max(1, Math.round(o.tours));
  const fondu = Math.max(0, Math.min(Math.floor(entree[0].length / 4), Math.round(o.fonduSec * sampleRate)));
  let perdueMax = 0;
  const canaux = entree.map((c) => {
    const { y, perdue } = miroirCanal(c, pivot, sampleRate);
    perdueMax = Math.max(perdueMax, perdue);
    if (tours === 1) return y;
    // Tours pairs : miroir ; impairs : original. Deux passages rendent l'original.
    return enchainerAvecFondu(Array.from({ length: tours }, (_, k) => (k % 2 === 0 ? y : c)), fondu);
  });
  return { canaux, perdue: perdueMax, pivot, tours };
}
