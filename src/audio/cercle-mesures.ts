// audio/cercle-mesures.ts — Ce qu'on peut mesurer sur un rythme posé en cercle.
//
// D'OÙ VIENNENT CES MESURES. Elles sont celles que Godfried Toussaint rassemble dans « The Geometry
// of Musical Rhythm: What Makes a "Good" Rhythm Good? », CRC Press, 2013, avec l'équilibre d'Andrew
// Milne, David Bulger, Steffen Herff et William Sethares, « Perfect Balance: A Novel Principle for
// the Construction of Musical Scales and Meters », Mathematics and Computation in Music, 2015, et
// l'imparité rythmique de Simha Arom, formalisée par Marc Chemillier et Charlotte Truchet,
// « Computation of words satisfying the rhythmic oddity property », Information Processing Letters
// 86(5), 2003.
//
// CE QUI EST ÉCRIT ICI EST RECONSTRUIT, ET IL FAUT LE DIRE. Paul Lascabettes et Isabelle Bloch ont
// chiffré ces propriétés par des formules qui leur sont propres et les ont combinées en un score
// unique — « What Are "Good" Rhythms? », Mathematics and Computation in Music, 2024. Leur article
// n'a pas pu être obtenu : ces formules-ci sont rebâties depuis les définitions publiées ailleurs,
// et ne sont pas les leurs. Un rythme peut donc obtenir ici un autre chiffre que chez eux.
//
// ELLES NE DÉPENDENT QUE DES POSITIONS. Les étiquettes n'entrent dans aucune : permuter les sons
// d'un cercle ou inverser leur ordre laisse tous les scores identiques au millième. C'est un axe de
// composition que ces mesures ne voient pas, et mieux vaut le savoir que le découvrir.

import { estCercle, type Cercle } from "./cercle";

/** Les places d'un cercle, triées, sans doublon. C'est tout ce dont une mesure a besoin. */
function placesDe(c: Cercle): number[] {
  return [...new Set(c.sommets.map((s) => ((s.position % c.positions) + c.positions) % c.positions))]
    .sort((a, b) => a - b);
}

// ── La régularité ───────────────────────────────────────────────────────────────────────────────

/**
 * La somme des distances mesurées LE LONG DU CERCLE, entre toutes les paires d'attaques.
 *
 * ELLE EST ÉCRITE ICI POUR MONTRER POURQUOI ON NE S'EN SERT PAS. C'est la première mesure de
 * régularité proposée, et Toussaint établit qu'elle est trop grossière : les six patrons de clave et
 * de cloche en quatre temps — shiko, son, soukous, rumba, bossa-nova, gahu — donnent tous
 * exactement **quarante-huit**, alors que la rumba est visiblement moins régulière que la
 * bossa-nova. Une mesure qui ne distingue rien ne mesure rien. `regularite` emploie les cordes.
 */
export function sommeDesArcs(places: readonly number[], positions: number): number {
  let somme = 0;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const d = places[j] - places[i];
      somme += Math.min(d, positions - d);
    }
  }
  return somme;
}

/**
 * La somme des cordes entre toutes les paires d'attaques, rapportée à son maximum.
 *
 * LA CORDE, ET NON L'ARC. C'est la mesure de Block et Douthett que Toussaint retient, et elle
 * sépare ce que les arcs confondent. La corde entre deux places distantes de `d` sur un cercle de
 * rayon un vaut `2 sin(π d / positions)`.
 *
 * LE MAXIMUM EST CELUI DU POLYGONE RÉGULIER, `k cot(π / 2k)`, atteint quand les k attaques se
 * répartissent également. Ce maximum est celui du cercle continu : il n'est réellement atteignable
 * que si k divise le nombre de positions. Un rythme dont k ne divise pas le cycle reste donc
 * légèrement sous un, et c'est juste — il est bien un peu moins régulier que le polygone parfait.
 *
 * CE N'EST PAS LA NORMALISATION DE LASCABETTES ET BLOCH, qui ramènent chaque propriété sur
 * l'étendue observée parmi tous les rythmes de mêmes k et n. Celle-ci est théorique et ne demande
 * pas d'énumérer l'espace entier.
 */
export function regularite(places: readonly number[], positions: number): number {
  const k = places.length;
  if (k < 2) return 0;
  let somme = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      somme += 2 * Math.sin(Math.PI * (places[j] - places[i]) / positions);
    }
  }
  const maximum = k / Math.tan(Math.PI / (2 * k));
  return maximum > 0 ? somme / maximum : 0;
}

// ── L'équilibre ─────────────────────────────────────────────────────────────────────────────────

/**
 * Un moins la distance du centre de gravité des attaques au centre du cercle.
 *
 * C'est la mesure de Milne. Les attaques sont posées sur le cercle unité ; leur centre de gravité
 * tombe quelque part dedans, et le motif est parfaitement équilibré quand il tombe pile au centre.
 * La valeur va de zéro à un, un valant l'équilibre parfait.
 *
 * L'ÉQUILIBRE N'EST PAS LA RÉGULARITÉ. Un motif parfaitement régulier est parfaitement équilibré,
 * mais l'inverse est faux : il existe des motifs parfaitement équilibrés, sans aucune répétition
 * interne, et franchement irréguliers. C'est ce qui a fait l'intérêt de la notion.
 */
export function equilibre(places: readonly number[], positions: number): number {
  const k = places.length;
  if (k === 0) return 1;
  let x = 0, y = 0;
  for (const p of places) {
    const a = 2 * Math.PI * p / positions;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  return 1 - Math.hypot(x, y) / k;
}

// ── L'imparité rythmique ────────────────────────────────────────────────────────────────────────

/**
 * Le nombre de paires d'attaques diamétralement opposées.
 *
 * L'IMPARITÉ TIENT QUAND IL N'Y EN A AUCUNE : aucun diamètre ne coupe alors le cycle en deux
 * moitiés de durée égale. Simha Arom l'a relevée dans les musiques d'Afrique centrale ; le motif
 * aka `32222322222` en est l'exemple canonique.
 *
 * LA PROPRIÉTÉ N'A DE SENS QUE SUR UN CYCLE PAIR : sur un cycle impair, aucune place n'a
 * d'opposée, et l'imparité tient trivialement. La fonction rend alors zéro paire, ce qui est vrai
 * mais ne dit rien du rythme, et l'appelant doit le savoir.
 */
export function pairesOpposees(places: readonly number[], positions: number): number {
  if (positions % 2 !== 0) return 0;
  const moitie = positions / 2;
  const prises = new Set(places);
  let paires = 0;
  for (const p of places) if (p < moitie && prises.has(p + moitie)) paires++;
  return paires;
}

/** Vrai quand aucune attaque n'a son opposée. Toujours vrai sur un cycle impair. */
export const impariteRythmique = (places: readonly number[], positions: number): boolean =>
  pairesOpposees(places, positions) === 0;

// ── Les contretemps ─────────────────────────────────────────────────────────────────────────────

/**
 * Le nombre d'attaques posées là où aucun polygone régulier ne passe.
 *
 * Les sommets des polygones réguliers inscrits dans le cycle sont les places dont le rang partage
 * un facteur avec le nombre de positions. Une place première avec le cycle n'appartient donc à
 * aucun d'eux : elle est à contretemps, au sens de Toussaint. Sur un cycle de seize, ce sont les
 * places impaires ; sur un cycle de douze, les places 1, 5, 7 et 11.
 */
export function contretemps(places: readonly number[], positions: number): number {
  const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));
  return places.filter((p) => p > 0 && pgcd(p, positions) === 1).length;
}

// ── L'aire ──────────────────────────────────────────────────────────────────────────────────────

/**
 * L'aire du polygone inscrit, rapportée à celle du polygone régulier de même nombre de sommets.
 *
 * DESSINER LE POLYGONE N'EST PAS ILLUSTRER : son aire est une quantité, maximale exactement quand
 * les attaques se répartissent également. Les sommets étant rangés autour du cercle, le polygone
 * est convexe et son aire vaut la demi-somme des sinus des angles entre sommets consécutifs.
 *
 * IL Y A UNE AUTRE AIRE CHEZ TOUSSAINT, celle du nuage obtenu en portant chaque durée contre la
 * suivante. Ce n'est pas celle-ci, et elle n'est pas calculée ici : les deux existent, et laquelle
 * il faut dépend de ce qu'on cherche à voir.
 */
export function airePolygone(places: readonly number[], positions: number): number {
  const k = places.length;
  if (k < 3) return 0;
  let aire = 0;
  for (let i = 0; i < k; i++) {
    // L'écart au centre entre deux sommets consécutifs, pris modulo le cycle : le dernier terme
    // referme le tour sans qu'on ait à le traiter à part.
    const ecart = (places[(i + 1) % k] - places[i] + positions) % positions;
    aire += Math.sin(2 * Math.PI * ecart / positions);
  }
  const maximum = k * Math.sin(2 * Math.PI / k);
  return maximum > 0 ? aire / maximum : 0;
}

// ── Les symétries ───────────────────────────────────────────────────────────────────────────────

/**
 * Les axes de réflexion qui laissent le rythme inchangé.
 *
 * Un cycle de n places a n réflexions, `p` allant sur `a - p` pour chaque `a`. On rend les `a` qui
 * renvoient le motif sur lui-même : un motif sans aucune symétrie rend une liste vide.
 */
export function axesDeSymetrie(places: readonly number[], positions: number): number[] {
  const prises = new Set(places);
  const axes: number[] = [];
  for (let a = 0; a < positions; a++) {
    let tient = true;
    for (const p of places) {
      if (!prises.has(((a - p) % positions + positions) % positions)) { tient = false; break; }
    }
    if (tient) axes.push(a);
  }
  return axes;
}

/**
 * La plus petite rotation qui laisse le rythme inchangé, égale au cycle quand il ne se répète pas.
 *
 * UN MOTIF QUI SE RÉPÈTE À L'INTÉRIEUR DE SON CYCLE est moins riche qu'il n'en a l'air : la
 * résultante de quatre contre deux n'est pas plus riche que celle de deux contre un, c'est la même
 * jouée deux fois plus lentement. C'est aussi ce qui distingue les motifs parfaitement équilibrés
 * intéressants, qui ne se répètent pas, de ceux qui ne sont qu'un polygone régulier répété.
 */
export function periode(places: readonly number[], positions: number): number {
  const prises = new Set(places);
  for (let d = 1; d < positions; d++) {
    if (positions % d !== 0) continue;
    let tient = true;
    for (const p of places) {
      if (!prises.has((p + d) % positions)) { tient = false; break; }
    }
    if (tient) return d;
  }
  return positions;
}

// ── Le relevé complet ───────────────────────────────────────────────────────────────────────────

export interface MesuresCercle {
  positions: number;
  attaques: number;
  /** De zéro à un, un valant le polygone régulier. */
  regularite: number;
  /** De zéro à un, un valant l'équilibre parfait. */
  equilibre: number;
  /** De zéro à un, un valant l'aire du polygone régulier. */
  aire: number;
  /** Vrai quand aucune attaque n'a son opposée. */
  imparite: boolean;
  pairesOpposees: number;
  contretemps: number;
  axesDeSymetrie: number[];
  /** Égale au cycle quand le motif ne se répète pas à l'intérieur de lui-même. */
  periode: number;
  /** La somme des arcs, gardée pour mémoire : elle ne distingue pas les six claves. */
  sommeDesArcs: number;
}

/** Toutes les mesures d'un cercle, d'un coup. Les étiquettes n'y entrent pas. */
export function mesurer(c: Cercle): MesuresCercle {
  const places = placesDe(c);
  const n = c.positions;
  return {
    positions: n,
    attaques: places.length,
    regularite: regularite(places, n),
    equilibre: equilibre(places, n),
    aire: airePolygone(places, n),
    imparite: impariteRythmique(places, n),
    pairesOpposees: pairesOpposees(places, n),
    contretemps: contretemps(places, n),
    axesDeSymetrie: axesDeSymetrie(places, n),
    periode: periode(places, n),
    sommeDesArcs: sommeDesArcs(places, n),
  };
}

// ── Plusieurs cercles à la fois ─────────────────────────────────────────────────────────────────

/** Le plafond du plus petit commun multiple, au-delà duquel on refuse de bâtir une grille. */
export const GRILLE_MAX = 4096;

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));
const ppcm = (a: number, b: number): number => (a / pgcd(a, b)) * b;

/**
 * Ramène plusieurs cercles sur une grille commune, pour les mesurer ensemble.
 *
 * LES CERCLES RESTENT PARALLÈLES À L'ÉCOUTE, et cette grille n'existe que pour le calcul. Un score
 * n'a de sens que sur un cycle, et trois cercles de tailles différentes n'en partagent aucun : on
 * les projette donc sur le plus petit commun multiple le temps de compter, et pas plus.
 *
 * ELLE PEUT REFUSER. Seize et douze donnent quarante-huit, mais une taille première mêlée aux
 * autres fait exploser le produit. Au-delà du plafond on rend `null`, à charge pour l'appelant de
 * le dire plutôt que de faire attendre.
 */
export function grilleCommune(cercles: readonly Cercle[], plafond = GRILLE_MAX): { positions: number; places: number[] } | null {
  const valides = cercles.filter(estCercle);
  if (valides.length === 0) return null;
  let n = 1;
  for (const c of valides) {
    n = ppcm(n, c.positions);
    if (n > plafond) return null;
  }
  const places = new Set<number>();
  for (const c of valides) {
    const facteur = n / c.positions;
    for (const p of placesDe(c)) places.add(p * facteur);
  }
  return { positions: n, places: [...places].sort((a, b) => a - b) };
}
