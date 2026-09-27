// audio/io.test.ts — Sécurité de l'encodage WAV.
import { describe, it, expect, beforeAll } from "vitest";
import { bufferVersWavBlob, bufferVersWavBlobRespirant } from "./io";

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

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

function echantillon16VersFloat(v: number): number {
  return v < 0 ? v / 0x8000 : v / 0x7fff;
}

async function lirePcmWav(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const view = new DataView(buf);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const dataOffset = 44;
  const dataLen = view.getUint32(40, true);
  const interleaved = new Int16Array(buf, dataOffset, dataLen / 2);
  const samples: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const ch = new Float32Array(interleaved.length / channels);
    for (let i = 0, j = c; i < ch.length; i++, j += channels) {
      ch[i] = echantillon16VersFloat(interleaved[j]);
    }
    samples.push(ch);
  }
  return { samples, channels, sampleRate };
}

describe("bufferVersWavBlob", () => {
  it("clamp les échantillons hors [-1, 1] à [-1, 1] par défaut", async () => {
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: 4, sampleRate: 44100 });
    const left = b.getChannelData(0);
    const right = b.getChannelData(1);
    left[0] = 1.5;  right[0] = -2.0;
    left[1] = -3.0; right[1] = 2.5;
    left[2] = 0.5;  right[2] = -0.25;
    left[3] = 0.0;  right[3] = 1.0;
    const blob = bufferVersWavBlob(b);
    const { samples } = await lirePcmWav(blob);
    // TOLÉRANCE DE QUELQUES LSB, ET C'EST VOULU : depuis que l'écriture dithere (cf. dither.ts),
    // exiger l'exactitude au bit reviendrait à exiger l'ABSENCE de dither. Ce qui se vérifie ici
    // est le CLAMP, et il se vérifie à trois décimales comme le reste du test.
    expect(samples[0][0]).toBeCloseTo(1.0, 3);
    expect(samples[1][0]).toBeCloseTo(-1.0, 3);
    expect(samples[0][1]).toBeCloseTo(-1.0, 3);
    expect(samples[1][1]).toBeCloseTo(1.0, 3);
    expect(samples[0][2]).toBeCloseTo(0.5, 3);
    expect(samples[1][2]).toBeCloseTo(-0.25, 3);
    expect(samples[0][3]).toBeCloseTo(0.0, 3);
    expect(samples[1][3]).toBeCloseTo(1.0, 3);
  });

  it("en mode sécurisé, plafonne les échantillons à [-0.5, 0.5] (-6 dBFS)", async () => {
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: 5, sampleRate: 44100 });
    const left = b.getChannelData(0);
    const right = b.getChannelData(1);
    left[0] = 1.5;  right[0] = -2.0;
    left[1] = -3.0; right[1] = 2.5;
    left[2] = 0.5;  right[2] = -0.25;
    left[3] = 0.0;  right[3] = 1.0;
    left[4] = 0.3;  right[4] = -0.3;
    const blob = bufferVersWavBlob(b, undefined, true);
    const { samples } = await lirePcmWav(blob);
    expect(samples[0][0]).toBeCloseTo(0.5, 3);
    expect(samples[1][0]).toBeCloseTo(-0.5, 3);
    expect(samples[0][1]).toBeCloseTo(-0.5, 3);
    expect(samples[1][1]).toBeCloseTo(0.5, 3);
    expect(samples[0][2]).toBeCloseTo(0.5, 3);
    expect(samples[1][2]).toBeCloseTo(-0.25, 3);
    expect(samples[0][3]).toBeCloseTo(0.0, 3);
    expect(samples[1][3]).toBeCloseTo(0.5, 3);
    expect(samples[0][4]).toBeCloseTo(0.3, 3);
    expect(samples[1][4]).toBeCloseTo(-0.3, 3);
  });
});

// L'ENCODAGE PAR TRANCHES, relevé par Fabien : encoder un aperçu figeait l'interface, et le même
// graphe lancé nœud par nœud ne figeait pas. La découpe rend la main entre deux tranches ; elle ne
// vaut que si le fichier obtenu est LE MÊME, ce que ces tests tiennent. Le dither en dépend : il
// avance avec les échantillons, donc une tranche doit reprendre exactement où l'autre s'arrête.
describe("l'encodage par tranches", () => {
  const sansSouffle = { tour: async () => false };
  const souffleur = () => {
    let n = 0;
    return { tour: async () => { n++; return true; }, compte: () => n };
  };

  function tampon(canaux: number, n: number, graine = 1) {
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: 48000 });
    let g = graine;
    for (let c = 0; c < canaux; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; d[i] = (g / 0x7fffffff) * 1.6 - 0.8; }
    }
    return b;
  }

  const octets = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

  it("IL REND LE MÊME FICHIER, OCTET POUR OCTET, sur chaque profondeur", async () => {
    for (const bits of [16, 24, 32] as const) {
      const b = tampon(2, 200_000);
      const direct = await octets(bufferVersWavBlob(b, undefined, false, { bits, graine: 7 }));
      const tranches = await octets(
        await bufferVersWavBlobRespirant(b, undefined, false, { bits, graine: 7 }, sansSouffle));
      expect(tranches.length, `${bits} bits`).toBe(direct.length);
      let differents = 0;
      for (let i = 0; i < direct.length; i++) if (direct[i] !== tranches[i]) differents++;
      expect(differents, `${bits} bits`).toBe(0);
    }
  });

  it("y compris en monophonie, avec le plafond d'aperçu, un graphe embarqué et un iXML", async () => {
    const b = tampon(1, 130_001, 9);
    const o = { bits: 16 as const, graine: 3, ixml: "<BWFXML><PROJECT>essai</PROJECT></BWFXML>" };
    const direct = await octets(bufferVersWavBlob(b, "{\"nodes\":[]}", true, o));
    const tranches = await octets(await bufferVersWavBlobRespirant(b, "{\"nodes\":[]}", true, o, sansSouffle));
    expect([...tranches]).toEqual([...direct]);
  });

  it("IL RESPIRE une fois par tranche, et le compte suit la longueur", async () => {
    const s = souffleur();
    await bufferVersWavBlobRespirant(tampon(2, 300_000), undefined, false, { bits: 16 }, s);
    // 300 000 trames par tranches de 65 536 : cinq tranches, donc cinq respirations.
    expect(s.compte()).toBe(5);
  });

  it("un tampon vide ne demande aucune tranche et rend quand même un fichier lisible", async () => {
    const s = souffleur();
    const blob = await bufferVersWavBlobRespirant(tampon(2, 0), undefined, false, { bits: 16 }, s);
    expect(s.compte()).toBe(0);
    expect(blob.size).toBeGreaterThan(40);
    const direct = bufferVersWavBlob(tampon(2, 0), undefined, false, { bits: 16 });
    expect([...await octets(blob)]).toEqual([...await octets(direct)]);
  });
});
