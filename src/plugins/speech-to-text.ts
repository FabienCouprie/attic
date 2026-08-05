// plugins/speech-to-text.ts — Nœud de reconnaissance vocale (Speech-to-Text).
// Whisper anglais (OpenAI Whisper base), léger et rapide à charger.
// L'audio provient d'une entrée audio (port vert) — branchez un node « Entrée audio »
// ou un enregistrement. Le texte est émis sur la sortie texte (port bleu).
// La transcription tourne dans un Web Worker.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/asr-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Mixage stéréo → mono Float32Array pour Whisper
function bufferVersMono(buffer: AudioBuffer): Float32Array {
  const nch = buffer.numberOfChannels;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / nch;
  }
  return mono;
}

// Whisper nécessite 16 kHz — rééchantillonnage linéaire simple
function resamplerVers16k(mono: Float32Array, sr: number): Float32Array {
  if (sr === 16000) return mono;
  const ratio = 16000 / sr;
  const nb = Math.floor(mono.length * ratio);
  const out = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = idx + 1 < mono.length ? mono[idx] * (1 - frac) + mono[idx + 1] * frac : mono[Math.min(idx, mono.length - 1)];
  }
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "whisper-en", nom: "Whisper (Anglais)", nomEn: "Whisper (English)",
    univers: "Autres", famille: "Speech to Text",
    resume: "Transcription vocale en anglais (OpenAI Whisper base).",
    resumeEn: "English speech recognition (OpenAI Whisper base).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const mono = resamplerVers16k(bufferVersMono(audio), audio.sampleRate);
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [msg.text], message: traduire("msg.transcrit_var_0_var_1", msg.text.slice(0, 60), msg.text.length > 60 ? "…" : "") });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_whisper_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ audioData: mono, sampleRate: 16000, modelId: "Xenova/whisper-base.en", requestId });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
