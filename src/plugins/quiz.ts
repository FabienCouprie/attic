// plugins/quiz.ts — Le nœud « Quiz ». La logique est dans `src/quiz/`, testée ; ici, la prise.
//
// DEUX FAÇONS DE S'EN SERVIR, ET C'EST VOULU.
//
//  1. DANS LE NŒUD, question par question : sa vue pose une question, on clique une proposition,
//     elle dit juste ou faux et POURQUOI, et passe à la suivante. Rien à lancer — la vue tire la
//     série elle-même, à partir des mêmes réglages et de la même fonction que l'exécution.
//  2. EN LE LANÇANT, pour en sortir deux textes : le questionnaire sans les réponses, et le
//     corrigé avec l'explication de chacune. Branchés sur une « Sortie texte », ils s'exportent,
//     s'impriment, ou se donnent à quelqu'un d'autre. La graine suffit à refaire le même.
//
// POURQUOI LES RÉPONSES SONT UN PARAMÈTRE, et non un état de la vue. Parce qu'un paramètre se
// sauvegarde avec le projet : on ferme l'application au milieu d'un tour de cinquante questions et
// on le reprend où on l'avait laissé. C'est aussi ce qui permet au corrigé de compter les points
// sans que la vue ait à lui transmettre quoi que ce soit — les deux lisent le même champ.

import type { Registre, TypeValeur } from "../core";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { questionsCatalogue, type FicheQuiz } from "../quiz/catalogue";
import { corrige, feuille, lireReponses, corriger } from "../quiz/tour";
import { LONGUEUR_DEFAUT, LONGUEUR_MAX, LONGUEUR_MIN, GRAINE_DEFAUT, OPTIONS_NIVEAU, OPTIONS_THEME, reglagesDepuis, seance } from "../quiz/seance";
import type { Question } from "../quiz/types";

// Injection, comme pour « Gestionnaire de nodes » : le thème « Catalogue » est calculé sur le
// registre vivant, et un plugin ne peut pas importer l'adaptateur qui l'enregistre — ce serait un
// cycle. L'adaptateur appelle donc ceci au démarrage.
let registre: Registre<TypeValeur, AudioContext> | null = null;
export function configurerRegistreQuiz(r: Registre<TypeValeur, AudioContext>): void { registre = r; }

/** Les questions du catalogue, ou aucune si le registre n'est pas là (tests, contextes isolés). */
export function questionsDuCatalogue(): Question[] {
  if (!registre) return [];
  // `tousLesPlugins` rend le CATALOGUE : ce qui est inscrit sans y appartenir, comme la fiche dérivée
  // d'une bulle, n'y figure pas. Rien à filtrer ici.
  return questionsCatalogue(registre.tousLesPlugins() as unknown as FicheQuiz[]);
}

export const fiches: FicheAudio[] = ([
  {
    id: "quiz", nom: "Quiz", nomEn: "Quiz",
    univers: "Autres", famille: "Apprendre",
    resume: "Interroge sur les sigles, notions, formules, chiffres et sources, dans un ordre tiré au sort et sans répétition.",
    resumeEn: "Quizzes acronyms, concepts, formulas, figures and sources, in a random order and without repetition.",
    notice: "Six thèmes, et l'un d'eux n'est pas écrit à la main. Les sigles, les notions, les formules, les chiffres et les sources forment une banque rédigée, où chaque question porte son explication. Le sixième, « Catalogue », est calculé sur le registre des composants au moment où l'on joue : il en tire plusieurs centaines de questions (reconnaître un composant à son résumé, le situer dans son univers et sa famille) qui ne peuvent donc ni mentir ni vieillir, puisqu'elles lisent les mêmes fiches que l'application exécute.\n\nLa série est une permutation, non une suite de tirages. C'est ce qui règle la lassitude par la racine : on ne revoit pas une question avant d'avoir vu toutes les autres. Tirer chaque question indépendamment aurait donné des doublons très vite, sur cent questions, la probabilité d'en revoir une déjà vue dépasse un sur deux dès la douzième.\n\nLes thèmes alternent, et c'est la seconde moitié du remède. Une permutation d'une banque où un thème pèse les deux tiers donne des séries qui parlent six fois de suite du même sujet : techniquement sans répétition, et lassantes quand même. Le tirage prend donc à tour de rôle dans chaque thème présent, l'ordre des thèmes étant lui-même retiré à chaque tour. Vingt questions sur six thèmes en donnent trois ou quatre de chacun, quelles que soient les tailles des banques.\n\nL'ordre des propositions est tiré au sort aussi. La banque écrit toujours la bonne réponse en premier, une convention qui supprime une classe entière de fautes de rédaction, puisqu'on ne peut plus se tromper de rang en relisant, si bien que sans ce second tirage la réponse serait toujours en A.\n\nDeux formes. Dans le composant, une question à la fois : un clic donne le verdict et son explication. En le lançant, il rend deux textes, le questionnaire seul, et le corrigé avec les explications et le score. Elles sont disponibles sur une sortie texte.\n\nLa graine est le questionnaire. La même graine redonne exactement la même série, propositions comprises : c'est ce qui permet de refaire le même test, de le donner à quelqu'un, ou de reprendre un tour interrompu. Changer la graine change l'ordre sans toucher au contenu.\n\nLes réponses sont un paramètre plutôt qu'un état de la vue : elles se sauvegardent donc avec le projet. On peut fermer l'application au milieu d'un tour de cinquante questions et le reprendre où on l'avait laissé. Le champ se lit tout seul (une lettre par question, un point pour une question sautée) et s'efface d'un bouton.",
    noticeEn: "Six themes, and one of them is not written by hand. Acronyms, concepts, formulas, figures and sources form a written bank, where each question carries its explanation. The sixth, « Catalog », is computed on the node registry as you play: it draws several hundred questions from it (recognising a node from its summary, placing it in its universe and family) which therefore can neither lie nor age, since they read the same cards the application runs.\n\nThe series is a permutation, not a run of draws. That settles boredom at the root: you do not see a question again before having seen all the others. Drawing each question independently would have given duplicates very soon, over a hundred questions, the chance of seeing one already seen passes one in two by the twelfth.\n\nThemes alternate, and that is the second half of the remedy. A permutation of a bank where one theme weighs two thirds gives series that speak of the same subject six times in a row: technically without repetition, and tiresome all the same. The draw therefore takes turns in each theme present, the order of the themes being itself redrawn each round. Twenty questions over six themes give three or four of each, whatever the bank sizes.\n\nThe order of the options is drawn too. The bank always writes the correct answer first (a convention that removes a whole class of authoring faults, since one can no longer be off by one while proofreading) so without that second draw the answer would always be A.\n\nTwo ways to use it. In the node, one question at a time: you click, it says right or wrong and why. By running it, it returns two texts, the questionnaire alone, and the answer key with the explanations and the score. Connect them to a « Text Output » to keep them.\n\nThe seed is the questionnaire. The same seed gives exactly the same series back, options included: that is what allows retaking the same test, giving it to someone, or resuming an interrupted round. Changing the seed changes the order without touching the content.\n\nThe answers are a parameter rather than a state of the view, and that choice has a pleasant consequence: they are saved with the project. A round of fifty questions survives closing the application, and resumes where it stopped. The field reads plainly (one letter per question, a dot for a skipped one) and clears with one button.",
    entrees: [],
    sorties: [
      { nom: "Questionnaire", nomEn: "Questionnaire", type: "texte" },
      { nom: "Corrigé", nomEn: "Answer key", type: "texte" },
    ],
    parametres: [
      { nom: "Thème", nomEn: "Theme", type: "choix",
        options: OPTIONS_THEME.map((o) => o.fr), optionsEn: OPTIONS_THEME.map((o) => o.en),
        optionIds: OPTIONS_THEME.map((o) => o.id), defaut: "Tout", defautEn: "All",
        doc: "« Tout » alterne les six thèmes, ce qui est le réglage pour lequel le tirage a été conçu. Un thème seul sert à réviser un point : les sigles avant un entretien, les formules avant d'écrire un traitement. « Catalogue » est le seul thème calculé ; il interroge sur les composants installés, et grossit tout seul à chaque composant ajouté.",
        docEn: "« All » alternates the six themes, which is the setting the draw was designed for. A single theme serves to revise one point: acronyms before an interview, formulas before writing a process. « Catalog » is the only computed theme; it quizzes on the installed nodes, and grows by itself with every node added." },
      { nom: "Niveau", nomEn: "Level", type: "choix",
        options: OPTIONS_NIVEAU.map((o) => o.fr), optionsEn: OPTIONS_NIVEAU.map((o) => o.en),
        optionIds: OPTIONS_NIVEAU.map((o) => o.id), defaut: "Tous", defautEn: "All",
        doc: "« Initié » retient ce qu'on croise en ouvrant le logiciel, « Avancé » ce qu'il faut être allé chercher, la fonction d'étalement du masquage, la tierce neutre d'un maqam, le théorème de Tymoczko. Si un thème n'a rien au niveau demandé, la banque entière est rendue plutôt qu'un quiz vide.",
        docEn: "« Beginner » keeps what you meet on opening the software, « Advanced » what you have had to go and look for, the masking spreading function, a maqam's neutral third, Tymoczko's theorem. If a theme has nothing at the requested level, the whole bank is returned rather than an empty quiz." },
      { nom: "Questions", nomEn: "Questions", type: "curseur",
        plage: [LONGUEUR_MIN, LONGUEUR_MAX], pas: 5, defaut: LONGUEUR_DEFAUT,
        doc: "La longueur de la série. Au-delà de la taille du vivier, un second tour commence dans un ordre différent ; on ne revoit donc une question qu'après avoir vu toutes les autres.",
        docEn: "The length of the series. Beyond the pool's size a second round starts in a different order, so a question only comes back after all the others have been seen." },
      { nom: "Graine", nomEn: "Seed", type: "curseur",
        plage: [1, 999999], pas: 1, defaut: GRAINE_DEFAUT,
        doc: "La graine est le questionnaire : la même redonne la même série, propositions comprises. Changez-la pour un autre tirage, le bouton « Nouveau tour » de la vue le fait et efface les réponses du même geste.",
        docEn: "The seed is the questionnaire: the same one gives the same series back, options included. Change it for another draw, the view's « New round » button does it and clears the answers in the same gesture." },
      { nom: "Réponses", nomEn: "Answers", type: "texte", defaut: "",
        placeholder: "ex. BACD", placeholderEn: "e.g. BACD",
        doc: "Une lettre par question, dans l'ordre de la série ; un point pour une question sautée. La vue le remplit à chaque clic, et c'est ce champ que le corrigé lit, les deux ne peuvent donc pas se contredire. Videz-le pour reprendre la même série à zéro.",
        docEn: "One letter per question, in the order of the series; a dot for a skipped question. The view fills it on every click, and it is this field the answer key reads, so the two cannot contradict each other. Empty it to retake the same series from the start." },
    ],
    // Le catalogue interrogé dépend du registre, que ni les paramètres ni les entrées ne capturent.
    jamaisCache: true,
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const reglages = reglagesDepuis((nom, defaut) =>
        typeof defaut === "number" ? ctx.paramNombre(nom, defaut) : ctx.paramTexte(nom, defaut));
      const s = seance(reglages, questionsDuCatalogue());
      const reponses = lireReponses(ctx.paramTexte("Réponses", ""));
      const bilan = corriger(s, reponses);
      const pourcent = bilan.repondues > 0 ? Math.round((bilan.justes / bilan.repondues) * 100) : 0;
      return {
        valeurs: [feuille(s, en, reglages.graine), corrige(s, reponses, en)],
        message: traduire("msg.quiz.resume", s.length, reglages.graine, bilan.repondues, bilan.justes, pourcent),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
