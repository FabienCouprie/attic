// plugins/cercle-boucle.ts — Les deux nœuds qui encadrent une chaîne de transformations de cercle.
//
// POURQUOI CELLE-CI EXISTE ALORS QUE DEUX BOUCLES EXISTENT DÉJÀ. Les deux autres DÉCOUPENT une
// valeur reçue : une séquence en voix, une ligne de temps en créneaux. Chaque passe y reçoit un
// morceau différent du même tout, et le corps ne sait rien de ce que la passe précédente a produit.
// Une variation, elle, se construit sur la précédente : trois rotations d'une place font une
// rotation de trois, mais trois permutations tirées ne font pas la troisième. Il faut donc une
// boucle qui RÉINJECTE, et c'est ce que celle-ci ajoute.
//
// ET POURQUOI ELLE PARLE « CERCLE ». Une boucle par créneau rend une séquence : rien dans une
// chaîne de cercles ne sait la recevoir, et son début reste relié à rien. Un début relié à rien
// n'est pas une structure : le moteur le tolère, mais personne ne peut lire le graphe. Le début
// prend donc un cercle et en rend un, la chaîne s'y branche, et l'appartenance à la boucle se voit.
// Voir `scripts/contrat-graphe.mjs`, écrit après ce défaut.
//
// LA RÉTROACTION NE FERME PAS DE CYCLE. Relier la fin au début serait un cycle, et le graphe
// l'interdit. Le début s'exécutant avant la fin dans une passe, il lit ce que la fin a déposé au
// tour d'avant dans `boucleSequencesGlobal.ts`, le même module ambiant que les deux autres boucles
// emploient. Le graphe reste acyclique, et rien du moteur n'est touché.

import type { FicheAudio } from "../audio/types-domaine";
import { POSITIONS_MAX, enSuite } from "../audio/cercle";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  boucleDeLaFin, boucleDuDebut, decouvrirPour, FICHE_CERCLE_DEBUT, FICHE_CERCLE_FIN,
  recoltePrecedentePour, recolterPour,
} from "./boucleSequencesGlobal";

const en = () => langueCourante() === "en";

/**
 * Le nombre de variations est LIBRE, comme sur les autres débuts de boucle.
 *
 * Il était clos à trente-deux, et le réglage portait donc une glissière. Une grandeur sans borne
 * haute n'en porte pas : c'est la dérogation décidée pour toutes les boucles. Ce qui l'arrête est le
 * nombre total de passes que le pilote accepte, `PASSES_MAX_TOTAL`, qui vaut pour les boucles
 * emboîtées ensemble et non pour celle-ci seule ; le message donne le rang atteint sur le nombre
 * demandé, de sorte qu'une valeur hors d'atteinte se voit.
 */
const VARIATIONS_MIN = 1;

export const fiches: FicheAudio[] = ([
  {
    id: FICHE_CERCLE_DEBUT,
    nom: "Début de boucle par cercle", nomEn: "Circle Loop Start",
    univers: "Autres", famille: "Circle",
    resume: "Ouvre une boucle de variation : chaque passe reçoit le cercle que la précédente a produit.",
    resumeEn: "Opens a variation loop: each pass receives the circle the previous one produced.",
    notice: `Ouvre une boucle de variation sur le cercle reçu : ce qui est posé entre ce composant et « Fin de boucle par cercle » est calculé une fois par variation, et chaque passe reçoit le cercle que la passe précédente a produit.\n\nLa première passe rend le cercle d'entrée tel quel, les suivantes rendent le résultat de la passe d'avant. Une rotation d'une place posée dans la boucle donne donc le cercle, puis le cercle tourné d'une place, puis de deux, et ainsi de suite. Une permutation tirée donne la permutation de la permutation, qui n'est pas la permutation d'une autre graine.\n\n« Variations » fixe le nombre de passes, donc le nombre de cercles que la fin recueillera. Le nombre est libre ; ce qui l'arrête est le nombre total de passes que l'exécution accepte, boucles emboîtées ensemble, et le message donne alors le rang atteint sur le nombre demandé.\n\nLa réinjection ne passe pas par un câble : relier la fin au début fermerait un cycle, et un graphe n'en accepte pas. Le début s'exécute avant la fin dans une passe, et lit ce qu'elle a déposé au tour d'avant.\n\nLa sortie « Cercle » rend le cercle de la passe en cours. Le message donne le rang de la passe et le nombre de variations.`,
    noticeEn: `Opens a variation loop on the received circle: what is laid between this node and « Circle Loop End » is computed once per variation, and each pass receives the circle the previous pass produced.\n\nThe first pass returns the input circle as it stands, the following ones return the result of the pass before. A rotation by one position laid inside the loop therefore gives the circle, then the circle turned by one position, then by two, and so on. A drawn permutation gives the permutation of the permutation, which is not the permutation of another seed.\n\n« Variations » sets the number of passes, hence the number of circles the end will collect. The number is free; what stops it is the total number of passes the run accepts, nested loops taken together, and the message then gives the rank reached out of the number asked for.\n\nThe feedback does not go through a cable: connecting the end to the start would close a cycle, and a graph does not accept one. The start runs before the end within a pass, and reads what the end laid down on the turn before.\n\nThe « Circle » output returns the circle of the current pass. The message gives the rank of the pass and the number of variations.`,
    entrees: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [
      { nom: "Variations", nomEn: "Variations", plage: [VARIATIONS_MIN, Infinity], pas: 1, defaut: 4,
        doc: "Combien de fois la chaîne est calculée, donc combien de cercles la fin recueille. Le nombre est libre ; le message donne le rang de la passe sur le nombre demandé, de sorte qu'une valeur que le nombre total de passes ne laisse pas atteindre se voit.",
        docEn: "How many times the chain is computed, hence how many circles the end collects. The number is free; the message gives the rank of the pass out of the number asked for, so that a value the total pass count does not allow shows up." },
    ],
    async executer(ctx: any) {
      // LA SOURCE PEUT DÉJÀ ÊTRE UNE SUITE, et elle ne se réduit pas à son premier cercle : une
      // boucle branchée sur une autre transformerait alors quatre variations en une seule, sans
      // rien dire. Ce qui entre entre en entier.
      const source = enSuite(ctx.entree(0));
      if (source.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "No circle at the input." : "Aucun cercle à l'entrée.",
        };
      }
      const combien = Math.max(VARIATIONS_MIN, Math.round(ctx.paramNombre("Variations", 4)));
      // LA DÉCOUVERTE DIT SEULEMENT LE COMPTE. Les deux autres boucles y publient les morceaux à
      // parcourir, qui existent d'avance ; ici les cercles des passes suivantes n'existent pas
      // encore, puisqu'ils sont ce que la chaîne produira. Le pilote n'en lit que la longueur.
      decouvrirPour(ctx.noeud.id, new Array(combien).fill(null));

      const b = boucleDuDebut(ctx.noeud.id);
      const precedent = enSuite(recoltePrecedentePour(ctx.noeud.id));
      const courant = precedent.length > 0 ? precedent : source;
      const rang = b?.index ?? 0;
      const total = b?.morceaux.length ?? combien;
      const attaques = courant.reduce((n, c) => n + c.sommets.length, 0);
      return {
        valeurs: [courant.length === 1 ? courant[0] : courant],
        message: `${en() ? "variation" : "variation"} ${rang + 1}/${total} · `
          + `${attaques} ${en() ? "onsets" : "attaques"} · ${courant[0].positions} `
          + `${en() ? "positions" : "places"}`,
      };
    },
  },
  {
    id: FICHE_CERCLE_FIN,
    nom: "Fin de boucle par cercle", nomEn: "Circle Loop End",
    univers: "Autres", famille: "Circle",
    resume: "Referme une boucle de variation et rend la suite des cercles produits, un par tour.",
    resumeEn: "Closes a variation loop and returns the series of circles produced, one per turn.",
    notice: `Referme une boucle de variation et rend la suite des cercles que les passes ont produits. Le cercle de chaque passe est rendu au début de la passe suivante, ce qui fait la chaîne.\n\nLa sortie porte plusieurs cercles là où un éditeur n'en porte qu'un. Branchée sur une entrée du rendu, cette suite devient une voix qui se déroule dans le temps : le premier cercle au premier tour, le deuxième au deuxième, et ainsi de suite. Trois boucles branchées sur trois entrées donnent donc trois voix qui varient ensemble, le rendu décidant seul de la base de temps.\n\nLes passes intermédiaires rendent le cercle qu'elles ont reçu, non la suite : tant que la boucle tourne, la suite n'existe pas encore.\n\nLa sortie « Cercle » porte la suite. Le message donne le rang de la passe, et à la dernière le nombre de variations recueillies.`,
    noticeEn: `Closes a variation loop and returns the series of circles the passes produced. The circle of each pass is handed to the start of the next pass, which makes the chain.\n\nThe output carries several circles where an editor carries only one. Connected to an input of the renderer, this series becomes a voice that unfolds in time: the first circle on the first turn, the second on the second, and so on. Three loops connected to three inputs therefore give three voices that vary together, the renderer alone deciding the time base.\n\nThe intermediate passes return the circle they received, not the series: as long as the loop runs, the series does not yet exist.\n\nThe « Circle » output carries the series. The message gives the rank of the pass, and at the last one the number of variations collected.`,
    entrees: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    sorties: [{ nom: "Cercle", nomEn: "Circle", type: "cercle" }],
    parametres: [],
    async executer(ctx: any) {
      // CE QUI ARRIVE ARRIVE EN ENTIER. Une passe peut avoir produit plusieurs cercles, parce qu'une
      // boucle en contenait une autre ou qu'une source en portait déjà une suite : n'en garder que
      // le premier perdrait le reste en silence.
      const recu = enSuite(ctx.entree(0));
      if (recu.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "No circle at the input." : "Aucun cercle à l'entrée.",
        };
      }
      recolterPour(ctx.noeud.id, recu);

      const b = boucleDeLaFin(ctx.noeud.id);
      if (!b) {
        return {
          valeurs: [recu.length === 1 ? recu[0] : recu],
          message: en() ? "no loop open, passed through" : "aucune boucle ouverte, laissé tel quel",
        };
      }
      if (b.index < b.morceaux.length - 1) {
        return {
          valeurs: [recu.length === 1 ? recu[0] : recu],
          message: `${en() ? "pass" : "passe"} ${b.index + 1}/${b.morceaux.length}`,
        };
      }
      // Les passes mises bout à bout : une passe qui a produit plusieurs cercles les verse tous, et
      // la suite compte donc les cercles, non les passes.
      const suite = b.recoltes.flatMap((r) => enSuite(r));
      if (suite.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Every pass came back empty." : "Toutes les passes sont revenues vides.",
        };
      }
      const tailles = [...new Set(suite.map((c) => c.positions))];
      return {
        valeurs: [suite],
        message: `${suite.length} ${en() ? "variations" : "variations"} · `
          + `${tailles.join(" / ")} ${en() ? "positions" : "places"}`
          + (suite[0].positions > POSITIONS_MAX ? ` · ${en() ? "beyond the maximum" : "au-delà du maximum"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
