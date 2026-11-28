// audio/sf2-enveloppe.test.ts — Des générateurs d'une zone SoundFont au gain de chaque échantillon.
//
// Ce fichier tient le module pur : unités, planchers, échelle de touche, et la course de
// l'enveloppe. Ce que le rendu en fait, sur un fichier écrit puis relu, est dans
// `sf2-enveloppe-rendu.test.ts`.
import { describe, expect, it } from "vitest";
import {
  AUCUN_DECALAGE, CourseEnveloppe, ENVELOPPE_PAR_DEFAUT, RELACHEMENT_ETOUFFE, additionnerEnveloppes, enveloppeDeZone,
  enveloppeEnSecondes, lireGenerateurEnveloppe, type EnveloppeEnSecondes, type GenerateursEnveloppe,
} from "./sf2-enveloppe";

const SR = 44100;
const avec = (g: Partial<GenerateursEnveloppe>): GenerateursEnveloppe => ({ ...ENVELOPPE_PAR_DEFAUT, ...g });
const db = (x: number) => 20 * Math.log10(x);

describe("les unités de la norme", () => {
  it("ZÉRO TIMECENT VAUT UNE SECONDE, 1200 EN VALENT DEUX, −1200 UNE DEMIE", () => {
    const e = enveloppeEnSecondes(avec({ retard: 0, attaque: 0, maintien: 1200, chute: 1200, relachement: -1200 }), 60);
    expect(e.retard).toBeCloseTo(1, 12);
    expect(e.attaque).toBeCloseTo(1, 12);
    expect(e.maintien).toBeCloseTo(2, 12);
    expect(e.chute).toBeCloseTo(2, 12);
    expect(e.relachement).toBeCloseTo(0.5, 12);
  });

  it("LIT UN GÉNÉRATEUR SIGNÉ : −1586 s'écrit 63950 dans le fichier", () => {
    const g: Partial<GenerateursEnveloppe> = {};
    expect(lireGenerateurEnveloppe(g, 38, 63950)).toBe(true);
    expect(g.relachement).toBe(-1586);
    // Ce qui n'est pas de l'enveloppe de volume n'y entre pas : 30, le relâchement de modulation.
    expect(lireGenerateurEnveloppe(g, 30, 1000)).toBe(false);
    expect(Object.keys(g)).toEqual(["relachement"]);
  });

  it("LE RELÂCHEMENT NE DESCEND PAS SOUS −7200 TIMECENTS, et le retard par défaut ne retarde pas", () => {
    const e = enveloppeEnSecondes(ENVELOPPE_PAR_DEFAUT, 60);
    expect(e.relachement).toBeCloseTo(2 ** -6, 12);
    expect(e.retard).toBe(0);
    expect(e.attaque).toBeCloseTo(2 ** -10, 12);
    // Au-dessus du plancher, le retard est lu.
    expect(enveloppeEnSecondes(avec({ retard: -2400 }), 60).retard).toBeCloseTo(0.25, 12);
  });

  it("LE MAINTIEN ET LA CHUTE S'ALLONGENT VERS LE GRAVE, de (60 − touche) fois leur générateur d'échelle", () => {
    const g = avec({ maintien: 0, chute: 0, toucheMaintien: 100, toucheChute: -50 });
    expect(enveloppeEnSecondes(g, 60).maintien).toBeCloseTo(1, 12);
    expect(enveloppeEnSecondes(g, 48).maintien).toBeCloseTo(2, 12);
    expect(enveloppeEnSecondes(g, 72).maintien).toBeCloseTo(0.5, 12);
    expect(enveloppeEnSecondes(g, 48).chute).toBeCloseTo(0.5 ** 0.5, 12);
  });

  it("LA ZONE DE PRESET S'AJOUTE, PUIS LA PLAGE DE LA NORME BORNE LA SOMME", () => {
    const somme = additionnerEnveloppes(avec({ relachement: 7900, palier: 900 }), { ...AUCUN_DECALAGE, relachement: 500, palier: 300 });
    expect(somme.relachement).toBe(8400);
    const e = enveloppeEnSecondes(somme, 60);
    expect(e.relachement).toBeCloseTo(2 ** (8000 / 1200), 9);
    expect(e.palier).toBe(1000);
  });

  it("UN GÉNÉRATEUR LOCAL REMPLACE CELUI DE LA ZONE GLOBALE, il ne s'y ajoute pas", () => {
    const z = enveloppeDeZone({ relachement: 1902, palier: 30 }, { relachement: 0 }, ENVELOPPE_PAR_DEFAUT);
    expect(z.relachement).toBe(0);
    expect(z.palier).toBe(30);
    expect(z.chute).toBe(-12000);
  });
});

/** Une enveloppe en secondes, aux valeurs qu'on lit sans calcul. */
const SECONDES = (e: Partial<EnveloppeEnSecondes>): EnveloppeEnSecondes => ({
  retard: 0, attaque: 0.01, maintien: 0.1, chute: 2, palier: 60, relachement: 1, ...e,
});

describe("la course de l'enveloppe", () => {
  it("TIENT SON PALIER, PUIS RELÂCHE DEPUIS LUI À CENT DÉCIBELS PAR TEMPS DE RELÂCHEMENT", () => {
    const c = new CourseEnveloppe(SECONDES({}), SR, SR);
    expect(db(c.amplitude(Math.round(0.05 * SR)))).toBeCloseTo(0, 9);
    // Le palier de 60 cB est atteint 2 s × 60/1000 = 0,12 s après la fin du maintien.
    expect(db(c.amplitude(Math.round(0.5 * SR)))).toBeCloseTo(-6, 9);
    // Une demi-seconde après la fin MIDI : 6 + 50 dB sous le plein.
    expect(db(c.amplitude(SR + SR / 2))).toBeCloseTo(-56, 6);
    // Et la voix s'éteint à cent décibels : 0,94 s après la fin MIDI, à l'arrondi d'un échantillon près.
    expect(Math.abs(c.longueur - (SR + 0.94 * SR))).toBeLessThanOrEqual(1);
    expect(c.amplitude(c.longueur)).toBe(0);
    expect(db(c.amplitude(c.longueur - 1))).toBeGreaterThan(-100.01);
  });

  it("UNE ATTAQUE MONTE LINÉAIREMENT EN AMPLITUDE, après son retard", () => {
    const c = new CourseEnveloppe(SECONDES({ retard: 0.1, attaque: 0.2 }), SR, SR);
    expect(c.amplitude(Math.round(0.05 * SR))).toBe(0);
    expect(c.amplitude(Math.round(0.2 * SR))).toBeCloseTo(0.5, 9);
    expect(c.amplitude(Math.round(0.25 * SR))).toBeCloseTo(0.75, 9);
  });

  it("UNE NOTE LÂCHÉE PENDANT SON ATTAQUE RELÂCHE DEPUIS LE NIVEAU ATTEINT", () => {
    const c = new CourseEnveloppe(SECONDES({ attaque: 1 }), SR, SR / 10);
    // Lâchée à 0,1 s : à −20 dB, il lui reste 80 dB, soit 0,8 s.
    expect(db(c.amplitude(SR / 10))).toBeCloseTo(-20, 6);
    expect(Math.abs(c.longueur - (SR / 10 + 0.8 * SR))).toBeLessThanOrEqual(1);
  });

  it("UN PALIER DE MILLE CENTIBELS ÉTEINT LA VOIX DANS SA CHUTE, sans attendre la fin MIDI", () => {
    const c = new CourseEnveloppe(SECONDES({ palier: 1000, chute: 0.5 }), SR, 10 * SR);
    expect(Math.abs(c.longueur - (0.01 + 0.1 + 0.5) * SR)).toBeLessThanOrEqual(1);
    expect(db(c.amplitude(Math.round(0.36 * SR)))).toBeCloseTo(-50, 6);
  });

  it("UNE NOTE LÂCHÉE AVANT LA FIN DE SON RETARD NE SONNE PAS", () => {
    const c = new CourseEnveloppe(SECONDES({ retard: 0.5 }), SR, SR / 4);
    expect(c.longueur).toBe(SR / 4);
    for (let i = 0; i < c.longueur; i += 97) expect(c.amplitude(i)).toBe(0);
  });

  it("UNE VOIX ÉTOUFFÉE RELÂCHE DEPUIS L'ÉTOUFFEMENT, à la plus rapide des deux raisons", () => {
    const etouffe = (debut: number) => ({ debut, relachement: RELACHEMENT_ETOUFFE });
    // Étouffée après sa fin MIDI : 0,5 s à sa raison (50 dB), puis cent décibels par 0,31 s.
    const apres = new CourseEnveloppe(SECONDES({ palier: 0 }), SR, SR, etouffe(1.5 * SR));
    expect(db(apres.amplitude(1.5 * SR))).toBeCloseTo(-50, 6);
    expect(db(apres.amplitude(1.6 * SR))).toBeCloseTo(-50 - 10 / RELACHEMENT_ETOUFFE, 6);
    expect(Math.abs(apres.longueur - (1.5 + 0.5 * RELACHEMENT_ETOUFFE) * SR)).toBeLessThanOrEqual(1);
    // Étouffée encore tenue : le relâchement part de l'étouffement, à la raison de l'étouffement.
    const tenue = new CourseEnveloppe(SECONDES({ palier: 0 }), SR, 2 * SR, etouffe(SR / 2));
    expect(db(tenue.amplitude(0.6 * SR))).toBeCloseTo(-10 / RELACHEMENT_ETOUFFE, 6);
    // Un relâchement propre plus rapide que l'étouffement le reste.
    const vive = new CourseEnveloppe(SECONDES({ palier: 0, relachement: 0.1 }), SR, SR / 2, etouffe(0.55 * SR));
    expect(db(vive.amplitude(0.6 * SR))).toBeCloseTo(-100, 6);
  });

  it("`suivant()` REND LA MÊME SUITE QU'`amplitude()`, sur toutes les phases", () => {
    const etouffe = (debut: number) => ({ debut, relachement: RELACHEMENT_ETOUFFE });
    const cas: Array<[Partial<EnveloppeEnSecondes>, number, ReturnType<typeof etouffe>?]> = [
      [{}, SR], [{ attaque: 0.3 }, SR / 10], [{ palier: 1000, chute: 0.4 }, 2 * SR],
      [{ retard: 0.05, chute: 0.0001 }, SR / 2], [{ palier: 0 }, SR / 3], [{ relachement: 2 ** -6 }, 1000],
      [{}, SR, etouffe(1.2 * SR)], [{}, SR, etouffe(SR / 2)], [{ palier: 1000, chute: 0.4 }, 2 * SR, etouffe(SR / 10)],
    ];
    for (const [e, tenue, etouffement] of cas) {
      const c = new CourseEnveloppe(SECONDES(e), SR, tenue, etouffement);
      const reference = new CourseEnveloppe(SECONDES(e), SR, tenue, etouffement);
      let pire = 0;
      for (let i = 0; i < c.longueur + 10; i++) {
        const attendu = reference.amplitude(i);
        pire = Math.max(pire, Math.abs(c.suivant() - attendu) / Math.max(attendu, 1e-5));
      }
      expect(pire, JSON.stringify(e)).toBeLessThan(1e-6);
    }
  });
});
