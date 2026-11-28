// audio/soundfont-attenuation.test.ts — Une zone de preset qui retranche de l'atténuation sonne-t-elle ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, relevé le 2026-11-28 en réparant le panoramique : le générateur 48,
// l'atténuation initiale, était lu sans signe. Dans une zone d'instrument il n'a pas à être négatif ;
// dans une zone de preset, il DÉCALE celui de l'instrument et peut l'être. FluidR3 en écrit cinq,
// dont « Hawaiian Guitar » à −214 centibels : lu 65 322, il rendait le preset muet. Cinq presets de
// FluidR3 sortaient ainsi à −300 dBFS, dont trois du General MIDI : 85, 95 et 101.
//
// LA NORME BORNE LA SOMME de 0 à 1440 centibels : une atténuation négative ne devient pas un gain.
import { describe, expect, it } from "vitest";
import { rendreAvecSF2 } from "./midi-soundfont";
import { ecrireSF2 } from "./sf2-essai";
import { analyserSF2, chercherZonesInstrument } from "./soundfont";

const SR = 44100;
const sinus = (secondes: number) => Int16Array.from({ length: Math.round(secondes * SR) }, (_, i) => Math.round(8192 * Math.sin((2 * Math.PI * i) / 100)));

const SF2 = analyserSF2(ecrireSF2(
  [{ nom: "Guitare", donnees: sinus(0.5), taux: SR, noteOriginale: 69 }],
  [
    { nom: "Guitare", zones: [[[48, 300], [53, 0]]] },
    { nom: "Douce", zones: [[[48, 100], [53, 0]]] },
    { nom: "Lointaine", zones: [[[48, 1400], [53, 0]]] },
  ],
  [
    // Comme « Hawaiian Guitar » de FluidR3 : la zone de preset retranche 214 centibels.
    { nom: "Hawaiian Guitar", programme: 26, banque: 8, zones: [[[48, -214], [41, 0]]] },
    { nom: "Plus fort que plein", programme: 1, banque: 0, zones: [[[48, -214], [41, 1]]] },
    { nom: "Au-delà du silence", programme: 2, banque: 0, zones: [[[48, 100], [41, 2]]] },
  ],
));

const attenuationJouee = (programme: number, banque = 0) =>
  chercherZonesInstrument(SF2, 69, 100, programme, banque).map((m) => m.zone.attenuation);
const crete = (b: AudioBuffer) => b.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("l'atténuation d'une zone de preset", () => {
  it("SE LIT AVEC SON SIGNE ET DÉCALE CELLE DE L'INSTRUMENT : 300 − 214 = 86 centibels", () => {
    expect(SF2.presets[0].zones[0].attenuation).toBe(-214);
    expect(attenuationJouee(26, 8)).toEqual([86]);
  });

  it("UN PRESET QUI RETRANCHE SONNE, et au niveau que dit la somme", () => {
    const b = rendreAvecSF2(SF2, [{ note: 69, velocite: 127, debut: 0, fin: 0.4 }], 100, 26, 8);
    // Le sinus au quart de la pleine échelle, × 0,8, au centre, sous 86 centibels.
    expect(crete(b)).toBeCloseTo(0.25 * 0.8 * Math.SQRT1_2 * 10 ** (-86 / 200), 3);
  });

  it("LA SOMME EST BORNÉE DE 0 À 1440 CENTIBELS, comme la norme le veut", () => {
    expect(attenuationJouee(1)).toEqual([0]);
    expect(attenuationJouee(2)).toEqual([1440]);
  });
});
