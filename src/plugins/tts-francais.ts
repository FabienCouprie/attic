// plugins/tts-francais.ts — Nœud « TTS Français » : synthèse vocale en français
// via Kokoro-82M (ONNX) + ephone pour la phonémisation. Utilise la voix ff_siwis.
// Le modèle et le pack de phonémisation sont téléchargés depuis HuggingFace au
// premier usage, puis mis en cache. Tourne dans un Web Worker.
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";

const VOIX_FRANCAISE = "ff_siwis";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/kokoro-francais-worker.js", import.meta.url), { type: "module" });
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
    resume: "Synthèse vocale en français via Kokoro-82M (voix Siwis).",
    resumeEn: "French text-to-speech using Kokoro-82M (Siwis voice).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "mono" }],
    parametres: [
      {
        nom: "Vitesse",
        nomEn: "Speed",
        type: "curseur",
        plage: [0.5, 2.0],
        pas: 0.1,
        defaut: 1.0,
        doc: "Vitesse de parole (1 = vitesse normale).",
        docEn: "Speaking speed (1 = normal speed).",
      },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) {
        return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      }
      const vitesse = ctx.paramNombre("Vitesse", 1.0);

      const w = getWorker();
      const lang = langueCourante();
      const labels = {
        load: traduire("progress.kokoro.load_model"),
        download: traduire("progress.kokoro.download"),
        synthesize: traduire("progress.kokoro.synthesize"),
        chunk: traduire("progress.kokoro.chunk"),
      };
      return new Promise((resolve, reject) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") {
            ctx.onProgress?.(msg.msg);
          } else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            try {
              const { data, sampleRate, length } = msg;
              const buf = new AudioBuffer({ numberOfChannels: 1, length, sampleRate });
              buf.getChannelData(0).set(data);
              resolve({
                valeurs: [buf],
                message: traduire("msg.kokoro_var_0_var_1", VOIX_FRANCAISE, texte.slice(0, 40), texte.length > 40 ? "…" : ""),
              });
            } catch (err) {
              reject(new Error(traduire("msg.erreur_kokoro_var_0", String(err))));
            }
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_kokoro_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, voice: VOIX_FRANCAISE, speed: vitesse, lang, labels, requestId });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
