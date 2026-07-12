import { describe, it, expect } from "vitest";
import { enregistrerTypeFlux, typeFlux, couleurFlux, fluxCompatibles } from "./typesFlux";

describe("typesFlux", () => {
  it("enregistre et retrouve un type de flux", () => {
    enregistrerTypeFlux({ id: "t-audio", couleur: "#2a9d8f", libelle: "Audio" });
    expect(typeFlux("t-audio")?.couleur).toBe("#2a9d8f");
    expect(couleurFlux("t-audio")).toBe("#2a9d8f");
  });

  it("renvoie une couleur neutre pour un type inconnu", () => {
    expect(couleurFlux("type-jamais-vu")).toBe("#999");
  });

  it("compatibilité par défaut = égalité stricte des ids", () => {
    enregistrerTypeFlux({ id: "t-midi", couleur: "#e9a13b" });
    expect(fluxCompatibles("t-midi", "t-midi")).toBe(true);
    expect(fluxCompatibles("t-midi", "t-audio")).toBe(false);
  });

  it("un type inconnu n'est compatible qu'avec lui-même (fallback égalité)", () => {
    expect(fluxCompatibles("x", "x")).toBe(true);
    expect(fluxCompatibles("x", "y")).toBe(false);
  });

  it("respecte une règle de compatibilité personnalisée (domaine)", () => {
    // Un type « stéréo » qui accepte aussi « mono » en entrée.
    enregistrerTypeFlux({
      id: "t-stereo", couleur: "#123456",
      compatible: (cible) => cible === "t-stereo" || cible === "t-mono",
    });
    expect(fluxCompatibles("t-stereo", "t-mono")).toBe(true);
    expect(fluxCompatibles("t-stereo", "t-stereo")).toBe(true);
    expect(fluxCompatibles("t-stereo", "t-audio")).toBe(false);
  });
});
