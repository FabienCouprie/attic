// audio/ecart-reference-ecart.ts — De combien un son s'écarte d'une référence, axe par axe.
//
// CHAQUE ÉCART EST L'AUDIO MOINS LA RÉFÉRENCE : un signe positif dit que l'audio a plus de ce que l'axe
// mesure. Les axes qui ne sont pas des grandeurs mais des formes (la couleur, le timbre, l'harmonie)
// rendent une distance, toujours positive, et la couleur rend en plus l'écart signé de chaque bande.
//
// ═══ LA DTW DU CHROMA, ET CE QU'ELLE NE DIT PAS ═══
//
// Le chroma de chaque trame est sommé par blocs d'une demi-seconde, chaque bloc ramené à une norme
// unité, puis les deux suites sont alignées par déformation temporelle dynamique sur la distance
// cosinus. Le coût rendu est la moyenne de cette distance le long du chemin, à la meilleure des douze
// transpositions de l'audio. Deux sons qui suivent les mêmes accords dans le même ordre y tombent près
// de zéro, même décalés ou étirés.
//
// LE CHEMIN, LUI, N'EST PAS RENDU, et c'est volontaire : sur une harmonie qui boucle, il glisse d'une
// reprise à l'autre entre deux fichiers de même tempo et de même durée, et le lire comme une structure
// a fait écrire au relevé d'origine que Suno sautait des mesures, ce qui était faux. Pour donner une
// échelle au coût, le même calcul est refait sur l'audio joué à l'envers : ce témoin renversé a les
// mêmes accords dans un autre ordre.
//
// LE CALCUL EST QUADRATIQUE. Il est borné aux 1 200 premiers blocs de chaque côté, dix minutes, et le
// relevé le dit quand la borne a joué. Deux lignes de la matrice suffisent : ni le chemin ni la
// matrice ne sont gardés.

import { TIERS_COMPARES, REGISTRES } from "./ecart-reference-couleur";
import type { DescriptionSon } from "./ecart-reference-mesures";

/** La durée d'un bloc de chroma, en secondes. */
export const BLOC_CHROMA_S = 0.5;
/** Le nombre de blocs de chaque côté au-delà duquel la DTW se tronque. */
export const BLOCS_DTW_MAX = 1200;

export interface EcartReference {
  duree: number;
  sonie: number;
  plageSonie: number;
  creteVraie: number;
  facteurCrete: number;
  plancher: number;
  correlation: number;
  coteSurMilieu: number;
  /** L'écart efficace des tiers d'octave de 31,5 Hz à 16 kHz, en dB. */
  couleur: number;
  tiers: { f: number; ecart: number }[];
  /** L'écart de part d'énergie de chaque registre, en points, dans l'ordre de `REGISTRES`. */
  registres: number[];
  centroide: number;
  platitude: number;
  /** La distance euclidienne des MFCC 1 à 12, moyennes puis écarts types. */
  mfcc: number;
  mfccEcart: number;
  /** Le cosinus des deux profils chroma. */
  chromaCos: number;
  dtw: number;
  /** De combien de demi-tons (0 à 11) l'audio est transposé pour atteindre le meilleur coût. */
  transposition: number;
  temoinRenverse: number;
  dtwTronquee: boolean;
  tempo: number;
  attaques: number;
}

/** Le chroma sommé par blocs d'une demi-seconde, chaque bloc de norme unité. */
export function blocsChroma(d: DescriptionSon): Float64Array[] {
  const parBloc = Math.max(1, Math.round(BLOC_CHROMA_S / d.pasChroma)), out: Float64Array[] = [];
  for (let i = 0; i + parBloc <= d.chroma.length; i += parBloc) {
    const v = new Float64Array(12);
    for (let j = i; j < i + parBloc; j++) for (let k = 0; k < 12; k++) v[k] += d.chroma[j][k];
    const norme = Math.hypot(...v) || 1;
    for (let k = 0; k < 12; k++) v[k] /= norme;
    out.push(v);
  }
  return out;
}

/** Les blocs de `b` lus `t` demi-tons plus haut : la classe k de `a` répond à la classe k + t de `b`. */
const tournes = (b: readonly Float64Array[], t: number): Float64Array[] =>
  b.map((v) => Float64Array.from({ length: 12 }, (_, k) => v[(k + t) % 12]));

/** Le coût moyen le long du chemin de DTW, distance cosinus, pas diagonal, vertical et horizontal. */
export function coutDtw(a: readonly Float64Array[], b: readonly Float64Array[]): number {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return NaN;
  let Dp = new Float64Array(m + 1).fill(Infinity), Lp = new Int32Array(m + 1);
  let Dc = new Float64Array(m + 1), Lc = new Int32Array(m + 1);
  Dp[0] = 0;
  for (let i = 1; i <= n; i++) {
    Dc[0] = Infinity; Lc[0] = 0;
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const bj = b[j - 1];
      let s = 0;
      for (let k = 0; k < 12; k++) s += ai[k] * bj[k];
      // À égalité, le pas diagonal l'emporte, puis le vertical.
      let best = Dp[j - 1], long = Lp[j - 1];
      if (Dp[j] < best) { best = Dp[j]; long = Lp[j]; }
      if (Dc[j - 1] < best) { best = Dc[j - 1]; long = Lc[j - 1]; }
      Dc[j] = best + (1 - s); Lc[j] = long + 1;
    }
    [Dp, Dc] = [Dc, Dp];
    [Lp, Lc] = [Lc, Lp];
  }
  return Dp[m] / Lp[m];
}

const distance = (a: Float64Array, b: Float64Array): number => {
  let s = 0;
  for (let k = 1; k < 13; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
};

/** L'écart de `d` à la référence `r`. */
export function ecartAReference(d: DescriptionSon, r: DescriptionSon): EcartReference {
  const tiers = TIERS_COMPARES
    .filter((f) => d.couleur.tiers.has(f) && r.couleur.tiers.has(f))
    .map((f) => ({ f, ecart: d.couleur.tiers.get(f)! - r.couleur.tiers.get(f)! }));
  const couleur = Math.sqrt(tiers.reduce((s, t) => s + t.ecart ** 2, 0) / Math.max(1, tiers.length));

  let produit = 0, na = 0, nb = 0;
  for (let k = 0; k < 12; k++) {
    produit += d.profilChroma[k] * r.profilChroma[k];
    na += d.profilChroma[k] ** 2; nb += r.profilChroma[k] ** 2;
  }

  const blocsA = blocsChroma(d), blocsB = blocsChroma(r);
  const dtwTronquee = blocsA.length > BLOCS_DTW_MAX || blocsB.length > BLOCS_DTW_MAX;
  const a = blocsA.slice(0, BLOCS_DTW_MAX), b = blocsB.slice(0, BLOCS_DTW_MAX);
  let dtw = NaN, transposition = 0;
  for (let t = 0; t < 12; t++) {
    const c = coutDtw(a, tournes(b, t));
    if (t === 0 || c < dtw) { dtw = c; transposition = t; }
  }
  const temoinRenverse = coutDtw([...a].reverse(), tournes(b, transposition));

  return {
    duree: d.duree - r.duree,
    sonie: d.sonie - r.sonie,
    plageSonie: d.plageSonie - r.plageSonie,
    creteVraie: d.creteVraie - r.creteVraie,
    facteurCrete: d.facteurCrete - r.facteurCrete,
    plancher: d.plancher - r.plancher,
    correlation: d.mono || r.mono ? NaN : d.correlation - r.correlation,
    coteSurMilieu: d.mono || r.mono ? NaN : d.coteSurMilieu - r.coteSurMilieu,
    couleur, tiers,
    registres: REGISTRES.map((_, i) => d.couleur.registres[i] - r.couleur.registres[i]),
    centroide: d.centroide - r.centroide,
    platitude: d.platitude - r.platitude,
    mfcc: distance(d.mfccMoyen, r.mfccMoyen),
    mfccEcart: distance(d.mfccEcart, r.mfccEcart),
    chromaCos: produit / Math.sqrt(na * nb || 1e-30),
    dtw, transposition, temoinRenverse, dtwTronquee,
    tempo: d.tempo - r.tempo,
    attaques: d.attaques - r.attaques,
  };
}
