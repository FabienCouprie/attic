// scripts/test-sa3-generate.cjs — Test rapide du pipeline text-to-audio Stable Audio 3.
const { generate } = require("../electron/stable-audio-3.cjs");

const MODEL_DIR = "E:\\attic\\public\\oonx\\stable-audio-3-small-music";

async function main() {
  console.log("[test] Lancement génération...");
  const start = Date.now();
  const result = await generate({
    prompt: "a soft synth pad",
    seconds: 2,
    steps: 4,
    seed: 1,
    modelDir: MODEL_DIR,
  });
  console.log(`[test] Terminé en ${((Date.now() - start) / 1000).toFixed(1)} s`);
  console.log(`[test] sampleRate=${result.sampleRate}, duration=${result.duration.toFixed(2)} s, leftLength=${result.left.length}`);
  let minVal = Infinity, maxVal = -Infinity, sumSq = 0;
  for (let i = 0; i < result.left.length; i++) {
    const l = result.left[i];
    const r = result.right[i];
    if (l < minVal) minVal = l;
    if (r < minVal) minVal = r;
    if (l > maxVal) maxVal = l;
    if (r > maxVal) maxVal = r;
    sumSq += l * l + r * r;
  }
  const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
  const rms = Math.sqrt(sumSq / (2 * result.left.length));
  console.log(`[test] min=${minVal.toFixed(4)}, max=${maxVal.toFixed(4)}, absMax=${absMax.toFixed(4)}, RMS=${rms.toFixed(4)}`);
}

main().catch((err) => {
  console.error("[test] Erreur :", err);
  process.exit(1);
});
