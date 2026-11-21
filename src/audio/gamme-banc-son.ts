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
 */
export function hauteursParFenetres(buf: AudioBuffer, fenetres: readonly [number, number][]): HauteurRendue[] {
  const cadence = 100;
  const suivi = suivreHauteur(mono(buf), buf.sampleRate, { cadence, centsParPas: 5, fMin: 60, fMax: 2000 });
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
