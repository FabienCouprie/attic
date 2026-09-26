// audio/sequence-formes.test.ts — Filtrer une suite de notes, et lui donner un profil.
import { describe, expect, it } from "vitest";

import { constante, type Courbe } from "./courbe";
import { filtrerNotes, imposerProfil, profilDeSequence } from "./sequence-formes";
import type { Note } from "./note";

const note = (n: number, debut: number, duree = 0.5, velocite = 90, canal = 0): Note =>
  ({ note: n, velocite, debut, fin: debut + duree, canal });

/** Une rampe de zéro à un : la courbe la plus simple dont on sache dire la valeur partout. */
function rampe(n = 100): Courbe {
  const valeurs = new Float32Array(n);
  for (let i = 0; i < n; i++) valeurs[i] = i / (n - 1);
  return { valeurs, cadence: 50 };
}

describe("filtrer une séquence", () => {
  const suite = [note(48, 0), note(60, 1), note(72, 2), note(84, 3)];

  it("RETIENT CE QUI SATISFAIT, ET REND AUSSI CE QU'IL ÉCARTE", () => {
    // Les deux côtés sortent, pour qu'on puisse les traiter séparément et les réunir.
    const { gardees, ecartees } = filtrerNotes(suite, { hauteurMin: 60, hauteurMax: 72 });
    expect(gardees.map((n) => n.note)).toEqual([60, 72]);
    expect(ecartees.map((n) => n.note)).toEqual([48, 84]);
  });

  it("le compte se referme : gardées plus écartées font le total", () => {
    for (const c of [{}, { hauteurMin: 70 }, { dureeMax: 0.1 }, { nuanceMin: 200 }]) {
      const { gardees, ecartees } = filtrerNotes(suite, c);
      expect(gardees.length + ecartees.length, JSON.stringify(c)).toBe(suite.length);
    }
  });

  it("UN CRITÈRE ABSENT NE FILTRE PAS, il ne vaut pas zéro", () => {
    // Une borne laissée vide qui vaudrait zéro écarterait tout, et le réglage qu'on n'a pas touché
    // déciderait du résultat.
    expect(filtrerNotes(suite, {}).gardees.length).toBe(4);
    expect(filtrerNotes(suite, { hauteurMin: undefined, nuanceMax: undefined }).gardees.length).toBe(4);
  });

  it("les bornes sont incluses des deux côtés", () => {
    expect(filtrerNotes(suite, { hauteurMin: 48, hauteurMax: 48 }).gardees.map((n) => n.note)).toEqual([48]);
  });

  it("filtre par durée, par nuance et par canal", () => {
    const melange = [note(60, 0, 0.25), note(62, 1, 2), note(64, 2, 0.5, 30), note(66, 3, 0.5, 90, 4)];
    expect(filtrerNotes(melange, { dureeMin: 1 }).gardees.map((n) => n.note)).toEqual([62]);
    expect(filtrerNotes(melange, { nuanceMax: 50 }).gardees.map((n) => n.note)).toEqual([64]);
    expect(filtrerNotes(melange, { canal: 4 }).gardees.map((n) => n.note)).toEqual([66]);
    expect(filtrerNotes(melange, { canal: -1 }).gardees.length).toBe(4);
  });

  it("garde les hauteurs fractionnaires telles quelles", () => {
    const micro = [note(60.5, 0), note(61.5, 1)];
    expect(filtrerNotes(micro, { hauteurMin: 61 }).gardees.map((n) => n.note)).toEqual([61.5]);
  });
});

describe("imposer un profil", () => {
  const suite = [note(60, 0), note(60, 1), note(60, 2), note(60, 3, 1)];

  it("À PLEINE FORCE, LA MÉLODIE ÉPOUSE LA COURBE, du grave à l'aigu", () => {
    // LA COURBE SE LIT AU MILIEU DE CHAQUE NOTE, et les valeurs le montrent. La suite couvre
    // quatre secondes ; la première note, de 0 à 0,5, a son milieu à 6,25 % du parcours, donc
    // 48 + 24 × 0,0625 = 49,5. La dernière, de 3 à 4, a le sien à 87,5 %, donc 69. Les deux bouts
    // de l'intervalle ne sont pas atteints, et c'est juste : aucune note ne sonne à l'instant zéro
    // ni à l'instant final, elles occupent des durées.
    const r = imposerProfil(suite, rampe(), { grave: 48, aigu: 72, force: 1 });
    expect(r[0].note).toBeCloseTo(49.5, 1);
    expect(r[3].note).toBeCloseTo(69, 0);
    for (let i = 1; i < r.length; i++) expect(r[i].note).toBeGreaterThan(r[i - 1].note);
  });

  it("À FORCE NULLE, RIEN NE CHANGE, ce qui est la compatibilité du réglage", () => {
    const r = imposerProfil(suite, rampe(), { grave: 0, aigu: 127, force: 0 });
    expect(r.map((n) => n.note)).toEqual(suite.map((n) => n.note));
  });

  it("entre les deux, le profil d'origine se déforme sans disparaître", () => {
    const monte = [note(60, 0), note(64, 1), note(67, 2)];
    const descend: Courbe = { valeurs: Float32Array.from([1, 0.5, 0]), cadence: 1 };
    const moitie = imposerProfil(monte, descend, { grave: 60, aigu: 72, force: 0.5 });
    // La mélodie montait, la courbe descend : à mi-chemin le mouvement s'aplatit sans s'inverser.
    const ecartAvant = monte[2].note - monte[0].note;
    const ecartApres = moitie[2].note - moitie[0].note;
    expect(Math.abs(ecartApres)).toBeLessThan(Math.abs(ecartAvant));
  });

  it("LE TEMPS NE BOUGE PAS : ni les débuts, ni les fins, ni les nuances", () => {
    const r = imposerProfil(suite, rampe(), { grave: 40, aigu: 90, force: 1 });
    expect(r.map((n) => n.debut)).toEqual(suite.map((n) => n.debut));
    expect(r.map((n) => n.fin)).toEqual(suite.map((n) => n.fin));
    expect(r.map((n) => n.velocite)).toEqual(suite.map((n) => n.velocite));
  });

  it("rend des hauteurs continues, et les arrondit si on le demande", () => {
    const continu = imposerProfil(suite, rampe(), { grave: 48, aigu: 72, force: 1 });
    expect(continu.some((n) => !Number.isInteger(n.note)), "une courbe donne des quarts de ton").toBe(true);
    const rond = imposerProfil(suite, rampe(), { grave: 48, aigu: 72, force: 1, arrondir: true });
    expect(rond.every((n) => Number.isInteger(n.note))).toBe(true);
  });

  it("supporte un intervalle donné à l'envers, sans rendre une mélodie muette", () => {
    const r = imposerProfil(suite, rampe(), { grave: 72, aigu: 48, force: 1 });
    expect(r.every((n) => n.note >= 48 && n.note <= 72)).toBe(true);
  });

  it("ne bute pas sur une séquence vide ni sur une courbe plate", () => {
    expect(imposerProfil([], rampe(), { grave: 0, aigu: 1, force: 1 })).toEqual([]);
    const plat = imposerProfil(suite, constante(0.5, 4), { grave: 60, aigu: 72, force: 1 });
    for (const n of plat) expect(n.note).toBeCloseTo(66, 6);
  });
});

describe("lire le profil d'une séquence", () => {
  it("SUIT LA HAUTEUR AU FIL DU TEMPS, entre zéro et un", () => {
    const monte = [note(60, 0, 1), note(72, 1, 1)];
    const c = profilDeSequence(monte, 10);
    expect(c.valeurs[2]).toBeCloseTo(0, 6);
    expect(c.valeurs[15]).toBeCloseTo(1, 6);
  });

  it("TIENT LA HAUTEUR ENTRE DEUX ATTAQUES, au lieu de glisser", () => {
    // Interpoler dessinerait un portamento qui n'a pas été joué.
    const monte = [note(60, 0, 1), note(72, 1, 1)];
    const c = profilDeSequence(monte, 10);
    for (let i = 0; i < 10; i++) expect(c.valeurs[i], `instant ${i}`).toBeCloseTo(0, 6);
  });

  it("rend une valeur médiane quand toutes les notes sont à la même hauteur", () => {
    const plat = profilDeSequence([note(60, 0, 1), note(60, 1, 1)], 10);
    expect(plat.valeurs[5]).toBeCloseTo(0.5, 6);
  });

  it("l'aller-retour se referme : un profil lu puis imposé retrouve la mélodie", () => {
    const melodie = [note(60, 0, 1), note(67, 1, 1), note(64, 2, 1), note(72, 3, 1)];
    const profil = profilDeSequence(melodie, 100);
    const refaite = imposerProfil(melodie, profil, { grave: 60, aigu: 72, force: 1 });
    refaite.forEach((n, i) => expect(n.note, `note ${i}`).toBeCloseTo(melodie[i].note, 1));
  });

  it("ne bute pas sur une séquence vide", () => {
    expect(profilDeSequence([]).valeurs.length).toBe(1);
  });
});
