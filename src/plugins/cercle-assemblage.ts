// plugins/cercle-assemblage.ts — Mettre des cercles bout à bout, ou les superposer.
//
// LES DEUX FAÇONS D'EN RÉUNIR PLUSIEURS, et ce sont celles que l'audio a déjà. « Jointure audio »
// met deux pistes l'une après l'autre, « Mélangeur » les additionne. Un cercle se prête aux deux, et
// aux deux d'une manière qui lui est propre : bout à bout dans le temps veut dire une suite de
// tours, ou un cycle plus long qui les contient tous ; superposer veut dire une grille commune.
//
// L'ORDRE COMPTE POUR L'UN, PAS POUR L'AUTRE, et c'est ce qui décide de la forme des entrées. Une
// jointure prend des entrées numérotées, puisque le second cercle vient après le premier. Un
// mélangeur prend un seul port qui accepte tous les câbles qu'on y tire, comme le mélangeur audio :
// une somme ne dépend pas de l'ordre de ses termes.

import type { FicheAudio } from "../audio/types-domaine";
import {
  POSITIONS_MAX, enSuite, joindre, melanger, type Cercle,
} from "../audio/cercle";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/** Combien de cercles une jointure met bout à bout, le même compte que le rendu. */
const ENTREES = 8;

export const fiches: FicheAudio[] = ([
  {
    id: "cercle-jointure",
    nom: "Jointure de cercles", nomEn: "Circle Join",
    univers: "Autres", famille: "Circle",
    resume: "Met des cercles bout à bout, en une suite de tours ou en un seul cycle plus long.",
    resumeEn: "Puts circles end to end, as a series of turns or as a single longer cycle.",
    notice: `Met bout à bout les cercles branchés sur ses entrées, dans l'ordre des entrées, et rend l'assemblage.\n\nLes boutons « + » et « − » sous les entrées allongent ou raccourcissent le composant, jusqu'à ${ENTREES} cercles. Une entrée branchée ne se cache pas.\n\n« Assemblage » décide de ce que bout à bout veut dire, et les deux ne font pas la même musique.\n• « L'un après l'autre » rend une suite : chaque cercle garde son nombre de places et occupe un tour. C'est la forme qu'une boucle de variation produit, et le rendu la joue sur une seule voix, un cercle par tour.\n• « En un seul cycle » rend un cercle unique dont le nombre de places est la somme des leurs : seize et douze donnent vingt-huit, les attaques du second étant décalées de seize. Le cycle est alors un seul objet, qui se mesure et se transforme comme tel.\n\nLa même sorte est exigée pour un seul cycle : joindre une percussion et une mélodie donnerait un cercle dont on ne saurait plus lire les valeurs, la sorte vivant sur le cercle et non sur le sommet.\n\nLa sortie « Cercle » porte l'assemblage. Le message dit la forme obtenue et le nombre de places.`,
    noticeEn: `Puts the circles connected to its inputs end to end, in the order of the inputs, and returns the assembly.\n\nThe « + » and « - » buttons under the inputs make the node longer or shorter, up to ${ENTREES} circles. A connected input is never hidden.\n\n« Assembly » decides what end to end means, and the two do not make the same music.\n• « One after another » returns a series: each circle keeps its number of positions and occupies one turn. This is the form a variation loop produces, and the renderer plays it on a single voice, one circle per turn.\n• « As a single cycle » returns one circle whose number of positions is the sum of theirs: sixteen and twelve give twenty-eight, the onsets of the second being shifted by sixteen. The cycle is then one object, measured and transformed as such.\n\nThe same kind is required for a single cycle: joining a percussion and a melody would give a circle whose values could no longer be read, the kind living on the circle and not on the vertex.\n\nThe « Circle » output carries the assembly. The message states the form obtained and the number of positions.`,
    entrees: Array.from({ length: ENTREES }, (_, k) => ({
      nom: `Cercle ${k + 1}`, nomEn: `Circle ${k + 1}`, type: "cercle", requis: false,
    })),
    entreesExtensibles: { min: 2, defaut: 2 },
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [
      { nom: "Assemblage", nomEn: "Assembly", type: "choix",
        options: ["L'un après l'autre", "En un seul cycle"],
        optionsEn: ["One after another", "As a single cycle"],
        optionIds: ["suite", "cycle"],
        defaut: "L'un après l'autre", defautEn: "One after another",
        doc: "Une suite de tours, chaque cercle gardant ses places, ou un cycle unique dont les places s'additionnent.",
        docEn: "A series of turns, each circle keeping its positions, or a single cycle whose positions add up." },
    ],
    async executer(ctx: any) {
      const suite: Cercle[] = [];
      for (let i = 0; i < ENTREES; i++) suite.push(...enSuite(ctx.entree(i)));
      if (suite.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "No circle at the inputs." : "Aucun cercle à l'entrée.",
        };
      }
      if (ctx.paramTexte("Assemblage", "suite") === "suite") {
        return {
          valeurs: [suite.length === 1 ? suite[0] : suite],
          message: `${suite.length} ${en() ? "in a row" : "à la suite"} · `
            + `${suite.map((c) => c.positions).join(" + ")} ${en() ? "positions" : "places"}`,
        };
      }
      const cycle = suite.reduce<Cercle | null>((a, b) => (a === null ? b : joindre(a, b)), null);
      if (!cycle) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Two different kinds cannot be joined." : "Deux sortes différentes ne se joignent pas.",
        };
      }
      return {
        valeurs: [cycle],
        message: `${en() ? "one cycle" : "un cycle"} · ${cycle.positions} ${en() ? "positions" : "places"} · `
          + `${cycle.sommets.length} ${en() ? "onsets" : "attaques"}`,
      };
    },
  },
  {
    id: "cercle-melangeur",
    nom: "Mélangeur de cercles", nomEn: "Circle Mixer",
    univers: "Autres", famille: "Circle",
    resume: "Superpose plusieurs cercles en un seul, sur la grille que leurs tailles partagent.",
    resumeEn: "Superimposes several circles into one, on the grid their sizes share.",
    notice: `Superpose les cercles reçus en un seul, et rend le cercle obtenu. Le port accepte autant de câbles qu'on y tire.\n\nLa grille est le plus petit commun multiple de leurs nombres de places : seize et douze se posent tous deux sur quarante-huit, et chaque attaque y garde l'instant qu'elle avait dans son cycle. Rapprocher les attaques de la place la plus proche déplacerait le rythme sans le dire.\n\nElle peut refuser. Seize et dix donneraient quatre-vingts places, au-delà du maximum de ${POSITIONS_MAX} : le composant le dit plutôt que de rendre un cercle qu'aucun éditeur ne saurait montrer. Des tailles qui se divisent, seize et huit, douze et quatre, donnent toujours une grille tenable.\n\nLa même sorte est exigée : superposer une percussion et une mélodie donnerait un cercle dont on ne saurait plus lire les valeurs.\n\nDeux attaques qui tombent sur la même place n'en font qu'une, celle du premier cercle reçu. Le message dit combien se sont ainsi confondues.\n\nLa sortie « Cercle » porte la superposition. Le message donne la taille de la grille et le nombre d'attaques.`,
    noticeEn: `Superimposes the received circles into one, and returns the circle obtained. The port accepts as many cables as are drawn into it.\n\nThe grid is the least common multiple of their numbers of positions: sixteen and twelve both land on forty-eight, and every onset keeps there the instant it had in its own cycle. Moving onsets to the nearest position would shift the rhythm without saying so.\n\nIt can refuse. Sixteen and ten would give eighty positions, beyond the maximum of ${POSITIONS_MAX}: the node says so rather than return a circle no editor could show. Sizes that divide one another, sixteen and eight, twelve and four, always give a workable grid.\n\nThe same kind is required: superimposing a percussion and a melody would give a circle whose values could no longer be read.\n\nTwo onsets that fall on the same position become one, that of the first circle received. The message states how many merged that way.\n\nThe « Circle » output carries the superimposition. The message gives the size of the grid and the number of onsets.`,
    entrees: [{ nom: "Cercle", nomEn: "Circle", type: "cercle", dynamique: true }],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [],
    async executer(ctx: any) {
      const recus: Cercle[] = [];
      for (const v of ctx.entrees()) recus.push(...enSuite(v));
      if (recus.length < 2) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Connect at least two circles." : "Brancher au moins deux cercles.",
        };
      }
      const sortie = melanger(recus);
      if (!sortie) {
        const memeSorte = recus.every((c) => c.sorte === recus[0].sorte);
        return {
          valeurs: [null], erreur: true,
          message: memeSorte
            ? (en()
              ? `The shared grid goes beyond ${POSITIONS_MAX} positions.`
              : `La grille commune dépasse ${POSITIONS_MAX} places.`)
            : (en() ? "Two different kinds cannot be mixed." : "Deux sortes différentes ne se mêlent pas."),
        };
      }
      const confondues = recus.reduce((n, c) => n + c.sommets.length, 0) - sortie.sommets.length;
      return {
        valeurs: [sortie],
        message: `${recus.length} ${en() ? "circles" : "cercles"} · ${sortie.positions} `
          + `${en() ? "positions" : "places"} · ${sortie.sommets.length} ${en() ? "onsets" : "attaques"}`
          + (confondues > 0 ? ` · ${confondues} ${en() ? "merged" : "confondues"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
