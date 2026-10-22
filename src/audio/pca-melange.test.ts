// audio/pca-melange.test.ts — La PCA neuronale rend-elle deux fois le même son pour une graine ?
//
// CE QUE CE FICHIER GARDE, ET POURQUOI IL EST SI COURT. La PCA neuronale range ses trames canal par
// canal, et `model.fit` recevait `shuffle: false` : l'autoencodeur voyait donc un canal entier, puis
// l'autre, et comme l'entraînement s'arrête sur un budget de temps, il s'arrêtait toujours au milieu
// de cette lecture ordonnée. **Le résultat dépendait du canal qui portait le son** — mesuré le
// 2026-10-22, reproductible à l'identique sur deux passes : un son posé à gauche ressortait 4,8 dB
// sous son entrée, le même posé à droite 123,8 dB en dessous, c'est-à-dire le silence. Les trames
// sont désormais mêlées AVANT l'entraînement, par la graine du composant.
//
// POURQUOI PAR LA GRAINE ET NON PAR `shuffle: true`. TensorFlow mêlerait alors sur son propre
// hasard, que la graine du composant ne commande pas, et deux exécutions de mêmes réglages ne
// rendraient plus le même son. C'est exactement ce que le cas ci-dessous éprouve, et il tombe si
// l'on repasse à `shuffle: true`.
//
// CE QUE CE FICHIER NE GARDE PAS, FAUTE DE POUVOIR. La correspondance entre une trame mêlée et sa
// place d'origine mériterait un garde, et je n'ai pas su en écrire un : sur tous les témoins
// essayés, **l'autoencodeur ne fait pas mieux que la moyenne** — son propre message le dit — de
// sorte qu'il rend à peu près la même chose pour toute trame, et qu'intervertir ses sorties ne
// change rien d'observable. Défaut planté en retirant la correspondance, modèle laissé converger
// trois cents époques : aucun cas ne bouge. La correction de l'indice reste juste, elle n'est
// simplement pas mesurable ici.
//
// ET LA GRAINE NE PROMET RIEN QUAND LE BUDGET COUPE. Vérifié : budget hors d'atteinte, deux passes
// se répondent au bit près ; budget de trois secondes, elles diffèrent de 1,23 en amplitude. Ce
// n'est pas le mêlage, c'est l'arrêt sur l'horloge, qui ne tombe pas au même endroit d'une fois sur
// l'autre. Le message du composant annonce déjà « arrêté par budget temps ».
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { appliquerPcaNeuronale } from "./pca-neuronale";

const SR = 48000;
const N = SR;

/** Un son qui change de hauteur à la moitié : deux trames ne se ressemblent pas toutes. */
function enDeuxMoities(): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR });
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const f = i < N / 2 ? 197 : 1051;
    x[i] = 0.3 * Math.sin(2 * Math.PI * f * (i / SR));
  }
  for (let c = 0; c < 2; c++) b.getChannelData(c).set(x);
  return b;
}

describe("la PCA neuronale et sa graine", () => {
  it("DEUX PASSES DE MÊME GRAINE RENDENT LE MÊME SON, budget hors d'atteinte", async () => {
    const options = {
      fftSize: 1024, hopPercent: 25, latentDim: 4, hiddenLayers: 1,
      activation: "relu" as const, epochs: 3, learningRate: 0.01, seed: 7, budgetMs: 600000,
    };
    const un = await appliquerPcaNeuronale(enDeuxMoities(), options);
    const deux = await appliquerPcaNeuronale(enDeuxMoities(), options);
    const a = un.audio.getChannelData(0), b = deux.audio.getChannelData(0);
    expect(a.length).toBe(b.length);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart, `ecart maximal entre deux passes de meme graine : ${ecart}`).toBeLessThan(1e-6);
  }, 300000);
});
