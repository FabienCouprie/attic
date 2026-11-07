// audio/analyse-mesures.ts — Ce que l'analyse d'ensemble mesure, sans un mot de texte.
//
// TIRÉ D'`analyse.ts` POUR PASSER HORS DU FIL. Un worker ne doit pas atteindre
// l'internationalisation, et `analyse.ts` rédige son rapport avec `traduire` : la mesure et la
// rédaction y étaient mêlées ligne à ligne. Ici, les seuls calculs, tels quels : l'enveloppe et le
// flux du tempo, les trois chromagrammes, les écarts du type. `analyse.ts` en garde la rédaction, et
// `analyserAudio` reste la somme des deux.

import { creerFenetreHann, tramesDepuisBuffer, noteMidiDeFrequence } from "./commun";

export function chromagramme(donnees: Float32Array, sampleRate: number): number[] {
  const fftTaille = 2048;
  const saut = 512;
  const fenetre = creerFenetreHann(fftTaille);
  const trames = tramesDepuisBuffer(donnees, fftTaille, saut, fenetre);
  const nbBins = fftTaille / 2 + 1;
  const chroma = Array.from({ length: 12 }, () => 0);

  for (const trame of trames) {
    for (let bin = 1; bin < nbBins; bin++) {
      const mag = Math.sqrt(trame.re[bin] ** 2 + trame.im[bin] ** 2);
      const freq = (bin * sampleRate) / fftTaille;
      if (freq < 65 || freq > 8000) continue;
      const midiNote = noteMidiDeFrequence(freq);
      const pc = ((Math.round(midiNote) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
  }

  const max = Math.max(...chroma, 1e-10);
  return chroma.map((v) => v / max);
}


/**
 * Comme `chromagramme`, mais renvoie un vecteur de 12 classes par trame FFT
 * (~11.6 ms à 44.1 kHz, saut 512) plutôt qu'un seul vecteur agrégé sur tout
 * le signal — nécessaire pour aligner deux pistes trame par trame (DTW), qui
 * a besoin d'une vraie série temporelle, pas d'un résumé. Fonction distincte
 * plutôt que dérivée de `chromagramme` : agréger des vecteurs déjà normalisés
 * par trame donnerait un résultat différent de la normalisation par le
 * maximum global que fait `chromagramme` — les deux doivent rester
 * indépendantes pour ne pas changer son comportement (déjà testé).
 *
 * Venu d'`analyse.ts` le 2026-11-07, tel quel, pour que la matrice d'auto-similarité le lise
 * hors du fil ; `analyse.ts` le réexporte.
 */
// Exporté : un consommateur du chemin d'alignement DTW (ex. un nœud
// d'étirement temporel) a besoin de connaître le pas en échantillons pour
// replacer un indice de trame `i`/`j` sur l'axe temporel — dupliquer cette
// constante ailleurs risquerait de diverger silencieusement si elle change ici.
export const SAUT_TRAME_CHROMAGRAMME = 512;

export function chromagrammeParTrame(donnees: Float32Array, sampleRate: number): number[][] {
  const fftTaille = 2048;
  const saut = SAUT_TRAME_CHROMAGRAMME;
  const fenetre = creerFenetreHann(fftTaille);
  const trames = tramesDepuisBuffer(donnees, fftTaille, saut, fenetre);
  const nbBins = fftTaille / 2 + 1;

  return trames.map((trame) => {
    const chroma = new Array(12).fill(0);
    for (let bin = 1; bin < nbBins; bin++) {
      const mag = Math.sqrt(trame.re[bin] ** 2 + trame.im[bin] ** 2);
      const freq = (bin * sampleRate) / fftTaille;
      if (freq < 65 || freq > 8000) continue;
      const midiNote = noteMidiDeFrequence(freq);
      const pc = ((Math.round(midiNote) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
    const maxTrame = Math.max(...chroma, 1e-10);
    return chroma.map((v) => v / maxTrame);
  });
}

/** Ce que reçoit la mesure : le premier canal, seul analysé, et sa fréquence. */
export interface DemandeAnalyse {
  mono: Float32Array;
  sampleRate: number;
}

export interface TempoMesure {
  bpm: number;
  corr: number;
}

export interface MesuresAnalyse {
  duree: number;
  /** Le tempo par les attaques d'énergie, puis par le flux spectral. */
  t1: TempoMesure;
  t2: TempoMesure;
  /** Le chromagramme du son entier, puis de chacune de ses moitiés. */
  chroma: number[];
  chroma1: number[];
  chroma2: number[];
  /** Les écarts types du centroïde, du taux de passage par zéro et de la part 300–3000 Hz. */
  ecCent: number;
  ecZCR: number;
  ecBand: number;
}

function ecartTypeVals(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const moy = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  const var_ = valeurs.reduce((a, b) => a + (b - moy) ** 2, 0) / valeurs.length;
  return Math.sqrt(var_);
}

export function mesurerAnalyse({ mono, sampleRate }: DemandeAnalyse): MesuresAnalyse {
  const duree = mono.length / sampleRate;
  const hopTempo = 512;

  // ── Enveloppe RMS (partagée) ──
  const nbFramesRMS = Math.max(1, Math.floor(mono.length / hopTempo));
  const enveloppe = new Float64Array(nbFramesRMS);
  for (let f = 0; f < nbFramesRMS; f++) {
    const offset = f * hopTempo;
    const n = Math.min(hopTempo, mono.length - offset);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += mono[offset + i] ** 2;
    enveloppe[f] = Math.sqrt(sum / n);
  }
  const onsets = new Float64Array(nbFramesRMS - 1);
  for (let i = 0; i < nbFramesRMS - 1; i++) onsets[i] = Math.max(0, enveloppe[i + 1] - enveloppe[i]);

  function tempoParAutocorr(seq: Float64Array, hop: number): TempoMesure {
    const minLag = Math.round(60 * sampleRate / hop / 200);
    const maxLag = Math.round(60 * sampleRate / hop / 40);
    let bestLag = 0, bestCorr = 0;
    for (let lag = minLag; lag <= Math.min(maxLag, Math.floor(seq.length / 2)); lag++) {
      let corr = 0, n = 0;
      for (let i = 0; i + lag < seq.length; i++, n++) corr += seq[i] * seq[i + lag];
      if (n > 0) corr /= n;
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    return { bpm: bestLag > 0 ? Math.round(60 * sampleRate / hop / bestLag) : 0, corr: bestCorr };
  }

  // ────── TEMPO ──────
  // Méthode 1 : onsets d'énergie RMS
  const t1 = tempoParAutocorr(onsets, hopTempo);

  // Méthode 2 : flux spectral (différence FFT)
  const fftFlux = 1024;
  const hopFlux = 512;
  const fenFlux = creerFenetreHann(fftFlux);
  const tramesFlux = tramesDepuisBuffer(mono, fftFlux, hopFlux, fenFlux);
  const nbBinsFlux = fftFlux / 2 + 1;
  const flux = new Float64Array(tramesFlux.length);
  let prevMag = new Float64Array(nbBinsFlux).fill(0);
  for (let t = 0; t < tramesFlux.length; t++) {
    let sum = 0;
    for (let b = 1; b < nbBinsFlux; b++) {
      const mag = Math.sqrt(tramesFlux[t].re[b] ** 2 + tramesFlux[t].im[b] ** 2);
      const diff = Math.max(0, mag - prevMag[b]);
      sum += diff;
      prevMag[b] = mag;
    }
    flux[t] = sum / nbBinsFlux;
  }
  const t2 = tempoParAutocorr(flux, hopFlux);

  // ────── TONALITÉ ──────
  const chroma = chromagramme(mono, sampleRate);
  // Analyse par moitiés avec les deux profils
  const moitie = Math.floor(mono.length / 2);
  const chroma1 = chromagramme(mono.slice(0, moitie), sampleRate);
  const chroma2 = chromagramme(mono.slice(moitie), sampleRate);

  // ────── SONG VS INSTRUMENTAL ──────
  const fftSI = 2048;
  const hopSI = 1024;
  const fenSI = creerFenetreHann(fftSI);
  const tramesSI = tramesDepuisBuffer(mono, fftSI, hopSI, fenSI);
  const nbBinsSI = fftSI / 2 + 1;
  const centroides: number[] = [];
  const bandRatios: number[] = [];

  for (const trame of tramesSI) {
    let sommeMag = 0, sommeFreq = 0, sommeMagVoix = 0;
    for (let bin = 1; bin < nbBinsSI; bin++) {
      const mag = Math.sqrt(trame.re[bin] ** 2 + trame.im[bin] ** 2);
      const freq = (bin * sampleRate) / fftSI;
      if (freq >= 200 && freq <= 4000) {
        sommeMag += mag;
        sommeFreq += freq * mag;
        if (freq >= 300 && freq <= 3000) sommeMagVoix += mag;
      }
    }
    if (sommeMag > 0) centroides.push(sommeFreq / sommeMag);
    if (sommeMag > 0) bandRatios.push(sommeMagVoix / sommeMag);
  }

  // ZCR
  const hopZCR = 512;
  const nZCR = Math.max(1, Math.floor(mono.length / hopZCR));
  const zcrs: number[] = [];
  for (let f = 0; f < nZCR; f++) {
    const offset = f * hopZCR;
    const n = Math.min(hopZCR, mono.length - offset);
    let z = 0;
    for (let i = 1; i < n; i++) {
      if ((mono[offset + i] >= 0) !== (mono[offset + i - 1] >= 0)) z++;
    }
    zcrs.push(z / n);
  }

  return {
    duree, t1, t2, chroma, chroma1, chroma2,
    ecCent: ecartTypeVals(centroides),
    ecZCR: ecartTypeVals(zcrs),
    ecBand: ecartTypeVals(bandRatios),
  };
}
