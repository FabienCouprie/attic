// src/workers/piper-tts-worker.js — Web Worker pour Piper TTS (ONNX).
import { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime } from "piper-tts-web";
import { splitText, trimSilence, mergeAudioBuffers } from "./tts-utils.js";

/**
 * Resolves a base URL so it works in both dev and production.
 * In production Electron the worker is bundled under dist/assets/; relative paths
 * walk up into dist/ and find the bundled static files.
 * In dev, Vite may serve the worker from a blob or hashed asset URL, so we fall
 * back to absolute paths at the origin root where the public/ files are served.
 */
function resolveAppBase(relativePath, rootPath) {
  const url = import.meta.url || "";
  if (url.startsWith("file:")) {
    return new URL(relativePath, url).href;
  }
  if (self.location?.origin) {
    return new URL(rootPath, self.location.origin).href;
  }
  return new URL(relativePath, url).href;
}

function createEngine() {
  const numThreads = globalThis.crossOriginIsolated ? navigator.hardwareConcurrency : 1;
  // Les assets Piper (onnx/ + piper/) sont copiés dans public/piper-tts par
  // `npm run copy-piper-assets`. En dev on les sert à la racine ; en prod
  // le worker est sous dist/assets/ et `../piper-tts/` le remonte à dist/.
  const onnxBase = resolveAppBase("../piper-tts/onnx/", "/piper-tts/onnx/");
  const piperBase = resolveAppBase("../piper-tts/piper/", "/piper-tts/piper/");
  console.log("[piper-worker] creating engine with bases:", { onnxBase, piperBase, importMetaUrl: import.meta.url, origin: self.location?.origin });
  return new PiperWebEngine({
    onnxRuntime: new OnnxWebRuntime({ basePath: onnxBase, numThreads }),
    phonemizeRuntime: new PhonemizeWebRuntime({ basePath: piperBase }),
  });
}

function destroyEngine(engine) {
  try {
    engine?.destroy();
  } catch (e) {
    console.warn("[piper-worker] destroy engine warning:", e);
  }
}

async function decodeWavToBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const view = new DataView(arrayBuffer);
  const sampleRate = view.getUint32(24, true);
  const dataOffset = 44;
  const dataLength = (arrayBuffer.byteLength - dataOffset) / 2;
  const channelData = new Float32Array(dataLength);
  for (let i = 0; i < dataLength; i++) {
    const s = view.getInt16(dataOffset + i * 2, true);
    channelData[i] = s / 32768;
  }
  return { sampleRate, data: channelData };
}

const queue = [];
let busy = false;

async function processRequest(req) {
  const { text, voice, speaker, requestId } = req;
  try {
    const chunks = splitText(text, 120).filter((c) => c.trim());
    console.log("[piper-worker] chunks:", chunks.length, chunks);
    const buffers = [];
    let sampleRate = 0;
    const total = chunks.length;
    for (let i = 0; i < total; i++) {
      const chunk = chunks[i];
      self.postMessage({ type: "progress", key: "progress.piper.chunk", args: [i + 1, total], requestId });
      console.log(`[piper-worker] chunk ${i + 1}/${total}: "${chunk}"`);
      // Recréer un engine propre pour chaque chunk : cela reproduit le mode manuel
      // où chaque nœud Piper est une exécution isolée, et force la libération de la
      // mémoire WASM entre deux générations.
      const engine = createEngine();
      try {
        const response = await engine.generate(chunk, voice, speaker ?? 0);
        console.log(`[piper-worker] chunk ${i + 1}/${total} response:`, response?.file ? "blob" : "no blob", response?.file?.size);
        const { sampleRate: sr, data } = await decodeWavToBuffer(response.file);
        console.log(`[piper-worker] chunk ${i + 1}/${total} decoded: sr=${sr}, length=${data.length}`);
        if (!sampleRate) sampleRate = sr;
        else if (sampleRate !== sr) {
          throw new Error(`Sample rate mismatch between chunks (${sampleRate} vs ${sr})`);
        }
        buffers.push(trimSilence(data, sr));
      } finally {
        destroyEngine(engine);
      }
      // Pause entre les chunks pour laisser le runtime WASM libérer la mémoire.
      if (i < total - 1) await new Promise((r) => setTimeout(r, 500));
    }
    const merged = mergeAudioBuffers(buffers, { sampleRate });
    console.log("[piper-worker] merged:", merged?.length);
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
    console.error("[piper-worker] error", err);
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
