// audio/signatures.ts — Les signatures rythmiques : les lire, et grouper les temps d'une mesure.
//
// POURQUOI UNE TABLE PLUTÔT QU'UNE LISTE DE PLUS. Cinq composants portaient chacun la leur, écrite
// à la main, et les cinq divergeaient : trois valeurs dans l'un, six dans un autre, sept ou huit
// ailleurs. 9/8 manquait à quatre d'entre elles, 12/8 à deux. Une liste écrite cinq fois diverge
// cinq fois ; celle-ci est donc à un seul endroit, et ce qui s'y branche ne peut plus manquer une
// signature que les autres offrent.
//
// LE GROUPEMENT EST LE VRAI TRAVAIL, et c'est lui qui manquait. Une signature ne dit pas seulement
// combien d'unités tient une mesure : elle dit comment ces unités se groupent en temps. 9/8 n'est
// pas neuf temps, ce sont TROIS temps de trois croches, et 12/8 en est quatre. Sans cette
// décomposition on ne peut qu'aligner neuf clics plats, où personne n'entend la mesure.
//
// LA RÈGLE DES IRRÉGULIÈRES EST UNE CONVENTION, ÉCRITE PLUTÔT QUE SUPPOSÉE. Quand le numérateur
// n'est pas multiple de trois, le groupement n'est pas unique : 7/8 se bat 3+2+2, 2+2+3 ou 2+3+2
// selon la pièce, et aucune de ces lectures n'est fausse. Ce module place LES TROIS EN TÊTE, parce
// qu'il faut une réponse et qu'une réponse prévisible vaut mieux qu'une réponse juste une fois sur
// deux. Le reste se complète par des groupes de deux.
//
// LE TEMPO COMPTE LES NOIRES, et c'est ce que faisait déjà le seul composant qui sonnait une
// signature : l'unité du dénominateur vaut `4/den` battement, de sorte qu'une croche dure la
// moitié d'un battement et une blanche le double. La formule générale remplace deux cas écrits en
// dur — `den === 8 ? moitié : entier` — qui laissaient tomber les /2 et les /16 sur le cas entier,
// c'est-à-dire sur une durée fausse du simple au double.

/** Une signature lue : son numérateur et son dénominateur. */
export type Signature = { num: number; den: number };

/**
 * Les signatures offertes, par unité de référence croissante.
 *
 * L'ÉTENDUE EST UNE RÈGLE ET NON UNE CUEILLETTE, pour qu'on sache quoi répondre à « pourquoi
 * celle-là et pas celle-ci » : à la blanche, de deux à quatre ; à la noire, de un à sept ; à la
 * croche, de trois à quinze ; à la double croche, les métriques irrégulières qui s'écrivent. Un
 * numérateur de un à la croche ou à la double croche se note à la noire, et une mesure de seize
 * unités se note en deux mesures.
 */
export const SIGNATURES: readonly string[] = [
  "2/2", "3/2", "4/2",
  "1/4", "2/4", "3/4", "4/4", "5/4", "6/4", "7/4",
  "3/8", "4/8", "5/8", "6/8", "7/8", "8/8", "9/8", "10/8", "11/8", "12/8", "13/8", "14/8", "15/8",
  "5/16", "7/16", "9/16", "11/16", "12/16", "13/16", "15/16",
];

/** Les dénominateurs qui ont un sens : une ronde divisée par une puissance de deux. */
const DENOMINATEURS = [1, 2, 4, 8, 16, 32];

/**
 * Lit une signature écrite « num/den », ou rend `null`.
 *
 * ELLE CHERCHE LA FORME ET NON UN NOM : toute signature bien formée est acceptée, qu'elle figure
 * ou non dans `SIGNATURES`, de sorte qu'un graphe sauvegardé avec une valeur retirée de la liste
 * continue de sonner juste. Ce qui est refusé l'est parce qu'il n'a pas de sens — un numérateur
 * nul, un dénominateur qui n'est pas une division binaire de la ronde.
 */
export function lireSignature(texte: string): Signature | null {
  const forme = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(texte ?? "");
  if (!forme) return null;
  const num = Number(forme[1]);
  const den = Number(forme[2]);
  if (!Number.isInteger(num) || num < 1) return null;
  if (!DENOMINATEURS.includes(den)) return null;
  return { num, den };
}

/**
 * La durée d'une unité du dénominateur, en secondes.
 *
 * Le tempo compte les noires : l'unité vaut `4/den` battement. Un tempo illisible ou nul rend
 * `null`, une durée négative ou infinie n'ayant aucun usage en aval.
 */
export function dureeUnite(tempo: number, den: number): number | null {
  if (!Number.isFinite(tempo) || tempo <= 0) return null;
  if (!DENOMINATEURS.includes(den)) return null;
  return (60 / tempo) * (4 / den);
}

/**
 * La décomposition d'une mesure en temps, comptée en unités du dénominateur.
 *
 * Les dénominateurs longs — ronde, blanche, noire — portent un temps par unité : 4/4 fait quatre
 * temps d'une noire. Les courts se groupent dès que la mesure est assez longue pour qu'un temps
 * d'une seule croche n'ait plus de sens : 6/8 fait deux temps de trois croches, 9/8 en fait trois,
 * 12/8 quatre. En dessous de cinq unités la mesure reste simple, 3/8 étant trois temps et non un.
 */
export function groupesDe(num: number, den: number): number[] {
  if (!Number.isInteger(num) || num < 1) return [];
  if (den <= 4 || num < 5) return Array.from({ length: num }, () => 1);

  let trois = Math.floor(num / 3);
  let reste = num - trois * 3;
  // UN RESTE DE UN NE SE GROUPE PAS : il faut rendre un trois pour en faire deux groupes de deux.
  // Sans quoi 7/8 finirait sur un temps d'une seule croche, qui n'est pas un temps.
  if (reste === 1) { trois -= 1; reste = 4; }
  return [
    ...Array.from({ length: trois }, () => 3),
    ...Array.from({ length: reste / 2 }, () => 2),
  ];
}

/** Le rang d'un clic dans la mesure : temps fort, temps, ou subdivision à l'intérieur d'un temps. */
export type Niveau = 0 | 1 | 2;

/** Un clic de la mesure : son rang en unités depuis le début, et ce qu'il marque. */
export type Clic = { unite: number; niveau: Niveau };

/**
 * Les clics d'une mesure, un par unité du dénominateur.
 *
 * TROIS RANGS ET NON DEUX, et c'est ce qui rend une mesure composée audible : le premier temps,
 * les autres temps, et les unités qui tombent à l'intérieur d'un temps. Une mesure simple n'a pas
 * de troisième rang, chacune de ses unités étant un temps, de sorte que son clic ne change pas.
 */
export function clicsDeMesure(num: number, den: number): Clic[] {
  const clics: Clic[] = [];
  let unite = 0;
  for (const groupe of groupesDe(num, den)) {
    for (let i = 0; i < groupe; i++) {
      clics.push({ unite, niveau: unite === 0 ? 0 : i === 0 ? 1 : 2 });
      unite++;
    }
  }
  return clics;
}

/** Le nombre de temps d'une mesure, c'est-à-dire ce qu'un chef battrait. */
export function tempsParMesure(num: number, den: number): number {
  return groupesDe(num, den).length;
}
