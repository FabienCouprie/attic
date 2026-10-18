// Les zones deviennent des notes : ce qui est éprouvé ici est le passage, pas le découpage.
import { describe, expect, it } from "vitest";
import {
  hauteurDeZone, notesDesZones, nuanceDeSonie, zonesRetenues,
  type ReglagesZonesMidi, type ZoneEntrante,
} from "./zones-vers-midi";
import type { Courbe } from "./courbe";

const courbe = (valeurs: number[], cadence = 100): Courbe =>
  ({ valeurs: Float32Array.from(valeurs), cadence });

const REGLAGES: ReglagesZonesMidi = {
  source: "courbe", noteFixe: 60, noteMin: 0, noteMax: 120, degres: [],
  velocite: "fixe", velociteFixe: 100, canal: 0,
};

describe("une note par zone", () => {
  it("garde le début et la durée de chaque zone, dans l'ordre du temps", () => {
    const zones: ZoneEntrante[] = [{ debut: 1, duree: 0.5 }, { debut: 0, duree: 0.25 }];
    const { notes } = notesDesZones(zonesRetenues(zones), null, { ...REGLAGES, source: "fixe" });
    expect(notes.map((n) => n.debut)).toEqual([0, 1]);
    expect(notes.map((n) => +(n.fin - n.debut).toFixed(3))).toEqual([0.25, 0.5]);
  });

  it("écarte ce qui n'est pas une zone : durée nulle, début absent, valeur vide", () => {
    const brutes = [
      { debut: 0, duree: 0 }, { debut: Number.NaN, duree: 1 }, null, { debut: 2, duree: 0.1 },
    ];
    expect(zonesRetenues(brutes).map((z) => z.debut)).toEqual([2]);
  });

  it("borne le canal au seize canaux MIDI", () => {
    const { notes } = notesDesZones([{ debut: 0, duree: 1 }], null, { ...REGLAGES, source: "fixe", canal: 42 });
    expect(notes[0].canal).toBe(15);
  });
});

describe("la hauteur d'une zone", () => {
  // LE CAS QUI TIENT LA DÉCISION 1. La zone commence par trois trames muettes, comme toute zone
  // découpée à l'attaque. Lire le début rendrait « aucune hauteur » et poserait la note fixe.
  it("se prend sur la médiane et non sur le début de la zone", () => {
    const c = courbe([0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const { notes, sansHauteur } = notesDesZones([{ debut: 0, duree: 0.1 }], c, REGLAGES);
    expect(sansHauteur).toBe(0);
    expect(notes[0].note).toBe(60);
  });

  it("résiste à une trame sautée d'une octave, là où une moyenne la suivrait", () => {
    const c = courbe([0.5, 0.5, 1, 0.5]);
    // La moyenne vaudrait 0,625, soit la note 75. La médiane vaut 0,5, soit la note 60.
    expect(hauteurDeZone(c, 0, 0.04)).toBeCloseTo(0.5, 6);
    const { notes } = notesDesZones([{ debut: 0, duree: 0.04 }], c, REGLAGES);
    expect(notes[0].note).toBe(60);
  });

  it("rend null quand la zone est entièrement muette, et la note fixe est alors posée", () => {
    const c = courbe([0, 0, 0, 0]);
    expect(hauteurDeZone(c, 0, 0.04)).toBeNull();
    const { notes, sansHauteur } = notesDesZones([{ debut: 0, duree: 0.04 }], c, REGLAGES);
    expect(notes[0].note).toBe(60);
    expect(sansHauteur).toBe(1);
  });

  it("compte la zone sans hauteur quand aucune courbe n'est reçue", () => {
    const { notes, sansHauteur } = notesDesZones([{ debut: 0, duree: 1 }], null, REGLAGES);
    expect(notes[0].note).toBe(60);
    expect(sansHauteur).toBe(1);
  });

  it("tient les deux bornes : le zéro de la courbe vaut la note min, le un la note max", () => {
    const c = courbe([0.000001, 1]);
    const bas = notesDesZones([{ debut: 0, duree: 0.01 }], c, { ...REGLAGES, noteMin: 40, noteMax: 80 });
    const haut = notesDesZones([{ debut: 0.01, duree: 0.01 }], c, { ...REGLAGES, noteMin: 40, noteMax: 80 });
    expect(bas.notes[0].note).toBe(40);
    expect(haut.notes[0].note).toBe(80);
  });
});

describe("la gamme", () => {
  // LE CAS QUI TIENT LA DÉCISION 3 : une note fixe est celle qu'on a demandée.
  const DO_MAJEUR = [0, 2, 4, 5, 7, 9, 11];

  it("met la hauteur lue sur le degré le plus proche", () => {
    const c = courbe([61 / 120]);
    const { notes } = notesDesZones([{ debut: 0, duree: 0.01 }], c, { ...REGLAGES, degres: DO_MAJEUR });
    expect(notes[0].note).toBe(60);
  });

  it("ne touche pas à la note fixe", () => {
    const { notes } = notesDesZones([{ debut: 0, duree: 1 }], null,
      { ...REGLAGES, source: "fixe", noteFixe: 61, degres: DO_MAJEUR });
    expect(notes[0].note).toBe(61);
  });
});

describe("la nuance", () => {
  it("suit le niveau de la zone, du plancher à la pleine échelle", () => {
    expect(nuanceDeSonie(-60)).toBe(1);
    expect(nuanceDeSonie(0)).toBe(127);
    expect(nuanceDeSonie(-30)).toBe(64);
    expect(nuanceDeSonie(-90)).toBe(1);
  });

  it("prend le réglage, et se compte, quand la zone ne porte pas de niveau", () => {
    const zones: ZoneEntrante[] = [{ debut: 0, duree: 1, sonie: -12 }, { debut: 1, duree: 1 }];
    const { notes, sansSonie } = notesDesZones(zones, null,
      { ...REGLAGES, source: "fixe", velocite: "sonie", velociteFixe: 42 });
    expect(notes[0].velocite).toBe(nuanceDeSonie(-12));
    expect(notes[1].velocite).toBe(42);
    expect(sansSonie).toBe(1);
  });
});
