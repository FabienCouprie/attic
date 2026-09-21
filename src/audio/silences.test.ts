// audio/silences.test.ts — Rogner sans couper ce qui sonne.
//
// LES DEUX FAUTES QU'UN ROGNEUR PEUT COMMETTRE, et que ces tests attrapent :
//
//   1. COUPER TROP TARD. Le premier échantillon au-dessus du seuil arrive après le début de
//      l'attaque : rogner là tronque le transitoire et laisse un clic. La marge doit être rendue,
//      et le test vérifie qu'elle l'est exactement.
//   2. VOIR DU SILENCE DANS UN SON. Une sinusoïde passe par zéro deux fois par période. Sans
//      enveloppe lissée, un la 440 serait découpé en huit cent quatre-vingts morceaux par seconde
//      — et le test « une note tenue reste d'un seul tenant » échouerait bruyamment.
import { describe, expect, it } from "vitest";
import { appliquerRognage, enveloppe, planRognage, segmentsSonores } from "./silences";

const SR = 44100;

/** Un son : silence, note, silence — les durées sont en secondes. */
function piste(silenceAvant: number, note: number, silenceApres: number, hz = 440, amplitude = 0.5): Float32Array {
  const n = Math.round((silenceAvant + note + silenceApres) * SR);
  const debut = Math.round(silenceAvant * SR), fin = debut + Math.round(note * SR);
  return Float32Array.from({ length: n }, (_, i) =>
    (i >= debut && i < fin ? amplitude * Math.sin((2 * Math.PI * hz * i) / SR) : 0));
}

const BASE = { seuilDb: -60, margeMs: 0, frequence: SR };

describe("l'enveloppe", () => {
  it("NE VOIT PAS DE SILENCE DANS UNE NOTE TENUE, malgré les passages par zéro", () => {
    const env = enveloppe(piste(0, 0.5, 0), SR);
    const milieu = env.subarray(Math.round(0.1 * SR), Math.round(0.4 * SR));
    expect(Math.min(...milieu)).toBeGreaterThan(0.2);
  });

  it("descend à zéro dans le silence", () => {
    const env = enveloppe(piste(0.3, 0.3, 0.3), SR);
    expect(env[Math.round(0.15 * SR)]).toBeLessThan(1e-6);
  });
});

describe("les segments sonores", () => {
  it("une note entre deux silences donne un segment, aux bons endroits", () => {
    const s = segmentsSonores(piste(0.5, 1, 0.5), BASE);
    expect(s.length).toBe(1);
    expect(s[0].debut / SR).toBeCloseTo(0.5, 1);
    expect(s[0].fin / SR).toBeCloseTo(1.5, 1);
  });

  it("LA MARGE EST RENDUE DES DEUX CÔTÉS", () => {
    const sans = segmentsSonores(piste(0.5, 1, 0.5), BASE);
    const avec = segmentsSonores(piste(0.5, 1, 0.5), { ...BASE, margeMs: 100 });
    expect((sans[0].debut - avec[0].debut) / SR).toBeCloseTo(0.1, 2);
    expect((avec[0].fin - sans[0].fin) / SR).toBeCloseTo(0.1, 2);
  });

  it("deux notes que leurs marges font se toucher n'en font qu'une", () => {
    const x = new Float32Array(Math.round(1.2 * SR));
    const note = piste(0, 0.2, 0);
    x.set(note, 0);
    x.set(note, Math.round(0.3 * SR));     // 100 ms de silence entre les deux
    expect(segmentsSonores(x, { ...BASE, margeMs: 10 }).length).toBe(2);
    expect(segmentsSonores(x, { ...BASE, margeMs: 80 }).length).toBe(1);
  });

  it("le seuil décide : un souffle passe à −60 dB et disparaît à −20", () => {
    const souffle = piste(0.2, 0.4, 0.2, 440, 0.01);   // −40 dBFS
    expect(segmentsSonores(souffle, BASE).length).toBe(1);
    expect(segmentsSonores(souffle, { ...BASE, seuilDb: -20 }).length).toBe(0);
  });
});

describe("le plan de rognage", () => {
  it("AUX BORDS, LE MILIEU N'EST PAS TOUCHÉ", () => {
    // Deux notes séparées d'une seconde de silence : ce silence-là fait partie du jeu.
    const x = new Float32Array(Math.round(3 * SR));
    x.set(piste(0, 0.5, 0), Math.round(0.5 * SR));
    x.set(piste(0, 0.5, 0), Math.round(2 * SR));
    const plan = planRognage(x, BASE);
    expect(plan.gardes.length).toBe(1);
    expect(plan.gardes[0].debut / SR).toBeCloseTo(0.5, 1);
    expect(plan.gardes[0].fin / SR).toBeCloseTo(2.5, 1);
    expect(plan.retires / SR).toBeCloseTo(1, 1);      // une demi-seconde de chaque côté
  });

  it("PARTOUT, les silences intérieurs assez longs sont retirés aussi", () => {
    const x = new Float32Array(Math.round(3 * SR));
    x.set(piste(0, 0.5, 0), Math.round(0.5 * SR));
    x.set(piste(0, 0.5, 0), Math.round(2 * SR));
    const plan = planRognage(x, { ...BASE, partout: true, dureeMinSec: 0.5 });
    expect(plan.gardes.length).toBe(2);
    expect(plan.retires / SR).toBeCloseTo(2, 1);      // 0,5 + 1 + 0,5
  });

  it("un silence intérieur plus court que la durée minimale est conservé", () => {
    const x = new Float32Array(Math.round(1.5 * SR));
    x.set(piste(0, 0.5, 0), 0);
    x.set(piste(0, 0.5, 0), Math.round(0.7 * SR));    // 200 ms de silence
    const plan = planRognage(x, { ...BASE, partout: true, dureeMinSec: 0.5 });
    expect(plan.gardes.length).toBe(1);
  });

  it("un son entièrement silencieux ne garde rien, et le dit", () => {
    const plan = planRognage(new Float32Array(SR), BASE);
    expect(plan.gardes).toEqual([]);
    expect(plan.retires).toBe(SR);
  });

  it("un son qui sonne du début à la fin n'est pas touché", () => {
    const x = piste(0, 1, 0);
    const plan = planRognage(x, BASE);
    expect(plan.retires).toBeLessThan(0.02 * SR);
  });
});

describe("l'application", () => {
  it("recolle les morceaux gardés, canal par canal", () => {
    const g = Float32Array.from({ length: 100 }, (_, i) => i);
    const d = Float32Array.from({ length: 100 }, (_, i) => -i);
    const [rg, rd] = appliquerRognage([g, d], [{ debut: 10, fin: 20 }, { debut: 50, fin: 55 }]);
    expect(rg.length).toBe(15);
    expect([...rg.subarray(0, 3)]).toEqual([10, 11, 12]);
    expect([...rg.subarray(10, 13)]).toEqual([50, 51, 52]);
    expect(rd[0]).toBe(-10);
  });

  it("LES DEUX CANAUX SONT ROGNÉS AU MÊME ENDROIT — sinon l'image se décale", () => {
    const g = piste(0.5, 1, 0.5), d = piste(0.5, 1, 0.5, 660);
    const plan = planRognage(g, BASE);
    const [rg, rd] = appliquerRognage([g, d], plan.gardes);
    expect(rg.length).toBe(rd.length);
  });

  it("aucun morceau gardé rend des canaux vides plutôt qu'une erreur", () => {
    expect(appliquerRognage([new Float32Array(10)], [])[0].length).toBe(0);
  });
});
