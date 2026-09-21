// audio/lfo.ts — Un oscillateur basse fréquence dont la fréquence peut bouger.
//
// POURQUOI UN ACCUMULATEUR, ET NON `2π · f · t`. Tant que f est constante, la phase vaut
// 2π · f · t et l'on peut la calculer directement à chaque échantillon. Dès que f varie, cette
// formule ment : la fréquence réellement entendue est la dérivée de la phase, soit f(t) + f′(t) · t,
// et le second terme grandit avec le temps. Un balayage lent de 2 à 8 Hz, trente secondes après le
// début, produirait des pointes absurdes — de plus en plus fortes à mesure que la pièce avance.
// La phase doit donc être INTÉGRÉE : chaque échantillon avance d'un pas f[i] / sr.
//
// Elle est tenue en cycles, et ramenée dans [0, 1) à chaque pas : une phase en radians qui grossit
// pendant une heure perdrait sa précision, et le LFO se mettrait à trembler.
//
// Ce chemin ne sert QUE lorsqu'une courbe pilote la fréquence. Sans courbe, les nœuds gardent leur
// calcul direct : les deux donnent le même son à l'oreille, mais pas les mêmes bits, et un effet qui
// tourne déjà dans les graphes de quelqu'un ne doit pas changer d'un bit.

import { estCourbe, progressionPour, valeursParametre } from "./courbe";

/** Les bornes d'une fréquence modulée : ce que valent le zéro et le un de la courbe, en hertz. */
export interface BornesFrequence { min: number; max: number }

/**
 * La fréquence du LFO échantillon par échantillon, si une courbe la pilote ; null sinon — et
 * l'appelant garde alors son calcul direct. La course se parcourt en multipliant, comme toute
 * fréquence (`progressionPour`).
 */
export function frequencesModulees(
  courbe: unknown, n: number, defaut: number, bornes: BornesFrequence,
): Float32Array | null {
  if (!estCourbe(courbe)) return null;
  return valeursParametre(courbe, n, defaut, { min: bornes.min, max: bornes.max, ...progressionPour({ unite: "Hz" }) });
}

/**
 * La position dans le cycle, échantillon par échantillon, dans [0, 1). Le premier échantillon est à
 * zéro, comme `2π · f · 0` dans le calcul direct.
 */
export function cyclesAccumules(frequences: Float32Array, sr: number): Float64Array {
  const u = new Float64Array(frequences.length);
  let phase = 0;
  for (let i = 0; i < frequences.length; i++) {
    u[i] = phase;
    phase += frequences[i] / sr;
    phase -= Math.floor(phase);
  }
  return u;
}

/**
 * La valeur du LFO, dans [−1, 1], pour une position u en cycles. Les formules sont celles du
 * trémolo, où `freq * t` est remplacé par u : même forme d'onde, même point de départ.
 */
export function formeLfo(forme: string, u: number): number {
  if (forme === "Carré" || forme === "Square") return Math.sin(2 * Math.PI * u) >= 0 ? 1 : -1;
  if (forme === "Triangle") return 2 * Math.abs(2 * (u - Math.floor(u + 0.5))) - 1;
  if (forme === "Sawtooth") return 2 * (u - Math.floor(u)) - 1;
  return Math.sin(2 * Math.PI * u);
}
