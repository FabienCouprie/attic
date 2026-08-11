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

function nomFichier(chemin) {
  if (!chemin) return "";
  return String(chemin).split(/[\\/]/).pop() || String(chemin);
}

// `loaded`/`total` (octets) font foi ; `progress` de Transformers.js est déjà
// un pourcentage 0-100 (et non une fraction 0-1) — cf. utils/core.js.
function pourcentage(loaded, total, progress) {
  if (typeof loaded === "number" && typeof total === "number" && total > 0) {
    return Math.round(Math.min(100, Math.max(0, (loaded / total) * 100)));
  }
  if (typeof progress === "number" && isFinite(progress)) {
    return Math.round(Math.min(100, Math.max(0, progress)));
  }
  return 0;
}

async function getGenerator(modelId, task, requestId, labels) {
  const key = `${task}:${modelId}`;
  if (generators.has(key)) return generators.get(key);
  // Ne garder qu'un seul modèle en mémoire dans le worker pour éviter
  // l'accumulation de plusieurs gros modèles (Qwen, GPT-2, NLLB…) en parallèle.
  generators.clear();

  // Les libellés arrivent déjà traduits depuis le plugin (un worker n'a pas
  // accès au contexte i18n de React) ; repli en français si absents, pour ne
  // pas casser les appelants qui ne les transmettent pas encore.
  const tplChargement = labels?.load || "Chargement du modèle… {__VAR_0__}%";
  const tplTelechargement = labels?.download || "Téléchargement {__VAR_0__} {__VAR_1__}%";
  const formatChargement = (pct) => tplChargement.replace("{__VAR_0__}", pct);
  const formatTelechargement = (fichier, pct) =>
    tplTelechargement.replace("{__VAR_0__}", nomFichier(fichier)).replace("{__VAR_1__}", pct);

  // Le téléchargement d'un modèle émet des centaines d'événements ; on limite
  // les postMessage à ~10/s pour ne pas saturer le thread principal (qui doit
  // rester libre de repeindre l'anneau de progression du nœud).
  let dernierEnvoi = 0;
  let dernierPct = -1;
  const envoyer = (msg, force) => {
    const maintenant = Date.now();
    if (!force && maintenant - dernierEnvoi < 100) return;
    dernierEnvoi = maintenant;
    self.postMessage({ type: "progress", msg, requestId });
  };

  envoyer(formatChargement(0), true);
  const gen = await pipeline(task, modelId, {
    device: "wasm",
    dtype: dtypeForModel(modelId),
    progress_callback: (data) => {
      const statut = data?.status;
      if (statut === "progress_total") {
        // Agrégat tous fichiers confondus : `pipeline()` pré-remplit les
        // tailles attendues de chaque fichier, donc ce pourcentage est
        // significatif dès le départ et progresse de 0 à 100 sans repartir
        // à zéro à chaque nouveau fichier (contrairement à `progress`).
        const pct = pourcentage(data.loaded, data.total, data.progress);
        if (pct === dernierPct) return;
        dernierPct = pct;
        envoyer(formatChargement(pct));
      } else if (statut === "progress" && dernierPct < 0) {
        // Repli fichier par fichier tant qu'aucun agrégat n'a été reçu.
        envoyer(formatTelechargement(data.file, pourcentage(data.loaded, data.total, data.progress)));
      } else if (statut === "ready") {
        envoyer(formatChargement(100), true);
      }
    },
  });
  generators.set(key, gen);
  return gen;
}

const queue = [];
let busy = false;

async function processRequest(req) {
  const { prompt, messages, modelId, task, maxTokens, temperature, repetitionPenalty, labels, requestId } = req;
  try {
    const gen = await getGenerator(modelId, task || "text-generation", requestId, labels);
    // Même famille de libellés que le chargement : sans ça, un utilisateur en
    // anglais verrait « Loading model… 40% » puis « Génération 20% ».
    const tplGeneration = labels?.generate_pct || "Génération {__VAR_0__}%";
    const formatGeneration = (pct) => tplGeneration.replace("{__VAR_0__}", pct);
    self.postMessage({ type: "progress", msg: labels?.generate || "Génération…", requestId });

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
            self.postMessage({ type: "progress", msg: formatGeneration(pct), requestId });
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
            self.postMessage({ type: "progress", msg: formatGeneration(pct), requestId });
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
