// audio/abc.test.ts — Lecture ABC : chaque règle du standard vérifiée sur des
// hauteurs MIDI et des durées en noires attendues, puis le MIDI écrit relu.
import { describe, it, expect } from "vitest";
import { parseMidi } from "midi-file";
import {
  lireTonalite, lireMetrique, uniteParDefaut, lireTempo, lireMorceau, decouperMorceaux,
  morceauVersMidi, hauteursAccord, frac,
} from "./abc";

const sansAvert = () => {};
/** [hauteur, début, durée] de la première voix, en noires. */
const notes = (abc: string) => lireMorceau(abc).voix[0].notes.map((n) => [n.midi, +n.debut.toFixed(6), +n.duree.toFixed(6)]);
const hauteurs = (abc: string) => lireMorceau(abc).voix[0].notes.map((n) => n.midi);
const durees = (abc: string) => lireMorceau(abc).voix[0].notes.map((n) => +n.duree.toFixed(6));

describe("tonalité", () => {
  it.each([
    ["G", { F: 1 }, "G major"],
    ["Dm", { B: -1 }, "D minor"],
    // La dorien = la gamme de sol majeur jouée depuis la : un dièse, fa.
    ["Ador", { F: 1 }, "A dorian"],
    ["Bb", { B: -1, E: -1 }, "Bb major"],
    ["F#m", { F: 1, C: 1, G: 1 }, "F# minor"],
    // Mi mixolydien = la gamme de la majeur : trois dièses.
    ["Emix", { F: 1, C: 1, G: 1 }, "E mixolydian"],
    ["Dphr", { B: -1, E: -1 }, "D phrygian"],
    ["Flyd", {}, "F lydian"],
    ["Gmajor", { F: 1 }, "G major"],
    ["none", {}, "none"],
  ] as const)("K:%s", (k, alterations, nom) => {
    const a = lireTonalite(k, sansAvert);
    expect(a.alterations).toEqual(alterations);
    expect(a.nom).toBe(nom);
  });

  it("lit les altérations explicites, et « exp » qui remplace l'armure", () => {
    expect(lireTonalite("D ^g", sansAvert).alterations).toEqual({ F: 1, C: 1, G: 1 });
    expect(lireTonalite("D exp _b", sansAvert).alterations).toEqual({ B: -1 });
  });

  it("ignore la clé mais applique octave= et transpose=", () => {
    const a = lireTonalite("C clef=bass octave=-1 transpose=2", sansAvert);
    expect(a.octave).toBe(-1);
    expect(a.transposition).toBe(2);
  });
});

describe("métrique, unité, tempo", () => {
  it("lit C, C| et les métriques composées", () => {
    expect(lireMetrique("C")).toMatchObject({ numerateur: 4, denominateur: 4 });
    expect(lireMetrique("C|")).toMatchObject({ numerateur: 2, denominateur: 2 });
    expect(lireMetrique("2+3/8")).toMatchObject({ numerateur: 5, denominateur: 8 });
    expect(lireMetrique("none")).toBeNull();
  });

  it("déduit l'unité de la métrique : 1/16 sous 3/4, 1/8 à partir de 3/4", () => {
    expect(uniteParDefaut(lireMetrique("2/4"))).toEqual(frac(1, 16));
    expect(uniteParDefaut(lireMetrique("3/4"))).toEqual(frac(1, 8));
    expect(uniteParDefaut(lireMetrique("6/8"))).toEqual(frac(1, 8));
  });

  it("convertit le tempo en noires par minute", () => {
    expect(lireTempo("1/4=90", frac(1, 8))).toBe(90);
    expect(lireTempo("3/8=80", frac(1, 8))).toBe(120);
    expect(lireTempo('"Allegro" 1/2=60', frac(1, 8))).toBe(120);
    // Ancienne forme : des unités L par minute. 120 croches = 60 noires.
    expect(lireTempo("120", frac(1, 8))).toBe(60);
  });
});

describe("hauteurs", () => {
  it("place do central sur C, l'octave au-dessus sur c, et lit ' et ,", () => {
    expect(hauteurs("K:C\nC D E F G A B c d' C,")).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 86, 48]);
  });

  it("applique l'armure et les altérations écrites", () => {
    expect(hauteurs("K:G\nF ^C _E =F")).toEqual([66, 61, 63, 65]);
  });

  it("garde une altération écrite jusqu'à la barre, pour la même lettre à la même octave", () => {
    // K:G : fa dièse d'armure. =F le bécarre, F suivant reste bécarre, f (autre
    // octave) garde l'armure, et la barre rétablit tout.
    expect(hauteurs("K:G\n=F F f | F")).toEqual([65, 65, 78, 66]);
  });
});

describe("durées", () => {
  it("lit toutes les formes de durée, en unités L", () => {
    expect(durees("L:1/8\nK:C\nA A2 A/2 A/ A// A3/2 A3/")).toEqual([0.5, 1, 0.25, 0.25, 0.125, 0.75, 0.75]);
  });

  it("applique l'unité par défaut quand L: est absent", () => {
    expect(durees("M:2/4\nK:C\nA")).toEqual([0.25]);
    expect(durees("M:6/8\nK:C\nA")).toEqual([0.5]);
  });

  it("fait avancer le temps sur les silences, et Z sur des mesures entières", () => {
    expect(notes("M:3/4\nL:1/8\nK:C\nz2 C Z2 D")).toEqual([[60, 1, 0.5], [62, 7.5, 0.5]]);
  });

  it("joue les accords de notes ensemble, avec leur durée", () => {
    expect(notes("L:1/8\nK:C\n[CEG]2 [CE]/2")).toEqual([[60, 0, 1], [64, 0, 1], [67, 0, 1], [60, 1, 0.25], [64, 1, 0.25]]);
  });

  it("fusionne une note prolongée avec la suivante de même hauteur", () => {
    expect(notes("L:1/8\nK:C\nA2-A2 B")).toEqual([[69, 0, 2], [71, 2, 0.5]]);
  });

  it("applique les rythmes pointés > >> <", () => {
    expect(durees("L:1/8\nK:C\nA>B A>>B A<B")).toEqual([0.75, 0.25, 0.875, 0.125, 0.25, 0.75]);
  });

  it("fait tenir un triolet dans deux unités, exactement", () => {
    const n = notes("L:1/8\nK:C\n(3ABc d");
    expect(n.map((x) => x[2])).toEqual([+(1 / 3).toFixed(6), +(1 / 3).toFixed(6), +(1 / 3).toFixed(6), 0.5]);
    // La note qui suit tombe pile sur le temps : aucune dérive.
    expect(n[3][1]).toBe(1);
  });

  it("donne au quintolet le temps de 2 unités en mesure simple, de 3 en mesure composée", () => {
    const simple = durees("M:4/4\nL:1/8\nK:C\n(5ABcde").reduce((a, b) => a + b, 0);
    const compose = durees("M:6/8\nL:1/8\nK:C\n(5ABcde").reduce((a, b) => a + b, 0);
    expect(simple).toBeCloseTo(1, 6);
    expect(compose).toBeCloseTo(1.5, 6);
  });
});

describe("reprises", () => {
  it("rejoue une section entre |: et :|", () => {
    expect(hauteurs("K:C\n|: C D :| E")).toEqual([60, 62, 60, 62, 64]);
  });

  it("rejoue depuis le début un :| sans |:", () => {
    expect(hauteurs("K:C\nC D :| E")).toEqual([60, 62, 60, 62, 64]);
  });

  it("saute la première fin au second passage", () => {
    expect(hauteurs("K:C\n|: C |1 D :|2 E |]")).toEqual([60, 62, 60, 64]);
    expect(hauteurs("K:C\n|: C [1 D :| [2 E |]")).toEqual([60, 62, 60, 64]);
  });

  it("enchaîne deux reprises collées par ::", () => {
    expect(hauteurs("K:C\n|: C :: D :|")).toEqual([60, 60, 62, 62]);
  });

  it("garde une première fin de plusieurs mesures entière", () => {
    expect(hauteurs("K:C\n|: C |1 D | E :|2 F |]")).toEqual([60, 62, 64, 60, 65]);
  });
});

describe("voix, accords chiffrés, morceaux", () => {
  it("sépare les voix, qui partent toutes du temps 0", () => {
    const m = lireMorceau("X:1\nL:1/4\nV:1\nV:2\nK:D\nV:1\nF G\nV:2\nD, E,");
    expect(m.voix.map((v) => v.id)).toEqual(["1", "2"]);
    expect(m.voix[0].notes.map((n) => [n.midi, n.debut])).toEqual([[66, 0], [67, 1]]);
    // Voix déclarées avant K: : elles héritent de ré majeur (fa et do dièses).
    expect(m.voix[1].notes.map((n) => [n.midi, n.debut])).toEqual([[50, 0], [52, 1]]);
  });

  it("tient chaque accord chiffré jusqu'au suivant, puis jusqu'à la fin", () => {
    const m = lireMorceau('L:1/4\nK:Am\n"Am" A B c d | "F" A4');
    expect(m.accords.map((a) => [a.symbole, a.debut, a.duree])).toEqual([["Am", 0, 4], ["F", 4, 4]]);
    expect(m.accords[0].hauteurs).toEqual([57, 60, 64]);
  });

  it("construit les accords renversés, basse sous la fondamentale", () => {
    expect(hauteursAccord("C/E")).toEqual([40, 48, 52, 55]);
    expect(hauteursAccord("G7")).toEqual([55, 59, 62, 65]);
    expect(hauteursAccord("N.C.")).toEqual([]);
    expect(hauteursAccord("Zorglub")).toBeNull();
  });

  it.each([
    // Écritures usuelles que Tonal refuse telles quelles, relevées en mesurant
    // des retouches d'accords par LLM.
    // Fondamentale posée à l'octave 3 : si = 59.
    ["Bm7(b5)", [59, 62, 65, 69]],
    ["Bø", [59, 62, 65, 69]],
    ["Bø7", [59, 62, 65, 69]],
    ["C7(#9)", [48, 52, 55, 58, 63]],
    ["C(add9)", [48, 52, 55, 62]],
    ["Dm(maj7)", [50, 53, 57, 61]],
    ["F6/9", [53, 57, 60, 62, 67]],
    ["D/F#", [42, 50, 54, 57]],
  ] as const)("lit l'accord chiffré « %s »", (symbole, attendu) => {
    expect(hauteursAccord(symbole)).toEqual(attendu);
  });

  it("ne lit pas les annotations comme des accords", () => {
    expect(lireMorceau('K:C\n"^au talon" C "_rit." D').accords).toEqual([]);
  });

  it("découpe un fichier à plusieurs morceaux, et ignore le texte qui précède X:", () => {
    const fichier = "Voici deux airs que j'ai écrits :\n\nX:1\nT:Un\nK:C\nCDE\n\nX:2\nT:Deux\nK:G\nGAB";
    const m = decouperMorceaux(fichier);
    expect(m.length).toBe(2);
    expect(lireMorceau(m[1]).titre).toBe("Deux");
  });

  it("ne prend pas de la prose sans en-tête pour une partition", () => {
    expect(decouperMorceaux("pas de partition ici")).toEqual([]);
    expect(decouperMorceaux("CDE FGA | c2 z2")).toHaveLength(1);
  });

  it("retire les clôtures de code d'un modèle de langage", () => {
    expect(decouperMorceaux("```abc\nX:1\nK:C\nCDE\n```").length).toBe(1);
  });

  it("ne lit pas comme des notes la phrase qui suit le bloc de code", () => {
    // « Bonne écoute. » contient B, e, c : trois notes parasites si on la lisait.
    const texte = "Voici :\n```abc\nX:1\nK:C\nCDE\n```\nBonne écoute.";
    const [morceau] = decouperMorceaux(texte);
    expect(lireMorceau(morceau).voix[0].notes.map((n) => n.midi)).toEqual([60, 62, 64]);
  });

  it("clôt un morceau formel à la première ligne vide, comme le veut ABC 2.1", () => {
    const m = lireMorceau("X:1\nK:C\nCDE\n\nCeci est un commentaire libre.");
    expect(m.voix[0].notes.map((n) => n.midi)).toEqual([60, 62, 64]);
    expect(m.avertissements).toEqual([]);
  });

  it("ne coupe pas à une ligne vide un texte sans X:", () => {
    expect(lireMorceau("K:C\nCDE\n\nFGA").voix[0].notes.length).toBe(6);
  });
});

describe("ce qui n'est pas lu est dit", () => {
  it.each([
    ["K:C\n{g}A", /ornement/],
    ["Q:1/4=100\nK:C\nA [Q:1/4=140] B", /changement de tempo/],
    ["%%MIDI program 40\nK:C\nA", /%%MIDI/],
    ['K:C\n"Zorglub" A', /non reconnu/],
    ["K:C\n|: A [1,3 B :|", /multiple/],
    ["M:4/4\nABC", /K: absent/],
  ])("%s", (abc, motif) => {
    expect(lireMorceau(abc).avertissements.join(" | ")).toMatch(motif);
  });

  it("ne produit aucun avertissement sur un air traditionnel ordinaire", () => {
    const air = `X:1
T:Speed the Plough
M:4/4
L:1/8
Q:1/4=120
K:G
|:GABG DGBG|cBcd efge|dcBA GFGA|BGAF G4:|
|:gfga gdBd|gfga gdBd|cBcd efge|dcBA G4:|`;
    const m = lireMorceau(air);
    expect(m.avertissements).toEqual([]);
    // Huit mesures de 4/4, chaque section reprise : 4 × 4 × 4 = 64 noires.
    expect(m.voix[0].dureeNoires).toBe(64);
    expect(m.tempo).toBe(120);
  });
});

describe("MIDI", () => {
  const air = `X:1
T:Essai
M:6/8
L:1/8
Q:3/8=60
K:D
z3 "D" dfa | "A" c'3 A3 |]`;

  const m = lireMorceau(air);
  const { octets, tempo, canaux } = morceauVersMidi(m, { tempoParDefaut: 120, instrumentVoix: 73, instrumentAccords: 0, jouerAccords: true });
  const midi = parseMidi(octets);
  const evenements = (piste: number) => {
    let t = 0;
    return midi.tracks[piste].map((e: any) => { t += e.deltaTime; return { ...e, tick: t }; });
  };

  it("écrit la métrique, l'armure et le tempo en noires", () => {
    const e = evenements(0);
    expect(e.find((x: any) => x.type === "timeSignature")).toMatchObject({ numerator: 6, denominator: 8 });
    expect(e.find((x: any) => x.type === "keySignature")).toMatchObject({ key: 2, scale: 0 });
    expect(tempo).toBe(90); // 60 noires pointées = 90 noires
    expect(e.find((x: any) => x.type === "setTempo").microsecondsPerBeat).toBe(Math.round(60_000_000 / 90));
  });

  it("garde le silence de début : la première note tombe après la mesure d'anacrouse", () => {
    const on = evenements(1).filter((x: any) => x.type === "noteOn");
    expect(on[0]).toMatchObject({ noteNumber: 74, tick: 720 }); // z3 = trois croches = 1,5 noire
  });

  it("écrit l'instrument de la voix et une piste d'accords sur un autre canal", () => {
    expect(canaux).toBe(2);
    expect(evenements(1).find((x: any) => x.type === "programChange")).toMatchObject({ channel: 0, programNumber: 73 });
    const accords = evenements(2).filter((x: any) => x.type === "noteOn");
    expect(accords.every((x: any) => x.channel === 1)).toBe(true);
    expect(accords.slice(0, 3).map((x: any) => [x.noteNumber, x.tick])).toEqual([[50, 720], [54, 720], [57, 720]]);
  });

  it("n'écrit pas de piste d'accords quand on ne les joue pas", () => {
    expect(morceauVersMidi(m, { tempoParDefaut: 120, instrumentVoix: 0, instrumentAccords: 0, jouerAccords: false }).canaux).toBe(1);
  });

  it("saute le canal 9, réservé à la batterie", () => {
    const dix = Array.from({ length: 10 }, (_, k) => `V:${k + 1}\nC`).join("\n");
    const mm = lireMorceau(`K:C\n${dix}`);
    const p = parseMidi(morceauVersMidi(mm, { tempoParDefaut: 120, instrumentVoix: 0, instrumentAccords: 0, jouerAccords: false }).octets);
    const canauxUtilises = p.tracks.slice(1).map((t: any) => t.find((e: any) => e.type === "noteOn")?.channel);
    expect(canauxUtilises).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10]);
  });
});
