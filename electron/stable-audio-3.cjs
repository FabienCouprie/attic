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

function loadTokenizer(modelDir) {
  const { Tokenizer } = require("@huggingface/tokenizers");
  const tokenizerJSON = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer.json"), "utf8"));
  const tokenizerConfig = JSON.parse(fs.readFileSync(path.join(modelDir, "tokenizer", "tokenizer_config.json"), "utf8"));
  return new Tokenizer(tokenizerJSON, tokenizerConfig);
}

async function loadSessions(modelDir) {
  const onnxDir = path.join(modelDir, "onnx");
  const create = (name) => ort.InferenceSession.create(path.join(onnxDir, name), { executionProviders: ["cpu"] });
  const sessions = {
    textEncoder: await create("text_encoder_q4.onnx"),
    numberConditioner: await create("number_conditioner.onnx"),
    dit: await create("dit_q4.onnx"),
    decoder: await create("decoder_q4.onnx"),
  };
  const encoderPath = path.join(onnxDir, "encoder_q4.onnx");
  if (fs.existsSync(encoderPath)) {
    sessions.encoder = await create("encoder_q4.onnx");
  }
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

function buildInpaintConditioning(prefixLatent, T_in, T_lat) {
  const cond = new Float32Array(1 * 257 * T_lat);
  const prefixSize = LATENT_CHANNELS * T_in;
  for (let j = 0; j < prefixSize; j++) {
    cond[j] = prefixLatent[j];
  }
  const maskOffset = LATENT_CHANNELS * T_lat;
  for (let t = 0; t < T_in; t++) {
    cond[maskOffset + t] = 1;
  }
  return cond;
}

async function diffuseAndDecode(sessions, tokenizer, prompt, seconds, T_lat, localAddCond, seed, steps, prefixLatent) {
  const audioLen = T_lat * AUDIO_SAMPLES_PER_LATENT;
  const rng = mulberry32(seed);

  const { inputIds, attentionMask } = tokenize(tokenizer, prompt);
  const [textOut, numOut] = await buildTextAndDurationConditioning(
    sessions.textEncoder,
    sessions.numberConditioner,
    { inputIds, attentionMask },
    seconds
  );
  const { crossAttnCond, globalCond } = buildCrossAttentionAndGlobalConditioning(textOut.last_hidden_state.data, numOut.embedding.data);

  const paddingMask = onesUint8([1, T_lat]);

  let x = randn([1, LATENT_CHANNELS, T_lat], rng);
  const latentShape = [1, LATENT_CHANNELS, T_lat];
  const tTensor = new Float32Array(1);
  const schedule = buildSchedule(steps);

  if (prefixLatent) {
    const prefixSize = prefixLatent.length;
    for (let j = 0; j < prefixSize; j++) x[j] = prefixLatent[j];
  }

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

    if (prefixLatent) {
      const prefixSize = prefixLatent.length;
      for (let j = 0; j < prefixSize; j++) {
        x[j] = prefixLatent[j];
      }
    }
  }

  const decOut = await sessions.decoder.run({
    latents: makeTensor("float32", x, latentShape),
  });
  const audio = decOut.audio.data;

  const trimSamples = Math.min(seconds * SAMPLE_RATE, audioLen);
  const left = new Float32Array(trimSamples);
  const right = new Float32Array(trimSamples);
  for (let i = 0; i < trimSamples; i++) {
    left[i] = audio[i];
    right[i] = audio[audioLen + i];
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
    throw new Error(`Modèle introuvable : ${modelDir}`);
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
    throw new Error(`Modèle introuvable : ${modelDir}`);
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

  const localAddCond = buildInpaintConditioning(prefixLatent, T_in, T_lat);

  return diffuseAndDecode(sessions, tokenizer, prompt, totalSeconds, T_lat, localAddCond, seed, steps, prefixLatent);
}

module.exports = { generate, continueAudio };
