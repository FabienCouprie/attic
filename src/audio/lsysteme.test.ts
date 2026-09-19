// audio/lsysteme.test.ts — Une grammaire qui se réécrit, vérifiée sur les systèmes publiés.
//
// Les L-systèmes classiques ont des développements connus : les algues de Lindenmayer
// donnent des mots dont les longueurs sont la suite de Fibonacci, et le flocon de Koch
// quadruple sa longueur à chaque tour. Ces tests vérifient ces faits-là, et non ce que le
// code produit — puis ils tiennent l'interprétation musicale : la gamme est respectée, et
// une broderie entre crochets rend la ligne intacte en sortant.
import { describe, expect, it } from "vitest";
import { EXEMPLES, LONGUEUR_MAX, interpreter, lireRegles, reecrire } from "./lsysteme";

const regles = (s: string) => lireRegles(s);
const MAJEUR = [0, 2, 4, 5, 7, 9, 11];
const CONFIG = { degres: MAJEUR, depart: 60, dureePas: 0.25, velocite: 90, noteMin: 21, noteMax: 108 };

describe("lecture des règles", () => {
  it("lit « A=AB, B=A » comme deux règles", () => {
    expect(regles("A=AB, B=A")).toEqual([{ de: "A", vers: "AB" }, { de: "B", vers: "A" }]);
  });

  it("accepte une règle par ligne, et tolère les espaces", () => {
    expect(regles(" F = F+F \n X=FX ")).toEqual([{ de: "F", vers: "F+F" }, { de: "X", vers: "FX" }]);
  });

  it("ignore ce qui n'est pas une règle plutôt que de planter", () => {
    expect(regles("n'importe quoi")).toEqual([]);
    expect(regles("AB=C")).toEqual([]); // le membre gauche doit être une seule lettre
    expect(regles("")).toEqual([]);
  });
});

describe("réécriture", () => {
  it("développe les algues de Lindenmayer comme le livre les donne", () => {
    const r = regles("A=AB, B=A");
    expect(reecrire("A", r, 0)).toBe("A");
    expect(reecrire("A", r, 1)).toBe("AB");
    expect(reecrire("A", r, 2)).toBe("ABA");
    expect(reecrire("A", r, 3)).toBe("ABAAB");
    expect(reecrire("A", r, 4)).toBe("ABAABABA");
  });

  it("dont les longueurs sont la suite de Fibonacci — c'est l'exemple historique", () => {
    const r = regles("A=AB, B=A");
    const longueurs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => reecrire("A", r, i).length);
    expect(longueurs).toEqual([1, 2, 3, 5, 8, 13, 21, 34]);
  });

  it("quadruple le flocon de Koch à chaque tour", () => {
    const r = regles("F=F+F-F-F+F");
    expect(reecrire("F", r, 1)).toBe("F+F-F-F+F");
    // Chaque F devient neuf caractères — cinq F et quatre signes — et les signes ne
    // bougent plus : 1 F donne 9, puis 5×9 + 4 = 49, puis 25×9 + 24 = 249.
    expect([1, 2, 3].map((i) => reecrire("F", r, i).length)).toEqual([9, 49, 249]);
  });

  it("laisse intacte une lettre sans règle", () => {
    expect(reecrire("F+X", regles("F=FF"), 1)).toBe("FF+X");
  });

  it("rend l'axiome tel quel quand on ne demande aucun tour", () => {
    expect(reecrire("FX", regles("X=FX"), 0)).toBe("FX");
    expect(reecrire("FX", [], 5)).toBe("FX");
  });

  it("s'arrête avant l'explosion : une règle qui double n'engendre pas un million de notes", () => {
    const mot = reecrire("F", regles("F=FFF"), 20);
    expect(mot.length).toBeLessThanOrEqual(LONGUEUR_MAX);
  });

  it("propose des grammaires d'exemple qui se développent toutes", () => {
    for (const e of EXEMPLES) {
      const mot = reecrire(e.axiome, regles(e.regles), 3);
      expect(mot.length, e.id).toBeGreaterThan(e.axiome.length);
    }
  });
});

describe("interprétation musicale", () => {
  it("joue une note par lettre, en avançant du pas demandé", () => {
    const notes = interpreter("FFF", CONFIG);
    expect(notes.length).toBe(3);
    expect(notes.map((n) => +n.debut.toFixed(3))).toEqual([0, 0.25, 0.5]);
    expect(notes.every((n) => n.note === 60)).toBe(true);
  });

  it("monte et descend par DEGRÉ de la gamme, jamais par demi-ton", () => {
    // En do majeur : do, ré, mi — et non do, do dièse, ré.
    expect(interpreter("F+F+F", CONFIG).map((n) => n.note)).toEqual([60, 62, 64]);
    expect(interpreter("F-F", CONFIG).map((n) => n.note)).toEqual([60, 59]);
  });

  it("passe à l'octave quand les degrés sont épuisés", () => {
    const notes = interpreter("F+++++++F", CONFIG).map((n) => n.note);
    expect(notes[1]).toBe(72); // sept degrés plus haut : l'octave
  });

  it("rend la ligne intacte au sortir d'une broderie", () => {
    // Les crochets montent, jouent, puis rendent la hauteur d'avant.
    const notes = interpreter("F[+F+F]F", CONFIG).map((n) => n.note);
    expect(notes).toEqual([60, 62, 64, 60]);
  });

  it("joue la broderie plus doucement que la ligne", () => {
    const notes = interpreter("F[F]F", CONFIG);
    expect(notes[1].velocite).toBeLessThan(notes[0].velocite);
    expect(notes[2].velocite).toBe(notes[0].velocite);
  });

  it("allonge et raccourcit la durée du pas", () => {
    const longues = interpreter(">FF", CONFIG);
    expect(longues[1].debut).toBeCloseTo(0.5, 3);
    const courtes = interpreter("<FF", CONFIG);
    expect(courtes[1].debut).toBeCloseTo(0.125, 3);
  });

  it("laisse un trou pour un point, sans y placer de note", () => {
    const notes = interpreter("F.F", CONFIG);
    expect(notes.length).toBe(2);
    expect(notes[1].debut).toBeCloseTo(0.5, 3);
  });

  it("ne sort jamais des bornes du clavier", () => {
    const notes = interpreter("F" + "+".repeat(200) + "F", { ...CONFIG, noteMin: 21, noteMax: 108 });
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(21);
      expect(n.note).toBeLessThanOrEqual(108);
    }
  });

  it("supporte un crochet fermant orphelin plutôt que de perdre l'état", () => {
    expect(() => interpreter("F]F", CONFIG)).not.toThrow();
    expect(interpreter("F]F", CONFIG).length).toBe(2);
  });

  it("donne la même musique deux fois : rien n'est aléatoire ici", () => {
    const mot = reecrire("X", regles(EXEMPLES[3].regles), 3);
    const a = interpreter(mot, CONFIG), b = interpreter(mot, CONFIG);
    expect(a).toEqual(b);
  });
});
