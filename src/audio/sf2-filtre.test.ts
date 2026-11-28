// audio/sf2-filtre.test.ts — Le module pur du filtre de voix et de l'enveloppe de modulation.
//
// Ce que le rendu en fait, sur un fichier écrit puis relu, est dans `sf2-filtre-rendu.test.ts`.
import { describe, expect, it } from "vitest";
import { RELACHEMENT_ETOUFFE } from "./sf2-enveloppe";
import {
  BLOC_FILTRE, CourseModulation, FILTRE_PAR_DEFAUT, FiltreVoix, Q_SANS_RESONANCE, convexe, enHertz, filtreOuvert, modulationEnSecondes,
  type GenerateursFiltre, type ModulationEnSecondes,
} from "./sf2-filtre";

const SR = 44100;
const avec = (g: Partial<GenerateursFiltre>): GenerateursFiltre => ({ ...FILTRE_PAR_DEFAUT, ...g });
const MODULATION = (m: Partial<ModulationEnSecondes>): ModulationEnSecondes => ({
  retard: 0, attaque: 0.1, maintien: 0.1, chute: 1, palier: 0.4, relachement: 1, ...m,
});

describe("l'enveloppe de modulation", () => {
  it("LA CONVEXE DE LA NORME : 1 + 20/96 · log10(x²), bornée", () => {
    expect(convexe(1)).toBe(1);
    expect(convexe(0.5)).toBeCloseTo(1 - (40 / 96) * Math.log10(2), 12);
    expect(convexe(10 ** -2.5)).toBe(0);
    expect(convexe(0)).toBe(0);
  });

  it("SON PALIER EST EN MILLIÈMES SOUS LE PLEIN, ET SON RELÂCHEMENT N'A PAS DE PLANCHER", () => {
    const m = modulationEnSecondes(avec({ palier: 600, relachement: -12000 }), 60);
    expect(m.palier).toBeCloseTo(0.4, 12);
    expect(m.relachement).toBeCloseTo(2 ** -10, 12);
  });

  it("MONTE PAR UNE ATTAQUE CONVEXE, PUIS CHUTE ET RELÂCHE LINÉAIREMENT EN VALEUR", () => {
    const c = new CourseModulation(MODULATION({}), SR, SR);
    expect(c.valeur(0.05 * SR)).toBeCloseTo(convexe(0.5), 9);
    expect(c.valeur(0.15 * SR)).toBe(1);
    // La chute parcourt une course entière en une seconde : 0,3 s après le maintien, 0,7.
    expect(c.valeur(0.5 * SR)).toBeCloseTo(0.7, 9);
    expect(c.valeur(0.9 * SR)).toBeCloseTo(0.4, 9);
    // Relâchée à 1 s depuis 0,4, à une course par seconde : 0,2 à 1,2 s, zéro ensuite.
    expect(c.valeur(1.2 * SR)).toBeCloseTo(0.2, 9);
    expect(c.valeur(1.5 * SR)).toBe(0);
  });

  it("ÉTOUFFÉE, ELLE RELÂCHE À LA PLUS RAPIDE DES DEUX RAISONS", () => {
    const c = new CourseModulation(MODULATION({}), SR, 2 * SR, { debut: SR, relachement: RELACHEMENT_ETOUFFE });
    expect(c.valeur(SR + 0.1 * SR)).toBeCloseTo(0.4 - 0.1 / RELACHEMENT_ETOUFFE, 9);
  });
});

describe("le filtre d'une voix", () => {
  it("UN FILTRE OUVERT N'EST PAS APPLIQUÉ, mais une résonance ou une modulation descendante l'ouvrent", () => {
    expect(filtreOuvert(FILTRE_PAR_DEFAUT)).toBe(true);
    expect(filtreOuvert(avec({ versCoupure: 2000 }))).toBe(true);
    expect(filtreOuvert(avec({ resonance: 10 }))).toBe(false);
    expect(filtreOuvert(avec({ versCoupure: -100 }))).toBe(false);
    expect(filtreOuvert(avec({ coupure: 13499 }))).toBe(false);
  });

  it("LA COUPURE EST BORNÉE DE 1 500 À 13 500 CENTS, PUIS À 0,45 FOIS LA FRÉQUENCE D'ÉCHANTILLONNAGE", () => {
    expect(new FiltreVoix(avec({ coupure: 1000 }), SR, null).coupureEnCents(0)).toBe(1500);
    const auPlafond = new FiltreVoix(avec({ coupure: 13499 }), 22050, null).coupureEnCents(0);
    expect(enHertz(auPlafond)).toBeCloseTo(0.45 * 22050, 6);
    expect(enHertz(1500)).toBeCloseTo(19.4, 1);
    expect(enHertz(13500)).toBeCloseTo(19912.6, 1);
  });

  it("SA RÉPONSE IMPULSIONNELLE EST CELLE DU PASSE-BAS DE BRISTOW-JOHNSON, au gain √(Q₀ / Q)", () => {
    const filtre = new FiltreVoix(avec({ coupure: 6900, resonance: 120 }), SR, null);
    const q = 10 ** ((12 - 3.01) / 20), w = (2 * Math.PI * enHertz(6900)) / SR;
    const alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    const b1 = ((1 - Math.cos(w)) / a0) * Math.sqrt(Q_SANS_RESONANCE / q), b0 = b1 / 2, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
    const y: number[] = [];
    for (let i = 0; i < 64; i++) {
      const x = i === 0 ? 1 : 0;
      y.push(b0 * x + b1 * (i === 1 ? 1 : 0) + b0 * (i === 2 ? 1 : 0) - a1 * (y[i - 1] ?? 0) - a2 * (y[i - 2] ?? 0));
    }
    for (let i = 0; i < 64; i++) expect(filtre.traiter(i === 0 ? 1 : 0)).toBeCloseTo(y[i], 12);
  });

  it("SANS RÉSONANCE, LE CONTINU PASSE À L'UNITÉ : une voix filtrée ne monte pas sur une voix ouverte", () => {
    const filtre = new FiltreVoix(avec({ coupure: 9000 }), SR, null);
    let y = 0;
    for (let i = 0; i < 20000; i++) y = filtre.traiter(1);
    expect(y).toBeCloseTo(1, 9);
  });

  it("UNE MODULATION DÉPLACE LA COUPURE DE SA PORTÉE, relue tous les 32 échantillons", () => {
    const course = new CourseModulation(MODULATION({ attaque: 2 ** -10, maintien: 10 }), SR, 20 * SR);
    const filtre = new FiltreVoix(avec({ coupure: 4800, versCoupure: 6000 }), SR, course);
    expect(filtre.coupureEnCents(SR)).toBeCloseTo(10800, 6);
    expect(BLOC_FILTRE).toBe(32);
  });
});
