// audio/nom-note.test.ts — Le nom d'une hauteur, et l'altération dans laquelle il s'écrit.
//
// CE QUE CES CAS TIENNENT. D'abord que rien de ce qui existait ne bouge : le dièse reste le défaut,
// et tout ce qui nommait des notes avant continue de les nommer pareil. Ensuite que le bémol donne
// la graphie que Fabien a relevée comme manquante : « le trajet écrit D#4 F#4 A#4 pour un accord de
// MI BÉMOL mineur septième ». Enfin que les noms bémolisés SE RELISENT, parce que deux composants
// rendent une notation qu'un convertisseur de texte en MIDI reprend.
import { describe, expect, it } from "vitest";
import { nomNote, nomNoteRond } from "./nom-note";
import { CLES, alterationDe } from "./cles";

describe("le nom d'une hauteur", () => {
  it("EST EN DIÈSES PAR DÉFAUT, et rien de ce qui existait ne bouge", () => {
    expect(nomNoteRond(60)).toBe("C4");
    expect(nomNoteRond(63)).toBe("D#4");
    expect(nomNoteRond(70)).toBe("A#4");
    expect(nomNote(61.5)).toBe("D4−50");
  });

  it("SE BÉMOLISE À LA DEMANDE, sur les cinq touches qui portent une altération", () => {
    expect(nomNoteRond(61, "bemol")).toBe("Db4");
    expect(nomNoteRond(63, "bemol")).toBe("Eb4");
    expect(nomNoteRond(66, "bemol")).toBe("Gb4");
    expect(nomNoteRond(68, "bemol")).toBe("Ab4");
    expect(nomNoteRond(70, "bemol")).toBe("Bb4");
  });

  it("ET LES SEPT TOUCHES BLANCHES S'ÉCRIVENT PAREIL DANS LES DEUX", () => {
    for (const n of [60, 62, 64, 65, 67, 69, 71]) {
      expect(nomNoteRond(n, "bemol"), String(n)).toBe(nomNoteRond(n, "diese"));
    }
  });

  it("L'ÉCART EN CENTS SURVIT À L'ALTÉRATION", () => {
    expect(nomNote(62.5, "bemol")).toBe("Eb4−50");
    expect(nomNote(62.5, "diese")).toBe("D#4−50");
    expect(nomNote(60, "bemol")).toBe("C4");
  });

  it("LES DEUX GRAPHIES DÉSIGNENT LA MÊME TOUCHE, sur les cent vingt-huit notes", () => {
    // C'est ce qui fait qu'aucune des deux n'est fausse : elles nomment, elles ne transposent pas.
    const versMidi = (nom: string) => {
      const m = /^([A-G])([#b]?)(-?\d+)$/.exec(nom)!;
      const demi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as "C"]!;
      return (parseInt(m[3], 10) + 1) * 12 + demi + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    };
    for (let n = 0; n <= 127; n++) {
      expect(versMidi(nomNoteRond(n, "diese")), `dièse sur ${n}`).toBe(n);
      expect(versMidi(nomNoteRond(n, "bemol")), `bémol sur ${n}`).toBe(n);
    }
  });

  it("UN NOM BÉMOLISÉ SE RELIT, ce dont dépendent deux sorties « Notation »", () => {
    // Le convertisseur de texte en MIDI n'accepte qu'une lettre, une altération et un chiffre.
    for (let n = 0; n <= 127; n++) {
      expect(/^[A-G][#b]?-?\d+$/.test(nomNoteRond(n, "bemol")), String(n)).toBe(true);
    }
  });
});

describe("l'altération d'une tonalité", () => {
  it("SUIT LA GRAPHIE DE SA PROPRE FONDAMENTALE", () => {
    // Une clé dont le nom porte un bémol s'écrit en bémols, une clé à dièse en dièses.
    for (const c of CLES) {
      if (c.en.includes("b")) expect(c.alteration, c.en).toBe("bemol");
      if (c.en.includes("#")) expect(c.alteration, c.en).toBe("diese");
    }
  });

  it("SAUF FA, DONT LE NOM NE DIT PAS L'ALTÉRATION : fa majeur porte un si bémol", () => {
    expect(alterationDe(5)).toBe("bemol");
    expect(nomNoteRond(70, alterationDe(5))).toBe("Bb4");
  });

  it("RÉSOUT LE CAS QUE FABIEN A RELEVÉ : un mi bémol mineur septième s'écrit en bémols", () => {
    const mib = alterationDe(3);
    expect([63, 66, 70, 73].map((n) => nomNoteRond(n, mib))).toEqual(["Eb4", "Gb4", "Bb4", "Db5"]);
    // Et un do majeur reste en dièses, chacun dans sa tonalité.
    expect([60, 64, 67].map((n) => nomNoteRond(n, alterationDe(0)))).toEqual(["C4", "E4", "G4"]);
  });

  it("chaque tonalité en déclare une, et un demi-ton hors des douze se ramène dedans", () => {
    expect(CLES.length).toBe(12);
    for (const c of CLES) expect(["diese", "bemol"]).toContain(c.alteration);
    expect(alterationDe(15)).toBe(alterationDe(3));
    expect(alterationDe(-9)).toBe(alterationDe(3));
  });
});
