// plugins/solveur-contraintes.ts — Chercher une suite de hauteurs sous des règles écrites.
//
// CE QUE CE NŒUD LÈVE. Le solveur existait, mais ses règles s'écrivaient en TypeScript : elles
// étaient hors de portée depuis l'interface, et `COMPOSITION-ASSISTEE.md` le notait comme ce qui
// restait du chantier. Ici les règles s'écrivent dans le nœud, et le solveur les cherche.
//
// LES DEUX CHEMINS SONT OFFERTS ENSEMBLE, et c'est ce qui fait l'intérêt. La recherche exacte
// prouve ; quand elle ne trouve rien, elle le prouve aussi, et cette preuve n'est pas ce qu'un
// compositeur veut. L'évolution reprend alors LES MÊMES règles comme coût et rend la suite qui en
// enfreint le moins. Aucune règle n'est réécrite entre les deux.
//
// LE CALCUL EST DANS `audio/contraintes.ts`, `audio/contraintes-ecrites.ts` et `audio/evolution.ts`,
// tous éprouvés ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { PARAMETRE_CLE, demiTonDeCle } from "../audio/cles";
import type { Sequence } from "../audio/sequence";
import { domaineHauteurs, resoudre } from "../audio/contraintes";
import { compilerRegles, type RegleEcrite } from "../audio/contraintes-ecrites";
import { evoluer, objectifContraintes } from "../audio/evolution";
import { GAMMES_CORRECTION, degresDe } from "../audio/correction-hauteur";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";
const REGLES = ["Règle 1", "Règle 2", "Règle 3", "Règle 4", "Règle 5", "Règle 6"];

export const fiches: FicheAudio[] = ([
  {
    id: "solveur-contraintes",
    nom: "Chercher sous contraintes", nomEn: "Search under Constraints",
    univers: "Entrées", famille: "Génération",
    resume: "Cherche une suite de hauteurs qui satisfait des règles écrites, et dit quand il n'en existe aucune.",
    resumeEn: "Searches for a pitch series satisfying written rules, and says when none exists.",
    notice: "Cherche une suite de hauteurs qui satisfait les règles écrites, et rend la première trouvée.\n\nLa recherche procède par retour sur trace : les hauteurs sont posées de la gauche vers la droite, les règles sont éprouvées à chaque pas, et dès qu'un début de suite est déjà fautif la recherche rebrousse chemin sans explorer ce qui en découle. C'est ce qui la rend praticable : juger seulement les suites entières demanderait d'en engendrer un nombre qui croît comme une puissance.\n\nUne règle est une expression vraie ou fausse, éprouvée sur ce qui est déjà posé. Elle lit « x » la hauteur qu'on essaie, « i » sa place à partir de zéro, « n » la longueur demandée, « precedent » et « avant2 » les hauteurs qui la précèdent, « premier » la première posée, « somme », « plusPetit » et « plusGrand » sur tout ce qui est posé, et « complet » qui vaut un à la dernière place. Les noms anglais des mêmes variables sont acceptés. Les fonctions usuelles sont disponibles : abs, min, max, mod, floor, round, sqrt.\n\nUne règle de fin ne peut pas s'éprouver en chemin : l'appliquer à chaque pas condamnerait toute recherche. Elle s'écrit donc avec « complet == 0 or » devant, et ne mord qu'à la dernière place.\n\nExemples : « abs(x - precedent) <= 4 » borne les sauts, « i == 0 or x != precedent » interdit la répétition immédiate, « plusGrand - plusPetit <= 12 » tient la suite dans une octave, « complet == 0 or x == premier » impose de revenir au départ.\n\nUne règle illisible est écartée et signalée, non subie : la laisser refuser tout ferait chercher en vain et rendrait une absence de solution qui serait une faute de frappe.\n\n« Longueur » est le nombre de hauteurs. « Gamme », « Tonique », « Grave » et « Aigu » décrivent celles qui sont permises.\n\n« Quand rien ne convient » décide de ce qui est rendu lorsqu'aucune suite ne satisfait tout. « Rien » rend la preuve d'absence, ce qui est une réponse. « Approcher » fait évoluer une population avec les mêmes règles prises comme coût, et rend la suite qui en enfreint le moins, ce qui n'est pas une preuve mais une proposition.\n\n« Graine » fixe le tirage. « Budget » borne le nombre d'essais de la recherche exacte.\n\nLa sortie « Séquence » porte la suite trouvée, une hauteur par note. La sortie « Analyse » donne les règles compilées, le nombre d'essais, et, quand rien n'est trouvé, la règle qui a le plus fait rebrousser chemin et la place la plus lointaine atteinte.\n\nLe message distingue deux cas que rien ne doit confondre : l'absence de solution, établie en ayant tout exploré, et l'abandon sur épuisement du budget.",
    noticeEn: "Searches for a series of pitches satisfying the written rules, and returns the first found.\n\nThe search proceeds by backtracking: pitches are laid from left to right, the rules are tested at each step, and as soon as the beginning of a series is already at fault the search turns back without exploring what follows from it. That is what makes it practicable: judging only whole series would require generating a number that grows as a power.\n\nA rule is an expression, true or false, tested on what is already laid. It reads « x » the pitch being tried, « i » its place from zero, « n » the requested length, « previous » and « before2 » the pitches preceding it, « first » the first laid, « sum », « smallest » and « largest » over everything laid, and « complete » which is one at the last place. Their French names are accepted as well. The usual functions are available: abs, min, max, mod, floor, round, sqrt.\n\nAn end rule cannot be tested along the way: applying it at every step would condemn the whole search. It is therefore written with « complete == 0 or » in front, and bites only at the last place.\n\nExamples: « abs(x - previous) <= 4 » bounds the leaps, « i == 0 or x != previous » forbids immediate repetition, « largest - smallest <= 12 » holds the series within an octave, « complete == 0 or x == first » requires returning to the start.\n\nA rule that cannot be read is set aside and reported, not suffered: letting it refuse everything would search in vain and return an absence of solution that was a typing mistake.\n\n« Length » is the number of pitches. « Scale », « Tonic », « Low » and « High » describe those allowed.\n\n« When nothing fits » decides what is returned when no series satisfies everything. « Nothing » returns the proof of absence, which is an answer. « Approach » evolves a population with the same rules taken as cost, and returns the series that breaks the fewest, which is not a proof but a proposal.\n\n« Seed » fixes the draw. « Budget » bounds the number of attempts of the exact search.\n\nThe « Sequence » output carries the series found, one pitch per note. The « Analysis » output gives the rules compiled, the number of attempts, and, when nothing is found, the rule that most often turned the search back and the furthest place reached.\n\nThe message distinguishes two cases that nothing should confuse: the absence of a solution, established by exploring everything, and giving up on an exhausted budget.",
    entrees: [],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Longueur", nomEn: "Length", plage: [2, 64], pas: 1, defaut: 12,
        doc: "Combien de hauteurs la suite compte.", docEn: "How many pitches the series has." },
      { nom: REGLES[0], nomEn: "Rule 1", type: "texte",
        defaut: "abs(x - precedent) <= 4", defautEn: "abs(x - previous) <= 4",
        doc: "Une expression vraie ou fausse, éprouvée sur ce qui est déjà posé.",
        docEn: "An expression, true or false, tested on what is already laid." },
      { nom: REGLES[1], nomEn: "Rule 2", type: "texte",
        defaut: "i == 0 or x != precedent", defautEn: "i == 0 or x != previous",
        doc: "Une deuxième règle. Vide, elle ne compte pas.",
        docEn: "A second rule. Empty, it does not count." },
      { nom: REGLES[2], nomEn: "Rule 3", type: "texte",
        defaut: "plusGrand - plusPetit <= 12", defautEn: "largest - smallest <= 12",
        doc: "Une troisième règle.", docEn: "A third rule." },
      { nom: REGLES[3], nomEn: "Rule 4", type: "texte",
        defaut: "complet == 0 or x == premier", defautEn: "complete == 0 or x == first",
        doc: "Une quatrième règle. Une règle de fin s'écrit avec « complet == 0 or » devant.",
        docEn: "A fourth rule. An end rule is written with « complete == 0 or » in front." },
      { nom: REGLES[4], nomEn: "Rule 5", type: "texte", defaut: "", defautEn: "",
        doc: "Une cinquième règle.", docEn: "A fifth rule." },
      { nom: REGLES[5], nomEn: "Rule 6", type: "texte", defaut: "", defautEn: "",
        doc: "Une sixième règle.", docEn: "A sixth rule." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_CORRECTION.map((g) => g.fr), optionsEn: GAMMES_CORRECTION.map((g) => g.en),
        optionIds: GAMMES_CORRECTION.map((g) => g.id), defaut: "Majeure", defautEn: "Major",
        doc: "Les degrés auxquels les hauteurs sont restreintes.",
        docEn: "The degrees the pitches are restricted to." },
      { ...PARAMETRE_CLE, nom: "Tonique", nomEn: "Tonic",
        doc: "La tonique de la gamme.", docEn: "The tonic of the scale." },
      { nom: "Grave", nomEn: "Low", plage: [0, 127], pas: 1, defaut: 55,
        doc: "La hauteur la plus basse permise.", docEn: "The lowest pitch allowed." },
      { nom: "Aigu", nomEn: "High", plage: [0, 127], pas: 1, defaut: 79,
        doc: "La hauteur la plus haute permise.", docEn: "The highest pitch allowed." },
      { nom: "Quand rien ne convient", nomEn: "When nothing fits", type: "choix",
        options: ["Rien", "Approcher"], optionsEn: ["Nothing", "Approach"],
        optionIds: ["rien", "approcher"], defaut: "Approcher", defautEn: "Approach",
        doc: "« Approcher » fait évoluer une population avec les mêmes règles prises comme coût, et rend la suite qui en enfreint le moins.",
        docEn: "« Approach » evolves a population with the same rules taken as cost, and returns the series that breaks the fewest." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "La durée d'une note, chacune valant une noire.",
        docEn: "The length of a note, each being a quarter note." },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 1,
        doc: "Fixe le tirage. La même graine rend la même suite.",
        docEn: "Fixes the draw. The same seed gives the same series." },
      { nom: "Budget", nomEn: "Budget", plage: [1000, 2000000], pas: 1000, defaut: 200000,
        doc: "Le nombre d'essais au plus avant de renoncer.",
        docEn: "The number of attempts at most before giving up." },
    ],
    async executer(ctx: any) {
      const combien = Math.round(ctx.paramNombre("Longueur", 12));
      const domaine = domaineHauteurs(
        ctx.paramNombre("Grave", 55), ctx.paramNombre("Aigu", 79),
        degresDe(ctx.paramTexte("Gamme", "majeure"), demiTonDeCle(ctx.paramTexte("Tonique", "C")) ?? 0),
      );
      if (domaine.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No pitch available in this range." : "Aucune hauteur disponible dans cette étendue.",
        };
      }

      const ecrites: RegleEcrite[] = REGLES.map((nom, k) => ({
        nom: en() ? `Rule ${k + 1}` : nom,
        texte: ctx.paramTexte(nom, ""),
      }));
      const { contraintes, erreurs } = compilerRegles(ecrites);
      const domaines = new Array(combien).fill(domaine);
      const graine = Math.round(ctx.paramNombre("Graine", 1));

      const exact = resoudre(domaines, contraintes, {
        budget: Math.round(ctx.paramNombre("Budget", 200000)),
        graine, combien: 1,
      });

      const tempo = ctx.paramNombre("Tempo", 120);
      const duree = 60 / Math.max(1, tempo);
      const enSequence = (hauteurs: readonly number[]): Sequence => ({
        notes: hauteurs.map((h, i) => ({
          note: h, velocite: 90, debut: i * duree, fin: (i + 1) * duree,
        })),
        tempo, duree: hauteurs.length * duree,
      });

      const entete = [
        `${contraintes.length} ${en() ? "rules" : "règles"} · ${combien} ${en() ? "pitches" : "hauteurs"} · `
          + `${domaine.length} ${en() ? "pitches allowed" : "hauteurs permises"}`,
        ...(erreurs.length > 0
          ? ["", `${en() ? "rules set aside" : "règles écartées"} :`, ...erreurs.map((e) => `  ${e}`)]
          : []),
      ];

      if (exact.solutions.length > 0) {
        const suite = exact.solutions[0];
        return {
          valeurs: [enSequence(suite), [
            ...entete, "",
            `${en() ? "found in" : "trouvée en"} ${exact.noeuds} ${en() ? "attempts" : "essais"}`,
            `  ${suite.map((n) => nomNote(n)).join(" ")}`,
          ].join("\n")],
          message: `${en() ? "found" : "trouvée"} · ${exact.noeuds} ${en() ? "attempts" : "essais"} · `
            + `${contraintes.length} ${en() ? "rules" : "règles"}`
            + (erreurs.length > 0 ? ` · ${erreurs.length} ${en() ? "set aside" : "écartées"}` : ""),
        };
      }

      // DEUX CAS QUI N'ONT RIEN À VOIR, et les confondre enverrait chercher au mauvais endroit :
      // desserrer les règles ne sert à rien si la recherche a seulement manqué de temps.
      const cause = exact.abandonne
        ? (en() ? "budget exhausted, the search did not conclude" : "budget épuisé, la recherche n'a pas conclu")
        : (en() ? "no solution, everything was explored" : "aucune solution, tout a été exploré");
      const detail = [
        ...entete, "",
        `${cause} · ${exact.noeuds} ${en() ? "attempts" : "essais"}`,
        `${en() ? "most often turned back by" : "le plus souvent bloqué par"} : ${exact.regleBloquante || "-"}`,
        `${en() ? "furthest reached" : "le plus loin atteint"} : ${exact.meilleurPartiel.length}/${combien}`,
      ];

      if (ctx.paramTexte("Quand rien ne convient", "approcher") === "rien") {
        return {
          valeurs: [null, detail.join("\n")],
          message: `${en() ? "nothing found" : "rien trouvé"} · ${cause} · `
            + `${en() ? "blocked by" : "bloqué par"} ${exact.regleBloquante || "-"}`,
        };
      }

      // LES MÊMES RÈGLES SERVENT DE COÛT, sans en réécrire une : ce qui était interdit devient cher.
      const ev = evoluer(domaines, [objectifContraintes(contraintes, 1)], {
        population: 120, generations: 400, mutation: 0.12, graine, cible: 0,
      });
      return {
        valeurs: [enSequence(ev.meilleur), [
          ...detail, "",
          `${en() ? "approached by evolution" : "approchée par évolution"} · `
            + `${ev.generations} ${en() ? "generations" : "générations"} · `
            + `${en() ? "cost" : "coût"} ${ev.cout}`,
          `  ${ev.meilleur.map((n) => nomNote(n)).join(" ")}`,
        ].join("\n")],
        message: `${en() ? "approached" : "approchée"} · ${en() ? "cost" : "coût"} ${ev.cout} · ${cause}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
