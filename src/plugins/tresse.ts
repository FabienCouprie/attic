// plugins/tresse.ts — Nœud « Tresse ».
// Des bandes de fréquence qui se croisent dessus-dessous dans l'espace stéréo.
// Le découpage, les mots de tresse et le rendu vivent dans audio/tresse.ts, testés.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { lireMotTresse, tresserCanaux } from "../audio/tresse";
import { versAudioBuffer, canauxDe } from "../audio/geometrie-sonore";

export const fiches: FicheAudio[] = ([
  {
    id: "tresse", nom: "Tresse", nomEn: "Braid",
    univers: "Traitement", famille: "Effets",
    resume: "Découpe le son en bandes qui se croisent dessus-dessous dans l'espace, et reviennent à leur place au bout d'un nombre de motifs qu'on peut compter.",
    resumeEn: "Splits the sound into bands that cross over and under in space, returning to their places after a countable number of patterns.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Brins", nomEn: "Strands", type: "choix",
        options: ["3 (graves · médiums · aigus)", "4"], optionsEn: ["3 (low · mid · high)", "4"],
        optionIds: ["3", "4"], defaut: "3 (graves · médiums · aigus)", defautEn: "3 (low · mid · high)",
        doc: "Nombre de bandes. Trois : coupures à 250 Hz et 2,5 kHz. Quatre : à 180 Hz, 900 Hz et 4,5 kHz. Au départ, la bande la plus grave est à gauche et la plus aiguë à droite.",
        docEn: "Number of bands. Three: cutoffs at 250 Hz and 2.5 kHz. Four: at 180 Hz, 900 Hz and 4.5 kHz. At first, the lowest band is on the left and the highest on the right." },
      { nom: "Mot", nomEn: "Word", type: "texte", defaut: "1 -2", defautEn: "1 -2",
        doc: "Le motif de la tresse, en croisements séparés par des espaces. « 1 » : le brin de la place 1 passe dessus celui de la place 2 ; « -1 » : il passe dessous ; « 2 » concerne les places 2 et 3. « 1 -2 » est la natte classique à trois brins. Les places se comptent de gauche à droite.",
        docEn: "The braid's pattern, as crossings separated by spaces. « 1 »: the strand in place 1 goes over the one in place 2; « -1 »: it goes under; « 2 » concerns places 2 and 3. « 1 -2 » is the classic three-strand plait. Places are counted from left to right." },
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [1, 12], pas: 1, defaut: 3,
        doc: "Nombre de fois que le motif est joué, réparti sur la durée du son. Les brins retrouvent leurs places au bout d'un nombre de motifs fixé par le mot — 3 pour la natte : le message l'indique.",
        docEn: "Number of times the pattern is played, spread over the sound's length. Strands return to their places after a number of patterns set by the word — 3 for the plait: the message tells you." },
      { nom: "Relief", nomEn: "Relief", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Contraste entre le brin qui passe dessus (+3 dB au milieu du croisement à 100 %) et celui qui passe dessous (−6 dB). À 0 %, les bandes échangent leurs places sans que l'on entende lequel passe devant.",
        docEn: "Contrast between the strand going over (+3 dB mid-crossing at 100%) and the one going under (−6 dB). At 0%, bands swap places without it being heard which one passes in front." },
      { nom: "Largeur", nomEn: "Width", type: "nombre", plage: [0, 100], pas: 1, defaut: 90, unite: "%",
        doc: "Écart des places extrêmes par rapport au centre.",
        docEn: "Distance of the outermost places from the centre." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const brins = ctx.paramTexte("Brins", "3") === "4" ? 4 : 3;
      const texte = ctx.paramTexte("Mot", "1 -2");
      const lu = lireMotTresse(texte, brins);
      if ("erreur" in lu) {
        return { valeurs: [null], erreur: true, message: traduire("msg.tresse.mot_invalide_var_0_var_1", lu.erreur, brins - 1) };
      }
      const repetitions = Math.round(ctx.paramNombre("Répétitions", 3));
      ctx.onProgress(traduire("progress.tresse.var_0", brins));
      const r = tresserCanaux(canauxDe(buffer), buffer.sampleRate, {
        brins, mot: lu.mot, repetitions,
        relief: ctx.paramNombre("Relief", 100) / 100,
        largeur: ctx.paramNombre("Largeur", 90) / 100,
      });
      const retour = r.revenus
        ? traduire("msg.tresse.revenus_var_0", r.ordre)
        : traduire("msg.tresse.pas_revenus_var_0", r.ordre);
      return {
        valeurs: [versAudioBuffer(r.canaux, buffer.sampleRate)],
        message: traduire("msg.tresse.var_0_var_1_var_2", brins, r.croisements, retour),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
