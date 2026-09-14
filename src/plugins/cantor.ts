// plugins/cantor.ts — Nœud « Poussière de Cantor ».
// Retire le tiers central, puis le tiers central de chaque morceau, et ainsi de
// suite. Le découpage vit dans audio/cantor.ts, testé.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreCantorCanaux, planCantor, ETAGES_MAX, type ModeCantor } from "../audio/cantor";
import { DUREE_SORTIE_MAX_SEC, versAudioBuffer, canauxDe } from "../audio/geometrie-sonore";

export const fiches: FicheAudio[] = ([
  {
    id: "poussiere-cantor", nom: "Poussière de Cantor", nomEn: "Cantor Dust",
    univers: "Traitement", famille: "Effets",
    resume: "Creuse le son en ôtant le tiers central de chaque morceau, étage après étage : un silence fractal.",
    resumeEn: "Hollows the sound by removing the middle third of each piece, level after level: a fractal silence.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Étages", nomEn: "Levels", type: "nombre", plage: [1, ETAGES_MAX], pas: 1, defaut: 4,
        doc: "Profondeur du découpage. À l'étage n il reste 2ⁿ fragments, chacun de 1/3ⁿ de la durée, soit (2/3)ⁿ du son : 4 étages gardent 16 fragments et 20 % du son, 7 étages 128 fragments et 6 %.",
        docEn: "Depth of the cut. At level n there remain 2ⁿ fragments, each 1/3ⁿ of the length, i.e. (2/3)ⁿ of the sound: 4 levels keep 16 fragments and 20% of the sound, 7 levels 128 fragments and 6%." },
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Construction (étage par étage)", "Dernier étage seul"],
        optionsEn: ["Construction (level by level)", "Last level only"],
        optionIds: ["construction", "dernier"],
        defaut: "Construction (étage par étage)", defautEn: "Construction (level by level)",
        doc: "Construction : les étages 0, 1, 2… sont joués à la suite, et l'on entend chaque fragment reprendre en réduction le geste de l'étage précédent — c'est là que la propriété s'entend. Dernier étage seul : un bégaiement fractal, sur la durée du son.",
        docEn: "Construction: levels 0, 1, 2… are played one after the other, and each fragment is heard repeating the previous level's gesture in miniature — that is where the property is heard. Last level only: a fractal stutter, over the sound's length." },
      { nom: "Fondu", nomEn: "Fade", type: "nombre", plage: [0, 50], pas: 0.5, defaut: 3, unite: "ms",
        doc: "Fondu posé à l'intérieur de chaque fragment, pour que les bords ne claquent pas. Les parties retirées restent exactement silencieuses. Borné à la moitié d'un fragment : aux étages profonds, un fragment ne dure que quelques millisecondes.",
        docEn: "Fade placed inside each fragment, so the edges do not click. Removed parts stay exactly silent. Capped at half a fragment: at deep levels a fragment lasts only a few milliseconds." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };

      const options = {
        etages: Math.round(ctx.paramNombre("Étages", 4)),
        mode: (ctx.paramTexte("Mode", "construction") === "dernier" ? "dernier" : "construction") as ModeCantor,
        fonduSec: ctx.paramNombre("Fondu", 3) / 1000,
      };
      const plan = planCantor(buffer.length, buffer.sampleRate, options);
      if (plan.dureeSec > DUREE_SORTIE_MAX_SEC) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.geometrie.trop_long_var_0_var_1", Math.round(plan.dureeSec / 60), DUREE_SORTIE_MAX_SEC / 60) };
      }

      ctx.onProgress(traduire("progress.cantor.var_0", plan.etages));
      const r = rendreCantorCanaux(canauxDe(buffer), buffer.sampleRate, options);
      const sortie = versAudioBuffer(r.canaux, buffer.sampleRate);
      return {
        valeurs: [sortie],
        message: traduire("msg.cantor.var_0_var_1_var_2_var_3",
          plan.etages, r.fragments, r.fragmentMs.toFixed(1), Math.round(r.fractionGardee * 100)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
