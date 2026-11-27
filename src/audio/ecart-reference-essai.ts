// audio/ecart-reference-essai.ts — Les sons témoins de « Écart à une référence » : des sons dont la
// réponse est connue d'avance, axe par axe.
//
// DÉTERMINISTES, et tirés du générateur commun (`core/hasard.ts`) quand il faut du hasard : un témoin
// qui changerait d'un lancement à l'autre ne prouverait rien la seconde fois.
//
// ═══ LE MÊME SON À DEUX FRÉQUENCES D'ÉCHANTILLONNAGE ═══
//
// `memeSon` ne rééchantillonne pas : il CALCULE le son à chaque fréquence, comme une somme de partiels
// dont les fréquences, les phases et les enveloppes sont fixées en hertz et en secondes. Les deux
// suites d'échantillons sont donc deux lectures exactes du même signal continu, et ce qui les sépare
// au relevé est le plancher de la mesure elle-même. Un rééchantillonneur y ajouterait son propre
// écart, que la mesure n'a pas à porter : celui du dépôt interpole en cubique après son filtre, et
// cette interpolation atténue l'octave du haut.
//
// Les partiels sont espacés en progression géométrique de 20 Hz à 18 kHz, chacun décalé au hasard dans
// son pas, avec une amplitude en racine de leur largeur relative : le spectre est rose, et assez dense
// dans le grave pour que le tiers d'octave de 31,5 Hz en tienne une quarantaine.

import { creerAleatoire } from "../core/hasard";
import { bruitRoseKellet } from "../core/bruit-rose";

/** Un sinus de `amplitude` à `f` Hz pendant `duree` s. */
export function sinus(f: number, amplitude: number, duree: number, fe: number): Float32Array {
  const x = new Float32Array(Math.round(duree * fe));
  for (let i = 0; i < x.length; i++) x[i] = amplitude * Math.sin((2 * Math.PI * f * i) / fe);
  return x;
}

/** Des tirages gaussiens centrés réduits, par Box-Muller sur le générateur commun. */
export function gaussien(graine: number): () => number {
  const alea = creerAleatoire(graine);
  return () => Math.sqrt(-2 * Math.log(alea() + 1e-12)) * Math.cos(2 * Math.PI * alea());
}

/** Un bruit rose, par le filtre de Paul Kellet, dont les coefficients sont ceux de 44,1 kHz. */
export function bruitRose(duree: number, fe: number, graine: number): Float32Array {
  return bruitRoseKellet(Math.round(duree * fe), gaussien(graine), { gain: 0.02 });
}

/** Un bruit blanc gaussien d'écart type `amplitude`. */
export function bruitBlanc(duree: number, fe: number, amplitude: number, graine: number): Float32Array {
  const g = gaussien(graine), x = new Float32Array(Math.round(duree * fe));
  for (let i = 0; i < x.length; i++) x[i] = amplitude * g();
  return x;
}

/** Un accord tenu de notes MIDI, six harmoniques chacune, d'amplitude 0,03 / h et de phase h. */
export function accord(notes: readonly number[], duree: number, fe: number): Float32Array {
  const x = new Float32Array(Math.round(duree * fe));
  for (const m of notes) {
    const f = 440 * 2 ** ((m - 69) / 12);
    for (let h = 1; h <= 6; h++) {
      const w = (2 * Math.PI * f * h) / fe;
      for (let i = 0; i < x.length; i++) x[i] += (0.03 / h) * Math.sin(w * i + h);
    }
  }
  return x;
}

/** Des rafales de bruit amorties, une toutes les 0,5 s : 120 BPM et deux attaques par seconde. */
export function clics(duree: number, fe: number, graine: number): Float32Array {
  const g = gaussien(graine), x = new Float32Array(Math.round(duree * fe));
  for (let k = 0; k * 0.5 * fe < x.length; k++) {
    const o = Math.round(k * 0.5 * fe);
    for (let i = 0; i < 2000 && o + i < x.length; i++) x[o + i] = 0.5 * g() * Math.exp(-i / 300);
  }
  return x;
}

/** Le même son, calculé à la fréquence `fe` : voir l'en-tête. Deux canaux identiques. */
export function memeSon(fe: number, duree: number, graine: number, partiels = 1000): Float32Array[] {
  const alea = creerAleatoire(graine);
  const n = Math.round(duree * fe), bas = 20, rapport = 18000 / 20;
  // Quatre groupes de partiels, chacun sous une enveloppe lente qui lui est propre : le timbre bouge
  // d'une trame à l'autre, comme celui d'un morceau, et l'écart type des MFCC n'est pas nul.
  const groupes = [0.5, 1.3, 2.1, 3.7].map((vitesse) => ({ vitesse, phase: 2 * Math.PI * alea(), somme: new Float64Array(n) }));
  for (let p = 0; p < partiels; p++) {
    const f = bas * rapport ** ((p + alea()) / partiels);
    const largeur = bas * rapport ** ((p + 1) / partiels) - bas * rapport ** (p / partiels);
    const a = 0.05 * Math.sqrt(largeur / f);
    const phase = 2 * Math.PI * alea();
    const somme = groupes[p % 4].somme;
    // Le phaseur tourne d'un pas fixe : quatre multiplications par échantillon au lieu d'un sinus.
    const c = Math.cos((2 * Math.PI * f) / fe), s = Math.sin((2 * Math.PI * f) / fe);
    let re = Math.cos(phase), im = Math.sin(phase);
    for (let i = 0; i < n; i++) {
      somme[i] += a * im;
      const r = re * c - im * s;
      im = re * s + im * c;
      re = r;
    }
  }
  const x = new Float32Array(n);
  for (const g of groupes) {
    for (let i = 0; i < n; i++) x[i] += g.somme[i] * (0.6 + 0.4 * Math.sin((2 * Math.PI * g.vitesse * i) / fe + g.phase));
  }
  return [x, x];
}
