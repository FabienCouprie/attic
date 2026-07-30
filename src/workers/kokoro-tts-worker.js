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

function sendProgress(msg) {
  self.postMessage({ type: "progress", msg });
}

self.onmessage = async (e) => {
  const { text, voice, speed, labels } = e.data;
  const label = (key, fallback) => labels?.[key] ?? fallback;
  const formatDownload = (file, pct) => {
    const tpl = label("download", "Téléchargement {__VAR_0__} {__VAR_1__}%");
    return tpl.replace("{__VAR_0__}", file ?? "").replace("{__VAR_1__}", pct);
  };
  try {
    if (!tts) {
      sendProgress(label("load", "Chargement du modèle Kokoro…"));
      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (data) => {
          // data.status peut être "progress", "download", "done", "ready"
          if (data?.status === "progress" && typeof data.progress === "number") {
            const pct = Math.round(data.progress * 100);
            sendProgress(formatDownload(data.file || "", pct));
          } else if (data?.status === "download" && typeof data.progress === "number") {
            const pct = Math.round(data.progress * 100);
            sendProgress(formatDownload(data.file || "", pct));
          } else if (data?.status) {
            sendProgress(data.status);
          }
        },
      });
    }

    sendProgress(label("synthesize", "Synthèse vocale…"));
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
      data,
      sampleRate,
      length: data.length,
    });
  } catch (err) {
    console.error("[kokoro-worker] error", err);
    self.postMessage({ type: "error", msg: String(err?.message || err) });
  }
};
