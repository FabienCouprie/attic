// audio/fenetre-hann.test.ts — Les deux canoniques de Hann rendent les bits des boucles qu'ils
// remplacent, et les deux écritures du cosinus sont la même chose.
//
// CE QUI EST MESURÉ ICI, ET PAS SEULEMENT CRU. Les copies écrivaient `0.5 - 0.5 * Math.cos(x)` ;
// `creerFenetreHann` écrit `0.5 * (1 - Math.cos(x))`. Les deux calculent `(1 − c) / 2` : la
// soustraction arrondit une fois, et diviser par deux est exact, donc l'arrondi tombe au même
// endroit. C'est un raisonnement sur IEEE 754 ; le cas le vérifie sur toutes les tailles du dépôt.
import { describe, expect, it } from "vitest";
import { creerFenetreHann } from "./commun";
import { fenetreHann } from "./stft";

const TAILLES = [2, 16, 64, 256, 441, 1024, 2048, 4096, 8192];

describe("fenêtres de Hann", () => {
  it("creerFenetreHann (symétrique) rend les bits de la boucle `0.5 - 0.5 * cos(2πi / (N - 1))`", () => {
    for (const N of TAILLES) {
      const temoin = new Float64Array(N);
      for (let i = 0; i < N; i++) temoin[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      expect(creerFenetreHann(N)).toEqual(temoin);
      // Et la forme sans parenthèses autour du numérateur, celle de `formants` et `ia`.
      const temoin2 = new Float64Array(N);
      for (let i = 0; i < N; i++) temoin2[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      expect(creerFenetreHann(N)).toEqual(temoin2);
    }
  });

  it("fenetreHann (périodique) rend les bits de la boucle `0.5 - 0.5 * cos(2πi / N)`", () => {
    for (const N of TAILLES) {
      const temoin = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      expect(fenetreHann(N)).toEqual(temoin);
    }
  });

  it("les deux fenêtres diffèrent, et c'est pourquoi il y en a deux", () => {
    const s = creerFenetreHann(1024), p = fenetreHann(1024);
    expect(s[1023]).toBe(0);
    expect(p[1023]).toBeGreaterThan(0);
  });
});
