// audio/enveloppe-transfert.test.ts — Le contour d'un son, posé sur un autre.
//
// LE TEST QUI COMPTE est celui de l'aplatissement : multiplier simplement la cible par l'enveloppe
// du modèle donne le PRODUIT des deux contours, et non celui du modèle. Tant qu'on ne le mesure
// pas, les deux se ressemblent assez pour qu'on croie que ça marche.
import { describe, expect, it } from "vitest";
import { enveloppe, reechantillonnerEnveloppe, transfererEnveloppe, type OptionsTransfert } from "./enveloppe-transfert";

const SR = 44100;
const BASE: OptionsTransfert = { fenetre: 441, aplatir: true, plancher: 1e-4, melange: 1 };

/** Un son d'amplitude constante. */
function plat(dureeS: number, freq = 440, niveau = 1): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = niveau * Math.sin((2 * Math.PI * freq * i) / SR);
  return x;
}

/** Un son dont l'amplitude suit une rampe montante. */
function rampe(dureeS: number, freq = 300): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (i / n) * Math.sin((2 * Math.PI * freq * i) / SR);
  return x;
}

/** Un son qui bat : fort, silencieux, fort, silencieux. */
function battements(dureeS: number, coups: number, freq = 300): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const phase = ((i / n) * coups) % 1;
    x[i] = (phase < 0.3 ? 1 : 0.02) * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return x;
}

const rms = (x: Float32Array, a: number, z: number) => {
  let s = 0;
  for (let i = a; i < z; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, z - a));
};

describe("mesurer une enveloppe", () => {
  it("elle est constante sur un son constant", () => {
    const env = enveloppe(plat(0.5), 441);
    const milieu = [...env.subarray(SR * 0.1, SR * 0.4)];
    expect(Math.max(...milieu) - Math.min(...milieu)).toBeLessThan(0.05);
  });

  it("elle monte sur une rampe", () => {
    const env = enveloppe(rampe(0.5), 441);
    expect(env[Math.floor(SR * 0.4)]).toBeGreaterThan(env[Math.floor(SR * 0.1)] * 3);
  });

  it("elle suit les creux d'un son qui bat", () => {
    const env = enveloppe(battements(1, 4), 441);
    const fort = env[Math.floor(SR * 0.05)];
    const creux = env[Math.floor(SR * 0.2)];
    expect(fort).toBeGreaterThan(creux * 5);
  });

  it("une fenêtre longue efface ce qu'une fenêtre courte voit", () => {
    const x = battements(1, 8);
    const courte = enveloppe(x, 220);
    const longue = enveloppe(x, 8000);
    const amplitude = (e: Float32Array) => {
      const m = [...e.subarray(SR * 0.2, SR * 0.8)];
      return Math.max(...m) - Math.min(...m);
    };
    expect(amplitude(longue)).toBeLessThan(amplitude(courte) * 0.5);
  });

  it("un signal vide ne fait pas échouer la mesure", () => {
    expect(enveloppe(new Float32Array(0), 441).length).toBe(0);
  });
});

describe("rééchantillonner une enveloppe", () => {
  it("elle garde ses deux bouts", () => {
    const e = Float32Array.from([0, 0.5, 1]);
    const r = reechantillonnerEnveloppe(e, 100);
    expect(r[0]).toBeCloseTo(0, 5);
    expect(r[99]).toBeCloseTo(1, 5);
  });

  it("elle interpole entre les points", () => {
    const r = reechantillonnerEnveloppe(Float32Array.from([0, 1]), 3);
    expect(r[1]).toBeCloseTo(0.5, 5);
  });

  it("une enveloppe d'un seul point devient une constante", () => {
    // 0,5 plutôt que 0,7 : un Float32Array ne stocke pas 0,7 exactement, et le test aurait
    // échoué sur la représentation plutôt que sur ce qu'il prétend vérifier.
    expect([...reechantillonnerEnveloppe(Float32Array.from([0.5]), 4)]).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it("une enveloppe vide rend du silence, sans lever", () => {
    expect([...reechantillonnerEnveloppe(new Float32Array(0), 3)]).toEqual([0, 0, 0]);
  });
});

describe("transférer un contour", () => {
  it("le son plat prend les battements du modèle", () => {
    const cible = plat(1, 440);
    const modele = battements(1, 4, 300);
    const y = transfererEnveloppe(cible, modele, BASE);
    const fort = rms(y, Math.floor(SR * 0.02), Math.floor(SR * 0.2));
    const creux = rms(y, Math.floor(SR * 0.15), Math.floor(SR * 0.24));
    expect(fort).toBeGreaterThan(creux * 3);
  });

  it("la hauteur de la cible est conservée — on transfère un contour, pas un son", () => {
    const y = transfererEnveloppe(plat(0.5, 440), battements(0.5, 3, 80), BASE);
    let passages = 0;
    const a = Math.floor(SR * 0.02), z = Math.floor(SR * 0.14);
    for (let i = a + 1; i < z; i++) if (y[i - 1] <= 0 && y[i] > 0) passages++;
    const hz = (passages * SR) / (z - a);
    expect(hz).toBeGreaterThan(380);
    expect(hz).toBeLessThan(500);
  });

  it("APLATIR CHANGE LE RÉSULTAT : sans, on obtient le produit des deux contours", () => {
    // La cible monte, le modèle descend. Aplatie, la sortie doit descendre comme le modèle.
    // Non aplatie, les deux se compensent et la sortie reste à peu près plate.
    const cible = rampe(1, 440);
    const modele = new Float32Array(rampe(1, 300)).reverse() as unknown as Float32Array;
    const aplatie = transfererEnveloppe(cible, modele, BASE);
    const brute = transfererEnveloppe(cible, modele, { ...BASE, aplatir: false });
    const pente = (y: Float32Array) =>
      rms(y, Math.floor(SR * 0.7), Math.floor(SR * 0.9)) / (rms(y, Math.floor(SR * 0.1), Math.floor(SR * 0.3)) || 1e-9);
    expect(pente(aplatie)).toBeLessThan(0.6);   // elle descend, comme le modèle
    expect(pente(brute)).toBeGreaterThan(pente(aplatie) * 1.5);
  });

  it("le mélange à zéro rend la cible inchangée", () => {
    const cible = plat(0.3, 440);
    const y = transfererEnveloppe(cible, battements(0.3, 3), { ...BASE, melange: 0 });
    for (let i = 0; i < cible.length; i += 97) expect(y[i]).toBeCloseTo(cible[i], 6);
  });

  it("le mélange à moitié se tient entre les deux", () => {
    const cible = plat(0.5, 440);
    const modele = battements(0.5, 3, 300);
    const creux = (y: Float32Array) => rms(y, Math.floor(SR * 0.12), Math.floor(SR * 0.16));
    const plein = creux(transfererEnveloppe(cible, modele, BASE));
    const demi = creux(transfererEnveloppe(cible, modele, { ...BASE, melange: 0.5 }));
    const rien = creux(cible);
    expect(demi).toBeGreaterThan(plein);
    expect(demi).toBeLessThan(rien);
  });

  it("des durées différentes : l'enveloppe du modèle est étirée pour couvrir la cible", () => {
    const y = transfererEnveloppe(plat(1, 440), battements(0.25, 2, 300), BASE);
    expect(y.length).toBe(Math.floor(SR * 1));
    // Deux coups répartis sur toute la seconde, et non sur le premier quart.
    expect(rms(y, Math.floor(SR * 0.5), Math.floor(SR * 0.62))).toBeGreaterThan(
      rms(y, Math.floor(SR * 0.35), Math.floor(SR * 0.47)));
  });

  it("le plancher protège le silence : un passage muet n'est pas amplifié", () => {
    const cible = new Float32Array(SR);
    for (let i = SR / 2; i < SR; i++) cible[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
    const y = transfererEnveloppe(cible, plat(1, 300), { ...BASE, plancher: 1e-3 });
    expect(rms(y, 0, Math.floor(SR * 0.4))).toBeLessThan(1e-3);
    expect([...y].every(Number.isFinite)).toBe(true);
  });

  it("une cible vide ne fait pas échouer le transfert", () => {
    expect(transfererEnveloppe(new Float32Array(0), plat(0.2), BASE).length).toBe(0);
  });
});
