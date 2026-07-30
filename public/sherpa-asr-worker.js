// public/sherpa-asr-worker.js — Web Worker classique pour Sherpa-ONNX ASR.
// Chargement via importScripts() car les modules Sherpa-ONNX sont des scripts
// globaux (Emscripten + wrappers) non compatibles avec les workers modules Vite.

// eslint-disable-next-line no-unused-vars
const SHERPA_WASM_BASE = "/sherpa-onnx-wasm/";

// Configuration du runtime Emscripten avant de charger le glue WASM.
self.Module = {
  locateFile: function(path) {
    return SHERPA_WASM_BASE + path;
  },
  // Réduire les logs par défaut du glue.
  print: function() {},
  printErr: function() {},
};

importScripts(SHERPA_WASM_BASE + "sherpa-onnx-wasm-combined.js");

// Les wrappers Sherpa s'attendent à un objet global nommé `global` (Node/Emscripten).
// Dans un Web Worker classique seul `self` existe, on crée donc l'alias.
self.global = self;

// Attendre que le runtime WASM soit initialisé avant d'utiliser Module.FS.
let wasmReadyResolve;
const wasmReady = new Promise((resolve) => {
  wasmReadyResolve = resolve;
});
self.onModuleReady = wasmReadyResolve;

importScripts(SHERPA_WASM_BASE + "sherpa-onnx-core.js");
importScripts(SHERPA_WASM_BASE + "sherpa-onnx-asr.js");

// Les classes ES6 déclarées dans le script ne sont pas auto-attachées à `self`.
self.OfflineRecognizer = OfflineRecognizer;
self.OfflineStream = OfflineStream;

let currentRecognizer = null;

function ensureModelDir(dir) {
  if (!dir) return;
  if (self.SherpaOnnx && self.SherpaOnnx.FileSystem) {
    self.SherpaOnnx.FileSystem.safeCreateDirectory(dir, false);
  } else {
    // Fallback minimal si le helper n'est pas encore prêt.
    const parts = dir.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? current + "/" + part : "/" + part;
      try {
        self.Module.FS.mkdir(current);
      } catch (e) {
        if (e.errno !== 20 && e.errno !== 17 && e.code !== "EEXIST") throw e;
      }
    }
  }
}

async function loadModelFiles(files, debug) {
  ensureModelDir("/sherpa-asr-model");
  for (const file of files) {
    const ok = await self.SherpaOnnx.FileSystem.safeLoadFile(file.url, file.fsPath, debug);
    if (!ok) throw new Error("Failed to load model file: " + file.url);
  }
}

async function initRecognizer(config, requestId) {
  await wasmReady;
  self.SherpaOnnx.onDownloadProgress = function(info) {
    self.postMessage({
      type: "progress",
      requestId,
      filename: info.filename || "model",
      percent: info.percent || 0,
      loaded: info.loaded || 0,
      total: info.total || 0,
    });
  };
  await loadModelFiles(config.files, config.debug);
  currentRecognizer = new self.OfflineRecognizer(config.recognizerConfig, self.Module);
  if (!currentRecognizer || !currentRecognizer.handle) {
    throw new Error("Failed to create Sherpa-ONNX offline recognizer");
  }
}

function recognize(sampleRate, samples) {
  if (!currentRecognizer) throw new Error("Recognizer not initialized");
  const stream = currentRecognizer.createStream();
  try {
    stream.acceptWaveform(sampleRate, samples);
    currentRecognizer.decode(stream);
    const result = currentRecognizer.getResult(stream);
    return result.text || "";
  } finally {
    stream.free();
  }
}

self.onmessage = async function(e) {
  const msg = e.data;
  const requestId = msg.requestId;
  try {
    if (msg.type === "init") {
      // Libère un éventuel reconnaisseur précédent pour supporter le changement
      // de langue / de modèle.
      if (currentRecognizer) {
        try { currentRecognizer.free(); } catch { /* ignore */ }
        currentRecognizer = null;
      }
      await initRecognizer(msg.config, requestId);
      self.postMessage({ type: "ready", requestId });
    } else if (msg.type === "transcribe") {
      const samples = new Float32Array(msg.samples);
      const text = recognize(msg.sampleRate, samples);
      self.postMessage({ type: "done", requestId, text });
    } else if (msg.type === "clearCache") {
      await self.SherpaOnnx.Cache.clear();
      self.postMessage({ type: "cacheCleared", requestId });
    } else {
      self.postMessage({ type: "error", requestId, error: "Unknown message type: " + msg.type });
    }
  } catch (err) {
    self.postMessage({ type: "error", requestId, error: String(err && err.message ? err.message : err) });
  }
};

// Notifie que le worker est chargé (prêt à recevoir init).
self.postMessage({ type: "loaded" });
