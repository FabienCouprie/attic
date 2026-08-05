// plugins/legende-image.ts — Nœud « Légende d'image » : décrit une image en
// texte (image captioning) via Mozilla/distilvit (Transformers.js, ONNX).
// Tourne dans un Web Worker, comme les autres nœuds Transformers.js de l'app.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/image-to-text-worker.js", import.meta.url), { type: "module" });
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
    id: "legende-image", nom: "Légende d'image", nomEn: "Image Caption",
    univers: "Traitement", famille: "Image",
    resume: "Décrit une image en texte avec Mozilla/distilvit (Transformers.js, ONNX, local).",
    resumeEn: "Describes an image as text using Mozilla/distilvit (Transformers.js, ONNX, local).",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      {
        nom: "Longueur max", nomEn: "Max length", type: "curseur", plage: [5, 100], pas: 1, defaut: 30,
        doc: "Nombre maximal de tokens générés pour la légende.",
        docEn: "Maximum number of tokens generated for the caption.",
      },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0) as File | null;
      if (!(fichier instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.image") };
      }
      const maxTokens = ctx.paramNombre("Longueur max", 30);
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [msg.texte], message: msg.texte || traduire("msg.legende_image_vide") });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_legende_image_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ image: fichier, modelId: "Mozilla/distilvit", maxTokens, requestId });
      });
    },
  },
] as FicheAudio[]).map(avecDoc);
