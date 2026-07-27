// plugins/ocr.ts — Nœud « OCR » : reconnaissance optique de caractères multi-alphabets
// en local via Tesseract.js (WASM). Reçoit une image, retourne le texte reconnu.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { createWorker, PSM } from "tesseract.js";

async function ocrImage(fichier: File, langues: string, onProgress: (msg: string) => void): Promise<string> {
  const codes = languesToArray(langues);
  const languesString = codes.length > 0 ? codes.join("+") : "eng";
  console.log("[ocr] langues brutes:", JSON.stringify(langues), "codes:", codes, "string:", languesString);
  const worker = await createWorker(languesString, undefined, {
    logger: (m) => {
      if (m?.status && m?.progress != null) {
        onProgress(`${traduire("progress.ocr")} ${m.status} ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
    });
    const result = await worker.recognize(fichier);
    return result.data.text?.trim() ?? "";
  } finally {
    await worker.terminate();
  }
}

const LANGUES_DEFAUT = "eng+fra+deu+spa+rus+ell+ara+heb";

function isControlChar(code: number): boolean {
  return (code <= 0x1f) || code === 0x7f;
}

export function normaliserLangues(valeur: string): string {
  const nettoyee = Array.from(valeur)
    .filter((c) => !isControlChar(c.charCodeAt(0)) && !/\s/.test(c))
    .join("");
  return nettoyee || LANGUES_DEFAUT;
}

function languesToArray(langues: string): string[] {
  return langues
    .split("+")
    .map((l) => l.trim())
    .filter((l) => /^[a-zA-Z]{2,4}$/.test(l));
}

const ocrPlugins: FicheAudio[] = [
  {
    id: "ocr",
    nom: "OCR",
    nomEn: "OCR",
    univers: "Traitement",
    famille: "Image",
    resume: "Reconnaît le texte dans une image avec Tesseract.js (multi-alphabets).",
    resumeEn: "Recognizes text in an image using Tesseract.js (multi-alphabet).",
    entrees: [{ nom: "Image", type: "image" }],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      {
        nom: "Langues",
        nomEn: "Languages",
        type: "texte",
        defaut: "eng+fra+deu+spa+rus+ell+ara+heb",
        defautEn: "eng+fra+deu+spa+rus+ell+ara+heb",
        doc: "Codes de langues Tesseract séparés par « + » (ex: eng+fra+rus). Par défaut : latin, cyrillique, grec, arabe, hébreu. Chaque langue télécharge son modèle (~2-10 Mo) depuis le CDN Tesseract.",
        docEn: "Tesseract language codes separated by « + » (e.g. eng+fra+rus). Default: Latin, Cyrillic, Greek, Arabic, Hebrew. Each language downloads its model (~2-10 MB) from the Tesseract CDN.",
      },
    ],
    async executer(ctx) {
      const fichier = ctx.entree(0) as File | null;
      if (!(fichier instanceof File)) {
        return { valeurs: [null], message: traduire("msg.connecter.image") };
      }
      try {
        const langues = normaliserLangues(ctx.paramTexte("Langues", LANGUES_DEFAUT));
        const texte = await ocrImage(fichier, langues, (msg) => ctx.onProgress(msg));
        return {
          valeurs: [texte],
          message: texte ? `${texte.length} caractères` : traduire("msg.ocr.vide"),
        };
      } catch (e: any) {
        console.error("[ocr]", e);
        const detail = e?.message || String(e);
        return {
          valeurs: [null],
          erreur: true,
          message: `${traduire("msg.ocr.erreur")} ${detail}`,
        };
      }
    },
  },
];

export const fiches: FicheAudio[] = ocrPlugins.map(avecDoc) as FicheAudio[];
