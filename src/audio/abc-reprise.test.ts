// audio/abc-reprise.test.ts — La reprise : chaque style posé sur les accords, la
// mélodie intacte, et les refus explicites.
import { describe, it, expect } from "vitest";
import { lireMorceau } from "./abc";
import { reprendreAbc, motif, carrure, voicing, STYLES, ACCORDS_TENUS } from "./abc-reprise";
import { lireNotesMidi } from "./midi-vers-abc";

const AIR = `X:1
T:Essai
M:4/4
L:1/8
Q:1/4=100
K:G
"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`;
const opts = (style: string) => ({ style, tempo: 0, instrumentMelodie: 73, instrumentAccompagnement: 0, instrumentBasse: 33 });

describe("voicing", () => {
  it("place la basse à l'octave 2, l'accord serré sous la mélodie, l'arpège depuis la fondamentale", () => {
    expect(voicing("C")).toEqual({ basse: 36, quinte: 43, tierce: 40, octave: 48, accord: [55, 60, 64], arpege: [48, 52, 55, 60, 64, 67] });
  });

  it("pose la tierce au-dessus de la basse, dans la même octave", () => {
    expect(voicing("Am")!.tierce - voicing("Am")!.basse).toBe(3);
    expect(voicing("D/F#")!.tierce % 12).toBe(6);
  });

  it("met à la basse la note imposée d'un accord renversé", () => {
    const v = voicing("D/F#")!;
    expect(v.basse % 12).toBe(6);
    expect(v.basse).toBeGreaterThanOrEqual(36);
    expect(v.basse).toBeLessThanOrEqual(47);
    expect(v.accord.map((h) => h % 12).sort((a, b) => a - b)).toEqual([2, 6, 9]);
  });

  it("garde la quinte au-dessus de la basse", () => {
    const v = voicing("B")!;
    expect(v.quinte - v.basse).toBe(7);
  });

  it("rend null pour un accord inconnu", () => {
    expect(voicing("Zorglub")).toBeNull();
  });
});

describe("motifs", () => {
  const q44 = carrure(lireMorceau("M:4/4\nK:C\nC")), q34 = carrure(lireMorceau("M:3/4\nK:C\nC")), q68 = carrure(lireMorceau("M:6/8\nK:C\nC"));

  it("lit la carrure : temps et subdivision, mesure composée comprise", () => {
    expect(q44).toEqual({ mesure: 4, temps: 4, temps1: 1, sub: 0.5 });
    expect(q34).toEqual({ mesure: 3, temps: 3, temps1: 1, sub: 0.5 });
    expect(q68).toEqual({ mesure: 3, temps: 2, temps1: 1.5, sub: 0.5 });
  });

  it("remplit exactement chaque mesure, pour chaque style qui s'applique", () => {
    for (const style of STYLES) for (const c of [q44, q34, q68]) {
      const f = motif(style, c);
      if (!f) continue;
      for (const x of f) expect(x.decalage + x.duree).toBeLessThanOrEqual(c.mesure + 1e-9);
    }
  });

  it("refuse la bossa nova hors de 4/4 et la marche sur un nombre impair de temps", () => {
    expect(motif("Bossa Nova", q34)).toBeNull();
    expect(motif("Bossa Nova", q68)).toBeNull();
    expect(motif("Marche militaire", q34)).toBeNull();
    expect(motif("Valse", q34)).not.toBeNull();
  });
});

describe("reprise", () => {
  const q44 = carrure(lireMorceau(AIR));
  it.each(STYLES.filter((s) => motif(s, q44) !== null))("« %s » : ajoute accompagnement et basse, garde la mélodie et les accords", (style) => {
    const r = reprendreAbc(AIR, opts(style));
    expect(r.erreur).toBeNull();
    expect(r.ok).toBe(true);
    const relu = lireMorceau(r.abc!);
    expect(relu.voix.length).toBe(3);
    expect(relu.voix[0].notes).toEqual(lireMorceau(AIR).voix[0].notes);
    expect(relu.accords.map((a) => a.symbole)).toEqual(["G", "C", "G", "D", "G", "D"]);
    expect(r.notesAccompagnement).toBeGreaterThan(0);
    expect(r.notesBasse).toBeGreaterThan(0);
  });

  it("suit les changements d'accord à mi-mesure : la basse de la mesure 2 passe de do à sol", () => {
    const r = reprendreAbc(AIR, opts("Rock"));
    const basse = lireMorceau(r.abc!).voix[2].notes;
    const pc = (t: number) => basse.find((n) => Math.abs(n.debut - t) < 1e-9)!.midi % 12;
    expect(pc(4)).toBe(0); // do au 1er temps de la mesure 2
    expect(pc(6)).toBe(7); // sol au 3e temps
  });

  it("n'étend jamais une frappe au-delà d'un changement d'accord", () => {
    const r = reprendreAbc(AIR, opts(ACCORDS_TENUS));
    const acc = lireMorceau(r.abc!).voix[1].notes;
    // Mesure 2 : do puis sol à mi-mesure ; le bloc de do s'arrête à 6.
    const bloc = acc.filter((n) => n.debut === 4);
    expect(bloc.every((n) => n.duree === 2)).toBe(true);
  });

  it("rejoue la frappe sur le nouvel accord quand il change entre deux frappes", () => {
    // Le défaut trouvé dans l'app : en accords tenus, une seule frappe par mesure, et
    // le sol de la mesure 2 n'était jamais joué — l'accompagnement se taisait.
    const acc = lireMorceau(reprendreAbc(AIR, opts(ACCORDS_TENUS)).abc!).voix[1].notes;
    const sonne = (t: number) => acc.filter((n) => n.debut <= t && t < n.debut + n.duree).map((n) => n.midi % 12).sort((a, b) => a - b);
    expect(sonne(5)).toEqual([0, 4, 7]); // do majeur
    expect(sonne(7)).toEqual([2, 7, 11]); // sol majeur, rejoué à mi-mesure
  });

  it("joue la valse en 3/4 : basse au premier temps, accords aux deux suivants", () => {
    const valse = `X:1\nM:3/4\nL:1/4\nK:C\n"C"E G c | "G7"B2 G | "C"c3 |]`;
    const r = reprendreAbc(valse, opts("Valse"));
    expect(r.ok).toBe(true);
    const relu = lireMorceau(r.abc!);
    expect(relu.voix[2].notes.map((n) => n.debut)).toEqual([0, 3, 6]);
    expect([...new Set(relu.voix[1].notes.map((n) => n.debut))]).toEqual([1, 2, 4, 5, 7, 8]);
  });

  it("écrit les trois instruments dans le MIDI", () => {
    const r = reprendreAbc(AIR, opts("Pop ballade"));
    const midi = lireNotesMidi(r.midi!);
    expect([...midi.programmes.entries()].sort((a, b) => a[0] - b[0])).toEqual([[0, 73], [1, 0], [2, 33]]);
  });

  it("change le tempo si on le demande", () => {
    expect(reprendreAbc(AIR, { ...opts("Rock"), tempo: 140 }).tempo).toBe(140);
    expect(reprendreAbc(AIR, opts("Rock")).tempo).toBe(100);
  });

  it("refuse une partition sans accords chiffrés, en indiquant quoi faire", () => {
    const r = reprendreAbc("X:1\nM:4/4\nL:1/4\nK:C\nC D E F|]", opts("Rock"));
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/pas d'accords chiffrés.*Édition ABC par LLM/);
  });

  it("refuse un style qui ne s'applique pas à la métrique, et une levée", () => {
    expect(reprendreAbc(`X:1\nM:3/4\nL:1/4\nK:C\n"C"C D E|]`, opts("Bossa Nova")).erreur).toMatch(/« Bossa Nova » ne s'applique pas à une mesure en 3\/4/);
    expect(reprendreAbc(`X:1\nM:3/4\nL:1/4\nK:C\n"C"C D E|]`, { ...opts("Reggae"), nomStyle: "Reggae" }).erreur).toMatch(/« Reggae » ne s'applique pas/);
    expect(reprendreAbc(`X:1\nM:4/4\nL:1/4\nK:C\n"C"C | D E F G|]`, opts("Rock")).erreur).toMatch(/levée/);
  });

  it("signale les accords chiffrés qu'il ne sait pas jouer", () => {
    const r = reprendreAbc(AIR.replace('"C"cBcd', '"Zorglub"cBcd'), opts("Rock"));
    // Le lecteur ABC signale déjà l'accord inconnu : la partition est refusée à l'entrée.
    expect(r.erreur).toMatch(/non reconnu/);
  });
});
