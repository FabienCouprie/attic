// plugins/texte-image.ts — Nœud de génération d'image texte→image via SDXS-512
// (ONNX Runtime, process principal). Pipeline lourd (encodeur CLIP + UNet 1 pas
// + décodeur TAESD) exécuté en natif — voir electron/sdxs-image.cjs.
//
// Modèle embarqué dans l'app via extraResources (~680 Mo, quantifié int8).
// L'utilisateur peut aussi fournir un chemin explicite via le paramètre
// « Chemin modèle ».
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

function fileDepuisRgba(rgba: ArrayLike<number>, width: number, height: number, nom: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      reject(new Error("Contexte 2D indisponible"));
      return;
    }
    const imageData = new ImageData(Uint8ClampedArray.from(rgba), width, height);
    ctx2d.putImageData(imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas.toBlob a retourné null"));
        return;
      }
      resolve(new File([blob], nom, { type: "image/png" }));
    }, "image/png");
  });
}

export const fiches: FicheAudio[] = ([
  {
    id: "texte-image",
    nom: "Texte → image",
    nomEn: "Text to image",
    univers: "Entrées",
    famille: "Image",
    resume: "Génère une image 512×512 à partir d’un prompt texte via SDXS-512 (ONNX, 1 pas, local).",
    resumeEn: "Generates a 512×512 image from a text prompt using SDXS-512 (ONNX, 1 step, local).",
    entrees: [{ nom: "Prompt", nomEn: "Prompt", type: "texte", requis: false }],
    sorties: [{ nom: "Image", type: "image" }],
    parametres: [
      {
        nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "a red apple on a wooden table, photo",
        doc: "Description textuelle de l’image à générer (en anglais pour de meilleurs résultats).",
        docEn: "Text description of the image to generate (English for best results).", defautEn: "a red apple on a wooden table, photo",
      },
      {
        nom: "Graine", nomEn: "Seed", type: "curseur", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Graine aléatoire. -1 = aléatoire.",
        docEn: "Random seed. -1 = random.",
      },
      {
        nom: "Chemin modèle", nomEn: "Model path", type: "dossier", defaut: "",
        doc: "Dossier du bundle SDXS-512 (vide = modèle embarqué dans resources/oonx/sdxs-512-texte-image).",
        docEn: "Folder of the SDXS-512 bundle (empty = bundled model in resources/oonx/sdxs-512-texte-image).", defautEn: "",
      },
    ],
    async executer(ctx: any) {
      const api = typeof window !== "undefined" ? (window as any).api : null;
      if (!api?.genererImageSdxs) {
        return { valeurs: [null], erreur: true, message: traduire("msg.texte_image_n_cessite_l_application_de_bureau") };
      }

      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "a red apple on a wooden table, photo");
      let seed = ctx.paramNombre("Graine", -1);
      if (seed < 0) seed = Math.floor(Math.random() * 1_000_000);
      const modelPath = ctx.paramTexte("Chemin modèle", "");

      ctx.onProgress(traduire("progress.g_n_ration_image_en_cours"));

      try {
        const rep = await api.genererImageSdxs({ prompt, seed, modelPath });
        if (!rep?.ok) {
          const messageErreur = rep?.erreur ?? "inconnue";
          const estIntrouvable = typeof messageErreur === "string" && messageErreur.includes("introuvable");
          return {
            valeurs: [null], erreur: true,
            message: estIntrouvable ? traduire("msg.texte_image_mod_le_introuvable") : traduire("msg.erreur_texte_image_var_0", messageErreur),
          };
        }
        const fichier = await fileDepuisRgba(rep.rgba, rep.width, rep.height, `texte-image-${seed}.png`);
        return {
          valeurs: [fichier],
          message: traduire("msg.texte_image_seed_var_0", seed),
        };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_texte_image_var_0", err?.message ?? err) };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
