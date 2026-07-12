import { describe, it, expect } from "vitest";
import { creerRegistre } from "./registre";

describe("typesFlux", () => {
  it("enregistre et récupère un type de flux", () => {
    const r = creerRegistre<any, any>();
    r.enregistrerTypeFlux({ id: "t-audio", couleur: "#2a9d8f", libelle: "Audio" });
    expect(r.typeFlux("t-audio")?.couleur).toBe("#2a9d8f");
    expect(r.couleurFlux("t-audio")).toBe("#2a9d8f");
  });

  it("couleurFlux retourne gris pour un type inconnu", () => {
    const r = creerRegistre<any, any>();
    expect(r.couleurFlux("type-jamais-vu")).toBe("#999");
  });

  it("compatibilité par défaut = égalité stricte des ids", () => {
    const r = creerRegistre<any, any>();
    r.enregistrerTypeFlux({ id: "t-midi", couleur: "#e9a13b" });
    expect(r.fluxCompatibles("t-midi", "t-midi")).toBe(true);
    expect(r.fluxCompatibles("t-midi", "t-audio")).toBe(false);
  });

  it("un type inconnu n'est compatible qu'avec lui-même (fallback égalité)", () => {
    const r = creerRegistre<any, any>();
    expect(r.fluxCompatibles("x", "x")).toBe(true);
    expect(r.fluxCompatibles("x", "y")).toBe(false);
  });

  it("respecte une règle de compatibilité personnalisée (domaine)", () => {
    const r = creerRegistre<any, any>();
    r.enregistrerTypeFlux({
      id: "t-stereo",
      couleur: "#fff",
      compatible: (cible: string) => cible === "t-mono" || cible === "t-stereo",
    });
    expect(r.fluxCompatibles("t-stereo", "t-mono")).toBe(true);
    expect(r.fluxCompatibles("t-stereo", "t-stereo")).toBe(true);
    expect(r.fluxCompatibles("t-stereo", "t-audio")).toBe(false);
  });
});
