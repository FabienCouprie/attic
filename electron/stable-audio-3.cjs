// electron/stable-audio-3.cjs — Stable Audio 3 small-music text-to-audio + audio continuation.
// Uses onnxruntime-node (CPU) and the T5Gemma tokenizer from @huggingface/tokenizers.
// The model bundle is expected in public/oonx/stable-audio-3-small-music/.

const ort = require("onnxruntime-node");
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const LATENT_CHANNELS = 256;
const TEXT_LENGTH = 256;
const EMBED_DIM = 768;
const AUDIO_SAMPLES_PER_LATENT = 4096;
const DOWNSAMPLING = 8192;
const HEADROOM_SECONDS = 6;
const DEFAULT_STEPS = 8;
const DEFAULT_SECONDS = 10;
const DEFAULT_GENERATED_SECONDS = 5;
const MAX_SECONDS = 120;

let cached = null;

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function buildSchedule(steps) {
  const n = steps + 1;
  const arr = new Float32Array(n);
  const logsnrStart = -6.2;
  const logsnrEnd = 2.0;
  for (let i = 0; i < n; i++) {
    const t = 1 - i / (n - 1);
    const logsnr = logsnrEnd - t * (logsnrEnd - logsnrStart);
    arr[i] = sigmoid(-logsnr);
  }
  arr[0] = 1.0;
  return arr;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(shape, rng) {
  const size = shape.reduce((a, b) => a * b, 1);
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const u = 1 - rng();
    const v = rng();
    arr[i] = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  return arr;
}

function zeros(shape) {
  const size = shape.reduce((a, b) => a * b, 1);
  return new Float32Array(size);
}

function onesUint8(shape) {
  const size = shape.reduce((a, b) => a * b, 1);
  return new Uint8Array(size).fill(1);
}

function makeTensor(type, data, dims) {
  if (type === "int64") {
    return new ort.Tensor("int64", BigInt64Array.from(data.map(BigInt)), dims);
  }
  return new ort.Tensor(type, data, dims);
}

// LE PAQUET DE STABILITY NE LIVRE PAS DE `tokenizer_config.json`, seulement le `tokenizer.json`.
// Les deux paquets emploient pourtant LE MEME tokeniseur, celui de T5Gemma : on garde donc ces
// reglages sous la main plutot que d'exiger un fichier que l'amont ne publie pas. Recopies
// verbatim de ceux du paquet communautaire, dont ils viennent.
const CONFIG_TOKENISEUR_DEFAUT = {
  backend: "tokenizers",
  bos_token: "<bos>",
  eos_token: "<eos>",
  pad_token: "<pad>",
  unk_token: "<unk>",
  mask_token: "<mask>",
  padding_side: "right",
  clean_up_tokenization_spaces: false,
  spaces_between_special_tokens: false,
  tokenizer_class: "GemmaTokenizer",
};

function loadTokenizer(modelDir) {
  const { Tokenizer } = require("@huggingface/tokenizers");
  const tokenizerJSON = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer.json"), "utf8"));
  const cheminConfig = path.join(modelDir, "tokenizer", "tokenizer_config.json");
  const tokenizerConfig = fs.existsSync(cheminConfig)
    ? JSON.parse(fs.readFileSync(cheminConfig, "utf8"))
    : CONFIG_TOKENISEUR_DEFAUT;
  return new Tokenizer(tokenizerJSON, tokenizerConfig);
}

// DEUX PAQUETS, DEUX SIGNATURES DE GRAPHE. Le paquet `-small-music` vient d'un export communautaire
// en int4 : son DiT prend `cross_attn_cond` et `global_embed`, et un graphe separe transforme la
// duree en vecteur. Le paquet `-small-sfx` vient de Stability : son DiT prend `t5_hidden`,
// `t5_mask` et `seconds_total`, et assemble son conditionnement lui-meme, si bien qu'il n'a pas de
// `number_conditioner`. On ne devine pas lequel on tient, ON LE DEMANDE AU GRAPHE : ses noms
// d'entree sont la seule source sure, et un paquet renomme ou remplace ne peut pas nous tromper.
// Voir MODELES-BRUITAGE.md pour ce qui a conduit a ce second paquet.
async function loadSessions(modelDir) {
  const onnxDir = path.join(modelDir, "onnx");
  const create = (name) => ort.InferenceSession.create(path.join(onnxDir, name), { executionProviders: ["cpu"] });
  const present = (name) => fs.existsSync(path.join(onnxDir, name));
  const premier = (...noms) => noms.find(present);

  const ditFichier = premier("dit_q4.onnx", "dit_fp16.onnx", "dit.onnx");
  if (!ditFichier) throw new Error(`Aucun graphe de diffusion dans ${onnxDir}`);
  const texteFichier = premier("text_encoder_q4.onnx", "text_encoder.onnx");
  if (!texteFichier) throw new Error(`Aucun encodeur de texte dans ${onnxDir}`);
  const decodeurFichier = premier("decoder_q4.onnx", "decoder_bf16.onnx", "decoder.onnx");
  if (!decodeurFichier) throw new Error(`Aucun decodeur dans ${onnxDir}`);

  const sessions = {
    textEncoder: await create(texteFichier),
    dit: await create(ditFichier),
    decoder: await create(decodeurFichier),
  };
  if (present("number_conditioner.onnx")) {
    sessions.numberConditioner = await create("number_conditioner.onnx");
  }
  const encodeurFichier = premier("encoder_q4.onnx", "encoder_bf16.onnx");
  if (encodeurFichier) sessions.encoder = await create(encodeurFichier);

  // La marque du paquet, lue sur le graphe et non sur le nom du dossier.
  sessions.officiel = sessions.dit.inputNames.includes("t5_hidden");
  return sessions;
}

async function getResources(modelDir) {
  if (cached && cached.modelDir === modelDir) {
    return cached;
  }
  const tokenizer = loadTokenizer(modelDir);
  const sessions = await loadSessions(modelDir);
  cached = { modelDir, tokenizer, sessions };
  return cached;
}

function tokenize(tokenizer, prompt) {
  const encoded = tokenizer.encode(prompt, { max_length: TEXT_LENGTH, truncation: true, padding: true });
  const ids = encoded.ids;
  const attentionMask = encoded.attention_mask;
  const inputIds = Array.from({ length: TEXT_LENGTH }, () => 0n);
  const mask = Array.from({ length: TEXT_LENGTH }, () => 0n);
  for (let i = 0; i < Math.min(ids.length, TEXT_LENGTH); i++) {
    inputIds[i] = BigInt(ids[i]);
    mask[i] = BigInt(attentionMask[i]);
  }
  return { inputIds, attentionMask: mask };
}

function buildTextAndDurationConditioning(textEncoder, numberConditioner, prompt, seconds) {
  return Promise.all([
    textEncoder.run({
      input_ids: makeTensor("int64", prompt.inputIds, [1, TEXT_LENGTH]),
      attention_mask: makeTensor("int64", prompt.attentionMask, [1, TEXT_LENGTH]),
    }),
    numberConditioner.run({
      seconds: makeTensor("float32", new Float32Array([seconds]), [1]),
    }),
  ]);
}

function buildCrossAttentionAndGlobalConditioning(textEmbed, durationEmbed) {
  const crossAttnCond = new Float32Array(1 * 257 * EMBED_DIM);
  const globalCond = new Float32Array(1 * EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) {
    globalCond[i] = durationEmbed[i];
  }
  for (let t = 0; t < TEXT_LENGTH; t++) {
    for (let c = 0; c < EMBED_DIM; c++) {
      crossAttnCond[t * EMBED_DIM + c] = textEmbed[t * EMBED_DIM + c];
    }
  }
  for (let c = 0; c < EMBED_DIM; c++) {
    crossAttnCond[TEXT_LENGTH * EMBED_DIM + c] = durationEmbed[c];
  }
  return { crossAttnCond, globalCond };
}

function buildInpaintConditioning(prefixLatent, T_in, T_lat, scale = 0.27) {
  const cond = new Float32Array(1 * 257 * T_lat);
  const prefixSize = LATENT_CHANNELS * T_in;
  // The int4 encoder (bgkb/encoder-onnx) emits latents with a far larger scale than the diffusion
  // latents the model generates: encoder std ~2.3 vs diffusion std ~0.62 on a calibration signal.
  // Feeding the raw encoder latent into local_add_cond makes the DiT produce huge, distorted
  // output. Scale down to roughly match the diffusion latent distribution. Value is empirical
  // (0.62 / 2.31 ≈ 0.27) and works across the tested sine and real-music inputs.
  for (let j = 0; j < prefixSize; j++) {
    cond[j] = prefixLatent[j] * scale;
  }
  const maskOffset = LATENT_CHANNELS * T_lat;
  for (let t = 0; t < T_in; t++) {
    cond[maskOffset + t] = 1;
  }
  return cond;
}

async function diffuseAndDecode(sessions, tokenizer, prompt, seconds, T_lat, localAddCond, seed, steps, prefixLatent, T_in, latentScale) {
  const audioLen = T_lat * AUDIO_SAMPLES_PER_LATENT;
  const rng = mulberry32(seed);

  const { inputIds, attentionMask } = tokenize(tokenizer, prompt);

  // Le conditionnement, selon le paquet. Dans le cas officiel il n'y a rien a assembler : les etats
  // caches du texte et le masque partent tels quels, et la duree entre par son propre port.
  let conditionnement;
  if (sessions.officiel) {
    // Les deux encodeurs demandent les mêmes deux entrées : les `full_mask` et `sliding_mask` que
    // laissait entrevoir le fichier ne sont que des tenseurs internes, relevé en le chargeant.
    const sortie = await sessions.textEncoder.run({
      input_ids: makeTensor("int64", inputIds, [1, TEXT_LENGTH]),
      attention_mask: makeTensor("int64", attentionMask, [1, TEXT_LENGTH]),
    });
    const caches = sortie[sessions.textEncoder.outputNames[0]].data;
    const masque = new Float32Array(TEXT_LENGTH);
    for (let i = 0; i < TEXT_LENGTH; i++) masque[i] = Number(attentionMask[i]);
    conditionnement = {
      t5_hidden: makeTensor("float32", Float32Array.from(caches), [1, TEXT_LENGTH, EMBED_DIM]),
      t5_mask: makeTensor("float32", masque, [1, TEXT_LENGTH]),
      seconds_total: makeTensor("float32", new Float32Array([seconds]), [1]),
    };
  } else {
    const [textOut, numOut] = await buildTextAndDurationConditioning(
      sessions.textEncoder,
      sessions.numberConditioner,
      { inputIds, attentionMask },
      seconds
    );
    const { crossAttnCond, globalCond } = buildCrossAttentionAndGlobalConditioning(textOut.last_hidden_state.data, numOut.embedding.data);
    conditionnement = {
      cross_attn_cond: makeTensor("float32", crossAttnCond, [1, 257, EMBED_DIM]),
      global_embed: makeTensor("float32", globalCond, [1, EMBED_DIM]),
      padding_mask: makeTensor("bool", onesUint8([1, T_lat]), [1, T_lat]),
    };
  }

  let x = randn([1, LATENT_CHANNELS, T_lat], rng);
  const latentShape = [1, LATENT_CHANNELS, T_lat];
  const tTensor = new Float32Array(1);
  const schedule = buildSchedule(steps);

  // Optional: keep the known prefix region aligned with the noised encoder latent
  // instead of letting the sampler drift. This is a common inpainting sampler trick.
  const maskPrefix = prefixLatent && T_in > 0 && T_in < T_lat;

  for (let i = 0; i < schedule.length - 1; i++) {
    const tCurr = schedule[i];
    const tNext = schedule[i + 1];
    tTensor[0] = tCurr;
    const ditOut = await sessions.dit.run({
      x: makeTensor("float32", x, latentShape),
      t: makeTensor("float32", tTensor, [1]),
      local_add_cond: makeTensor("float32", localAddCond, [1, 257, T_lat]),
      ...conditionnement,
    });
    // `out` dans l'export communautaire, `velocity` chez Stability : on prend la sortie declaree
    // plutot que son nom, les deux graphes n'en ayant qu'une.
    const v = ditOut[sessions.dit.outputNames[0]].data;

    const denoised = new Float32Array(x.length);
    for (let j = 0; j < x.length; j++) {
      denoised[j] = x[j] - tCurr * v[j];
    }

    if (maskPrefix) {
      // Force the prefix region to denoise to the scaled encoder latent, so the
      // diffusion trajectory stays anchored to the real input. This compensates for
      // the fact that the bgkb int4 encoder latent does not perfectly align with the
      // distribution the DiT expects; without this anchor, the sampler drifts and the
      // continuation becomes unrelated noise/drone.
      for (let c = 0; c < LATENT_CHANNELS; c++) {
        for (let t = 0; t < T_in; t++) {
          const denoisedIdx = c * T_lat + t;
          const latentIdx = c * T_in + t;
          denoised[denoisedIdx] = prefixLatent[latentIdx] * latentScale;
        }
      }
    }

    const noise = randn(latentShape, rng);
    x = new Float32Array(x.length);
    for (let j = 0; j < x.length; j++) {
      x[j] = (1 - tNext) * denoised[j] + tNext * noise[j];
    }

  }

  const decOut = await sessions.decoder.run({
    [sessions.decoder.inputNames[0]]: makeTensor("float32", x, latentShape),
  });
  const sortie = decOut[sessions.decoder.outputNames[0]];
  const audio = sortie.data;

  // LES DEUX DÉCODEURS NE RANGENT PAS LEURS CANAUX PAREIL. L'export communautaire rend (1, 2, N),
  // les deux canaux l'un après l'autre ; celui de Stability rend (1, N, 2), entrelacé, et sa sortie
  // s'appelle d'ailleurs `pcm`. On lit la forme du tenseur plutôt que de la supposer : se tromper
  // ici ne casse rien, cela rend un canal gauche fait d'un échantillon sur deux.
  const dims = sortie.dims ?? [];
  const entrelace = dims.length === 3 && dims[2] === 2 && dims[1] !== 2;

  // LA SORTIE `pcm` EST EN ENTIERS, ET SON NOM LE DIT. Le decodeur de Stability rend des valeurs
  // d'echantillon seize bits, releve sur un rendu de deux secondes : min -2949, max 2253, valeur
  // efficace 170, la ou l'autre decodeur rend des flottants dans [-1, 1]. Prises telles quelles,
  // ces valeurs etaient ramenees a la butee par le bornage, et donnaient un signal dont la valeur
  // efficace egalait presque la crete : 0,887 contre 0,891, c'est-a-dire un carre.
  const echelle = sessions.decoder.outputNames[0] === "pcm" ? 1 / 32768 : 1;

  if (process.env.SA3_TRACE) {
    let mn = Infinity, mx = -Infinity, sq = 0;
    for (let i = 0; i < audio.length; i++) { const v = audio[i]; if (v < mn) mn = v; if (v > mx) mx = v; sq += v * v; }
    console.error(`[sa3] decodeur ${sessions.decoder.outputNames[0]} dims=${JSON.stringify(dims)} n=${audio.length} min=${mn.toFixed(4)} max=${mx.toFixed(4)} rms=${Math.sqrt(sq / audio.length).toFixed(4)} entrelace=${entrelace}`);
  }

  const trimSamples = Math.min(seconds * SAMPLE_RATE, audioLen);
  const left = new Float32Array(trimSamples);
  const right = new Float32Array(trimSamples);
  for (let i = 0; i < trimSamples; i++) {
    const g = (entrelace ? audio[i * 2] : audio[i]) * echelle;
    const d = (entrelace ? audio[i * 2 + 1] : audio[audioLen + i]) * echelle;
    left[i] = Math.max(-1, Math.min(1, g));
    right[i] = Math.max(-1, Math.min(1, d));
  }

  return { left, right, sampleRate: SAMPLE_RATE, duration: trimSamples / SAMPLE_RATE };
}

async function generate(options) {
  const {
    prompt,
    seconds = DEFAULT_SECONDS,
    steps = DEFAULT_STEPS,
    seed = Math.floor(Math.random() * 2 ** 32),
    modelDir,
  } = options;

  if (!modelDir || !fs.existsSync(modelDir)) {
    throw new Error(`Modèle Stable Audio 3 absent (${modelDir}). Il ne vient plus avec l'installeur : prenez-le par l'icône « Récupérer les modèles IA » de la barre d'outils, ou indiquez un dossier dans le réglage « Dossier du modèle ».`);
  }

  const T_lat = Math.ceil(((seconds + HEADROOM_SECONDS) * SAMPLE_RATE) / DOWNSAMPLING) * 2;
  const { tokenizer, sessions } = await getResources(modelDir);
  const localAddCond = zeros([1, 257, T_lat]);

  return diffuseAndDecode(sessions, tokenizer, prompt, seconds, T_lat, localAddCond, seed, steps, null);
}

function asFloat32Array(arr) {
  return arr instanceof Float32Array ? arr : Float32Array.from(arr);
}

function resampleLinear(src, srcRate, dstRate) {
  if (srcRate === dstRate) return Float32Array.from(src);
  const ratio = srcRate / dstRate;
  const dstLen = Math.max(1, Math.floor(src.length / ratio));
  const dst = new Float32Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, src.length - 1);
    const frac = srcPos - i0;
    dst[i] = src[i0] * (1 - frac) + src[i1] * frac;
  }
  return dst;
}

function toStereo44100(channels, sampleRate) {
  if (!channels || channels.length === 0) {
    throw new Error("Aucun canal audio fourni");
  }
  let left = resampleLinear(asFloat32Array(channels[0]), sampleRate, SAMPLE_RATE);
  let right = channels.length > 1
    ? resampleLinear(asFloat32Array(channels[1]), sampleRate, SAMPLE_RATE)
    : new Float32Array(left.length);
  if (channels.length === 1) {
    right = Float32Array.from(left);
  }
  const minLen = Math.min(left.length, right.length);
  if (left.length !== right.length) {
    left = left.subarray(0, minLen);
    right = right.subarray(0, minLen);
  }
  return { left, right };
}

async function decodeAudio(sessions, latent, T_lat) {
  // `latents` dans l'export communautaire, `latent` chez Stability ; la sortie s'appelle `audio`
  // chez l'un et autrement chez l'autre. Les deux graphes n'ayant qu'une entree et qu'une sortie,
  // on les prend par leur rang plutot que par leur nom.
  const decOut = await sessions.decoder.run({
    [sessions.decoder.inputNames[0]]: makeTensor("float32", latent, [1, LATENT_CHANNELS, T_lat]),
  });
  return decOut[sessions.decoder.outputNames[0]].data;
}

async function encodeAudio(sessions, left, right) {
  const N = Math.ceil(left.length / DOWNSAMPLING) * DOWNSAMPLING;
  const audioData = new Float32Array(2 * N);
  audioData.set(left, 0);
  audioData.set(right, N);
  const encoderOut = await sessions.encoder.run({
    audio: makeTensor("float32", audioData, [1, 2, N]),
  });
  return { latent: encoderOut.latents.data, T_in: N / AUDIO_SAMPLES_PER_LATENT };
}

async function continueAudio(options) {
  const {
    audio,
    prompt,
    generatedSeconds = DEFAULT_GENERATED_SECONDS,
    steps = DEFAULT_STEPS,
    seed = Math.floor(Math.random() * 2 ** 32),
    modelDir,
  } = options;

  if (!modelDir || !fs.existsSync(modelDir)) {
    throw new Error(`Modèle Stable Audio 3 absent (${modelDir}). Il ne vient plus avec l'installeur : prenez-le par l'icône « Récupérer les modèles IA » de la barre d'outils, ou indiquez un dossier dans le réglage « Dossier du modèle ».`);
  }
  if (!audio || !audio.channels || audio.channels.length === 0) {
    throw new Error("Audio d'entrée invalide");
  }

  const { tokenizer, sessions } = await getResources(modelDir);
  if (!sessions.encoder) {
    throw new Error("Encodeur audio introuvable dans le bundle (encoder_q4.onnx requis pour la continuation)");
  }

  const { left, right } = toStereo44100(audio.channels, audio.sampleRate);
  const { latent: prefixLatent, T_in } = await encodeAudio(sessions, left, right);

  const inputSeconds = left.length / SAMPLE_RATE;
  const totalSeconds = Math.min(inputSeconds + generatedSeconds, MAX_SECONDS);
  if (totalSeconds <= inputSeconds) {
    throw new Error("La durée générée doit être strictement positive");
  }

  const T_lat = Math.ceil(((totalSeconds + HEADROOM_SECONDS) * SAMPLE_RATE) / DOWNSAMPLING) * 2;
  if (T_in >= T_lat) {
    throw new Error("La durée générée est trop courte par rapport à la piste d'entrée");
  }

  const latentScale = 0.27;
  const localAddCond = buildInpaintConditioning(prefixLatent, T_in, T_lat, latentScale);

  const result = await diffuseAndDecode(sessions, tokenizer, prompt, totalSeconds, T_lat, localAddCond, seed, steps, prefixLatent, T_in, latentScale);

  // Preserve the original input exactly by copying the resampled source audio back into the
  // decoded output prefix. The diffusion model uses the encoded latent only as conditioning, so
  // the generated prefix is a reconstruction that may differ from the source; replacing it
  // guarantees the original audio is untouched. The generated continuation follows from there.
  const inputSamples = left.length;
  for (let i = 0; i < inputSamples; i++) {
    result.left[i] = left[i];
    result.right[i] = right[i];
  }
  result.duration = inputSeconds + generatedSeconds;
  return result;
}

module.exports = { generate, continueAudio, encodeAudio, decodeAudio };
