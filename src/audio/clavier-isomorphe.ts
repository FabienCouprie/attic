// audio/clavier-isomorphe.ts — Le réseau d'un clavier isomorphe, et ce que chaque touche joue.
//
// IL VIT DANS LE DOMAINE ET NON DANS LES VUES, parce que la fiche du composant en a besoin autant
// que son dessin : une vue importe un greffon, l'inverse ferait un cycle. Les positions physiques
// qu'il nomme sont les ADRESSES de ses cases, pas un détail d'interface — c'est la même raison qui
// met `clavier-banque.ts` ici, dont les zones s'adressent par numéro de touche.
//
// CE QU'UN CLAVIER ISOMORPHE RÉSOUT. La géométrie d'un piano — cinq noires contre sept blanches —
// EST l'encodage de douze degrés par octave : on ne la paramètre pas. Un accordage à dix-neuf ou à
// trente et un degrés n'a donc aucune touche où se poser, et c'est ce que trois composants du
// catalogue disent d'eux-mêmes en rendant des cents que rien ne sait jouer.
//
// UN RÉSEAU, LUI, NE SUPPOSE AUCUN NOMBRE DE DEGRÉS. Une colonne vers la droite ajoute un degré,
// une rangée vers le haut en ajoute un nombre fixe : tout intervalle garde alors la MÊME FORME SOUS
// LES DOIGTS, où qu'on le joue et quel que soit l'accordage. C'est la propriété qui donne son nom à
// ces claviers, et elle tient par construction ici — le rang d'une case est une fonction affine de
// sa colonne et de sa rangée.
//
// LE CONTRÔLEUR EST LE CLAVIER DE L'ORDINATEUR, et c'est une décision de Fabien : une souris n'a
// qu'un pointeur, quand la forme de doigts est toute la vertu de l'isomorphisme. Les quatre rangées
// de l'ordinateur donnent QUARANTE ET UNE CASES, ce qui borne aussi ce qu'il y a à dessiner.
//
// LES TOUCHES SONT DÉSIGNÉES PAR LEUR POSITION, pour la raison mesurée dans `clavier-frappe.ts` :
// `e.key` rend ce que la disposition imprime sur la touche, et une rangée désignée par ses
// caractères se déforme d'une disposition à l'autre. Ici le réseau serait non seulement troué mais
// faux, les rangs se décalant les uns par rapport aux autres.
import { degrePlusProche, degresParPeriode, hauteurDuDegre, type Accordage } from "./accordage";

/**
 * Les quatre rangées de l'ordinateur, DE BAS EN HAUT, par position physique.
 *
 * La rangée du bas est la rangée zéro parce que le réseau monte : une rangée de plus vers le haut
 * ajoute des degrés, comme sur toute grille dont l'axe vertical croît vers le haut.
 */
export const RANGEES: readonly (readonly string[])[] = [
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"],
  ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"],
];

/** Le nombre de cases du réseau, qui ne dépend pas de l'accordage. */
export const CASES = RANGEES.reduce((n, r) => n + r.length, 0);

/**
 * Les intervalles que le saut de rangée peut viser, en cents.
 *
 * LE SAUT SE CHOISIT PAR L'INTERVALLE ET NON PAR LE NOMBRE DE DEGRÉS, et c'est ce qui le rend
 * portable d'un accordage à l'autre : « la quinte » vaut sept degrés sur douze, onze sur dix-neuf,
 * dix-huit sur trente et un. Un nombre de degrés écrit en dur voudrait dire autre chose à chaque
 * accordage reçu.
 *
 * LA QUINTE EST LE DÉFAUT parce que c'est l'axe des claviers généralisés depuis Bosanquet : c'est
 * l'intervalle auquel une échelle se referme, et une rangée de quintes met les degrés voisins d'une
 * même harmonie à portée de main. « Un degré » est l'autre extrême, où les rangées prolongent les
 * colonnes : le réseau devient un ruban, utile quand on veut parcourir l'échelle et non l'harmoniser.
 */
export const CIBLES_SAUT: Record<string, number> = {
  quinte: 702,
  quarte: 498,
  tierce: 386,
  degre: 0,
};

/**
 * Le nombre de degrés qu'une rangée ajoute, pour l'intervalle visé.
 *
 * `degre` ne passe pas par l'accordage : un degré est un degré. Les autres cherchent le degré le
 * plus proche de l'intervalle juste, par la même fonction qui sert à poser une mélodie tempérée sur
 * une échelle — et un accordage trop grossier pour distinguer la quinte de la tonique rendrait zéro,
 * ce qui empilerait les rangées : le saut est donc au minimum d'un degré.
 */
export function sautDeRangee(a: Accordage, cible: string): number {
  const cents = CIBLES_SAUT[cible];
  // Zéro cent, c'est « un degré » ; une cible inconnue retombe au même endroit, qui est le seul
  // saut valable sans rien savoir de l'accordage.
  if (cents === undefined || cents === 0) return 1;
  const { rang } = degrePlusProche(a, a.reference + cents / 100);
  return Math.max(1, rang);
}

/** Une case du réseau : où elle est, quel degré elle joue, et à quelle hauteur. */
export interface CaseIsomorphe {
  /** La position physique de la touche, telle que `e.code` la nomme. */
  code: string;
  colonne: number;
  /** Zéro pour la rangée du bas. */
  rangee: number;
  /** Le rang du degré, qui peut franchir la période et descendre sous la tonique. */
  rang: number;
  /** La hauteur jouée, en numéro de note MIDI fractionnaire. */
  note: number;
  /** Cette case est-elle une tonique, c'est-à-dire le premier degré d'un tour ? */
  tonique: boolean;
}

/**
 * Le réseau entier, une case par touche.
 *
 * `decalage` déplace tout le réseau d'un nombre de degrés, ce qui sert au déplacement par période :
 * la case en bas à gauche joue le degré `decalage`, et c'est la tonique quand il est un multiple du
 * nombre de degrés de la période.
 */
export function reseau(a: Accordage, saut: number, decalage = 0): CaseIsomorphe[] {
  const parPeriode = degresParPeriode(a);
  const cases: CaseIsomorphe[] = [];
  RANGEES.forEach((codes, rangee) => {
    codes.forEach((code, colonne) => {
      const rang = decalage + colonne + rangee * saut;
      cases.push({
        code, colonne, rangee, rang,
        note: hauteurDuDegre(a, rang),
        tonique: ((rang % parPeriode) + parPeriode) % parPeriode === 0,
      });
    });
  });
  return cases;
}

/**
 * La table des touches du réseau : position physique → hauteur jouée.
 *
 * C'est ce que l'écoute du clavier consulte, et c'est pourquoi elle est rendue à part du dessin :
 * jouer et montrer doivent lire le même réseau, sans quoi la touche sous le doigt et la case sous
 * l'œil finiraient par dire deux choses.
 */
export function tableDuReseau(cases: readonly CaseIsomorphe[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cases) m.set(c.code, c.note);
  return m;
}

/**
 * L'étendue du réseau, en degrés et en périodes, pour que le nœud puisse la dire.
 *
 * CE QU'UN RÉSEAU COÛTE EST SON ÉTENDUE, exactement comme pour une banque étalée en degrés : les
 * quarante et une cases couvrent quarante et un degrés plus trois sauts, soit d'autant moins de
 * périodes que l'accordage en compte de degrés.
 */
export function etendue(a: Accordage, saut: number): { degres: number; periodes: number } {
  // LES BORNES SE LISENT SUR LE RÉSEAU et ne se déduisent pas des longueurs de rangée : la rangée
  // la plus haute n'est pas toujours celle qui porte le rang le plus grand, les quatre n'ayant pas
  // le même nombre de touches.
  const rangs = reseau(a, saut).map((c) => c.rang);
  const plusBas = Math.min(...rangs), plusHaut = Math.max(...rangs);
  return {
    degres: plusHaut - plusBas + 1,
    periodes: (hauteurDuDegre(a, plusHaut) - hauteurDuDegre(a, plusBas)) * 100 / a.periode,
  };
}
