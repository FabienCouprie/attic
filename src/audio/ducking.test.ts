// audio/ducking.test.ts — Un son qui s'efface devant un autre.
//
// LE TEST QUI DISTINGUE CE NŒUD DE TOUS LES AUTRES : l'atténuation doit suivre le DÉCLENCHEUR et
// non la cible. On le montre en donnant une cible d'énergie constante — aucun compresseur ne la
// toucherait — et en vérifiant qu'elle creuse là où le déclencheur parle.
import { describe, expect, it } from "vitest";
import { ducking, enveloppeDeclencheur, gainsDucking, type OptionsDucking } from "./ducking";

const SR = 44100;
const BASE: OptionsDucking = {
  seuilDb: -30, reductionDb: 20, attaqueSec: 0.01, relachementSec: 0.1, maintienSec: 0.05, frequence: SR,
};

/** Un son d'amplitude constante. */
const plat = (dureeS: number, niveau = 1) =>
  Float32Array.from({ length: Math.floor(SR * dureeS) }, (_, i) => niveau * Math.sin((2 * Math.PI * 440 * i) / SR));

/** Du silence, puis un son fort, puis du silence. */
function impulsion(dureeS: number, debutS: number, finS: number): Float32Array {
  const x = new Float32Array(Math.floor(SR * dureeS));
  for (let i = Math.floor(SR * debutS); i < Math.floor(SR * finS) && i < x.length; i++) {
    x[i] = Math.sin((2 * Math.PI * 200 * i) / SR);
  }
  return x;
}

const rms = (x: Float32Array, a: number, z: number) => {
  let s = 0;
  for (let i = Math.floor(a); i < Math.min(Math.floor(z), x.length); i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, Math.floor(z) - Math.floor(a)));
};

describe("l'enveloppe du déclencheur", () => {
  it("monte tout de suite et redescend lentement", () => {
    const env = enveloppeDeclencheur(impulsion(1, 0.2, 0.5), SR, 0.05);
    expect(env[Math.floor(SR * 0.21)]).toBeGreaterThan(0.5);
    // Juste après la fin, elle n'est pas encore retombée.
    expect(env[Math.floor(SR * 0.52)]).toBeGreaterThan(0.2);
    expect(env[Math.floor(SR * 0.9)]).toBeLessThan(0.05);
  });

  it("un déclencheur muet donne une enveloppe nulle", () => {
    const env = enveloppeDeclencheur(new Float32Array(1000), SR);
    expect([...env].every((v) => v === 0)).toBe(true);
  });
});

describe("les gains", () => {
  it("valent un au repos, et descendent au plancher quand le déclencheur parle", () => {
    const g = gainsDucking(impulsion(1, 0.3, 0.6), Math.floor(SR * 1), BASE);
    expect(g[Math.floor(SR * 0.1)]).toBeCloseTo(1, 2);
    expect(g[Math.floor(SR * 0.45)]).toBeLessThan(0.15); // -20 dB valent 0,1
    expect(g[Math.floor(SR * 0.95)]).toBeGreaterThan(0.9);
  });

  it("l'atténuation demandée est celle qu'on obtient", () => {
    const g = gainsDucking(plat(1), Math.floor(SR * 1), { ...BASE, reductionDb: 6 });
    expect(g[Math.floor(SR * 0.9)]).toBeCloseTo(Math.pow(10, -6 / 20), 2);
  });

  it("le maintien empêche la musique de remonter entre deux mots", () => {
    // Deux impulsions séparées d'un dixième de seconde.
    const d = new Float32Array(Math.floor(SR * 1));
    for (const [a, z] of [[0.2, 0.3], [0.4, 0.5]]) {
      for (let i = Math.floor(SR * a); i < Math.floor(SR * z); i++) d[i] = Math.sin((2 * Math.PI * 200 * i) / SR);
    }
    const avec = gainsDucking(d, d.length, { ...BASE, maintienSec: 0.15, relachementSec: 0.05 });
    const sans = gainsDucking(d, d.length, { ...BASE, maintienSec: 0, relachementSec: 0.05 });
    // Entre les deux mots, celui qui maintient reste bas ; l'autre est remonté.
    expect(avec[Math.floor(SR * 0.36)]).toBeLessThan(sans[Math.floor(SR * 0.36)]);
  });

  it("une attaque lente met plus de temps à descendre", () => {
    const d = impulsion(1, 0.3, 0.8);
    const vite = gainsDucking(d, d.length, { ...BASE, attaqueSec: 0.001 });
    const lente = gainsDucking(d, d.length, { ...BASE, attaqueSec: 0.2 });
    expect(lente[Math.floor(SR * 0.32)]).toBeGreaterThan(vite[Math.floor(SR * 0.32)]);
  });

  it("un déclencheur plus court que la cible : au-delà, plus rien ne déclenche", () => {
    const g = gainsDucking(plat(0.2), Math.floor(SR * 1), BASE);
    expect(g[Math.floor(SR * 0.15)]).toBeLessThan(0.2);
    expect(g[Math.floor(SR * 0.9)]).toBeGreaterThan(0.9);
  });
});

describe("le son", () => {
  it("LA CIBLE EST CONSTANTE, et pourtant elle creuse : c'est l'autre entrée qui commande", () => {
    const cible = plat(1);
    const y = ducking(cible, impulsion(1, 0.3, 0.6), BASE);
    // La cible n'a aucune raison propre de baisser : son énergie est la même partout.
    expect(rms(cible, SR * 0.1, SR * 0.2)).toBeCloseTo(rms(cible, SR * 0.4, SR * 0.5), 2);
    // La sortie, elle, creuse là où le déclencheur parle.
    expect(rms(y, SR * 0.4, SR * 0.5)).toBeLessThan(rms(y, SR * 0.1, SR * 0.2) * 0.2);
  });

  it("un déclencheur muet laisse la cible intacte", () => {
    const cible = plat(0.5);
    const y = ducking(cible, new Float32Array(cible.length), BASE);
    for (let i = 0; i < cible.length; i += 313) expect(y[i]).toBeCloseTo(cible[i], 5);
  });

  it("une réduction nulle laisse la cible intacte, déclencheur ou non", () => {
    const cible = plat(0.5);
    const y = ducking(cible, plat(0.5), { ...BASE, reductionDb: 0 });
    for (let i = 0; i < cible.length; i += 313) expect(y[i]).toBeCloseTo(cible[i], 5);
  });

  it("un seuil très haut ne déclenche jamais", () => {
    const cible = plat(0.5);
    const y = ducking(cible, plat(0.5), { ...BASE, seuilDb: 20 });
    expect(rms(y, 0, cible.length)).toBeCloseTo(rms(cible, 0, cible.length), 3);
  });

  it("le son rendu reste fini aux réglages extrêmes", () => {
    const y = ducking(plat(0.3), plat(0.3), {
      seuilDb: -80, reductionDb: 60, attaqueSec: 0, relachementSec: 0, maintienSec: 10, frequence: SR,
    });
    expect([...y].every(Number.isFinite)).toBe(true);
  });
});
