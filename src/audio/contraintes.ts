// audio/contraintes.ts — Chercher une suite qui satisfait des règles, au lieu de la juger.
//
// CE QUI MANQUAIT, ET LE TABLEAU LE DISAIT. `COMPOSITION-ASSISTEE.md` range les solveurs de
// contraintes d'OpenMusic, Situation, OMCS, OMRC, Cluster Engine, OMGecode, sous « un solveur, à
// écrire », en notant qu'Attic ne sait que VÉRIFIER. La différence n'est pas de degré : un
// vérificateur reçoit une pièce finie et dit ce qui cloche ; un solveur reçoit des règles et une
// étendue de possibles, et rend une pièce qui les respecte. La seconde opération fait le travail
// du compositeur, la première celle du professeur.
//
// LE PRINCIPE, ET IL EST ANCIEN. Retour sur trace : on affecte les variables de la gauche vers la
// droite, on éprouve les règles à chaque pas, et dès qu'un préfixe est déjà fautif on rebrousse
// chemin sans explorer ce qui en découle. C'est ce qui rend la chose praticable : juger seulement
// les suites complètes demanderait d'en engendrer un nombre qui croît comme une puissance.
//
// UNE RÈGLE JUGE UN PRÉFIXE, ET C'EST TOUT LE CONTRAT. Elle reçoit ce qui est déjà posé et dit si
// cela reste possible. Une règle qui ne saurait juger qu'une suite entière ne ferait pas élaguer,
// et le solveur retomberait sur l'énumération. C'est pourquoi le contrat porte aussi `complet` :
// une règle de cadence ne s'applique qu'à la fin, et l'appliquer plus tôt condamnerait tout.
//
// LE BUDGET EST UNE PIÈCE DU CONTRAT, NON UNE PRÉCAUTION. Un problème sur-contraint n'a pas de
// solution, et rien ne le dit d'avance : sans borne, la recherche tournerait jusqu'à épuiser la
// patience de qui l'a lancée. Le solveur rend donc ce qu'il a trouvé, ce qu'il a exploré, et s'il a
// renoncé, ce qui permet de distinguer « il n'y en a pas » de « je n'ai pas fini de chercher ».
//
// CE QU'IL N'EST PAS. Ni propagation de contraintes, ni apprentissage de clauses, ni choix de
// variable par heuristique : les variables sont prises dans l'ordre du temps, qui est celui d'une
// ligne musicale. Un solveur général ferait mieux sur des problèmes qui ne sont pas des suites ;
// les problèmes musicaux de cette famille en sont.

import { creerAleatoire } from "../core";

/** Une règle, qui juge ce qui est déjà posé. */
export interface Contrainte {
  /** Un identifiant stable, pour dire laquelle a bloqué. */
  nom: string;
  /**
   * Rend faux quand le préfixe `valeurs[0..i]` est déjà impossible.
   *
   * `complet` est vrai quand `i` est la dernière variable : c'est là que s'appliquent les règles de
   * fin, qui condamneraient toute recherche si on les éprouvait en chemin.
   */
  admet: (valeurs: readonly number[], i: number, complet: boolean) => boolean;
}

export interface OptionsSolveur {
  /** Combien d'affectations essayer au plus avant de renoncer. */
  budget?: number;
  /** Fixe l'ordre dans lequel les valeurs d'un domaine sont essayées. */
  graine?: number;
  /** Combien de solutions rendre. */
  combien?: number;
  /**
   * Essayer les valeurs dans l'ordre du domaine plutôt qu'au hasard.
   *
   * L'ORDRE DÉCIDE DE CE QU'ON TROUVE EN PREMIER, non de ce qui existe. À domaine ordonné par
   * hauteur, la première solution rase le grave ; tirées au hasard, deux graines donnent deux
   * pièces différentes également valides, ce qui est ce qu'on attend d'un outil de composition.
   */
  ordonne?: boolean;
}

export interface Resolution {
  solutions: number[][];
  /** Combien d'affectations ont été essayées. */
  noeuds: number;
  /** Vrai quand le budget s'est épuisé avant la fin de l'exploration. */
  abandonne: boolean;
  /** La plus longue affectation atteinte, quand aucune n'aboutit : où la recherche a buté. */
  meilleurPartiel: number[];
  /** Le nom de la règle qui a le plus souvent fait rebrousser chemin. */
  regleBloquante: string;
}

/**
 * Cherche des suites qui satisfont toutes les règles.
 *
 * LES RÈGLES SONT ÉPROUVÉES DANS L'ORDRE OÙ ELLES SONT DONNÉES, et la première qui refuse arrête
 * l'examen : mettre les moins coûteuses en tête accélère la recherche sans rien changer au
 * résultat. Le compte des refus par règle est tenu, parce que savoir laquelle bloque est ce qui
 * permet de desserrer un problème sans solution.
 */
export function resoudre(
  domaines: readonly (readonly number[])[],
  contraintes: readonly Contrainte[],
  o: OptionsSolveur = {},
): Resolution {
  const budget = Math.max(1, Math.round(o.budget ?? 200000));
  const combien = Math.max(1, Math.round(o.combien ?? 1));
  const hasard = creerAleatoire(Math.round(o.graine ?? 1));
  const n = domaines.length;

  const solutions: number[][] = [];
  const valeurs: number[] = new Array(n).fill(0);
  let noeuds = 0;
  let abandonne = false;
  let plusLoin = 0;
  const meilleurPartiel: number[] = [];
  const refus = new Map<string, number>();

  if (n === 0) return { solutions: [], noeuds: 0, abandonne: false, meilleurPartiel: [], regleBloquante: "" };

  /** Les valeurs d'un domaine, dans l'ordre où on les essaiera. */
  const ordreDe = (i: number): number[] => {
    const liste = [...domaines[i]];
    if (o.ordonne) return liste;
    // Mélange de Fisher et Yates, tiré de la graine : reproductible, et sans biais.
    for (let k = liste.length - 1; k > 0; k--) {
      const j = Math.floor(hasard() * (k + 1));
      [liste[k], liste[j]] = [liste[j], liste[k]];
    }
    return liste;
  };

  const poser = (i: number): boolean => {
    if (i === n) {
      solutions.push([...valeurs]);
      return solutions.length >= combien;
    }
    for (const v of ordreDe(i)) {
      if (noeuds >= budget) { abandonne = true; return true; }
      noeuds++;
      valeurs[i] = v;
      let refusee: string | null = null;
      for (const c of contraintes) {
        if (!c.admet(valeurs, i, i === n - 1)) { refusee = c.nom; break; }
      }
      if (refusee !== null) {
        refus.set(refusee, (refus.get(refusee) ?? 0) + 1);
        continue;
      }
      if (i + 1 > plusLoin) {
        plusLoin = i + 1;
        meilleurPartiel.length = 0;
        meilleurPartiel.push(...valeurs.slice(0, i + 1));
      }
      if (poser(i + 1)) return true;
    }
    return false;
  };

  poser(0);

  let regleBloquante = "";
  let pire = 0;
  for (const [nom, combienDeFois] of refus) {
    if (combienDeFois > pire) { pire = combienDeFois; regleBloquante = nom; }
  }
  return { solutions, noeuds, abandonne, meilleurPartiel, regleBloquante };
}

// ── Les règles ordinaires d'une ligne ──────────────────────────────────

/** Les hauteurs permises entre deux bornes, restreintes à des degrés quand on en donne. */
export function domaineHauteurs(grave: number, aigu: number, degres?: readonly number[]): number[] {
  const sortie: number[] = [];
  const permis = degres && degres.length > 0 ? new Set(degres.map((d) => ((d % 12) + 12) % 12)) : null;
  for (let h = Math.ceil(grave); h <= Math.floor(aigu); h++) {
    if (!permis || permis.has(((h % 12) + 12) % 12)) sortie.push(h);
  }
  return sortie;
}

/** Interdit un saut mélodique plus grand que la borne. */
export const ecartMaximal = (demiTons: number): Contrainte => ({
  nom: "ecart",
  admet: (v, i) => i === 0 || Math.abs(v[i] - v[i - 1]) <= demiTons,
});

/** Interdit qu'une même hauteur se répète plus de `combien` fois de suite. */
export const repetitionMaximale = (combien: number): Contrainte => ({
  nom: "repetition",
  admet: (v, i) => {
    let suite = 1;
    for (let k = i; k > 0 && v[k] === v[k - 1]; k--) suite++;
    return suite <= combien;
  },
});

/** Impose une hauteur à une place donnée : ce par quoi on commence ou l'on finit. */
export const hauteurImposee = (place: number, hauteur: number): Contrainte => ({
  nom: "imposee",
  admet: (v, i) => i !== place || v[i] === hauteur,
});
