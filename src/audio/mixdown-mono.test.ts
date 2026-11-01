// audio/mixdown-mono.test.ts — `mixdownMono` rend ce que seize copies de sa boucle rendaient.
//
// LE TÉMOIN EST LA BOUCLE TELLE QU'ELLE ÉTAIT ÉCRITE dans `sherpa-asr`, `vosk-asr`, `creneau`,
// `gout`, `klein` et les autres : `+= x / n` dans un `Float32Array`, canal après canal. Le canonique
// doit rendre les mêmes échantillons au bit près, sinon le rapprochement a changé leur son.
import { describe, expect, it } from "vitest";
import { mixdownMono } from "./commun";

function temoin(buffer: AudioBuffer): Float32Array {
  const nch = buffer.numberOfChannels;
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) mono[i] += d[i] / nch;
  }
  return mono;
}

function tampon(canaux: number, n = 1000, sr = 44100): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    // Des valeurs qui ne sont pas des puissances de deux : la division par trois ou par cinq arrondit.
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * (220 * (c + 1) + 7) * i) / sr) * 0.37 + 0.011 * c;
  }
  return b;
}

describe("mixdownMono", () => {
  it("rend, au bit près, ce que rendait la boucle recopiée dans seize fichiers", () => {
    for (const canaux of [1, 2, 3, 5]) {
      const b = tampon(canaux);
      expect(mixdownMono(b)).toEqual(temoin(b));
    }
  });

  it("sur un mono, rend une COPIE des mêmes valeurs, jamais une vue sur le tampon", () => {
    const b = tampon(1);
    const m = mixdownMono(b);
    expect(m).toEqual(b.getChannelData(0));
    expect(m).not.toBe(b.getChannelData(0));
    m[0] = 99;
    expect(b.getChannelData(0)[0]).not.toBe(99);
  });
});
