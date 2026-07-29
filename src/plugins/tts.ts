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

// Libère le worker (et donc le modèle résident en mémoire WASM) après usage.
// Évite l'accumulation de plusieurs modèles IA sur un même run — cause de
// plantage par saturation mémoire. Le modèle se recharge au prochain besoin.
function libererWorker(): void {
  if (worker) { worker.terminate(); worker = null; }
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
const LANGUES_MMS: Record<string, string> = {
  "Anglais": "Xenova/mms-tts-eng",
  "Français": "Xenova/mms-tts-fra",
  "Espagnol": "Xenova/mms-tts-spa",
  "Allemand": "Xenova/mms-tts-deu",
  "Italien": "Xenova/mms-tts-ita",
  "Portugais": "Xenova/mms-tts-por",
  "Néerlandais": "Xenova/mms-tts-nld",
  "Roumain": "Xenova/mms-tts-ron",
  "Polonais": "Xenova/mms-tts-pol",
  "Russe": "Xenova/mms-tts-rus",
};

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
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            libererWorker();
            const buf = new AudioBuffer({ numberOfChannels: 1, length: msg.length, sampleRate: msg.sampleRate });
            buf.getChannelData(0).set(msg.data);
            resolve({ valeurs: [buf], message: traduire("msg.speecht5_var_0_var_1", texte.slice(0, 40), texte.length > 40 ? "…" : "") });
          } else if (msg.type === "error") {
            libererWorker();
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_tts_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, modelId: "Xenova/speecht5_tts", speakerUrl: voix.url });
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
        options: Object.keys(LANGUES_MMS),
        optionsEn: ["English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Romanian", "Polish", "Russian"],
        defaut: "Anglais",
        doc: "Langue du texte à synthétiser. Détermine le modèle MMS utilisé.",
        docEn: "Language of the text to synthesize. Determines which MMS model is used.", defautEn: "English" },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      const langue = ctx.paramTexte("Langue", "Anglais");
      const modelId = LANGUES_MMS[langue] ?? LANGUES_MMS["Anglais"];
      const w = getWorker();
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            libererWorker();
            const buf = new AudioBuffer({ numberOfChannels: 1, length: msg.length, sampleRate: msg.sampleRate });
            buf.getChannelData(0).set(msg.data);
            resolve({ valeurs: [buf], message: traduire("msg.mms_tts_var_0_var_1_var_2", langue, texte.slice(0, 40), texte.length > 40 ? "…" : "") });
          } else if (msg.type === "error") {
            libererWorker();
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_tts_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, modelId });
      });
   },
 },
] as FicheAudio[]).map(avecDoc);
