// audio/cribles.ts — La théorie des cribles d'Iannis Xenakis
// (« Sieves », 1990 ; le procédé apparaît dès « Nomos alpha », 1966).
//
// Xenakis cherchait un moyen de fabriquer des échelles et des rythmes qui ne
// soient ni réguliers ni aléatoires — car les deux ennuient l'oreille, l'un par
// prévisibilité, l'autre par absence de forme. Sa réponse tient à l'arithmétique
// modulaire : un CRIBLE est une réunion de classes résiduelles, notée m@i, qui
// retient les entiers n tels que n ≡ i (mod m).
//
// Pris seul, un crible n'est qu'une grille régulière : 3@0 donne 0, 3, 6, 9…
// Réunis, deux cribles produisent une suite dont les écarts ne se répètent
// qu'au bout du PPCM des modules — assez long pour qu'on n'entende plus la
// périodicité, assez structuré pour qu'on n'entende pas du hasard. C'est
// exactement l'espace entre les deux que Xenakis visait.
//
// La gamme majeure elle-même s'écrit comme un crible, ce qui montre qu'une
// échelle familière n'est ni arbitraire ni « naturelle » mais une structure
// arithmétique parmi d'autres — et autorise donc à en fabriquer de nouvelles.
// Voir `CRIBLE_GAMME_MAJEURE`.

/** Une classe résiduelle : les entiers n tels que n ≡ residu (mod module). */
export interface Classe {
  module: number;
  residu: number;
}

/** Opération combinant les classes d'un crible. */
export type OperationCrible = "union" | "intersection" | "difference";

export interface OptionsCrible {
  classes: Classe[];
  operation: OperationCrible;
  /** Nombre d'entiers examinés, de 0 à `etendue` exclu. */
  etendue: number;
}

/** Plus grand commun diviseur, puis plus petit commun multiple. */
function pgcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return Math.abs(a);
}

/**
 * Période du crible : le PPCM des modules.
 *
 * C'est la grandeur qui décide de tout. Un crible de période 12 se laisse
 * entendre comme une grille ; un crible de période 385 (5·7·11) produit une
 * suite dont l'oreille ne retrouve jamais le début. Xenakis choisissait ses
 * modules pour cette raison, en préférant les nombres premiers entre eux.
 */
export function periodeCrible(classes: Classe[]): number {
  if (!classes.length) return 1;
  return classes.reduce((acc, c) => {
    const m = Math.max(1, Math.round(c.module));
    return (acc * m) / pgcd(acc, m);
  }, 1);
}

/** Le crible appliqué : la liste des entiers retenus. */
export function appliquerCrible(options: OptionsCrible): number[] {
  const etendue = Math.max(1, Math.round(options.etendue));
  const classes = options.classes
    .map((c) => ({ module: Math.max(1, Math.round(c.module)), residu: Math.round(c.residu) }))
    .filter((c) => c.module >= 1);
  if (!classes.length) return [];

  const appartient = (n: number, c: Classe) => ((n % c.module) + c.module) % c.module === ((c.residu % c.module) + c.module) % c.module;

  const retenus: number[] = [];
  for (let n = 0; n < etendue; n++) {
    let garde: boolean;
    switch (options.operation) {
      case "intersection":
        garde = classes.every((c) => appartient(n, c));
        break;
      case "difference":
        // Ce que retient la PREMIÈRE classe et qu'aucune autre ne reprend : sert
        // à creuser des trous dans une grille régulière, ce qu'une réunion ne
        // sait pas faire.
        garde = appartient(n, classes[0]) && !classes.slice(1).some((c) => appartient(n, c));
        break;
      default:
        garde = classes.some((c) => appartient(n, c));
    }
    if (garde) retenus.push(n);
  }
  return retenus;
}

/**
 * La gamme majeure écrite comme un crible : 7@0 ∪ 7@2 ∪ 7@4 ∪ 7@5 retient bien
 * {0, 2, 4, 5, 7, 9, 11} sur une octave, soit do ré mi fa sol la si.
 *
 * Cette décomposition a été TROUVÉE PAR RECHERCHE EXHAUSTIVE sur les classes de
 * module 2 à 12, et non reprise d'une source. La précision a son importance :
 * une première version affirmait la forme « 3@2 ∪ 4@0 ∪ 4@1 », qui donne en
 * réalité huit degrés dont trois étrangers à la gamme. La recherche montre par
 * ailleurs qu'AUCUNE réunion de moins de quatre classes ne produit cette gamme,
 * et qu'aucune rotation de celle-ci ne s'écrit comme une classe de module 3
 * réunie à une classe de module 4 — la forme simple qu'on croit spontanément
 * exister n'existe pas.
 *
 * À savoir : le module 7 ne divisant pas 12, ce crible n'est pas périodique à
 * l'octave. Il décrit exactement les douze premiers degrés, ce qui suffit à
 * l'usage qu'on en fait ici, mais ne se prolonge pas de lui-même.
 */
export const CRIBLE_GAMME_MAJEURE: Classe[] = [
  { module: 7, residu: 0 },
  { module: 7, residu: 2 },
  { module: 7, residu: 4 },
  { module: 7, residu: 5 },
];

/**
 * Transforme les entiers retenus en hauteurs MIDI, en repliant sur l'octave
 * lorsque le crible dépasse douze degrés.
 */
export function criblesVersNotes(retenus: number[], noteBase: number): number[] {
  return retenus.map((n) => noteBase + n);
}

/**
 * Transforme les entiers retenus en instants, un entier valant une subdivision.
 * C'est la même structure lue sur l'axe du temps plutôt que sur celui des
 * hauteurs — la dualité que Xenakis revendiquait explicitement.
 */
export function criblesVersRythme(retenus: number[], dureeSubdivisionSec: number): number[] {
  return retenus.map((n) => n * dureeSubdivisionSec);
}

/**
 * Analyse une expression de crible : une suite de classes « module@résidu »
 * séparées par des espaces, des virgules ou le symbole d'union.
 *
 * Xenakis notait ses cribles ainsi, et c'est la forme la plus courte pour en
 * saisir un : « 3@0 4@1 5@2 » se lit d'un coup d'œil là où trois champs
 * numériques par classe encombreraient l'inspecteur.
 *
 * Les fragments invalides sont IGNORÉS plutôt que de faire échouer l'analyse :
 * on saisit ces expressions à la main, souvent en tâtonnant, et une frappe
 * hésitante ne doit pas vider le crible entier.
 */
export function parserCrible(expression: string): Classe[] {
  const classes: Classe[] = [];
  for (const morceau of String(expression).split(/[\s,;∪|]+/)) {
    if (!morceau) continue;
    const m = morceau.match(/^(\d+)@(-?\d+)$/);
    if (!m) continue;
    const module = parseInt(m[1], 10);
    if (!Number.isFinite(module) || module < 1) continue;
    classes.push({ module, residu: parseInt(m[2], 10) });
  }
  return classes;
}

/** Écrit un crible sous la forme « 3@0 ∪ 4@1 ». */
export function ecrireCrible(classes: Classe[]): string {
  return classes.map((c) => `${c.module}@${c.residu}`).join(" ∪ ");
}
