// plugins/tts-kokoro.ts — Nœud « Kokoro TTS » : synthèse vocale locale
// (anglais) via Kokoro-82M ONNX + Transformers.js, exécuté dans un Web Worker.
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";

// Voix livrées avec le modèle Kokoro-82M-v1.0-ONNX (anglais, US + UK).
const VOIX_KOKORO = [
  "af_heart",
  "af_alloy",
  "af_aoede",
  "af_bella",
  "af_jessica",
  "af_kore",
  "af_nicole",
  "af_nova",
  "af_river",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_echo",
  "am_eric",
  "am_fenrir",
  "am_liam",
  "am_michael",
  "am_onyx",
  "am_puck",
  "am_santa",
  "bf_alice",
  "bf_emma",
  "bf_isabella",
  "bf_lily",
  "bm_daniel",
  "bm_fable",
  "bm_george",
  "bm_lewis",
] as const;

type VoixKokoro = (typeof VOIX_KOKORO)[number];

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/kokoro-tts-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

function isVoixKokoro(v: string): v is VoixKokoro {
  return (VOIX_KOKORO as readonly string[]).includes(v);
}

export const fiches: FicheAudio[] = ([
  {
    id: "tts-kokoro",
    nom: "Kokoro TTS",
    nomEn: "Kokoro TTS",
    univers: "Entrées",
    famille: "Text to Speech",
    resume: "Synthèse vocale locale en anglais via Kokoro-82M (ONNX).",
    resumeEn: "Local English text-to-speech with Kokoro-82M (ONNX).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "mono" }],
    parametres: [
      {
        nom: "Voix",
        nomEn: "Voice",
        type: "choix",
        options: [...VOIX_KOKORO],
        optionsEn: [...VOIX_KOKORO],
        defaut: "af_heart",
        defautEn: "af_heart",
        doc: "Voix Kokoro à utiliser. Le modèle (≈82 M de paramètres) et la voix sont téléchargés depuis HuggingFace au premier usage.",
        docEn: "Kokoro voice to use. The model (~82 M parameters) and voice are downloaded from HuggingFace on first use.",
      },
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
      const voixParam = ctx.paramTexte("Voix", "af_heart");
      const voix = isVoixKokoro(voixParam) ? voixParam : "af_heart";
      const vitesse = ctx.paramNombre("Vitesse", 1.0);

      const w = getWorker();
      const lang = langueCourante();
      const labels = {
        load: traduire("progress.kokoro.load_model"),
        download: traduire("progress.kokoro.download"),
        synthesize: traduire("progress.kokoro.synthesize"),
      };
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") {
            ctx.onProgress?.(msg.msg);
          } else if (msg.type === "done") {
            const { data, sampleRate, length } = msg;
            const buf = new AudioBuffer({ numberOfChannels: 1, length, sampleRate });
            buf.getChannelData(0).set(data);
            resolve({
              valeurs: [buf],
              message: traduire("msg.kokoro_var_0_var_1", voix, texte.slice(0, 40), texte.length > 40 ? "…" : ""),
            });
          } else if (msg.type === "error") {
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_kokoro_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, voice: voix, speed: vitesse, lang, labels });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
