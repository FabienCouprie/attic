// audio/sf2-enveloppe-rendu.test.ts — Le rendu SoundFont joue-t-il l'enveloppe que le fichier décrit ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, lu dans le source puis mesuré sur FluidR3 le 2026-11-28 :
// `rendreAvecSF2` ne lisait aucune enveloppe. Chaque note s'éteignait par un fondu de cinq
// millisecondes à sa fin MIDI exacte : une nappe de cordes coupait net, un piano tenu ne s'éteignait
// pas, une caisse claire s'arrêtait au relâchement de sa touche. Et l'analyseur jetait la zone globale
// des instruments, où FluidR3 range l'enveloppe de 132 des 193 siens.
//
// LE FICHIER EST ÉCRIT, PUIS RELU PAR `analyserSF2`, et ses presets ont la forme de ceux de FluidR3 :
// zone globale d'instrument portant l'enveloppe, zones de preset partagées par vélocité qui la
// décalent, kit dont la première zone ne sonne pas. Les valeurs des générateurs sont celles que
// FluidR3 écrit pour « Strings » (48), « Yamaha Grand Piano » (0) et « Std Tom » ; ses dix zones de
// vélocité sont ramenées à deux. Les échantillons sont des sinusoïdes, jouées à leur hauteur
// d'origine sauf mention : le niveau qu'on mesure est celui de l'enveloppe, et lui seul.
//
// LES NIVEAUX SE MESURENT L'UN CONTRE L'AUTRE, dans le même rendu : l'atténuation que porte la zone
// globale n'est pas lue (décision ouverte), et aucun cas n'en dépend.
import { describe, expect, it } from "vitest";
import { notesVersFichierMidi } from "./midi-ecriture";
import { rendreMidiDepuisBytes } from "./midi-montage";
import { rendreSequence } from "./midi-sequence";
import { rendreAvecSF2 } from "./midi-soundfont";
import { ecrireSF2, plage, type ZoneEssai } from "./sf2-essai";
import { analyserSF2 } from "./soundfont";

const SR = 44100;
/** Une sinusoïde de 441 Hz, cent échantillons par période, au quart de la pleine échelle. */
const sinus = (secondes: number) => Int16Array.from({ length: Math.round(secondes * SR) }, (_, i) => Math.round(8192 * Math.sin((2 * Math.PI * i) / 100)));

const boucle: ZoneEssai = [[54, 1], [58, 69]];
const SF2 = analyserSF2(ecrireSF2(
  [
    { nom: "Cordes", donnees: sinus(0.5), taux: SR, noteOriginale: 69, boucle: [10000, 22000] },
    { nom: "Piano", donnees: sinus(0.5), taux: SR, noteOriginale: 69, boucle: [10000, 22000] },
    { nom: "Divers", donnees: sinus(0.1), taux: SR, noteOriginale: 60 },
    { nom: "Frappe", donnees: sinus(0.8), taux: SR, noteOriginale: 38 },
  ],
  [
    { nom: "Strings", zones: [
      [[35, -3986], [36, 1902], [37, 30], [38, 1902], [48, 30]],
      [[43, plage(0, 68)], ...boucle, [53, 0]],
      // La zone haute écrit son propre relâchement, qui remplace celui de la zone globale.
      [[43, plage(69, 127)], [38, 0], ...boucle, [53, 0]],
    ] },
    { nom: "Yamaha Grand Piano", zones: [
      [[34, -8359], [37, 1000], [38, 0]],
      [[43, plage(0, 127)], [36, 2400], ...boucle, [53, 1]],
    ] },
    { nom: "Misc. Percussion", zones: [[[43, plage(60, 60)], [53, 2]]] },
    { nom: "Std Tom", zones: [[[35, 3974], [37, 1000], [38, 5830]], [[43, plage(38, 38)], [53, 3]]] },
  ],
  [
    { nom: "Strings", programme: 48, banque: 0, zones: [
      [[16, 70]],
      [[44, plage(121, 127)], [38, -1586], [41, 0]],
      [[44, plage(0, 120)], [35, -642], [38, -1035], [41, 0]],
    ] },
    { nom: "Yamaha Grand Piano", programme: 0, banque: 0, zones: [
      [[16, 100], [48, 140]],
      [[44, plage(121, 127)], [38, 316], [41, 1]],
      [[44, plage(0, 120)], [38, -182], [41, 1]],
    ] },
    { nom: "Standard", programme: 0, banque: 128, zones: [[[16, 100]], [[41, 2]], [[41, 3]]] },
  ],
));

const rendre = (note: number, velocite: number, fin: number, programme: number, banque = 0) =>
  rendreAvecSF2(SF2, [{ note, velocite, debut: 0, fin }], 100, programme, banque);

/** La puissance de la voie gauche entre deux instants, en décibels ; au-delà du tampon, le silence. */
function dbEntre(b: AudioBuffer, debut: number, fin: number): number {
  const g = b.getChannelData(0);
  let s = 0;
  const i0 = Math.round(debut * SR), i1 = Math.round(fin * SR);
  for (let i = i0; i < Math.min(i1, g.length); i++) s += g[i] * g[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-30);
}
const duree = (b: AudioBuffer) => b.length / b.sampleRate;
/** Le temps d'une course de cent décibels pour un générateur en timecents. */
const t = (tc: number) => 2 ** (tc / 1200);

describe("la nappe de cordes, comme le preset 48 de FluidR3", () => {
  // Vélocité 127 : zone de preset 121-127, relâchement 1902 − 1586 = 316 timecents, 1,2 s.
  const b = rendre(60, 127, 2, 48);
  const plein = dbEntre(b, 0.01, 0.09);

  it("TIENT SON PALIER TRENTE CENTIBELS SOUS SON MAINTIEN", () => {
    expect(dbEntre(b, 1.0, 1.9) - plein).toBeCloseTo(-3, 1);
  });

  it("RELÂCHE AU-DELÀ DE SA FIN MIDI : le tampon tient la queue, du palier au silence", () => {
    expect(duree(b)).toBeCloseTo(2 + 0.97 * t(316), 3);
    // Trois dixièmes après la fin MIDI : le palier, plus cent décibels par 1,2 s.
    expect(dbEntre(b, 2.29, 2.31) - plein).toBeCloseTo(-3 - (100 * 0.3) / t(316), 0);
  });

  it("LA BOUCLE TOURNE PENDANT LE RELÂCHEMENT : la queue ne se tait pas avant son terme", () => {
    // L'échantillon dure une demi-seconde : sans la boucle, tout serait muet depuis 0,5 s.
    expect(dbEntre(b, 2.9, 2.95) - plein).toBeCloseTo(-3 - (100 * 0.925) / t(316), 0);
  });

  it("LA VÉLOCITÉ CHOISIT LA ZONE DE PRESET, et le décalage qu'elle porte", () => {
    // Vélocité 100 : zone 0-120, relâchement 1902 − 1035 = 867 timecents, 1,65 s.
    expect(duree(rendre(60, 100, 2, 48))).toBeCloseTo(2 + 0.97 * t(867), 3);
  });

  it("UN RELÂCHEMENT LOCAL REMPLACE CELUI DE LA ZONE GLOBALE", () => {
    // La touche 69 tombe dans la zone haute : 0 − 1586 timecents, 0,4 s, au lieu de 1,2 s.
    expect(duree(rendre(69, 127, 2, 48))).toBeCloseTo(2 + 0.97 * t(-1586), 3);
  });
});

describe("le piano, comme le preset 0 de FluidR3", () => {
  // Palier 1000 : la note s'éteint dans sa chute, en 2400 timecents, quatre secondes.
  const tenu = rendre(69, 127, 6, 0);

  it("S'ÉTEINT DANS SA CHUTE, à cent décibels par quatre secondes, sans attendre la fin MIDI", () => {
    expect(dbEntre(tenu, 0.99, 1.01) - dbEntre(tenu, 1.99, 2.01)).toBeCloseTo(25, 0);
    let reste = 0;
    for (const x of tenu.getChannelData(0).subarray(Math.round(4.05 * SR))) reste = Math.max(reste, Math.abs(x));
    expect(reste).toBe(0);
  });

  it("MONTE PAR SON ATTAQUE de huit millisecondes, et ne part pas au plein", () => {
    const g = tenu.getChannelData(0);
    let debut = 0, apres = 0;
    for (let i = 0; i < Math.round(0.001 * SR); i++) debut = Math.max(debut, Math.abs(g[i]));
    for (let i = Math.round(0.01 * SR); i < Math.round(0.012 * SR); i++) apres = Math.max(apres, Math.abs(g[i]));
    expect(debut / apres).toBeLessThan(0.13);
  });

  it("RELÂCHE DEPUIS LE NIVEAU OÙ SA CHUTE L'A MENÉ", () => {
    // Vélocité 100 : relâchement 0 − 182 timecents, 0,9 s. Lâchée à 0,5 s, la chute l'a menée à
    // 100 × (0,5 − 0,008 − 0,001) / 4 ≈ 12,3 dB ; il reste 87,7 dB à descendre.
    const attaqueEtMaintien = t(-8359) + t(-12000);
    const cbAuRelache = (1000 * (0.5 - attaqueEtMaintien)) / t(2400);
    expect(duree(rendre(69, 100, 0.5, 0))).toBeCloseTo(0.5 + (t(-182) * (1000 - cbAuRelache)) / 1000, 3);
  });
});

describe("une frappe de kit, comme « Std Tom » de FluidR3", () => {
  // Un relâchement de 5830 timecents, vingt-neuf secondes, sur un échantillon sans boucle de 0,8 s.
  const b = rendre(38, 100, 0.05, 0, 128);

  it("SONNE JUSQU'À LA FIN DE SON ÉCHANTILLON, bien après le relâchement de sa touche", () => {
    // Relâchée à 0,05 s, elle descend de cent décibels en vingt-neuf secondes : 1,7 dB en 0,5 s.
    expect(dbEntre(b, 0.6, 0.75) - dbEntre(b, 0.1, 0.25)).toBeCloseTo(-(100 * 0.5) / t(5830), 1);
  });

  it("ET PAS AU-DELÀ : un échantillon sans boucle s'arrête à sa fin, quoi que dise le relâchement", () => {
    expect(duree(b)).toBeCloseTo(0.8, 3);
  });
});

// ═══ CE QUE LES MÉLANGES FONT DE LA QUEUE ═══
//
// Deux règles, et elles ne sont pas les mêmes. Le rendu d'un FICHIER MIDI garde la queue de sa
// dernière note : son mélange était taillé à la durée du fichier, et coupait la queue net. Une
// SÉQUENCE garde sa durée exacte, règle écrite dans `melangerTampons` pour que deux cercles de
// tailles différentes finissent ensemble : la queue qui dépasse est coupée, sur l'ancien fondu de
// cinq millisecondes. À l'intérieur de la pièce, la queue reste dans les deux cas.
describe("ce que les mélanges font de la queue", () => {
  const poser = () => { (globalThis as { __attic_sf2__?: unknown }).__attic_sf2__ = SF2; };
  const NOTE = [{ note: 60, velocite: 127, debut: 0, fin: 1 }];

  it("LE RENDU D'UN FICHIER MIDI GARDE LA QUEUE DE SA DERNIÈRE NOTE", async () => {
    poser();
    const octets = new Uint8Array(await notesVersFichierMidi(NOTE, 120, 0, 0, 48).arrayBuffer());
    const b = await rendreMidiDepuisBytes(octets, "SoundFont", 100);
    expect(duree(b)).toBeGreaterThanOrEqual(1 + 0.97 * t(316) - 0.001);
    expect(dbEntre(b, 1.29, 1.31) - dbEntre(b, 0.01, 0.09)).toBeCloseTo(-3 - (100 * 0.3) / t(316), 0);
  });

  it("UNE SÉQUENCE GARDE SA DURÉE, la queue intérieure comprise, et se ferme sans claquer", async () => {
    poser();
    const b = await rendreSequence(NOTE, "SoundFont", 100, 48, 0, undefined, 3);
    expect(b.length).toBe(3 * SR);
    expect(dbEntre(b, 1.29, 1.31) - dbEntre(b, 0.01, 0.09)).toBeCloseTo(-3 - (100 * 0.3) / t(316), 0);
    // Coupée en pleine note, elle se ferme sur cinq millisecondes au lieu de claquer.
    const coupee = await rendreSequence([{ note: 60, velocite: 127, debut: 0, fin: 2 }], "SoundFont", 100, 48, 0);
    const g = coupee.getChannelData(0);
    expect(coupee.length).toBe(2 * SR);
    expect(Math.abs(g[g.length - 1])).toBe(0);
    expect(dbEntre(coupee, 1.9, 1.99) - dbEntre(coupee, 0.01, 0.09)).toBeCloseTo(-3, 1);
  });
});
