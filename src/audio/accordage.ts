// audio/accordage.ts — Un accordage : les degrés d'une échelle de hauteurs, et comment on les joue.
//
// POURQUOI CE MODULE EXISTE, ET CE QU'IL FERME.
//
// Trois nœuds du catalogue calculent déjà une échelle de hauteurs, et aucun ne pouvait la faire
// jouer. « Gammes du monde » porte les maqamat, les ragas et les gammes de gamelan **en cents**, et
// son propre résumé dit « les degrés qu'un clavier ne sait pas jouer ». « Harmonie spectrale » rend
// des hauteurs « écarts au tempérament compris ». Et « Courbe de dissonance », d'après Sethares,
// trouve la gamme qu'un timbre appelle — en sortant un TEXTE qu'on lit et qu'on ne joue pas.
//
// La chaîne manquait donc d'un seul maillon : un objet qui circule. C'est celui-ci.
//
// CE QU'IL N'EST PAS. Ce n'est pas un accord au sens d'un empilement de notes — `audio/accords.ts`
// tient cela — ni le désaccord d'une zone d'échantillonneur, que `clavier-banque.ts` appelle déjà
// `accord`. Le mot « accordage » est celui du facteur d'instruments, et il est libre dans ce dépôt à
// une occurrence près, l'étiquette d'une tablature de guitare, qui désigne la même chose.
//
// LA CHAÎNE DU SON LE PORTE DÉJÀ, et c'est pourquoi ce module n'a pas à la toucher.
// `audio/microtons.test.ts` l'a mesurée chemin par chemin : `440 × 2^((n − 69) / 12)` accepte 69,5,
// le rééchantillonnage d'un échantillon est continu, et le rendu joue le quart de ton. Le champ
// `note` d'une `Note` est déjà un flottant. Il n'y avait rien à changer en aval ; il manquait
// quelque chose en amont.

/**
 * Une échelle de hauteurs, telle qu'elle circule dans le graphe.
 *
 * LES DEGRÉS SONT EN CENTS, ET NON EN DEMI-TONS. C'est l'unité dans laquelle les trois producteurs
 * du dépôt les expriment déjà — `temperaments.ts`, `gammes-monde` et la courbe de dissonance — et
 * celle dans laquelle un tempérament se publie. Cent cents valent un demi-ton égal.
 */
export interface Accordage {
  /**
   * Les degrés d'une période, en cents depuis la tonique, croissants, le premier à zéro.
   *
   * La période elle-même n'y figure PAS : douze degrés égaux s'écrivent `[0, 100, … 1100]`, et non
   * treize valeurs dont la dernière répéterait la première une octave plus haut. Sans cette règle,
   * `hauteurDuDegre` compterait deux fois la tonique au passage d'une période à la suivante.
   */
  degres: number[];
  /**
   * La période, en cents : 1200 pour l'octave.
   *
   * ELLE N'EST PAS TOUJOURS L'OCTAVE, ET C'EST TOUTE LA RAISON DE CE CHAMP. La notice de « Courbe
   * de dissonance » le dit déjà : « un timbre dont les partiels ne sont pas des multiples entiers
   * appelle une autre gamme, dont l'octave même peut ne plus être à 1200 cents ». L'échelle de
   * Bohlen-Pierce répète à la douzième, 1901,955 cents, parce que son timbre de référence n'a que
   * des partiels impairs.
   */
  periode: number;
  /**
   * La hauteur du degré zéro, en numéro de note MIDI — fractions comprises.
   *
   * Un accordage ne dit pas où il se pose : « douze degrés égaux » est la même échelle que l'on
   * parte de do ou de la. Ce champ est le point d'ancrage, et 60 — le do central — est le défaut.
   */
  reference: number;
  /** D'où il vient, pour qu'un nœud puisse le dire plutôt que d'afficher un tableau de nombres. */
  origine?: string;
}

/** Cents d'un demi-ton égal. Écrit une fois pour que la division se lise. */
const CENTS_PAR_DEMI_TON = 100;

/** Cents de l'octave. */
export const CENTS_PAR_OCTAVE = 1200;

/**
 * Un tempérament égal à `degres` degrés par période.
 *
 * `accordageEgal(12)` rend le tempérament égal ordinaire, et c'est le cas qui doit rester neutre :
 * ses degrés tombent exactement sur les demi-tons entiers.
 */
export function accordageEgal(
  degres: number, periode = CENTS_PAR_OCTAVE, reference = 60, origine?: string,
): Accordage {
  if (!Number.isInteger(degres) || degres < 1) {
    throw new Error(`un tempérament égal a au moins un degré entier, reçu ${degres}`);
  }
  const pas = periode / degres;
  return {
    degres: Array.from({ length: degres }, (_, i) => i * pas),
    periode, reference, origine,
  };
}

/**
 * Un accordage depuis une liste de cents quelconque — celle d'un tempérament publié, d'un maqam,
 * ou des creux d'une courbe de dissonance.
 *
 * CE QUE CETTE FONCTION CORRIGE PLUTÔT QUE DE REFUSER. Les listes réelles arrivent dans n'importe
 * quel ordre, avec des doublons, et parfois avec la période en dernière valeur — les creux d'une
 * courbe de dissonance la portent toujours, puisque l'octave est le creux le plus franc. Elle est
 * donc triée, dédoublonnée, et la valeur égale à la période est retirée : c'est la tonique du tour
 * suivant, pas un degré de celui-ci.
 *
 * CE QU'ELLE REFUSE, EN REVANCHE : une liste vide, et un degré hors de la période. Le premier
 * donnerait un accordage sans aucune hauteur ; le second ferait se chevaucher deux tours, de sorte
 * que deux degrés différents rendraient la même hauteur.
 */
export function accordageDepuisCents(
  cents: readonly number[], periode = CENTS_PAR_OCTAVE, reference = 60, origine?: string,
): Accordage {
  if (periode <= 0) throw new Error(`une période vaut plus que zéro cent, reçu ${periode}`);
  const propres = [...new Set(cents.map((c) => Math.abs(c) < 1e-9 ? 0 : c))]
    .filter((c) => Math.abs(c - periode) > 1e-9)
    .sort((a, b) => a - b);
  if (propres.length === 0) throw new Error("un accordage a au moins un degré");
  const hors = propres.filter((c) => c < 0 || c >= periode);
  if (hors.length > 0) {
    throw new Error(`un degré tombe hors de la période de ${periode} cents : ${hors.join(", ")}`);
  }
  // La tonique est toujours un degré, même quand la liste reçue ne la portait pas : une échelle qui
  // commencerait à son second degré n'aurait pas de point d'ancrage.
  if (propres[0] !== 0) propres.unshift(0);
  return { degres: propres, periode, reference, origine };
}

/** Le nombre de degrés d'une période : douze pour le tempérament ordinaire. */
export function degresParPeriode(a: Accordage): number {
  return a.degres.length;
}

/**
 * La hauteur d'un degré, en numéro de note MIDI fractionnaire.
 *
 * LE RANG SE PROMÈNE HORS DE LA PÉRIODE, ET C'EST VOULU : le degré douze d'un tempérament à douze
 * est la tonique de l'octave suivante, et le degré moins un est le dernier degré de l'octave
 * précédente. Un clavier n'a pas à savoir compter les tours, et une mélodie écrite en degrés n'a
 * pas à se replier à la main.
 */
export function hauteurDuDegre(a: Accordage, rang: number): number {
  const n = a.degres.length;
  const tours = Math.floor(rang / n);
  const dedans = rang - tours * n;
  return a.reference + (tours * a.periode + a.degres[dedans]) / CENTS_PAR_DEMI_TON;
}

/**
 * Le degré le plus proche d'une hauteur donnée, et ce qu'il en reste.
 *
 * Sert à l'inverse du précédent : poser une mélodie tempérée sur un accordage, ou dire de combien
 * une hauteur mesurée s'écarte du degré qu'elle approche. L'écart est rendu en cents, signé.
 */
export function degrePlusProche(a: Accordage, note: number): { rang: number; ecartCents: number } {
  const n = a.degres.length;
  const centsDepuisReference = (note - a.reference) * CENTS_PAR_DEMI_TON;
  const tours = Math.floor(centsDepuisReference / a.periode);
  const dedans = centsDepuisReference - tours * a.periode;
  let meilleur = 0, distance = Infinity;
  // Le premier degré du tour suivant est candidat lui aussi : une hauteur juste sous la période est
  // plus proche de la tonique d'au-dessus que du dernier degré d'en dessous.
  //
  // À ÉGALITÉ EXACTE, LE DEGRÉ LE PLUS BAS GAGNE, et c'est déclaré plutôt que subi : la comparaison
  // est stricte, donc le premier candidat atteint se garde. Une hauteur pile entre deux degrés — le
  // quart de ton d'un tempérament à douze — rend alors le degré d'en dessous et un écart POSITIF.
  // L'un ou l'autre ferait l'affaire ; ce qui ne ferait pas l'affaire serait de ne pas le dire.
  for (let i = 0; i <= n; i++) {
    const cents = i === n ? a.periode : a.degres[i];
    const d = Math.abs(dedans - cents);
    if (d < distance) { distance = d; meilleur = i; }
  }
  const rang = tours * n + meilleur;
  return { rang, ecartCents: (note - hauteurDuDegre(a, rang)) * CENTS_PAR_DEMI_TON };
}

/**
 * Les rangs de degrés qu'un texte désigne, ou un tour complet quand il n'en désigne aucun.
 *
 * LES RANGS SE PROMÈNENT HORS DE LA PÉRIODE, ce que `hauteurDuDegre` permet : le rang douze d'un
 * accordage à douze degrés est la tonique du tour suivant, et un rang négatif descend sous elle. Un
 * texte de « 0 4 7 12 » décrit donc un arpège qui franchit la période.
 *
 * LA SÉPARATION EST TOUT CE QUI N'EST PAS UN CHIFFRE OU UN MOINS, de sorte qu'une liste séparée par
 * des espaces, des virgules ou des retours à la ligne se lise pareil. Le moins seul est écarté : il
 * ne désigne aucun rang, et `Number("-")` rendrait `NaN`.
 */
export function rangsDemandes(texte: string, parPeriode: number): number[] {
  const bruts = texte.split(/[^-\d]+/).filter((m) => m !== "" && m !== "-");
  if (bruts.length === 0) return Array.from({ length: parPeriode }, (_, i) => i);
  return bruts.map(Number).filter(Number.isFinite);
}

/**
 * Une phrase qui décrit un accordage, pour le message d'un nœud.
 *
 * Elle dit le nombre de degrés, la période quand elle n'est pas l'octave, et l'origine quand elle
 * est connue — jamais le tableau des cents, qu'on ne lit pas dans un message de deux lignes.
 */
export function decrireAccordage(a: Accordage, en = false): string {
  const degres = `${a.degres.length} ${en ? "degrees" : "degrés"}`;
  const periode = Math.abs(a.periode - CENTS_PAR_OCTAVE) < 0.5
    ? (en ? "per octave" : "par octave")
    : `${en ? "per" : "par période de"} ${a.periode.toFixed(0)} ${en ? "cents" : "cents"}`;
  return [`${degres} ${periode}`, a.origine].filter(Boolean).join(" · ");
}
