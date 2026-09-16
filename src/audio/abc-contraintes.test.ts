// audio/abc-contraintes.test.ts — Le vérificateur de retouches ABC, invariant par
// invariant, et sur les fautes réellement commises par les modèles mesurés.
import { describe, it, expect } from "vitest";
import { lireMorceau } from "./abc";
import {
  verifierContraintes, dureesMesures, qualiteMusicale, lireInvariants, lireAbcUnique, PREREGLAGES,
} from "./abc-contraintes";
import { midiVersAbc } from "./midi-vers-abc";
import { morceauVersMidi } from "./abc";

const ORIGINAL = `X:1
T:Speed the Plough
M:4/4
L:1/8
K:G
"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BG"D"AF "G"G4|`;
const o = lireMorceau(ORIGINAL);
const verifier = (abc: string, inv = PREREGLAGES.reharmonisation) => verifierContraintes(o, lireMorceau(abc), inv);

describe("mesures jouées", () => {
  it("lit la durée de chaque mesure entre les barres", () => {
    expect(dureesMesures(o)).toEqual([4, 4, 4, 4]);
  });

  it("déroule les reprises : une section reprise compte deux fois", () => {
    expect(dureesMesures(lireMorceau("M:4/4\nL:1/4\nK:C\n|: C D E F :| G4 |"))).toEqual([4, 4, 4]);
  });

  it("garde une levée, et une fin sans barre finale", () => {
    expect(dureesMesures(lireMorceau("M:3/4\nL:1/4\nK:C\nC | D E F | G2"))).toEqual([1, 3, 2]);
  });
});

describe("chaque invariant", () => {
  it("ne signale rien sur l'original lui-même", () => {
    expect(verifier(ORIGINAL, ["mesures", "metrique", "tonalite", "melodie", "rythme", "accords", "ambitus"]).violations).toEqual([]);
  });

  it("attrape la faute de gemma4:12b : une note perdue en posant un accord", () => {
    // Relevé mot pour mot dans la mesure : « "G"BG"D"AF » devenu « "G"BG"D7"F ».
    const faute = ORIGINAL.replace('"G"BG"D"AF "G"G4', '"G"BG"D7"F"G"G4');
    const r = verifier(faute);
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("mesure 4 : 3.5 temps au lieu de 4");
    expect(r.violations.join()).toMatch(/mélodie modifiée à partir de la mesure 4/);
  });

  it("accepte une vraie réharmonisation", () => {
    const juste = ORIGINAL.replace('"C"cBcd', '"Am7"cBcd').replace('"D"dcBA', '"D7"dcBA');
    expect(verifier(juste).ok).toBe(true);
  });

  it("compte les mesures", () => {
    expect(verifier(ORIGINAL + '"G"G8|').violations).toContain("5 mesures au lieu de 4");
  });

  it("signale métrique et tonalité changées", () => {
    const r = verifier(ORIGINAL.replace("M:4/4", "M:2/2").replace("K:G", "K:D"));
    expect(r.violations).toContain("métrique 2/2 au lieu de 4/4");
    expect(r.violations).toContain("tonalité D major au lieu de G major");
  });

  it("distingue rythme et mélodie : des hauteurs changées gardent le rythme", () => {
    const hauteurs = ORIGINAL.replace("GABG DGBG", "EFGE BEGE");
    expect(verifier(hauteurs, ["rythme"]).ok).toBe(true);
    expect(verifier(hauteurs, ["melodie"]).violations.join()).toMatch(/mesure 1 \(note 1 : G4 → E4\)/);
  });

  it("compare les accords sous leur forme normalisée : Bm7(b5) vaut Bm7b5", () => {
    const a = lireMorceau(ORIGINAL.replace('"C"cBcd', '"Bm7(b5)"cBcd'));
    const b = lireMorceau(ORIGINAL.replace('"C"cBcd', '"Bm7b5"cBcd'));
    expect(verifierContraintes(a, b, ["accords"]).ok).toBe(true);
  });

  it("signale les notes hors de l'ambitus d'origine", () => {
    // b (si 5 = 83) et g' (sol 6) dépassent le sol 5 d'origine.
    expect(verifier(ORIGINAL.replace("GABG", "GAbg'"), ["ambitus"]).violations.join()).toMatch(/2 note\(s\) hors de l'ambitus d'origine D4–G5/);
  });

  it("ne compte pas en faute des reprises réécrites en toutes lettres", () => {
    const repris = "M:4/4\nL:1/4\nK:C\n|: C D E F :| G4 |";
    const ecrit = "M:4/4\nL:1/4\nK:C\nC D E F | C D E F | G4 |";
    expect(verifierContraintes(lireMorceau(repris), lireMorceau(ecrit), ["mesures", "melodie"]).ok).toBe(true);
  });

  it("fait des avertissements de lecture des violations", () => {
    expect(verifier(ORIGINAL.replace("GABG", "{g}GABG")).violations.join()).toMatch(/lecture : notes d'ornement/);
  });
});

describe("qualité", () => {
  it("mesure la part des temps forts dont la note est dans l'accord", () => {
    // Temps forts de l'original (1 et 3 de chaque mesure) : 8 notes, dont celles
    // de la mesure 4 où « D » tient sous un sol, par exemple.
    const q = qualiteMusicale(o);
    expect(q.consonanceTempsForts).not.toBeNull();
    expect(q.consonanceTempsForts!).toBeGreaterThan(0.6);
    expect(q.notesDansLaGamme).toBe(1);
  });

  it("baisse quand les notes sortent de la tonalité", () => {
    expect(qualiteMusicale(lireMorceau(ORIGINAL.replace("GABG DGBG", "G^AB^G D^GB^G"))).notesDansLaGamme!).toBeLessThan(0.9);
  });

  it("compte la sensible comme dans la gamme en mineur", () => {
    expect(qualiteMusicale(lireMorceau("K:Am\nA B c d e ^G A")).notesDansLaGamme).toBe(1);
  });
});

describe("saisie et lecture", () => {
  it("lit une liste d'invariants avec ou sans accents, et nomme les inconnus", () => {
    expect(lireInvariants("mesures, métrique ; Mélodie tonalité")).toEqual({ invariants: ["mesures", "metrique", "melodie", "tonalite"], inconnus: [] });
    expect(lireInvariants("mesures harmonie").inconnus).toEqual(["harmonie"]);
  });

  it("accepte aussi les noms anglais, et les deux mélangés", () => {
    // L'interface anglaise propose « bars, meter » ; un projet enregistré en
    // français doit rester lisible, d'où les deux listes acceptées.
    expect(lireInvariants("bars, meter, key, melody, rhythm, chords, range").invariants)
      .toEqual(["mesures", "metrique", "tonalite", "melodie", "rythme", "accords", "ambitus"]);
    expect(lireInvariants("bars, métrique").invariants).toEqual(["mesures", "metrique"]);
    expect(lireInvariants("bars harmony").inconnus).toEqual(["harmony"]);
  });

  it("lit le premier morceau d'une réponse de modèle", () => {
    expect(lireAbcUnique("Voici :\n```abc\nX:1\nK:C\nCDE\n```")?.voix[0].notes.length).toBe(3);
    expect(lireAbcUnique("pas de partition")).toBeNull();
  });
});

describe("accords posés par l'écrivain MIDI → ABC", () => {
  it("pose les accords aux temps demandés, coupe et lie la note qui traverse", () => {
    const m = lireMorceau("M:4/4\nL:1/4\nK:C\nC4 | D2 E2 |");
    const { octets } = morceauVersMidi(m, { tempoParDefaut: 120, instrumentVoix: 0, instrumentAccords: 0, jouerAccords: false });
    const r = midiVersAbc(octets, { metrique: "4/4", tonalite: "C", grille: "auto", titre: "", accords: [
      { debut: 0, symbole: "C" }, { debut: 2, symbole: "Am" }, { debut: 4, symbole: "Dm7" }, { debut: 6, symbole: "G7" },
    ] });
    const relu = lireMorceau(r.abc);
    expect(relu.accords.map((a) => [a.symbole, a.debut])).toEqual([["C", 0], ["Am", 2], ["Dm7", 4], ["G7", 6]]);
    // La ronde de do est coupée à mi-mesure et liée : relue, c'est toujours une ronde.
    expect(relu.voix[0].notes.map((n) => [n.midi, n.debut, n.duree])).toEqual([[60, 0, 4], [62, 4, 2], [64, 6, 2]]);
    expect(r.abc).toMatch(/"C"C4- "Am"C4/);
  });
});

/**
 * Les violations sont ce que le nœud « Contraintes ABC » met dans son message et
 * dans son rapport. Elles étaient écrites en dur en français : une interface
 * anglaise lisait « mesure 4 : 3.5 temps au lieu de 4 ». Elles passent désormais
 * par le dictionnaire, comme les avertissements de lecture qu'elles reprennent.
 */
describe("langue des violations", () => {
  const avecLangue = <T>(langue: string, f: () => T): T => {
    const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
      configurable: true, writable: true,
    });
    try { return f(); } finally {
      if (avant) Object.defineProperty(globalThis, "localStorage", avant);
      else delete (globalThis as unknown as Record<string, unknown>).localStorage;
    }
  };
  const violations = (langue: string) => avecLangue(langue, () =>
    verifierContraintes(lireMorceau(ORIGINAL), lireMorceau(ORIGINAL.replace("G4|", "G6|").replace('"D"dcBA', '"Dm"dcBc')),
      ["mesures", "metrique", "tonalite", "melodie", "accords"]).violations);

  it("les dit en français quand l'interface l'est", () => {
    expect(violations("fr")).toEqual([
      "mesure 4 : 5 temps au lieu de 4",
      "mélodie modifiée à partir de la mesure 3 (note 20 : A4 → C5)",
      "accords modifiés à partir de la mesure 3",
    ]);
  });

  it("les dit en anglais quand l'interface l'est", () => {
    expect(violations("en")).toEqual([
      "bar 4: 5 beats instead of 4",
      "melody modified from bar 3 (note 20: A4 → C5)",
      "chords modified from bar 3",
    ]);
  });

  it("traduit aussi les avertissements de lecture qu'elles reprennent", () => {
    const lecture = (langue: string) => avecLangue(langue, () =>
      verifierContraintes(lireMorceau(ORIGINAL), lireMorceau(`K:G\n{g}GABG`), ["mesures"]).violations.join(" | "));
    expect(lecture("fr")).toMatch(/lecture : notes d'ornement/);
    expect(lecture("en")).toMatch(/reading: grace notes/);
  });
});
