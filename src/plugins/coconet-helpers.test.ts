// plugins/coconet-helpers.test.ts — Le Gibbs de Coconet tient sa graine, sa température nulle et ses voix.
//
// LE RÉSEAU EST UN SUBSTITUT, et c'est voulu : le vrai demande le point de contrôle et WebGL, et ce
// que la copie ajoute à l'original ne dépend pas de lui. Deux substituts suffisent :
//   · des prédictions UNIFORMES, où seul le tirage décide : c'est là qu'une graine se voit tenue ou
//     non. Avec `tf.randomUniform` sans graine, comme dans l'original, deux lancements à graine
//     égale divergent, et le premier cas tombe ;
//   · des prédictions PIQUÉES sur une hauteur, où la température nulle doit la prendre partout. Avec
//     `pow(p, 1 / 0)`, comme dans l'original passé à zéro, tout s'écrase et `argMax` rend le MIDI 36.

import { describe, expect, it } from "vitest";
import * as tf from "@tensorflow/tfjs";
import { COCONET_GRAVE, COCONET_HAUTEURS, COCONET_VOIX, SILENCE } from "../audio/coconet-grille";
import { gibbsAGraine, partReechantillonnee, type DemandeCoconet, type ReseauCoconet } from "./coconet-helpers";

const PAS = 8;

/** Un réseau qui rend toujours la même distribution sur les 46 hauteurs. */
const reseau = (poids: (h: number) => number): ReseauCoconet => ({
  convnet: {
    predictFromPianoroll: (pianoroll) => tf.tidy(() => {
      const ligne = Array.from({ length: COCONET_HAUTEURS }, (_, h) => poids(h));
      const total = ligne.reduce((s, x) => s + x, 0);
      const p = new Float32Array(pianoroll.shape[1] * COCONET_HAUTEURS * COCONET_VOIX);
      for (let t = 0; t < pianoroll.shape[1]; t++)
        for (let h = 0; h < COCONET_HAUTEURS; h++)
          for (let v = 0; v < COCONET_VOIX; v++) p[(t * COCONET_HAUTEURS + h) * COCONET_VOIX + v] = ligne[h] / total;
      return tf.tensor4d(p, [1, pianoroll.shape[1], COCONET_HAUTEURS, COCONET_VOIX]);
    }),
  },
});

/** Un soprano en do 4 sur toutes les cases, les trois autres voix à écrire. */
const demande = (graine: number, temperature = 1): DemandeCoconet => {
  const hauteurs = new Int16Array(PAS * COCONET_VOIX).fill(SILENCE);
  const masque = new Uint8Array(PAS * COCONET_VOIX);
  for (let t = 0; t < PAS; t++) {
    hauteurs[t * COCONET_VOIX] = 72;
    for (let v = 1; v < COCONET_VOIX; v++) masque[t * COCONET_VOIX + v] = 1;
  }
  return { pas: PAS, hauteurs, masque, temperature, iterations: 6, graine };
};

const uniforme = reseau(() => 1);

describe("gibbsAGraine", () => {
  it("rend le même choral à graine égale, et deux chorals à graines différentes", async () => {
    const a = await gibbsAGraine(uniforme, demande(4242));
    const b = await gibbsAGraine(uniforme, demande(4242));
    const c = await gibbsAGraine(uniforme, demande(17));
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(Array.from(c)).not.toEqual(Array.from(a));
  });

  it("à température nulle, prend la hauteur la plus probable et non la plus grave", async () => {
    const pique = reseau((h) => (h === 60 - COCONET_GRAVE ? 10 : 1));
    const e = await gibbsAGraine(pique, demande(1, 0));
    for (let t = 0; t < PAS; t++) for (let v = 1; v < COCONET_VOIX; v++) expect(e[t * COCONET_VOIX + v]).toBe(60);
  });

  it("ne touche jamais une case gardée, même quand le réseau y voudrait autre chose", async () => {
    const pique = reseau((h) => (h === 60 - COCONET_GRAVE ? 10 : 1));
    const e = await gibbsAGraine(pique, demande(3, 1));
    for (let t = 0; t < PAS; t++) expect(e[t * COCONET_VOIX]).toBe(72);
  });

  it("écrit une hauteur dans chaque case à remplir dès la première itération", async () => {
    const e = await gibbsAGraine(uniforme, { ...demande(9), iterations: 1 });
    for (let t = 0; t < PAS; t++) for (let v = 1; v < COCONET_VOIX; v++) expect(e[t * COCONET_VOIX + v]).not.toBe(SILENCE);
  });
});

describe("partReechantillonnee", () => {
  it("suit le calendrier de Yao : tout à la première itération, un septième environ à la dernière", () => {
    expect(partReechantillonnee(0, 96)).toBeGreaterThan(1);
    expect(partReechantillonnee(95, 96)).toBeCloseTo((0.9 - (0.8 * 95) / 96) / 0.7, 9);
    expect(partReechantillonnee(95, 96)).toBeGreaterThan(1 / 7);
    expect(partReechantillonnee(95, 96)).toBeLessThan(1 / 6);
  });
});
