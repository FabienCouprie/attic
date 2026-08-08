// src/workers/tts-worker.js — Web Worker pour TTS (Transformers.js).
// SpeechT5 : chargement séparé des composants (tokenizer + model + vocoder).
// MMS-TTS : pipeline standard.
import { pipeline, AutoTokenizer, SpeechT5ForTextToSpeech, SpeechT5HifiGan, Tensor, env } from "@huggingface/transformers";
import { splitText, trimSilence, mergeAudioBuffers } from "./tts-utils.js";

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
  console.log(`[tts-worker] request modelId=${modelId} textLength=${text?.length} text="${text?.slice(0, 80)}${text?.length > 80 ? "..." : ""}"`);
  try {
    const chunks = splitText(text, 120).filter((c) => c.trim());
    console.log(`[tts-worker] chunks:`, chunks.length, chunks);
    const total = chunks.length;
    const buffers = [];
    let sampleRate = 0;

    if (modelId === "Xenova/speecht5_tts") {
      const { tokenizer, model, vocoder } = await getSpeechT5(requestId);
      self.postMessage({ type: "progress", msg: "Chargement voix…", requestId });
      const rep = await fetch(speakerUrl);
      const buf = await rep.arrayBuffer();
      const speakerEmbeddings = new Tensor("float32", new Float32Array(buf), [1, 512]);

      for (let i = 0; i < total; i++) {
        const chunk = chunks[i];
        self.postMessage({ type: "progress", key: "progress.speecht5.chunk", args: [i + 1, total], requestId });
        console.log(`[tts-worker] SpeechT5 chunk ${i + 1}/${total}: "${chunk}"`);
        const { input_ids } = await tokenizer(chunk);
        console.log(`[tts-worker] SpeechT5 chunk ${i + 1}/${total} input_ids length=${input_ids?.data?.length ?? input_ids?.length}`);
        const { waveform } = await model.generate_speech(input_ids, speakerEmbeddings, { vocoder });
        console.log(`[tts-worker] SpeechT5 chunk ${i + 1}/${total} done length=${waveform.data.length}`);
        if (!sampleRate) sampleRate = 16000;
        buffers.push(trimSilence(waveform.data, sampleRate));
        // Pause entre les chunks pour laisser le runtime WASM libérer la mémoire.
        if (i < total - 1) await new Promise((r) => setTimeout(r, 500));
      }
    } else {
      const synth = await getPipeline(modelId, requestId);
      for (let i = 0; i < total; i++) {
        const chunk = chunks[i];
        self.postMessage({ type: "progress", key: "progress.mms.chunk", args: [i + 1, total], requestId });
        console.log(`[tts-worker] MMS chunk ${i + 1}/${total}: "${chunk}"`);
        const out = await synth(chunk);
        console.log(`[tts-worker] MMS chunk ${i + 1}/${total} done sampleRate=${out.sampling_rate} length=${out.audio.length}`);
        if (!sampleRate) sampleRate = out.sampling_rate;
        else if (sampleRate !== out.sampling_rate) {
          throw new Error(`Sample rate mismatch between chunks (${sampleRate} vs ${out.sampling_rate})`);
        }
        buffers.push(trimSilence(out.audio, sampleRate));
        // Pause entre les chunks pour laisser le runtime WASM libérer la mémoire.
        if (i < total - 1) await new Promise((r) => setTimeout(r, 500));
      }
    }

    const merged = mergeAudioBuffers(buffers, { sampleRate });
    console.log(`[tts-worker] merged:`, merged?.length);
    if (!merged) {
      throw new Error("L'audio généré est vide après fusion");
    }
    self.postMessage({
      type: "done",
      requestId,
      data: merged,
      sampleRate,
      length: merged.length,
    });
  } catch (err) {
    console.error("[tts-worker] error modelId=%s", modelId, err);
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
