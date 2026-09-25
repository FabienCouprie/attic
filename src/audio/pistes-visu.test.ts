// audio/pistes-visu.test.ts — L'enveloppe d'une piste ne doit rien perdre de ce qu'on vient voir.
// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { COLONNES_PISTE, creteDeColonnes, enveloppeDeTampon } from "./pistes-visu";
import { enveloppeDeValeurs } from "./courbe-trace";

const tampon = (canaux: number[][], sampleRate = 48000): AudioBuffer => {
  const b = new AudioBuffer({ numberOfChannels: canaux.length, length: canaux[0].length, sampleRate });
  canaux.forEach((c, i) => b.getChannelData(i).set(Float32Array.from(c)));
  return b;
};

describe("l'enveloppe d'une piste", () => {
  // Les valeurs sont choisies exactement représentables en virgule flottante simple : un tampon audio
  // est un `Float32Array`, et 0,1 y devient 0,10000000149. Comparer à 0,1 ferait échouer un test
  // juste, ce qui apprendrait à s'en méfier.
  it("elle garde le plus bas et le plus haut de chaque colonne", () => {
    // Quatre échantillons, deux colonnes : chaque colonne en couvre deux.
    const e = enveloppeDeTampon(tampon([[0.125, -0.75, 0.5, 0.25]]), 2);
    expect(e).toEqual([{ min: -0.75, max: 0.125 }, { min: 0.25, max: 0.5 }]);
  });

  it("UNE POINTE BRÈVE SURVIT À LA RÉDUCTION : c'est la raison du minimum et du maximum", () => {
    const n = 100000;
    const v = new Array(n).fill(0);
    v[54321] = 0.97;
    const e = enveloppeDeTampon(tampon([v]), 256);
    expect(creteDeColonnes(e)).toBeCloseTo(0.97, 5);
  });

  it("LES CANAUX SONT CONFONDUS : ce qui n'arrive qu'à droite se voit quand même", () => {
    const e = enveloppeDeTampon(tampon([[0, 0, 0, 0], [0, 0.75, 0, -0.5]]), 2);
    expect(e).toEqual([{ min: 0, max: 0.75 }, { min: -0.5, max: 0 }]);
  });

  it("un mono passe par la même réduction que n'importe quelle suite de valeurs", () => {
    const v = Array.from({ length: 999 }, (_, i) => Math.sin(i / 7));
    expect(enveloppeDeTampon(tampon([v]), 64)).toEqual(enveloppeDeValeurs(Float32Array.from(v), 64));
  });

  it("moins d'échantillons que de colonnes : une colonne par échantillon, sans invention", () => {
    const e = enveloppeDeTampon(tampon([[0.3, -0.2]]), 64);
    expect(e).toHaveLength(2);
  });

  it("zéro colonne demandée ne rend rien, plutôt qu'une colonne vide", () => {
    expect(enveloppeDeTampon(tampon([[0.5, -0.5]]), 0)).toEqual([]);
  });

  it("la finesse par défaut est celle que l'en-tête annonce", () => {
    const v = Array.from({ length: 10000 }, () => 0);
    expect(enveloppeDeTampon(tampon([v]))).toHaveLength(COLONNES_PISTE);
  });
});
