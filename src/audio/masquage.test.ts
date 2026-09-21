// audio/masquage.test.ts — Ce qu'une piste cache dans une autre.
//
// LE TEST QUI PORTE TOUT LE MODÈLE est celui de l'asymétrie : un son masque beaucoup plus vers
// l'aigu que vers le grave. Si cela ne tient pas, le nœud dira que la grosse caisse mange les
// cymbales, et l'on corrigera un mixage dans le mauvais sens.
import { describe, expect, it } from "vitest";
import {
  NB_BANDES, bandesCritiques, bark, enDecibels, etalement, masquageParBande, proportionMasquee,
  seuilMasquage,
} from "./masquage";

/** Un spectre où une seule bande porte de l'énergie. */
function uneBande(b: number, energie: number): Float64Array {
  const x = new Float64Array(NB_BANDES);
  x[b] = energie;
  return x;
}

describe("l'échelle des bandes critiques", () => {
  it("part de zéro et monte avec la fréquence", () => {
    expect(bark(0)).toBeCloseTo(0, 6);
    expect(bark(500)).toBeGreaterThan(bark(100));
    expect(bark(5000)).toBeGreaterThan(bark(500));
  });

  it("couvre l'audible : 15 kHz tombe vers la vingt-quatrième bande", () => {
    expect(bark(15500)).toBeGreaterThan(20);
    expect(bark(15500)).toBeLessThan(26);
  });

  it("LES BANDES S'ÉLARGISSENT AVEC LA FRÉQUENCE — c'est pourquoi une tierce grave sonne trouble", () => {
    // Cent hertz d'écart valent près d'une bande entière dans le grave, presque rien dans l'aigu.
    const bas = bark(200) - bark(100);
    const haut = bark(5100) - bark(5000);
    expect(bas).toBeGreaterThan(haut * 3);
  });

  it("une fréquence négative ne casse rien", () => {
    expect(bark(-100)).toBe(0);
  });
});

describe("la fonction d'étalement", () => {
  it("ne masque jamais plus fort que le masquant lui-même", () => {
    for (let dz = -10; dz <= 10; dz += 0.5) expect(etalement(dz)).toBeLessThanOrEqual(0.5);
  });

  it("ELLE EST ASYMÉTRIQUE : un son masque plus vers l'aigu que vers le grave", () => {
    expect(etalement(1)).toBeGreaterThan(etalement(-1));
    expect(etalement(2)).toBeGreaterThan(etalement(-2));
    expect(etalement(3)).toBeGreaterThan(etalement(-3));
  });

  it("elle culmine sur le masquant lui-même", () => {
    expect(etalement(0)).toBeCloseTo(0, 1);
  });

  it("les valeurs sont celles-ci, et non les pentes asymptotiques", () => {
    // La confusion à ne pas faire, et que j'avais faite dans l'en-tête : les « dix décibels par
    // bande vers l'aigu, vingt-cinq vers le grave » sont les pentes LOIN du masquant. Près du
    // sommet, la courbure les adoucit beaucoup.
    expect(etalement(1)).toBeCloseTo(-4.3, 1);
    expect(etalement(-1)).toBeCloseTo(-7.9, 1);
    expect(etalement(3)).toBeCloseTo(-21.4, 0);
    expect(etalement(-3)).toBeCloseTo(-50.7, 0);
  });

  it("et l'écart entre les deux côtés se creuse avec la distance", () => {
    const ecart = (d: number) => etalement(d) - etalement(-d);
    expect(ecart(3)).toBeGreaterThan(ecart(1));
    expect(ecart(6)).toBeGreaterThan(ecart(3));
  });

  it("elle décroît de part et d'autre de son maximum", () => {
    expect(etalement(5)).toBeLessThan(etalement(2));
    expect(etalement(-5)).toBeLessThan(etalement(-2));
  });
});

describe("répartir un spectre en bandes", () => {
  it("un partiel grave tombe dans une bande basse, un partiel aigu dans une haute", () => {
    const m = new Float64Array(1024);
    m[5] = 1; // ≈ 215 Hz à 44100/2048
    const grave = bandesCritiques(m, 44100, 2048);
    const n = new Float64Array(1024);
    n[400] = 1; // ≈ 8,6 kHz
    const aigu = bandesCritiques(n, 44100, 2048);
    expect(grave.findIndex((v) => v > 0)).toBeLessThan(aigu.findIndex((v) => v > 0));
  });

  it("elle somme les ÉNERGIES : deux partiels d'une bande valent la somme de leurs carrés", () => {
    const m = new Float64Array(1024);
    m[5] = 3; m[6] = 4;
    const b = bandesCritiques(m, 44100, 2048);
    expect(Math.max(...b)).toBeCloseTo(25, 6);
  });

  it("un spectre vide donne des bandes vides", () => {
    expect([...bandesCritiques(new Float64Array(1024), 44100, 2048)].every((v) => v === 0)).toBe(true);
  });
});

describe("les décibels", () => {
  it("une énergie unité vaut zéro décibel", () => {
    expect(enDecibels(1)).toBeCloseTo(0, 10);
  });

  it("dix fois plus d'énergie vaut dix décibels de plus", () => {
    expect(enDecibels(10) - enDecibels(1)).toBeCloseTo(10, 10);
  });

  it("le silence tombe sur le plancher, sans donner moins l'infini", () => {
    expect(enDecibels(0)).toBe(-120);
    expect(Number.isFinite(enDecibels(0))).toBe(true);
  });
});

describe("le seuil de masquage", () => {
  it("il est le plus haut juste au-dessus du masquant", () => {
    const seuils = seuilMasquage(uneBande(10, 1), 0);
    const plusHaut = seuils.indexOf(Math.max(...seuils));
    expect(plusHaut).toBeGreaterThanOrEqual(10);
    expect(plusHaut).toBeLessThanOrEqual(11);
  });

  it("IL DESCEND PLUS VITE VERS LE GRAVE QUE VERS L'AIGU", () => {
    const s = seuilMasquage(uneBande(12, 1), 0);
    expect(s[15]).toBeGreaterThan(s[9]); // trois bandes au-dessus contre trois en dessous
  });

  it("l'offset abaisse tout le seuil d'autant", () => {
    const sans = seuilMasquage(uneBande(10, 1), 0);
    const avec = seuilMasquage(uneBande(10, 1), 12);
    for (let b = 0; b < NB_BANDES; b++) expect(sans[b] - avec[b]).toBeCloseTo(12, 8);
  });

  it("un masquant silencieux ne masque rien", () => {
    const s = seuilMasquage(new Float64Array(NB_BANDES), 0);
    expect(Math.max(...s)).toBeLessThan(-100);
  });
});

describe("ce qui est caché", () => {
  it("un son faible sous un masquant fort, dans la même bande, est masqué", () => {
    const par = masquageParBande(uneBande(10, 0.001), uneBande(10, 1), 6);
    expect(par[10].enfouiDb).toBeGreaterThan(0);
  });

  it("le même son, si le masquant est faible, ne l'est pas", () => {
    const par = masquageParBande(uneBande(10, 0.001), uneBande(10, 0.0001), 6);
    expect(par[10].enfouiDb).toBeLessThan(0);
  });

  it("UN SON PLACÉ AU-DESSUS DU MASQUANT EST PLUS EXPOSÉ QU'UN SON PLACÉ EN DESSOUS", () => {
    // Le même son faible, à trois bandes au-dessus puis à trois bandes en dessous du masquant.
    const masquant = uneBande(12, 1);
    const dessus = masquageParBande(uneBande(15, 0.001), masquant, 6)[15].enfouiDb;
    const dessous = masquageParBande(uneBande(9, 0.001), masquant, 6)[9].enfouiDb;
    expect(dessus).toBeGreaterThan(dessous);
  });

  it("un masquant très éloigné ne cache plus rien", () => {
    const par = masquageParBande(uneBande(20, 0.001), uneBande(2, 1), 6);
    expect(par[20].enfouiDb).toBeLessThan(0);
  });

  it("la proportion vaut zéro quand rien n'est caché, un quand tout l'est", () => {
    expect(proportionMasquee(uneBande(10, 1), new Float64Array(NB_BANDES), 6)).toBe(0);
    expect(proportionMasquee(uneBande(10, 1e-8), uneBande(10, 1), 6)).toBe(1);
  });

  it("LES BANDES VIDES NE COMPTENT PAS : le silence n'est pas masqué, il est silencieux", () => {
    // Un son sur une seule bande, hors de portée du masquant : rien n'est caché, et les
    // vingt-trois bandes vides ne doivent pas faire monter le chiffre.
    expect(proportionMasquee(uneBande(20, 1), uneBande(2, 1), 6)).toBe(0);
  });

  it("elle se tient entre les deux quand une partie seulement est cachée", () => {
    const masque = new Float64Array(NB_BANDES);
    masque[12] = 1e-8;  // juste à côté du masquant : caché
    masque[22] = 1;     // très loin : audible
    const p = proportionMasquee(masque, uneBande(12, 1), 6);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it("deux sons vides ne font pas diviser par zéro", () => {
    expect(proportionMasquee(new Float64Array(NB_BANDES), new Float64Array(NB_BANDES), 6)).toBe(0);
  });
});
