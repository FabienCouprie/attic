// plugins/tts.ts — Nœuds de synthèse vocale (Text-to-Speech).
// Deux modèles : SpeechT5 (Microsoft, anglais haute qualité) et MMS-TTS (Meta, multilingue).
// Le texte provient d'une entrée texte (port bleu) — branchez un node « Source de texte ».
// La synthèse tourne dans un Web Worker pour ne pas bloquer l'UI.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/tts-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Embeddings de voix SpeechT5 (CMU Arctic — 7 locuteurs différents).
const BASE_VOIX = "https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main";
const VOIX_SPEECHT5 = [
  { id: "bdl", nom: "Homme américain (BDL)", nomEn: "US male (BDL)", url: `${BASE_VOIX}/cmu_us_bdl_arctic-wav-arctic_a0001.bin` },
  { id: "slt", nom: "Femme américaine (SLT)", nomEn: "US female (SLT)", url: `${BASE_VOIX}/cmu_us_slt_arctic-wav-arctic_a0001.bin` },
  { id: "clb", nom: "Femme américaine (CLB)", nomEn: "US female (CLB)", url: `${BASE_VOIX}/cmu_us_clb_arctic-wav-arctic_a0001.bin` },
  { id: "rms", nom: "Homme américain (RMS)", nomEn: "US male (RMS)", url: `${BASE_VOIX}/cmu_us_rms_arctic-wav-arctic_a0001.bin` },
  { id: "jmk", nom: "Homme canadien (JMK)", nomEn: "Canadian male (JMK)", url: `${BASE_VOIX}/cmu_us_jmk_arctic-wav-arctic_a0001.bin` },
  { id: "awb", nom: "Homme écossais (AWB)", nomEn: "Scottish male (AWB)", url: `${BASE_VOIX}/cmu_us_awb_arctic-wav-arctic_a0001.bin` },
  { id: "ksp", nom: "Homme indien (KSP)", nomEn: "Indian male (KSP)", url: `${BASE_VOIX}/cmu_us_ksp_arctic-wav-arctic_a0001.bin` },
];

// Langues supportées par MMS-TTS (subset — il en existe 1000+).
// `id` = code ISO 639-1, identité canonique du paramètre « Langue » (le libellé
// français servait auparavant de clé, donc d'identité).
const LANGUES_MMS: { id: string; fr: string; model: string }[] = [
  { id: "en", fr: "Anglais", model: "Xenova/mms-tts-eng" },
  { id: "fr", fr: "Français", model: "Xenova/mms-tts-fra" },
  { id: "es", fr: "Espagnol", model: "Xenova/mms-tts-spa" },
  { id: "de", fr: "Allemand", model: "Xenova/mms-tts-deu" },
  { id: "it", fr: "Italien", model: "Xenova/mms-tts-ita" },
  { id: "pt", fr: "Portugais", model: "Xenova/mms-tts-por" },
  { id: "nl", fr: "Néerlandais", model: "Xenova/mms-tts-nld" },
  { id: "ro", fr: "Roumain", model: "Xenova/mms-tts-ron" },
  { id: "pl", fr: "Polonais", model: "Xenova/mms-tts-pol" },
  { id: "ru", fr: "Russe", model: "Xenova/mms-tts-rus" },
];

// Accepte l'id canonique comme l'ancien libellé français (projets existants).
function modeleMMS(valeur: string): string | undefined {
  const v = String(valeur).trim().toLowerCase();
  return LANGUES_MMS.find((l) => l.id === v || l.fr.toLowerCase() === v)?.model;
}

export const fiches: FicheAudio[] = ([
  {
    id: "tts-speecht5", nom: "SpeechT5 TTS", nomEn: "SpeechT5 TTS",
    univers: "Entrées", famille: "Text to Speech",
    resume: "Synthèse vocale haute qualité (Microsoft SpeechT5, anglais).",
    resumeEn: "High-quality text-to-speech (Microsoft SpeechT5, English).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Voix", nomEn: "Voice", type: "choix",
        options: VOIX_SPEECHT5.map((v) => v.nom), optionsEn: VOIX_SPEECHT5.map((v) => v.nomEn ?? v.nom),
        defaut: VOIX_SPEECHT5[0].nom,
        doc: "Voix prédéfinie (embeddings CMU Arctic). BDL/RMS = hommes américains ; SLT/CLB = femmes américaines ; JMK = homme canadien ; AWB = homme écossais ; KSP = homme indien.",
        docEn: "Preset voice (CMU Arctic embeddings). BDL/RMS = US males; SLT/CLB = US females; JMK = Canadian male; AWB = Scottish male; KSP = Indian male.", defautEn: VOIX_SPEECHT5[0].nomEn ?? VOIX_SPEECHT5[0].nom },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      const voixId = ctx.paramTexte("Voix", VOIX_SPEECHT5[0].nom);
      const voix = VOIX_SPEECHT5.find((v) => v.id === voixId || v.nom === voixId || v.nomEn === voixId) ?? VOIX_SPEECHT5[0];
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            const buf = new AudioBuffer({ numberOfChannels: 1, length: msg.length, sampleRate: msg.sampleRate });
            buf.getChannelData(0).set(msg.data);
            resolve({ valeurs: [buf], message: traduire("msg.speecht5_var_0_var_1", texte.slice(0, 40), texte.length > 40 ? "…" : "") });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_tts_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, modelId: "Xenova/speecht5_tts", speakerUrl: voix.url, requestId });
      });
   },
  },
  {
    id: "tts-mms", nom: "MMS-TTS Multilingue", nomEn: "MMS-TTS Multilingual",
    univers: "Entrées", famille: "Text to Speech",
    resume: "Synthèse vocale multilingue (Meta MMS, 10+ langues).",
    resumeEn: "Multilingual text-to-speech (Meta MMS, 10+ languages).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: LANGUES_MMS.map((l) => l.fr), optionIds: LANGUES_MMS.map((l) => l.id),
        optionsEn: ["English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Romanian", "Polish", "Russian"],
        defaut: "Anglais",
        doc: "Langue du texte à synthétiser. Détermine le modèle MMS utilisé.",
        docEn: "Language of the text to synthesize. Determines which MMS model is used.", defautEn: "English" },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      const langue = ctx.paramTexte("Langue", "en");
      const modelId = modeleMMS(langue) ?? LANGUES_MMS[0].model;
      // Libellé lisible pour le message du nœud : `langue` vaut désormais un
      // code ISO (« en »), qui n'a pas de sens à afficher tel quel.
      const langueLabel = LANGUES_MMS.find((l) => l.id === langue)?.fr ?? langue;
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            const buf = new AudioBuffer({ numberOfChannels: 1, length: msg.length, sampleRate: msg.sampleRate });
            buf.getChannelData(0).set(msg.data);
            resolve({ valeurs: [buf], message: traduire("msg.mms_tts_var_0_var_1_var_2", langueLabel, texte.slice(0, 40), texte.length > 40 ? "…" : "") });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_tts_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, modelId, requestId });
      });
   },
  },
] as FicheAudio[]).map(avecDoc);
