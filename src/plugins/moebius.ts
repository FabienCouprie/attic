// plugins/moebius.ts — Nœud « Anneau de Möbius ».
// Le son parcourt un anneau de Möbius : après un tour il est sur l'autre face,
// après deux il est revenu. La géométrie et le traitement vivent dans
// audio/moebius.ts, testés.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { rendreMoebius, planMoebius, DUREE_SORTIE_MAX_SEC, type FaceMoebius } from "../audio/moebius";

export const fiches: FicheAudio[] = ([
  {
    id: "anneau-moebius", nom: "Anneau de Möbius", nomEn: "Möbius Strip",
    univers: "Traitement", famille: "Effets",
    resume: "Fait parcourir au son un anneau de Möbius : un tour le passe sur l'autre face, deux tours le ramènent.",
    resumeEn: "Sends the sound around a Möbius strip: one lap takes it to the other side, two laps bring it back.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Face", nomEn: "Side", type: "choix",
        options: ["Stéréo (gauche ↔ droite)", "Phase (endroit ↔ envers)"],
        optionsEn: ["Stereo (left ↔ right)", "Phase (front ↔ back)"],
        optionIds: ["stereo", "phase"],
        defaut: "Stéréo (gauche ↔ droite)", defautEn: "Stereo (left ↔ right)",
        doc: "Ce que devient « l'autre face » de la bande. Stéréo : la largeur de la bande est la largeur stéréo, et l'image pivote d'un demi-tour à chaque tour — gauche et droite échangées au bout d'un tour, sans passer par le mono à mi-chemin. Un son mono est posé sur le bord de la bande et voyage de gauche à droite. Phase : l'autre face est le signal retourné ; seul, il s'entend à peine. Avec Mélange à 50 %, les deux faces s'annulent : le son entier s'éteint au bout d'un tour et revient au bout de deux.",
        docEn: "What « the other side » of the strip becomes. Stereo: the strip's width is the stereo width, and the image turns half a revolution per lap — left and right swapped after one lap, without collapsing to mono halfway. A mono sound is placed on the strip's edge and travels from left to right. Phase: the other side is the inverted signal; on its own it is barely audible. With Mix at 50%, the two sides cancel: the whole sound fades out after one lap and returns after two." },
      { nom: "Tours", nomEn: "Laps", type: "nombre", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Nombre de tours d'anneau ; un tour dure le son entier. Deux tours referment l'anneau et finissent là où ils ont commencé. Un nombre impair finit sur l'autre face.",
        docEn: "Number of laps around the strip; one lap lasts the whole sound. Two laps close the strip and end where they began. An odd number ends on the other side." },
      { nom: "Fondu", nomEn: "Crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 30, unite: "ms",
        doc: "Fondu enchaîné à chaque couture entre deux tours. Un son ne se boucle pas de lui-même : sans fondu, la couture claque. Borné au quart de la durée du son.",
        docEn: "Crossfade at each seam between two laps. A sound does not loop by itself: without a crossfade the seam clicks. Capped at a quarter of the sound's length." },
      { nom: "Mélange", nomEn: "Mix", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "100 % : la torsion seule. En dessous, le son d'origine revient se mêler à l'autre face. À 50 %, les deux faces s'annulent au bout d'un tour : sur la face Phase le son s'éteint entièrement, sur la face Stéréo gauche et droite se rejoignent au centre.",
        docEn: "100%: the twist alone. Below that, the original sound mixes back with the other side. At 50%, the two sides cancel after one lap: on the Phase side the sound fades out completely, on the Stereo side left and right meet in the centre." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };

      const face: FaceMoebius = ctx.paramTexte("Face", "stereo") === "phase" ? "phase" : "stereo";
      const options = {
        face,
        tours: Math.round(ctx.paramNombre("Tours", 2)),
        fonduSec: ctx.paramNombre("Fondu", 30) / 1000,
        melange: ctx.paramNombre("Mélange", 100) / 100,
      };

      // Refuser AVANT d'allouer : un son de 5 minutes sur 8 tours ferait 40
      // minutes de stéréo flottante, soit 1,7 Go, et l'onglet tomberait sans
      // explication.
      const plan = planMoebius(buffer.length, buffer.sampleRate, options);
      if (plan.dureeSec > DUREE_SORTIE_MAX_SEC) {
        return {
          valeurs: [null], erreur: true,
          message: traduire("msg.geometrie.trop_long_var_0_var_1", Math.round(plan.dureeSec / 60), DUREE_SORTIE_MAX_SEC / 60),
        };
      }

      ctx.onProgress(traduire("progress.moebius.var_0", plan.tours));
      const { sortie, resultat } = rendreMoebius(buffer, options);

      // Le message dit ce que la géométrie a fait du son, parce que ça ne se lit
      // pas dans les réglages : un son mono a été posé sur un bord, et la face
      // Phase équivaut à un décalage de fréquence dont la valeur dépend de la
      // durée du son.
      const detail = face === "phase"
        ? traduire("msg.moebius.detail_phase_var_0", resultat.decalageHz.toFixed(3))
        : resultat.poseeSurLeBord
          ? traduire("msg.moebius.detail_bord")
          : traduire("msg.moebius.detail_stereo");
      const fin = plan.tours % 2 === 0 ? traduire("msg.moebius.fin_referme") : traduire("msg.moebius.fin_autre_face");
      return {
        valeurs: [sortie],
        message: traduire("msg.moebius.var_0_var_1_var_2_var_3", plan.tours, sortie.duration.toFixed(1), fin, detail),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
