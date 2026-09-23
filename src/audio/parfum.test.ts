// audio/parfum.test.ts — Le vocabulaire des odeurs tient-il ce qu'il annonce ?
import { describe, expect, it } from "vitest";
import { ODEURS, TIMBRES, odeurParId, pointDepuisParfum } from "./parfum";
import { profil } from "./gout";

describe("la table des odeurs", () => {
  it("chaque odeur a des valeurs tenables, et un identifiant unique", () => {
    const ids = new Set<string>();
    for (const o of ODEURS) {
      expect(ids.has(o.id), o.id).toBe(false);
      ids.add(o.id);
      for (const v of [o.registre, o.agrement, o.complexite]) {
        expect(v, o.id).toBeGreaterThanOrEqual(0);
        expect(v, o.id).toBeLessThanOrEqual(1);
      }
      expect(["clair", "mordant", "plein"]).toContain(o.timbre);
    }
  });

  it("suit l'axe que l'article établit : les agrumes en haut, le musc et la fumée en bas", () => {
    const registre = (id: string) => ODEURS.find((o) => o.id === id)!.registre;
    expect(registre("citron")).toBeGreaterThan(registre("vanille"));
    expect(registre("citron")).toBeGreaterThan(registre("musc"));
    expect(registre("orange-confite")).toBeGreaterThan(registre("cafe-torrefie"));
    expect(registre("chocolat-noir")).toBeLessThan(0.5);
    expect(registre("fumee")).toBeLessThan(registre("cafe-torrefie"));
  });

  it("dit lesquelles l'article nomme, et lesquelles sont placées par leur famille", () => {
    // La distinction est le cœur de l'honnêteté de cette table : elle doit rester lisible.
    const nommees = ODEURS.filter((o) => o.publiee).map((o) => o.id);
    expect(nommees).toContain("citron");
    expect(nommees).toContain("musc");
    expect(nommees).toContain("fumee");
    expect(ODEURS.filter((o) => !o.publiee).map((o) => o.id)).toContain("vanille");
    // Et la majorité de la table vient bien des odeurs nommées.
    expect(nommees.length).toBeGreaterThan(ODEURS.length / 2);
  });

  it("les trois familles de timbre ont chacune son instrument et ses mots, dans les deux langues", () => {
    for (const [nom, def] of Object.entries(TIMBRES)) {
      expect(def.programme, nom).toBeGreaterThanOrEqual(0);
      expect(def.programme, nom).toBeLessThanOrEqual(127);
      expect(def.instrument, nom).toBeTruthy();
      expect(def.instrumentEn, nom).toBeTruthy();
      expect(def.mots, nom).toBeTruthy();
      expect(def.motsEn, nom).toBeTruthy();
    }
    // Chaque odeur relève d'une famille qui existe : sans quoi son instrument serait indéfini.
    for (const o of ODEURS) expect(TIMBRES[o.timbre], o.id).toBeTruthy();
  });
});

describe("odeurParId", () => {
  it("rend l'odeur d'un identifiant exact", () => {
    expect(odeurParId("cafe-torrefie")?.nom).toBe("café torréfié");
    expect(odeurParId("chocolat-noir")?.nomEn).toBe("dark chocolate");
  });

  it("ne rend rien pour un identifiant inconnu, plutôt qu'une odeur au hasard", () => {
    expect(odeurParId("azertyuiop")).toBeUndefined();
    expect(odeurParId("")).toBeUndefined();
    expect(odeurParId("citron ")).toBeUndefined(); // un identifiant est exact, ou n'est pas
  });

  it("chaque odeur de la table se retrouve par son identifiant", () => {
    // C'est ce qui fait tenir la liste déroulante du nœud : elle est construite sur `ODEURS`, et rend
    // l'identifiant au moteur, qui doit pouvoir remonter à l'odeur sans passer par la recherche de mots.
    for (const o of ODEURS) expect(odeurParId(o.id)).toBe(o);
  });
});

describe("pointDepuisParfum", () => {
  it("le registre de l'odeur devient la hauteur du point", () => {
    for (const o of ODEURS) expect(pointDepuisParfum(o).hauteur).toBe(o.registre);
  });

  it("laisse au milieu l'articulation et l'intensité, dont l'article ne décide pas", () => {
    for (const o of ODEURS) {
      const p = pointDepuisParfum(o);
      expect(p.articulation).toBe(0.5);
      expect(p.intensite).toBe(0.5);
    }
  });

  it("une odeur plaisante donne un point plus consonant qu'une odeur déplaisante", () => {
    const vanille = ODEURS.find((o) => o.id === "vanille")!;
    const fumee = ODEURS.find((o) => o.id === "fumee")!;
    expect(pointDepuisParfum(vanille).consonance).toBeGreaterThan(pointDepuisParfum(fumee).consonance);
  });

  it("les agrumes penchent vers l'acide, le chocolat et le musc vers l'amer", () => {
    // La vérification de bout en bout : le point d'une odeur, passé au profil de goût, tombe du côté
    // que la littérature laisse attendre — l'aigu vers l'acide, le grave vers l'amer.
    const part = (id: string, gout: string) =>
      profil(pointDepuisParfum(ODEURS.find((o) => o.id === id)!)).find((p) => p.gout === gout)!.part;
    expect(part("citron", "acide")).toBeGreaterThan(part("musc", "acide"));
    expect(part("musc", "amer")).toBeGreaterThan(part("citron", "amer"));
    expect(part("chocolat-noir", "amer")).toBeGreaterThan(part("chocolat-noir", "acide"));
  });
});
