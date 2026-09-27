// audio/dosage.test.ts — Le dosage d'un effet sur une portion de temps.
//
// CE QUI EST TENU ICI, et dans cet ordre : que le fondu ne laisse aucune discontinuité, puisque
// c'est la raison d'être du nœud ; que la zone soit traitée en entier, fondu ou pas, puisque c'est
// ce qu'on a demandé en la traçant ; et que les deux cas dégénérés rendent EXACTEMENT le sec et
// EXACTEMENT le traité, sans quoi un dosage à zéro abîmerait un son qu'il devait laisser passer.
import { describe, expect, it } from "vitest";

import { doser, enveloppeDeZones } from "./dosage";

const SR = 1000;
const constante = (n: number, v: number) => new Float32Array(n).fill(v);

/** Un bruit reproductible : deux graines donnent deux signaux sans rapport de phase. */
function bruit(n: number, graine: number): Float32Array {
  let g = graine | 0 || 1;
  return Float32Array.from({ length: n }, () => {
    g = (g * 1103515245 + 12345) & 0x7fffffff;
    return (g / 0x7fffffff) * 2 - 1;
  });
}

const rms = (x: Float32Array, de: number, a: number) => {
  let s = 0;
  for (let i = de; i < a; i++) s += x[i] * x[i];
  return Math.sqrt(s / (a - de));
};

const sautMaximal = (x: Float32Array) => {
  let m = 0;
  for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
  return m;
};

describe("l'enveloppe d'application", () => {
  it("SANS ZONE, ELLE VAUT UN PARTOUT, et le complément de rien est le tout", () => {
    const pleine = enveloppeDeZones({ longueur: 100, sampleRate: SR });
    expect([...pleine].every((v) => v === 1)).toBe(true);
    const complement = enveloppeDeZones({ longueur: 100, sampleRate: SR, horsZones: true });
    expect([...complement].every((v) => v === 1)).toBe(true);
  });

  it("une zone donne un dedans, zéro dehors, et une rampe à chaque frontière", () => {
    const env = enveloppeDeZones({
      longueur: 1000, sampleRate: SR,
      zones: [{ debut: 0.4, duree: 0.2 }],
      fonduEntreeSec: 0.1, fonduSortieSec: 0.05,
    });
    expect(env[0]).toBe(0);
    expect(env[299]).toBe(0);
    expect(env[300]).toBeCloseTo(0, 6);
    expect(env[350]).toBeCloseTo(0.5, 6);
    expect(env[399]).toBeCloseTo(0.99, 6);
    expect(env[400]).toBe(1);
    expect(env[599]).toBe(1);
    expect(env[600]).toBeCloseTo(0.98, 6);
    expect(env[624]).toBeCloseTo(0.5, 6);
    expect(env[649]).toBeCloseTo(0, 6);
    expect(env[650]).toBe(0);
  });

  it("LE FONDU EST DEHORS : une zone plus courte que son fondu atteint quand même sa dose", () => {
    // Vingt millisecondes de zone, cent de fondu de chaque côté : la zone reste pleine.
    const env = enveloppeDeZones({
      longueur: 1000, sampleRate: SR,
      zones: [{ debut: 0.5, duree: 0.02 }],
      fonduEntreeSec: 0.1, fonduSortieSec: 0.1,
    });
    for (let i = 500; i < 520; i++) expect(env[i], `indice ${i}`).toBe(1);
    expect(env[400]).toBeCloseTo(0, 6);
    expect(env[619]).toBeCloseTo(0, 6);
  });

  it("DEUX ZONES VOISINES NE CREUSENT PAS ENTRE ELLES, et rien ne dépasse un", () => {
    // Vingt millisecondes d'écart pour des fondus de cent : les deux rampes se rencontrent.
    const env = enveloppeDeZones({
      longueur: 1000, sampleRate: SR,
      zones: [{ debut: 0.2, duree: 0.1 }, { debut: 0.32, duree: 0.1 }],
      fonduEntreeSec: 0.1, fonduSortieSec: 0.1,
    });
    for (let i = 300; i < 320; i++) expect(env[i], `indice ${i}`).toBeGreaterThan(0.79);
    expect(Math.max(...env)).toBe(1);
  });

  it("le complément est exact : les deux enveloppes font un en tout point", () => {
    const o = {
      longueur: 1000, sampleRate: SR,
      zones: [{ debut: 0.3, duree: 0.2 }], fonduEntreeSec: 0.05, fonduSortieSec: 0.08,
    };
    const dedans = enveloppeDeZones(o);
    const dehors = enveloppeDeZones({ ...o, horsZones: true });
    for (let i = 0; i < 1000; i += 7) expect(dedans[i] + dehors[i], `indice ${i}`).toBeCloseTo(1, 6);
  });

  it("une zone qui déborde du signal est ramenée à ses bords", () => {
    const env = enveloppeDeZones({
      longueur: 100, sampleRate: SR,
      zones: [{ debut: -0.5, duree: 10 }], fonduEntreeSec: 0.02, fonduSortieSec: 0.02,
    });
    expect([...env].every((v) => v === 1)).toBe(true);
  });
});

describe("le mélange", () => {
  const sec = [constante(100, 0.5)];
  const traite = [constante(100, -0.25)];

  it("UN DOSAGE NUL REND EXACTEMENT LE SEC, et un dosage plein exactement le traité", () => {
    const zero = doser(sec, traite, constante(100, 0))[0];
    expect([...zero]).toEqual([...sec[0]]);
    const plein = doser(sec, traite, constante(100, 1))[0];
    expect([...plein]).toEqual([...traite[0]]);
  });

  it("EN DÉPART, LE SEC RESTE ENTIER et le traité s'ajoute", () => {
    const y = doser(sec, traite, constante(100, 1), { mode: "depart" })[0];
    for (const v of y) expect(v).toBeCloseTo(0.25, 6);
    const moitie = doser(sec, traite, constante(100, 0.5), { mode: "depart" })[0];
    for (const v of moitie) expect(v).toBeCloseTo(0.375, 6);
  });

  it("LA LOI DE PUISSANCE TIENT LE NIVEAU sur deux sons sans rapport de phase, la linéaire creuse", () => {
    const n = 4000;
    const a = Float32Array.from({ length: n }, (_, i) => i / (n - 1));
    const x = [bruit(n, 7)], z = [bruit(n, 91)];
    const reference = rms(x[0], 0, 400);
    const lineaire = doser(x, z, a, { loi: "lineaire" })[0];
    const puissance = doser(x, z, a, { loi: "puissance" })[0];
    // Au milieu du fondu, là où les deux parts sont égales.
    const creux = 20 * Math.log10(rms(lineaire, n / 2 - 200, n / 2 + 200) / reference);
    const tenu = 20 * Math.log10(rms(puissance, n / 2 - 200, n / 2 + 200) / reference);
    // Relevé : la linéaire creuse 3,17 dB, la puissance constante tient à 0,17 dB près.
    expect(creux).toBeLessThan(-2.5);
    expect(creux).toBeGreaterThan(-3.5);
    expect(Math.abs(tenu)).toBeLessThan(0.5);
  });

  it("LE FONDU SUPPRIME LE CLIC, et le chiffre le dit", () => {
    const n = 2000;
    const muet = [constante(n, 0)], plein = [constante(n, 1)];
    const zones = [{ debut: 0.5, duree: 0.5 }];
    const sansFondu = enveloppeDeZones({ longueur: n, sampleRate: SR, zones });
    const avecFondu = enveloppeDeZones({
      longueur: n, sampleRate: SR, zones, fonduEntreeSec: 0.1, fonduSortieSec: 0.1,
    });
    expect(sautMaximal(doser(muet, plein, sansFondu)[0])).toBe(1);
    expect(sautMaximal(doser(muet, plein, avecFondu)[0])).toBeCloseTo(0.01, 6);
  });

  it("LA SORTIE PREND LA PLUS LONGUE DES DEUX, et la queue de l'effet survit", () => {
    const court = [constante(100, 0.5)];
    const long = [constante(180, 0.2)];
    const y = doser(court, long, constante(180, 1), { mode: "depart" })[0];
    expect(y.length).toBe(180);
    expect(y[50]).toBeCloseTo(0.7, 6);
    // Au-delà du sec, il ne reste que la queue du traité, et non du silence.
    expect(y[150]).toBeCloseTo(0.2, 6);
  });

  it("un effet mono sur un son stéréo ne rend pas un mélange mono", () => {
    const stereo = [constante(100, 0.5), constante(100, -0.5)];
    const mono = [constante(100, 0.1)];
    const y = doser(stereo, mono, constante(100, 0.5));
    expect(y.length).toBe(2);
    expect(y[0][0]).toBeCloseTo(0.3, 6);
    expect(y[1][0]).toBeCloseTo(-0.2, 6);
  });

  it("un dosage plus court que le son tient sa dernière valeur", () => {
    const y = doser(sec, traite, constante(10, 1))[0];
    expect(y[99]).toBeCloseTo(-0.25, 6);
  });
});
