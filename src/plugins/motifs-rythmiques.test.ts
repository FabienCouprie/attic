// plugins/motifs-rythmiques.test.ts — Un motif rythmique se lit comme le dit sa documentation, et ce qui ne se lit pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, dixième format, 2026-11-22. Tout passe par `executer`. Un motif en
// cases, « x..x..x. », suit l'usage des percussionnistes et Toussaint, « The Geometry of Musical
// Rhythm » (2013) ; un motif en positions, « 0 3 6 », compte les frappes depuis zéro.
//
// DÉCISION DE FABIEN DU 2026-11-22, « Refuse it, named » : une position hors du cycle est refusée et
// nommée. Elle se repliait sans un mot : 20 devenait 4 sur seize pas, et 14 devenait 2 sur douze.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { entreesDEssai, lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import { notesDuMidi } from "../audio/midi";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;

describe("L'ANALYSE RYTHMIQUE LIT LES CASES ET LES POSITIONS COMME SA DOCUMENTATION LES DÉCRIT", () => {
  const ANALYSE = (motif: string) => lancerFiche(F("analyse-rythme"), { Motif: motif, Pas: 16 }, { entrees: [null] });
  const rythme = (v: unknown) => String(v ?? "").split("\n")[0];

  it.each([
    ["la clave en cases", "x..x..x...x.x...", "Rythme : x..x..x...x.x...   (5/16)"],
    ["la clave en positions", "0 3 6 10 12", "Rythme : x..x..x...x.x...   (5/16)"],
    ["des positions faites de 0 et de 1", "0 1", "Rythme : xx..............   (2/16)"],
    ["des positions 0 et 10", "0 10", "Rythme : x.........x.....   (2/16)"],
    ["des 0 et des 1 espacés, des positions", "1 0 0 1", "Rythme : xx..............   (2/16)"],
    ["des cases sans espace", "10010010", "Rythme : x..x..x.   (3/8)"],
    ["les cases qu'écrit le Canon, « · » pour le silence", "x··x··x·", "Rythme : x..x..x.   (3/8)"],
  ])("%s : « %s »", async (_titre, motif, attendu) => {
    const r = await ANALYSE(motif);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(rythme(r.valeurs[0])).toBe(attendu);
  }, 60_000);

  it.each([
    ["un jeton illisible", "0 3 x", "« x »"],
    ["une position décimale", "0.5 3", "« 0.5 »"],
    ["une position hors du cycle", "0 3 20", "« 20 »"],
    ["une case inconnue", "x..x|x..x", "« | »"],
    ["un motif vide", "", "vide|empty"],
    ["un motif sans frappe", "....", "frappe|onset"],
  ])("refuse %s : « %s »", async (_titre, motif, cite) => {
    const r = await ANALYSE(motif);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toMatch(new RegExp(cite));
    expect(r.message).not.toMatch(/série|row/);
  }, 60_000);
});

describe("LE MOTIF DU CANON SE LIT COMME UNE LISTE DE POSITIONS", () => {
  const CANON = async (motif: string) => {
    const r = await lancerFiche(F("canon-pavage"), { Motif: motif }, { entrees: [] });
    return { r, midi: r.valeurs[1] instanceof File ? ((await notesDuMidi(r.valeurs[1])) ?? []).map((n) => [n.note, Math.round(n.debut * 100)]) : null };
  };

  it("« 0;1;2 » comme « 0 1 2 »", async () => {
    const [a, b] = [await CANON("0;1;2"), await CANON("0 1 2")];
    expect(a.r.erreurRendue, a.r.message).toBe(false);
    expect(a.midi).toEqual(b.midi);
  }, 60_000);

  it.each([["1.5 2 3", "« 1.5 »"], ["x", "« x »"], ["0 1 14", "« 14 »"]])("refuse « %s », et nomme %s", async (motif, cite) => {
    const { r } = await CANON(motif);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain(cite);
  }, 60_000);

  it("un motif qui ne pave pas est refusé, en erreur", async () => {
    const { r } = await CANON("0 1 3");
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain("0 1 3");
  }, 60_000);

  it("un motif vide fait chercher un motif qui pave, comme le dit la documentation", async () => {
    const { r } = await CANON("");
    expect(r.erreurRendue, r.message).toBe(false);
  }, 60_000);
});

// LE MOTIF D'UN CERCLE EST UNE SUITE DE ZÉROS ET DE UNS, et il se colle tel quel depuis l'adresse d'un
// cercle rythmique en ligne, ce que dit sa notice : ce qui n'est ni 0 ni 1 est donc écarté. Mais un
// texte qui n'en porte aucun devenait le motif par défaut, en silence.
describe("UN CERCLE SANS ZÉRO NI UN EST REFUSÉ, au lieu de devenir le motif par défaut", () => {
  const CERCLE = (id: string, motif: string) =>
    lancerFiche(F(id), id === "cercle-rythmique" ? { Rythme: "libre", Motif: motif } : { Motif: motif }, { entrees: [] });
  const places = (v: unknown) => (v as { positions: number; sommets: unknown[] } | null);

  it.each([["cercle-rythmique"], ["cercle-melodique"]])("%s refuse « x..x..x. » et le texte vide", async (id) => {
    for (const motif of ["x..x..x.", ""]) {
      const r = await CERCLE(id, motif);
      expect(r.erreurRendue, `${motif} : ${r.message}`).toBe(true);
      expect(r.valeurs[0]).toBe(null);
    }
  }, 60_000);

  it("le cercle rythmique lit toujours un motif espacé, ou collé depuis une adresse", async () => {
    const espace = await CERCLE("cercle-rythmique", "1 0 0 1");
    expect(places(espace.valeurs[0])?.positions).toBe(4);
    const adresse = await CERCLE("cercle-rythmique", "https://exemple.org/#1001001000101000");
    expect(adresse.erreurRendue, adresse.message).toBe(false);
    expect(places(adresse.valeurs[0])?.positions).toBe(16);
    expect(places(adresse.valeurs[0])?.sommets).toHaveLength(5);
  }, 60_000);
});

// UN CROISEMENT DE TRESSE EST UN ENTIER NON NUL, écrit en décimal, d'après la présentation d'Artin.
describe("LA TRESSE REFUSE CE QUI N'EST PAS UN CROISEMENT, et le dit dans la langue de l'interface", () => {
  const TRESSE = (mot: string) => lancerFiche(F("tresse"), { Mot: mot }, { entrees: entreesDEssai(F("tresse")) });

  it("« 0x1 », un nombre hexadécimal, est refusé et nommé", async () => {
    const r = await TRESSE("0x1 -2");
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain("« 0x1 »");
  }, 60_000);

  it("un mot vide est refusé par son propre message, et non « près de « vide » »", async () => {
    const r = await TRESSE("");
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).not.toContain("« vide »");
  }, 60_000);
});
