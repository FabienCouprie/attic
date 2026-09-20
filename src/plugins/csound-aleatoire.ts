// plugins/csound-aleatoire.ts — Une partition tirée au sort, à la façon dont ce langage est né.
//
// La logique est dans `audio/csound-aleatoire.ts`, testée par ses STATISTIQUES : un tirage ne se
// compare pas à un résultat attendu, il se vérifie par ses lois — écart-type des intervalles égal à
// leur moyenne pour un processus de Poisson, nul pour une grille.
//
// L'ÉCRITURE DE LA PARTITION EST CELLE DU TRADUCTEUR. Ce nœud ne réécrit pas les lignes `i` : il
// engendre des événements et les confie à `construirePartition`, qui sait déjà les quatre conventions
// de hauteur et les p-fields. Un seul chemin pour écrire une partition, donc un seul à corriger.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import { GAMMES_MELODIE_EN, GAMMES_MELODIE_FR, GAMMES_MELODIE_IDS, degresGammeMelodie } from "../audio/generation";
import { estCourbe, type Courbe } from "../audio/courbe";
import { construirePartition, type ChampP, type Convention } from "../audio/csound-partition";
import { composerAleatoire, statsLisibles, type Loi, type Repartition } from "../audio/csound-aleatoire";

export const fiches: FicheAudio[] = ([
  {
    id: "partition-aleatoire-csound", nom: "Partition aléatoire Csound", nomEn: "Random Csound Score",
    // Avec les autres nœuds Csound, et non dans « Génération » : ce qu'il produit n'est pas de
    // l'audio mais une partition, qui ne se branche que sur un nœud Csound. Le chercher là où il
    // sert est plus utile que le ranger par ce qu'il fait.
    univers: "Autres", famille: "Csound wrapper",
    resume: "Tire une partition Csound au sort : instants en processus de Poisson, hauteurs et durées dans des lois, et les statistiques de ce qui a été produit.",
    resumeEn: "Draws a Csound score at random: onsets as a Poisson process, pitches and durations from distributions, and the statistics of what came out.",
    entrees: [{ nom: "Courbe", nomEn: "Curve", type: "courbe", requis: false }],
    sorties: [
      { nom: "Partition", nomEn: "Score", type: "texte" },
      { nom: "Statistiques", nomEn: "Statistics", type: "texte" },
    ],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.5, 300], pas: 0.5, defaut: 8, unite: "s",
        doc: "Durée de la partition engendrée.", docEn: "Length of the generated score." },
      { nom: "Densité", nomEn: "Density", type: "nombre", plage: [0.2, 50], pas: 0.1, defaut: 4, unite: "/s",
        doc: "Événements par seconde, en moyenne. Un tirage ne donne pas le nombre demandé : huit secondes à quatre par seconde ne font pas trente-deux événements mais un nombre qui varie d'un tirage à l'autre, et c'est le propre du hasard. La sortie Statistiques annonce le nombre réel.",
        docEn: "Events per second, on average. A draw does not yield the requested count: eight seconds at four per second do not make thirty-two events but a number that varies from draw to draw, which is what randomness means. The Statistics output reports the real count." },
      { nom: "Répartition", nomEn: "Distribution", type: "choix",
        options: ["Poisson (nuage)", "Grille régulière"], optionsEn: ["Poisson (cloud)", "Regular grid"],
        optionIds: ["poisson", "grille"], defaut: "Poisson (nuage)", defautEn: "Poisson (cloud)",
        doc: "Comment les instants d'attaque se répartissent. Poisson : ils arrivent au hasard, sans mémoire, à la densité demandée — l'intervalle entre deux voisins suit alors une loi exponentielle, et c'est ce que Xenakis employait pour ses pièces stochastiques (la série ST, 1962). Sa signature se mesure : l'écart-type des intervalles égale leur moyenne, et la sortie Statistiques le vérifie. Grille : un événement tous les 1/densité, écart-type nul. C'est la différence entre un nuage et une pulsation.",
        docEn: "How the onsets are spread. Poisson: they arrive at random, without memory, at the requested density — the interval between neighbours then follows an exponential law, which is what Xenakis used for his stochastic pieces (the ST series, 1962). Its signature is measurable: the standard deviation of the intervals equals their mean, and the Statistics output checks it. Grid: one event every 1/density, zero standard deviation. That is the difference between a cloud and a pulse." },
      { nom: "Instruments", nomEn: "Instruments", type: "nombre", plage: [1, 8], pas: 1, defaut: 1,
        doc: "Sur combien d'instruments répartir les événements — `i1` à `iN`, tirés au sort. À accorder avec « Orchestre Csound », qui numérote les siens dans l'ordre des cases cochées.",
        docEn: "How many instruments to spread the events over — `i1` to `iN`, drawn at random. To be matched with « Csound Orchestra », which numbers its own in the order of the ticked boxes." },
      { nom: "Note basse", nomEn: "Lowest note", type: "curseur", plage: [12, 120], pas: 1, defaut: 48,
        doc: "Note la plus grave que le tirage puisse produire. 48 = do2.",
        docEn: "Lowest note the draw can produce. 48 = C2." },
      { nom: "Note haute", nomEn: "Highest note", type: "curseur", plage: [12, 120], pas: 1, defaut: 84,
        doc: "Note la plus aiguë. 84 = do6.", docEn: "Highest note. 84 = C6." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS,
        defaut: "Chromatique", defautEn: "Chromatic",
        doc: "Les notes autorisées. Chaque hauteur tirée est ramenée à la plus proche qui appartient à la gamme. Un tirage sans contrainte ne donne pas de la musique : c'est d'ailleurs ce que Xenakis bornait le plus, ses lois étant tenues par des registres et des densités choisis.",
        docEn: "The allowed notes. Each drawn pitch is moved to the nearest one belonging to the scale. An unconstrained draw does not make music: this is precisely what Xenakis constrained most, his distributions being held by chosen registers and densities." },
      { nom: "Distribution des hauteurs", nomEn: "Pitch distribution", type: "choix",
        options: ["Uniforme", "Gaussienne"], optionsEn: ["Uniform", "Gaussian"],
        optionIds: ["uniforme", "gaussienne"], defaut: "Uniforme", defautEn: "Uniform",
        doc: "Uniforme : toutes les notes de l'étendue sont également probables. Gaussienne : les notes se serrent autour du centre de l'étendue, avec un écart-type du quart de celle-ci — deux tiers des notes tombent dans la moitié centrale, et les bords restent atteignables. Les valeurs hors bornes sont repliées et non écrêtées, faute de quoi elles s'entasseraient sur les deux notes extrêmes.",
        docEn: "Uniform: every note of the range is equally likely. Gaussian: notes cluster around the centre of the range, with a standard deviation of a quarter of it — two thirds fall in the central half, and the edges stay reachable. Out-of-range values are folded back rather than clipped, which would otherwise pile them onto the two extreme notes." },
      { nom: "Durée min", nomEn: "Shortest", type: "nombre", plage: [0.01, 20], pas: 0.01, defaut: 0.2, unite: "s",
        doc: "Durée la plus courte qu'un événement puisse prendre.", docEn: "Shortest duration an event can take." },
      { nom: "Durée max", nomEn: "Longest", type: "nombre", plage: [0.01, 20], pas: 0.01, defaut: 1, unite: "s",
        doc: "Durée la plus longue. Plus longue que l'intervalle moyen, les événements se superposent — c'est ainsi qu'on obtient une masse plutôt qu'une succession.",
        docEn: "Longest duration. Longer than the mean interval, events overlap — which is how a mass is obtained rather than a succession." },
      { nom: "Vélocité min", nomEn: "Lowest velocity", type: "curseur", plage: [1, 127], pas: 1, defaut: 60,
        doc: "Vélocité la plus faible. Elle devient l'amplitude, divisée par 127.",
        docEn: "Lowest velocity. It becomes the amplitude, divided by 127." },
      { nom: "Vélocité max", nomEn: "Highest velocity", type: "curseur", plage: [1, 127], pas: 1, defaut: 110,
        doc: "Vélocité la plus forte.", docEn: "Highest velocity." },
      { nom: "Hauteur", nomEn: "Pitch as", type: "choix",
        options: ["cps (hertz)", "pch (8.09)", "oct (8.75)", "midi (69)"],
        optionsEn: ["cps (hertz)", "pch (8.09)", "oct (8.75)", "midi (69)"],
        optionIds: ["cps", "pch", "oct", "midi"], defaut: "cps (hertz)", defautEn: "cps (hertz)",
        doc: "La convention dans laquelle la hauteur est écrite en p4, comme dans « Partition Csound » — un orchestre écrit pour l'une ne fonctionne pas avec une autre, et nourrir en hertz un orchestre qui attend du pch ne produit ni son ni erreur.",
        docEn: "The convention the pitch is written in, in p4, as in « Csound Score » — an orchestra written for one does not work with another, and feeding hertz to an orchestra expecting pch produces neither sound nor error." },
      { nom: "Champ libre", nomEn: "Free field", type: "choix",
        options: ["Aucun", "Uniforme", "Gaussienne"], optionsEn: ["None", "Uniform", "Gaussian"],
        optionIds: ["aucun", "uniforme", "gaussienne"], defaut: "Aucun", defautEn: "None",
        doc: "Un p-field de plus, tiré au sort pour chaque événement et écrit en p6. C'est ce qu'une partition a de plus qu'un MIDI : l'orchestre peut y lire ce qu'il veut — une position stéréo, un indice de modulation, une largeur de bande —, et chaque note en reçoit une valeur différente. Aucun MIDI ne sait transporter cela.",
        docEn: "One more p-field, drawn at random for each event and written as p6. This is what a score has that MIDI does not: the orchestra can read whatever it likes there — a stereo position, a modulation index, a bandwidth — and each note gets its own value. No MIDI file can carry that." },
      { nom: "Libre min", nomEn: "Free min", type: "nombre", plage: [-10000, 10000], pas: 0.01, defaut: 0,
        doc: "Borne basse du champ libre.", docEn: "Lower bound of the free field." },
      { nom: "Libre max", nomEn: "Free max", type: "nombre", plage: [-10000, 10000], pas: 0.01, defaut: 1,
        doc: "Borne haute du champ libre.", docEn: "Upper bound of the free field." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du tirage. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur redonne exactement la même partition — ce qui permet de garder un tirage qu'on aime.",
        docEn: "Seed of the draw. 0 = drawn at random on each run, and shown in the message so it can be copied back here. Any other value gives exactly the same score again — which is how a draw you like is kept." },
    ],
    async executer(ctx: any) {
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const courbeEntrante = ctx.entree(0);
      const courbe: Courbe | null = estCourbe(courbeEntrante) ? courbeEntrante : null;
      const repartition = ctx.paramTexte("Répartition", "poisson") as Repartition;
      const loiLibre = ctx.paramTexte("Champ libre", "aucun");
      const avecLibre = loiLibre !== "aucun";

      const { evenements, stats } = composerAleatoire({
        duree: ctx.paramNombre("Durée", 8),
        densite: ctx.paramNombre("Densité", 4),
        repartition,
        instruments: Math.round(ctx.paramNombre("Instruments", 1)),
        noteBasse: Math.round(ctx.paramNombre("Note basse", 48)),
        noteHaute: Math.round(ctx.paramNombre("Note haute", 84)),
        degres: degresGammeMelodie(ctx.paramTexte("Gamme", "chromatique")),
        loiHauteur: ctx.paramTexte("Distribution des hauteurs", "uniforme") as Loi,
        dureeMin: ctx.paramNombre("Durée min", 0.2),
        dureeMax: ctx.paramNombre("Durée max", 1),
        velociteMin: Math.round(ctx.paramNombre("Vélocité min", 60)),
        velociteMax: Math.round(ctx.paramNombre("Vélocité max", 110)),
        ...(avecLibre ? {
          libreMin: ctx.paramNombre("Libre min", 0),
          libreMax: ctx.paramNombre("Libre max", 1),
          loiLibre: loiLibre as Loi,
        } : {}),
        courbeDensite: courbe,
        hasard: aleatoire,
      });

      if (evenements.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.csound.tirageVide") };
      }
      // L'écriture passe par le traducteur : une seule façon d'écrire une partition dans Attic.
      const champs: ChampP[] = avecLibre
        ? ["hauteur", "amplitude", "libre"]
        : ["hauteur", "amplitude", "note"];
      const { texte } = construirePartition(evenements, {
        convention: ctx.paramTexte("Hauteur", "cps") as Convention,
        instrument: 1,
        parCanal: true,
        champs,
        margeFinale: Math.max(0.5, ctx.paramNombre("Durée max", 1)),
      });

      const en = langueCourante() === "en";
      const signature = stats.intervalleMoyen > 0 ? stats.intervalleEcartType / stats.intervalleMoyen : 0;
      return {
        valeurs: [texte, statsLisibles(stats, repartition, en)],
        message: traduire("msg.csound.tirageFait",
          String(stats.evenements), stats.densiteReelle.toFixed(2),
          signature.toFixed(2), String(graine)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
