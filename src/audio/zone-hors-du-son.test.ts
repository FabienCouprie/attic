// audio/zone-hors-du-son.test.ts — Extraire une zone qui commence après la fin.
//
// LE DÉFAUT, relevé le 2026-10-22 en poussant chaque réglage numérique du catalogue à ses deux
// bornes : **seul cas non fini sur 1 926 essais**. « Début » borné à la LONGUEUR du tampon laissait
// zéro échantillon à lire ; la longueur de sortie était alors forcée à 1 par un `Math.max`, et la
// boucle allait chercher `src[longueur]`, c'est-à-dire `undefined`. La multiplication par le gain
// de fondu rendait NaN — un par canal, deux en stéréo.
//
// POURQUOI UN NaN PLUTÔT QU'UNE ERREUR : rien ne plantait. Le tampon avait la bonne forme et la
// bonne longueur, et le NaN partait en aval contaminer toute somme qui le rencontrait.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { extraireZone } from "./effets-montage";

const SR = 48000;

function son(secondes: number): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 220 * (i / SR));
    b.getChannelData(c).set(x);
  }
  return b;
}

const tousFinis = (b: AudioBuffer) => {
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) return false;
  }
  return true;
};

describe("une zone demandée hors du son", () => {
  it("UN DÉBUT APRÈS LA FIN NE REND AUCUN ÉCHANTILLON NON FINI", () => {
    const b = extraireZone(son(0.25), 600, 5, 5);
    expect(tousFinis(b), "la sortie ne doit porter ni NaN ni infini").toBe(true);
    expect(b.length).toBeGreaterThan(0);
  });

  it("ni un début posé exactement sur la fin", () => {
    const entree = son(0.25);
    const b = extraireZone(entree, entree.duration, 5, 5);
    expect(tousFinis(b)).toBe(true);
  });

  it("ni une durée négative, qu'un calcul en amont peut produire", () => {
    // Le composant fait `Math.min(duree, a.duration - debut)` : au-delà de la fin, ce second terme
    // est négatif, et c'est bien une durée négative qui descend jusqu'ici.
    const b = extraireZone(son(0.25), 600, -599.75, 5);
    expect(tousFinis(b)).toBe(true);
  });

  it("et une zone ordinaire est toujours extraite telle quelle", () => {
    const entree = son(2);
    const b = extraireZone(entree, 0.5, 1, 0);
    expect(b.length).toBe(Math.floor(1 * SR));
    expect(tousFinis(b)).toBe(true);
    // Sans fondu, le premier échantillon est celui de la demi-seconde.
    expect(b.getChannelData(0)[0]).toBeCloseTo(entree.getChannelData(0)[Math.floor(0.5 * SR)], 6);
  });
});
