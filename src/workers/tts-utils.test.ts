import { describe, it, expect } from "vitest";
import { splitText, trimSilence, mergeAudioBuffers } from "./tts-utils.js";

describe("splitText", () => {
  it("retourne un texte court tel quel", () => {
    expect(splitText("Bonjour.", 250)).toEqual(["Bonjour."]);
  });

  it("découpe aux limites de phrases quand c'est possible", () => {
    const text = "Première phrase. Deuxième phrase. Troisième phrase.";
    const chunks = splitText(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatch(/Première phrase\.?$/);
    expect(chunks[chunks.length - 1]).toMatch(/Troisième phrase\.?$/);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it("ne coupe pas au milieu d'un mot quand une phrase dépasse", () => {
    const words = Array.from({ length: 50 }, (_, i) => `mot${i}`);
    const text = words.join(" ") + ".";
    const chunks = splitText(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
      // Aucun chunk ne doit commencer ou finir par un espace mal placé.
      expect(chunk.trim()).toBe(chunk);
    }
  });

  it("protège les abréviations courantes", () => {
    const text = "M. Dupont et Dr. Martin sont là. Ils arrivent.";
    const chunks = splitText(text, 40);
    // "M. Dupont et Dr. Martin sont là." doit rester ensemble car abréviations protégées.
    const joined = chunks.join(" ");
    expect(joined).toContain("M. Dupont");
    expect(joined).toContain("Dr. Martin");
  });

  it("protège les nombres décimaux", () => {
    const text = "La valeur est 3.14 et la suite est 2.718.";
    const chunks = splitText(text, 30);
    const joined = chunks.join(" ");
    expect(joined).toContain("3.14");
    expect(joined).toContain("2.718");
  });

  it("normalise les espaces multiples", () => {
    const text = "Phrase    un.   Phrase deux.";
    expect(splitText(text, 250)).toEqual(["Phrase un. Phrase deux."]);
  });

  it("retourne [''] pour un texte vide", () => {
    expect(splitText("", 250)).toEqual([""]);
  });

  it("garantit qu'aucun chunk ne dépasse la limite", () => {
    const text = "a".repeat(500);
    const chunks = splitText(text, 30);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });

  it("découpe sur les tirets et les cadratins", () => {
    const text = "Mot1—mot2–mot3-mot4 / mot5_mot6";
    const chunks = splitText(text, 15);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
  });
});

describe("mergeAudioBuffers", () => {
  it("retourne le buffer tel quel s'il n'y en a qu'un", () => {
    const buf = new Float32Array([1, 2, 3]);
    const merged = mergeAudioBuffers([buf], { sampleRate: 1000 });
    expect(merged).toBe(buf);
  });

  it("retourne null pour une liste vide", () => {
    expect(mergeAudioBuffers([], { sampleRate: 1000 })).toBeNull();
  });

  it("concatène deux buffers avec une taille correcte", () => {
    const a = new Float32Array(200).fill(1.0);
    const b = new Float32Array(200).fill(0.5);
    // 10 ms à 10 000 Hz = 100 échantillons de crossfade.
    const merged = mergeAudioBuffers([a, b], { sampleRate: 10000, crossfadeMs: 10 });
    expect(merged).not.toBeNull();
    expect(merged!.length).toBe(300);
  });

  it("applique un crossfade cosine entre deux buffers", () => {
    const a = new Float32Array(200).fill(1.0);
    const b = new Float32Array(200).fill(0.5);
    const merged = mergeAudioBuffers([a, b], { sampleRate: 10000, crossfadeMs: 10 });
    expect(merged).not.toBeNull();

    // Début : presque uniquement le buffer A.
    expect(merged![0]).toBe(1.0);
    // Fin : uniquement le buffer B.
    expect(merged![merged!.length - 1]).toBe(0.5);
    // Zone de crossfade (échantillons 100..199) : valeur intermédiaire.
    expect(merged![150]).toBeGreaterThan(0.5);
    expect(merged![150]).toBeLessThan(1.0);
  });

  it("tombe en concaténation simple si le crossfade est nul", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    const merged = mergeAudioBuffers([a, b], { sampleRate: 1000, crossfadeMs: 0 });
    expect(merged).not.toBeNull();
    expect(Array.from(merged!)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("gère des buffers très courts sans erreur", () => {
    const a = new Float32Array([1]);
    const b = new Float32Array([2]);
    const merged = mergeAudioBuffers([a, b], { sampleRate: 10000, crossfadeMs: 10 });
    expect(merged).not.toBeNull();
    expect(merged!.length).toBeGreaterThan(0);
  });
});

describe("trimSilence", () => {
  it("retourne le buffer tel quel s'il est vide", () => {
    const buf = new Float32Array(0);
    expect(trimSilence(buf, 1000)).toBe(buf);
  });

  it("supprime le silence de début et de fin", () => {
    const sampleRate = 1000;
    const silence = new Float32Array(50).fill(0);
    const signal = new Float32Array(50).fill(0.5);
    const buf = new Float32Array([...silence, ...signal, ...silence]);
    const trimmed = trimSilence(buf, sampleRate, { threshold: 0.1, leadingMs: 0, trailingMs: 0 });
    expect(trimmed.length).toBe(50);
    expect(trimmed[0]).toBe(0.5);
    expect(trimmed[trimmed.length - 1]).toBe(0.5);
  });

  it("garde les marges de sécurité par défaut", () => {
    const sampleRate = 1000;
    const silence = new Float32Array(30).fill(0); // 30 ms de silence
    const signal = new Float32Array(50).fill(0.5);
    const buf = new Float32Array([...silence, ...signal, ...silence]);
    const trimmed = trimSilence(buf, sampleRate, { threshold: 0.1 });
    // leading 25 ms + signal 50 ms + trailing 25 ms = 100 ms = 100 échantillons
    expect(trimmed.length).toBe(100);
  });

  it("retourne le buffer original si tout est silencieux", () => {
    const buf = new Float32Array(100).fill(0);
    const trimmed = trimSilence(buf, 1000, { threshold: 0.01 });
    expect(trimmed).toBe(buf);
  });

  it("retourne le buffer original si le signal est en dessous du seuil", () => {
    const buf = new Float32Array(100).fill(0.001);
    const trimmed = trimSilence(buf, 1000, { threshold: 0.01 });
    expect(trimmed).toBe(buf);
  });

  it("trimme un buffer réel avec silence et signal", () => {
    const sampleRate = 10000;
    const silence = new Float32Array(500).fill(0); // 50 ms
    const signal = new Float32Array(100).fill(1.0); // 10 ms
    const buf = new Float32Array([...silence, ...signal, ...silence]);
    const trimmed = trimSilence(buf, sampleRate);
    // Doit être plus court que le buffer original grâce au trim.
    expect(trimmed.length).toBeLessThan(buf.length);
    // Mais doit inclure le signal.
    expect(trimmed.length).toBeGreaterThanOrEqual(100);
  });
});
