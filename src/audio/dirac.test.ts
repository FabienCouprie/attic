// audio/dirac.test.ts — La ceinture de Dirac : le son fait le tour, revient
// devant inversé au premier tour, intact au second — et le témoin le fait entendre.
import { describe, it, expect } from "vitest";
import { tournerDirac } from "./dirac";

const SR = 44100;
const bruit = (n: number) => {
  const a = new Float32Array(n);
  let g = 23;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; a[i] = 0.5 * (g / 0x3fffffff - 1); }
  return a;
};
const energie = (a: Float32Array, c: number, d = 1024) => { let s = 0; for (let i = c - d; i < c + d; i++) s += a[i] * a[i]; return s; };
const dB = (x: number) => 10 * Math.log10(x);

const base = { tours: 3, fonduSec: 0, arriereDb: 6, coupureHz: 1500 };

describe("le tour de l'auditeur", () => {
  // Sans témoin, pour isoler la position.
  const r = tournerDirac([bruit(SR * 2)], SR, { ...base, temoin: 0 });
  const [L, R] = r.canaux;
  const pas = r.plan.pas;
  const total = (c: number) => energie(L, c) + energie(R, c);

  it("passe à droite au quart de tour et à gauche aux trois quarts", () => {
    expect(dB(energie(R, Math.round(pas / 4)) / energie(L, Math.round(pas / 4)))).toBeGreaterThan(20);
    expect(dB(energie(L, Math.round((3 * pas) / 4)) / energie(R, Math.round((3 * pas) / 4)))).toBeGreaterThan(20);
  });

  it("est plus faible et plus sourd derrière qu'en face", () => {
    const devant = Math.round(pas * 0.05), derriere = Math.round(pas / 2);
    expect(dB(total(derriere) / total(devant))).toBeLessThan(-4);
    // Plus sourd : moins d'énergie dans la différence entre échantillons voisins,
    // qui mesure le contenu aigu.
    const aigus = (c: number) => { let s = 0; for (let i = c - 1024; i < c + 1024; i++) { const d = L[i] - L[i - 1] + R[i] - R[i - 1]; s += d * d; } return s; };
    expect(aigus(derriere) / total(derriere)).toBeLessThan(0.5 * (aigus(devant) / total(devant)));
  });

  it("sans témoin, ne laisse pas entendre le tour : le niveau devant est le même au premier et au second", () => {
    expect(Math.abs(dB(total(pas) / total(2 * pas)))).toBeLessThan(0.5);
  });
});

describe("la ceinture, avec le témoin", () => {
  const r = tournerDirac([bruit(SR * 2)], SR, { ...base, temoin: 1 });
  const [L, R] = r.canaux;
  const pas = r.plan.pas;
  const total = (c: number) => energie(L, c) + energie(R, c);
  // À 5 % du tour et non à 0 : la fenêtre de mesure doit tenir dans le signal.
  const depart = total(Math.round(pas * 0.05));

  it("s'annule contre le témoin quand le son revient devant après UN tour", () => {
    expect(dB(total(pas) / depart)).toBeLessThan(-25);
  });

  it("retrouve son niveau après DEUX tours : la ceinture est dénouée", () => {
    expect(Math.abs(dB(total(2 * pas) / depart))).toBeLessThan(0.5);
  });
});
