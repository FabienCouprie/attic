// src/workers/image-to-text-worker.js — Web Worker pour légende d'image
// (image captioning, Transformers.js). Reçoit un Blob/File, retourne un texte.
import { pipeline, env, RawImage } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;

const captioners = new Map();

async function getCaptioner(modelId) {
  if (captioners.has(modelId)) return captioners.get(modelId);
  self.postMessage({ type: "progress", msg: "Chargement du modèle…" });
  // fp32 partout : les variantes quantifiées (q8) déclenchent des erreurs
  // DequantizeLinear avec onnxruntime-web — même contrainte que les autres
  // workers Transformers.js de l'app (cf. README.md « ONNX Models »).
  const captioner = await pipeline("image-to-text", modelId, {
    device: "wasm",
    dtype: { encoder_model: "fp32", decoder_model_merged: "fp32" },
  });
  captioners.set(modelId, captioner);
  return captioner;
}

const queue = [];
let busy = false;

async function processRequest(req) {
  const { image, modelId, maxTokens, requestId } = req;
  try {
    const captioner = await getCaptioner(modelId);
    self.postMessage({ type: "progress", msg: "Analyse de l'image…", requestId });
    const rawImage = await RawImage.fromBlob(image);
    const output = await captioner(rawImage, { max_new_tokens: maxTokens });
    const texte = output?.[0]?.generated_text ?? "";
    self.postMessage({ type: "done", requestId, texte });
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
