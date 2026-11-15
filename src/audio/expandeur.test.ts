// audio/expandeur.test.ts — L'expandeur atténue sous le seuil, de tant de décibels que le ratio le dit.
//
// LE DÉFAUT RELEVÉ PAR LA PASSE DE CROISEMENT (lot 3e, 2026-11-15) : sous le seuil, le gain valait
// `(seuil − niveau) × (1 − 1/ratio)`, positif, et l'expandeur MONTAIT ce qu'il devait baisser ; son
// « Atténuation », qui borne une baisse, n'avait jamais rien à borner. Un son de −30 dBFS sous un
// seuil de −20 dB, au ratio 4, doit descendre de trente décibels, bornés à l'atténuation maximale.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { gateExpandeur } from "./effets-sibilance";

/** Une seconde d'un la à `amplitude`, stéréo, à 48 kHz. */
function la(amplitude: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
  for (let c = 0; c < 2; c++) b.getChannelData(c).set(Float32Array.from({ length: 48000 }, (_, i) => amplitude * Math.sin((2 * Math.PI * 440 * i) / 48000)));
  return b;
}

/** La crête de la seconde moitié du canal gauche, une fois le suiveur posé. */
const creteFinale = (b: AudioBuffer) => Math.max(...b.getChannelData(0).subarray(24000).map(Math.abs));

describe("l'expandeur", () => {
  const db = (x: number) => 20 * Math.log10(x);

  it("ATTÉNUE SOUS LE SEUIL du produit de l'écart par le ratio moins un, et non ne monte", () => {
    const entree = la(10 ** (-30 / 20));
    const sortie = gateExpandeur(entree, "expandeur", -20, 4, 1, 100, 60);
    // À un décibel et demi près : le suiveur lit la sinusoïde un peu sous sa crête, et le ratio
    // triple l'écart (mesuré : −30,8 dB).
    expect(Math.abs(db(creteFinale(sortie)) - db(creteFinale(entree)) + 30)).toBeLessThan(1.5);
  });

  it("BORNE CETTE BAISSE À L'ATTÉNUATION MAXIMALE, qui agit donc", () => {
    const entree = la(10 ** (-30 / 20));
    const sortie = gateExpandeur(entree, "expandeur", -20, 4, 1, 100, 12);
    expect(db(creteFinale(sortie)) - db(creteFinale(entree))).toBeCloseTo(-12, 0);
  });

  it("laisse passer tel quel ce qui est au-dessus du seuil", () => {
    const entree = la(0.5);
    const sortie = gateExpandeur(entree, "expandeur", -20, 4, 1, 100, 60);
    expect(creteFinale(sortie)).toBeCloseTo(creteFinale(entree), 3);
  });
});
