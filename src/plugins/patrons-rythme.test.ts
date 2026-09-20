// plugins/patrons-rythme.test.ts — Une seule liste de patrons, et qui sait jouer.
//
// La Groove Box recopiait dix patrons à la main quand la Boîte à rythmes en offrait
// cinquante-cinq, tirés du même PATRONS_RYTHME : deux listes séparées qui avaient
// divergé. Elles viennent maintenant d'ici, et ce test tient les deux promesses —
// rien d'inventé, et rien qui retombe en silence sur un patron de secours.
import { describe, expect, it } from "vitest";
import { PATRONS, optionsPatrons } from "./patrons-rythme";
import { PATRONS_RYTHME } from "../audio/generation";
import { registre } from "../audio/adaptateur";

describe("liste des patrons", () => {
  it("ne contient que des patrons qui existent, et les contient tous", () => {
    expect(PATRONS.map((p) => p.id).sort()).toEqual(Object.keys(PATRONS_RYTHME).sort());
  });

  it("donne un nom français et un nom anglais à chacun", () => {
    for (const p of PATRONS) {
      expect(p.fr, p.id).toBeTruthy();
      expect(p.en, p.id).toBeTruthy();
    }
  });

  it("filtre sur la métrique : les patrons de 3/4 sortent d'une liste 4/4", () => {
    const quatreQuatre = optionsPatrons("4/4");
    expect(quatreQuatre.optionIds).not.toContain("Valse");
    expect(quatreQuatre.optionIds).not.toContain("Bolero");
    for (const id of quatreQuatre.optionIds) {
      expect(PATRONS_RYTHME[id].signatures, id).toContain("4/4");
    }
    expect(quatreQuatre.optionIds.length).toBeLessThan(optionsPatrons().optionIds.length);
  });

  it("garde les trois listes alignées", () => {
    const o = optionsPatrons("4/4");
    expect(o.options.length).toBe(o.optionIds.length);
    expect(o.optionsEn.length).toBe(o.optionIds.length);
  });
});

describe("nœuds qui s'en servent", () => {
  const optionsDe = (id: string, param: string) =>
    registre.trouverDef(id)!.parametres.find((p) => p.nom === param)!;

  it("la Boîte à rythmes offre tous les patrons", () => {
    expect(optionsDe("boite-rythmes", "Patron").optionIds).toEqual(optionsPatrons().optionIds);
  });

  it("la Groove Box offre ceux qui se jouent en 4/4 — et non plus dix écrits à la main", () => {
    const patron = optionsDe("boite-groove", "Style rythmique");
    expect(patron.optionIds).toEqual(optionsPatrons("4/4").optionIds);
    expect(patron.optionIds!.length).toBeGreaterThan(40);
    expect(patron.optionIds).toContain("Blues shuffle");
    expect(patron.defaut).toBe("Pop dance");
  });
});
