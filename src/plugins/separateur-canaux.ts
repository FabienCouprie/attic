// plugins/separateur-canaux.ts — Nœud « Séparateur canaux ».
// Prend un signal stéréo en entrée et produit deux sorties mono : gauche et droite.

import type { FicheAudio } from "../audio/types-domaine";
import { separerCanaux } from "../audio";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "separateur-canaux",
    memoire: "flux", // recopie canal par canal
    nom: "Séparateur canaux",
    nomEn: "Channel Splitter",
    univers: "Traitement",
    famille: "Effets",
    resume: "Sépare un signal stéréo en deux sorties mono (gauche et droite).",
    resumeEn: "Splits a stereo signal into two mono outputs (left and right).",
    // Ses sorties audio sont des pairs : aucune ne represente le noeud a elle seule, et un
    // lecteur generique en designerait une au hasard.
    sansApercuAudio: true,
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [
      { nom: "Gauche", nomEn: "Left", type: "audio", sousType: "mono" },
      { nom: "Droite", nomEn: "Right", type: "audio", sousType: "mono" },
    ],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const { gauche, droite } = separerCanaux(audio);
      return { valeurs: [gauche, droite], message: `Gauche + Droite · ${audio.sampleRate} Hz` };
    },
  },
] as FicheAudio[]).map(avecDoc);
