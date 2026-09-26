// audio/morphologie.ts — Comparer deux suites, et dire en quoi elles se ressemblent.
//
// CE QUE C'EST. L'analyse morphologique ne regarde pas les valeurs d'une suite mais sa FORME : la
// façon dont elle monte et descend, les figures qui y reviennent, ce qu'elle garde d'une autre
// suite. Deux mélodies transposées et jouées à des tempos différents n'ont aucune note commune et
// la même forme ; c'est cette identité-là que le procédé sait voir, et qu'une comparaison des
// hauteurs manque entièrement.
//
// LE PROFIL PRIMAIRE EN EST LA BRIQUE. On remplace chaque couple de valeurs successives par le
// signe de leur différence : monte, descend, ou reste. Il ne reste alors que le geste, dépouillé
// de la hauteur comme de l'intervalle, et deux passages se comparent sur ce qu'ils font plutôt que
// sur ce qu'ils emploient.
//
// LA DISTANCE D'ÉDITION MESURE LE RESTE. Le nombre minimal d'insertions, de suppressions et de
// substitutions qui mènent d'une suite à l'autre : c'est la distance de Levenshtein, publiée en
// 1966, et elle s'applique à des profils comme à des lettres. Ramenée à la longueur, elle donne une
// ressemblance entre zéro et un.
//
// CE QU'ELLE NE FAIT PAS. Elle ne dit pas si deux passages se ressemblent À L'OREILLE : une mesure
// de forme ignore le timbre, le registre et le tempo, qui pèsent lourd dans la perception. Elle dit
// ce qu'elle mesure, et c'est déjà ce qu'on n'avait pas.

/** Monte, descend ou reste : le geste d'une suite, dépouillé de ses valeurs. */
export function profilPrimaire(valeurs: readonly number[], tolerance = 0): number[] {
  const out: number[] = [];
  for (let i = 1; i < valeurs.length; i++) {
    const d = valeurs[i] - valeurs[i - 1];
    out.push(Math.abs(d) <= tolerance ? 0 : (d > 0 ? 1 : -1));
  }
  return out;
}

/**
 * La distance de Levenshtein : combien d'éditions séparent deux suites.
 *
 * Insertion, suppression et substitution comptent chacune pour une. L'algorithme est celui de la
 * programmation dynamique, sur une seule ligne de travail plutôt qu'un tableau complet : la
 * mémoire tient en la longueur de la plus courte des deux.
 */
export function distanceEdition<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const courante = [i, ...Array.from({ length: b.length }, () => 0)];
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout);
    }
    precedente = courante;
  }
  return precedente[b.length];
}

/**
 * La ressemblance de deux suites, de zéro à un.
 *
 * DEUX SUITES VIDES SE RESSEMBLENT PARFAITEMENT, et ce n'est pas une facétie : sans ce cas, la
 * division par la longueur rendrait `NaN`, qui se propagerait dans un rapport d'analyse sans que
 * rien ne l'explique.
 */
export function similarite<T>(a: readonly T[], b: readonly T[]): number {
  const plus = Math.max(a.length, b.length);
  if (plus === 0) return 1;
  return 1 - distanceEdition(a, b) / plus;
}

export interface MotifTrouve {
  /** Les valeurs du motif. */
  motif: number[];
  /** Les rangs où il commence. */
  positions: number[];
}

/**
 * Les figures contiguës qui reviennent, de la plus longue à la plus courte.
 *
 * ON NE GARDE PAS UN MOTIF ENTIÈREMENT CONTENU DANS UN PLUS LONG déjà retenu, et aux mêmes
 * endroits : sans cela, une figure de six valeurs qui revient deux fois ferait aussi paraître ses
 * cinq sous-figures, et le relevé dirait six fois la même chose.
 */
export function motifsRepetes(
  valeurs: readonly number[], longueurMin = 3, occurrencesMin = 2,
): MotifTrouve[] {
  const trouves: MotifTrouve[] = [];
  const longueurMax = Math.floor(valeurs.length / occurrencesMin);
  for (let L = longueurMax; L >= Math.max(1, longueurMin); L--) {
    const vus = new Map<string, number[]>();
    for (let i = 0; i + L <= valeurs.length; i++) {
      const cle = valeurs.slice(i, i + L).join(",");
      const liste = vus.get(cle);
      if (liste) liste.push(i); else vus.set(cle, [i]);
    }
    for (const [cle, positions] of vus) {
      if (positions.length < occurrencesMin) continue;
      const motif = cle.split(",").map(Number);
      const couvert = trouves.some((t) => positions.every((p) =>
        t.positions.some((q) => p >= q && p + L <= q + t.motif.length)));
      if (!couvert) trouves.push({ motif, positions });
    }
  }
  return trouves;
}

export interface Contraste {
  /** Ressemblance des valeurs elles-mêmes. */
  surLesValeurs: number;
  /** Ressemblance des profils : ce qui survit à une transposition. */
  surLeProfil: number;
  /** Les rangs où les deux profils diffèrent. */
  divergences: number[];
  /** Vrai si l'une est la transposition exacte de l'autre. */
  transposition: number | null;
}

/**
 * Ce que deux suites ont en commun, et où elles se séparent.
 *
 * LES DEUX MESURES SONT DONNÉES SÉPARÉMENT, et leur écart est le renseignement. Deux suites dont
 * les valeurs se ressemblent peu mais dont les profils se ressemblent beaucoup sont la même figure
 * transposée ou dilatée ; l'inverse signale deux passages qui emploient le même matériau sans le
 * faire aller au même endroit.
 */
export function analyseContrastive(a: readonly number[], b: readonly number[]): Contraste {
  const pa = profilPrimaire(a);
  const pb = profilPrimaire(b);
  const divergences: number[] = [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) divergences.push(i);
  let transposition: number | null = null;
  if (a.length === b.length && a.length > 0) {
    const d = b[0] - a[0];
    if (a.every((x, i) => b[i] - x === d)) transposition = d;
  }
  return {
    surLesValeurs: similarite(a, b),
    surLeProfil: similarite(pa, pb),
    divergences,
    transposition,
  };
}
