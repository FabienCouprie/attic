// plugins/traduction.ts — Node de traduction OPUS-MT dans « Autres » :
// texte → texte multilingue (paires de langues, modèle léger).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

let opusWorkers: Map<string, Worker> = new Map();

function getOpusWorker(modelId: string): Worker {
  if (!opusWorkers.has(modelId)) {
    const w = new Worker(new URL("../workers/opus-worker.js", import.meta.url), { type: "module" });
    opusWorkers.set(modelId, w);
  }
  return opusWorkers.get(modelId)!;
}

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
    id: "traduction-opus", nom: "Traduction OPUS-MT", nomEn: "OPUS-MT Translation",
    univers: "Autres", famille: "Texte",
    resume: "Traduit un texte entre paires de langues (OPUS-MT, modèle léger).",
    resumeEn: "Translates text between language pairs (OPUS-MT, lightweight model).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Paire", nomEn: "Pair", type: "choix",
        // `optionIds` porte l'identité stable (« fr-en »), `options`/`optionsEn`
        // seulement l'affichage : les ids servaient jusqu'ici de libellés côté
        // français, qui voyait donc « fr-en » là où l'anglais lisait
        // « French → English » (le champ `nom` existait mais n'était pas utilisé).
        // `executer` compare toujours à `p.id`, que paramTexte renvoie désormais
        // quelle que soit la langue — et les projets déjà enregistrés stockent
        // justement cet id.
        optionIds: Paires_OPUS.map((p) => p.id),
        options: Paires_OPUS.map((p) => p.nom), optionsEn: Paires_OPUS.map((p) => p.nomEn),
        defaut: "fr-en",
        doc: "Paire de langues source → cible. Chaque paire utilise un modèle OPUS-MT dédié (~30 MB).",
        docEn: "Source → target language pair. Each pair uses a dedicated OPUS-MT model (~30 MB)." },
    ],
    async executer(ctx: any) {
      const texte = ctx.entree(0);
      if (typeof texte !== "string" || !texte.trim()) return { valeurs: [null], message: traduire("msg.branchez_un_texte_port_bleu") };
      const paireId = ctx.paramTexte("Paire", "fr-en");
      const paire = Paires_OPUS.find((p) => p.id === paireId) ?? Paires_OPUS[0];
      const w = getOpusWorker(paire.model);
      return new Promise((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            libererOpusWorker(paire.model);
            resolve({ valeurs: [msg.text], message: traduire("msg.var_0_var_1_var_2_2", paire.nom, msg.text.slice(0, 60), msg.text.length > 60 ? "…" : "") });
          } else if (msg.type === "error") {
            libererOpusWorker(paire.model);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_opus_mt_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ text: texte, modelId: paire.model });
      });
   },
 },
] as FicheAudio[]).map(avecDoc);
