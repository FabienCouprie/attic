// src/workers/textgen-worker.js — Web Worker pour génération de texte
// (GPT-2 et NLLB/mBART via Transformers.js).
import { pipeline, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;

const generators = new Map();

function dtypeForModel(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.includes("nllb")) return { decoder_model_merged: "q8", encoder_model: "q8" };
  if (lower.includes("qwen")) return { decoder_model_merged: "q4f16" };
  return { decoder_model_merged: "fp32", encoder_model: "fp32" };
}

async function getGenerator(modelId, task, requestId) {
  const key = `${task}:${modelId}`;
  if (generators.has(key)) return generators.get(key);
  // Ne garder qu'un seul modèle en mémoire dans le worker pour éviter
  // l'accumulation de plusieurs gros modèles (Qwen, GPT-2, NLLB…) en parallèle.
  generators.clear();
  self.postMessage({ type: "progress", msg: "Chargement du modèle…", requestId });
  const gen = await pipeline(task, modelId, {
    device: "wasm",
    dtype: dtypeForModel(modelId),
  });  generators.set(key, gen);
  return gen;
}

const queue = [];
let busy = false;

async function processRequest(req) {
  const { prompt, messages, modelId, task, maxTokens, temperature, repetitionPenalty, requestId } = req;
  try {
    const gen = await getGenerator(modelId, task || "text-generation", requestId);
    self.postMessage({ type: "progress", msg: "Génération…", requestId });

    if (task === "text2text-generation") {
      // NLLB / mBART — seq2seq
      const output = await gen(prompt, {
        max_new_tokens: maxTokens || 100,
        temperature: temperature || 1.0,
        repetition_penalty: repetitionPenalty || 1.2,
        do_sample: true,
      });
      const text = Array.isArray(output) ? output[0]?.generated_text || output[0]?.translation_text || "" : output.generated_text || "";
      self.postMessage({ type: "done", requestId, text });
    } else if (messages && messages.length) {
      // Modèles conversationnels (Qwen, …)
      const output = await gen(messages, {
        max_new_tokens: maxTokens || 100,
        temperature: temperature || 0.9,
        repetition_penalty: repetitionPenalty || 1.3,
        do_sample: true,
        callback_function: (beam) => {
          if (beam && beam.tokens) {
            const pct = Math.round((beam.tokens.length / (maxTokens || 100)) * 100);
            self.postMessage({ type: "progress", msg: `Génération ${pct}%`, requestId });
          }
        },
      });
      const last = Array.isArray(output) && output[0]?.generated_text
        ? (output[0].generated_text.at(-1)?.content || "")
        : "";
      self.postMessage({ type: "done", requestId, text: last.trim() });
    } else {
      // GPT-2 — causal LM
      const output = await gen(prompt, {
        max_new_tokens: maxTokens || 100,
        temperature: temperature || 0.9,
        repetition_penalty: repetitionPenalty || 1.3,
        do_sample: true,
        callback_function: (beam) => {
          if (beam && beam.tokens) {
            const pct = Math.round((beam.tokens.length / (maxTokens || 100)) * 100);
            self.postMessage({ type: "progress", msg: `Génération ${pct}%`, requestId });
          }
        },
      });
      let text = Array.isArray(output) ? output[0]?.generated_text || "" : output.generated_text || "";
      // Retirer le prompt du début (GPT-2 le renvoie avec)
      if (text.startsWith(prompt)) text = text.substring(prompt.length).trim();
      self.postMessage({ type: "done", requestId, text });
    }
  } catch (err) {
    self.postMessage({ type: "error", requestId, msg: String(err?.message || err) });
  }
}

function processQueue() {
  if (busy) return;
  busy = true;
  (async () => {
    try {
      while (queue.length > 0) {
        const req = queue.shift();
        await processRequest(req);
      }
    } finally {
      busy = false;
    }
  })();
}

self.onmessage = (e) => {
  queue.push(e.data);
  processQueue();
};
