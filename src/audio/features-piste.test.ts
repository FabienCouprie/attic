// audio/features-piste.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { extraireVecteurFeatures } from "./features-piste";

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

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

function bruitBlanc(dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

describe("extraireVecteurFeatures", () => {
  it("renvoie un vecteur de 40 dimensions avec autant d'étiquettes", () => {
    const res = extraireVecteurFeatures(sinus(440, 2));
    expect(res.vecteur.length).toBe(40);
    expect(res.etiquettes.length).toBe(40);
  });

  it("est déterministe sur le même buffer", () => {
    const buffer = sinus(440, 2);
    const a = extraireVecteurFeatures(buffer);
    const b = extraireVecteurFeatures(buffer);
    expect(a.vecteur).toEqual(b.vecteur);
  });

  it("le chroma dominant correspond à la classe de hauteur d'une sinusoïde pure (A4 = 440 Hz)", () => {
    const res = extraireVecteurFeatures(sinus(440, 2));
    const indiceChromaA = res.etiquettes.indexOf("Chroma A");
    const chroma = res.etiquettes
      .map((e, i) => (e.startsWith("Chroma") ? res.vecteur[i] : -Infinity));
    const indiceMax = chroma.indexOf(Math.max(...chroma));
    expect(indiceMax).toBe(indiceChromaA);
  });

  it("aucune composante n'est NaN ou infinie, y compris sur du bruit blanc", () => {
    const res = extraireVecteurFeatures(bruitBlanc(1.5));
    for (const v of res.vecteur) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("ne plante pas sur une piste plus courte qu'une fenêtre d'analyse", () => {
    const res = extraireVecteurFeatures(sinus(440, 0.01));
    expect(res.vecteur.length).toBe(40);
    for (const v of res.vecteur) expect(Number.isFinite(v)).toBe(true);
  });

  it("plafonne l'analyse à un extrait central pour les pistes longues (au lieu de l'intégralité)", () => {
    // 70 s de piste, avec une classe de hauteur très différente entre le
    // centre (30 s, la fenêtre effectivement analysée) et les bords (20 s de
    // chaque côté). Si le chroma dominant retombe sur la hauteur du centre,
    // c'est la preuve que les bords n'ont pas été pris en compte — sinon,
    // avec 40 s de bords contre 30 s de centre, les bords domineraient.
    const dureeTotale = 70;
    const n = Math.floor(SR * dureeTotale);
    const buffer = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const d = buffer.getChannelData(0);
    const debutCentre = Math.floor(SR * 20);
    const finCentre = Math.floor(SR * 50);
    for (let i = 0; i < n; i++) {
      const freq = i >= debutCentre && i < finCentre ? 440 : 277.18; // centre = A4, bords = C#4
      d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
    }
    const res = extraireVecteurFeatures(buffer);
    const indiceChromaA = res.etiquettes.indexOf("Chroma A");
    const chroma = res.etiquettes.map((e, i) => (e.startsWith("Chroma") ? res.vecteur[i] : -Infinity));
    const indiceMax = chroma.indexOf(Math.max(...chroma));
    expect(indiceMax).toBe(indiceChromaA);
  }, 20000);
});
