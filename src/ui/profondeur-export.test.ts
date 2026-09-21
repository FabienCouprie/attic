// ui/profondeur-export.test.ts — La préférence de profondeur, et son défaut.
import { describe, expect, it } from "vitest";
import {
  CLE_PROFONDEUR_EXPORT, PROFONDEURS, ecrireProfondeurExport, lireProfondeurExport,
} from "./profondeur-export";

const stockage = (valeur: string | null) => ({ getItem: () => valeur });

describe("la profondeur d'export", () => {
  it("VAUT VINGT-QUATRE BITS PAR DÉFAUT — le défaut historique contredisait les instruments", () => {
    expect(lireProfondeurExport(stockage(null))).toBe(24);
  });

  it("relit ce qui a été choisi", () => {
    expect(lireProfondeurExport(stockage("16"))).toBe(16);
    expect(lireProfondeurExport(stockage("24"))).toBe(24);
    expect(lireProfondeurExport(stockage("32"))).toBe(32);
  });

  it("une valeur inattendue retombe sur le défaut plutôt que d'écrire un en-tête impossible", () => {
    // Une préférence corrompue ne doit pas produire un fichier que personne ne saura lire.
    for (const brut of ["8", "0", "64", "bonjour", "", "24.5"]) {
      expect(lireProfondeurExport(stockage(brut)), brut).toBe(24);
    }
  });

  it("un stockage bloqué ne fait pas tomber l'application", () => {
    expect(lireProfondeurExport({ getItem() { throw new Error("bloqué"); } })).toBe(24);
    expect(() => ecrireProfondeurExport(32, { setItem() { throw new Error("bloqué"); } })).not.toThrow();
  });

  it("écrit sous la clé attendue, et la valeur relue est celle qu'on a posée", () => {
    let ecrit: [string, string] | null = null;
    ecrireProfondeurExport(32, { setItem: (c, v) => { ecrit = [c, v]; } });
    expect(ecrit).toEqual([CLE_PROFONDEUR_EXPORT, "32"]);
    expect(lireProfondeurExport(stockage(ecrit![1]))).toBe(32);
  });

  it("les trois profondeurs sont proposées, nommées dans les deux langues", () => {
    expect(PROFONDEURS.map((p) => p.valeur)).toEqual([16, 24, 32]);
    for (const p of PROFONDEURS) {
      expect(p.fr.length).toBeGreaterThan(0);
      expect(p.en).not.toMatch(/[éèêàçùîôûï]/);
      expect(p.noteEn).not.toMatch(/[éèêàçùîôûï]/);
    }
  });
});
