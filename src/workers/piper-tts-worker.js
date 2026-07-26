// src/workers/piper-tts-worker.js — Web Worker pour Piper TTS (local, ONNX).
import { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime } from "piper-tts-web";

let engine = null;

function getEngine() {
  if (!engine) {
    // ONNX multi-threading requires crossOriginIsolated (COOP/COEP).
    // Fall back to single-threading in environments that are not isolated
    // (dev server, standard Electron, older browsers) to avoid the warning
    // and the runtime fallback.
    const numThreads = globalThis.crossOriginIsolated ? navigator.hardwareConcurrency : 1;
    engine = new PiperWebEngine({
      onnxRuntime: new OnnxWebRuntime({ basePath: "/piper-tts/onnx/", numThreads }),
      phonemizeRuntime: new PhonemizeWebRuntime({ basePath: "/piper-tts/piper/" }),
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
    self.postMessage({ type: "progress", key: "progress.piper.load_voice" });
    const response = await getEngine().generate(text, voice, speaker ?? 0);
    self.postMessage({ type: "progress", key: "progress.piper.decode" });
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
