// audio/esthetique.ts — Préparation et agrégation pour Audiobox Aesthetics (Meta).
//
// Le modèle note un son sur quatre axes, de 1 à 10 :
//   CE  Content Enjoyment      plaisir d'écoute
//   CU  Content Usefulness     intérêt comme matière pour créer
//   PC  Production Complexity  nombre de composantes de la scène
//   PQ  Production Quality     qualité technique de la production
//
// Il ne voit que des tranches de 10 s à 16 kHz mono ; tout le reste — mixage mono,
// rééchantillonnage, découpage, moyenne pondérée — vit ici, en code pur, et
// reproduit exactement le chemin d'inférence de référence (audiobox_aesthetics/infer.py).
// Le modèle ONNX, lui, tourne dans le processus principal (electron/esthetique.cjs).
//
// POURQUOI RÉÉCRIRE LE RÉÉCHANTILLONNEUR DE TORCHAUDIO
//
// Les scores dépendent de la façon de passer à 16 kHz, et pas qu'un peu : mesuré sur
// la collection de démonstration, une interpolation linéaire à la place du filtre de
// torchaudio déplace les scores globaux jusqu'à 0,13 point, surtout PC — le repliement
// ajoute des composantes que le modèle compte. Le filtre de référence est donc reproduit
// à l'identique : sinc fenêtré de Hann, 6 passages par zéro, rolloff 0,99.

export const AXES_ESTHETIQUES = ["CE", "CU", "PC", "PQ"] as const;
export type AxeEsthetique = (typeof AXES_ESTHETIQUES)[number];
export type ScoresEsthetiques = Record<AxeEsthetique, number>;

const FREQUENCE_MODELE = 16000;
const SECONDES_TRANCHE = 10;
export const ECHANTILLONS_TRANCHE = FREQUENCE_MODELE * SECONDES_TRANCHE;

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));

/**
 * Rééchantillonnage de torchaudio.functional.resample, méthode « sinc_interp_hann »
 * (lowpass_filter_width = 6, rolloff = 0,99) : mêmes noyaux, même alignement, même
 * longueur de sortie, ceil(nouvelle · longueur / origine).
 */
export function reechantillonnerCommeTorchaudio(signal: Float32Array, origine: number, cible: number): Float32Array {
  if (!Number.isInteger(origine) || !Number.isInteger(cible) || origine <= 0 || cible <= 0) {
    throw new Error(`Fréquences d'échantillonnage invalides : ${origine} → ${cible}`);
  }
  if (origine === cible) return signal;
  const g = pgcd(origine, cible);
  const o = origine / g, n = cible / g;
  const largeurFiltre = 6;
  const frequenceBase = Math.min(o, n) * 0.99;
  const largeur = Math.ceil((largeurFiltre * o) / frequenceBase);
  const tailleNoyau = 2 * largeur + o;
  const echelle = frequenceBase / o;

  // noyaux[j] : filtre de la j-ième phase de sortie, sur tailleNoyau échantillons d'entrée.
  // Calculés en float32 opération par opération (Math.fround), comme torchaudio le fait
  // pour un signal float32 : en float64, l'écart atteignait 1,2e-5 en suréchantillonnage.
  const f = Math.fround;
  const noyaux = new Float32Array(n * tailleNoyau);
  for (let j = 0; j < n; j++) {
    for (let m = 0; m < tailleNoyau; m++) {
      let t = f(f(f(-j) / n) + f(f(m - largeur) / o));
      t = f(t * f(frequenceBase));
      t = Math.max(-largeurFiltre, Math.min(largeurFiltre, t));
      const c = f(Math.cos(f(f(f(t * f(Math.PI)) / largeurFiltre) / 2)));
      const fenetre = f(c * c);
      const tp = f(t * f(Math.PI));
      const sinc = tp === 0 ? 1 : f(f(Math.sin(tp)) / tp);
      noyaux[j * tailleNoyau + m] = f(f(sinc * fenetre) * f(echelle));
    }
  }

  const longueur = signal.length;
  const longueurSortie = Math.ceil((n * longueur) / o);
  const sortie = new Float32Array(longueurSortie);
  for (let k = 0; k * n < longueurSortie; k++) {
    const depart = k * o - largeur;             // entrée complétée de `largeur` zéros à gauche
    const mMin = Math.max(0, -depart);
    const mMax = Math.min(tailleNoyau, longueur - depart);
    for (let j = 0; j < n && k * n + j < longueurSortie; j++) {
      const base = j * tailleNoyau;
      let s = 0;
      for (let m = mMin; m < mMax; m++) s += signal[depart + m] * noyaux[base + m];
      sortie[k * n + j] = s;
    }
  }
  return sortie;
}

/** Moyenne des canaux, comme `wav.mean(dim=0)` dans le chemin de référence. */
export function mixerMono(canaux: readonly Float32Array[]): Float32Array {
  if (canaux.length === 0) throw new Error("Aucun canal audio.");
  if (canaux.length === 1) return canaux[0];
  const longueur = canaux[0].length;
  const mono = new Float32Array(longueur);
  for (const c of canaux) for (let i = 0; i < longueur; i++) mono[i] += c[i];
  for (let i = 0; i < longueur; i++) mono[i] /= canaux.length;
  return mono;
}

export interface Tranche {
  /** 160 000 échantillons, complétés de zéros pour la dernière. */
  signal: Float32Array;
  /** Nombre d'échantillons réels (le masque du modèle). */
  utiles: number;
  debutSec: number;
  finSec: number;
}

/** Tranches de 10 s sans recouvrement ; la dernière, plus courte, est complétée de zéros. */
export function decouperEnTranches(mono16k: Float32Array): Tranche[] {
  const tranches: Tranche[] = [];
  for (let debut = 0; debut < mono16k.length; debut += ECHANTILLONS_TRANCHE) {
    const utiles = Math.min(ECHANTILLONS_TRANCHE, mono16k.length - debut);
    const signal = new Float32Array(ECHANTILLONS_TRANCHE);
    signal.set(mono16k.subarray(debut, debut + utiles));
    tranches.push({ signal, utiles, debutSec: debut / FREQUENCE_MODELE, finSec: (debut + utiles) / FREQUENCE_MODELE });
  }
  return tranches;
}

/** Tout le chemin avant le modèle : mono, 16 kHz, tranches. */
export function preparerTranches(canaux: readonly Float32Array[], frequence: number): Tranche[] {
  const mono = reechantillonnerCommeTorchaudio(mixerMono(canaux), Math.round(frequence), FREQUENCE_MODELE);
  if (mono.length === 0) throw new Error("Signal vide.");
  return decouperEnTranches(mono);
}

export interface TrancheNotee {
  debutSec: number;
  finSec: number;
  scores: ScoresEsthetiques;
}

export interface AnalyseEsthetique {
  global: ScoresEsthetiques;
  tranches: TrancheNotee[];
  dureeSec: number;
}

/** Score global : moyenne des tranches pondérée par leur part réelle de 10 s. */
export function agregerTranches(tranches: TrancheNotee[]): AnalyseEsthetique {
  if (tranches.length === 0) throw new Error("Aucune tranche notée.");
  const global = {} as ScoresEsthetiques;
  let totalPoids = 0;
  const poids = tranches.map((t) => {
    const p = (t.finSec - t.debutSec) / SECONDES_TRANCHE;
    totalPoids += p;
    return p;
  });
  for (const axe of AXES_ESTHETIQUES) {
    let s = 0;
    tranches.forEach((t, i) => { s += t.scores[axe] * poids[i]; });
    global[axe] = s / totalPoids;
  }
  return { global, tranches, dureeSec: tranches[tranches.length - 1].finSec };
}

/** Sortie brute du modèle [CE, CU, PC, PQ] → scores nommés. */
export function scoresDepuisSortie(sortie: ArrayLike<number>): ScoresEsthetiques {
  if (sortie.length !== 4) throw new Error(`Sortie du modèle inattendue : ${sortie.length} valeurs au lieu de 4.`);
  return { CE: sortie[0], CU: sortie[1], PC: sortie[2], PQ: sortie[3] };
}

export interface PointFaible {
  axe: AxeEsthetique;
  debutSec: number;
  finSec: number;
  score: number;
  ecart: number;
}

/** La tranche la plus basse de chaque axe, et son écart au score global. */
export function pointsFaibles(analyse: AnalyseEsthetique): PointFaible[] {
  return AXES_ESTHETIQUES.map((axe) => {
    let min = analyse.tranches[0];
    for (const t of analyse.tranches) if (t.scores[axe] < min.scores[axe]) min = t;
    return { axe, debutSec: min.debutSec, finSec: min.finSec, score: min.scores[axe], ecart: min.scores[axe] - analyse.global[axe] };
  });
}

/** Écart B − A par axe. */
export function ecartsEsthetiques(a: AnalyseEsthetique, b: AnalyseEsthetique): ScoresEsthetiques {
  const d = {} as ScoresEsthetiques;
  for (const axe of AXES_ESTHETIQUES) d[axe] = b.global[axe] - a.global[axe];
  return d;
}

const horodatage = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
export const formaterHorodatage = horodatage;
