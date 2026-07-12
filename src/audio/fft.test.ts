import { describe, it, expect } from "vitest";
import { fft } from "./fft";

// La FFT sous-tend l'analyseur de spectre (ui/Spectre.tsx). On fige ici son
// comportement : une sinusoïde pure au bin k doit produire un pic au bin k.
describe("fft", () => {
  it("place le pic d'une cosinus pure au bon bin", () => {
    const N = 64;
    const k = 5; // fréquence discrète
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) { re[i] = Math.cos((2 * Math.PI * k * i) / N); im[i] = 0; }
    fft(re, im, false);
    // magnitude sur la moitié basse du spectre (0 → Nyquist)
    let pic = 0, magMax = -1;
    for (let b = 0; b < N / 2; b++) {
      const mag = Math.hypot(re[b], im[b]);
      if (mag > magMax) { magMax = mag; pic = b; }
    }
    expect(pic).toBe(k);
  });

  it("fft puis ifft restitue le signal d'origine", () => {
    const N = 32;
    const re0 = new Float64Array(N);
    const im0 = new Float64Array(N);
    for (let i = 0; i < N; i++) { re0[i] = Math.sin(i) + 0.5 * Math.cos(3 * i); im0[i] = 0; }
    const re = re0.slice();
    const im = im0.slice();
    fft(re, im, false);   // direct
    fft(re, im, true);    // inverse (normalise par N)
    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(re0[i], 9);
      expect(im[i]).toBeCloseTo(0, 9);
    }
  });
});
