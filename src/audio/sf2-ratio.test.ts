import { describe, it, expect } from "vitest";
import { AudioBuffer, OfflineAudioContext } from "node-web-audio-api";
import { rendreAvecSF2 } from "./midi";

// Provide Web Audio globals for the renderer
globalThis.AudioBuffer = AudioBuffer as any;
globalThis.OfflineAudioContext = OfflineAudioContext as any;

function makeSineSample(freq: number, sampleRate: number, duration: number) {
  const n = Math.floor(sampleRate * duration);
  const arr = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 32767;
    arr[i] = Math.round(v);
  }
  return arr;
}

function buildSF2(opts: { sampleRate: number; rootNote: number; freq: number; duration: number }) {
  const { sampleRate, rootNote, freq, duration } = opts;
  const smpl = makeSineSample(freq, sampleRate, duration);
  return {
    programme: 0,
    nom: "test",
    presets: [] as any[],
    echantillons: [
      {
        nom: "sine",
        debut: 0,
        fin: smpl.length,
        debutBoucle: 0,
        finBoucle: 0,
        taux: sampleRate,
        noteOriginale: rootNote,
        correction: 0,
        type: 0,
      },
    ],
    instruments: [
      {
        nom: "sine-inst",
        zones: [
          {
            noteMin: 0,
            noteMax: 127,
            velMin: 0,
            velMax: 127,
            echantillonId: 0,
            boucleActive: false,
          },
        ],
      },
    ],
    smpl,
    bufferOriginal: smpl.buffer,
  };
}

function matchScore(buffer: AudioBuffer, expectedFreq: number, sampleRate = 44100) {
  const ch = buffer.getChannelData(0);
  // The renderer starts at sample index 0, so the output phase is known.
  let sum = 0;
  let sumOut = 0;
  let sumRef = 0;
  for (let i = 0; i < ch.length; i++) {
    const ref = Math.sin((2 * Math.PI * expectedFreq * i) / sampleRate);
    sum += ch[i] * ref;
    sumOut += ch[i] * ch[i];
    sumRef += ref * ref;
  }
  return sum / Math.sqrt(sumOut * sumRef);
}

describe("rendreAvecSF2 sample rate", () => {
  it("plays a 44.1 kHz sine at the correct pitch", () => {
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 69, freq: 441, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 441)).toBeGreaterThan(0.99);
  });

  it("plays a 22.05 kHz sine at the correct pitch", () => {
    const sf2 = buildSF2({ sampleRate: 22050, rootNote: 69, freq: 441, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 441)).toBeGreaterThan(0.99);
  });

  it("plays a 48 kHz sine at the correct pitch", () => {
    const sf2 = buildSF2({ sampleRate: 48000, rootNote: 69, freq: 480, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 69, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 480)).toBeGreaterThan(0.99);
  });

  it("transposes a 44.1 kHz sine by one octave", () => {
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 60, freq: 441, duration: 2 });
    const buffer = rendreAvecSF2(sf2 as any, [{ note: 72, velocite: 127, debut: 0, fin: 1 }], 100, 0);
    expect(matchScore(buffer, 882)).toBeGreaterThan(0.99);
  });

  it("does not clip when many notes overlap", () => {
    const sf2 = buildSF2({ sampleRate: 44100, rootNote: 69, freq: 441, duration: 2 });
    const notes = Array.from({ length: 8 }, () => ({ note: 69, velocite: 127, debut: 0, fin: 1 }));
    const buffer = rendreAvecSF2(sf2 as any, notes, 100, 0);
    const maxAmp = Math.max(
      ...buffer.getChannelData(0).map((x) => Math.abs(x)),
      ...buffer.getChannelData(1).map((x) => Math.abs(x)),
    );
    expect(maxAmp).toBeLessThanOrEqual(1 + 1e-6);
    expect(matchScore(buffer, 441)).toBeGreaterThan(0.99);
  });
});
