// core/cloisonnement.test.ts — Test de cloisonnement entre domaines.
//
// Prouve que deux registres instanciés sont étanches : un plugin audio
// n'apparaît pas dans le registre nombre, et vice versa. C'est le test
// qui était impossible à écrire avec le singleton global — il devient
// possible avec creerRegistre<TV, TR>().
//
// Ce test vérifie aussi si les types de flux (core/typesFlux) sont cloisonnés
// ou partagés. Si fluxCompatibles est global, deux domaines qui enregistrent
// des types homonymes se marchent dessus — et le test le révèle.
import { describe, it, expect } from "vitest";
import { creerRegistre } from "./registre";
import { enregistrerTypeFlux, fluxCompatibles, typeFlux } from "./typesFlux";
import type { PluginDef, TypeValeur } from "./types";

// ── Types de flux (enregistrer AVANT les plugins — valider() les vérifie) ──
enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f" });
enregistrerTypeFlux({ id: "nombre", couleur: "#00FF00" });

// ── Domaine audio ──
const audio = creerRegistre<TypeValeur, AudioContext>();
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

  // ── Types de flux : test de cloisonnement ──
  // Si fluxCompatibles est global (module partagé), ce test passe mais
  // révèle que deux domaines partagent le même espace de types de flux.
  // Ce n'est pas un bug aujourd'hui (un seul domaine par app), mais c'est
  // le dernier singleton — documenté dans ARCHITECTURE.md §14.1.

  it("fluxCompatibles est global (partagé entre domaines) — dernier singleton documenté", () => {
    // Les types "audio" et "nombre" sont enregistrés dans le registre global
    // de typesFlux. Les deux domaines y accèdent.
    expect(typeFlux("audio")).toBeDefined();
    expect(typeFlux("nombre")).toBeDefined();

    // fluxCompatibles est global : un domaine peut vérifier la compatibilité
    // d'un type qu'il n'a pas enregistré.
    expect(fluxCompatibles("audio", "audio")).toBe(true);
    expect(fluxCompatibles("nombre", "nombre")).toBe(true);
    expect(fluxCompatibles("audio", "nombre")).toBe(false);
    expect(fluxCompatibles("nombre", "audio")).toBe(false);
  });
});
