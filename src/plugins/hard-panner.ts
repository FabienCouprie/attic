// plugins/hard-panner.ts — Nœud « Hard panner ».
// Bascule le son entièrement à gauche, au centre ou à droite.

import type { FicheAudio } from "../audio/types-domaine";
import { hardPanner } from "../audio";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "hard-panner", nomDicte: "panoramique dur",
    memoire: "flux", // dstL[i] / dstR[i] depuis src[i]
    nom: "Hard panner",
    nomEn: "Hard panner",
    univers: "Traitement",
    famille: "Effets",
    resume: "Bascule le son entièrement à gauche, au centre ou à droite.",
    resumeEn: "Switches the sound fully to the left, center, or right.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      {
        nom: "Position",
        nomEn: "Position",
        type: "choix",
        // LES IDENTIFIANTS ÉTAIENT LES LIBELLÉS FRANÇAIS CAPITALISÉS, et c'est ce que les projets
        // ont enregistré ; l'exécuteur compensait en minusculant puis en cherchant la sous-chaîne
        // française ou anglaise. Ils sont en minuscules désormais, comme partout ailleurs, et les
        // anciens restent lus.
        options: ["Gauche", "Centre", "Droite"], optionIds: ["gauche", "centre", "droite"],
        optionsEn: ["Left", "Center", "Right"],
        optionsHeritees: { Gauche: "gauche", Centre: "centre", Droite: "droite" },
        defaut: "Centre",
        defautEn: "Center",
        doc: "Position panoramique : tout à gauche, au centre, ou tout à droite.",
        docEn: "Pan position: hard left, center, or hard right.",
      },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const pos = ctx.paramTexte("Position", "Centre").toLowerCase();
      const position = pos.includes("gauche") || pos.includes("left")
        ? "gauche"
        : pos.includes("droite") || pos.includes("right")
          ? "droite"
          : "centre";
      const sortie = hardPanner(audio, position);
      const label = traduire(position === "gauche" ? "msg.hard_panner.gauche"
        : position === "droite" ? "msg.hard_panner.droite" : "msg.hard_panner.centre");
      return { valeurs: [sortie], message: `Hard panner · ${label} · ${audio.sampleRate} Hz` };
    },
  },
] as FicheAudio[]).map(avecDoc);
