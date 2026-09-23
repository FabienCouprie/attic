// plugins/csound-formules.ts — Une liste de formules complètes, à la place d'une seule.
//
// Le champ Orchestre du nœud Csound contenait UNE formule d'exemple. Ce nœud en offre huit, chacune
// avec sa partition d'essai — leurs p-fields étant différents, une partition écrite pour l'une ne
// veut rien dire pour l'autre.
//
// La bibliothèque est dans `audio/csound-formules.ts`, testée, et chaque formule a été RENDUE et
// MESURÉE dans l'application avant d'y figurer.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { FORMULES, partitionFormule, texteFormule, trouverFormule } from "../audio/csound-formules";

export const fiches: FicheAudio[] = ([
  {
    id: "formules-csound", nom: "Formules Csound", nomEn: "Csound Formulas",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Huit orchestres complets au choix (FM, soustractive, granulaire, bus de réverbération) chacun avec sa partition d'essai.",
    resumeEn: "Eight complete orchestras to choose from (FM, subtractive, granular, reverb bus) each with its own test score.",
    entrees: [],
    sorties: [
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte" },
      { nom: "Partition d'essai", nomEn: "Test score", type: "texte" },
    ],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "choix",
        options: FORMULES.map((f) => `${f.fr} — ${f.famille}`),
        optionsEn: FORMULES.map((f) => `${f.en} — ${f.familleEn}`),
        optionIds: FORMULES.map((f) => f.id),
        defaut: `${FORMULES[0].fr} — ${FORMULES[0].famille}`,
        defautEn: `${FORMULES[0].en} — ${FORMULES[0].familleEn}`,
        doc: "L'orchestre rendu. Chacun est complet et montre une technique : oscillateur à vibrato (celui que le composant Csound portait par défaut), FM à indice variable, soustractive à filtre balayé, additive à harmoniques comptés, corde de Karplus-Strong, modulation en anneau, nuage granulaire, et un instrument avec bus de réverbération. Les p-fields diffèrent d'une formule à l'autre (l'indice de modulation, la coupure du filtre, la densité de grains) et c'est pourquoi chacune porte sa propre partition d'essai.",
        docEn: "The orchestra produced. Each one is complete and demonstrates a technique: vibrato oscillator (the one the Csound node carried by default), FM with variable index, subtractive with swept filter, additive with counted harmonics, Karplus-Strong string, ring modulation, granular cloud, and an instrument with a reverb bus. The p-fields differ from one formula to the next (modulation index, filter cutoff, grain density) which is why each carries its own test score." },
      { nom: "Niveau", nomEn: "Level", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Niveau de sortie, écrit dans l'orchestre sous la forme d'une variable globale `gkNiveau` que chaque ligne de sortie multiplie. Elle est visible dans le texte : qui le relit peut la changer à la main.",
        docEn: "Output level, written into the orchestra as a global variable `gkNiveau` that every output line multiplies. It is visible in the text: whoever reads it can change it by hand." },
    ],
    async executer(ctx: any) {
      const id = ctx.paramTexte("Formule", FORMULES[0].id);
      const formule = trouverFormule(id) ?? FORMULES[0];
      const en = langueCourante() === "en";
      const orchestre = texteFormule(formule, { niveau: ctx.paramNombre("Niveau", 100) / 100 });
      return {
        valeurs: [orchestre, partitionFormule(formule)],
        message: traduire("msg.csound.formule",
          en ? formule.en : formule.fr,
          formule.canaux === 2 ? (en ? "stereo" : "stéréo") : "mono",
          formule.champs.map((c) => c.champ).join(", ")),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
