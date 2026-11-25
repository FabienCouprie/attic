// audio/ecart-reference-faute.test.ts — Le témoin du plancher, vu rouge sur la faute que l'instrument
// d'origine a payée.
//
// LA FAUTE PLANTÉE : la couleur prise à 8 192 points, chaque case comptée entière dans la bande où tombe
// son centre. C'est la première écriture de l'instrument, et le même morceau pris à 44,1 puis à 48 kHz
// s'y écartait de 4 dB à 31,5 Hz. La couleur fautive remplace la vraie pour tout ce fichier, par
// `vi.mock` : `decrireSon` la reçoit sans le savoir, et le témoin du plancher de
// `ecart-reference.test.ts`, rejoué tel quel, doit tomber. Relevé le 2026-11-25 : 0,91 dB de couleur,
// dont −3,6 dB à 31,5 Hz, quand la vraie couleur lit 0,053 dB sur le même témoin.
import { describe, expect, it, vi } from "vitest";

vi.mock("./ecart-reference-couleur", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("./ecart-reference-couleur")>();
  const { db, spectresDePuissance } = await import("./ecart-reference-signal");
  return {
    ...vrai,
    couleurDe: (x: ArrayLike<number>, fe: number) => {
      const n = 8192, df = fe / n, cases = n / 2 + 1, moyen = new Float64Array(cases);
      const nT = spectresDePuissance(x, n, n / 2, (p) => { for (let k = 0; k < cases; k++) moyen[k] += p[k]; });
      let total = 0;
      for (let k = 0; k < cases; k++) { moyen[k] /= nT; total += moyen[k]; }
      const part = (bas: number, haut: number) => {
        let s = 0;
        for (let k = 1; k < cases; k++) if (k * df >= bas && k * df < haut) s += moyen[k];
        return s / total;
      };
      const tiers = new Map<number, number>();
      for (const f of vrai.TIERS) if (f < fe / 2) tiers.set(f, db(part(f / 2 ** (1 / 6), f * 2 ** (1 / 6))));
      return { tiers, registres: vrai.REGISTRES.map((r) => 100 * part(r.bas, r.haut)) };
    },
  };
});

const { decrireSon } = await import("./ecart-reference-mesures");
const { ecartAReference } = await import("./ecart-reference-ecart");
const { memeSon } = await import("./ecart-reference-essai");

describe("la faute plantée", () => {
  it("une couleur à 8 192 points sans prorata fait tomber le témoin du plancher", () => {
    const e = ecartAReference(decrireSon(memeSon(44100, 10, 1, 400), 44100), decrireSon(memeSon(48000, 10, 1, 400), 48000));
    // Le même témoin, le même seuil : il est franchi, et de loin.
    expect(e.couleur).toBeGreaterThan(0.15);
  });
});
