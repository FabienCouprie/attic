// audio/ordre-galerie.ts — L'ordre d'accrochage d'une galerie, donné par des coordonnées.
//
// D'OÙ VIENNENT CES COORDONNÉES. La classification de pistes projette une collection sur un plan :
// deux morceaux proches y sonnent de façon semblable. Accrocher la galerie dans cet ordre, plutôt
// que dans celui du dossier, fait que l'on passe d'un morceau au suivant par ressemblance.
//
// POURQUOI DEUX CLÉS ET NON UNE DISTANCE. Un tri par distance à l'origine ferait tourner autour du
// centre et sauterait d'un bout à l'autre du plan à chaque tour. Deux clés parcourent le plan dans
// un sens lisible : l'axe qui mène d'abord, l'autre départageant les ex æquo. Les coordonnées étant
// continues, le second axe ne tranche en pratique que des points rigoureusement alignés.

/** Une piste du dossier, telle que la galerie la connaît. */
export interface PisteFichier {
  nom: string;
  chemin: string;
}

/** Un point de la sortie « Coordonnées » de la classification de pistes. */
export interface PointClasse {
  nom: string;
  chemin: string;
  x: number;
  y: number;
}

export type SensOrdre = "dossier" | "xy" | "yx";

export interface ResultatOrdre<T> {
  /** Les pistes, dans l'ordre d'accrochage. */
  pistes: T[];
  /** Combien ont été placées d'après leurs coordonnées. */
  placees: number;
  /** Combien n'avaient pas de coordonnées et suivent à la fin, dans l'ordre du dossier. */
  restantes: number;
}

/**
 * Lit la sortie « Coordonnées » de la classification de pistes.
 *
 * Rend une liste vide plutôt qu'une erreur si le texte n'est pas ce qu'on attend : une entrée
 * facultative mal remplie ne doit pas empêcher la galerie de se construire.
 */
export function lirePoints(texte: string | null | undefined): PointClasse[] {
  if (typeof texte !== "string" || !texte.trim()) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((p): p is PointClasse =>
      !!p && typeof p === "object"
      && Number.isFinite((p as PointClasse).x) && Number.isFinite((p as PointClasse).y))
    .map((p) => ({ nom: String(p.nom ?? ""), chemin: String(p.chemin ?? ""), x: p.x, y: p.y }));
}

/** La clé d'appariement : le chemin d'abord, qui est unique ; le nom ensuite. */
function cles(p: { nom: string; chemin: string }): string[] {
  const out: string[] = [];
  if (p.chemin) out.push(p.chemin.replace(/\\/g, "/").toLowerCase());
  if (p.nom) out.push(p.nom.toLowerCase());
  return out;
}

/**
 * Range les pistes d'après leurs coordonnées.
 *
 * L'APPARIEMENT SE FAIT SUR LE CHEMIN, PUIS SUR LE NOM. Le chemin est unique ; le nom ne l'est pas
 * toujours — deux dossiers peuvent tenir un « intro.mp3 » —, mais il rattrape le cas où la
 * classification a travaillé sur une copie du dossier, à un autre endroit du disque.
 *
 * UNE PISTE SANS COORDONNÉES N'EST PAS PERDUE : elle passe à la fin, dans l'ordre du dossier. Une
 * galerie amputée des morceaux que la classification n'a pas vus serait le pire des résultats,
 * puisque rien à l'écran ne dirait qu'il en manque.
 */
export function ordonnerParCoordonnees<T extends PisteFichier>(
  fichiers: readonly T[],
  points: readonly PointClasse[],
  sens: SensOrdre,
): ResultatOrdre<T> {
  if (sens === "dossier" || points.length === 0) {
    return { pistes: [...fichiers], placees: 0, restantes: fichiers.length };
  }

  const parCle = new Map<string, PointClasse>();
  for (const p of points) {
    for (const c of cles(p)) if (!parCle.has(c)) parCle.set(c, p);
  }

  const situees: { f: T; p: PointClasse; rang: number }[] = [];
  const orphelines: { f: T; rang: number }[] = [];
  fichiers.forEach((f, rang) => {
    const p = cles(f).map((c) => parCle.get(c)).find(Boolean);
    if (p) situees.push({ f, p, rang });
    else orphelines.push({ f, rang });
  });

  const premier = sens === "xy" ? "x" : "y";
  const second = sens === "xy" ? "y" : "x";
  situees.sort((a, b) =>
    (a.p[premier] - b.p[premier])
    || (a.p[second] - b.p[second])
    // À coordonnées rigoureusement égales, l'ordre du dossier tranche : sans cela, deux exécutions
    // pourraient accrocher la même collection dans deux ordres différents.
    || (a.rang - b.rang));

  return {
    pistes: [...situees.map((s) => s.f), ...orphelines.map((o) => o.f)],
    placees: situees.length,
    restantes: orphelines.length,
  };
}
