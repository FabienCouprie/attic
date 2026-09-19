// audio/norgard.ts — La série de l'infini de Per Nørgård.
//
// Nørgård l'a découverte en 1959 et en a fait la matière entière de sa Deuxième Symphonie
// (1970). Sa définition tient en trois lignes :
//
//   s(0) = 0,  s(2n) = −s(n),  s(2n+1) = s(n) + 1
//
// Les premiers termes sont 0, 1, −1, 2, 1, 0, −2, 3, −1, 2, 0, 1, 2, −1, −3, 4… et la suite
// ne se répète jamais. Elle est pourtant AUTO-SIMILAIRE, et d'une façon exacte plutôt
// qu'approchée : une note sur deux redonne la série inversée, une note sur quatre redonne
// la série elle-même, à l'identique. On peut donc superposer la mélodie à elle-même jouée
// quatre fois plus lentement et obtenir un contrepoint parfaitement cohérent — c'est
// exactement ce que fait Nørgård, et c'est pourquoi sa symphonie peut être une seule
// mélodie du début à la fin sans jamais sonner répétitive.
//
// Elle est cataloguée A004718 dans l'encyclopédie des suites d'entiers.

/** Le terme d'indice n, calculé par la définition, sans récursion profonde. */
export function terme(n: number): number {
  let i = Math.max(0, Math.floor(n));
  const bits: number[] = [];
  while (i > 0) { bits.push(i % 2); i = Math.floor(i / 2); }
  // Les bits lus du plus fort au plus faible : un 1 ajoute une unité, un 0 change le signe.
  // C'est la définition récursive déroulée, et elle donne le terme en une poignée de pas au
  // lieu d'une récursion aussi profonde que l'indice est grand.
  let valeur = 0;
  for (let k = bits.length - 1; k >= 0; k--) {
    // Le « ou zéro » évite de rendre −0, que JavaScript distingue de 0 dans toute
    // comparaison stricte et qui ferait échouer une égalité pourtant vraie.
    valeur = bits[k] === 1 ? valeur + 1 : -valeur || 0;
  }
  return valeur;
}

/** Les `longueur` premiers termes. */
export function serie(longueur: number): number[] {
  const n = Math.max(0, Math.floor(longueur));
  const sortie = new Array<number>(n);
  for (let i = 0; i < n; i++) sortie[i] = terme(i);
  return sortie;
}

/**
 * Une voix prise un terme sur `pas`.
 *
 * C'est le procédé de Nørgård lui-même : la voix au pas 2 est la série inversée, celle au
 * pas 4 est la série d'origine. Superposées en valeurs de notes proportionnelles, elles
 * forment un canon qui se tient tout seul.
 */
export function voix(longueur: number, pas: number): number[] {
  const p = Math.max(1, Math.floor(pas));
  const sortie: number[] = [];
  for (let i = 0; i < longueur; i++) sortie.push(terme(i * p));
  return sortie;
}

export type ModeHauteur = "demi-tons" | "degres";

/**
 * Traduit les entiers de la série en hauteurs MIDI.
 *
 * En demi-tons, la série se déploie chromatiquement et sort vite de toute tonalité — c'est
 * la lecture de Nørgård. En degrés, chaque entier compte un degré de la gamme choisie, et
 * le résultat reste tonal, ce qui change complètement le caractère sans changer la
 * structure.
 */
export function versHauteurs(
  valeurs: number[], tonique: number, mode: ModeHauteur, gamme: number[],
  noteMin = 21, noteMax = 108,
): number[] {
  return valeurs.map((v) => {
    let note: number;
    if (mode === "demi-tons") {
      note = tonique + v;
    } else {
      const taille = Math.max(1, gamme.length);
      const octave = Math.floor(v / taille);
      const degre = ((v % taille) + taille) % taille;
      // Une gamme vide ne doit pas rendre NaN : on retombe alors sur la tonique.
      note = tonique + (gamme[degre] ?? 0) + 12 * octave;
    }
    // Repliement par octaves : la série n'est pas bornée, le clavier l'est.
    while (note < noteMin) note += 12;
    while (note > noteMax) note -= 12;
    return note;
  });
}

export interface StatsSerie {
  minimum: number;
  maximum: number;
  /** Nombre de valeurs distinctes : la série ne se répète pas, mais ses valeurs si. */
  distinctes: number;
}

export function statistiques(valeurs: number[]): StatsSerie {
  if (valeurs.length === 0) return { minimum: 0, maximum: 0, distinctes: 0 };
  return {
    minimum: Math.min(...valeurs),
    maximum: Math.max(...valeurs),
    distinctes: new Set(valeurs).size,
  };
}
