// audio/griffin-lim.ts — Algorithme de reconstruction phase/magnitude (Griffin-Lim).
// Reconstruit un signal audio à partir du spectrogramme de magnitude de l'entrée
// en itérant sur la phase. Utile comme effet créatif (textures, drones) ou pour
// l'audio généré par réseaux qui prédisent uniquement la magnitude.
import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

interface SpectralFrame {
  start: number;
  mag: Float64Array;
  phase: Float64Array;
}

function prochainePuissanceDeDeux(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}

function analyserSignal(
  signal: Float32Array | Float64Array,
  fftSize: number,
  hop: number,
  window: Float64Array,
): SpectralFrame[] {
  const frames: SpectralFrame[] = [];
  const nbBins = fftSize / 2 + 1;
  for (let start = 0; start < signal.length; start += hop) {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i;
      if (idx < signal.length) re[i] = signal[idx] * window[i];
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
  return frames;
}

function synthetiserSignal(
  frames: SpectralFrame[],
  fftSize: number,
  hop: number,
  window: Float64Array,
  length: number,
): Float64Array {
  const out = new Float64Array(length);
  const norm = new Float64Array(length);
  const nbBins = fftSize / 2 + 1;

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
    // Nyquist à zéro pour FFT paire
    if (fftSize % 2 === 0) {
      im[nbBins - 1] = 0;
    }

    fft(re, im, true);
    for (let i = 0; i < fftSize; i++) {
      const idx = frame.start + i;
      if (idx < length) {
        out[idx] += re[i] * window[i];
        norm[idx] += window[i] * window[i];
      }
    }
  }

  for (let i = 0; i < length; i++) {
    out[i] = norm[i] > 0 ? out[i] / norm[i] : 0;
  }
  return out;
}

export function picAbsolu(data: ArrayLike<number>): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > max) max = a;
  }
  return max;
}

export async function griffinLim(
  buffer: AudioBuffer,
  iterations: number = 60,
  fftSizeInput: number = 2048,
  recouvrement: "50%" | "75%" = "75%",
  phaseInitiale: "aleatoire" | "nulle" | "originale" = "aleatoire",
  mix: number = 100,
  onProgress?: (msg: string) => void,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const len = buffer.length;
  const MAX_FRAMES = 2000; // borne le temps de calcul sur les longues pistes
  const MIN_OVERLAP = 0.25;
  let fftSize = prochainePuissanceDeDeux(Math.max(64, fftSizeInput));
  let hop = Math.max(1, Math.round(fftSize * (recouvrement === "50%" ? 0.5 : 0.25)));
  // Adaptation automatique : sur une piste longue on augmente la taille de la
  // fenêtre et le hop pour ne pas générer des dizaines de milliers de trames.
  if (len / hop > MAX_FRAMES) {
    hop = Math.max(1, Math.ceil(len / MAX_FRAMES));
    const maxHop = Math.round(fftSize * (1 - MIN_OVERLAP));
    if (hop > maxHop) {
      fftSize = prochainePuissanceDeDeux(Math.max(64, Math.round(hop / (1 - MIN_OVERLAP))));
      // On plafonne à 8192 pour éviter des fenêtres gigantesques et un spectre trop lisse.
      if (fftSize > 8192) {
        fftSize = 8192;
        hop = Math.round(fftSize * (1 - MIN_OVERLAP));
      }
    }
  }
  const window = creerFenetreHann(fftSize);
  const outBuffer = new AudioBuffer({ numberOfChannels: nCh, length: len, sampleRate: sr });

  // Marge de bourrage : sans elle, les tout premiers/derniers échantillons du
  // signal ne sont couverts que par une fraction des trames superposées (la
  // fenêtre de Hann y est proche de zéro), si bien que norm[i] dans
  // synthetiserSignal s'effondre près de zéro à ces positions. Diviser par une
  // valeur quasi nulle amplifie alors n'importe quel résidu numérique par un
  // facteur énorme (mesuré : un seul échantillon en tout début de signal
  // atteignant un pic ~300 000× plus grand que le reste), ce qui domine le
  // rescale final du plugin et écrase tout le reste du signal à un niveau
  // quasi inaudible. En bourrant le signal de fftSize-hop zéros de chaque
  // côté avant analyse (comme le fait librosa avec center=True), chaque
  // échantillon du signal d'origine bénéficie de la même couverture en
  // régime permanent que l'intérieur, bords compris ; on retire le bourrage
  // après resynthèse.
  const pad = fftSize - hop;

  for (let c = 0; c < nCh; c++) {
    const drySrc = buffer.getChannelData(c);
    const dryPad = new Float64Array(len + 2 * pad);
    dryPad.set(drySrc, pad);
    const padLen = dryPad.length;
    const targetFrames = analyserSignal(dryPad, fftSize, hop, window);

    // Phase initiale.
    // Important : la phase aléatoire doit PROGRESSER de façon cohérente d'une
    // trame à l'autre, pas être retirée indépendamment (ni figée identique)
    // trame par trame. Les trames se recouvrent à 50-75 % ; sur un signal à
    // bande étroite (une tonalité pure par ex.), une phase par bin qui ne suit
    // pas l'avancée naturelle « 2π·bin·hop/fftSize » d'une trame à l'autre crée
    // une discontinuité de phase dans la zone de recouvrement : les copies
    // décalées du même bin s'additionnent en overlap-add presque en opposition
    // de phase et s'annulent (mesuré : RMS ~300× plus faible que le pic — testé
    // avec une phase indépendante par trame ET avec une phase figée identique
    // partout, les deux s'annulent tout autant, dès la toute première synthèse,
    // avant même la boucle d'itération). Technique standard de phase vocoder :
    // partir d'une phase de base aléatoire par bin (pour l'aspect « texture
    // créative »), puis l'avancer de l'incrément attendu à chaque trame.
    if (phaseInitiale === "aleatoire") {
      const nbBins = targetFrames[0]?.phase.length ?? 0;
      const phaseBase = new Float64Array(nbBins);
      for (let k = 0; k < nbBins; k++) phaseBase[k] = Math.random() * 2 * Math.PI - Math.PI;
      const increment = new Float64Array(nbBins);
      for (let k = 0; k < nbBins; k++) increment[k] = (2 * Math.PI * k * hop) / fftSize;
      for (let f = 0; f < targetFrames.length; f++) {
        const phase = targetFrames[f].phase;
        for (let k = 0; k < nbBins; k++) phase[k] = phaseBase[k] + f * increment[k];
      }
    } else if (phaseInitiale === "nulle") {
      for (const frame of targetFrames) frame.phase.fill(0);
    }

    let currentSignal = synthetiserSignal(targetFrames, fftSize, hop, window, padLen);

    const itCount = Math.max(0, Math.round(iterations));
    const yieldEvery = Math.max(1, Math.floor(itCount / 10));
    for (let it = 1; it <= itCount; it++) {
      const currentFrames = analyserSignal(currentSignal, fftSize, hop, window);
      for (let f = 0; f < currentFrames.length; f++) {
        const targetMag = targetFrames[f].mag;
        const currentMag = currentFrames[f].mag;
        for (let k = 0; k < currentMag.length; k++) {
          currentMag[k] = targetMag[k];
        }
      }
      currentSignal = synthetiserSignal(currentFrames, fftSize, hop, window, padLen);
      // Relâcher la main à l'event loop pour éviter le freeze sur les longues pistes.
      if (it < itCount && it % yieldEvery === 0) {
        if (onProgress) onProgress(`Griffin-Lim · itération ${it}/${itCount}`);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (onProgress && itCount > 0) onProgress(`Griffin-Lim · itération ${itCount}/${itCount}`);

    // On retire le bourrage : le signal utile correspond à [pad, pad+len).
    const wet = currentSignal.subarray(pad, pad + len);

    const peakDry = picAbsolu(drySrc);
    const peakWet = picAbsolu(wet);
    const scale = peakWet > 1e-12 ? peakDry / peakWet : 1;
    const mixGain = Math.max(0, Math.min(1, mix / 100));

    const out = outBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const v = drySrc[i] * (1 - mixGain) + wet[i] * scale * mixGain;
      out[i] = Math.max(-1, Math.min(1, v));
    }
    // Défense contre les implémentations AudioBuffer qui retournent une copie
    // via getChannelData (le contenu réel n'est pas modifié). copyToChannel
    // écrit toujours dans le buffer interne.
    outBuffer.copyToChannel(out, c);
  }

  return outBuffer;
}
