// audio/clavier-isomorphe.test.ts — Le réseau joue des degrés, et la même forme partout.
//
// CE QUI SE MESURE ICI. L'isomorphisme n'est pas une impression mais une égalité : un même
// déplacement de colonnes et de rangées doit rendre le MÊME intervalle en cents, où qu'on parte et
// quel que soit l'accordage. C'est le premier cas, et c'est la propriété qui donne son nom à ces
// claviers — sans elle, ce dessin n'est qu'une grille.
//
// LE CAS DE NEUTRALITÉ COMPTE AUTANT : un accordage à douze degrés égaux doit rendre un réseau dont
// les hauteurs sont EXACTEMENT celles du clavier ordinaire, sans quoi poser un accordage déplacerait
// le son sans qu'on l'ait demandé.
import { describe, expect, it } from "vitest";

import { accordageDepuisCents, accordageEgal, degrePlusProche, CENTS_PAR_OCTAVE } from "./accordage";
import {
  CASES, RANGEES, etendue, reseau, sautDeRangee, tableDuReseau,
} from "./clavier-isomorphe";

// La période et la référence sont celles par défaut : l'octave, et le do central. Les écrire
// serait les répéter, et les répéter les ferait vieillir.
const DOUZE = accordageEgal(12);
const DIX_NEUF = accordageEgal(19);
const TRENTE_ET_UN = accordageEgal(31);

/** Les cents entre deux cases, pour comparer des intervalles plutôt que des hauteurs. */
const cents = (a: { note: number }, b: { note: number }) => (b.note - a.note) * 100;

describe("le réseau d'un clavier isomorphe", () => {
  it("compte quarante et une cases, une par touche des quatre rangées", () => {
    expect(CASES).toBe(41);
    expect(reseau(DOUZE, 7)).toHaveLength(41);
    expect(RANGEES.map((r) => r.length)).toEqual([10, 11, 10, 10]);
  });

  // ─── La propriété qui donne son nom au clavier ───
  //
  // LES DÉPLACEMENTS SONT PLUSIEURS, ET C'EST UN DÉFAUT PLANTÉ QUI L'A EXIGÉ. Ce cas ne mesurait
  // d'abord que « deux colonnes à droite, une rangée en haut » : en ajoutant `colonne % 2` au rang,
  // le réseau cesse d'être isomorphe et ce cas restait VERT, un déplacement de deux colonnes ne
  // changeant pas la parité. Un seul déplacement ne peut pas voir un artefact de sa propre période.
  const DEPLACEMENTS = [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 2], [5, 1]] as const;

  it("UN MÊME DÉPLACEMENT REND LE MÊME INTERVALLE, où qu'on parte", () => {
    for (const a of [DOUZE, DIX_NEUF, TRENTE_ET_UN]) {
      const saut = sautDeRangee(a, "quinte");
      const cases = reseau(a, saut);
      const par = new Map(cases.map((c) => [`${c.colonne},${c.rangee}`, c]));
      for (const [dc, dr] of DEPLACEMENTS) {
        const mesures: number[] = [];
        for (const c of cases) {
          const vers = par.get(`${c.colonne + dc},${c.rangee + dr}`);
          if (vers) mesures.push(Math.round(cents(c, vers) * 1e6) / 1e6);
        }
        expect(mesures.length, `${dc},${dr} doit se mesurer plusieurs fois`).toBeGreaterThan(5);
        expect(new Set(mesures).size,
          `${a.degres.length} degrés, déplacement ${dc} colonnes et ${dr} rangées : un seul intervalle attendu, `
          + `vus ${[...new Set(mesures)].join(", ")}`).toBe(1);
      }
    }
  });

  // ─── La neutralité ───
  it("DOUZE DEGRÉS ÉGAUX RENDENT EXACTEMENT LES DEMI-TONS, sans écart d'un millième", () => {
    const cases = reseau(DOUZE, sautDeRangee(DOUZE, "quinte"));
    for (const c of cases) {
      expect(c.note).toBe(60 + c.rang);
      expect(Number.isInteger(c.note)).toBe(true);
    }
  });

  it("la quinte d'un tempérament égal est le degré que la littérature lui donne", () => {
    expect(sautDeRangee(DOUZE, "quinte")).toBe(7);
    expect(sautDeRangee(DIX_NEUF, "quinte")).toBe(11);
    expect(sautDeRangee(TRENTE_ET_UN, "quinte")).toBe(18);
    // Et les autres cibles, sur douze degrés : la quarte et la tierce majeure.
    expect(sautDeRangee(DOUZE, "quarte")).toBe(5);
    expect(sautDeRangee(DOUZE, "tierce")).toBe(4);
    // « Un degré » ne consulte pas l'accordage : les rangées prolongent les colonnes.
    expect(sautDeRangee(DIX_NEUF, "degre")).toBe(1);
  });

  it("un accordage trop grossier pour porter une quinte garde un saut d'un degré", () => {
    // LA CONDITION EXACTE A ÉTÉ TROUVÉE PAR UN DÉFAUT PLANTÉ, et elle n'est pas celle que j'avais
    // écrite. Un tempérament à deux degrés par octave ne suffit pas : son tritonus est à 600 cents,
    // soit cent deux cents de la quinte juste, quand la tonique en est à sept cent deux. Le degré
    // le plus proche y vaut donc UN, et retirer la borne ne changeait rien.
    expect(sautDeRangee(accordageEgal(2), "quinte")).toBe(1);
    // Il faut une PÉRIODE qui dépasse le double de la quinte, sans aucun degré entre les deux : la
    // tonique devient alors plus proche que la fin du tour, le degré le plus proche vaut ZÉRO, et un
    // saut nul empilerait les quatre rangées exactement l'une sur l'autre.
    const grossier = accordageDepuisCents([0], 2400, 60);
    expect(degrePlusProche(grossier, grossier.reference + 7.02).rang).toBe(0);
    expect(sautDeRangee(grossier, "quinte")).toBe(1);
    // Et le réseau garde alors quatre rangées distinctes.
    const cases = reseau(grossier, sautDeRangee(grossier, "quinte"));
    const parRangee = [0, 1, 2, 3].map((r) => cases.find((c) => c.rangee === r && c.colonne === 0)!.rang);
    expect(new Set(parRangee).size).toBe(4);
  });

  it("la case en bas à gauche est la tonique, et le déplacement la déplace d'un tour", () => {
    const base = reseau(DIX_NEUF, 11);
    expect(base[0].rang).toBe(0);
    expect(base[0].tonique).toBe(true);
    expect(base[0].note).toBe(60);
    // Un tour plus haut : dix-neuf degrés, soit exactement une octave.
    const monte = reseau(DIX_NEUF, 11, 19);
    expect(monte[0].rang).toBe(19);
    expect(monte[0].tonique).toBe(true);
    expect(monte[0].note).toBeCloseTo(72, 10);
    // Et un tour plus bas, où les rangs descendent sous la tonique.
    const descend = reseau(DIX_NEUF, 11, -19);
    expect(descend[0].rang).toBe(-19);
    expect(descend[0].note).toBeCloseTo(48, 10);
  });

  it("les toniques tombent tous les n degrés, et pas ailleurs", () => {
    const cases = reseau(DIX_NEUF, 11);
    for (const c of cases) {
      expect(c.tonique, `rang ${c.rang}`).toBe(((c.rang % 19) + 19) % 19 === 0);
    }
    expect(cases.filter((c) => c.tonique).length).toBeGreaterThan(0);
  });

  it("la table des touches donne la hauteur de chaque position, et rien d'autre", () => {
    const cases = reseau(DOUZE, 7);
    const table = tableDuReseau(cases);
    expect(table.size).toBe(41);
    expect(table.get("KeyZ")).toBe(60);
    expect(table.get("KeyA")).toBe(67);
    expect(table.get("KeyQ")).toBe(74);
    expect(table.get("Digit1")).toBe(81);
    expect(table.get("Space")).toBeUndefined();
  });

  it("une échelle inégale garde ses écarts, et c'est ce qu'un piano ne peut pas faire", () => {
    // Un maqam approché : des degrés qui ne sont pas également espacés.
    const inegal = accordageDepuisCents([0, 150, 300, 500, 700, 850, 1000], CENTS_PAR_OCTAVE, 60);
    const cases = reseau(inegal, sautDeRangee(inegal, "quinte"));
    const rangee = cases.filter((c) => c.rangee === 0).slice(0, 7);
    const ecarts = rangee.slice(1).map((c, i) => Math.round(cents(rangee[i], c)));
    expect(ecarts).toEqual([150, 150, 200, 200, 150, 150]);
    // Et aucun de ces écarts n'est un demi-ton tempéré.
    expect(ecarts.every((e) => e !== 100)).toBe(true);
  });

  it("l'étendue se rétrécit quand l'accordage compte plus de degrés", () => {
    const douze = etendue(DOUZE, sautDeRangee(DOUZE, "quinte"));
    const dixNeuf = etendue(DIX_NEUF, sautDeRangee(DIX_NEUF, "quinte"));
    const trenteUn = etendue(TRENTE_ET_UN, sautDeRangee(TRENTE_ET_UN, "quinte"));
    expect(douze.degres).toBe(31);
    expect(douze.periodes).toBeCloseTo(30 / 12, 6);
    expect(dixNeuf.degres).toBe(43);
    expect(dixNeuf.periodes).toBeCloseTo(42 / 19, 6);
    // Plus de degrés par période, moins de périodes sous les doigts.
    expect(trenteUn.periodes).toBeLessThan(dixNeuf.periodes);
    expect(dixNeuf.periodes).toBeLessThan(douze.periodes);
  });
});
