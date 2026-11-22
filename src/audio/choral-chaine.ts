// audio/choral-chaine.ts — La meilleure suite de colonnes d'une chaîne, ou une suite tirée selon son énergie.
//
// POURQUOI UNE CHAÎNE, ET POURQUOI CELA SUFFIT. Chaque règle de l'harmoniseur ne regarde qu'une colonne
// ou deux colonnes voisines : l'énergie d'une harmonisation est donc une somme de termes « colonne » et
// de termes « passage de t à t + 1 ». Sur une telle somme, la meilleure suite se trouve EXACTEMENT par
// programmation dynamique (Viterbi, 1967), sans tirage et sans minimum local, et une suite se tire
// EXACTEMENT selon exp(−E / T) par filtrage avant et tirage arrière. C'est la structure qu'Allan et
// Williams (« Harmonising Chorales by Probabilistic Inference », NIPS 2004) donnaient déjà aux
// chorals, un temps par état.
//
// LA TEMPÉRATURE NULLE REND LA MEILLEURE SUITE, et la graine n'y sert pas. Au-dessus de zéro, chaque
// suite est tirée avec une probabilité proportionnelle à exp(−E / T) : à basse température, les
// meilleures dominent ; à haute, toutes se valent.
//
// LES CALCULS SE FONT EN LOGARITHMES, et un ordre fixe départage les égalités : deux lancements à
// graine égale rendent la même suite, et un écart d'arrondi ne change pas de gagnant d'une machine
// à l'autre pour une raison d'ordre.

import { Respiration } from "../core/respirer";

export interface Chaine {
  /** Pour chaque colonne, l'énergie de chacun de ses candidats. */
  colonnes: readonly (readonly number[])[];
  /** L'énergie du passage du candidat `i` de la colonne `t` au candidat `j` de la colonne `t + 1`. */
  passage(t: number, i: number, j: number): number;
}

export interface SuiteChoisie {
  /** Le rang du candidat choisi dans chaque colonne. */
  choix: number[];
  energie: number;
}

const logSomme = (a: number, b: number) => {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
};

/** L'énergie d'une suite donnée. */
export function energieDe(chaine: Chaine, choix: readonly number[]): number {
  let e = 0;
  choix.forEach((c, t) => {
    e += chaine.colonnes[t][c];
    if (t > 0) e += chaine.passage(t - 1, choix[t - 1], c);
  });
  return e;
}

/** La suite d'énergie la plus basse, exacte. `souffle` rend la main entre deux colonnes. */
export async function meilleureSuite(chaine: Chaine, souffle?: Respiration): Promise<SuiteChoisie> {
  const n = chaine.colonnes.length;
  if (n === 0) return { choix: [], energie: 0 };
  let cout = [...chaine.colonnes[0]];
  const retour: number[][] = [[]];
  for (let t = 1; t < n; t++) {
    const ici = chaine.colonnes[t];
    const suivant = new Array<number>(ici.length);
    const depuis = new Array<number>(ici.length);
    for (let j = 0; j < ici.length; j++) {
      let meilleur = Infinity;
      let rang = 0;
      for (let i = 0; i < cout.length; i++) {
        const c = cout[i] + chaine.passage(t - 1, i, j);
        if (c < meilleur) { meilleur = c; rang = i; }
      }
      suivant[j] = meilleur + ici[j];
      depuis[j] = rang;
      // Une colonne de trois cents candidats tenait le fil 123 ms, mesuré sur 190 colonnes : la main
      // se rend aussi en cours de colonne, le compteur ne cédant qu'au-delà de son délai.
      if (souffle && (j & 15) === 15) await souffle.tour();
    }
    cout = suivant;
    retour.push(depuis);
    if (souffle) await souffle.tour();
  }
  let fin = 0;
  for (let j = 1; j < cout.length; j++) if (cout[j] < cout[fin]) fin = j;
  const choix = new Array<number>(n);
  choix[n - 1] = fin;
  for (let t = n - 1; t > 0; t--) choix[t - 1] = retour[t][choix[t]];
  return { choix, energie: cout[fin] };
}

/**
 * Une suite tirée avec une probabilité proportionnelle à exp(−E / T), par filtrage avant et tirage
 * arrière. `aleatoire` est le générateur commun, déjà graine posée.
 */
export async function suiteTiree(chaine: Chaine, temperature: number, aleatoire: () => number, souffle?: Respiration): Promise<SuiteChoisie> {
  const n = chaine.colonnes.length;
  if (n === 0) return { choix: [], energie: 0 };
  const T = Math.max(1e-9, temperature);
  // alpha[t][j] = log de la somme, sur les débuts de suite qui finissent en j, de exp(−E / T).
  const alpha: number[][] = [chaine.colonnes[0].map((e) => -e / T)];
  for (let t = 1; t < n; t++) {
    const precedent = alpha[t - 1];
    const ligne: number[] = [];
    const ici = chaine.colonnes[t];
    for (let j = 0; j < ici.length; j++) {
      let s = -Infinity;
      for (let i = 0; i < precedent.length; i++) s = logSomme(s, precedent[i] - chaine.passage(t - 1, i, j) / T);
      ligne.push(s - ici[j] / T);
      if (souffle && (j & 15) === 15) await souffle.tour();
    }
    alpha.push(ligne);
    if (souffle) await souffle.tour();
  }
  const tirer = (logPoids: number[]): number => {
    const m = Math.max(...logPoids);
    const poids = logPoids.map((x) => Math.exp(x - m));
    const total = poids.reduce((s, x) => s + x, 0);
    let u = aleatoire() * total;
    for (let k = 0; k < poids.length; k++) { u -= poids[k]; if (u < 0) return k; }
    return poids.length - 1;
  };
  const choix = new Array<number>(n);
  choix[n - 1] = tirer(alpha[n - 1]);
  // LE TIRAGE ARRIÈRE REND LA MAIN LUI AUSSI : une colonne de candidats par pas, sur 190 colonnes, il
  // évaluait 34 567 passages d'un seul tenant, relevé par `choral-respiration.test.ts`.
  for (let t = n - 1; t > 0; t--) {
    const j = choix[t];
    choix[t - 1] = tirer(alpha[t - 1].map((a, i) => a - chaine.passage(t - 1, i, j) / T));
    if (souffle) await souffle.tour();
  }
  return { choix, energie: energieDe(chaine, choix) };
}
