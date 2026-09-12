// audio/generation.test.ts
import { describe, it, expect } from "vitest";
import { GAMMES_ACCORDS, degreSeptiemeProche, degreAccordProche, genererDepuisScript } from "./generation";
import { parseMidi } from "midi-file";

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
    // (voir aussi « accords du Générateur musical » plus bas)
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

// ── Les accords du « Générateur musical » ──
//
// Ils étaient construits sur des intervalles FIGÉS, `[0, 3, 7]` : une triade
// mineure pour tous les degrés et dans les deux modes. En do majeur — la
// configuration par défaut du nœud — le IV sortait donc F–A♭–C et le V G–B♭–D,
// soit trois hauteurs étrangères à la gamme sur la piste d'accords. La triade se
// déduit désormais de la gamme, degré par degré, comme dans les autres
// générateurs du catalogue.
describe("accords du Générateur musical", () => {
  /** Hauteurs (classes de hauteur) de la piste d'accords, canal 0. */
  const hauteursAccords = async (cle: string, gamme: string) => {
    const { midiBytes } = await genererDepuisScript(
      `genre = pop\ntempo = 120\ncle = ${cle}\ngamme = ${gamme}\nduree = 20`,
    );
    const midi = parseMidi(midiBytes);
    const pcs = new Set<number>();
    for (const piste of midi.tracks) {
      for (const ev of piste) {
        if (ev.type === "noteOn" && (ev as any).channel === 0 && (ev as any).velocity > 0) {
          pcs.add((ev as any).noteNumber % 12);
        }
      }
    }
    return [...pcs].sort((a, b) => a - b);
  };

  it("ne sort pas de la gamme majeure", () => {
    // C D E F G A B — le défaut se voyait ici, et dans la clé par défaut.
    const doMajeur = [0, 2, 4, 5, 7, 9, 11];
    return hauteursAccords("C", "majeur").then((pcs) => {
      expect(pcs.filter((p) => !doMajeur.includes(p)), `hauteurs : ${pcs.join(",")}`).toEqual([]);
    });
  });

  it("ne sort pas de la gamme mineure", () => {
    // A B C D E F G
    const laMineur = [9, 11, 0, 2, 4, 5, 7];
    return hauteursAccords("A", "mineur").then((pcs) => {
      expect(pcs.filter((p) => !laMineur.includes(p)), `hauteurs : ${pcs.join(",")}`).toEqual([]);
    });
  });

  it("produit des accords MAJEURS là où la gamme en demande", async () => {
    // La preuve que la correction ne se contente pas de rester dans la gamme :
    // en do majeur, le V (sol) doit être majeur — un si naturel, pas un si♭.
    const pcs = await hauteursAccords("C", "majeur");
    expect(pcs, "le si naturel du V majeur").toContain(11);
    expect(pcs, "aucun si♭, qui signait la triade mineure figée").not.toContain(10);
  });

  it("transpose sans rien changer d'autre", async () => {
    // Les mêmes degrés dans une autre clé : l'ensemble des hauteurs doit être
    // l'ensemble de do majeur transposé de 7 demi-tons (sol majeur).
    const doM = await hauteursAccords("C", "majeur");
    const solM = await hauteursAccords("G", "majeur");
    expect(solM).toEqual([...doM.map((p) => (p + 7) % 12)].sort((a, b) => a - b));
  });
});
