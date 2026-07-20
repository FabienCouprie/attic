// electron/stable-audio-3.cjs — Stable Audio 3 small-music text-to-audio pipeline.
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

function loadTokenizer(modelDir) {
  const { Tokenizer } = require("@huggingface/tokenizers");
  const tokenizerJSON = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer.json"), "utf8"));
  const tokenizerConfig = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer_config.json"), "utf8"));
  return new Tokenizer(tokenizerJSON, tokenizerConfig);
}

async function loadSessions(modelDir) {
  const onnxDir = path.join(modelDir, "onnx");
  const create = (name) => ort.InferenceSession.create(path.join(onnxDir, name), { executionProviders: ["cpu"] });
  return {
    textEncoder: await create("text_encoder_q4.onnx"),
    numberConditioner: await create("number_conditioner.onnx"),
    dit: await create("dit_q4.onnx"),
    decoder: await create("decoder_q4.onnx"),
  };
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
  const inputIds = new Array(TEXT_LENGTH).fill(0n);
  const mask = new Array(TEXT_LENGTH).fill(0n);
  for (let i = 0; i < Math.min(ids.length, TEXT_LENGTH); i++) {
    inputIds[i] = BigInt(ids[i]);
    mask[i] = BigInt(attentionMask[i]);
  }
  return { inputIds, attentionMask: mask };
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
    throw new Error(`Modèle introuvable : ${modelDir}`);
  }

  const rng = mulberry32(seed);
  const T_lat = Math.ceil(((seconds + HEADROOM_SECONDS) * SAMPLE_RATE) / DOWNSAMPLING) * 2;
  const audioLen = T_lat * AUDIO_SAMPLES_PER_LATENT;

  const { tokenizer, sessions } = await getResources(modelDir);

  const { inputIds, attentionMask } = tokenize(tokenizer, prompt);

  const textOut = await sessions.textEncoder.run({
    input_ids: makeTensor("int64", inputIds, [1, TEXT_LENGTH]),
    attention_mask: makeTensor("int64", attentionMask, [1, TEXT_LENGTH]),
  });
  const textEmbed = textOut.last_hidden_state.data;

  const numOut = await sessions.numberConditioner.run({
    seconds: makeTensor("float32", new Float32Array([seconds]), [1]),
  });
  const durationEmbed = numOut.embedding.data;

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

  const localAddCond = zeros([1, 257, T_lat]);
  const paddingMask = onesUint8([1, T_lat]);

  let x = randn([1, LATENT_CHANNELS, T_lat], rng);
  const schedule = buildSchedule(steps);
  const latentShape = [1, LATENT_CHANNELS, T_lat];
  const tTensor = new Float32Array(1);

  for (let i = 0; i < schedule.length - 1; i++) {
    const tCurr = schedule[i];
    const tNext = schedule[i + 1];
    tTensor[0] = tCurr;
    const ditOut = await sessions.dit.run({
      x: makeTensor("float32", x, latentShape),
      t: makeTensor("float32", tTensor, [1]),
      cross_attn_cond: makeTensor("float32", crossAttnCond, [1, 257, EMBED_DIM]),
      global_embed: makeTensor("float32", globalCond, [1, EMBED_DIM]),
      local_add_cond: makeTensor("float32", localAddCond, [1, 257, T_lat]),
      padding_mask: makeTensor("bool", paddingMask, [1, T_lat]),
    });
    const v = ditOut.out.data;

    const denoised = new Float32Array(x.length);
    for (let j = 0; j < x.length; j++) {
      denoised[j] = x[j] - tCurr * v[j];
    }

    const noise = randn(latentShape, rng);
    x = new Float32Array(x.length);
    for (let j = 0; j < x.length; j++) {
      x[j] = (1 - tNext) * denoised[j] + tNext * noise[j];
    }
  }

  const decOut = await sessions.decoder.run({
    latents: makeTensor("float32", x, latentShape),
  });
  const audio = decOut.audio.data;

  // Trim to requested length
  const trimSamples = Math.min(seconds * SAMPLE_RATE, audioLen);
  const left = new Float32Array(trimSamples);
  const right = new Float32Array(trimSamples);
  for (let i = 0; i < trimSamples; i++) {
    left[i] = audio[i];
    right[i] = audio[audioLen + i];
  }

  return { left, right, sampleRate: SAMPLE_RATE, duration: trimSamples / SAMPLE_RATE };
}

module.exports = { generate };
