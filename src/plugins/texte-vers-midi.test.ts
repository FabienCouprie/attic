// plugins/texte-vers-midi.test.ts — Le lecteur de la notation texte, éprouvé par ce que le nœud rend.
//
// LA REVUE DES NOTATIONS EN TEXTE, ouverte le 2026-11-22 : ce lecteur n'avait aucun test, et le banc
// des gammes s'appuie sur lui pour lire les sorties « Notation ». Les cas viennent de sa notice, la
// seule spécification du format, et des décisions de Fabien du 2026-11-22 :
//  - un texte qui porte une ligne fautive est refusé en entier, et le message nomme chaque ligne,
//    son numéro et sa raison ; rien n'est remplacé ni jeté en silence ;
//  - les doubles altérations et les durées en fraction se lisent ;
//  - chaque « Tempo » s'écrit dans le fichier MIDI.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";
import { parseMidi } from "midi-file";

const fiche = registre.trouverDef("texte-vers-midi") as unknown as FicheLancable;

/** Les notes que rend le fichier MIDI du nœud : hauteur, départ et fin en secondes, nuance. */
async function rendu(texte: string) {
  const r = await lancerFiche(fiche, { Notation: texte }, { entrees: [null] });
  const midi = r.valeurs[1];
  const notes = midi instanceof File ? (await notesDuMidi(midi)) ?? [] : [];
  return { r, notes: notes.map((n) => [n.note, Number(n.debut.toFixed(3)), Number(n.fin.toFixed(3)), n.velocite]) };
}

describe("le contrat de la notice", () => {
  it.each([
    ["une note, sa durée en temps", "Tempo 120\nC4 0.5", [[60, 0, 0.25, 80]]],
    ["un accord", "Tempo 120\nC4+E4+G4 1", [[60, 0, 0.5, 80], [64, 0, 0.5, 80], [67, 0, 0.5, 80]]],
    ["un silence", "Tempo 120\nC4 1\nrest 0.5\nE4 1", [[60, 0, 0.5, 80], [64, 0.75, 1.25, 80]]],
    ["une vélocité", "Tempo 120\nC4 1 100", [[60, 0, 0.5, 100]]],
    ["le tempo du texte", "Tempo 60\nC4 1", [[60, 0, 1, 80]]],
    ["les bémols", "Tempo 120\nEb4 1\nBb3 1", [[63, 0, 0.5, 80], [58, 0.5, 1, 80]]],
    ["Cb et B# à cheval sur l'octave", "Tempo 120\nCb4 1\nB#3 1", [[59, 0, 0.5, 80], [60, 0.5, 1, 80]]],
    ["les bornes du clavier", "Tempo 120\nC-1 1\nG9 1", [[0, 0, 0.5, 80], [127, 0.5, 1, 80]]],
    ["un silence de tête", "Tempo 120\nrest 1\nC4 1", [[60, 0.5, 1, 80]]],
    ["les minuscules et les commentaires", "tempo 120\n# un commentaire\nc4 1 // et un autre\ne4 1", [[60, 0, 0.5, 80], [64, 0.5, 1, 80]]],
  ])("%s", async (_t, texte, attendu) => {
    const { r, notes } = await rendu(texte);
    expect(r.erreurRendue).toBe(false);
    expect(notes).toEqual(attendu);
  });
});

describe("les écritures que la notice nomme depuis le 2026-11-22", () => {
  it.each([
    ["les doubles dièses", "Tempo 120\nC##4 1\nCx4 1", [[62, 0, 0.5, 80], [62, 0.5, 1, 80]]],
    ["les doubles bémols", "Tempo 120\nBbb3 1", [[57, 0, 0.5, 80]]],
    ["la septième diminuée que Tonal écrit", "Tempo 120\nC4+Eb4+Gb4+Bbb4 1", [[60, 0, 0.5, 80], [63, 0, 0.5, 80], [66, 0, 0.5, 80], [69, 0, 0.5, 80]]],
    ["une durée en fraction", "Tempo 120\nC4 1/2\nD4 3/2", [[60, 0, 0.25, 80], [62, 0.25, 1, 80]]],
  ])("%s", async (_t, texte, attendu) => {
    const { r, notes } = await rendu(texte);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(notes).toEqual(attendu);
  });
});

describe("LES SORTIES « NOTATION », RELUES, REDONNENT LE FICHIER MIDI DE LEUR NŒUD, nuance comprise", () => {
  // Décision de Fabien du 2026-11-22 : la Gamme jouée et les Accords joués n'écrivaient pas la
  // vélocité, et la nuance se perdait à la relecture, 90 jouée, 80 relue.
  type F = FicheLancable & { parametres: { nom: string; optionIds?: string[] }[] };
  const ids = (f: F, nom: string) => f.parametres.find((p) => p.nom === nom)!.optionIds!;
  const lire = async (v: unknown) => (v instanceof File ? (await notesDuMidi(v)) ?? [] : []);
  const cle = (n: { note: number; debut: number; fin: number; velocite: number }, tenue: boolean) =>
    `${n.note}@${n.debut.toFixed(2)}${tenue ? `-${n.fin.toFixed(2)}` : ""}v${n.velocite}`;
  const relus = async (texte: string) => lire((await lancerFiche(fiche, { Notation: texte }, { entrees: [null] })).valeurs[1]);

  it("la Gamme jouée, sous chaque gamme et chaque sens, à la nuance 70", async () => {
    const f = registre.trouverDef("gamme-jouee") as unknown as F;
    const fautes: string[] = [];
    for (const gamme of ids(f, "Gamme")) for (const sens of ids(f, "Sens")) {
      const r = await lancerFiche(f, { Gamme: gamme, Sens: sens, Nuance: 70, Graine: 1 }, {});
      const joue = (await lire(r.valeurs[1])).map((n) => cle(n, true)).sort();
      const relu = (await relus(String(r.valeurs[2]))).map((n) => cle(n, true)).sort();
      if (JSON.stringify(joue) !== JSON.stringify(relu)) fautes.push(`${gamme}, ${sens} : ${joue.slice(0, 2).join(" ")} contre ${relu.slice(0, 2).join(" ")}`);
    }
    expect(fautes).toEqual([]);
  }, 120_000);

  it("les Accords joués, sous chaque accord et chaque façon ; en roulé, sans la tenue que le format ne dit pas", async () => {
    const f = registre.trouverDef("accords-joues") as unknown as F;
    const fautes: string[] = [];
    for (const accord of ids(f, "Accord")) for (const facon of ids(f, "Façon")) {
      const r = await lancerFiche(f, { Accord: accord, "Façon": facon, Nuance: 70, Graine: 1 }, {});
      const tenue = facon !== "roule";
      const joue = (await lire(r.valeurs[1])).map((n) => cle(n, tenue)).sort();
      const relu = (await relus(String(r.valeurs[2]))).map((n) => cle(n, tenue)).sort();
      if (JSON.stringify(joue) !== JSON.stringify(relu)) fautes.push(`${accord}, ${facon} : ${joue.slice(0, 2).join(" ")} contre ${relu.slice(0, 2).join(" ")}`);
    }
    expect(fautes).toEqual([]);
  }, 120_000);
});

describe("UN TEMPO EN COURS DE TEXTE S'ÉCRIT DANS LE FICHIER, à son instant", () => {
  it("deux tempos, et chaque note dure son temps en ticks comme en secondes", async () => {
    // Décision de Fabien du 2026-11-22. Le fichier ne portait que le dernier tempo : les secondes
    // restaient justes, mais un temps à 120 BPM s'y écrivait comme un demi-temps à 60.
    const { r, notes } = await rendu("Tempo 120\nC4 1\nTempo 60\nD4 1");
    expect(notes).toEqual([[60, 0, 0.5, 80], [62, 0.5, 1.5, 80]]);
    const midi = parseMidi(new Uint8Array(await (r.valeurs[1] as File).arrayBuffer()));
    const evenements: { tick: number; type: string; microsecondsPerBeat?: number; noteNumber?: number }[] = [];
    for (const piste of midi.tracks) {
      let tick = 0;
      for (const e of piste) { tick += e.deltaTime; evenements.push({ ...(e as object), tick } as never); }
    }
    expect(evenements.filter((e) => e.type === "setTempo").map((e) => [e.tick, e.microsecondsPerBeat])).toEqual([[0, 500000], [480, 1000000]]);
    expect(evenements.filter((e) => e.type === "noteOn").map((e) => [e.noteNumber, e.tick])).toEqual([[60, 0], [62, 480]]);
    expect(evenements.filter((e) => e.type === "noteOff").map((e) => [e.noteNumber, e.tick])).toEqual([[60, 480], [62, 960]]);
    expect(r.message).toContain("120 → 60");
  });
});

describe("UN TEXTE QUI PORTE UNE LIGNE FAUTIVE EST REFUSÉ EN ENTIER, et le message la nomme", () => {
  it.each([
    ["une en-tête mal écrite", "BPM 120\nC4 1", 1, "BPM"],
    ["une note illisible", "Tempo 120\nC4 1\nH4 1\nE4 1", 3, "H4"],
    ["une note illisible dans un accord", "Tempo 120\nC4+X4+G4 1", 2, "X4"],
    ["une note hors du clavier", "Tempo 120\nA9 1", 2, "A9"],
    ["un mot inconnu", "Tempo 120\nC4 1\nsilence 1", 3, "silence"],
    ["une durée nulle", "Tempo 120\nC4 0", 2, "0"],
    ["une durée négative", "Tempo 120\nC4 -1", 2, "-1"],
    ["une durée illisible", "Tempo 120\nC4 abc", 2, "abc"],
    ["une vélocité nulle", "Tempo 120\nC4 1 0", 2, "0"],
    ["une vélocité hors de l'octet", "Tempo 120\nC4 1 200", 2, "200"],
    ["un tempo nul", "Tempo 0\nC4 1", 1, "0"],
    ["des mots en trop", "Tempo 120\nC4 1 90 fort", 2, "fort"],
  ])("%s", async (_t, texte, ligne, fautif) => {
    const { r, notes } = await rendu(texte);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(notes).toEqual([]);
    expect(r.message).toContain(String(ligne));
    expect(r.message).toContain(`« ${fautif} »`);
  });

  it("nomme toutes les lignes fautives, et non la première seule", async () => {
    const { r } = await rendu("Tempo 120\nH4 1\nC4 1\nC4 abc");
    expect(r.message).toContain("« H4 »");
    expect(r.message).toContain("« abc »");
  });
});
