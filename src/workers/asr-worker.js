// src/workers/asr-worker.js — Web Worker pour ASR (Whisper, Transformers.js).
// Transcrit un AudioBuffer en texte.
//
// LE MODÈLE EST LIVRÉ AVEC L'APPLICATION, et ne vient plus de HuggingFace. Transformers.js va le
// chercher chez son hébergeur par défaut ; on le lui interdit et on lui donne le dossier local.
// Trois raisons, les mêmes que pour les points de contrôle Magenta : une installation sans réseau
// doit pouvoir employer le nœud, l'intégrité de ce qui arrive doit être vérifiable — c'est l'affaire
// de `modeles-manifest.json` —, et un tiers peut déplacer ce qu'il héberge.
//
// LA BASE VIENT DE LA PAGE, dans le message : ici `self.location` est l'URL du script du worker,
// qui ne dit rien de l'endroit d'où la page est servie. Voir `plugins/base-modeles.ts`.
import { pipeline, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;
env.allowRemoteModels = false;
env.allowLocalModels = true;

const transcribers = new Map();

async function getTranscriber(modelId, modelBase, requestId) {
  const cle = `${modelBase}|${modelId}`;
  if (transcribers.has(cle)) return transcribers.get(cle);
  self.postMessage({ type: "progress", msg: "Chargement du modèle Whisper…", requestId });
  // `localModelPath` est le dossier QUI CONTIENT le paquet : Transformers.js y concatène
  // l'identifiant du modèle, puis le nom de chaque fichier.
  env.localModelPath = modelBase;
  const transcriber = await pipeline("automatic-speech-recognition", modelId, {
    device: "wasm",
    dtype: { encoder_model: "fp32", decoder_model_merged: "fp32" },
  });
  transcribers.set(cle, transcriber);
  return transcriber;
}

const queue = [];
let busy = false;

async function processRequest(req) {
  const { audioData, sampleRate, modelId, modelBase, language, translate, requestId } = req;
  try {
    const transcriber = await getTranscriber(modelId, modelBase, requestId);
    self.postMessage({ type: "progress", msg: "Transcription…", requestId });
    const options = {
      chunk_length_s: 30,
      stride_length_s: 5,
      sampling_rate: sampleRate,
    };
    if (language) options.language = language;
    if (translate) options.task = "translate";
    // Passer un Float32Array pur, pas un objet
    const len = audioData.length;
    const audio = new Float32Array(len);
    for (let i = 0; i < len; i++) audio[i] = audioData[i];
    const output = await transcriber(audio, options);
    const text = output.text || "";
    self.postMessage({ type: "done", requestId, text });
  } catch (err) {
    self.postMessage({ type: "error", requestId, msg: String(err?.message || err) });
  }
}

function processQueue() {
  if (busy) return;
  busy = true;
  (async () => {
    try {
      while (queue.length > 0) {
        const req = queue.shift();
        await processRequest(req);
      }
    } finally {
      busy = false;
    }
  })();
}

self.onmessage = (e) => {
  queue.push(e.data);
  processQueue();
};
