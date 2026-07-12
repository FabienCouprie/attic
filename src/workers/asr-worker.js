// src/workers/asr-worker.js — Web Worker pour ASR (Whisper, Transformers.js).
// Transcrit un AudioBuffer en texte. Supporte plusieurs modèles Whisper.
import { pipeline, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;

const transcribers = new Map();

async function getTranscriber(modelId) {
  if (transcribers.has(modelId)) return transcribers.get(modelId);
  self.postMessage({ type: "progress", msg: "Chargement du modèle Whisper…" });
  const transcriber = await pipeline("automatic-speech-recognition", modelId, {
    device: "wasm",
    dtype: { encoder_model: "fp32", decoder_model_merged: "fp32" },
  });
  transcribers.set(modelId, transcriber);
  return transcriber;
}

self.onmessage = async (e) => {
  const { audioData, sampleRate, modelId, language, translate } = e.data;
  try {
    const transcriber = await getTranscriber(modelId);
    self.postMessage({ type: "progress", msg: "Transcription…" });
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
    self.postMessage({ type: "done", text });
  } catch (err) {
    self.postMessage({ type: "error", msg: String(err?.message || err) });
  }
};
