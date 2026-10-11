// plugins/table-onde.ts — Un oscillateur qui lit une banque de cycles, et la balaie.
//
// CE QU'IL AJOUTE AU CATALOGUE. Le dépôt portait les deux généralisations du procédé sans
// porter le procédé : `terrain-onde.ts` lit une surface à deux dimensions, `scanning.ts` lit
// une table que la mécanique fabrique. Aucun des deux ne lit une table qu'on lui DONNE, ni
// ne balaie une banque rangée dans un ordre. C'est pourtant ce balayage qui fait le procédé :
// un réglage déplace le timbre d'un bout à l'autre d'une banque sans toucher à la hauteur.
//
// ET LA BANQUE PEUT VENIR D'UN SON, ce qui est la raison principale de ce composant plutôt
// que d'une liste de formes toutes faites. La période du son est détectée par le suiveur de
// hauteur du dépôt, des cycles en sont tirés à intervalles réguliers, et balayer la banque
// revient alors à traverser le son en le tenant à une hauteur fixe.
//
// LE CALCUL EST DANS `audio/table-onde.ts`, qui porte en tête pourquoi le repliement s'y
// traite en amont, en refusant d'écrire ce qui ne peut pas être représenté, là où
// l'oscillateur analogique doit le traiter en aval.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { FREQUENCE_ECH, versBuffer } from "./instruments-communs";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import {
  CASES, FAMILLES, banqueDepuisSon, banqueEngendree, synthetiserTable, type FamilleId,
} from "../audio/table-onde";

export const fiches: FicheAudio[] = ([
  {
    id: "oscillateur-table-onde", nom: "Oscillateur à table d'onde", nomEn: "Wavetable Oscillator",
    univers: "Entrées", famille: "Génération",
    resume: "Lit une banque de cycles et la balaie : le timbre voyage, la hauteur ne bouge pas.",
    resumeEn: "Reads a bank of cycles and scans it: the timbre travels, the pitch stays put.",
    etiquettes: ["wavetable", "table", "onde", "banque", "balayage", "ppg", "cycle"],
    entrees: [
      { nom: "Audio", type: "audio", requis: false },
      portModulation("Volume"),
      portModulation("Position", "Position", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Banque", nomEn: "Bank", type: "choix",
        options: FAMILLES.map((f) => f.fr), optionsEn: FAMILLES.map((f) => f.en),
        optionIds: FAMILLES.map((f) => f.id), defaut: "Du sinus à la scie", defautEn: "Sine to sawtooth",
        doc: "La banque lue, quand aucun son n'est connecté. « Du sinus à la scie » ajoute les harmoniques une à une. « Du sinus au carré » n'ajoute que les rangs impairs. « Harmonique glissante » ne tient qu'un seul rang par case, qui monte d'une case à l'autre. « Des impaires aux paires » garde les rangs impairs et fait venir les pairs. Sans effet quand un son est connecté, la banque étant alors tirée de lui.",
        docEn: "The bank read, when no sound is connected. « Sine to sawtooth » adds the harmonics one by one. « Sine to square » adds only the odd ranks. « Sliding harmonic » holds a single rank per slot, rising from one slot to the next. « Odd towards even » keeps the odd ranks and brings in the even ones. No effect when a sound is connected, the bank then being taken from it.",
      },
      { nom: "Cases", nomEn: "Slots", type: "curseur", plage: [2, 64], pas: 1, defaut: CASES,
        doc: "Nombre d'emplacements de la banque. Peu de cases donnent un balayage par marches nettes, beaucoup un fondu continu. Sur un son connecté, c'est aussi le nombre de cycles qui en sont tirés. Ce réglage reste sans effet aux deux extrémités de la banque, la première et la dernière case étant les mêmes quel que soit leur nombre.",
        docEn: "Number of slots in the bank. Few slots give a scan in clear steps, many a continuous fade. On a connected sound, it is also the number of cycles taken from it. This setting has no effect at the two ends of the bank, the first and the last slot being the same whatever their number." },
      {
        // LE DÉFAUT EST AU MILIEU DE LA BANQUE, et un balayage de tous les réglages dans
        // l'application l'a imposé. Aux deux extrémités, « Cases » ne peut rien changer, deux
        // des quatre banques se confondent, et un balayage qui part vers le dehors reste
        // écrêté contre la borne : quatre réglages paraissaient morts alors qu'ils agissent.
        nom: "Position", nomEn: "Position", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Où lire dans la banque. À zéro, la première case ; à cent, la dernière. Entre deux cases, les deux sont mélangées.",
        docEn: "Where to read in the bank. At zero, the first slot; at a hundred, the last. Between two slots, the two are blended." },
      { nom: "Balayage", nomEn: "Scan", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Profondeur du voyage de « Position » autour de sa valeur. À zéro, la position reste où elle est réglée.",
        docEn: "Depth of the travel of « Position » around its value. At zero, the position stays where it is set." },
      { nom: "Vitesse de balayage", nomEn: "Scan rate", type: "curseur", plage: [0.05, 20], pas: 0.05, defaut: 0.3, unite: "Hz",
        doc: "Nombre d'allers-retours par seconde dans la banque. Sans effet quand « Balayage » est à zéro, puisque rien ne voyage alors.",
        docEn: "Number of return trips per second through the bank. No effect when « Scan » is at zero, since nothing then travels." },
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [20, 4000], pas: 1, defaut: 220, unite: "Hz",
        doc: "Hauteur du son produit. Elle décide aussi du nombre d'harmoniques gardées : au grave la table en porte plusieurs centaines, à l'aigu quelques-unes.",
        docEn: "Pitch of the sound produced. It also decides how many harmonics are kept: in the bass the table carries several hundred, in the treble a few." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.2, 5], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Durée du son généré.", docEn: "Duration of the generated tone." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de la sortie, après normalisation de la crête. La normalisation se fait avant, sur le son entier : une courbe ne la déplace donc pas, elle règle ce qui en sort.",
        docEn: "Output level, after the peak has been normalised. Normalisation happens first, on the whole sound: a curve therefore does not move it, it sets what comes out of it." },
      ...bornesModulation({ parametre: "Volume", parametreEn: "Volume", bornes: [0, 100], unite: "%" }),
      ...bornesModulation(modulationNommee("Position", "Position", [0, 100], "%")),
    ],
    async executer(ctx: any) {
      const cases = Math.round(ctx.paramNombre("Cases", CASES));
      const frequence = ctx.paramNombre("Fréquence", 220);
      const entree = ctx.entree(0);

      let banque = null;
      let depuis = 0;
      if (entree instanceof AudioBuffer) {
        const tire = banqueDepuisSon(entree.getChannelData(0), entree.sampleRate, cases);
        if (!tire) return { valeurs: [null], message: traduire("msg.table-onde.sansHauteur") };
        banque = tire.banque;
        depuis = tire.frequence;
      } else {
        banque = banqueEngendree(ctx.paramTexte("Banque", "sinus-scie") as FamilleId, cases);
      }

      const signal = synthetiserTable(banque, {
        frequence,
        duree: ctx.paramNombre("Durée", 1.5),
        position: reglageModule(ctx, Math.round(ctx.paramNombre("Durée", 1.5) * FREQUENCE_ECH), 2, {
          reglage: "Position", defaut: 0, noms: ["Position min", "Position max"],
        }),
        modulationPosition: ctx.paramNombre("Balayage", 0) / 100,
        vitesseModulation: ctx.paramNombre("Vitesse de balayage", 0.3),
      }, FREQUENCE_ECH);

      return {
        // `versBuffer` ATTEND DES POUR CENT et divise lui-même : diviser ici aussi sortait cent
        // fois trop bas, soit quarante décibels. C'est aussi pourquoi le rendu demandé est
        // `pourCent` : l'aide ne doit pas diviser non plus.
        valeurs: [versBuffer(signal, reglageModule(ctx, signal.length, 1, {
          reglage: "Volume", defaut: 80, rendu: "pourCent",
        }))],
        message: depuis > 0
          ? traduire("msg.table-onde.duSon", cases, Math.round(depuis), Math.round(frequence))
          : traduire("msg.table-onde.engendree", cases, Math.round(frequence)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
