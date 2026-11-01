// plugins/speech-to-text.ts — Nœud de reconnaissance vocale (Speech-to-Text).
// Whisper anglais (OpenAI Whisper base), léger et rapide à charger.
// L'audio provient d'une entrée audio (port vert) — branchez un node « Entrée audio »
// ou un enregistrement. Le texte est émis sur la sortie texte (port bleu).
// La transcription tourne dans un Web Worker.
//
// LE MODÈLE EST LIVRÉ AVEC L'APPLICATION, et ne vient plus de HuggingFace. Il s'y chargeait au
// premier usage — 281 Mo en fp32, et non les 75 Mo que la notice annonçait, qui sont ceux d'une
// variante quantifiée que ce nœud ne charge pas. Trois conséquences, contre la règle du dépôt : pas
// d'usage sans réseau, aucune empreinte vérifiée puisqu'il était absent de `modeles-manifest.json`,
// et un hébergeur tiers libre de déplacer ce qu'il sert.

import type { FicheAudio } from "../audio/types-domaine";
import { mixdownMono } from "../audio/commun";
import { reechantillonnerLineaire } from "../audio/convertir-frequence";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { installerGardeWorker } from "./garde-worker";
import { baseModeleLivre } from "./base-modeles";
import { annoncerModele } from "./message-modele";
import { entreeAudio, sansEntree } from "./lire-entree";

/** Le dossier qui CONTIENT le paquet, et le paquet : Transformers.js compose les deux. */
export const RACINE_MODELES = "oonx";
export const NOM_MODELE = "whisper-base-en";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/asr-worker.js", import.meta.url), { type: "module" });
    // Le garde-fou transforme la mort du worker en erreur du nœud : sans lui, un worker qui meurt
    // avant de répondre laisse le nœud « en cours » pour toujours. `worker = null` pour que la
    // tentative suivante en reconstruise un, au lieu de reparler à un mort.
    installerGardeWorker(worker, () => { worker = null; });
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
    id: "whisper-en", nom: "Whisper (Anglais)", nomEn: "Whisper (English)",
    univers: "Autres", famille: "Speech to Text",
    resume: "Transcription vocale en anglais (OpenAI Whisper base).",
    resumeEn: "English speech recognition (OpenAI Whisper base).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0);
      if (sansEntree(audio)) return audio;
      // Whisper veut du 16 kHz ; le linéaire suffit à des mots.
      const mono = reechantillonnerLineaire(mixdownMono(audio), audio.sampleRate, 16000);
      // LE PAQUET PEUT MANQUER, dans l'installeur allégé qui ne l'embarque pas : c'est ce message
      // qui le dit et qui le fait prendre, au lieu de laisser le worker échouer sur un fichier
      // absent. Le manifeste relie le paquet à cette fiche, et un test refuse qu'un nœud nommé par
      // lui reste muet.
      await annoncerModele(ctx, "whisper-en", traduire("progress.asr.chargement_whisper"));
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
        // LE MODÈLE EST LIVRÉ, et son dossier se résout dans la page : voir `base-modeles.ts`.
        // `modelBase` est le dossier qui CONTIENT le paquet, `modelId` le paquet lui-même, parce que
        // c'est ainsi que Transformers.js compose ses chemins.
        w.postMessage({
          audioData: mono, sampleRate: 16000,
          modelBase: baseModeleLivre(RACINE_MODELES), modelId: NOM_MODELE, requestId,
        });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
