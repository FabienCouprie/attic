// audio/frequence-source.test.ts — La fréquence lue dans l'en-tête, format par format.
//
// Chaque en-tête est fabriqué octet par octet d'après sa spécification : si l'un de ces tests
// échoue, c'est la lecture qui est fausse, et le lot rééchantillonnerait de nouveau en silence.
import { describe, expect, it } from "vitest";
import { frequenceDuFichier } from "./frequence-source";
import { bufferVersWavBlob } from "./io";

class AudioBufferPolyfill {
  numberOfChannels: number; length: number; sampleRate: number; duration: number;
  private d: Float32Array[];
  constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels; this.length = o.length; this.sampleRate = o.sampleRate;
    this.duration = o.length / o.sampleRate;
    this.d = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
  }
  getChannelData(c: number) { return this.d[c]; }
}

const ascii = (o: Uint8Array, p: number, s: string) => { for (let i = 0; i < s.length; i++) o[p + i] = s.charCodeAt(i); };

describe("frequenceDuFichier", () => {
  it("WAV : la fréquence écrite par Attic lui-même, à 44,1 et à 96 kHz", async () => {
    for (const sr of [44100, 96000]) {
      const b = new AudioBufferPolyfill({ numberOfChannels: 2, length: 100, sampleRate: sr }) as unknown as AudioBuffer;
      const octets = await bufferVersWavBlob(b, undefined, false, { bits: 24 }).arrayBuffer();
      expect(frequenceDuFichier(octets)).toBe(sr);
    }
  });

  it("WAV : un bloc placé avant « fmt » ne trompe pas la lecture", () => {
    const o = new Uint8Array(12 + 8 + 5 + 1 + 8 + 16);
    const v = new DataView(o.buffer);
    ascii(o, 0, "RIFF"); ascii(o, 8, "WAVE");
    ascii(o, 12, "JUNK"); v.setUint32(16, 5, true); // taille impaire : un octet de bourrage suit
    ascii(o, 26, "fmt "); v.setUint32(30, 16, true); v.setUint32(38, 22050, true);
    expect(frequenceDuFichier(o.buffer)).toBe(22050);
  });

  it("AIFF : le flottant étendu de 80 bits", () => {
    const o = new Uint8Array(12 + 8 + 18);
    const v = new DataView(o.buffer);
    ascii(o, 0, "FORM"); ascii(o, 8, "AIFF");
    ascii(o, 12, "COMM"); v.setUint32(16, 18, false);
    // 44100 = 0xAC44 × 2^0 → exposant 16383 + 15, mantisse normalisée 0xAC44 << 48.
    o.set([0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0], 28);
    expect(frequenceDuFichier(o.buffer)).toBe(44100);
  });

  it("FLAC : les vingt bits de STREAMINFO", () => {
    const o = new Uint8Array(8 + 34);
    ascii(o, 0, "fLaC");
    o[4] = 0x80; // dernier bloc, type 0 = STREAMINFO
    const f = 88200;
    o[18] = f >> 12; o[19] = (f >> 4) & 0xff; o[20] = (f & 0x0f) << 4;
    expect(frequenceDuFichier(o.buffer)).toBe(88200);
  });

  it("Ogg Vorbis, et Opus toujours à 48 kHz", () => {
    const o = new Uint8Array(64);
    ascii(o, 0, "OggS");
    o[28] = 1; ascii(o, 29, "vorbis");
    new DataView(o.buffer).setUint32(28 + 12, 32000, true);
    expect(frequenceDuFichier(o.buffer)).toBe(32000);
    const p = new Uint8Array(64);
    ascii(p, 0, "OggS"); ascii(p, 28, "OpusHead");
    expect(frequenceDuFichier(p.buffer)).toBe(48000);
  });

  it("MP3 : derrière une étiquette ID3, en MPEG 1 et en MPEG 2", () => {
    const o = new Uint8Array(10 + 20 + 8);
    ascii(o, 0, "ID3"); o[3] = 4; o[9] = 20;
    o.set([0xff, 0xfb, 0x90, 0x00], 30); // MPEG 1, couche III, 128 kb/s, indice 0 → 44 100
    expect(frequenceDuFichier(o.buffer)).toBe(44100);
    const m2 = new Uint8Array(16);
    m2.set([0xff, 0xf3, 0x94, 0x00], 0); // MPEG 2, indice 1 → 24 000
    expect(frequenceDuFichier(m2.buffer)).toBe(24000);
  });

  it("AAC en ADTS", () => {
    const o = new Uint8Array(16);
    o.set([0xff, 0xf1, 0x50, 0x80], 0); // indice de fréquence 4 → 44 100
    expect(frequenceDuFichier(o.buffer)).toBe(44100);
  });

  it("M4A : l'entrée « mp4a »", () => {
    const o = new Uint8Array(96);
    ascii(o, 4, "ftyp"); ascii(o, 8, "M4A ");
    ascii(o, 40, "mp4a");
    new DataView(o.buffer).setUint16(40 + 28, 48000, false);
    expect(frequenceDuFichier(o.buffer)).toBe(48000);
  });

  it("UN EN-TÊTE ILLISIBLE REND NULL, et l'appelant garde alors ses 48 kHz", () => {
    expect(frequenceDuFichier(new Uint8Array(64).buffer)).toBeNull();
    expect(frequenceDuFichier(new Uint8Array(4).buffer)).toBeNull();
    // Une fréquence absurde n'est pas crue.
    const o = new Uint8Array(12 + 8 + 16);
    const v = new DataView(o.buffer);
    ascii(o, 0, "RIFF"); ascii(o, 8, "WAVE"); ascii(o, 12, "fmt "); v.setUint32(16, 16, true); v.setUint32(24, 7, true);
    expect(frequenceDuFichier(o.buffer)).toBeNull();
  });
});
