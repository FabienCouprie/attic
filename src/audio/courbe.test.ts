// audio/courbe.test.ts — Les courbes de modulation, et l'invariant qui les rend sûres.
//
// L'invariant, d'abord, parce que c'est lui qui autorise à brancher une modulation sur un effet
// existant sans crainte : UN EFFET MODULÉ PAR UNE COURBE CONSTANTE DOIT RENDRE EXACTEMENT CE QUE
// REND L'EFFET ORDINAIRE au même réglage. S'il ne le rend pas, la modulation a changé autre
// chose que ce qu'elle devait.
import { describe, expect, it } from "vitest";
import {
  CADENCE, appliquerGain, constante, engendrer, estCourbe, lisser, mettreEnForme, normaliser,
  reechantillonner, suivre, valeursParametre,
} from "./courbe";

const SR = 44100;

const sinus = (freq: number, n = 8192, amp = 1) =>
  Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * freq * i / SR));

describe("l'invariant", () => {
  it("UN GAIN CONSTANT REND EXACTEMENT LA MULTIPLICATION PAR UN SCALAIRE", () => {
    const x = sinus(440, 4096, 0.7);
    const g = 0.35;
    // Le scalaire de comparaison passe par `fround` parce qu'une courbe est rangée en Float32 :
    // 0,35 y devient 0,34999999403953552, et le produit diffère alors de quatre milliardièmes
    // du produit en double précision — soit cent soixante-huit décibels sous le signal. Énoncer
    // l'invariant à la précision où il tient vaut mieux que de l'énoncer faux, et les nœuds
    // passent TOUJOURS par la courbe, y compris quand rien n'est branché : il n'existe donc
    // qu'un seul chemin de calcul, et rien à faire diverger.
    const attendu = Float32Array.from(x, (v) => v * Math.fround(g));
    const courbe = constante(g, x.length / SR);
    const obtenu = appliquerGain(x, reechantillonner(courbe, x.length));
    for (let i = 0; i < x.length; i++) expect(obtenu[i]).toBe(attendu[i]);
  });

  it("SANS COURBE BRANCHÉE, le paramètre vaut le réglage, partout", () => {
    // L'autre moitié de l'invariant : un effet n'a pas deux chemins de calcul. L'absence de
    // modulation est une courbe constante, et rien ne peut diverger de rien.
    const v = valeursParametre(null, 500, 0.42, { min: 0, max: 1 });
    expect(v.length).toBe(500);
    expect([...v].every((x) => x === Math.fround(0.42))).toBe(true);
    // Une valeur qui n'est pas une courbe non plus — un AudioBuffer branché par erreur, par ex.
    expect(valeursParametre("bonjour", 3, 7, { min: 0, max: 1 })[0]).toBe(7);
  });

  it("avec une courbe, le paramètre parcourt la plage demandée", () => {
    const v = valeursParametre(engendrer({ dureeSec: 1, forme: "rampe" }), 1000, 0, { min: 200, max: 2000 });
    expect(v[0]).toBeCloseTo(200, 1);
    expect(v[999]).toBeCloseTo(2000, 1);
  });

  it("une courbe constante reste constante après rééchantillonnage ET mise en forme", () => {
    const c = constante(0.25, 1);
    const v = mettreEnForme(reechantillonner(c, 1000), { min: 100, max: 500 });
    expect([...v].every((x) => Math.abs(x - 200) < 1e-4)).toBe(true);
  });
});

describe("la convention", () => {
  it("reconnaît une courbe d'un objet quelconque", () => {
    expect(estCourbe(constante(0.5, 1))).toBe(true);
    expect(estCourbe({ valeurs: [1, 2], cadence: 10 })).toBe(false);
    expect(estCourbe(null)).toBe(false);
    expect(estCourbe(0.5)).toBe(false);
  });

  it("une source quelconque reste entre zéro et un", () => {
    for (const forme of ["sinus", "triangle", "carre", "rampe", "logistique", "aleatoire"] as const) {
      const c = engendrer({ dureeSec: 2, forme, frequence: 3, graine: 5 });
      expect([...c.valeurs].every((v) => v >= 0 && v <= 1), forme).toBe(true);
    }
  });
});

describe("le rééchantillonnage", () => {
  it("donne la longueur demandée et garde les extrémités", () => {
    const c = { valeurs: Float32Array.from([0, 1]), cadence: 2 };
    const v = reechantillonner(c, 5);
    expect(v.length).toBe(5);
    expect(v[0]).toBeCloseTo(0, 6);
    expect(v[4]).toBeCloseTo(1, 6);
    expect(v[2]).toBeCloseTo(0.5, 6);
  });

  it("supporte une courbe d'une seule valeur", () => {
    expect([...reechantillonner({ valeurs: Float32Array.from([0.3]), cadence: 1 }, 3)])
      .toEqual([0.3, 0.3, 0.3].map((v) => Math.fround(v)));
  });

  it("supporte une courbe vide sans exploser", () => {
    expect(reechantillonner({ valeurs: new Float32Array(0), cadence: 1 }, 4).length).toBe(4);
  });
});

describe("la mise en forme", () => {
  it("traduit zéro et un dans l'unité du consommateur", () => {
    const v = mettreEnForme(Float32Array.from([0, 0.5, 1]), { min: 200, max: 4000 });
    expect(v[0]).toBeCloseTo(200, 3);
    expect(v[1]).toBeCloseTo(2100, 3);
    expect(v[2]).toBeCloseTo(4000, 3);
  });

  it("inverse quand on le demande", () => {
    const v = mettreEnForme(Float32Array.from([0, 1]), { min: 0, max: 10, inverser: true });
    expect(v[0]).toBeCloseTo(10, 6);
    expect(v[1]).toBeCloseTo(0, 6);
  });

  it("courbe la correspondance sans sortir des bornes", () => {
    const v = mettreEnForme(Float32Array.from([0, 0.5, 1]), { min: 0, max: 1, puissance: 2 });
    expect(v[1]).toBeCloseTo(0.25, 6);
    expect(v[2]).toBeCloseTo(1, 6);
  });

  it("borne une valeur qui sortirait de zéro-un", () => {
    const v = mettreEnForme(Float32Array.from([-1, 2]), { min: 0, max: 10 });
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(10);
  });
});

describe("l'inertie", () => {
  it("arrondit un saut", () => {
    const x = Float32Array.from({ length: 100 }, (_, i) => (i < 50 ? 0 : 1));
    const y = lisser(x, 0.9);
    expect(y[49]).toBeGreaterThan(0.01);
    expect(y[51]).toBeLessThan(0.99);
  });

  it("NE DÉCALE PAS la courbe, grâce à l'aller-retour", () => {
    // Un lissage à sens unique ferait s'ouvrir le filtre APRÈS la note. On vérifie que le
    // milieu du front reste au milieu.
    const x = Float32Array.from({ length: 200 }, (_, i) => (i < 100 ? 0 : 1));
    const y = lisser(x, 0.9);
    let croisement = 0;
    for (let i = 0; i < 200; i++) if (y[i] >= 0.5) { croisement = i; break; }
    expect(Math.abs(croisement - 100)).toBeLessThan(6);
  });

  it("ne touche à rien à zéro", () => {
    const x = Float32Array.from([0, 1, 0, 1]);
    expect([...lisser(x, 0)]).toEqual([...x]);
  });
});

describe("le suivi de caractéristiques", () => {
  it("l'énergie suit le geste : forte sur la note, nulle sur le silence", () => {
    const n = SR;
    const x = new Float32Array(n);
    for (let i = 0; i < n / 2; i++) x[i] = 0.8 * Math.sin(2 * Math.PI * 440 * i / SR);
    const c = suivre(x, SR, "energie");
    const q = c.valeurs.length >> 2;
    expect(c.valeurs[q]).toBeGreaterThan(0.8);
    expect(c.valeurs[3 * q]).toBeLessThan(0.2);
  });

  it("la brillance monte avec la fréquence", () => {
    const grave = suivre(sinus(200, SR), SR, "brillance");
    const aigu = suivre(sinus(5000, SR), SR, "brillance");
    // Normalisées séparément, on compare les BRUTES via un mélange : un son qui monte doit
    // donner une courbe qui monte.
    const n = SR;
    const glissando = Float32Array.from({ length: n }, (_, i) =>
      Math.sin(2 * Math.PI * (200 + 4000 * i / n) * i / SR));
    const c = suivre(glissando, SR, "brillance");
    expect(c.valeurs[c.valeurs.length - 20]).toBeGreaterThan(c.valeurs[20]);
    expect(grave.valeurs.length).toBe(aigu.valeurs.length);
  });

  it("la platitude distingue une note d'un bruit", () => {
    let g = 7;
    const bruit = Float32Array.from({ length: SR }, () => {
      g = (g * 1103515245 + 12345) & 0x7fffffff;
      return g / 0x3fffffff - 1;
    });
    // Moitié sinus, moitié bruit : la platitude doit être plus haute sur la seconde moitié.
    const x = Float32Array.from({ length: SR }, (_, i) =>
      i < SR / 2 ? Math.sin(2 * Math.PI * 440 * i / SR) : bruit[i]);
    const c = suivre(x, SR, "platitude");
    const q = c.valeurs.length >> 2;
    expect(c.valeurs[3 * q]).toBeGreaterThan(c.valeurs[q]);
  });

  it("la variation marque les attaques et retombe sur les tenues", () => {
    const n = SR;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / SR);
    // Une attaque franche au milieu.
    for (let i = n / 2; i < n / 2 + 200; i++) x[i] += 0.9;
    const c = suivre(x, SR, "variation");
    const milieu = Math.round(c.valeurs.length / 2);
    const autour = Math.max(...[...c.valeurs.slice(milieu - 3, milieu + 4)]);
    expect(autour).toBeGreaterThan(c.valeurs[milieu - 40]);
  });

  it("rend une courbe à la cadence demandée", () => {
    const c = suivre(sinus(440, SR), SR, "energie", 100);
    expect(c.cadence).toBe(100);
    expect(c.valeurs.length).toBeCloseTo(100, -1);
  });
});

describe("les sources fabriquées", () => {
  it("l'oscillateur fait le nombre de cycles demandé", () => {
    const c = engendrer({ dureeSec: 2, forme: "sinus", frequence: 3 });
    let montees = 0;
    for (let i = 1; i < c.valeurs.length; i++) {
      if (c.valeurs[i - 1] < 0.5 && c.valeurs[i] >= 0.5) montees++;
    }
    expect(montees).toBe(6);
  });

  it("la rampe va de zéro à un", () => {
    const c = engendrer({ dureeSec: 1, forme: "rampe" });
    expect(c.valeurs[0]).toBeCloseTo(0, 6);
    expect(c.valeurs[c.valeurs.length - 1]).toBeCloseTo(1, 6);
  });

  it("la logistique est reproductible et ne se répète pas en régime chaotique", () => {
    const a = engendrer({ dureeSec: 4, forme: "logistique", frequence: 8, r: 3.9 });
    const b = engendrer({ dureeSec: 4, forme: "logistique", frequence: 8, r: 3.9 });
    expect([...a.valeurs]).toEqual([...b.valeurs]);
    const distinctes = new Set([...a.valeurs].map((v) => v.toFixed(4)));
    expect(distinctes.size).toBeGreaterThan(10);
  });

  it("l'aléatoire change avec la graine", () => {
    const a = engendrer({ dureeSec: 2, forme: "aleatoire", graine: 1 });
    const b = engendrer({ dureeSec: 2, forme: "aleatoire", graine: 2 });
    expect([...a.valeurs]).not.toEqual([...b.valeurs]);
  });

  it("normaliser une suite constante rend un demi, et non une division par zéro", () => {
    expect([...normaliser(Float32Array.from([3, 3, 3]))]).toEqual([0.5, 0.5, 0.5]);
  });

  it("la cadence par défaut est celle du module", () => {
    expect(engendrer({ dureeSec: 1, forme: "rampe" }).cadence).toBe(CADENCE);
  });
});
