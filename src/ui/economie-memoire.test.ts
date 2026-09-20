import { describe, expect, it } from "vitest";
import { CLE_ECONOMIE_MEMOIRE, ecrireEconomieMemoire, lireEconomieMemoire } from "./economie-memoire";
import { DUREE_LONGUE_S, apercuUtile } from "../core/memoire";

const stockage = (valeur: string | null) => ({ getItem: () => valeur });

describe("la préférence d'économie de mémoire", () => {
  it("absente, elle vaut active — le régime économe est le défaut sûr", () => {
    expect(lireEconomieMemoire(stockage(null))).toBe(true);
  });

  it("« 0 » la coupe, toute autre valeur la laisse active", () => {
    expect(lireEconomieMemoire(stockage("0"))).toBe(false);
    expect(lireEconomieMemoire(stockage("1"))).toBe(true);
  });

  it("un stockage qui refuse de répondre ne coupe pas le régime économe", () => {
    expect(lireEconomieMemoire({ getItem() { throw new Error("bloqué"); } })).toBe(true);
  });

  it("l'écriture pose « 1 » ou « 0 » sous la clé attendue", () => {
    const ecrits: [string, string][] = [];
    const s = { setItem: (k: string, v: string) => { ecrits.push([k, v]); } };
    ecrireEconomieMemoire(true, s);
    ecrireEconomieMemoire(false, s);
    expect(ecrits).toEqual([[CLE_ECONOMIE_MEMOIRE, "1"], [CLE_ECONOMIE_MEMOIRE, "0"]]);
  });

  it("un stockage qui refuse l'écriture ne fait pas échouer la bascule", () => {
    expect(() => ecrireEconomieMemoire(true, { setItem() { throw new Error("bloqué"); } })).not.toThrow();
  });
});

describe("ce que la bascule change pour un nœud intermédiaire", () => {
  const intermediaireLong = { dureeS: 3600, regarde: false };

  it("active : sur une heure, l'intermédiaire n'a pas d'aperçu", () => {
    expect(apercuUtile({ ...intermediaireLong, economie: true })).toBe(false);
  });

  it("coupée : la durée ne compte plus, l'aperçu revient", () => {
    expect(apercuUtile({ ...intermediaireLong, economie: false })).toBe(true);
  });

  it("coupée, même le nœud le plus long garde son aperçu", () => {
    expect(apercuUtile({ dureeS: 36000, regarde: false, economie: false })).toBe(true);
  });

  it("en deçà du seuil, la bascule ne change rien", () => {
    const court = { dureeS: DUREE_LONGUE_S - 1, regarde: false };
    expect(apercuUtile({ ...court, economie: true })).toBe(true);
    expect(apercuUtile({ ...court, economie: false })).toBe(true);
  });

  it("omise, elle vaut active — un appelant qui l'ignore garde le régime économe", () => {
    expect(apercuUtile(intermediaireLong)).toBe(false);
  });
});
