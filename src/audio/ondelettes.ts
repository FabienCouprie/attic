// audio/ondelettes.ts — La transformée en ondelettes, et ce qu'on fait de ses coefficients.
//
// CE QU'UNE ONDELETTE A QUE LA TRANSFORMÉE DE FOURIER N'A PAS. Une transformée à court terme
// impose une fenêtre unique à tout le son : longue, elle sépare finement les hauteurs et étale les
// attaques ; courte, elle place les attaques et confond les hauteurs graves. Il faut choisir une
// fois pour toutes, et le choix est toujours mauvais quelque part. Une ondelette ne choisit pas :
// elle regarde l'octave la plus aiguë à travers une fenêtre courte, la suivante à travers une
// fenêtre deux fois plus longue, et ainsi de suite jusqu'au grave. C'est le principe du grainlet —
// aigus courts, graves longs — mais exact, et réversible.
//
// LA RECONSTRUCTION DOIT ÊTRE PARFAITE, ET C'EST LE SEUL TEST QUI VAILLE. Un banc de filtres
// d'ondelettes orthogonal rend le signal d'origine à l'erreur d'arrondi près, sans quoi il n'est
// pas orthogonal et tout ce qu'on bâtit dessus est faux. Une décomposition suivie d'une
// recomposition, sans rien toucher aux coefficients, doit donc rendre l'entrée au dix-millionième
// près. Le reste du module en dépend.
//
// LES COEFFICIENTS SONT PUBLIÉS, MAIS ILS SONT VÉRIFIÉS. Recopier huit décimales d'un filtre de
// Daubechies est un geste où une faute ne se voit pas : le son sort encore, un peu moins bien, et
// rien ne le signale. Les tests exigent donc des filtres leurs trois propriétés de définition —
// somme des carrés égale à un, orthogonalité aux décalages pairs, et moments nuls — qui ne
// tiennent que si chaque décimale est juste.
//
// D'après Ingrid Daubechies, « Orthonormal bases of compactly supported wavelets »,
// Communications on Pure and Applied Mathematics 41(7), 1988. Le seuillage vient de David Donoho
// et Iain Johnstone, « Ideal spatial adaptation by wavelet shrinkage », Biometrika 81(3), 1994.

/** Les filtres proposés, par leur nombre de coefficients. */
export const ONDELETTES = [
  {
    id: "haar", fr: "Haar (2)", en: "Haar (2)",
    // La plus simple : une marche. Un seul moment nul, donc elle voit les sauts et rien d'autre.
    h: [0.7071067811865476, 0.7071067811865476],
  },
  {
    id: "d4", fr: "Daubechies (4)", en: "Daubechies (4)",
    h: [0.4829629131445341, 0.8365163037378079, 0.2241438680420134, -0.1294095225512604],
  },
  {
    id: "d6", fr: "Daubechies (6)", en: "Daubechies (6)",
    h: [0.3326705529500825, 0.8068915093110924, 0.4598775021184914,
        -0.1350110200102546, -0.0854412738820267, 0.0352262918857095],
  },
  {
    id: "d8", fr: "Daubechies (8)", en: "Daubechies (8)",
    h: [0.2303778133088964, 0.7148465705529154, 0.6308807679298587, -0.0279837694168599,
        -0.1870348117190931, 0.0308413818355607, 0.0328830116668852, -0.0105974017850690],
  },
] as const;

export type NomOndelette = (typeof ONDELETTES)[number]["id"];

export const EST_ONDELETTE = (x: string): x is NomOndelette => ONDELETTES.some((o) => o.id === x);

export const filtreDe = (nom: string): number[] =>
  [...(ONDELETTES.find((o) => o.id === nom) ?? ONDELETTES[1]).h];

/**
 * Le filtre passe-haut, déduit du passe-bas.
 *
 * `g[n] = (−1)^n h[N−1−n]` : c'est la construction en quadrature, celle qui fait que les deux
 * filtres se partagent exactement le spectre et que rien ne se perd entre eux.
 */
export const filtreHaut = (h: readonly number[]): number[] =>
  h.map((_, n) => (n % 2 === 0 ? 1 : -1) * h[h.length - 1 - n]);

/** Un étage d'analyse : une moyenne et un détail, chacun de moitié moins long. */
export function analyserEtage(x: readonly number[], h: readonly number[]): { moyenne: number[]; detail: number[] } {
  const n = x.length;
  const g = filtreHaut(h);
  const moitie = n >> 1;
  const moyenne = new Array<number>(moitie).fill(0);
  const detail = new Array<number>(moitie).fill(0);
  for (let i = 0; i < moitie; i++) {
    let a = 0, d = 0;
    for (let k = 0; k < h.length; k++) {
      // Le repliement est circulaire : le signal est traité comme s'il bouclait, ce qui garde la
      // longueur exacte et rend la reconstruction inversible sans bord à rattraper.
      const j = (2 * i + k) % n;
      a += h[k] * x[j];
      d += g[k] * x[j];
    }
    moyenne[i] = a;
    detail[i] = d;
  }
  return { moyenne, detail };
}

/** Un étage de synthèse : l'inverse exact du précédent. */
export function synthetiserEtage(moyenne: readonly number[], detail: readonly number[], h: readonly number[]): number[] {
  const moitie = moyenne.length;
  const n = moitie * 2;
  const g = filtreHaut(h);
  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < moitie; i++) {
    for (let k = 0; k < h.length; k++) {
      const j = (2 * i + k) % n;
      x[j] += h[k] * moyenne[i] + g[k] * detail[i];
    }
  }
  return x;
}

export interface Decomposition {
  /** La moyenne du dernier étage : ce qui reste du grave. */
  moyenne: number[];
  /** Les détails, du plus fin — l'octave la plus aiguë — au plus grossier. */
  details: number[][];
  /** Longueur d'origine, avant le remplissage. */
  longueur: number;
}

/**
 * Combien d'étages une longueur permet, au plus.
 *
 * LE SEUL FREIN EST LA TAILLE DU FILTRE, ET NON LA DIVISIBILITÉ DE LA LONGUEUR. Compter les
 * divisions par deux que la longueur accepte sans reste serait une erreur, parce que `decomposer`
 * complète le signal jusqu'à la longueur qu'il faut : une seconde à 44 100 Hz, impaire après deux
 * divisions, n'en permettrait alors que deux là où douze sont possibles. La faute ne se voit pas —
 * le son sort, nettoyé de son seul aigu — et c'est une vérification dans l'application qui l'a
 * montrée, le rapport annonçant deux étages sur six demandés.
 */
export const etagesPossibles = (longueur: number, tailleFiltre: number): number => {
  let e = 0;
  while (Math.ceil(longueur / 2 ** (e + 1)) >= tailleFiltre) e++;
  return e;
};

/**
 * La décomposition complète.
 *
 * Le signal est complété par des zéros jusqu'à une longueur divisible par deux puissance le nombre
 * d'étages : sans cela, un étage de plus couperait un échantillon impair et la reconstruction
 * rendrait un son plus court que l'entrée.
 */
export function decomposer(x: Float32Array, h: readonly number[], etages: number): Decomposition {
  const niveaux = Math.max(1, Math.round(etages));
  const bloc = 2 ** niveaux;
  const complet = Math.ceil(Math.max(x.length, bloc) / bloc) * bloc;
  let courant: number[] = new Array(complet).fill(0);
  for (let i = 0; i < x.length; i++) courant[i] = x[i];

  const details: number[][] = [];
  for (let e = 0; e < niveaux; e++) {
    const { moyenne, detail } = analyserEtage(courant, h);
    details.push(detail);
    courant = moyenne;
  }
  return { moyenne: courant, details, longueur: x.length };
}

/** La recomposition, qui rend exactement la longueur d'origine. */
export function recomposer(d: Decomposition, h: readonly number[]): Float32Array {
  let courant = [...d.moyenne];
  for (let e = d.details.length - 1; e >= 0; e--) {
    courant = synthetiserEtage(courant, d.details[e], h);
  }
  const out = new Float32Array(d.longueur);
  for (let i = 0; i < d.longueur; i++) out[i] = courant[i];
  return out;
}

/** Tous les coefficients de détail, dans un seul tableau — l'ordre n'a pas d'importance ici. */
const tousLesDetails = (d: Decomposition): number[] => d.details.flat();

/**
 * L'écart-type du bruit, estimé sur l'octave la plus aiguë.
 *
 * C'EST LA MÉDIANE DES VALEURS ABSOLUES, ET NON L'ÉCART-TYPE ORDINAIRE. Un son porte des
 * coefficients énormes là où il y a de la musique : une moyenne quadratique les compterait et
 * conclurait que le bruit est fort. La médiane, elle, ignore une minorité de grandes valeurs — et
 * dans l'octave la plus aiguë, la majorité des coefficients ne porte que du bruit. Le facteur
 * 0,6745 ramène la médiane d'une loi normale à son écart-type.
 */
export function ecartTypeBruit(d: Decomposition): number {
  const fin = d.details[0] ?? [];
  if (fin.length === 0) return 0;
  const absolues = fin.map(Math.abs).sort((a, b) => a - b);
  const mediane = absolues[Math.floor(absolues.length / 2)];
  return mediane / 0.6745;
}

export const OPERATIONS = [
  { id: "reconstruire", fr: "Reconstruire", en: "Reconstruct" },
  { id: "debruiter", fr: "Débruiter", en: "Denoise" },
  { id: "garder", fr: "Garder les plus forts", en: "Keep the strongest" },
] as const;

export type Operation = (typeof OPERATIONS)[number]["id"];

export const EST_OPERATION = (x: string): x is Operation => OPERATIONS.some((o) => o.id === x);

export interface OptionsTraitement {
  operation: Operation;
  /** Multiplie le seuil universel, pour le débruitage. */
  forceSeuil: number;
  /** Vrai pour un seuillage doux, qui soustrait le seuil au lieu de couper net. */
  doux: boolean;
  /** Part des coefficients gardés, en pour-cent, pour « Garder les plus forts ». */
  gardePc: number;
}

export interface ResultatTraitement {
  decomposition: Decomposition;
  /** Coefficients de détail mis à zéro. */
  annules: number;
  total: number;
  /** Seuil employé, ou zéro. */
  seuil: number;
}

/**
 * Le traitement des coefficients, qui est tout ce que le nœud fait de différent.
 *
 * Le seuil universel de Donoho et Johnstone vaut sigma multiplié par la racine de deux fois le
 * logarithme du nombre de coefficients : c'est le plus petit seuil qui, sur du bruit pur, efface
 * tout avec forte probabilité. Le seuillage DOUX soustrait le seuil au lieu de couper net, ce qui
 * évite le fourmillement d'un coefficient qui passe et repasse la barre d'une trame à l'autre.
 */
export function traiterCoefficients(d: Decomposition, o: OptionsTraitement): ResultatTraitement {
  const total = tousLesDetails(d).length;
  if (o.operation === "reconstruire" || total === 0) {
    return { decomposition: d, annules: 0, total, seuil: 0 };
  }

  let seuil = 0;
  if (o.operation === "debruiter") {
    const sigma = ecartTypeBruit(d);
    seuil = sigma * Math.sqrt(2 * Math.log(Math.max(2, total))) * Math.max(0, o.forceSeuil);
  } else {
    // « Garder les plus forts » : le seuil est le quantile qui laisse passer la part demandée.
    const part = Math.min(100, Math.max(0, o.gardePc)) / 100;
    const absolues = tousLesDetails(d).map(Math.abs).sort((a, b) => b - a);
    const rang = Math.floor(part * absolues.length);
    // Tout garder doit ne rien annuler : un seuil négatif laisse passer jusqu'aux coefficients
    // nuls, là où prendre le plus petit d'entre eux l'effacerait.
    seuil = part <= 0 ? Infinity : rang >= absolues.length ? -1 : absolues[rang];
  }

  let annules = 0;
  const details = d.details.map((bande) =>
    bande.map((c) => {
      if (Math.abs(c) <= seuil) { annules++; return 0; }
      // Le seuillage doux ne s'applique qu'au débruitage : sur « garder les plus forts », il
      // rognerait les coefficients qu'on vient justement de décider de garder.
      return o.doux && o.operation === "debruiter" ? Math.sign(c) * (Math.abs(c) - seuil) : c;
    }));

  return { decomposition: { ...d, details }, annules, total, seuil: Number.isFinite(seuil) ? Math.max(0, seuil) : 0 };
}

/**
 * Le seuillage répété sur des décalages, puis moyenné.
 *
 * POURQUOI IL FAUT DÉCALER. Une transformée en ondelettes décimée n'est PAS invariante par
 * translation : le même son avancé d'un échantillon ne donne pas les mêmes coefficients, et le
 * seuillage n'efface donc pas les mêmes choses. Ce qui reste, autour des attaques, est un
 * fourmillement caractéristique — le bruit de Gibbs des ondelettes. Le remède est connu et tient en
 * une phrase : traiter le son à plusieurs décalages et faire la moyenne des résultats. Les
 * artefacts, qui dépendent du décalage, s'annulent entre eux ; le son, qui n'en dépend pas, reste.
 *
 * D'après Ronald Coifman et David Donoho, « Translation-invariant de-noising », dans Wavelets and
 * Statistics, Springer, 1995.
 */
export function traiterAvecDecalages(
  x: Float32Array, h: readonly number[], etages: number, o: OptionsTraitement, decalages: number,
): { son: Float32Array; annules: number; total: number; seuil: number; sigma: number } {
  const combien = Math.max(1, Math.round(decalages));
  const n = x.length;
  const cumul = new Float64Array(n);
  let annules = 0, total = 0, seuil = 0, sigma = 0;

  for (let d = 0; d < combien; d++) {
    // Les décalages sont pris en progression géométrique, pour couvrir toutes les échelles de la
    // décomposition plutôt que de tourner autour du seul échantillon voisin.
    const pas = d === 0 ? 0 : 2 ** (d - 1);
    const decale = new Float32Array(n);
    for (let i = 0; i < n; i++) decale[i] = x[(i + pas) % n];

    const dec = decomposer(decale, h, etages);
    if (d === 0) sigma = ecartTypeBruit(dec);
    const t = traiterCoefficients(dec, o);
    const rendu = recomposer(t.decomposition, h);
    for (let i = 0; i < n; i++) cumul[(i + pas) % n] += rendu[i];

    annules += t.annules;
    total += t.total;
    if (d === 0) seuil = t.seuil;
  }

  const son = new Float32Array(n);
  for (let i = 0; i < n; i++) son[i] = cumul[i] / combien;
  return { son, annules, total, seuil, sigma };
}

/** L'énergie d'un signal. */
export const energie = (x: Float32Array): number => {
  let s = 0;
  for (const v of x) s += v * v;
  return s;
};

/** Le rapport signal sur bruit entre une référence et une version altérée, en décibels. */
export function rapportSignalBruitDb(reference: Float32Array, essai: Float32Array): number {
  let bruit = 0;
  const n = Math.min(reference.length, essai.length);
  for (let i = 0; i < n; i++) bruit += (reference[i] - essai[i]) ** 2;
  const signal = energie(reference);
  if (bruit <= 1e-20) return 120;
  return 10 * Math.log10(signal / bruit);
}

/** Les bandes de fréquence que couvre chaque étage, pour le rapport. */
export function bandesDetages(frequence: number, etages: number): { etage: number; basHz: number; hautHz: number }[] {
  const out: { etage: number; basHz: number; hautHz: number }[] = [];
  for (let e = 0; e < etages; e++) {
    const haut = frequence / 2 ** (e + 1);
    out.push({ etage: e + 1, basHz: haut / 2, hautHz: haut });
  }
  return out;
}
