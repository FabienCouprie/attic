// plugins/recaler-niveau.ts — Aligner le niveau d'un son sur celui d'un autre.
//
// Le calcul est dans `audio/recaler-niveau.ts`, testé ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { recaler, type MesureRecalage } from "../audio/recaler-niveau";

const en = () => langueCourante() === "en";

/** Un niveau en décibels, ou un tiret quand il n'y en a pas. */
const db = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}` : "?");

export const fiches: FicheAudio[] = ([
  {
    id: "recaler-niveau", nom: "Recaler le niveau", nomEn: "Match Level",
    univers: "Traitement", famille: "Effets",
    resume: "Aligne le niveau d'un son sur celui d'un autre, par un gain constant.",
    notice: "Aligne le niveau d'un son sur celui d'un autre. L'entrée « Référence » donne le niveau visé, l'entrée « À corriger » reçoit le son à modifier, et la sortie rend ce son avec un gain constant appliqué sur toute sa durée.\n\nLe gain étant constant, la dynamique du son corrigé n'est pas touchée : le rapport entre deux instants du son reste celui de départ.\n\n« Mesure » choisit ce qui est aligné :\n• Sonie : la sonie intégrée de la recommandation UIT-R BS.1770, qui applique la pondération K avant de compter l'énergie\n• Niveau efficace : la moyenne quadratique, sans pondération\n• Crête : le plus grand échantillon\n\nDeux bornes limitent le gain, dans cet ordre :\n• « Correction maximale » borne sa valeur absolue\n• « Plafonner la crête » le réduit encore si la crête obtenue dépassait « Plafond » ; le niveau visé n'est alors pas atteint, et le message le dit plutôt que d'écrêter\n\nLe message donne, dans l'ordre : le niveau de la référence, le niveau du son avant et après correction, le gain appliqué, la crête obtenue. Il ajoute le gain demandé lorsque la correction maximale l'a borné, et signale le plafond lorsqu'il a joué.\n\nUn son dont le niveau n'est pas mesurable, un silence par exemple, d'un côté ou de l'autre, laisse la sortie identique à l'entrée et un gain nul.\n\nSous 0,4 seconde, la sonie intégrée n'est pas définie, la porte relative de la norme n'ayant pas assez de blocs : la mesure retombe alors sur le niveau efficace.",
    resumeEn: "Aligns the level of one sound with another, by a constant gain.",
    noticeEn: "Aligns the level of one sound with another. The « Reference » input gives the target level, the « To correct » input receives the sound to modify, and the output returns that sound with a constant gain applied over its whole length.\n\nThe gain being constant, the dynamics of the corrected sound are untouched: the ratio between two instants of the sound stays as it was.\n\n« Measure » chooses what is aligned:\n• Loudness: the integrated loudness of ITU-R BS.1770, which applies K-weighting before counting energy\n• RMS: the quadratic mean, unweighted\n• Peak: the largest sample\n\nTwo bounds limit the gain, in this order:\n• « Maximum correction » bounds its absolute value\n• « Cap the peak » reduces it further if the resulting peak would exceed « Ceiling »; the target level is then not reached, and the message says so rather than clipping\n\nThe message gives, in order: the level of the reference, the level of the sound before and after correction, the gain applied, the resulting peak. It adds the gain asked for when the maximum correction bounded it, and reports the ceiling when it came into play.\n\nA sound whose level cannot be measured, a silence for instance, on either side, leaves the output identical to the input and a gain of zero.\n\nBelow 0.4 seconds, integrated loudness is not defined, the standard's relative gate having too few blocks: the measure then falls back to RMS.",
    entrees: [
      { nom: "Référence", nomEn: "Reference", type: "audio" },
      { nom: "À corriger", nomEn: "To correct", type: "audio" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Mesure", nomEn: "Measure", type: "choix",
        options: ["Sonie", "Niveau efficace", "Crête"], optionsEn: ["Loudness", "RMS", "Peak"],
        optionIds: ["sonie", "rms", "crete"], defaut: "Sonie", defautEn: "Loudness",
        doc: "Ce qui est aligné. Sonie : la sonie intégrée de la norme BS.1770, qui applique la pondération K avant de compter l'énergie. Niveau efficace : la moyenne quadratique, sans pondération. Crête : le plus grand échantillon.",
        docEn: "What is aligned. Loudness: the integrated loudness of the BS.1770 standard, which applies K-weighting before counting energy. RMS: the quadratic mean, unweighted. Peak: the largest sample." },
      { nom: "Correction maximale", nomEn: "Maximum correction", type: "curseur",
        plage: [0, 48], pas: 0.5, defaut: 24, unite: "dB",
        doc: "Valeur absolue que le gain ne dépassera pas. Un son presque silencieux demanderait sans cela quarante décibels, et ne rendrait que son bruit de fond amplifié.",
        docEn: "Absolute value the gain will not exceed. Without it, a nearly silent sound would ask for forty decibels and return only its amplified noise floor." },
      { nom: "Plafonner la crête", nomEn: "Cap the peak", type: "choix",
        options: ["Oui", "Non"], optionsEn: ["Yes", "No"], optionIds: ["oui", "non"],
        defaut: "Oui", defautEn: "Yes",
        doc: "Réduire le gain si la crête obtenue dépassait le plafond. Le niveau visé n'est alors pas atteint, et le message le dit.",
        docEn: "Reduce the gain if the resulting peak would exceed the ceiling. The target level is then not reached, and the message says so." },
      { nom: "Plafond", nomEn: "Ceiling", type: "curseur",
        plage: [-12, 0], pas: 0.1, defaut: -1, unite: "dBFS",
        doc: "Crête maximale tolérée en sortie, quand le plafonnement est actif.",
        docEn: "Maximum peak tolerated on the output, when capping is active." },
    ],
    async executer(ctx: any) {
      const anglais = en();
      const reference = ctx.entree(0);
      const aCorriger = ctx.entree(1);
      if (!(reference instanceof AudioBuffer)) {
        return { valeurs: [null], message: anglais
          ? "Connect a reference to input 1." : "Branchez une référence sur l'entrée 1." };
      }
      if (!(aCorriger instanceof AudioBuffer)) {
        return { valeurs: [null], message: anglais
          ? "Connect the sound to correct to input 2." : "Branchez le son à corriger sur l'entrée 2." };
      }

      const plafonner = ctx.paramTexte("Plafonner la crête", "oui") !== "non";
      const { audio, resultat: r } = recaler(reference, aCorriger, {
        mesure: ctx.paramTexte("Mesure", "sonie") as MesureRecalage,
        correctionMax: ctx.paramNombre("Correction maximale", 24),
        plafondCrete: plafonner ? ctx.paramNombre("Plafond", -1) : null,
      });

      const unite = ctx.paramTexte("Mesure", "sonie") === "sonie" ? "LUFS" : "dB";
      const parts = [
        `${anglais ? "ref" : "réf"} ${db(r.reference)} ${unite}`,
        `${db(r.avant)} → ${db(r.apres)} ${unite}`,
        `${anglais ? "gain" : "gain"} ${db(r.gainDb)} dB`,
        `${anglais ? "peak" : "crête"} ${db(r.creteApres)} dBFS`,
      ];
      if (r.borne) parts.push(anglais
        ? `capped, ${db(r.gainDemandeDb)} dB asked`
        : `borné, ${db(r.gainDemandeDb)} dB demandés`);
      if (r.plafonne) parts.push(anglais ? "ceiling reached" : "plafond atteint");

      return { valeurs: [audio], message: parts.join(" · ") };
    },
  },
] as FicheAudio[]).map(avecDoc);
