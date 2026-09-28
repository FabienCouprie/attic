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

export function analyserSpectrogramme(
  signal: Float32Array,
  fftSize: number,
  hop: number,
  fenetre: Float64Array
): Spectrogramme {
  const nbBins = Math.floor(fftSize / 2) + 1;
  const frames: FrameSpectrale[] = [];
  for (let start = 0; start + fftSize <= signal.length; start += hop) {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      re[i] = signal[start + i] * fenetre[i];
    }
    fft(re, im, false);
    const mag = new Float64Array(nbBins);
    const phase = new Float64Array(nbBins);
    for (let k = 0; k < nbBins; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      phase[k] = Math.atan2(im[k], re[k]);
    }
    frames.push({ start, mag, phase });
  }
  return { fftSize, hop, frames };
}

export function synthetiserSpectrogramme(
  frames: FrameSpectrale[],
  fftSize: number,
  hop: number,
  fenetre: Float64Array,
  length: number
): Float64Array {
  const out = new Float64Array(length);
  const norm = new Float64Array(length);
  const nbBins = Math.floor(fftSize / 2) + 1;
  for (const frame of frames) {
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
      if (idx < length) {
        out[idx] += re[i] * fenetre[i];
        norm[idx] += fenetre[i] * fenetre[i];
      }
    }
  }
  // Avoid division by extremely small (or zero) window norms at frame boundaries, which
  // otherwise amplify any tiny numerical noise into a huge spike.
  const minNorm = 1e-6;
  for (let i = 0; i < length; i++) {
    if (norm[i] > minNorm) out[i] /= norm[i];
    else out[i] = 0;
  }
  return out;
}

export function prochainePuissanceDeDeux(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}
