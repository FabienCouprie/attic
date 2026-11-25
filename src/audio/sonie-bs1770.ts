// audio/sonie-bs1770.ts — La sonie intégrée de l'UIT-R BS.1770-4 et la plage de sonie de l'EBU
// Tech 3342, avec la pondération K exacte à toute fréquence d'échantillonnage.
//
// ═══ POURQUOI UN SECOND MODULE DE SONIE ═══
//
// `vumetre.ts` en porte un, et sa pondération K n'est pas celle de la norme. Relevé le 2026-11-25 sur
// un sinus stéréo d'amplitude 0,1, à 44,1 comme à 48 kHz : il lit 0,08 dB trop haut à 445 Hz, 0,35 dB
// à 1 kHz, puis 3,3 dB trop BAS à 3 kHz et 4,0 dB à 8 et 15 kHz. Son « étage en plateau » ne monte pas
// de quatre décibels dans l'aigu, il fait une bosse vers un kilohertz et retombe. Deux sons qui ne
// diffèrent que par leur brillance s'y écartent donc de plusieurs unités de sonie qu'aucune oreille ne
// confirme, et c'est précisément ce qu'un écart à une référence doit éviter. Le corriger là-bas
// changerait le son du normaliseur, du recalage et du vu-mètre : c'est une décision à part, et ce
// module ne la prend pas.
//
// ═══ CE QU'IL CALCULE ═══
//
// Les deux biquads de l'annexe 1, recalculés pour la fréquence du son à partir de leurs paramètres
// analogiques, sous la forme de libebur128 : un plateau de +4 dB centré sur 1 682 Hz, puis un passe-haut
// du second ordre à 38 Hz. À 48 kHz, ils redonnent les coefficients publiés dans la norme.
//
// La sonie intégrée moyenne les PUISSANCES de blocs de 400 ms au pas de 100 ms, puis les deux portes :
// −70 LUFS absolus, puis dix unités sous le niveau de ce qui reste. La plage de sonie prend des blocs de
// trois secondes au même pas, une porte absolue à −70 et une relative à vingt unités, puis l'écart entre
// le dixième et le quatre-vingt-quinzième centile, interpolés. Les canaux pèsent un chacun.

import { quantile } from "./ecart-reference-signal";

const DECALAGE = -0.691;
const PORTE_ABSOLUE = -70;

/** Un biquad en forme directe I, en double précision. */
function biquad(x: ArrayLike<number>, b: readonly number[], a1: number, a2: number): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const o = b[0] * v + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}

/** La pondération K de BS.1770-4, pour toute fréquence d'échantillonnage. */
export function ponderationK(x: ArrayLike<number>, fe: number): Float64Array {
  let K = Math.tan((Math.PI * 1681.974450955533) / fe);
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  let Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const plateau = biquad(x,
    [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  K = Math.tan((Math.PI * 38.13547087602444) / fe);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  return biquad(plateau, [1, -2, 1], (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
}

/** Le niveau d'un bloc, en LUFS, à partir de la somme pondérée des puissances de ses canaux. */
const niveau = (puissance: number): number => DECALAGE + 10 * Math.log10(Math.max(puissance, 1e-20));

const moyenne = (v: readonly number[]): number => v.reduce((s, x) => s + x, 0) / v.length;

export interface Sonie {
  /** La sonie intégrée, en LUFS ; −Infinity quand tout est sous la porte absolue. */
  integree: number;
  /** La plage de sonie, en LU ; NaN sous trois secondes de son. */
  plage: number;
}

/** La sonie intégrée et la plage de sonie d'un son, tous ses canaux comptés. */
export function sonieEtPlage(canaux: readonly ArrayLike<number>[], fe: number): Sonie {
  const n = canaux[0]?.length ?? 0;
  // Les sommes cumulées des carrés pondérés, canaux additionnés : un bloc se lit en deux soustractions.
  const cumul = new Float64Array(n + 1);
  for (const c of canaux) {
    const k = ponderationK(c, fe);
    let s = 0;
    for (let i = 0; i < n; i++) { s += k[i] * k[i]; cumul[i + 1] += s; }
  }
  const blocs = (longueur: number): number[] => {
    const pas = Math.round(0.1 * fe), out: number[] = [];
    for (let o = 0; o + longueur <= n; o += pas) out.push((cumul[o + longueur] - cumul[o]) / longueur);
    return out;
  };

  const momentanes = blocs(Math.round(0.4 * fe)).filter((p) => niveau(p) > PORTE_ABSOLUE);
  let integree = -Infinity;
  if (momentanes.length > 0) {
    const seuil = niveau(moyenne(momentanes)) - 10;
    const gardes = momentanes.filter((p) => niveau(p) > seuil);
    integree = niveau(moyenne(gardes));
  }

  const courts = blocs(3 * fe).filter((p) => niveau(p) > PORTE_ABSOLUE);
  let plage = NaN;
  if (courts.length > 0) {
    const seuil = niveau(moyenne(courts)) - 20;
    const retenus = courts.map(niveau).filter((v) => v > seuil);
    plage = quantile(retenus, 0.95) - quantile(retenus, 0.1);
  }
  return { integree, plage };
}
