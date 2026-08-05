// src/workers/musicgen-worker.js — Web Worker pour MusicGen (Transformers.js).
// Tourne dans un thread séparé pour ne pas bloquer l'UI. Charge le modèle
// Xenova/musicgen-small (ONNX quantifié) depuis HuggingFace la première fois
// (cache navigateur).
import { MusicgenForConditionalGeneration, AutoTokenizer, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;

let modele = null;
let tokenizer = null;
const queue = [];
let busy = false;

async function processRequest(req) {
  const { prompt, maxTokens, guidanceScale, requestId } = req;

  try {
    if (!modele) {
      self.postMessage({ type: "progress", msg: "Chargement du modèle MusicGen…", requestId });
      tokenizer = await AutoTokenizer.from_pretrained("Xenova/musicgen-small");
      modele = await MusicgenForConditionalGeneration.from_pretrained("Xenova/musicgen-small", {
        device: "wasm",
        dtype: {
          text_encoder: "q8",
          decoder_model_merged: "q8",
          encodec_decode: "fp32",
        },
      });
    }

    self.postMessage({ type: "progress", msg: "Encodage du prompt…", requestId });
    const inputs = await tokenizer(prompt);

    self.postMessage({ type: "progress", msg: "Génération audio…", requestId });
    const audioValues = await modele.generate({
      ...inputs,
      max_new_tokens: maxTokens,
      do_sample: true,
      guidance_scale: guidanceScale,
      callback_function: (beam) => {
        if (beam && beam.tokens) {
          const pct = Math.round((beam.tokens.length / maxTokens) * 100);
          self.postMessage({ type: "progress", msg: `Génération ${pct}%`, requestId });
        }
      },
    });

    const sr = modele.config.audio_encoder.sampling_rate;
    const data = audioValues.data;

    self.postMessage({
      type: "done",
      requestId,
      data,
      sampleRate: sr,
      length: data.length,
    });
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
