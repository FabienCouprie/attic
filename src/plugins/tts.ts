// plugins/tts.ts — Nœuds de synthèse vocale (Text-to-Speech).
// Deux modèles : SpeechT5 (Microsoft, anglais haute qualité) et MMS-TTS (Meta, multilingue).
// Le texte provient d'une entrée texte (port bleu) — branchez un node « Source de texte ».
// La synthèse tourne dans un Web Worker pour ne pas bloquer l'UI.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { installerGardeWorker } from "./garde-worker";
import { annoncerModele } from "./message-modele";
import { baseModeleLivre } from "./base-modeles";
import { fiches as clonageDeVoix } from "./cloner-voix";
import { choixLangues, codeLangue, libelleLangue } from "../core/langues";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/tts-worker.js", import.meta.url), { type: "module" });
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
//
// TROIS LANGUES ONT ÉTÉ RETIRÉES, et ce n'est pas un choix : l'italien, le néerlandais et le
// polonais étaient offerts dans cette liste alors que leurs dépôts amont ne répondaient plus.
// Relevé en les interrogeant un à un : `Xenova/mms-tts-ita`, `-nld` et `-pol` rendent 401 là où
// les sept autres rendent 200. Les choisir menait à un échec, et rien dans le dépôt ne pouvait le
// savoir, puisque les poids étaient tirés d'un tiers à l'exécution. Ils viennent du manifeste
// depuis, et ce qui n'y est pas n'est plus proposé.
// LE LIBELLÉ ANGLAIS EST ICI, ET NON DANS UNE SECONDE LISTE. Il l'était, écrit à la main, et il
// comptait toujours dix entrées quand celle-ci en a perdu trois : une option devenait injoignable,
// et deux gardes du dépôt l'ont dit. Une liste écrite deux fois finit par ne plus être d'accord
// avec elle-même.
/**
 * Le modele publie pour chaque langue : ce qui est PROPRE a ce moteur, et sa borne.
 *
 * Les noms de langue, eux, viennent de `core/langues.ts` : ils etaient ecrits ici comme dans cinq
 * autres tables.
 */
const MODELES_MMS: Record<string, string> = {
  en: "Xenova/mms-tts-eng",
  fr: "Xenova/mms-tts-fra",
  es: "Xenova/mms-tts-spa",
  de: "Xenova/mms-tts-deu",
  pt: "Xenova/mms-tts-por",
  ro: "Xenova/mms-tts-ron",
  ru: "Xenova/mms-tts-rus",
};

// Accepte l'id canonique comme l'ancien libellé français (projets existants).
function modeleMMS(valeur: string): string | undefined {
  const v = String(valeur).trim().toLowerCase();
  return MODELES_MMS[codeLangue(v)];
}

const synthesesVocales: FicheAudio[] = ([
  {
    id: "tts-speecht5", nomDicte: "voix parlée de synthèse", nom: "SpeechT5 TTS", nomEn: "SpeechT5 TTS",
    univers: "Entrées", famille: "Text to Speech",
    resume: "Synthèse vocale haute qualité (Microsoft SpeechT5, anglais).",
    resumeEn: "High-quality text-to-speech (Microsoft SpeechT5, English).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Voix", nomEn: "Voice", type: "choix",
        options: VOIX_SPEECHT5.map((v) => v.nom), optionIds: VOIX_SPEECHT5.map((v) => v.id), optionsEn: VOIX_SPEECHT5.map((v) => v.nomEn ?? v.nom),
        defaut: VOIX_SPEECHT5[0].nom,
        doc: "Voix prédéfinie (embeddings CMU Arctic). BDL/RMS = hommes américains ; SLT/CLB = femmes américaines ; JMK = homme canadien ; AWB = homme écossais ; KSP = homme indien.",
        docEn: "Preset voice (CMU Arctic embeddings). BDL/RMS = US males; SLT/CLB = US females; JMK = Canadian male; AWB = Scottish male; KSP = Indian male.", defautEn: VOIX_SPEECHT5[0].nomEn ?? VOIX_SPEECHT5[0].nom },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      const voixId = ctx.paramTexte("Voix", VOIX_SPEECHT5[0].nom);
      const voix = VOIX_SPEECHT5.find((v) => v.id === voixId || v.nom === voixId || v.nomEn === voixId) ?? VOIX_SPEECHT5[0];
      await annoncerModele(ctx, "tts-speecht5", traduire("progress.chargement_du_mod_le"));
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
        w.postMessage({ text: texte, modelId: "Xenova/speecht5_tts", speakerUrl: voix.url, baseMiroir: baseModeleLivre("oonx"), requestId });
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
        ...choixLangues(Object.keys(MODELES_MMS)),
        defaut: "Anglais",
        doc: "Langue du texte à synthétiser. Détermine le modèle MMS utilisé.",
        docEn: "Language of the text to synthesize. Determines which MMS model is used.", defautEn: "English" },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      const langue = ctx.paramTexte("Langue", "en");
      // UNE LANGUE QUI N'EST PLUS OFFERTE SE DIT, ELLE NE SE REMPLACE PAS EN SILENCE. Trois
      // l'étaient jusqu'au 2026-10-20, leurs dépôts amont ayant disparu ; un projet enregistré sur
      // l'une d'elles se serait mis à parler anglais sans un mot, ce qui est pire que de refuser.
      const connue = modeleMMS(langue);
      if (!connue) {
        return { valeurs: [null], erreur: true, message: traduire("msg.tts.langueRetiree", langue) };
      }
      const modelId = connue;
      await annoncerModele(ctx, "tts-mms", traduire("progress.chargement_du_mod_le"));
      // Libellé lisible pour le message du nœud : `langue` vaut désormais un
      // code ISO (« en »), qui n'a pas de sens à afficher tel quel.
      const langueLabel = libelleLangue(langue);
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
        w.postMessage({ text: texte, modelId, baseMiroir: baseModeleLivre("oonx"), requestId });
      });
   },
  },
] as FicheAudio[]).map(avecDoc);

// LE CLONEUR SORT PAR ICI, avec les deux synthèses dont il est le proche : il fait de la parole,
// à partir d'une voix donnée au lieu d'une voix choisie. Le registre de `index.ts` dépasse la
// norme de taille et n'a donc pas le droit de grossir ; ce qu'on y ajouterait va ailleurs, et
// l'ailleurs d'une famille est sa propre entrée. Même raison que pour les sept nœuds de chanson.
export const fiches = [...synthesesVocales, ...clonageDeVoix];
