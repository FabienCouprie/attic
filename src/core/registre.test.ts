import { describe, it, expect } from "vitest";
import { enregistrer, trouverDef, trouverPlugin, tousLesPlugins } from "./registre";
import type { PluginDef } from "./types";

const fake = (id: string, over: Partial<PluginDef> = {}): PluginDef => ({
  id, nom: id, univers: "Test", famille: "Test", resume: "résumé",
  entrees: [], sorties: [], parametres: [],
  executer: async () => ({ valeurs: [] }),
  ...over,
});

describe("registre", () => {
  it("résout un ancien id via l'alias vers le plugin actuel", () => {
    enregistrer(fake("dereverberation"));
    expect(trouverDef("dereverberation")?.id).toBe("dereverberation");
    expect(trouverDef("dererverb")?.id).toBe("dereverberation"); // alias
    expect(trouverPlugin("dererverb")).toBeDefined();
    expect(trouverDef("placer-son-zones")).toBeUndefined(); // alias vers un plugin non enregistré ici
  });

  it("ignore les doublons d'id", () => {
    enregistrer(fake("mon-plugin"));
    const avant = tousLesPlugins().length;
    enregistrer(fake("mon-plugin")); // doublon
    expect(tousLesPlugins().length).toBe(avant);
  });

  it("rejette un plugin sans résumé (doc obligatoire)", () => {
    const avant = tousLesPlugins().length;
    enregistrer(fake("sans-resume", { resume: "" }));
    expect(trouverDef("sans-resume")).toBeUndefined();
    expect(tousLesPlugins().length).toBe(avant);
  });
});
