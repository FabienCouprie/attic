// audio/continuation-spectrale.ts — Prolongation d'une piste par prédiction
// autoregressive sur les frames de son spectrogramme. Deux variantes :
// - AR (modèle linéaire / dense) : l'équivalent "série temporelle" de l'audio.
// - LSTM (petit réseau récurrent) : un "LLM de taille réduite" entraîné à la
//   volée sur les frames spectrales.
// Chaque canal est traité indépendamment, puis les canaux sont re-assemblés.
import { assainirNonFinis, creerFenetreHann } from "./commun";
// L'analyse et la synthèse par trames vivent à côté : elles ne dépendent que de la transformée, et
// ne savent rien du réseau qui décide de la suite.
import {
  analyserSpectrogramme, prochainePuissanceDeDeux, synthetiserSpectrogramme,
  type FrameSpectrale, type Spectrogramme,
} from "./spectrogramme-fenetre";
import { Respiration } from "../core/respirer";
import { creerAleatoire } from "../core/hasard";

export interface ContinuationSpectraleResultat {
  audio: AudioBuffer;
  message: string;
  nGenFrames: number;
  hop: number;
  sr: number;
  mode: "ar" | "lstm";
  epochs: number;
  /**
   * Les époques RÉELLEMENT faites, une par canal.
   *
   * `epochs` est ce qu'on a demandé ; le message affichait ce nombre-là, si bien qu'un entraînement
   * coupé par le budget au bout de trois époques s'annonçait « 100 époques ». Relevé le 2026-10-27.
   */
  epochsFaites: number[];
  /** L'entraînement d'au moins un canal a été coupé par le budget de temps. */
  arreteParBudget: boolean;
  /** Les canaux (rang 0) dont la prédiction a divergé, et dont la prolongation est muette. */
  canauxDiverges: number[];
  dureeGenereeS: number;
}

const EPS = 1e-10;

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

/**
 * Ce que coûte une époque d'entraînement, en multiplications-additions, à un facteur près.
 *
 * Dense (AR) : chaque échantillon traverse une matrice `history·nbBins → nbBins`. LSTM : quatre
 * portes, chacune `(nbBins + hidden) → hidden` à chaque pas d'historique, puis la sortie
 * `hidden → nbBins`. La passe arrière double à peu près ce coût ; un facteur commun ne change rien
 * au rapport, donc il est omis.
 */
export function coutParEpoque(
  mode: "ar" | "lstm", nSamples: number, history: number, nbBins: number, hiddenUnits: number,
): number {
  if (mode === "ar") return nSamples * history * nbBins * nbBins;
  return nSamples * (history * 4 * hiddenUnits * (nbBins + hiddenUnits) + hiddenUnits * nbBins);
}

/**
 * Le travail que le mode automatique s'accorde, en multiplications-additions.
 *
 * ═══ POURQUOI UN TRAVAIL ET NON UN TEMPS ═══
 *
 * LE MODE AUTOMATIQUE COUPAIT SUR L'HORLOGE, et c'était la cause d'une graine infidèle, relevée le
 * 2026-10-27 par `tests-e2e/graines-tenues.spec.ts`. Le budget valait le volume du spectrogramme
 * divisé par cent, en millisecondes, entre 3 et 60 s ; mesuré sur l'entrée d'essai du banc (3 s
 * stéréo à 48 kHz, réglages par défaut), il coupait l'entraînement à 3 époques sur 100 — et à une
 * autre quand la machine était chargée, si bien que deux passes à la même graine rendaient deux
 * sons (valeur efficace 0,244886279 puis 0,244981235). Une graine ne peut pas tenir si le nombre
 * d'époques dépend de la vitesse de l'ordinateur.
 *
 * UN TRAVAIL BORNÉ DONNE LE MÊME NOMBRE D'ÉPOQUES PARTOUT. Cette valeur est CALIBRÉE pour rendre
 * les 3 époques que l'horloge laissait sur cette entrée : le son par défaut ne change pas ici, il
 * devient reproductible. Le prix est assumé : sur une machine lente, l'entraînement dure plus
 * longtemps au lieu d'être coupé. Un budget de temps positif, donné à la main, reste possible, et
 * il est documenté comme non reproductible.
 */
export const TRAVAIL_AUTO = 3.6e9;

/** Le nombre d'époques du mode automatique : au moins une, au plus celles qu'on a demandées. */
export function epoquesAutomatiques(cout: number, epochsDemandees: number): number {
  if (!(cout > 0)) return Math.max(1, epochsDemandees);
  return Math.max(1, Math.min(epochsDemandees, Math.floor(TRAVAIL_AUTO / cout)));
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

  // CE CALCUL A LIEU DANS LE FIL DE LA FENÊTRE, et l'entraînement n'est pas ce qui le tient :
  // `model.fit` sans `yieldEvery` prend le défaut « auto », qui cède au fil toutes les 125 ms
  // environ. Ce qui le tient, c'est tout le reste — le spectrogramme, la normalisation, la mise en
  // forme du jeu de données, la boucle de prédiction, la synthèse par recouvrement. Mesuré avant :
  // un bloc de 6 475 ms sur 32 369 ms de calcul, pendant lequel aucune image n'est rendue et
  // « Arrêter » ne s'atteint pas. Dans la boucle de prédiction, `await predTensor.data()` ne cède
  // qu'une microtâche, laquelle ne laisse pas peindre : seule une tâche de macro-file le permet.
  const souffle = new Respiration();

  onProgress?.(`Continuation spectrale · analyse · mode ${mode}`);
  const spectrograms: Spectrogramme[] = [];
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    spectrograms.push(analyserSpectrogramme(ch, fftSize, hop, fenetre));
    await souffle.tour();
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
    await souffle.tour();
  }

  // Prédiction par canal
  const resultat = new AudioBuffer({ numberOfChannels: nCh, length: length + Math.round(nGenFrames * hop), sampleRate: sr });
  const epochsFaites: number[] = [];
  let arreteParBudget = false;
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
        // `nSamples × history × nbBins` écritures ne se font pas d'un trait sans tenir le fil
        // plusieurs secondes : une respiration tous les cent vingt-huit pas de temps.
        if ((t & 127) === 127) await souffle.tour();
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
        if ((t & 127) === 127) await souffle.tour();
      }
      xTensor = tf.tensor3d(xData, [nSamples, history, nbBins]);
      yTensor = tf.tensor2d(yData, [nSamples, nbBins]);
    }

    const model = mode === "ar"
      ? construireModeleAr(tf, nbBins, history, seed + c, learningRate)
      : construireModeleLstm(tf, nbBins, history, hiddenUnits, seed + c, learningRate);

    // LE MODE AUTOMATIQUE BORNE LE TRAVAIL, PAS LE TEMPS : voir `TRAVAIL_AUTO`. Seul un budget
    // positif, donné à la main, coupe sur l'horloge.
    const budget = budgetMs > 0 ? budgetMs : Infinity;
    const epochsCeCanal = budgetMs > 0
      ? epochs
      : epoquesAutomatiques(coutParEpoque(mode, nSamples, history, nbBins, hiddenUnits), epochs);
    const startTime = Date.now();
    let lastLoss = Infinity;
    let stoppedByBudget = false;
    let stoppedByAbort = false;
    let faites = 0;

    await model.fit(xTensor, yTensor, {
      epochs: epochsCeCanal,
      batchSize: Math.min(256, Math.max(16, Math.floor(nSamples / 4))),
      shuffle: false,
      verbose: 0,
      callbacks: {
        onEpochEnd: (epoch: number, logs: any) => {
          // L'époque qui vient de finir est FAITE, qu'on s'arrête ensuite ou non : `stopTraining`
          // empêche la suivante, il ne défait pas celle-ci.
          faites = epoch + 1;
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
          onProgress?.(`Continuation spectrale · époque ${epoch + 1}/${epochsCeCanal} · perte ${logs.loss.toFixed(4)}`);
        },
      },
    });

    tf.dispose([xTensor, yTensor]);
    epochsFaites.push(faites);
    if (stoppedByBudget) arreteParBudget = true;

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
      // L'`await` sur `predTensor.data()` plus haut ne cède qu'une microtâche, et une microtâche ne
      // laisse pas peindre : sans cette respiration, la boucle entière tient le fil.
      await souffle.tour();
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
  // L'ENTRAÎNEMENT DIVERGE PARFOIS, et il le faisait en silence. Relevé le 2026-10-21 : la sortie
  // portait des NaN sur deux canaux d'un tampon à six, le tampon ayant par ailleurs la bonne forme
  // et la bonne longueur — donc rien en aval ne pouvait s'en apercevoir, et une somme de canaux
  // serait devenue muette d'un bout à l'autre. La divergence n'est pas reproductible à paramètres
  // égaux : elle n'a pas reparu en trente tirages hors du banc, graines et activations variées.
  // Faute de pouvoir la provoquer, on garde la SORTIE : aucun NaN ne quitte ce module, et le
  // message nomme les canaux qui en portaient plutôt que de taire l'incident.
  const divergents = assainirNonFinis(resultat);
  const message = `Continuation spectrale ${mode.toUpperCase()} · +${nGenFrames} frames (~${dureeGenereeS.toFixed(2)} s)`
    + (divergents.length > 0
      ? ` · prédiction divergée sur ${divergents.length === 1 ? "le canal" : "les canaux"} `
        + `${divergents.map((c) => c + 1).join(", ")}, leur prolongation est muette`
      : "");
  return {
    audio: resultat, message, nGenFrames, hop, sr, mode, epochs, epochsFaites, arreteParBudget,
    canauxDiverges: divergents, dureeGenereeS,
  };
}
