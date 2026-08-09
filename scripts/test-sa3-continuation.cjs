// scripts/test-sa3-continuation.cjs — Test rapide du pipeline de continuation Stable Audio 3.
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
  process.exit(hasSignal ? 0 : 1);
}

main().catch((err) => {
  console.error("[test] Erreur :", err);
  process.exit(1);
});
