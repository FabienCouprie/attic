// plugins/contrepoint-solveur.ts — Écrire un contrepoint, au lieu de le corriger.
//
// CE NŒUD CHERCHE, LÀ OÙ SON VOISIN JUGE. La différence n'est pas de degré : recevoir une pièce et
// dire ce qui cloche est le travail du professeur ; recevoir des règles et rendre une pièce qui les
// respecte est celui du compositeur. C'est ce que `COMPOSITION-ASSISTEE.md` rangeait sous « un
// solveur, à écrire », en notant qu'Attic ne savait que vérifier.
//
// LE CALCUL EST DANS `audio/contraintes.ts` ET `audio/contrepoint-solveur.ts`, éprouvés ; ce fichier
// n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence, type InfoVoix, type Sequence } from "../audio/sequence";
import { cantusFirmus, chercherContrepoint } from "../audio/contrepoint-solveur";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

const POSITIONS = [
  { id: "dessus", nom: "Au-dessus", nomEn: "Above" },
  { id: "dessous", nom: "Au-dessous", nomEn: "Below" },
];

/**
 * Lit une suite de hauteurs écrite à la main.
 *
 * LE MORCEAU VIDE EST ÉCARTÉ AVANT D'ÊTRE CONVERTI, et c'est ce qui manquait. Découper la chaîne
 * vide rend un tableau d'un seul morceau vide, `Number("")` vaut zéro, et zéro est une hauteur
 * recevable : le réglage vide — qui est son défaut — rendait donc un cantus d'une note à la hauteur
 * zéro. Le nœud prenait cette note pour un cantus écrit, n'engendrait jamais le sien, et se
 * terminait sur « un cantus firmus demande au moins deux notes » quoi qu'on fasse.
 */
const lireHauteurs = (texte: string): number[] =>
  texte.split(/[\s,;]+/).filter((m) => m !== "")
    .map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 127);

/** Les classes de hauteurs employées par une suite : son mode, tel qu'il se donne. */
const modeDe = (suite: readonly number[]): number[] =>
  [...new Set(suite.map((h) => ((Math.round(h) % 12) + 12) % 12))].sort((a, b) => a - b);

export const fiches: FicheAudio[] = ([
  {
    id: "contrepoint-solveur",
    nom: "Écrire un contrepoint", nomEn: "Write a Counterpoint",
    univers: "Entrées", famille: "Génération",
    resume: "Cherche une voix qui fasse un contrepoint de première espèce avec le cantus firmus reçu.",
    resumeEn: "Searches for a voice that makes a first-species counterpoint with the received cantus firmus.",
    notice: "Cherche une voix qui fasse un contrepoint de première espèce, note contre note, avec le cantus firmus reçu, et rend les deux voix en une séquence.\n\nLe procédé est celui d'un solveur de contraintes, et la recherche procède par retour sur trace : les notes sont posées de la gauche vers la droite, les règles sont éprouvées à chaque pas, et dès qu'un début de ligne est déjà fautif la recherche rebrousse chemin sans explorer ce qui en découle. Les règles employées sont celles de Johann Joseph Fux, « Gradus ad Parnassum », 1725 : seules les consonances sont admises, les quintes et octaves parallèles sont interdites, la pièce commence et finit sur une consonance parfaite, les sauts se compensent, et la cadence se fait par mouvement contraire.\n\nLe cantus firmus vient de l'entrée « Séquence » quand elle est branchée, sinon du réglage « Cantus firmus », et à défaut il est engendré. Un cantus engendré commence et finit sur la tonique, se meut par degrés, atteint un sommet unique et n'y saute jamais plus d'une tierce.\n\n« Position » place la voix cherchée au-dessus ou au-dessous du cantus.\n\n« Mode » restreint les hauteurs. « Du cantus » n'emploie que les degrés que le cantus emploie lui-même, ce qui tient la ligne dans son mode ; « Chromatique » laisse les douze, et la ligne s'en ressent.\n\n« Grave » et « Aigu » bornent l'étendue de la voix cherchée. « Écart maximal » borne le saut d'une note à la suivante ; trop serré, la cadence ne peut plus se faire et il n'existe aucune solution.\n\n« Graine » fixe le tirage : la même graine rend le même contrepoint, et deux graines en rendent deux, également justes. « Budget » borne le nombre d'essais.\n\nLa sortie « Séquence » porte les deux voix, le cantus et le contrepoint, chacune sur sa voix. La sortie « Analyse » donne les deux lignes en notes, les avis du vérificateur, et le compte des essais.\n\nLe message dit si une ligne a été trouvée. Quand il n'y en a pas, il distingue deux cas qui n'ont rien à voir : l'absence de solution, établie en ayant tout exploré, et l'abandon sur épuisement du budget. Il nomme alors la règle qui a le plus souvent fait rebrousser chemin, et la place la plus lointaine atteinte.",
    noticeEn: "Searches for a voice that makes a first-species counterpoint, note against note, with the received cantus firmus, and returns both voices as one sequence.\n\nThe procedure is that of a constraint solver, and the search proceeds by backtracking: notes are laid from left to right, the rules are tested at each step, and as soon as the beginning of a line is already at fault the search turns back without exploring what follows from it. The rules used are those of Johann Joseph Fux, « Gradus ad Parnassum », 1725: only consonances are admitted, parallel fifths and octaves are forbidden, the piece begins and ends on a perfect consonance, leaps are compensated, and the cadence is by contrary motion.\n\nThe cantus firmus comes from the « Sequence » input when connected, otherwise from the « Cantus firmus » setting, and failing that it is generated. A generated cantus begins and ends on the tonic, moves by steps, reaches a single peak and never leaps more than a third.\n\n« Position » places the searched voice above or below the cantus.\n\n« Mode » restricts the pitches. « From the cantus » uses only the degrees the cantus itself uses, which holds the line in its mode; « Chromatic » leaves all twelve, and the line shows it.\n\n« Low » and « High » bound the range of the searched voice. « Maximum leap » bounds the step from one note to the next; too tight, the cadence can no longer be made and no solution exists.\n\n« Seed » fixes the draw: the same seed gives the same counterpoint, and two seeds give two, both correct. « Budget » bounds the number of attempts.\n\nThe « Sequence » output carries both voices, the cantus and the counterpoint, each on its own voice. The « Analysis » output gives both lines as notes, the checker's advisories, and the number of attempts.\n\nThe message states whether a line was found. When there is none, it distinguishes two cases that have nothing to do with each other: the absence of a solution, established by exploring everything, and giving up on an exhausted budget. It then names the rule that most often turned the search back, and the furthest place reached.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: false }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Cantus firmus", nomEn: "Cantus firmus", type: "texte", defaut: "", defautEn: "",
        doc: "Les hauteurs du cantus, en numéros MIDI séparés par des espaces. Vide, un cantus est engendré.",
        docEn: "The cantus pitches, as MIDI numbers separated by spaces. Empty, a cantus is generated." },
      { nom: "Notes", nomEn: "Notes", plage: [4, 16], pas: 1, defaut: 10,
        doc: "La longueur du cantus engendré, quand aucun n'est fourni.",
        docEn: "The length of the generated cantus, when none is supplied." },
      { nom: "Position", nomEn: "Position", type: "choix",
        options: POSITIONS.map((p) => p.nom), optionsEn: POSITIONS.map((p) => p.nomEn),
        optionIds: POSITIONS.map((p) => p.id), defaut: POSITIONS[0].nom, defautEn: POSITIONS[0].nomEn,
        doc: "Place la voix cherchée au-dessus ou au-dessous du cantus.",
        docEn: "Places the searched voice above or below the cantus." },
      { nom: "Mode", nomEn: "Mode", type: "choix",
        options: ["Du cantus", "Chromatique"], optionsEn: ["From the cantus", "Chromatic"],
        optionIds: ["cantus", "chromatique"], defaut: "Du cantus", defautEn: "From the cantus",
        doc: "« Du cantus » n'emploie que les degrés que le cantus emploie, ce qui tient la ligne dans son mode.",
        docEn: "« From the cantus » uses only the degrees the cantus uses, which holds the line in its mode." },
      { nom: "Écart maximal", nomEn: "Maximum leap", plage: [2, 16], pas: 1, defaut: 9,
        doc: "Le saut le plus grand d'une note à la suivante, en demi-tons. Trop serré, la cadence ne peut plus se faire.",
        docEn: "The largest leap from one note to the next, in semitones. Too tight, the cadence can no longer be made." },
      { nom: "Étendue", nomEn: "Range", plage: [7, 36], pas: 1, defaut: 17,
        doc: "L'étendue de la voix cherchée, en demi-tons, à partir du bord du cantus.",
        docEn: "The range of the searched voice, in semitones, from the edge of the cantus." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "La durée d'une note, chacune valant une ronde.",
        docEn: "The length of a note, each being a whole note." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 9999], pas: 1, defaut: 1,
        doc: "Fixe le tirage. La même graine rend le même contrepoint.",
        docEn: "Fixes the draw. The same seed gives the same counterpoint." },
      { nom: "Budget", nomEn: "Budget", plage: [1000, 2000000], pas: 1000, defaut: 200000,
        doc: "Le nombre d'essais au plus avant de renoncer. Le message dit si la recherche a renoncé ou conclu.",
        docEn: "The number of attempts at most before giving up. The message says whether the search gave up or concluded." },
    ],
    async executer(ctx: any) {
      const recue = ctx.entree(0);
      const ecrit = lireHauteurs(ctx.paramTexte("Cantus firmus", ""));
      const graine = Math.round(ctx.paramNombre("Graine", 1));
      let cantus: number[];
      let provenance: string;
      if (estSequence(recue) && recue.notes.length > 0) {
        cantus = [...recue.notes].sort((a, b) => a.debut - b.debut).map((n) => n.note);
        provenance = en() ? "sequence input" : "entrée Séquence";
      } else if (ecrit.length > 0) {
        cantus = ecrit;
        provenance = en() ? "setting" : "réglage";
      } else {
        cantus = cantusFirmus(60, Math.round(ctx.paramNombre("Notes", 10)), graine);
        provenance = en() ? "generated" : "engendré";
      }
      if (cantus.length < 2) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "A cantus firmus needs at least two notes." : "Un cantus firmus demande au moins deux notes.",
        };
      }

      const auDessus = ctx.paramTexte("Position", "dessus") !== "dessous";
      const etendue = ctx.paramNombre("Étendue", 17);
      const res = chercherContrepoint(cantus, {
        auDessus,
        grave: auDessus ? Math.max(...cantus) : Math.min(...cantus) - etendue,
        aigu: auDessus ? Math.max(...cantus) + etendue : Math.min(...cantus),
        degres: ctx.paramTexte("Mode", "cantus") === "chromatique" ? undefined : modeDe(cantus),
        ecartMax: ctx.paramNombre("Écart maximal", 9),
        graine,
        budget: Math.round(ctx.paramNombre("Budget", 200000)),
      });

      if (res.lignes.length === 0) {
        // DEUX CAS QUI N'ONT RIEN À VOIR, et les confondre enverrait chercher au mauvais endroit :
        // desserrer les règles ne sert à rien si la recherche a simplement manqué de temps.
        const cause = res.abandonne
          ? (en() ? "budget exhausted, the search did not conclude" : "budget épuisé, la recherche n'a pas conclu")
          : (en() ? "no solution, everything was explored" : "aucune solution, tout a été exploré");
        return {
          valeurs: [null, [
            `${en() ? "cantus" : "cantus"}  ${cantus.map(nomNote).join(" ")}`,
            "",
            `${cause} · ${res.noeuds} ${en() ? "attempts" : "essais"}`,
            `${en() ? "most often turned back by" : "le plus souvent bloqué par"} : ${res.regleBloquante}`,
            `${en() ? "furthest reached" : "le plus loin atteint"} : ${res.meilleurPartiel.length}/${cantus.length}`,
          ].join("\n")],
          message: `${en() ? "no counterpoint" : "aucun contrepoint"} · ${cause} · `
            + `${en() ? "blocked by" : "bloqué par"} ${res.regleBloquante} · `
            + `${res.meilleurPartiel.length}/${cantus.length}`,
        };
      }

      const ligne = res.lignes[0];
      const tempo = ctx.paramNombre("Tempo", 120);
      const duree = (4 * 60) / Math.max(1, tempo);
      // LES DEUX VOIX SORTENT ENSEMBLE, chacune sur la sienne : le contrepoint seul ne s'entend pas,
      // et la gravure en tire deux portées.
      const notes = [];
      for (let i = 0; i < cantus.length; i++) {
        const debut = i * duree;
        notes.push({ note: auDessus ? ligne[i] : cantus[i], velocite: 90, debut, fin: debut + duree, voix: 0 });
        notes.push({ note: auDessus ? cantus[i] : ligne[i], velocite: 90, debut, fin: debut + duree, voix: 1 });
      }
      const infos: InfoVoix[] = [
        { numero: 0, nom: en() ? "Upper" : "Voix supérieure" },
        { numero: 1, nom: en() ? "Lower" : "Voix inférieure" },
      ];
      const sequence: Sequence = { notes, tempo, duree: cantus.length * duree, voix: infos };

      const analyse = [
        `${cantus.length} notes · ${provenance} · ${res.noeuds} ${en() ? "attempts" : "essais"}`,
        "",
        `${en() ? "cantus     " : "cantus     "}${cantus.map(nomNote).join(" ")}`,
        `${en() ? "counterpoint " : "contrepoint "}${ligne.map(nomNote).join(" ")}`,
        "",
        res.avis.length > 0
          ? `${en() ? "advisories" : "avis"} :\n${res.avis.map((a) => `  ${a.position}. ${en() ? a.en : a.fr}`).join("\n")}`
          : (en() ? "no advisory" : "aucun avis"),
      ].join("\n");

      return {
        valeurs: [sequence, analyse],
        message: `${en() ? "counterpoint found" : "contrepoint trouvé"} · ${cantus.length} notes · `
          + `${res.noeuds} ${en() ? "attempts" : "essais"} · ${res.avis.length} ${en() ? "advisories" : "avis"} · ${provenance}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
