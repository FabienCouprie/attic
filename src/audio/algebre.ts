// audio/algebre.ts — Composantes principales, standardisation, k-moyennes.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { mulberry32 } from "./reservoir";

export function jacobiEigen(matrice: number[][], maxIter = 100, tol = 1e-12): { valeursPropres: number[]; vecteursPropres: number[][] } {
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

