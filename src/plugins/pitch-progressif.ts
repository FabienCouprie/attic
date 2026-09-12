// plugins/pitch-progressif.ts — Nœud « Tonalité progressive ».
// Répète le son n+1 fois en le transposant d'un cran de plus à chaque reprise,
// silences intercalés. Le montage vit dans audio/pitch-progressif.ts, testé.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { appliquerSoundTouch } from "./soundtouch";
import { rendreProgression, planProgression } from "../audio/pitch-progressif";

export const fiches: FicheAudio[] = ([
  {
    id: "pitch-progressif", nom: "Tonalité progressive", nomEn: "Progressive Pitch",
    univers: "Traitement", famille: "Effets",
    resume: "Répète le son en le transposant d'un cran de plus à chaque reprise, silences intercalés.",
    resumeEn: "Repeats the sound, shifting it one step further each time, with silences in between.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Boucles", nomEn: "Loops", type: "nombre", plage: [1, 12], pas: 1, defaut: 3,
        doc: "Nombre de reprises APRÈS l'original. 3 donne quatre passages en tout : l'original, puis trois transpositions.",
        docEn: "Number of repeats AFTER the original. 3 gives four passes in total: the original, then three transpositions." },
      { nom: "Pause", nomEn: "Gap", type: "nombre", plage: [0, 60], pas: 0.5, defaut: 10, unite: "s",
        doc: "Silence entre deux passages. Il n'y en a pas après le dernier : avec 3 boucles, la sortie compte trois pauses, pas quatre.",
        docEn: "Silence between passes. None after the last one: with 3 loops the output holds three gaps, not four." },
      { nom: "Progression", nomEn: "Step", type: "nombre", plage: [-12, 12], pas: 0.5, defaut: -5, unite: "st",
        doc: "Transposition ajoutée à CHAQUE reprise, en demi-tons. −5 descend de 5, puis 10, puis 15 demi-tons sous l'original. Négatif pour descendre, positif pour monter.",
        docEn: "Pitch added at EACH repeat, in semitones. −5 goes 5, then 10, then 15 semitones below the original. Negative descends, positive rises." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };

      const boucles = Math.round(ctx.paramNombre("Boucles", 3));
      const pauseSec = ctx.paramNombre("Pause", 10);
      const progression = ctx.paramNombre("Progression", -5);
      const options = { boucles, pauseSec, progression };

      ctx.onProgress(traduire("progress.tonalite_progressive_var_0", boucles + 1));

      const sortie = rendreProgression(buffer, options, (src, demiTons) =>
        appliquerSoundTouch(src, { pitchSemitones: demiTons }));

      // Le message nomme les paliers atteints, pas seulement leur nombre : le
      // dernier écart est ce qui décide si le résultat est encore audible, et
      // il ne se lit pas dans les réglages sans faire la multiplication.
      const plan = planProgression({ ...options, dureeSourceSec: buffer.duration });
      const dernier = plan[plan.length - 1].demiTons;
      return {
        valeurs: [sortie],
        message: traduire(
          "msg.tonalite_progressive_var_0_var_1_var_2",
          plan.length,
          (dernier >= 0 ? "+" : "") + dernier.toFixed(1),
          sortie.duration.toFixed(1),
        ),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
