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
/**
 * Les fournisseurs d'exécution à essayer, dans l'ordre.
 *
 * MESURÉ SUR UNE RTX 2060, même paquet et mêmes réglages : le paquet de bruitage, exporté en
 * fp16, passe de 65,0 s à 35,1 s pour dix secondes de son en allant sur la carte. Le paquet
 * musical, exporté en int4, est refusé par DirectML à l'initialisation et reste sur le
 * processeur, où il tient de toute façon en 18,1 s.
 *
 * « auto » essaie donc la carte et retombe sur le processeur, ce qui sert les deux paquets avec
 * un seul réglage. Les deux autres choix ne replient pas : qui demande un périphérique veut
 * savoir s'il répond, et non obtenir l'autre sans être prévenu.
 */
const FOURNISSEURS = {
  auto: ["dml", "cpu"],
  carte: ["dml"],
  processeur: ["cpu"],
};

const fournisseursPour = (calcul) => FOURNISSEURS[calcul] ?? FOURNISSEURS.auto;

async function loadSessions(modelDir, calcul) {
  const onnxDir = path.join(modelDir, "onnx");
  const present = (name) => fs.existsSync(path.join(onnxDir, name));
  const premier = (...noms) => noms.find(present);

  const ditFichier = premier("dit_q4.onnx", "dit_fp16.onnx", "dit.onnx");
  if (!ditFichier) throw new Error(`Aucun graphe de diffusion dans ${onnxDir}`);
  const texteFichier = premier("text_encoder_q4.onnx", "text_encoder.onnx");
  if (!texteFichier) throw new Error(`Aucun encodeur de texte dans ${onnxDir}`);
  const decodeurFichier = premier("decoder_q4.onnx", "decoder_bf16.onnx", "decoder.onnx");
  if (!decodeurFichier) throw new Error(`Aucun decodeur dans ${onnxDir}`);

  // TOUS LES GRAPHES SUR LE MÊME FOURNISSEUR, OU AUCUN. Un paquet dont le débruiteur tombe sur la
  // carte et dont l'encodeur y tient donnerait un mélange qu'aucune mesure ne décrit. On ouvre
  // donc la série entière, et un seul refus renvoie toute la série au repli.
  const ouvrirTout = async (fournisseur) => {
    const create = (name) =>
      ort.InferenceSession.create(path.join(onnxDir, name), { executionProviders: [fournisseur] });
    const sessions = {
      textEncoder: await create(texteFichier),
      dit: await create(ditFichier),
      decoder: await create(decodeurFichier),
    };
    if (present("number_conditioner.onnx")) sessions.numberConditioner = await create("number_conditioner.onnx");
    sessions.fournisseur = fournisseur;
    return sessions;
  };

  let sessions = null;
  let dernierRefus = null;
  for (const fournisseur of fournisseursPour(calcul)) {
    try {
      sessions = await ouvrirTout(fournisseur);
      break;
    } catch (erreur) {
      // MESURÉ : le paquet musical est exporté en int4, et DirectML refuse ce graphe à
      // l'initialisation, « Exception during initialization », 80070057. Le paquet de bruitage est
      // en fp16 et passe. Le repli n'est donc pas une precaution de style : c'est le seul moyen
      // qu'un meme reglage serve les deux paquets.
      dernierRefus = erreur;
    }
  }
  if (!sessions) throw dernierRefus ?? new Error("Aucun fournisseur de calcul n'a pu ouvrir les graphes.");

  // La marque du paquet, lue sur le graphe et non sur le nom du dossier.
  sessions.officiel = sessions.dit.inputNames.includes("t5_hidden");
  return sessions;
}

async function getResources(modelDir, calcul) {
  // LE CALCUL FAIT PARTIE DE LA CLÉ, et ce n'est pas un détail : sans lui, changer le réglage
  // rendait les sessions déjà ouvertes sur l'autre périphérique, et le réglage ne pouvait rien
  // changer au résultat. C'est exactement le défaut « paramètre jeté » que le contrat interdit.
  if (cached && cached.modelDir === modelDir && cached.calcul === calcul) {
    return cached;
  }
  const tokenizer = loadTokenizer(modelDir);
  const sessions = await loadSessions(modelDir, calcul);
  cached = { modelDir, calcul, tokenizer, sessions };
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
    calcul,
  } = options;

  if (!modelDir || !fs.existsSync(modelDir)) {
    throw new Error(`Modèle Stable Audio 3 absent (${modelDir}). Il ne vient plus avec l'installeur : prenez-le par l'icône « Récupérer les modèles IA » de la barre d'outils, ou indiquez un dossier dans le réglage « Dossier du modèle ».`);
  }

  const { tokenizer, sessions } = await getResources(modelDir, calcul);

  // LA MARGE N'EXISTE QUE POUR LE PAQUET COMMUNAUTAIRE, et le paquet officiel s'en passe. Le
  // runtime de reference de Stability calcule sa toile ainsi, sans rien ajouter :
  //
  //     T_lat = ceil(seconds * SAMPLE_RATE / SAMPLES_PER_LATENT)
  //
  // Nous en couvrions « seconds + 6 » tout en annoncant « seconds » au conditionnement : le modele
  // recevait donc une toile deux fois plus longue que la duree qu'on lui disait de remplir, et la
  // seconde moitie etait calculee puis jetee. Deux consequences, l'une entendue et l'autre mesuree :
  // ce qu'il fait de cette moitie non annoncee, et un temps de rendu double pour rien.
  const marge = sessions.officiel ? 0 : HEADROOM_SECONDS;
  const T_lat = Math.ceil(((seconds + marge) * SAMPLE_RATE) / DOWNSAMPLING) * 2;
  const localAddCond = zeros([1, 257, T_lat]);

  return diffuseAndDecode(sessions, tokenizer, prompt, seconds, T_lat, localAddCond, seed, steps, null);
}

module.exports = { generate };
