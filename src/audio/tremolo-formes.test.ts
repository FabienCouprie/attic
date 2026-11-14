// audio/tremolo-formes.test.ts — Chaque forme du trémolo s'entend, avec ou sans courbe de fréquence.
//
// LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER, relevé le 2026-11-14 par la passe de croisement des
// nomenclatures : sans courbe sur « Modulation fréquence », le trémolo comparait la forme aux
// libellés d'autrefois, « Carré », « Square », « Triangle », « Sawtooth ». Les identifiants du
// réglage sont désormais « square », « triangle », « sawtooth » : les quatre formes jouaient un sinus.
//
// LE TEST MESURE LE GAIN APPLIQUÉ, sur un son constant à un : la sortie est la courbe du trémolo.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { FORMES_ONDE_CHOIX } from "./timbres";
import { tremolo } from "./effets-modulation";

const SR = 48000;

function gain(forme: string): Float32Array {
  const un = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
  un.getChannelData(0).fill(1);
  return Float32Array.from(tremolo(un, 4, new Float32Array(SR).fill(1), forme).getChannelData(0));
}

const ecart = (a: Float32Array, b: Float32Array) => a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);

describe("les formes du trémolo sans courbe de fréquence", () => {
  it("chaque forme offerte rend un gain différent des autres", () => {
    const ids = FORMES_ONDE_CHOIX.ids;
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const gains = ids.map(gain);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(ecart(gains[i], gains[j]), `« ${ids[i]} » et « ${ids[j]} »`).toBeGreaterThan(0.1);
      }
    }
  });

  it("le carré ne prend que deux valeurs, une profondeur pleine le menant de zéro à un", () => {
    expect([...new Set(gain("square"))].sort()).toEqual([0, 1]);
  });

  it("les libellés d'autrefois se lisent encore, au bit près de la forme qu'ils nomment", () => {
    expect(ecart(gain("Carré"), gain("square"))).toBe(0);
    expect(ecart(gain("Sawtooth"), gain("sawtooth"))).toBe(0);
    expect(ecart(gain("Triangle"), gain("triangle"))).toBe(0);
  });
});
