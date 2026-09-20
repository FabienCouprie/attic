// audio/rythme-analyse.test.ts — Les mesures de Toussaint, éprouvées sur les rythmes qu'il cite.
//
// LES VALEURS DE RÉFÉRENCE NE SONT PAS INVENTÉES : ce sont les rythmes que « The Geometry of
// Musical Rhythm » prend en exemple — la clave son, le tresillo, le bossa-nova, la rumba —, avec
// leurs propriétés telles qu'il les établit. Un test qui se contenterait de vérifier que le code
// est d'accord avec lui-même ne prouverait rien.
import { describe, expect, it } from "vitest";
import {
  analyserRythme, bracelet, collier, contretemps, distanceEchange, enCases, estProfond,
  histogrammeDistances, intervallesSuccessifs, rythme, uniformite,
} from "./rythme-analyse";
import { motifEuclidien } from "./euclidien";

/** La clave son : x . . x . . x . . . x . x . . . — le rythme le plus répandu du monde. */
const CLAVE_SON = rythme([0, 3, 6, 10, 12], 16);
/** Le tresillo : x . . x . . x . — la moitié de la clave. */
const TRESILLO = rythme([0, 3, 6], 8);
/** Le bossa-nova : x . . x . . x . . . x . . x . . */
const BOSSA = rythme([0, 3, 6, 10, 13], 16);
/** Quatre temps réguliers : le rythme le plus uniforme qui soit. */
const REGULIER = rythme([0, 4, 8, 12], 16);

describe("écrire un rythme", () => {
  it("la clave son s'écrit comme on l'écrit", () => {
    expect(enCases(CLAVE_SON)).toBe("x..x..x...x.x...");
  });

  it("les positions sont ramenées dans le cycle, triées et dédoublonnées", () => {
    expect(rythme([16, 3, 3, -1, 0], 16).positions).toEqual([0, 3, 15]);
  });

  it("les intervalles de la clave son sont 3-3-4-2-4, et ils bouclent", () => {
    expect(intervallesSuccessifs(CLAVE_SON)).toEqual([3, 3, 4, 2, 4]);
    expect(intervallesSuccessifs(CLAVE_SON).reduce((a, b) => a + b, 0)).toBe(16);
  });

  it("le tresillo fait 3-3-2", () => {
    expect(intervallesSuccessifs(TRESILLO)).toEqual([3, 3, 2]);
  });

  it("un rythme vide n'a pas d'intervalle", () => {
    expect(intervallesSuccessifs(rythme([], 16))).toEqual([]);
  });
});

describe("l'histogramme des distances", () => {
  it("compte toutes les paires, et pas une de plus", () => {
    const h = histogrammeDistances(CLAVE_SON);
    const k = CLAVE_SON.positions.length;
    expect(h.reduce((a, b) => a + b, 0)).toBe((k * (k - 1)) / 2);
  });

  it("mesure par le plus court chemin : sur le cercle, 13 vaut 3", () => {
    // Deux frappes distantes de 13 sur 16 cases sont à 3 l'une de l'autre en reculant.
    const h = histogrammeDistances(rythme([0, 13], 16));
    expect(h[2]).toBe(1); // distance 3, à l'indice 2 puisque l'histogramme commence à 1
  });

  it("le rythme régulier n'a que deux distances", () => {
    expect(histogrammeDistances(REGULIER).filter((x) => x > 0).length).toBe(2);
  });
});

describe("les rythmes profonds", () => {
  it("le tresillo est profond : chaque écart a sa propre rareté", () => {
    expect(estProfond(TRESILLO)).toBe(true);
  });

  it("le rythme régulier ne l'est pas : ses écarts se répètent également", () => {
    expect(estProfond(REGULIER)).toBe(false);
  });

  it("un rythme d'une seule frappe n'est pas profond — il n'a aucun écart", () => {
    expect(estProfond(rythme([0], 16))).toBe(false);
  });
});

describe("colliers et bracelets", () => {
  it("un rythme et ses rotations ont le même collier", () => {
    const tourne = rythme(CLAVE_SON.positions.map((p) => p + 5), 16);
    expect(collier(tourne)).toBe(collier(CLAVE_SON));
    expect(enCases(tourne)).not.toBe(enCases(CLAVE_SON)); // ils s'écrivent pourtant autrement
  });

  it("un rythme et son reflet ont toujours le même bracelet", () => {
    const miroir = rythme(CLAVE_SON.positions.map((p) => (16 - p) % 16), 16);
    expect(bracelet(miroir)).toBe(bracelet(CLAVE_SON));
  });

  it("sur un rythme SANS symétrie, le reflet change le collier mais pas le bracelet", () => {
    // La clave son ne convient pas pour le montrer : ses intervalles 3-3-4-2-4 lus à l'envers
    // donnent 4-2-4-3-3, qui en est une rotation — son reflet est donc elle-même, jouée d'ailleurs,
    // et les deux colliers coïncident. Il faut un rythme dont les intervalles ne sont pas un
    // palindrome circulaire : 1-3-4, lu à l'envers, donne 4-3-1, qui n'en est pas une rotation.
    const asymetrique = rythme([0, 1, 4], 8);
    const miroir = rythme(asymetrique.positions.map((p) => (8 - p) % 8), 8);
    expect(collier(miroir)).not.toBe(collier(asymetrique));
    expect(bracelet(miroir)).toBe(bracelet(asymetrique));
  });

  it("le collier commence par la plus longue file de cases vides possible", () => {
    expect(collier(rythme([0, 1, 2], 8))).toBe(".....xxx");
  });
});

describe("l'uniformité", () => {
  it("le rythme parfaitement régulier vaut un", () => {
    expect(uniformite(REGULIER)).toBeCloseTo(1, 10);
  });

  it("trois frappes serrées valent beaucoup moins", () => {
    expect(uniformite(rythme([0, 1, 2], 16))).toBeLessThan(0.4);
  });

  it("LE RYTHME EUCLIDIEN EST LE PLUS UNIFORME de ceux qui ont ses effectifs", () => {
    // La propriété que Toussaint démontre : E(5,16) maximise l'écartement. On le compare à
    // toutes les façons de poser cinq frappes sur seize cases qu'on peut essayer en un instant.
    const euclid = rythme(motifEuclidien(16, 5).map((v, i) => (v ? i : -1)).filter((i) => i >= 0), 16);
    const reference = uniformite(euclid);
    let pire = 0;
    for (let essai = 0; essai < 400; essai++) {
      const pos = new Set<number>();
      let g = essai * 7919 + 13;
      // LES BITS DE POIDS FORT, et non `g % 16`. Les bits de poids faible d'un générateur
      // congruentiel ont une période minuscule — ici quatre valeurs — si bien que l'ensemble
      // n'atteignait jamais cinq positions distinctes et que la boucle tournait sans fin.
      while (pos.size < 5) {
        g = (g * 1103515245 + 12345) & 0x7fffffff;
        pos.add(Math.floor((g / 0x80000000) * 16));
      }
      pire = Math.max(pire, uniformite(rythme([...pos], 16)));
    }
    expect(reference).toBeGreaterThanOrEqual(pire - 1e-9);
  });

  it("un rythme d'une frappe ou moins vaut un, faute de paire à mesurer", () => {
    expect(uniformite(rythme([3], 16))).toBe(1);
    expect(uniformite(rythme([], 16))).toBe(1);
  });
});

describe("les contretemps", () => {
  it("le rythme régulier n'en a aucun : il tombe sur toutes les subdivisions", () => {
    expect(contretemps(REGULIER)).toEqual([]);
  });

  it("la clave son en a, et ce sont ses frappes impaires", () => {
    // Sur seize cases, les positions sur le temps sont les multiples de 16/k pour k divisant 16 :
    // 0, 1, 2, 4, 8 — donc toutes les positions paires, plus la 1.
    const ct = contretemps(CLAVE_SON);
    expect(ct.length).toBeGreaterThan(0);
    expect(ct.every((p) => p % 2 === 1 || p === 0)).toBe(true);
  });

  it("le tresillo en a une, la frappe à 3", () => {
    expect(contretemps(TRESILLO)).toEqual([3]);
  });
});

describe("la distance d'échange", () => {
  it("un rythme est à zéro de lui-même", () => {
    expect(distanceEchange(CLAVE_SON, CLAVE_SON)).toBe(0);
  });

  it("une rotation ne coûte rien : c'est le même rythme, compté d'ailleurs", () => {
    const tourne = rythme(CLAVE_SON.positions.map((p) => p + 4), 16);
    expect(distanceEchange(CLAVE_SON, tourne)).toBe(0);
  });

  it("déplacer une frappe d'une case coûte un", () => {
    expect(distanceEchange(rythme([0, 4, 8, 12], 16), rythme([0, 4, 9, 12], 16))).toBe(1);
  });

  it("deux rythmes de tailles différentes ne se comparent pas", () => {
    expect(distanceEchange(CLAVE_SON, TRESILLO)).toBe(Infinity);
    expect(distanceEchange(CLAVE_SON, rythme([0, 4], 16))).toBe(Infinity);
  });
});

describe("l'analyse complète", () => {
  const analyse = (r: ReturnType<typeof rythme>) =>
    analyserRythme(r, motifEuclidien(r.pas, r.positions.length));

  it("le tresillo EST le rythme euclidien de trois frappes sur huit", () => {
    const a = analyse(TRESILLO);
    expect(a.estEuclidien).toBe(true);
    expect(a.distanceEuclidien).toBe(0);
  });

  it("la clave son n'est pas euclidienne, mais elle en est proche", () => {
    const a = analyse(CLAVE_SON);
    expect(a.estEuclidien).toBe(false);
    expect(a.distanceEuclidien).toBeGreaterThan(0);
    expect(a.distanceEuclidien).toBeLessThanOrEqual(2);
  });

  it("elle rend toutes les mesures d'un coup, et elles se tiennent", () => {
    const a = analyse(CLAVE_SON);
    expect(a.cases).toBe("x..x..x...x.x...");
    expect(a.intervalles).toEqual([3, 3, 4, 2, 4]);
    expect(a.uniformite).toBeGreaterThan(0.9);
    expect(a.collier.length).toBe(16);
    expect(a.euclidien.length).toBe(16);
  });

  it("le bossa-nova, que Toussaint donne comme euclidien, l'est", () => {
    expect(analyse(BOSSA).estEuclidien).toBe(true);
  });
});
