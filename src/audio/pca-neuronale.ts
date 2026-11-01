// audio/pca-neuronale.ts — PCA neuronale : autoencodeur MLP entraîné sur le
// spectrogramme d'une piste pour en filtrer/reconstruire la texture.
import { creerFenetreHann } from "./commun";
import {
  analyserSpectrogramme, prochainePuissanceDeDeux, synthetiserSpectrogramme,
  type FrameSpectrale, type Spectrogramme,
} from "./spectrogramme-fenetre";
import { creerAleatoire } from "../core/hasard";
import { traduire } from "../i18n";

const EPS = 1e-10;

function taillesGeometriques(inputDim: number, latentDim: number, couchesCachees: number): number[] {
  const sizes: number[] = [];
  for (let k = 1; k <= couchesCachees; k++) {
    const ratio = Math.pow(latentDim / inputDim, k / (couchesCachees + 1));
    sizes.push(Math.max(1, Math.round(inputDim * ratio)));
  }
  return sizes;
}

function rngGraine(seed: number): () => number {
  return creerAleatoire(seed);
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
    // La dernière trame déborde et le manque est du silence : c'est ce que ce module a toujours fait.
    spectrograms.push(analyserSpectrogramme(ch, fftSize, hop, fenetre, { remplirFin: true }));
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

  // Le niveau le plus fort de l'analyse : la reconstruction n'aura pas le droit de le dépasser de
  // plus de 6 dB (voir plus bas).
  let dbMax = -Infinity;
  for (let i = 0; i < matrix.length; i++) if (matrix[i] > dbMax) dbMax = matrix[i];

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

  // LES TRAMES SONT MÊLÉES AVANT L'ENTRAÎNEMENT, ET LE MÊLAGE EST SEMÉ.
  //
  // La matrice range les trames canal par canal : tout le canal gauche, puis tout le droit.
  // `model.fit` recevait `shuffle: false`, de sorte que l'autoencodeur voyait d'abord un canal
  // entier, puis l'autre — et comme l'entraînement s'arrête au budget de temps, il s'arrêtait
  // toujours en plein milieu de cette lecture ordonnée. LE RÉSULTAT DÉPENDAIT DONC DU CANAL QUI
  // VENAIT EN PREMIER. Mesuré, reproductible à l'identique sur deux passes : un son posé à gauche
  // ressortait 4,8 dB sous son entrée, le MÊME son posé à droite 123,8 dB en dessous, c'est-à-dire
  // le silence.
  //
  // MÊLER AVEC `shuffle: true` AURAIT MARCHÉ ET COÛTÉ LA REPRODUCTIBILITÉ : TensorFlow tire alors
  // sur son propre hasard, que la graine du composant ne commande pas, et deux exécutions de mêmes
  // réglages ne rendraient plus le même son. Mesuré : avec `shuffle: true`, deux passes de même
  // graine s'écartent de 0,66 en amplitude ; avec le mêlage semé, elles se répondent au bit près.
  // Le mêlage se fait donc ici, par la graine, et la reconstruction retrouve chaque trame par
  // `rangMele`.
  //
  // CELA NE REND PAS LE COMPOSANT REPRODUCTIBLE POUR AUTANT, et il faut le dire : l'entraînement
  // s'arrête sur un BUDGET DE TEMPS, qui ne tombe pas au même endroit d'une exécution à l'autre.
  // Budget hors d'atteinte, deux passes de même graine sont identiques ; budget de trois secondes,
  // elles s'écartent de 1,23. La graine commande ce qui se commande ; l'horloge fait le reste, et
  // le message l'annonce par « arrêté par budget temps ».
  const tirage = rngGraine(seed ^ 0x9e3779b9);
  const ordre = Array.from({ length: totalFrames }, (_, i) => i);
  for (let k = totalFrames - 1; k > 0; k--) {
    const j = Math.floor(tirage() * (k + 1));
    [ordre[k], ordre[j]] = [ordre[j], ordre[k]];
  }
  const rangMele = new Int32Array(totalFrames);
  const mele = new Float32Array(matrix.length);
  for (let k = 0; k < totalFrames; k++) {
    rangMele[ordre[k]] = k;
    mele.set(matrix.subarray(ordre[k] * nbBins, (ordre[k] + 1) * nbBins), k * nbBins);
  }

  // 3. Autoencodeur
  const model = construireAutoEncodeur(tf, nbBins, latentDim, hiddenLayers, activation, seed, learningRate);
  const xTensor = tf.tensor2d(mele, [totalFrames, nbBins]);
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
        // La perte de l'époque qui vient de finir est retenue AVANT tout arrêt : la première époque
        // comprend la mise en route de TensorFlow et dépasse souvent le budget à elle seule ; elle
        // s'arrêtait alors sans avoir rien noté, et le message annonçait « perte Infinity ».
        lastLoss = logs.loss;
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
      // La reconstruction suit le mêlage : la trame « canal c, rang f » a été entraînée au rang
      // `rangMele`, et c'est là qu'il faut aller la chercher dans la sortie du modèle.
      const offsetGlobal = rangMele[c * nFrames + f] * nbBins;
      const mag = new Float64Array(nbBins);
      for (let b = 0; b < nbBins; b++) {
        // Borné à 6 dB au-dessus du plus fort niveau analysé : les magnitudes se reconstruisent en
        // 10^(dB/20), et une erreur de quelques écarts-types serait sinon amplifiée exponentiellement.
        const db = Math.min(dbMax + 6, recon[offsetGlobal + b] * std + mean[b]);
        mag[b] = Math.max(0, Math.pow(10, db / 20));
      }
      frames.push({ start: spectrograms[c].frames[f].start, mag, phase: spectrograms[c].frames[f].phase });
    }
    // Le diviseur ne descend pas sous un dixième du poids maximal : un spectre déformé par le réseau
    // ne doit pas exploser aux bords des trames.
    const signalCh = synthetiserSpectrogramme(frames, fftSize, hop, fenetre, length, { normalisation: { plancherRelatif: 0.1 } });
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < length; i++) dst[i] = signalCh[i];
  }

  // 6. Nettoyage TF.js
  tf.dispose([xTensor, reconTensor]);
  model.dispose();

  // 7. Message de sortie + garde-fou
  let message = traduire("msg.pca_neuronale.resultat", nFrames, nbBins, lastLoss.toFixed(4), baseMse.toFixed(4));
  if (stoppedByAbort) message += ` · ${traduire("msg.pca_neuronale.annulation")}`;
  else if (stoppedByBudget) message += ` · ${traduire("msg.pca_neuronale.budget")}`;
  if (lastLoss > baseMse * 1.05) {
    message += ` · ${traduire("msg.pca_neuronale.avertissement")}`;
  }

  return { audio: resultat, message };
}
