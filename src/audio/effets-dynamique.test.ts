// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { calculerProfilBruit, reduireBruit, reduireBruitNotches } from "./effets-dynamique";

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngTest = mulberry32(20260805);

function bruitBlanc(dureeS: number, sr = 44100, channels = 1): AudioBuffer {
  const len = Math.round(dureeS * sr);
  const buf = new AudioBuffer({ numberOfChannels: channels, length: len, sampleRate: sr });
  for (let c = 0; c < channels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = rngTest() * 2 - 1;
  }
  return buf;
}

function signalAvecBruit(signalAmp: number, bruitAmp: number, sr = 44100): AudioBuffer {
  const len = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const signal = signalAmp * Math.sin(2 * Math.PI * 440 * t);
    const bruit = bruitAmp * (rngTest() * 2 - 1);
    ch[i] = signal + bruit;
  }
  return buf;
}

function bruitHum(dureeS: number, fHum: number, sr = 44100): AudioBuffer {
  const len = Math.round(dureeS * sr);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    ch[i] = Math.sin((2 * Math.PI * fHum * i) / sr);
  }
  return buf;
}

function signalAvecHum(signalAmp: number, humAmp: number, fHum: number, sr = 44100): AudioBuffer {
  const len = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ch[i] = signalAmp * Math.sin(2 * Math.PI * 440 * t) + humAmp * Math.sin(2 * Math.PI * fHum * t);
  }
  return buf;
}

function rms(buf: AudioBuffer): number {
  let s = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) { s += ch[i] * ch[i]; n++; }
  }
  return Math.sqrt(s / n);
}

describe("profil de bruit / réduction de bruit", () => {
  it("capture un profil non nul à partir de bruit blanc", () => {
    const bruit = bruitBlanc(1, 44100, 1);
    const profil = calculerProfilBruit(bruit);
    expect(profil).toBeInstanceOf(Float32Array);
    expect(profil.length).toBe(4097); // TAILLE_FFT/2 + 1
    const moyenne = profil.reduce((a, b) => a + b, 0) / profil.length;
    expect(moyenne).toBeGreaterThan(0.01);
  });

  it("réduit l'énergie du bruit sur un signal sinus + bruit", () => {
    // Profil plus long pour stabiliser la moyenne avec une FFT grande (8192)
    const bruit = bruitBlanc(1.5, 44100, 1);
    const profil = calculerProfilBruit(bruit);
    const melange = signalAvecBruit(0.5, 0.2);
    const rmsAvant = rms(melange);
    const reduit = reduireBruit(melange, profil, 0.8);
    const rmsApres = rms(reduit);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
    expect(rmsApres).toBeLessThan(rmsAvant);
  });

  it("fonctionne avec un extrait de bruit plus court qu'une trame FFT", () => {
    const bruitCourt = bruitBlanc(0.01, 44100, 1); // 441 échantillons < 2048
    const profil = calculerProfilBruit(bruitCourt);
    expect(profil).toBeInstanceOf(Float32Array);
    expect(profil.length).toBe(4097);
    const moyenne = profil.reduce((a, b) => a + b, 0) / profil.length;
    expect(moyenne).toBeGreaterThan(0.001);

    const melange = signalAvecBruit(0.5, 0.2);
    const reduit = reduireBruit(melange, profil, 0.8);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
  });

  it("débruit un signal plus court qu'une trame FFT", () => {
    const bruit = bruitBlanc(0.05, 44100, 1);
    const profil = calculerProfilBruit(bruit);
    const melangeCourt = signalAvecBruit(0.5, 0.2);
    const reduit = reduireBruit(melangeCourt, profil, 1.0);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melangeCourt.length);
    const ch = reduit.getChannelData(0);
    expect(ch.some((v) => Number.isNaN(v) || !Number.isFinite(v))).toBe(false);
  });

  it("les notches suppriment un ronflement sinusoïdal", () => {
    // fréquence alignée sur un bin FFT (129.2 Hz ≈ bin 6) pour que la détection
    // soit exacte et que le filtre coupe-bande cible la bonne fréquence
    const fHum = (44100 / 2048) * 6;
    const hum = bruitHum(1, fHum);
    const profil = calculerProfilBruit(hum);
    const melange = signalAvecHum(0.3, 0.2, fHum);
    const rmsAvant = rms(melange);
    const reduit = reduireBruitNotches(melange, profil, 2, 5, 10);
    const rmsApres = rms(reduit);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
    expect(rmsApres).toBeLessThan(rmsAvant * 0.9);
  });
});
