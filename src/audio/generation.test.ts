// audio/generation.test.ts
import { describe, it, expect } from "vitest";
import { genererDepuisScript } from "./generation";
import { parseMidi } from "midi-file";

// LA SEPTIÈME D'UN DEGRÉ se tient dans `triades-gamme.test.ts` depuis le 2026-11-21 : elle se bâtit
// un degré sur deux, comme la tierce et la quinte, et non plus au plus proche de dix ou onze demi-tons.

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
