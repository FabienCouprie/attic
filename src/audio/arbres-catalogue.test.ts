// audio/arbres-catalogue.test.ts — Le recensement doit tomber sur le nombre que le calcul prévoit.
import { describe, expect, it } from "vitest";

import { derouler, dureeArbre, ecrireArbre } from "./arbre-rythmique";
import { catalogueArbres, engendrerArbre, engendrerHauteurs } from "./arbres-catalogue";

/** Un hasard reproductible, pour que les essais ne dépendent pas du tirage du jour. */
function hasardFixe(graine = 1): () => number {
  let x = graine >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

const T = 60;

describe("le catalogue des arbres simples", () => {
  it("EN COMPTE 340 AVEC LES RÉGLAGES DE DÉPART, ce que le dénombrement prévoit", () => {
    // Quatre emplacements au plus, quatre parts au plus, silences compris : une note, un silence,
    // et les divisions en deux, trois et quatre font cinq formes par emplacement. Le compte est
    // 5 + 25 + 125 + 625 = 780… pour quatre emplacements. Avec trois parts au plus il est de 340,
    // et c'est le réglage retenu, la division en cinq parts appartenant déjà au tirage.
    expect(catalogueArbres({ emplacementsMax: 4, partsMax: 3 }).length).toBe(340);
  });

  it("le compte suit la formule, quels que soient les réglages", () => {
    for (const [emplacements, parts, silences] of [[3, 3, true], [4, 2, true], [4, 4, false]] as [number, number, boolean][]) {
      const formes = (silences ? 2 : 1) + (parts - 1);
      let attendu = 0;
      for (let n = 1; n <= emplacements; n++) attendu += formes ** n;
      expect(catalogueArbres({ emplacementsMax: emplacements, partsMax: parts, silences }).length,
        `${emplacements} emplacements, ${parts} parts`).toBe(attendu);
    }
  });

  it("TOUS SONT DÉROULABLES ET LE COMPTE SE REFERME sur chacun", () => {
    const tous = catalogueArbres({ emplacementsMax: 3, partsMax: 3 });
    for (const m of tous) {
      const e = derouler([m], T);
      const total = e.reduce((s, x) => s + x.duree, 0);
      // Une mesure entièrement faite de silences a une durée nulle en notes mais pas en temps :
      // le total des événements, silences compris, fait toujours la mesure.
      expect(total, ecrireArbre([m])).toBeCloseTo(dureeArbre([m], T), 9);
    }
  });

  it("AUCUN N'EST EN DOUBLE, sans quoi feuilleter reviendrait deux fois au même", () => {
    const tous = catalogueArbres({ emplacementsMax: 4, partsMax: 3 }).map((m) => ecrireArbre([m]));
    expect(new Set(tous).size).toBe(tous.length);
  });

  it("L'ORDRE NE BOUGE PAS D'UN APPEL À L'AUTRE, un numéro étant enregistré dans un graphe", () => {
    const a = catalogueArbres().map((m) => ecrireArbre([m]));
    const b = catalogueArbres().map((m) => ecrireArbre([m]));
    expect(a).toEqual(b);
    expect(a[0]).toBe("(4/4 (1))");
  });
});

describe("le tirage supervisé", () => {
  it("LA MÊME GRAINE REND LE MÊME RYTHME", () => {
    const o = { profondeur: 2, divisions: [2, 3, 5], silences: 0.2 };
    expect(ecrireArbre(engendrerArbre(o, hasardFixe(7))))
      .toBe(ecrireArbre(engendrerArbre(o, hasardFixe(7))));
  });

  it("deux graines donnent deux rythmes", () => {
    const o = { profondeur: 2, densite: 0.6 };
    expect(ecrireArbre(engendrerArbre(o, hasardFixe(1))))
      .not.toBe(ecrireArbre(engendrerArbre(o, hasardFixe(99))));
  });

  it("À PROFONDEUR NULLE, AUCUNE DIVISION, quelle que soit la densité", () => {
    const m = engendrerArbre({ profondeur: 0, densite: 1 }, hasardFixe(3));
    for (const n of m[0].contenu) expect(n.enfants).toBeUndefined();
  });

  it("n'emploie que les divisions permises", () => {
    const m = engendrerArbre({ profondeur: 2, densite: 1, divisions: [3] }, hasardFixe(5));
    const parts: number[] = [];
    const visiter = (n: any) => { if (n.enfants) { parts.push(n.enfants.length); n.enfants.forEach(visiter); } };
    m[0].contenu.forEach(visiter);
    expect(parts.length).toBeGreaterThan(0);
    expect(new Set(parts)).toEqual(new Set([3]));
  });

  it("SANS SILENCE DEMANDÉ, IL N'EN MET AUCUN", () => {
    const m = engendrerArbre({ profondeur: 1, silences: 0, emplacements: 8 }, hasardFixe(11));
    const visiter = (n: any): boolean => n.silence || (n.enfants ?? []).some(visiter);
    expect(m[0].contenu.some(visiter)).toBe(false);
  });

  it("le compte se referme sur ce qu'il tire, et sur plusieurs mesures", () => {
    const m = engendrerArbre({ profondeur: 2, mesures: 4, densite: 0.5 }, hasardFixe(21));
    expect(m).toHaveLength(4);
    const e = derouler(m, T);
    expect(e.reduce((s, x) => s + x.duree, 0)).toBeCloseTo(dureeArbre(m, T), 9);
  });
});

describe("les hauteurs tirées", () => {
  it("restent dans l'étendue demandée", () => {
    const h = engendrerHauteurs({ combien: 50, basse: 60, haute: 72 }, hasardFixe(2));
    expect(h).toHaveLength(50);
    for (const n of h) { expect(n).toBeGreaterThanOrEqual(60); expect(n).toBeLessThanOrEqual(72); }
  });

  it("NE SORTENT PAS DE LA GAMME quand on en donne une", () => {
    const majeure = [0, 2, 4, 5, 7, 9, 11];
    const h = engendrerHauteurs({ combien: 60, basse: 48, haute: 84, degres: majeure }, hasardFixe(4));
    for (const n of h) expect(majeure).toContain(((n % 12) + 12) % 12);
  });

  it("L'ÉCART MAXIMAL BRIDE LES SAUTS, sans quoi ce n'est pas une ligne mais un semis", () => {
    const h = engendrerHauteurs({ combien: 40, basse: 36, haute: 96, ecartMax: 4 }, hasardFixe(6));
    for (let i = 1; i < h.length; i++) expect(Math.abs(h[i] - h[i - 1])).toBeLessThanOrEqual(4);
  });

  it("la même graine rend les mêmes hauteurs", () => {
    const o = { combien: 12, basse: 55, haute: 79, ecartMax: 7 };
    expect(engendrerHauteurs(o, hasardFixe(8))).toEqual(engendrerHauteurs(o, hasardFixe(8)));
  });

  it("ne bute pas sur une gamme qui ne rencontre pas l'étendue", () => {
    // Une étendue d'un demi-ton et une gamme qui ne le contient pas : rien de permis.
    expect(engendrerHauteurs({ combien: 5, basse: 61, haute: 61, degres: [0] }, hasardFixe(9))).toEqual([]);
  });

  it("rend une liste vide quand on n'en demande aucune", () => {
    expect(engendrerHauteurs({ combien: 0 }, hasardFixe(1))).toEqual([]);
  });
});
