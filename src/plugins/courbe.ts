// plugins/courbe.ts — Les deux sources de modulation, et de quoi regarder ce qu'elles produisent.
//
// D'après Vincent Verfaille, Udo Zölzer et Daniel Arfib, « Adaptive Digital Audio Effects
// (A-DAFx): A New Class of Sound Transformations », IEEE TASLP 14(5), 2006 ; et « Implementation
// Strategies for Adaptive Digital Audio Effects », DAFx-02.
//
// La logique est dans `audio/courbe.ts` et `audio/courbe-trace.ts`, testées ; ce fichier n'est que la prise.
//
// LE VISUALISEUR EST ARRIVÉ EN DERNIER, ET IL MANQUAIT DEPUIS LE DÉBUT. Le type `courbe` comptait
// huit sorties et huit entrées, et les huit consommateurs étaient des EFFETS : on pilotait donc un
// effet par une courbe sans jamais pouvoir la regarder, et on l'ajustait en écoutant le résultat.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  CADENCE, engendrer, lisser, suivre,
  type Caracteristique, type Courbe, type FormeCourbe,
} from "../audio/courbe";
import { enveloppe, genererSvgCourbe, mesurerCourbe } from "../audio/courbe-trace";

export const fiches: FicheAudio[] = ([
  {
    id: "suiveur-caracteristique", nom: "Suiveur de caractéristique", nomEn: "Feature Follower",
    univers: "Traitement", famille: "Effets",
    resume: "Extrait une caractéristique d'un son (énergie, brillance, platitude, variation) pour en piloter un effet.",
    resumeEn: "Extracts a feature from a sound (energy, brightness, flatness, flux) to drive an effect with it.",
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
        doc: "Ce qu'on suit, et les quatre disent des choses différentes. L'énergie suit le geste de l'interprète. La brillance, le centre de gravité du spectre, suit le timbre et monte quand le son devient dur. La platitude distingue une note d'un bruit : zéro pour une sinusoïde, un pour du bruit blanc. La variation marque les attaques et retombe pendant les tenues.",
        docEn: "What is followed, and the four say different things. Energy follows the player's gesture. Brightness, the spectrum's centre of gravity, follows timbre and rises as the sound gets harsh. Flatness tells a note from a noise: zero for a sine, one for white noise. Flux marks attacks and falls back during sustains." },
      { nom: "Inertie", nomEn: "Inertia", type: "curseur", plage: [0, 99], pas: 1, defaut: 70, unite: "%",
        doc: "Lissage de la courbe. Sans lui, une courbe d'énergie fait sauter le paramètre à chaque attaque. Le lissage se fait en aller-retour, de sorte qu'il ne décale pas la courbe : sans cette précaution, le filtre s'ouvrirait après la note au lieu de s'ouvrir avec elle.",
        docEn: "Smoothing of the curve. Without it, an energy curve makes the parameter jump at every attack. The smoothing runs forwards then backwards so that it does not delay the curve: without that care, the filter would open after the note instead of with it." },
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
        doc: "La forme de la modulation. La suite logistique est là pour une raison précise : sept composants l'ont chacun réimplémentée dans leur coin, écho logistique, trémolo logistique, et cinq autres. Une source unique branchée sur n'importe quel effet fait le même travail, et sur tous plutôt que sur sept.",
        docEn: "The shape of the modulation. The logistic sequence is here for a precise reason: seven nodes each reimplemented it on their own, logistic echo, logistic tremolo, and five others. A single source plugged into any effect does the same work, and on all of them rather than on seven." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.5, 120], pas: 0.5, defaut: 10, unite: "s",
        doc: "Durée de la courbe. Elle n'a pas à valoir celle du son : l'effet l'étire pour la couvrir, si bien qu'une rampe reste une rampe quelle que soit la longueur du son.",
        docEn: "Length of the curve. It need not match the sound's: the effect stretches it to cover it, so a ramp stays a ramp whatever the sound's length." },
      { nom: "Fréquence", nomEn: "Frequency", type: "curseur", plage: [0.01, 20], pas: 0.01, defaut: 0.5, unite: "Hz",
        doc: "Cycles par seconde, pour les formes périodiques ; pour la logistique et l'aléatoire, nombre de pas par seconde. Changer de forme pose la cadence qui convient à la nouvelle : un demi cycle par seconde pour les formes périodiques, huit pas par seconde pour la logistique et l'aléatoire. Une valeur réglée à la main est conservée quand la forme change.",
        docEn: "Cycles per second for the periodic shapes; for the logistic and random ones, steps per second. Changing shape sets the rate that suits the new one: half a cycle per second for the periodic shapes, eight steps per second for the logistic and random ones. A value set by hand is kept when the shape changes." },
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
  {
    id: "visualiseur-courbe", nom: "Visualiseur de courbe", nomEn: "Curve Viewer",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dessine une courbe de modulation et la mesure, sans la modifier.",
    resumeEn: "Draws a modulation curve and measures it, without altering it.",
    notice: "Dessine une courbe de modulation, et la laisse passer inchangée.\n\nHuit composants produisent une courbe et huit la consomment : filtre, trémolo, spatialisation, amplificateur, retard spectral, partitions Csound, rotation ambisonique. Sans tracé, un effet ainsi piloté se règle à l'oreille seule. Une courbe peut de surcroît venir du son lui-même (la brillance qui ouvre son propre filtre, l'énergie qui allonge son propre délai) et une courbe extraite d'un son ne se devine pas.\n\nLa courbe ressort inchangée sur la première sortie : le visualiseur se pose au milieu d'une chaîne sans la couper, entre la source de modulation et l'effet.\n\nL'échelle verticale est fixée de zéro à un et ne s'ajuste jamais au contenu. C'est la convention du type : le producteur rend des valeurs entre zéro et un, le consommateur décide de ce que zéro et un veulent dire chez lui. Une courbe qui ne va que de 0,48 à 0,52 doit donc paraître plate, parce que c'est exactement ce que l'effet en fera ; un tracé auto-ajusté la montrerait ample et mentirait sur son effet. Deux courbes dessinées à la même échelle se comparent, en outre.\n\nLa réduction garde le minimum et le maximum de chaque colonne, et non une valeur sur n. Une courbe porte deux cents valeurs par seconde : une minute en fait douze mille pour six cents colonnes de dessin, et prendre une valeur sur vingt ferait disparaître une pointe brève, celle d'un transitoire, précisément ce qu'on vient regarder. La bande dessinée va du plus bas au plus haut de chaque colonne, et ne perd rien.\n\nQuatre chiffres accompagnent le tracé. Le minimum, le maximum et la moyenne se lisent sur le dessin ; l'agitation, en unités par seconde, dit ce que les extrêmes confondent. Une rampe de zéro à un sur dix secondes vaut 0,10 ; un bruit qui parcourt la même étendue dix fois par seconde en vaut des dizaines, pour un minimum et un maximum identiques.",
    noticeEn: "Draws a modulation curve, and passes it through unchanged.\n\nEight components produce a curve and eight consume one: filter, tremolo, spatialisation, amplifier, spectral delay, Csound scores, ambisonic rotation. With no plot, an effect driven that way is set by ear alone. A curve can moreover come from the sound itself (the brightness that opens its own filter, the energy that lengthens its own delay) and a curve extracted from a sound cannot be guessed at.\n\nThe curve comes out unchanged on the first output: the viewer sits in the middle of a chain without cutting it, between the modulation source and the effect.\n\nThe vertical scale is fixed from zero to one and never adjusts to the content. That is the type's convention: the producer returns values between zero and one, the consumer decides what zero and one mean at its end. A curve that only goes from 0.48 to 0.52 must therefore look flat, because that is exactly what the effect will make of it; an auto-scaled plot would show it wide and lie about its effect. Two curves drawn at the same scale can also be compared.\n\nThe reduction keeps the minimum and maximum of each column, rather than one value in n. A curve carries two hundred values per second: a minute makes twelve thousand of them for six hundred drawing columns, and taking one value in twenty would make a brief spike vanish, a transient's, precisely what one came to look at. The band drawn runs from the lowest to the highest of each column, and loses nothing.\n\nFour figures accompany the plot. Minimum, maximum and mean can be read off the drawing; the agitation, in units per second, says what the extremes confuse. A ramp from zero to one over ten seconds is 0.10; a noise covering the same range ten times a second is worth dozens, for identical minimum and maximum.",
    entrees: [{ nom: "Courbe", nomEn: "Curve", type: "courbe" }],
    sorties: [
      { nom: "Courbe", nomEn: "Curve", type: "courbe" },
      { nom: "Tracé", nomEn: "Plot", type: "image" },
      { nom: "Mesures", nomEn: "Measurements", type: "texte" },
    ],
    parametres: [
      { nom: "Largeur", nomEn: "Width", type: "curseur", plage: [240, 1280], pas: 20, defaut: 640, unite: "px",
        doc: "Largeur du tracé. Elle fixe aussi le nombre de colonnes : plus large, plus de détail, jusqu'à une colonne par valeur, au-delà de quoi il n'y a plus rien à gagner.",
        docEn: "Width of the plot. It also sets the number of columns: wider means more detail, up to one column per value, beyond which there is nothing more to gain." },
      { nom: "Hauteur", nomEn: "Height", type: "curseur", plage: [120, 480], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du tracé. L'échelle reste de zéro à un quoi qu'il arrive : la hauteur change la place prise, pas la lecture.",
        docEn: "Height of the plot. The scale stays from zero to one whatever happens: the height changes the room taken, not the reading." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const mesure = mesurerCourbe(entree);
      if (mesure.nombre === 0) return { valeurs: [null, null, null], message: traduire("msg.courbe.aucune") };
      const largeur = Math.round(ctx.paramNombre("Largeur", 640));
      const hauteur = Math.round(ctx.paramNombre("Hauteur", 200));
      // Une colonne par pixel de la zone de dessin au plus : au-delà, le fichier grossit sans
      // rien montrer de plus, puisqu'il n'y a plus de pixel pour l'afficher.
      const svg = genererSvgCourbe(mesure, enveloppe(entree, largeur - 44), { largeur, hauteur });
      const rapport = [
        `min ${mesure.min.toFixed(3)} · max ${mesure.max.toFixed(3)} · moyenne ${mesure.moyenne.toFixed(3)}`,
        `agitation ${mesure.agitation.toFixed(2)} /s`,
        `${mesure.nombre} valeurs à ${mesure.cadence} /s — ${mesure.dureeSec.toFixed(2)} s`,
      ].join("\n");
      return {
        valeurs: [entree, new File([svg], "courbe.svg", { type: "image/svg+xml" }), rapport],
        message: traduire("msg.courbe.mesures",
          mesure.min.toFixed(2), mesure.max.toFixed(2), mesure.moyenne.toFixed(2),
          mesure.agitation.toFixed(2), mesure.dureeSec.toFixed(1)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
