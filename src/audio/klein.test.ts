// audio/klein.test.ts — La bouteille de Klein : un miroir par recollement, caché
// dans le silence, et un retour complet en deux tours d'étendue.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { recollements, coteVoix, periodeRetourSec, rendreKlein } from "./klein";
import { voixRisset } from "./risset";

const SR = 44100;
const o = { cycleSec: 0.5, octaves: 3, montant: true };

describe("le miroir", () => {
  it("retourne une voix à chaque recollement, et la rend au second", () => {
    // Voix 2 en montant : recollée à t = 0,5 s, puis à 2 s.
    expect(coteVoix(2, 0.4, o)).toBe(1);
    expect(coteVoix(2, 0.6, o)).toBe(-1);
    expect(coteVoix(2, 1.9, o)).toBe(-1);
    expect(coteVoix(2, 2.1, o)).toBe(1);
  });

  it("cache chaque miroir dans le silence : la voix est muette à l'instant du recollement", () => {
    // LE test de la construction. Un miroir n'est pas continu ; il n'est
    // inaudible que parce qu'il tombe là où Risset cache déjà le saut d'octave.
    const opts = { dureeSec: 10, cycleSec: 0.5, octaves: 4, montant: true };
    for (let k = 0; k < 4; k++) {
      for (let t = 0.001; t < 10; t += 0.001) {
        if (recollements(k, t, opts) !== recollements(k, t - 0.001, opts)) {
          expect(voixRisset(t, opts)[k].amplitude).toBeLessThan(1e-3);
        }
      }
    }
  });

  it("vaut aussi en descendant, où les voix sont recollées du bas vers le haut", () => {
    const d = { cycleSec: 0.5, octaves: 3, montant: false };
    expect(coteVoix(2, 0.1, d)).toBe(1);
    // Voix 2 en descendant atteint le bas à t = 1 s.
    expect(coteVoix(2, 1.1, d)).toBe(-1);
    expect(coteVoix(2, 2.6, d)).toBe(1);
  });

  it("revient entièrement au bout de deux tours d'étendue", () => {
    expect(periodeRetourSec(o)).toBe(3);
    for (let k = 0; k < 3; k++) {
      expect(coteVoix(k, 0.1, o)).toBe(coteVoix(k, 0.1 + periodeRetourSec(o), o));
      // …et PAS au bout d'un seul : c'est ce qui sépare Klein d'un tore.
      expect(coteVoix(k, 0.1, o)).toBe(-coteVoix(k, 0.1 + periodeRetourSec(o) / 2, o));
    }
  });
});

describe("sur le son", () => {
  const src = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
  let g = 17;
  const d = src.getChannelData(0);
  for (let i = 0; i < d.length; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; d[i] = 0.5 * (g / 0x3fffffff - 1); }
  const out = rendreKlein(src, { dureeSec: 3.5, cycleSec: 0.5, octaves: 3, montant: true, ecartDeg: 70, fonduBoucleSec: 0.02 });
  const L = out.getChannelData(0), R = out.getChannelData(1);
  const balance = (tSec: number) => {
    const c = Math.round(tSec * SR);
    let l = 0, r = 0;
    for (let i = c - 2048; i < c + 2048; i++) { l += L[i] * L[i]; r += R[i] * R[i]; }
    return 10 * Math.log10(l / r);
  };

  it("part d'un côté, passe de l'autre après un tour d'étendue, revient après deux", () => {
    expect(balance(0.1)).toBeLessThan(-10); // départ : sin 70° vers la droite
    expect(balance(1.6)).toBeGreaterThan(10); // toutes les voix recollées une fois
    expect(balance(3.1)).toBeLessThan(-10); // deux fois : revenu
  });

  it("migre voix par voix entre les deux, en passant par le centre", () => {
    // À 0,75 s la voix 2 est déjà recollée (à gauche) mais faible, la voix 0 pas
    // encore et au sommet de sa cloche : on est entre les deux plateaux, encore
    // du côté de départ. Mesuré −12,0 dB, pour −26,5 dB en plateau. Vers 1,0 s les
    // voix des deux côtés s'équilibrent. La migration est continue parce que
    // les voix sont recollées l'une après l'autre, et que leurs cloches se relaient.
    const plateau = balance(0.1);
    expect(balance(0.75)).toBeGreaterThan(plateau + 5);
    expect(balance(0.75)).toBeLessThan(-5);
    expect(Math.abs(balance(1.0))).toBeLessThan(3);
  });

  it("à écart nul, reste au centre : sans fibre, pas de miroir audible", () => {
    const c = rendreKlein(src, { dureeSec: 2, cycleSec: 0.5, octaves: 3, montant: true, ecartDeg: 0, fonduBoucleSec: 0.02 });
    const l = c.getChannelData(0), r = c.getChannelData(1);
    let el = 0, er = 0;
    for (let i = 0; i < l.length; i++) { el += l[i] * l[i]; er += r[i] * r[i]; }
    expect(Math.abs(10 * Math.log10(el / er))).toBeLessThan(0.01);
  });
});
