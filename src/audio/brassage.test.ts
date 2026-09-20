// audio/brassage.test.ts — Un moteur, quatre transformations : chacune a sa mesure.
//
// CE QUE CES TESTS CHERCHENT À TENIR. Le brassage n'a d'intérêt que si les quatre réglages font
// bien quatre choses DIFFÉRENTES, et surtout s'ils sont INDÉPENDANTS : la vitesse ne doit pas
// changer la hauteur, la transposition ne doit pas changer la durée. C'est exactement ce qu'un
// lecteur de bande ne sait pas faire, et c'est donc ce qu'il faut prouver.
import { describe, expect, it } from "vitest";
import { brasser, lireSegment, type OptionsBrassage } from "./brassage";

const SR = 44100;

const BASE: OptionsBrassage = {
  grainSec: 0.05, densite: 40, vitesse: 1, transposition: 0,
  dispersionSec: 0, dispersionDemiTons: 0, graine: 7,
};

function sinus(freq: number, dureeS: number): Float32Array {
  const n = Math.floor(SR * dureeS);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  return x;
}

/** La hauteur, mesurée en comptant les passages par zéro montants. */
function hauteur(x: Float32Array, debut: number, fin: number): number {
  let n = 0;
  for (let i = Math.max(1, debut); i < Math.min(fin, x.length); i++) {
    if (x[i - 1] <= 0 && x[i] > 0) n++;
  }
  return (n * SR) / (Math.min(fin, x.length) - Math.max(1, debut));
}

const rms = (x: Float32Array, a = 0, z = x.length) => {
  let s = 0;
  for (let i = a; i < z; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, z - a));
};

describe("lire un segment", () => {
  it("le fenêtre : il naît et meurt dans le silence, sans quoi on entendrait un clic", () => {
    const seg = lireSegment(sinus(440, 1), 1000, 512, 1);
    expect(Math.abs(seg[0])).toBeLessThan(1e-6);
    expect(Math.abs(seg[seg.length - 1])).toBeLessThan(1e-6);
    expect(Math.max(...seg)).toBeGreaterThan(0.5);
  });

  it("une position hors de la source rend du silence, sans lever", () => {
    const seg = lireSegment(sinus(440, 0.1), 1e9, 256, 1);
    expect([...seg].every((v) => v === 0)).toBe(true);
  });

  it("un rapport de hauteur de 2 lit deux fois plus loin dans la source", () => {
    const x = sinus(440, 1);
    const seg = lireSegment(x, 0, 4096, 2);
    // Le segment couvre 8192 échantillons de source en 4096 : la fréquence y est doublée.
    expect(hauteur(seg, 200, 3800)).toBeGreaterThan(700);
  });
});

describe("le brassage, réglage par réglage", () => {
  const x = sinus(440, 1);

  it("au repos, il rend une durée et un niveau comparables à la source", () => {
    const y = brasser(x, SR, BASE);
    expect(y.length).toBeGreaterThan(x.length * 0.9);
    expect(y.length).toBeLessThan(x.length * 1.1);
    expect(rms(y, SR * 0.2, SR * 0.8)).toBeGreaterThan(rms(x) * 0.5);
  });

  it("la vitesse étire sans toucher à la hauteur — ce qu'une bande ne sait pas faire", () => {
    const y = brasser(x, SR, { ...BASE, vitesse: 0.5 });
    expect(y.length).toBeGreaterThan(x.length * 1.8);
    expect(hauteur(y, SR * 0.3, SR * 1.3)).toBeGreaterThan(400);
    expect(hauteur(y, SR * 0.3, SR * 1.3)).toBeLessThan(490);
  });

  it("la vitesse comprime aussi, dans l'autre sens", () => {
    const y = brasser(x, SR, { ...BASE, vitesse: 2 });
    expect(y.length).toBeLessThan(x.length * 0.6);
  });

  it("la transposition change la hauteur sans toucher à la durée", () => {
    const y = brasser(x, SR, { ...BASE, transposition: 12 });
    expect(y.length).toBeGreaterThan(x.length * 0.9);
    expect(y.length).toBeLessThan(x.length * 1.1);
    const h = hauteur(y, SR * 0.2, SR * 0.8);
    expect(h).toBeGreaterThan(750);
    expect(h).toBeLessThan(1000);
  });

  it("descendre d'une octave marche aussi", () => {
    const h = hauteur(brasser(x, SR, { ...BASE, transposition: -12 }), SR * 0.2, SR * 0.8);
    expect(h).toBeGreaterThan(190);
    expect(h).toBeLessThan(260);
  });

  it("les deux réglages sont indépendants : étirer ET transposer", () => {
    const y = brasser(x, SR, { ...BASE, vitesse: 0.5, transposition: 12 });
    expect(y.length).toBeGreaterThan(x.length * 1.8);
    const h = hauteur(y, SR * 0.3, SR * 1.3);
    expect(h).toBeGreaterThan(750);
    expect(h).toBeLessThan(1000);
  });

  it("une densité faible laisse des trous : c'est un nuage, pas un mur", () => {
    const clairseme = brasser(x, SR, { ...BASE, densite: 6, grainSec: 0.02 });
    const dense = brasser(x, SR, { ...BASE, densite: 200, grainSec: 0.02 });
    // Le nuage clairsemé a des passages franchement plus silencieux que le mur.
    const creux = (y: Float32Array) => {
      let n = 0;
      for (let i = 0; i < y.length; i += 64) if (Math.abs(y[i]) < 1e-4) n++;
      return n / Math.ceil(y.length / 64);
    };
    expect(creux(clairseme)).toBeGreaterThan(creux(dense) + 0.1);
  });
});

describe("le tirage au sort", () => {
  const x = sinus(440, 0.6);

  it("la même graine rejoue exactement le même brassage", () => {
    const o = { ...BASE, dispersionSec: 0.1, dispersionDemiTons: 4, graine: 42 };
    expect([...brasser(x, SR, o)]).toEqual([...brasser(x, SR, o)]);
  });

  it("deux graines donnent deux résultats différents", () => {
    const o = { ...BASE, dispersionSec: 0.1, dispersionDemiTons: 4 };
    const a = brasser(x, SR, { ...o, graine: 1 });
    const b = brasser(x, SR, { ...o, graine: 2 });
    let differents = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i] - b[i]) > 1e-6) differents++;
    expect(differents).toBeGreaterThan(a.length * 0.5);
  });

  it("sans dispersion, la graine ne change rien — rien n'est tiré au sort", () => {
    const a = brasser(x, SR, { ...BASE, graine: 1 });
    const b = brasser(x, SR, { ...BASE, graine: 999 });
    expect([...a]).toEqual([...b]);
  });

  it("une forte dispersion de position brouille l'ordre des choses", () => {
    // Une source dont la première moitié est muette : brouillée, du son doit remonter au début.
    const y = new Float32Array(SR);
    for (let i = SR / 2; i < SR; i++) y[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
    // La dispersion doit DÉPASSER la distance à couvrir : à ±0,5 s, un grain du tout début atteint
    // au mieux l'instant 0,5 s, c'est-à-dire la frontière exacte du silence — et rien ne remonte.
    const brouille = brasser(y, SR, { ...BASE, dispersionSec: 0.9, graine: 3 });
    expect(rms(brouille, 0, SR * 0.3)).toBeGreaterThan(rms(y, 0, SR * 0.3) + 0.01);
  });
});

describe("les bords", () => {
  it("une source vide ne fait pas échouer le moteur", () => {
    expect(() => brasser(new Float32Array(0), SR, BASE)).not.toThrow();
  });

  it("une vitesse nulle est ramenée à la borne, et ne demande pas soixante-dix gigaoctets", () => {
    // Le premier jet remplaçait zéro par 10⁻⁶, ce qui demandait deux cent mille secondes de sortie
    // pour deux dixièmes de seconde d'entrée : le processus mourait. C'est ce test qui l'a trouvé.
    const y = brasser(sinus(440, 0.2), SR, { ...BASE, vitesse: 0 });
    expect([...y].every(Number.isFinite)).toBe(true);
    expect(y.length).toBe(Math.round(0.2 * SR / 0.01)); // cent fois plus long, pas davantage
  });

  it("une vitesse démesurée est bornée elle aussi", () => {
    const y = brasser(sinus(440, 2), SR, { ...BASE, vitesse: 1e9 });
    expect(y.length).toBeGreaterThan(0);
    expect(y.length).toBe(Math.round(2 * SR / 100));
  });

  it("une durée imposée est respectée", () => {
    const y = brasser(sinus(440, 0.5), SR, { ...BASE, dureeSec: 2 });
    expect(y.length).toBe(Math.round(2 * SR));
  });

  it("le son rendu ne contient ni NaN ni infini, même aux réglages extrêmes", () => {
    const y = brasser(sinus(440, 0.3), SR, {
      ...BASE, grainSec: 0.001, densite: 500, vitesse: 0.1,
      transposition: 24, dispersionSec: 2, dispersionDemiTons: 24,
    });
    expect([...y].every(Number.isFinite)).toBe(true);
  });
});
