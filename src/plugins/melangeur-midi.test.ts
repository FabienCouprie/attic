// plugins/melangeur-midi.test.ts — Le nœud : ses entrées numérotées, ses réglages par entrée, son aveu.
//
// Le calcul est éprouvé dans `audio/melange-midi.test.ts`. Ici on vérifie le CÂBLAGE : que chaque
// réglage d'une entrée agit sur elle et sur elle seule, qu'une entrée muette n'a pas de piste, et que
// le message dit où est passée chaque entrée, dans les deux langues.
import { describe, expect, it } from "vitest";
import { parseMidi, writeMidi } from "midi-file";
import { fiches } from "./melangeur-midi";
import { analyserMidi } from "../audio/midi";
import { ctxDEssai } from "../core/contexte-essai";

const fiche = fiches.find((f) => f.id === "melangeur-midi")!;

function midi(notes: number[], canal = 0, programme = 0): File {
  const piste: any[] = [
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
    { deltaTime: 0, type: "programChange", channel: canal, programNumber: programme },
  ];
  for (const n of notes) {
    piste.push({ deltaTime: 0, type: "noteOn", channel: canal, noteNumber: n, velocity: 80 });
    piste.push({ deltaTime: 480, type: "noteOff", channel: canal, noteNumber: n, velocity: 0 });
  }
  piste.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  const octets = new Uint8Array(writeMidi({ header: { format: 1, numTracks: 1, ticksPerBeat: 480 }, tracks: [piste] } as never));
  return new File([octets as BlobPart], "partie.mid", { type: "audio/midi" });
}

async function lancer(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return fiche.executer(ctxDEssai(entrees, reglages, { ficheId: "melangeur-midi" }) as never) as
    Promise<{ valeurs: unknown[]; message?: string; erreur?: boolean }>;
}

const lu = async (v: unknown) => parseMidi(new Uint8Array(await (v as File).arrayBuffer()));
const notes = async (v: unknown) => analyserMidi(await lu(v)).notes;

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

const DEUX = () => [midi([60, 64, 67]), midi([48, 55], 0, 32)];

describe("le nœud Mélangeur MIDI", () => {
  it("déclare huit entrées MIDI numérotées, deux montrées, et quatre réglages tenus par leur entrée", () => {
    expect(fiche.entrees.map((e) => e.nom)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `MIDI ${n}`));
    expect(fiche.entrees.every((e) => e.type === "midi" && e.requis === false)).toBe(true);
    expect(fiche.entreesExtensibles).toEqual({ min: 2, defaut: 2 });
    expect(fiche.sorties.map((s) => s.type)).toEqual(["midi"]);
    expect(fiche.parametres).toHaveLength(32);
    for (const p of fiche.parametres) expect(p.port).toBe(Number(/\d+$/.exec(p.nom)![0]) - 1);
  });

  it("rend une piste par entrée, chacune sur le canal de son numéro, et le dit", async () => {
    const r = await lancer(DEUX());
    const fichier = await lu(r.valeurs[0]);
    expect(fichier.tracks).toHaveLength(2);
    expect(new Set((await notes(r.valeurs[0])).map((n) => n.canal))).toEqual(new Set([0, 1]));
    expect(r.message).toBe("2 pistes · 5 notes · 1.50 s · 120 BPM · 1:c1·3 2:c2·2");
  });

  it("chaque réglage agit sur son entrée, et sur elle seule", async () => {
    const base = await notes((await lancer(DEUX())).valeurs[0]);
    const de = <N extends { canal: number }>(ns: N[], c: number) => ns.filter((n) => n.canal === c);

    const vel = await notes((await lancer(DEUX(), { "Vélocité 2": 50 })).valeurs[0]);
    expect(de(vel, 1).map((n) => n.velocite)).toEqual([40, 40]);
    expect(de(vel, 0)).toEqual(de(base, 0));

    const canal = await notes((await lancer(DEUX(), { "Canal 1": "5" })).valeurs[0]);
    expect(new Set(canal.map((n) => n.canal))).toEqual(new Set([4, 1]));

    const garder = await notes((await lancer(DEUX(), { "Canal 2": "garder" })).valeurs[0]);
    expect(new Set(garder.map((n) => n.canal))).toEqual(new Set([0]));

    const haut = await notes((await lancer(DEUX(), { "Transposition 1": 12 })).valeurs[0]);
    expect(de(haut, 0).map((n) => n.note).sort()).toEqual([72, 76, 79]);
    expect(de(haut, 1)).toEqual(de(base, 1));

    const muet = await lancer(DEUX(), { "Muet 1": 1 });
    expect((await lu(muet.valeurs[0])).tracks).toHaveLength(1);
    expect((await notes(muet.valeurs[0])).map((n) => n.note).sort()).toEqual([48, 55]);
    expect(muet.message).toContain("1:muette");
  });

  it("une entrée sautée garde son numéro : l'entrée 3 seule va sur le canal 3", async () => {
    const r = await lancer([null, null, midi([60])]);
    expect((await notes(r.valeurs[0]))[0].canal).toBe(2);
    expect(r.message).toContain("3:c3·1");
  });

  it("dit ce que la transposition retire", async () => {
    const r = await lancer([midi([60, 120])], { "Transposition 1": 12 });
    expect(r.message).toContain("1:c1·1 −1 hors étendue");
  });

  it("refuse sans entrée, toutes muettes, ou devant un fichier illisible", async () => {
    expect((await lancer([])).erreur).toBe(true);
    const muettes = await lancer(DEUX(), { "Muet 1": 1, "Muet 2": 1 });
    expect(muettes.erreur).toBe(true);
    expect(muettes.message).toBe("Toutes les entrées branchées sont muettes.");
    const illisible = await lancer([midi([60]), new File([new Uint8Array([1, 2, 3])], "x.mid")]);
    expect(illisible.erreur).toBe(true);
    expect(illisible.message).toBe("MIDI 2 ne se lit pas.");
  });

  it("parle anglais dans l'interface anglaise", async () => {
    const r = await avecLangue("en", () => lancer([midi([100, 110, 120]), midi([48])], { "Muet 2": 1, "Transposition 1": 24 }));
    expect(r.message).toBe("1 track · 1 note · 0.50 s · 120 BPM · 1:c1·1 −2 out of range 2:muted");
  });
});
