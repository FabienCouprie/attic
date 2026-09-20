// audio/harmonie-negative.ts — Réflexion des hauteurs autour de l'axe tonique-dominante.
//
// L'idée vient de la théorie de l'harmonie duale d'Hugo Riemann, reprise par Ernst Levy
// dans « A Theory of Harmony » (1985), et remise en circulation ces dernières années sous
// le nom d'« harmonie négative ». Elle tient en une phrase : si l'on réfléchit les douze
// hauteurs autour de l'axe placé à mi-chemin de la tonique et de sa dominante, chaque
// fonction tonale se change en son image, et l'on obtient une harmonie qui remplit le même
// rôle par le chemin opposé.
//
// En do, l'axe tombe entre mi bémol et mi. La tonique devient la dominante, mi bémol et mi
// s'échangent, et l'accord de do majeur ressort en do mineur. Le résultat célèbre est
// celui du sol septième, qui devient un fa mineur sixte : deux accords que rien ne
// rapproche sur le papier, et qui appellent tous deux la résolution sur do.
//
// Ce n'est pas une règle, c'est un générateur : il propose une substitution, il ne dit pas
// qu'elle est bonne. La réflexion d'une mélodie, en particulier, retourne son contour, et
// c'est pourquoi le nœud offre les deux lectures — miroir vrai, ou classes réfléchies dans
// le registre d'origine.

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const pc = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

export const nomClasse = (n: number): string => NOMS[pc(n)];

/**
 * L'axe, en demi-tons depuis la tonique : trois et demi, soit entre la tierce mineure et
 * la tierce majeure. C'est le milieu de la tonique et de sa quinte, et le nombre est
 * volontairement fractionnaire — l'axe ne tombe sur aucune note du clavier.
 */
const DEMI_TONS_AXE = 3.5;

/** Les deux notes qui encadrent l'axe : en do, mi bémol et mi. */
export function notesDeLAxe(tonique: number): [number, number] {
  return [pc(tonique + 3), pc(tonique + 4)];
}

/**
 * La classe réfléchie : `2 × axe − x`, soit `2 × tonique + 7 − x`.
 *
 * La tonique va sur la dominante et la dominante sur la tonique ; l'opération est sa
 * propre inverse, appliquée deux fois elle ne fait rien.
 */
export const refleterClasse = (classe: number, tonique: number): number =>
  pc(2 * tonique + 7 - classe);

/**
 * Réflexion de la classe, octave conservée : le registre ne bouge pas, le contour de la
 * mélodie reste à peu près celui d'avant. C'est la lecture qu'on veut pour substituer une
 * harmonie sans réécrire la voix.
 */
export function refleterDansOctave(note: number, tonique: number): number {
  const base = Math.round(note) - pc(note);
  return base + refleterClasse(pc(note), tonique);
}

/**
 * MIROIR VRAI : tout est réfléchi autour d'un seul axe absolu, donc les intervalles
 * changent de sens et la ligne se retourne. `axe` est une hauteur MIDI fractionnaire.
 */
export function refleterAutourDe(note: number, axe: number): number {
  return Math.round(2 * axe - note);
}

/**
 * L'axe absolu le plus proche du milieu du morceau.
 *
 * L'axe existe à chaque octave ; choisir celui qui passe au milieu des notes évite qu'un
 * miroir vrai n'envoie tout le morceau dans un registre inutilisable.
 */
export function axeAbsolu(notes: number[], tonique: number): number {
  if (notes.length === 0) return 60 + DEMI_TONS_AXE;
  const tri = [...notes].sort((a, b) => a - b);
  const median = tri[Math.floor(tri.length / 2)];
  const k = Math.round((median - pc(tonique) - DEMI_TONS_AXE) / 12);
  return pc(tonique) + DEMI_TONS_AXE + 12 * k;
}

export type ModeReflet = "miroir" | "registre";

export interface NoteReflet {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
  canal?: number;
}

/** Ramène une note dans le clavier par octaves entières, sans changer sa classe. */
function dansLeClavier(note: number): number {
  let n = note;
  while (n < 12) n += 12;
  while (n > 115) n -= 12;
  return n;
}

export function refleterNotes(notes: NoteReflet[], tonique: number, mode: ModeReflet): NoteReflet[] {
  const axe = axeAbsolu(notes.map((n) => n.note), tonique);
  return notes.map((n) => ({
    ...n,
    note: dansLeClavier(mode === "miroir"
      ? refleterAutourDe(n.note, axe)
      : refleterDansOctave(n.note, tonique)),
  }));
}

/**
 * La table des échanges, pour qu'on voie ce que la réflexion fait.
 *
 * Six paires, toujours : aucune classe n'est sa propre image, puisque cela demanderait que
 * `2x` soit impair modulo douze. L'axe ne tombe donc jamais sur une note, et il n'y a pas
 * de point fixe à traiter à part.
 */
export function tableReflets(tonique: number): string {
  const vus = new Set<number>();
  const paires: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = pc(tonique + i);
    const b = refleterClasse(a, tonique);
    const cle = Math.min(a, b) * 12 + Math.max(a, b);
    if (vus.has(cle)) continue;
    vus.add(cle);
    paires.push(`${nomClasse(a)} ↔ ${nomClasse(b)}`);
  }
  return paires.join(" · ");
}
