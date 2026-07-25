// plugins/tonal.test.ts — Vérification rapide des nœuds de théorie musicale.
import { describe, it, expect, beforeAll } from "vitest";
import { fiches } from "./tonal";

function trouver(id: string) {
  return fiches.find((f) => f.id === id);
}

function ctxSimple(valeur: string | null) {
  return {
    entree: () => valeur,
    paramTexte: (nom: string, defaut: string) => defaut,
    paramNombre: (nom: string, defaut: number) => defaut,
  };
}

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.canaux[c].set(src.subarray(0, this.length)); }
}

const SR = 44100;

function gammeC(dureeS: number): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
  const segment = Math.floor(n / notes.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.floor(i / segment), notes.length - 1);
    d[i] = 0.5 * Math.sin((2 * Math.PI * notes[idx] * i) / SR);
  }
  return b;
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

describe("nœuds Tonal", () => {
  it("les 6 fiches sont enregistrées", () => {
    expect(trouver("tonal-accord")).toBeDefined();
    expect(trouver("tonal-gamme")).toBeDefined();
    expect(trouver("tonal-transposer")).toBeDefined();
    expect(trouver("tonal-progression")).toBeDefined();
    expect(trouver("tonal-grille")).toBeDefined();
    expect(trouver("tonal-analyse")).toBeDefined();
  });

  it("tonal-accord détecte C E G", async () => {
    const f = trouver("tonal-accord")!;
    const res = await f.executer(ctxSimple("C E G") as any);
    expect(res.valeurs[0]).toBe("C major");
  });

  it("tonal-gamme retourne C major", async () => {
    const f = trouver("tonal-gamme")!;
    const res = await f.executer(ctxSimple("C") as any);
    expect(res.valeurs[0]).toBe("C D E F G A B");
  });

  it("tonal-transposer monte C4 d'un ton", async () => {
    const f = trouver("tonal-transposer")!;
    const res = await f.executer(ctxSimple("C4") as any);
    expect(res.valeurs[0]).toBe("D4");
  });

  it("tonal-progression génère I V vi IV en C", async () => {
    const f = trouver("tonal-progression")!;
    const res = await f.executer(ctxSimple("C") as any);
    // Tonal retourne les fondamentales ; le type majeur/mineur n'est pas
    // conservé dans le résultat brut de fromRomanNumerals.
    expect(res.valeurs[0]).toBe("C G A F");
  });

  it("tonal-grille génère une notation texte-vers-midi", async () => {
    const f = trouver("tonal-grille")!;
    const res = await f.executer(ctxSimple(null) as any);
    const notation = res.valeurs[0] as string;
    expect(notation).toContain("TEMPO 120");
    expect(notation).toContain("C3+E3+G3 1");
    expect(notation).toContain("G3+B3+D4 1");
    expect(res.valeurs[1]).toBe("C G A F");
  });

  it("tonal-grille accepte une progression en symboles", async () => {
    const f = trouver("tonal-grille")!;
    const ctx = {
      entree: () => "C Am F G",
      paramTexte: (nom: string, defaut: string) => defaut,
      paramNombre: (nom: string, defaut: number) => defaut,
    };
    const res = await f.executer(ctx as any);
    const notation = res.valeurs[0] as string;
    expect(notation).toContain("C3+E3+G3 1");
    expect(notation).toContain("A3+C4+E4 1");
  });

  it("tonal-analyse détecte une tonalité C major", async () => {
    const f = trouver("tonal-analyse")!;
    const ctx = {
      entree: () => gammeC(2),
      paramTexte: () => "Pop",
      paramNombre: () => 0,
    };
    const res = await f.executer(ctx as any);
    expect(res.valeurs[0]).toContain("C major");
    expect(res.valeurs[1]).toBe("I V vi IV");
    expect(typeof res.valeurs[2]).toBe("string");
  });

  it("tonal-analyse retourne une erreur si aucun audio n'est connecté", async () => {
    const f = trouver("tonal-analyse")!;
    const ctx = { entree: () => null, paramTexte: () => "Pop", paramNombre: () => 0 };
    const res = await f.executer(ctx as any);
    expect(res.erreur).toBe(true);
  });
});
