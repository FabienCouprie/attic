// src/workers/kokoro-francais-worker.js — Web Worker pour Kokoro TTS en français.
// Phonémise le texte avec ephone (eSpeak-NG WASM) puis génère l'audio via
// Kokoro-82M (ONNX) en utilisant la voix française ff_siwis.
import { KokoroTTS, env } from "kokoro-js";
import { splitText, trimSilence, mergeAudioBuffers } from "./tts-utils.js";
import createEphone, { roa } from "ephone";

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
const VOICE_FR = "ff_siwis";

let tts = null;
let ephone = null;
const queue = [];
let busy = false;

function sendProgress(msg, requestId) {
  self.postMessage({ type: "progress", msg, requestId });
}

async function getEphone() {
  if (!ephone) {
    ephone = await createEphone(roa);
    ephone.setVoice("fr");
  }
  return ephone;
}

/**
 * Phonémise un texte en français avec ephone.
 * ephone ajoute un point final systématique qu'on supprime.
 */
async function phonemizeFrench(text) {
  await getEphone();
  let ipa = ephone.textToIpa(text);
  // Suppression universelle du point final ajouté par ephone.
  ipa = ipa.replace(/\.$/, "").trim();
  // Post-traitement léger : ʲ → j (présent dans certaines langues).
  ipa = ipa.replace(/ʲ/g, "j");
  return ipa;
}

async function loadTts(requestId, labels) {
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

  sendProgress(formatLoad(0), requestId);
  return KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (data) => {
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

async function processRequest(req) {
  const { text, speed, labels, requestId } = req;
  const label = (key, fallback) => labels?.[key] ?? fallback;
  try {
    // Charge le modèle et initialise ephone en parallèle au premier usage.
    if (!tts || !ephone) {
      const [loadedTts] = await Promise.all([loadTts(requestId, labels), getEphone()]);
      tts = loadedTts;
    }

    const chunks = splitText(text, 250);
    const audios = [];
    let sampleRate = 0;
    const total = chunks.length;
    for (let i = 0; i < total; i++) {
      const chunk = chunks[i];
      const chunkTpl = label("chunk", "Synthèse vocale… {__VAR_0__}/{__VAR_1__}");
      const chunkMsg = chunkTpl
        .replace("{__VAR_0__}", String(i + 1))
        .replace("{__VAR_1__}", String(total));
      sendProgress(chunkMsg, requestId);

      const phonemes = await phonemizeFrench(chunk);
      const { input_ids } = await tts.tokenizer(phonemes, { truncation: true });
      const audio = await tts.generate_from_ids(input_ids, { voice: VOICE_FR, speed });
      // kokoro-js returns { audio: Float32Array, sampling_rate: number }.
      const data = audio?.audio;
      const sr = audio?.sampling_rate;
      if (!data || !sr) {
        throw new Error(`L'audio généré est vide (chunk ${i + 1}/${total})`);
      }
      if (!sampleRate) sampleRate = sr;
      else if (sampleRate !== sr) {
        throw new Error(`Fréquence d'échantillonnage incompatible entre les chunks (${sampleRate} vs ${sr})`);
      }
      audios.push(trimSilence(data, sr));
    }
    const merged = mergeAudioBuffers(audios, { sampleRate });
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
    console.error("[kokoro-francais-worker] error", err);
    self.postMessage({ type: "error", requestId, msg: String(err?.message || err) });
  }
}

async function processQueue() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length > 0) {
      const req = queue.shift();
      await processRequest(req);
    }
  } finally {
    busy = false;
    // Si un message est arrivé entre la fin de la boucle et le relâchement du
    // verrou, il est en attente : redémarrer la file pour éviter de le bloquer.
    if (queue.length > 0) {
      processQueue();
    }
  }
}

self.onmessage = (e) => {
  queue.push(e.data);
  processQueue();
};
