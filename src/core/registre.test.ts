import { describe, it, expect } from "vitest";
import { creerRegistre } from "./registre";
import type { PluginDef } from "./types";

const fake = (id: string, over: Partial<PluginDef> = {}): PluginDef => ({
  id, nom: id, univers: "Test", famille: "Test", resume: "résumé",
  entrees: [], sorties: [], parametres: [],
  executer: async () => ({ valeurs: [] }),
  ...over,
});

describe("registre", () => {
  it("résout un ancien id via l'alias vers le plugin actuel", () => {
    const r = creerRegistre();
    r.enregistrer(fake("dereverberation"));
    expect(r.trouverDef("dereverberation")?.id).toBe("dereverberation");
    expect(r.trouverDef("dererverb")?.id).toBe("dereverberation"); // alias
    expect(r.trouverPlugin("dererverb")).toBeDefined();
    expect(r.trouverDef("placer-son-zones")).toBeUndefined(); // alias vers un plugin non enregistré ici
  });

  it("ignore les doublons d'id", () => {
    const r = creerRegistre();
    r.enregistrer(fake("mon-plugin"));
    const avant = r.tousLesPlugins().length;
    r.enregistrer(fake("mon-plugin")); // doublon
    expect(r.tousLesPlugins().length).toBe(avant);
  });

  it("rejette un plugin sans résumé (doc obligatoire)", () => {
    const r = creerRegistre();
    const avant = r.tousLesPlugins().length;
    r.enregistrer(fake("sans-resume", { resume: "" }));
    expect(r.trouverDef("sans-resume")).toBeUndefined();
    expect(r.tousLesPlugins().length).toBe(avant);
  });
});
