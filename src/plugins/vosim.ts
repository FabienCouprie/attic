// plugins/vosim.ts — Un formant sans aucun filtre, par un train d'impulsions en sinus carré.
//
// D'après Kaegi et Tempelaars, 1978. La logique est dans `audio/vosim.ts`, testée, avec la
// filiation, la provenance de la loi des paramètres et les trois témoins de mesure ; ce fichier
// n'est que la prise.
//
// PREMIÈRE FICHE DU CATALOGUE DONT LA PREMIÈRE ENTRÉE EST UNE COURBE, relevé sur les 479 : toutes
// les autres posent leurs ports de modulation APRÈS une entrée audio. Un générateur n'en a pas, et
// ses ports de courbe commencent donc au rang zéro. Rien dans le moteur ne distingue les types de
// prise, mais le cas est neuf, et c'est pourquoi il est vérifié dans l'application plutôt que
// supposé.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import { impulsionsQuiTiennent, vosim } from "../audio/vosim";
import { frequenceDeTravail } from "../audio/frequence-de-travail";

/** Les quatre réglages qu'une courbe vient piloter, dans l'ordre de leurs ports. */
const MOD_FONDAMENTALE = { ...modulationNommee("Fondamentale", "Fundamental", [20, 2000], "Hz"), echelle: "logarithmique" as const, defauts: [55, 880] as [number, number] };
const MOD_FORMANT = { ...modulationNommee("Formant", "Formant", [50, 8000], "Hz"), echelle: "logarithmique" as const, defauts: [300, 4000] as [number, number] };
const MOD_DECROISSANCE = { ...modulationNommee("Décroissance", "Decay", [0, 100], "%"), defauts: [0, 100] as [number, number] };
const MOD_VOLUME = { ...modulationNommee("Volume", "Volume", [0, 100], "%"), defauts: [0, 100] as [number, number] };

export const fiches: FicheAudio[] = ([
  {
    id: "vosim", nomDicte: "synthèse de voyelle", nom: "VOSIM", nomEn: "VOSIM",
    univers: "Entrées", famille: "Génération",
    resume: "Place un formant par un train d'impulsions en sinus carré, sans aucun filtre.",
    resumeEn: "Places a formant with a train of squared-sine pulses, with no filter at all.",
    notice: `Engendre un son dont le spectre porte un formant, par un train d'impulsions en sinus carré.

D'après Werner Kaegi et Stan Tempelaars, « VOSIM, a new sound synthesis system », Journal of the Audio Engineering Society 26(6), 1978 ; le signal date de 1973, à l'Institut de sonologie d'Utrecht. Le spectre théorique est traité par Stan Tempelaars, « The VOSIM Signal Spectrum », Interface 6, 1977.

Une période porte le nombre d'impulsions demandé, chacune plus faible que la précédente, puis le silence qui reste. Il n'y a ni filtre, ni résonateur, ni rétroaction : le formant est le spectre de l'impulsion elle-même, échantillonné par le peigne du train. Hors des impulsions, la sortie est exactement nulle.

« Fondamentale » est le nombre d'événements par seconde, et c'est la hauteur entendue : un événement dure son inverse. « Formant » est l'inverse de la durée d'une impulsion, et c'est la région du spectre où l'énergie se concentre. Les deux se règlent séparément tant que la salve tient dans l'événement.

« Impulsions » est leur nombre par événement, et c'est lui qui donne au formant sa largeur : plus la salve est longue, plus le pic est étroit. La salve occupe le nombre d'impulsions divisé par le formant, et doit tenir dans l'événement : le nombre est donc plafonné par le rapport du formant à la fondamentale, et ce qui dépasse n'est pas écrit. Le message dit combien d'impulsions ont été jetées pour cette raison. Un formant plus bas que la fondamentale n'en laisse tenir aucune.

« Décroissance » est le facteur d'amplitude d'une impulsion à la suivante. À cent pour cent, toutes les impulsions de la salve ont la même amplitude ; plus bas, la salve s'éteint en son propre cours, ce qui élargit le formant.

« Facteur d'impulsion » est le facteur de vitesse de lecture d'une impulsion à la suivante. Au-dessus de cent pour cent, les impulsions raccourcissent au fil de la salve et le formant monte à l'intérieur même de l'événement ; au-dessous, elles s'allongent et il descend.

« Durée » est la longueur rendue, « Volume » le niveau de la première impulsion de chaque salve.

La salve ne passe jamais sous zéro, le sinus carré étant toujours positif : le train porte donc une composante continue, dont le message donne la valeur.

Les entrées « Modulation fondamentale », « Modulation formant », « Modulation décroissance » et « Modulation volume » prennent la place de leur réglage quand une courbe y est branchée, chacune avec ses deux bornes ; sans courbe, ces bornes ne servent pas. Les deux premières se parcourent en multipliant, une octave valant un doublement. Chaque valeur est lue à l'instant où l'événement commence, une par événement : la durée de l'événement et celle de ses impulsions sont décidées avant qu'il s'écrive.

La sortie « Audio » porte le son. Le message donne le nombre d'événements, le nombre d'impulsions écrites, celui des impulsions jetées, la part du rendu exactement nulle et la composante continue.`,
    noticeEn: `Generates a sound whose spectrum carries a formant, with a train of squared-sine pulses.

After Werner Kaegi and Stan Tempelaars, « VOSIM, a new sound synthesis system », Journal of the Audio Engineering Society 26(6), 1978; the signal dates from 1973, at the Institute of Sonology in Utrecht. Its theoretical spectrum is treated by Stan Tempelaars, « The VOSIM Signal Spectrum », Interface 6, 1977.

One period carries the requested number of pulses, each weaker than the one before it, then the silence that remains. There is no filter, no resonator and no feedback: the formant is the spectrum of the pulse itself, sampled by the train's comb. Outside the pulses, the output is exactly zero.

« Fundamental » is the number of events per second, and that is the pitch heard: one event lasts its inverse. « Formant » is the inverse of one pulse's length, and that is the region of the spectrum where energy gathers. The two are set separately as long as the burst fits inside the event.

« Pulses » is their number per event, and it is what gives the formant its width: the longer the burst, the narrower the peak. The burst takes the number of pulses divided by the formant, and must fit inside the event: the number is therefore bounded by the ratio of the formant to the fundamental, and what overruns is not written. The message says how many pulses were dropped for that reason. A formant lower than the fundamental lets none fit.

« Decay » is the amplitude factor from one pulse to the next. At a hundred percent every pulse in the burst has the same amplitude; lower, the burst dies away within its own course, which widens the formant.

« Pulse factor » is the playback rate factor from one pulse to the next. Above a hundred percent the pulses shorten along the burst and the formant rises inside the event itself; below, they lengthen and it falls.

« Duration » is the rendered length, « Volume » the level of the first pulse of each burst.

The burst never goes below zero, the squared sine being always positive: the train therefore carries a steady component, whose value the message gives.

The « Modulation fundamental », « Modulation formant », « Modulation decay » and « Modulation volume » inputs take the place of their setting when a curve is connected, each with its two bounds; with no curve those bounds do nothing. The first two are traversed by multiplying, an octave being a doubling. Each value is read at the instant the event starts, one per event: the length of the event and that of its pulses are decided before it is written.

The « Audio » output carries the sound. The message gives the number of events, the number of pulses written, the number dropped, the share of the render that is exactly zero and the steady component.`,
    entrees: [
      portModulation("Fondamentale", "Fundamental", { court: false }),
      portModulation("Formant", "Formant", { court: false }),
      portModulation("Décroissance", "Decay", { court: false }),
      portModulation("Volume", "Volume", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Fondamentale", nomEn: "Fundamental", type: "curseur", plage: [20, 2000], pas: 1, defaut: 110, unite: "Hz",
        doc: "Le nombre d'événements par seconde, et la hauteur entendue : un événement dure son inverse.",
        docEn: "The number of events per second, and the pitch heard: one event lasts its inverse." },
      { nom: "Formant", nomEn: "Formant", type: "curseur", plage: [50, 8000], pas: 1, defaut: 1200, unite: "Hz",
        doc: "L'inverse de la durée d'une impulsion, et la région du spectre où l'énergie se concentre. Il se règle sans déplacer la fondamentale tant que la salve tient dans l'événement.",
        docEn: "The inverse of one pulse's length, and the region of the spectrum where energy gathers. It is set without moving the fundamental as long as the burst fits inside the event." },
      { nom: "Impulsions", nomEn: "Pulses", type: "curseur", plage: [1, 64], pas: 1, defaut: 6,
        doc: "Leur nombre par événement, et ce qui donne au formant sa largeur : plus la salve est longue, plus le pic est étroit. Le nombre est plafonné par le rapport du formant à la fondamentale, et ce qui dépasse n'est pas écrit ; le message le dit.",
        docEn: "Their number per event, and what gives the formant its width: the longer the burst, the narrower the peak. The number is bounded by the ratio of the formant to the fundamental, and what overruns is not written; the message says so." },
      { nom: "Décroissance", nomEn: "Decay", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Le facteur d'amplitude d'une impulsion à la suivante. À cent, toutes ont la même amplitude ; plus bas, la salve s'éteint en son propre cours, ce qui élargit le formant.",
        docEn: "The amplitude factor from one pulse to the next. At a hundred they all have the same amplitude; lower, the burst dies away within its own course, which widens the formant." },
      { nom: "Facteur d'impulsion", nomEn: "Pulse factor", type: "curseur", plage: [50, 200], pas: 1, defaut: 100, unite: "%",
        doc: "Le facteur de vitesse de lecture d'une impulsion à la suivante. Au-dessus de cent, les impulsions raccourcissent au fil de la salve et le formant monte à l'intérieur de l'événement ; au-dessous, elles s'allongent et il descend.",
        docEn: "The playback rate factor from one pulse to the next. Above a hundred the pulses shorten along the burst and the formant rises inside the event; below, they lengthen and it falls." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "La longueur rendue.",
        docEn: "The rendered length." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau de la première impulsion de chaque salve. Les suivantes en découlent par la décroissance.",
        docEn: "The level of the first pulse of each burst. The others follow from it by the decay." },
      ...bornesModulation(MOD_FONDAMENTALE),
      ...bornesModulation(MOD_FORMANT),
      ...bornesModulation(MOD_DECROISSANCE),
      ...bornesModulation(MOD_VOLUME),
    ],
    async executer(ctx: any) {
      const sr = frequenceDeTravail();
      const dureeSec = ctx.paramNombre("Durée", 2);
      const n = Math.max(1, Math.round(dureeSec * sr));

      // LES QUATRE PORTS COMMENCENT AU RANG ZÉRO, cette fiche n'ayant pas d'entrée audio.
      const options = {
        sampleRate: sr, dureeSec,
        fondamentale: reglageModule(ctx, n, 0, {
          reglage: "Fondamentale", defaut: 110, rendu: "pourCent", echelle: "logarithmique",
          noms: ["Fondamentale min", "Fondamentale max"], bornes: MOD_FONDAMENTALE.defauts,
        }),
        formant: reglageModule(ctx, n, 1, {
          reglage: "Formant", defaut: 1200, rendu: "pourCent", echelle: "logarithmique",
          noms: ["Formant min", "Formant max"], bornes: MOD_FORMANT.defauts,
        }),
        decroissance: reglageModule(ctx, n, 2, {
          reglage: "Décroissance", defaut: 70,
          noms: ["Décroissance min", "Décroissance max"], bornes: MOD_DECROISSANCE.defauts,
        }),
        amplitude: reglageModule(ctx, n, 3, {
          reglage: "Volume", defaut: 80,
          noms: ["Volume min", "Volume max"], bornes: MOD_VOLUME.defauts,
        }),
        impulsions: Math.round(ctx.paramNombre("Impulsions", 6)),
        facteur: ctx.paramNombre("Facteur d'impulsion", 100) / 100,
      };

      const { sortie, rapport } = vosim(options);
      const buffer = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
      buffer.getChannelData(0).set(sortie);

      return {
        valeurs: [buffer],
        message: traduire("msg.vosim.rendu",
          String(rapport.evenements), String(rapport.impulsions), String(rapport.jetees),
          (rapport.partSilence * 100).toFixed(0),
          rapport.continu.toFixed(3),
          String(impulsionsQuiTiennent(
            ctx.paramNombre("Fondamentale", 110), ctx.paramNombre("Formant", 1200)))),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
