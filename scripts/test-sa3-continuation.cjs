// scripts/test-sa3-continuation.cjs — Test rapide du pipeline de continuation Stable Audio 3.
const fs = require("fs");
const path = require("path");
const { continueAudio } = require("../electron/stable-audio-3.cjs");

const MODEL_DIR = "E:\\attic\\public\\oonx\\stable-audio-3-small-music";
const SAMPLE_RATE = 44100;
const INPUT_SECONDS = 0.5;
const GENERATED_SECONDS = 2;
const STEPS = 2;

function makeSine(freq, seconds) {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return arr;
}

function writeWavStereo(left, right, outPath) {
  const n = left.length;
  const dataSize = n * 2 * 2; // 2 channels, 16-bit
  const buffer = Buffer.alloc(44 + dataSize);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) buffer.writeUInt8(str.charCodeAt(i), off + i); };
  writeStr(0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // stereo
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28); // byte rate
  buffer.writeUInt16LE(4, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  writeStr(36, "data");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    const li = Math.floor(l * 32767.5 - 0.5);
    const ri = Math.floor(r * 32767.5 - 0.5);
    buffer.writeInt16LE(li, 44 + i * 4);
    buffer.writeInt16LE(ri, 44 + i * 4 + 2);
  }
  fs.writeFileSync(outPath, buffer);
}

function compareSignals(a, b) {
  const n = Math.min(a.length, b.length);
  let sumAbsDiff = 0;
  let sumAbsA = 0;
  let maxAbsDiff = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    sumAbsDiff += d;
    sumAbsA += Math.abs(a[i]);
    if (d > maxAbsDiff) maxAbsDiff = d;
  }
  return {
    mad: sumAbsDiff / n,
    relativeMad: sumAbsA > 0 ? sumAbsDiff / sumAbsA : 0,
    maxDiff: maxAbsDiff,
    samples: n,
  };
}

async function main() {
  const left = makeSine(440, INPUT_SECONDS);
  const right = makeSine(880, INPUT_SECONDS);
  console.log("[test] Lancement continuation...");
  const start = Date.now();
  const result = await continueAudio({
    audio: { channels: [left, right], sampleRate: SAMPLE_RATE },
    prompt: "electronic loop",
    generatedSeconds: GENERATED_SECONDS,
    steps: STEPS,
    seed: 1,
    modelDir: MODEL_DIR,
  });
  console.log(`[test] Terminé en ${((Date.now() - start) / 1000).toFixed(1)} s`);
  console.log(`[test] sampleRate=${result.sampleRate}, duration=${result.duration.toFixed(2)} s, leftLength=${result.left.length}, rightLength=${result.right.length}`);
  const expectedMin = Math.floor((INPUT_SECONDS + GENERATED_SECONDS) * SAMPLE_RATE);
  if (result.left.length < expectedMin) {
    throw new Error(`Sortie trop courte : ${result.left.length} < ${expectedMin}`);
  }
  const hasSignal = result.left.some((x) => Math.abs(x) > 1e-4) || result.right.some((x) => Math.abs(x) > 1e-4);
  console.log(`[test] signal présent : ${hasSignal}`);

  const leftCmp = compareSignals(left, result.left.subarray(0, left.length));
  const rightCmp = compareSignals(right, result.right.subarray(0, right.length));
  console.log(`[test] comparaison canal gauche : MAD=${leftCmp.mad.toFixed(4)}, rel=${leftCmp.relativeMad.toFixed(4)}, maxDiff=${leftCmp.maxDiff.toFixed(4)}`);
  console.log(`[test] comparaison canal droit : MAD=${rightCmp.mad.toFixed(4)}, rel=${rightCmp.relativeMad.toFixed(4)}, maxDiff=${rightCmp.maxDiff.toFixed(4)}`);

  const outDir = "C:\\Users\\fcoup\\AppData\\Local\\Temp\\opencode";
  writeWavStereo(left, right, path.join(outDir, "sa3-input.wav"));
  writeWavStereo(result.left, result.right, path.join(outDir, "sa3-continuation.wav"));
  console.log(`[test] WAV écrits dans ${outDir}`);

  process.exit(hasSignal ? 0 : 1);
}

main().catch((err) => {
  console.error("[test] Erreur :", err);
  process.exit(1);
});
