// audio/champ-paires.ts — Le champ à paires d'un choral à quatre voix : ses scores, ses conditionnelles,
// et le gradient de sa pseudo-vraisemblance.
//
// LE MODÈLE EST CELUI DE HADJERES, SAKELLARIOU ET PACHET (« Style Imitation and Chord Invention in
// Polyphonic Music with Exponential Families », 2016) : un terme par voix et par hauteur, et des
// matrices partagées dans le temps entre deux voix d'une même colonne (verticales), une voix et
// elle-même d'une colonne à la suivante (horizontales), une voix et une autre d'une colonne à la
// suivante (diagonales). Une suite de colonnes a pour score la somme de ses termes, et pour
// probabilité l'exponentielle de ce score, normalisée.
//
// LA VRAISEMBLANCE ELLE-MÊME NE SE CALCULE PAS, sa constante de normalisation parcourant toutes les
// suites possibles. La pseudo-vraisemblance (Besag, 1975) la remplace : chaque note est prédite par
// toutes les autres, sa voisine de colonne et ses deux voisines dans le temps, et la normalisation ne
// parcourt plus que les hauteurs d'une voix. C'est elle que l'apprentissage monte.
//
// UN SEUL TABLEAU DE PARAMÈTRES, et ce fichier dit où chaque bloc commence. L'apprentissage le
// parcourt d'un bout à l'autre sans rien savoir des blocs ; un modèle se transmet par lui.

/** Les quatre voix, du soprano à la basse. */
export const NB_VOIX = 4;

/** Les paires de voix d'une même colonne, dans un ordre fixe. */
const PAIRES_VERTICALES: readonly (readonly [number, number])[] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
/** Les paires ordonnées d'une voix à une autre, d'une colonne à la suivante. */
const PAIRES_DIAGONALES: readonly (readonly [number, number])[] =
  Array.from({ length: NB_VOIX * NB_VOIX }, (_, k) => [Math.floor(k / NB_VOIX), k % NB_VOIX] as const).filter(([a, b]) => a !== b);

export interface Voisinages { vertical: boolean; horizontal: boolean; diagonal: boolean }

/** Où chaque bloc commence dans le tableau des paramètres. */
export interface Disposition {
  /** Les hauteurs de chaque voix, bornes comprises. */
  bornes: readonly (readonly [number, number])[];
  voisinages: Voisinages;
  biais: number[];
  /** Indexé par les six paires verticales ; -1 si les verticales ne sont pas apprises. */
  verticales: number[];
  horizontales: number[];
  /** Indexé par les douze paires diagonales. */
  diagonales: number[];
  taille: number;
}

/** Le nombre d'états d'une voix. */
export const etatsDe = (d: Pick<Disposition, "bornes">, v: number) => d.bornes[v][1] - d.bornes[v][0] + 1;

export function disposer(bornes: readonly (readonly [number, number])[], voisinages: Voisinages): Disposition {
  let taille = 0;
  const n = (v: number) => bornes[v][1] - bornes[v][0] + 1;
  const reserver = (combien: number) => { const debut = taille; taille += combien; return debut; };
  const biais = Array.from({ length: NB_VOIX }, (_, v) => reserver(n(v)));
  const verticales = PAIRES_VERTICALES.map(([a, b]) => (voisinages.vertical ? reserver(n(a) * n(b)) : -1));
  const horizontales = Array.from({ length: NB_VOIX }, (_, v) => (voisinages.horizontal ? reserver(n(v) * n(v)) : -1));
  const diagonales = PAIRES_DIAGONALES.map(([a, b]) => (voisinages.diagonal ? reserver(n(a) * n(b)) : -1));
  return { bornes, voisinages, biais, verticales, horizontales, diagonales, taille };
}

/** Les blocs que l'apprentissage ne pénalise pas : les biais, qui disent seulement la tessiture. */
export function nonPenalises(d: Disposition): Uint8Array {
  const masque = new Uint8Array(d.taille);
  for (let v = 0; v < NB_VOIX; v++) masque.fill(1, d.biais[v], d.biais[v] + etatsDe(d, v));
  return masque;
}

/**
 * Des colonnes à apprendre : quatre états par colonne, et pour chacune si elle suit la précédente.
 * Un état est une hauteur moins la borne basse de sa voix.
 */
export interface DonneesChamp {
  etats: Int16Array;
  suit: Uint8Array;
}

const indexVertical = (a: number, b: number) => PAIRES_VERTICALES.findIndex(([x, y]) => x === a && y === b);
const indexDiagonal = (a: number, b: number) => PAIRES_DIAGONALES.findIndex(([x, y]) => x === a && y === b);

/** Les tables d'index, calculées une fois par disposition. */
interface Voies {
  /** Pour chaque voix v et chaque autre w de la colonne : le début du bloc, et si v en est la ligne. */
  colonne: { w: number; debut: number; ligne: boolean }[][];
  /** Diagonales arrivant en v (de u à la colonne précédente) et partant de v (vers w à la suivante). */
  arrivees: { u: number; debut: number }[][];
  departs: { w: number; debut: number }[][];
}

function voies(d: Disposition): Voies {
  const colonne: Voies["colonne"] = [], arrivees: Voies["arrivees"] = [], departs: Voies["departs"] = [];
  for (let v = 0; v < NB_VOIX; v++) {
    colonne.push([]); arrivees.push([]); departs.push([]);
    for (let w = 0; w < NB_VOIX; w++) {
      if (w === v) continue;
      const k = v < w ? indexVertical(v, w) : indexVertical(w, v);
      if (d.verticales[k] >= 0) colonne[v].push({ w, debut: d.verticales[k], ligne: v < w });
      if (d.diagonales[indexDiagonal(w, v)] >= 0) arrivees[v].push({ u: w, debut: d.diagonales[indexDiagonal(w, v)] });
      if (d.diagonales[indexDiagonal(v, w)] >= 0) departs[v].push({ w, debut: d.diagonales[indexDiagonal(v, w)] });
    }
  }
  return { colonne, arrivees, departs };
}

/**
 * Le score de chaque hauteur possible de la voix `v` à la colonne `t`, les autres notes fixées :
 * ce que la conditionnelle normalise. `sortie` reçoit un score par état.
 */
function scoresLocaux(d: Disposition, vo: Voies, theta: Float64Array, donnees: DonneesChamp, t: number, v: number, sortie: Float64Array): void {
  const { etats, suit } = donnees;
  const n = etatsDe(d, v);
  const T = suit.length;
  for (let k = 0; k < n; k++) sortie[k] = theta[d.biais[v] + k];
  for (const { w, debut, ligne } of vo.colonne[v]) {
    const nw = etatsDe(d, w), sw = etats[t * NB_VOIX + w];
    if (ligne) for (let k = 0; k < n; k++) sortie[k] += theta[debut + k * nw + sw];
    else { const nv = n; for (let k = 0; k < nv; k++) sortie[k] += theta[debut + sw * nv + k]; }
  }
  if (suit[t]) {
    const avant = (t - 1) * NB_VOIX;
    if (d.horizontales[v] >= 0) { const sv = etats[avant + v]; for (let k = 0; k < n; k++) sortie[k] += theta[d.horizontales[v] + sv * n + k]; }
    for (const { u, debut } of vo.arrivees[v]) { const su = etats[avant + u]; for (let k = 0; k < n; k++) sortie[k] += theta[debut + su * n + k]; }
  }
  if (t + 1 < T && suit[t + 1]) {
    const apres = (t + 1) * NB_VOIX;
    if (d.horizontales[v] >= 0) { const sv = etats[apres + v]; for (let k = 0; k < n; k++) sortie[k] += theta[d.horizontales[v] + k * n + sv]; }
    for (const { w, debut } of vo.departs[v]) { const nw = etatsDe(d, w), sw = etats[apres + w]; for (let k = 0; k < n; k++) sortie[k] += theta[debut + k * nw + sw]; }
  }
}

/** Les scores conditionnels de la voix `v` à la colonne `t`, un par état. */
export function scoresConditionnels(d: Disposition, theta: Float64Array, donnees: DonneesChamp, t: number, v: number): Float64Array {
  const sortie = new Float64Array(etatsDe(d, v));
  scoresLocaux(d, voies(d), theta, donnees, t, v, sortie);
  return sortie;
}

/** Le score d'une suite de colonnes, par les scores de colonne et de passage. */
export function scoreSuite(d: Disposition, theta: Float64Array, donnees: DonneesChamp): number {
  const hauteurs = (t: number) => Array.from({ length: NB_VOIX }, (_, v) => donnees.etats[t * NB_VOIX + v] + d.bornes[v][0]);
  let s = 0;
  for (let t = 0; t < donnees.suit.length; t++) {
    s += scoreColonne(d, theta, hauteurs(t));
    if (donnees.suit[t]) s += scorePassage(d, theta, hauteurs(t - 1), hauteurs(t));
  }
  return s;
}

/** Ce que rend un parcours des données : la pseudo-vraisemblance moyenne par note, et la part des notes que la conditionnelle place en tête. */
export interface Mesure { logPV: number; justes: number; notes: number }

/**
 * La pseudo-vraisemblance moyenne par note, et son gradient si `gradient` est donné (rempli,
 * moyenné). Le gradient d'un paramètre est ce que les données en font moins ce que les
 * conditionnelles en attendent.
 */
export function pseudoVraisemblance(d: Disposition, theta: Float64Array, donnees: DonneesChamp, gradient?: Float64Array): Mesure {
  const vo = voies(d);
  const T = donnees.suit.length;
  const maxEtats = Math.max(...Array.from({ length: NB_VOIX }, (_, v) => etatsDe(d, v)));
  const s = new Float64Array(maxEtats), p = new Float64Array(maxEtats);
  if (gradient) gradient.fill(0);
  let logPV = 0, justes = 0;
  const { etats, suit } = donnees;
  for (let t = 0; t < T; t++) {
    for (let v = 0; v < NB_VOIX; v++) {
      const n = etatsDe(d, v), obs = etats[t * NB_VOIX + v];
      scoresLocaux(d, vo, theta, donnees, t, v, s);
      let m = -Infinity, tete = 0;
      for (let k = 0; k < n; k++) if (s[k] > m) { m = s[k]; tete = k; }
      let z = 0;
      for (let k = 0; k < n; k++) { p[k] = Math.exp(s[k] - m); z += p[k]; }
      logPV += s[obs] - m - Math.log(z);
      if (tete === obs) justes++;
      if (!gradient) continue;
      // CE QUE LES DONNÉES FONT MOINS CE QUE LA CONDITIONNELLE ATTEND, terme par terme : chaque
      // paramètre lu par `scoresLocaux` reçoit (1 si k est la note observée) − p(k).
      for (let k = 0; k < n; k++) p[k] = (k === obs ? 1 : 0) - p[k] / z;
      for (let k = 0; k < n; k++) gradient[d.biais[v] + k] += p[k];
      for (const { w, debut, ligne } of vo.colonne[v]) {
        const nw = etatsDe(d, w), sw = etats[t * NB_VOIX + w];
        if (ligne) for (let k = 0; k < n; k++) gradient[debut + k * nw + sw] += p[k];
        else for (let k = 0; k < n; k++) gradient[debut + sw * n + k] += p[k];
      }
      if (suit[t]) {
        const avant = (t - 1) * NB_VOIX;
        if (d.horizontales[v] >= 0) { const sv = etats[avant + v]; for (let k = 0; k < n; k++) gradient[d.horizontales[v] + sv * n + k] += p[k]; }
        for (const { u, debut } of vo.arrivees[v]) { const su = etats[avant + u]; for (let k = 0; k < n; k++) gradient[debut + su * n + k] += p[k]; }
      }
      if (t + 1 < T && suit[t + 1]) {
        const apres = (t + 1) * NB_VOIX;
        if (d.horizontales[v] >= 0) { const sv = etats[apres + v]; for (let k = 0; k < n; k++) gradient[d.horizontales[v] + k * n + sv] += p[k]; }
        for (const { w, debut } of vo.departs[v]) { const nw = etatsDe(d, w), sw = etats[apres + w]; for (let k = 0; k < n; k++) gradient[debut + k * nw + sw] += p[k]; }
      }
    }
  }
  const notes = T * NB_VOIX;
  if (gradient && notes > 0) for (let i = 0; i < gradient.length; i++) gradient[i] /= notes;
  return { logPV: notes > 0 ? logPV / notes : 0, justes: notes > 0 ? justes / notes : 0, notes };
}

/** Le score d'une colonne : ses biais et ses termes verticaux. `-Infinity` hors des bornes. */
export function scoreColonne(d: Disposition, theta: ArrayLike<number>, hauteurs: readonly number[]): number {
  const e = hauteurs.map((h, v) => h - d.bornes[v][0]);
  if (e.some((x, v) => x < 0 || x >= etatsDe(d, v))) return -Infinity;
  let s = 0;
  for (let v = 0; v < NB_VOIX; v++) s += theta[d.biais[v] + e[v]];
  PAIRES_VERTICALES.forEach(([a, b], k) => { if (d.verticales[k] >= 0) s += theta[d.verticales[k] + e[a] * etatsDe(d, b) + e[b]]; });
  return s;
}

/** Le score d'un passage d'une colonne à la suivante : ses termes horizontaux et diagonaux. */
export function scorePassage(d: Disposition, theta: ArrayLike<number>, avant: readonly number[], apres: readonly number[]): number {
  const a = avant.map((h, v) => h - d.bornes[v][0]), b = apres.map((h, v) => h - d.bornes[v][0]);
  if (a.some((x, v) => x < 0 || x >= etatsDe(d, v)) || b.some((x, v) => x < 0 || x >= etatsDe(d, v))) return -Infinity;
  let s = 0;
  for (let v = 0; v < NB_VOIX; v++) if (d.horizontales[v] >= 0) s += theta[d.horizontales[v] + a[v] * etatsDe(d, v) + b[v]];
  PAIRES_DIAGONALES.forEach(([u, w], k) => { if (d.diagonales[k] >= 0) s += theta[d.diagonales[k] + a[u] * etatsDe(d, w) + b[w]]; });
  return s;
}

/** Les blocs diagonaux, pour qu'une épreuve puisse les éteindre. */
export function blocsDiagonaux(d: Disposition): [number, number][] {
  return PAIRES_DIAGONALES.map(([a, b], k) => [d.diagonales[k], d.diagonales[k] + etatsDe(d, a) * etatsDe(d, b)] as [number, number]).filter(([x]) => x >= 0);
}
