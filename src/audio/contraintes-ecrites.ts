// audio/contraintes-ecrites.ts — Des règles écrites, données à chercher au solveur.
//
// CE QUE CELA LÈVE. `audio/contraintes.ts` cherche une suite qui satisfait des règles, et il le fait
// bien : retour sur trace, élagage sur les préfixes, preuve d'absence distincte de l'abandon. Mais
// ses règles s'écrivaient en TypeScript, donc elles étaient hors de portée depuis l'interface, et
// `COMPOSITION-ASSISTEE.md` le notait comme ce qui restait du chantier des solveurs. Ce module
// compile une expression écrite en une règle que le solveur accepte.
//
// LA RÈGLE JUGE UN PRÉFIXE, ET C'EST TOUT L'INTÉRÊT DU SOLVEUR. Elle ne reçoit pas une suite finie
// mais ce qui est déjà posé, et dit si cela reste possible. Une règle qui ne saurait juger qu'une
// suite entière n'élaguerait rien, et la recherche retomberait sur l'énumération : c'est pourquoi
// les variables offertes portent sur la place en cours et sur ce qui la précède, non sur la suite
// entière, qui n'existe pas encore.
//
// `complet` EXISTE POUR LES RÈGLES DE FIN. Une règle de cadence, ou une somme à atteindre, ne peut
// pas s'éprouver en chemin : l'appliquer à chaque pas condamnerait toute recherche. Elle s'écrit
// donc « complet == 0 or ... », et le solveur ne la voit mordre qu'à la dernière place.
//
// L'ÉVALUATEUR EST CELUI DU DÉPÔT, `mathjs`, compilé une fois puis évalué par essai. Il n'exécute
// pas de code : ce qu'on y écrit ne peut ni lire ni écrire quoi que ce soit.

import { compile } from "mathjs";
import type { Contrainte } from "./contraintes";

/** Les variables qu'une règle peut lire, dans les deux langues. */
export const VARIABLES_REGLE = {
  fr: ["x", "i", "n", "precedent", "avant2", "premier", "complet", "somme", "plusPetit", "plusGrand"],
  en: ["x", "i", "n", "previous", "before2", "first", "complete", "sum", "smallest", "largest"],
} as const;

/** Ce qu'une règle voit, pour une place et ce qui la précède. */
function porteeDe(valeurs: readonly number[], i: number, complet: boolean): Record<string, number> {
  const posees = valeurs.slice(0, i + 1);
  const x = valeurs[i];
  // AVANT LA PREMIÈRE PLACE IL N'Y A RIEN, et rendre zéro ferait croire à une note grave. On rend
  // la valeur en cours : une règle écrite « abs(x - precedent) <= 4 » est alors vraie au premier
  // pas, ce qui est le comportement voulu, une première note n'ayant pas d'intervalle.
  const precedent = i > 0 ? valeurs[i - 1] : x;
  const avant2 = i > 1 ? valeurs[i - 2] : precedent;
  let somme = 0, plusPetit = Infinity, plusGrand = -Infinity;
  for (const v of posees) {
    somme += v;
    if (v < plusPetit) plusPetit = v;
    if (v > plusGrand) plusGrand = v;
  }
  return {
    x, i, n: valeurs.length, precedent, avant2, premier: valeurs[0],
    complet: complet ? 1 : 0, somme, plusPetit, plusGrand,
    previous: precedent, before2: avant2, first: valeurs[0],
    complete: complet ? 1 : 0, sum: somme, smallest: plusPetit, largest: plusGrand,
  };
}

export interface RegleEcrite {
  nom: string;
  texte: string;
}

export interface CompilationRegles {
  contraintes: Contrainte[];
  /** Ce qui n'a pas pu être compilé, une fois par règle fautive. */
  erreurs: string[];
}

/**
 * Compile des règles écrites en contraintes que le solveur accepte.
 *
 * UNE RÈGLE FAUTIVE EST ÉCARTÉE, NON SUBIE. La laisser refuser tout ferait chercher en vain une
 * suite qu'aucune valeur ne satisfait, et le solveur rendrait une absence de solution qui serait en
 * réalité une faute de frappe. Elle est donc retirée et dite, et la recherche porte sur les autres.
 */
export function compilerRegles(regles: readonly RegleEcrite[]): CompilationRegles {
  const contraintes: Contrainte[] = [];
  const erreurs: string[] = [];
  for (const { nom, texte } of regles) {
    const t = String(texte ?? "").trim();
    if (!t) continue;
    let compilee: { evaluate: (p: Record<string, number>) => unknown };
    try {
      compilee = compile(t);
    } catch (err: any) {
      erreurs.push(`${nom} : ${String(err?.message ?? err)}`);
      continue;
    }
    // Une évaluation d'essai : une règle qui jette à chaque appel coûterait un essai par nœud
    // exploré, et le solveur en explore des dizaines de milliers.
    try {
      compilee.evaluate(porteeDe([60], 0, true));
    } catch (err: any) {
      erreurs.push(`${nom} : ${String(err?.message ?? err)}`);
      continue;
    }
    contraintes.push({
      nom,
      admet: (valeurs, i, complet) => {
        try {
          const v = compilee.evaluate(porteeDe(valeurs, i, complet));
          return typeof v === "boolean" ? v : Number(v) !== 0;
        } catch {
          // UNE ÉVALUATION QUI JETTE N'INTERDIT PAS. Refuser sur une erreur ferait d'une faute une
          // impossibilité, et le solveur prouverait très sérieusement qu'il n'y a pas de solution.
          return true;
        }
      },
    });
  }
  return { contraintes, erreurs };
}
