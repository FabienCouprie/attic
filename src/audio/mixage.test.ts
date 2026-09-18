// audio/mixage.test.ts — Mise à niveau des bus avant la somme.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { limiterPic, normaliserPic, picTampon } from "./mixage";

function tampon(valeurs: number[], canaux = 1): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: valeurs.length, sampleRate: 44100 });
  for (let c = 0; c < canaux; c++) b.getChannelData(c).set(Float32Array.from(valeurs));
  return b;
}

describe("normaliserPic", () => {
  it("amène le pic à la cible et garde les rapports entre échantillons", () => {
    const b = tampon([0.1, -0.25, 0.05]);
    normaliserPic(b, 0.8);
    const d = b.getChannelData(0);
    expect(picTampon(b)).toBeCloseTo(0.8, 6);
    expect(d[0] / d[1]).toBeCloseTo(0.1 / -0.25, 6);
  });

  it("applique le même gain aux deux canaux, pour ne pas déplacer l'image stéréo", () => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: 2, sampleRate: 44100 });
    b.getChannelData(0).set(Float32Array.from([0.5, 0]));
    b.getChannelData(1).set(Float32Array.from([0.25, 0]));
    normaliserPic(b, 1);
    expect(b.getChannelData(0)[0]).toBeCloseTo(1, 6);
    expect(b.getChannelData(1)[0]).toBeCloseTo(0.5, 6);
  });

  it("laisse un tampon muet tel quel plutôt que d'amplifier le bruit numérique", () => {
    const b = tampon([0, 0, 0]);
    normaliserPic(b, 0.8);
    expect(Array.from(b.getChannelData(0))).toEqual([0, 0, 0]);
  });

  it("ne touche à rien pour une cible nulle : c'est un bus coupé", () => {
    const b = tampon([0.5, -0.5]);
    normaliserPic(b, 0);
    expect(picTampon(b)).toBeCloseTo(0.5, 6);
  });
});

describe("limiterPic", () => {
  it("n'intervient pas sous le plafond", () => {
    const b = tampon([0.5, -0.4]);
    limiterPic(b, 0.95);
    expect(picTampon(b)).toBeCloseTo(0.5, 6);
  });

  it("ramène au plafond quand la somme le dépasse", () => {
    const b = tampon([1.2, -0.6]);
    limiterPic(b, 0.95);
    expect(picTampon(b)).toBeCloseTo(0.95, 6);
    expect(b.getChannelData(0)[1]).toBeCloseTo(-0.6 * (0.95 / 1.2), 6);
  });
});

describe("deux bus additionnés", () => {
  it("le niveau du premier bus ne dépend pas du pic du second — le défaut de la Groove Box", () => {
    // Un bus « mélodique » continu, un bus « batterie » à transitoires courts et hauts.
    const melodique = tampon(Array.from({ length: 1000 }, (_, i) => 0.3 * Math.sin(i / 5)));
    const faire = (picBatterie: number) => {
      const mel = tampon(Array.from(melodique.getChannelData(0)));
      const bat = tampon(Array.from({ length: 1000 }, (_, i) => (i % 200 === 0 ? picBatterie : 0)));
      normaliserPic(mel, 0.8);
      normaliserPic(bat, 0.5);
      const somme = tampon(Array.from({ length: 1000 }, (_, i) => mel.getChannelData(0)[i] + bat.getChannelData(0)[i]));
      limiterPic(somme, 0.95);
      // Niveau de la partie mélodique dans la somme, mesuré hors frappes.
      let s = 0, n = 0;
      for (let i = 0; i < 1000; i++) if (i % 200 !== 0) { s += somme.getChannelData(0)[i] ** 2; n++; }
      return Math.sqrt(s / n);
    };
    // La batterie passe de discrète à écrasante : la partie mélodique ne doit pas bouger.
    expect(faire(0.2)).toBeCloseTo(faire(5), 6);
  });
});
