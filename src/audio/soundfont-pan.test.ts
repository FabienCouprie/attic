// audio/soundfont-pan.test.ts — Une zone placée à gauche par son panoramique sort-elle à gauche ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, entendu par Fabien le 2026-11-28 dans « Un morceau à la
// SoundHelix » : la nappe ne sortait que d'un côté. Le générateur 17 (pan) est SIGNÉ, de −500, tout à
// gauche, à +500, tout à droite, et l'analyseur le lisait sans signe : −500 devenait 65036, que
// `chercherZonesInstrument` ramenait à +500. Toute zone placée à gauche partait tout à droite.
// FluidR3 range ainsi ses cordes : « Strings C#4L » et « Strings C#4R », deux échantillons mono que
// leurs zones placent à −500 et à +500. Le piano y échappait, ses échantillons étant typés gauche et
// droite, ce que le rendu lit avant le panoramique.
//
// Le fichier est écrit puis relu par `analyserSF2`, comme ailleurs : voir `sf2-essai.ts`.
import { describe, expect, it } from "vitest";
import { rendreAvecSF2 } from "./midi-soundfont";
import { ecrireSF2, plage } from "./sf2-essai";
import { analyserSF2, chercherZonesInstrument } from "./soundfont";

const SR = 44100;
const sinus = (secondes: number) => Int16Array.from({ length: Math.round(secondes * SR) }, (_, i) => Math.round(8192 * Math.sin((2 * Math.PI * i) / 100)));

const SF2 = analyserSF2(ecrireSF2(
  [
    { nom: "Strings C#4L", donnees: sinus(0.5), taux: SR, noteOriginale: 69 },
    { nom: "Strings C#4R", donnees: sinus(0.5), taux: SR, noteOriginale: 69 },
  ],
  [
    // Les deux moitiés d'un son stéréo, chacune en mono, placées par leur zone, comme dans FluidR3.
    { nom: "Strings", zones: [[[17, -500], [53, 0]], [[17, 500], [53, 1]]] },
    { nom: "Gauche seule", zones: [[[17, -500], [53, 0]]] },
    { nom: "Un peu à gauche", zones: [[[43, plage(0, 127)], [17, -250], [53, 0]]] },
  ],
  [
    { nom: "Strings", programme: 48, banque: 0, zones: [[[41, 0]]] },
    { nom: "Gauche seule", programme: 1, banque: 0, zones: [[[41, 1]]] },
    // La zone de preset décale le panoramique de l'instrument : −250 + 100 = −150.
    { nom: "Décalé", programme: 2, banque: 0, zones: [[[17, 100], [41, 2]]] },
  ],
));

const energie = (x: Float32Array) => x.reduce((s, v) => s + v * v, 0);

describe("le panoramique d'une zone", () => {
  it("SE LIT AVEC SON SIGNE : −500 tout à gauche, +500 tout à droite", () => {
    expect(SF2.instruments[0].zones.map((z) => z.pan)).toEqual([-500, 500]);
  });

  it("ARRIVE SIGNÉ À LA ZONE JOUÉE, la zone de preset ajoutée", () => {
    expect(chercherZonesInstrument(SF2, 69, 100, 48).map((m) => [m.echantillon.nom, m.zone.pan]))
      .toEqual([["Strings C#4L", -500], ["Strings C#4R", 500]]);
    expect(chercherZonesInstrument(SF2, 69, 100, 2).map((m) => m.zone.pan)).toEqual([-150]);
  });

  it("UNE ZONE À −500 SORT TOUT À GAUCHE, et rien à droite", () => {
    const b = rendreAvecSF2(SF2, [{ note: 69, velocite: 100, debut: 0, fin: 0.4 }], 100, 1);
    expect(energie(b.getChannelData(0))).toBeGreaterThan(0);
    expect(energie(b.getChannelData(1))).toBe(0);
  });

  it("LA PAIRE GAUCHE-DROITE D'UNE NAPPE SORT DES DEUX CÔTÉS À ÉGALITÉ", () => {
    const b = rendreAvecSF2(SF2, [{ note: 69, velocite: 100, debut: 0, fin: 0.4 }], 100, 48);
    const ecart = 10 * Math.log10(energie(b.getChannelData(0)) / energie(b.getChannelData(1)));
    expect(ecart).toBeCloseTo(0, 6);
  });
});
