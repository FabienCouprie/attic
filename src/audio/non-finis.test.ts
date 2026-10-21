// audio/non-finis.test.ts — Aucun NaN ne sort d'un tampon qu'on a assaini.
//
// POURQUOI CE TEST. Un NaN dans un tampon audio ne se voit pas et ne s'entend pas là où il est né :
// il contamine ce qui l'additionne, et un seul échantillon suffit à rendre muette une somme de six
// canaux. Relevé le 2026-10-21 dans la sortie de la continuation spectrale, dont le modèle diverge
// parfois pendant l'entraînement, sur un tampon qui avait par ailleurs la bonne forme et la bonne
// longueur — donc rien en aval ne pouvait s'en apercevoir.
//
// LE CAS QUI COMPTE RELIT LE TAMPON PAR UN AUTRE APPEL que celui qui a servi à corriger : c'est la
// seule façon de prouver que la correction a bien atteint le tampon et non une copie. Elle
// l'atteint parce que `getChannelData` rend une VUE sur les données du canal ; un `copyToChannel`
// ajouté pour reposer la ligne a été retiré après défaut planté, aucun cas n'ayant bougé.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { assainirNonFinis } from "./commun";

const SR = 48000;

function tampon(canaux: number, longueur = 64): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const x = new Float32Array(longueur);
    for (let i = 0; i < longueur; i++) x[i] = Math.sin(i / 5) * 0.5;
    b.copyToChannel(x, c);
  }
  return b;
}

/** Pose une valeur non finie à un endroit donné, en repassant par le tampon. */
function poser(b: AudioBuffer, canal: number, index: number, valeur: number) {
  const x = b.getChannelData(canal).slice();
  x[index] = valeur;
  b.copyToChannel(x, canal);
}

const contientNonFini = (b: AudioBuffer, canal: number) => {
  const x = b.getChannelData(canal);
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return true;
  return false;
};

describe("assainir les échantillons non finis", () => {
  it("NOMME LES CANAUX TOUCHÉS, et eux seuls", () => {
    const b = tampon(6);
    poser(b, 0, 10, NaN);
    poser(b, 2, 63, NaN);
    expect(assainirNonFinis(b)).toEqual([0, 2]);
  });

  it("ne rend rien quand tout est fini", () => {
    expect(assainirNonFinis(tampon(6))).toEqual([]);
  });

  it("attrape l'infini comme le NaN, dans les deux sens", () => {
    const b = tampon(3);
    poser(b, 0, 1, Infinity);
    poser(b, 1, 2, -Infinity);
    poser(b, 2, 3, NaN);
    expect(assainirNonFinis(b)).toEqual([0, 1, 2]);
  });

  it("met un ZÉRO à la place, et ne touche à rien d'autre", () => {
    const b = tampon(2);
    const avant = Array.from(b.getChannelData(0));
    poser(b, 0, 7, NaN);
    assainirNonFinis(b);
    const apres = b.getChannelData(0);
    expect(apres[7]).toBe(0);
    for (let i = 0; i < avant.length; i++) {
      if (i !== 7) expect(apres[i]).toBeCloseTo(avant[i], 6);
    }
  });

  it("LE TAMPON LUI-MÊME EST PROPRE APRÈS COUP, relu par un autre appel", () => {
    const b = tampon(4);
    poser(b, 1, 5, NaN);
    poser(b, 3, 0, Infinity);
    assainirNonFinis(b);
    for (let c = 0; c < 4; c++) {
      expect(contientNonFini(b, c), `canal ${c}`).toBe(false);
    }
  });

  it("un tampon vide et un tampon d'un seul échantillon", () => {
    expect(assainirNonFinis(new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: SR }))).toEqual([]);
    const un = new AudioBuffer({ numberOfChannels: 1, length: 1, sampleRate: SR });
    un.copyToChannel(new Float32Array([NaN]), 0);
    expect(assainirNonFinis(un)).toEqual([0]);
    expect(un.getChannelData(0)[0]).toBe(0);
  });
});
