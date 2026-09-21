// audio/morphing-spectral.test.ts — Le milieu doit être un son, pas deux.
//
// LE TEST QUI DISTINGUE UN MORPHING D'UN FONDU ENCHAÎNÉ, et c'est le seul qui compte vraiment :
// à mi-chemin entre un son sourd et un son brillant, le centroïde spectral doit se trouver ENTRE
// les deux. Un fondu enchaîné, lui, additionne les deux spectres : son centroïde à mi-chemin est
// la moyenne pondérée des énergies, et il colle au plus fort des deux.
//
// LE SECOND TEST tient l'interpolation logarithmique, qui est la raison pour laquelle le milieu
// est au milieu : en linéaire, un partiel à 1 et un partiel à 0,01 se moyennent à 0,505, soit le
// son fort à un demi-décibel près.
import { describe, expect, it } from "vitest";
import { centroide, morphingSpectral } from "./morphing-spectral";

const SR = 22050;
const N = 16384;

const sinus = (hz: number, amplitude = 0.5) =>
  Float32Array.from({ length: N }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / SR));

const cents = (a: number, b: number) => 1200 * Math.log2(a / b);

describe("le morphing spectral", () => {
  const sourd = sinus(200), brillant = sinus(3000);

  it("à zéro, c'est le premier son ; à un, c'est le second", () => {
    expect(cents(centroide(morphingSpectral(sourd, brillant, { melange: 0 }), SR), 200)).toBeLessThan(200);
    expect(cents(centroide(morphingSpectral(sourd, brillant, { melange: 1 }), SR), 3000)).toBeLessThan(200);
  });

  it("À MI-CHEMIN, LE SON EST ENTRE LES DEUX — et non l'un des deux", () => {
    const milieu = centroide(morphingSpectral(sourd, brillant, { melange: 0.5 }), SR);
    expect(milieu).toBeGreaterThan(400);                 // loin du son sourd
    expect(cents(3000, milieu)).toBeGreaterThan(100);    // et à plus d'un demi-ton du brillant
  });

  it("le centroïde avance avec le réglage, sans reculer", () => {
    const suite = [0, 0.25, 0.5, 0.75, 1].map((m) =>
      centroide(morphingSpectral(sourd, brillant, { melange: m }), SR));
    // La progression SATURE près du haut : à 0,75 le centroïde vaut déjà 3000,19 Hz et à 1,00
    // 3000,34 — quinze centièmes de hertz d'écart, soit rien. On demande donc qu'il ne RECULE
    // jamais, et que la course totale soit franche.
    for (let i = 1; i < suite.length; i++) expect(suite[i]).toBeGreaterThan(suite[i - 1] - 1);
    expect(suite[4] / suite[0]).toBeGreaterThan(5);
  });

  it("L'INTERPOLATION EST LOGARITHMIQUE : le fort n'écrase pas le faible", () => {
    // Un son fort et sourd contre un son cent fois plus faible et brillant. En linéaire, le milieu
    // serait à un demi-décibel du son fort ; en logarithme, il est vraiment au milieu.
    const fort = sinus(200, 0.5), faible = sinus(3000, 0.005);
    const milieu = centroide(morphingSpectral(fort, faible, { melange: 0.5 }), SR);
    expect(milieu).toBeGreaterThan(400);
  });

  it("une courbe branchée traverse d'un son à l'autre au fil du temps", () => {
    const rampe = Float32Array.from({ length: N }, (_, i) => i / (N - 1));
    const y = morphingSpectral(sourd, brillant, { melange: 0, melangeCourbe: rampe });
    const quart = Math.floor(N / 4);
    const debut = centroide(y.subarray(0, quart * 2), SR, 2048);
    const fin = centroide(y.subarray(N - quart * 2), SR, 2048);
    expect(fin).toBeGreaterThan(debut * 2);
  });

  it("garde la longueur du plus long des deux", () => {
    const court = sinus(400).subarray(0, 4096);
    expect(morphingSpectral(court, brillant, { melange: 0.5 }).length).toBe(N);
    expect(morphingSpectral(brillant, court, { melange: 0.5 }).length).toBe(N);
  });

  it("le silence ne fait ni lever ni rendre des valeurs impossibles", () => {
    const rien = new Float32Array(N);
    for (const m of [0, 0.5, 1]) {
      const y = morphingSpectral(rien, brillant, { melange: m });
      expect([...y].every(Number.isFinite)).toBe(true);
    }
    expect([...morphingSpectral(rien, rien, { melange: 0.5 })].every((v) => Math.abs(v) < 1e-6)).toBe(true);
  });

  it("LE NIVEAU À MI-CHEMIN RESTE ENTRE LES DEUX, et ne disparaît pas", () => {
    // Sans rétablissement d'énergie, la moyenne géométrique des cases faisait tomber le niveau de
    // trente-deux décibels sur deux sinus — mesuré dans l'application avant correction.
    const rms = (x: Float32Array) => Math.sqrt([...x].reduce((a, v) => a + v * v, 0) / x.length);
    const milieu = rms(morphingSpectral(sourd, brillant, { melange: 0.5 }));
    const bas = Math.min(rms(sourd), rms(brillant)), haut = Math.max(rms(sourd), rms(brillant));
    expect(milieu).toBeGreaterThan(0.5 * bas);
    expect(milieu).toBeLessThan(1.5 * haut);
  });

  it("deux sons identiques se morphent en eux-mêmes", () => {
    const y = morphingSpectral(sourd, sourd, { melange: 0.5 });
    expect(cents(centroide(y, SR), centroide(sourd, SR))).toBeLessThan(50);
  });
});
