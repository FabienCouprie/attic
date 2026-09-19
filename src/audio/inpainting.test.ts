// audio/inpainting.test.ts — Reconstruire un trou se mesure, et se compare à ce qu'on aurait fait
// sans méthode.
//
// La bonne épreuve est celle de la littérature : on prend un son intact, on y creuse un trou, on
// bouche, et on compare au son de départ SUR LE TROU SEULEMENT. Et on la fait deux fois — avec
// l'interpolation autorégressive, et avec une interpolation linéaire, qui est ce qu'on ferait à la
// main. Sans ce témoin, « quarante décibels » ne voudrait rien dire.
import { describe, expect, it } from "vitest";
import {
  autocorrelation, boucherTrous, detecterTrous, interpolerLineaire, janssen,
  levinson, resoudreBande, rhoDepuisAr, sdrTrou, type Trou,
} from "./inpainting";

const SR = 16000;

function harmonique(dureeSec: number, fondamentale = 220, harmoniques = 6): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= harmoniques; h++) v += Math.sin((2 * Math.PI * fondamentale * h * i) / SR + h * 0.7) / h;
    x[i] = 0.5 * v;
  }
  return x;
}

function bruitBlanc(dureeSec: number, amplitude = 0.3, graine = 9): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  let g = graine;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; x[i] = amplitude * (g / 0x3fffffff - 1); }
  return x;
}

/** Creuse un trou : c'est ce que ferait un décrochage. */
const creuser = (x: Float32Array, t: Trou): Float32Array => {
  const y = Float32Array.from(x);
  for (let i = t.debut; i < t.debut + t.longueur; i++) y[i] = 0;
  return y;
};

/** Le témoin : l'interpolation linéaire, faite sur le signal entier. */
function temoinLineaire(x: Float32Array, trous: Trou[]): Float32Array {
  const seg = Float64Array.from(x);
  for (const t of trous) interpolerLineaire(seg, t.debut, t.longueur);
  return Float32Array.from(seg);
}

describe("le modèle autorégressif", () => {
  it("retrouve la récurrence exacte d'une sinusoïde, qui est d'ordre deux", () => {
    // x[n] = 2·cos(ω)·x[n−1] − x[n−2] : les coefficients du filtre d'erreur valent donc
    // [1, −2cos ω, 1]. C'est la raison profonde pour laquelle la méthode excelle sur une note.
    const n = 4000, f = 440;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * f * i) / SR);
    const a = levinson(autocorrelation(x, 2));
    const attendu = -2 * Math.cos((2 * Math.PI * f) / SR);
    expect(a[1]).toBeCloseTo(attendu, 2);
    expect(a[2]).toBeCloseTo(1, 2);
  });

  it("ne s'emballe pas sur du silence ni sur un segment constant", () => {
    for (const seg of [new Float64Array(500), new Float64Array(500).fill(0.3)]) {
      const a = levinson(autocorrelation(seg, 16));
      expect([...a].every(Number.isFinite)).toBe(true);
    }
  });

  it("rend une autocorrélation de filtre symétrique et positive au centre", () => {
    const a = Float64Array.from([1, -0.5, 0.2]);
    const rho = rhoDepuisAr(a);
    expect(rho[0]).toBeCloseTo(1 + 0.25 + 0.04, 10);
    expect(rho[1]).toBeCloseTo(-0.5 - 0.1, 10);
    expect(rho[2]).toBeCloseTo(0.2, 10);
  });
});

describe("le solveur bandé", () => {
  it("résout un système symétrique défini positif", () => {
    // Matrice tridiagonale [2 −1 ; −1 2 −1 ; −1 2], second membre [1, 0, 1] → solution [1, 1, 1].
    const g = 3, p = 1;
    const bande = new Float64Array(g * (p + 1));
    for (let i = 0; i < g; i++) { bande[i * 2] = 2; if (i + 1 < g) bande[i * 2 + 1] = -1; }
    const b = Float64Array.from([1, 0, 1]);
    expect(resoudreBande(bande, b, g, p)).toBe(true);
    for (const v of b) expect(v).toBeCloseTo(1, 10);
  });

  it("refuse une matrice qui n'est pas définie positive, au lieu de rendre n'importe quoi", () => {
    const bande = new Float64Array(4);
    const b = Float64Array.from([1, 1]);
    expect(resoudreBande(bande, b, 2, 1)).toBe(false);
  });
});

describe("boucher un trou", () => {
  it("FAIT BIEN MIEUX qu'une interpolation linéaire, et l'écart se chiffre", () => {
    const original = harmonique(0.5);
    const trou: Trou = { debut: 4000, longueur: 320 }; // 20 ms
    const troue = creuser(original, trou);
    const { signal, bouches, echantillons } = boucherTrous(troue, [trou]);

    const sdrTroue = sdrTrou(original, troue, [trou]);
    const sdrLineaire = sdrTrou(original, temoinLineaire(troue, [trou]), [trou]);
    const sdrJanssen = sdrTrou(original, signal, [trou]);

    expect(bouches).toBe(1);
    expect(echantillons).toBe(320);
    expect(sdrJanssen, `trou ${sdrTroue.toFixed(1)} · linéaire ${sdrLineaire.toFixed(1)} · Janssen ${sdrJanssen.toFixed(1)} dB`)
      .toBeGreaterThan(sdrLineaire + 10);
  });

  it("ne touche à rien en dehors du trou", () => {
    const original = harmonique(0.4);
    const trou: Trou = { debut: 3000, longueur: 200 };
    const { signal } = boucherTrous(creuser(original, trou), [trou]);
    for (let i = 0; i < original.length; i++) {
      if (i >= trou.debut && i < trou.debut + trou.longueur) continue;
      expect(signal[i]).toBe(original[i]);
    }
  });

  it("bouche plusieurs trous d'un même son", () => {
    const original = harmonique(0.6);
    const trous: Trou[] = [{ debut: 2000, longueur: 160 }, { debut: 5000, longueur: 240 }];
    const troue = Float32Array.from(original);
    for (const t of trous) for (let i = t.debut; i < t.debut + t.longueur; i++) troue[i] = 0;
    const r = boucherTrous(troue, trous);
    expect(r.bouches).toBe(2);
    expect(sdrTrou(original, r.signal, trous)).toBeGreaterThan(sdrTrou(original, temoinLineaire(troue, trous), trous) + 5);
  });

  it("réussit d'autant mieux que le trou est COURT, et le chiffre", () => {
    const original = harmonique(0.6);
    const gain = (longueur: number) => {
      const trou: Trou = { debut: 4000, longueur };
      const troue = creuser(original, trou);
      const { signal } = boucherTrous(troue, [trou]);
      return sdrTrou(original, signal, [trou]) - sdrTrou(original, temoinLineaire(troue, [trou]), [trou]);
    };
    const court = gain(80), moyen = gain(320), long = gain(1600);
    expect(court, `80 éch. +${court.toFixed(0)} dB · 320 +${moyen.toFixed(0)} · 1600 +${long.toFixed(0)}`)
      .toBeGreaterThan(long);
    expect(moyen).toBeGreaterThan(0);
  });

  it("renonce plutôt que de calculer une heure sur un trou démesuré", () => {
    const x = harmonique(0.5);
    const r = boucherTrous(x, [{ debut: 100, longueur: 5000 }], { trouMax: 1000 });
    expect(r.renonces).toBe(1);
    expect(r.bouches).toBe(0);
    // Et le signal ressort intact : renoncer, ce n'est pas abîmer.
    for (let i = 0; i < x.length; i++) expect(r.signal[i]).toBe(x[i]);
  });

  it("renonce quand le trou n'a pas de contexte autour de lui", () => {
    const x = harmonique(0.05);
    const r = boucherTrous(x, [{ debut: 0, longueur: 700 }], { ordre: 64 });
    expect(r.renonces).toBe(1);
  });

  it("tient sur du bruit, où il n'y a rien à modéliser — sans abîmer les alentours", () => {
    // Un bruit blanc n'est pas autorégressif : il n'y a rien à prédire, et le résultat ne peut pas
    // être bon. Ce qui compte est qu'il ne DIVERGE pas et que la reconstruction reste dans les
    // amplitudes du son.
    const original = bruitBlanc(0.4);
    const trou: Trou = { debut: 3000, longueur: 200 };
    const { signal } = boucherTrous(creuser(original, trou), [trou]);
    expect([...signal].every(Number.isFinite)).toBe(true);
    let crete = 0;
    for (let i = trou.debut; i < trou.debut + trou.longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
    expect(crete).toBeLessThan(1);
  });

  it("converge : l'alternance s'arrête d'elle-même quand le trou ne bouge plus", () => {
    const original = harmonique(0.4);
    const trou: Trou = { debut: 3000, longueur: 200 };
    const troue = creuser(original, trou);
    const seg = new Float64Array(2000);
    for (let i = 0; i < seg.length; i++) seg[i] = troue[2400 + i];
    const r = janssen(seg, 600, 200, 64, 50);
    expect(r.tours).toBeLessThan(50);
    expect(r.erreur).toBeLessThan(1e-6);
  });
});

describe("détecter les trous", () => {
  it("trouve un passage muet, et ignore les passages par zéro d'une sinusoïde", () => {
    const original = harmonique(0.4);
    const trou: Trou = { debut: 2000, longueur: 300 };
    const trouve = detecterTrous(creuser(original, trou));
    expect(trouve.length).toBe(1);
    expect(trouve[0].debut).toBe(2000);
    expect(trouve[0].longueur).toBe(300);
    // Le son intact, lui, ne contient aucun trou : ses passages par zéro sont trop courts.
    expect(detecterTrous(original).length).toBe(0);
  });

  it("ignore un silence plus court que la durée minimale", () => {
    const original = harmonique(0.3);
    const trouve = detecterTrous(creuser(original, { debut: 1000, longueur: 8 }), 1e-4, 16);
    expect(trouve.length).toBe(0);
  });
});
