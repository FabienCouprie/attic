// src/workers/kokoro-tts-worker.js — Web Worker pour Kokoro TTS (Transformers.js / ONNX).
// Charge le modèle Kokoro 82M et génère de la parole à partir d'un texte.
import { KokoroTTS, env } from "kokoro-js";
// kokoro-js bundle includes onnxruntime-web@1.22.0-dev, but Vite's default
// relative WASM resolution picks the root onnxruntime-web@1.27.0 files, which
// are incompatible. Force the runtime to load the bundled WASM files.
// Vite's `?url` import makes the browser load the .wasm file as a module script,
// which fails in dev because of MIME type checks. Use `new URL(..., import.meta.url)`
// instead; Vite resolves this to a plain asset URL both in dev and in production.
const wasmMjs = new URL(
  "../../node_modules/kokoro-js/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs",
  import.meta.url
).href;
const wasmBinary = new URL(
  "../../node_modules/kokoro-js/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm",
  import.meta.url
).href;

// onnxruntime-web expects env.wasm.wasmPaths either as a string prefix or as an
// object with { mjs, wasm }. Using the exact URLs keeps production hashed asset
// names working and prevents Vite from resolving the wasm files to the root
// onnxruntime-web@1.27.0 package (which is incompatible with kokoro-js's bundled
// onnxruntime-web@1.22.0-dev).
env.wasmPaths = {
  mjs: wasmMjs,
  wasm: wasmBinary,
};

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let tts = null;
const queue = [];
let busy = false;

function sendProgress(msg, requestId) {
  self.postMessage({ type: "progress", msg, requestId });
}

async function processRequest(req) {
  const { text, voice, speed, labels, requestId } = req;
  const label = (key, fallback) => labels?.[key] ?? fallback;
  const basename = (path) => {
    if (!path) return "";
    return path.split(/[\\/]/).pop() || path;
  };
  const toPercent = (value, loaded, total) => {
    if (typeof value === "number" && !isNaN(value)) {
      if (value >= 0 && value <= 1) return Math.round(value * 100);
      return Math.round(Math.min(100, Math.max(0, value)));
    }
    if (typeof loaded === "number" && typeof total === "number" && total > 0) {
      return Math.round(Math.min(100, Math.max(0, (loaded / total) * 100)));
    }
    return 0;
  };
  const formatLoad = (pct) => {
    const tpl = label("load", "Chargement du modèle Kokoro… {__VAR_0__}%");
    return tpl.replace("{__VAR_0__}", pct);
  };
  const formatDownload = (file, pct) => {
    const tpl = label("download", "Téléchargement {__VAR_0__} {__VAR_1__}%");
    return tpl.replace("{__VAR_0__}", basename(file)).replace("{__VAR_1__}", pct);
  };
  try {
    if (!tts) {
      sendProgress(formatLoad(0), requestId);
      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (data) => {
          // data.status peut être "progress", "download", "done", "ready", "initiate"
          const file = data?.file || "";
          if (data?.status === "progress") {
            const pct = toPercent(data.progress, data.loaded, data.total);
            sendProgress(formatLoad(pct), requestId);
          } else if (data?.status === "download") {
            const pct = toPercent(data.progress, data.loaded, data.total);
            sendProgress(formatDownload(file, pct), requestId);
          } else if (data?.status === "initiate") {
            sendProgress(formatLoad(0), requestId);
          } else if (data?.status === "ready") {
            sendProgress(formatLoad(100), requestId);
          }
        },
      });
    }

    sendProgress(label("synthesize", "Synthèse vocale…"), requestId);
    const audio = await tts.generate(text, { voice, speed });
    console.log("[kokoro-worker] audio object", audio);
    // kokoro-js returns { audio: Float32Array, sampling_rate: number }.
    const data = audio?.audio;
    const sampleRate = audio?.sampling_rate;
    if (!data || !sampleRate) {
      throw new Error(`L'audio généré est vide (data=${typeof data}, sampleRate=${sampleRate})`);
    }
    self.postMessage({
      type: "done",
      requestId,
      data,
      sampleRate,
      length: data.length,
    });
  } catch (err) {
    console.error("[kokoro-worker] error", err);
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
