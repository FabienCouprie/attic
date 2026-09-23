// audio/lsysteme.ts — L-systèmes : une grammaire qui se réécrit, et qu'on écoute.
//
// Aristid Lindenmayer, biologiste, a proposé en 1968 un système pour décrire la
// croissance des plantes : un mot de départ, et des règles qui remplacent chaque lettre
// par un groupe de lettres, appliquées à TOUTES les lettres en même temps. Répétée, la
// réécriture engendre des structures auto-similaires — d'où les fougères et les arbres
// qu'on en tire en image.
//
// En musique, la même structure donne des phrases dont les motifs se répètent à
// plusieurs échelles, sans jamais se répéter à l'identique. Attic avait déjà Koch,
// Cantor et Mandelbrot ; il lui manquait la grammaire, qui est la forme la plus générale
// des trois — et la seule que l'utilisateur écrive lui-même.
//
// L'interprétation est celle d'une tortue, comme pour les courbes : chaque lettre est un
// geste. Les crochets ouvrent et ferment une parenthèse — on y entre, on en ressort là
// où l'on était —, ce qui donne en musique une broderie qui n'altère pas la ligne.

export interface RegleL { de: string; vers: string }

/** Longueur maximale du mot engendré : une règle qui double à chaque tour explose vite. */
export const LONGUEUR_MAX = 100_000;

/**
 * Lit des règles écrites « A=AB, B=A » ou une par ligne.
 * Une lettre sans règle se réécrit en elle-même, comme le veut la convention.
 */
export function lireRegles(texte: string): RegleL[] {
  return texte
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      if (i < 0) return null;
      return { de: l.slice(0, i).trim(), vers: l.slice(i + 1).trim() };
    })
    .filter((r): r is RegleL => r !== null && r.de.length === 1);
}

/**
 * Applique les règles `iterations` fois, à toutes les lettres simultanément.
 *
 * La réécriture s'arrête net si le mot dépasse `LONGUEUR_MAX` : une grammaire qui triple
 * à chaque tour atteint le million en douze itérations, et personne n'écoutera cela.
 */
export function reecrire(axiome: string, regles: RegleL[], iterations: number): string {
  const table = new Map(regles.map((r) => [r.de, r.vers]));
  let mot = axiome;
  const tours = Math.max(0, Math.min(20, Math.floor(iterations)));
  for (let i = 0; i < tours; i++) {
    let suivant = "";
    for (const c of mot) {
      suivant += table.get(c) ?? c;
      if (suivant.length >= LONGUEUR_MAX) return suivant.slice(0, LONGUEUR_MAX);
    }
    mot = suivant;
  }
  return mot;
}

export interface NoteL {
  note: number;
  velocite: number;
  debut: number;
  fin: number;
}

export interface ConfigInterpretation {
  /** Degrés de la gamme, en demi-tons depuis la tonique. */
  degres: number[];
  /** Note MIDI de départ. */
  depart: number;
  /** Durée d'un pas, en secondes. */
  dureePas: number;
  /** Vélocité de départ ; chaque niveau de parenthèse l'atténue. */
  velocite: number;
  /** Bornes de hauteur, pour qu'une montée continue ne sorte pas du clavier. */
  noteMin: number;
  noteMax: number;
}

/**
 * Joue le mot, lettre par lettre.
 *
 *   une lettre     une note, puis on avance. CHAQUE LETTRE DISTINCTE DU MOT A SON DEGRÉ :
 *                  la première rencontrée joue le degré courant, la deuxième le suivant, et
 *                  ainsi de suite — faute de quoi une grammaire sans « + » ni « - », comme les
 *                  algues de Lindenmayer, répéterait la même note d'un bout à l'autre
 *   `+` / `-`      monter / descendre d'un DEGRÉ de la gamme — jamais d'un demi-ton,
 *                  pour que le résultat reste dans la tonalité
 *   `[` / `]`      entrer dans une broderie et en ressortir : la hauteur, la durée et
 *                  la vélocité sont retrouvées telles qu'on les avait laissées
 *   `>` / `<`      doubler / diviser par deux la durée du pas
 *   `.`            un silence de la durée courante
 *
 * Toute autre lettre joue une note : c'est ce qui permet d'écrire « A=AB » sans se
 * soucier d'un alphabet imposé.
 *
 * POURQUOI LE RANG DE LA LETTRE. Une grammaire de tortue — Koch, Cantor — n'a qu'une lettre, et le
 * dessin vient de ses virages : son rang vaut alors zéro et rien ne change. Mais une grammaire de
 * réécriture pure — « A=AB, B=A » — ne porte AUCUN virage : toutes ses lettres jouaient donc la
 * même note, et le mot avait beau s'allonger, on entendait un bourdon. Le rang donne à chaque
 * symbole sa hauteur, ce qui est la lecture musicale ordinaire d'un L-système, et laisse les
 * grammaires à lettre unique exactement où elles étaient.
 */
export function interpreter(mot: string, config: ConfigInterpretation): NoteL[] {
  const notes: NoteL[] = [];
  const degres = config.degres.length > 0 ? config.degres : [0, 2, 4, 5, 7, 9, 11];
  let t = 0;
  let degre = 0;
  let duree = config.dureePas;
  let velocite = config.velocite;
  const pile: { degre: number; duree: number; velocite: number }[] = [];

  // Les lettres du mot, dans leur ordre d'apparition : la première prend le degré courant, la
  // deuxième le suivant. Une grammaire à lettre unique garde donc le comportement d'avant.
  const COMMANDES = new Set(["+", "-", ">", "<", "[", "]", "."]);
  const rangs = new Map<string, number>();
  for (const c of mot) if (!COMMANDES.has(c) && !rangs.has(c)) rangs.set(c, rangs.size);

  const hauteur = (d: number): number => {
    const octave = Math.floor(d / degres.length);
    const dans = ((d % degres.length) + degres.length) % degres.length;
    return config.depart + degres[dans] + octave * 12;
  };

  for (const c of mot) {
    switch (c) {
      case "+": degre += 1; break;
      case "-": degre -= 1; break;
      case ">": duree = Math.min(8, duree * 2); break;
      case "<": duree = Math.max(0.01, duree / 2); break;
      case "[":
        pile.push({ degre, duree, velocite });
        // Une broderie se joue plus doucement que la ligne : c'est ce qui la rend
        // audible comme un ornement, et non comme une seconde mélodie.
        velocite = Math.max(20, Math.round(velocite * 0.75));
        break;
      case "]": {
        const etat = pile.pop();
        if (etat) { degre = etat.degre; duree = etat.duree; velocite = etat.velocite; }
        break;
      }
      case ".": t += duree; break;
      default: {
        const n = hauteur(degre + (rangs.get(c) ?? 0));
        if (n >= config.noteMin && n <= config.noteMax) {
          notes.push({ note: n, velocite, debut: t, fin: t + duree * 0.95 });
        }
        t += duree;
      }
    }
  }
  return notes;
}

/** Quelques grammaires classiques, pour ne pas partir de la page blanche. */
export const EXEMPLES: { id: string; fr: string; en: string; axiome: string; regles: string }[] = [
  { id: "algues", fr: "Algues de Lindenmayer", en: "Lindenmayer's algae", axiome: "A", regles: "A=AB, B=A" },
  { id: "koch", fr: "Flocon de Koch", en: "Koch snowflake", axiome: "F", regles: "F=F+F-F-F+F" },
  { id: "dragon", fr: "Courbe du dragon", en: "Dragon curve", axiome: "FX", regles: "X=X+YF+, Y=-FX-Y" },
  { id: "plante", fr: "Plante", en: "Plant", axiome: "X", regles: "X=F+[[X]-X]-F[-FX]+X, F=FF" },
  { id: "cantor", fr: "Poussière de Cantor", en: "Cantor dust", axiome: "F", regles: "F=F.F" },
];
