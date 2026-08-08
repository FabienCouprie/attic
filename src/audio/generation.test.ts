// audio/generation.test.ts
import { describe, it, expect } from "vitest";
import { GAMMES_ACCORDS, degreSeptiemeProche, degreAccordProche } from "./generation";

describe("degreSeptiemeProche", () => {
  // Septième diatonique attendue (en demi-tons depuis la tonique) pour
  // chacun des 7 modes heptatoniques — vérifié contre la théorie standard :
  // majeur/lydien/mixolydien ont une 7e majeure ou dominante (11 ou 10),
  // les modes à tierce mineure ont une 7e mineure (10).
  const attendu: Record<string, number> = {
    majeur: 11,      // Cmaj7 : 7e majeure
    mineur: 10,      // Cm7 : 7e mineure
    dorien: 10,      // Dm7-type : 7e mineure
    phrygien: 10,    // 7e mineure
    lydien: 11,      // Cmaj7#11-type : 7e majeure
    mixolydien: 10,  // C7 dominant : 7e mineure (b7)
    locrien: 10,     // Cm7b5 demi-diminué : 7e mineure
  };

  for (const [id, septiemeAttendue] of Object.entries(attendu)) {
    it(`${id} : 7e diatonique = ${septiemeAttendue} demi-tons`, () => {
      const degres = GAMMES_ACCORDS.find((g) => g.id === id)!.degres;
      expect(degreSeptiemeProche(degres, 0)).toBe(septiemeAttendue);
    });
  }

  it("ne confond pas la 6e et la 7e majeure sur la gamme majeure (les deux sont à 1 demi-ton de la cible à 10)", () => {
    // Piège qui a motivé cette fonction séparée : degreAccordProche(degres, 0, 10)
    // seul choisirait arbitrairement la 6e (9) au lieu de la 7e majeure (11),
    // les deux étant à égale distance (1 demi-ton) d'une cible unique à 10.
    const majeur = GAMMES_ACCORDS.find((g) => g.id === "majeur")!.degres;
    expect(degreAccordProche(majeur, 0, 10)).toBe(9); // comportement brut, sans désambiguïsation
    expect(degreSeptiemeProche(majeur, 0)).toBe(11); // désambiguïsé correctement
  });

  it("reste cohérente sur une gamme pentatonique (pas de 7e nette, mais aucun plantage)", () => {
    // Pas de vraie 7e dans une gamme à 5 notes : le résultat est le degré le
    // plus proche (potentiellement l'octave de la tonique, 12, si c'est
    // effectivement la note la moins mauvaise) — on vérifie juste que la
    // fonction renvoie un décalage valide et utilisable, pas de plantage.
    const pentaMajeure = GAMMES_ACCORDS.find((g) => g.id === "pentatonique-majeure")!.degres;
    const resultat = degreSeptiemeProche(pentaMajeure, 0);
    expect(resultat).toBeGreaterThanOrEqual(1);
    expect(resultat).toBeLessThanOrEqual(12);
  });
});
