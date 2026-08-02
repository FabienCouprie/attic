// audio/commun.ts — Extrait de l'ancien monolithe DSP.
import { fft } from "./fft";

export const DEMI_TONS_CLE: Record<string, number> = {
  Do: 0,
  "Do#": 1,
  Ré: 2,
  "Mi♭": 3,
  Mi: 4,
  Fa: 5,
  "Fa#": 6,
  Sol: 7,
  "Sol#": 8,
  La: 9,
  "Si♭": 10,
  Si: 11,
};


export function frequenceDeNoteMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}


export interface PositionZone {
  debut: number;
  duree: number;
}


export const TAILLE_FFT = 2048;

export const SAUT_FFT = TAILLE_FFT / 2;

export const TAILLE_FFT_BRUIT = 8192;

export const SAUT_FFT_BRUIT = TAILLE_FFT_BRUIT / 2;

export const TAILLE_FFT_HAUTEUR = 2048;

export const SAUT_ANALYSE_HAUTEUR = TAILLE_FFT_HAUTEUR / 4;


export function frequenceDepuisValeur(v: number, min: number, max: number): number {
  const n = Math.max(0, Math.min(255, v)) / 255;
  return min + (max - min) * n;
}


export function creerFenetreHann(taille: number): Float64Array {
  const fenetre = new Float64Array(taille);
  for (let i = 0; i < taille; i++) {
    fenetre[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (taille - 1)));
  }
  return fenetre;
}


export function etirerDuree(entree: AudioBuffer, facteur: number): AudioBuffer {
  const n = TAILLE_FFT_HAUTEUR;
  const nbBins = n / 2 + 1;
  const ha = SAUT_ANALYSE_HAUTEUR;
  const hs = Math.max(1, Math.round(ha * facteur));
  const fenetre = creerFenetreHann(n);
  const longueurSortie = Math.max(n, Math.round(entree.length * facteur));

  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: longueurSortie,
    sampleRate: entree.sampleRate,
  });

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const src = entree.getChannelData(c);
    const sortie = new Float64Array(longueurSortie);
    const enveloppe = new Float64Array(longueurSortie);
    const phasePrecedente = new Float64Array(nbBins);
    const phaseSynthese = new Float64Array(nbBins);
    let premiereTrame = true;

    let posAnalyse = 0;
    let posSynthese = 0;
    while (posAnalyse < src.length) {
      const re = new Float64Array(n);
      const im = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const idx = posAnalyse + i;
        re[i] = (idx < src.length ? src[idx] : 0) * fenetre[i];
      }
      fft(re, im, false);

      for (let b = 0; b < nbBins; b++) {
        const magnitude = Math.hypot(re[b], im[b]);
        const phase = Math.atan2(im[b], re[b]);

        if (premiereTrame) {
          phaseSynthese[b] = phase;
        } else {
          const omegaBin = (2 * Math.PI * b) / n;
          let deltaPhase = phase - phasePrecedente[b] - omegaBin * ha;
          deltaPhase -= 2 * Math.PI * Math.round(deltaPhase / (2 * Math.PI));
          const frequenceInstantanee = omegaBin + deltaPhase / ha;
          phaseSynthese[b] += frequenceInstantanee * hs;
        }
        phasePrecedente[b] = phase;

        re[b] = magnitude * Math.cos(phaseSynthese[b]);
        im[b] = magnitude * Math.sin(phaseSynthese[b]);
        if (b > 0 && b < n - b) {
          re[n - b] = re[b];
          im[n - b] = -im[b];
        }
      }
      premiereTrame = false;

      fft(re, im, true);
      for (let i = 0; i < n; i++) {
        const pos = posSynthese + i;
        if (pos >= longueurSortie) break;
        sortie[pos] += re[i] * fenetre[i];
        enveloppe[pos] += fenetre[i] * fenetre[i];
      }

      posAnalyse += ha;
      posSynthese += hs;
    }

    const canalSortie = resultat.getChannelData(c);
    for (let i = 0; i < longueurSortie; i++) {
      canalSortie[i] = enveloppe[i] > 1e-6 ? sortie[i] / enveloppe[i] : 0;
    }
  }

  return resultat;
}

// Changement de tempo : c'est exactement l'étape d'étirement du changement de
// tonalité, utilisée seule (sans le rééchantillonnage qui suit) — la durée
// change, la hauteur reste intacte grâce à la correction de phase.

export function reechantillonnerVers(buffer: AudioBuffer, ratio: number, longueurCible: number): AudioBuffer {
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: longueurCible,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < longueurCible; i++) {
      const positionSource = i * ratio;
      const idx = Math.floor(positionSource);
      const frac = positionSource - idx;
      // Interpolation cubique Catmull-Rom (4 points)
      const p0 = idx - 1 >= 0 ? src[idx - 1] : 0;
      const p1 = idx < src.length ? src[idx] : 0;
      const p2 = idx + 1 < src.length ? src[idx + 1] : 0;
      const p3 = idx + 2 < src.length ? src[idx + 2] : 0;
      const t = frac;
      const t2 = t * t;
      const t3 = t2 * t;
      dst[i] = p1
             + 0.5 * (p2 - p0) * t
             + (p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3) * t2
             + (-0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3) * t3;
    }
  }
  return resultat;
}


export interface TrameFFT {
  re: Float64Array;
  im: Float64Array;
}


export function tramesDepuisBuffer(
  donnees: Float32Array,
  fftTaille: number,
  saut: number,
  fenetre: Float64Array
): TrameFFT[] {
  const trames: TrameFFT[] = [];
  for (let debut = 0; debut + fftTaille <= donnees.length; debut += saut) {
    const re = new Float64Array(fftTaille);
    const im = new Float64Array(fftTaille);
    for (let i = 0; i < fftTaille; i++) re[i] = donnees[debut + i] * fenetre[i];
    fft(re, im, false);
    trames.push({ re, im });
  }
  return trames;
}

