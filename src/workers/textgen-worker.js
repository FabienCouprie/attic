// src/workers/textgen-worker.js — Web Worker pour génération de texte
// (GPT-2 et NLLB/mBART via Transformers.js).
import { pipeline, env } from "@huggingface/transformers";

env.backends.onnx.wasm.proxy = true;

const generators = new Map();

async function getGenerator(modelId, task) {
  const key = `${task}:${modelId}`;
  if (generators.has(key)) return generators.get(key);
  self.postMessage({ type: "progress", msg: "Chargement du modèle…" });
  const gen = await pipeline(task, modelId, {
    device: "wasm",
    dtype: modelId.includes("nllb") 
      ? { decoder_model_merged: "q8", encoder_model: "q8" }
      : { decoder_model_merged: "fp32", encoder_model: "fp32" },
  });  generators.set(key, gen);
  return gen;
}

self.onmessage = async (e) => {
  const { prompt, modelId, task, maxTokens, temperature, repetitionPenalty } = e.data;
  try {
    const gen = await getGenerator(modelId, task || "text-generation");
    self.postMessage({ type: "progress", msg: "Génération…" });

    if (task === "text2text-generation") {
      // NLLB / mBART — seq2seq
      const output = await gen(prompt, {
        max_new_tokens: maxTokens || 100,
        temperature: temperature || 1.0,
        repetition_penalty: repetitionPenalty || 1.2,
        do_sample: true,
      });
      const text = Array.isArray(output) ? output[0]?.generated_text || output[0]?.translation_text || "" : output.generated_text || "";
      self.postMessage({ type: "done", text });
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
            self.postMessage({ type: "progress", msg: `Génération ${pct}%` });
          }
        },
      });
      let text = Array.isArray(output) ? output[0]?.generated_text || "" : output.generated_text || "";
      // Retirer le prompt du début (GPT-2 le renvoie avec)
      if (text.startsWith(prompt)) text = text.substring(prompt.length).trim();
      self.postMessage({ type: "done", text });
    }
  } catch (err) {
    self.postMessage({ type: "error", msg: String(err?.message || err) });
  }
};
