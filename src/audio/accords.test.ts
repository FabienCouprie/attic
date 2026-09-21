// audio/accords.test.ts — La détection d'accords, et la confiance qu'elle annonce.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { detecterAccords } from "./accords";

const SR = 44100;

/** Des accords tenus l'un après l'autre, en sinusoïdes. */
function accords(suite: number[][], dureeS = 1): AudioBuffer {
  const n = Math.round(suite.length * dureeS * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const notes = suite[Math.min(suite.length - 1, Math.floor(i / (dureeS * SR)))];
    for (const m of notes) x[i] += (0.2 / notes.length) * Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * (i / SR));
  }
  b.copyToChannel(x, 0);
  return b;
}

describe("détection d'accords", () => {
  it("RECONNAÎT DEUX ACCORDS SUCCESSIFS", () => {
    const r = detecterAccords(accords([[60, 64, 67], [57, 60, 64]], 1.5), 0.5);
    expect(r.length).toBeGreaterThanOrEqual(2);
    // Les noms portent leur instant en tête : « 0:00 Cmaj », « 0:01 Amin ».
    expect(r[0].nomEn).toMatch(/Cmaj$/);
    expect(r[r.length - 1].nomEn).toMatch(/Amin$/);
  });

  it("LA CONFIANCE N'EST PLUS TOUJOURS NULLE : un accord pur est reconnu avec assurance", () => {
    // Elle cherchait le segment en cours dans la liste des résultats, où il n'est écrit qu'à sa
    // fin : la recherche échouait toujours, et toute confiance valait 0.
    const r = detecterAccords(accords([[60, 64, 67], [57, 60, 64]], 1.5), 0.5);
    for (const a of r) expect(a.confiance, a.nom).toBeGreaterThan(0.5);
  });
});
