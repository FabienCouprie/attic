// src/workers/opus-worker.js — Web Worker pour OPUS-MT (traduction texte→texte).
// Utilise Transformers.js pour charger un modèle OPUS-MT (Marian) par paire de langues.
import { pipeline, env } from "@huggingface/transformers";

// Forcer WASM (WebGPU casse les modèles OPUS-MT avec ORT 1.26+)
env.backends.onnx.wasm.proxy = true;

const translators = new Map();

async function getTranslator(modelId) {
  if (translators.has(modelId)) return translators.get(modelId);
  self.postMessage({ type: "progress", msg: "Chargement du modèle OPUS-MT…" });
  const translator = await pipeline("translation", modelId, {
    device: "wasm",
    dtype: { encoder_model: "fp32", decoder_model_merged: "fp32" },
  });
  translators.set(modelId, translator);
  return translator;
}

self.onmessage = async (e) => {
  const { text, modelId } = e.data;
  try {
    const translator = await getTranslator(modelId);
    self.postMessage({ type: "progress", msg: "Traduction…" });
    const output = await translator(text);
    const translated = output[0]?.translation_text || "";
    self.postMessage({ type: "done", text: translated });
  } catch (err) {
    self.postMessage({ type: "error", msg: String(err?.message || err) });
  }
};
