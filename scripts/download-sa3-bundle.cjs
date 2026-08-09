// scripts/download-sa3-bundle.cjs — Télécharge le bundle Stable Audio 3 small-music ONNX
// et l'encodeur audio nécessaire à la continuation. Usage : node scripts/download-sa3-bundle.cjs
const fs = require("fs");
const path = require("path");

const TARGET_DIR = path.join(__dirname, "..", "public", "oonx", "stable-audio-3-small-music");
const HF_BASE = "https://huggingface.co/lsb/stable-audio-3-small-music-onnx/resolve/main";
const ENCODER_URL = "https://huggingface.co/bgkb/encoder-onnx/resolve/main/encoder_q4.onnx";

const TOKENIZER_FILES = [
  "tokenizer/tokenizer.json",
  "tokenizer/tokenizer_config.json",
  "config.json",
];

const ONNX_FILES = [
  "onnx/number_conditioner.onnx",
  "onnx/text_encoder_q4.onnx",
  "onnx/text_encoder_q4_chunks.json",
  "onnx/dit_q4.onnx",
  "onnx/dit_q4_chunks.json",
  "onnx/decoder_q4.onnx",
  "onnx/decoder_q4_chunks.json",
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function downloadFile(url, dest, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total && onProgress) onProgress(received / total);
  }
  const data = new Uint8Array(received);
  let pos = 0;
  for (const chunk of chunks) {
    data.set(chunk, pos);
    pos += chunk.length;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
}

async function downloadWithProgress(url, dest) {
  const name = path.basename(dest);
  const start = Date.now();
  await downloadFile(url, dest, (ratio) => {
    const pct = Math.round(ratio * 100);
    process.stdout.write(`\r  ${name} ... ${pct}%`);
  });
  const s = (Date.now() - start) / 1000;
  const mb = fs.statSync(dest).size / 1024 / 1024;
  process.stdout.write(`\r  ${name} ... OK (${mb.toFixed(1)} Mo en ${s.toFixed(1)} s)\n`);
}

async function collectChunkFiles() {
  const files = [];
  for (const manifestFile of ["onnx/text_encoder_q4_chunks.json", "onnx/dit_q4_chunks.json", "onnx/decoder_q4_chunks.json"]) {
    const manifest = await fetchJson(`${HF_BASE}/${manifestFile}`);
    for (const chunk of manifest.chunks) {
      files.push(`onnx/${chunk.name}`);
    }
  }
  return files;
}

async function main() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log(`Cible : ${TARGET_DIR}`);

  const files = [...TOKENIZER_FILES, ...ONNX_FILES, ...(await collectChunkFiles()), "onnx/encoder_q4.onnx"];

  for (const rel of files) {
    const url = rel === "onnx/encoder_q4.onnx" ? ENCODER_URL : `${HF_BASE}/${rel}`;
    const dest = path.join(TARGET_DIR, rel);
    if (fs.existsSync(dest)) {
      console.log(`  ${path.basename(dest)} déjà présent, ignoré`);
      continue;
    }
    await downloadWithProgress(url, dest);
  }

  console.log("\nBundle Stable Audio 3 small-music + encodeur prêt.");
}

main().catch((err) => {
  console.error("\nErreur :", err.message);
  process.exit(1);
});
