// vues-domaine/clavier-frappe.test.ts — Le clavier de l'ordinateur joue des POSITIONS.
//
// CE QUE CES CAS TIENNENT. La table des touches jouables était écrite en caractères et lue sur
// `e.key` : elle désignait donc des touches par ce que la DISPOSITION ACTIVE imprime dessus. Sur un
// clavier français, mesuré dans l'application, la rangée du bas ne jouait plus que cinq blanches sur
// sept, le do se retrouvait deux rangées plus haut et le si au milieu des noires.
//
// LE CAS QUI AURAIT ATTRAPÉ LE DÉFAUT est celui qui donne les caractères de la disposition française
// là où l'on attend des positions : aucun ne doit jouer quoi que ce soit. Un retour au caractère le
// fait tomber, et c'est la seule forme sous laquelle ce défaut se mesure hors d'un vrai clavier.
import { describe, expect, it } from "vitest";

import {
  OCTAVE_MAX, OCTAVE_MIN, POSITIONS_BLANCHES, POSITIONS_NOIRES,
  noteDeLaFrappe, octaveDeplacee, pasDOctave, tableDeFrappe,
} from "./clavier-frappe";

/**
 * Ce que `navigator.keyboard.getLayoutMap()` a rendu sur le poste, le 2026-10-24 : la disposition
 * française, relevée et non supposée. C'est la mesure qui a ouvert ce lot, gardée ici comme donnée.
 */
const FRANCAIS: Record<string, string> = {
  KeyQ: "a", KeyW: "z", KeyA: "q", KeyZ: "w", KeyM: ",",
  KeyX: "x", KeyC: "c", KeyV: "v", KeyB: "b", KeyN: "n",
  KeyS: "s", KeyD: "d", KeyF: "f", KeyG: "g", KeyH: "h", KeyJ: "j",
};

describe("le clavier de frappe désigne des positions, non des caractères", () => {
  it("la rangée du bas donne les sept blanches d'une octave, le do en premier", () => {
    const notes = POSITIONS_BLANCHES.map((code) => noteDeLaFrappe(code, 4));
    expect(notes).toEqual([48, 50, 52, 53, 55, 57, 59]);
  });

  it("la rangée du milieu donne les cinq noires, avec le trou du piano entre ré dièse et fa dièse", () => {
    const notes = POSITIONS_NOIRES.map((code) => noteDeLaFrappe(code, 4));
    expect(notes).toEqual([49, 51, 54, 56, 58]);
    // `KeyF` est le trou : sur un piano, il n'y a pas de noire entre mi et fa.
    expect(noteDeLaFrappe("KeyF", 4)).toBeNull();
  });

  it("les douze touches couvrent l'octave entière, sans doublon ni trou", () => {
    const table = tableDeFrappe(4);
    expect(table.size).toBe(12);
    const degres = [...table.values()].map((n) => n - 48).sort((a, b) => a - b);
    expect(degres).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  // ─── Le cas qui aurait attrapé le défaut ───
  it("aucun caractère de la disposition française ne joue de note", () => {
    const joues = Object.values(FRANCAIS)
      .map((caractere) => [caractere, noteDeLaFrappe(caractere, 4)] as const)
      .filter(([, note]) => note !== null);
    expect(joues).toEqual([]);
  });

  it("la rangée du bas se lit « w x c v b n , » sur un clavier français, et joue quand même la gamme", () => {
    // Ce que l'utilisateur VOIT sur les sept touches, d'après la disposition relevée…
    expect(POSITIONS_BLANCHES.map((c) => FRANCAIS[c]).join(" ")).toBe("w x c v b n ,");
    // …et ce qu'elles JOUENT, qui n'en dépend pas : do ré mi fa sol la si.
    expect(POSITIONS_BLANCHES.map((c) => noteDeLaFrappe(c, 4)! % 12)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it("une touche hors des deux rangées ne joue rien, et un code vide non plus", () => {
    for (const code of ["KeyW", "KeyA", "KeyE", "KeyK", "Space", ""]) {
      expect(noteDeLaFrappe(code, 4)).toBeNull();
    }
  });

  it("l'octave se déplace d'un cran et se borne aux deux extrêmes", () => {
    expect(octaveDeplacee(4, 1)).toBe(5);
    expect(octaveDeplacee(4, -1)).toBe(3);
    expect(octaveDeplacee(OCTAVE_MAX, 1)).toBe(OCTAVE_MAX);
    expect(octaveDeplacee(OCTAVE_MIN, -1)).toBe(OCTAVE_MIN);
    expect(noteDeLaFrappe("KeyZ", OCTAVE_MIN)).toBe(24);
    expect(noteDeLaFrappe("KeyZ", OCTAVE_MAX)).toBe(84);
  });

  it("les signes d'octave se lisent au caractère, les flèches comprises", () => {
    expect(pasDOctave("ArrowUp")).toBe(1);
    expect(pasDOctave("=")).toBe(1);
    expect(pasDOctave("+")).toBe(1);
    expect(pasDOctave("ArrowDown")).toBe(-1);
    expect(pasDOctave("-")).toBe(-1);
    expect(pasDOctave("x")).toBe(0);
  });
});
