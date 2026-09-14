// audio/midi-vers-abc.test.ts — MIDI → ABC. Les règles d'écriture une par une,
// puis les critères de validation convenus : aller-retour exact sur du matériau
// calé, tonalité des générateurs, MIDI humanisé lisible avec ses notes déplacées.
import { describe, it, expect } from "vitest";
import { writeMidi } from "midi-file";
import { midiVersAbc, epeler, grilleExacte, lireNotesMidi } from "./midi-vers-abc";
import { lireMorceau, lireTonalite, morceauVersMidi } from "./abc";
import { genererGrooveBox } from "./groove-box";

const sans = () => {};
const OPTS = { metrique: "fichier", tonalite: "auto", grille: "auto" as const, titre: "" };

/** MIDI d'une piste à partir de [hauteur, début, durée] en noires (480 ticks). */
function midi(notes: [number, number, number][], o: { canal?: number; num?: number; den?: number; tempo?: number; decalages?: number[] } = {}): Uint8Array {
  const lignes: { tick: number; e: any; ordre: number }[] = [];
  notes.forEach(([h, d, du], i) => {
    const x = o.decalages?.[i] ?? 0;
    lignes.push({ tick: Math.round(d * 480) + x, ordre: 1, e: { type: "noteOn", channel: o.canal ?? 0, noteNumber: h, velocity: 80 } });
    lignes.push({ tick: Math.round((d + du) * 480) + x, ordre: 0, e: { type: "noteOff", channel: o.canal ?? 0, noteNumber: h, velocity: 0 } });
  });
  lignes.sort((a, b) => a.tick - b.tick || a.ordre - b.ordre);
  let p = 0;
  const evs = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: Math.round(60_000_000 / (o.tempo ?? 120)) },
    { deltaTime: 0, type: "timeSignature", numerator: o.num ?? 4, denominator: o.den ?? 4, metronome: 24, thirtyseconds: 8 },
    ...lignes.map(({ tick, e }) => { const r = { deltaTime: tick - p, ...e }; p = tick; return r; }),
    { deltaTime: 0, type: "endOfTrack" },
  ];
  return new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: 480 }, tracks: [evs] } as any));
}

/** Notes (hauteur, début, durée) triées, toutes voix confondues : la mesure de l'aller-retour. */
const empreinte = (voix: { notes: { midi: number; debut: number; duree: number }[] }[]) =>
  voix.flatMap((v) => v.notes.map((n) => `${n.midi}@${n.debut.toFixed(4)}×${n.duree.toFixed(4)}`)).sort();

const corps = (abc: string) => abc.split("\n").filter((l) => !/^[A-Za-z]:|^%/.test(l)).join("\n");

describe("orthographe", () => {
  const cle = (k: string) => lireTonalite(k, sans);
  it("prend l'orthographe de la gamme, puis des dièses ou des bémols selon l'armure", () => {
    expect(epeler(66, cle("G"))).toEqual({ lettre: "F", alteration: 1 });
    expect(epeler(70, cle("F"))).toEqual({ lettre: "B", alteration: -1 });
    expect(epeler(61, cle("D"))).toEqual({ lettre: "C", alteration: 1 });
    expect(epeler(61, cle("Bb"))).toEqual({ lettre: "D", alteration: -1 });
    // Si majeur n'a pas de ré naturel : dans une armure à dièses, un do double
    // dièse serait savant — la note hors gamme prend son nom naturel.
    expect(epeler(62, cle("B"))).toEqual({ lettre: "D", alteration: 0 });
    // Do dièse majeur : le do est un si dièse.
    expect(epeler(60, cle("C#"))).toEqual({ lettre: "B", alteration: 1 });
  });

  it("n'écrit l'altération que si l'armure et la mesure ne la donnent pas, et la répète après la barre", () => {
    const r = midiVersAbc(midi([[65, 0, 1], [65, 1, 1], [66, 2, 1], [66, 3, 1], [65, 4, 1]]), { ...OPTS, tonalite: "G" });
    // =F F ^F F | =F : le bécarre tient dans la mesure, le dièse rétabli doit
    // s'écrire, et la barre remet l'armure.
    expect(corps(r.abc)).toMatch(/^=F2 F2 \^F2 F2 \| =F2/);
  });

  it("écrit un si dièse sous le do central avec la virgule qui convient", () => {
    const r = midiVersAbc(midi([[60, 0, 4]]), { ...OPTS, tonalite: "C#" });
    expect(corps(r.abc)).toMatch(/^B,8/);
  });
});

describe("grille", () => {
  it("trouve la grille exacte la plus grossière", () => {
    expect(grilleExacte(lireNotesMidi(midi([[60, 0, 1], [62, 1, 0.5]])).notes, 480)).toBe(2);
    expect(grilleExacte(lireNotesMidi(midi([[60, 0, 1 / 3], [62, 1 / 3, 1 / 3]])).notes, 480)).toBe(3);
    expect(grilleExacte(lireNotesMidi(midi([[60, 0, 0.25], [62, 1 / 3, 1 / 3]])).notes, 480)).toBe(12);
  });

  it("n'en trouve pas sur un jeu humanisé, applique 1/16 et compte les notes déplacées", () => {
    const humain = midi([[60, 0, 1], [62, 1, 1], [64, 2, 1], [65, 3, 1]], { decalages: [7, -11, 0, 13] });
    expect(grilleExacte(lireNotesMidi(humain).notes, 480)).toBeNull();
    const r = midiVersAbc(humain, OPTS);
    expect(r.subdivisions).toBe(4);
    expect(r.grilleExacte).toBe(false);
    expect(r.notesDeplacees).toBe(3);
    expect(corps(r.abc)).toMatch(/^C2 D2 E2 F2 \|\]/);
  });
});

describe("écriture", () => {
  it("coupe une note à la barre et la lie", () => {
    const r = midiVersAbc(midi([[69, 3, 2]]), { ...OPTS, tonalite: "C" });
    expect(corps(r.abc)).toMatch(/^z6 A2- \| A2 z6 \|\]/);
  });

  it("groupe les notes simultanées de même durée en accord", () => {
    const r = midiVersAbc(midi([[60, 0, 2], [64, 0, 2], [67, 0, 2]]), { ...OPTS, tonalite: "C" });
    expect(corps(r.abc)).toMatch(/^\[CEG\]4/);
  });

  it("sépare en deux voix une basse tenue sous une mélodie", () => {
    const r = midiVersAbc(midi([[48, 0, 4], [72, 0, 1], [74, 1, 1], [76, 2, 1], [77, 3, 1]]), { ...OPTS, tonalite: "C" });
    expect(r.voix).toBe(2);
    expect(r.abc).toMatch(/V:1\nc2 d2 e2 f2 \|\]\nV:2\nC,8 \|\]/);
  });

  it("en mode « raccourcir », garde une mélodie legato sur une seule ligne et compte les notes coupées", () => {
    const legato = midi([[60, 0, 1.5], [62, 1, 1.5], [64, 2, 1], [65, 3, 1]]);
    expect(midiVersAbc(legato, { ...OPTS, tonalite: "C" }).voix).toBe(2);
    const r = midiVersAbc(legato, { ...OPTS, tonalite: "C", chevauchements: "raccourcir" });
    expect(r.voix).toBe(1);
    expect(r.notesRaccourcies).toBe(2);
    expect(corps(r.abc)).toMatch(/^C2 D2 E2 F2 \|\]/);
  });

  it("en mode « raccourcir », ne coupe jamais un accord", () => {
    const r = midiVersAbc(midi([[60, 0, 2], [64, 0, 2], [67, 0, 2], [72, 2, 2]]), { ...OPTS, tonalite: "C", chevauchements: "raccourcir" });
    expect(r.notesRaccourcies).toBe(0);
    expect(corps(r.abc)).toMatch(/^\[CEG\]4 c4/);
  });

  it("met la mélodie du Groove Box sur une ligne en mode « raccourcir »", () => {
    const g = genererGrooveBox({
      cle: "D", gamme: "mineur", genre: "pop", progression: "I-V-vi-IV", extension: "aucune", tempo: 110, dureeAccord: 2,
      nbAccords: 8, styleRythme: "Pop dance", neurones: 15, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
      densite: 0.7, repetition: 0.25, silence: 0.1, graine: 11,
    });
    expect(midiVersAbc(g.midiMelodie, OPTS).voix).toBeGreaterThan(1);
    expect(midiVersAbc(g.midiMelodie, { ...OPTS, chevauchements: "raccourcir" }).voix).toBe(1);
  });

  it("écrit un triolet en (3", () => {
    const r = midiVersAbc(midi([[60, 0, 1 / 3], [62, 1 / 3, 1 / 3], [64, 2 / 3, 1 / 3], [65, 1, 1]]), { ...OPTS, tonalite: "C" });
    expect(corps(r.abc)).toMatch(/^\(3CDE F2/);
    expect(r.avertissements).toEqual([]);
  });

  it("applique la métrique choisie à la main", () => {
    const r = midiVersAbc(midi(Array.from({ length: 6 }, (_, i) => [60 + i, i, 1] as [number, number, number])), { ...OPTS, metrique: "3/4", tonalite: "C" });
    expect(r.abc).toMatch(/M:3\/4/);
    expect((corps(r.abc).match(/\|/g) ?? []).length).toBe(2);
  });

  it("coupe les silences aux temps, comme on les écrit", () => {
    // Pointée de croche puis silence jusqu'au 4e temps et demi : « z/ z4 z »,
    // pas « z11/2 ». Mesuré dans l'app sur une mélodie du Groove Box avant correction.
    const r = midiVersAbc(midi([[62, 0, 0.75], [65, 3.5, 0.5]]), { ...OPTS, tonalite: "F" });
    // « zF » : le demi-silence et la note du même temps restent groupés.
    expect(corps(r.abc)).toMatch(/^D3\/2z\/ z4 zF \|\]/);
  });

  it("ignore la batterie et le dit", () => {
    const r = midiVersAbc(midi([[36, 0, 1]], { canal: 9 }), OPTS);
    expect(r.batterieIgnoree).toBe(1);
    expect(r.avertissements.join()).toMatch(/batterie ignorée/);
  });
});

describe("critère 1 — aller-retour exact sur du matériau calé", () => {
  const allerRetour = (abc: string) => {
    const m = lireMorceau(abc);
    const { octets } = morceauVersMidi(m, { tempoParDefaut: 120, instrumentVoix: 0, instrumentAccords: 0, jouerAccords: true });
    const r = midiVersAbc(octets, { ...OPTS, metrique: m.metrique?.texte ?? "fichier" });
    const relu = lireMorceau(r.abc);
    // Les accords chiffrés sont devenus une voix de notes : on compare tout.
    const avant = empreinte([...m.voix, { notes: m.accords.flatMap((a) => a.hauteurs.map((h) => ({ midi: h, debut: a.debut, duree: a.duree }))) }]);
    return { avant, apres: empreinte(relu.voix), r, relu };
  };

  it("« Speed the Plough » avec ses accords chiffrés", () => {
    const { avant, apres, r, relu } = allerRetour(`X:1\nT:Speed the Plough\nM:4/4\nL:1/8\nQ:1/4=120\nK:G\n|:"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BG"D"AF "G"G4:|`);
    expect(apres).toEqual(avant);
    expect(r.grilleExacte).toBe(true);
    expect(r.notesDeplacees).toBe(0);
    expect(relu.avertissements).toEqual([]);
    expect(r.abc).toMatch(/K:G/);
  });

  it("l'air à deux voix en mi dorien, avec triolet et fins alternatives", () => {
    const { avant, apres, r } = allerRetour(`X:7\nT:Essai\nM:6/8\nL:1/8\nQ:3/8=100\nK:Edor\nV:1\n|:"Em"B2e edB|"D"(3ABA F D2F|1"Em"E3 E2F:|2"Em"E3 E3|]\nV:2\n|:E,3 E,3|D,3 D,3|1E,3 E,3:|2E,3 E,6|]`);
    expect(apres).toEqual(avant);
    expect(r.notesDeplacees).toBe(0);
  });

  it("une mélodie du Groove Box", () => {
    const g = genererGrooveBox({
      cle: "A", gamme: "mineur", genre: "pop", progression: "I-V-vi-IV", extension: "aucune", tempo: 110, dureeAccord: 2,
      nbAccords: 4, styleRythme: "Pop dance", neurones: 15, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
      densite: 0.7, repetition: 0.25, silence: 0.1, graine: 42,
    });
    const avant = lireNotesMidi(g.midiMelodie);
    const r = midiVersAbc(g.midiMelodie, OPTS);
    const apres = lireMorceau(r.abc);
    const enNoires = (t: number) => t / avant.ppq;
    const attendu = avant.notes.map((n) => `${n.hauteur}@${enNoires(n.debut).toFixed(4)}×${enNoires(n.fin - n.debut).toFixed(4)}`).sort();
    expect(empreinte(apres.voix)).toEqual(attendu);
    expect(r.notesDeplacees).toBe(0);
  });
});

describe("critère 2 bis — une ligne seule est signalée", () => {
  // Mesuré sur 8 tonalités × 3 graines : accords justes 24/24, mélodie 4/24,
  // basse 0/24, sans que confiance ni écart permettent de le voir. Seule la
  // texture le peut : ces tests en fixent la détection.
  const gb = (graine: number) => genererGrooveBox({
    cle: "D", gamme: "mineur", genre: "pop", progression: "I-V-vi-IV", extension: "aucune", tempo: 110, dureeAccord: 2,
    nbAccords: 8, styleRythme: "Pop dance", neurones: 15, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
    densite: 0.7, repetition: 0.25, silence: 0.1, graine,
  });

  it.each([3, 11, 29])("signale la basse et la mélodie seules, pas les accords (graine %i)", (graine) => {
    const g = gb(graine);
    const lire = (o: Uint8Array) => midiVersAbc(o, OPTS);
    expect(lire(g.midiBasse).ligneSeule).toBe(true);
    expect(lire(g.midiMelodie).ligneSeule).toBe(true);
    expect(lire(g.midiAccords).ligneSeule).toBe(false);
    expect(lire(g.midiBasse).avertissements.join()).toMatch(/ligne seule, peu fiable/);
    expect(lire(g.midiAccords).avertissements.join()).not.toMatch(/ligne seule/);
  });

  it("ne classe pas une mélodie legato comme de l'harmonie", () => {
    // Le premier critère — part du temps à plusieurs notes — échouait ici : les
    // notes de la mélodie se chevauchent 10 à 16 % du temps.
    const legato = midi([[60, 0, 1.25], [62, 1, 1.25], [64, 2, 1.25], [65, 3, 1]]);
    expect(midiVersAbc(legato, OPTS).ligneSeule).toBe(true);
  });

  it("ne signale rien quand la tonalité est imposée", () => {
    expect(midiVersAbc(gb(3).midiBasse, { ...OPTS, tonalite: "Dm" }).avertissements.join()).not.toMatch(/ligne seule/);
  });
});

describe("critère 2 — la tonalité des générateurs", () => {
  it.each([
    ["C", "majeur", "C"], ["A", "mineur", "Am"], ["D", "majeur", "D"], ["E", "mineur", "Em"], ["F", "majeur", "F"], ["G", "mineur", "Gm"],
  ])("Groove Box en %s %s → K:%s", (cle, gamme, attendu) => {
    const g = genererGrooveBox({
      cle, gamme, genre: "pop", progression: "I-V-vi-IV", extension: "aucune", tempo: 110, dureeAccord: 2,
      nbAccords: 8, styleRythme: "Pop dance", neurones: 15, connectivite: 0.3, memoire: 0.3, spectre: 0.9, octave: 4,
      densite: 0.7, repetition: 0.25, silence: 0.1, graine: 7,
    });
    const r = midiVersAbc(g.midiBytes, OPTS);
    expect(r.cle).toBe(attendu);
  });
});
