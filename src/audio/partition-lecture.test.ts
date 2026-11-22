// audio/partition-lecture.test.ts — La lecture d'une partition par Verovio, sur le vrai moteur.
//
// LA PIÈCE EST ÉCRITE POUR PIÉGER : deux portées de deux voix, une anacrouse, l'alto qui passe
// au-dessus du soprano au deuxième temps, une liaison d'alto à travers la barre, un soupir d'alto
// et une reprise. Les attendus sont lus sur la partition, note à note, et non tirés du code : une
// voix est une couche d'une portée, la liaison fait une seule note, et la reprise n'est pas dépliée.

import { describe, expect, it } from "vitest";
import { lireDepuisVerovio, lireMei, type ToolkitPartition } from "./partition-lecture";
import type { Note } from "./note";

const PIECE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Choeur</part-name></score-part></part-list>
<part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
<note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>1</duration></backup><note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>1</duration></backup><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
<backup><duration>1</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>6</voice><type>quarter</type><staff>2</staff></note>
</measure>
<measure number="1"><barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><voice>2</voice><type>half</type><staff>1</staff><notations><tied type="start"/></notations></note>
<backup><duration>4</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>6</voice><type>half</type><staff>2</staff></note>
<note><pitch><step>F</step><octave>2</octave></pitch><duration>2</duration><voice>6</voice><type>half</type><staff>2</staff></note>
<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline></measure>
<measure number="2">
<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><voice>2</voice><type>quarter</type><staff>1</staff><notations><tied type="stop"/></notations></note>
<note><rest/><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
<note><pitch><step>B</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice><type>half</type><staff>1</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff></note>
<note><pitch><step>F</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><type>half</type><staff>2</staff></note>
<backup><duration>4</duration></backup>
<note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>6</voice><type>whole</type><staff>2</staff></note>
<barline location="right"><bar-style>light-heavy</bar-style></barline></measure>
</part></score-partwise>`;

/** Un choral de quatre noires, écrit à la main : basse, ténor, alto, soprano, de gauche à droite. */
const KERN = [
  "**kern\t**kern\t**kern\t**kern",
  "*clefF4\t*clefGv2\t*clefG2\t*clefG2",
  "*M4/4\t*M4/4\t*M4/4\t*M4/4",
  "=1-\t=1-\t=1-\t=1-",
  "4C\t4c\t4e\t4g",
  "4F\t4c\t4f\t4a",
  "4G\t4B\t4d\t4g",
  "4C\t4c\t4e\t4cc",
  "==\t==\t==\t==",
  "*-\t*-\t*-\t*-",
].join("\n");

async function charger(texte: string, module: "verovio/wasm" | "verovio/wasm-hum", entree: string) {
  const creer = ((await import(module)) as { default: () => Promise<unknown> }).default;
  const { VerovioToolkit } = (await import("verovio/esm")) as unknown as { VerovioToolkit: new (m: unknown) => ToolkitPartition & { setOptions(o: object): void; loadData(t: string): unknown; destroy(): void } };
  const tk = new VerovioToolkit(await creer());
  tk.setOptions({ inputFrom: entree, expandNever: true });
  expect(Boolean(tk.loadData(texte))).toBe(true);
  return tk;
}

/** Les notes d'une voix en [hauteur, début en noires, fin en noires], à 60 à la noire. */
const voix = (notes: Note[], v: number) => notes.filter((n) => n.voix === v).map((n) => [n.note, n.debut, n.fin]);

describe("lireDepuisVerovio", () => {
  it("tire une voix de chaque couche, liaison jointe, reprise non dépliée", async () => {
    const tk = await charger(PIECE, "verovio/wasm", "musicxml");
    const { sequence, liees } = lireDepuisVerovio(tk, 60);
    tk.destroy();
    expect(voix(sequence.notes, 0)).toEqual([[67, 0, 1], [72, 1, 2], [71, 2, 3], [69, 3, 5], [67, 5, 9]]);
    expect(voix(sequence.notes, 1)).toEqual([[64, 0, 1], [64, 1, 2], [74, 2, 3], [60, 3, 6], [59, 7, 9]]);
    expect(voix(sequence.notes, 2)).toEqual([[60, 0, 1], [55, 1, 5], [55, 5, 7], [53, 7, 9]]);
    expect(voix(sequence.notes, 3)).toEqual([[48, 0, 1], [48, 1, 3], [41, 3, 5], [43, 5, 9]]);
    expect(liees).toBe(1);
    expect(sequence.duree).toBe(9);
  });

  it("garde l'alto à sa place quand il passe au-dessus du soprano", async () => {
    const tk = await charger(PIECE, "verovio/wasm", "musicxml");
    const { sequence } = lireDepuisVerovio(tk, 60);
    tk.destroy();
    const auDeuxiemeTemps = sequence.notes.filter((n) => n.debut === 2);
    expect(auDeuxiemeTemps.find((n) => n.voix === 1)?.note).toBe(74);
    expect(auDeuxiemeTemps.find((n) => n.voix === 0)?.note).toBe(71);
  });

  it("lit le MEI de la pièce comme la pièce elle-même", async () => {
    const tk = await charger(PIECE, "verovio/wasm", "musicxml");
    const mei = tk.getMEI({});
    const depuisXml = lireDepuisVerovio(tk, 60).sequence.notes;
    tk.destroy();
    const tk2 = await charger(mei, "verovio/wasm", "mei");
    const depuisMei = lireDepuisVerovio(tk2, 60).sequence.notes;
    tk2.destroy();
    expect(depuisMei).toEqual(depuisXml);
  });

  it("prend le tempo écrit quand aucun n'est imposé, 120 à défaut", async () => {
    const tk = await charger(PIECE, "verovio/wasm", "musicxml");
    const { sequence, tempoLu } = lireDepuisVerovio(tk);
    tk.destroy();
    expect(sequence.tempo).toBe(tempoLu ?? 120);
  });

  it("lit un Humdrum par le module qui le connaît, le soprano en première voix", async () => {
    const tk = await charger(KERN, "verovio/wasm-hum", "humdrum");
    const { sequence } = lireDepuisVerovio(tk, 60);
    tk.destroy();
    expect(voix(sequence.notes, 0).map((x) => x[0])).toEqual([67, 69, 67, 72]);
    expect(voix(sequence.notes, 1).map((x) => x[0])).toEqual([64, 65, 62, 64]);
    expect(voix(sequence.notes, 2).map((x) => x[0])).toEqual([60, 60, 59, 60]);
    expect(voix(sequence.notes, 3).map((x) => x[0])).toEqual([48, 53, 55, 48]);
  });
});

describe("lireMei", () => {
  it("lit portée, couche, nom de portée et fin de liaison", () => {
    const mei = '<staffDef n="1" label="Soprano"/><staff n="1"><layer n="2"><note xml:id="a"/></layer></staff><tie startid="#a" endid="#b"/>';
    const { places, finsDeLiaison, noms } = lireMei(mei);
    expect(places.get("a")).toEqual({ portee: 1, couche: 2 });
    expect([...finsDeLiaison]).toEqual(["b"]);
    expect(noms.get(1)).toBe("Soprano");
  });
});
