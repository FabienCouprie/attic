// audio/formants.ts — Décalage formantique en deux étapes :
// 1. Pitch shift en domaine temporel (réutilise etirerDuree + reechantillonnerVers)
// 2. Correction formantique en domaine spectral (filtre cepstral, pas de pitch shift spectral)
//
// Avantage : pas de problème de phase (le pitch shift temporel préserve la phase,
// et la correction formantique est un simple filtre spectral appliqué frame par frame).

import { fft } from "./fft";
import { etirerDuree, reechantillonnerVers } from "./commun";

const N_FFT = 2048;
const HOP = 512;
const NB_BINS = N_FFT / 2;
const CEPSTRE_ORDRE = 30;

function hann(len: number): Float64Array {
  const w = new Float64Array(len);
  for (let i = 0; i < len; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (len - 1)));
  return w;
}

const FENETRE = hann(N_FFT);

// ─── Enveloppe spectrale par cepstre liftering ───

function enveloppeSpectrale(magnitude: Float64Array): Float64Array {
  const logMag = new Float64Array(NB_BINS);
  for (let b = 0; b < NB_BINS; b++) logMag[b] = Math.log(Math.max(magnitude[b], 1e-10));

  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  for (let b = 0; b < NB_BINS; b++) re[b] = logMag[b];
  for (let b = 1; b < NB_BINS; b++) re[N_FFT - b] = logMag[b];
  fft(re, im, false);

  for (let i = CEPSTRE_ORDRE + 1; i < N_FFT - CEPSTRE_ORDRE; i++) re[i] = 0;

  for (let i = 0; i < N_FFT; i++) im[i] = -im[i];
  fft(re, im, false);
  for (let i = 0; i < N_FFT; i++) { re[i] /= N_FFT; im[i] = -im[i] / N_FFT; }

  const enveloppe = new Float64Array(NB_BINS);
  for (let b = 0; b < NB_BINS; b++) enveloppe[b] = Math.exp(re[b]);
  return enveloppe;
}

// ─── Décalage d'une enveloppe spectrale ───

function decaleEnveloppe(env: Float64Array, ratio: number): Float64Array {
  const shifted = new Float64Array(NB_BINS);
  for (let b = 0; b < NB_BINS; b++) {
    const srcBin = b / ratio;
    const srcIdx = Math.floor(srcBin);
    const frac = srcBin - srcIdx;
    if (srcIdx + 1 < NB_BINS) {
      shifted[b] = env[srcIdx] * (1 - frac) + env[srcIdx + 1] * frac;
    } else if (srcIdx < NB_BINS) {
      shifted[b] = env[srcIdx];
    } else {
      shifted[b] = env[NB_BINS - 1];
    }
  }
  return shifted;
}

// ─── Correction formantique spectrale ───
// Applique un filtre spectral qui corrige les formants du signal pitché
// pour les ramener à la position souhaitée.
//
// Le pitch shift temporel déplace TOUS les formants avec la hauteur.
// Si on veut garder les formants originaux (pas d'effet helium) :
//   → diviser par l'enveloppe décalée (pitchRatio) et multiplier par l'originale
// Si on veut aussi décaler les formants (formantRatio) :
//   → diviser par l'enveloppe décalée (pitchRatio) et multiplier par l'enveloppe décalée (formantRatio)

function correctionFormantique(
  signal: Float32Array,
  pitchRatio: number,
  formantRatio: number,
): Float32Array {
  const n = signal.length;
  const nframes = Math.max(1, Math.ceil((n - N_FFT) / HOP) + 1);
  const out = new Float64Array(n);
  const norm = new Float64Array(n);

  // L'enveloppe de correction = envOriginale / envPitchée
  // où envPitchée = enveloppe originale décalée par pitchRatio
  // et envOriginale est recalculée pour compenser
  // En pratique : on calcule l'enveloppe de chaque frame, puis on applique
  // le filtre correctif = envCible / envActuelle

  for (let f = 0; f < nframes; f++) {
    const start = f * HOP;
    const re = new Float64Array(N_FFT);
    const im = new Float64Array(N_FFT);

    // Fenêtre
    for (let i = 0; i < N_FFT; i++) {
      re[i] = (start + i < n ? signal[start + i] : 0) * FENETRE[i];
    }
    fft(re, im, false);

    // Magnitude
    const mag = new Float64Array(NB_BINS);
    const phase = new Float64Array(NB_BINS);
    for (let b = 0; b < NB_BINS; b++) {
      mag[b] = Math.hypot(re[b], im[b]);
      phase[b] = Math.atan2(im[b], re[b]);
    }

    // Enveloppe actuelle (formants après pitch shift)
    const envActuelle = enveloppeSpectrale(mag);

    // Enveloppe cible :
    // - Si formantRatio = 1.0 → on veut restaurer les formants originaux
    //   (qui ont été décalés par pitchRatio) → envCible = envActuelle décalée par 1/pitchRatio
    // - Si formantRatio ≠ 1.0 → on veut envActuelle décalée par formantRatio/pitchRatio
    const ratioCorrection = formantRatio / pitchRatio;
    const envCible = decaleEnveloppe(envActuelle, ratioCorrection);

    // Filtre correctif : multiplier la magnitude par envCible / envActuelle
    const filtre = new Float64Array(NB_BINS);
    for (let b = 0; b < NB_BINS; b++) {
      filtre[b] = envCible[b] / Math.max(envActuelle[b], 1e-10);
    }

    // Appliquer le filtre (garder la phase originale)
    for (let b = 0; b < NB_BINS; b++) {
      const newMag = mag[b] * filtre[b];
      re[b] = newMag * Math.cos(phase[b]);
      im[b] = newMag * Math.sin(phase[b]);
    }

    // Symétrie hermitienne
    for (let b = 1; b < NB_BINS; b++) {
      re[N_FFT - b] = re[b];
      im[N_FFT - b] = -im[b];
    }
    im[0] = 0;
    if (N_FFT % 2 === 0) im[N_FFT / 2] = 0;

    // IFFT
    for (let i = 0; i < N_FFT; i++) im[i] = -im[i];
    fft(re, im, false);
    for (let i = 0; i < N_FFT; i++) { re[i] /= N_FFT; im[i] = -im[i] / N_FFT; }

    // Overlap-add
    for (let i = 0; i < N_FFT; i++) {
      const pos = start + i;
      if (pos < n) {
        out[pos] += re[i] * FENETRE[i];
        norm[pos] += FENETRE[i] * FENETRE[i];
      }
    }
  }

  const result = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = norm[i] > 1e-10 ? out[i] / norm[i] : 0;
  }
  return result;
}

// ─── Fonction principale ───

export function shiftFormants(
  buffer: AudioBuffer,
  pitchSemiTons: number,
  formantRatio: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const pitchRatio = Math.pow(2, pitchSemiTons / 12);
  const len = buffer.length;

  // Étape 1 : pitch shift en domaine temporel (préserve la phase)
  let pitchShifted = buffer;
  if (Math.abs(pitchRatio - 1) > 0.01) {
    const etire = etirerDuree(buffer, pitchRatio);
    pitchShifted = reechantillonnerVers(etire, pitchRatio, len);
  }

  // Étape 2 : correction formantique en domaine spectral
  // Si pas de pitch shift et pas de formant shift → retourner tel quel
  if (Math.abs(pitchRatio - 1) < 0.01 && Math.abs(formantRatio - 1) < 0.01) {
    return buffer;
  }

  const resultat = new AudioBuffer({ numberOfChannels: nCh, length: len, sampleRate: sr });

  for (let ch = 0; ch < nCh; ch++) {
    const input = pitchShifted.getChannelData(ch);
    const output = correctionFormantique(input, pitchRatio, formantRatio);
    resultat.getChannelData(ch).set(output);
  }

  return resultat;
}
