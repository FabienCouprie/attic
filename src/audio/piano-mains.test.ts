// audio/piano-mains.test.ts — Quelle main joue chaque note : des cas dont la réponse se calcule à la main.
//
// Hauteurs : do 2 = 36, sol 2 = 43, do 3 = 48, sol 3 = 55, si 3 = 59, do 4 = 60, mi 4 = 64,
// sol 4 = 67, do 5 = 72, do 6 = 84. Une fenêtre se note [plus basse place, plus haute place] de sa
// note la plus grave ; elle couvre de là à + écart.
import { describe, expect, it } from "vitest";
import { partager, type Main, type NoteDeVoix, type ReglagesMains } from "./piano-mains";

const MAIN: ReglagesMains = { partage: "main", point: 60, ecart: 12 };
const FIXE: ReglagesMains = { ...MAIN, partage: "fixe" };

/** Une ligne d'une voix, une noire par note. */
const ligne = (voix: string, ...midis: number[]): NoteDeVoix[] =>
  midis.map((midi, i) => ({ ids: [`${voix}-${i}`], midi, debut: i, fin: i + 1, mesure: Math.floor(i / 4) + 1, nom: `m${midi}`, voix }));
/** Un accord d'une voix, attaqué à `debut`. */
const accord = (debut: number, voix: string, ...midis: number[]): NoteDeVoix[] =>
  midis.map((midi, i) => ({ ids: [`${voix}@${debut}-${i}`], midi, debut, fin: debut + 1, mesure: 1, nom: `m${midi}`, voix }));
/** La main de chaque note, dans l'ordre donné ; d pour droite, g pour gauche. */
function mains(notes: NoteDeVoix[], r: ReglagesMains = MAIN): string {
  const p = partager(notes, r);
  return notes.map((n) => (p.mains.get(n.ids[0]) as Main)[0]).join("");
}

describe("le point fixe", () => {
  it("à partir du point, la main droite ; au-dessous, la main gauche", () => {
    expect(mains(ligne("v", 59, 60), FIXE)).toBe("gd");
    expect(mains(ligne("v", 59, 60), { ...FIXE, point: 59 })).toBe("dd");
  });

  it("une mélodie qui passe sous le point change de portée", () => {
    expect(mains(ligne("v", 64, 62, 60, 59, 57, 59, 60, 62, 64, 65, 67), FIXE)).toBe("dddgggddddd");
  });

  it("un accord à cheval est coupé au point, même plus large qu'une main", () => {
    const p = partager(accord(0, "v", 60, 64, 67, 72, 76, 79, 84), FIXE);
    expect([...p.mains.values()].every((m) => m === "droite")).toBe(true);
    // Sept notes et deux octaves dans la main droite : un accord trop large, dit à la mesure 1.
    expect(p.larges).toEqual([{ notes: ["m60", "m64", "m67", "m72", "m76", "m79", "m84"], mesure: 1 }]);
  });
});

describe("par la main", () => {
  it("une mélodie qui avance par degrés reste à droite, même sous le do 4", () => {
    // À droite : le registre de si 3, la 3, si 3, 1 + 3 + 1 = 5, sans déplacement. Toute à gauche :
    // 5 + 3 + 1 + 1 + 3 + 5 + 6 + 8 = 32. Passer si 3 à gauche coûte deux changements de main.
    expect(mains(ligne("v", 64, 62, 60, 59, 57, 59, 60, 62, 64, 65, 67))).toBe("ddddddddddd");
  });

  it("une basse qui monte au-dessus du do 4 reste à gauche", () => {
    // À gauche : le registre de do 4 et ré 4, 1 + 3, et neuf demi-tons de fenêtre. À droite : 66.
    expect(mains(ligne("b", 48, 43, 48, 52, 55, 60, 62, 48))).toBe("gggggggg");
  });

  it("un saut plus grand que l'écart change de main sans frais", () => {
    // do 5, puis quatre sol 3 à une onzième : à gauche ils ne coûtent rien ; à droite, 4 × 5 de
    // registre et 5 + 5 de fenêtre.
    expect(mains(ligne("v", 72, 72, 55, 55, 55, 55, 72))).toBe("ddggggd");
  });

  it("un accord n'est pas une ligne : après le la 4 de la mélodie, l'accord ré fa♯ la 3 reste à gauche", () => {
    // Le la 3 est à une octave du la 4 qui le précède dans la même voix ; à droite, il coûterait 3 de
    // registre, à gauche rien. Un changement de main ne se compte qu'entre deux notes seules.
    const notes = [
      { ids: ["la4"], midi: 69, debut: 0, fin: 1, mesure: 1, nom: "A4", voix: "v" },
      ...accord(1, "v", 50, 54, 57),
    ];
    expect(mains(notes)).toBe("dggg");
  });

  it("un accord après une ligne n'en est pas la suite : mi ré do 4 à droite, puis l'accord ré fa♯ la 3 à gauche", () => {
    // Le ré 3, la plus grave de l'accord, est à une septième du do 4. Compté comme une suite de la ligne,
    // le passer à gauche coûterait 24 ; à droite, l'accord coûte 10 + 6 + 3 de registre et 2 de fenêtre.
    const notes = [...ligne("v", 64, 62, 60), ...accord(3, "v", 50, 54, 57)];
    expect(mains(notes)).toBe("dddggg");
  });

  it("une note seule après un accord n'est la suite de rien : do mi sol 4 à droite, puis la 3 à gauche", () => {
    // Liée au do 4 de l'accord, à une tierce, le la 3 resterait à droite pour 3 de registre.
    const notes = [...accord(0, "v", 60, 64, 67), { ids: ["la3"], midi: 57, debut: 1, fin: 2, mesure: 1, nom: "A3", voix: "v" }];
    expect(mains(notes)).toBe("dddg");
  });

  it("un accord plus large qu'une main se partage là où chaque main le tient", () => {
    // Seuil 3 : do 4 mi 4 sol 4 à gauche, quinte, registre 1 + 5 + 8 ; do 5 à do 6 à droite, une octave.
    // Seuil 4 tient aussi, mais do 5 à gauche ajoute 13 de registre ; seuil 2 laisse une dix-septième.
    const notes = accord(0, "v", 60, 64, 67, 72, 76, 79, 84);
    expect(mains(notes)).toBe("gggdddd");
    expect(partager(notes, MAIN).larges).toEqual([]);
  });

  it("dix notes, cinq par main, chaque main dans une octave", () => {
    expect(mains(accord(0, "v", 36, 40, 43, 46, 48, 60, 64, 67, 70, 72))).toBe("gggggddddd");
  });

  it("onze notes : aucun partage ne les tient, l'accord est gravé et dit", () => {
    const p = partager(accord(0, "v", 36, 40, 43, 46, 48, 60, 64, 67, 70, 72, 74), MAIN);
    expect(p.mains.size).toBe(11);
    expect(p.larges).toHaveLength(1);
    expect(p.larges[0].mesure).toBe(1);
  });

  it("une note tenue compte dans sa main", () => {
    // Do 2 tenu à gauche, do 6 à droite ; puis si 3, d'une autre voix. À gauche, il ferait une main de
    // vingt-trois demi-tons ; à droite, il coûte 13 de fenêtre et 1 de registre.
    const notes: NoteDeVoix[] = [
      { ids: ["basse"], midi: 36, debut: 0, fin: 4, mesure: 1, nom: "C2", voix: "2/1" },
      { ids: ["haut"], midi: 84, debut: 0, fin: 1, mesure: 1, nom: "C6", voix: "1/1" },
      { ids: ["milieu"], midi: 59, debut: 1, fin: 2, mesure: 1, nom: "B3", voix: "3/1" },
    ];
    expect(mains(notes)).toBe("gdd");
  });

  it("un choral : soprano et alto à droite, ténor et basse à gauche", () => {
    const choral = [
      ...ligne("1/1", 64, 65, 67), ...ligne("2/1", 60, 62, 64), ...ligne("3/1", 55, 57, 59), ...ligne("4/1", 48, 50, 52),
    ];
    expect(mains(choral)).toBe("dddddd" + "gggggg");
  });

  it("une note et ses suites liées prennent la même main", () => {
    const p = partager([{ ids: ["tete", "suite"], midi: 55, debut: 0, fin: 4, mesure: 1, nom: "G3", voix: "v" }], MAIN);
    expect(p.mains.get("tete")).toBe("gauche");
    expect(p.mains.get("suite")).toBe("gauche");
  });

  it("une note hors du clavier garde sa main, et est dite", () => {
    const p = partager(ligne("v", 20, 109), MAIN);
    expect(p.horsClavier).toEqual([{ nom: "m20", mesure: 1 }, { nom: "m109", mesure: 1 }]);
    expect(p.mains.get("v-0")).toBe("gauche");
    expect(p.mains.get("v-1")).toBe("droite");
  });
});
