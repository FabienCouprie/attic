// audio/stft.test.ts — Une analyse-synthèse qui ne touche à rien doit rendre le
// signal au bit près (à l'arrondi flottant), bords compris.
import { describe, it, expect } from "vitest";
import { analyseSynthese } from "./stft";

const bruit = (n: number) => {
  const a = new Float32Array(n);
  let g = 31;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; a[i] = 0.5 * (g / 0x3fffffff - 1); }
  return a;
};

describe("analyseSynthese", () => {
  it.each([512, 2048])("reconstruit exactement avec une trame de %i, bords compris", (taille) => {
    const x = bruit(20_000);
    const [y] = analyseSynthese(x, taille, 1, (re, im, sRe, sIm) => { sRe[0].set(re); sIm[0].set(im); });
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(y[i] - x[i]));
    expect(ecart).toBeLessThan(1e-6);
    // Les tout premiers et derniers échantillons, couverts par moins de trames.
    expect(Math.abs(y[0] - x[0])).toBeLessThan(1e-6);
    expect(Math.abs(y[x.length - 1] - x[x.length - 1])).toBeLessThan(1e-6);
  });

  it("répartit exactement un signal entre plusieurs sorties dont les masques se somment à 1", () => {
    const x = bruit(10_000);
    const [a, b] = analyseSynthese(x, 1024, 2, (re, im, sRe, sIm) => {
      for (let k = 0; k < re.length; k++) {
        const m = k % 3 === 0 ? 0.3 : 0.8;
        sRe[0][k] = re[k] * m; sIm[0][k] = im[k] * m;
        sRe[1][k] = re[k] * (1 - m); sIm[1][k] = im[k] * (1 - m);
      }
    });
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(a[i] + b[i] - x[i]));
    expect(ecart).toBeLessThan(1e-6);
  });
});
