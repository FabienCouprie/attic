// audio/classification-pistes.ts — Assemble des vecteurs de features déjà
// extraits en un pipeline de standardisation, PCA, KMeans/GMM (sous-menu
// Autres → Algèbre musicale). Prend des vecteurs déjà calculés, PAS des
// AudioBuffer : l'extraction (audio/features-piste.ts) doit se faire piste
// par piste dans l'appelant (algebre-musicale.ts), immédiatement après le
// décodage de CETTE piste, puis laisser son AudioBuffer décodé redevenir
// éligible au ramasse-miettes avant de décoder la suivante. Si on accumulait
// à la place les AudioBuffer décodés de toute la collection (comme une
// version antérieure le faisait), quelques centaines de pistes de plusieurs
// minutes représentent facilement plusieurs dizaines de Go de PCM en
// mémoire simultanément — confirmé en pratique par un plantage par
// épuisement mémoire sur une collection de 240 pistes.

import type { VecteurFeaturesPiste } from "./features-piste";
import { calculerPCA, standardiser, kmeans, kmeansAuto, gmm, distanceCarree, type ResultatKMeans } from "./algebre";

export interface PisteVectorisee {
  nom: string;
  chemin: string;
  features: VecteurFeaturesPiste;
}

export interface OptionsClassification {
  /** Nombre d'axes PCA utilisés pour le clustering (plafonné automatiquement, minimum 2). */
  nbAxesPCA: number;
  /** Nombre de groupes fixe, ou "auto" pour une recherche par indice de Calinski-Harabasz. */
  k: number | "auto";
  /** Plafond de k testé en mode "auto". */
  kMaxAuto: number;
  graine: number;
}

export interface LigneRapportClassification {
  nom: string;
  chemin: string;
  groupe: number;
  probabilites: number[];
}

export interface PointCoordonnees {
  nom: string;
  chemin: string;
  x: number;
  y: number;
}

export interface VoisinProche {
  nom: string;
  chemin: string;
  distance: number;
}

export interface VoisinsPiste {
  nom: string;
  chemin: string;
  plusProches: VoisinProche[];
}

export interface ResultatClassificationPistes {
  k: number;
  rapport: LigneRapportClassification[];
  coordonnees: PointCoordonnees[];
  /** Part de variance expliquée par chaque axe PCA retenu pour le clustering. */
  varianceExpliquee: number[];
  etiquettesFeatures: string[];
  /** Présent seulement en mode k="auto" : score testé pour chaque k candidat. */
  scoresCalinskiHarabasz?: { k: number; score: number }[];
  /** k plus proches voisins de chaque piste (distance euclidienne dans l'espace
   *  PCA COMPLET retenu pour le clustering — pas seulement les 2 axes affichés
   *  sur le graphique), triés du plus proche au plus loin. */
  voisins: VoisinsPiste[];
}

const NB_VOISINS = 3;

/**
 * k plus proches voisins de chaque piste, par distance euclidienne dans
 * l'espace PCA retenu pour le clustering (mêmes coordonnées que KMeans/GMM,
 * pas seulement les 2 axes exposés pour la visualisation 2D) — cohérent avec
 * les groupes (le plus proche voisin d'une piste est presque toujours dans le
 * même groupe qu'elle) et moins bruité qu'une distance sur les 40 features
 * brutes (les axes PCA à faible variance, souvent du bruit, sont déjà écartés).
 */
function calculerPlusProchesVoisins(
  pistes: PisteVectorisee[],
  coordonneesPCA: number[][],
  k: number,
): VoisinsPiste[] {
  return pistes.map((p, i) => {
    const plusProches = pistes
      .map((autre, j) => ({ nom: autre.nom, chemin: autre.chemin, distance: Math.sqrt(distanceCarree(coordonneesPCA[i], coordonneesPCA[j])), j }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, k)
      .map(({ nom, chemin, distance }) => ({ nom, chemin, distance }));
    return { nom: p.nom, chemin: p.chemin, plusProches };
  });
}

export interface MoyennesGroupe {
  groupe: number;
  n: number;
  /** Une moyenne par variable, même ordre/longueur que `etiquettes` — variables
   *  de départ (features brutes), PAS les axes PCA standardisés. */
  moyennes: number[];
}

export interface RapportMoyennesGroupes {
  etiquettes: string[];
  groupes: MoyennesGroupe[];
  /** Écart-type (population) des moyennes de groupe, une valeur par variable :
   *  à quel point cette variable distingue les groupes entre eux (dispersion
   *  INTER-groupes des moyennes, pas la dispersion à l'intérieur d'un groupe). */
  ecartTypeInterGroupes: number[];
}

/**
 * Moyenne de chaque variable de départ (features brutes, avant standardisation),
 * groupe par groupe — permet de voir CONCRÈTEMENT ce qui distingue les groupes
 * (contrairement au rapport JSON, qui ne donne que l'appartenance par piste).
 */
export function calculerMoyennesParGroupe(
  pistes: PisteVectorisee[],
  rapport: LigneRapportClassification[],
): RapportMoyennesGroupes {
  const etiquettes = pistes[0].features.etiquettes;
  const nbVar = etiquettes.length;
  const groupesUniques = [...new Set(rapport.map((l) => l.groupe))].sort((a, b) => a - b);

  const groupes: MoyennesGroupe[] = groupesUniques.map((g) => {
    const membres = pistes.filter((_, i) => rapport[i].groupe === g);
    const moyennes = new Array(nbVar).fill(0);
    for (const p of membres) {
      for (let j = 0; j < nbVar; j++) moyennes[j] += p.features.vecteur[j];
    }
    for (let j = 0; j < nbVar; j++) moyennes[j] /= membres.length;
    return { groupe: g, n: membres.length, moyennes };
  });

  const ecartTypeInterGroupes = new Array(nbVar).fill(0);
  for (let j = 0; j < nbVar; j++) {
    const vals = groupes.map((g) => g.moyennes[j]);
    const m = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length;
    ecartTypeInterGroupes[j] = Math.sqrt(variance);
  }

  return { etiquettes, groupes, ecartTypeInterGroupes };
}

const MIN_PISTES = 3;

export function classifierPistes(
  pistes: PisteVectorisee[],
  options: OptionsClassification,
): ResultatClassificationPistes {
  if (pistes.length < MIN_PISTES) {
    throw new Error(`La classification nécessite au moins ${MIN_PISTES} pistes (${pistes.length} fournie(s)).`);
  }

  const etiquettesFeatures = pistes[0].features.etiquettes;
  const { donnees: donneesStandardisees } = standardiser(pistes.map((p) => p.features.vecteur));

  // Toujours au moins 2 axes : la sortie "coordonnées" (visualisation 2D) en
  // a besoin même si l'utilisateur a demandé un seul axe pour le clustering.
  const nbAxes = Math.max(2, Math.min(options.nbAxesPCA, donneesStandardisees[0].length, pistes.length - 1));
  const pca = calculerPCA(donneesStandardisees, nbAxes);

  let resultatKMeans: ResultatKMeans;
  let scoresCalinskiHarabasz: { k: number; score: number }[] | undefined;
  if (options.k === "auto") {
    const auto = kmeansAuto(pca.coordonnees, options.kMaxAuto, options.graine);
    resultatKMeans = auto;
    scoresCalinskiHarabasz = auto.scoresCalinskiHarabasz;
  } else {
    resultatKMeans = kmeans(pca.coordonnees, options.k, options.graine);
    scoresCalinskiHarabasz = undefined;
  }

  // Même donnees/k/graine que resultatKMeans ⇒ le kmeans interne à gmm()
  // retombe exactement sur le même partitionnement (kmeans est déterministe),
  // donc l'indice de groupe c a le même sens dans les deux résultats.
  const resultatGMM = gmm(pca.coordonnees, resultatKMeans.k, options.graine);

  const rapport: LigneRapportClassification[] = pistes.map((p, i) => ({
    nom: p.nom,
    chemin: p.chemin,
    groupe: resultatKMeans.assignations[i],
    probabilites: resultatGMM.probabilites[i],
  }));

  const coordonnees: PointCoordonnees[] = pistes.map((p, i) => ({
    nom: p.nom,
    chemin: p.chemin,
    x: pca.coordonnees[i][0],
    y: pca.coordonnees[i][1],
  }));

  const nbVoisins = Math.min(NB_VOISINS, pistes.length - 1);
  const voisins = calculerPlusProchesVoisins(pistes, pca.coordonnees, nbVoisins);

  return {
    k: resultatKMeans.k,
    rapport,
    coordonnees,
    varianceExpliquee: pca.varianceExpliquee,
    etiquettesFeatures,
    scoresCalinskiHarabasz,
    voisins,
  };
}
