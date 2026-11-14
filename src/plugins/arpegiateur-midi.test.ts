// plugins/arpegiateur-midi.test.ts — « Arpégiateur MIDI » par le registre : ses trois listes
// suivent les nomenclatures du dépôt, et chacune de leurs valeurs change ce que le run rend.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { writeMidi } from "midi-file";
import { registre } from "../audio/adaptateur";
import { ctxDEssai } from "../core/contexte-essai";
import { DIRECTIONS, NOIRES_PAR_PAS } from "../audio/midi-arpege";
import { VALEURS_NOTE } from "../audio/valeurs-note";

const fiche = () => registre.trouverDef("arpegiateur-midi")!;
const reglage = (nom: string) => fiche().parametres.find((p) => p.nom === nom)!;

/** Un accord de trois notes arrivées sol, mi, do, tenu quatre noires à 120 BPM. */
function accord(): File {
  const ev: any[] = [{ deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500000 }];
  [67, 64, 60].forEach((n, i) => ev.push({ deltaTime: i === 0 ? 0 : 2, type: "noteOn", channel: 0, noteNumber: n, velocity: 100 }));
  [67, 64, 60].forEach((n, i) => ev.push({ deltaTime: i === 0 ? 1916 : 0, type: "noteOff", channel: 0, noteNumber: n, velocity: 0 }));
  ev.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return new File([new Uint8Array(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [ev] }))], "accord.mid");
}

/** Exécute la fiche ; rend le fichier MIDI en base64 et le message. */
async function lancer(reglages: Record<string, string | number>): Promise<{ octets: string; message: string }> {
  const r = await fiche().executer(ctxDEssai([accord()], { Graine: 7, Octaves: 2, ...reglages }) as never) as { valeurs: unknown[]; message?: string };
  return { octets: Buffer.from(await (r.valeurs[0] as File).arrayBuffer()).toString("base64"), message: r.message ?? "" };
}

/**
 * Exécute quelque chose avec l'interface dans une langue donnée. `langueCourante` lit
 * `localStorage`, absent sous vitest : même procédé que `plugins/messages-langue.test.ts`.
 */
async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

describe("les trois listes suivent les nomenclatures du dépôt", () => {
  it("la direction offre les huit sens d'arpège, sous les identifiants du dépôt", () => {
    const p = reglage("Direction");
    expect(p.optionIds).toEqual([...DIRECTIONS]);
    expect(p.options).toEqual(["Montant", "Descendant", "Aller-retour", "Retour-aller", "Aléatoire", "Ordre de jeu", "Convergent", "Divergent"]);
  });

  it("LA VITESSE OFFRE LA TABLE ENTIÈRE DES VALEURS DE NOTE, et le calcul les connaît toutes", () => {
    // UN IDENTIFIANT OFFERT QUE LE CALCUL NE CONNAÎT PAS RETOMBE SUR LA DOUBLE CROCHE SANS RIEN DIRE,
    // et c'est déjà arrivé au triolet : chaque valeur de la table doit avoir sa durée.
    const p = reglage("Vitesse");
    expect(p.optionIds).toEqual(VALEURS_NOTE.map((v) => v.id));
    expect(p.optionIds!.filter((id) => NOIRES_PAR_PAS[id] === undefined)).toEqual([]);
  });
});

describe("CHAQUE VALEUR CHANGE CE QUE LE RUN REND", () => {
  // Le contrat de composant, réglage par réglage, par l'exécuteur de la fiche : sur un accord de
  // trois notes déployé sur deux octaves, aucune valeur d'une liste ne rend le fichier d'une autre.
  it.each(["Direction", "Vitesse", "Motif"])("« %s »", async (nom) => {
    const rendus = new Map<string, string[]>();
    for (const id of reglage(nom).optionIds!) {
      const { octets } = await lancer({ [nom]: id });
      rendus.set(octets, [...(rendus.get(octets) ?? []), id]);
    }
    expect([...rendus.values()].filter((ids) => ids.length > 1)).toEqual([]);
    expect(rendus.size).toBe(reglage(nom).optionIds!.length);
  });

  it("« OCTAVES » AGIT AUSSI QUAND UN MOTIF EST CHOISI", async () => {
    // Mesuré avant la réparation : une octave ou trois rendaient le même fichier dès qu'un motif
    // était posé, le motif ne prenant que les trois premières notes.
    const une = await lancer({ Motif: "1232", Octaves: 1 });
    const trois = await lancer({ Motif: "1232", Octaves: 3 });
    expect(une.octets).not.toBe(trois.octets);
  });
});

describe("le message", () => {
  it("nomme la direction et la vitesse dans la langue de l'interface", async () => {
    const reglages = { Direction: "aller-retour", Vitesse: "1/8t" };
    expect((await lancer(reglages)).message).toMatch(/^Arpège Aller-retour · 1\/8 de triolet · 2 oct\./);
    expect((await avecLangue("en", () => lancer(reglages))).message).toMatch(/^Arpeggio Round trip · 1\/8 triplet · 2 oct\./);
  });
});
