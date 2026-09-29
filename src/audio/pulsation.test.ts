// audio/pulsation.test.ts — Les frappes tirées d'une suite d'atomes.
//
// CE QUE CES CAS TIENNENT. D'abord que chacun des trois critères écarte bien ce qu'il doit, et lui
// seul : un tri qui laisserait passer les tenues rendrait une pulsation à chaque note. Ensuite que
// le regroupement fasse UNE frappe d'une attaque, ce qui est la raison même du module : une seule
// attaque reçoit plusieurs atomes, un par partiel et un par échelle, et les compter séparément
// donnerait une pulsation cinq fois trop dense. Enfin que le son rendu batte aux bons instants et
// n'écrête pas.
import { describe, expect, it } from "vitest";
import type { Note } from "./note";
import {
  cadenceDesFrappes, echantillonsDeBattements, irregularite, pulsationDeSequence,
} from "./pulsation";

const SR = 22050;

/** Un atome devenu note : instant, durée, hauteur, force. */
const note = (debut: number, duree: number, hauteur: number, velocite: number): Note =>
  ({ note: hauteur, velocite, debut, fin: debut + duree });

/** Des critères larges : chaque cas resserre celui qu'il éprouve. */
const LARGE = { dureeMax: 1, hauteurMax: 127, forceMin: 1, regroupement: 0.001 };

describe("les trois critères", () => {
  it("LA DURÉE ÉCARTE LES TENUES : un atome long décrit une note, non une frappe", () => {
    const notes = [note(0, 0.005, 40, 100), note(1, 0.2, 40, 100)];
    expect(pulsationDeSequence(notes, { ...LARGE, dureeMax: 0.06 }).map((f) => f.instant)).toEqual([0]);
  });

  it("LA HAUTEUR ÉCARTE L'AIGU : l'énergie d'une frappe est dans le bas du spectre", () => {
    const notes = [note(0, 0.005, 40, 100), note(1, 0.005, 90, 100)];
    expect(pulsationDeSequence(notes, { ...LARGE, hauteurMax: 55 }).map((f) => f.instant)).toEqual([0]);
  });

  it("LA FORCE ÉCARTE LES RESTES : une attaque porte l'essentiel de l'énergie de son instant", () => {
    const notes = [note(0, 0.005, 40, 100), note(1, 0.005, 40, 10)];
    expect(pulsationDeSequence(notes, { ...LARGE, forceMin: 32 }).map((f) => f.instant)).toEqual([0]);
  });

  it("et les trois se cumulent, chacun écartant ce qui lui revient", () => {
    const notes = [
      note(0, 0.005, 40, 100), // retenue
      note(1, 0.300, 40, 100), // trop longue
      note(2, 0.005, 90, 100), // trop aiguë
      note(3, 0.005, 40, 10), // trop faible
    ];
    const f = pulsationDeSequence(notes, { dureeMax: 0.06, hauteurMax: 55, forceMin: 32, regroupement: 0.05 });
    expect(f.map((x) => x.instant)).toEqual([0]);
  });
});

describe("le regroupement", () => {
  it("UNE ATTAQUE FAIT UNE FRAPPE, quel que soit le nombre d'atomes qui la décrivent", () => {
    // Cinq atomes dans les vingt millisecondes d'une même attaque : ses partiels et ses échelles.
    const notes = [0, 0.004, 0.009, 0.013, 0.018].map((t) => note(t, 0.005, 40, 100));
    const f = pulsationDeSequence(notes, { ...LARGE, regroupement: 0.05 });
    expect(f.length).toBe(1);
    expect(f[0].atomes).toBe(5);
    expect(f[0].instant).toBe(0);
  });

  it("L'INSTANT EST CELUI DU PLUS TÔT, et non du plus fort", () => {
    // Le sommet d'énergie vient après le début de l'attaque ; prendre le plus fort la retarderait.
    const notes = [note(0, 0.005, 40, 20), note(0.01, 0.005, 40, 127)];
    expect(pulsationDeSequence(notes, { ...LARGE, regroupement: 0.05 })[0].instant).toBe(0);
  });

  it("DEUX ATTAQUES ASSEZ ÉLOIGNÉES RESTENT DEUX", () => {
    const notes = [note(0, 0.005, 40, 100), note(0.5, 0.005, 40, 100)];
    expect(pulsationDeSequence(notes, { ...LARGE, regroupement: 0.05 }).length).toBe(2);
  });

  it("LA FORCE EST LA SOMME DU GROUPE, rapportée à la frappe la plus forte", () => {
    const notes = [
      note(0, 0.005, 40, 60), note(0.01, 0.005, 40, 60), // une frappe riche : somme 120
      note(1, 0.005, 40, 60), // une frappe pauvre : somme 60
    ];
    const f = pulsationDeSequence(notes, { ...LARGE, regroupement: 0.05 });
    expect(f.length).toBe(2);
    expect(f[0].force).toBe(127);
    expect(f[1].force).toBeGreaterThan(55);
    expect(f[1].force).toBeLessThan(75);
  });

  it("une suite vide ne fait aucune frappe", () => {
    expect(pulsationDeSequence([], LARGE)).toEqual([]);
    expect(pulsationDeSequence([note(0, 1, 40, 100)], { ...LARGE, dureeMax: 0.01 })).toEqual([]);
  });
});

describe("ce que la pulsation dit d'elle-même", () => {
  const reguliere = [0, 0.5, 1, 1.5, 2].map((t) => ({ instant: t, force: 100, atomes: 1 }));

  it("LA CADENCE EST L'ÉCART MOYEN, et son compte par minute", () => {
    expect(cadenceDesFrappes(reguliere).ecartMoyen).toBeCloseTo(0.5, 10);
    expect(cadenceDesFrappes(reguliere).parMinute).toBeCloseTo(120, 10);
    expect(cadenceDesFrappes([])).toEqual({ ecartMoyen: 0, parMinute: 0 });
  });

  it("L'IRRÉGULARITÉ EST NULLE SUR UNE GRILLE, et grandit quand les écarts varient", () => {
    expect(irregularite(reguliere)).toBeCloseTo(0, 10);
    const cahotante = [0, 0.1, 0.9, 1.0, 2.0].map((t) => ({ instant: t, force: 100, atomes: 1 }));
    expect(irregularite(cahotante)).toBeGreaterThan(0.4);
    // MOINS DE TROIS FRAPPES NE DIT RIEN : deux instants n'ont qu'un écart, donc aucune variation.
    expect(irregularite(reguliere.slice(0, 2))).toBe(0);
  });
});

describe("le son qui bat", () => {
  const frappes = [0, 0.5, 1].map((t) => ({ instant: t, force: 127, atomes: 1 }));
  const O = { frequence: 60, longueur: 0.12, niveau: 0.8, duree: 1.5, sampleRate: SR };

  it("IL BAT AUX INSTANTS DES FRAPPES, et se tait entre elles", () => {
    const x = echantillonsDeBattements(frappes, O);
    const energie = (de: number, a: number) => {
      let m = 0;
      for (let i = Math.round(de * SR); i < Math.round(a * SR); i++) m = Math.max(m, Math.abs(x[i]));
      return m;
    };
    // Juste après chaque frappe, du son ; juste avant la suivante, presque rien.
    expect(energie(0, 0.02)).toBeGreaterThan(0.3);
    expect(energie(0.5, 0.52)).toBeGreaterThan(0.3);
    expect(energie(0.4, 0.49)).toBeLessThan(0.02);
  });

  it("LA FORCE D'UNE FRAPPE RÈGLE SON AMPLITUDE", () => {
    const x = echantillonsDeBattements(
      [{ instant: 0, force: 127, atomes: 1 }, { instant: 0.5, force: 32, atomes: 1 }], O,
    );
    const crete = (de: number, a: number) => {
      let m = 0;
      for (let i = Math.round(de * SR); i < Math.round(a * SR); i++) m = Math.max(m, Math.abs(x[i]));
      return m;
    };
    expect(crete(0.5, 0.6)).toBeLessThan(crete(0, 0.1) / 2);
  });

  it("IL N'ÉCRÊTE PAS, même quand des frappes se recouvrent", () => {
    const serrees = [0, 0.01, 0.02, 0.03, 0.04].map((t) => ({ instant: t, force: 127, atomes: 1 }));
    const x = echantillonsDeBattements(serrees, O);
    let crete = 0;
    for (let i = 0; i < x.length; i++) crete = Math.max(crete, Math.abs(x[i]));
    expect(crete).toBeLessThanOrEqual(O.niveau + 1e-6);
    expect(crete).toBeGreaterThan(0.1);
  });

  it("une frappe posée après la fin du son ne déborde pas du tampon", () => {
    const x = echantillonsDeBattements([{ instant: 9, force: 127, atomes: 1 }], O);
    expect(x.length).toBe(Math.round(1.5 * SR));
    expect(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBe(0);
  });

  it("aucune frappe ne fait aucun son, et le tampon a tout de même sa longueur", () => {
    const x = echantillonsDeBattements([], O);
    expect(x.length).toBe(Math.round(1.5 * SR));
    expect(x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBe(0);
  });
});
