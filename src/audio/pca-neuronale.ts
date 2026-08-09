// audio/pca-neuronale.ts — PCA neuronale : autoencodeur MLP entraîné sur le
// spectrogramme d'une piste pour en filtrer/reconstruire la texture.
import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

interface FrameSpectrale {
  start: number;
  mag: Float64Array; // magnitude linéaire originale
  phase: Float64Array; // phase conservée pour la resynthèse
}

interface Spectrogramme {
  fftSize: number;
  hop: number;
  frames: FrameSpectrale[];
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
  for (let start = 0; start < signal.length; start += hop) {
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

  for (let i = 0; i < length; i++) {
    if (norm[i] > 0) out[i] /= norm[i];
  }
  return out;
}

function prochainePuissanceDeDeux(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}

function taillesGeometriques(inputDim: number, latentDim: number, couchesCachees: number): number[] {
  const sizes: number[] = [];
  for (let k = 1; k <= couchesCachees; k++) {
    const ratio = Math.pow(latentDim / inputDim, k / (couchesCachees + 1));
    sizes.push(Math.max(1, Math.round(inputDim * ratio)));
  }
  return sizes;
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
      if (j === 0 && shape.length >= 2) {
        // Noyau : initialisation Glorot uniform déterministe.
        const fanIn = shape[shape.length - 2];
        const fanOut = shape[shape.length - 1];
        const limit = Math.sqrt(6 / (fanIn + fanOut));
        for (let k = 0; k < size; k++) data[k] = (rng() * 2 - 1) * limit;
      } else {
        // Biais : zéros.
        for (let k = 0; k < size; k++) data[k] = 0;
      }
      return tf.tensor(data, shape, w.dtype);
    });
    layer.setWeights(newWeights);
  }
}

function construireAutoEncodeur(
  tf: any,
  inputDim: number,
  latentDim: number,
  couchesCachees: number,
  activation: "relu" | "tanh",
  seed: number,
  learningRate: number
): any {
  const model = tf.sequential();
  const hiddenSizes = taillesGeometriques(inputDim, latentDim, couchesCachees);

  // Encodeur
  for (let i = 0; i < hiddenSizes.length; i++) {
    model.add(tf.layers.dense({
      inputShape: i === 0 ? [inputDim] : undefined,
      units: hiddenSizes[i],
      activation,
      kernelInitializer: "zeros",
      biasInitializer: "zeros",
    }));
  }
  // Goulot (espace latent)
  model.add(tf.layers.dense({
    units: latentDim,
    activation,
    kernelInitializer: "zeros",
    biasInitializer: "zeros",
  }));
  // Décodeur (miroir de l'encodeur)
  for (let i = hiddenSizes.length - 1; i >= 0; i--) {
    model.add(tf.layers.dense({
      units: hiddenSizes[i],
      activation,
      kernelInitializer: "zeros",
      biasInitializer: "zeros",
    }));
  }
  // Sortie
  model.add(tf.layers.dense({
    units: inputDim,
    activation: "linear",
    kernelInitializer: "zeros",
    biasInitializer: "zeros",
  }));

  model.compile({ optimizer: tf.train.adam(learningRate), loss: "meanSquaredError" });
  initialiserPoidsGlorot(tf, model, seed);
  return model;
}

function budgetAutoMs(nFrames: number, nBins: number): number {
  return Math.min(60000, Math.max(3000, Math.round((nFrames * nBins) / 200)));
}

function mseBaseline(matrix: Float32Array, nFrames: number, nBins: number): number {
  const mean = new Float32Array(nBins);
  for (let f = 0; f < nFrames; f++) {
    const offset = f * nBins;
    for (let b = 0; b < nBins; b++) mean[b] += matrix[offset + b];
  }
  for (let b = 0; b < nBins; b++) mean[b] /= nFrames;

  let sum = 0;
  for (let f = 0; f < nFrames; f++) {
    const offset = f * nBins;
    for (let b = 0; b < nBins; b++) {
      const d = matrix[offset + b] - mean[b];
      sum += d * d;
    }
  }
  return sum / (nFrames * nBins);
}

export interface OptionsPcaNeuronale {
  fftSize: number;
  hopPercent: number;
  latentDim: number;
  hiddenLayers: number;
  activation: "relu" | "tanh";
  epochs: number;
  learningRate: number;
  seed: number;
  budgetMs: number;
  onProgress?: (msg: string) => void;
  signal?: AbortSignal;
}

export async function appliquerPcaNeuronale(
  buffer: AudioBuffer,
  options: OptionsPcaNeuronale
): Promise<{ audio: AudioBuffer; message: string }> {
  const tf = await import("@tensorflow/tfjs");
  tf.disableDeprecationWarnings();
  await tf.ready();

  const {
    fftSize: fftSizeInput,
    hopPercent,
    latentDim,
    hiddenLayers,
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

  // 1. Analyse STFT par canal
  const spectrograms: Spectrogramme[] = [];
  for (let c = 0; c < nCh; c++) {
    onProgress?.(`PCA neuronale · analyse STFT canal ${c + 1}/${nCh}`);
    const ch = buffer.getChannelData(c);
    spectrograms.push(analyserSpectrogramme(ch, fftSize, hop, fenetre));
  }
  const nFrames = spectrograms[0].frames.length;
  const totalFrames = nFrames * nCh;

  // 2. Matrice de frames en dB, standardisée
  const matrix = new Float32Array(totalFrames * nbBins);
  let idx = 0;
  for (let c = 0; c < nCh; c++) {
    for (const frame of spectrograms[c].frames) {
      for (let b = 0; b < nbBins; b++) {
        matrix[idx++] = 20 * Math.log10(frame.mag[b] + EPS);
      }
    }
  }

  // Standardisation (z-score) globale
  const mean = new Float32Array(nbBins);
  for (let f = 0; f < totalFrames; f++) {
    const offset = f * nbBins;
    for (let b = 0; b < nbBins; b++) mean[b] += matrix[offset + b];
  }
  for (let b = 0; b < nbBins; b++) mean[b] /= totalFrames;

  let variance = 0;
  for (let f = 0; f < totalFrames; f++) {
    const offset = f * nbBins;
    for (let b = 0; b < nbBins; b++) {
      const d = matrix[offset + b] - mean[b];
      variance += d * d;
    }
  }
  let std = Math.sqrt(variance / (totalFrames * nbBins));
  if (std < 1e-12) std = 1;

  for (let f = 0; f < totalFrames; f++) {
    const offset = f * nbBins;
    for (let b = 0; b < nbBins; b++) {
      matrix[offset + b] = (matrix[offset + b] - mean[b]) / std;
    }
  }

  const baseMse = mseBaseline(matrix, totalFrames, nbBins);

  // 3. Autoencodeur
  const model = construireAutoEncodeur(tf, nbBins, latentDim, hiddenLayers, activation, seed, learningRate);
  const xTensor = tf.tensor2d(matrix, [totalFrames, nbBins]);
  const budget = budgetMs > 0 ? budgetMs : budgetAutoMs(totalFrames, nbBins);
  const startTime = Date.now();
  let lastLoss = Infinity;
  let stoppedByBudget = false;
  let stoppedByAbort = false;

  onProgress?.(`PCA neuronale · entraînement · budget ${Math.round(budget / 1000)} s`);

  await model.fit(xTensor, xTensor, {
    epochs,
    batchSize: Math.min(256, Math.max(16, Math.floor(totalFrames / 4))),
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
        onProgress?.(`PCA neuronale · époque ${epoch + 1}/${epochs} · perte ${logs.loss.toFixed(4)}`);
      },
    },
  });

  // 4. Reconstruction
  onProgress?.(`PCA neuronale · reconstruction`);
  const reconTensor = model.predict(xTensor) as any;
  const reconData = await reconTensor.data();
  const recon = reconData instanceof Float32Array ? reconData : new Float32Array(reconData);

  // 5. Resynthèse par canal (phase originale, magnitude reconstruite)
  const resultat = new AudioBuffer({ numberOfChannels: nCh, length, sampleRate: sr });
  for (let c = 0; c < nCh; c++) {
    const frames: FrameSpectrale[] = [];
    for (let f = 0; f < nFrames; f++) {
      const offsetGlobal = (c * nFrames + f) * nbBins;
      const mag = new Float64Array(nbBins);
      for (let b = 0; b < nbBins; b++) {
        const db = recon[offsetGlobal + b] * std + mean[b];
        mag[b] = Math.max(0, Math.pow(10, db / 20));
      }
      frames.push({ start: spectrograms[c].frames[f].start, mag, phase: spectrograms[c].frames[f].phase });
    }
    const signalCh = synthetiserSpectrogramme(frames, fftSize, hop, fenetre, length);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < length; i++) dst[i] = signalCh[i];
  }

  // 6. Nettoyage TF.js
  tf.dispose([xTensor, reconTensor]);
  model.dispose();

  // 7. Message de sortie + garde-fou
  let message = `PCA neuronale · ${nFrames} trames · ${nbBins} bins · perte ${lastLoss.toFixed(4)} (base ${baseMse.toFixed(4)})`;
  if (stoppedByAbort) message += ` · arrêté par annulation`;
  else if (stoppedByBudget) message += ` · arrêté par budget temps`;
  if (lastLoss > baseMse * 1.05) {
    message += ` · avertissement : l'autoencodeur n'a pas fait mieux que la moyenne`;
  }

  return { audio: resultat, message };
}
