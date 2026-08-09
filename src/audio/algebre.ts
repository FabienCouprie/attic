// audio/algebre.ts — Primitives d'algèbre linéaire pour l'analyse de pistes
// (sous-menu Autres → Algèbre musicale). Aucune dépendance externe : les
// matrices manipulées ici (dizaines de features, quelques centaines de
// pistes/frames tout au plus) sont assez petites pour un solveur de valeurs
// propres "maison" par balayages de Jacobi, sans avoir recours à une lib
// d'algèbre linéaire tierce.

import { mulberry32 } from "./reservoir";

// Diagonalise une matrice symétrique par la méthode de Jacobi (balayages
// cycliques). Converge quadratiquement pour une matrice symétrique — largement
// suffisant en une centaine d'itérations pour les tailles visées ici.
function jacobiEigen(matrice: number[][], maxIter = 100, tol = 1e-12): { valeursPropres: number[]; vecteursPropres: number[][] } {
  const n = matrice.length;
  const a = matrice.map((ligne) => ligne.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let iter = 0; iter < maxIter; iter++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < tol) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        const app = a[p][p], aqq = a[q][q], apq = a[p][q];
        a[p][p] = app - t * apq;
        a[q][q] = aqq + t * apq;
        a[p][q] = 0;
        a[q][p] = 0;

        for (let k = 0; k < n; k++) {
          if (k !== p && k !== q) {
            const akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[p][k] = a[k][p];
            a[k][q] = s * akp + c * akq;
            a[q][k] = a[k][q];
          }
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const valeursPropres = a.map((ligne, i) => ligne[i]);
  const vecteursPropres = Array.from({ length: n }, (_, j) => v.map((ligne) => ligne[j]));
  return { valeursPropres, vecteursPropres };
}

export interface ResultatPCA {
  /** Moyenne de chaque feature (nécessaire pour recentrer/reconstruire). */
  moyennes: number[];
  /** Valeurs propres retenues, triées par ordre décroissant. */
  valeursPropres: number[];
  /** Un axe par ligne, chacun de longueur = nombre de features. */
  axes: number[][];
  /** Projection de chaque échantillon sur les axes retenus. */
  coordonnees: number[][];
  /** Part de variance totale expliquée par chaque axe retenu (somme ≤ 1). */
  varianceExpliquee: number[];
}

/**
 * PCA par décomposition en valeurs propres de la matrice de covariance.
 * `donnees` : un échantillon par ligne, les features en colonnes.
 * `nbAxes` : nombre d'axes à conserver (silencieusement plafonné au nombre
 * de features disponibles).
 */
export function calculerPCA(donnees: number[][], nbAxes: number): ResultatPCA {
  const n = donnees.length;
  if (n === 0) throw new Error("calculerPCA : aucune donnée fournie");
  const d = donnees[0].length;
  const axesRetenus = Math.max(0, Math.min(nbAxes, d));

  const moyennes = new Array(d).fill(0);
  for (const ligne of donnees) for (let j = 0; j < d; j++) moyennes[j] += ligne[j] / n;

  const centre = donnees.map((ligne) => ligne.map((x, j) => x - moyennes[j]));

  const diviseur = Math.max(1, n - 1);
  const cov = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const ligne of centre) {
    for (let i = 0; i < d; i++) {
      for (let j = i; j < d; j++) {
        cov[i][j] += (ligne[i] * ligne[j]) / diviseur;
      }
    }
  }
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) cov[i][j] = cov[j][i];

  const { valeursPropres, vecteursPropres } = jacobiEigen(cov);

  const ordre = valeursPropres
    .map((valeur, indice) => ({ valeur, indice }))
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, axesRetenus);

  const varianceTotale = valeursPropres.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const axes = ordre.map(({ indice }) => vecteursPropres[indice]);
  const valeursRetenues = ordre.map(({ valeur }) => valeur);
  const varianceExpliquee = valeursRetenues.map((v) => Math.max(0, v) / varianceTotale);

  const coordonnees = centre.map((ligne) => axes.map((axe) => ligne.reduce((s, x, j) => s + x * axe[j], 0)));

  return { moyennes, valeursPropres: valeursRetenues, axes, coordonnees, varianceExpliquee };
}

export interface ResultatStandardisation {
  donnees: number[][];
  moyennes: number[];
  ecartsTypes: number[];
}

/**
 * Centre-réduit chaque colonne (moyenne 0, écart-type 1) — indispensable
 * avant une PCA quand les features sont sur des échelles très différentes
 * (tempo ~100, centroïde spectral ~1000, chroma 0-1...), sans quoi les
 * features de plus grande échelle dominent artificiellement la variance.
 * Une colonne à variance quasi nulle est mise à 0 plutôt que divisée par
 * ~0 (une feature constante sur toute la collection n'apporte aucun signal).
 */
export function standardiser(donnees: number[][]): ResultatStandardisation {
  const n = donnees.length;
  if (n === 0) throw new Error("standardiser : aucune donnée fournie");
  const d = donnees[0].length;

  const moyennes = new Array(d).fill(0);
  for (const ligne of donnees) for (let j = 0; j < d; j++) moyennes[j] += ligne[j] / n;

  const ecartsTypes = new Array(d).fill(0);
  for (const ligne of donnees) for (let j = 0; j < d; j++) ecartsTypes[j] += (ligne[j] - moyennes[j]) ** 2 / n;
  for (let j = 0; j < d; j++) ecartsTypes[j] = Math.sqrt(ecartsTypes[j]);

  const epsilon = 1e-9;
  const donneesStandardisees = donnees.map((ligne) =>
    ligne.map((v, j) => (ecartsTypes[j] < epsilon ? 0 : (v - moyennes[j]) / ecartsTypes[j])),
  );

  return { donnees: donneesStandardisees, moyennes, ecartsTypes };
}

export function distanceCarree(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    s += diff * diff;
  }
  return s;
}

// Initialisation k-means++ : le premier centre est tiré uniformément, chaque
// centre suivant est tiré avec une probabilité proportionnelle au carré de sa
// distance au centre déjà choisi le plus proche — répartit les centres de
// départ sur les données plutôt que de risquer plusieurs centres voisins.
function initialiserCentresPlusPlus(donnees: number[][], k: number, rng: () => number): number[][] {
  const n = donnees.length;
  const centres: number[][] = [donnees[Math.floor(rng() * n)].slice()];
  const distances = new Array(n).fill(Infinity);

  while (centres.length < k) {
    let somme = 0;
    const dernier = centres[centres.length - 1];
    for (let i = 0; i < n; i++) {
      const d = distanceCarree(donnees[i], dernier);
      if (d < distances[i]) distances[i] = d;
      somme += distances[i];
    }
    if (somme === 0) {
      // Tous les points restants coïncident déjà avec un centre existant.
      centres.push(donnees[Math.floor(rng() * n)].slice());
      continue;
    }
    let seuil = rng() * somme;
    let choisi = n - 1;
    for (let i = 0; i < n; i++) {
      seuil -= distances[i];
      if (seuil <= 0) { choisi = i; break; }
    }
    centres.push(donnees[choisi].slice());
  }
  return centres;
}

export interface ResultatKMeans {
  k: number;
  /** Groupe assigné à chaque échantillon, même ordre que `donnees`. */
  assignations: number[];
  centres: number[][];
  /** Somme des distances au carré de chaque point à son centre (SSW). */
  inertie: number;
}

/**
 * K-means++ suivi de l'algorithme de Lloyd. `k` est silencieusement plafonné
 * au nombre d'échantillons disponibles. Une grappe qui se retrouve vide
 * pendant l'optimisation est réinitialisée sur le point le plus éloigné de
 * son centre courant plutôt que laissée à NaN.
 */
export function kmeans(donnees: number[][], k: number, graine = 1, maxIter = 100): ResultatKMeans {
  const n = donnees.length;
  if (n === 0) throw new Error("kmeans : aucune donnée fournie");
  const d = donnees[0].length;
  const kEff = Math.max(1, Math.min(k, n));
  const rng = mulberry32(graine);

  let centres = initialiserCentresPlusPlus(donnees, kEff, rng);
  const assignations = new Array(n).fill(-1);

  for (let iter = 0; iter < maxIter; iter++) {
    let changement = false;
    for (let i = 0; i < n; i++) {
      let meilleur = 0;
      let meilleureDist = Infinity;
      for (let c = 0; c < kEff; c++) {
        const dist = distanceCarree(donnees[i], centres[c]);
        if (dist < meilleureDist) { meilleureDist = dist; meilleur = c; }
      }
      if (assignations[i] !== meilleur) changement = true;
      assignations[i] = meilleur;
    }

    const sommes = Array.from({ length: kEff }, () => new Array(d).fill(0));
    const comptes = new Array(kEff).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignations[i];
      comptes[c]++;
      for (let j = 0; j < d; j++) sommes[c][j] += donnees[i][j];
    }
    for (let c = 0; c < kEff; c++) {
      if (comptes[c] === 0) {
        let pireIdx = 0;
        let pireDist = -Infinity;
        for (let i = 0; i < n; i++) {
          const dist = distanceCarree(donnees[i], centres[assignations[i]]);
          if (dist > pireDist) { pireDist = dist; pireIdx = i; }
        }
        centres[c] = donnees[pireIdx].slice();
      } else {
        centres[c] = sommes[c].map((s) => s / comptes[c]);
      }
    }

    if (!changement) break;
  }

  let inertie = 0;
  for (let i = 0; i < n; i++) inertie += distanceCarree(donnees[i], centres[assignations[i]]);

  return { k: kEff, assignations, centres, inertie };
}

/**
 * Indice de Calinski-Harabasz (variance inter-groupes / variance intra-
 * groupes, chacune normalisée par ses degrés de liberté) : plus il est élevé,
 * plus les groupes sont compacts et bien séparés. Indéfini hors de
 * 2 ≤ k < n (retourne -Infinity dans ce cas).
 */
export function indiceCalinskiHarabasz(donnees: number[][], assignations: number[], centres: number[][]): number {
  const n = donnees.length;
  const k = centres.length;
  if (k < 2 || k >= n) return -Infinity;

  const d = donnees[0]?.length ?? 0;
  const centreGlobal = new Array(d).fill(0);
  for (const ligne of donnees) for (let j = 0; j < d; j++) centreGlobal[j] += ligne[j] / n;

  const comptes = new Array(k).fill(0);
  for (const a of assignations) comptes[a]++;

  let ssb = 0;
  for (let c = 0; c < k; c++) {
    if (comptes[c] === 0) continue;
    ssb += comptes[c] * distanceCarree(centres[c], centreGlobal);
  }

  let ssw = 0;
  for (let i = 0; i < n; i++) ssw += distanceCarree(donnees[i], centres[assignations[i]]);

  if (ssw === 0) return ssb > 0 ? Infinity : 0;
  return (ssb / (k - 1)) / (ssw / (n - k));
}

export interface ResultatKMeansAuto extends ResultatKMeans {
  /** Score de Calinski-Harabasz testé pour chaque k, dans l'ordre croissant. */
  scoresCalinskiHarabasz: { k: number; score: number }[];
}

/**
 * Choisit k automatiquement entre 2 et `kMax` (plafonné à n-1) en retenant
 * le premier maximum local de l'indice de Calinski-Harabasz — pas le maximum
 * global, qui pousserait souvent k au plus haut testé sans réel bénéfice.
 * Repli sur le meilleur score global si la courbe est monotone sur toute la
 * plage (aucun maximum local strict trouvé).
 */
export function kmeansAuto(donnees: number[][], kMax: number, graine = 1): ResultatKMeansAuto {
  const n = donnees.length;
  if (n < 3) throw new Error("kmeansAuto : au moins 3 échantillons sont nécessaires (2 ≤ k < n)");
  const plafond = Math.max(2, Math.min(kMax, n - 1));

  const essais: { k: number; resultat: ResultatKMeans; score: number }[] = [];
  for (let k = 2; k <= plafond; k++) {
    const resultat = kmeans(donnees, k, graine);
    const score = indiceCalinskiHarabasz(donnees, resultat.assignations, resultat.centres);
    essais.push({ k, resultat, score });
  }

  let indiceRetenu = -1;
  for (let i = 0; i < essais.length; i++) {
    const precedent = essais[i - 1]?.score ?? -Infinity;
    const suivant = essais[i + 1]?.score ?? -Infinity;
    if (essais[i].score > precedent && essais[i].score > suivant) {
      indiceRetenu = i;
      break;
    }
  }
  if (indiceRetenu === -1) {
    indiceRetenu = essais.reduce((meilleur, e, i) => (e.score > essais[meilleur].score ? i : meilleur), 0);
  }

  const choisi = essais[indiceRetenu];
  return {
    ...choisi.resultat,
    scoresCalinskiHarabasz: essais.map(({ k, score }) => ({ k, score })),
  };
}

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

export interface PointAlignement {
  i: number;
  j: number;
}

export interface ResultatDTW {
  /** Un point par pas du chemin optimal, dans l'ordre (i croissant), chaque
   *  point associant l'indice de trame `i` de la séquence A à l'indice `j` de
   *  la séquence B. */
  chemin: PointAlignement[];
  /** Coût cumulé du chemin optimal divisé par sa longueur : indépendant de la
   *  durée des séquences (contrairement au coût DTW brut). Dans [0, 1] car le
   *  coût local (distance cosinus) l'est aussi pour des vecteurs non négatifs
   *  (ex. chroma). */
  distanceNormalisee: number;
  /** 1 - distanceNormalisee : 1 = séquences identiques, 0 = complètement différentes. */
  similarite: number;
}

// Distance cosinus (1 - similarité cosinus) plutôt qu'euclidienne : bornée
// dans [0, 1] pour des vecteurs non négatifs (chroma), donc comparable d'une
// paire de pistes à l'autre indépendamment de l'échelle des features — une
// distance euclidienne brute ne l'est pas. Un vecteur nul (trame de silence)
// est traité comme maximalement dissemblable à tout, plutôt que de diviser
// par une norme nulle.
function distanceCosinus(a: number[], b: number[], normeA: number, normeB: number): number {
  if (normeA < 1e-12 || normeB < 1e-12) return 1;
  let dot = 0;
  for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
  const cos = dot / (normeA * normeB);
  return 1 - Math.min(1, Math.max(-1, cos));
}

export interface OptionsDTW {
  /** Rappelé régulièrement (pas à chaque ligne) avec une fraction 0..1. */
  onProgress?: (fraction: number) => void;
  /** Vérifié aux mêmes points de cession que onProgress — voir useExecutionGraphe.ts. */
  signal?: AbortSignal;
}

function cederAuNavigateur(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Dynamic Time Warping entre deux séquences de vecteurs (ex. chroma trame par
 * trame — voir `chromagrammeParTrame`) de longueurs différentes : trouve le
 * chemin de correspondance qui minimise le coût cumulé, pour aligner deux
 * pistes qui diffèrent en tempo/durée. Formulation stricte (le chemin DOIT
 * démarrer en (0,0) et finir en (n-1,m-1), les bords latéraux sont interdits
 * — coût infini) : sans ça, le chemin optimal pourrait "sauter" le début ou
 * la fin d'une des deux séquences plutôt que les aligner réellement.
 *
 * DTW coûte O(n·m) EN TEMPS, c'est inhérent à l'algorithme — mais la mémoire
 * est ramenée de O(n·m) à O(√n·m) par damiers ("checkpoints") : la passe
 * avant ne garde que des lignes de contrôle espacées de √n lignes (pas la
 * matrice complète), et le rétro-chemin recalcule à la demande, bande par
 * bande, la portion dense entre deux damiers consécutifs à partir de la
 * dernière ligne connue — jamais plus d'une bande bornée en mémoire à la
 * fois. Même principe que le traitement piste par piste de Classification de
 * pistes (décoder → utiliser → relâcher avant de passer à la suite) : sans
 * lui, deux pistes de 3-5 min (~15-26k trames chacune) demanderaient plusieurs
 * Go pour la seule matrice de coût — avec, quelques dizaines de Mo.
 *
 * Fonction ASYNCHRONE (pas juste par convention) : sur des pistes de
 * plusieurs minutes, ce calcul peut prendre plusieurs dizaines de secondes ;
 * sans jamais rendre la main au navigateur, ni l'anneau de progression du
 * nœud ni son état "en cours" ne peuvent se repeindre pendant tout ce temps
 * (React programme la mise à jour mais elle ne s'affiche qu'au prochain
 * repaint, qui n'arrive jamais tant que le thread JS ne cède pas) — même
 * cause que le gel d'interface déjà corrigé sur Classification de pistes.
 * Cède donc régulièrement (~60 fois/s) pendant la passe avant ET pendant la
 * reconstruction du rétro-chemin, en rapportant la progression et en
 * vérifiant `signal` à chaque cession (un reset pendant le calcul l'arrête
 * au prochain point de cession plutôt que de tourner jusqu'au bout en pure
 * perte).
 */
export async function calculerDTW(
  sequenceA: number[][],
  sequenceB: number[][],
  options: OptionsDTW = {},
): Promise<ResultatDTW> {
  const { onProgress, signal } = options;
  const n = sequenceA.length;
  const m = sequenceB.length;
  if (n === 0 || m === 0) {
    throw new Error("calculerDTW : les deux séquences doivent être non vides");
  }

  const normeA = sequenceA.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)));
  const normeB = sequenceB.map((v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)));
  const cout = (i: number, j: number) => distanceCosinus(sequenceA[i], sequenceB[j], normeA[i], normeB[j]);
  const largeur = m + 1;

  // Passe avant + reconstruction du rétro-chemin recalculent chacune environ
  // n·m cellules (voir doc ci-dessus) : volume de travail total ≈ 2·n·m,
  // utilisé pour une progression continue sur l'ensemble du calcul plutôt que
  // deux barres séparées qui repartiraient de 0.
  const travailTotal = 2 * n * m;
  let travailFait = 0;
  let dernierCession = performance.now();
  const verifierEtCeder = async (): Promise<void> => {
    if (signal?.aborted) throw new Error("calculerDTW : annulé");
    const maintenant = performance.now();
    if (maintenant - dernierCession < 16) return; // ~60 fois/s au plus
    onProgress?.(Math.min(1, travailFait / travailTotal));
    await cederAuNavigateur();
    dernierCession = performance.now();
  };

  // ── Passe avant : ne conserve que des damiers espacés de `pas` lignes ──
  const pas = Math.max(1, Math.ceil(Math.sqrt(n)));
  const damiers: Float64Array[] = [];
  const damiersIndices: number[] = [];

  let precedente = new Float64Array(largeur).fill(Infinity);
  precedente[0] = 0;
  damiers.push(precedente.slice());
  damiersIndices.push(0);

  let courante = new Float64Array(largeur);
  for (let i = 1; i <= n; i++) {
    courante[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const diag = precedente[j - 1];
      const haut = precedente[j];
      const gauche = courante[j - 1];
      courante[j] = cout(i - 1, j - 1) + Math.min(diag, haut, gauche);
    }
    const tmp = precedente; precedente = courante; courante = tmp;
    if (i % pas === 0 || i === n) {
      damiers.push(precedente.slice());
      damiersIndices.push(i);
    }
    travailFait += m;
    await verifierEtCeder();
  }
  const distanceTotale = precedente[m];

  // ── Rétro-chemin bande par bande, du dernier damier vers le premier ──
  // Chaque bande est reconstruite en dense (au plus `pas` lignes) à partir du
  // damier de départ — la MÊME récurrence que ci-dessus, jamais une matrice
  // globale : aucune ambiguïté de bord, on ne fait que rejouer un morceau
  // borné du même calcul déjà validé, pas une décomposition indépendante.
  const chemin: PointAlignement[] = [];
  let jCourant = m;
  for (let b = damiers.length - 1; b > 0; b--) {
    const iFinBande = damiersIndices[b];
    const iDebutBande = damiersIndices[b - 1];
    const tailleBande = iFinBande - iDebutBande;

    const bande: Float64Array[] = [damiers[b - 1]];
    let prec = damiers[b - 1];
    for (let k = 1; k <= tailleBande; k++) {
      const ligne = new Float64Array(largeur);
      ligne[0] = Infinity;
      const iAbs = iDebutBande + k;
      for (let j = 1; j <= m; j++) {
        const diag = prec[j - 1];
        const haut = prec[j];
        const gauche = ligne[j - 1];
        ligne[j] = cout(iAbs - 1, j - 1) + Math.min(diag, haut, gauche);
      }
      bande.push(ligne);
      prec = ligne;
      travailFait += m;
      await verifierEtCeder();
    }

    let iLocal = tailleBande, j = jCourant;
    while (iLocal > 0) {
      chemin.push({ i: iDebutBande + iLocal - 1, j: j - 1 });
      const diag = bande[iLocal - 1][j - 1];
      const haut = bande[iLocal - 1][j];
      const gauche = bande[iLocal][j - 1];
      if (diag <= haut && diag <= gauche) { iLocal--; j--; }
      else if (haut <= gauche) { iLocal--; }
      else { j--; }
    }
    jCourant = j;
  }
  chemin.reverse();

  onProgress?.(1);
  const distanceNormalisee = distanceTotale / chemin.length;
  const similarite = Math.max(0, Math.min(1, 1 - distanceNormalisee));
  return { chemin, distanceNormalisee, similarite };
}
