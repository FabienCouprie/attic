// audio/theorie-serielle.ts — Les quatre formes d'une série, et sa matrice.
//
// Le dodécaphonisme est une technique de calcul avant d'être une esthétique : une série
// des douze hauteurs, et quatre transformations — l'originale, le rétrograde, l'inversion,
// et le rétrograde de l'inversion —, chacune transposable sur douze degrés, soit quarante-
// huit formes. Schoenberg, Webern et Berg les écrivaient à la main dans une grille de
// douze sur douze ; c'est exactement ce que ce module calcule.
//
// Rien ici n'est propre au sérialisme : rétrograder et inverser un motif sont des
// opérations de contrepoint aussi vieilles que le canon. Elles marchent sur une suite de
// n'importe quelle longueur, et le module dit seulement, en passant, si la suite qu'on lui
// donne est une VRAIE série — douze classes distinctes.

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Les noms de notes écrits en clair, dièses et bémols, plus les chiffres 0 à 11. */
const VALEURS: Record<string, number> = {
  c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6,
  g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11,
  do: 0, ré: 2, re: 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11,
};

export const pc = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

export const nomClasse = (n: number): string => NOMS[pc(n)];

/**
 * Lit une suite écrite à la main : « 0 11 3 4 » comme « C B D# E », mélange toléré.
 *
 * Les octaves sont ignorées — on lit des CLASSES de hauteur, et « C4 » comme « C ». Ce
 * qui n'est pas lisible est passé, plutôt que de refuser la suite entière : une faute de
 * frappe dans la onzième note ne doit pas effacer les dix premières.
 */
export function lireSuite(texte: string): number[] {
  const sortie: number[] = [];
  for (const mot of texte.split(/[\s,;]+/).filter((m) => m.length > 0)) {
    // Le « -1 » de C-1, l'octave la plus grave du MIDI, fait partie de l'octave et non du nom.
    const propre = mot.replace(/-?[0-9]+$/, "").toLowerCase();
    const chiffre = /^-?\d+$/.test(mot) ? parseInt(mot, 10) : null;
    if (chiffre !== null) sortie.push(pc(chiffre));
    else if (propre in VALEURS) sortie.push(VALEURS[propre]);
  }
  return sortie;
}

export const retrograde = (serie: number[]): number[] => [...serie].reverse();

/** Inversion autour de la première note, sauf axe imposé : chaque intervalle change de sens. */
export const inverser = (serie: number[], axe = serie[0] ?? 0): number[] =>
  serie.map((n) => pc(2 * axe - n));

export const transposer = (serie: number[], demiTons: number): number[] =>
  serie.map((n) => pc(n + demiTons));

export const retrogradeInversion = (serie: number[]): number[] => retrograde(inverser(serie));

export type FormeSerielle = "originale" | "retrograde" | "inversion" | "retrograde-inversion";

export function forme(serie: number[], laquelle: FormeSerielle): number[] {
  if (laquelle === "retrograde") return retrograde(serie);
  if (laquelle === "inversion") return inverser(serie);
  if (laquelle === "retrograde-inversion") return retrogradeInversion(serie);
  return [...serie];
}

/** Une vraie série : les douze classes, chacune une fois. */
export function estSerieComplete(serie: number[]): boolean {
  return serie.length === 12 && new Set(serie.map(pc)).size === 12;
}

export interface Matrice {
  grille: number[][];
  /** Étiquette de chaque ligne, lue de gauche à droite : P0, P5… */
  lignes: string[];
  /** Étiquette de chaque colonne, lue de haut en bas : I0, I7… */
  colonnes: string[];
}

/**
 * La matrice des douze sur douze, construite comme on l'écrit à la main.
 *
 * La première ligne est la série ; la première colonne est son inversion sur la même
 * première note. Chaque case vaut `p0 − p[i] + p[j]`, ce qui donne bien la série
 * transposée pour commencer par la note de la colonne de gauche. Les lignes lues à
 * l'envers donnent les rétrogrades, les colonnes lues de bas en haut les rétrogrades de
 * l'inversion : les quarante-huit formes tiennent dans cette grille, et c'est pour cela
 * qu'on l'écrit.
 */
export function matrice(serie: number[]): Matrice {
  const s = serie.map(pc);
  const p0 = s[0] ?? 0;
  const grille = s.map((si) => s.map((sj) => pc(p0 - si + sj)));
  return {
    grille,
    lignes: s.map((si) => `P${pc(p0 - si)}`),
    colonnes: s.map((sj) => `I${pc(sj - p0)}`),
  };
}

/** La matrice en noms de notes, alignée en colonnes. */
export function matriceEnTexte(serie: number[]): string {
  const m = matrice(serie);
  if (m.grille.length === 0) return "";
  const large = (s: string) => s.padEnd(4, " ");
  const entete = ["    ", ...m.colonnes.map(large)].join("");
  const lignes = m.grille.map((ligne, i) =>
    [large(m.lignes[i]), ...ligne.map((n) => large(nomClasse(n)))].join(""));
  return [entete, ...lignes].join("\n");
}

/**
 * Place une suite de classes dans un registre jouable.
 *
 * `serre` choisit à chaque pas l'octave la plus proche de la note précédente : c'est ce
 * qui fait entendre une LIGNE plutôt qu'une gamme montante hachée, et c'est la façon dont
 * une série se joue réellement, les octaves étant libres. Sinon, tout est rangé dans une
 * seule octave à partir de la base.
 */
export function placerDansRegistre(classes: number[], base: number, serre: boolean): number[] {
  const sortie: number[] = [];
  let precedente = base;
  for (const c of classes) {
    if (!serre) {
      sortie.push(base + pc(c - pc(base)));
      continue;
    }
    // L'octave la plus proche de la note précédente, en cas d'égalité celle du dessus.
    let note = precedente + pc(c - pc(precedente));
    if (note - precedente > 6) note -= 12;
    note = Math.max(12, Math.min(115, note));
    sortie.push(note);
    precedente = note;
  }
  return sortie;
}
