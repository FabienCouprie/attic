// audio/ssp.ts — La synthèse non standard : composer la forme d'onde comme on compose une pièce.
//
// D'après Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institut de sonologie
// d'Utrecht, années 1970, et les principes de sélection de ses programmes Projet 1 (1964) et
// Projet 2 (1966). Voir aussi Luc Döbereiner, « Models of Constructed Sound : Nonstandard Synthesis
// as an Aesthetic Perspective », Computer Music Journal 35(3), 2011.
//
// CE QUE « NON STANDARD » VEUT DIRE, ET POURQUOI C'EST RADICAL. Toute la synthèse ordinaire part
// d'un modèle : un oscillateur, une forme d'onde, un spectre, une enveloppe, un instrument. Ici il
// n'y a rien de tout cela. Le compositeur donne deux ensembles de nombres — des amplitudes et des
// durées — et des principes pour y puiser. Les couples ainsi tirés sont des POINTS, et le son est
// le trait qui les relie. Pas d'oscillateur, pas de forme d'onde, pas de note, pas de hauteur : la
// hauteur qu'on entendra est une conséquence des durées choisies, jamais un réglage.
//
// LA THÈSE DE KOENIG : LES MÊMES PRINCIPES À TOUTES LES ÉCHELLES. Ce qui ordonne les points d'une
// forme d'onde ordonne aussi les sections d'une pièce. Composer un son et composer une forme sont
// la même activité, menée sur des nombres différents. C'est pourquoi le même choix de principes est
// offert ici pour les amplitudes, pour les durées, et pour l'ordre des sections.
//
// L'AVERTISSEMENT QUI DOIT ACCOMPAGNER CE NŒUD. SSP a la réputation d'être impossible à diriger :
// l'écrasante majorité des réglages rend du bruit, et Koenig lui-même a constaté que le programme
// résistait à l'intention musicale. Un nœud qui rendrait du bruit quoi qu'on fasse serait un
// générateur de bruit affublé d'une bibliographie. Les tests mesurent donc ce que les réglages
// commandent VRAIMENT — et ils commandent deux choses, l'échelle de temps et la répartition des
// amplitudes —, faute de quoi il n'y aurait pas lieu de publier ce nœud.

/** Les principes de sélection de Koenig, ceux de Projet 1 et 2 portés à l'échelle de l'onde. */
export const PRINCIPES = [
  { id: "alea", fr: "Aléa", en: "Alea" },
  { id: "serie", fr: "Série", en: "Series" },
  { id: "sequence", fr: "Séquence", en: "Sequence" },
  { id: "groupe", fr: "Groupe", en: "Group" },
  { id: "tendance", fr: "Tendance", en: "Tendency" },
] as const;

export type Principe = (typeof PRINCIPES)[number]["id"];

export const EST_PRINCIPE = (x: string): x is Principe => PRINCIPES.some((p) => p.id === x);

export const nomPrincipe = (p: Principe, en: boolean): string =>
  (PRINCIPES.find((x) => x.id === p) ?? PRINCIPES[0])[en ? "en" : "fr"];

/** Un générateur à graine : sans reproductibilité, aucun de ces principes ne se vérifierait. */
export function alea(graine: number): () => number {
  let e = (graine >>> 0) || 1;
  return () => {
    e = (e * 1664525 + 1013904223) >>> 0;
    return e / 4294967296;
  };
}

/**
 * Le tirage d'une suite d'indices dans un ensemble, selon un principe.
 *
 * C'est le cœur de SSP, et c'est tout ce qu'il y a : les cinq principes ci-dessous sont l'entièreté
 * du pouvoir de composition offert au compositeur. Ils ne décrivent aucun son — ils décrivent
 * seulement une façon de parcourir une liste.
 */
export function selectionner(principe: Principe, taille: number, combien: number, r: () => number): number[] {
  const n = Math.max(1, Math.round(taille));
  const k = Math.max(0, Math.round(combien));
  const out: number[] = [];

  if (principe === "sequence") {
    // SÉQUENCE : l'ordre donné, répété. Le seul principe entièrement déterminé.
    for (let i = 0; i < k; i++) out.push(i % n);
    return out;
  }

  if (principe === "serie") {
    // SÉRIE : une permutation, épuisée avant d'en tirer une nouvelle. Chaque élément sert donc
    // exactement une fois par tour — c'est la différence exacte d'avec l'aléa, qui peut répéter.
    let sac: number[] = [];
    for (let i = 0; i < k; i++) {
      if (sac.length === 0) {
        sac = Array.from({ length: n }, (_, j) => j);
        for (let j = sac.length - 1; j > 0; j--) {
          const m = Math.floor(r() * (j + 1));
          [sac[j], sac[m]] = [sac[m], sac[j]];
        }
      }
      out.push(sac.pop()!);
    }
    return out;
  }

  if (principe === "groupe") {
    // GROUPE : un élément tiré, puis répété un petit nombre de fois avant d'en changer. C'est ce
    // qui fait entendre des paliers là où l'aléa ne fait entendre qu'un grésillement.
    while (out.length < k) {
      const valeur = Math.floor(r() * n);
      const combienDeFois = 2 + Math.floor(r() * 4);
      for (let i = 0; i < combienDeFois && out.length < k; i++) out.push(valeur);
    }
    return out;
  }

  if (principe === "tendance") {
    // TENDANCE : le masque de Koenig. La fenêtre où l'on a le droit de puiser se déplace d'un bout
    // à l'autre de l'ensemble au cours de la suite. Le tirage reste au hasard, mais son domaine
    // dérive — c'est ainsi qu'une forme se dessine sans qu'aucune valeur soit écrite.
    const largeur = Math.max(1, Math.round(n / 3));
    for (let i = 0; i < k; i++) {
      // Le bas du masque est arrondi ICI, et non seulement dans `masqueTendance` : les deux
      // doivent donner exactement la même fenêtre, sans quoi le tirage dépasse ses propres bornes
      // d'une unité de temps en temps, et le masque ne veut plus rien dire.
      const avance = k <= 1 ? 0 : i / (k - 1);
      const bas = Math.floor(avance * (n - largeur));
      out.push(Math.min(n - 1, bas + Math.floor(r() * largeur)));
    }
    return out;
  }

  for (let i = 0; i < k; i++) out.push(Math.floor(r() * n));
  return out;
}

/** Les bornes du masque de tendance à un instant donné — de quoi vérifier qu'on les respecte. */
export function masqueTendance(taille: number, combien: number, rang: number): [number, number] {
  const n = Math.max(1, Math.round(taille));
  const largeur = Math.max(1, Math.round(n / 3));
  const avance = combien <= 1 ? 0 : rang / (combien - 1);
  const bas = Math.floor(avance * (n - largeur));
  return [bas, Math.min(n - 1, bas + largeur - 1)];
}

/** Lit une liste de nombres écrite à la main, séparés par des virgules ou des espaces. */
export function lireEnsemble(texte: string, defaut: number[]): number[] {
  const valeurs = (texte ?? "")
    .split(/[\s,;]+/)
    // Les morceaux vides sont écartés AVANT la conversion : `Number("")` vaut zéro, et non « pas un
    // nombre », si bien qu'une saisie vide rendrait un ensemble d'un seul silence au lieu de
    // retomber sur le défaut.
    .filter((m) => m.trim().length > 0)
    .map((m) => Number(m.replace(",", ".")))
    .filter((v) => Number.isFinite(v));
  return valeurs.length > 0 ? valeurs : [...defaut];
}

export const AMPLITUDES_DEFAUT = [-1, -0.6, -0.2, 0.2, 0.6, 1];
export const TEMPS_DEFAUT = [5, 9, 17, 33, 65];

export interface Point {
  /** Rang du premier échantillon du point. */
  echantillon: number;
  amplitude: number;
  /** Nombre d'échantillons jusqu'au point suivant. */
  duree: number;
}

export interface OptionsSegment {
  amplitudes: readonly number[];
  temps: readonly number[];
  principeAmplitudes: Principe;
  principeTemps: Principe;
  longueur: number;
  /** Vrai pour relier les points par un trait, faux pour des marches. */
  interpole: boolean;
}

/**
 * Un segment : des points tirés, puis reliés.
 *
 * LE TRAIT ENTRE DEUX POINTS EST TOUT CE QU'IL Y A. Aucune table d'onde n'est consultée, aucune
 * sinusoïde n'est calculée. Relier les points par un trait ou les laisser en marches change le son
 * plus sûrement que bien des réglages d'effet, et c'est la seule décision de « timbre » que SSP
 * connaisse.
 */
export function construireSegment(o: OptionsSegment, r: () => number): { son: Float32Array; points: Point[] } {
  const longueur = Math.max(1, Math.round(o.longueur));
  const son = new Float32Array(longueur);
  const points: Point[] = [];
  const amplitudes = o.amplitudes.length > 0 ? o.amplitudes : AMPLITUDES_DEFAUT;
  const temps = o.temps.length > 0 ? o.temps : TEMPS_DEFAUT;

  // On tire large : le nombre de points nécessaires dépend des durées tirées, qu'on ignore avant.
  const estimation = Math.ceil(longueur / Math.max(1, Math.min(...temps.map((t) => Math.max(1, Math.round(t)))))) + 8;
  const indicesAmp = selectionner(o.principeAmplitudes, amplitudes.length, estimation, r);
  const indicesTemps = selectionner(o.principeTemps, temps.length, estimation, r);

  let position = 0, rang = 0;
  while (position < longueur && rang < indicesAmp.length) {
    const amplitude = amplitudes[indicesAmp[rang]];
    const duree = Math.max(1, Math.round(temps[indicesTemps[rang]]));
    points.push({ echantillon: position, amplitude, duree });
    position += duree;
    rang++;
  }

  for (let p = 0; p < points.length; p++) {
    const ici = points[p];
    const suivant = points[p + 1];
    const fin = Math.min(longueur, ici.echantillon + ici.duree);
    if (!o.interpole || !suivant) {
      for (let i = ici.echantillon; i < fin; i++) son[i] = ici.amplitude;
      continue;
    }
    const pas = (suivant.amplitude - ici.amplitude) / ici.duree;
    for (let i = ici.echantillon; i < fin; i++) son[i] = ici.amplitude + pas * (i - ici.echantillon);
  }

  return { son, points };
}

export interface OptionsComposition extends Omit<OptionsSegment, "longueur"> {
  frequence: number;
  duree: number;
  /** Combien de segments distincts composer, avant de les ordonner. */
  sections: number;
  /** Le principe qui ordonne les sections — le même vocabulaire, à l'échelle de la forme. */
  principeForme: Principe;
  graine: number;
}

export interface Composition {
  son: Float32Array;
  /** L'ordre dans lequel les sections ont été posées. */
  ordre: number[];
  /** Les points du premier segment, pour le rapport. */
  points: Point[];
  /** Nombre total de points posés. */
  pointsPoses: number;
  /** Durée moyenne entre deux points, en échantillons. */
  dureeMoyenne: number;
}

/**
 * La pièce entière : des sections composées, puis ordonnées par le même vocabulaire.
 *
 * C'EST ICI QUE LA THÈSE DE KOENIG SE VÉRIFIE PLUTÔT QUE DE SE PROCLAMER. Le principe qui ordonne
 * les sections est choisi dans la même liste que celui qui ordonne les amplitudes d'une forme
 * d'onde. Une « série » à l'échelle de la forme veut dire que chaque section passe une fois avant
 * qu'aucune ne repasse — exactement ce qu'elle veut dire à l'échelle de l'échantillon.
 */
export function composer(o: OptionsComposition): Composition {
  const r = alea(o.graine);
  const total = Math.max(1, Math.round(o.duree * o.frequence));
  const sections = Math.max(1, Math.round(o.sections));
  const longueurSection = Math.max(2, Math.floor(total / sections));

  const segments: { son: Float32Array; points: Point[] }[] = [];
  for (let s = 0; s < sections; s++) {
    segments.push(construireSegment({ ...o, longueur: longueurSection }, r));
  }

  const combienDePoses = Math.ceil(total / longueurSection);
  const ordre = selectionner(o.principeForme, sections, combienDePoses, r);

  const son = new Float32Array(total);
  let position = 0;
  for (const rang of ordre) {
    const source = segments[rang].son;
    for (let i = 0; i < source.length && position < total; i++, position++) son[position] = source[i];
    if (position >= total) break;
  }

  const tousLesPoints = segments.flatMap((s) => s.points);
  const sommeDurees = tousLesPoints.reduce((s, p) => s + p.duree, 0);
  return {
    son,
    ordre,
    points: segments[0].points,
    pointsPoses: tousLesPoints.length,
    dureeMoyenne: tousLesPoints.length > 0 ? sommeDurees / tousLesPoints.length : 0,
  };
}

/**
 * Le centre de gravité du spectre, en hertz.
 *
 * C'est la mesure qui dit si les réglages commandent quelque chose : dans un procédé sans notion de
 * fréquence, ce sont les durées choisies qui décident de l'aigu, et le centroïde le montre.
 */
export function centroideHz(x: Float32Array, frequence: number): number {
  // Les passages par zéro suffisent ici, et ne demandent aucune transformée : un signal fait de
  // traits entre des points tirés n'a pas de partiels à résoudre, seulement une vitesse.
  let passages = 0;
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) passages++;
  return x.length > 1 ? (passages * frequence) / (2 * (x.length - 1)) : 0;
}

/** Le facteur de crête, en décibels : ce que la répartition des amplitudes produit. */
export function creteDb(x: Float32Array): number {
  let pire = 0, somme = 0;
  for (const v of x) { pire = Math.max(pire, Math.abs(v)); somme += v * v; }
  const efficace = Math.sqrt(somme / Math.max(1, x.length));
  return efficace > 1e-12 ? 20 * Math.log10(pire / efficace) : 0;
}

/** La longueur moyenne des répétitions d'une suite — ce qui sépare « groupe » d'« aléa ». */
export function longueurMoyenneDesPlages(suite: readonly number[]): number {
  if (suite.length === 0) return 0;
  let plages = 1;
  for (let i = 1; i < suite.length; i++) if (suite[i] !== suite[i - 1]) plages++;
  return suite.length / plages;
}
