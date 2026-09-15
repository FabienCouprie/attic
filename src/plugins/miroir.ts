// plugins/miroir.ts — Nœud « Miroir d'inversion ».
// Renvoie chaque fréquence f à f₀²/f : les graves deviennent aigus. Le vocodeur
// de phase vit dans audio/miroir.ts, testé.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { miroirCanaux } from "../audio/miroir";
import { versAudioBuffer, canauxDe, DUREE_SORTIE_MAX_SEC } from "../audio/geometrie-sonore";

export const fiches: FicheAudio[] = ([
  {
    id: "miroir-inversion", nom: "Miroir d'inversion", nomEn: "Inversion Mirror",
    univers: "Traitement", famille: "Effets",
    resume: "Retourne le spectre autour d'une fréquence pivot : les graves deviennent aigus et les aigus graves.",
    resumeEn: "Flips the spectrum around a pivot frequency: lows become highs and highs become lows.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Pivot", nomEn: "Pivot", type: "nombre", plage: [100, 4000], pas: 1, defaut: 632, unite: "Hz",
        doc: "Fréquence qui reste en place ; une composante à f va à pivot²/f. À 632 Hz, moyenne géométrique de 20 Hz et 20 kHz, la bande audible est renvoyée sur elle-même : 100 Hz ↔ 4 kHz, 440 Hz ↔ 908 Hz. Plus bas, le son entier monte ; plus haut, il descend.",
        docEn: "Frequency that stays put; a component at f goes to pivot²/f. At 632 Hz, the geometric mean of 20 Hz and 20 kHz, the audible band maps onto itself: 100 Hz ↔ 4 kHz, 440 Hz ↔ 908 Hz. Lower, the whole sound goes up; higher, it goes down." },
      { nom: "Tours", nomEn: "Laps", type: "nombre", plage: [1, 8], pas: 1, defaut: 1,
        doc: "1 : le miroir seul. Au-delà, miroir et original alternent, un tour chacun : l'inversion appliquée deux fois rend le son, et on l'entend en passant de l'un à l'autre.",
        docEn: "1: the mirror alone. Above that, mirror and original alternate, one lap each: applied twice, inversion gives the sound back, and you hear it moving from one to the other." },
      { nom: "Fondu", nomEn: "Crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 60, unite: "ms",
        doc: "Fondu enchaîné entre le miroir et l'original quand Tours dépasse 1.",
        docEn: "Crossfade between mirror and original when Laps is above 1." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const options = {
        pivotHz: ctx.paramNombre("Pivot", 632),
        tours: Math.round(ctx.paramNombre("Tours", 1)),
        fonduSec: ctx.paramNombre("Fondu", 60) / 1000,
      };
      if ((buffer.duration * options.tours) > DUREE_SORTIE_MAX_SEC) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.geometrie.trop_long_var_0_var_1", Math.round((buffer.duration * options.tours) / 60), DUREE_SORTIE_MAX_SEC / 60) };
      }
      ctx.onProgress(traduire("progress.miroir.var_0", Math.round(options.pivotHz)));
      const r = miroirCanaux(canauxDe(buffer), buffer.sampleRate, options);
      // La part perdue est le prix du miroir, et elle dépend du son et du pivot :
      // elle ne se devine pas, le message la donne.
      return {
        valeurs: [versAudioBuffer(r.canaux, buffer.sampleRate)],
        message: traduire("msg.miroir.var_0_var_1_var_2",
          Math.round(r.pivot), (r.pivot ** 2 / (buffer.sampleRate / 2)).toFixed(0), (r.perdue * 100).toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
