// audio/superforme.ts — Une équation, et toutes les figures.
//
// POURQUOI UNE FORMULE PLUTÔT QU'UNE LISTE DE FIGURES, demandé par Fabien : « polygones, étoiles,
// ovales, losanges, tout ce que tu peux imaginer ». Les écrire une à une aurait donné autant de
// fonctions que de formes, sans aucun passage de l'une à l'autre. La superformule de Gielis les
// donne TOUTES à partir de six nombres, et surtout elle les relie : faire varier un seul de ces
// nombres déforme un losange en cercle, un cercle en étoile, une étoile en fleur, sans rupture.
//
// D'après Johan Gielis, « A generic geometric transformation that unifies a wide range of natural
// and abstract shapes », American Journal of Botany 90(3), 2003.
//
//     r(θ) = ( |cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3 ) ^ (−1/n1)
//
//   m        la symétrie : le nombre de lobes. 4 donne les quadrilatères, 5 une étoile à cinq
//            branches. À zéro l angle disparaît de l équation et tout redevient un cercle, ce qui
//            rend les demi-axes inopérants : un ovale demande donc m = 4, comme un cercle.
//   n1       la rondeur d'ensemble. Grand, la figure gonfle vers le cercle ; petit, elle se creuse.
//   n2, n3   la forme des lobes, séparément sur les deux axes. Égaux, la figure est symétrique.
//   a, b     les deux demi-axes : c'est par eux qu'un cercle devient un ovale.
//
// CE QUE CELA COÛTE : un cosinus, un sinus et deux puissances par point, deux cents points par
// figure. Mesuré dans l'application, le dessin d'une image entière tient dans deux dixièmes de
// milliseconde, quand l'encodeur en prend dix. La richesse de la figure est donc gratuite.

export interface Superforme {
  /** La symétrie : le nombre de lobes. */
  m: number;
  n1: number;
  n2: number;
  n3: number;
  /** Demi-axe horizontal. */
  a: number;
  /** Demi-axe vertical. */
  b: number;
}

/**
 * Le rayon de la figure à l'angle donné, entre 0 et 1 pour les formes usuelles.
 *
 * LE CAS DÉGÉNÉRÉ REND UN CERCLE plutôt qu'un infini : une somme nulle sous une puissance négative
 * part à l'infini, et une figure qui explose ne se dessine pas. Cela arrive dès qu'un demi-axe est
 * nul, ce qu'un réglage à la souris atteint en passant.
 */
export function rayonSuperforme(theta: number, f: Superforme): number {
  const a = Math.abs(f.a) < 1e-6 ? 1e-6 : f.a;
  const b = Math.abs(f.b) < 1e-6 ? 1e-6 : f.b;
  const n1 = Math.abs(f.n1) < 1e-6 ? 1e-6 : f.n1;
  const t = (f.m * theta) / 4;
  const somme = Math.abs(Math.cos(t) / a) ** f.n2 + Math.abs(Math.sin(t) / b) ** f.n3;
  if (!Number.isFinite(somme) || somme <= 0) return 1;
  const r = somme ** (-1 / n1);
  return Number.isFinite(r) ? r : 1;
}

/**
 * Les points d'une figure, sur un tour complet.
 *
 * LE RAYON EST RAMENÉ À UN, et c'est indispensable : la superformule rend des rayons dont l'échelle
 * dépend des six nombres, si bien qu'une étoile serait trois fois plus petite qu'un cercle à
 * réglage égal. Les normaliser fait que changer de figure change la FORME, et rien d'autre.
 */
export function pointsSuperforme(f: Superforme, points = 240): { x: number; y: number }[] {
  const n = Math.max(3, Math.round(points));
  const rayons: number[] = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    const r = rayonSuperforme((i / n) * Math.PI * 2, f);
    rayons.push(r);
    if (r > max) max = r;
  }
  const echelle = max > 1e-9 ? 1 / max : 1;
  return rayons.map((r, i) => {
    const theta = (i / n) * Math.PI * 2;
    return { x: Math.cos(theta) * r * echelle, y: Math.sin(theta) * r * echelle };
  });
}

/**
 * Les figures nommées, et ce qu'elles sont.
 *
 * ELLES NE SONT QUE DES RÉGLAGES DE LA MÊME ÉQUATION, ce qui est tout l'intérêt : on passe de l'une
 * à l'autre sans changer de dessin, en déplaçant six nombres. Une figure absente de cette liste se
 * compose donc en réglant la formule, et rien n'a à être ajouté pour l'obtenir.
 */
// LES POLYGONES VEULENT DE PETITS EXPOSANTS, et c'est le contraire de l'intuition : relevé en
// balayant n, le pentagone régulier tombe à n = 5 (rapport pointe sur côté 1,231 pour 1,236 exact)
// et l'hexagone à n = 3 (1,122 pour 1,155). Monter n ne les arrondit pas, cela les rapproche du
// carré à coins mousses, qui est une autre figure de la même famille.
export const FIGURES: Record<string, Superforme> = {
  Cercle: { m: 4, n1: 2, n2: 2, n3: 2, a: 1, b: 1 },
  Ovale: { m: 4, n1: 2, n2: 2, n3: 2, a: 1, b: 0.55 },
  Losange: { m: 4, n1: 1, n2: 1, n3: 1, a: 1, b: 1 },
  Carré: { m: 4, n1: 20, n2: 20, n3: 20, a: 1, b: 1 },
  Triangle: { m: 3, n1: 1, n2: 1, n3: 1, a: 1, b: 1 },
  Pentagone: { m: 5, n1: 5, n2: 5, n3: 5, a: 1, b: 1 },
  Hexagone: { m: 6, n1: 3, n2: 3, n3: 3, a: 1, b: 1 },
  Étoile: { m: 5, n1: 0.35, n2: 0.4, n3: 0.4, a: 1, b: 1 },
  "Étoile à six": { m: 6, n1: 0.3, n2: 0.35, n3: 0.35, a: 1, b: 1 },
  Fleur: { m: 8, n1: 1, n2: 0.6, n3: 0.6, a: 1, b: 1 },
  Rosace: { m: 12, n1: 1.2, n2: 1.8, n3: 1.8, a: 1, b: 1 },
  Astroïde: { m: 4, n1: 0.5, n2: 0.5, n3: 0.5, a: 1, b: 1 },
  Goutte: { m: 1, n1: 0.6, n2: 1.2, n3: 1.2, a: 1, b: 1 },
  Croix: { m: 4, n1: 0.3, n2: 6, n3: 6, a: 1, b: 1 },
  Lentille: { m: 2, n1: 1, n2: 1, n3: 1, a: 1, b: 1 },
};

export const NOMS_FIGURES = Object.keys(FIGURES);

/**
 * Les mêmes figures en anglais, dans le même ordre.
 *
 * ELLE EXISTE PARCE QU'UN CONTRAT LA RÉCLAME : rien de ce que le registre affiche en anglais ne
 * doit rester français, et « Astroïde » n'est pas de l'anglais. L'identifiant, lui, reste le nom
 * français, qui est la forme canonique d'un choix dans ce dépôt.
 */
export const NOMS_FIGURES_EN = [
  "Circle", "Oval", "Diamond", "Square", "Triangle", "Pentagon", "Hexagon",
  "Star", "Six-pointed star", "Flower", "Rosette", "Astroid", "Drop", "Cross", "Lens",
];

/**
 * Une figure entre deux autres, pour passer de l'une à l'autre sans rupture.
 *
 * LE MÉLANGE SE FAIT SUR LES NOMBRES, ET NON SUR LES POINTS. Interpoler deux tracés point par point
 * donnerait une forme intermédiaire quelconque, souvent repliée ; interpoler les six paramètres
 * reste DANS la famille des superformes, et toutes les étapes sont donc des figures.
 */
export function melangerFigures(x: Superforme, y: Superforme, part: number): Superforme {
  const u = Math.min(1, Math.max(0, part));
  const entre = (p: number, q: number) => p + (q - p) * u;
  return {
    m: entre(x.m, y.m), n1: entre(x.n1, y.n1), n2: entre(x.n2, y.n2),
    n3: entre(x.n3, y.n3), a: entre(x.a, y.a), b: entre(x.b, y.b),
  };
}
