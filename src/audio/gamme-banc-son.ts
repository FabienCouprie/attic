// audio/gamme-banc-son.ts — Les hauteurs qu'on entend dans un son, pour les nœuds qui ne rendent que lui.
//
// DEUX INSTRUMENTS, selon ce que le son porte. Une voix seule se suit au pYIN (`suivreHauteur`), et
// chaque fenêtre en rend la hauteur médiane des trames voisées. Une gamme tenue, toutes ses notes
// ensemble, se lit dans les pics de son spectre : le suivi d'une seule hauteur n'y voit rien.
//
// LA PRÉCISION N'EST PLUS CELLE D'UN FICHIER. Une hauteur écrite se juge au cent près ; une hauteur
// mesurée porte l'erreur de son instrument, quelques cents. L'appelant passe donc une tolérance au
// relevé, et le relevé la dit.

import { fft } from "./fft";
import { suivreHauteur } from "./hauteur";
import type { HauteurRendue } from "./gamme-banc-hauteurs";

const versMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

/** Le son en mono, la moyenne de ses canaux. */
function mono(buf: AudioBuffer): Float32Array {
  const x = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < x.length; i++) x[i] += d[i] / buf.numberOfChannels;
  }
  return x;
}

const mediane = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/**
 * La hauteur médiane d'une voix seule dans chaque fenêtre, au pYIN, au pas de cinq cents.
 *
 * SEUL LE CŒUR DE LA FENÊTRE COMPTE, ses soixante pour cent du milieu : l'attaque et la sortie d'une
 * note y glissent d'une hauteur à l'autre. Une fenêtre sans trame voisée ne rend rien.
 *
 * LA BANDE CHERCHÉE SE BORNE QUAND ON CONNAÎT L'ENTRÉE : le coût du suivi croît avec la plus grave des
 * hauteurs cherchées, et de 60 à 2000 Hz un garde de vingt-cinq gammes prenait 75 s.
 */
export function hauteursParFenetres(
  buf: AudioBuffer, fenetres: readonly [number, number][], bande: { fMin?: number; fMax?: number } = {},
): HauteurRendue[] {
  const cadence = 100;
  const suivi = suivreHauteur(mono(buf), buf.sampleRate, { cadence, centsParPas: 5, fMin: bande.fMin ?? 60, fMax: bande.fMax ?? 2000 });
  const rendues: HauteurRendue[] = [];
  for (const [a, b] of fenetres) {
    const marge = (b - a) * 0.2;
    const debut = Math.floor((a + marge) * cadence), fin = Math.ceil((b - marge) * cadence);
    const voisees: number[] = [];
    for (let t = debut; t < Math.min(fin, suivi.hauteurs.length); t++) {
      if (suivi.confiances[t] > 0.5 && suivi.hauteurs[t] > 0) voisees.push(versMidi(suivi.hauteurs[t]));
    }
    if (voisees.length) rendues.push({ note: mediane(voisees), debut: a, fin: b });
  }
  return rendues;
}

/** Trames de l'explication des partiels : 4 096 points, un pas de moitié, deux fois plus de points à la FFT. */
const TRAME = 4096;
/** Les harmoniques cherchés pour chaque note : au-delà, leur peigne couvre l'axe et explique tout. */
const HARMONIQUES = 12;

/**
 * La part de l'énergie des partiels d'un son qu'expliquent les harmoniques des notes qui sonnent.
 *
 * LE TIMBRE NE LA TROMPE PAS, contrairement à un chroma : la FM d'origine du rendu des séquences, au
 * rapport 2 et à l'indice 3, met près de neuf dixièmes de son énergie sur l'harmonique 5, la tierce
 * majeure deux octaves plus haut, et moins d'un centième sur la fondamentale (J2 + J3 contre J0 + J1,
 * en fonctions de Bessel de 3) : son chroma dit la tierce là où le MIDI dit la tonique. Un harmonique
 * reste un multiple entier de la fondamentale, quel que soit son poids.
 *
 * Sur chaque trame, les pics du spectre au-dessus d'un vingtième du plus fort, lus une fois par
 * `picsParTrames` ; un pic est expliqué quand il tombe à moins de 6 Hz ou de 15 cents d'un
 * harmonique, jusqu'au douzième, d'une note dont la durée touche la trame. Une trame sans note ne
 * compte pas : une queue de relâchement n'y a rien à expliquer.
 *
 * DEUX DÉPLACEMENTS DU MIDI, pour juger ce qu'on mesure. `demiTons` décale ses notes en hauteur : c'est
 * le témoin, la part qu'un son qui ne jouerait pas son MIDI atteindrait par le seul hasard des
 * coïncidences. `retard` les décale dans le temps : un son qui joue son MIDI trop tard s'explique
 * mieux sous un MIDI retardé d'autant.
 */
export function partExpliquee(
  trames: readonly TrameDePics[], notes: readonly HauteurRendue[], { demiTons = 0, retard = 0 } = {},
): number {
  const freqs = notes.map((n) => ({ f: 440 * 2 ** ((n.note + demiTons - 69) / 12), debut: n.debut + retard, fin: n.fin + retard }));
  let explique = 0, total = 0;
  for (const { t0, t1, pics } of trames) {
    const sonnent = freqs.filter((n) => n.debut < t1 && n.fin > t0);
    if (!sonnent.length) continue;
    for (const { f, energie } of pics) {
      total += energie;
      const tombe = sonnent.some((n) => {
        const h = Math.round(f / n.f);
        return h >= 1 && h <= HARMONIQUES && Math.abs(f - h * n.f) < Math.max(6, h * n.f * (2 ** (15 / 1200) - 1));
      });
      if (tombe) explique += energie;
    }
  }
  return total > 0 ? explique / total : NaN;
}

/** Une trame du son : son début, sa fin, et ses pics, en hertz et en énergie. */
export interface TrameDePics { t0: number; t1: number; pics: { f: number; energie: number }[] }

/** Les pics de chaque trame d'un son, au-dessus d'un vingtième du plus fort, interpolés au logarithme. */
export function picsParTrames(buf: AudioBuffer): TrameDePics[] {
  const x = mono(buf), sr = buf.sampleRate, taille = 2 * TRAME, hz = sr / taille;
  const fenetre = Float64Array.from({ length: TRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (TRAME - 1)));
  const trames: TrameDePics[] = [];
  for (let i0 = 0; i0 + TRAME <= x.length; i0 += TRAME / 2) {
    const re = new Float64Array(taille), im = new Float64Array(taille);
    for (let i = 0; i < TRAME; i++) re[i] = x[i0 + i] * fenetre[i];
    fft(re, im, false);
    const mod = new Float64Array(taille / 2);
    let max = 0;
    for (let k = 0; k < mod.length; k++) { mod[k] = Math.hypot(re[k], im[k]); max = Math.max(max, mod[k]); }
    const pics: TrameDePics["pics"] = [];
    for (let k = 2; max > 0 && k < mod.length - 1; k++) {
      const f = k * hz;
      if (f < 40 || f > 8000 || mod[k] < max / 20 || mod[k] < mod[k - 1] || mod[k] < mod[k + 1]) continue;
      const [g, c, d] = [Math.log(mod[k - 1] + 1e-12), Math.log(mod[k]), Math.log(mod[k + 1] + 1e-12)];
      const ecart = (0.5 * (g - d)) / (g - 2 * c + d);
      pics.push({ f: (k + (Number.isFinite(ecart) ? ecart : 0)) * hz, energie: mod[k] ** 2 });
    }
    trames.push({ t0: i0 / sr, t1: (i0 + TRAME) / sr, pics });
  }
  return trames;
}

/** Les retards cherchés entre le son et son MIDI, de une demi-seconde d'avance à une seconde et demie de retard. */
const RETARDS = Array.from({ length: 41 }, (_, i) => Math.round((i * 0.05 - 0.5) * 100) / 100);

/**
 * Le retard du son sur son MIDI, quand il y en a un : celui sous lequel le MIDI explique le mieux le
 * son, s'il en explique cinq points de plus qu'à l'heure et s'il dépasse un dixième de seconde. En
 * deçà, c'est le relâchement d'une note qui sonne encore après sa fin, et que tout retard explique un
 * peu.
 */
export function retardDuSon(trames: readonly TrameDePics[], notes: readonly HauteurRendue[]): { retard: number; part: number } | null {
  const aLHeure = partExpliquee(trames, notes);
  let meilleur = { retard: 0, part: aLHeure };
  for (const retard of RETARDS) {
    const part = partExpliquee(trames, notes, { retard });
    if (part > meilleur.part) meilleur = { retard, part };
  }
  return Math.abs(meilleur.retard) >= 0.1 && meilleur.part - aLHeure >= 0.05 ? meilleur : null;
}

/**
 * Les hauteurs d'une gamme tenue entre `a` et `b`, lues dans les pics du spectre.
 *
 * Fenêtre de Hann, zéro ajouté jusqu'à quatre fois la longueur, puis interpolation parabolique du
 * logarithme du module autour de chaque maximum local : l'erreur tombe sous le cent pour une seconde
 * de son. Un pic sous `seuil` fois le plus fort est du bruit de fenêtre ; deux pics à moins de
 * quarante cents sont la même note, le plus fort reste.
 */
export function picsDuSpectre(buf: AudioBuffer, a: number, b: number, seuil = 0.1): HauteurRendue[] {
  const x = mono(buf);
  const i0 = Math.max(0, Math.floor(a * buf.sampleRate)), i1 = Math.min(x.length, Math.floor(b * buf.sampleRate));
  const n = i1 - i0;
  if (n < 1024) return [];
  let taille = 1;
  while (taille < 4 * n) taille <<= 1;
  const re = new Float64Array(taille), im = new Float64Array(taille);
  for (let i = 0; i < n; i++) re[i] = x[i0 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im, false);
  const moitie = taille / 2;
  const mod = new Float64Array(moitie);
  let max = 0;
  for (let k = 0; k < moitie; k++) { mod[k] = Math.hypot(re[k], im[k]); max = Math.max(max, mod[k]); }
  const hz = buf.sampleRate / taille;
  const pics: { note: number; force: number }[] = [];
  for (let k = 2; k < moitie - 1; k++) {
    const f = k * hz;
    if (f < 50 || f > 4000 || mod[k] < seuil * max || mod[k] < mod[k - 1] || mod[k] < mod[k + 1]) continue;
    const [g, c, d] = [Math.log(mod[k - 1] + 1e-12), Math.log(mod[k]), Math.log(mod[k + 1] + 1e-12)];
    const decalage = (0.5 * (g - d)) / (g - 2 * c + d);
    pics.push({ note: versMidi((k + (Number.isFinite(decalage) ? decalage : 0)) * hz), force: mod[k] });
  }
  pics.sort((p, q) => q.force - p.force);
  const gardes: { note: number; force: number }[] = [];
  for (const p of pics) if (!gardes.some((q) => Math.abs(q.note - p.note) < 0.4)) gardes.push(p);
  return gardes.sort((p, q) => p.note - q.note).map((p) => ({ note: p.note, debut: a, fin: b }));
}
