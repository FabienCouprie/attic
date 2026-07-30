// plugins/musicgen.ts — Nœud de génération musicale texte → audio avec MusicGen-small.
// Utilise le modèle ONNX (Xenova/musicgen-small) exécuté dans un Web Worker
// Transformers.js. Le modèle se télécharge depuis HuggingFace au premier usage.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/musicgen-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

function libererWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

// Chaque token généré correspond environ à 20 ms de audio (50 Hz).
function tokensFromDuration(duration: number): number {
  return Math.max(1, Math.floor(duration * 50));
}

export const fiches: FicheAudio[] = ([
  {
    id: "musicgen",
    nom: "MusicGen",
    nomEn: "MusicGen",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère de la musique depuis un prompt texte avec Xenova/musicgen-small, version ONNX convertie de MusicGen Small (Meta), optimisée pour tourner localement via Transformers.js.",
    resumeEn: "Generates music from a text prompt using Xenova/musicgen-small, an ONNX-converted version of Meta's MusicGen Small text-to-audio model, optimized to run locally in JavaScript environments via Transformers.js.",
    entrees: [{ nom: "Prompt", nomEn: "Prompt", type: "texte", requis: false }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "mono" }],
    parametres: [
      {
        nom: "Prompt", nomEn: "Prompt", type: "texte",
        defaut: "A happy upbeat pop song with electric guitars",
        doc: "Description textuelle de la musique à générer (en anglais pour de meilleurs résultats).",
        docEn: "Text description of the music to generate (English for best results).",
        defautEn: "A happy upbeat pop song with electric guitars",
      },
      {
        nom: "Durée", nomEn: "Duration", type: "curseur",
        plage: [3, 30], pas: 1, defaut: 10, unite: "s",
        doc: "Durée de l’audio généré (3 à 30 secondes). Plus la durée est longue, plus la génération est lente.",
        docEn: "Duration of the generated audio (3 to 30 seconds). Longer durations mean slower generation.",
      },
      {
        nom: "Guidance scale", nomEn: "Guidance scale", type: "curseur",
        plage: [0, 10], pas: 0.5, defaut: 3.0,
        doc: "Force de l’adhérence au prompt texte. Valeurs élevées = plus fidèle au prompt mais moins varié.",
        docEn: "Strength of adherence to the text prompt. Higher values = more faithful but less varied.",
      },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "A happy upbeat pop song with electric guitars");
      if (!prompt.trim()) {
        return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      }
      const duration = ctx.paramNombre("Durée", 10);
      const guidanceScale = ctx.paramNombre("Guidance scale", 3.0);
      const maxTokens = tokensFromDuration(duration);

      const w = getWorker();
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") {
            ctx.onProgress?.(msg.msg);
          } else if (msg.type === "done") {
            libererWorker();
            const { data, sampleRate, length } = msg;
            const buf = new AudioBuffer({ numberOfChannels: 1, length, sampleRate });
            buf.getChannelData(0).set(data);
            resolve({
              valeurs: [buf],
              message: traduire("msg.musicgen_var_0_s_var_1_var_2", duration, prompt.slice(0, 40), prompt.length > 40 ? "…" : ""),
            });
          } else if (msg.type === "error") {
            libererWorker();
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_musicgen_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ prompt, maxTokens, guidanceScale });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
