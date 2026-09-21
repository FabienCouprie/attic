// audio/automate-cellulaire.test.ts
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import {
  hauteurCellule2D,
  genererNotesAutomateCellulaire,
  genererAutomateCellulaire,
  normaliserGamme,
  normaliserCle,
  normaliserMode,
  normaliserTopologie,
  normaliserModeVoix,
  normaliserMapping,
} from "./automate-cellulaire";
import { degresGammeMelodie } from "./generation";

const defaults = {
  regle: 90,
  reglePersonnalisee: 90,
  topologie: "1D" as const,
  modeVoix: "Polyphonie" as const,
  mapping: "Hauteur" as const,
  largeur: 16,
  hauteur: 16,
  generations: 16,
  graine: 0,
  cle: "Do",
  gamme: "Pentatonique majeure",
  octave: 4,
  dureeNote: 0.25,
  velocite: 100,
  volume: 80,
  timbre: "FM/Oscillateurs" as const,
  instrument: 0,
  probabilite: 0,
  densiteMax: 4,
};

describe("automate-cellulaire", () => {
  it("génère des notes en mode polyphonie 1D", () => {
    const notes = genererNotesAutomateCellulaire(defaults);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.velocite).toBeGreaterThan(0);
      expect(n.velocite).toBeLessThanOrEqual(127);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("génère des notes en mode mélodie 1D", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 30,
      modeVoix: "Mélodie",
      graine: 42,
      cle: "Sol",
      gamme: "Majeur",
      octave: 3,
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(defaults.generations);
  });

  it("génère des notes en mode arpège 1D", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 110,
      modeVoix: "Arpège",
      graine: 1,
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(defaults.generations);
  });

  it("respecte la gamme demandée", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 110,
      modeVoix: "Polyphonie",
      largeur: 24,
      generations: 16,
      graine: 0,
      cle: "La",
      gamme: "Pentatonique mineure",
    });
    const gamme = degresGammeMelodie(normaliserGamme("Pentatonique mineure"));
    for (const n of notes) {
      const pc = ((n.note % 12) + 12) % 12;
      expect(gamme).toContain(pc);
    }
  });

  it("génère des notes en mode 2D Conway", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      topologie: "2D Conway",
      modeVoix: "Polyphonie",
      largeur: 12,
      hauteur: 12,
      generations: 5,
      graine: 0,
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.note).toBeGreaterThanOrEqual(0);
      expect(n.note).toBeLessThanOrEqual(127);
      expect(n.fin).toBeGreaterThan(n.debut);
    }
  });

  it("génère des notes en mode 2D Highlife avec mapping vélocité", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      topologie: "2D Highlife",
      mapping: "Vélocité",
      modeVoix: "Mélodie",
      largeur: 10,
      hauteur: 10,
      generations: 4,
      graine: 7,
    });
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(n.velocite).toBeGreaterThan(0);
      expect(n.velocite).toBeLessThanOrEqual(127);
    }
  });

  it("respecte la densité maximale", () => {
    const notes = genererNotesAutomateCellulaire({
      ...defaults,
      regle: 90,
      modeVoix: "Polyphonie",
      largeur: 32,
      generations: 16,
      densiteMax: 2,
    });
    for (let i = 0; i < defaults.generations; i++) {
      const count = notes.filter((n) => n.debut >= i * defaults.dureeNote && n.debut < (i + 1) * defaults.dureeNote).length;
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("LA RÈGLE DONNÉE EST CELLE QUI JOUE — une « règle personnalisée » non nulle ne la remplace plus", () => {
    // Le nœud résout la règle (menu, ou valeur personnalisée si le menu dit « Personnalisée ») ;
    // le générateur la suivait sauf quand reglePersonnalisee > 0, soit toujours (90 par défaut).
    const r30 = genererNotesAutomateCellulaire({ ...defaults, regle: 30, reglePersonnalisee: 90, graine: 5 });
    const r90 = genererNotesAutomateCellulaire({ ...defaults, regle: 90, reglePersonnalisee: 90, graine: 5 });
    const r184 = genererNotesAutomateCellulaire({ ...defaults, regle: 184, reglePersonnalisee: 90, graine: 5 });
    expect(JSON.stringify(r30)).not.toBe(JSON.stringify(r90));
    expect(JSON.stringify(r184)).not.toBe(JSON.stringify(r90));
  });

  it("produit un AudioBuffer et un fichier MIDI", async () => {
    const res = await genererAutomateCellulaire({
      ...defaults,
      largeur: 8,
      generations: 8,
    });
    expect(res.audio).toBeInstanceOf(AudioBuffer);
    expect(res.midi).toBeInstanceOf(File);
    expect(res.audio.duration).toBeGreaterThan(0);
  });

  it("normalise les modes, clés, gammes, topologies et mappings", () => {
    expect(normaliserMode("Polyphonie")).toBe("Polyphonie");
    expect(normaliserMode("Melody")).toBe("Mélodie");
    expect(normaliserCle("C")).toBe("Do");
    expect(normaliserCle("A")).toBe("La");
    expect(normaliserGamme("Major")).toBe("majeur");
    expect(normaliserGamme("Minor pentatonic")).toBe("pentatonique-mineure");
    expect(normaliserTopologie("2D Conway")).toBe("2D Conway");
    expect(normaliserTopologie("Highlife")).toBe("2D Highlife");
    expect(normaliserModeVoix("Arpège")).toBe("Arpège");
    expect(normaliserModeVoix("Melody")).toBe("Mélodie");
    expect(normaliserMapping("Pitch + velocity")).toBe("Hauteur + vélocité");
    expect(normaliserMapping("Velocity")).toBe("Vélocité");
  });
});

describe("automate cellulaire 2D : on entend l'évolution de la grille", () => {
  // Les réglages par défaut du nœud : 16 × 16, 32 générations, graine 0, polyphonie.
  const deuxD = { ...defaults, generations: 32, densiteMax: 8 };
  const distinctes = (notes: { note: number }[]) => new Set(notes.map((n) => n.note)).size;
  const instants = (notes: { debut: number }[]) => new Set(notes.map((n) => n.debut)).size;

  for (const topologie of ["2D Conway", "2D Highlife"] as const) {
    it(`${topologie.toUpperCase()}, RÉGLAGES PAR DÉFAUT : DES NOTES VARIÉES SUR TOUTE LA DURÉE — et non une seule`, () => {
      const notes = genererNotesAutomateCellulaire({ ...deuxD, topologie });
      // Le défaut signalé : une seule note (ou un seul accord) pour toute la séquence.
      expect(distinctes(notes), "hauteurs distinctes").toBeGreaterThanOrEqual(8);
      // Chaque génération est un pas : la séquence s'étend dans le temps.
      expect(instants(notes), "instants distincts").toBeGreaterThanOrEqual(20);
    });
  }

  it("EN MÉLODIE ET EN ARPÈGE AUSSI, la ligne bouge", () => {
    for (const modeVoix of ["Mélodie", "Arpège"] as const) {
      const notes = genererNotesAutomateCellulaire({ ...deuxD, topologie: "2D Conway", modeVoix });
      expect(distinctes(notes), modeVoix).toBeGreaterThanOrEqual(5);
      expect(instants(notes)).toBe(notes.length);
    }
  });

  it("une graine tirée au hasard donne une autre séquence, et la même à graine égale", () => {
    const a = genererNotesAutomateCellulaire({ ...deuxD, topologie: "2D Conway", graine: 12 });
    const b = genererNotesAutomateCellulaire({ ...deuxD, topologie: "2D Conway", graine: 12 });
    const c = genererNotesAutomateCellulaire({ ...deuxD, topologie: "2D Conway", graine: 13 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("LA RANGÉE DONNE LE REGISTRE : le haut de la grille sonne une octave au-dessus du milieu", () => {
    const degres = degresGammeMelodie("Pentatonique majeure");
    const haut = hauteurCellule2D(3, 0, 16, 16, 60, degres);
    const milieu = hauteurCellule2D(3, 8, 16, 16, 60, degres);
    const bas = hauteurCellule2D(3, 15, 16, 16, 60, degres);
    expect(haut - milieu).toBe(12);
    expect(milieu - bas).toBe(12);
  });

  it("le nombre de générations fait la longueur de la séquence, comme en 1D", () => {
    const court = genererNotesAutomateCellulaire({ ...deuxD, topologie: "2D Conway", generations: 8 });
    const long = genererNotesAutomateCellulaire({ ...deuxD, topologie: "2D Conway", generations: 64 });
    expect(Math.max(...court.map((n) => n.debut))).toBeLessThan(8 * deuxD.dureeNote);
    expect(Math.max(...long.map((n) => n.debut))).toBeGreaterThan(30 * deuxD.dureeNote);
  });
});
