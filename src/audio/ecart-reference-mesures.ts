// audio/ecart-reference-mesures.ts — Ce que « Écart à une référence » relève sur UN son : niveau,
// stéréo, couleur, timbre, harmonie, rythme. La comparaison des deux est dans `ecart-reference-ecart.ts`.
//
// ═══ D'OÙ VIENNENT CES DÉFINITIONS ═══
//
// D'un instrument écrit hors du dépôt le 2026-11-25 pour savoir si une route rapprochait un morceau
// d'Attic de sa reprise par Suno (`EXECUTION/le-loup/RAPPORT.md`). Il avait d'abord passé vingt-quatre
// témoins à réponse connue, et son plancher avait été relevé sur un même morceau pris à 48 puis à
// 44,1 kHz. Chaque taille d'analyse ci-dessous est fixe, et chacune est tenue par un témoin de
// `ecart-reference.test.ts`.
//
// ═══ TROIS TRANSFORMÉES, TROIS ÉCHELLES ═══
//
// La couleur se lit à 32 768 points (voir `ecart-reference-couleur.ts`). Le centroïde, la platitude et
// le chroma se lisent à 8 192 points au pas de 4 096. Les MFCC et le flux spectral, qui doivent suivre
// les attaques, se lisent à 2 048 points au pas de 512. Toutes travaillent sur le milieu, la demi-somme
// des deux premiers canaux. Les mesures de niveau et de stéréo lisent les canaux eux-mêmes.
//
// LES MÉDIANES NE COMPTENT QUE LES TRAMES À MOINS DE 50 dB DE LA PLUS FORTE : un fondu ou un silence
// final y pèseraient sinon autant que la musique, et un centroïde de silence ne veut rien dire.

import { creteVraie } from "./crete-vraie";
import { couleurDe, type Couleur } from "./ecart-reference-couleur";
import { db, dct, moyenne, quantile, spectresDePuissance } from "./ecart-reference-signal";
import { bancMel } from "./mel";
import { sonieEtPlage } from "./sonie-bs1770";

export interface DescriptionSon {
  duree: number;
  fe: number;
  canaux: number;
  /** Un seul canal : la corrélation et le rapport côté sur milieu n'ont pas de sens. */
  mono: boolean;
  sonie: number;
  plageSonie: number;
  /** En dBTP, suréchantillonnée par quatre (`crete-vraie.ts`). */
  creteVraie: number;
  /** Crête des échantillons moins valeur efficace, en dB. */
  facteurCrete: number;
  /** Le cinquième centile de la valeur efficace du milieu sur des trames de 50 ms, en dBFS. */
  plancher: number;
  correlation: number;
  /** En dB ; −Infinity sur deux canaux identiques. */
  coteSurMilieu: number;
  couleur: Couleur;
  centroide: number;
  platitude: number;
  /** Le chroma de chaque trame de 8 192 points, normalisé par sa somme, et le pas entre deux trames en secondes. */
  chroma: Float64Array[];
  pasChroma: number;
  profilChroma: Float64Array;
  /** Les treize premiers MFCC, moyenne et écart type sur toutes les trames. */
  mfccMoyen: Float64Array;
  mfccEcart: Float64Array;
  tempo: number;
  attaques: number;
}

function niveauxEtStereo(L: Float32Array, R: Float32Array) {
  const n = L.length;
  let pic = 0, sl = 0, sr = 0, slr = 0, sm = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > pic) pic = a;
    sl += l * l; sr += r * r; slr += l * r;
    const m = (l + r) / 2, s = (l - r) / 2;
    sm += m * m; ss += s * s;
  }
  const efficace = db((sl + sr) / (2 * Math.max(1, n)));
  return {
    facteurCrete: db(pic * pic) - efficace,
    correlation: slr / Math.sqrt(sl * sr || 1e-30),
    coteSurMilieu: ss === 0 ? -Infinity : db(ss) - db(sm),
  };
}

/** Centroïde et platitude médians, et le chroma de chaque trame. */
function spectreMilieu(M: Float32Array, fe: number) {
  const n = 8192, pas = 4096, cases = n / 2 + 1, df = fe / n;
  const k0 = Math.ceil(50 / df), k1 = Math.min(cases - 1, Math.floor(16000 / df));
  const kc0 = Math.ceil(80 / df), kc1 = Math.min(cases - 1, 5000 / df);
  const classe = new Int8Array(cases);
  for (let k = kc0; k < kc1; k++) {
    const m = 69 + 12 * Math.log2((k * df) / 440);
    classe[k] = ((Math.round(m) % 12) + 12) % 12;
  }
  const energies: number[] = [], centroides: number[] = [], platitudes: number[] = [];
  const chroma: Float64Array[] = [];
  spectresDePuissance(M, n, pas, (p) => {
    let e = 0, mag = 0, cen = 0;
    for (let k = 1; k < cases; k++) {
      const a = Math.sqrt(p[k]);
      e += p[k]; mag += a; cen += a * k * df;
    }
    let lg = 0, ar = 0;
    for (let k = k0; k <= k1; k++) { lg += Math.log(p[k] + 1e-20); ar += p[k]; }
    const nb = k1 - k0 + 1;
    const c = new Float64Array(12);
    for (let k = kc0; k < kc1; k++) c[classe[k]] += Math.sqrt(p[k]);
    const somme = c.reduce((s, v) => s + v, 0) || 1;
    for (let i = 0; i < 12; i++) c[i] /= somme;
    energies.push(e);
    centroides.push(cen / (mag || 1e-30));
    platitudes.push(Math.exp(lg / nb) / (ar / nb + 1e-30));
    chroma.push(c);
  });
  const emax = energies.reduce((a, b) => Math.max(a, b), 0);
  const vives = energies.map((e, i) => (e > emax * 1e-5 ? i : -1)).filter((i) => i >= 0);
  const profil = new Float64Array(12);
  for (const c of chroma) for (let i = 0; i < 12; i++) profil[i] += c[i] / chroma.length;
  return {
    centroide: quantile(vives.map((i) => centroides[i]), 0.5),
    platitude: quantile(vives.map((i) => platitudes[i]), 0.5),
    chroma, pasChroma: pas / fe, profilChroma: profil,
  };
}

/**
 * Les MFCC 1 à 12 et le tempo.
 *
 * Quarante bandes de mels de 30 Hz à 16 kHz, en hertz donc indépendantes de la fréquence
 * d'échantillonnage ; le logarithme décimal de leur énergie, fois dix, passe par la transformée en
 * cosinus. Le flux spectral est la somme des hausses du logarithme comprimé des mêmes bandes.
 */
function timbreEtRythme(M: Float32Array, fe: number) {
  const n = 2048, pas = 512, fr = fe / pas;
  const banc = bancMel({
    echantillonnage: fe, bandes: 40, fMin: 30, fMax: Math.min(16000, fe / 2 - 100),
    pasMs: (1000 * pas) / fe, fenetreMs: (1000 * n) / fe, bourrageMs: (1000 * n) / fe,
  }, n);
  const flux: number[] = [];
  const moy = new Float64Array(13), m2 = new Float64Array(13);
  let nT = 0, prec: Float64Array | null = null;
  const lg = new Float64Array(40);
  spectresDePuissance(M, n, pas, (p) => {
    const comp = new Float64Array(40);
    for (let b = 0; b < 40; b++) {
      const { debut, poids } = banc[b];
      let s = 0;
      for (let i = 0; i < poids.length; i++) s += poids[i] * p[debut + i];
      lg[b] = 10 * Math.log10(s + 1e-10);
      comp[b] = Math.log1p(1000 * Math.sqrt(s));
    }
    // L'écart type se tient par l'algorithme de Welford : une passe, sans garder les trames.
    const c = dct(lg, 13);
    nT++;
    for (let k = 0; k < 13; k++) {
      const d = c[k] - moy[k];
      moy[k] += d / nT;
      m2[k] += d * (c[k] - moy[k]);
    }
    let f = 0;
    if (prec) for (let b = 0; b < 40; b++) f += Math.max(0, comp[b] - prec[b]);
    flux.push(f);
    prec = comp;
  });
  const ecart = m2.map((v) => Math.sqrt(v / nT));

  // Le tempo : l'autocorrélation du flux centré, de 50 à 220 BPM au demi-BPM, pondérée par un a priori
  // log-normal d'une octave centré sur 120 BPM, qui départage un tempo de son double.
  const mu = moyenne(flux);
  const o = flux.map((v) => v - mu);
  let tempo = NaN, meilleur = -Infinity;
  for (let bpm = 50; bpm <= 220; bpm += 0.5) {
    const decalage = (60 * fr) / bpm, l0 = Math.floor(decalage), a = decalage - l0;
    let s = 0;
    for (let i = 0; i + l0 + 1 < o.length; i++) s += o[i] * ((1 - a) * o[i + l0] + a * o[i + l0 + 1]);
    const pond = s * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    if (pond > meilleur) { meilleur = pond; tempo = bpm; }
  }

  // Les attaques : un maximum du flux sur sept trames, au-dessus de la moyenne plus un écart type de la
  // seconde qui l'entoure, et au-dessus du dixième de la moyenne générale.
  const cumul = new Float64Array(flux.length + 1), cumul2 = new Float64Array(flux.length + 1);
  for (let i = 0; i < flux.length; i++) { cumul[i + 1] = cumul[i] + flux[i]; cumul2[i + 1] = cumul2[i] + flux[i] ** 2; }
  const rayon = Math.round(fr);
  let attaques = 0;
  for (let i = 1; i < flux.length - 1; i++) {
    let local = true;
    for (let j = Math.max(0, i - 3); j <= Math.min(flux.length - 1, i + 3); j++) if (flux[j] > flux[i]) { local = false; break; }
    if (!local) continue;
    const g = Math.max(0, i - rayon), d = Math.min(flux.length, i + rayon), nb = d - g;
    const m = (cumul[d] - cumul[g]) / nb;
    const sd = Math.sqrt(Math.max(0, (cumul2[d] - cumul2[g]) / nb - m * m));
    if (flux[i] > m + sd && flux[i] > 0.1 * mu) attaques++;
  }
  return { mfccMoyen: moy, mfccEcart: ecart, tempo, attaques: attaques / (M.length / fe) };
}

/** Le cinquième centile de la valeur efficace sur des trames de 50 ms sans recouvrement. */
function plancher(M: Float32Array, fe: number): number {
  const t = Math.round(0.05 * fe), niveaux: number[] = [];
  for (let o = 0; o + t <= M.length; o += t) {
    let s = 0;
    for (let i = o; i < o + t; i++) s += M[i] * M[i];
    niveaux.push(db(s / t));
  }
  return quantile(niveaux, 0.05);
}

/** Ce que reçoit l'ouvrier : les canaux d'un son et leur fréquence. */
export interface DemandeDescription {
  canaux: Float32Array[];
  fe: number;
}

/** `decrireSon` sous la forme d'un calcul d'ouvrier. */
export const decrireDemande = (d: DemandeDescription): DescriptionSon => decrireSon(d.canaux, d.fe);

/** Décrit un son. Au-delà de deux canaux, seuls les deux premiers sont lus. */
export function decrireSon(canaux: readonly Float32Array[], fe: number): DescriptionSon {
  const L = canaux[0], R = canaux[1] ?? canaux[0];
  const M = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) M[i] = (L[i] + R[i]) / 2;
  const sonie = sonieEtPlage(canaux.length > 1 ? [L, R] : [L], fe);
  const vrai = creteVraie(canaux.length > 1 ? [L, R] : [L]);
  return {
    duree: L.length / fe, fe, canaux: canaux.length, mono: canaux.length < 2,
    sonie: sonie.integree, plageSonie: sonie.plage,
    creteVraie: db(vrai * vrai),
    ...niveauxEtStereo(L, R),
    plancher: plancher(M, fe),
    couleur: couleurDe(M, fe),
    ...spectreMilieu(M, fe),
    ...timbreEtRythme(M, fe),
  };
}
