// core/cloisonnement.test.ts — Test de cloisonnement entre domaines.
//
// Prouve que deux registres instanciés sont étanches : plugins ET types de flux.
// C'est le test qui était impossible à écrire avec le singleton global.
import { describe, it, expect } from "vitest";
import { creerRegistre } from "./registre";
import type { PluginDef, TypeValeur } from "./types";

// ── Domaine audio ──
const audio = creerRegistre<TypeValeur, AudioContext>();
audio.enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f" });
const reverb: PluginDef<TypeValeur, AudioContext> = {
  id: "reverb",
  nom: "Reverb",
  univers: "Traitement",
  famille: "Effets",
  resume: "Réverbération",
  entrees: [{ nom: "In", type: "audio" }],
  sorties: [{ nom: "Out", type: "audio" }],
  parametres: [],
  executer: async () => ({ valeurs: [] }),
};
audio.enregistrer(reverb);

// ── Domaine nombre ──
const nombre = creerRegistre<number, null>();
nombre.enregistrerTypeFlux({ id: "nombre", couleur: "#00FF00" });
const generer: PluginDef<number, null> = {
  id: "generer-nombre",
  nom: "Générer",
  univers: "Nombre",
  famille: "Source",
  resume: "Produit un nombre",
  entrees: [],
  sorties: [{ nom: "Out", type: "nombre" }],
  parametres: [{ nom: "v", defaut: 0, doc: "d" }],
  executer: async (ctx) => ({ valeurs: [ctx.paramNombre("v", 0)] }),
};
nombre.enregistrer(generer);

describe("cloisonnement entre domaines", () => {
  it("un plugin audio n'apparaît pas dans le registre nombre", () => {
    expect(audio.trouverDef("reverb")).toBeDefined();
    expect(nombre.trouverDef("reverb")).toBeUndefined();
  });

  it("un plugin nombre n'apparaît pas dans le registre audio", () => {
    expect(nombre.trouverDef("generer-nombre")).toBeDefined();
    expect(audio.trouverDef("generer-nombre")).toBeUndefined();
  });

  it("les registres ont des catalogues indépendants", () => {
    expect(audio.tousLesPlugins().map((p) => p.id)).toEqual(["reverb"]);
    expect(nombre.tousLesPlugins().map((p) => p.id)).toEqual(["generer-nombre"]);
  });

  it("trouverPlugin est cloisonné", () => {
    expect(audio.trouverPlugin("reverb")).toBeDefined();
    expect(nombre.trouverPlugin("reverb")).toBeUndefined();
    expect(nombre.trouverPlugin("generer-nombre")).toBeDefined();
    expect(audio.trouverPlugin("generer-nombre")).toBeUndefined();
  });

  it("deux domaines peuvent déclarer un type homonyme sans s'écraser", () => {
    // Les deux domaines déclarent un type "nombre" — le dernier n'écrase pas le premier
    audio.enregistrerTypeFlux({ id: "nombre", couleur: "#f00" });
    nombre.enregistrerTypeFlux({ id: "nombre", couleur: "#0f0" });
    expect(audio.couleurFlux("nombre")).toBe("#f00");
    expect(nombre.couleurFlux("nombre")).toBe("#0f0");
  });

  it("fluxCompatibles est cloisonné : audio ne connaît pas nombre", () => {
    expect(audio.fluxCompatibles("audio", "audio")).toBe(true);
    expect(audio.fluxCompatibles("nombre", "nombre")).toBe(true); // fallback égalité stricte
    expect(audio.fluxCompatibles("audio", "nombre")).toBe(false);
  });

  it("fluxCompatibles du domaine nombre ne connaît pas audio", () => {
    expect(nombre.fluxCompatibles("nombre", "nombre")).toBe(true);
    expect(nombre.fluxCompatibles("audio", "audio")).toBe(true); // fallback égalité stricte
    expect(nombre.fluxCompatibles("nombre", "audio")).toBe(false);
  });
});
