// plugins/tts-francais.ts — Nœud « TTS Français » : synthèse vocale dédiée au français.
// Utilise Piper TTS avec la voix Siwis (fr_FR-siwis-medium) via le même worker
// que le nœud Piper TTS multilingue. Le modèle ONNX (~55 Mo) est téléchargé
// depuis HuggingFace la première fois, puis mis en cache.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

const VOIX_FRANCAISE = "fr_FR-siwis-medium";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/piper-tts-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const fiches: FicheAudio[] = ([
  {
    id: "tts-francais",
    nom: "TTS Français",
    nomEn: "French TTS",
    univers: "Entrées",
    famille: "Text to Speech",
    resume: "Synthèse vocale en français via Piper TTS (voix Siwis).",
    resumeEn: "French text-to-speech via Piper TTS (Siwis voice).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) {
        return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      }
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") {
            const total = Number(msg.total || 0);
            const downloaded = Number(msg.downloaded || 0);
            let progressText = traduire(msg.key, ...(Array.isArray(msg.args) ? msg.args : []));
            if (msg.key === "progress.piper.download" && total > 0) {
              const pct = Math.round((downloaded / total) * 100);
              const mb = (downloaded / 1024 / 1024).toFixed(1);
              const totalMb = (total / 1024 / 1024).toFixed(1);
              progressText = `${progressText} ${pct}% (${mb}/${totalMb} MB)`;
            }
            ctx.onProgress(progressText);
          } else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            const buf = new AudioBuffer({ numberOfChannels: 1, length: msg.length, sampleRate: msg.sampleRate });
            buf.getChannelData(0).set(msg.data);
            resolve({
              valeurs: [buf],
              message: traduire("msg.tts_francais_var_0", texte.slice(0, 40), texte.length > 40 ? "…" : ""),
            });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_tts_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, voice: VOIX_FRANCAISE, speaker: 0, requestId });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
