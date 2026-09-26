// plugins/accords-sequence.test.ts — Les accords passent-ils par le flux, et qu'y laissent-ils ?
//
// CE QUE CES TROIS NŒUDS SAVAIENT FAIRE, ET PAR OÙ ILS LE RECEVAIENT. Le renversement, la
// disposition et la conduite des voix n'ajoutent et ne retranchent que des octaves et des demi-tons
// aux hauteurs reçues : une hauteur à 63,5 en ressort à 63,5, 75,5 ou 51,5, jamais à 63. Elles ne
// le voyaient pourtant jamais, leur unique entrée étant un port MIDI dont le numéro de note est un
// octet. Le contrôle porte donc sur ce que le flux préserve et sur ce que chaque sortie garde.
//
// ET CE QUI ARRONDIT PAR DÉFINITION EST DIT AUSSI. Une classe de hauteur est l'un des douze degrés :
// l'analyse par ensembles ramène au demi-tonMIDI le plus proche, et ce n'est pas une perte du
// câble. Le test l'écrit, pour qu'on ne prenne pas un jour cette propriété pour un défaut.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { estSequence, type Sequence } from "../audio/sequence";
import type { Note } from "../audio/note";
import { fiches as fichesTheorie } from "./theorie-composition";
import { fiches as fichesRythmeVoix } from "./theorie-rythme-voix";

const voicings = fichesTheorie.find((f) => f.id === "voicings-accords")!;
const ensembles = fichesTheorie.find((f) => f.id === "classes-hauteurs")!;
const conduite = fichesRythmeVoix.find((f) => f.id === "distance-conduite-voix")!;

const contexte = (entrees: unknown[], params: Record<string, string | number> = {}) => ({
  noeud: { id: "n1", data: { ficheId: "x", parametres: params } },
  runtime: null,
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
  paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
});

const note = (n: number, debut: number): Note => ({ note: n, velocite: 90, debut, fin: debut + 1 });

/** Deux accords dont la tierce est abaissée d'un quart de ton. */
const microtonale = (): Sequence => ({
  notes: [note(60, 0), note(63.5, 0), note(67, 0), note(65, 1), note(68.5, 1), note(72, 1)],
  tempo: 120,
  duree: 2,
});

describe("« Renversements et voicings » sur le flux séquence", () => {
  it("LES QUARTS DE TON SURVIVENT, alors qu'un port MIDI les arrondirait", async () => {
    const res = await voicings.executer(contexte([null, microtonale()], {
      Renversement: 1, Disposition: "ouvert", "Conduite des voix": "oui",
    }) as any);
    const sortie = res.valeurs[2] as unknown as Sequence;
    expect(estSequence(sortie), "la troisième sortie doit être une séquence").toBe(true);
    expect(sortie.notes).toHaveLength(6);
    const fractions = sortie.notes.filter((n) => !Number.isInteger(n.note));
    expect(fractions, "deux hauteurs entrent hors du demi-ton, deux doivent en sortir").toHaveLength(2);
    // L'écart au demi-ton est exactement celui qui est entré : un demi de demi-ton.
    for (const n of fractions) expect(n.note % 1).toBeCloseTo(0.5, 12);
  });

  it("LE MESSAGE DIT D'OÙ VIENNENT LES NOTES, et combien le MIDI arrondit", async () => {
    const res = await voicings.executer(contexte([null, microtonale()]) as any);
    expect(res.message).toContain("Séquence");
    expect(res.message).toContain("2");
  });

  it("LES DÉPARTS ET LES DURÉES NE BOUGENT PAS, seules les hauteurs", async () => {
    const avant = microtonale();
    const res = await voicings.executer(contexte([null, avant], { Renversement: 2 }) as any);
    const apres = (res.valeurs[2] as unknown as Sequence).notes;
    expect(apres.map((n) => n.debut).sort()).toEqual(avant.notes.map((n) => n.debut).sort());
    expect(apres.every((n) => n.fin - n.debut === 1)).toBe(true);
  });

  it("LE TEMPO ET LA DURÉE VOULUE SONT REPORTÉS, silence final compris", async () => {
    const res = await voicings.executer(contexte([null, { ...microtonale(), duree: 5 }]) as any);
    const sortie = res.valeurs[2] as unknown as Sequence;
    expect(sortie.tempo).toBe(120);
    expect(sortie.duree).toBe(5);
  });

  it("SANS RIEN DE BRANCHÉ, le nœud le dit au lieu de rendre une séquence vide", async () => {
    const res = await voicings.executer(contexte([null, null]) as any);
    expect(res.valeurs[2]).toBeNull();
  });
});

describe("« Classes de hauteurs » sur le flux séquence", () => {
  it("ANALYSE LA SÉQUENCE REÇUE, et le message nomme la source", async () => {
    const res = await ensembles.executer(contexte([null, {
      notes: [note(60, 0), note(64, 0), note(67, 0)], tempo: 120,
    }], { "Découpage": "tout" }) as any);
    expect(res.valeurs[0]).toContain("[0,4,7]");
    expect(res.message).toContain("Séquence");
  });

  it("UN QUART DE TON EST RAMENÉ AU DEGRÉ LE PLUS PROCHE, ce qui est la définition", async () => {
    // 63,5 est à égale distance de 63 et 64 ; l'arrondi le porte sur 64, et l'ensemble reste
    // celui de l'accord majeur. C'est la théorie des ensembles qui le veut, non le câble.
    const res = await ensembles.executer(contexte([null, {
      notes: [note(60, 0), note(63.5, 0), note(67, 0)], tempo: 120,
    }], { "Découpage": "tout" }) as any);
    expect(res.valeurs[0]).toContain("[0,4,7]");
  });
});

describe("« Distance de conduite de voix » sur le flux séquence", () => {
  it("MESURE LA PROGRESSION REÇUE, et le message nomme la source", async () => {
    // Do majeur vers fa majeur : la conduite minimale ne bouge qu'une voix d'un demi-ton.
    const res = await conduite.executer(contexte([null, {
      notes: [note(60, 0), note(64, 0), note(67, 0), note(65, 1), note(69, 1), note(72, 1)],
      tempo: 120,
    }]) as any);
    expect(res.valeurs[0]).toContain("1");
    expect(res.message).toContain("Séquence");
  });

  it("SANS ENTRÉE, le réglage sert encore et le message le dit", async () => {
    const res = await conduite.executer(contexte([null, null]) as any);
    expect(res.valeurs[0]).toBeTruthy();
    expect(res.message).toContain("réglage");
  });
});
