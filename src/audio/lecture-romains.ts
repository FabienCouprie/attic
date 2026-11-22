// audio/lecture-romains.ts — Les chiffres romains, lus selon l'usage : la casse dit la qualité.
//
// LA REVUE DES NOTATIONS EN TEXTE, sixième format, 2026-11-22. Les chiffres passaient par Tonal, et
// quatre lectures s'écartaient de l'usage : « ii7 » rendait D7, une septième de dominante ; en mineur,
// « vii° » descendait avec VII, G° au lieu de G#° en la ; « I6 » rendait la sixte ajoutée, « I64 » et
// « V65 » des symboles illisibles ; « V/V » n'était pas lu. Décisions de Fabien du 2026-11-22 : la
// sensible en mineur, les renversements classiques, les dominantes secondaires lues.
//
// CE QUI EST LU, et dans cet ordre :
//   - une altération, b ou #, qui déplace le degré de la gamme majeure, et qu'aucun mode ne déplace
//     une seconde fois ;
//   - le degré, I à VII : en majuscules un accord majeur, en minuscules un mineur ;
//   - une qualité : ° diminué, ø demi-diminué, + augmenté ;
//   - un chiffre de renversement : 6 et 64 pour une triade, 7, 65, 43 et 42 (ou 2) pour une septième.
//     La septième d'un accord majeur est de dominante, celle d'un mineur est mineure, celle d'un
//     diminué est diminuée ;
//   - ou bien un suffixe de symbole, « maj7 », « 9 », « sus4 », « add9 », « 7b9 », que le lecteur des
//     symboles doit savoir lire ; « add6 » est la sixte ajoutée, puisque 6 est un renversement ;
//   - enfin « /Y », l'accord bâti sur le degré Y comme sur une tonique, majeure si Y est en
//     majuscules, mineure sinon : V/V, V7/IV, vii°/V.
//
// EN MINEUR, III, VI et VII descendent d'un demi-ton, la gamme étant la mineure naturelle, sauf le
// vii diminué ou demi-diminué : c'est l'accord de la sensible, qui reste un demi-ton sous la tonique.

import { Note } from "tonal";
import { accordDuSymbole } from "./symboles-accords";

export type ModeRomain = "majeur" | "mineur";

const CHIFFRE = /^([b#♭♯]*)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/]*)$/;
const CLASSIQUE = /^(°|o|ø|\+)?(64|65|43|42|2|6|7)?$/;
const DEGRES = ["I", "II", "III", "IV", "V", "VI", "VII"];
/** Le degré dont l'intervalle est juste, et non majeur : I, IV et V. */
const JUSTES = new Set([0, 3, 4]);

/** L'intervalle depuis la tonique d'un degré déplacé de `decalage` demi-tons, « 3m », « 4A ». */
function intervalleDuDegre(degre: number, decalage: number): string | null {
  const qualites = JUSTES.has(degre) ? { [-1]: "d", 0: "P", 1: "A" } : { [-2]: "d", [-1]: "m", 0: "M", 1: "A" };
  const q = (qualites as Record<number, string>)[decalage];
  return q ? `${degre + 1}${q}` : null;
}

/** La fondamentale d'un chiffre, ou null. */
function fondamentale(alteration: string, numeral: string, tonique: string, mode: ModeRomain, sensible: boolean): string | null {
  const degre = DEGRES.indexOf(numeral.toUpperCase());
  const explicite = [...alteration].reduce((s, a) => s + (a === "b" || a === "♭" ? -1 : 1), 0);
  const mineure = mode === "mineur" && [2, 5, 6].includes(degre) && !(degre === 6 && sensible) ? -1 : 0;
  const intervalle = intervalleDuDegre(degre, alteration ? explicite : mineure);
  if (!intervalle) return null;
  const n = Note.transpose(tonique, intervalle);
  return n ? Note.pitchClass(n) : null;
}

/** Le symbole d'un chiffre romain dans une tonalité, « Dm7 », « G7/B », « D », ou null s'il ne se lit pas. */
export function lireChiffreRomain(texte: string, tonique: string, mode: ModeRomain = "majeur"): string | null {
  const [chiffre, cible, ...reste] = texte.trim().split("/");
  if (reste.length > 0 || !chiffre) return null;
  if (cible !== undefined) {
    // L'accord sur le degré Y, pris pour tonique : majeure si Y est en majuscules, mineure sinon.
    const y = CHIFFRE.exec(cible);
    if (!y || !CLASSIQUE.test(y[3]) || /\d/.test(y[3])) return null;
    const racineY = fondamentale(y[1], y[2], tonique, mode, /[°oø]/.test(y[3]));
    if (!racineY) return null;
    const modeY: ModeRomain = y[2] === y[2].toUpperCase() && !/[°oø]/.test(y[3]) ? "majeur" : "mineur";
    return lireChiffreRomain(chiffre, racineY, modeY);
  }
  const m = CHIFFRE.exec(chiffre);
  if (!m) return null;
  const [, alteration, numeral, suffixe] = m;
  const mineur = numeral === numeral.toLowerCase();
  const c = CLASSIQUE.exec(suffixe);
  if (!c) {
    // UN SUFFIXE DE SYMBOLE, que le lecteur des symboles doit savoir lire.
    const racine = fondamentale(alteration, numeral, tonique, mode, false);
    if (!racine) return null;
    const symbole = `${racine}${mineur ? "m" : ""}${suffixe.replace(/^add6$/, "6")}`;
    return accordDuSymbole(symbole) ? symbole : null;
  }
  const [, marque, chiffreRenv] = c;
  const qualite = marque === "°" || marque === "o" ? "dim" : marque === "ø" ? "demi" : marque === "+" ? "aug" : mineur ? "min" : "maj";
  const racine = fondamentale(alteration, numeral, tonique, mode, qualite === "dim" || qualite === "demi");
  if (!racine) return null;
  const septieme = qualite === "demi" || ["7", "65", "43", "42", "2"].includes(chiffreRenv ?? "");
  const SUFFIXES = {
    maj: ["", "7"], min: ["m", "m7"], dim: ["°", "°7"], demi: ["ø7", "ø7"], aug: ["+", "7#5"],
  } as const;
  const TIERCE = { maj: "3M", min: "3m", dim: "3m", demi: "3m", aug: "3M" } as const;
  const QUINTE = { maj: "5P", min: "5P", dim: "5d", demi: "5d", aug: "5A" } as const;
  const SEPTIEME = { maj: "7m", min: "7m", dim: "7d", demi: "7m", aug: "7m" } as const;
  const basse = { 6: TIERCE, 65: TIERCE, 64: QUINTE, 43: QUINTE, 42: SEPTIEME, 2: SEPTIEME } as Record<string, Record<string, string>>;
  const symbole = `${racine}${SUFFIXES[qualite][septieme ? 1 : 0]}`;
  const intervalle = chiffreRenv ? basse[chiffreRenv]?.[qualite] : undefined;
  return intervalle ? `${symbole}/${Note.pitchClass(Note.transpose(racine, intervalle))}` : symbole;
}

/** Vrai quand le texte est un chiffre romain que la lecture sait lire. */
export const estChiffreRomain = (texte: string): boolean => lireChiffreRomain(texte, "C") !== null;
