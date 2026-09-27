// audio/evolution.ts — Faire évoluer une suite vers ce qu'on lui demande.
//
// POURQUOI UN SECOND CHEMIN, PUISQU'IL Y A DÉJÀ UN SOLVEUR. Parce qu'ils ne répondent pas à la même
// question. `audio/contraintes.ts` cherche une suite qui satisfait TOUTES les règles, et quand il
// n'en existe aucune il le prouve et rend les mains vides ; c'est ce qu'il a fait sur le contrepoint
// au saut trop court. Un compositeur, devant cette réponse, ne veut pas une preuve d'impossibilité,
// il veut la ligne la MOINS MAUVAISE. C'est ce que fait une population qui évolue : elle ne connaît
// pas l'interdit, seulement le coût, donc elle rend toujours quelque chose et dit ce qu'il coûte.
//
// LA DIFFÉRENCE EST DANS LA NATURE DE LA RÉPONSE, non dans la puissance. Le solveur est exact : ce
// qu'il rend est juste, et ce qu'il refuse n'existe pas. L'évolution est heuristique : elle ne
// démontre rien, et deux exécutions ne donnent pas la même chose. Employer l'une pour l'autre est
// l'erreur à ne pas faire, et c'est pourquoi les deux vivent dans deux modules.
//
// LE PROCÉDÉ EST LE PLUS ORDINAIRE QUI SOIT, et c'est voulu : une population de suites, un coût par
// suite, une sélection par tournoi, un croisement en un point, une mutation par gène, et quelques
// individus qui passent intacts d'une génération à l'autre. Les variantes savantes se justifient sur
// des problèmes dont on connaît la structure ; ici la structure est celle qu'écrivent les objectifs,
// et elle change à chaque usage.
//
// L'ÉLITISME N'EST PAS UN RÉGLAGE DE CONFORT. Sans lui, le meilleur individu d'une génération peut
// disparaître de la suivante, et la courbe de convergence remonte : on croirait alors l'algorithme
// détraqué alors qu'il aurait simplement perdu ce qu'il avait trouvé.

import { creerAleatoire } from "../core";
import type { Contrainte } from "./contraintes";

/** Ce qu'on demande à une suite, et ce que coûte de ne pas le faire. */
export interface Objectif {
  nom: string;
  /** Zéro quand la suite fait ce qu'on demande ; plus c'est grand, plus elle s'en écarte. */
  cout: (valeurs: readonly number[]) => number;
  /** Ce que cet objectif pèse dans le total. */
  poids: number;
}

export interface OptionsEvolution {
  population?: number;
  generations?: number;
  /** La chance qu'un gène change, à chaque naissance. */
  mutation?: number;
  /** Combien d'individus passent intacts à la génération suivante. */
  elitisme?: number;
  /** Combien d'individus s'affrontent pour être parent. Deux : la sélection est douce ; huit : dure. */
  tournoi?: number;
  graine?: number;
  /** On s'arrête dès qu'un individu descend à ce coût ou en dessous. */
  cible?: number;
}

export interface Evolution {
  meilleur: number[];
  cout: number;
  /** Combien de générations ont été parcourues. */
  generations: number;
  /** Le coût du meilleur à chaque génération : la courbe de convergence. */
  histoire: number[];
  /** Ce que le meilleur coûte, objectif par objectif, avant pondération. */
  parObjectif: { nom: string; cout: number }[];
  /** Vrai quand la cible a été atteinte avant la dernière génération. */
  atteinte: boolean;
}

/**
 * Fait évoluer une population de suites vers le moindre coût.
 *
 * LES DOMAINES BORNENT LES GÈNES, comme ils bornent les variables du solveur : une mutation tire
 * dans le domaine de la place qu'elle touche, jamais ailleurs. Ce qui est impossible par
 * construction n'a donc pas à être payé par un objectif, et le coût ne parle que de ce qui se
 * discute.
 */
export function evoluer(
  domaines: readonly (readonly number[])[],
  objectifs: readonly Objectif[],
  o: OptionsEvolution = {},
): Evolution {
  const n = domaines.length;
  const taille = Math.max(4, Math.round(o.population ?? 60));
  const generations = Math.max(1, Math.round(o.generations ?? 120));
  const pMutation = Math.max(0, Math.min(1, o.mutation ?? 0.15));
  const elitisme = Math.max(0, Math.min(taille - 1, Math.round(o.elitisme ?? 2)));
  const tournoi = Math.max(2, Math.round(o.tournoi ?? 3));
  const cible = o.cible ?? 0;
  const hasard = creerAleatoire(Math.round(o.graine ?? 1));

  const vide: Evolution = {
    meilleur: [], cout: 0, generations: 0, histoire: [], parObjectif: [], atteinte: true,
  };
  if (n === 0 || domaines.some((d) => d.length === 0)) return vide;

  const tirerGene = (i: number) => domaines[i][Math.floor(hasard() * domaines[i].length)];
  const tirerIndividu = () => Array.from({ length: n }, (_, i) => tirerGene(i));
  const total = (v: readonly number[]) =>
    objectifs.reduce((s, ob) => s + ob.poids * ob.cout(v), 0);

  let population = Array.from({ length: taille }, tirerIndividu);
  let couts = population.map(total);
  const histoire: number[] = [];
  let meilleur = population[0], coutMeilleur = couts[0];
  const retenirMeilleur = () => {
    couts.forEach((c, k) => {
      if (c < coutMeilleur) { coutMeilleur = c; meilleur = [...population[k]]; }
    });
  };
  retenirMeilleur();
  histoire.push(coutMeilleur);

  let faites = 0;
  let atteinte = coutMeilleur <= cible;
  for (let g = 0; g < generations && !atteinte; g++) {
    faites = g + 1;
    // Le tournoi : on tire quelques individus et l'on garde le moins coûteux. C'est la sélection la
    // plus simple qui ne dépende pas de l'échelle des coûts, laquelle change avec les poids.
    const parent = (): number[] => {
      let choisi = Math.floor(hasard() * taille);
      for (let k = 1; k < tournoi; k++) {
        const autre = Math.floor(hasard() * taille);
        if (couts[autre] < couts[choisi]) choisi = autre;
      }
      return population[choisi];
    };

    const rangs = couts.map((c, k) => [c, k] as const).sort((a, b) => a[0] - b[0]);
    const suivante: number[][] = rangs.slice(0, elitisme).map(([, k]) => [...population[k]]);
    while (suivante.length < taille) {
      const a = parent(), b = parent();
      // Croisement en un point : l'enfant prend le début de l'un et la fin de l'autre. Sur une
      // suite musicale, cela garde des MORCEAUX de ligne entiers, là où un croisement uniforme
      // mêlerait les gènes un à un et détruirait les enchaînements qui font la valeur d'un parent.
      const coupe = 1 + Math.floor(hasard() * Math.max(1, n - 1));
      const enfant = [...a.slice(0, coupe), ...b.slice(coupe)];
      for (let i = 0; i < n; i++) if (hasard() < pMutation) enfant[i] = tirerGene(i);
      suivante.push(enfant);
    }
    population = suivante;
    couts = population.map(total);
    retenirMeilleur();
    histoire.push(coutMeilleur);
    if (coutMeilleur <= cible) atteinte = true;
  }

  return {
    meilleur, cout: coutMeilleur, generations: faites, histoire, atteinte,
    parObjectif: objectifs.map((ob) => ({ nom: ob.nom, cout: ob.cout(meilleur) })),
  };
}

// ── Des objectifs ordinaires ───────────────────────────────────────────

/**
 * Compte les règles qu'une suite enfreint : le pont entre les deux chemins.
 *
 * C'EST CE QUI PERMET DE REPRENDRE UN PROBLÈME QUE LE SOLVEUR A DÉCLARÉ SANS SOLUTION, avec les
 * MÊMES règles, sans en réécrire une seule. Là où il refusait, on paie ; là où il s'arrêtait, on
 * rend la ligne qui enfreint le moins.
 */
export function objectifContraintes(contraintes: readonly Contrainte[], poids = 1): Objectif {
  return {
    nom: "contraintes",
    poids,
    cout: (v) => {
      let combien = 0;
      for (let i = 0; i < v.length; i++) {
        for (const c of contraintes) if (!c.admet(v, i, i === v.length - 1)) combien++;
      }
      return combien;
    },
  };
}

/** Le saut moyen d'une suite, en demi-tons. */
export function sautMoyen(v: readonly number[]): number {
  if (v.length < 2) return 0;
  let somme = 0;
  for (let i = 1; i < v.length; i++) somme += Math.abs(v[i] - v[i - 1]);
  return somme / (v.length - 1);
}

/**
 * Préfère les intervalles courts.
 *
 * C'EST UNE MINIMISATION, ET SON OPTIMUM EST PLAT. Une ligne qui ne bouge que d'un demi-ton la
 * satisfait mieux qu'aucune autre : cet objectif convient à un cantus firmus, où le mouvement
 * conjoint est la règle, et il écrase toute autre ligne dès qu'il n'a plus rien à contredire.
 * Pour une mélodie, voir `objectifAmpleur`, qui vise une taille au lieu de la réduire.
 */
export const objectifDouceur = (poids = 1): Objectif => ({
  nom: "douceur",
  poids,
  cout: (v) => sautMoyen(v),
});

/**
 * Vise des sauts d'une taille donnée, ni plus grands ni plus petits.
 *
 * POURQUOI UNE CIBLE ET NON UN MINIMUM. Mesuré en réglant cette famille d'objectifs : une mélodie
 * qu'on fait évoluer vers le GESTE d'un modèle a son profil retrouvé dès les premières générations,
 * et tout poids de douceur, si petit soit-il, la ramène ensuite à une oscillation d'un ton
 * d'étendue, la douceur n'ayant plus rien d'autre à réduire. À poids nul, elle erre sur deux
 * octaves. Il n'existe aucun réglage intermédiaire entre les deux, parce que le problème n'est pas
 * dans le poids mais dans la FORME de l'objectif : viser l'ampleur du modèle donne un optimum là où
 * on le veut, et non à plat.
 */
export const objectifAmpleur = (cible: number, poids = 1): Objectif => ({
  nom: "ampleur",
  poids,
  cout: (v) => Math.abs(sautMoyen(v) - cible),
});

/**
 * Préfère une suite qui a le GESTE d'un modèle, sans en avoir les hauteurs.
 *
 * LE PROFIL PRIMAIRE NE GARDE QUE LES SIGNES des différences successives : une mélodie et sa
 * transposition ont le même, et c'est justement ce qu'on veut reprendre. Le coût est la distance
 * d'édition entre les deux profils, rapportée à la longueur pour qu'il ne dépende pas d'elle.
 */
export function objectifRessemblance(
  modele: readonly number[], poids = 1,
  outils?: { profil: (v: readonly number[]) => number[]; distance: (a: number[], b: number[]) => number },
): Objectif {
  const profil = outils?.profil ?? ((v: readonly number[]) => {
    const sortie: number[] = [];
    for (let i = 1; i < v.length; i++) sortie.push(Math.sign(v[i] - v[i - 1]));
    return sortie;
  });
  const cible = profil(modele);
  const distance = outils?.distance;
  return {
    nom: "ressemblance",
    poids,
    cout: (v) => {
      const p = profil(v);
      if (cible.length === 0) return 0;
      return (distance ? distance(p, cible) : ecartSimple(p, cible)) / cible.length;
    },
  };
}

/** L'écart place par place, quand aucune distance d'édition n'est fournie. */
function ecartSimple(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  let combien = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) combien++;
  return Math.min(combien, n);
}

/** Préfère une suite qui suit une ligne visée, hauteur par hauteur. */
export const objectifProfil = (vise: readonly number[], poids = 1): Objectif => ({
  nom: "profil",
  poids,
  cout: (v) => {
    if (vise.length === 0 || v.length === 0) return 0;
    let somme = 0;
    for (let i = 0; i < v.length; i++) {
      // La cible est lue à la place proportionnelle, les deux suites n'ayant pas à être de même
      // longueur : une courbe ne connaît pas le nombre de notes qu'on lui demandera.
      const j = Math.min(vise.length - 1, Math.round((i * (vise.length - 1)) / Math.max(1, v.length - 1)));
      somme += Math.abs(v[i] - vise[j]);
    }
    return somme / v.length;
  },
});
