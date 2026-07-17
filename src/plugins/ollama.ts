// plugins/ollama.ts — Nœud « LLM Ollama » : génération de texte via un serveur
// Ollama local (Llama, Qwen, Mistral, Phi…). L'appel HTTP passe par le main
// process (IPC) pour contourner la CSP et le CORS du renderer ; repli fetch
// direct en mode web/dev. Attic ne télécharge aucun modèle — c'est Ollama qui
// gère téléchargement, cache et exécution (hors du renderer → pas de saturation
// mémoire WASM, cf. modèles Transformers.js).
import type { PluginDef } from "../core";
import { avecDoc } from "./notices";

interface OptsOllama { model: string; prompt: string; thinking?: boolean; options?: Record<string, unknown>; timeout?: number }
interface RepOllama { reponse?: string; erreur?: string }

async function ollamaGenerer(opts: OptsOllama): Promise<RepOllama> {
  const api = (window as unknown as { api?: { ollamaGenerer?: (o: OptsOllama) => Promise<RepOllama> } }).api;
  if (api?.ollamaGenerer) return api.ollamaGenerer(opts); // Electron : passe par le main
  try {
    const r = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: opts.prompt }],
        stream: false,
        think: opts.thinking || false,
        options: opts.options || {},
      }),
    });
    if (!r.ok) {
      let detail = "";
      try { const b = await r.json(); if (b && b.error) detail = ` — ${b.error}`; } catch { /* corps non-JSON */ }
      return { erreur: `Ollama HTTP ${r.status}${detail}` };
    }
    const d = await r.json();
    return { reponse: d?.message?.content ?? d?.response ?? "" };
  } catch (e) {
    return { erreur: `Serveur Ollama injoignable sur :11434 (lancez « ollama serve ») — ${(e as Error)?.message || e}` };
  }
}

export const fiches: PluginDef[] = ([
  {
    id: "ollama-llm", nom: "LLM Ollama", nomEn: "Ollama LLM",
    univers: "Autres", famille: "Texte",
    resume: "Génère du texte via un modèle local Ollama (Llama, Qwen, Mistral…).",
    resumeEn: "Generates text via a local Ollama model (Llama, Qwen, Mistral…).",
    notice: "Interroge un serveur Ollama local (port 11434). Installez Ollama (ollama.com), lancez « ollama serve », puis tirez un modèle : « ollama pull llama3.2 » ou « ollama pull qwen2.5 ». Le prompt vient du paramètre, ou de l'entrée texte si elle est connectée. Attic ne télécharge aucun modèle — tout est géré par Ollama, hors du renderer.",
    noticeEn: "Queries a local Ollama server (port 11434). Install Ollama (ollama.com), run « ollama serve », then pull a model: « ollama pull llama3.2 » or « ollama pull qwen2.5 ». The prompt comes from the parameter, or from the text input if connected. Attic downloads no model — Ollama manages everything, outside the renderer.",
    entrees: [{ nom: "Texte", type: "texte", requis: false }],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Modèle", nomEn: "Model", type: "texte", defaut: "qwen3:4b",
        doc: "Nom du modèle Ollama installé (voir « ollama list »). Ex : llama3.2, qwen3:4b, mistral, phi3.",
        docEn: "Installed Ollama model name (see « ollama list »). E.g. llama3.2, qwen3:4b, mistral, phi3." },
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "Write the lyrics of a short song about the sea and freedom.",
        doc: "Instruction envoyée au modèle. Ignoré si une entrée texte est connectée.",
        docEn: "Instruction sent to the model. Ignored if a text input is connected." },
      { nom: "Température", nomEn: "Temperature", plage: [0, 2], pas: 0.1, defaut: 0.8,
        doc: "Créativité. Élevée = plus varié/aléatoire ; basse = plus déterministe.",
        docEn: "Creativity. High = more varied/random; low = more deterministic." },
      { nom: "Max tokens", nomEn: "Max tokens", plage: [32, 8192], pas: 32, defaut: 4096,
        doc: "Longueur maximale de la réponse (num_predict). Les modèles avec thinking (Qwen3) ont besoin de plus de tokens.",
        docEn: "Maximum response length (num_predict). Models with thinking mode (Qwen3) need more tokens." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const prompt = (typeof entree === "string" && entree.trim()) ? entree : ctx.paramTexte("Prompt", "");
      if (!prompt.trim()) return { valeurs: [null], message: "Aucun prompt (paramètre ou entrée texte)." };
      const model = ctx.paramTexte("Modèle", "llama3.2").trim() || "llama3.2";
      ctx.onProgress(`Ollama · ${model}…`);
      const res = await ollamaGenerer({
        model, prompt,
        options: { temperature: ctx.paramNombre("Température", 0.8), num_predict: ctx.paramNombre("Max tokens", 4096) },
      });
      if (res.erreur) return { valeurs: [null], erreur: true, message: `Ollama : ${res.erreur}` };
      const texte = (res.reponse || "").trim();
      if (!texte) return { valeurs: [null], erreur: true, message: "Réponse vide d'Ollama. Vérifiez le modèle et le serveur." };
      return { valeurs: [texte], message: texte };
    },
  },
] as PluginDef[]).map(avecDoc);
