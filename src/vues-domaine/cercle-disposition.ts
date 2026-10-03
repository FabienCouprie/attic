// ui/cercle-disposition.ts — Où se posent les pastilles d'un cercle, et laquelle est sous le doigt.
//
// LA GÉOMÉTRIE VIT HORS DU DESSIN, comme celle du clavier et celle de l'arbre rythmique. C'est la
// règle du dépôt depuis qu'un clavier a joué la blanche quand on visait le dièse : ce qui décide
// quelle pastille est sous le curseur doit pouvoir être éprouvé sans rendre une image.
//
// LES COORDONNÉES SONT DANS LE CERCLE UNITÉ, centre en zéro, rayon un. La vue multiplie par ce
// qu'elle a. Rien ici ne connaît un pixel.
//
// LA PLACE ZÉRO EST EN HAUT, et le tour se fait dans le sens des aiguilles. C'est la convention de
// l'horloge, celle que prend la représentation circulaire depuis Toussaint, et celle du cercle
// rythmique en ligne dont l'aiguille part du sommet.

/** Le rayon d'une pastille quand le cercle est grand : au-delà, elles se toucheraient. */
const RAYON_PASTILLE_MAX = 0.13;

/** La part de l'écart entre deux pastilles voisines qu'une pastille occupe au plus. */
const PART_DE_L_ECART = 0.42;

export interface Pastille {
  place: number;
  x: number;
  y: number;
  sonne: boolean;
}

export interface DispositionCercle {
  pastilles: Pastille[];
  /** Les sommets qui sonnent, dans l'ordre du tour : c'est le polygone inscrit. */
  polygone: { x: number; y: number }[];
  /** Le rayon d'une pastille, dans les mêmes unités que les coordonnées. */
  rayonPastille: number;
}

/** L'angle d'une place, zéro en haut, le tour dans le sens des aiguilles. */
export function angleDeLaPlace(place: number, positions: number): number {
  return -Math.PI / 2 + (2 * Math.PI * place) / Math.max(1, positions);
}

/**
 * Le rayon d'une pastille, qui rétrécit à mesure que le cercle se remplit.
 *
 * DEUX PASTILLES NE DOIVENT JAMAIS SE TOUCHER. L'écart entre deux voisines sur le cercle unité vaut
 * `2 sin(π / positions)` ; une pastille en prend une fraction, ce qui laisse toujours du blanc
 * entre elles. Sur les petits cercles c'est le plafond qui s'applique, sans quoi trois pastilles
 * rempliraient tout le dessin.
 */
export function rayonPastille(positions: number): number {
  const ecart = 2 * Math.sin(Math.PI / Math.max(2, positions));
  return Math.min(RAYON_PASTILLE_MAX, PART_DE_L_ECART * ecart);
}

/** Toutes les pastilles d'un cercle, et le polygone que forment celles qui sonnent. */
export function disposerCercle(positions: number, placesQuiSonnent: readonly number[]): DispositionCercle {
  const n = Math.max(1, Math.round(positions));
  const sonnent = new Set(placesQuiSonnent);
  const pastilles: Pastille[] = [];
  for (let p = 0; p < n; p++) {
    const a = angleDeLaPlace(p, n);
    pastilles.push({ place: p, x: Math.cos(a), y: Math.sin(a), sonne: sonnent.has(p) });
  }
  return {
    pastilles,
    polygone: pastilles.filter((p) => p.sonne).map(({ x, y }) => ({ x, y })),
    rayonPastille: rayonPastille(n),
  };
}

/**
 * La place sous un point, ou rien quand le point ne touche aucune pastille.
 *
 * ON NE PREND PAS LA PLUS PROCHE À TOUT PRIX. Un clic au centre du cercle, ou loin dehors, ne
 * désigne aucune pastille : le rendre équivaudrait à allumer une place au hasard dès qu'on glisse
 * le nœud. La distance au centre de la pastille doit être dans son rayon, avec une marge qui rend
 * le clic confortable sur les grands cercles où les pastilles deviennent minuscules.
 */
export function placeSousLePoint(
  x: number, y: number, positions: number, marge = 1.6,
): number | null {
  const n = Math.max(1, Math.round(positions));
  const rayon = rayonPastille(n) * marge;
  let meilleure: number | null = null;
  let plusCourte = Infinity;
  for (let p = 0; p < n; p++) {
    const a = angleDeLaPlace(p, n);
    const d = Math.hypot(x - Math.cos(a), y - Math.sin(a));
    if (d <= rayon && d < plusCourte) { plusCourte = d; meilleure = p; }
  }
  return meilleure;
}

// ── Le motif, tel qu'il se range dans un réglage ────────────────────────────────────────────────
//
// UNE CHAÎNE DE ZÉROS ET DE UNS, et le nombre de places est sa longueur. Un seul réglage plutôt que
// deux : le nombre de places et le motif ne peuvent donc pas se contredire, ce qui arriverait
// fatalement si l'un se réglait sans l'autre. C'est aussi la forme que le cercle rythmique en ligne
// emploie dans ses adresses, ce qui permet de porter un motif de l'un à l'autre en le recopiant.

/** Les places qui sonnent, lues dans une chaîne de zéros et de uns. */
export function lireMotif(motif: string): number[] {
  const places: number[] = [];
  for (let i = 0; i < motif.length; i++) if (motif[i] === "1") places.push(i);
  return places;
}

/** La chaîne correspondant à des places sur un cercle de `positions` places. */
export function ecrireMotif(positions: number, places: readonly number[]): string {
  const sonnent = new Set(places);
  let s = "";
  for (let p = 0; p < positions; p++) s += sonnent.has(p) ? "1" : "0";
  return s;
}

/**
 * Un motif ramené à une longueur voulue : complété de silences, ou coupé.
 *
 * CHANGER LE NOMBRE DE PLACES NE DOIT PAS EFFACER LE TRAVAIL. Passer de huit à seize garde les huit
 * premières places et ajoute huit silences ; revenir à huit coupe la fin. C'est ce qu'on attend
 * d'un « plus » et d'un « moins », et cela évite d'avoir à tout reposer après un essai.
 */
export function ajusterMotif(motif: string, positions: number): string {
  const n = Math.max(1, Math.round(positions));
  if (motif.length >= n) return motif.slice(0, n);
  return motif + "0".repeat(n - motif.length);
}

/** Un motif nettoyé de tout ce qui n'est ni zéro ni un, pour qu'une saisie à la main soit tolérée. */
export function nettoyerMotif(texte: string): string {
  return [...texte].filter((c) => c === "0" || c === "1").join("");
}

// ── Le nom d'une note écrit dans sa pastille ────────────────────────────────────────────────────

/**
 * La taille du texte d'un nom de note, dans les unités du dessin.
 *
 * ELLE VIT ICI ET NON DANS LA FEUILLE DE STYLE, parce que c'est elle qui décide si le nom tient :
 * le même nombre à deux endroits, et la règle se serait démentie au premier réglage de l'un.
 */
export const TAILLE_NOM = 26;

/**
 * La largeur d'un caractère de nom de note, en parts de la taille du texte.
 *
 * MESURÉE ET NON ESTIMÉE, dans la police du dessin : « B0 » occupe 0,58 de la taille par caractère,
 * « C#4 » 0,66, « G#4 » 0,68. Le chiffre retenu majore, de sorte qu'aucun nom ne déborde.
 */
const LARGEUR_PAR_CARACTERE = 0.7;

/**
 * Le nom d'une note tient-il dans sa pastille ? `rayon` est dans les unités du dessin.
 *
 * RELEVÉ À QUARANTE-HUIT PLACES : la pastille faisait 13,3 pixels de large et « G#4 » en faisait
 * 15,8. Le nom débordait donc sur ses voisines, et deux noms voisins se touchaient.
 *
 * LE VERDICT VAUT POUR TOUT LE CERCLE, d'où la longueur du plus long nom : un cercle où seuls les
 * noms courts paraîtraient se lirait plus mal qu'un cercle sans noms, l'œil prenant les manquants
 * pour des sommets d'une autre sorte.
 */
export function nomsTiennent(rayon: number, caracteresDuPlusLong: number): boolean {
  return LARGEUR_PAR_CARACTERE * TAILLE_NOM * caracteresDuPlusLong <= 2 * rayon;
}
