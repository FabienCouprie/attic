// plugins/klein.ts — Nœud « Bouteille de Klein ».
// Un glissando sans fin dont chaque voix revient en miroir à chaque tour de
// l'étendue. Le principe et le rendu vivent dans audio/klein.ts, testés.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreKlein, periodeRetourSec } from "../audio/klein";

export const fiches: FicheAudio[] = ([
  {
    id: "bouteille-klein", nom: "Bouteille de Klein", nomEn: "Klein Bottle",
    univers: "Traitement", famille: "Effets",
    resume: "Glissando sans fin dont chaque voix revient de l'autre côté à chaque tour : il faut deux tours pour que tout revienne.",
    resumeEn: "Endless glissando whose voices come back on the other side every lap: it takes two laps for everything to return.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Sens", nomEn: "Direction", type: "choix",
        options: ["Ascendant", "Descendant"], optionsEn: ["Rising", "Falling"],
        optionIds: ["ascendant", "descendant"], defaut: "Ascendant", defautEn: "Rising",
        doc: "Sens du glissando. En montant, les voix sortent par l'aigu et renaissent dans le grave, retournées ; en descendant, l'inverse.",
        docEn: "Direction of the glissando. Rising, voices leave through the top and are reborn at the bottom, mirrored; falling, the reverse." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 300], pas: 1, defaut: 30, unite: "s",
        doc: "Durée du son produit. Pour entendre le retour complet, prévoir au moins deux tours d'étendue : 2 × octaves × cycle.",
        docEn: "Length of the produced sound. To hear the full return, allow at least two laps of the range: 2 × octaves × cycle." },
      { nom: "Cycle", nomEn: "Cycle", type: "nombre", plage: [0.5, 30], pas: 0.5, defaut: 3, unite: "s",
        doc: "Temps qu'une voix met à parcourir une octave. Un tour d'étendue dure octaves × cycle.",
        docEn: "Time for one voice to travel one octave. One lap of the range lasts octaves × cycle." },
      { nom: "Octaves", nomEn: "Octaves", type: "nombre", plage: [3, 8], pas: 1, defaut: 4,
        doc: "Étendue du glissando, et nombre de voix. Plus il y en a, plus la migration d'un côté à l'autre est progressive — et plus le retour complet est long.",
        docEn: "Range of the glissando, and number of voices. The more there are, the more gradual the migration from one side to the other — and the longer the full return." },
      { nom: "Écart", nomEn: "Spread", type: "nombre", plage: [0, 90], pas: 1, defaut: 70, unite: "°",
        doc: "Angle des voix par rapport au centre. 90° : tout à droite au départ, tout à gauche en miroir. 0° : toutes au centre, et le miroir ne s'entend plus.",
        docEn: "Angle of the voices from the centre. 90°: fully right at first, fully left when mirrored. 0°: all centred, and the mirror is no longer heard." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Fondu enchaîné appliqué pour rendre la source bouclable sans clic.",
        docEn: "Crossfade applied to make the source loop without a click." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const options = {
        dureeSec: ctx.paramNombre("Durée", 30),
        cycleSec: ctx.paramNombre("Cycle", 3),
        octaves: Math.round(ctx.paramNombre("Octaves", 4)),
        montant: ctx.paramTexte("Sens", "ascendant") !== "descendant",
        ecartDeg: ctx.paramNombre("Écart", 70),
        fonduBoucleSec: ctx.paramNombre("Fondu de boucle", 50) / 1000,
      };
      ctx.onProgress(traduire("progress.klein.var_0", options.octaves));
      const sortie = rendreKlein(buffer, options);
      const retour = periodeRetourSec(options);
      // Le message dit si la durée choisie laisse entendre le retour complet :
      // c'est la propriété du nœud, et elle est facile à couper sans le savoir.
      const complet = options.dureeSec >= retour
        ? traduire("msg.klein.retour_entendu_var_0", retour.toFixed(1))
        : traduire("msg.klein.retour_coupe_var_0", retour.toFixed(1));
      return {
        valeurs: [sortie],
        message: traduire("msg.klein.var_0_var_1_var_2", options.octaves, (options.octaves * options.cycleSec).toFixed(1), complet),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
