// audio/euclidien.test.ts — Les rythmes euclidiens, comparés à ceux que Toussaint publie.
//
// L'intérêt de ces motifs n'est pas qu'ils soient réguliers : c'est qu'ils coïncident avec
// des rythmes traditionnels attestés. Le tresillo cubain EST E(3,8), le bembé d'Afrique de
// l'Ouest EST E(7,12). Un algorithme qui produirait d'autres motifs « bien répartis »
// n'aurait pas d'intérêt musical, et ces tests le vérifient donc contre la table publiée
// dans « The Euclidean Algorithm Generates Traditional Musical Rhythms » (Toussaint,
// 2005), et non contre ce que le code produit.
import { describe, expect, it } from "vitest";
import {
  dureeEuclidienne, motifEnTexte, motifEuclidien, nomTraditionnel, notesEuclidiennes, tourner,
} from "./euclidien";

const texte = (pas: number, frappes: number) => motifEnTexte(motifEuclidien(pas, frappes));

describe("motifs publiés par Toussaint", () => {
  it("rend les rythmes traditionnels attestés", () => {
    expect(texte(4, 2)).toBe("x.x.");
    expect(texte(5, 2)).toBe("x.x..");        // khafif-e-ramal
    expect(texte(4, 3)).toBe("x.xx");         // cumbia, calypso
    expect(texte(8, 3)).toBe("x..x..x.");     // tresillo cubain
    expect(texte(8, 5)).toBe("x.xx.xx.");     // cinquillo cubain
    expect(texte(9, 4)).toBe("x.x.x.x..");    // aksak turc
    expect(texte(12, 5)).toBe("x..x.x..x.x."); // venda
    expect(texte(16, 5)).toBe("x..x..x..x..x..."); // bossa-nova
  });

  it("rend le bembé, sur lequel bien des implémentations se trompent", () => {
    expect(texte(12, 7)).toBe("x.xx.x.xx.x.");
  });

  it("donne leur nom aux couples reconnus, et rien aux autres", () => {
    expect(nomTraditionnel(8, 3)).toMatch(/[Tt]resillo/);
    expect(nomTraditionnel(12, 7)).toMatch(/[Bb]embé/);
    expect(nomTraditionnel(11, 4)).toBeUndefined();
  });
});

describe("propriétés du motif", () => {
  it("place exactement le nombre de frappes demandé", () => {
    for (let pas = 1; pas <= 32; pas++) {
      for (let k = 0; k <= pas; k++) {
        const m = motifEuclidien(pas, k);
        expect(m.length, `E(${k},${pas}) longueur`).toBe(pas);
        expect(m.filter(Boolean).length, `E(${k},${pas}) frappes`).toBe(k);
      }
    }
  });

  it("commence par une frappe dès qu'il y en a une — forme canonique", () => {
    for (let pas = 1; pas <= 24; pas++) {
      for (let k = 1; k <= pas; k++) {
        expect(motifEuclidien(pas, k)[0], `E(${k},${pas})`).toBe(true);
      }
    }
  });

  it("répartit sans jamais laisser deux silences d'écart quand c'est possible", () => {
    // E(4,8) est un cas où la répartition est parfaite : un pas sur deux.
    expect(texte(8, 4)).toBe("x.x.x.x.");
    expect(texte(16, 8)).toBe("x.x.x.x.x.x.x.x.");
  });

  it("gère les extrêmes sans broncher", () => {
    expect(motifEuclidien(0, 3)).toEqual([]);
    expect(texte(8, 0)).toBe("........");
    expect(texte(8, 8)).toBe("xxxxxxxx");
    // Plus de frappes que de pas : on n'en met pas davantage que de places.
    expect(motifEuclidien(4, 9).filter(Boolean).length).toBe(4);
  });
});

describe("rotation", () => {
  it("déplace le départ sans changer le nombre de frappes", () => {
    const base = motifEuclidien(8, 3);
    for (let r = 0; r < 8; r++) {
      const tourne = motifEuclidien(8, 3, r);
      expect(tourne.filter(Boolean).length).toBe(3);
      expect(motifEnTexte(tourne)).toBe(motifEnTexte(tourner(base, r)));
    }
  });

  it("revient sur lui-même après un tour complet, et accepte les valeurs négatives", () => {
    expect(motifEnTexte(motifEuclidien(8, 3, 8))).toBe(texte(8, 3));
    expect(motifEnTexte(motifEuclidien(8, 3, -1))).toBe(motifEnTexte(motifEuclidien(8, 3, 7)));
  });

  it("donne le second visage du tresillo, celui qui commence sur le contretemps", () => {
    expect(motifEnTexte(motifEuclidien(8, 3, 3))).toBe("x..x.x..");
  });
});

describe("notes engendrées", () => {
  const base = {
    pas: 8, frappes: 3, rotation: 0, tempo: 120, pasParNoire: 0.5,
    repetitions: 2, notePercussion: 36, velocite: 90, accent: 20,
  };

  it("en produit une par frappe, répétitions comprises, sur le canal de percussion", () => {
    const notes = notesEuclidiennes(base);
    expect(notes.length).toBe(3 * 2);
    expect(notes.every((n) => n.canal === 9 && n.note === 36)).toBe(true);
  });

  it("les place sur la grille du tempo", () => {
    const notes = notesEuclidiennes(base);
    const dureePas = (60 / 120) * 0.5; // 0,25 s
    expect(notes[0].debut).toBeCloseTo(0, 6);
    expect(notes[1].debut).toBeCloseTo(3 * dureePas, 6);
    expect(notes[2].debut).toBeCloseTo(6 * dureePas, 6);
    // La répétition suivante commence après les huit pas.
    expect(notes[3].debut).toBeCloseTo(8 * dureePas, 6);
  });

  it("accentue le premier pas de chaque répétition, et lui seul", () => {
    const notes = notesEuclidiennes(base);
    expect(notes[0].velocite).toBe(110);
    expect(notes[1].velocite).toBe(90);
    expect(notes[3].velocite).toBe(110);
  });

  it("ne laisse jamais une vélocité sortir de la plage MIDI", () => {
    const fort = notesEuclidiennes({ ...base, velocite: 120, accent: 60 });
    expect(Math.max(...fort.map((n) => n.velocite))).toBeLessThanOrEqual(127);
    const faible = notesEuclidiennes({ ...base, velocite: 0, accent: 0 });
    expect(Math.min(...faible.map((n) => n.velocite))).toBeGreaterThanOrEqual(1);
  });

  it("annonce une durée qui correspond aux notes produites", () => {
    const notes = notesEuclidiennes(base);
    expect(dureeEuclidienne(base)).toBeCloseTo(8 * 2 * 0.25, 6);
    expect(Math.max(...notes.map((n) => n.debut))).toBeLessThan(dureeEuclidienne(base));
  });
});
