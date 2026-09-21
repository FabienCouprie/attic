// audio/spectral-cdp.ts — Cinq opérations sur le spectre, dans la représentation du Composers'
// Desktop Project : pour chaque case, une amplitude et une fréquence.
//
// D'après Trevor Wishart, « Audible Design », 1994, et les programmes du Composers' Desktop Project
// qui en sont la pratique : `stretch spectrum`, `spec arpeg`, `blur shuffle`, `spec pick`,
// `combine`. Le vocodeur de phase suit Mark Dolson, « The Phase Vocoder: A Tutorial », Computer
// Music Journal 10(4), 1986.
//
// POURQUOI AMPLITUDE ET FRÉQUENCE, ET NON LA TRANSFORMÉE ELLE-MÊME. Les cinq opérations DÉPLACENT
// de l'énergie : le long des fréquences (l'étirement porte un partiel de 400 à 566 Hz), ou dans le
// temps (le mélange échange des fenêtres). Une trame de Fourier déplacée telle quelle garde des
// phases qui ne vont plus avec sa nouvelle place, et le recollement claque. Le CDP ne travaille donc
// jamais sur la transformée : il la convertit en amplitude et FRÉQUENCE INSTANTANÉE par case, opère
// là, et resynthétise en accumulant la phase de chaque case à partir de sa fréquence. Une case
// déplacée ou réordonnée reçoit ainsi des phases qui lui conviennent, par construction.

import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

export const TAILLE = 2048;
export const SAUT = TAILLE / 4;

/** Une trame d'analyse : pour chaque case jusqu'à Nyquist, son amplitude et sa fréquence en hertz. */
export interface TramePV { amp: Float64Array; freq: Float64Array }
/** Une analyse complète : les trames, et de quoi resynthétiser à l'identique. */
export interface AnalysePV { trames: TramePV[]; phasesInitiales: Float64Array; sr: number; longueur: number }

const DEUX_PI = 2 * Math.PI;
const envelopper = (p: number) => p - DEUX_PI * Math.round(p / DEUX_PI);

/** Analyse : amplitude et fréquence instantanée de chaque case, trame par trame. */
export function analyserPV(x: Float32Array, sr: number): AnalysePV {
  const fen = creerFenetreHann(TAILLE);
  const nb = TAILLE / 2 + 1;
  const trames: TramePV[] = [];
  let phasePrec = new Float64Array(nb);
  let phasesInitiales = new Float64Array(nb);
  const re = new Float64Array(TAILLE), im = new Float64Array(TAILLE);
  // Le signal est prolongé de silence des deux côtés : la première et la dernière fenêtre couvrent
  // ainsi tout le son, attaque comprise.
  for (let debut = -TAILLE + SAUT, t = 0; debut < x.length; debut += SAUT, t++) {
    for (let i = 0; i < TAILLE; i++) {
      const j = debut + i;
      re[i] = (j >= 0 && j < x.length ? x[j] : 0) * fen[i];
      im[i] = 0;
    }
    fft(re, im, false);
    const amp = new Float64Array(nb), freq = new Float64Array(nb), phase = new Float64Array(nb);
    for (let k = 0; k < nb; k++) {
      amp[k] = Math.hypot(re[k], im[k]);
      phase[k] = Math.atan2(im[k], re[k]);
      const attendu = (DEUX_PI * k * SAUT) / TAILLE;
      const ecart = envelopper(phase[k] - phasePrec[k] - attendu);
      freq[k] = ((k + (ecart * TAILLE) / (DEUX_PI * SAUT)) * sr) / TAILLE;
    }
    if (t === 0) phasesInitiales = Float64Array.from(phase);
    phasePrec = phase;
    trames.push({ amp, freq });
  }
  return { trames, phasesInitiales, sr, longueur: x.length };
}

/**
 * Resynthèse : chaque case avance sa phase selon sa fréquence, et les trames se recollent.
 * La normalisation par la somme des fenêtres au carré rend l'opération exacte quel que soit le saut.
 */
export function synthetiserPV(a: AnalysePV, trames: TramePV[] = a.trames, longueur = a.longueur): Float32Array {
  const fen = creerFenetreHann(TAILLE);
  const nb = TAILLE / 2 + 1;
  const phase = Float64Array.from(a.phasesInitiales);
  const sortie = new Float64Array(longueur), poids = new Float64Array(longueur);
  const re = new Float64Array(TAILLE), im = new Float64Array(TAILLE);
  trames.forEach((tr, t) => {
    if (t > 0) for (let k = 0; k < nb; k++) phase[k] = envelopper(phase[k] + (DEUX_PI * tr.freq[k] * SAUT) / a.sr);
    re.fill(0); im.fill(0);
    for (let k = 0; k < nb; k++) {
      re[k] = tr.amp[k] * Math.cos(phase[k]);
      im[k] = tr.amp[k] * Math.sin(phase[k]);
      if (k > 0 && k < TAILLE / 2) { re[TAILLE - k] = re[k]; im[TAILLE - k] = -im[k]; }
    }
    fft(re, im, true);
    const debut = -TAILLE + SAUT + t * SAUT;
    for (let i = 0; i < TAILLE; i++) {
      const j = debut + i;
      if (j < 0 || j >= longueur) continue;
      sortie[j] += re[i] * fen[i];
      poids[j] += fen[i] * fen[i];
    }
  });
  return Float32Array.from(sortie, (v, i) => (poids[i] > 1e-9 ? v / poids[i] : 0));
}

const crete = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const x = b.getChannelData(c); for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); }
  return m;
};

/**
 * Applique une opération canal par canal et rend un tampon de même forme.
 *
 * LA CRÊTE NE DÉPASSE JAMAIS CELLE DE L'ENTRÉE. Réordonner ou cribler un spectre change le facteur
 * de crête : mesuré sur un bruit, le mélange des fenêtres abaisse le niveau efficace de 0,207 à
 * 0,141 mais double la crête, de 0,36 à 0,68 — un bruit qui culminait à 0,72 sortait écrêté. Si la
 * crête de sortie dépasse celle d'entrée, tout le son est abaissé d'autant ; sinon rien n'est touché.
 */
export function parCanal(b: AudioBuffer, op: (a: AnalysePV, canal: number) => TramePV[], longueur = b.length): AudioBuffer {
  const sortie = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: longueur, sampleRate: b.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) {
    const a = analyserPV(b.getChannelData(c), b.sampleRate);
    sortie.copyToChannel(new Float32Array(synthetiserPV(a, op(a, c), longueur)), c);
  }
  const entree = crete(b), sortieCrete = crete(sortie);
  if (sortieCrete > entree && sortieCrete > 0) {
    const k = entree / sortieCrete;
    for (let c = 0; c < sortie.numberOfChannels; c++) {
      const y = sortie.getChannelData(c);
      for (let i = 0; i < y.length; i++) y[i] *= k;
    }
  }
  return sortie;
}

// ── 1. Étirement du spectre ──────────────────────────────────────────────────────────────────

/**
 * Au-dessus du pivot, chaque fréquence f devient pivot · (f / pivot)^k. À k = 1, rien ne bouge ; au-
 * dessus de 1, les partiels s'écartent de plus en plus en montant ; au-dessous, ils se resserrent.
 * Un son harmonique cesse de l'être, sans que sa fondamentale — prise pour pivot — ne bouge.
 *
 * `facteurs` donne k trame par trame : c'est ce qui rend un son PROGRESSIVEMENT inharmonique.
 */
export function etirerSpectre(a: AnalysePV, pivot: number, facteurs: (t: number) => number): TramePV[] {
  const nb = TAILLE / 2 + 1, nyq = a.sr / 2;
  return a.trames.map((tr, t) => {
    const k = facteurs(t);
    const amp = new Float64Array(nb), freq = new Float64Array(nb);
    for (let i = 0; i < nb; i++) {
      if (tr.amp[i] < 1e-12) continue;
      const f = tr.freq[i];
      const g = f > pivot && pivot > 0 ? pivot * Math.pow(f / pivot, k) : f;
      if (g <= 0 || g >= nyq) continue;
      const j = Math.round((g * TAILLE) / a.sr);
      if (j >= nb) continue;
      // Deux cases qui tombent au même endroit s'additionnent ; la plus forte donne la fréquence.
      if (tr.amp[i] > amp[j]) freq[j] = g;
      amp[j] += tr.amp[i];
    }
    return { amp, freq };
  });
}

// ── 2. Arpègement du spectre ─────────────────────────────────────────────────────────────────

export interface OptionsArpege {
  /** Balayages par seconde. */
  vitesse: number;
  /** Largeur de la bande qui laisse passer, en octaves. */
  largeur: number;
  bas: number; haut: number;
  sens: "montant" | "descendant" | "aller-retour";
  /** Temps de décroissance de 60 dB d'une case après le passage de la bande, en secondes ; 0 : aucune. */
  remanence: number;
}

/**
 * Une bande étroite parcourt le spectre de bas en haut, ou l'inverse, et seuls les partiels qu'elle
 * touche sonnent : un accord tenu s'égrène partiel par partiel. La rémanence laisse sonner un partiel
 * après le passage de la bande, qui décroît alors de 60 dB dans le temps donné.
 */
export function arpegerSpectre(a: AnalysePV, o: OptionsArpege): TramePV[] {
  const nb = TAILLE / 2 + 1;
  const lb = Math.log2(Math.max(20, o.bas)), lh = Math.log2(Math.max(o.bas + 1, o.haut));
  const demi = Math.max(0.02, o.largeur) / 2;
  const dt = SAUT / a.sr;
  const decroit = o.remanence > 0 ? Math.pow(10, (-3 * dt) / o.remanence) : 0;
  const tenu = new Float64Array(nb);
  return a.trames.map((tr, t) => {
    const cycle = (t * dt * o.vitesse) % 1;
    const pos = o.sens === "descendant" ? 1 - cycle : o.sens === "aller-retour" ? 1 - Math.abs(2 * cycle - 1) : cycle;
    const centre = lb + pos * (lh - lb);
    const amp = new Float64Array(nb);
    for (let i = 1; i < nb; i++) {
      const d = Math.abs(Math.log2(Math.max(1, tr.freq[i] > 0 ? tr.freq[i] : (i * a.sr) / TAILLE)) - centre);
      const g = d < demi ? 0.5 + 0.5 * Math.cos((Math.PI * d) / demi) : 0;
      tenu[i] = Math.max(g, tenu[i] * decroit);
      amp[i] = tr.amp[i] * tenu[i];
    }
    return { amp, freq: tr.freq };
  });
}

// ── 3. Mélange des fenêtres ──────────────────────────────────────────────────────────────────

/**
 * Découpe le son en blocs de quelques fenêtres et les déplace dans le temps, chacun d'au plus
 * `portee` blocs : à portée nulle, rien ne bouge ; grande, le son devient un nuage de ses propres
 * instants. Parce que chaque case retrouve des phases à sa fréquence, les blocs se raccordent sans
 * clic. À graine égale, le même mélange.
 */
export function melangerFenetres(a: AnalysePV, tailleBloc: number, portee: number, hasard: () => number): TramePV[] {
  const n = Math.max(1, Math.round(tailleBloc));
  const blocs: TramePV[][] = [];
  for (let i = 0; i < a.trames.length; i += n) blocs.push(a.trames.slice(i, i + n));
  // Un déplacement borné : chaque bloc reçoit une clé « rang + hasard × portée », et l'on trie.
  const cles = blocs.map((_, i) => ({ i, cle: i + hasard() * Math.max(0, portee) }));
  cles.sort((u, v) => u.cle - v.cle || u.i - v.i);
  return cles.flatMap(({ i }) => blocs[i]);
}

// ── 4. Crible harmonique ─────────────────────────────────────────────────────────────────────

export type Rangs = "tous" | "impairs" | "pairs" | "premiers" | number[];

const estPremier = (n: number) => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };

/** Les rangs d'harmoniques retenus par le crible, jusqu'à `max`. */
export function rangsRetenus(r: Rangs, max: number): Set<number> {
  const s = new Set<number>();
  for (let k = 1; k <= max; k++) {
    if (Array.isArray(r) ? r.includes(k) : r === "tous" || (r === "impairs" && k % 2 === 1) || (r === "pairs" && k % 2 === 0) || (r === "premiers" && (k === 1 || estPremier(k)))) s.add(k);
  }
  return s;
}

/**
 * Ne laisse passer que les composantes proches d'harmoniques retenues d'une fondamentale — ou,
 * inversé, les retire. Sur un bruit, on entend l'accord que le crible y découpe ; sur un son
 * harmonique, on en retire les pairs, les impairs, ou tout sauf les rangs premiers.
 *
 * `fondamentales` donne la fondamentale trame par trame, pour un crible qui glisse.
 */
export function cribler(a: AnalysePV, fondamentales: (t: number) => number, rangs: Rangs, toleranceCents: number, inverse: boolean): TramePV[] {
  const nb = TAILLE / 2 + 1, nyq = a.sr / 2;
  const tol = Math.max(1, toleranceCents);
  return a.trames.map((tr, t) => {
    const f0 = Math.max(10, fondamentales(t));
    const retenus = rangsRetenus(rangs, Math.floor(nyq / f0));
    const amp = new Float64Array(nb);
    for (let i = 1; i < nb; i++) {
      const f = tr.freq[i] > 0 ? tr.freq[i] : (i * a.sr) / TAILLE;
      const rang = Math.max(1, Math.round(f / f0));
      const cents = Math.abs(1200 * Math.log2(f / (rang * f0)));
      // Un bord adouci sur la tolérance : une case à la limite passe à moitié, et le crible ne siffle pas.
      const dedans = retenus.has(rang) ? Math.max(0, Math.min(1, (tol - cents) / (tol * 0.5) + 0.5)) : 0;
      amp[i] = tr.amp[i] * (inverse ? 1 - dedans : dedans);
    }
    return { amp, freq: tr.freq };
  });
}

// ── 5. Filtrage d'un spectre par un autre ────────────────────────────────────────────────────

/**
 * Le spectre du premier son, filtré trame par trame par celui du second : chaque case du premier est
 * multipliée par l'amplitude relative de la même case du second. Les partiels du second découpent
 * le premier ; lissé, le second n'impose plus que son enveloppe — sa couleur, ses formants.
 *
 * `profondeur` va de 0 (le premier son intact) à 1 (le filtrage entier). Le second son est lu en
 * boucle s'il est plus court.
 */
export function filtrerParSpectre(a: AnalysePV, b: AnalysePV, profondeur: number, lissageCases: number): TramePV[] {
  const nb = TAILLE / 2 + 1;
  const p = Math.max(0, Math.min(1, profondeur));
  const L = Math.max(0, Math.round(lissageCases));
  return a.trames.map((tr, t) => {
    const src = b.trames[t % Math.max(1, b.trames.length)].amp;
    let filtre = src;
    if (L > 0) {
      // Une moyenne sur ±L cases : l'enveloppe du second son, sans ses partiels.
      filtre = new Float64Array(nb);
      for (let i = 0; i < nb; i++) {
        let s = 0;
        const de = Math.max(0, i - L), a2 = Math.min(nb - 1, i + L);
        for (let j = de; j <= a2; j++) s += src[j];
        filtre[i] = s / (a2 - de + 1);
      }
    }
    let max = 0;
    for (let i = 0; i < nb; i++) max = Math.max(max, filtre[i]);
    const amp = new Float64Array(nb);
    for (let i = 0; i < nb; i++) {
      const g = max > 0 ? filtre[i] / max : 0;
      amp[i] = tr.amp[i] * (1 - p + p * g);
    }
    return { amp, freq: tr.freq };
  });
}
