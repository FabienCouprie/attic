// plugins/parcours.ts — Le nœud « Parcours ». La matière est dans `src/parcours/`, éprouvée ; ici,
// la prise.
//
// DEUX FAÇONS DE S'EN SERVIR, COMME POUR LE QUIZ, ET LA PREMIÈRE EST LA PRINCIPALE.
//
//  1. DANS LE NŒUD, exercice par exercice : la vue affiche ce qu'il faut faire et regarde
//     l'atelier pendant qu'on le construit. La liste de contrôle se coche toute seule. C'est la
//     seule partie qui voit le graphe — un plugin, lui, ne reçoit que ses entrées et ses réglages.
//  2. EN LE LANÇANT, pour en sortir deux textes : la feuille de route, qui s'imprime et se
//     distribue, et le bulletin, qui dit où l'on en est. L'exécution mesure en plus le son branché
//     sur « Copie » et joint le verdict de l'épreuve du chapitre courant.
//
// POURQUOI UNE ENTRÉE AUDIO SUR UN NŒUD D'APPRENTISSAGE. Parce qu'une épreuve ne demande pas un
// geste mais un résultat : « amène-moi un son à −14 LUFS sans dépasser −1 dBTP ». Le chemin est
// libre, la mesure tranche, et c'est la seule chose du parcours qui prouve qu'on a compris plutôt
// que recopié.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { mesurerCopie } from "../parcours/mesures";
import { bulletin, epreuveCourante, feuilleDeRoute, nomChapitre, OPTIONS_CHAPITRE, reglagesDepuis } from "../parcours/seance";
import { jugerCibles } from "../parcours/mesures";
import { bilan, titreGagne } from "../parcours/voyage";
import { CHAPITRES, EXERCICES } from "../parcours/exercices";

export const fiches: FicheAudio[] = ([
  {
    id: "parcours", nom: "Parcours", nomEn: "Journey",
    univers: "Autres", famille: "Apprendre",
    resume: "Quarante-cinq exercices de prise en main qui se valident sur l'atelier que vous construisez, et dix épreuves mesurées sur le son que vous rendez.",
    resumeEn: "Forty-five hands-on exercises that validate against the workshop you build, and ten trials measured on the sound you hand in.",
    notice: "Un parcours en dix chapitres (le premier son, l'oreille, le niveau, la couleur, le temps, l'espace, la hauteur, la matière, la musique, l'œuvre) qui ne se valide jamais sur une déclaration. Chaque étape se lit sur quelque chose de réel.\n\nLes exercices se valident sur l'atelier. « Pose un générateur, relie-le à un visualiseur, lance » se contrôle sur les composants et les arêtes du graphe. La liste de contrôle se coche au fil du travail, et le point qui reste rouge dit précisément ce qui manque : le composant absent, le composant posé mais pas lancé, le réglage à côté, ou les deux composants présents et non reliés. Ce sont quatre échecs différents, et le verdict les distingue.\n\nLes épreuves se mesurent sur le son. Elles ferment chaque chapitre et ne disent rien du chemin : l'entrée « Son à mesurer » reçoit le résultat du travail, que le composant mesure sans le modifier. Sonie, vrai pic, crête, facteur de crête, corrélation entre canaux, équilibre gauche-droite, part d'énergie sous 200 Hz, hauteur et justesse en cents : les chiffres viennent des mêmes fonctions que les composants de mesure, si bien qu'une épreuve et une mesure ne peuvent pas se contredire.\n\nLe verdict porte toujours le chiffre mesuré, réussi ou raté. Savoir qu'on est à −24 LUFS quand on en demandait −14 est la seule chose qui permette de corriger ; « raté » n'enseigne rien.\n\nLes leçons disent pourquoi, jamais comment. Le comment est dans l'indice, qu'on ouvre si l'on veut. La leçon, elle, porte la raison (pourquoi le limiteur va après le compresseur, pourquoi un grave large s'annule en mono, pourquoi la sonie ne se gagne pas au gain) et c'est ce qui reste quand le geste est oublié, y compris devant un autre logiciel.\n\nRien n'est verrouillé. L'ordre est une proposition : le réglage « Au fil du parcours » mène toujours au premier exercice non accompli, et choisir un chapitre y va directement. Quelqu'un qui vient pour la spatialisation n'a pas à refaire douze exercices de branchement pour y accéder.\n\nLa progression se sauvegarde avec le projet, puisqu'elle vit dans un paramètre. On ferme l'application au milieu du troisième chapitre et on la rouvre là où on l'avait laissée. Le champ se lit en clair et se vide d'un bouton.\n\nDix titres se gagnent aux épreuves, et à elles seules, d'« Oreille neuve » à « Compagnon du son ».\n\nL'exécution du composant rend la feuille de route, c'est-à-dire les exercices et leurs consignes, qui s'impriment et se distribuent, et le bulletin, avec le compte par chapitre et le verdict de l'épreuve en cours. Les deux sont disponibles sur une sortie texte.",
    noticeEn: "A journey in ten chapters (the first sound, the ear, level, colour, time, space, pitch, matter, music, the finished work) which never validates on a declaration. Every step is read off something real.\n\nExercises validate against the workshop. « Place a generator, wire it to a viewer, run » is checked against the components and edges of the graph. The checklist ticks itself as the work goes, and the point left red says precisely what is missing: the absent node, the node placed but not run, the setting beside the mark, or two nodes present and unconnected. Those are four different failures, and the verdict tells them apart.\n\nTrials are measured on the sound. They close each chapter and say nothing about the route: the « Sound to measure » input receives the result of the work, which the component measures without altering it. Loudness, true peak, peak, crest factor, channel correlation, left-right balance, share of energy below 200 Hz, pitch and tuning in cents: the figures come from the same functions as the measuring components, so a trial and a measurement cannot contradict each other.\n\nThe verdict always carries the measured figure, passed or failed. Knowing the sound is at -24 LUFS when -14 was asked is what allows a correction.\n\nLessons say why, never how. The how is in the hint. The lesson carries the reason (why the limiter goes after the compressor, why a wide low end cancels in mono, why loudness is not won with gain) and that is what remains once the gesture is forgotten, including in front of another piece of software.\n\nNothing is locked. The order is a proposal: the « Along the journey » setting always leads to the first unfinished exercise, and choosing a chapter goes straight there. Reaching spatialization does not require redoing twelve wiring exercises.\n\nProgress is saved with the project, since it lives in a parameter. The application can be closed halfway through the third chapter and reopened where it stopped. The field reads plainly and clears with one button.\n\nTen titles are earned at the trials, and at the trials alone, from « New ear » to « Journeyman of sound ».\n\nRunning the component returns the roadmap, that is the exercises and their instructions, which can be printed and handed out, and the report card, with the per-chapter count and the verdict of the trial under way. Both are available on a text output.",
    entrees: [{ nom: "Son à mesurer", nomEn: "Sound to measure", type: "audio" }],
    sorties: [
      { nom: "Feuille de route", nomEn: "Roadmap", type: "texte" },
      { nom: "Bulletin", nomEn: "Report card", type: "texte" },
    ],
    parametres: [
      { nom: "Chapitre", nomEn: "Chapter", type: "choix",
        options: OPTIONS_CHAPITRE.map((o) => o.fr), optionsEn: OPTIONS_CHAPITRE.map((o) => o.en),
        optionIds: OPTIONS_CHAPITRE.map((o) => o.id), defaut: "Au fil du parcours", defautEn: "Along the journey",
        doc: "« Au fil du parcours » mène toujours au premier exercice non accompli, tous chapitres confondus : c'est le chemin pour qui découvre le logiciel. Choisir un chapitre y va directement, sans rien exiger des précédents ; on ne fait pas refaire douze exercices de branchement à quelqu'un venu pour l'espace.",
        docEn: "« Along the journey » always leads to the first unfinished exercise, across all chapters: that is the route for someone discovering the software. Choosing a chapter goes straight there, demanding nothing of the earlier ones, you do not make someone who came for space redo twelve wiring exercises." },
      { nom: "Accomplis", nomEn: "Completed", type: "texte", defaut: "",
        placeholder: "ex. poser-source,lancer-source", placeholderEn: "e.g. poser-source,lancer-source",
        doc: "Les étapes accomplies, séparées par des virgules. La vue y ajoute une ligne à chaque réussite, et c'est ce champ que lisent le bulletin et le compte des titres, les deux ne peuvent donc pas se contredire. Il se sauvegarde avec le projet : un parcours interrompu se reprend où il en était. Videz-le pour tout refaire.",
        docEn: "The steps completed, separated by commas. The view adds one on every success, and it is this field the report card and the title count read, so the two cannot contradict each other. It is saved with the project: an interrupted journey resumes where it stood. Empty it to start over." },
    ],
    // Ce que le nœud rend dépend d'un champ de progression que la vue modifie sans passer par le
    // moteur : sans cela, relancer après avoir réussi une étape rendrait le bulletin de la veille.
    jamaisCache: true,
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const reglages = reglagesDepuis((nom, defaut) => ctx.paramTexte(nom, defaut));
      const entree = ctx.entree(0);
      const mesure = entree instanceof AudioBuffer ? mesurerCopie(entree) : null;
      const epreuve = epreuveCourante(reglages);
      const verdicts = epreuve?.cibles ? jugerCibles(epreuve.cibles, mesure) : [];
      const b = bilan(EXERCICES, CHAPITRES, reglages.accomplis);
      const titre = titreGagne(b.epreuvesReussies, en);
      const tenues = verdicts.filter((v) => v.satisfait).length;

      const message = [
        `${nomChapitre(reglages.chapitre, en)} — ${b.accomplis}/${b.total} ${en ? "steps" : "étapes"}`,
        `${en ? "Trials" : "Épreuves"} : ${b.epreuvesReussies}/${b.epreuvesTotal}${titre ? ` · ${titre}` : ""}`,
        epreuve && verdicts.length > 0
          ? `${en ? epreuve.titreEn : epreuve.titre} : ${tenues}/${verdicts.length} ${en ? "requirements met" : "exigences tenues"}`
          : (en ? "Wire a sound into « Copy » to attempt the trial." : "Branchez un son sur « Copie » pour tenter l'épreuve."),
      ].join("\n");

      return {
        valeurs: [feuilleDeRoute(reglages, en), bulletin(reglages, en, verdicts)],
        message,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
