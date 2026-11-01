// audio/spectrogramme-fenetre.ts — Un signal vers ses trames spectrales, et le retour.
//
// POURQUOI CE MODULE. L'analyse et la synthèse par trames à fenêtre glissante ne dépendent que de la
// transformée de Fourier : elles ne savent rien du réseau de neurones qui, dans la continuation
// spectrale, décide de la suite. Les garder ensemble mettait dans un même fichier deux sujets sans
// rapport, la transformée et l'apprentissage.
//
// LA PRÉCAUTION QUI COMPTE DANS LA SYNTHÈSE, et c'est pourquoi le seuil est écrit ici plutôt que
// deviné : le recollement divise par la somme des carrés de la fenêtre, qui tend vers zéro aux bords
// des trames. Diviser par un poids quasi nul y transforme le moindre bruit numérique en une crête
// énorme. Le poids sous le seuil rend donc un échantillon nul, et non un échantillon explosé.
//
// TROIS MODULES FAISAIENT CE TRAVAIL CHACUN DE LEUR CÔTÉ, et la revue du 2026-10-31 les tenait pour
// des copies. Le relevé a dit autre chose : le travail PAR TRAME est le même, au bit près, mais
// chacun décide autrement de deux choses. La dernière trame, d'abord : ici on s'arrête à la dernière
// qui tient dans le signal, `pca-neuronale` et `griffin-lim` continuent en remplissant de zéros.
// La normalisation, ensuite : ici un seuil absolu de 10⁻⁶, `griffin-lim` divise dès que le poids
// est positif, `pca-neuronale` plafonne le diviseur à un dixième du poids maximal, parce qu'il
// resynthétise des spectres qu'un réseau a déformés. Ces deux décisions sont donc des OPTIONS, et
// le travail par trame est exporté pour que `griffin-lim`, qui respire entre deux trames, le fasse
// dans sa propre boucle sans le réécrire. Aucun des trois ne change d'un bit.
import { fft } from "./fft";

export interface FrameSpectrale {
  start: number;
  mag: Float64Array; // magnitude linéaire originale
  phase: Float64Array; // phase originale
}

export interface Spectrogramme {
  fftSize: number;
  hop: number;
  frames: FrameSpectrale[];
}

export interface OptionsAnalyse {
  /** Vrai : la dernière trame déborde du signal et le manque est tenu pour du silence. Faux : on s'arrête à la dernière trame entière. */
  remplirFin?: boolean;
}

/**
 * Comment diviser le recollement par le poids de la fenêtre.
 *
 * `seuil` : un poids au-dessus divise, un poids au-dessous rend zéro. `plancherRelatif` : le
 * diviseur ne descend jamais sous cette part du poids maximal, et un poids nul laisse zéro.
 */
export type Normalisation = { seuil: number } | { plancherRelatif: number };

export interface OptionsSynthese {
  normalisation?: Normalisation;
}

/** Une trame : le signal fenêtré à partir de `start`, transformé, en module et en phase. */
export function trameSpectrale(
  signal: ArrayLike<number>, start: number, fftSize: number, fenetre: Float64Array,
): FrameSpectrale {
  const nbBins = Math.floor(fftSize / 2) + 1;
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    const idx = start + i;
    if (idx < signal.length) re[i] = signal[idx] * fenetre[i];
  }
  fft(re, im, false);
  const mag = new Float64Array(nbBins);
  const phase = new Float64Array(nbBins);
  for (let k = 0; k < nbBins; k++) {
    mag[k] = Math.hypot(re[k], im[k]);
    phase[k] = Math.atan2(im[k], re[k]);
  }
  return { start, mag, phase };
}

export function analyserSpectrogramme(
  signal: Float32Array,
  fftSize: number,
  hop: number,
  fenetre: Float64Array,
  { remplirFin = false }: OptionsAnalyse = {},
): Spectrogramme {
  const frames: FrameSpectrale[] = [];
  for (let start = 0; remplirFin ? start < signal.length : start + fftSize <= signal.length; start += hop) {
    frames.push(trameSpectrale(signal, start, fftSize, fenetre));
  }
  return { fftSize, hop, frames };
}

/** La trame rendue au temps, fenêtrée, ajoutée à `out` ; son poids ajouté à `norm`. */
export function superposerTrame(
  frame: FrameSpectrale, fftSize: number, fenetre: Float64Array, out: Float64Array, norm: Float64Array,
): void {
  const nbBins = Math.floor(fftSize / 2) + 1;
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let k = 0; k < nbBins; k++) {
    const mag = frame.mag[k];
    const phase = frame.phase[k];
    re[k] = mag * Math.cos(phase);
    im[k] = mag * Math.sin(phase);
    if (k > 0 && k < nbBins - 1) {
      re[fftSize - k] = re[k];
      im[fftSize - k] = -im[k];
    }
  }
  if (fftSize % 2 === 0) {
    im[nbBins - 1] = 0;
  }
  fft(re, im, true);
  for (let i = 0; i < fftSize; i++) {
    const idx = frame.start + i;
    if (idx < out.length) {
      out[idx] += re[i] * fenetre[i];
      norm[idx] += fenetre[i] * fenetre[i];
    }
  }
}

/** Divise le recollement par le poids de la fenêtre, selon la règle choisie. En place. */
export function normaliserRecouvrement(out: Float64Array, norm: Float64Array, normalisation: Normalisation): void {
  if ("plancherRelatif" in normalisation) {
    let normMax = 0;
    for (let i = 0; i < out.length; i++) normMax = Math.max(normMax, norm[i]);
    const plancher = normalisation.plancherRelatif * normMax;
    for (let i = 0; i < out.length; i++) {
      if (norm[i] > 0) out[i] /= Math.max(norm[i], plancher);
    }
    return;
  }
  for (let i = 0; i < out.length; i++) {
    if (norm[i] > normalisation.seuil) out[i] /= norm[i];
    else out[i] = 0;
  }
}

export function synthetiserSpectrogramme(
  frames: FrameSpectrale[],
  fftSize: number,
  _hop: number,
  fenetre: Float64Array,
  length: number,
  { normalisation = { seuil: 1e-6 } }: OptionsSynthese = {},
): Float64Array {
  const out = new Float64Array(length);
  const norm = new Float64Array(length);
  for (const frame of frames) superposerTrame(frame, fftSize, fenetre, out, norm);
  normaliserRecouvrement(out, norm, normalisation);
  return out;
}

export function prochainePuissanceDeDeux(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}
