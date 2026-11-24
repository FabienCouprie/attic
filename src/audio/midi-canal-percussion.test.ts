// audio/midi-canal-percussion.test.ts — Le canal dix d'un fichier MIDI sonne-t-il en batterie ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, relevé le 2026-11-23 dans l'application : un « Rythme euclidien »
// rendu par « Point d'écoute MIDI » sonnait au piano. Le fichier n'écrit ni banque ni programme sur
// son canal dix, et le rendu lisait alors programme 0, banque 0, comme sur tout autre canal : FluidR3
// rendait « Yamaha Grand Piano ». En FM, le même canal partait en hauteurs.
//
// COMMENT IL ENTEND QUEL PRESET A JOUÉ. Le SoundFont est factice et chaque preset y joue un
// échantillon CONSTANT, d'une valeur qui n'appartient qu'à lui : le niveau d'une frappe dit donc
// le preset, sans lire la console et sans dépendre d'un fichier de 148 Mo absent de la CI.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { parseMidi } from "midi-file";

import { analyserMidi } from "./midi";
import { GRAINE_BATTERIE_MIDI, voieDuCanal } from "./midi-canal-percussion";
import { notesVersFichierMidi } from "./midi-ecriture";
import { rendreMidiDepuisBytes } from "./midi-montage";
import type { Note } from "./note";
import { RESERVE_BATTERIE } from "./sequence-percussion";
import type { StructureSF2 } from "./soundfont";

const VOLUME = 80;
const VELOCITE = 100;

/** Les presets du SoundFont factice, et la valeur que chacun fait entendre. */
const PIANO = { nom: "Piano", programme: 0, banque: 0, valeur: 1000 };
const STANDARD = { nom: "Standard", programme: 0, banque: 128, valeur: -8000 };
const TR808 = { nom: "TR-808", programme: 25, banque: 128, valeur: 16000 };
const JAZZ = { nom: "Jazz", programme: 32, banque: 128, valeur: -24000 };

type PresetFactice = typeof PIANO;

/**
 * Un SoundFont dont chaque preset joue un échantillon constant d'un dixième de seconde.
 *
 * LE PIANO EST PREMIER, à dessein : c'est le preset sur lequel `chercherZonesInstrument` retombe
 * quand il ne trouve pas celui qu'on lui demande, et un kit introuvable doit s'entendre comme tel.
 */
function sf2Factice(presets: PresetFactice[]): StructureSF2 {
  const longueur = 4410;
  const smpl = new Int16Array(longueur * presets.length);
  presets.forEach((p, i) => smpl.fill(p.valeur, i * longueur, (i + 1) * longueur));
  return {
    programme: 0, nom: "factice", smpl, bufferOriginal: new ArrayBuffer(0),
    echantillons: presets.map((p, i) => ({
      nom: p.nom, debut: i * longueur, fin: (i + 1) * longueur, debutBoucle: 0, finBoucle: 0,
      taux: 44100, noteOriginale: 36, correction: 0, type: 1,
    })),
    instruments: presets.map((p, i) => ({
      nom: p.nom,
      zones: [{ noteMin: 0, noteMax: 127, velMin: 0, velMax: 127, echantillonId: i, boucleActive: false, rootKey: 36 }],
    })),
    presets: presets.map((p, i) => ({
      nom: p.nom, programme: p.programme, banque: p.banque,
      zones: [{ noteMin: 0, noteMax: 127, velMin: 0, velMax: 127, instrumentIdx: i }],
    })),
  };
}

function poserSF2(sf2: StructureSF2): void {
  (globalThis as { __attic_sf2__?: unknown }).__attic_sf2__ = sf2;
}

/** Trois frappes de grosse caisse, comme les écrit un rythme : une demi-seconde d'écart. */
const FRAPPES: Note[] = [0, 0.5, 1].map((debut) => ({ note: 36, velocite: VELOCITE, debut, fin: debut + 0.25 }));

async function octets(notes: Note[], canal: number, banque?: number, programme?: number): Promise<Uint8Array> {
  return new Uint8Array(await notesVersFichierMidi(notes, 120, canal, banque, programme).arrayBuffer());
}

/** Ce qu'un preset fait entendre sur la voie gauche, au milieu d'une frappe. */
function niveauDe(p: PresetFactice): number {
  return (p.valeur / 32768) * (VELOCITE / 127) * (VOLUME / 100) * 0.8 * Math.sqrt(0.5);
}

/** Le preset entendu au milieu de la première frappe, ou `null` s'il n'est aucun d'eux. */
function presetEntendu(b: AudioBuffer, presets: PresetFactice[]): string | null {
  const v = b.getChannelData(0)[Math.round(0.05 * b.sampleRate)];
  const trouve = presets.find((p) => Math.abs(v - niveauDe(p)) < 1e-4);
  return trouve ? trouve.nom : null;
}

/** La batterie que le synthétiseur de percussions rend pour les frappes d'un fichier. */
async function batterieAttendue(bytes: Uint8Array, sampleRate: number): Promise<AudioBuffer> {
  const { rendreBatterieMidi } = await import("./tone-synths");
  const notes = analyserMidi(parseMidi(bytes)).notes.filter((n) => n.canal === 9);
  return rendreBatterieMidi({ notes, volume: VOLUME * RESERVE_BATTERIE, sampleRate, graine: GRAINE_BATTERIE_MIDI });
}

function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let pire = 0;
  for (let c = 0; c < 2; c++) {
    const ga = a.getChannelData(c), gb = b.getChannelData(c);
    for (let i = 0; i < Math.min(ga.length, gb.length); i++) pire = Math.max(pire, Math.abs(ga[i] - gb[i]));
  }
  return pire;
}

function crete(b: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m;
}

const TOUS = [PIANO, STANDARD, TR808, JAZZ];

describe("le canal dix, au SoundFont", () => {
  it("UN FICHIER QUI NE NOMME RIEN joue le kit Standard de la banque 128, et non le premier preset", async () => {
    poserSF2(sf2Factice(TOUS));
    const b = await rendreMidiDepuisBytes(await octets(FRAPPES, 9), "SoundFont", VOLUME);
    expect(presetEntendu(b, TOUS)).toBe("Standard");
  });

  it("le programme du canal choisit le kit, même écrit en banque 0", async () => {
    poserSF2(sf2Factice(TOUS));
    const b = await rendreMidiDepuisBytes(await octets(FRAPPES, 9, 0, 25), "SoundFont", VOLUME);
    expect(presetEntendu(b, TOUS)).toBe("TR-808");
  });

  it("une banque de batterie écrite dans le fichier est gardée", async () => {
    poserSF2(sf2Factice(TOUS));
    const b = await rendreMidiDepuisBytes(await octets(FRAPPES, 9, 128, 32), "SoundFont", VOLUME);
    expect(presetEntendu(b, TOUS)).toBe("Jazz");
  });

  it("un kit absent du SoundFont retombe sur le Standard", async () => {
    poserSF2(sf2Factice(TOUS));
    const b = await rendreMidiDepuisBytes(await octets(FRAPPES, 9, 0, 40), "SoundFont", VOLUME);
    expect(presetEntendu(b, TOUS)).toBe("Standard");
  });

  it("UN KIT IMPOSÉ PAR LE RÉGLAGE s'applique au canal dix", async () => {
    poserSF2(sf2Factice(TOUS));
    const b = await rendreMidiDepuisBytes(await octets(FRAPPES, 9), "SoundFont", VOLUME, 25, 128);
    expect(presetEntendu(b, TOUS)).toBe("TR-808");
  });

  it("UN PRESET MÉLODIQUE IMPOSÉ laisse le canal dix à son kit", async () => {
    poserSF2(sf2Factice(TOUS));
    const b = await rendreMidiDepuisBytes(await octets(FRAPPES, 9, 0, 25), "SoundFont", VOLUME, 0, 0);
    expect(presetEntendu(b, TOUS)).toBe("TR-808");
  });

  it("LES AUTRES CANAUX NE CHANGENT PAS : le canal zéro joue toujours ce qu'il désigne ou ce qu'on impose", async () => {
    poserSF2(sf2Factice(TOUS));
    expect(presetEntendu(await rendreMidiDepuisBytes(await octets(FRAPPES, 0), "SoundFont", VOLUME), TOUS)).toBe("Piano");
    // Un kit imposé s'applique à tous les canaux, comme avant : seul le canal dix a sa règle.
    expect(presetEntendu(await rendreMidiDepuisBytes(await octets(FRAPPES, 0), "SoundFont", VOLUME, 25, 128), TOUS))
      .toBe("TR-808");
  });

  it("SANS AUCUN KIT DANS LE SOUNDFONT, le canal dix passe par le synthétiseur de percussions", async () => {
    poserSF2(sf2Factice([PIANO]));
    const bytes = await octets(FRAPPES, 9);
    const b = await rendreMidiDepuisBytes(bytes, "SoundFont", VOLUME);
    expect(presetEntendu(b, [PIANO])).toBeNull();
    expect(crete(b)).toBeGreaterThan(0.05);
    expect(ecartMax(b, await batterieAttendue(bytes, b.sampleRate))).toBeLessThan(1e-6);
  });
});

describe("la règle, sans rendre de son", () => {
  const fichierMuet = { programme: 0, banque: 0 };

  it("une banque au-delà de 128 écrite dans le fichier est gardée si le SoundFont l'a", () => {
    expect(voieDuCanal([...TOUS, { programme: 0, banque: 129 }], 9, { programme: 0, banque: 129 }))
      .toEqual({ voie: "soundfont", programme: 0, banque: 129 });
  });

  it("un kit imposé absent retombe sur le Standard, comme un kit du fichier", () => {
    expect(voieDuCanal(TOUS, 9, fichierMuet, { programme: 40, banque: 128 }))
      .toEqual({ voie: "soundfont", programme: 0, banque: 128 });
  });

  it("SANS STANDARD, le premier kit de la banque 128, par programme", () => {
    expect(voieDuCanal([PIANO, JAZZ, TR808], 9, fichierMuet)).toEqual({ voie: "soundfont", programme: 25, banque: 128 });
  });

  it("sans aucun kit, le synthétiseur, même quand le fichier nomme la banque 128", () => {
    expect(voieDuCanal([PIANO], 9, { programme: 0, banque: 128 })).toEqual({ voie: "synthetiseur" });
  });

  it("hors du canal dix, le réglage puis le fichier, sans regarder ce que le SoundFont contient", () => {
    expect(voieDuCanal([PIANO], 3, { programme: 48, banque: 0 })).toEqual({ voie: "soundfont", programme: 48, banque: 0 });
    expect(voieDuCanal([PIANO], 3, { programme: 48, banque: 0 }, { programme: 0, banque: 128 }))
      .toEqual({ voie: "soundfont", programme: 0, banque: 128 });
  });
});

describe("le canal dix, en FM", () => {
  it("LES FRAPPES PASSENT PAR LE SYNTHÉTISEUR DE PERCUSSIONS, et non par une hauteur FM", async () => {
    const bytes = await octets(FRAPPES, 9);
    const b = await rendreMidiDepuisBytes(bytes, "FM/Oscillateurs", VOLUME);
    expect(crete(b)).toBeGreaterThan(0.05);
    expect(ecartMax(b, await batterieAttendue(bytes, b.sampleRate))).toBeLessThan(1e-6);
  });
});
