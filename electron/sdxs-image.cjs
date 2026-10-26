// electron/sdxs-image.cjs — Génération d'image texte→image via SDXS-512-0.9
// (UNet 0,3 Md paramètres, distillation 1 pas, quantifié int8) + décodeur TAESD.
// Uses onnxruntime-node (CPU) et le tokenizer CLIP via @huggingface/tokenizers.
// Le bundle modèle est embarqué via extraResources dans
// resources/oonx/sdxs-512-texte-image/. L'utilisateur peut aussi fournir un
// chemin explicite via le paramètre « Chemin modèle ».

const ort = require("onnxruntime-node");
const { Tokenizer } = require("@huggingface/tokenizers");
const fs = require("fs");
const path = require("path");

const LATENT_SIZE = 64; // 512 / 8 (facteur de sous-échantillonnage VAE)
const IMAGE_SIZE = 512;
const MAX_TOKENS = 77;
// alpha_cumprod au timestep fixe t=999 (schedule scaled_linear, beta 0.00085→0.012,
// 1000 pas d'entraînement) — mesuré empiriquement en rejouant le pipeline de
// référence diffusers ; SDXS n'utilise qu'un seul pas de débruitage, toujours à
// t=999, donc cette constante scalaire remplace toute la logique de scheduler.
const ALPHA_CUMPROD_T999 = 0.00466009508818388;

let cached = null;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(size, rng) {
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u = 1 - rng(), v = rng();
    arr[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  return arr;
}

function loadTokenizer(modelDir) {
  const tokenizerJSON = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer.json"), "utf8"));
  const tokenizerConfig = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer_config.json"), "utf8"));
  return new Tokenizer(tokenizerJSON, tokenizerConfig);
}

/**
 * Les fournisseurs essayés pour chaque choix, et pourquoi « auto » seul replie.
 *
 * MESURÉ LE 2026-10-26 SUR UNE RTX 2060, graphe par graphe, trois exécutions chacun :
 *
 *   unet_int8          11,3 s au processeur,  6,88 s sur la carte   (1,64 fois plus rapide)
 *   text_encoder_int8  0,115 s                0,354 s              (trois fois plus LENT)
 *   vae_decoder        0,470 s                0,407 s
 *
 * Soit, pour une image, environ 11,9 s contre 7,6 s. La première exécution sur la carte coûte
 * 18,8 s, le temps que DirectML compile ; les suivantes sont stables.
 *
 * TOUS LES GRAPHES SUR LE MÊME FOURNISSEUR, OU AUCUN, comme pour Stable Audio 3 : un paquet dont
 * l'unet tombe sur la carte et dont l'encodeur y tient donnerait un mélange qu'aucune mesure ne
 * décrit. Les chiffres ci-dessus disent qu'un partage ferait gagner 0,24 s de plus — assez peu
 * pour ne pas payer cette complication, et la mesure est là si l'on change d'avis.
 */
const FOURNISSEURS = {
  auto: ["dml", "cpu"],
  carte: ["dml"],
  processeur: ["cpu"],
};

const fournisseursPour = (calcul) => FOURNISSEURS[calcul] ?? FOURNISSEURS.auto;

async function loadSessions(modelDir, calcul) {
  const onnxDir = path.join(modelDir, "onnx");
  const ouvrirTout = async (fournisseur) => {
    const create = (name) =>
      ort.InferenceSession.create(path.join(onnxDir, name), { executionProviders: [fournisseur] });
    return {
      textEncoder: await create("text_encoder_int8.onnx"),
      unet: await create("unet_int8.onnx"),
      vaeDecoder: await create("vae_decoder.onnx"),
      fournisseur,
    };
  };

  let sessions = null;
  let dernierRefus = null;
  for (const fournisseur of fournisseursPour(calcul)) {
    try {
      sessions = await ouvrirTout(fournisseur);
      break;
    } catch (erreur) {
      dernierRefus = erreur;
    }
  }
  if (!sessions) throw dernierRefus ?? new Error("Aucun fournisseur de calcul n'a pu ouvrir les graphes.");
  return sessions;
}

async function getResources(modelDir, calcul) {
  // LE PÉRIPHÉRIQUE ENTRE DANS LA CLÉ DU CACHE. Sans lui, en changer rendrait les sessions déjà
  // ouvertes sur l'autre, et le réglage ne pourrait rien changer au résultat — c'est le défaut
  // exact que le contrat de composant interdit, et que « Bruitage IA » a déjà payé.
  if (cached && cached.modelDir === modelDir && cached.calcul === calcul) return cached;
  const tokenizer = loadTokenizer(modelDir);
  const sessions = await loadSessions(modelDir, calcul);
  cached = { modelDir, calcul, tokenizer, sessions };
  return cached;
}

function tokenize(tokenizer, prompt) {
  const encoded = tokenizer.encode(prompt, { max_length: MAX_TOKENS, truncation: true, padding: "max_length" });
  const ids = new BigInt64Array(MAX_TOKENS);
  for (let i = 0; i < MAX_TOKENS; i++) ids[i] = BigInt(encoded.ids[i] ?? 0);
  return ids;
}

// Convertit la sortie brute du décodeur VAE ([1,3,512,512], CHW, ~[-1,1]) en
// RGBA entrelacé [0,255] — même formule que VaeImageProcessor.postprocess de
// diffusers : (x/2 + 0.5) clampé.
function chwToRgba(raw, size) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pix = y * size + x;
      for (let c = 0; c < 3; c++) {
        const v = raw[c * size * size + pix];
        rgba[pix * 4 + c] = Math.round(Math.min(1, Math.max(0, v / 2 + 0.5)) * 255);
      }
      rgba[pix * 4 + 3] = 255;
    }
  }
  return rgba;
}

async function generate(options) {
  const { prompt, seed = Math.floor(Math.random() * 2 ** 32), modelDir, onProgress, calcul = "auto" } = options;

  if (!modelDir || !fs.existsSync(modelDir)) {
    throw new Error(`Modèle introuvable : ${modelDir}`);
  }

  const { tokenizer, sessions } = await getResources(modelDir, calcul);

  onProgress?.("encodage du prompt");
  const ids = tokenize(tokenizer, prompt);
  const teOut = await sessions.textEncoder.run({ input_ids: new ort.Tensor("int64", ids, [1, MAX_TOKENS]) });

  onProgress?.("débruitage (1 pas)");
  const rng = mulberry32(seed);
  const latentShape = [1, 4, LATENT_SIZE, LATENT_SIZE];
  const noise = randn(4 * LATENT_SIZE * LATENT_SIZE, rng);
  const unetOut = await sessions.unet.run({
    sample: new ort.Tensor("float32", noise, latentShape),
    timestep: new ort.Tensor("int64", BigInt64Array.from([999n]), []),
    encoder_hidden_states: teOut.last_hidden_state,
  });

  // x0 = (x_t - sqrt(1 - alpha_t) * eps) / sqrt(alpha_t) — prédiction epsilon,
  // pas unique (voir constante ALPHA_CUMPROD_T999 ci-dessus).
  const eps = unetOut.noise_pred.data;
  const sqrtAlpha = Math.sqrt(ALPHA_CUMPROD_T999);
  const sqrtOneMinusAlpha = Math.sqrt(1 - ALPHA_CUMPROD_T999);
  const x0 = new Float32Array(noise.length);
  for (let i = 0; i < x0.length; i++) x0[i] = (noise[i] - sqrtOneMinusAlpha * eps[i]) / sqrtAlpha;

  onProgress?.("décodage de l'image");
  const vaeOut = await sessions.vaeDecoder.run({ latents: new ort.Tensor("float32", x0, latentShape) });
  const rgba = chwToRgba(vaeOut.image.data, IMAGE_SIZE);

  return { rgba: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: IMAGE_SIZE, height: IMAGE_SIZE, seed };
}

module.exports = { generate };
