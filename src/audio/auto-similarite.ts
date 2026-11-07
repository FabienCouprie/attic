// audio/auto-similarite.ts — Matrice d'auto-similarité et détection de structure (Foote).
//
// Attic sait comparer deux pistes et les aligner. Il ne savait rien dire de la forme d'UN
// morceau : où commence le refrain, quand la matière change. Jonathan Foote a proposé en
// 1999 un procédé d'une simplicité désarmante et devenu la base de toute l'analyse de
// structure musicale.
//
// On découpe le morceau en trames, on décrit chacune par un vecteur — ici le chromagramme,
// qui dit quelles notes sonnent —, et l'on compare CHAQUE trame à CHAQUE autre. Le résultat
// est une image carrée, symétrique, avec une diagonale blanche : la matrice
// d'auto-similarité. On y lit la forme à l'œil nu — un carré clair est un passage homogène,
// une diagonale décalée est une répétition littérale.
//
// Pour passer de l'image aux frontières, Foote fait glisser le long de la diagonale un
// NOYAU EN DAMIER : deux carrés clairs sur la diagonale, deux carrés sombres hors diagonale.
// Ce motif ne s'accorde bien qu'à un endroit où « avant » ressemble à « avant », « après »
// ressemble à « après », et où les deux ne se ressemblent pas — c'est-à-dire exactement une
// frontière. La courbe obtenue s'appelle la nouveauté, et ses pics sont les articulations
// du morceau.
//
// LE TOUT SE FAIT HORS DU FIL depuis le 2026-11-07, par `analyserAutoSimilarite` en bas de ce
// fichier : sur deux minutes de son, le composant gelait la page 1 128 ms d'un bloc, l'essentiel
// dans le chromagramme. Ce fichier n'importe que la mesure, sans texte ; le composant rédige.

import { SAUT_TRAME_CHROMAGRAMME, chromagrammeParTrame } from "./analyse-mesures";

/** Similarité cosinus, entre 0 et 1 pour des vecteurs positifs. */
export function cosinus(a: number[], b: number[]): number {
  let produit = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    produit += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return produit / Math.sqrt(na * nb);
}

/**
 * Regroupe des trames fines en trames plus longues, par moyenne.
 *
 * Les descripteurs d'Attic sont calculés à pas fixe — le chromagramme avance de 512
 * échantillons, soit 12 ms —, ce qui est beaucoup trop fin pour regarder la FORME d'un
 * morceau : une matrice de dix mille trames de côté serait illisible et ne montrerait que
 * le détail des attaques. Moyenner ramène l'analyse à l'échelle qu'on veut observer, et
 * lisse au passage le bruit de mesure.
 */
export function regrouper(trames: number[][], facteur: number): number[][] {
  const f = Math.max(1, Math.floor(facteur));
  if (f === 1) return trames;
  const sortie: number[][] = [];
  for (let debut = 0; debut < trames.length; debut += f) {
    const groupe = trames.slice(debut, debut + f);
    if (groupe.length === 0) continue;
    const taille = groupe[0].length;
    const moyenne = new Array(taille).fill(0);
    for (const t of groupe) {
      for (let i = 0; i < taille; i++) moyenne[i] += (t[i] ?? 0) / groupe.length;
    }
    sortie.push(moyenne);
  }
  return sortie;
}

/** La matrice carrée des similarités entre toutes les trames. */
export function matriceSimilarite(trames: number[][]): number[][] {
  const n = trames.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    m[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = cosinus(trames[i], trames[j]);
      m[i][j] = s;
      m[j][i] = s;
    }
  }
  return m;
}

/**
 * Le noyau en damier de Foote, lissé par une gaussienne.
 *
 * Les quadrants diagonaux valent +1, les autres −1 ; sans le lissage, le noyau réagirait
 * trop brutalement et la courbe de nouveauté serait hachée.
 */
export function noyauDamier(demiTaille: number): number[][] {
  const t = Math.max(1, Math.floor(demiTaille));
  const taille = 2 * t;
  const noyau: number[][] = [];
  for (let i = 0; i < taille; i++) {
    const ligne: number[] = [];
    for (let j = 0; j < taille; j++) {
      const x = (i - t + 0.5) / t, y = (j - t + 0.5) / t;
      const signe = (i < t) === (j < t) ? 1 : -1;
      ligne.push(signe * Math.exp(-4 * (x * x + y * y)));
    }
    noyau.push(ligne);
  }
  return noyau;
}

/**
 * La courbe de nouveauté : le noyau glissé le long de la diagonale.
 *
 * Aux deux bouts, le noyau déborde de la matrice ; on laisse alors la courbe à zéro plutôt
 * que de compléter par des valeurs inventées, qui feraient de faux pics au début et à la
 * fin — c'est-à-dire précisément là où l'on n'a rien à détecter.
 */
export function courbeNouveaute(matrice: number[][], demiTaille: number): number[] {
  const n = matrice.length;
  const t = Math.max(1, Math.floor(demiTaille));
  const noyau = noyauDamier(t);
  const courbe = new Array(n).fill(0);
  for (let c = t; c < n - t; c++) {
    let somme = 0;
    for (let i = 0; i < 2 * t; i++) {
      for (let j = 0; j < 2 * t; j++) {
        somme += noyau[i][j] * matrice[c - t + i][c - t + j];
      }
    }
    courbe[c] = somme;
  }
  // Ramenée entre 0 et 1 par le seul MAXIMUM, faute de quoi le seuil dépendrait de la
  // taille du noyau. On ne recale pas sur le minimum : les valeurs négatives disent
  // « l'inverse d'une frontière » et n'intéressent pas, et surtout ce recalage ferait
  // remonter les bords — laissés à zéro exprès — au-dessus de zéro, donc inventerait un
  // plateau là où l'on n'a rien mesuré.
  const max = Math.max(...courbe, 1e-9);
  return courbe.map((x) => Math.max(0, x / max));
}

/**
 * Les frontières : les pics de la courbe de nouveauté.
 *
 * `ecartMinimal` empêche de rendre deux frontières collées, qui décriraient la même
 * articulation deux fois — un pic large donne sinon trois ou quatre maxima locaux.
 */
export function frontieres(courbe: number[], seuil: number, ecartMinimal: number): number[] {
  const pics: { index: number; valeur: number }[] = [];
  for (let i = 1; i < courbe.length - 1; i++) {
    if (courbe[i] >= seuil && courbe[i] > courbe[i - 1] && courbe[i] >= courbe[i + 1]) {
      pics.push({ index: i, valeur: courbe[i] });
    }
  }
  // Les plus francs d'abord, puis on écarte leurs voisins immédiats.
  pics.sort((a, b) => b.valeur - a.valeur);
  const gardes: number[] = [];
  for (const p of pics) {
    if (gardes.every((g) => Math.abs(g - p.index) >= Math.max(1, ecartMinimal))) gardes.push(p.index);
  }
  return gardes.sort((a, b) => a - b);
}

export interface Segment {
  debut: number;
  fin: number;
}

/** Les segments délimités par les frontières, en numéros de trame. */
export function segments(frontieresTrames: number[], nombreTrames: number): Segment[] {
  const bornes = [0, ...frontieresTrames.filter((f) => f > 0 && f < nombreTrames), nombreTrames];
  const sortie: Segment[] = [];
  for (let i = 0; i + 1 < bornes.length; i++) {
    if (bornes[i + 1] > bornes[i]) sortie.push({ debut: bornes[i], fin: bornes[i + 1] });
  }
  return sortie;
}

/**
 * La matrice en SVG, du noir au blanc.
 *
 * Une image carrée de N sur N pixels dessinée en rectangles serait énorme : on échantillonne
 * donc la matrice sur une grille d'au plus 240 cases de côté, ce qui suffit largement à
 * voir la structure et garde le fichier lisible.
 */
export function matriceEnSvg(matrice: number[][], taille = 240): string {
  const n = matrice.length;
  if (n === 0) return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"></svg>";
  const cases = Math.min(taille, n);
  const pas = n / cases;
  const cote = Math.max(1, Math.floor(taille / cases));
  const rects: string[] = [];
  for (let i = 0; i < cases; i++) {
    for (let j = 0; j < cases; j++) {
      const v = matrice[Math.floor(i * pas)][Math.floor(j * pas)];
      const g = Math.max(0, Math.min(255, Math.round(v * 255)));
      rects.push(`<rect x="${j * cote}" y="${i * cote}" width="${cote}" height="${cote}" fill="rgb(${g},${g},${g})"/>`);
    }
  }
  const dimension = cases * cote;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" viewBox="0 0 ${dimension} ${dimension}">`,
    `<rect width="${dimension}" height="${dimension}" fill="black"/>`,
    ...rects,
    "</svg>",
  ].join("");
}

/** Ce que reçoit l'analyse : le premier canal, seul lu, et les réglages du composant. */
export interface DemandeAutoSimilarite {
  mono: Float32Array;
  sampleRate: number;
  /** En secondes. */
  dureeTrame: number;
  /** Demi-largeur demandée du noyau, en trames, avant d'être bornée au tiers du morceau. */
  noyau: number;
  /** En pour cent. */
  seuil: number;
  ecartMinimal: number;
}

export interface ResultatAutoSimilarite {
  nombreTrames: number;
  /** Les sections, les frontières en trames, et la matrice dessinée ; vides sous huit trames. */
  parties: Segment[];
  frontieres: number[];
  svg: string | null;
}

/** L'analyse entière du composant : chromagramme, matrice, nouveauté, frontières et dessin. */
export function analyserAutoSimilarite(d: DemandeAutoSimilarite): ResultatAutoSimilarite {
  // Le chromagramme avance de 512 échantillons ; on regroupe pour atteindre la durée
  // de trame demandée, seule échelle à laquelle la forme d'un morceau se voit.
  const facteur = Math.max(1, Math.round((d.dureeTrame * d.sampleRate) / SAUT_TRAME_CHROMAGRAMME));
  const trames = regrouper(chromagrammeParTrame(d.mono, d.sampleRate), facteur);
  if (trames.length < 8) return { nombreTrames: trames.length, parties: [], frontieres: [], svg: null };
  const matrice = matriceSimilarite(trames);
  const noyau = Math.min(Math.round(d.noyau), Math.floor(trames.length / 3));
  const courbe = courbeNouveaute(matrice, Math.max(2, noyau));
  const trouvees = frontieres(courbe, d.seuil / 100, Math.round(d.ecartMinimal));
  return {
    nombreTrames: trames.length,
    parties: segments(trouvees, trames.length),
    frontieres: trouvees,
    svg: matriceEnSvg(matrice, 320),
  };
}
