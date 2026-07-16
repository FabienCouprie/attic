// plugins/musicgen.ts — Nœud « Générateur IA MusicGen » : génère de la musique
// depuis un prompt texte via Xenova/musicgen-small (Transformers.js, ONNX).
// Le modèle tourne dans un Web Worker pour ne pas bloquer l'UI.

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/musicgen-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

// Libère le worker (et donc le modèle résident en mémoire WASM) après usage.
// Évite l'accumulation de plusieurs modèles IA sur un même run — cause de
// plantage par saturation mémoire. Le modèle se recharge au prochain besoin.
function libererWorker(): void {
  if (worker) { worker.terminate(); worker = null; }
}

export const fiches: PluginDef[] = ([
  {
    id: "musicgen", nom: "Générateur IA MusicGen", nomEn: "MusicGen AI Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère de la musique depuis un prompt texte (IA, Transformers.js).",
    resumeEn: "Generates music from a text prompt (AI, Transformers.js).",
    entrees: [{ nom: "Prompt", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "A happy upbeat pop song with electric guitars",
        doc: "Description textuelle de la musique à générer (en anglais pour de meilleurs résultats).",
        docEn: "Text description of the music to generate (English for best results)." },
      { nom: "Durée", nomEn: "Duration", plage: [3, 30], pas: 1, defaut: 10, unite: "s",
        doc: "Durée maximale de la génération (approximative — 150 tokens/s à 32 kHz).",
        docEn: "Maximum generation duration (approximate — 150 tokens/s at 32 kHz)." },
      { nom: "Guidance", nomEn: "Guidance", plage: [1, 10], pas: 0.5, defaut: 3, unite: "",
        doc: "Force du conditionnement par le prompt. Plus élevé = suit mieux le prompt mais moins créatif.",
        docEn: "Prompt conditioning strength. Higher = follows prompt more but less creative." },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "A happy upbeat pop song with electric guitars");
      const duree = ctx.paramNombre("Durée", 10);
      const guidance = ctx.paramNombre("Guidance", 3);
      // 150 tokens/s à 32 kHz → tokens ≈ durée × 150
      const maxTokens = Math.round(duree * 150);

      const w = getWorker();

      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") {
            ctx.onProgress(msg.msg);
          } else if (msg.type === "done") {
            libererWorker();
            const sr = msg.sampleRate;
            const data = msg.data;
            const buf = new AudioBuffer({ numberOfChannels: 1, length: data.length, sampleRate: sr });
            buf.getChannelData(0).set(data);
            resolve({ valeurs: [buf], message: `MusicGen · ${duree}s · "${prompt.slice(0, 40)}${prompt.length > 40 ? "…" : ""}"` });
          } else if (msg.type === "error") {
            libererWorker();
            resolve({ valeurs: [null], erreur: true, message: `Erreur MusicGen : ${msg.msg}` });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ prompt, maxTokens, guidanceScale: guidance });
      });
    },
  },
] as PluginDef[]).map(avecDoc);
