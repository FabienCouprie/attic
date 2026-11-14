// audio/repartiteur-bandes.ts — Un son coupé en bandes de fréquence, une voie par bande.
//
// ═══ CE QUE LE MODULE REND ═══
//
// Huit coupures découpent le spectre en neuf bandes, et chaque bande sort sur sa propre voie, de la
// longueur de l'entrée. Les coupures par défaut sont les moyennes géométriques des centres voisins de
// l'égaliseur à neuf bandes (32 Hz à 8 kHz, par octaves) : chacune de ces neuf fréquences tombe donc
// au milieu, en octaves, de la bande qui la porte. La première bande prend tout ce qui est sous la
// première coupure, la dernière tout ce qui est au-dessus de la huitième.
//
// ═══ DEUX MÉTHODES, UN MÊME GABARIT ═══
//
// Décision de Fabien, le 2026-11-14 : un Linkwitz-Riley d'ordre huit, ET un découpage par FFT à phase
// nulle, au choix. Les deux rendent LE MÊME MODULE pour chaque bande, et ne diffèrent que par la phase.
//
// - LINKWITZ-RILEY 8. Chaque coupure est un passe-bas et un passe-haut de Butterworth d'ordre quatre,
//   chacun appliqué deux fois : 48 dB par octave, et les deux côtés en phase à toutes les fréquences.
//   Leur somme est alors un passe-tout. Les bandes se tirent en cascade, la plus grave d'abord, et
//   chacune passe ensuite par les passe-tout des coupures au-dessus d'elle : sans cette compensation,
//   une bande grave et une bande aiguë n'auraient pas la même phase, et leur somme creuserait. Avec
//   elle, la somme des neuf est le produit des huit passe-tout : un module plat à toutes les
//   fréquences, une phase qui tourne. Le calcul est causal, comme un filtre analogique.
//
// - FFT À PHASE NULLE. Le module de chaque bande du Linkwitz-Riley numérique est connu en clair :
//   1 / (1 + x⁸) pour le passe-bas, x étant la fréquence déformée par la transformation bilinéaire,
//   tan(πf / fe) / tan(πfc / fe). Ce module, pris tel quel, devient le gain réel d'un filtre à
//   réponse finie centré sur zéro. Les neuf gabarits somment à un en chaque point par construction,
//   donc les neuf noyaux somment à une impulsion unité, et la somme des neuf sorties REDONNE
//   L'ENTRÉE, à l'arrondi près. Le prix est l'autre face de la phase nulle : la réponse d'une bande
//   s'étend avant l'instant qui l'excite, et une attaque dans une bande grave s'y annonce un peu avant
//   d'arriver.
//
// ═══ POURQUOI ICI ET NON PAR WEB AUDIO ═══
//
// Un biquad de Web Audio demande un `OfflineAudioContext`, qui n'existe ni dans un worker ni dans
// l'environnement de test. Écrit ici, le calcul se mesure hors du navigateur, et c'est la platitude de
// la somme qu'il faut tenir par un garde. Le même calcul sert dans le worker et dans le fil.

import { fft } from "./fft";

/** Neuf bandes, donc huit coupures. */
export const NOMBRE_BANDES = 9;

/** Les coupures par défaut, en hertz : √(32·64), √(64·125) … √(4000·8000), arrondies. */
export const COUPURES_DEFAUT = [45, 89, 177, 354, 707, 1414, 2828, 5657] as const;

export type MethodeRepartition = "linkwitz-riley" | "fft";

export interface OptionsRepartition {
  methode: MethodeRepartition;
  /** Les coupures, en hertz, dans n'importe quel ordre : elles sont rangées avant l'emploi. */
  coupures: readonly number[];
  /** La fréquence d'échantillonnage de la voie. */
  frequence: number;
}

export interface ResultatRepartition {
  /** Une voie par bande, de la plus grave à la plus aiguë, chacune de la longueur de l'entrée. */
  bandes: Float32Array[];
}

/** La coupure la plus basse acceptée, en hertz. */
const COUPURE_MIN = 10;
/** La coupure la plus haute, en part de la fréquence d'échantillonnage : sous Nyquist, avec une marge. */
const PART_NYQUIST = 0.45;

/**
 * Les coupures rangées par ordre croissant et ramenées entre 10 Hz et 45 % de la fréquence
 * d'échantillonnage. Deux coupures égales laissent entre elles une bande presque vide.
 */
export function coupuresUtiles(coupures: readonly number[], frequence: number): number[] {
  const haut = PART_NYQUIST * frequence;
  return coupures
    .map((c) => (Number.isFinite(c) ? Math.min(haut, Math.max(COUPURE_MIN, c)) : COUPURE_MIN))
    .sort((a, b) => a - b);
}

// ─── Linkwitz-Riley 8 ────────────────────────────────────────────────────────────────────────────

interface Section { b0: number; b1: number; b2: number; a1: number; a2: number }
type Genre = "bas" | "haut" | "tout";

/**
 * Les deux facteurs de qualité d'un Butterworth d'ordre quatre : 1 / (2 cos(π/8)) et 1 / (2 cos(3π/8)).
 * Un Linkwitz-Riley d'ordre huit est ce Butterworth appliqué deux fois.
 */
const Q_BUTTERWORTH_4 = [1 / (2 * Math.cos(Math.PI / 8)), 1 / (2 * Math.cos((3 * Math.PI) / 8))] as const;

/** Une section du biquad, coefficients de Robert Bristow-Johnson, normalisée à a0 = 1. */
function section(genre: Genre, fc: number, q: number, fe: number): Section {
  const w = (2 * Math.PI * fc) / fe;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  let b0: number, b1: number, b2: number;
  if (genre === "bas") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else if (genre === "haut") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  else { b0 = 1 - alpha; b1 = -2 * cos; b2 = 1 + alpha; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** Applique une section sur place. Les états restent en double précision. */
function filtrerSurPlace(x: Float32Array, s: Section): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = s.b0 * v + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2;
    x2 = x1; x1 = v;
    y2 = y1; y1 = y;
    x[i] = y;
  }
}

/** Un passe-bas ou un passe-haut de Linkwitz-Riley d'ordre huit : quatre sections. */
function linkwitzRiley8(x: Float32Array, genre: "bas" | "haut", fc: number, fe: number): void {
  for (let passe = 0; passe < 2; passe++) {
    for (const q of Q_BUTTERWORTH_4) filtrerSurPlace(x, section(genre, fc, q, fe));
  }
}

/**
 * Le passe-tout d'une coupure : la somme de son passe-bas et de son passe-haut, qui vaut exactement
 * le produit de deux passe-tout du second ordre aux mêmes facteurs de qualité. Deux sections au lieu
 * des huit que coûterait la somme.
 */
function passeTout(x: Float32Array, fc: number, fe: number): void {
  for (const q of Q_BUTTERWORTH_4) filtrerSurPlace(x, section("tout", fc, q, fe));
}

/** Les bandes par la cascade compensée, de la plus grave à la plus aiguë. */
export function repartirLinkwitzRiley(voie: Float32Array, coupures: readonly number[], fe: number): Float32Array[] {
  const fc = coupuresUtiles(coupures, fe);
  const reste = new Float32Array(voie);
  const bandes: Float32Array[] = [];
  for (let k = 0; k < fc.length; k++) {
    const bande = new Float32Array(reste);
    linkwitzRiley8(bande, "bas", fc[k], fe);
    for (let j = k + 1; j < fc.length; j++) passeTout(bande, fc[j], fe);
    bandes.push(bande);
    linkwitzRiley8(reste, "haut", fc[k], fe);
  }
  bandes.push(reste);
  return bandes;
}

// ─── FFT à phase nulle ───────────────────────────────────────────────────────────────────────────

/** Le module du passe-bas de Linkwitz-Riley 8 numérique à la fréquence f : 1 / (1 + x⁸). */
function moduleBas(f: number, fc: number, fe: number): number {
  const x = Math.tan((Math.PI * f) / fe) / Math.tan((Math.PI * fc) / fe);
  return 1 / (1 + x ** 8);
}

/**
 * Le module de chaque bande à la fréquence f, les coupures étant déjà rangées.
 *
 * Chaque bande est ce que les coupures du dessous laissent passer, multiplié par ce que sa propre
 * coupure garde. La somme se télescope, et vaut un en chaque point.
 */
function modulesRanges(f: number, fc: readonly number[], fe: number): number[] {
  const out: number[] = [];
  let reste = 1;
  for (const c of fc) {
    const s = f >= fe / 2 ? 0 : moduleBas(f, c, fe);
    out.push(reste * s);
    reste *= 1 - s;
  }
  out.push(reste);
  return out;
}

/** Le module de chaque bande à la fréquence f, de la plus grave à la plus aiguë. */
export function modulesA(f: number, coupures: readonly number[], fe: number): number[] {
  return modulesRanges(f, coupuresUtiles(coupures, fe), fe);
}

/** Les gabarits des bandes aux fréquences `m · fe / n`, pour m de 0 à n / 2. */
export function gabarits(coupures: readonly number[], fe: number, n: number): Float64Array[] {
  const fc = coupuresUtiles(coupures, fe);
  const bandes = Array.from({ length: fc.length + 1 }, () => new Float64Array(n / 2 + 1));
  for (let m = 0; m <= n / 2; m++) {
    modulesRanges((m * fe) / n, fc, fe).forEach((v, k) => { bandes[k][m] = v; });
  }
  return bandes;
}

/**
 * La longueur du noyau, en échantillons : une puissance de deux d'au moins vingt-quatre périodes de
 * la coupure la plus basse. La réponse d'un tel gabarit décroît d'un facteur e en 0,42 période de
 * sa coupure ; vingt-quatre périodes, douze de chaque côté de zéro, la laissent sous l'arrondi.
 */
export function longueurNoyau(coupureMin: number, fe: number): number {
  const voulue = Math.ceil((24 * fe) / coupureMin);
  let l = 1024;
  while (l < voulue && l < 1 << 17) l <<= 1;
  return l;
}

/**
 * Le spectre de chaque noyau, sur `2 · l` points : le gabarit ramené en réponse impulsionnelle
 * centrée sur zéro, bornée par une fenêtre de Tukey dont la moitié centrale est plate, puis
 * transformée à nouveau. Le noyau étant réel et pair, son spectre est réel.
 *
 * LA FENÊTRE NE CHANGE PAS LA SOMME : elle vaut un en zéro, et la somme des réponses non fenêtrées
 * est l'impulsion unité. La somme des noyaux fenêtrés l'est donc aussi.
 */
function spectresNoyaux(coupures: readonly number[], fe: number, l: number): Float64Array[] {
  const n = 2 * l;
  return gabarits(coupures, fe, l).map((g) => {
    const re = new Float64Array(l);
    const im = new Float64Array(l);
    for (let m = 0; m <= l / 2; m++) { re[m] = g[m]; if (m > 0 && m < l / 2) re[l - m] = g[m]; }
    fft(re, im, true);
    const noyau = new Float64Array(n);
    const nIm = new Float64Array(n);
    const quart = l / 4;
    for (let d = 0; d < l / 2; d++) {
      const fenetre = d <= quart ? 1 : 0.5 * (1 + Math.cos((Math.PI * (d - quart)) / quart));
      noyau[d] = re[d] * fenetre;
      if (d > 0) noyau[n - d] = re[l - d] * fenetre;
    }
    fft(noyau, nIm, false);
    return noyau;
  });
}

/**
 * Les bandes par convolution rapide, en recouvrement-addition.
 *
 * DEUX BANDES PAR TRANSFORMÉE INVERSE. Les spectres des noyaux sont réels et celui d'un bloc est
 * hermitien : chaque produit l'est aussi, et sa transformée inverse est réelle. Deux produits
 * rangés l'un en partie réelle et l'autre en partie imaginaire se défont donc d'une seule
 * transformée, ce qui en épargne quatre sur neuf.
 */
export function repartirFft(voie: Float32Array, coupures: readonly number[], fe: number): Float32Array[] {
  const fc = coupuresUtiles(coupures, fe);
  const l = longueurNoyau(fc[0] ?? COUPURE_MIN, fe);
  const n = 2 * l;
  const noyaux = spectresNoyaux(fc, fe, l);
  const bandes = noyaux.map(() => new Float32Array(voie.length));
  const xRe = new Float64Array(n);
  const xIm = new Float64Array(n);
  const zRe = new Float64Array(n);
  const zIm = new Float64Array(n);
  for (let debut = 0; debut < voie.length; debut += l) {
    xRe.fill(0); xIm.fill(0);
    const fin = Math.min(voie.length, debut + l);
    for (let i = debut; i < fin; i++) xRe[i - debut] = voie[i];
    fft(xRe, xIm, false);
    for (let b = 0; b < noyaux.length; b += 2) {
      const ka = noyaux[b];
      const kb = noyaux[b + 1];
      for (let m = 0; m < n; m++) {
        const vb = kb ? kb[m] : 0;
        zRe[m] = xRe[m] * ka[m] - xIm[m] * vb;
        zIm[m] = xIm[m] * ka[m] + xRe[m] * vb;
      }
      fft(zRe, zIm, true);
      // Les retards négatifs du noyau reviennent par la fin du tampon : r ≥ n − l/2 vaut r − n.
      for (let r = 0; r < n; r++) {
        const p = debut + (r < n - l / 2 ? r : r - n);
        if (p < 0 || p >= voie.length) continue;
        bandes[b][p] += zRe[r];
        if (kb) bandes[b + 1][p] += zIm[r];
      }
    }
  }
  return bandes;
}

// ─── L'entrée commune ────────────────────────────────────────────────────────────────────────────

/** Une voie coupée en bandes, par la méthode demandée. Le worker et le fil appellent celle-ci. */
export function repartirVoie(voie: Float32Array, o: OptionsRepartition, _canal = 0): ResultatRepartition {
  return {
    bandes: o.methode === "fft"
      ? repartirFft(voie, o.coupures, o.frequence)
      : repartirLinkwitzRiley(voie, o.coupures, o.frequence),
  };
}
