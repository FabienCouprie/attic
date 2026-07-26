const fs = require("fs");
const path = require("path");

// Copie les fichiers WASM/JS de Sherpa-ONNX nécessaires à l'exécution du
// worker ASR dans public/sherpa-onnx-wasm/. Les fichiers sont servis en tant
// qu'assets statiques par Vite et Electron.
const srcDir = path.join(__dirname, "..", "node_modules", "@siteed", "sherpa-onnx.rn", "wasm");
const destDir = path.join(__dirname, "..", "public", "sherpa-onnx-wasm");

const files = [
  "sherpa-onnx-wasm-combined.js",
  "sherpa-onnx-wasm-combined.wasm",
  "sherpa-onnx-core.js",
  "sherpa-onnx-asr.js",
  "sherpa-onnx-vad.js",
];

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-sherpa-wasm] ${file} not found, skipping`);
    continue;
  }
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  console.log(`[copy-sherpa-wasm] ${file} -> ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}
