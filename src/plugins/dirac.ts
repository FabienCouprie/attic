// plugins/dirac.ts — Nœud « Ceinture de Dirac ».
// Le son fait le tour de l'auditeur ; il ne revient intact qu'au second tour.
// Le principe et le rendu vivent dans audio/dirac.ts, testés.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreDirac, DUREE_SORTIE_MAX_SEC } from "../audio/dirac";
import { planBoucle } from "../audio/geometrie-sonore";

export const fiches: FicheAudio[] = ([
  {
    id: "ceinture-dirac", nom: "Ceinture de Dirac", nomEn: "Dirac Belt",
    univers: "Traitement", famille: "Effets",
    resume: "Fait tourner le son autour de l'auditeur : au premier tour il revient inversé et s'annule, au second il est intact.",
    resumeEn: "Spins the sound around the listener: after one lap it comes back inverted and cancels, after two it is intact.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Tours", nomEn: "Laps", type: "nombre", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de tours autour de l'auditeur ; un tour dure le son entier. Deux tours dénouent la ceinture.",
        docEn: "Number of laps around the listener; one lap lasts the whole sound. Two laps untie the belt." },
      { nom: "Témoin", nomEn: "Witness", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Niveau de la copie fixe placée devant l'auditeur. Sans elle, le changement de signe du son est inaudible. À 100 %, le son qui revient devant après un tour s'annule entièrement contre elle ; au second tour, les deux s'additionnent.",
        docEn: "Level of the fixed copy placed in front of the listener. Without it, the sound's sign change is inaudible. At 100%, the sound coming back to the front after one lap cancels out completely against it; after the second lap, the two add up." },
      { nom: "Arrière", nomEn: "Rear", type: "nombre", plage: [0, 24], pas: 1, defaut: 6, unite: "dB",
        doc: "Atténuation du son quand il passe derrière. La stéréo ne sait pas placer un son derrière soi : l'arrière est simulé par un son plus faible et plus sourd.",
        docEn: "Attenuation of the sound when it passes behind. Stereo cannot place a sound behind you: the rear is simulated by a quieter, duller sound." },
      { nom: "Coupure", nomEn: "Cutoff", type: "nombre", plage: [300, 8000], pas: 50, defaut: 1500, unite: "Hz",
        doc: "Fréquence au-dessus de laquelle le son s'assourdit quand il est derrière.",
        docEn: "Frequency above which the sound is dulled when it is behind." },
      { nom: "Fondu", nomEn: "Crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 30, unite: "ms",
        doc: "Fondu enchaîné à chaque couture entre deux tours. Borné au quart de la durée du son.",
        docEn: "Crossfade at each seam between two laps. Capped at a quarter of the sound's length." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const options = {
        tours: Math.round(ctx.paramNombre("Tours", 2)),
        fonduSec: ctx.paramNombre("Fondu", 30) / 1000,
        temoin: ctx.paramNombre("Témoin", 100) / 100,
        arriereDb: ctx.paramNombre("Arrière", 6),
        coupureHz: ctx.paramNombre("Coupure", 1500),
      };
      const plan = planBoucle(buffer.length, buffer.sampleRate, options);
      if (plan.dureeSec > DUREE_SORTIE_MAX_SEC) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.geometrie.trop_long_var_0_var_1", Math.round(plan.dureeSec / 60), DUREE_SORTIE_MAX_SEC / 60) };
      }
      ctx.onProgress(traduire("progress.dirac.var_0", plan.tours));
      const { sortie } = rendreDirac(buffer, options);
      const detail = options.temoin <= 0
        ? traduire("msg.dirac.sans_temoin")
        : traduire("msg.dirac.annulation_var_0", (plan.pas / buffer.sampleRate).toFixed(1));
      return {
        valeurs: [sortie],
        message: traduire("msg.dirac.var_0_var_1_var_2", plan.tours, sortie.duration.toFixed(1), detail),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
