// audio/soundfont-zones.test.ts — Quelle zone d'un preset joue une note ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, relevé le 2026-11-24 dans l'application. Le canal dix rendu au kit
// « Standard » de FluidR3 sortait MUET, crête 0,0000. Un kit range ses percussions dans plusieurs
// instruments : ses huit zones de preset couvrent toutes les touches 0 à 127, et c'est l'instrument
// de chacune qui n'a que quelques touches. `chercherZonesInstrument` s'arrêtait à la PREMIÈRE zone de
// preset qui couvrait la note, « Misc. Percussion », qui n'a ni 35, ni 36, ni 38, ni 42 : aucune
// zone, aucun son. Relevé sur les 189 presets de FluidR3 : 33 avaient ainsi des notes muettes, les 31
// kits de la banque 128, « Synth Strings 3 » et « Feedback Guitar ».
//
// LA RÈGLE, CHOISIE PAR FABIEN LE 2026-11-24 : la première zone de preset QUI SONNE, et non la
// première qui couvre la note. Elle ne change rien à un preset dont la première zone sonnait déjà.
// Les couches ne s'additionnent pas : un preset à deux zones qui sonnent toutes deux n'en joue
// qu'une, comme avant. Le dernier cas du fichier tient cette borne.
import { describe, expect, it } from "vitest";
import { chercherZonesInstrument, type StructureSF2 } from "./soundfont";

const TOUT = { noteMin: 0, noteMax: 127, velMin: 0, velMax: 127 };

/** Un échantillon de cent points, et un dernier vide, qui ne sonne pas. */
const ECHANTILLONS = ["Divers", "Grosse caisse", "Couche 1", "Couche 2", "Vide"].map((nom, i) => ({
  nom, debut: i * 100, fin: nom === "Vide" ? i * 100 : (i + 1) * 100,
  debutBoucle: 0, finBoucle: 0, taux: 44100, noteOriginale: 60, correction: 0, type: 1,
}));

const zone = (echantillonId: number, noteMin = 0, noteMax = 127) =>
  ({ noteMin, noteMax, velMin: 0, velMax: 127, echantillonId, boucleActive: false });

const SF2: StructureSF2 = {
  programme: 0, nom: "factice", smpl: new Int16Array(500), bufferOriginal: new ArrayBuffer(0),
  echantillons: ECHANTILLONS,
  instruments: [
    { nom: "Divers", zones: [zone(0, 60, 60)] },
    { nom: "Grosse caisse", zones: [zone(1, 36, 36)] },
    { nom: "Couche 1", zones: [zone(2)] },
    { nom: "Couche 2", zones: [zone(3)] },
    { nom: "Vide", zones: [zone(4)] },
  ],
  presets: [
    // Un kit rangé comme ceux de FluidR3 : deux zones qui couvrent tout, deux instruments partiels.
    { nom: "Kit", programme: 0, banque: 128, zones: [{ ...TOUT, instrumentIdx: 0 }, { ...TOUT, instrumentIdx: 1 }] },
    // Deux couches qui sonnent toutes deux sur chaque note.
    { nom: "Couches", programme: 80, banque: 0, zones: [{ ...TOUT, instrumentIdx: 2 }, { ...TOUT, instrumentIdx: 3 }] },
    // Deux plages de vélocité.
    { nom: "Nuances", programme: 0, banque: 0, zones: [
      { ...TOUT, velMax: 64, instrumentIdx: 2 }, { ...TOUT, velMin: 65, instrumentIdx: 3 },
    ] },
    // Une première zone dont l'échantillon est vide.
    { nom: "Premier vide", programme: 1, banque: 0, zones: [{ ...TOUT, instrumentIdx: 4 }, { ...TOUT, instrumentIdx: 2 }] },
  ],
};

const joue = (note: number, velocite: number, programme: number, banque: number) =>
  chercherZonesInstrument(SF2, note, velocite, programme, banque).map((m) => m.echantillon.nom);

describe("la zone de preset qui joue une note", () => {
  it("UN KIT SONNE sur une touche que sa première zone n'a pas", () => {
    expect(joue(36, 100, 0, 128)).toEqual(["Grosse caisse"]);
  });

  it("la première zone garde les touches qu'elle a", () => {
    expect(joue(60, 100, 0, 128)).toEqual(["Divers"]);
  });

  it("une touche qu'aucun instrument n'a reste muette", () => {
    expect(joue(50, 100, 0, 128)).toEqual([]);
  });

  it("une zone dont l'échantillon est vide ne sonne pas, et laisse jouer la suivante", () => {
    expect(joue(60, 100, 1, 0)).toEqual(["Couche 1"]);
  });

  it("les plages de vélocité choisissent leur zone, comme avant", () => {
    expect(joue(60, 30, 0, 0)).toEqual(["Couche 1"]);
    expect(joue(60, 100, 0, 0)).toEqual(["Couche 2"]);
  });

  it("LES COUCHES NE S'ADDITIONNENT PAS : seule la première zone qui sonne joue", () => {
    expect(joue(60, 100, 80, 0)).toEqual(["Couche 1"]);
  });
});
