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
// LA TONALITÉ EST MAJEURE OU MINEURE, et en mineur la dominante prend la sensible : V, V7 et vii° sont
// bâtis sur le mineur harmonique, les autres degrés sur le mineur naturel. Décision de Fabien du
// 2026-11-22, à l'image de sa lecture des chiffres romains (« vii° sur la sensible en mineur »).
// Partout ailleurs, l'accord d'un degré est celui de sa règle du 2026-11-21 : un degré sur deux dans
// la gamme (`audio/triades-gamme.ts`).

import { degresDeGamme } from "./gammes";
import { ecartDansLaGamme } from "./triades-gamme";

export type Mode = "majeur" | "mineur";

const pc = (h: number) => ((Math.round(h) % 12) + 12) % 12;

/** La sensible : un demi-ton sous la tonique, en majeur comme en mineur. */
export const sensibleDe = (tonique: number) => pc(tonique + 11);

export interface AccordDeLaTonalite {
  /** Le degré, de 0 (I) à 6 (vii). */
  degre: number;
  racine: number;
  tierce: number;
  quinte: number;
  septieme: number;
}

/** Les sept accords de la tonalité, classes de hauteurs, la dominante prenant la sensible en mineur. */
export function accordsDeLaTonalite(tonique: number, mode: Mode): AccordDeLaTonalite[] {
  const naturels = degresDeGamme(mode);
  const harmonique = degresDeGamme("mineur-harmonique");
  // Les rangs des sept degrés, et non une gamme : les degrés eux-mêmes viennent de `degresDeGamme`.
  return Array.from({ length: 7 }, (_, degre) => {
    const degres = mode === "mineur" && (degre === 4 || degre === 6) ? harmonique : naturels;
    const r = degres[degre];
    return {
      degre,
      racine: pc(tonique + r),
      tierce: pc(tonique + r + ecartDansLaGamme(degres, r, 2)),
      quinte: pc(tonique + r + ecartDansLaGamme(degres, r, 4)),
      septieme: pc(tonique + r + ecartDansLaGamme(degres, r, 6)),
    };
  });
}

export interface AccordLu {
  degre: number;
  racine: number;
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
 * fondamentale, puis celui dont la basse est la fondamentale, puis la triade avant la septième.
 */
export function lireAccord(hauteurs: readonly number[], tonique: number, mode: Mode): AccordLu | null {
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
    degre: c.a.degre, racine: c.a.racine, avecSeptieme: c.avecSeptieme,
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
 * Ce qu'un mouvement mélodique a de fautif. La seconde augmentée se reconnaît en mineur entre le
 * sixième degré naturel et la sensible : trois demi-tons qui, écrits, ne sont pas une tierce.
 */
export function sautFautif(de: number, vers: number, tonique: number, mode: Mode): Saut | null {
  const d = Math.abs(Math.round(vers) - Math.round(de));
  if (d > 12) return "plus-d-une-octave";
  if (mode === "mineur" && d === 3) {
    const paire = new Set([pc(de), pc(vers)]);
    if (paire.has(pc(tonique + 8)) && paire.has(sensibleDe(tonique))) return "seconde-augmentee";
  }
  if (d === 6) return "triton";
  if (d === 10 || d === 11) return "septieme";
  return null;
}
