// audio/reservoir.test.ts — Le réservoir doit produire une mélodie, pas une note tenue.
//
// Ce que ces tests tiennent, et qui manquait : le réglage « Spectre » arrivait divisé
// par cinq à sa destination (norme de Frobenius au lieu du rayon spectral), et la
// conversion état → note supposait une lecture étalée sur [-1, 1] quand elle tient dans
// ±0,1. Résultat mesuré : 4 hauteurs en tout et 88 % de notes déjà répétées, si bien que
// le paramètre « Répétition » paraissait sans effet. Rien ne le signalait.
import { describe, expect, it } from "vitest";
import { creerReservoir, genererReservoirMusical, mulberry32, rayonSpectral, type ConfigReservoir } from "./reservoir";

const BASE: ConfigReservoir = {
  taille: 15, connectivite: 0.3, leaking: 0.3, gain: 1.5, spectre: 0.9,
  cle: "C", gamme: "majeur", octave: 4, tempo: 120, pasParBeat: 2, mesures: 4,
  volume: 85, timbre: "Triangle", graine: 1, probaNote: 0.7, repetition: 0, silence: 0.1,
};

/** Notes jouées de plusieurs graines, pour ne pas conclure sur un tirage particulier. */
function melodies(cfg: Partial<ConfigReservoir>, graines = 8) {
  const notes: number[][] = [];
  for (let graine = 1; graine <= graines; graine++) {
    notes.push(genererReservoirMusical({ ...BASE, ...cfg, graine }).notes.filter((n) => !n.silence).map((n) => n.note));
  }
  return notes;
}

const partRepetitions = (m: number[][]) => {
  let paires = 0, repetees = 0;
  for (const notes of m) for (let i = 1; i < notes.length; i++) { paires++; if (notes[i] === notes[i - 1]) repetees++; }
  return repetees / Math.max(1, paires);
};

describe("rayonSpectral", () => {
  it("rend le rayon d'une matrice à valeurs propres réelles", () => {
    // [[0, 2], [0.5, 0]] : valeurs propres ±1.
    expect(rayonSpectral(Float32Array.from([0, 2, 0.5, 0]), 2)).toBeCloseTo(1, 3);
  });

  it("rend le rayon d'une matrice à valeurs propres complexes conjuguées", () => {
    // Rotation d'un quart de tour, mise à l'échelle 0,8 : valeurs propres ±0,8i.
    // La norme oscille d'une itération à l'autre ; c'est le cas qui impose de moyenner.
    expect(rayonSpectral(Float32Array.from([0, -0.8, 0.8, 0]), 2)).toBeCloseTo(0.8, 3);
  });

  it("rend 1 sur une matrice nulle, plutôt que de diviser par zéro", () => {
    expect(rayonSpectral(new Float32Array(9), 3)).toBe(1);
  });
});

describe("mise à l'échelle du réseau", () => {
  // Le défaut que ce test attrape : la mise à l'échelle divisait par la norme de
  // Frobenius, si bien que « Spectre 90 % » donnait un rayon réel de 0,23 sur 15
  // neurones et 0,16 sur 40 — le réseau ne résonnait jamais, et « 150 % », annoncé
  // chaotique, restait sous 0,4. La mélodie ne le dit pas : elle est étalée dans tous
  // les cas depuis que la conversion se rapporte à la distribution du morceau.
  it.each([
    [15, 0.3, 0.9], [15, 0.3, 1.5], [40, 0.3, 0.9], [40, 1.0, 1.2], [5, 0.5, 0.5],
  ])("réseau de %i neurones, connectivité %f : le rayon obtenu est le rayon demandé (%f)", (taille, connectivite, spectre) => {
    const res = creerReservoir({ ...BASE, taille, connectivite, spectre }, mulberry32(7));
    expect(rayonSpectral(res.poidsRes, taille)).toBeCloseTo(spectre, 2);
  });
});

describe("mélodie produite", () => {
  it("parcourt la gamme au lieu de tenir une ou deux notes", () => {
    const hauteurs = new Set(melodies({}).flat());
    // Mesuré : 12 hauteurs sur un ambitus de 19 demi-tons. Avant correction : 4.
    expect(hauteurs.size).toBeGreaterThanOrEqual(8);
    expect(Math.max(...hauteurs) - Math.min(...hauteurs)).toBeGreaterThanOrEqual(12);
  });

  it("ne répète pas la note précédente quand « Répétition » est à 0", () => {
    // Avant correction : 88 %, ce qui rendait le paramètre invisible.
    expect(partRepetitions(melodies({ repetition: 0 }))).toBeLessThan(0.4);
  });

  it("« Répétition » augmente les répétitions, et de façon monotone", () => {
    const parts = [0, 0.25, 0.5, 0.75, 1].map((repetition) => partRepetitions(melodies({ repetition })));
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i], `répétition ${i} contre ${i - 1}`).toBeGreaterThan(parts[i - 1]);
    }
    expect(parts[0]).toBeLessThan(0.4);
    expect(parts[parts.length - 1]).toBeGreaterThan(0.8);
  });

  it("reste dans l'ambitus annoncé : deux octaves de la gamme au-dessus de la fondamentale", () => {
    const notes = melodies({ cle: "C", octave: 4, gamme: "majeur" }).flat();
    expect(Math.min(...notes)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...notes)).toBeLessThanOrEqual(84);
  });

  it("rend le même morceau pour une même graine", () => {
    const a = genererReservoirMusical({ ...BASE, graine: 42 }).notes;
    const b = genererReservoirMusical({ ...BASE, graine: 42 }).notes;
    expect(a.map((n) => `${n.note}@${n.debut}`)).toEqual(b.map((n) => `${n.note}@${n.debut}`));
  });

  it("tire une graine et la rend quand elle vaut 0", () => {
    const r = genererReservoirMusical({ ...BASE, graine: 0 });
    expect(r.graineUtilisee).toBeGreaterThan(0);
    expect(genererReservoirMusical({ ...BASE, graine: r.graineUtilisee }).notes.map((n) => n.note))
      .toEqual(r.notes.map((n) => n.note));
  });
});
