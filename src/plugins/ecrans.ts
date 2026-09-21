// plugins/ecrans.ts — Le nœud « Écrans (Xenakis) ». Le modèle est dans `audio/ecrans.ts`, éprouvé ;
// ici, la prise.
//
// TROISIÈME NŒUD XENAKIS DU CATALOGUE, après le crible et GENDYN, et le plus ancien des trois par
// sa date : « Analogique A et B » est de 1959, dix ans avant les premières granulations par
// ordinateur. C'est aussi le seul des trois qui ne décrive pas un son mais un ESPACE — un
// quadrillage de fréquences et d'intensités, dont chaque case dit combien de grains par seconde
// elle contient. Les grains sont ensuite tirés au sort dans leur case : on ne compose plus des
// sons mais une densité de probabilité.
//
// LE LIVRE SORT EN TEXTE, ET C'EST LA MOITIÉ DU NŒUD. Une musique stochastique dont on ne voit pas
// la trame ne s'apprend pas : « c'est aléatoire » n'explique rien. Une colonne par écran, une
// ligne par case, et l'on compare ce qu'on lit à ce qu'on entend.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  grainsDuLivre, hasardEcrans, livreEcrans, rapportLivre, rendreGrains, texteLivre,
} from "../audio/ecrans";

export const fiches: FicheAudio[] = ([
  {
    id: "ecrans-xenakis", nom: "Écrans (Xenakis)", nomEn: "Screens (Xenakis)",
    univers: "Entrées", famille: "Génération",
    resume: "Un quadrillage de fréquences et d'intensités dont chaque case tire ses grains, et des écrans qui s'enchaînent par une chaîne de Markov.",
    resumeEn: "A grid of frequencies and intensities where each cell draws its own grains, and screens that follow one another through a Markov chain.",
    notice: "D'après Iannis Xenakis, « Musiques formelles » (1963), et les pièces « Analogique A et B » (1959) — la première granulation composée de l'histoire, dix ans avant les premières granulations par ordinateur.\n\nCe que l'idée a de particulier, et qui la sépare de tout le reste du catalogue granulaire : les autres procédés décrivent un grain — sa forme, sa durée, sa hauteur — puis le répètent. Ici on ne décrit aucun grain. On décrit un espace, quadrillé en cases de fréquence et d'intensité, et l'on dit combien de grains par seconde chaque case doit contenir ; les grains eux-mêmes sont tirés au sort dans leur case. On ne compose plus des sons mais une densité de probabilité, ce qui était exactement le propos de Xenakis : passer du point à la statistique.\n\nUn écran est un état de ce quadrillage, tenu un court instant. Un livre d'écrans est leur succession, et c'est elle qui fait la pièce. Xenakis enchaînait des classes d'écrans par une matrice de transition ; ici, chaque case suit sa propre chaîne à deux états — tenue ou éteinte — avec une probabilité de rester allumée et une probabilité de s'allumer. C'est une adaptation, et elle se comporte de même : les deux régimes que Xenakis cherchait s'obtiennent aux extrêmes. Une tenue forte et une apparition faible donnent des nappes stables ; une tenue faible et une apparition forte, un bouillonnement. Mesuré : à 98 % de tenue, moins de 6 % des cases changent d'un écran au suivant ; à 30 %, plus de 30 % changent.\n\nLes bandes sont logarithmiques, et ce n'est pas un confort d'affichage : l'oreille entend des rapports. Un quadrillage linéaire mettrait la moitié de ses cases entre 10 et 11 kilohertz, où l'on n'entend presque aucune différence, et une seule case pour les trois octaves du grave. La fréquence d'un grain est tirée logarithmiquement à l'intérieur de sa bande, pour la même raison.\n\nLa densité n'est pas un compte de grains mais une moyenne. Un quart de grain par écran ne peut pas se rendre : arrondir donnerait toujours zéro ou toujours un, et la densité cesserait d'être réglable en dessous du grain par écran — ce qui supprimerait la moitié du procédé. La partie fractionnaire décide donc d'un grain de plus, au hasard, et c'est la moyenne qui tombe juste.\n\nLe premier écran est tiré à la probabilité d'équilibre de la chaîne, et non à pile ou face. Autrement, toute pièce commencerait par un écran à moitié plein quels que soient les réglages : une texture creuse mettrait plusieurs secondes à se vider, et l'on entendrait un transitoire que personne n'a demandé.\n\nLa seconde sortie rend le livre en clair — une colonne par écran, une ligne par case, avec les fréquences en marge. Une musique stochastique dont on ne voit pas la trame ne s'apprend pas ; branchez-la sur une « Sortie texte » et comparez ce que vous lisez à ce que vous entendez.",
    noticeEn: "After Iannis Xenakis, « Formalized Music » (1963), and the pieces « Analogique A and B » (1959) — the first composed granulation in history, ten years before the first computer granulations.\n\nWhat is singular about the idea, and what sets it apart from the rest of the granular catalog: other processes describe a grain — its shape, its duration, its pitch — then repeat it. Here no grain is described at all. A space is described, gridded into cells of frequency and intensity, and each cell is told how many grains per second it should hold; the grains themselves are drawn at random inside their cell. You no longer compose sounds but a probability density, which was exactly Xenakis's point: moving from the point to the statistic.\n\nA screen is one state of that grid, held for a brief moment. A book of screens is their succession, and it is the succession that makes the piece. Xenakis chained classes of screens through a transition matrix; here each cell follows its own two-state chain — lit or unlit — with a probability of staying lit and a probability of lighting up. It is an adaptation, and it behaves the same way: the two regimes Xenakis was after appear at the extremes. Strong hold and weak appearance give stable pads; weak hold and strong appearance, a boiling. Measured: at 98 % hold, fewer than 6 % of cells change from one screen to the next; at 30 %, more than 30 % change.\n\nThe bands are logarithmic, and that is no display convenience: the ear hears ratios. A linear grid would put half its cells between 10 and 11 kilohertz, where almost no difference is heard, and a single cell for the three octaves of the low end. A grain's frequency is drawn logarithmically inside its band, for the same reason.\n\nDensity is not a count of grains but an average. A quarter of a grain per screen cannot be rendered: rounding would always give zero or always one, and density would stop being adjustable below one grain per screen — which would remove half the process. The fractional part therefore decides on one extra grain, at random, and it is the average that lands right.\n\nThe first screen is drawn at the chain's equilibrium probability, not on a coin toss. Otherwise every piece would start on a half-full screen whatever the settings: a sparse texture would take seconds to empty out, and a transient nobody asked for would be heard.\n\nThe second output returns the book in plain text — one column per screen, one line per cell, frequencies in the margin. Stochastic music whose weave cannot be seen cannot be learned; connect it to a « Text Output » and compare what you read with what you hear.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Livre", nomEn: "Book", type: "texte" },
    ],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.5, 60], pas: 0.5, defaut: 8, unite: "s",
        doc: "La durée de la pièce. Le nombre d'écrans en découle : c'est la durée divisée par celle d'un écran.",
        docEn: "The piece's duration. The number of screens follows from it: the duration divided by one screen's." },
      { nom: "Durée d'un écran", nomEn: "Screen duration", type: "curseur", plage: [10, 1000], pas: 5, defaut: 100, unite: "ms",
        doc: "Combien de temps un état du quadrillage est tenu. Court, les écrans se succèdent trop vite pour qu'on les distingue et l'on entend une texture ; long, on entend la suite des états, c'est-à-dire une forme.",
        docEn: "How long one state of the grid is held. Short, the screens follow too fast to be told apart and a texture is heard; long, the succession of states is heard, that is, a form." },
      { nom: "Bandes", nomEn: "Bands", type: "curseur", plage: [1, 24], pas: 1, defaut: 8,
        doc: "Le nombre de bandes de fréquence du quadrillage, réparties logarithmiquement entre les deux bornes. Peu de bandes donnent un nuage épais et grossier, beaucoup un tamis fin.",
        docEn: "The number of frequency bands in the grid, spread logarithmically between the two bounds. Few bands give a thick, coarse cloud; many, a fine sieve." },
      { nom: "Niveaux", nomEn: "Levels", type: "curseur", plage: [1, 6], pas: 1, defaut: 3,
        doc: "Le nombre de degrés d'intensité. C'est le second axe du quadrillage chez Xenakis : une case n'est pas seulement une hauteur, c'est une hauteur à une force donnée.",
        docEn: "The number of intensity degrees. It is the grid's second axis in Xenakis: a cell is not only a pitch, it is a pitch at a given strength." },
      { nom: "Écart des niveaux", nomEn: "Level step", type: "curseur", plage: [0, 24], pas: 1, defaut: 6, unite: "dB",
        doc: "De combien chaque degré d'intensité descend sous le précédent. À zéro, tous les niveaux sonnent pareil et l'axe des intensités disparaît ; à douze, les degrés faibles ne servent plus qu'à colorer le fond.",
        docEn: "By how much each intensity degree falls below the previous one. At zero, every level sounds the same and the intensity axis vanishes; at twelve, the weak degrees only colour the background." },
      { nom: "Fréquence min", nomEn: "Lowest frequency", type: "curseur", plage: [20, 2000], pas: 10, defaut: 100, unite: "Hz",
        doc: "Le bas du quadrillage.",
        docEn: "The bottom of the grid." },
      { nom: "Fréquence max", nomEn: "Highest frequency", type: "curseur", plage: [200, 16000], pas: 100, defaut: 6400, unite: "Hz",
        doc: "Le haut du quadrillage. Entre les deux bornes, les bandes se répartissent par intervalles égaux à l'oreille, et non en hertz.",
        docEn: "The top of the grid. Between the two bounds, the bands are spread by intervals that are equal to the ear, not in hertz." },
      { nom: "Densité", nomEn: "Density", type: "curseur", plage: [0.5, 200], pas: 0.5, defaut: 20, unite: "grains/s",
        doc: "Combien de grains par seconde chaque case allumée contient. C'est le troisième axe de Xenakis, et sa valeur n'est pas un compte mais une moyenne : une densité inférieure à un grain par écran se rend par un grain de temps en temps, tiré au sort, et c'est la moyenne qui tombe juste.",
        docEn: "How many grains per second each lit cell holds. It is Xenakis's third axis, and its value is not a count but an average: a density below one grain per screen is rendered by an occasional grain, drawn at random, and it is the average that lands right." },
      { nom: "Durée du grain", nomEn: "Grain duration", type: "curseur", plage: [5, 200], pas: 1, defaut: 30, unite: "ms",
        doc: "La durée d'un grain, fenêtre comprise. Sous une cinquantaine de millisecondes, un grain n'a plus de hauteur propre et le nuage s'entend comme une matière ; au-delà, on commence à distinguer les hauteurs des cases.",
        docEn: "A grain's duration, window included. Below some fifty milliseconds a grain has no pitch of its own and the cloud is heard as matter; beyond, the cells' pitches start to be told apart." },
      { nom: "Tenue", nomEn: "Hold", type: "curseur", plage: [0, 100], pas: 1, defaut: 85, unite: "%",
        doc: "La probabilité qu'une case allumée le reste à l'écran suivant. C'est la moitié de la chaîne de Markov, et le réglage qui décide entre la nappe et le bouillonnement.",
        docEn: "The probability that a lit cell stays lit on the next screen. It is half of the Markov chain, and the setting that decides between the pad and the boiling." },
      { nom: "Apparition", nomEn: "Appearance", type: "curseur", plage: [0, 100], pas: 1, defaut: 10, unite: "%",
        doc: "La probabilité qu'une case éteinte s'allume à l'écran suivant. Avec la tenue, elle fixe l'occupation d'équilibre du quadrillage : apparition divisée par la somme de l'apparition et de l'extinction.",
        docEn: "The probability that an unlit cell lights up on the next screen. Together with hold, it sets the grid's equilibrium occupancy: appearance divided by the sum of appearance and extinction." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Le niveau d'ensemble. Les grains s'additionnent : doubler la densité ou le nombre de cases allumées approche d'autant du plafond.",
        docEn: "The overall level. Grains add up: doubling the density or the number of lit cells moves that much closer to the ceiling." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Le tirage, de bout en bout : le livre d'écrans comme la place de chaque grain dans sa case. La même graine rejoue exactement la même pièce, ce qui est indispensable à une musique tirée au sort — sans quoi rien de ce qu'on aime ne se retrouve.",
        docEn: "The draw, from end to end: the book of screens as well as each grain's place inside its cell. The same seed replays exactly the same piece, which is indispensable to music drawn at random — without it nothing you liked can be found again." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const frequence = ctx.runtime?.sampleRate ?? 44100;
      const dureeSec = ctx.paramNombre("Durée", 8);
      const dureeEcranSec = ctx.paramNombre("Durée d'un écran", 100) / 1000;
      const frequenceMinHz = ctx.paramNombre("Fréquence min", 100);
      const frequenceMaxHz = Math.max(frequenceMinHz * 1.01, ctx.paramNombre("Fréquence max", 6400));
      // Un seul tirage pour tout : le livre d'abord, puis les grains. Deux générateurs séparés
      // donneraient deux graines à retenir pour une seule pièce.
      const aleatoire = hasardEcrans(ctx.paramNombre("Graine", 42));

      const livre = livreEcrans({
        bandes: ctx.paramNombre("Bandes", 8),
        niveaux: ctx.paramNombre("Niveaux", 3),
        dureeEcranSec,
        dureeSec,
        tenuePc: ctx.paramNombre("Tenue", 85),
        apparitionPc: ctx.paramNombre("Apparition", 10),
        aleatoire,
      });
      const grains = grainsDuLivre(livre, {
        frequenceMinHz,
        frequenceMaxHz,
        densite: ctx.paramNombre("Densité", 20),
        pasNiveauDb: ctx.paramNombre("Écart des niveaux", 6),
        dureeEcranSec,
        aleatoire,
      });

      const dureeGrainSec = ctx.paramNombre("Durée du grain", 30) / 1000;
      const longueur = Math.round((livre.length * dureeEcranSec + dureeGrainSec) * frequence);
      const canal = rendreGrains(grains, frequence, longueur, dureeGrainSec);
      const volume = Math.max(0, Math.min(100, ctx.paramNombre("Volume", 70))) / 100;
      // Le nuage est ramené sous l'unité avant d'appliquer le volume : la somme de milliers de
      // grains n'a aucune raison de tenir dans l'échelle, et écrêter en silence serait mentir.
      let crete = 0;
      for (const v of canal) crete = Math.max(crete, Math.abs(v));
      const gain = crete > 1e-9 ? (volume / crete) : 0;
      for (let i = 0; i < canal.length; i++) canal[i] *= gain;

      const sortie = new AudioBuffer({ numberOfChannels: 1, length: Math.max(1, canal.length), sampleRate: frequence });
      sortie.copyToChannel(new Float32Array(canal), 0);

      const r = rapportLivre(livre);
      return {
        valeurs: [sortie, texteLivre(livre, { frequenceMinHz, frequenceMaxHz }, en)],
        message: [
          `${r.ecrans} ${en ? "screens" : "écrans"} · ${r.cases} ${en ? "cells" : "cases"} · ${grains.length} ${en ? "grains" : "grains"}`,
          `${r.occupationPc.toFixed(0)} % ${en ? "lit" : "allumées"} · ${r.agitationPc.toFixed(0)} % ${en ? "changing" : "qui changent"}`,
        ].join("\n"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
