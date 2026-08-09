// scripts/test-sa3-roundtrip.cjs — Test roundtrip encode → decode et stats latent.
const fs = require("fs");
const path = require("path");
const { encodeAudio, decodeAudio } = require("../electron/stable-audio-3.cjs");
const ort = require("onnxruntime-node");

const MODEL_DIR = "E:\\attic\\public\\oonx\\stable-audio-3-small-music";
const SAMPLE_RATE = 44100;
const SECONDS = 2;

function makeSine(freq, seconds) {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return arr;
}

function writeWavStereo(left, right, outPath) {
  const n = left.length;
  const dataSize = n * 2 * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) buffer.writeUInt8(str.charCodeAt(i), off + i); };
  writeStr(0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  writeStr(36, "data");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buffer.writeInt16LE(Math.floor(l * 32767.5 - 0.5), 44 + i * 4);
    buffer.writeInt16LE(Math.floor(r * 32767.5 - 0.5), 44 + i * 4 + 2);
  }
  fs.writeFileSync(outPath, buffer);
}

async function main() {
  const left = makeSine(440, SECONDS);
  const right = makeSine(880, SECONDS);
  const encoderPath = path.join(MODEL_DIR, "onnx", "encoder_q4.onnx");
  const decoderPath = path.join(MODEL_DIR, "onnx", "decoder_q4.onnx");
  const sessions = {
    encoder: await ort.InferenceSession.create(encoderPath, { executionProviders: ["cpu"] }),
    decoder: await ort.InferenceSession.create(decoderPath, { executionProviders: ["cpu"] }),
  };
  console.log("[test] Encodage...");
  const { latent, T_in } = await encodeAudio(sessions, left, right);
  console.log(`[test] latent T=${T_in}, length=${latent.length}`);
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0;
  for (let i = 0; i < latent.length; i++) {
    const v = latent[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / latent.length;
  const std = Math.sqrt(sumSq / latent.length - mean * mean);
  console.log(`[test] latent stats: min=${min.toFixed(4)}, max=${max.toFixed(4)}, mean=${mean.toFixed(4)}, std=${std.toFixed(4)}`);

  console.log("[test] Décodage...");
  const audio = await decodeAudio(sessions, latent, T_in);
  const audioLen = T_in * 4096;
  const outLeft = new Float32Array(audioLen);
  const outRight = new Float32Array(audioLen);
  for (let i = 0; i < audioLen; i++) {
    outLeft[i] = audio[i];
    outRight[i] = audio[audioLen + i];
  }
  let minA = Infinity, maxA = -Infinity, mad = 0;
  for (let i = 0; i < left.length; i++) {
    const d = Math.abs(left[i] - outLeft[i]);
    if (d > mad) mad = d;
  }
  for (let i = 0; i < audioLen; i++) {
    const l = outLeft[i];
    const r = outRight[i];
    if (l < minA) minA = l;
    if (r < minA) minA = r;
    if (l > maxA) maxA = l;
    if (r > maxA) maxA = r;
  }
  console.log(`[test] decoded audio min=${minA.toFixed(4)}, max=${maxA.toFixed(4)}, maxDiff vs orig=${mad.toFixed(4)}`);

  const outDir = "C:\\Users\\fcoup\\AppData\\Local\\Temp\\opencode";
  writeWavStereo(left, right, path.join(outDir, "sa3-roundtrip-input.wav"));
  writeWavStereo(outLeft, outRight, path.join(outDir, "sa3-roundtrip-output.wav"));
  console.log(`[test] WAV écrits dans ${outDir}`);
}

main().catch((err) => {
  console.error("[test] Erreur :", err);
  process.exit(1);
});
