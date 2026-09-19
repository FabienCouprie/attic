// audio/classes-hauteurs.ts — Analyse par ensembles de classes de hauteurs.
//
// Quand une harmonie n'est plus tonale, la nommer « accord de septième sur ré » n'a plus de
// sens. L'analyse mise au point par Allen Forte et Milton Babbitt propose autre chose :
// ramener un accord à l'ensemble des classes de hauteurs qu'il emploie, puis chercher la
// façon la plus compacte de l'écrire. Deux accords qui se ressemblent à l'oreille sans se
// ressembler sur le papier — un accord et le même renversé, transposé, retourné — donnent
// alors la MÊME forme première, et c'est tout l'intérêt : on peut enfin dire que deux
// passages emploient le même matériau.
//
// Le VECTEUR D'INTERVALLES complète la description : combien de secondes mineures, de
// secondes majeures, de tierces mineures… l'ensemble contient-il. Il dit la couleur — un
// vecteur riche en 5 (les quartes) sonne ouvert, un vecteur riche en 1 sonne serré.
//
// Ce module ne nomme les ensembles que lorsqu'ils ont un nom d'usage. Le catalogue complet
// de Forte compte plus de deux cents entrées ; en recopier de mémoire serait prendre le
// risque d'étiqueter faux, ce qui est pire que de ne pas étiqueter. Les douze trichordes y
// sont au complet, et les ensembles courants au-delà.

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const pc = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

export const nomClasse = (n: number): string => NOMS[pc(n)];

/** Les classes employées, sans doublon, en ordre croissant. */
export function classes(notes: number[]): number[] {
  return [...new Set(notes.map(pc))].sort((a, b) => a - b);
}

/**
 * FORME NORMALE : la rotation la plus resserrée, et à gauche.
 *
 * On essaie les rotations de l'ensemble et l'on garde celle dont le premier et le dernier
 * élément sont les plus proches. À égalité — cela arrive, et c'est le piège de l'exercice
 * fait à la main —, on compare les écarts successifs depuis la gauche, le plus petit
 * gagnant ; à égalité complète, la classe de départ la plus basse.
 */
export function formeNormale(ensemble: number[]): number[] {
  const s = classes(ensemble);
  if (s.length <= 1) return s;
  const rotations = s.map((_, i) => {
    const r = [...s.slice(i), ...s.slice(0, i)];
    // Recalé sur zéro pour pouvoir comparer les écarts sans se soucier du tour.
    return r.map((n) => pc(n - r[0]));
  });
  let meilleure = 0;
  for (let i = 1; i < rotations.length; i++) {
    if (comparerCompacite(rotations[i], rotations[meilleure]) < 0) meilleure = i;
    else if (comparerCompacite(rotations[i], rotations[meilleure]) === 0
      && s[i] < s[meilleure]) meilleure = i;
  }
  const depart = s[meilleure];
  return rotations[meilleure].map((n) => pc(n + depart));
}

/** Compare deux rotations recalées : l'étendue d'abord, puis les écarts depuis la gauche. */
function comparerCompacite(a: number[], b: number[]): number {
  const dernier = a.length - 1;
  if (a[dernier] !== b[dernier]) return a[dernier] - b[dernier];
  for (let i = dernier - 1; i >= 1; i--) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** L'ensemble retourné : chaque classe réfléchie autour de zéro. */
export const inverser = (ensemble: number[]): number[] => ensemble.map((n) => pc(-n));

/**
 * FORME PREMIÈRE : la forme normale de l'ensemble ou de son inversion, ramenée à zéro, la
 * plus « à gauche » des deux. C'est le nom de la famille : toutes les transpositions et
 * toutes les inversions d'un même accord y aboutissent.
 */
export function formePremiere(ensemble: number[]): number[] {
  const s = classes(ensemble);
  if (s.length === 0) return [];
  const aZero = (x: number[]) => x.map((n) => pc(n - x[0]));
  const droite = aZero(formeNormale(s));
  const gauche = aZero(formeNormale(inverser(s)));
  for (let i = 1; i < droite.length; i++) {
    if (droite[i] !== gauche[i]) return droite[i] < gauche[i] ? droite : gauche;
  }
  return droite;
}

/**
 * VECTEUR D'INTERVALLES : les six classes d'intervalles comptées sur toutes les paires.
 *
 * Il n'y a que six classes et non onze parce qu'une septième mineure descendante s'entend
 * comme une seconde majeure : au-delà du triton, on compte l'intervalle complémentaire.
 */
export function vecteurIntervalles(ensemble: number[]): number[] {
  const s = classes(ensemble);
  const v = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const d = pc(s[j] - s[i]);
      v[Math.min(d, 12 - d) - 1]++;
    }
  }
  return v;
}

/** Les classes absentes : le complément d'un ensemble en dit souvent autant que lui. */
export function complementaire(ensemble: number[]): number[] {
  const presentes = new Set(classes(ensemble));
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((n) => !presentes.has(n));
}

export interface Symetries {
  /** Transpositions non nulles qui laissent l'ensemble inchangé. */
  transpositions: number[];
  /** Inversions (axes doublés) qui le laissent inchangé. */
  inversions: number[];
}

/**
 * Les symétries expliquent pourquoi certains ensembles « ne vont nulle part » : l'accord
 * diminué ou la gamme par tons se retrouvent identiques à eux-mêmes après transposition,
 * donc sans fonction tonale possible. C'est le fondement du procédé chez Debussy et
 * Messiaen, et la raison pour laquelle Forte compte moins de formes que de combinaisons.
 */
export function symetries(ensemble: number[]): Symetries {
  const s = classes(ensemble);
  const meme = (x: number[]) => {
    const t = classes(x);
    return t.length === s.length && t.every((n, i) => n === s[i]);
  };
  const transpositions: number[] = [], inversions: number[] = [];
  for (let n = 1; n < 12; n++) if (meme(s.map((x) => pc(x + n)))) transpositions.push(n);
  for (let n = 0; n < 12; n++) if (meme(s.map((x) => pc(n - x)))) inversions.push(n);
  return { transpositions, inversions };
}

/**
 * Les ensembles qui portent un nom d'usage, avec leur numéro de Forte.
 *
 * Les douze trichordes au complet, puis les accords et gammes qu'on rencontre. Rien n'est
 * inventé ici : un ensemble absent de cette table est rendu sans nom, et la forme première
 * suffit à l'identifier.
 */
const CATALOGUE: { forme: number[]; forte: string; fr: string; en: string }[] = [
  { forme: [0, 1, 2], forte: "3-1", fr: "trichorde chromatique", en: "chromatic trichord" },
  { forme: [0, 1, 3], forte: "3-2", fr: "trichorde 0-1-3", en: "0-1-3 trichord" },
  { forme: [0, 1, 4], forte: "3-3", fr: "trichorde majeur-mineur", en: "major-minor trichord" },
  { forme: [0, 1, 5], forte: "3-4", fr: "trichorde 0-1-5", en: "0-1-5 trichord" },
  { forme: [0, 1, 6], forte: "3-5", fr: "trichorde viennois", en: "Viennese trichord" },
  { forme: [0, 2, 4], forte: "3-6", fr: "trichorde par tons", en: "whole-tone trichord" },
  { forme: [0, 2, 5], forte: "3-7", fr: "trichorde 0-2-5", en: "0-2-5 trichord" },
  { forme: [0, 2, 6], forte: "3-8", fr: "trichorde italien", en: "Italian sixth trichord" },
  { forme: [0, 2, 7], forte: "3-9", fr: "trichorde quartal", en: "quartal trichord" },
  { forme: [0, 3, 6], forte: "3-10", fr: "accord diminué", en: "diminished triad" },
  { forme: [0, 3, 7], forte: "3-11", fr: "accord majeur ou mineur", en: "major or minor triad" },
  { forme: [0, 4, 8], forte: "3-12", fr: "accord augmenté", en: "augmented triad" },
  { forme: [0, 1, 2, 3], forte: "4-1", fr: "tétracorde chromatique", en: "chromatic tetrachord" },
  { forme: [0, 1, 5, 8], forte: "4-20", fr: "accord de septième majeure", en: "major seventh chord" },
  { forme: [0, 2, 6, 8], forte: "4-25", fr: "sixte française, tétracorde par tons", en: "French sixth, whole-tone tetrachord" },
  { forme: [0, 3, 5, 8], forte: "4-26", fr: "accord de septième mineure", en: "minor seventh chord" },
  { forme: [0, 2, 5, 8], forte: "4-27", fr: "septième de dominante ou demi-diminuée", en: "dominant or half-diminished seventh" },
  { forme: [0, 3, 6, 9], forte: "4-28", fr: "accord de septième diminuée", en: "diminished seventh chord" },
  { forme: [0, 2, 4, 7, 9], forte: "5-35", fr: "gamme pentatonique", en: "pentatonic scale" },
  { forme: [0, 1, 4, 5, 8, 9], forte: "6-20", fr: "gamme hexatonique", en: "hexatonic scale" },
  { forme: [0, 2, 4, 6, 8, 10], forte: "6-35", fr: "gamme par tons", en: "whole-tone scale" },
  { forme: [0, 1, 3, 5, 6, 8, 10], forte: "7-35", fr: "gamme diatonique", en: "diatonic scale" },
  { forme: [0, 1, 3, 4, 6, 7, 9, 10], forte: "8-28", fr: "gamme octatonique", en: "octatonic scale" },
];

export interface NomEnsemble { forte: string; fr: string; en: string }

/** Le nom d'usage d'un ensemble, s'il en a un dans le catalogue. */
export function nomEnsemble(ensemble: number[]): NomEnsemble | null {
  const p = formePremiere(ensemble).join(",");
  const trouve = CATALOGUE.find((c) => c.forme.join(",") === p);
  return trouve ? { forte: trouve.forte, fr: trouve.fr, en: trouve.en } : null;
}

export const enCrochets = (x: number[]): string => `[${x.join(",")}]`;

export interface Analyse {
  classes: number[];
  normale: number[];
  premiere: number[];
  vecteur: number[];
  complementaire: number[];
  symetries: Symetries;
  nom: NomEnsemble | null;
}

export function analyser(notes: number[]): Analyse {
  const c = classes(notes);
  return {
    classes: c,
    normale: formeNormale(c),
    premiere: formePremiere(c),
    vecteur: vecteurIntervalles(c),
    complementaire: complementaire(c),
    symetries: symetries(c),
    nom: nomEnsemble(c),
  };
}
