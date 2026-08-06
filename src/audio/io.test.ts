// audio/io.test.ts — Sécurité de l'encodage WAV.
import { describe, it, expect, beforeAll } from "vitest";
import { bufferVersWavBlob } from "./io";

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
    expect(samples[0][0]).toBeCloseTo(1.0, 5);
    expect(samples[1][0]).toBeCloseTo(-1.0, 5);
    expect(samples[0][1]).toBeCloseTo(-1.0, 5);
    expect(samples[1][1]).toBeCloseTo(1.0, 5);
    expect(samples[0][2]).toBeCloseTo(0.5, 3);
    expect(samples[1][2]).toBeCloseTo(-0.25, 3);
    expect(samples[0][3]).toBeCloseTo(0.0, 5);
    expect(samples[1][3]).toBeCloseTo(1.0, 5);
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
    expect(samples[0][3]).toBeCloseTo(0.0, 5);
    expect(samples[1][3]).toBeCloseTo(0.5, 3);
    expect(samples[0][4]).toBeCloseTo(0.3, 3);
    expect(samples[1][4]).toBeCloseTo(-0.3, 3);
  });
});
