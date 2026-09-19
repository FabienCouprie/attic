// audio/decalage-frequence.test.ts — Décalage de fréquence par transformée de Hilbert.
//
// Tout se vérifie sur des sinusoïdes, où la bonne réponse est connue d'avance : la transformée
// de Hilbert d'un cosinus est un sinus, et un harmonique 200-400-600 décalé de 50 doit tomber
// sur 250-450-650 — c'est-à-dire cesser d'être harmonique, ce qui est tout l'objet du procédé.
import { describe, expect, it } from "vitest";
import { decalerFrequence, frequenceDecalee, hilbert } from "./decalage-frequence";

const SR = 44100;

const onde = (freq: number, n = 16384, fn: (a: number) => number = Math.cos) =>
  Float32Array.from({ length: n }, (_, i) => fn(2 * Math.PI * freq * i / SR));

/**
 * Amplitude à une fréquence donnée, par corrélation avec un cosinus et un sinus.
 * On écarte les bords, que le fenêtrage atténue.
 */
function amplitude(x: Float32Array, freq: number): number {
  const debut = 2048, fin = x.length - 2048;
  let c = 0, s = 0;
  for (let i = debut; i < fin; i++) {
    const a = 2 * Math.PI * freq * i / SR;
    c += x[i] * Math.cos(a);
    s += x[i] * Math.sin(a);
  }
  const n = fin - debut;
  return 2 * Math.hypot(c, s) / n;
}

describe("la transformée de Hilbert", () => {
  it("change un cosinus en sinus : 90 degrés de retard", () => {
    const h = hilbert(onde(1000));
    const attendu = onde(1000, 16384, Math.sin);
    let ecart = 0;
    for (let i = 3000; i < 13000; i++) ecart = Math.max(ecart, Math.abs(h[i] - attendu[i]));
    expect(ecart).toBeLessThan(0.02);
  });

  it("garde l'amplitude", () => {
    expect(amplitude(hilbert(onde(2000)), 2000)).toBeCloseTo(1, 1);
  });

  it("appliquée deux fois, elle rend l'opposé du signal — la signature du déphasage", () => {
    // Deux fois 90 degrés font 180 : c'est ce qui prouve qu'il s'agit bien d'un déphasage et
    // non d'un filtre quelconque qui produirait « un sinus » par hasard.
    const x = onde(1500);
    const hh = hilbert(hilbert(x));
    let ecart = 0;
    for (let i = 4000; i < 12000; i++) ecart = Math.max(ecart, Math.abs(hh[i] + x[i]));
    expect(ecart).toBeLessThan(0.05);
  });

  it("ne rend rien d'un signal continu, qui n'a pas de phase à décaler", () => {
    const h = hilbert(Float32Array.from({ length: 8192 }, () => 0.5));
    let m = 0;
    for (let i = 3000; i < 5000; i++) m = Math.max(m, Math.abs(h[i]));
    expect(m).toBeLessThan(0.01);
  });
});

describe("le décalage", () => {
  it("déplace une sinusoïde du nombre de hertz demandé", () => {
    const y = decalerFrequence(onde(1000), 250, { sampleRate: SR });
    expect(amplitude(y, 1250)).toBeGreaterThan(0.9);
    // Et il ne laisse RIEN à la fréquence d'origine : c'est une bande latérale unique, pas une
    // modulation en anneau.
    expect(amplitude(y, 1000)).toBeLessThan(0.05);
  });

  it("ne laisse pas non plus la seconde bande latérale, que l'anneau produirait", () => {
    // Un modulateur en anneau à 250 Hz rendrait 750 ET 1250. Le décaleur ne rend que l'un.
    const y = decalerFrequence(onde(1000), 250, { sampleRate: SR });
    expect(amplitude(y, 750)).toBeLessThan(0.05);
  });

  it("descend aussi, sur un décalage négatif", () => {
    const y = decalerFrequence(onde(1000), -300, { sampleRate: SR });
    expect(amplitude(y, 700)).toBeGreaterThan(0.9);
    expect(amplitude(y, 1300)).toBeLessThan(0.05);
  });

  it("DÉTRUIT L'HARMONICITÉ, ce qu'aucune transposition ne fait", () => {
    // Le test qui dit ce qu'est ce nœud. Un son harmonique 200-400-600 décalé de 50 tombe sur
    // 250-450-650 : les rapports ne sont plus entiers, et c'est pourquoi on entend une cloche.
    const n = 16384;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      for (const f of [200, 400, 600]) x[i] += Math.cos(2 * Math.PI * f * i / SR) / 3;
    }
    const y = decalerFrequence(x, 50, { sampleRate: SR });
    for (const f of [250, 450, 650]) expect(amplitude(y, f), `${f} Hz`).toBeGreaterThan(0.25);
    for (const f of [200, 400, 600]) expect(amplitude(y, f), `${f} Hz`).toBeLessThan(0.05);
  });

  it("ne touche à rien à zéro hertz", () => {
    const x = onde(440);
    const y = decalerFrequence(x, 0, { sampleRate: SR });
    expect([...y.slice(0, 50)]).toEqual([...x.slice(0, 50)]);
  });

  it("garde la longueur du signal", () => {
    expect(decalerFrequence(onde(440, 5000), 100, { sampleRate: SR }).length).toBe(5000);
  });
});

describe("le repliement sous zéro, nommé plutôt que caché", () => {
  it("fait remonter ce qui passerait sous zéro hertz", () => {
    // Descendre 200 Hz de 300 ne donne pas −100 : cela donne 100, de l'autre côté de zéro.
    // C'est inhérent à une bande latérale unique, et c'est une part du caractère du procédé.
    expect(frequenceDecalee(200, -300)).toBe(100);
    expect(frequenceDecalee(200, 300)).toBe(500);
  });

  it("et cela s'entend : le partiel replié est bien là", () => {
    const y = decalerFrequence(onde(200), -300, { sampleRate: SR });
    expect(amplitude(y, 100)).toBeGreaterThan(0.8);
  });
});
