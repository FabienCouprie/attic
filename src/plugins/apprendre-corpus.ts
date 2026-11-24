// plugins/apprendre-corpus.ts — Apprendre un modèle harmonique sur un corpus de chorals à quatre voix.
//
// LE CALCUL EST DANS `audio/champ-apprentissage.ts`, et il tourne hors du fil par
// `workers/apprendre-corpus-worker.ts` : sur les 361 chorals livrés, une passe parcourt quelque
// quatre-vingt mille notes. Ce fichier lit les réglages et compose le rapport.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import { estCorpus } from "../audio/corpus";
import { MODES_CHORAL } from "../audio/choral-regles";
import { apprendreSurCorpus, type DemandeApprentissage, type ResultatApprentissage } from "../audio/champ-apprentissage";
import { parUneFois } from "./hors-lot";

const en = () => langueCourante() === "en";
const pourcent = (x: number) => `${(100 * x).toFixed(1)} %`;

export const fiches: FicheAudio[] = ([
  fiche({
    id: "apprendre-corpus",
    nom: "Apprendre sur un corpus", nomEn: "Learn from a Corpus",
    univers: "Autres", famille: "Harmonisation",
    resume: "Apprend sur un corpus de chorals à quatre voix un modèle qui note chaque colonne et chaque passage.",
    resumeEn: "Learns from a corpus of four-part chorales a model that scores every column and every passage.",
    notice: "Ce composant apprend sur un corpus de chorals à quatre voix un modèle harmonique : une note pour chaque hauteur de chaque voix, et une note pour chaque paire de hauteurs que deux voix tiennent ensemble, ou l'une après l'autre. C'est le champ à paires de Gaëtan Hadjeres, Jason Sakellariou et François Pachet, « Style Imitation and Chord Invention in Polyphonic Music with Exponential Families », 2016.\n\nLe corpus arrive par l'entrée « Corpus ». Un corpus encore en fabrication, que « Fabriquer un corpus (fin) » rend avant sa dernière passe, n'est pas appris : le composant attend la dernière pièce, et le message le dit. Seules les pièces à quatre voix dont la tonalité est du mode réglé par « Gamme » sont apprises, et un mode ne s'apprend que sur ses pièces : un mode peu écrit donne un modèle appris sur peu de colonnes, que le message compte. Chaque pièce est transposée sur la finale de son mode prise aux touches blanches, do majeur, la mineur, ré dorien, mi phrygien ou sol mixolydien, du plus petit écart. Elles sont lues sur une grille : une colonne par pas, où chaque voix tient la note qui sonne à cet instant. Une colonne où une voix se tait, ou sort de l'étendue de Johann Sebastian Bach dans ses chorals élargie d'une tierce mineure, n'est pas apprise.\n\n« Pas » règle la grille : une colonne par noire, ou par croche.\n\n« Verticaux », « Horizontaux » et « Diagonaux » disent quelles paires sont apprises : deux voix d'une même colonne, une voix et elle-même d'une colonne à la suivante, une voix et une autre d'une colonne à la suivante. Décochées, ces paires ne comptent pas.\n\nL'apprentissage monte la pseudo-vraisemblance de Julian Besag (1975) : chaque note du corpus est prédite par ses voisines de colonne et ses voisines dans le temps, et le modèle est réglé pour que ces prédictions soient les plus probables. La montée suit la méthode de descente proximale accélérée d'Amir Beck et Marc Teboulle (2009).\n\n« Pénalité L1 » tire vers zéro chaque note de paire à chaque passe : plus elle est forte, plus le modèle garde peu de paires. Les notes de hauteur seule ne sont pas pénalisées.\n\n« Passes » fixe le nombre de passes de l'apprentissage.\n\n« Part de validation » met de côté cette part des pièces, qui ne sont pas apprises et servent à mesurer le modèle sur des chorals qu'il n'a pas vus. « Graine » tire les pièces mises de côté ; à une part nulle, elle est sans effet.\n\nLa sortie « Modèle » rend le modèle, avec sa grille, son mode et une empreinte du corpus. La sortie « Rapport » donne les pièces apprises et mises de côté, chaque pièce écartée avec sa raison, le nombre de colonnes perdues, le nombre de paramètres non nuls, et pour l'apprentissage et la validation la vraisemblance moyenne de chaque note et la part des notes que le modèle place en tête.",
    noticeEn: "This component learns from a corpus of four-part chorales a harmonic model: a score for every pitch of every voice, and a score for every pair of pitches that two voices hold together, or one after the other. It is the pairwise field of Gaëtan Hadjeres, Jason Sakellariou and François Pachet, « Style Imitation and Chord Invention in Polyphonic Music with Exponential Families », 2016.\n\nThe corpus arrives on the « Corpus » input. A corpus still being made, which « Make a Corpus (End) » returns before its last pass, is not learned: the component waits for the last piece, and the message says so. Only the pieces in four voices whose key is of the mode set by « Scale » are learned, and a mode is learned on its own pieces only: a mode seldom written gives a model learned on few columns, which the message counts. Every piece is transposed to the final of its mode taken on the white keys, C major, A minor, D Dorian, E Phrygian or G Mixolydian, by the smallest interval. They are read on a grid: one column per step, where every voice holds the note sounding at that instant. A column where a voice is silent, or leaves the range of Johann Sebastian Bach in his chorales widened by a minor third, is not learned.\n\n« Step » sets the grid: one column per quarter note, or per eighth note.\n\n« Vertical », « Horizontal » and « Diagonal » say which pairs are learned: two voices of one column, one voice and itself from one column to the next, one voice and another from one column to the next. Unchecked, those pairs do not count.\n\nThe learning raises the pseudo-likelihood of Julian Besag (1975): every note of the corpus is predicted by its column neighbours and its neighbours in time, and the model is set so that these predictions are the most probable. The climb follows the accelerated proximal gradient method of Amir Beck and Marc Teboulle (2009).\n\n« L1 penalty » pulls every pair score towards zero at every pass: the stronger it is, the fewer pairs the model keeps. The scores of single pitches are not penalised.\n\n« Passes » sets the number of passes of the learning.\n\n« Validation share » sets this share of the pieces aside, which are not learned and serve to measure the model on chorales it has not seen. « Seed » draws the pieces set aside; at a share of zero, it has no effect.\n\nThe « Model » output returns the model, with its grid, its mode and a fingerprint of the corpus. The « Report » output gives the pieces learned and set aside, every piece left out with its reason, the number of lost columns, the number of non-zero parameters, and for learning and validation the mean likelihood of every note and the share of notes the model ranks first.",
    entrees: [{ nom: "Corpus", nomEn: "Corpus", type: "corpus", requis: true }],
    sorties: [
      { nom: "Modèle", nomEn: "Model", type: "modele-harmonique" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: [...MODES_CHORAL], optionsEn: ["major", "minor", "Dorian", "Phrygian", "Mixolydian"], optionIds: [...MODES_CHORAL],
        defaut: "majeur", defautEn: "major",
        doc: "Le mode appris : seules les pièces de ce mode sont lues, transposées sur do majeur, la mineur, ré dorien, mi phrygien ou sol mixolydien.",
        docEn: "The mode learned: only the pieces of this mode are read, transposed to C major, A minor, D Dorian, E Phrygian or G Mixolydian." },
      { nom: "Pas", nomEn: "Step", type: "choix",
        options: ["noire", "croche"], optionsEn: ["quarter note", "eighth note"], optionIds: ["noire", "croche"],
        defaut: "noire", defautEn: "quarter note",
        doc: "Une colonne par noire, ou par croche.",
        docEn: "One column per quarter note, or per eighth note." },
      { nom: "Verticaux", nomEn: "Vertical", type: "case", plage: [0, 1], pas: 1, defaut: 1,
        doc: "Apprend les paires de deux voix d'une même colonne.",
        docEn: "Learns the pairs of two voices of one column." },
      { nom: "Horizontaux", nomEn: "Horizontal", type: "case", plage: [0, 1], pas: 1, defaut: 1,
        doc: "Apprend les paires d'une voix et d'elle-même, d'une colonne à la suivante.",
        docEn: "Learns the pairs of one voice and itself, from one column to the next." },
      { nom: "Diagonaux", nomEn: "Diagonal", type: "case", plage: [0, 1], pas: 1, defaut: 1,
        doc: "Apprend les paires d'une voix et d'une autre, d'une colonne à la suivante.",
        docEn: "Learns the pairs of one voice and another, from one column to the next." },
      { nom: "Pénalité L1", nomEn: "L1 penalty", type: "curseur", plage: [0, 0.01], pas: 0.0001, defaut: 0.0005,
        doc: "Tire vers zéro les notes de paire à chaque passe : plus elle est forte, plus le modèle garde peu de paires.",
        docEn: "Pulls the pair scores towards zero at every pass: the stronger it is, the fewer pairs the model keeps." },
      { nom: "Passes", nomEn: "Passes", type: "nombre", plage: [1, 2000], pas: 1, defaut: 100,
        doc: "Le nombre de passes de l'apprentissage.",
        docEn: "The number of passes of the learning." },
      { nom: "Part de validation", nomEn: "Validation share", type: "curseur", plage: [0, 50], pas: 1, defaut: 10, unite: "%",
        doc: "La part des pièces mises de côté pour mesurer le modèle sur des chorals qu'il n'a pas vus.",
        docEn: "The share of pieces set aside to measure the model on chorales it has not seen." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Tire les pièces mises de côté. À une « Part de validation » nulle, elle est sans effet.",
        docEn: "Draws the pieces set aside. At a « Validation share » of zero, it has no effect." },
    ],
    async executer(ctx) {
      const corpus = ctx.entree(0);
      if (!estCorpus(corpus) || corpus.pieces.length === 0) {
        return { valeurs: [null, null], erreur: true, message: en() ? "No corpus on the Corpus input." : "Aucun corpus sur l'entrée Corpus." };
      }
      // UN CORPUS EN COURS DE FABRICATION S'ATTEND : la boucle qui le fabrique rejoue ce composant à
      // chaque passe, et seule la dernière lui donne toutes les pièces.
      if (corpus.enCours) {
        const k = `${corpus.enCours.piece}/${corpus.enCours.pieces}`;
        return { valeurs: [null, null], message: en() ? `corpus being made, piece ${k}: learning waits for the last one` : `corpus en fabrication, pièce ${k} : l'apprentissage attend la dernière` };
      }
      const part = Math.max(0, Math.min(50, ctx.paramNombre("Part de validation", 10))) / 100;
      // LA GRAINE NE SE LIT QUE SI ELLE TIRE QUELQUE CHOSE : lue à une part nulle, une graine nulle
      // serait tirée au sort et rendue au message, sous un modèle qu'elle ne change pas.
      const graine = part > 0 ? hasardDuNoeud(ctx.paramNombre("Graine", 0)).graine : 0;
      const demande: DemandeApprentissage = {
        corpus,
        mode: MODES_CHORAL.find((m) => m === ctx.paramTexte("Gamme", "majeur")) ?? "majeur",
        pas: ctx.paramTexte("Pas", "noire") === "croche" ? 0.5 : 1,
        voisinages: {
          vertical: ctx.paramNombre("Verticaux", 1) !== 0,
          horizontal: ctx.paramNombre("Horizontaux", 1) !== 0,
          diagonal: ctx.paramNombre("Diagonaux", 1) !== 0,
        },
        penalite: Math.max(0, ctx.paramNombre("Pénalité L1", 0.0005)),
        passes: Math.max(1, Math.round(ctx.paramNombre("Passes", 100))),
        partValidation: part, graine,
      };
      ctx.onProgress?.(en() ? "Learning…" : "Apprentissage…");
      const r: ResultatApprentissage = await parUneFois<DemandeApprentissage, ResultatApprentissage>(demande, {
        creerWorker: () => new Worker(new URL("../workers/apprendre-corpus-worker.ts", import.meta.url), { type: "module" }),
        calcul: apprendreSurCorpus,
      });
      const mesure = (nom: string, m: ResultatApprentissage["apprentissage"]) =>
        `${nom} : ${m.notes} notes · ${en() ? "mean log-likelihood" : "log-vraisemblance moyenne"} ${m.logPV.toFixed(3)} · ${pourcent(m.justes)} ${en() ? "ranked first" : "placées en tête"}`;
      const rapport = [
        `${r.piecesGardees - r.piecesValidation} ${en() ? "pieces learned" : "pièces apprises"} · ${r.piecesValidation} ${en() ? "set aside" : "mises de côté"} · ${r.ecartees.length} ${en() ? "left out" : "écartées"} · ${r.colonnesPerdues} ${en() ? "lost columns" : "colonnes perdues"}`,
        ...(r.modele ? [`${r.nonNuls} ${en() ? "non-zero parameters out of" : "paramètres non nuls sur"} ${r.modele.theta.length} · ${en() ? "corpus" : "corpus"} ${r.modele.empreinte}`] : []),
        "", mesure(en() ? "learning" : "apprentissage", r.apprentissage),
        ...(r.validation ? [mesure("validation", r.validation)] : []),
        ...(r.ecartees.length ? ["", ...r.ecartees.slice(0, 40).map((x) => `${en() ? "left out" : "écartée"} : ${x}`)] : []),
      ].join("\n");
      if (!r.modele) return { valeurs: [null, rapport], erreur: true, message: en() ? "No column to learn." : "Aucune colonne à apprendre." };
      const base = `${r.modele.colonnes} ${en() ? "columns" : "colonnes"} · ${pourcent(r.apprentissage.justes)} ${en() ? "ranked first" : "en tête"}`;
      return {
        valeurs: [r.modele, rapport],
        message: r.validation ? `${base} · ${pourcent(r.validation.justes)} ${en() ? "in validation" : "en validation"}` : base,
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
