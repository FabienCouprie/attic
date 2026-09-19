// plugins/courbe.ts — Les deux sources de modulation : suivre un son, ou fabriquer une courbe.
//
// D'après Vincent Verfaille, Udo Zölzer et Daniel Arfib, « Adaptive Digital Audio Effects
// (A-DAFx): A New Class of Sound Transformations », IEEE TASLP 14(5), 2006 ; et « Implementation
// Strategies for Adaptive Digital Audio Effects », DAFx-02.
//
// La logique est dans `audio/courbe.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  CADENCE, engendrer, lisser, suivre,
  type Caracteristique, type Courbe, type FormeCourbe,
} from "../audio/courbe";

export const fiches: FicheAudio[] = ([
  {
    id: "suiveur-caracteristique", nom: "Suiveur de caractéristique", nomEn: "Feature Follower",
    univers: "Traitement", famille: "Effets",
    resume: "Extrait une caractéristique d'un son — énergie, brillance, platitude, variation — pour en piloter un effet.",
    resumeEn: "Extracts a feature from a sound — energy, brightness, flatness, flux — to drive an effect with it.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Courbe", nomEn: "Curve", type: "courbe" },
      { nom: "Audio", type: "audio" },
    ],
    parametres: [
      { nom: "Caractéristique", nomEn: "Feature", type: "choix",
        options: ["Énergie", "Brillance", "Platitude", "Variation"],
        optionsEn: ["Energy", "Brightness", "Flatness", "Flux"],
        optionIds: ["energie", "brillance", "platitude", "variation"],
        defaut: "Énergie", defautEn: "Energy",
        doc: "Ce qu'on suit, et les quatre disent des choses différentes. L'ÉNERGIE suit le geste de l'interprète. La BRILLANCE — le centre de gravité du spectre — suit le timbre et monte quand le son devient dur. La PLATITUDE distingue une note d'un bruit : zéro pour une sinusoïde, un pour du bruit blanc. La VARIATION marque les attaques et retombe pendant les tenues.",
        docEn: "What is followed, and the four say different things. ENERGY follows the player's gesture. BRIGHTNESS — the spectrum's centre of gravity — follows timbre and rises as the sound gets harsh. FLATNESS tells a note from a noise: zero for a sine, one for white noise. FLUX marks attacks and falls back during sustains." },
      { nom: "Inertie", nomEn: "Inertia", type: "curseur", plage: [0, 99], pas: 1, defaut: 70, unite: "%",
        doc: "Lissage de la courbe. Sans lui, une courbe d'énergie fait sauter le paramètre à chaque attaque. Le lissage se fait en aller-retour, de sorte qu'il ne DÉCALE pas la courbe : sans cette précaution, le filtre s'ouvrirait après la note au lieu de s'ouvrir avec elle.",
        docEn: "Smoothing of the curve. Without it, an energy curve makes the parameter jump at every attack. The smoothing runs forwards then backwards so that it does not DELAY the curve: without that care, the filter would open after the note instead of with it." },
      { nom: "Cadence", nomEn: "Rate", type: "curseur", plage: [20, 1000], pas: 10, defaut: 200, unite: "/s",
        doc: "Valeurs par seconde. Haute, la courbe suit les moindres soubresauts ; basse, elle ne garde que le geste d'ensemble. La cadence n'a pas à valoir celle du son : l'effet interpole.",
        docEn: "Values per second. High, the curve follows every twitch; low, it keeps only the overall gesture. The rate need not match the sound's: the effect interpolates." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      }
      const quoi = ctx.paramTexte("Caractéristique", "energie") as Caracteristique;
      const cadence = Math.round(ctx.paramNombre("Cadence", CADENCE));
      const courbe = suivre(entree.getChannelData(0), entree.sampleRate, quoi, cadence);
      const inertie = ctx.paramNombre("Inertie", 70) / 100;
      const lissee: Courbe = { valeurs: lisser(courbe.valeurs, inertie), cadence: courbe.cadence };
      // L'audio ressort tel quel : le suiveur s'insère dans une chaîne sans la couper.
      return {
        valeurs: [lissee, entree],
        message: traduire("msg.courbe.suivi", String(lissee.valeurs.length), String(cadence)),
      };
    },
  },
  {
    id: "generateur-courbe", nom: "Courbe", nomEn: "Curve",
    univers: "Entrées", famille: "Génération",
    resume: "Fabrique une courbe de modulation : oscillateur, rampe, suite logistique ou marche aléatoire.",
    resumeEn: "Builds a modulation curve: oscillator, ramp, logistic sequence or random walk.",
    entrees: [],
    sorties: [{ nom: "Courbe", nomEn: "Curve", type: "courbe" }],
    parametres: [
      { nom: "Forme", nomEn: "Shape", type: "choix",
        options: ["Sinus", "Triangle", "Carré", "Rampe", "Logistique", "Aléatoire"],
        optionsEn: ["Sine", "Triangle", "Square", "Ramp", "Logistic", "Random"],
        optionIds: ["sinus", "triangle", "carre", "rampe", "logistique", "aleatoire"],
        defaut: "Sinus", defautEn: "Sine",
        doc: "La forme de la modulation. La SUITE LOGISTIQUE est là pour une raison précise : sept nœuds d'Attic l'ont chacun réimplémentée dans leur coin — écho logistique, trémolo logistique, et cinq autres. Une source unique branchée sur n'importe quel effet fait le même travail, et sur tous plutôt que sur sept.",
        docEn: "The shape of the modulation. The LOGISTIC SEQUENCE is here for a precise reason: seven Attic nodes each reimplemented it on their own — logistic echo, logistic tremolo, and five others. A single source plugged into any effect does the same work, and on all of them rather than on seven." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.5, 120], pas: 0.5, defaut: 10, unite: "s",
        doc: "Durée de la courbe. Elle n'a pas à valoir celle du son : l'effet l'étire pour la couvrir, si bien qu'une rampe reste une rampe quelle que soit la longueur du son.",
        docEn: "Length of the curve. It need not match the sound's: the effect stretches it to cover it, so a ramp stays a ramp whatever the sound's length." },
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [0.01, 20], pas: 0.01, defaut: 0.5, unite: "Hz",
        doc: "Cycles par seconde, pour les formes périodiques ; pour la logistique et l'aléatoire, nombre de pas par seconde.",
        docEn: "Cycles per second for the periodic shapes; for the logistic and random ones, steps per second." },
      { nom: "Chaos", nomEn: "Chaos", type: "curseur", plage: [2.5, 4], pas: 0.01, defaut: 3.9,
        doc: "Le paramètre r de la suite logistique. En dessous de 3 elle se fixe ; vers 3,45 elle alterne entre deux valeurs, puis quatre ; au-delà de 3,57 elle devient chaotique et ne se répète jamais.",
        docEn: "The logistic sequence's r. Below 3 it settles; around 3.45 it alternates between two values, then four; beyond 3.57 it turns chaotic and never repeats." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 1,
        doc: "Graine de la marche aléatoire.", docEn: "Seed of the random walk." },
    ],
    async executer(ctx: any) {
      const forme = ctx.paramTexte("Forme", "sinus") as FormeCourbe;
      const dureeSec = ctx.paramNombre("Durée", 10);
      const courbe = engendrer({
        dureeSec, forme,
        frequence: ctx.paramNombre("Fréquence", 0.5),
        r: ctx.paramNombre("Chaos", 3.9),
        graine: Math.round(ctx.paramNombre("Graine", 1)),
      });
      return {
        valeurs: [courbe],
        message: traduire("msg.courbe.engendree", String(courbe.valeurs.length), dureeSec.toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
