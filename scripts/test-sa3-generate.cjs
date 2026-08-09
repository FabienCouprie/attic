// scripts/test-sa3-generate.cjs — Vérification non-régression du nœud Stable Audio 3 texte→audio.
const { generate } = require("../electron/stable-audio-3.cjs");

const MODEL_DIR = "E:\\attic\\public\\oonx\\stable-audio-3-small-music";

async function main() {
  const start = Date.now();
  const result = await generate({
    prompt: "electronic loop",
    seconds: 3,
    steps: 2,
    seed: 1,
    modelDir: MODEL_DIR,
  });
  console.log(`Terminé en ${((Date.now() - start) / 1000).toFixed(1)} s`);
  console.log(`sampleRate=${result.sampleRate}, duration=${result.duration.toFixed(2)} s, leftLength=${result.left.length}`);
  const hasSignal = result.left.some((x) => Math.abs(x) > 1e-4) || result.right.some((x) => Math.abs(x) > 1e-4);
  console.log(`signal présent : ${hasSignal}`);
  process.exit(hasSignal ? 0 : 1);
}

main().catch((err) => {
  console.error("Erreur :", err);
  process.exit(1);
});
