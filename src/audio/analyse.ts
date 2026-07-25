// audio/analyse.ts — Extrait de l'ancien monolithe DSP.
import { fft } from "./fft";
import type { NoteEvenement } from "./midi";
import { creerFenetreHann, tramesDepuisBuffer } from "./commun";
import Meyda from "meyda";
import { traduire } from "../i18n";

const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];

function normaliserAggregation(valeur: string): OptionsCentroidSpectral["aggregation"] {
  switch (valeur.toLowerCase()) {
    case "average": return "moyenne";
    case "median": return "mediane";
    case "maximum": return "maximum";
    default: return valeur as OptionsCentroidSpectral["aggregation"];
  }
}

function traduireAggregation(valeur: string): string {
  const map: Record<string, string> = {
    "moyenne": "analyse.aggregation_moyenne",
    "mediane": "analyse.aggregation_mediane",
    "maximum": "analyse.aggregation_maximum",
    "average": "analyse.aggregation_moyenne",
    "median": "analyse.aggregation_mediane",
  };
  return map[valeur.toLowerCase()] ? traduire(map[valeur.toLowerCase()]) : valeur;
}

function traduireType(valeur: string): string {
  const map: Record<string, string> = {
    "chanson": "analyse.chanson",
    "instrumental": "analyse.instrumental",
    "incertain": "analyse.incertain",
  };
  return map[valeur] ? traduire(map[valeur]) : valeur;
}

function tailleFenetreSuivante(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}

function trouverPicFFT(
  mono: Float64Array | Float32Array,
  debut: number,
  taille: number,
  sr: number,
  fenetre: Float64Array,
): { frequence: number; ampleur: number } {
  const n = Math.min(taille, mono.length - debut);
  if (n < 4) return { frequence: 0, ampleur: 0 };
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = mono[debut + i] * (fenetre[i] ?? 1);
  fft(re, im, false);
  const nbBins = Math.floor(n / 2);
  let picBin = -1;
  let picAmp = 0;
  for (let b = 1; b < nbBins; b++) {
    const amp = Math.hypot(re[b], im[b]);
    if (amp > picAmp) { picAmp = amp; picBin = b; }
  }
  if (picBin < 0) return { frequence: 0, ampleur: 0 };
  const freq = (picBin * sr) / n;
  return { frequence: freq, ampleur: picAmp };
}


export function transcrireMono(
  buffer: AudioBuffer,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
): NoteEvenement[] {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float64Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

  const fenetreRMS = Math.max(1, Math.round(sr * 0.01));
  const nbFrames = Math.ceil(length / fenetreRMS);
  const enveloppe = new Float64Array(nbFrames);
  for (let i = 0; i < nbFrames; i++) {
    const debut = i * fenetreRMS;
    const fin = Math.min(debut + fenetreRMS, length);
    let sumSq = 0;
    for (let j = debut; j < fin; j++) sumSq += mono[j] * mono[j];
    enveloppe[i] = Math.sqrt(sumSq / (fin - debut));
  }

  const maxEnv = Math.max(...enveloppe);
  if (maxEnv < 1e-9) return [];
  const seuil = maxEnv * (seuilOnset / 100);
  const seuilSol = maxEnv * 0.02;

  const onsetsSec: number[] = [];
  for (let i = 2; i < nbFrames - 2; i++) {
    if (enveloppe[i] > seuil && enveloppe[i] > enveloppe[i - 1] && enveloppe[i] > enveloppe[i + 1]) {
      if (onsetsSec.length === 0 || (i * fenetreRMS / sr) - onsetsSec[onsetsSec.length - 1] > 0.05) {
        onsetsSec.push((i * fenetreRMS) / sr);
      }
    }
  }
  if (onsetsSec.length === 0) { onsetsSec.push(0); }

  const tailleFFT = 4096;
  const fenetre = new Float64Array(tailleFFT);
  for (let i = 0; i < tailleFFT; i++) fenetre[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (tailleFFT - 1)));

  const notes: NoteEvenement[] = [];
  for (let i = 0; i < onsetsSec.length; i++) {
    const tDebut = onsetsSec[i];
    const tFin = i + 1 < onsetsSec.length ? onsetsSec[i + 1] : buffer.duration;
    const duree = tFin - tDebut;
    if (duree < 0.04) continue;

    const milieuEch = Math.round(((tDebut + tFin) / 2) * sr);
    const analyseDebut = Math.max(0, milieuEch - tailleFFT / 2);
    const pic = trouverPicFFT(mono, analyseDebut, tailleFFT, sr, fenetre);
    if (pic.ampleur < seuilSol || pic.frequence < 30) continue;

    const noteMidi = Math.round(69 + 12 * Math.log2(pic.frequence / 440));
    if (noteMidi < noteMin || noteMidi > noteMax) continue;

    const vel = Math.min(127, Math.round((pic.ampleur / maxEnv) * 127));
    notes.push({ note: noteMidi, velocite: Math.max(1, vel), debut: tDebut, fin: tFin });
  }
  return notes;
}


export interface OptionsCentroidSpectral {
  fenetre?: number;
  pas?: number;
  aggregation?: "moyenne" | "mediane" | "maximum";
}

export interface ResultatCentroidSpectral {
  valeur: number;
  texte: string;
  trames: number;
}

export type MeydaFeatureSimple =
  | "rms"
  | "zcr"
  | "spectralCentroid"
  | "spectralRolloff"
  | "spectralFlatness"
  | "spectralSpread"
  | "energy";

export function extraireValeursMeyda(
  buffer: AudioBuffer,
  feature: MeydaFeatureSimple,
  options: OptionsCentroidSpectral = {},
): number[] {
  const fenetre = tailleFenetreSuivante(options.fenetre || 2048);
  const pas = Math.max(64, options.pas || Math.floor(fenetre / 2));
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / nCh;
  }

  Meyda.sampleRate = sr;
  Meyda.bufferSize = fenetre;
  Meyda.windowingFunction = "hanning";

  const valeurs: number[] = [];
  for (let debut = 0; debut + fenetre <= length; debut += pas) {
    const frame = mono.slice(debut, debut + fenetre);
    const features = Meyda.extract(feature, frame);
    const val = typeof features === "number" ? features : (features as any)?.[feature];
    if (typeof val === "number" && Number.isFinite(val)) valeurs.push(val);
  }
  return valeurs;
}

export function agregerValeurs(
  valeurs: number[],
  aggregation: OptionsCentroidSpectral["aggregation"] = "moyenne",
): number {
  if (valeurs.length === 0) return 0;
  switch (aggregation) {
    case "mediane": {
      const sorted = [...valeurs].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case "maximum":
      return Math.max(...valeurs);
    case "moyenne":
    default:
      return valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  }
}

export function calculerCentroidSpectralMeyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const fenetre = tailleFenetreSuivante(options.fenetre || 2048);
  const facteurHz = buffer.sampleRate / fenetre;
  const valeurs = extraireValeursMeyda(buffer, "spectralCentroid", options).map((v) => v * facteurHz);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.centroide_spectral_label")), trames: 0 };
  }

  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.centroide_spectral", valeur.toFixed(1), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

export function calculerRMS_Meyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const valeurs = extraireValeursMeyda(buffer, "rms", options);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: -Infinity, texte: traduire("analyse.non_calculable", traduire("analyse.rms_label")), trames: 0 };
  }
  const rms = agregerValeurs(valeurs, aggregation);
  const db = 20 * Math.log10(rms + 1e-10);
  const texte = traduire("analyse.rms", db.toFixed(1), aggLabel, valeurs.length);
  return { valeur: db, texte, trames: valeurs.length };
}

export function calculerZCR_Meyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const valeurs = extraireValeursMeyda(buffer, "zcr", options);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.zcr_label")), trames: 0 };
  }
  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.zcr", valeur.toFixed(0), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

export function calculerRolloffSpectralMeyda(
  buffer: AudioBuffer,
  options: OptionsCentroidSpectral = {},
): ResultatCentroidSpectral {
  const fenetre = tailleFenetreSuivante(options.fenetre || 2048);
  const facteurHz = buffer.sampleRate / fenetre;
  const valeurs = extraireValeursMeyda(buffer, "spectralRolloff", options).map((v) => v * facteurHz);
  const aggregation = normaliserAggregation(options.aggregation || "moyenne");
  const aggLabel = traduireAggregation(options.aggregation || "moyenne");
  if (valeurs.length === 0) {
    return { valeur: 0, texte: traduire("analyse.non_calculable", traduire("analyse.rolloff_spectral_label")), trames: 0 };
  }
  const valeur = agregerValeurs(valeurs, aggregation);
  const texte = traduire("analyse.rolloff_spectral", valeur.toFixed(1), aggLabel, valeurs.length);
  return { valeur, texte, trames: valeurs.length };
}

export async function transcrirePolyphonique(
  buffer: AudioBuffer,
  seuilOnset: number,
  noteMin: number,
  noteMax: number,
  surProgres?: (pct: number) => void,
): Promise<NoteEvenement[]> {
  let session: import("onnxruntime-web").InferenceSession;
  let ort: typeof import("onnxruntime-web");
  try {
    ort = await import("onnxruntime-web");
    const URL_MODELE = "https://huggingface.co/Politrees/UVR_resources/resolve/main/models/BasicPitch/basic_pitch.onnx";
    const rep = await fetch(URL_MODELE);
    if (!rep.ok) throw new Error("HTTP " + rep.status);
    const donnees = await rep.arrayBuffer();
    session = await ort.InferenceSession.create(new Uint8Array(donnees), { executionProviders: ["wasm"] });

    const srCible = 22050;
    const sr = buffer.sampleRate;
    const nCh = buffer.numberOfChannels;
    const length = buffer.length;
    const duree = length / sr;
    const nbEch = Math.ceil(duree * srCible);
    const mono = new Float32Array(nbEch);
    for (let i = 0; i < nbEch; i++) {
      const posSrc = (i / srCible) * sr;
      const idx = Math.floor(posSrc);
      const frac = posSrc - idx;
      if (idx + 1 >= length) { mono[i] = 0; continue; }
      let s = 0;
      for (let c = 0; c < nCh; c++) {
        const ch = buffer.getChannelData(c);
        s += (ch[idx] * (1 - frac) + ch[Math.min(idx + 1, length - 1)] * frac) / nCh;
      }
      mono[i] = s;
    }

    const hop = 256;
    const nomEntree = session.inputNames[0];
    const tenseur = new ort.Tensor("float32", mono, [1, 1, nbEch]);
    const sorties: Record<string, import("onnxruntime-web").Tensor> = await session.run({ [nomEntree]: tenseur });
    const nomSortie = session.outputNames[0];
    const donneesSortie = sorties[nomSortie].data as Float32Array;
    const dims = sorties[nomSortie].dims!;
    const T = dims[1] as number;
    const K = dims[2] as number;
    const seuil = seuilOnset / 100;

    const notes: NoteEvenement[] = [];
    for (let k = 0; k < K; k++) {
      const noteMidi = k + 21;
      if (noteMidi < noteMin || noteMidi > noteMax) continue;
      let debutTrame: number | null = null;
      let maxVel = 0;
      for (let t = 0; t < T; t++) {
        const onset = donneesSortie[(t * K + k) * 3];
        const vel = donneesSortie[(t * K + k) * 3 + 2];
        if (onset > seuil && debutTrame === null) { debutTrame = t; maxVel = vel; }
        else if (debutTrame !== null) { maxVel = Math.max(maxVel, vel); }
        if (debutTrame !== null && (t === T - 1 || (onset <= seuil && t > debutTrame + 1))) {
          const debutSec = (debutTrame * hop) / srCible;
          const finSec = (t * hop) / srCible;
          if (finSec - debutSec > 0.03) {
            notes.push({ note: noteMidi, velocite: Math.min(127, Math.round(maxVel * 127)), debut: debutSec, fin: finSec });
          }
          debutTrame = onset > seuil ? t : null;
          maxVel = vel;
        }
      }
      surProgres?.(Math.round((k / K) * 100));
    }
    surProgres?.(100);
    return notes;
  } catch (e) {
    if (surProgres) surProgres(0);
    console.warn("Basic Pitch non disponible, fallback FFT :", e);
    return transcrireMono(buffer, seuilOnset, noteMin, noteMax);
  }
}


export interface AnalyseResultat {
  tempo: number;
  tempoConfiance: number;
  tonalites: { debut: number; fin: number; tonalite: string; confiance: number }[];
  songVsInstrumental: "chanson" | "instrumental" | "incertain";
  description: string;
}


const NOMS_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Profils Krumhansl-Kessler (1982)

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];

const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Profils Temperley (2001) — optimisés pour la musique populaire

const TEMP_MAJOR = [5.0, 2.0, 3.5, 2.5, 4.5, 4.0, 2.5, 5.0, 2.5, 3.5, 1.5, 4.0];

const TEMP_MINOR = [5.0, 2.5, 3.5, 4.5, 2.5, 4.0, 2.5, 5.0, 3.5, 2.5, 1.5, 4.0];


function chromagramme(donnees: Float32Array, sampleRate: number): number[] {
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
      const midiNote = 12 * Math.log2(freq / 440) + 69;
      const pc = ((Math.round(midiNote) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
  }

  const max = Math.max(...chroma, 1e-10);
  return chroma.map((v) => v / max);
}


function meilleureCorrelation(chroma: number[], profil: number[]): { shift: number; corr: number } {
  let bestShift = 0;
  let bestCorr = -Infinity;
  for (let shift = 0; shift < 12; shift++) {
    let corr = 0;
    for (let i = 0; i < 12; i++) corr += chroma[(i + shift) % 12] * profil[i];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestShift = shift;
    }
  }
  return { shift: bestShift, corr: bestCorr };
}


function ecartTypeVals(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const moy = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
  const var_ = valeurs.reduce((a, b) => a + (b - moy) ** 2, 0) / valeurs.length;
  return Math.sqrt(var_);
}


export function analyserAudio(buffer: AudioBuffer): AnalyseResultat {
  const sampleRate = buffer.sampleRate;
  const mono = buffer.getChannelData(0);
  const duree = buffer.length / sampleRate;
  const lignes: string[] = [];
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

  function tempoParAutocorr(seq: Float64Array, hop: number): { bpm: number; corr: number } {
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

  lignes.push(traduire("analyse.tempo"));
  lignes.push(traduire("analyse.rms_autocorr", t1.bpm, (t1.corr * 100).toFixed(0)));
  lignes.push(traduire("analyse.flux_autocorr", t2.bpm, (t2.corr * 100).toFixed(0)));

  const accords = t1.bpm && t2.bpm && Math.abs(t1.bpm - t2.bpm) <= 10;
  const meilleur = t1.corr >= t2.corr ? t1 : t2;
  const tempoFinal = accords ? Math.round((t1.bpm + t2.bpm) / 2) : meilleur.bpm;
  const suffix = accords ? traduire("analyse.accord_methodes") : traduire("analyse.methode_plus_confiante");
  lignes.push(traduire("analyse.retenu", tempoFinal, suffix));

  // ────── TONALITÉ ──────
  const chroma = chromagramme(mono, sampleRate);

  function evaluerProfil(profilMaj: number[], profilMin: number[], etiquette: string): string {
    const m = meilleureCorrelation(chroma, profilMaj);
    const n = meilleureCorrelation(chroma, profilMin);
    const r = m.corr >= n.corr
      ? `${traduire("analyse.nom_majeur", NOMS_NOTES[m.shift])} (${(m.corr / 60 * 100).toFixed(0)}%)`
      : `${traduire("analyse.nom_mineur", NOMS_NOTES[n.shift])} (${(n.corr / 60 * 100).toFixed(0)}%)`;
    return traduire("analyse.profil", etiquette, r);
  }

  lignes.push(traduire("analyse.tonalite"));
  const kkGlobal = evaluerProfil(KK_MAJOR, KK_MINOR, "Krumhansl-Kessler");
  const tpGlobal = evaluerProfil(TEMP_MAJOR, TEMP_MINOR, "Temperley");
  lignes.push(`  ${kkGlobal}`);
  lignes.push(`  ${tpGlobal}`);

  const { shift: sMajKK, corr: cMajKK } = meilleureCorrelation(chroma, KK_MAJOR);
  const { shift: sMinKK, corr: cMinKK } = meilleureCorrelation(chroma, KK_MINOR);
  const { shift: sMajTP, corr: cMajTP } = meilleureCorrelation(chroma, TEMP_MAJOR);
  const { shift: sMinTP, corr: cMinTP } = meilleureCorrelation(chroma, TEMP_MINOR);
  const bestKK = cMajKK >= cMinKK
    ? { nom: `${NOMS_NOTES[sMajKK]} majeur`, conf: cMajKK, mineur: false }
    : { nom: `${NOMS_NOTES[sMinKK]} mineur`, conf: cMinKK, mineur: true };
  const bestTP = cMajTP >= cMinTP
    ? { nom: `${NOMS_NOTES[sMajTP]} majeur`, conf: cMajTP, mineur: false }
    : { nom: `${NOMS_NOTES[sMinTP]} mineur`, conf: cMinTP, mineur: true };
  const principale = bestKK.conf >= bestTP.conf ? bestKK : bestTP;

  // Analyse par moitiés avec les deux profils
  const moitie = Math.floor(mono.length / 2);
  const chroma1 = chromagramme(mono.slice(0, moitie), sampleRate);
  const chroma2 = chromagramme(mono.slice(moitie), sampleRate);

  function profilermoitie(chr: number[], label: string): string[] {
    const mk = meilleureCorrelation(chr, KK_MAJOR);
    const nk = meilleureCorrelation(chr, KK_MINOR);
    const kk = mk.corr >= nk.corr
      ? traduire("analyse.nom_majeur", NOMS_NOTES[mk.shift])
      : traduire("analyse.nom_mineur", NOMS_NOTES[nk.shift]);
    const mt = meilleureCorrelation(chr, TEMP_MAJOR);
    const nt = meilleureCorrelation(chr, TEMP_MINOR);
    const tp = mt.corr >= nt.corr
      ? traduire("analyse.nom_majeur", NOMS_NOTES[mt.shift])
      : traduire("analyse.nom_mineur", NOMS_NOTES[nt.shift]);
    return [
      traduire("analyse.profil", `${traduire("analyse.kk")}    ${label}`, kk),
      traduire("analyse.profil", `${traduire("analyse.temp")}  ${label}`, tp),
    ];
  }

  lignes.push(traduire("analyse.par_moitiers"));
  lignes.push(...profilermoitie(chroma1, `0–${(duree / 2).toFixed(1)}s`));
  lignes.push(...profilermoitie(chroma2, `${(duree / 2).toFixed(1)}–${duree.toFixed(1)}s`));

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

  const ecCent = ecartTypeVals(centroides);
  const ecZCR = ecartTypeVals(zcrs);
  const ecBand = ecartTypeVals(bandRatios);

  function classer(v: number, seuilHaut: number, seuilBas: number): "chanson" | "instrumental" | "incertain" {
    if (v > seuilHaut) return "chanson";
    if (v > seuilBas) return "incertain";
    return "instrumental";
  }

  const v1 = classer(ecCent, 500, 250);
  const v2 = classer(ecZCR, 0.08, 0.04);
  const v3 = classer(ecBand, 0.2, 0.1);

  lignes.push(traduire("analyse.type"));
  lignes.push(traduire("analyse.centroide", ecCent.toFixed(0), traduireType(v1)));
  lignes.push(traduire("analyse.zcr_taux", ecZCR.toFixed(4), traduireType(v2)));
  lignes.push(traduire("analyse.energie_300_3000", ecBand.toFixed(3), traduireType(v3)));

  const votesChanson = [v1, v2, v3].filter((v) => v === "chanson").length;
  const votesInstru = [v1, v2, v3].filter((v) => v === "instrumental").length;
  const songVsInstrumental: "chanson" | "instrumental" | "incertain" =
    votesChanson >= 2 ? "chanson" : votesInstru >= 2 ? "instrumental" : "incertain";
  lignes.push(traduire("analyse.verdict", traduireType(songVsInstrumental)));

  return {
    tempo: tempoFinal,
    tempoConfiance: Math.min(1, meilleur.corr * 20),
    tonalites: [{ debut: 0, fin: duree, tonalite: `${traduire(principale.mineur ? "analyse.nom_mineur" : "analyse.nom_majeur", principale.nom.split(" ")[0])} (K-K: ${kkGlobal.split(" : ")[1]}, Temp: ${tpGlobal.split(" : ")[1]})`, confiance: principale.conf }],
    songVsInstrumental,
    description: lignes.join("\n"),
  };
}

// ─── Sampler personnalisé (wavetable à partir d'un échantillon) ───


const GENRE_MODELE_URL =
  "https://huggingface.co/Jeev12/GTZAN_Genre_Classification/resolve/main/model.onnx";


export const ETIQUETTES_GENRE = [
  "blues", "classique", "country", "disco", "hip-hop",
  "jazz", "metal", "pop", "reggae", "rock",
];


function hzVersMel(hz: number): number { return 2595 * Math.log10(1 + hz / 700); }

function melVersHz(mel: number): number { return 700 * (10 ** (mel / 2595) - 1); }


function bancMel(nMels: number, tailleFFT: number, sr: number): Float64Array[] {
  const nbBins = Math.floor(tailleFFT / 2) + 1;
  const mMin = hzVersMel(0), mMax = hzVersMel(sr / 2);
  const pm = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) pm[i] = melVersHz(mMin + (mMax - mMin) * i / (nMels + 1));
  const filtres: Float64Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const f = new Float64Array(nbBins);
    for (let k = 0; k < nbBins; k++) {
      const freq = (k * sr) / tailleFFT;
      if (freq <= pm[m]) f[k] = 0;
      else if (freq <= pm[m + 1]) f[k] = (freq - pm[m]) / (pm[m + 1] - pm[m]);
      else if (freq <= pm[m + 2]) f[k] = (pm[m + 2] - freq) / (pm[m + 2] - pm[m + 1]);
      else f[k] = 0;
    }
    filtres.push(f);
  }
  return filtres;
}


function logMelSpectrogramme(
  mono: Float64Array, sr: number, tailleFFT: number, saut: number, nMels: number,
): Float32Array[] {
  const fen = new Float64Array(tailleFFT);
  for (let i = 0; i < tailleFFT; i++) fen[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (tailleFFT - 1));
  const filtres = bancMel(nMels, tailleFFT, sr);
  const nbFr = Math.max(0, Math.floor((mono.length - tailleFFT) / saut) + 1);
  if (nbFr === 0) return [];
  const trames: Float32Array[] = [];
  for (let f = 0; f < nbFr; f++) {
    const debut = f * saut;
    const re = new Float64Array(tailleFFT), im = new Float64Array(tailleFFT);
    for (let i = 0; i < tailleFFT; i++) re[i] = mono[debut + i] * fen[i];
    fft(re, im, false);
    const mel = new Float32Array(nMels);
    const nbBins = Math.floor(tailleFFT / 2) + 1;
    for (let m = 0; m < nMels; m++) {
      let acc = 0;
      for (let b = 1; b < nbBins; b++) acc += (re[b] * re[b] + im[b] * im[b]) * filtres[m][b];
      mel[m] = Math.log(Math.max(acc, 1e-10));
    }
    trames.push(mel);
  }
  return trames;
}


export interface ResultatGenre { genre: string; confiance: number; description?: string }


export async function classerGenre(buffer: AudioBuffer, dureeAnalyse: number = 30, modeleBuffer?: ArrayBuffer): Promise<ResultatGenre[]> {
  const sr = buffer.sampleRate, nCh = buffer.numberOfChannels;
  const dMax = Math.min(buffer.duration, dureeAnalyse), nb = Math.floor(dMax * sr);
  const mono = new Float64Array(nb);
  for (let i = 0; i < nb; i++) { let s = 0; for (let c = 0; c < nCh; c++) s += buffer.getChannelData(c)[i] / nCh; mono[i] = s; }
  const srC = 22050, r = srC / sr, nbC = Math.floor(nb * r);
  const monoC = new Float64Array(nbC);
  for (let i = 0; i < nbC; i++) {
    const src = i / r, idx = Math.floor(src), frac = src - idx;
    monoC[i] = idx + 1 < nb ? mono[idx] * (1 - frac) + mono[idx + 1] * frac : mono[Math.min(idx, nb - 1)];
  }

  // ── Analyse heuristique (toujours exécutée) ──
  const hopA = 512;
  const nFramesA = Math.max(1, Math.floor(monoC.length / hopA));
  const env = new Float64Array(nFramesA);
  for (let f = 0; f < nFramesA; f++) {
    const off = f * hopA; const n = Math.min(hopA, monoC.length - off);
    let sum = 0; for (let i = 0; i < n; i++) sum += monoC[off + i] ** 2;
    env[f] = Math.sqrt(sum / n);
  }
  const onsets = new Float64Array(nFramesA - 1);
  for (let i = 0; i < nFramesA - 1; i++) onsets[i] = Math.max(0, env[i + 1] - env[i]);

  // Tempo
  function tempoAuto(seq: Float64Array, hop: number): { bpm: number; corr: number } {
    const minL = Math.round(60 * srC / hop / 200), maxL = Math.round(60 * srC / hop / 40);
    let bestL = 0, bestC = 0;
    for (let lag = minL; lag <= Math.min(maxL, Math.floor(seq.length / 2)); lag++) {
      let corr = 0, n = 0;
      for (let i = 0; i + lag < seq.length; i++, n++) corr += seq[i] * seq[i + lag];
      if (n > 0) corr /= n;
      if (corr > bestC) { bestC = corr; bestL = lag; }
    }
    return { bpm: bestL > 0 ? Math.round(60 * srC / hop / bestL) : 0, corr: bestC };
  }
  const t1 = tempoAuto(onsets, hopA);

  // Flux spectral
  const fftFlux = 1024, hopFlux = 512;
  const fenFlux = new Float64Array(fftFlux);
  for (let i = 0; i < fftFlux; i++) fenFlux[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftFlux - 1));
  const nbFrFlux = Math.max(0, Math.floor((monoC.length - fftFlux) / hopFlux) + 1);
  const flux = new Float64Array(nbFrFlux);
  const nbBinsFlux = fftFlux / 2 + 1;
  let prevM = new Float64Array(nbBinsFlux);
  for (let f = 0; f < nbFrFlux; f++) {
    const re = new Float64Array(fftFlux), im = new Float64Array(fftFlux);
    for (let i = 0; i < fftFlux; i++) re[i] = monoC[f * hopFlux + i] * fenFlux[i];
    fft(re, im, false);
    let s = 0;
    for (let b = 1; b < nbBinsFlux; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      s += Math.max(0, mag - prevM[b]);
      prevM[b] = mag;
    }
    flux[f] = s / nbBinsFlux;
  }
  const t2 = tempoAuto(flux, hopFlux);
  const accordTempo = t1.bpm && t2.bpm && Math.abs(t1.bpm - t2.bpm) <= 10;
  const tFinal = accordTempo ? Math.round((t1.bpm + t2.bpm) / 2) : (t1.corr >= t2.corr ? t1.bpm : t2.bpm);

  // Chromagramme + tonalité
  const fftC = 2048, hopC = 512;
  const fenC = new Float64Array(fftC);
  for (let i = 0; i < fftC; i++) fenC[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftC - 1));
  const nbFrC = Math.max(0, Math.floor((monoC.length - fftC) / hopC) + 1);
  const chroma = new Float64Array(12);
  for (let f = 0; f < nbFrC; f++) {
    const re = new Float64Array(fftC), im = new Float64Array(fftC);
    for (let i = 0; i < fftC; i++) re[i] = monoC[f * hopC + i] * fenC[i];
    fft(re, im, false);
    const nbBinsC = fftC / 2 + 1;
    for (let b = 1; b < nbBinsC; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const freq = (b * srC) / fftC;
      if (freq < 65 || freq > 8000) continue;
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += mag;
    }
  }
  const maxC = Math.max(...chroma, 1e-10);
  for (let i = 0; i < 12; i++) chroma[i] /= maxC;

  const KK_M = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_m = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function bestKey(c: Float64Array, p: number[]): { s: number; v: number } {
    let bs = 0, bv = -Infinity;
    for (let s = 0; s < 12; s++) { let v = 0; for (let i = 0; i < 12; i++) v += c[(i + s) % 12] * p[i]; if (v > bv) { bv = v; bs = s; } }
    return { s: bs, v: bv };
  }
  const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const kM = bestKey(chroma, KK_M), km = bestKey(chroma, KK_m);
  const cle = kM.v >= km.v ? `${NOMS[kM.s]} majeur` : `${NOMS[km.s]} mineur`;
  const confCle = Math.round(Math.max(kM.v, km.v) / 60 * 100);

  // Centroïde spectral, rolloff, flatness
  const fftS = 2048, hopS = 1024;
  const fenS = new Float64Array(fftS);
  for (let i = 0; i < fftS; i++) fenS[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftS - 1));
  const nbFrS = Math.max(0, Math.floor((monoC.length - fftS) / hopS) + 1);
  const nbBinsS = fftS / 2 + 1;
  const centroides: number[] = [], rolloffs: number[] = [], flatness: number[] = [];
  let sumBasse = 0, sumMid = 0, sumAigue = 0;
  const zcrVals: number[] = [];

  for (let f = 0; f < nbFrS; f++) {
    const re = new Float64Array(fftS), im = new Float64Array(fftS);
    for (let i = 0; i < fftS; i++) re[i] = monoC[f * hopS + i] * fenS[i];
    fft(re, im, false);

    let sMag = 0, sFreq = 0;
    let rMag = 0; const rThresh = 0.85;
    let geoMean = 0, ariMean = 0;
    for (let b = 1; b < nbBinsS; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const freq = (b * srC) / fftS;
      sMag += mag; sFreq += freq * mag;
      if (sMag > 0) {
        rMag += mag;
        if (rMag / sMag >= rThresh && rolloffs.length > f - 1 ? f === rolloffs.length : true) {
          if (rolloffs.length <= f) rolloffs.push(freq);
        }
      }
      const magD = Math.max(mag, 1e-10);
      geoMean += Math.log(magD); ariMean += magD;
      if (b > 0) {
        if (freq <= 250) sumBasse += mag;
        else if (freq <= 2000) sumMid += mag;
        else sumAigue += mag;
      }
    }
    if (sMag > 0) centroides.push(sFreq / sMag);
    if (rolloffs.length <= f) rolloffs.push(0);
    const nB = nbBinsS - 1;
    if (ariMean > 0 && geoMean > -Infinity) flatness.push(Math.exp(geoMean / nB) / (ariMean / nB));
  }

  // ZCR frames
  for (let d = 0; d + 1024 <= monoC.length; d += 512) {
    let z = 0;
    for (let i = 1; i < 1024; i++) if ((monoC[d + i] >= 0) !== (monoC[d + i - 1] >= 0)) z++;
    zcrVals.push(z / 1024);
  }

  const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };

  const centM = mean(centroides), centS = std(centroides);
  const flatM = mean(flatness);
  const zcrM = mean(zcrVals);
  const rmsM = mean(Array.from(env));

  // Énergie par bande
  const totalE = sumBasse + sumMid + sumAigue + 1e-10;
  const eBasse = sumBasse / totalE, eMid = sumMid / totalE, eAigue = sumAigue / totalE;

  // ── Scoring multi-genre ──
  const scoresGenre: Record<string, number> = {};

  function add(g: string, s: number) { scoresGenre[g] = (scoresGenre[g] || 0) + s; }

  // Énergie / distorsion
  if (rmsM > 0.25) { add("metal", 3); add("hard rock", 2); }
  else if (rmsM > 0.12) { add("rock", 2); add("punk", 1); add("electro", 1); }
  else if (rmsM < 0.03) { add("ambient", 3); add("classique", 1); }

  // Tempo
  if (tFinal > 160) { add("metal", 2); add("drum & bass", 2); add("punk", 1); }
  else if (tFinal > 120) { add("rock", 2); add("house", 2); add("disco", 1); add("pop", 1); }
  else if (tFinal > 90) { add("hip-hop", 2); add("pop", 2); add("rnb", 1); add("reggae", 1); }
  else if (tFinal > 60) { add("jazz", 2); add("blues", 2); add("classique", 1); }
  else { add("ambient", 3); add("classique", 2); add("downtempo", 2); }

  // Centroïde spectral (brillance)
  if (centM > 2000) { add("electro", 2); add("house", 1); add("pop", 1); }
  else if (centM > 1200) { add("rock", 1); add("pop", 1); }
  else if (centM < 800) { add("classique", 2); add("jazz", 2); add("ambient", 1); }

  // Variance centroïde (voix / instrumental)
  if (centS > 600) { add("pop", 2); add("soul", 1); }  // voix
  else if (centS < 200) { add("classique", 2); add("ambient", 1); }  // instrumental stable

  // ZCR (attaque / bruit)
  if (zcrM > 0.3) { add("metal", 2); add("electro", 1); add("rock", 1); }
  else if (zcrM > 0.15) { add("pop", 2); add("rock", 1); add("rnb", 1); }
  else if (zcrM < 0.08) { add("classique", 2); add("ambient", 2); add("jazz", 1); }

  // Platitude spectrale (tonalité spectrale)
  if (flatM < 0.3) { add("classique", 2); add("jazz", 2); add("blues", 1); }  // tonal
  else if (flatM > 0.6) { add("metal", 2); add("electro", 1); add("noise", 1); }  // bruité

  // Énergie basses
  if (eBasse > 0.4) { add("hip-hop", 3); add("dubstep", 2); add("drum & bass", 2); add("reggae", 1); }
  else if (eBasse > 0.25) { add("rock", 1); add("house", 1); add("pop", 1); }
  else if (eBasse < 0.12) { add("classique", 2); add("ambient", 1); }

  // Énergie aiguës
  if (eAigue > 0.35) { add("metal", 2); add("electro", 1); }
  else if (eAigue > 0.2) { add("pop", 1); add("rock", 1); }

  // Tonalité → genres
  if (cle.includes("mineur")) { add("blues", 2); add("classique", 1); add("jazz", 1); }

  // Tri + normalisation
  const scSorted = Object.entries(scoresGenre)
    .map(([genre, score]) => ({ genre, score }))
    .sort((a, b) => b.score - a.score);
  const scTotal = scSorted.reduce((s, v) => s + v.score, 0);
  const _topGenres = scSorted.slice(0, 5).map((s) => ({
    genre: s.genre,
    confiance: scTotal > 0 ? s.score / scTotal : 0,
  }));

  // ── Description textuelle ──
  const isMineur = cle.includes("mineur");
  const noteCle = cle.split(" ")[0];
  const descr: string[] = [];
  descr.push(traduire("analyse.caracteristiques"));
  descr.push(traduire("analyse.tempo_label", tFinal > 0 ? `${tFinal} BPM` : traduire("analyse.non_detecte")));
  descr.push(traduire("analyse.tonalite_label", traduire(isMineur ? "analyse.nom_mineur" : "analyse.nom_majeur", noteCle), confCle));
  descr.push(traduire("analyse.energie_rms", (rmsM * 1000).toFixed(0)));
  descr.push(traduire("analyse.centroide_label", centM.toFixed(0), centS.toFixed(0)));
  descr.push(traduire("analyse.zcr_moyen", (zcrM * 100).toFixed(1)));
  descr.push(traduire("analyse.platitude", (flatM * 100).toFixed(0)));
  descr.push("");
  descr.push(traduire("analyse.repartition"));
  descr.push(traduire("analyse.graves", (eBasse * 100).toFixed(0)));
  descr.push(traduire("analyse.mediums", (eMid * 100).toFixed(0)));
  descr.push(traduire("analyse.aigus", (eAigue * 100).toFixed(0)));

  // ── Essai ONNX pour les étiquettes de genre ──
  const tailleF = 2048, hopM = 512, nM = 128;
  const trames = logMelSpectrogramme(monoC, srC, tailleF, hopM, nM);
  let genresOnnx: { genre: string; score: number }[] | null = null;
  let erreurOnnx = "";
  if (trames.length > 0) {
    try {
      const ort = await import("onnxruntime-web");
      let d: ArrayBuffer;
      if (modeleBuffer) {
        d = modeleBuffer;
      } else {
        const rep = await fetch(GENRE_MODELE_URL);
        if (!rep.ok) throw new Error("HTTP " + rep.status);
        d = await rep.arrayBuffer();
      }
      const sess = await ort.InferenceSession.create(new Uint8Array(d), { executionProviders: ["wasm"] });
      const nF = trames.length;
      const td = new Float32Array(nF * nM);
      for (let f = 0; f < nF; f++) td.set(trames[f], f * nM);
      const nomEntree = sess.inputNames[0];
      const ten = new ort.Tensor("float32", td, [1, nF * nM]);
      const out = await sess.run({ [nomEntree]: ten });
      const data = out[sess.outputNames[0]].data as Float32Array;
      const nC = data.length;
      const scoresOnnx: { idx: number; score: number }[] = [];
      for (let i = 0; i < nC; i++) scoresOnnx.push({ idx: i, score: data[i] });
      scoresOnnx.sort((a, b) => b.score - a.score);
      const mL = Math.min(nC, ETIQUETTES_GENRE.length) - 1;
      genresOnnx = scoresOnnx.slice(0, 5).map((s) => ({
        genre: s.idx <= mL ? ETIQUETTES_GENRE[s.idx] : `#${s.idx}`,
        score: s.score,
      }));
    } catch (e: any) { erreurOnnx = e.message || String(e); }
  }

  let genres: { genre: string; confiance: number }[];
  if (genresOnnx && genresOnnx.length > 0) {
    genres = genresOnnx.map((g) => ({ genre: g.genre, confiance: g.score }));
    descr.push("");
    descr.push(traduire("msg.genres_modele_onnx"));
    descr.push(genres.slice(0, 3).map((g) => `${g.genre} (${Math.round(g.confiance * 100)}%)`).join(" · "));
  } else {
    const scSorted = Object.entries(scoresGenre).map(([g, s]) => ({ genre: g, score: s })).sort((a, b) => b.score - a.score);
    const scTotal = scSorted.reduce((s, v) => s + v.score, 0);
    genres = scSorted.slice(0, 5).map((s) => ({ genre: s.genre, confiance: scTotal > 0 ? s.score / scTotal : 0 }));
    descr.push("");
    if (modeleBuffer && erreurOnnx) {
      descr.push(traduire("msg.genres_onnx_echou"));
      descr.push(traduire("msg.erreur_var_0", erreurOnnx));
    }
    descr.push(traduire("msg.genres_heuristiques"));
    descr.push(genres.map((g) => `${g.genre} (${Math.round(g.confiance * 100)}%)`).join(" · "));
  }

  return [{ genre: genres[0]?.genre || traduire("msg.inconnu"), confiance: genres[0]?.confiance || 0, description: descr.join("\n") }];
}

// ─── Générateur musical par script descriptif ───

