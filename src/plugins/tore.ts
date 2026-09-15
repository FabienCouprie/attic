// plugins/tore.ts — Nœud « Tore ».
// Deux cercles : la position stéréo et le niveau, à deux vitesses. La géométrie
// et le traitement vivent dans audio/tore.ts, testés.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreTore, DUREE_SORTIE_MAX_SEC, type RapportTore } from "../audio/tore";
import { planBoucle } from "../audio/geometrie-sonore";

const RAPPORTS: RapportTore[] = ["1:1", "1:2", "2:3", "3:5", "5:8", "or"];

export const fiches: FicheAudio[] = ([
  {
    id: "tore", nom: "Tore", nomEn: "Torus",
    univers: "Traitement", famille: "Effets",
    resume: "Fait tourner la position et le niveau du son à deux vitesses : ils ne se retrouvent qu'au tour q, ou jamais.",
    resumeEn: "Rotates the sound's position and level at two speeds: they only meet again at lap q, or never.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Rapport", nomEn: "Ratio", type: "choix",
        options: ["1:1", "1:2", "2:3", "3:5", "5:8", "Nombre d'or"],
        optionsEn: ["1:1", "1:2", "2:3", "3:5", "5:8", "Golden ratio"],
        optionIds: RAPPORTS, defaut: "2:3", defautEn: "2:3",
        doc: "Vitesse du cercle du niveau rapportée à celle de la position. p:q se referme au tour q : 2:3 au troisième, 5:8 au huitième. Le nombre d'or ne se referme jamais ; il frôle son départ aux termes de Fibonacci (5, 8, 13…).",
        docEn: "Speed of the level circle relative to the position circle. p:q closes at lap q: 2:3 at the third, 5:8 at the eighth. The golden ratio never closes; it comes close to its start at Fibonacci numbers (5, 8, 13…)." },
      { nom: "Tours", nomEn: "Laps", type: "nombre", plage: [1, 13], pas: 1, defaut: 3,
        doc: "Nombre de tours ; un tour dure le son entier. Choisir un multiple de q pour entendre la trajectoire se refermer.",
        docEn: "Number of laps; one lap lasts the whole sound. Pick a multiple of q to hear the trajectory close." },
      { nom: "Profondeur", nomEn: "Depth", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Amplitude du cercle du niveau. 100 % : le son s'éteint entièrement au creux du cercle. 0 % : le niveau ne bouge plus, il ne reste que la rotation de la position.",
        docEn: "Amplitude of the level circle. 100%: the sound fades out completely at the circle's trough. 0%: the level no longer moves, only the position rotation remains." },
      { nom: "Fondu", nomEn: "Crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 30, unite: "ms",
        doc: "Fondu enchaîné à chaque couture entre deux tours, pour qu'un son qui ne se boucle pas ne claque pas. Borné au quart de la durée du son.",
        docEn: "Crossfade at each seam between two laps, so a sound that does not loop does not click. Capped at a quarter of the sound's length." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };

      const id = ctx.paramTexte("Rapport", "2:3");
      const options = {
        rapport: (RAPPORTS.includes(id) ? id : "2:3") as RapportTore,
        tours: Math.round(ctx.paramNombre("Tours", 3)),
        fonduSec: ctx.paramNombre("Fondu", 30) / 1000,
        profondeur: ctx.paramNombre("Profondeur", 100) / 100,
      };
      const plan = planBoucle(buffer.length, buffer.sampleRate, options);
      if (plan.dureeSec > DUREE_SORTIE_MAX_SEC) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.geometrie.trop_long_var_0_var_1", Math.round(plan.dureeSec / 60), DUREE_SORTIE_MAX_SEC / 60) };
      }

      ctx.onProgress(traduire("progress.tore.var_0", plan.tours));
      const { sortie, resultat } = rendreTore(buffer, options);

      // Le message dit si la trajectoire s'est refermée : c'est toute la
      // propriété du tore, et elle ne se lit pas dans les réglages sans calcul.
      const retour = resultat.fermeture === null
        ? traduire("msg.tore.jamais_var_0_var_1", resultat.plusProche!.tour, resultat.plusProche!.ecartDeg.toFixed(0))
        : resultat.refermee
          ? traduire("msg.tore.refermee_var_0", resultat.fermeture)
          : traduire("msg.tore.pas_refermee_var_0", resultat.fermeture);
      return {
        valeurs: [sortie],
        message: traduire("msg.tore.var_0_var_1_var_2", plan.tours, sortie.duration.toFixed(1), retour),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
