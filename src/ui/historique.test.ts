// ui/historique.test.ts — Instantanés d'annulation qui gardent les médias chargés.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { copierPourHistorique, instantane, empiler, type EntreeHistorique } from "./historique";

describe("copierPourHistorique", () => {
  it("garde un File, un Blob, un AudioBuffer et un tableau typé par référence — JSON les réduisait à {}", () => {
    const fichier = new File([new Uint8Array([1, 2, 3])], "piste.wav", { type: "audio/wav" });
    const blob = new Blob(["x"]);
    const tampon = new AudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 48000 });
    const echantillons = new Float32Array([0.5, -0.5]);
    const data = { audioFichier: fichier, enregistrementBlob: blob, audioResultatBuffer: tampon, signal: echantillons };
    const copie = copierPourHistorique(data);
    expect(copie.audioFichier).toBe(fichier);
    expect(copie.enregistrementBlob).toBe(blob);
    expect(copie.audioResultatBuffer).toBe(tampon);
    expect(copie.signal).toBe(echantillons);
    // Le défaut corrigé, montré sur le même objet :
    expect(JSON.parse(JSON.stringify(data)).audioFichier).toEqual({});
  });

  it("copie en profondeur les objets simples et les tableaux : l'instantané ne bouge plus", () => {
    const n = { id: "n1", position: { x: 1, y: 2 }, data: { parametres: { Gain: 3 }, zones: [{ debut: 0 }] } };
    const copie = copierPourHistorique(n);
    n.position.x = 99;
    n.data.parametres.Gain = 42;
    n.data.zones[0].debut = 7;
    expect(copie).toEqual({ id: "n1", position: { x: 1, y: 2 }, data: { parametres: { Gain: 3 }, zones: [{ debut: 0 }] } });
  });

  it("retire les fonctions, comme le faisait JSON — undo rattache les gestionnaires", () => {
    const copie = copierPourHistorique({ data: { onSupprimerNoeud: () => {}, nom: "Filtre" } });
    expect(copie).toEqual({ data: { nom: "Filtre" } });
  });

  it("supporte un objet qui se référence lui-même", () => {
    const a: Record<string, unknown> = { nom: "a" };
    a.soi = a;
    const copie = copierPourHistorique(a) as Record<string, unknown>;
    expect(copie.soi).toBe(copie);
    expect(copie).not.toBe(a);
  });
});

describe("instantane et empiler", () => {
  it("n'ajoute le contexte que s'il est fourni", () => {
    expect(instantane([{ id: "n" }], [])).not.toHaveProperty("contexte");
    const e = instantane([], [], { pile: [{ metaId: "m", nom: "M" }], racine: { nodes: [{ id: "r" }], edges: [] }, cheminFichier: "C:/w.json" });
    expect(e.contexte).toEqual({ pile: [{ metaId: "m", nom: "M" }], racine: { nodes: [{ id: "r" }], edges: [] }, cheminFichier: "C:/w.json" });
  });

  it("garde au plus `max` entrées en retirant les plus anciennes", () => {
    const pile: EntreeHistorique[] = [];
    for (let i = 0; i < 5; i++) empiler(pile, instantane([{ i }], []), 3);
    expect(pile.map((e) => (e.nodes[0] as { i: number }).i)).toEqual([2, 3, 4]);
  });
});
