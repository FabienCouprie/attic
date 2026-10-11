// audio/bytebeat.ts — Une formule d'une ligne, un compteur d'échantillons, un octet par échantillon.
//
// D'après Ville-Matias Heikkilä, dit Viznut, « Algorithmic symphonies from one line of code — how
// and why? », blog countercomplex, 2 octobre 2011 ; et son analyse, « Discovering novel computer
// music techniques by exploring the space of short computer programs », arXiv:1112.1368, 6 décembre
// 2011. La forme d'origine est un programme en C d'une ligne :
//
//     main(t){for(t=0;;t++)putchar(t*(((t>>12)|(t>>8))&(63&(t>>4))));}
//
// `t` compte les échantillons, `putchar` n'en écrit qu'un OCTET, et le flux se joue à 8000 Hz.
//
// CE QUE L'ANALYSE DE L'AUTEUR EXPLIQUE. Une valeur sur huit bits s'entend comme une somme de huit
// ondes carrées, une par bit : celle du bit de poids fort est la plus longue et la plus forte, et
// chaque bit inférieur divise par deux longueur et amplitude. L'oreille fondrait ces composantes en
// un seul timbre, mais une composante introduite BRUSQUEMENT s'entend comme une note séparée, ce
// qui est l'origine des mélodies. Et un multiplicateur qui n'est pas une puissance de deux donne
// des intervalles non octaviants, par ALIASAGE : les ondes carrées aiguës se font dominer par leurs
// alias, qui s'accordent avec Nyquist et non avec la porteuse.
//
// D'OÙ VIENT LA CADENCE DE 8000 HZ, et ce n'est pas un choix musical : l'article dit que c'était la
// configuration par défaut de `/dev/dsp` et d'`aplay`. La convention du genre est un accident
// d'Unix. Elle n'en est pas moins constitutive du son, puisque c'est elle qui décide où les alias
// tombent : changer la cadence ne transpose pas, cela change les intervalles.
//
// POURQUOI UN ANALYSEUR ÉCRIT ICI, ET NON `mathjs` NI `new Function`.
//
//   · `mathjs`, que les deux nœuds à formule du catalogue emploient, fait de `^` une ÉLÉVATION À LA
//     PUISSANCE et non un ou-exclusif. Une formule Bytebeat portant un XOR y est donc calculée
//     comme une puissance, et elle rend quand même du son : relevé dans l'application, `i ^ 3` sort
//     à −41,92 LUFS sans hauteur, c'est-à-dire i³ écrêté. Le piège est silencieux, et c'est le pire
//     qu'il puisse être.
//   · `new Function` donnerait la sémantique exacte du C sans écrire un analyseur, et c'est refusé :
//     un graphe d'Attic est un FICHIER QUI VOYAGE, de sorte qu'une formule y est du texte reçu
//     d'ailleurs. Évaluer du texte reçu comme du code est une surface d'injection, quelle que soit
//     la commodité.
//
// LA PRÉCÉDENCE EST CELLE DU C, et c'est tout l'enjeu de l'analyseur : une formule recopiée doit
// rendre ce qu'elle rend ailleurs. `t*5 & t>>7` se lit donc `(t*5) & (t>>7)`, et non autrement.
//
// LA DIVISION SUIT LA SÉMANTIQUE DE JAVASCRIPT, c'est-à-dire flottante, et non la troncature du C.
// C'est une décision : le genre circule aujourd'hui par les lecteurs écrits en JavaScript, et c'est
// à eux que se comparent les formules qu'on recopie. Le repli sur huit bits, lui, tronque de toute
// façon le résultat final.
import { valeurA } from "./courbe";

/** Les opérateurs reconnus, avec leur précédence du C. Plus le rang est haut, plus il lie fort. */
const BINAIRES: Record<string, number> = {
  "|": 1, "^": 2, "&": 3,
  "==": 4, "!=": 4,
  "<": 5, ">": 5, "<=": 5, ">=": 5,
  "<<": 6, ">>": 6,
  "+": 7, "-": 7,
  "*": 8, "/": 8, "%": 8,
};

/** Les opérateurs à deux caractères, à reconnaître avant ceux d'un seul. */
const DEUX = ["<<", ">>", "<=", ">=", "==", "!="];

type Jeton =
  | { sorte: "nombre"; valeur: number }
  | { sorte: "t" }
  | { sorte: "operateur"; nom: string }
  | { sorte: "unaire"; nom: string }
  | { sorte: "parenthese"; nom: "(" | ")" }
  | { sorte: "ternaire"; nom: "?" | ":" };

export class FormuleInvalide extends Error {}

/**
 * Découpe la formule en jetons.
 *
 * UN CARACTÈRE INCONNU LÈVE, ET C'EST VOULU. Le genre emploie aussi des fonctions, sinus et
 * plancher, dans sa variante en virgule flottante ; ce module ne porte que l'arithmétique entière.
 * Rendre du silence sur une formule non reconnue la laisserait passer pour jouée ; lever la nomme.
 */
export function jetons(formule: string): Jeton[] {
  const out: Jeton[] = [];
  let i = 0;
  const s = formule.trim();
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < s.length && s[j] >= "0" && s[j] <= "9") j++;
      out.push({ sorte: "nombre", valeur: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === "t") { out.push({ sorte: "t" }); i++; continue; }
    if (c === "(" || c === ")") { out.push({ sorte: "parenthese", nom: c }); i++; continue; }
    if (c === "?" || c === ":") { out.push({ sorte: "ternaire", nom: c }); i++; continue; }
    if (c === "~") { out.push({ sorte: "unaire", nom: "~" }); i++; continue; }
    const deux = DEUX.find((d) => s.startsWith(d, i));
    if (deux) { out.push({ sorte: "operateur", nom: deux }); i += 2; continue; }
    if (c in BINAIRES) {
      // UN MOINS EN TÊTE OU APRÈS UN OPÉRATEUR EST UNAIRE, et le distinguer est la seule finesse
      // de ce découpage : `-t` et `3-t` ne se lisent pas de la même façon.
      const avant = out[out.length - 1];
      const prefixe = !avant || avant.sorte === "operateur" || avant.sorte === "unaire"
        || avant.sorte === "ternaire" || (avant.sorte === "parenthese" && avant.nom === "(");
      if (c === "-" && prefixe) out.push({ sorte: "unaire", nom: "-" });
      else if (c === "+" && prefixe) { /* un plus unaire ne fait rien */ }
      else out.push({ sorte: "operateur", nom: c });
      i++;
      continue;
    }
    throw new FormuleInvalide(`« ${c} »`);
  }
  if (out.length === 0) throw new FormuleInvalide("vide");
  return out;
}

/**
 * Met la formule en notation postfixée, par la manœuvre de triage de Dijkstra.
 *
 * LE TERNAIRE EST ASSOCIATIF À DROITE, comme en C : `a ? b : c ? d : e` se lit
 * `a ? b : (c ? d : e)`. Il est traité comme un opérateur de précédence zéro, donc plus faible que
 * tous les autres, ce qui est aussi sa place en C.
 */
export function postfixee(liste: readonly Jeton[]): Jeton[] {
  const sortie: Jeton[] = [];
  const pile: Jeton[] = [];
  const precedence = (j: Jeton): number =>
    j.sorte === "unaire" ? 9 : j.sorte === "operateur" ? BINAIRES[j.nom] : 0;

  for (const j of liste) {
    if (j.sorte === "nombre" || j.sorte === "t") { sortie.push(j); continue; }
    if (j.sorte === "unaire") { pile.push(j); continue; }
    if (j.sorte === "parenthese" && j.nom === "(") { pile.push(j); continue; }
    if (j.sorte === "parenthese") {
      while (pile.length && !(pile[pile.length - 1].sorte === "parenthese")) sortie.push(pile.pop()!);
      if (!pile.length) throw new FormuleInvalide("parenthèse fermante en trop");
      pile.pop();
      continue;
    }
    if (j.sorte === "ternaire") {
      if (j.nom === "?") {
        while (pile.length && precedence(pile[pile.length - 1]) > 0) sortie.push(pile.pop()!);
        pile.push(j);
      } else {
        while (pile.length && !(pile[pile.length - 1].sorte === "ternaire")) sortie.push(pile.pop()!);
        if (!pile.length) throw new FormuleInvalide("« : » sans « ? »");
      }
      continue;
    }
    while (pile.length) {
      const haut = pile[pile.length - 1];
      if (haut.sorte === "parenthese" || haut.sorte === "ternaire") break;
      if (precedence(haut) < precedence(j)) break;
      sortie.push(pile.pop()!);
    }
    pile.push(j);
  }
  while (pile.length) {
    const h = pile.pop()!;
    if (h.sorte === "parenthese") throw new FormuleInvalide("parenthèse ouvrante en trop");
    sortie.push(h);
  }
  return sortie;
}

/**
 * Évalue la forme postfixée pour une valeur de `t`.
 *
 * LES OPÉRATEURS BINAIRES DE JAVASCRIPT TRAVAILLENT SUR TRENTE-DEUX BITS SIGNÉS, ce qui est
 * exactement ce que fait un `int` du C sur les machines où le genre est né, et ce que font les
 * lecteurs en JavaScript par lesquels il circule. Il n'y a donc rien à forcer ici.
 */
export function evaluer(rpn: readonly Jeton[], t: number): number {
  const pile: number[] = [];
  const prendre = (): number => {
    if (!pile.length) throw new FormuleInvalide("opérande manquante");
    return pile.pop()!;
  };
  for (const j of rpn) {
    if (j.sorte === "nombre") { pile.push(j.valeur); continue; }
    if (j.sorte === "t") { pile.push(t); continue; }
    if (j.sorte === "unaire") {
      const a = prendre();
      pile.push(j.nom === "~" ? ~a : -a);
      continue;
    }
    if (j.sorte === "ternaire") {
      // Les trois opérandes sont sur la pile, la condition en dessous.
      const sinon = prendre();
      const alors = prendre();
      const condition = prendre();
      pile.push(condition ? alors : sinon);
      continue;
    }
    const b = prendre();
    const a = prendre();
    switch (j.nom) {
      case "|": pile.push(a | b); break;
      case "^": pile.push(a ^ b); break;
      case "&": pile.push(a & b); break;
      case "==": pile.push(a === b ? 1 : 0); break;
      case "!=": pile.push(a !== b ? 1 : 0); break;
      case "<": pile.push(a < b ? 1 : 0); break;
      case ">": pile.push(a > b ? 1 : 0); break;
      case "<=": pile.push(a <= b ? 1 : 0); break;
      case ">=": pile.push(a >= b ? 1 : 0); break;
      case "<<": pile.push(a << b); break;
      case ">>": pile.push(a >> b); break;
      case "+": pile.push(a + b); break;
      case "-": pile.push(a - b); break;
      case "*": pile.push(a * b); break;
      case "/": pile.push(b === 0 ? 0 : a / b); break;
      case "%": pile.push(b === 0 ? 0 : a % b); break;
      default: throw new FormuleInvalide(`« ${j.nom} »`);
    }
  }
  if (pile.length !== 1) throw new FormuleInvalide("formule incomplète");
  return pile[0];
}

/**
 * La formule compilée une fois, lisible pour chaque valeur de `t`.
 *
 * ELLE EST ÉVALUÉE UNE FOIS À LA COMPILATION, et c'est une correction. Une formule peut passer le
 * découpage et le triage tout en étant incomplète, « t + » par exemple : l'erreur ne se levait alors
 * qu'à l'évaluation, c'est-à-dire au premier échantillon, au milieu de la boucle de rendu. L'essai à
 * t nul la fait lever ici, là où l'appelant peut encore en dire quelque chose à l'écran.
 */
export function compilerBytebeat(formule: string): (t: number) => number {
  const rpn = postfixee(jetons(formule));
  evaluer(rpn, 0);
  return (t: number) => evaluer(rpn, t);
}

export interface OptionsBytebeat {
  formule: string;
  /** Cadence du flux d'octets, en Hz. Un tableau la fait varier au fil du rendu. */
  cadence: number | Float32Array;
  /** Cadence du rendu, en Hz. */
  sampleRate: number;
  dureeSec: number;
  /** Vrai : l'octet se lit en non signé, de 0 à 255, comme chez Viznut. */
  nonSigne?: boolean;
  /** Niveau de sortie, de 0 à 1. Un tableau le fait varier. */
  amplitude?: number | Float32Array;
}

export interface RapportBytebeat {
  /** Octets distincts calculés : la longueur du flux avant tenue. */
  octets: number;
  /** Valeurs distinctes prises par l'octet, de 1 à 256. */
  valeurs: number;
  /** Part du rendu à zéro après centrage : les octets qui tombent au milieu de la course. */
  partNulle: number;
}

/** Le repli sur huit bits, et la mise en course. Zéro à 255 devient moins un à presque un. */
export const octet = (v: number, nonSigne: boolean): number => {
  const b = ((Math.trunc(v) % 256) + 256) % 256;
  return nonSigne ? b / 128 - 1 : (b < 128 ? b : b - 256) / 128;
};

/**
 * Le rendu : un octet par pas de la cadence du flux, tenu jusqu'au suivant.
 *
 * LA TENUE EN ESCALIER EST LE SON DU PROCÉDÉ, et non un raccourci. Un flux de 8000 octets par
 * seconde joué par une carte à 44 100 est tenu, et c'est cet escalier qui porte l'aliasage dont
 * l'analyse de l'auteur fait l'origine des intervalles. Rééchantillonner proprement donnerait un
 * autre son, plus lisse et moins juste.
 */
export function bytebeat(o: OptionsBytebeat): { sortie: Float32Array; rapport: RapportBytebeat } {
  const sr = o.sampleRate;
  const n = Math.max(1, Math.round(o.dureeSec * sr));
  const calcul = compilerBytebeat(o.formule);
  const nonSigne = o.nonSigne !== false;
  const sortie = new Float32Array(n);
  const vues = new Set<number>();

  // `t` AVANCE À LA CADENCE DU FLUX, non à celle du rendu : c'est toute la différence avec une
  // formule évaluée par échantillon. Il est tenu en flottant pour qu'une cadence modulée garde sa
  // moyenne exacte, et tronqué à la lecture.
  let position = 0;
  let tPrecedent = -1;
  let octets = 0;
  let dernier = 0;
  let nuls = 0;
  for (let i = 0; i < n; i++) {
    const t = Math.floor(position);
    if (t !== tPrecedent) {
      const brut = calcul(t);
      dernier = octet(brut, nonSigne);
      vues.add(((Math.trunc(brut) % 256) + 256) % 256);
      octets++;
      tPrecedent = t;
    }
    sortie[i] = dernier * Math.min(1, Math.max(0, valeurA(o.amplitude ?? 1, i)));
    if (sortie[i] === 0) nuls++;
    position += Math.max(1, valeurA(o.cadence, i)) / sr;
  }

  return {
    sortie,
    rapport: { octets, valeurs: vues.size, partNulle: nuls / n },
  };
}
