// plugins/traduction.ts — Deux nodes de traduction dans « Autres » :
// 1. Traduction Whisper : texte → TTS interne → Whisper translate → texte anglais
// 2. OPUS-MT : texte → texte multilingue (paires de langues, modèle léger)

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

let ttsWorker: Worker | null = null;
let asrWorker: Worker | null = null;
let opusWorkers: Map<string, Worker> = new Map();

function getTtsWorker(): Worker {
  if (!ttsWorker) ttsWorker = new Worker(new URL("../workers/tts-worker.js", import.meta.url), { type: "module" });
  return ttsWorker;
}

function getAsrWorker(): Worker {
  if (!asrWorker) asrWorker = new Worker(new URL("../workers/asr-worker.js", import.meta.url), { type: "module" });
  return asrWorker;
}

function getOpusWorker(modelId: string): Worker {
  if (!opusWorkers.has(modelId)) {
    const w = new Worker(new URL("../workers/opus-worker.js", import.meta.url), { type: "module" });
    opusWorkers.set(modelId, w);
  }
  return opusWorkers.get(modelId)!;
}

// Libère les workers IA (et leurs modèles résidents en WASM) après usage —
// évite d'accumuler TTS + ASR + OPUS en mémoire sur un même run (saturation).
function libererTtsWorker(): void { if (ttsWorker) { ttsWorker.terminate(); ttsWorker = null; } }
function libererAsrWorker(): void { if (asrWorker) { asrWorker.terminate(); asrWorker = null; } }
function libererOpusWorker(modelId: string): void {
  const w = opusWorkers.get(modelId);
  if (w) { w.terminate(); opusWorkers.delete(modelId); }
}

// Paires de langues OPUS-MT disponibles (modèles légers ~30 MB chacun)
const Paires_OPUS: { id: string; nom: string; nomEn: string; model: string }[] = [
  { id: "fr-en", nom: "Français → Anglais", nomEn: "French → English", model: "Xenova/opus-mt-fr-en" },
  { id: "en-fr", nom: "Anglais → Français", nomEn: "English → French", model: "Xenova/opus-mt-en-fr" },
  { id: "en-es", nom: "Anglais → Espagnol", nomEn: "English → Spanish", model: "Xenova/opus-mt-en-es" },
  { id: "es-en", nom: "Espagnol → Anglais", nomEn: "Spanish → English", model: "Xenova/opus-mt-es-en" },
  { id: "en-de", nom: "Anglais → Allemand", nomEn: "English → German", model: "Xenova/opus-mt-en-de" },
  { id: "de-en", nom: "Allemand → Anglais", nomEn: "German → English", model: "Xenova/opus-mt-de-en" },
  { id: "en-it", nom: "Anglais → Italien", nomEn: "English → Italian", model: "Xenova/opus-mt-en-it" },
  { id: "it-en", nom: "Italien → Anglais", nomEn: "Italian → English", model: "Xenova/opus-mt-it-en" },
  { id: "en-ja", nom: "Anglais → Japonais", nomEn: "English → Japanese", model: "Xenova/opus-mt-en-ja" },
  { id: "ja-en", nom: "Japonais → Anglais", nomEn: "Japanese → English", model: "Xenova/opus-mt-ja-en" },
  { id: "en-zh", nom: "Anglais → Chinois", nomEn: "English → Chinese", model: "Xenova/opus-mt-en-zh" },
  { id: "zh-en", nom: "Chinois → Anglais", nomEn: "Chinese → English", model: "Xenova/opus-mt-zh-en" },
  { id: "en-ru", nom: "Anglais → Russe", nomEn: "English → Russian", model: "Xenova/opus-mt-en-ru" },
  { id: "ru-en", nom: "Russe → Anglais", nomEn: "Russian → English", model: "Xenova/opus-mt-ru-en" },
  { id: "en-pt", nom: "Anglais → Portugais", nomEn: "English → Portuguese", model: "Xenova/opus-mt-en-pt" },
  { id: "en-nl", nom: "Anglais → Néerlandais", nomEn: "English → Dutch", model: "Xenova/opus-mt-en-nl" },
  { id: "en-ar", nom: "Anglais → Arabe", nomEn: "English → Arabic", model: "Xenova/opus-mt-en-ar" },
  { id: "en-hi", nom: "Anglais → Hindi", nomEn: "English → Hindi", model: "Xenova/opus-mt-en-hi" },
];

export const fiches: FicheAudio[] = ([
  {
    id: "traduction-whisper", nom: "Traduction Whisper", nomEn: "Whisper Translation",
    univers: "Autres", famille: "Texte",
    resume: "Traduit un texte de n'importe quelle langue vers l'anglais (via TTS + Whisper).",
    resumeEn: "Translates text from any language to English (via TTS + Whisper).",
    entrees: [{ nom: "Texte", type: "texte" }],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Langue TTS", nomEn: "TTS Language", type: "choix",
        options: ["Auto", "Anglais", "Français", "Espagnol", "Allemand", "Italien", "Portugais", "Néerlandais", "Roumain", "Polonais", "Russe"],
        optionsEn: ["Auto", "English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Romanian", "Polish", "Russian"],
        defaut: "Auto",
        doc: "Langue du texte d'entrée (pour le TTS intermédiaire). « Auto » = anglais par défaut.",
        docEn: "Language of the input text (for the intermediate TTS). « Auto » = English default." },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: "Branchez un texte (port bleu)." };
      if (texte.trim().length < 35) return { valeurs: [null], message: "Texte trop court (min 35 caractères)." };

      // Étape 1 : TTS (texte → audio)
      ctx.onProgress("Synthèse vocale intermédiaire…");
      const ttsW = getTtsWorker();
      const langueTTS = ctx.paramTexte("Langue TTS", "Auto");
      const ttsModels: Record<string, string> = {
        "Anglais": "Xenova/speecht5_tts", "Français": "Xenova/mms-tts-fra", "Espagnol": "Xenova/mms-tts-spa",
        "Allemand": "Xenova/mms-tts-deu", "Italien": "Xenova/mms-tts-ita", "Portugais": "Xenova/mms-tts-por",
        "Néerlandais": "Xenova/mms-tts-nld", "Roumain": "Xenova/mms-tts-ron", "Polonais": "Xenova/mms-tts-pol",
        "Russe": "Xenova/mms-tts-rus", "Auto": "Xenova/speecht5_tts",
      };
      const ttsModel = ttsModels[langueTTS] || "Xenova/speecht5_tts";
      const speakerUrl = ttsModel === "Xenova/speecht5_tts"
        ? "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0001.bin"
        : undefined;

      const audioData = await new Promise<{ data: Float32Array; sampleRate: number } | null>((resolve) => {
        const onMsg = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "done") { libererTtsWorker(); resolve({ data: msg.data, sampleRate: msg.sampleRate }); }
          else if (msg.type === "error") { libererTtsWorker(); resolve(null); }
        };
        ttsW.addEventListener("message", onMsg);
        ttsW.postMessage({ text: texte, modelId: ttsModel, speakerUrl });
      });
      if (!audioData) return { valeurs: [null], message: "Échec du TTS intermédiaire." };

      // Étape 2 : Whisper translate (audio → texte anglais)
      ctx.onProgress("Traduction Whisper…");
      const asrW = getAsrWorker();
      const traduit = await new Promise<string | null>((resolve) => {
        const onMsg = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "done") { libererAsrWorker(); resolve(msg.text); }
          else if (msg.type === "error") { libererAsrWorker(); resolve(null); }
        };
        asrW.addEventListener("message", onMsg);
        asrW.postMessage({ audioData: audioData.data, sampleRate: audioData.sampleRate, modelId: "Xenova/whisper-large-v2", translate: true });
      });
      if (!traduit) return { valeurs: [null], message: "Échec de la traduction Whisper." };
      return { valeurs: [traduit], message: `Traduit (${langueTTS} → EN) : ${traduit.slice(0, 60)}${traduit.length > 60 ? "…" : ""}` };
    },
  },
  {
    id: "traduction-opus", nom: "Traduction OPUS-MT", nomEn: "OPUS-MT Translation",
    univers: "Autres", famille: "Texte",
    resume: "Traduit un texte entre paires de langues (OPUS-MT, modèle léger).",
    resumeEn: "Translates text between language pairs (OPUS-MT, lightweight model).",
    entrees: [{ nom: "Texte", type: "texte" }],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Paire", nomEn: "Pair", type: "choix",
        options: Paires_OPUS.map((p) => p.id), optionsEn: Paires_OPUS.map((p) => p.nomEn),
        defaut: "fr-en",
        doc: "Paire de langues source → cible. Chaque paire utilise un modèle OPUS-MT dédié (~30 MB).",
        docEn: "Source → target language pair. Each pair uses a dedicated OPUS-MT model (~30 MB)." },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: "Branchez un texte (port bleu)." };
      const paireId = ctx.paramTexte("Paire", "fr-en");
      const paire = Paires_OPUS.find((p) => p.id === paireId) ?? Paires_OPUS[0];
      const w = getOpusWorker(paire.model);
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            libererOpusWorker(paire.model);
            resolve({ valeurs: [msg.text], message: `${paire.nom} : ${msg.text.slice(0, 60)}${msg.text.length > 60 ? "…" : ""}` });
          } else if (msg.type === "error") {
            libererOpusWorker(paire.model);
            resolve({ valeurs: [null], erreur: true, message: `Erreur OPUS-MT : ${msg.msg}` });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, modelId: paire.model });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
