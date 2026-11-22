// plugins/harmoniser-coconet.ts — Harmoniser une mélodie à quatre voix par Coconet.
//
// LE MODÈLE EST CELUI DU DOODLE BACH DE 2019, et il était déjà là : `@magenta/music` porte Coconet
// depuis toujours, seul son point de contrôle manquait (`coconet_bach`, 595 914 octets, entré au
// manifeste le 2026-11-22). Le calcul tourne dans le worker Magenta, que les huit nœuds Magenta
// partagent ; ce fichier n'est que la prise.
//
// CE QUI EST FAIT ICI ET NULLE PART AILLEURS : poser la séquence sur la grille et refuser ce qui
// n'y tient pas (`audio/coconet-grille.ts`), puis remettre en notes ce que le réseau a écrit, à côté
// des voix reçues, qui ressortent intactes. Le tirage, lui, est dans `coconet-helpers.ts`.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence, type InfoVoix, type Sequence } from "../audio/sequence";
import { nomNote } from "../audio/nom-note";
import { hasardDuNoeud } from "../core";
import { annoncerModele } from "./message-modele";
import { runMagenta } from "./magenta";
import {
  COCONET_VOIX, estRefus, grilleDepuisSequence, sequenceDepuisGrille, type VoixGardees,
} from "../audio/coconet-grille";

const en = () => langueCourante() === "en";

const NOMS_VOIX = [
  { fr: "Soprano", en: "Soprano" },
  { fr: "Alto", en: "Alto" },
  { fr: "Ténor", en: "Tenor" },
  { fr: "Basse", en: "Bass" },
];

const VOIX_GARDEES = [
  { id: "soprano", nom: "Soprano", nomEn: "Soprano" },
  { id: "toutes", nom: "Toutes les voix reçues", nomEn: "All received voices" },
];

/** Le temps d'une note, en mesures et temps de noire à partir de un, pour la nommer. */
const ou = (debut: number, tempo: number): string => {
  const noires = debut * (tempo / 60);
  return `${Math.floor(noires / 4) + 1}.${Math.floor(noires % 4) + 1}`;
};

export const fiches: FicheAudio[] = ([
  fiche({
    id: "harmoniser-coconet", nomDicte: "harmoniser par le réseau",
    nom: "Harmoniser (Coconet)", nomEn: "Harmonize (Coconet)",
    univers: "Autres", famille: "Harmonisation",
    resume: "Harmonise une mélodie à quatre voix par un réseau entraîné sur les chorals de Bach.",
    resumeEn: "Harmonizes a melody in four voices with a network trained on Bach's chorales.",
    notice: "Ce composant harmonise une mélodie à quatre voix, soprano, alto, ténor et basse, par un réseau de neurones convolutif entraîné sur les chorals de Johann Sebastian Bach.\n\nLe modèle est Coconet (Cheng-Zhi Anna Huang, Tim Cooijmans, Adam Roberts, Aaron Courville et Douglas Eck, « Counterpoint by Convolution », ISMIR 2017). La pièce est posée sur une grille d'une case par double-croche et par voix. Les cases à écrire sont tirées plusieurs fois : à chaque itération, une part d'entre elles est tirée de nouveau, chacune selon la probabilité que le réseau lui donne connaissant toutes les autres. À la première itération, toutes le sont ; la part décroît ensuite d'une itération à la suivante, jusqu'à un septième environ à la dernière.\n\nLa mélodie arrive par l'entrée « Séquence ». Ses hauteurs tiennent entre C2 et A5, soit MIDI 36 à 81, l'étendue du corpus d'entraînement : une seule note au-delà fait refuser la pièce, et le message nomme chacune avec sa mesure et son temps. Les débuts et les fins sont ramenés à la double-croche au tempo de la séquence, 120 quand elle n'en porte pas.\n\n« Voix gardées » décide de ce qui reste de l'entrée. « Soprano » garde la première voix et écrit les trois autres. « Toutes les voix reçues » garde chaque voix présente parmi les quatre premières et n'écrit que celles qui manquent : une basse donnée sous le soprano reçoit ainsi son alto et son ténor. Une case où aucune voix gardée ne sonne reste muette pour toutes.\n\n« Température » règle la liberté du tirage. À zéro, chaque case prend la hauteur la plus probable ; à un, le tirage suit les probabilités du réseau ; au-delà, il s'en écarte.\n\n« Itérations » règle le nombre de passes du tirage. Peu d'itérations laissent des voix qui se contredisent ; davantage les accordent, au prix d'un calcul qui croît avec leur nombre et avec la longueur de la pièce.\n\n« Lier les notes répétées » décide des cases successives de même hauteur dans une voix écrite. Cochée, elles forment une seule note tenue ; décochée, la note est refrappée à chaque noire.\n\n« Graine » fixe les tirages : la même graine rend le même choral sur une même machine.\n\nLa sortie « Séquence » rend les quatre voix, chacune nommée, les voix gardées avec leurs notes d'origine. La sortie « Rapport » donne pour chaque voix si elle a été gardée ou écrite, son nombre de notes et son étendue, puis le nombre de notes que la grille a déplacées.",
    noticeEn: "This component harmonizes a melody in four voices, soprano, alto, tenor and bass, with a convolutional neural network trained on Johann Sebastian Bach's chorales.\n\nThe model is Coconet (Cheng-Zhi Anna Huang, Tim Cooijmans, Adam Roberts, Aaron Courville and Douglas Eck, « Counterpoint by Convolution », ISMIR 2017). The piece is laid on a grid of one cell per sixteenth note and per voice. The cells to write are drawn several times: at each iteration, a share of them is drawn again, each according to the probability the network gives it knowing all the others. At the first iteration, all of them are; the share then falls from one iteration to the next, down to about one seventh at the last.\n\nThe melody arrives on the « Sequence » input. Its pitches lie between C2 and A5, that is MIDI 36 to 81, the range of the training corpus: a single note beyond makes the piece refused, and the message names each one with its bar and beat. Starts and ends are brought to the sixteenth note at the sequence's tempo, 120 when it carries none.\n\n« Kept voices » decides what remains of the input. « Soprano » keeps the first voice and writes the other three. « All received voices » keeps every voice present among the first four and writes only the missing ones: a bass given under the soprano thus receives its alto and its tenor. A cell where no kept voice sounds stays silent for all.\n\n« Temperature » sets the freedom of the draw. At zero, every cell takes the most probable pitch; at one, the draw follows the network's probabilities; beyond, it departs from them.\n\n« Iterations » sets the number of passes of the draw. Few iterations leave voices that contradict each other; more bring them into agreement, at the cost of a computation that grows with their number and with the length of the piece.\n\n« Tie repeated notes » decides what successive cells of the same pitch in a written voice become. Checked, they form a single held note; unchecked, the note is struck again on every quarter note.\n\n« Seed » fixes the draws: the same seed gives the same chorale on the same machine.\n\nThe « Sequence » output returns the four voices, each one named, the kept voices with their original notes. The « Report » output gives for each voice whether it was kept or written, its number of notes and its range, then the number of notes the grid moved.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: true }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Voix gardées", nomEn: "Kept voices", type: "choix",
        options: VOIX_GARDEES.map((v) => v.nom), optionsEn: VOIX_GARDEES.map((v) => v.nomEn),
        optionIds: VOIX_GARDEES.map((v) => v.id), defaut: VOIX_GARDEES[0].nom, defautEn: VOIX_GARDEES[0].nomEn,
        doc: "« Soprano » garde la première voix reçue et écrit les trois autres. « Toutes les voix reçues » garde chaque voix présente parmi les quatre premières et n'écrit que celles qui manquent.",
        docEn: "« Soprano » keeps the first voice received and writes the other three. « All received voices » keeps every voice present among the first four and writes only the missing ones." },
      { nom: "Température", nomEn: "Temperature", type: "curseur", plage: [0, 1.5], pas: 0.01, defaut: 0.99,
        doc: "La liberté du tirage. À zéro, chaque case prend la hauteur la plus probable ; à un, le tirage suit les probabilités du réseau ; au-delà, il s'en écarte.",
        docEn: "The freedom of the draw. At zero, every cell takes the most probable pitch; at one, the draw follows the network's probabilities; beyond, it departs from them." },
      { nom: "Itérations", nomEn: "Iterations", type: "curseur", plage: [8, 256], pas: 1, defaut: 96,
        doc: "Le nombre de passes du tirage. Davantage accordent mieux les voix, au prix d'un calcul plus long.",
        docEn: "The number of passes of the draw. More bring the voices into better agreement, at the cost of a longer computation." },
      { nom: "Lier les notes répétées", nomEn: "Tie repeated notes", type: "case", plage: [0, 1], pas: 1, defaut: 1,
        doc: "Cochée, des cases successives de même hauteur dans une voix écrite forment une seule note tenue. Décochée, la note est refrappée à chaque noire.",
        docEn: "Checked, successive cells of the same pitch in a written voice form a single held note. Unchecked, the note is struck again on every quarter note." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Fixe les tirages : la même graine rend le même choral sur une même machine.",
        docEn: "Fixes the draws: the same seed gives the same chorale on the same machine." },
    ],
    async executer(ctx) {
      const recue = ctx.entree(0);
      if (!estSequence(recue) || recue.notes.length === 0) {
        return { valeurs: [null, null], erreur: true,
          message: en() ? "Connect a melody to the Sequence input." : "Branchez une mélodie sur l'entrée Séquence." };
      }
      const voixGardees = (ctx.paramTexte("Voix gardées", "soprano") === "toutes" ? "toutes" : "soprano") as VoixGardees;
      const tempo = recue.tempo && recue.tempo > 0 ? recue.tempo : 120;
      const grille = grilleDepuisSequence(recue, voixGardees, tempo);
      if (estRefus(grille)) {
        const lignes = [
          ...grille.horsEtendue.map((n) => `${nomNote(n.note)} (${ou(n.debut, tempo)})`),
          ...grille.voixEnTrop.map((v) => (en() ? `voice ${v + 1}` : `voix ${v + 1}`)),
        ];
        const raison = grille.vide
          ? (en() ? "no note in the kept voices" : "aucune note dans les voix gardées")
          : grille.horsEtendue.length > 0
            ? (en() ? "pitches outside C2 to A5" : "hauteurs hors de C2 à A5")
            : (en() ? "more than four voices" : "plus de quatre voix");
        return { valeurs: [null, null], erreur: true, message: `${raison}${lignes.length ? " : " + lignes.join(", ") : ""}` };
      }
      const temperature = ctx.paramNombre("Température", 0.99);
      const iterations = Math.round(ctx.paramNombre("Itérations", 96));
      const lier = (ctx.paramNombre("Lier les notes répétées", 1) || 0) !== 0;
      const { graine } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      try {
        await annoncerModele(ctx, "harmoniser-coconet", en() ? "Coconet harmonization…" : "Harmonisation par Coconet…");
        const resultat = await runMagenta(ctx, "coconet", {
          pas: grille.pas, hauteurs: grille.hauteurs, masque: grille.masque, temperature, iterations, graine,
        });
        if (resultat?.kind !== "grille") throw new Error(en() ? "unexpected Coconet result" : "résultat Coconet inattendu");
        const notes = sequenceDepuisGrille(resultat.hauteurs, grille, recue, voixGardees, lier);
        const infos: InfoVoix[] = NOMS_VOIX.map((n, numero) => ({ numero, nom: en() ? n.en : n.fr }));
        const sequence: Sequence = { notes, tempo, duree: grille.pas * grille.dureePas, voix: infos, titre: recue.titre };
        const rapport = [
          ...NOMS_VOIX.map((n, v) => {
            const sienne = notes.filter((x) => x.voix === v);
            const etat = grille.gardees.includes(v) ? (en() ? "kept" : "gardée") : (en() ? "written" : "écrite");
            const etendue = sienne.length
              ? `${nomNote(Math.min(...sienne.map((x) => x.note)))} ${en() ? "to" : "à"} ${nomNote(Math.max(...sienne.map((x) => x.note)))}`
              : (en() ? "no note" : "aucune note");
            return `${en() ? n.en : n.fr} · ${etat} · ${sienne.length} notes · ${etendue}`;
          }),
          "",
          `${en() ? "notes moved by the grid" : "notes déplacées par la grille"} : ${grille.deplacees}`,
          ...(grille.recouvertes ? [`${en() ? "overlapping cells, highest kept" : "cases recouvertes, la plus aiguë gardée"} : ${grille.recouvertes}`] : []),
          ...(grille.remplacees ? [`${en() ? "received notes replaced" : "notes reçues remplacées"} : ${grille.remplacees}`] : []),
          `${en() ? "iterations" : "itérations"} : ${iterations} · ${en() ? "backend" : "arrière-plan"} : ${resultat.arrierePlan}`,
        ].join("\n");
        const ecrites = COCONET_VOIX - grille.gardees.length;
        const base = en()
          ? `${ecrites} voices written · ${grille.pas} cells · temperature ${temperature}`
          : `${ecrites} voix écrites · ${grille.pas} cases · température ${temperature}`;
        return { valeurs: [sequence, rapport], message: `${base} · ${en() ? "seed" : "graine"} ${graine}` };
      } catch (err: any) {
        return { valeurs: [null, null], erreur: true, message: `Coconet : ${err?.message ?? err}` };
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
