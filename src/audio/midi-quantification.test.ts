// audio/midi-quantification.test.ts — Chaque grille que le transposeur offre a son pas.
//
// LE RÉGLAGE OFFRE LA TABLE ENTIÈRE DES VALEURS DE NOTE depuis le 2026-11-14. Une valeur offerte sans
// grille retomberait en silence sur « aucune » : le fichier sortirait tel qu'il est entré, et rien ne
// le dirait. Ce cas tient donc ensemble la liste offerte et la table des grilles.
import { describe, expect, it } from "vitest";
import { parseMidi, writeMidi } from "midi-file";
import { registre } from "./adaptateur";
import { pasDeGrille, transposerQuantifierMidi } from "./midi-quantification";

const TICKS = 480;

/** Le pas attendu à 480 ticks par temps, compté à la main. */
const ATTENDU: Record<string, number> = {
  "1/1": 1920, "1/2": 960, "1/4.": 720, "1/4": 480, "1/4t": 320, "1/8.": 360, "1/8": 240,
  "1/8t": 160, "1/16.": 180, "1/16": 120, "1/16t": 80, "1/32": 60, "1/32t": 40,
};

describe("les grilles du transposeur", () => {
  const offertes = (registre.trouverDef("transposeur-quantiseur-midi")?.parametres ?? [])
    .find((p) => p.nom === "Quantisation")?.optionIds ?? [];

  it("CHAQUE VALEUR OFFERTE A SON PAS, compté à la main", () => {
    expect(offertes.length).toBe(14);
    for (const id of offertes) {
      expect(pasDeGrille(id, TICKS), id).toBe(id === "none" ? 0 : ATTENDU[id]);
    }
  });

  it("une attaque jouée à côté tombe sur la grille pointée", async () => {
    // Une note à 350 ticks : la croche pointée la ramène à 360, la croche à 240.
    const midi = writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: TICKS },
      tracks: [[
        { deltaTime: 350, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 200, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ]],
    } as never);
    const attaque = async (grille: string) => {
      const sortie = await transposerQuantifierMidi(new File([new Uint8Array(midi)], "essai.mid"), 0, grille, false);
      const lu = parseMidi(new Uint8Array(await sortie.arrayBuffer()));
      let t = 0;
      for (const e of lu.tracks[0]) {
        t += e.deltaTime;
        if (e.type === "noteOn" && e.velocity > 0) return t;
      }
      return -1;
    };
    expect(await attaque("1/8.")).toBe(360);
    expect(await attaque("1/8")).toBe(240);
    expect(await attaque("none")).toBe(350);
  });
});
