// audio/continuation-spectrale.ts — Prolongation d'une piste par prédiction
// autoregressive sur les frames de son spectrogramme. Deux variantes :
// - AR (modèle linéaire / dense) : l'équivalent "série temporelle" de l'audio.
// - LSTM (petit réseau récurrent) : un "LLM de taille réduite" entraîné à la
//   volée sur les frames spectrales.
// Chaque canal est traité indépendamment, puis les canaux sont re-assemblés.
import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

interface FrameSpectrale {
  start: number;
  mag: Float64Array; // magnitude linéaire originale
  phase: Float64Array; // phase originale
}

interface Spectrogramme {
  fftSize: number;
  hop: number;
  frames: FrameSpectrale[];
}

export interface ContinuationSpectraleResultat {
  audio: AudioBuffer;
  message: string;
  nGenFrames: number;
  hop: number;
  sr: number;
  mode: "ar" | "lstm";
  epochs: number;
  dureeGenereeS: number;
}

const EPS = 1e-10;

function analyserSpectrogramme(
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

function synthetiserSpectrogramme(
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

function prochainePuissanceDeDeux(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}

function rngGraine(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function initialiserPoidsGlorot(tf: any, model: any, seed: number) {
  for (let i = 0; i < model.layers.length; i++) {
    const layer = model.layers[i];
    const weights = layer.getWeights();
    if (!weights || weights.length === 0) continue;
    const newWeights = weights.map((w: any, j: number) => {
      const shape: number[] = w.shape;
      const size = shape.reduce((a, b) => a * b, 1);
      const rng = rngGraine(seed + i * 1000 + j);
      const data = new Float32Array(size);
      // All 2D weight tensors (kernel + recurrent kernel for LSTM, kernel for dense) get a Glorot
      // uniform-like init. 1D tensors (bias) are zero-initialized. Previously only the first weight
      // tensor (j === 0) was initialized, which left the LSTM recurrent kernel at zero — the LSTM
      // had no memory and produced only noise.
      if (shape.length >= 2) {
        const fanIn = shape[shape.length - 2];
        const fanOut = shape[shape.length - 1];
        const limit = Math.sqrt(6 / (fanIn + fanOut));
        for (let k = 0; k < size; k++) data[k] = (rng() * 2 - 1) * limit;
      } else {
        for (let k = 0; k < size; k++) data[k] = 0;
      }
      return tf.tensor(data, shape, w.dtype);
    });
    layer.setWeights(newWeights);
  }
}

function construireModeleAr(
  tf: any,
  nbBins: number,
  history: number,
  seed: number,
  learningRate: number
): any {
  const model = tf.sequential();
  model.add(tf.layers.dense({
    inputShape: [history * nbBins],
    units: nbBins,
    activation: "linear",
    kernelInitializer: "zeros",
    biasInitializer: "zeros",
  }));
  model.compile({ optimizer: tf.train.adam(learningRate), loss: "meanSquaredError" });
  initialiserPoidsGlorot(tf, model, seed);
  return model;
}

function construireModeleLstm(
  tf: any,
  nbBins: number,
  history: number,
  hiddenUnits: number,
  seed: number,
  learningRate: number
): any {
  const model = tf.sequential();
  // LSTM attend [batch, history, nbBins]
  model.add(tf.layers.lstm({
    inputShape: [history, nbBins],
    units: hiddenUnits,
    returnSequences: false,
    kernelInitializer: "glorotUniform",
    recurrentInitializer: "glorotUniform",
    biasInitializer: "zeros",
  }));
  model.add(tf.layers.dense({
    units: nbBins,
    activation: "linear",
    kernelInitializer: "zeros",
    biasInitializer: "zeros",
  }));
  model.compile({ optimizer: tf.train.adam(learningRate), loss: "meanSquaredError" });
  initialiserPoidsGlorot(tf, model, seed);
  return model;
}

function budgetAutoMs(nFrames: number, nbBins: number, nGenFrames: number): number {
  // Plus il y a de frames à générer et plus la base est longue, plus on
  // laisse du temps — mais plafonné à 60 s pour ne pas bloquer l'interface.
  return Math.min(60000, Math.max(3000, Math.round((nFrames * nbBins + nGenFrames * nbBins) / 100)));
}

export interface OptionsContinuationSpectrale {
  /** "ar" = modèle linéaire dense (type série temporelle) ; "lstm" = petit LSTM. */
  mode: "ar" | "lstm";
  fftSize: number;
  hopPercent: number;
  /** Durée à générer, en secondes. */
  dureeGenereS: number;
  /** Nombre de frames passées utilisées pour prédire la suivante. */
  history: number;
  /** Caché pour le LSTM. */
  hiddenUnits: number;
  activation: "relu" | "tanh";
  epochs: number;
  learningRate: number;
  seed: number;
  budgetMs: number;
  onProgress?: (msg: string) => void;
  signal?: AbortSignal;
}

export async function appliquerContinuationSpectrale(
  buffer: AudioBuffer,
  options: OptionsContinuationSpectrale
): Promise<ContinuationSpectraleResultat> {
  const tf = await import("@tensorflow/tfjs");
  tf.disableDeprecationWarnings();
  await tf.ready();

  const {
    mode,
    fftSize: fftSizeInput,
    hopPercent,
    dureeGenereS,
    history,
    hiddenUnits,
    activation,
    epochs,
    learningRate,
    seed,
    budgetMs,
    onProgress,
    signal,
  } = options;

  const fftSize = prochainePuissanceDeDeux(Math.max(16, fftSizeInput));
  const hop = Math.max(1, Math.round(fftSize * (hopPercent / 100)));
  const fenetre = creerFenetreHann(fftSize);
  const nbBins = Math.floor(fftSize / 2) + 1;
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const length = buffer.length;
  const nGenFrames = Math.max(1, Math.floor(dureeGenereS * sr / hop));

  onProgress?.(`Continuation spectrale · analyse · mode ${mode}`);
  const spectrograms: Spectrogramme[] = [];
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    spectrograms.push(analyserSpectrogramme(ch, fftSize, hop, fenetre));
  }
  const nFrames = spectrograms[0].frames.length;
  if (nFrames < history + 2) {
    throw new Error(`La piste est trop courte pour prédire (besoin d'au moins ${history + 2} frames, trouvé ${nFrames})`);
  }

  // Magnitude en dB + standardisation par bin (chaque bin a sa propre dynamique)
  const matrices: Float32Array[] = [];
  const moyennes: Float32Array[] = [];
  const ecarts: Float32Array[] = [];
  for (let c = 0; c < nCh; c++) {
    const m = new Float32Array(nFrames * nbBins);
    for (let f = 0; f < nFrames; f++) {
      const offset = f * nbBins;
      for (let b = 0; b < nbBins; b++) {
        m[offset + b] = 20 * Math.log10(spectrograms[c].frames[f].mag[b] + EPS);
      }
    }
    const mean = new Float32Array(nbBins);
    for (let f = 0; f < nFrames; f++) {
      for (let b = 0; b < nbBins; b++) mean[b] += m[f * nbBins + b];
    }
    for (let b = 0; b < nbBins; b++) mean[b] /= nFrames;
    const std = new Float32Array(nbBins);
    for (let f = 0; f < nFrames; f++) {
      for (let b = 0; b < nbBins; b++) {
        const d = m[f * nbBins + b] - mean[b];
        std[b] += d * d;
      }
    }
    for (let b = 0; b < nbBins; b++) {
      std[b] = Math.sqrt(std[b] / nFrames) || 1;
    }
    for (let f = 0; f < nFrames; f++) {
      for (let b = 0; b < nbBins; b++) {
        m[f * nbBins + b] = (m[f * nbBins + b] - mean[b]) / std[b];
      }
    }
    matrices.push(m);
    moyennes.push(mean);
    ecarts.push(std);
  }

  // Prédiction par canal
  const resultat = new AudioBuffer({ numberOfChannels: nCh, length: length + Math.round(nGenFrames * hop), sampleRate: sr });
  for (let c = 0; c < nCh; c++) {
    onProgress?.(`Continuation spectrale · entraînement canal ${c + 1}/${nCh}`);
    const m = matrices[c];
    const mean = moyennes[c];
    const std = ecarts[c];

    const nSamples = nFrames - history;
    let xTensor: any;
    let yTensor: any;

    if (mode === "ar") {
      const xData = new Float32Array(nSamples * history * nbBins);
      const yData = new Float32Array(nSamples * nbBins);
      for (let t = 0; t < nSamples; t++) {
        for (let h = 0; h < history; h++) {
          const srcOffset = (t + h) * nbBins;
          const dstOffset = t * (history * nbBins) + h * nbBins;
          for (let b = 0; b < nbBins; b++) xData[dstOffset + b] = m[srcOffset + b];
        }
        const yOffset = t * nbBins;
        const srcOffset = (t + history) * nbBins;
        for (let b = 0; b < nbBins; b++) yData[yOffset + b] = m[srcOffset + b];
      }
      xTensor = tf.tensor2d(xData, [nSamples, history * nbBins]);
      yTensor = tf.tensor2d(yData, [nSamples, nbBins]);
    } else {
      // LSTM : [nSamples, history, nbBins]
      const xData = new Float32Array(nSamples * history * nbBins);
      const yData = new Float32Array(nSamples * nbBins);
      for (let t = 0; t < nSamples; t++) {
        for (let h = 0; h < history; h++) {
          const srcOffset = (t + h) * nbBins;
          const dstOffset = t * (history * nbBins) + h * nbBins;
          for (let b = 0; b < nbBins; b++) xData[dstOffset + b] = m[srcOffset + b];
        }
        const yOffset = t * nbBins;
        const srcOffset = (t + history) * nbBins;
        for (let b = 0; b < nbBins; b++) yData[yOffset + b] = m[srcOffset + b];
      }
      xTensor = tf.tensor3d(xData, [nSamples, history, nbBins]);
      yTensor = tf.tensor2d(yData, [nSamples, nbBins]);
    }

    const model = mode === "ar"
      ? construireModeleAr(tf, nbBins, history, seed + c, learningRate)
      : construireModeleLstm(tf, nbBins, history, hiddenUnits, seed + c, learningRate);

    const budget = budgetMs > 0 ? budgetMs : budgetAutoMs(nFrames, nbBins, nGenFrames);
    const startTime = Date.now();
    let lastLoss = Infinity;
    let stoppedByBudget = false;
    let stoppedByAbort = false;

    await model.fit(xTensor, yTensor, {
      epochs,
      batchSize: Math.min(256, Math.max(16, Math.floor(nSamples / 4))),
      shuffle: false,
      verbose: 0,
      callbacks: {
        onEpochEnd: (epoch: number, logs: any) => {
          if (signal?.aborted) {
            model.stopTraining = true;
            stoppedByAbort = true;
            return;
          }
          if (Date.now() - startTime > budget) {
            model.stopTraining = true;
            stoppedByBudget = true;
            return;
          }
          lastLoss = logs.loss;
          onProgress?.(`Continuation spectrale · époque ${epoch + 1}/${epochs} · perte ${logs.loss.toFixed(4)}`);
        },
      },
    });

    tf.dispose([xTensor, yTensor]);

    onProgress?.(`Continuation spectrale · génération canal ${c + 1}/${nCh}`);
    // Génération autoregressive : historique initial = les dernières frames de la piste
    const historique = new Float32Array(history * nbBins);
    for (let h = 0; h < history; h++) {
      const srcOffset = (nFrames - history + h) * nbBins;
      const dstOffset = h * nbBins;
      for (let b = 0; b < nbBins; b++) historique[dstOffset + b] = m[srcOffset + b];
    }

    const genFrames: FrameSpectrale[] = [];
    // Phase propagation: use the real observed phase difference between the last two
    // original frames rather than the coarse bin-centre frequency. This captures the
    // true instantaneous frequency of each bin (e.g. a 440 Hz sine between bins 14 and 15)
    // and stops the generated continuation from drifting into phase noise.
    const phaseIncrement = new Float64Array(nbBins);
    const lastFrame = spectrograms[c].frames[nFrames - 1];
    const prevFrame = spectrograms[c].frames[nFrames - 2];
    for (let b = 0; b < nbBins; b++) {
      let diff = lastFrame.phase[b] - prevFrame.phase[b];
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      phaseIncrement[b] = diff;
    }
    const lastPhase = new Float64Array(lastFrame.phase);

    for (let g = 0; g < nGenFrames; g++) {
      let inputTensor: any;
      if (mode === "ar") {
        inputTensor = tf.tensor2d(historique, [1, history * nbBins]);
      } else {
        inputTensor = tf.tensor3d(historique, [1, history, nbBins]);
      }
      const predTensor = model.predict(inputTensor) as any;
      const predData = await predTensor.data();
      const pred = predData instanceof Float32Array ? predData : new Float32Array(predData);
      tf.dispose([inputTensor, predTensor]);

      // Start the generated frames at the next position in the original frame grid so that they
      // overlap with the last original frames. Using length + g*hop left a gap of fftSize-hop
      // samples between the last original frame and the first generated frame, causing the overlap-add
      // synthesis to divide by a near-zero window norm at the boundary and produce huge spikes.
      const start = (nFrames + g) * hop;
      const mag = new Float64Array(nbBins);
      const phase = new Float64Array(nbBins);
      for (let b = 0; b < nbBins; b++) {
        // Clamp the standardized prediction to a few standard deviations to stop a stray
        // dB prediction from exploding into a loud spike after linearization.
        const clampedPred = Math.max(-3, Math.min(3, pred[b]));
        const db = clampedPred * std[b] + mean[b];
        mag[b] = Math.max(0, Math.pow(10, db / 20));
        phase[b] = lastPhase[b] + phaseIncrement[b];
        lastPhase[b] = phase[b];
      }
      genFrames.push({ start, mag, phase });

      // Décaler l'historique
      for (let h = 0; h < history - 1; h++) {
        for (let b = 0; b < nbBins; b++) {
          historique[h * nbBins + b] = historique[(h + 1) * nbBins + b];
        }
      }
      for (let b = 0; b < nbBins; b++) {
        historique[(history - 1) * nbBins + b] = pred[b];
      }
    }

    model.dispose();

    if (stoppedByAbort) {
      throw new Error("Continuation spectrale annulée");
    }

    // Synthese : partie originale + générée
    const allFrames: FrameSpectrale[] = [...spectrograms[c].frames, ...genFrames];
    const signalCh = synthetiserSpectrogramme(allFrames, fftSize, hop, fenetre, resultat.length);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < resultat.length; i++) dst[i] = Math.max(-1, Math.min(1, signalCh[i]));

    // Smooth fade-out at the very end of the generated tail to avoid a click where the
    // window norm drops to zero. The fade only touches the continuation, never the original input.
    const fadeLen = Math.min(fftSize, nGenFrames * hop);
    const fadeStart = resultat.length - fadeLen;
    if (fadeLen > 1 && fadeStart >= length) {
      for (let i = 0; i < fadeLen; i++) {
        const idx = fadeStart + i;
        dst[idx] *= (1 - i / (fadeLen - 1));
      }
    }

    onProgress?.(`Continuation spectrale · canal ${c + 1}/${nCh} terminé`);
  }

  // Nettoyage TF.js
  tf.dispose();

  const dureeGenereeS = (nGenFrames * hop) / sr;
  const message = `Continuation spectrale ${mode.toUpperCase()} · +${nGenFrames} frames (~${dureeGenereeS.toFixed(2)} s)`;
  return { audio: resultat, message, nGenFrames, hop, sr, mode, epochs, dureeGenereeS };
}
