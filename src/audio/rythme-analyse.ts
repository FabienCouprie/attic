// audio/rythme-analyse.ts — Faire pour le rythme ce que les classes de hauteurs font pour la hauteur.
//
// D'après Godfried Toussaint, « The Geometry of Musical Rhythm: What Makes a "Good" Rhythm Good? »,
// Chapman & Hall/CRC, 2013 (2ᵉ édition 2020), et « The Euclidean Algorithm Generates Traditional
// Musical Rhythms », Banff, 2005.
//
// L'ASYMÉTRIE QUE CE MODULE COMBLE. Attic analyse la hauteur en profondeur : « Classes de
// hauteurs » rend forme normale, forme première et vecteur d'intervalles, avec les noms de Forte ;
// le Tonnetz enchaîne les transformations néo-riemanniennes ; le contrepoint d'espèces vérifie
// Fux. Côté rythme, il n'y avait qu'un GÉNÉRATEUR — le rythme euclidien de Bjorklund — et rien
// pour REGARDER un rythme. Or Toussaint a montré que le rythme se décrit avec exactement les mêmes
// outils : un ensemble de points sur un cercle, ses distances, ses symétries, sa régularité.
//
// LE CERCLE PLUTÔT QUE LA LIGNE. Un rythme se répète : sa fin touche son début. Toutes les mesures
// ci-dessous comptent donc les distances SUR LE CERCLE, c'est-à-dire la plus courte des deux
// façons d'aller d'une frappe à l'autre. C'est ce qui fait qu'un rythme et ses rotations sont le
// même objet — la clave son et la rumba ne diffèrent que par l'endroit où l'on commence à compter.

/** Un rythme : les positions des frappes sur `pas` cases, triées, sans doublon. */
export interface Rythme {
  positions: number[];
  pas: number;
}

export function rythme(positions: number[], pas: number): Rythme {
  const p = [...new Set(positions.map((x) => ((Math.round(x) % pas) + pas) % pas))].sort((a, b) => a - b);
  return { positions: p, pas };
}

/** Le motif en cases pleines et vides, la forme sous laquelle on lit un rythme. */
export function enCases(r: Rythme): string {
  const s = Array.from({ length: r.pas }, () => ".");
  for (const p of r.positions) s[p] = "x";
  return s.join("");
}

/** Les intervalles entre frappes successives, le tour bouclé. */
export function intervallesSuccessifs(r: Rythme): number[] {
  const n = r.positions.length;
  if (n === 0) return [];
  return r.positions.map((p, i) => (i + 1 < n ? r.positions[i + 1] - p : r.pas - p + r.positions[0]));
}

/**
 * L'histogramme des distances : pour chaque distance possible, combien de paires de frappes la
 * réalisent.
 *
 * C'est le VECTEUR D'INTERVALLES DU RYTHME, l'exact analogue de celui des classes de hauteurs :
 * là-bas on compte les intervalles entre notes d'un accord, ici les écarts entre frappes d'un
 * cycle. Deux rythmes qui partagent cet histogramme se ressemblent d'une façon qui ne dépend ni de
 * leur rotation ni de leur reflet.
 */
export function histogrammeDistances(r: Rythme): number[] {
  const h = new Array(Math.floor(r.pas / 2) + 1).fill(0);
  for (let i = 0; i < r.positions.length; i++) {
    for (let j = i + 1; j < r.positions.length; j++) {
      const d = Math.abs(r.positions[j] - r.positions[i]);
      h[Math.min(d, r.pas - d)]++;
    }
  }
  return h.slice(1);
}

/**
 * Un rythme est PROFOND quand chaque distance présente y apparaît un nombre de fois différent, et
 * que ces nombres forment la suite 1, 2, 3, …
 *
 * La notion vient de la théorie des gammes — Winograd, puis Toussaint l'a portée au rythme. Elle
 * dit quelque chose de fort : dans un rythme profond, chaque écart a sa propre rareté, si bien
 * qu'aucune paire de frappes n'est interchangeable avec une autre. Presque tous les rythmes
 * euclidiens le sont, et c'est l'une des raisons avancées de leur omniprésence.
 */
export function estProfond(r: Rythme): boolean {
  const k = r.positions.length;
  if (k < 2) return false;
  const h = histogrammeDistances(r).filter((x) => x > 0);
  const attendus = Array.from({ length: k - 1 }, (_, i) => i + 1);
  return h.length === k - 1 && [...h].sort((a, b) => a - b).join() === attendus.join();
}

/** La rotation qui donne la plus petite écriture : deux rythmes tournés l'un de l'autre la partagent. */
export function collier(r: Rythme): string {
  const cases = enCases(r);
  let meilleur = cases;
  for (let k = 1; k < r.pas; k++) {
    const t = cases.slice(k) + cases.slice(0, k);
    if (t < meilleur) meilleur = t;
  }
  return meilleur;
}

/** Le collier, reflet compris : deux rythmes miroir l'un de l'autre le partagent aussi. */
export function bracelet(r: Rythme): string {
  const direct = collier(r);
  const miroir = collier(rythme(r.positions.map((p) => (r.pas - p) % r.pas), r.pas));
  return direct < miroir ? direct : miroir;
}

/**
 * L'uniformité : à quel point les frappes sont également réparties, entre 0 et 1.
 *
 * COMMENT ELLE SE MESURE, ET POURQUOI AINSI. Chaque paire de frappes définit une corde du cercle ;
 * la somme de ces cordes est maximale quand les points sont le plus écartés possible. Toussaint
 * prend donc cette somme comme mesure de régularité, et le maximum est atteint par le rythme
 * parfaitement régulier — celui qu'on n'obtient que si le nombre de frappes divise le nombre de
 * pas. On rapporte la somme à ce maximum théorique : un vaut la régularité parfaite, et les
 * rythmes euclidiens s'en approchent au plus près que l'arithmétique permette.
 */
export function uniformite(r: Rythme): number {
  const k = r.positions.length;
  if (k < 2) return 1;
  let somme = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const d = Math.abs(r.positions[j] - r.positions[i]);
      somme += 2 * Math.sin((Math.PI * Math.min(d, r.pas - d)) / r.pas);
    }
  }
  // Le maximum : k points aux sommets d'un polygone régulier, quelle que soit la divisibilité.
  let max = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const d = j - i;
      max += 2 * Math.sin((Math.PI * Math.min(d, k - d)) / k);
    }
  }
  return max > 0 ? somme / max : 1;
}

/**
 * Les frappes à CONTRETEMPS : celles qui ne tombent sur aucune subdivision régulière du cycle.
 *
 * Une position est « sur le temps » si elle appartient aux sommets d'un polygone régulier inscrit
 * — les multiples de `pas/k` pour un diviseur `k` de `pas`. Toussaint montre que cette mesure
 * sépare les rythmes africains et afro-cubains des rythmes de danse européens bien mieux que les
 * mesures de syncope usuelles, qui supposent une métrique binaire.
 */
export function contretemps(r: Rythme): number[] {
  const surLeTemps = new Set<number>([0]);
  // DIVISEURS PROPRES SEULEMENT, `1 < k < pas`. Le polygone à `pas` sommets est le cycle entier :
  // l'inclure déclarerait toute position sur le temps, et la mesure rendrait toujours zéro — ce
  // que le test sur le tresillo a montré tout de suite.
  for (let k = 2; k < r.pas; k++) {
    if (r.pas % k !== 0) continue;
    for (let i = 0; i < k; i++) surLeTemps.add((i * r.pas) / k);
  }
  return r.positions.filter((p) => !surLeTemps.has(p));
}

/**
 * La distance d'échange entre deux rythmes de même nombre de frappes : combien de glissements
 * d'une case il faut pour passer de l'un à l'autre.
 *
 * Les frappes étant appariées dans l'ordre, la somme des écarts est le compte cherché. On essaie
 * toutes les rotations de la cible, parce que deux rythmes tournés l'un de l'autre sont le même
 * rythme joué à partir d'un autre temps — et la distance doit le dire.
 */
export function distanceEchange(a: Rythme, b: Rythme): number {
  if (a.positions.length !== b.positions.length || a.pas !== b.pas) return Infinity;
  let meilleure = Infinity;
  for (let k = 0; k < a.pas; k++) {
    const tourne = rythme(b.positions.map((p) => p + k), b.pas);
    let somme = 0;
    for (let i = 0; i < a.positions.length; i++) {
      const d = Math.abs(a.positions[i] - tourne.positions[i]);
      somme += Math.min(d, a.pas - d);
    }
    meilleure = Math.min(meilleure, somme);
  }
  return meilleure;
}

export interface AnalyseRythme {
  cases: string;
  intervalles: number[];
  histogramme: number[];
  profond: boolean;
  collier: string;
  bracelet: string;
  uniformite: number;
  contretemps: number[];
  /** Le rythme euclidien de mêmes effectifs, et la distance qui l'en sépare. */
  euclidien: string;
  distanceEuclidien: number;
  estEuclidien: boolean;
}

export function analyserRythme(r: Rythme, motifEuclidien: boolean[]): AnalyseRythme {
  const euclid = rythme(
    motifEuclidien.map((v, i) => (v ? i : -1)).filter((i) => i >= 0), r.pas,
  );
  const d = distanceEchange(r, euclid);
  return {
    cases: enCases(r),
    intervalles: intervallesSuccessifs(r),
    histogramme: histogrammeDistances(r),
    profond: estProfond(r),
    collier: collier(r),
    bracelet: bracelet(r),
    uniformite: uniformite(r),
    contretemps: contretemps(r),
    euclidien: enCases(euclid),
    distanceEuclidien: d,
    // Même collier : c'est le même rythme, joué à partir d'un autre temps.
    estEuclidien: collier(r) === collier(euclid),
  };
}
