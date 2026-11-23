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

/**
 * Une expression de crible : des classes combinées par réunion, intersection,
 * différence symétrique et complément, la notation de Christopher Ariza (« The
 * Xenakis Sieve as Object », Computer Music Journal, 2005).
 *
 * `ouex` est la différence symétrique, « ^ » chez Ariza et dans `music21.sieve` :
 * un degré y est retenu quand un nombre impair de ses termes le retient, ce qui,
 * pour deux termes, veut dire l'un ou l'autre et pas les deux.
 */
export type ExpressionCrible =
  | { classe: Classe }
  | { non: ExpressionCrible }
  | { et: ExpressionCrible[] }
  | { ouex: ExpressionCrible[] }
  | { ou: ExpressionCrible[] };

/** Les termes d'une expression composée. */
const termesDe = (e: { et: ExpressionCrible[] } | { ouex: ExpressionCrible[] } | { ou: ExpressionCrible[] }) =>
  "et" in e ? e.et : "ouex" in e ? e.ouex : e.ou;

/**
 * Les classes combinées par une seule opération. La différence garde ce que la
 * PREMIÈRE classe retient et qu'aucune autre ne reprend : sert à creuser des trous
 * dans une grille régulière, ce qu'une réunion ne sait pas faire. Elle s'écrit
 * donc comme l'intersection de la première et du complément des autres.
 */
export function combinerClasses(classes: Classe[], operation: OperationCrible): ExpressionCrible {
  const feuilles = classes.map((classe) => ({ classe }));
  if (feuilles.length === 1) return feuilles[0];
  if (operation === "intersection") return { et: feuilles };
  if (operation === "difference") return { et: [feuilles[0], ...feuilles.slice(1).map((f) => ({ non: f }))] };
  return { ou: feuilles };
}

/** Les classes d'une expression, dans l'ordre où elle les écrit. */
export function classesDe(e: ExpressionCrible): Classe[] {
  if ("classe" in e) return [e.classe];
  if ("non" in e) return classesDe(e.non);
  return termesDe(e).flatMap(classesDe);
}

const appartient = (n: number, c: Classe) => {
  const m = Math.max(1, Math.round(c.module));
  return ((n % m) + m) % m === ((Math.round(c.residu) % m) + m) % m;
};

function retient(e: ExpressionCrible, n: number): boolean {
  if ("classe" in e) return appartient(n, e.classe);
  // Le complément se prend sur les degrés examinés, de 0 à l'étendue exclue.
  if ("non" in e) return !retient(e.non, n);
  if ("ouex" in e) return e.ouex.filter((f) => retient(f, n)).length % 2 === 1;
  return "et" in e ? e.et.every((f) => retient(f, n)) : e.ou.some((f) => retient(f, n));
}

/** L'expression appliquée : la liste des entiers retenus, de 0 à `etendue` exclu. */
export function retenirCrible(e: ExpressionCrible, etendue: number): number[] {
  const retenus: number[] = [];
  for (let n = 0; n < Math.max(1, Math.round(etendue)); n++) if (retient(e, n)) retenus.push(n);
  return retenus;
}

/** Le crible appliqué : la liste des entiers retenus. */
export function appliquerCrible(options: OptionsCrible): number[] {
  if (!options.classes.length) return [];
  return retenirCrible(combinerClasses(options.classes, options.operation), options.etendue);
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
 * Pourquoi un crible ne se lit pas : le fragment, l'opérateur ou la parenthèse en
 * cause, tel qu'il est écrit.
 *   - `fragment` : ce qui n'est pas une classe « module@résidu », au module d'au moins 1 ;
 *   - `classe_manquante` : un opérateur, ou une parenthèse, sans la classe qu'il attend ;
 *   - `operateur_manquant` : deux termes qui se suivent sans « | », « ^ » ni « & » ;
 *   - `parenthese` : une parenthèse sans sa paire.
 */
export type RefusCrible = { genre: "vide" | "fragment" | "classe_manquante" | "operateur_manquant" | "parenthese"; texte: string };

type Jeton = { genre: "classe"; classe: Classe; texte: string } | { genre: "ou" | "ouex" | "et" | "non" | "ouvre" | "ferme"; texte: string };

/** « △ » écrit la différence symétrique dans le message, comme « ∪ » et « ∩ » les deux autres. */
const SIGNES: Record<string, Exclude<Jeton["genre"], "classe">> = {
  "|": "ou", "∪": "ou", "^": "ouex", "△": "ouex", "&": "et", "∩": "et", "-": "non", "−": "non", "(": "ouvre", ")": "ferme",
};
/** Ce qui termine un fragment. Le tiret n'en est pas : il appartient au résidu de « 5@-2 ». */
const BORNE = /[\s,;|&^△()∪∩]/;

function decouper(texte: string): Jeton[] | RefusCrible {
  const jetons: Jeton[] = [];
  for (let i = 0; i < texte.length;) {
    const c = texte[i];
    if (/[\s,;]/.test(c)) { i++; continue; }
    if (SIGNES[c]) { jetons.push({ genre: SIGNES[c], texte: c }); i++; continue; }
    let j = i;
    while (j < texte.length && !BORNE.test(texte[j])) j++;
    const fragment = texte.slice(i, j);
    const m = /^(\d+)@([-−]?\d+)$/.exec(fragment);
    const module = m ? Number(m[1]) : NaN, residu = m ? Number(m[2].replace("−", "-")) : NaN;
    if (!Number.isSafeInteger(module) || module < 1 || !Number.isSafeInteger(residu)) return { genre: "fragment", texte: fragment };
    jetons.push({ genre: "classe", classe: { module, residu }, texte: fragment });
    i = j;
  }
  return jetons;
}

/**
 * Lit une expression de crible. Elle a deux formes.
 *
 * LA LISTE. Des classes « module@résidu » séparées par des espaces, des virgules
 * ou des points-virgules, que `operation` combine : la forme la plus courte, et
 * Xenakis notait ses cribles ainsi. « 3@0 4@1 5@2 » se lit d'un coup d'œil là où
 * trois champs numériques par classe encombreraient l'inspecteur.
 *
 * L'EXPRESSION. Dès qu'elle porte un opérateur, elle se combine elle-même, dans la
 * notation d'Ariza que lit aussi `music21.sieve` : « | » ou « ∪ » pour la réunion,
 * « & » ou « ∩ » pour l'intersection, « ^ » ou « △ » pour la différence symétrique,
 * « - » ou « − » devant un terme pour son complément, des parenthèses pour grouper.
 * Le complément précède l'intersection, qui précède la différence symétrique, qui
 * précède la réunion, l'ordre de Python. Le tiret n'y est jamais une différence :
 * « 3@0-4@0 » est refusé, et la différence s'écrit « 3@0 & -4@0 ».
 *
 * CE QUI NE SE LIT PAS EST REFUSÉ, et le refus nomme le fragment en cause. Les
 * fragments mal formés étaient ignorés pour qu'une frappe hésitante ne vide pas le
 * crible ; mais le crible joué n'était plus celui qu'on avait écrit, sans un mot.
 * Décision de Fabien du 2026-11-22, revue des notations en texte.
 */
export function lireCrible(texte: string, operation: OperationCrible): { expression: ExpressionCrible } | { refus: RefusCrible } {
  const decoupe = decouper(String(texte));
  if (!Array.isArray(decoupe)) return { refus: decoupe };
  const jetons: Jeton[] = decoupe;
  if (!jetons.length) return { refus: { genre: "vide", texte: "" } };
  if (jetons.every((j) => j.genre === "classe")) {
    return { expression: combinerClasses(jetons.map((j) => (j as { classe: Classe }).classe), operation) };
  }

  let k = 0;
  let refus: RefusCrible | null = null;
  const refuser = (genre: RefusCrible["genre"], texteRefus: string) => { refus ??= { genre, texte: texteRefus }; return null; };
  const suite = (termes: (ExpressionCrible | null)[], faire: (t: ExpressionCrible[]) => ExpressionCrible) =>
    termes.some((t) => t === null) ? null : termes.length === 1 ? termes[0] : faire(termes as ExpressionCrible[]);

  function reunion(): ExpressionCrible | null {
    const termes = [difference()];
    while (!refus && jetons[k]?.genre === "ou") { k++; termes.push(difference()); }
    return suite(termes, (ou) => ({ ou }));
  }
  // « ^ » se lie plus fort que « | » et moins fort que « & », l'ordre de Python, que suit
  // `music21.sieve` : 2@0|3@0^4@0&6@0 vaut 2@0 | (3@0 ^ (4@0 & 6@0)).
  function difference(): ExpressionCrible | null {
    const termes = [intersection()];
    while (!refus && jetons[k]?.genre === "ouex") { k++; termes.push(intersection()); }
    return suite(termes, (ouex) => ({ ouex }));
  }
  function intersection(): ExpressionCrible | null {
    const termes = [terme()];
    while (!refus && jetons[k]?.genre === "et") { k++; termes.push(terme()); }
    return suite(termes, (et) => ({ et }));
  }
  function terme(): ExpressionCrible | null {
    if (refus) return null;
    const j = jetons[k];
    if (!j) return refuser("classe_manquante", jetons[k - 1].texte);
    k++;
    if (j.genre === "classe") return { classe: j.classe };
    if (j.genre === "non") { const t = terme(); return t && { non: t }; }
    if (j.genre !== "ouvre") return refuser("classe_manquante", j.texte);
    const dedans = reunion();
    if (refus) return null;
    if (jetons[k]?.genre === "ferme") { k++; return dedans; }
    return jetons[k] ? refuser("operateur_manquant", jetons[k].texte) : refuser("parenthese", j.texte);
  }

  const expression = reunion();
  if (!refus && jetons[k]) refuser(jetons[k].genre === "ferme" ? "parenthese" : "operateur_manquant", jetons[k].texte);
  return refus || !expression ? { refus: refus ?? { genre: "vide", texte: "" } } : { expression };
}

/**
 * Écrit une expression : « 3@0 ∪ (4@1 ∩ 5@2) », « 2@0 ∩ −6@0 ». Un terme composé
 * dans un autre prend ses parenthèses, et ce qui s'écrit se relit tel quel.
 */
export function ecrireCrible(e: ExpressionCrible): string {
  const dedans = (f: ExpressionCrible) => ("classe" in f || "non" in f ? ecrireCrible(f) : `(${ecrireCrible(f)})`);
  if ("classe" in e) return `${e.classe.module}@${e.classe.residu}`;
  if ("non" in e) return `−${dedans(e.non)}`;
  return termesDe(e).map(dedans).join("et" in e ? " ∩ " : "ouex" in e ? " △ " : " ∪ ");
}
