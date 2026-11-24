// audio/choral-regles.ts — Les règles d'un choral à quatre voix, en prédicats que le vérificateur et
// l'harmoniseur partagent.
//
// UNE SEULE DÉFINITION DE CHAQUE RÈGLE. Le vérificateur (`audio/choral-verifier.ts`) dit où une règle
// est enfreinte ; l'harmoniseur du lot suivant cherchera une écriture qui ne l'enfreint pas. Deux
// écritures de la même règle divergeraient au premier ajout, et le vérificateur refuserait ce que
// l'harmoniseur produit.
//
// LES RÈGLES SONT CELLES DE L'ÉCRITURE À QUATRE VOIX DE L'USAGE SCOLAIRE : quintes et octaves
// consécutives interdites entre deux voix quelconques, douzièmes et unissons compris (Robert
// Hutchinson, « Music Theory for the 21st-Century Classroom », § 26.3), soprano et alto, alto et
// ténor dans l'octave (§ 26.6),
// sensible jamais doublée et résolue sur la tonique aux voix extrêmes, septième résolue en descendant
// par degré, seconde augmentée et sauts de plus d'une octave évités.
//
// LE MODE EST L'UN DES CINQ OÙ BACH A ÉCRIT SES CHORALS : majeur, mineur, dorien, phrygien,
// mixolydien. Décision de Fabien du 2026-11-24, sur le relevé des 370 chorals de Craig Sapp : le
// lydien et le locrien n'y paraissent pas. L'accord d'un degré est celui de sa règle du 2026-11-21 :
// un degré sur deux dans la gamme du mode (`audio/triades-gamme.ts`). La sensible ajoutée bâtit
// certains degrés sur une autre gamme de la table, le mode dont un seul degré change (`TONALITES`).

import { degresDeGamme } from "./gammes";
import { ecartDansLaGamme } from "./triades-gamme";

/** Les deux modes de la tonalité, ceux où l'harmoniseur bâtit ses accords. */
export type Mode = "majeur" | "mineur";

/** Les cinq modes où se lit un choral : ceux de la tonalité, et les trois modes de chorals de Bach. */
export type ModeChoral = Mode | "dorien" | "phrygien" | "mixolydien";

/** Les cinq modes, dans l'ordre du réglage « Gamme ». */
export const MODES_CHORAL: readonly ModeChoral[] = ["majeur", "mineur", "dorien", "phrygien", "mixolydien"];

const pc = (h: number) => ((Math.round(h) % 12) + 12) % 12;

/**
 * La sensible : un demi-ton sous la tonique. Elle n'est dans un accord que si la gamme qui le bâtit
 * l'y met : toujours en majeur et dans la dominante du mineur, par la sensible ajoutée en dorien et en
 * mixolydien, jamais en phrygien.
 */
export const sensibleDe = (tonique: number) => pc(tonique + 11);

/**
 * CE QUE CHAQUE MODE BÂTIT, ET OÙ LA SENSIBLE S'AJOUTE. En mineur, la dominante et le vii° sur la
 * sensible REMPLACENT ceux du mineur naturel, décision de Fabien du 2026-11-22. En dorien et en
 * mixolydien, ils s'AJOUTENT à ceux du mode, décision du 2026-11-24 : chez Bach, le V à sensible précède
 * 51 des 85 cadences de ses chorals dorien sur la finale, et le v sans sensible tient 7,8 % des temps
 * de ses chorals mixolydiens. Le phrygien n'a pas de sensible : il ajoute l'accord majeur de sa finale,
 * sur lequel finissent les 25 fins phrygiennes de ses chorals. Chaque fois, la gamme d'emprunt est le
 * mode dont un seul degré change : le mineur mélodique est le dorien à sensible, le majeur le
 * mixolydien à sensible, le phrygien dominant le phrygien à tierce majeure.
 */
const TONALITES: Record<ModeChoral, { gamme: string; sensible?: { gamme: string; degres: readonly number[]; ajoutee: boolean } }> = {
  majeur: { gamme: "majeur" },
  mineur: { gamme: "mineur", sensible: { gamme: "mineur-harmonique", degres: [4, 6], ajoutee: false } },
  dorien: { gamme: "dorien", sensible: { gamme: "mineur-melodique", degres: [4, 6], ajoutee: true } },
  phrygien: { gamme: "phrygien", sensible: { gamme: "phrygien-dominant", degres: [0], ajoutee: true } },
  mixolydien: { gamme: "mixolydien", sensible: { gamme: "majeur", degres: [4, 6], ajoutee: true } },
};

/** La tierce de la tonique est-elle mineure dans le mode ? C'est là qu'une tierce picarde finit. */
export const tierceMineure = (mode: ModeChoral) => mode === "mineur" || mode === "dorien" || mode === "phrygien";

export interface AccordDeLaTonalite {
  /** Le degré, de 0 (I) à 6 (vii). */
  degre: number;
  racine: number;
  tierce: number;
  quinte: number;
  septieme: number;
  /** L'accord porte la sensible, un demi-ton sous la tonique. */
  sensible: boolean;
}

/** L'accord d'un degré, un degré sur deux dans les `degres` d'une gamme, sur `tonique`. */
function bati(tonique: number, degre: number, degres: readonly number[]): AccordDeLaTonalite {
  const r = degres[degre];
  const notes = [0, 2, 4, 6].map((k) => pc(tonique + r + ecartDansLaGamme(degres, r, k)));
  return {
    degre, racine: notes[0], tierce: notes[1], quinte: notes[2], septieme: notes[3],
    sensible: notes.slice(0, 3).includes(sensibleDe(tonique)),
  };
}

/**
 * Les accords du mode, classes de hauteurs : les sept de ses degrés, puis ceux que la sensible
 * ajoutée bâtit à côté d'eux, en dorien, en phrygien et en mixolydien. Le même degré peut donc y
 * paraître deux fois, le v et le V du dorien.
 */
export function accordsDeLaTonalite(tonique: number, mode: ModeChoral): AccordDeLaTonalite[] {
  const { gamme, sensible } = TONALITES[mode];
  const naturels = degresDeGamme(gamme);
  const empruntes = sensible ? degresDeGamme(sensible.gamme) : naturels;
  // Les rangs des sept degrés, et non une gamme : les degrés eux-mêmes viennent de `degresDeGamme`.
  const sept = Array.from({ length: 7 }, (_, degre) =>
    bati(tonique, degre, sensible && !sensible.ajoutee && sensible.degres.includes(degre) ? empruntes : naturels));
  return sensible?.ajoutee ? [...sept, ...sensible.degres.map((d) => bati(tonique, d, empruntes))] : sept;
}

/**
 * Les sept accords d'une gamme de la table, un degré sur deux, sans sensible ajoutée : ceux de
 * l'éolien, que le dorien et le phrygien empruntent, ne sont pas ceux du mineur, dont la dominante
 * prend la sensible.
 */
export function accordsDeLaGamme(tonique: number, gamme: string): AccordDeLaTonalite[] {
  const degres = degresDeGamme(gamme);
  return Array.from({ length: 7 }, (_, degre) => bati(tonique, degre, degres));
}

/**
 * L'AVANT-DERNIER TEMPS QUE LE MODE PERMET, devant la tonique finale : la dominante qui prend la
 * sensible ou la sous-dominante ; en phrygien, qui n'a pas de sensible, le quatrième, le septième ou
 * le deuxième degré, la mineur, ré mineur ou fa majeur avant mi, et le cinquième, le si diminué que
 * Bach écrit dans 3 de ses 26 fins phrygiennes (décision de Fabien du 2026-11-24). En majeur et en
 * mineur, la dominante porte toujours la sensible : la règle y est celle d'avant les modes. Le juge
 * en fait un avis, l'harmoniseur un coût.
 */
export const avantDernierePermise = (a: { degre: number; sensible: boolean }, mode: ModeChoral): boolean =>
  mode === "phrygien" ? a.degre === 3 || a.degre === 6 || a.degre === 1 || a.degre === 4 : (a.degre === 4 && a.sensible) || a.degre === 3;

export interface AccordLu {
  degre: number;
  racine: number;
  /** La septième de l'accord lu, sonnante ou non : celle que sa voix doit résoudre. */
  septieme: number;
  /** L'accord porte la sensible. */
  sensible: boolean;
  avecSeptieme: boolean;
  sansTierce: boolean;
  sansFondamentale: boolean;
  /** La basse porte la fondamentale. */
  etatFondamental: boolean;
}

/**
 * L'accord de la tonalité que forment des hauteurs, ou `null` si aucun ne les contient toutes.
 *
 * QUAND PLUSIEURS CONVIENNENT, le choix suit l'usage de l'analyse : l'accord qui contient sa
 * fondamentale, puis celui dont la basse est la fondamentale, puis la triade avant la septième ; à
 * égalité, l'accord du mode avant celui de la sensible ajoutée, une quinte à vide se lisant v et non V.
 */
export function lireAccord(hauteurs: readonly number[], tonique: number, mode: ModeChoral): AccordLu | null {
  if (hauteurs.length === 0) return null;
  const pcs = new Set(hauteurs.map(pc));
  const basse = pc(Math.min(...hauteurs));
  const candidats = accordsDeLaTonalite(tonique, mode)
    .filter((a) => [...pcs].every((p) => p === a.racine || p === a.tierce || p === a.quinte || p === a.septieme))
    .map((a) => ({ a, avecSeptieme: pcs.has(a.septieme), avecRacine: pcs.has(a.racine), fondamental: basse === a.racine }))
    .sort((x, y) => Number(y.avecRacine) - Number(x.avecRacine) || Number(y.fondamental) - Number(x.fondamental)
      || Number(x.avecSeptieme) - Number(y.avecSeptieme));
  const c = candidats[0];
  if (!c) return null;
  return {
    degre: c.a.degre, racine: c.a.racine, septieme: c.a.septieme, sensible: c.a.sensible, avecSeptieme: c.avecSeptieme,
    sansTierce: !pcs.has(c.a.tierce), sansFondamentale: !c.avecRacine, etatFondamental: c.fondamental,
  };
}

/** La classe d'intervalle entre deux hauteurs : 0 pour l'unisson et l'octave, 7 pour la quinte. */
const classe = (a: number, b: number) => Math.abs(Math.round(a) - Math.round(b)) % 12;
const sens = (de: number, vers: number) => Math.sign(Math.round(vers) - Math.round(de));

export type Consecutive = "quintes" | "octaves" | "quintes-contraires" | "octaves-contraires";

/**
 * Deux voix qui vont de quinte à quinte, ou d'octave (unisson compris) à octave, en bougeant toutes
 * deux. Par mouvement direct, ce sont les parallèles interdites ; par mouvement contraire, les
 * consécutives que l'usage tolère mal.
 */
export function consecutive(a1: number, a2: number, b1: number, b2: number): Consecutive | null {
  const sa = sens(a1, a2);
  const sb = sens(b1, b2);
  if (sa === 0 || sb === 0) return null;
  const i1 = classe(a1, b1);
  const i2 = classe(a2, b2);
  if (i1 !== i2 || (i1 !== 7 && i1 !== 0)) return null;
  const meme = sa === sb;
  if (i1 === 7) return meme ? "quintes" : "quintes-contraires";
  return meme ? "octaves" : "octaves-contraires";
}

/**
 * Une quinte ou une octave atteinte par mouvement direct aux voix extrêmes, le soprano procédant par
 * saut : les quintes et octaves directes, que l'usage évite.
 */
export function directe(s1: number, s2: number, b1: number, b2: number): "quinte" | "octave" | null {
  const ss = sens(s1, s2);
  if (ss === 0 || ss !== sens(b1, b2)) return null;
  const arrivee = classe(s2, b2);
  if (arrivee !== 7 && arrivee !== 0) return null;
  if (classe(s1, b1) === arrivee) return null;
  if (Math.abs(Math.round(s2) - Math.round(s1)) <= 2) return null;
  return arrivee === 7 ? "quinte" : "octave";
}

export type Saut = "plus-d-une-octave" | "seconde-augmentee" | "triton" | "septieme";

/**
 * LES SECONDES AUGMENTÉES DE CHAQUE MODE, depuis la tonique : deux degrés voisins à trois demi-tons
 * dans une gamme que le mode emploie, la sienne ou celle de sa sensible ajoutée ; un mode à tierce
 * mineure y joint le mineur harmonique, l'éolien à sensible qu'il emprunte. Cela donne en mineur la
 * sixte mineure et la sensible, comme avant ; en dorien les mêmes ; en phrygien aussi la seconde
 * mineure et la tierce majeure de la finale, que Bach n'écrit pas une fois en 6 506 pas mélodiques de
 * ses 26 fins phrygiennes (relevé du 2026-11-24) ; en majeur et en mixolydien, aucune.
 */
function secondesAugmentees(m: ModeChoral): readonly (readonly [number, number])[] {
  const { gamme, sensible } = TONALITES[m];
  const paires = new Map<string, readonly [number, number]>();
  for (const g of [gamme, ...(sensible ? [sensible.gamme] : []), ...(tierceMineure(m) ? ["mineur-harmonique"] : [])]) {
    const d = degresDeGamme(g);
    d.forEach((x, k) => {
      const y = k + 1 < d.length ? d[k + 1] : d[0] + 12;
      if (y - x === 3) paires.set(`${x} ${y}`, [x, y % 12]);
    });
  }
  return [...paires.values()];
}
const SECONDES_AUGMENTEES: Record<ModeChoral, readonly (readonly [number, number])[]> = {
  majeur: secondesAugmentees("majeur"), mineur: secondesAugmentees("mineur"), dorien: secondesAugmentees("dorien"),
  phrygien: secondesAugmentees("phrygien"), mixolydien: secondesAugmentees("mixolydien"),
};

/**
 * Ce qu'un mouvement mélodique a de fautif. La seconde augmentée : trois demi-tons entre deux degrés
 * voisins d'une gamme du mode (`SECONDES_AUGMENTEES`), qui, écrits, ne sont pas une tierce.
 */
export function sautFautif(de: number, vers: number, tonique: number, mode: ModeChoral): Saut | null {
  const d = Math.abs(Math.round(vers) - Math.round(de));
  if (d > 12) return "plus-d-une-octave";
  if (d === 3) {
    const [a, b] = [pc(de - tonique), pc(vers - tonique)];
    if (SECONDES_AUGMENTEES[mode].some(([x, y]) => (a === x && b === y) || (a === y && b === x))) return "seconde-augmentee";
  }
  if (d === 6) return "triton";
  if (d === 10 || d === 11) return "septieme";
  return null;
}
