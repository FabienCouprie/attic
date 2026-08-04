// @vitest-environment jsdom
// plugins/vexflow.test.ts — Vérification des nœuds de notation VexFlow.
import { describe, it, expect, beforeAll } from "vitest";
import { fiches, midiVersNotationEasyScore } from "./vexflow";
import { notesVersFichierMidi } from "../audio/midi";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxSimple(valeur: any) {
  return {
    entree: () => valeur,
    paramTexte: (nom: string, defaut: string) => defaut,
    paramNombre: (nom: string, defaut: number) => defaut,
  };
}

function notesMelodieSimple() {
  return [
    { note: 60, debut: 0, fin: 0.5, velocite: 100 },
    { note: 62, debut: 0.5, fin: 1.0, velocite: 100 },
    { note: 64, debut: 1.0, fin: 1.5, velocite: 100 },
  ];
}

beforeAll(() => {
  // jsdom n'implémente pas getBBox, requis par VexFlow pour mesurer le texte.
  (SVGElement.prototype as any).getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 });
});

describe("nœuds VexFlow", () => {
  it("les 5 fiches sont enregistrées", () => {
    expect(trouver("vexflow-portee")).toBeDefined();
    expect(trouver("vexflow-tab")).toBeDefined();
    expect(trouver("vexflow-grille")).toBeDefined();
    expect(trouver("vexflow-partition")).toBeDefined();
    expect(trouver("vexflow-midi")).toBeDefined();
  });

  it("vexflow-portee génère un SVG", async () => {
    const f = trouver("vexflow-portee")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
    expect(res.valeurs[0]).toBeNull();
  });

  it("vexflow-portee utilise l'entrée connectée", async () => {
    const f = trouver("vexflow-portee")!;
    const ctx = {
      entree: () => "A4/q B4/q",
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-tab génère un SVG", async () => {
    const f = trouver("vexflow-tab")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-grille génère un SVG", async () => {
    const f = trouver("vexflow-grille")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-grille accepte une progression en chiffres romains", async () => {
    const f = trouver("vexflow-grille")!;
    const ctx = {
      entree: () => "I V vi IV",
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-partition génère un SVG", async () => {
    const f = trouver("vexflow-partition")!;
    const res = await f.executer(ctxSimple(null) as any);
    expect(res.message).toContain("<svg");
  });

  it("midiVersNotationEasyScore convertit une mélodie simple", () => {
    const notes = notesMelodieSimple();
    const notation = midiVersNotationEasyScore(notes, 120, 0.25);
    expect(notation).toContain("C4/q");
    expect(notation).toContain("D4/q");
    expect(notation).toContain("E4/q");
  });

  it("midiVersNotationEasyScore regroupe les notes simultanées en accords", () => {
    const notes = [
      { note: 60, debut: 0, fin: 0.5, velocite: 100 },
      { note: 64, debut: 0, fin: 0.5, velocite: 100 },
      { note: 67, debut: 0, fin: 0.5, velocite: 100 },
    ];
    const notation = midiVersNotationEasyScore(notes, 120, 0.25);
    expect(notation).toContain("(C4 E4 G4)/q");
  });

  it("vexflow-midi génère un SVG à partir d'un fichier MIDI", async () => {
    const f = trouver("vexflow-midi")!;
    const midi = notesVersFichierMidi(notesMelodieSimple(), 120);
    const res = await f.executer(ctxSimple(midi) as any);
    expect(res.message).toContain("<svg");
    expect(res.valeurs[0]).toBeInstanceOf(File);
    expect((res.valeurs[0] as File).name).toBe("partition.svg");
  });

  it("vexflow-portee affiche les accords et la syntaxe plus", async () => {
    const f = trouver("vexflow-portee")!;
    const ctx = {
      entree: () => "C4+E4+G4/q (C4 E4 G4)/h B4/q/r",
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    expect(res.message).toContain("<svg");
  });

  it("vexflow-midi gère les notes simultanées (accords)", async () => {
    const f = trouver("vexflow-midi")!;
    const notes = [
      { note: 60, debut: 0, fin: 0.5, velocite: 100 },
      { note: 64, debut: 0, fin: 0.5, velocite: 100 },
      { note: 67, debut: 0, fin: 0.5, velocite: 100 },
    ];
    const midi = notesVersFichierMidi(notes, 120);
    const res = await f.executer(ctxSimple(midi) as any);
    expect(res.message).toContain("<svg");
    expect(res.valeurs[0]).toBeInstanceOf(File);
  });
});
