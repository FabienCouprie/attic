const fs = require("fs");
const path = require("path");

const srcDir = path.resolve(__dirname, "..", "node_modules", "piper-tts-web", "dist");
const destDir = path.resolve(__dirname, "..", "public", "piper-tts");

const dirs = ["onnx", "piper"];

function copyDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(srcDir)) {
  console.error("[copy-piper-assets] piper-tts-web dist folder not found:", srcDir);
  process.exit(1);
}

for (const dir of dirs) {
  copyDir(path.join(srcDir, dir), path.join(destDir, dir));
}

console.log("[copy-piper-assets] copied Piper TTS assets to", destDir);
