// audio/algebre-melanges.ts — Les melanges gaussiens.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { jacobiEigen, kmeans } from "./algebre";
import type { ResultatKMeans } from "./algebre";

export interface ComposanteGMM {
  /** Poids de mélange (π_k), somme à 1 sur toutes les composantes. */
  poids: number;
  moyenne: number[];
  covariance: number[][];
}

export interface ResultatGMM {
  composantes: ComposanteGMM[];
  /** probabilites[i][c] = probabilité (responsabilité) que l'échantillon i appartienne à la composante c. Somme à 1 sur c. */
  probabilites: number[][];
  logVraisemblance: number;
}

interface DecompositionCovariance {
  logDet: number;
  inverse: number[][];
}

// Décompose la covariance via jacobiEigen plutôt que d'inverser/déterminer
// directement : les valeurs propres trop petites (covariance quasi-singulière
// — grappe avec peu de points relativement au nombre de features) sont
// plafonnées à epsilon, ce qui régularise l'inverse sans jamais diviser par
// (quasi) zéro.
function decomposerCovariance(covariance: number[][], epsilon = 1e-6): DecompositionCovariance {
  const { valeursPropres, vecteursPropres } = jacobiEigen(covariance);
  const d = covariance.length;
  const valeursRegularisees = valeursPropres.map((v) => Math.max(v, epsilon));
  const logDet = valeursRegularisees.reduce((s, v) => s + Math.log(v), 0);

  // inverse = Σ_c (1/λ_c) · e_c · e_cᵀ (e_c = c-ième vecteur propre)
  const inverse = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      let s = 0;
      for (let c = 0; c < d; c++) s += vecteursPropres[c][i] * (1 / valeursRegularisees[c]) * vecteursPropres[c][j];
      inverse[i][j] = s;
      inverse[j][i] = s;
    }
  }
  return { logDet, inverse };
}

function logDensiteGaussienne(x: number[], moyenne: number[], decomposition: DecompositionCovariance): number {
  const d = x.length;
  const diff = x.map((v, i) => v - moyenne[i]);
  let quad = 0;
  for (let i = 0; i < d; i++) {
    let s = 0;
    for (let j = 0; j < d; j++) s += decomposition.inverse[i][j] * diff[j];
    quad += diff[i] * s;
  }
  return -0.5 * (d * Math.log(2 * Math.PI) + decomposition.logDet + quad);
}

function covarianceEmpirique(donnees: number[][], indices: number[], moyenne: number[]): number[][] {
  const d = moyenne.length;
  const cov = Array.from({ length: d }, () => new Array(d).fill(0));
  if (indices.length === 0) {
    // Composante sans point assigné par l'initialisation KMeans : covariance
    // identité comme repli neutre plutôt qu'une matrice nulle (singulière).
    for (let i = 0; i < d; i++) cov[i][i] = 1;
    return cov;
  }
  for (const idx of indices) {
    const diff = donnees[idx].map((v, j) => v - moyenne[j]);
    for (let i = 0; i < d; i++) for (let j = i; j < d; j++) cov[i][j] += diff[i] * diff[j];
  }
  const diviseur = Math.max(1, indices.length - 1);
  for (let i = 0; i < d; i++) for (let j = i; j < d; j++) cov[i][j] /= diviseur;
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) cov[i][j] = cov[j][i];
  return cov;
}

// Initialise les composantes du GMM à partir d'un partitionnement KMeans dur
// plutôt que d'un tirage aléatoire — convergence plus rapide et plus stable,
// et déterministe (même graine ⇒ même résultat) puisque kmeans() l'est déjà.
function initialiserDepuisKMeans(donnees: number[][], resultatKMeans: ResultatKMeans): ComposanteGMM[] {
  const n = donnees.length;
  const composantes: ComposanteGMM[] = [];
  for (let c = 0; c < resultatKMeans.k; c++) {
    const indices = resultatKMeans.assignations
      .map((a, i) => (a === c ? i : -1))
      .filter((i) => i >= 0);
    const moyenne = resultatKMeans.centres[c];
    composantes.push({
      poids: Math.max(indices.length, 1) / n,
      moyenne,
      covariance: covarianceEmpirique(donnees, indices, moyenne),
    });
  }
  return composantes;
}

function etapeE(donnees: number[][], composantes: ComposanteGMM[]): { probabilites: number[][]; logVraisemblance: number } {
  const decompositions = composantes.map((c) => decomposerCovariance(c.covariance));
  const probabilites: number[][] = [];
  let logVraisemblance = 0;
  for (const x of donnees) {
    const logDensites = composantes.map(
      (c, ci) => Math.log(Math.max(c.poids, 1e-12)) + logDensiteGaussienne(x, c.moyenne, decompositions[ci]),
    );
    const maxLog = Math.max(...logDensites);
    const sommeExp = logDensites.reduce((s, l) => s + Math.exp(l - maxLog), 0);
    const logSomme = maxLog + Math.log(sommeExp);
    logVraisemblance += logSomme;
    probabilites.push(logDensites.map((l) => Math.exp(l - logSomme)));
  }
  return { probabilites, logVraisemblance };
}

function etapeM(donnees: number[][], composantesPrecedentes: ComposanteGMM[], probabilites: number[][]): ComposanteGMM[] {
  const n = donnees.length;
  const d = donnees[0].length;
  const nk = new Array(composantesPrecedentes.length).fill(0);
  for (const ligne of probabilites) for (let c = 0; c < nk.length; c++) nk[c] += ligne[c];

  return composantesPrecedentes.map((precedente, c) => {
    // Composante effondrée (aucune responsabilité, ou quasi) : on la garde
    // inchangée plutôt que de diviser par ≈0 et produire du NaN.
    if (nk[c] < 1e-8) return precedente;

    const moyenne = new Array(d).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) moyenne[j] += probabilites[i][c] * donnees[i][j];
    for (let j = 0; j < d; j++) moyenne[j] /= nk[c];

    const covariance = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const diff = donnees[i].map((v, j) => v - moyenne[j]);
      const poidsResp = probabilites[i][c];
      for (let a = 0; a < d; a++) for (let b = a; b < d; b++) covariance[a][b] += poidsResp * diff[a] * diff[b];
    }
    for (let a = 0; a < d; a++) for (let b = a; b < d; b++) covariance[a][b] /= nk[c];
    for (let a = 0; a < d; a++) for (let b = 0; b < a; b++) covariance[a][b] = covariance[b][a];

    return { poids: nk[c] / n, moyenne, covariance };
  });
}

/**
 * Mélange de gaussiennes par algorithme EM, initialisé sur un partitionnement
 * KMeans dur (voir `kmeans`). `k` est plafonné au nombre d'échantillons.
 * Les covariances quasi-singulières (peu de points par composante par
 * rapport au nombre de features) sont régularisées à la décomposition —
 * jamais de division par une valeur propre nulle.
 */
export function gmm(donnees: number[][], k: number, graine = 1, maxIter = 100, tol = 1e-6): ResultatGMM {
  const n = donnees.length;
  if (n === 0) throw new Error("gmm : aucune donnée fournie");
  const kEff = Math.max(1, Math.min(k, n));

  const initKMeans = kmeans(donnees, kEff, graine);
  let composantes = initialiserDepuisKMeans(donnees, initKMeans);
  let etape = etapeE(donnees, composantes);
  let precedente = -Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    composantes = etapeM(donnees, composantes, etape.probabilites);
    etape = etapeE(donnees, composantes);
    if (Math.abs(etape.logVraisemblance - precedente) < tol) break;
    precedente = etape.logVraisemblance;
  }

  return { composantes, probabilites: etape.probabilites, logVraisemblance: etape.logVraisemblance };
}

