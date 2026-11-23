// plugins/magenta-improvisation.test.ts — Le tirage des touches de « Magenta Improvisation ».
//
// LE VRAI PIANO GENIE, MOINS SON RÉSEAU. La classe de `@magenta/music` est gardée entière, son
// `next`, son `sampleLogits` et son `nextWithCustomSamplingFunction` compris ; seul
// `evaluateModelAndSample`, qui évalue les deux couches LSTM sur le point de contrôle, est remplacé
// par un modèle indifférent : les quatre-vingt-huit touches également probables, quel que soit le
// bouton. Sur lui, un tirage sain rend des touches variées, et un tirage qui reprend le même nombre à
// chaque pas rend la même touche d'un bout à l'autre. Le point de contrôle n'est donc pas demandé, et
// ces cas tournent en intégration continue.
import { describe, it, expect, vi } from "vitest";
import * as tf from "@tensorflow/tfjs";
import { parseMidi } from "midi-file";
import { improviser, tirerTouche } from "./magenta-helpers";

vi.mock("@magenta/music/esm/piano_genie/model", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@magenta/music/esm/piano_genie/model")>();
  class PianoGenieIndifferent extends vrai.PianoGenie {
    async initialize() { (this as any).initialized = true; }
  }
  // Posé sur le prototype, la méthode étant privée dans les types de `@magenta/music`.
  Object.defineProperty(PianoGenieIndifferent.prototype, "evaluateModelAndSample", {
    value(_entree: unknown, etat: { c: tf.Tensor[]; h: tf.Tensor[] }, tirer: (l: tf.Tensor) => tf.Tensor) {
      const suivant = { c: etat.c.map((x) => x.clone()), h: etat.h.map((x) => x.clone()) };
      return [suivant, tf.tidy(() => tirer(tf.zeros([88])).dataSync()[0])];
    },
  });
  return { ...vrai, PianoGenie: PianoGenieIndifferent };
});

/** Les hauteurs jouées, dans l'ordre, lues dans le fichier MIDI rendu. */
async function hauteurs(f: File): Promise<number[]> {
  const midi = parseMidi(new Uint8Array(await f.arrayBuffer()));
  return midi.tracks.flat().filter((e: any) => e.type === "noteOn" && e.velocity > 0).map((e: any) => e.noteNumber);
}

describe("Magenta Improvisation : le tirage des touches", () => {
  // Huit secondes à 120 à la noire, en double-croches : soixante-quatre pas. « Montant » ne tire pas
  // ses boutons au sort, de sorte que seul le tirage des touches consomme le générateur.
  it("CHAQUE PAS TIRE UN NOMBRE NEUF : sur un modèle indifférent, les touches varient", async () => {
    for (const graine of [1, 2, 3, 42, 4242]) {
      const notes = await hauteurs(await improviser(8, 120, 1, "up", graine));
      expect(notes.length).toBe(64);
      // Soixante-quatre tirages uniformes sur 88 touches en donnent 46 distinctes en moyenne ; un
      // nombre repris à chaque pas en donne une.
      expect(new Set(notes).size, `graine ${graine}`).toBeGreaterThanOrEqual(30);
    }
  });

  it("LA TEMPÉRATURE VA JUSQU'À 1,5, comme le réglage, au lieu de lever au-dessus de 1", async () => {
    const notes = await hauteurs(await improviser(2, 120, 1.5, "random", 7));
    expect(notes.length).toBe(16);
  });

  it("même graine, même improvisation ; autre graine, autre improvisation", async () => {
    const a = await hauteurs(await improviser(4, 120, 1, "random", 7));
    expect(await hauteurs(await improviser(4, 120, 1, "random", 7))).toEqual(a);
    expect(await hauteurs(await improviser(4, 120, 1, "random", 8))).not.toEqual(a);
  });
});

describe("tirerTouche", () => {
  // Deux touches, de logits 2 et 0 : la première a la probabilité e^(2/T) / (e^(2/T) + 1). Un tirage
  // fixé juste sous ce seuil la rend, juste au-dessus rend la seconde : le seuil est lu exactement.
  const seuil = (t: number) => Math.exp(2 / t) / (Math.exp(2 / t) + 1);
  const tirer = (t: number, u: number) => tirerTouche([2, 0], t, () => u);

  it("la température divise les logits, au-dessus de 1 comme en dessous", () => {
    for (const t of [0.25, 0.5, 1, 1.25, 1.5]) {
      expect(tirer(t, seuil(t) - 1e-6), `T = ${t}`).toBe(0);
      expect(tirer(t, seuil(t) + 1e-6), `T = ${t}`).toBe(1);
    }
    // Plus chaude, la distribution s'aplatit : la touche favorite perd de sa probabilité.
    expect(seuil(1.5)).toBeLessThan(seuil(1));
    expect(seuil(1)).toBeLessThan(seuil(0.5));
  });

  it("à zéro, la touche la plus probable, sans tirage", () => {
    const hasard = vi.fn(() => 0.99);
    expect(tirerTouche([0, 3, 1], 0, hasard)).toBe(1);
    expect(hasard).not.toHaveBeenCalled();
  });

  it("des logits élevés ne débordent pas", () => {
    expect(tirerTouche([1000, 999], 1, () => 0.5)).toBe(0);
    expect(tirerTouche([1000, 999], 1, () => 0.9)).toBe(1);
  });
});
