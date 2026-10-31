// plugins/retard-granulaire.ts — Une ligne à retard lue par des grains, dont la sortie y retourne.
//
// La logique est dans `audio/retard-granulaire.ts`, testée ; ce fichier n'est que la prise. La
// filiation et le choix du diviseur de niveau sont écrits en tête de ce module-là.
//
// LES QUATRE LONGUEURS SE CALCULENT AVANT LES COURBES, et dans cet ordre : la queue dépend de la
// réinjection et du retard les plus forts que le rendu atteindra, et ces deux grandeurs se lisent
// sur les BORNES dès qu'une courbe est branchée, non sur le réglage, qui ne sert alors à rien.
// Les courbes se construisent ensuite à la longueur trouvée. L'ordre inverse serait circulaire.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { bornesModulation, modulationNommee, portModulation, reglageModule } from "./effets-aides";
import { estCourbe } from "../audio/courbe";
import { FENETRES, type Fenetre } from "../audio/micromontage";
import { retardGranulaire, retardMaximal, toursAudibles } from "../audio/retard-granulaire";
import { choixOuiNon } from "../core/oui-non";

const FENETRES_FR = ["Gaussienne", "Trapèze", "Expodec", "Rexpodec"];
const FENETRES_EN = ["Gaussian", "Trapezoid", "Expodec", "Rexpodec"];

/** Les quatre réglages qu'une courbe vient piloter, dans l'ordre de leurs ports. */
const MOD_TEMPS = { ...modulationNommee("Temps", "Time", [0.01, 2], "s"), pas: 0.01, defauts: [0.05, 1] as [number, number] };
const MOD_DISPERSION = { ...modulationNommee("Dispersion", "Scatter", [0, 1], "s"), pas: 0.01, defauts: [0, 0.5] as [number, number] };
const MOD_TRANSPOSITION = { ...modulationNommee("Transposition", "Transposition", [-24, 24], "demi-tons"), uniteEn: "semitones", defauts: [-12, 12] as [number, number] };
const MOD_REINJECTION = { ...modulationNommee("Réinjection", "Feedback", [0, 95], "%"), defauts: [0, 80] as [number, number] };
const MOD_MELANGE = { ...modulationNommee("Mélange", "Mix", [0, 100], "%"), defauts: [0, 100] as [number, number] };

export const fiches: FicheAudio[] = ([
  {
    id: "retard-granulaire", nomDicte: "retard par grains", nom: "Retard granulaire", nomEn: "Granular Delay",
    univers: "Traitement", famille: "Effets",
    resume: "Retarde le son et le rend par grains ; ce qui sort retourne dans la ligne et s'y regranule.",
    resumeEn: "Delays the sound and returns it as grains; what comes out goes back into the line and is granulated again.",
    notice: `Retarde le son et le rend par grains, chacun lu dans la ligne à retard à sa propre place et à sa propre vitesse.

« Temps » est le retard central, celui auquel les grains viennent lire. « Dispersion » étale leurs retards de part et d'autre : à zéro, tous lisent la même place et la sortie est le son retardé ; au-delà, chacun lit ailleurs et le son s'épaissit.

« Taille de grain » est la durée d'un grain, « Densité » le nombre de grains lancés par seconde. Leur produit donne le recouvrement, soit combien de grains sonnent ensemble, et le message le dit. La somme est ramenée à la somme des fenêtres actives, de sorte que la densité ne monte pas le niveau ; des grains qui lisent des places différentes sortent alors plus bas que des grains qui lisent la même, et le message donne la compensation appliquée.

« Transposition » est l'écart de hauteur d'un grain, en demi-tons. Elle est lue à l'instant où le grain est lancé et ne change pas pendant sa lecture, de sorte que la hauteur du grain est celle qu'elle annonce.

« Réinjection » renvoie dans la ligne ce qui sort des grains. Ce qui revient est granulé de nouveau, donc transposé une fois de plus : la hauteur monte ou descend par paliers, un par tour, et le rapport d'un palier au suivant est celui de « Transposition ».

Un grain transposé vers le haut lit la ligne plus vite que le temps ne passe, et rejoint la tête d'écriture au bout d'une course qui vaut le retard divisé par l'excès de vitesse. Sa durée est bornée là, ce qui raccourcit les grains aux retards courts ; le message dit combien l'ont été.

« Gel » arrête l'alimentation de la ligne dès qu'elle a été remplie une fois. Les grains n'y lisent plus que ce qu'elle tient, qui tourne en boucle, et « Réinjection » n'a plus de prise puisque rien n'entre plus.

« Fenêtre » décide de la forme de chaque grain. Le trapèze garde un plateau, de sorte que les grains se somment à plat et qu'un son retardé ressort à son propre niveau ; la gaussienne ne laisse de matière qu'au centre, ce qui module la sortie au débit des grains ; l'expodec décroît après une attaque brève et la rexpodec monte puis coupe, les deux donnant un sens au temps à l'intérieur du grain.

« Mélange » est la proportion de son granulé : à 0 %, la sortie est le son d'entrée. « Graine » gouverne le tirage des retards, et à graine égale le rendu est le même.

« Queue max » borne ce qui est ajouté après la fin du son pour laisser les tours s'éteindre. Ce qui est ajouté vaut le nombre de tours encore audibles, que « Réinjection » décide, multiplié par le retard ; sous « Gel » la ligne ne se vide jamais, et la queue vaut alors tout ce que ce réglage autorise.

Les entrées « Modulation temps », « Modulation dispersion », « Modulation transposition », « Modulation réinjection » et « Modulation mélange » prennent la place de leur réglage quand une courbe y est branchée, chacune avec ses deux bornes ; sans courbe, ces bornes ne servent pas. « Temps max » et « Dispersion max » fixent ensemble la longueur de la ligne, donc le plus grand retard que le rendu atteindra, et « Réinjection max » le nombre de tours que la queue laisse entendre.`,
    noticeEn: `Delays the sound and returns it as grains, each read from the delay line at its own place and its own speed.

« Time » is the central delay, the one the grains read at. « Scatter » spreads their delays either side of it: at zero they all read the same place and the output is the delayed sound; beyond, each reads elsewhere and the sound thickens.

« Grain size » is the length of one grain, « Density » the number of grains launched per second. Their product gives the overlap, that is how many grains sound together, and the message states it. The sum is brought back to the sum of the active windows, so density does not raise the level; grains reading different places then come out lower than grains reading the same one, and the message gives the compensation applied.

« Transposition » is a grain's pitch offset in semitones. It is read at the instant the grain is launched and does not change while it plays, so a grain's pitch is the one it states.

« Feedback » sends what comes out of the grains back into the line. What returns is granulated again, hence transposed once more: the pitch rises or falls in steps, one per round, and the ratio from one step to the next is that of « Transposition ».

A grain transposed upward reads the line faster than time passes, and reaches the writing head after a run worth the delay divided by the excess speed. Its length is bounded there, which shortens grains at short delays; the message says how many were.

« Freeze » stops feeding the line as soon as it has been filled once. The grains then read only what it holds, which loops, and « Feedback » has no purchase since nothing enters any more.

« Window » decides the shape of each grain. The trapezoid keeps a plateau, so the grains sum flat and a delayed sound comes out at its own level; the Gaussian leaves matter only at the centre, which modulates the output at the grain rate; the expodec decays after a brief attack and the rexpodec rises then cuts, the two of them giving a direction to time inside the grain.

« Mix » is the proportion of granulated sound: at 0 %, the output is the input. « Seed » governs the draw of the delays, and at equal seed the render is the same.

« Max tail » bounds what is added after the end of the sound to let the rounds die away. What is added is the number of rounds still audible, which « Feedback » decides, times the delay; under « Freeze » the line never empties, and the tail is then everything this setting allows.

The « Modulation time », « Modulation scatter », « Modulation transposition », « Modulation feedback » and « Modulation mix » inputs take the place of their setting when a curve is connected, each with its two bounds; with no curve those bounds do nothing. « Time max » and « Scatter max » together set the length of the line, hence the longest delay the render will reach, and « Feedback max » the number of rounds the tail lets through.`,
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      portModulation("Temps", "Time", { court: false }),
      portModulation("Dispersion", "Scatter", { court: false }),
      portModulation("Transposition", "Transposition", { court: false }),
      portModulation("Réinjection", "Feedback", { court: false }),
      portModulation("Mélange", "Mix", { court: false }),
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Temps", nomEn: "Time", type: "curseur", plage: [0.01, 2], pas: 0.01, defaut: 0.25, unite: "s",
        doc: "Le retard central, celui auquel les grains viennent lire dans la ligne.",
        docEn: "The central delay, the one the grains read at in the line." },
      { nom: "Dispersion", nomEn: "Scatter", type: "curseur", plage: [0, 1], pas: 0.01, defaut: 0.05, unite: "s",
        doc: "L'étalement des retards de part et d'autre du retard central. À zéro, tous les grains lisent la même place et la sortie est le son retardé.",
        docEn: "The spread of the delays either side of the central delay. At zero, every grain reads the same place and the output is the delayed sound." },
      { nom: "Taille de grain", nomEn: "Grain size", type: "curseur", plage: [5, 500], pas: 1, defaut: 80, unite: "ms",
        doc: "La durée d'un grain. Au-dessous de cinquante millisecondes sa hauteur propre cesse de s'entendre et c'est la matière qui parle.",
        docEn: "The length of one grain. Below fifty milliseconds its own pitch stops being heard and it is the matter that speaks." },
      { nom: "Densité", nomEn: "Density", type: "curseur", plage: [1, 200], pas: 1, defaut: 25, unite: "/s",
        doc: "Le nombre de grains lancés par seconde. Multiplié par la taille d'un grain, il donne le recouvrement.",
        docEn: "The number of grains launched per second. Multiplied by the grain size, it gives the overlap." },
      { nom: "Transposition", nomEn: "Transposition", type: "curseur", plage: [-24, 24], pas: 1, defaut: 0, unite: "demi-tons", uniteEn: "semitones",
        doc: "L'écart de hauteur d'un grain, lu à l'instant où il est lancé. Avec de la réinjection, il s'applique une fois de plus à chaque tour.",
        docEn: "A grain's pitch offset, read at the instant it is launched. With feedback, it applies once more on each round." },
      { nom: "Réinjection", nomEn: "Feedback", type: "curseur", plage: [0, 95], pas: 1, defaut: 40, unite: "%",
        doc: "La part de ce qui sort des grains qui retourne dans la ligne, et y est granulé de nouveau.",
        docEn: "The share of what comes out of the grains that goes back into the line, to be granulated again." },
      { nom: "Gel", nomEn: "Freeze", type: "choix",
        ...choixOuiNon("non"),
        defaut: "Non", defautEn: "No",
        doc: "Arrête l'alimentation de la ligne dès qu'elle a été remplie une fois. Les grains n'y lisent plus que ce qu'elle tient, qui tourne en boucle.",
        docEn: "Stops feeding the line as soon as it has been filled once. The grains then read only what it holds, which loops." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: FENETRES_FR, optionsEn: FENETRES_EN, optionIds: [...FENETRES],
        defaut: "Trapèze", defautEn: "Trapezoid",
        doc: "La forme de chaque grain. Le trapèze est le défaut parce que son plateau fait que les grains se somment à plat : à recouvrement deux, un son retardé sans écart ni transposition ressort à son propre niveau, là où la gaussienne, qui ne laisse de matière qu'au centre, en perd 1,9 dB et module la sortie au débit des grains. Les deux exponentielles donnent un sens au temps à l'intérieur du grain.",
        docEn: "The shape of each grain. The trapezoid is the default because its plateau makes the grains sum flat: at overlap two, a sound delayed with no scatter and no transposition comes out at its own level, where the Gaussian, which leaves matter only at the centre, loses 1.9 dB of it and modulates the output at the grain rate. The two exponentials give a direction to time inside the grain." },
      { nom: "Mélange", nomEn: "Mix", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "La proportion de son granulé. À 0 %, la sortie est le son d'entrée.",
        docEn: "The proportion of granulated sound. At 0 %, the output is the input." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Le numéro du tirage des retards. À graine égale, le même rendu.",
        docEn: "The number of the delay draw. At equal seed, the same render." },
      { nom: "Queue max", nomEn: "Max tail", type: "curseur", plage: [0, 10], pas: 0.5, defaut: 3, unite: "s",
        doc: "Borne de ce qui est ajouté après la fin du son pour laisser les tours s'éteindre. À réinjection forte les tours audibles se comptent par dizaines, et sans cette borne le rendu s'allongerait d'autant.",
        docEn: "Bound on what is added after the end of the sound to let the rounds die away. At high feedback the audible rounds run into the dozens, and without this bound the render would lengthen accordingly." },
      ...bornesModulation(MOD_TEMPS),
      ...bornesModulation(MOD_DISPERSION),
      ...bornesModulation(MOD_TRANSPOSITION),
      ...bornesModulation(MOD_REINJECTION),
      ...bornesModulation(MOD_MELANGE),
    ],
    async executer(ctx) {
      const entree = entreeAudio(ctx, 0);
      if (sansEntree(entree)) return entree;
      const { numberOfChannels: canaux, length, sampleRate: sr } = entree;

      // LES TROIS GRANDEURS QUI DIMENSIONNENT LE RENDU SE LISENT SUR LA BORNE quand une courbe est
      // branchée : c'est le réglage qui ne sert plus à rien, et calculer la ligne ou la queue sur
      // lui donnerait deux longueurs pour un même effet.
      const tempsMax = estCourbe(ctx.entree(1))
        ? ctx.paramNombre("Temps max", MOD_TEMPS.defauts[1])
        : ctx.paramNombre("Temps", 0.25);
      const dispersionMax = estCourbe(ctx.entree(2))
        ? ctx.paramNombre("Dispersion max", MOD_DISPERSION.defauts[1])
        : ctx.paramNombre("Dispersion", 0.05);
      const reinjectionMax = estCourbe(ctx.entree(4))
        ? ctx.paramNombre("Réinjection max", MOD_REINJECTION.defauts[1]) / 100
        : ctx.paramNombre("Réinjection", 40) / 100;
      const retardMax = retardMaximal(tempsMax, dispersionMax, sr);
      const gel = ctx.paramTexte("Gel", "non") === "oui";
      // AU GEL LA LIGNE NE SE VIDE JAMAIS, et la queue vaut alors tout ce que « Queue max »
      // autorise. LE COMPTE DES TOURS NE S'Y APPLIQUE PAS, et l'oubli s'est vu dans l'application
      // avant de se voir ici : à réinjection nulle il rend un tour, de sorte qu'un gel demandé
      // avec deux secondes de queue n'en recevait que le temps d'un retard et que la boucle gelée
      // n'avait pas le temps de s'entendre. Le rendu était alors indiscernable du rendu libre.
      const queueMax = Math.round(ctx.paramNombre("Queue max", 3) * sr);
      const queue = gel ? queueMax : Math.min(queueMax, retardMax * toursAudibles(reinjectionMax));
      const n = length + queue;

      const options = {
        sampleRate: sr,
        taille: ctx.paramNombre("Taille de grain", 80) / 1000,
        densite: ctx.paramNombre("Densité", 25),
        gel,
        fenetre: ctx.paramTexte("Fenêtre", "gaussienne") as Fenetre,
        graine: ctx.paramNombre("Graine", 1),
        queue,
        // LES COURBES SE CONSTRUISENT À LA LONGUEUR DE LA SORTIE, queue comprise : bâties à celle
        // de l'entrée, leur dernière valeur serait tenue pendant toute la queue, et une courbe de
        // réinjection qui finit à zéro laisserait pourtant la boucle tourner.
        temps: reglageModule(ctx, n, 1, {
          reglage: "Temps", defaut: 0.25, rendu: "pourCent",
          noms: ["Temps min", "Temps max"], bornes: MOD_TEMPS.defauts,
        }),
        dispersion: reglageModule(ctx, n, 2, {
          reglage: "Dispersion", defaut: 0.05, rendu: "pourCent",
          noms: ["Dispersion min", "Dispersion max"], bornes: MOD_DISPERSION.defauts,
        }),
        transposition: reglageModule(ctx, n, 3, {
          reglage: "Transposition", defaut: 0, rendu: "pourCent",
          noms: ["Transposition min", "Transposition max"], bornes: MOD_TRANSPOSITION.defauts,
        }),
        reinjection: reglageModule(ctx, n, 4, {
          reglage: "Réinjection", defaut: 40,
          noms: ["Réinjection min", "Réinjection max"], bornes: MOD_REINJECTION.defauts,
        }),
        melange: reglageModule(ctx, n, 5, {
          reglage: "Mélange", defaut: 50,
          noms: ["Mélange min", "Mélange max"], bornes: MOD_MELANGE.defauts,
        }),
      };

      const voies: Float32Array[] = [];
      let rapport = { grains: 0, recouvrementMoyen: 0, compensationMoyenne: 1, ligne: 0, bornes: 0 };
      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.retardGranulaire.canal", String(c + 1), String(canaux)));
        const r = retardGranulaire(entree.getChannelData(c), options);
        voies.push(r.sortie);
        rapport = r.rapport;
      }

      const sortie = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
      for (let c = 0; c < canaux; c++) sortie.getChannelData(c).set(voies[c]);

      return {
        valeurs: [sortie],
        message: traduire("msg.retardGranulaire.rendu",
          String(rapport.grains),
          rapport.recouvrementMoyen.toFixed(1),
          ((rapport.ligne / sr) * 1000).toFixed(0),
          (20 * Math.log10(rapport.compensationMoyenne)).toFixed(1),
          rapport.bornes > 0 ? traduire("msg.retardGranulaire.bornes", String(rapport.bornes)) : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
