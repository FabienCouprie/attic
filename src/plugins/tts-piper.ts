// plugins/tts-piper.ts — Nœud « Piper TTS » : synthèse vocale locale multilingue
// (ONNX) via Piper TTS. Excellente qualité pour le russe et de nombreuses langues.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

// Convertit l'ID technique Piper (langue_COUNTRY-voix-qualité) en libellé court
// utilisé comme valeur du paramètre : langue en majuscule, sans le pays.
function displayIdPiper(id: string) {
  const [lang, ...rest] = id.split("-");
  return `${lang.split("_")[0].toUpperCase()}-${rest.join("-")}`;
}

// Quelques voix Piper russes disponibles sur HuggingFace (rhasspy/piper-voices).
const VOIX_PIPER: Record<string, { id: string; displayId: string; nom: string; nomEn: string; langue: string }> = {
  "ru_RU-irina-medium": { id: "ru_RU-irina-medium", displayId: displayIdPiper("ru_RU-irina-medium"), nom: "Irina (russe, medium)", nomEn: "Irina (Russian, medium)", langue: "ru" },
  "ru_RU-ruslan-medium": { id: "ru_RU-ruslan-medium", displayId: displayIdPiper("ru_RU-ruslan-medium"), nom: "Ruslan (russe, medium)", nomEn: "Ruslan (Russian, medium)", langue: "ru" },
  "en_US-libritts_r-medium": { id: "en_US-libritts_r-medium", displayId: displayIdPiper("en_US-libritts_r-medium"), nom: "LibriTTS (anglais, medium)", nomEn: "LibriTTS (English, medium)", langue: "en" },
  "fr_FR-siwis-medium": { id: "fr_FR-siwis-medium", displayId: displayIdPiper("fr_FR-siwis-medium"), nom: "Siwis (français, medium)", nomEn: "Siwis (French, medium)", langue: "fr" },
  "de_DE-thorsten-medium": { id: "de_DE-thorsten-medium", displayId: displayIdPiper("de_DE-thorsten-medium"), nom: "Thorsten (allemand, medium)", nomEn: "Thorsten (German, medium)", langue: "de" },
  "es_ES-davefx-medium": { id: "es_ES-davefx-medium", displayId: displayIdPiper("es_ES-davefx-medium"), nom: "Davefx (espagnol, medium)", nomEn: "Davefx (Spanish, medium)", langue: "es" },
};

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
    id: "tts-piper",
    nom: "Piper TTS",
    nomEn: "Piper TTS",
    univers: "Entrées",
    famille: "Text to Speech",
    resume: "Synthèse vocale locale multilingue via Piper TTS (ONNX).",
    resumeEn: "Local multilingual text-to-speech via Piper TTS (ONNX).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Voix",
        nomEn: "Voice",
        type: "choix",
        options: Object.values(VOIX_PIPER).map((v) => v.displayId),
        optionsEn: Object.values(VOIX_PIPER).map((v) => v.displayId),
        defaut: displayIdPiper("ru_RU-irina-medium"),
        defautEn: displayIdPiper("ru_RU-irina-medium"),
        doc: "Voix Piper à utiliser. Les voix russes sont recommandées pour le russe. Le modèle ONNX de la voix est téléchargé depuis HuggingFace la première fois, puis mis en cache.",
        docEn: "Piper voice to use. Russian voices are recommended for Russian. The ONNX voice model is downloaded from HuggingFace on first use, then cached.",
      },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) {
        return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      }
      const defaultDisplayId = displayIdPiper("ru_RU-irina-medium");
      const voixId = ctx.paramTexte("Voix", defaultDisplayId);
      const voix = Object.values(VOIX_PIPER).find((v) => v.displayId === voixId || v.id === voixId || v.nom === voixId || v.nomEn === voixId)
        ?? VOIX_PIPER["ru_RU-irina-medium"];
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") {
            const total = Number(msg.total || 0);
            const downloaded = Number(msg.downloaded || 0);
            let progressText = traduire(msg.key);
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
              message: traduire("msg.piper_tts_var_0_var_1", voix.nom, texte.slice(0, 40), texte.length > 40 ? "…" : ""),
            });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_tts_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, voice: voix.id, speaker: 0, requestId });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
