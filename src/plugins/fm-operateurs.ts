// plugins/fm-operateurs.ts — Un synthé FM à six opérateurs, et huit façons de les brancher.
//
// CE QU'IL AJOUTE AU CATALOGUE. Le dépôt n'avait que le cas à deux opérateurs, où il n'existe
// qu'un seul branchement possible : l'un module l'autre, et tout le timbre tient dans un
// rapport et un indice. Avec six, c'est le branchement qui fait le timbre, et c'est de là que
// viennent les cloches, les cuivres et les pianos électriques du procédé.
//
// VINGT-TROIS RÉGLAGES, ET C'EST LE NOMBRE JUSTE. Trois par opérateur, rapport, niveau et
// déclin, font dix-huit ; les cinq autres sont le branchement, la hauteur, la durée, la
// rétroaction et le volume. Les réduire reviendrait à rendre des opérateurs identiques entre
// eux, ce qui est précisément ce qu'un synthé à six opérateurs n'est pas.
//
// LE CALCUL EST DANS `audio/fm-operateurs.ts`, qui porte en tête la contrainte d'ordre des
// indices et la raison pour laquelle un niveau n'a pas le même sens des deux côtés.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { FREQUENCE_ECH, versBuffer } from "./instruments-communs";
import { ALGORITHMES, OPERATEURS, algorithmeDe, synthetiserFm } from "../audio/fm-operateurs";

// LES DEUX PILES PARTENT ÉQUILIBRÉES, et un balayage de tous les réglages dans l'application
// l'a imposé. Avec une seconde porteuse à quinze pour cent, les opérateurs cinq et six et la
// rétroaction ne déplaçaient le résultat qu'au septième chiffre : ils agissaient, mais
// personne ne les aurait entendus en les réglant. Le branchement par défaut ayant deux piles,
// les deux doivent s'entendre.
const DEFAUTS_RAPPORT = [1, 2, 3, 1, 2, 3];
const DEFAUTS_NIVEAU = [100, 45, 30, 70, 40, 25];
const DEFAUTS_DECLIN = [1.5, 1, 0.7, 0.5, 0.4, 0.3];

/**
 * Les trois réglages d'un opérateur, engendrés plutôt que recopiés six fois.
 *
 * ILS SONT RANGÉS PAR OPÉRATEUR ET NON PAR NATURE, parce que l'inspecteur suit l'ordre de
 * déclaration : les trois réglages d'un même opérateur se lisent l'un sous l'autre, ce qui
 * est la façon dont on règle un opérateur, plutôt que six rapports suivis de six niveaux. La
 * fiche d'un paramètre n'ayant pas de champ de groupe, l'ordre est le seul rangement
 * disponible, et en déclarer un que personne ne lit n'aurait rien rangé.
 */
function reglagesDesOperateurs(): unknown[] {
  const out: unknown[] = [];
  for (let k = 0; k < OPERATEURS; k++) {
    const n = k + 1;
    out.push(
      { nom: `Rapport ${n}`, nomEn: `Ratio ${n}`, type: "curseur", plage: [0.1, 16], pas: 0.1,
        defaut: DEFAUTS_RAPPORT[k],
        doc: `Rapport entre la fréquence de l'opérateur ${n} et celle de la note. Un rapport entier donne un spectre harmonique, un rapport non entier une cloche ou un métal.`,
        docEn: `Ratio between the frequency of operator ${n} and that of the note. A whole ratio gives a harmonic spectrum, a fractional one a bell or a metal.` },
      { nom: `Niveau ${n}`, nomEn: `Level ${n}`, type: "curseur", plage: [0, 100], pas: 1,
        defaut: DEFAUTS_NIVEAU[k], unite: "%",
        doc: `Niveau de l'opérateur ${n}. S'il est porteur dans le branchement choisi, c'est une amplitude ; s'il module, c'est un indice de modulation, et il enrichit alors celui qu'il module. À zéro il est muet, ce qui coupe aussi la pile au-dessus de lui : son rapport et son déclin restent alors sans effet.`,
        docEn: `Level of operator ${n}. If it is a carrier in the chosen routing, this is an amplitude; if it modulates, it is a modulation index, and it then enriches the one it modulates. At zero it is silent, which also cuts the stack above it: its ratio and its decay then have no effect.` },
      { nom: `Déclin ${n}`, nomEn: `Decay ${n}`, type: "curseur", plage: [0.05, 10], pas: 0.05,
        defaut: DEFAUTS_DECLIN[k], unite: "s",
        doc: `Temps de décroissance de l'opérateur ${n}. Donner aux modulateurs un déclin plus court qu'à la porteuse fait un son qui s'éclaircit en s'éteignant, ce qui est le comportement d'une corde frappée.`,
        docEn: `Decay time of operator ${n}. Giving the modulators a shorter decay than the carrier makes a sound that clears as it dies away, which is how a struck string behaves.` },
    );
  }
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "fm-six-operateurs", nom: "FM à six opérateurs", nomEn: "Six-Operator FM",
    univers: "Entrées", famille: "Synthétiseurs",
    resume: "Six opérateurs et huit branchements : c'est le branchement qui fait le timbre.",
    resumeEn: "Six operators and eight routings: the routing is what makes the timbre.",
    etiquettes: ["fm", "operateurs", "operators", "dx7", "cloche", "piano", "modulation"],
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Branchement", nomEn: "Routing", type: "choix",
        options: ALGORITHMES.map((a) => a.fr), optionsEn: ALGORITHMES.map((a) => a.en),
        optionIds: ALGORITHMES.map((a) => a.id), defaut: "Deux piles de trois",
        defautEn: "Two stacks of three",
        doc: "Qui module qui, et qui s'entend. « Pile de six » donne le spectre le plus dense, un seul opérateur s'entendant et les cinq autres le déformant l'un après l'autre. « Six porteuses » ne module rien et revient à une somme de six sinus. Entre les deux, le nombre de porteuses et la profondeur des piles décident du caractère.",
        docEn: "Who modulates whom, and who is heard. « Stack of six » gives the densest spectrum, a single operator being heard and the other five bending it one after another. « Six carriers » modulates nothing and amounts to a sum of six sines. Between the two, the number of carriers and the depth of the stacks decide the character.",
      },
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [20, 4000], pas: 1, defaut: 220, unite: "Hz",
        doc: "Hauteur de la note. Les rapports des six opérateurs s'y appliquent.",
        docEn: "Pitch of the note. The ratios of the six operators apply to it." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.2, 10], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du son généré. Un déclin plus long qu'elle sera coupé net à la fin.",
        docEn: "Duration of the generated tone. A decay longer than it will be cut short at the end." },
      { nom: "Rétroaction", nomEn: "Feedback", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Part de sa propre sortie que le sixième opérateur se renvoie. Elle enrichit son spectre jusqu'au bruit, et n'agit que si le sixième opérateur a un niveau.",
        docEn: "Share of its own output that the sixth operator sends back to itself. It enriches its spectrum as far as noise, and acts only if the sixth operator has a level." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de la sortie, après normalisation de la crête.",
        docEn: "Output level, after the peak has been normalised." },
      ...reglagesDesOperateurs(),
    ],
    async executer(ctx: any) {
      const algorithme = ctx.paramTexte("Branchement", "deux-piles");
      const frequence = ctx.paramNombre("Fréquence", 220);
      const operateurs = Array.from({ length: OPERATEURS }, (_, k) => ({
        rapport: ctx.paramNombre(`Rapport ${k + 1}`, DEFAUTS_RAPPORT[k]),
        niveau: ctx.paramNombre(`Niveau ${k + 1}`, DEFAUTS_NIVEAU[k]) / 100,
        declin: ctx.paramNombre(`Déclin ${k + 1}`, DEFAUTS_DECLIN[k]),
      }));
      const signal = synthetiserFm({
        frequence,
        duree: ctx.paramNombre("Durée", 2),
        algorithme,
        operateurs,
        retroaction: ctx.paramNombre("Rétroaction", 0) / 100,
      }, FREQUENCE_ECH);

      const algo = algorithmeDe(algorithme);
      return {
        // `versBuffer` ATTEND DES POUR CENT et divise lui-même : diviser ici aussi sortait cent
        // fois trop bas, soit quarante décibels.
        valeurs: [versBuffer(signal, ctx.paramNombre("Volume", 80))],
        message: traduire("msg.fm.resultat", langueCourante() === "en" ? algo.en : algo.fr,
          algo.porteuses.length, Math.round(frequence)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
