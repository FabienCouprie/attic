// src/workers/tts-worker.js — Web Worker pour TTS (Transformers.js).
// SpeechT5 : chargement séparé des composants (tokenizer + model + vocoder).
// MMS-TTS : pipeline standard.
import { pipeline, AutoTokenizer, SpeechT5ForTextToSpeech, SpeechT5HifiGan, Tensor, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;

const pipelines = new Map();
const speechT5Cache = { tokenizer: null, model: null, vocoder: null };

async function getPipeline(modelId, requestId) {
  if (pipelines.has(modelId)) return pipelines.get(modelId);
  self.postMessage({ type: "progress", msg: "Chargement du modèle TTS…", requestId });
  const synth = await pipeline("text-to-speech", modelId, { device: "wasm", dtype: "fp32" });
  pipelines.set(modelId, synth);
  return synth;
}

async function getSpeechT5(requestId) {
  if (speechT5Cache.model) return speechT5Cache;
  self.postMessage({ type: "progress", msg: "Chargement SpeechT5…", requestId });
  speechT5Cache.tokenizer = await AutoTokenizer.from_pretrained("Xenova/speecht5_tts");
  speechT5Cache.model = await SpeechT5ForTextToSpeech.from_pretrained("Xenova/speecht5_tts", { dtype: "fp32" });
  speechT5Cache.vocoder = await SpeechT5HifiGan.from_pretrained("Xenova/speecht5_hifigan", { dtype: "fp32" });
  return speechT5Cache;
}

const queue = [];
let busy = false;

async function processRequest(req) {
  const { text, modelId, speakerUrl, requestId } = req;
  try {
    if (modelId === "Xenova/speecht5_tts") {
      const { tokenizer, model, vocoder } = await getSpeechT5(requestId);
      self.postMessage({ type: "progress", msg: "Tokenisation…", requestId });
      const { input_ids } = await tokenizer(text);

      self.postMessage({ type: "progress", msg: "Chargement voix…", requestId });
      const rep = await fetch(speakerUrl);
      const buf = await rep.arrayBuffer();
      const speakerEmbeddings = new Tensor("float32", new Float32Array(buf), [1, 512]);

      self.postMessage({ type: "progress", msg: "Synthèse vocale…", requestId });
      const { waveform } = await model.generate_speech(input_ids, speakerEmbeddings, { vocoder });
      self.postMessage({
        type: "done",
        requestId,
        data: waveform.data,
        sampleRate: 16000,
        length: waveform.data.length,
      });
    } else {
      const synth = await getPipeline(modelId, requestId);
      self.postMessage({ type: "progress", msg: "Synthèse vocale…", requestId });
      const out = await synth(text);
      self.postMessage({
        type: "done",
        requestId,
        data: out.audio,
        sampleRate: out.sampling_rate,
        length: out.audio.length,
      });
    }
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
