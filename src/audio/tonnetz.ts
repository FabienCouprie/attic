// audio/tonnetz.ts — Transformations néo-riemanniennes sur le Tonnetz.
//
// Hugo Riemann a dessiné à la fin du XIXᵉ siècle un réseau où les notes sont disposées de
// telle sorte que les triades majeures et mineures forment des triangles adjacents : le
// Tonnetz. Richard Cohn et l'école néo-riemannienne en ont tiré, dans les années 1990, un
// outil d'analyse pour la musique où les accords s'enchaînent sans que la tonalité les
// explique — Wagner, Liszt, Schubert tardif, et par extension beaucoup de musique de film.
//
// Tout repose sur trois opérations, et chacune ne déplace QU'UNE SEULE VOIX :
//   P (parallèle) échange majeur et mineur sur la même fondamentale, en bougeant la tierce
//     d'un demi-ton : do majeur devient do mineur.
//   L (Leittonwechsel) bouge d'un demi-ton la note qui n'appartient pas à l'accord voisin :
//     do majeur devient mi mineur.
//   R (relatif) bouge d'un TON la quinte ou la fondamentale : do majeur devient la mineur.
//
// C'est ce qu'on appelle la conduite parcimonieuse, et c'est la raison pour laquelle ces
// enchaînements sonnent liés alors qu'ils n'ont aucun rapport tonal : entre deux accords
// voisins sur le Tonnetz, deux notes sur trois ne bougent pas du tout.

export type TypeTriade = "majeur" | "mineur";

export interface Triade {
  /** Fondamentale, en classe de hauteur de 0 à 11. */
  fondamentale: number;
  type: TypeTriade;
}

export type Operation = "P" | "L" | "R";

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const pc = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

export const nomTriade = (t: Triade): string =>
  `${NOMS[pc(t.fondamentale)]}${t.type === "mineur" ? "m" : ""}`;

/** Les trois classes de hauteur d'une triade. */
export function notesDe(t: Triade): number[] {
  const tierce = t.type === "majeur" ? 4 : 3;
  return [pc(t.fondamentale), pc(t.fondamentale + tierce), pc(t.fondamentale + 7)];
}

/** Reconnaît une triade parmi des classes de hauteur, ou rend null. */
export function reconnaitre(classes: number[]): Triade | null {
  const ensemble = [...new Set(classes.map(pc))].sort((a, b) => a - b);
  if (ensemble.length !== 3) return null;
  for (let f = 0; f < 12; f++) {
    for (const type of ["majeur", "mineur"] as TypeTriade[]) {
      const candidat = notesDe({ fondamentale: f, type }).sort((a, b) => a - b);
      if (candidat.every((n, i) => n === ensemble[i])) return { fondamentale: f, type };
    }
  }
  return null;
}

/**
 * Les trois opérations.
 *
 * Écrites par leur effet sur la fondamentale et le mode, ce qui est la forme la plus courte.
 * On vérifie par ailleurs, et c'est le test qui compte, qu'elles ne déplacent bien qu'une
 * voix : P et L d'un demi-ton, R d'un ton.
 */
export function appliquer(t: Triade, op: Operation): Triade {
  if (op === "P") {
    return { fondamentale: t.fondamentale, type: t.type === "majeur" ? "mineur" : "majeur" };
  }
  if (op === "L") {
    return t.type === "majeur"
      ? { fondamentale: pc(t.fondamentale + 4), type: "mineur" }
      : { fondamentale: pc(t.fondamentale + 8), type: "majeur" };
  }
  return t.type === "majeur"
    ? { fondamentale: pc(t.fondamentale + 9), type: "mineur" }
    : { fondamentale: pc(t.fondamentale + 3), type: "majeur" };
}

export const memeTriade = (a: Triade, b: Triade): boolean =>
  pc(a.fondamentale) === pc(b.fondamentale) && a.type === b.type;

/** Applique une suite d'opérations, en rendant tous les accords traversés. */
export function parcourir(depart: Triade, operations: Operation[]): Triade[] {
  const suite = [depart];
  let courant = depart;
  for (const op of operations) {
    courant = appliquer(courant, op);
    suite.push(courant);
  }
  return suite;
}

/** Lit « P L R » ou « PLR » ; ignore ce qui n'est pas une opération. */
export function lireOperations(texte: string): Operation[] {
  return [...texte.toUpperCase()].filter((c): c is Operation => c === "P" || c === "L" || c === "R");
}

/**
 * Le chemin le plus court d'une triade à une autre.
 *
 * Les vingt-quatre triades et les trois opérations forment un graphe minuscule : un
 * parcours en largeur donne donc le chemin optimal sans ruse. C'est ce chemin qui intéresse
 * l'analyste — il dit à quelle distance deux accords se trouvent l'un de l'autre dans
 * l'espace de Riemann, ce qu'aucune distance tonale ne mesure.
 */
export function cheminLePlusCourt(depart: Triade, arrivee: Triade): Operation[] | null {
  if (memeTriade(depart, arrivee)) return [];
  const cle = (t: Triade) => `${pc(t.fondamentale)}${t.type}`;
  const vus = new Set([cle(depart)]);
  let file: { triade: Triade; chemin: Operation[] }[] = [{ triade: depart, chemin: [] }];
  while (file.length > 0) {
    const suivante: typeof file = [];
    for (const { triade, chemin } of file) {
      for (const op of ["P", "L", "R"] as Operation[]) {
        const t = appliquer(triade, op);
        if (memeTriade(t, arrivee)) return [...chemin, op];
        if (vus.has(cle(t))) continue;
        vus.add(cle(t));
        suivante.push({ triade: t, chemin: [...chemin, op] });
      }
    }
    file = suivante;
  }
  return null;
}

/**
 * Place une suite de triades dans un registre, en bougeant le moins de voix possible.
 *
 * Sans cela, on entendrait des accords en position fondamentale qui sautent d'un bout du
 * clavier à l'autre, et la parcimonie — qui est tout l'intérêt — ne s'entendrait pas.
 */
export function voixParcimonieuses(suite: Triade[], base = 60): number[][] {
  const sortie: number[][] = [];
  let precedent: number[] | null = null;
  for (const t of suite) {
    const classes = notesDe(t);
    if (!precedent) {
      precedent = classes.map((c) => base + pc(c - pc(base)));
      sortie.push([...precedent].sort((a, b) => a - b));
      continue;
    }
    // Chaque voix rejoint la classe la plus proche d'elle, une classe par voix.
    const libres = [...classes];
    const suivant: number[] = precedent.map((note) => {
      let meilleure = 0, distance = Infinity;
      libres.forEach((c, i) => {
        const candidate = note + ((pc(c - pc(note)) + 6) % 12) - 6;
        const d = Math.abs(candidate - note);
        if (d < distance) { distance = d; meilleure = i; }
      });
      const c = libres.splice(meilleure, 1)[0];
      return note + ((pc(c - pc(note)) + 6) % 12) - 6;
    });
    precedent = suivant;
    sortie.push([...suivant].sort((a, b) => a - b));
  }
  return sortie;
}

/** Le déplacement total, en demi-tons, entre deux accords voisins. */
export function mouvement(a: number[], b: number[]): number {
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  let total = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) total += Math.abs(y[i] - x[i]);
  return total;
}
