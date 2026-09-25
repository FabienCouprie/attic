// plugins/entrees-extra.ts — Nœuds entrees-extra (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { decoderFichier } from "../audio";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "explorateur-musique", nom: "Explorateur musique", nomEn: "Music explorer", univers: "Entrées", famille: "Audio",
    resume: "Charge un fichier audio depuis l'explorateur.",
    resumeEn: "Loads an audio file from the explorer.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    // Ce chemin est un DOSSIER où chercher, et non une piste ; il se choisit au lieu de s'écrire.
    parametres: [{ nom: "Chemin", nomEn: "Path", type: "dossier", defaut: "music collection", doc: "Dossier où chercher les pistes, relatif au dossier du projet.", docEn: "Directory to scan, relative to project folder.", defautEn: "music collection" }],
    async executer(ctx: any) {
      const f = ctx.noeud.data.audioFichier;
      if (!f) return { valeurs: [null], message: traduire("msg.aucun_fichier") };
      const buf = await decoderFichier(f, ctx.runtime);
      return { valeurs: [buf] };
    },
  },

  // ── Effets ──
] as FicheAudio[]).map(avecDoc);
