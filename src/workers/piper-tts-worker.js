// src/workers/piper-tts-worker.js — Web Worker pour Piper TTS (ONNX).
import { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime } from "piper-tts-web";

let engine = null;

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

function getEngine() {
  if (!engine) {
    const numThreads = globalThis.crossOriginIsolated ? navigator.hardwareConcurrency : 1;
    // Les assets Piper (onnx/ + piper/) sont copiés dans public/piper-tts par
    // `npm run copy-piper-assets`. En dev on les sert à la racine ; en prod
    // le worker est sous dist/assets/ et `../piper-tts/` le remonte à dist/.
    const onnxBase = resolveAppBase("../piper-tts/onnx/", "/piper-tts/onnx/");
    const piperBase = resolveAppBase("../piper-tts/piper/", "/piper-tts/piper/");
    console.log("[piper-worker] bases:", { onnxBase, piperBase, importMetaUrl: import.meta.url, origin: self.location?.origin });
    engine = new PiperWebEngine({
      onnxRuntime: new OnnxWebRuntime({ basePath: onnxBase, numThreads }),
      phonemizeRuntime: new PhonemizeWebRuntime({ basePath: piperBase }),
    });
  }
  return engine;
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

self.onmessage = async (e) => {
  const { text, voice, speaker } = e.data;
  try {
    const response = await getEngine().generate(text, voice, speaker ?? 0);
    const { sampleRate, data } = await decodeWavToBuffer(response.file);
    self.postMessage({
      type: "done",
      data,
      sampleRate,
      length: data.length,
    });
  } catch (err) {
    self.postMessage({ type: "error", msg: String(err?.message || err) });
  }
};
