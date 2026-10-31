// audio/sfz-temperament.test.ts — Un SFZ peut déclarer son tempérament, et il se perdait.
//
// CE QUE `pitch_keytrack` DIT VRAIMENT. L'opcode donne les CENTS PAR TOUCHE : cent pour le clavier
// ordinaire, zéro pour un kit de percussion dont l'échantillon sort tel qu'il est enregistré. Entre
// les deux, toute autre valeur décrit un tempérament égal — 1200 / 19 = 63,16 pour dix-neuf degrés
// par octave, 1200 / 31 = 38,71 pour trente et un. C'est ainsi qu'un instrument microtonal à degrés
// égaux se déclare en SFZ, en un seul opcode pour toute l'échelle.
//
// LE LECTEUR N'EN GARDAIT QU'UN OUI OU NON : `nombre(h.get("pitch_keytrack"), 100) !== 0`. Un
// fichier à dix-neuf degrés et un fichier ordinaire entraient donc pareil, et Attic jouait le
// premier en demi-tons. Le tempérament se perdait au seuil.
//
// ET LE CHEMIN ORDINAIRE DOIT RESTER LE MÊME, « Étaler sur le clavier » étant surveillé par la base
// d'empreintes, qui compare à neuf décimales. Le troisième cas l'exige par une ÉGALITÉ EXACTE et non
// par une approximation.
//
// CE QU'IL NE PROUVE PAS, ET IL FAUT LE DIRE. Réécrire `d / 12` en `d * 100 / 1200` ne le fait PAS
// tomber, et c'est mesuré : sur les deux cent cinquante-cinq écarts entiers de la gamme MIDI, les
// deux formes rendent le même double et le même rapport, zéro écart. Elles ne divergent que sur
// certains écarts FRACTIONNAIRES, un tiers de demi-ton par exemple. Ce cas épingle donc la VALEUR,
// qui est ce qui compte pour la base ; il ne garde pas la forme du calcul, et ne le prétend pas.
import { describe, expect, it } from "vitest";

import { voixPourNote, type Banque, type Zone } from "./clavier-banque";
import { analyserSfz } from "./sfz";

const son = (): AudioBuffer => new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 44100 });

/** Une banque d'une seule zone, large, pour que toute note tombe dedans. */
const banqueDUneZone = (sur: Partial<Zone>): Banque => ({
  zones: [{ racine: 60, basse: 21, haute: 108, audio: son(), ...sur }],
  racineSource: 60, largeur: 48, noteBasse: 21, noteHaute: 108,
});

describe("le tempérament d'une région SFZ", () => {
  it("SE LIT EN CENTS PAR TOUCHE, et non plus en oui ou non", () => {
    const r = analyserSfz("<region> sample=a.wav key=60 pitch_keytrack=63.16").regions[0];
    expect(r.centsParTouche).toBeCloseTo(63.16, 6);
    // Et le oui ou non reste juste : une région à dix-neuf degrés suit bien la touche.
    expect(r.suitLaTouche).toBe(true);
  });

  it("garde ses deux cas connus : cent par défaut, zéro pour un kit", () => {
    expect(analyserSfz("<region> sample=a.wav key=60").regions[0].centsParTouche).toBe(100);
    const kit = analyserSfz("<region> sample=a.wav key=36 pitch_keytrack=0").regions[0];
    expect(kit.centsParTouche).toBe(0);
    expect(kit.suitLaTouche).toBe(false);
  });

  it("LE CHEMIN ORDINAIRE EST INCHANGÉ AU BIT PRÈS, et c'est ce qui compte le plus", () => {
    // `toBe` et non `toBeCloseTo` : une banque sans tempérament déclaré doit rendre EXACTEMENT le
    // nombre qu'elle rendait avant ce lot, sinon la base d'empreintes dérive sans raison.
    const banque = banqueDUneZone({});
    for (const note of [48, 59, 60, 61, 72, 96]) {
      expect(voixPourNote(banque, note)!.ratio).toBe(Math.pow(2, (note - 60) / 12));
    }
  });

  it("JOUE DIX-NEUF DEGRÉS PAR OCTAVE quand la zone le déclare", () => {
    const banque = banqueDUneZone({ centsParTouche: 1200 / 19 });
    // Une touche vaut 63,16 cents, et non cent.
    expect(voixPourNote(banque, 61)!.ratio).toBeCloseTo(Math.pow(2, 1200 / 19 / 1200), 12);
    // Dix-neuf touches font l'octave juste, ce qui est toute la définition du tempérament.
    expect(voixPourNote(banque, 79)!.ratio).toBeCloseTo(2, 12);
    // Et douze touches n'y font plus l'octave : c'est le défaut qu'on aurait eu sans ce champ.
    expect(voixPourNote(banque, 72)!.ratio).not.toBeCloseTo(2, 3);
  });

  it("le désaccord de la zone s'ajoute au tempérament, et ne le remplace pas", () => {
    const banque = banqueDUneZone({ centsParTouche: 1200 / 19, accord: -25 });
    expect(voixPourNote(banque, 61)!.ratio)
      .toBeCloseTo(Math.pow(2, (1200 / 19 - 25) / 1200), 12);
  });

  it("UNE ZONE QUI NE SUIT PAS LA TOUCHE GARDE SA VITESSE, tempérament déclaré ou non", () => {
    // Un kit de percussion ne transpose pas, et cela prime : la touche n'entre pas dans le calcul.
    const banque = banqueDUneZone({ suitLaTouche: false, centsParTouche: 1200 / 19 });
    expect(voixPourNote(banque, 72)!.ratio).toBe(1);
  });
});
