// @vitest-environment jsdom
// plugins/vexflow-gravure.test.ts — Ce qu'un musicien lit sur la portée gravée, comparé à ce qui est écrit.
//
// LA REVUE DES NOTATIONS EN TEXTE, troisième format, 2026-11-22. Les tests d'avant regardaient qu'un
// SVG sortait ; aucun ne regardait ce qui y est dessiné. Celui-ci relève ce que VexFlow dessine
// vraiment, note par note, barre par barre, liaison par liaison, et le RELIT selon les règles de la
// gravure : une altération vaut pour la même lettre à la même octave jusqu'à la barre, la barre les
// efface, une liaison prolonge la note sans rien changer aux altérations de la mesure. Ce qu'il lit
// doit être ce qui a été écrit, en hauteur, en attaque et en durée, comptées en noires.
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : les points se lisent, toute autre durée hors des six est
// refusée en la nommant ; la portée se coupe en mesures de 4/4.
import { beforeAll, describe, expect, it } from "vitest";
import { Accidental, BarNote, Dot, Stave, StaveNote, StaveTie, TabNote, TabStave } from "vexflow";
import { fiches } from "./vexflow";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import { writeMidi } from "midi-file";

type Element = { barre: true } | { barre: false; note: any };
let dessin: { elements: Element[]; liaisons: any[]; mesures: string[]; tab: string[]; lignes: number[] };

beforeAll(() => {
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
  const note = StaveNote.prototype.draw;
  StaveNote.prototype.draw = function (this: any) { dessin.elements.push({ barre: false, note: this }); return note.call(this); };
  const barre = BarNote.prototype.draw;
  BarNote.prototype.draw = function (this: any) { dessin.elements.push({ barre: true }); return barre.call(this); };
  const liaison = StaveTie.prototype.draw;
  StaveTie.prototype.draw = function (this: any) { dessin.liaisons.push(this.getNotes()); return liaison.call(this); };
  const mesure = Stave.prototype.addTimeSignature;
  Stave.prototype.addTimeSignature = function (this: any, t: string, ...r: any[]) { dessin.mesures.push(t); return mesure.call(this, t, ...r); };
  const tab = TabNote.prototype.draw;
  // La tablature ne dessine ni hampe ni point : sa durée ne se voit qu'à l'espacement, et c'est donc
  // la longueur que VexFlow lui donne, en noires, qui se relève.
  TabNote.prototype.draw = function (this: any) {
    dessin.tab.push(`${this.positions.map((p: any) => `${p.str}-${p.fret}`).join("+")}/${this.getTicks().value() / 4096}`);
    return tab.call(this);
  };
  const portee = TabStave.prototype.draw;
  TabStave.prototype.draw = function (this: any) { dessin.lignes.push(this.getNumLines()); return portee.call(this); };
});

const DEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ALTERATION: Record<string, number> = { "#": 1, "##": 2, b: -1, bb: -2, n: 0 };
const NOIRES: Record<string, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };

/** La lecture d'un musicien : les notes, en hauteur, attaque et durée, la durée de chaque mesure, et les silences. */
function lire() {
  const notes: { midi: number; debut: number; duree: number }[] = [];
  const mesures: number[] = [];
  const silences: string[] = [];
  let t = 0, debutMesure = 0;
  let enVigueur = new Map<string, number>();
  const tenues = new Map<any, Map<number, { midi: number; debut: number; duree: number }>>();
  for (const e of dessin.elements) {
    if (e.barre) { mesures.push(t - debutMesure); debutMesure = t; enVigueur = new Map(); continue; }
    const n = e.note;
    const points = n.getModifiersByType(Dot.CATEGORY).filter((d: any) => d.getIndex() === 0).length;
    const duree = NOIRES[n.getDuration()] * (2 - 1 / 2 ** points);
    if (n.isRest()) { silences.push(n.getDuration() + ".".repeat(points)); t += duree; continue; }
    const dessinees = new Map<number, string>();
    for (const a of n.getModifiersByType(Accidental.CATEGORY)) dessinees.set(a.getIndex(), a.type);
    const venue = dessin.liaisons.find((l) => l.last_note === n);
    const lues = new Map<number, { midi: number; debut: number; duree: number }>();
    n.getKeys().forEach((cle: string, k: number) => {
      const [nom, octave] = cle.split("/");
      const lettre = nom[0].toUpperCase();
      const ici = `${lettre}${octave}`;
      const depuis = venue ? venue.first_indices[venue.last_indices.indexOf(k)] : undefined;
      const tenue = depuis !== undefined ? tenues.get(venue.first_note)?.get(depuis) : undefined;
      if (tenue) { tenue.duree += duree; lues.set(k, tenue); return; }
      if (dessinees.has(k)) enVigueur.set(ici, ALTERATION[dessinees.get(k)!]);
      const lue = { midi: 12 * (Number(octave) + 1) + DEMI[lettre] + (enVigueur.get(ici) ?? 0), debut: t, duree };
      notes.push(lue);
      lues.set(k, lue);
    });
    tenues.set(n, lues);
    t += duree;
  }
  mesures.push(t - debutMesure);
  const arrondi = (x: number) => Math.round(x * 1000) / 1000;
  return {
    notes: notes.map((x) => [x.midi, arrondi(x.debut), arrondi(x.duree)]).sort((a, b) => a[1] - b[1] || a[0] - b[0]),
    mesures, silences, signatures: dessin.mesures,
  };
}

const F = (id: string) => fiches.find((f) => f.id === id) as unknown as FicheLancable;
async function graver(id: string, reglages: Record<string, string | number>, entree: unknown = null) {
  dessin = { elements: [], liaisons: [], mesures: [], tab: [], lignes: [] };
  const r = await lancerFiche(F(id), reglages, { entrees: [entree] });
  return { r, ...lire(), tab: dessin.tab, lignes: dessin.lignes };
}
/** Les notes attendues, accords écrits d'un bloc : [[hauteurs], attaque, durée]. */
const N = (...accords: [number[], number, number][]) =>
  accords.flatMap(([h, d, l]) => h.map((m) => [m, d, l])).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

describe("LA PORTÉE SE LIT COMME ELLE EST ÉCRITE", () => {
  it.each([
    ["les six durées", "C4/q D4/8 E4/8 F4/q G4/q", N([[60], 0, 1], [[62], 1, 0.5], [[64], 1.5, 0.5], [[65], 2, 1], [[67], 3, 1]), [4]],
    ["une noire pointée", "C4/q. D4/8 E4/h", N([[60], 0, 1.5], [[62], 1.5, 0.5], [[64], 2, 2]), [4]],
    ["une blanche doublement pointée", "C4/h.. D4/8", N([[60], 0, 3.5], [[62], 3.5, 0.5]), [4]],
    ["deux mesures", "C4/w D4/w", N([[60], 0, 4], [[62], 4, 4]), [4, 4]],
    ["une note à travers la barre, liée", "C4/h. D4/h E4/q", N([[60], 0, 3], [[62], 3, 2], [[64], 5, 1]), [4, 4]],
    ["le bécarre après le dièse", "F#4/q F4/q G4/q F4/q", N([[66], 0, 1], [[65], 1, 1], [[67], 2, 1], [[65], 3, 1]), [4]],
    ["le bécarre après le bémol", "Bb4/q B4/q C5/h", N([[70], 0, 1], [[71], 1, 1], [[72], 2, 2]), [4]],
    ["la barre efface l'altération", "F#4/w F4/w", N([[66], 0, 4], [[65], 4, 4]), [4, 4]],
    ["le dièse redit à la mesure suivante", "F#4/w F#4/w", N([[66], 0, 4], [[66], 4, 4]), [4, 4]],
    ["une autre octave n'hérite pas", "F#4/q F5/q F4/h", N([[66], 0, 1], [[77], 1, 1], [[65], 2, 2]), [4]],
    ["une liaison à travers la barre garde son dièse, pour elle seule", "C4/h. F#4/h F4/q G4/h",
      N([[60], 0, 3], [[66], 3, 2], [[65], 5, 1], [[67], 6, 2]), [4, 4]],
    ["doubles altérations et bécarre écrit", "C##4/q Dbb4/q Fn4/h", N([[62], 0, 1], [[60], 1, 1], [[65], 2, 2]), [4]],
    ["les minuscules", "c4/q f#4/q bb4/q e4/q", N([[60], 0, 1], [[66], 1, 1], [[70], 2, 1], [[64], 3, 1]), [4]],
    ["un silence", "C4/q B4/q/r E4/h", N([[60], 0, 1], [[64], 2, 2]), [4]],
    ["un accord en +", "C4+E4+G4/q D4/q E4/h", N([[60, 64, 67], 0, 1], [[62], 1, 1], [[64], 2, 2]), [4]],
    ["un accord entre parenthèses", "(C4 E4 G4)/q D4/q E4/h", N([[60, 64, 67], 0, 1], [[62], 1, 1], [[64], 2, 2]), [4]],
  ])("%s", async (_titre, notation, attendu, mesures) => {
    const g = await graver("vexflow-portee", { Notation: notation });
    expect(g.r.erreurRendue, g.r.message.slice(0, 200)).toBe(false);
    expect(g.notes).toEqual(attendu);
    expect(g.mesures).toEqual(mesures);
    expect(g.signatures).toEqual(["4/4"]);
  });

  it("UNE MESURE INCOMPLÈTE SE FINIT PAR DES SILENCES POSÉS SUR LES TEMPS : un soupir, puis une demi-pause", async () => {
    const g = await graver("vexflow-portee", { Notation: "C4/q" });
    expect(g.notes).toEqual(N([[60], 0, 1]));
    expect(g.silences).toEqual(["q", "h"]);
    expect(g.mesures).toEqual([4]);
  });
});

describe("UNE DURÉE OU UNE NOTE QUE LA NOTATION NE CONNAÎT PAS EST REFUSÉE, et le message la nomme", () => {
  it.each([
    ["une durée inconnue", "C4/x D4/q", "C4/x"],
    ["un chiffre qui n'est pas des six", "C4/q D4/3", "D4/3"],
    ["un triolet écrit", "C4/8t D4/8t E4/8t F4/h", "C4/8t"],
    ["trop de points", "C4/q.... D4/q", "C4/q...."],
    ["une lettre qui n'est pas une note", "H4/q C4/q", "H4/q"],
    ["une note sans octave", "C/q D4/q", "C/q"],
    ["une octave hors du clavier", "C10/q D4/q", "C10/q"],
    ["un type inconnu après la durée", "C4/q/z D4/q", "C4/q/z"],
  ])("%s", async (_titre, notation, fautif) => {
    const g = await graver("vexflow-portee", { Notation: notation });
    expect(g.r.erreurRendue).toBe(true);
    expect(g.r.message).toContain(`« ${fautif} »`);
    expect(g.notes).toEqual([]);
  });
});

describe("LA TABLATURE SE DESSINE SUR LES CORDES DE SON INSTRUMENT", () => {
  it.each([
    ["la guitare, six lignes", "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q", "Guitare standard", 6, ["6-3/1", "5-0/1", "5-2/1", "4-0/1", "5-3/1"]],
    ["le ukulélé, quatre lignes", "4-0/q 3-0/q 2-0/q 1-0/q", "Ukulélé", 4, ["4-0/1", "3-0/1", "2-0/1", "1-0/1"]],
    ["la basse, quatre lignes", "4-3/q 3-0/q 2-2/q 1-0/q", "Basse", 4, ["4-3/1", "3-0/1", "2-2/1", "1-0/1"]],
    ["les points se lisent", "6-3/q. 5-0/8 5-0/h", "Guitare standard", 6, ["6-3/1.5", "5-0/0.5", "5-0/2"]],
    ["trois temps se dessinent", "6-3/q 5-0/q 4-0/q", "Guitare standard", 6, ["6-3/1", "5-0/1", "4-0/1"]],
    ["un jeton sans durée vaut une noire, comme la notice le dit", "6-3 5-0 5-0 5-0", "Guitare standard", 6, ["6-3/1", "5-0/1", "5-0/1", "5-0/1"]],
  ])("%s", async (_titre, tablature, accordage, lignes, attendu) => {
    const g = await graver("vexflow-tab", { Tablature: tablature, Accordage: accordage });
    expect(g.r.erreurRendue, g.r.message.slice(0, 200)).toBe(false);
    expect(g.lignes).toEqual([lignes]);
    expect(g.tab).toEqual(attendu);
  });

  it.each([
    ["une septième corde sur une guitare", "7-3/q 6-0/q 6-0/q 6-0/q", "Guitare standard", "7-3/q"],
    ["une cinquième corde sur un ukulélé", "5-3/q 4-0/q 4-0/q 4-0/q", "Ukulélé", "5-3/q"],
    ["la corde zéro", "0-3/q 6-0/q 6-0/q 6-0/q", "Guitare standard", "0-3/q"],
    ["un accord, que la notation n'écrit pas", "6-3+5-2/q 4-0/q 4-0/q 4-0/q", "Guitare standard", "6-3+5-2/q"],
    ["une durée inconnue", "6-3/x 5-0/q 5-0/q 5-0/q", "Guitare standard", "6-3/x"],
  ])("%s est refusé(e), et nommé(e)", async (_titre, tablature, accordage, fautif) => {
    const g = await graver("vexflow-tab", { Tablature: tablature, Accordage: accordage });
    expect(g.r.erreurRendue).toBe(true);
    expect(g.r.message).toContain(`« ${fautif} »`);
    expect(g.r.message).not.toContain("RuntimeError");
    expect(g.tab).toEqual([]);
  });
});

describe("LA GRILLE ÉCRIT CHAQUE ACCORD UNE FOIS, ET LIT LES CHIFFRES ROMAINS JETON PAR JETON", () => {
  const textes = (svg: unknown) => [...String(svg).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  it.each([
    ["des symboles", "C Am F G", "C", "majeur", ["C", "Am", "F", "G"]],
    ["des romains", "I V vi IV", "C", "majeur", ["C", "G", "Am", "F"]],
    ["des romains qui commencent par une septième", "V7 I", "C", "majeur", ["G7", "C"]],
    ["des romains qui commencent par un bémol", "bVII IV I", "C", "majeur", ["Bb", "F", "C"]],
    ["des romains qui commencent par un diminué", "ii° V i", "A", "mineur", ["B°", "E", "Am"]],
    // Cinquième format, décisions de Fabien du 2026-11-22 : les écritures usuelles se lisent, par le
    // seul lecteur des symboles, et « N.C. » est un accord silencieux, écrit tel quel dans sa mesure.
    ["les écritures usuelles", "Bø7 CΔ7 B♭ Cm(maj7)", "C", "majeur", ["Bm7b5", "Cmaj7", "Bb", "CmMaj7"]],
    ["un accord silencieux", "C N.C. G", "C", "majeur", ["C", "N.C.", "G"]],
    // Sixième format : la lecture d'Attic, et le premier jeton qui décide.
    ["des romains renversés et secondaires", "I V65/V V7 I6", "C", "majeur", ["C", "D7/F#", "G7", "C/E"]],
  ])("%s", async (_titre, accords, tonalite, gamme, attendu) => {
    const g = await graver("vexflow-grille", { Accords: accords, "Tonalité": tonalite, Gamme: gamme });
    expect(g.r.erreurRendue, g.r.message.slice(0, 200)).toBe(false);
    expect(textes(g.r.valeurs[0])).toEqual(attendu);
  });
});

describe("LA PARTITION D'ACCORDS SE LIT COMME ELLE EST ÉCRITE", () => {
  // CHAQUE ACCORD À L'ÉTAT FONDAMENTAL, depuis l'octave 4 : décision de Fabien du 2026-11-22, « Root
  // position ». Ces cas posaient toutes les notes à l'octave 4, et sol majeur sonnait ré–sol–si.
  it.each([
    ["le sol naturel après le sol dièse", "E C", N([[64, 68, 71], 0, 1], [[60, 64, 67], 1, 1]), [4]],
    ["le do naturel après le do dièse", "A C", N([[69, 73, 76], 0, 1], [[60, 64, 67], 1, 1]), [4]],
    ["des romains qui commencent par une septième", "V7 I", N([[67, 71, 74, 77], 0, 1], [[60, 64, 67], 1, 1]), [4]],
    ["un accord silencieux prend sa noire", "C N.C. G", N([[60, 64, 67], 0, 1], [[67, 71, 74], 2, 1]), [4]],
    ["une écriture usuelle", "Bø7 B♭", N([[71, 74, 77, 81], 0, 1], [[70, 74, 77], 1, 1]), [4]],
    ["cinq accords, deux mesures", "C F G C F",
      N([[60, 64, 67], 0, 1], [[65, 69, 72], 1, 1], [[67, 71, 74], 2, 1], [[60, 64, 67], 3, 1], [[65, 69, 72], 4, 1]), [4, 4]],
  ])("%s", async (_titre, progression, attendu, mesures) => {
    const g = await graver("vexflow-partition", { Progression: progression, "Tonalité": "C" });
    expect(g.r.erreurRendue, g.r.message.slice(0, 200)).toBe(false);
    expect(g.notes).toEqual(attendu);
    expect(g.mesures).toEqual(mesures);
  });

  it("UN CHIFFRE QUI NE SE LIT PAS, DANS UNE PROGRESSION ROMAINE, EST NOMMÉ, et non un symbole vide", async () => {
    for (const id of ["vexflow-partition", "vexflow-grille"]) {
      const g = await graver(id, id === "vexflow-grille" ? { Accords: "I C V", "Tonalité": "C" } : { Progression: "I C V", "Tonalité": "C" });
      expect(g.r.erreurRendue, id).toBe(true);
      expect(g.r.message, id).toContain("« C »");
    }
  });

  it("UN SYMBOLE INCONNU EST REFUSÉ, ET NOMMÉ", async () => {
    const g = await graver("vexflow-partition", { Progression: "C Zorglub G C", "Tonalité": "C" });
    expect(g.r.erreurRendue).toBe(true);
    expect(g.r.message).toContain("Zorglub");
  });
});

describe("LA PARTITION MIDI SE LIT COMME LE FICHIER JOUE", () => {
  const midi = (notes: [number, number, number][]) =>
    notesVersFichierMidi(notes.map(([note, debut, fin]) => ({ note, debut, fin, velocite: 100 })), 120);
  it("le do naturel après le do dièse", async () => {
    const g = await graver("vexflow-midi", {}, midi([[60, 0, 0.5], [61, 0.5, 1], [60, 1, 1.5], [62, 1.5, 2]]));
    expect(g.notes).toEqual(N([[60], 0, 1], [[61], 1, 1], [[60], 2, 1], [[62], 3, 1]));
    expect(g.mesures).toEqual([4]);
  });
  // DÉCISION DE FABIEN DU 2026-11-22, « Dots and ties » : chaque note garde sa longueur, en valeurs
  // pointées et liées, et chacune est posée à sa propre attaque.
  it.each([
    ["une noire pointée", [[60, 0, 0.75], [62, 0.75, 1], [64, 1, 2]], N([[60], 0, 1.5], [[62], 1.5, 0.5], [[64], 2, 2]), [4]],
    ["une blanche pointée", [[60, 0, 1.5], [62, 1.5, 2]], N([[60], 0, 3], [[62], 3, 1]), [4]],
    ["une note de deux rondes, liée à travers la barre", [[60, 0, 4], [62, 4, 4.5]], N([[60], 0, 8], [[62], 8, 1]), [4, 4, 4]],
    ["une syncope", [[60, 0, 0.25], [62, 0.25, 1], [64, 1, 2]], N([[60], 0, 0.5], [[62], 0.5, 1.5], [[64], 2, 2]), [4]],
    ["un legato s'arrête à l'attaque suivante, qui reste à sa place", [[60, 0, 0.875], [62, 0.5, 1], [64, 1, 1.5]],
      N([[60], 0, 1], [[62], 1, 1], [[64], 2, 1]), [4]],
  ] as [string, [number, number, number][], number[][], number[]][])("%s", async (_titre, notes, attendu, mesures) => {
    const g = await graver("vexflow-midi", {}, midi(notes));
    expect(g.r.erreurRendue, g.r.message.slice(0, 200)).toBe(false);
    expect(g.notes).toEqual(attendu);
    expect(g.mesures).toEqual(mesures);
  });

  it("LA MÉTRIQUE DU FICHIER EST CELLE DE LA PORTÉE : un fichier en 3/4 se grave en mesures de trois noires", async () => {
    const pistes = [[
      { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
      { deltaTime: 0, type: "timeSignature", numerator: 3, denominator: 4, metronome: 24, thirtyseconds: 8 },
      ...[60, 62, 64, 65, 67, 69].flatMap((note) => [
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: note, velocity: 100 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: note, velocity: 0 },
      ]),
      { deltaTime: 0, type: "endOfTrack" },
    ]];
    const octets = new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: pistes } as any));
    const g = await graver("vexflow-midi", {}, new File([octets], "valse.mid", { type: "audio/midi" }));
    expect(g.signatures).toEqual(["3/4"]);
    expect(g.mesures).toEqual([3, 3]);
    expect(g.notes).toEqual(N(...[60, 62, 64, 65, 67, 69].map((h, k) => [[h], k, 1] as [number[], number, number])));
  });

  it("SOUS « TOUS », LA BATTERIE DU CANAL 9 N'EST PAS GRAVÉE, ET LE MESSAGE LE DIT ; choisie par son numéro, elle l'est", async () => {
    const melodie = [[60, 0, 0.5], [62, 0.5, 1]].map(([note, debut, fin]) => ({ note, debut, fin, velocite: 100 }));
    const caisse = [[36, 0, 0.5], [38, 0.5, 1]].map(([note, debut, fin]) => ({ note, debut, fin, velocite: 100 }));
    const fusion = await import("../audio/midi-ecriture");
    const fichier = fusion.notesVersFichierMidi(melodie, 120);
    const batterie = fusion.notesVersFichierMidi(caisse, 120, 9);
    const tous = await graver("vexflow-midi", {}, batterie);
    expect(tous.notes).toEqual([]);
    expect(tous.r.message).toMatch(/Canal 9/);
    const neuf = await graver("vexflow-midi", { Canal: 9 }, batterie);
    expect(neuf.notes).toEqual(N([[36], 0, 1], [[38], 1, 1]));
    const sansBatterie = await graver("vexflow-midi", {}, fichier);
    expect(sansBatterie.notes).toEqual(N([[60], 0, 1], [[62], 1, 1]));
    expect(sansBatterie.r.message).not.toMatch(/Canal 9/);
  });

  it("seize noires, quatre mesures", async () => {
    const g = await graver("vexflow-midi", {}, midi(Array.from({ length: 16 }, (_, k) => [60 + (k % 3), k * 0.5, k * 0.5 + 0.5] as [number, number, number])));
    expect(g.mesures).toEqual([4, 4, 4, 4]);
    expect(g.notes).toEqual(N(...Array.from({ length: 16 }, (_, k) => [[60 + (k % 3)], k, 1] as [number[], number, number])));
  });
});
