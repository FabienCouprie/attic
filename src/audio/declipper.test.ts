// audio/declipper.test.ts — Réparer un écrêtage se mesure, en décibels.
//
// La bonne épreuve est celle du panorama de Záviška et al. : on prend un son intact, on l'écrête
// soi-même, on répare, et on compare au son de départ — SUR LES ÉCHANTILLONS ÉCRÊTÉS SEULEMENT.
// Calculer le rapport sur tout le signal ne dirait rien : un son écrêté à 0,8 est juste à 95 % de
// ses échantillons, et le rapport afficherait vingt-cinq décibels avant toute réparation.
import { describe, expect, it } from "vitest";
import { compterEcretes, declipper, devinerSeuil, estEcrete, sdrEcretes, seuilDur } from "./declipper";

const SR = 16000;

/** Un son harmonique, donc parcimonieux en fréquence : c'est l'hypothèse de l'algorithme. */
function sonHarmonique(dureeSec: number, fondamentale = 220, harmoniques = 5): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= harmoniques; h++) v += Math.sin((2 * Math.PI * fondamentale * h * i) / SR + h) / h;
    x[i] = v / 1.8;
  }
  // Normalisé à 0,95 pour que l'écrêtage à 0,5 coupe vraiment quelque chose.
  let crete = 0; for (const v of x) crete = Math.max(crete, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] = (x[i] / crete) * 0.95;
  return x;
}

const ecreter = (x: Float32Array, seuil: number): Float32Array =>
  Float32Array.from(x, (v) => Math.max(-seuil, Math.min(seuil, v)));

describe("deviner le seuil", () => {
  it("reconnaît le plateau d'un son écrêté", () => {
    const x = ecreter(sonHarmonique(0.3), 0.6);
    expect(devinerSeuil(x)).toBeCloseTo(0.6, 2);
  });

  it("ne voit pas d'écrêtage là où il n'y en a pas", () => {
    const x = sonHarmonique(0.3);
    // La crête d'un son intact n'est atteinte qu'une fois : rien à réparer.
    expect(compterEcretes(x, devinerSeuil(x))).toBeLessThan(10);
  });

  it("ne s'effondre pas sur du silence", () => {
    expect(devinerSeuil(new Float32Array(1000))).toBe(1);
  });
});

describe("le seuillage dur", () => {
  it("garde les raies les plus fortes et jette les autres", () => {
    const N = 16;
    const re = new Float64Array(N), im = new Float64Array(N);
    re[3] = 5; re[13] = 5;   // une paire conjuguée forte
    re[5] = 1; re[11] = 1;   // une paire faible
    seuilDur(re, im, 1);
    expect(re[3]).toBe(5);
    expect(re[13]).toBe(5);  // le miroir suit son jumeau
    expect(re[5]).toBe(0);
    expect(re[11]).toBe(0);
  });

  it("garde le signal réel : les paires vont ou tombent ensemble", () => {
    const N = 32;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.sin(i);
    const copie = { re: Float64Array.from(re), im: Float64Array.from(im) };
    void copie;
    seuilDur(re, im, 4);
    for (let k = 1; k < N / 2; k++) {
      const vide = re[k] === 0 && im[k] === 0;
      const videMiroir = re[N - k] === 0 && im[N - k] === 0;
      expect(vide).toBe(videMiroir);
    }
  });
});

describe("la réparation", () => {
  it("AMÉLIORE MESURABLEMENT le son : plusieurs décibels gagnés sur les échantillons coupés", () => {
    const original = sonHarmonique(0.4);
    const seuil = 0.5;
    const abime = ecreter(original, seuil);
    const { signal, reparees } = declipper(abime, { seuil, taille: 512, iterations: 40 });

    const avant = sdrEcretes(original, abime, abime, seuil);
    const apres = sdrEcretes(original, signal, abime, seuil);
    expect(reparees).toBeGreaterThan(100);
    expect(apres - avant, `${avant.toFixed(1)} dB → ${apres.toFixed(1)} dB sur ${reparees} échantillons`)
      .toBeGreaterThan(3);
  });

  it("laisse INTACTS les échantillons qui n'étaient pas écrêtés", () => {
    // Ce n'est pas une conséquence heureuse de la convergence : les contraintes sont réimposées
    // après recollement, donc la promesse tient quoi qu'il arrive.
    const original = sonHarmonique(0.3);
    const seuil = 0.6;
    const abime = ecreter(original, seuil);
    const { signal } = declipper(abime, { seuil, taille: 512, iterations: 20 });
    for (let i = 0; i < abime.length; i++) {
      if (!estEcrete(abime[i], seuil)) expect(signal[i]).toBe(abime[i]);
    }
  });

  it("repousse TOUS les échantillons écrêtés au-dessus du seuil, jamais en dessous", () => {
    const seuil = 0.5;
    const abime = ecreter(sonHarmonique(0.3), seuil);
    const { signal } = declipper(abime, { seuil, taille: 512, iterations: 20 });
    for (let i = 0; i < abime.length; i++) {
      if (estEcrete(abime[i], seuil) && abime[i] > 0) expect(signal[i]).toBeGreaterThanOrEqual(seuil - 1e-5);
      if (estEcrete(abime[i], seuil) && abime[i] < 0) expect(signal[i]).toBeLessThanOrEqual(-seuil + 1e-5);
    }
  });

  it("rend le son tel quel quand rien n'est écrêté", () => {
    const x = sonHarmonique(0.2);
    const r = declipper(x, { seuil: 0.99, taille: 512 });
    expect(r.reparees).toBe(0);
    for (let i = 0; i < x.length; i++) expect(r.signal[i]).toBe(x[i]);
  });

  it("gagne d'autant plus que l'écrêtage est LÉGER, et peu quand il est sévère", () => {
    // La forme de cette courbe est la vraie propriété de l'algorithme, et elle n'est pas
    // monotone : ce qui tient le signal, c'est l'ensemble des échantillons FIABLES. Un écrêtage
    // léger en laisse beaucoup et le gain est grand ; passé la moitié des échantillons coupés, il
    // n'y a plus assez de contraintes pour désigner une solution. Mesuré : +16,8 dB à 24 %
    // d'échantillons écrêtés, +2,7 dB à 57 %.
    const original = sonHarmonique(0.4);
    const gain = (seuil: number) => {
      const abime = ecreter(original, seuil);
      const { signal } = declipper(abime, { seuil, taille: 1024 });
      return sdrEcretes(original, signal, abime, seuil) - sdrEcretes(original, abime, abime, seuil);
    };
    const leger = gain(0.6), severe = gain(0.3);
    expect(leger, `léger ${leger.toFixed(1)} dB, sévère ${severe.toFixed(1)} dB`).toBeGreaterThan(10);
    expect(severe).toBeGreaterThan(0);
    expect(leger).toBeGreaterThan(severe * 2);
  });

  it("converge : plus de tours valent mieux, jusqu'à saturation", () => {
    // Avec l'arrêt anticipé désactivé, on voit la convergence elle-même. Elle sature : à partir
    // d'un certain nombre de raies gardées, le modèle rend déjà compte des contraintes.
    const original = sonHarmonique(0.4);
    const seuil = 0.5;
    const abime = ecreter(original, seuil);
    const gain = (iterations: number) => {
      const { signal } = declipper(abime, { seuil, taille: 1024, iterations, epsilon: 1e-9 });
      return sdrEcretes(original, signal, abime, seuil) - sdrEcretes(original, abime, abime, seuil);
    };
    const court = gain(10), moyen = gain(30), long = gain(60);
    expect(moyen, `10 tours ${court.toFixed(1)} dB · 30 ${moyen.toFixed(1)} · 60 ${long.toFixed(1)}`)
      .toBeGreaterThan(court);
    expect(long).toBeGreaterThan(moyen);
  });

  it("dit combien de tours il a fallu, ce qui distingue une convergence d'une borne atteinte", () => {
    const abime = ecreter(sonHarmonique(0.3), 0.6);
    const vite = declipper(abime, { seuil: 0.6, taille: 512, iterations: 60, epsilon: 0.5 });
    const patient = declipper(abime, { seuil: 0.6, taille: 512, iterations: 60, epsilon: 1e-9 });
    expect(vite.toursMoyens).toBeLessThan(patient.toursMoyens);
    expect(patient.toursMoyens).toBeCloseTo(60, 0);
  });

  it("garde la longueur, et ne rend ni NaN ni infini", () => {
    const abime = ecreter(sonHarmonique(0.25), 0.4);
    const r = declipper(abime, { taille: 512, iterations: 15 });
    expect(r.signal.length).toBe(abime.length);
    expect([...r.signal].every(Number.isFinite)).toBe(true);
  });

  it("tient sur un écrêtage sévère, où presque tout est coupé", () => {
    const original = sonHarmonique(0.3);
    const seuil = 0.15;
    const abime = ecreter(original, seuil);
    const { signal, reparees } = declipper(abime, { seuil, taille: 512, iterations: 40 });
    expect(reparees / abime.length).toBeGreaterThan(0.5);
    const avant = sdrEcretes(original, abime, abime, seuil);
    const apres = sdrEcretes(original, signal, abime, seuil);
    expect(apres, `sévère : ${avant.toFixed(1)} dB → ${apres.toFixed(1)} dB`).toBeGreaterThan(avant);
  });

  it("NE S'EMBALLE PAS : les échantillons reconstruits restent sous le plafond", () => {
    // Le garde-fou qui compte. Sur un son dense — une dent de scie riche —, le modèle parcimonieux
    // n'explique plus la trame et son erreur se réfugie dans les échantillons libres, c'est-à-dire
    // ceux qu'on reconstruit : mesuré sans plafond, la crête montait à TROIS FOIS le seuil.
    const n = 44100 * 0.3;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let h = 1; h <= 100; h++) v += Math.sin((2 * Math.PI * 220 * h * i) / 44100) / h;
      x[i] = v;
    }
    let crete = 0; for (const v of x) crete = Math.max(crete, Math.abs(v));
    for (let i = 0; i < n; i++) x[i] = (x[i] / crete) * 0.673;
    const seuil = 0.5;
    const abime = ecreter(x, seuil);
    for (const depassementMax of [1.5, 2, 4]) {
      const { signal } = declipper(abime, { seuil, taille: 1024, depassementMax });
      let haut = 0; for (const v of signal) haut = Math.max(haut, Math.abs(v));
      expect(haut, `plafond ×${depassementMax} : crête ${haut.toFixed(2)}`)
        .toBeLessThanOrEqual(seuil * depassementMax + 1e-6);
    }
  });

  it("rend son propre résidu, qui dit si le modèle a expliqué le son", () => {
    // Le résidu est l'auto-évaluation de la méthode, et il ne coûte rien : c'est déjà le critère
    // d'arrêt. Sur un son à cinq harmoniques il tombe à quelques pour cent ; sur du bruit blanc,
    // que rien ne peut expliquer parcimonieusement, il reste énorme.
    const seuil = 0.5;
    const propre = declipper(ecreter(sonHarmonique(0.3), seuil), { seuil, taille: 1024 });
    const n = 16000 * 0.3;
    const bruit = new Float32Array(n);
    let g = 7;
    for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; bruit[i] = 0.9 * (g / 0x3fffffff - 1); }
    const sale = declipper(ecreter(bruit, seuil), { seuil, taille: 1024 });
    expect(propre.residu, `harmonique ${(100 * propre.residu).toFixed(0)} %, bruit ${(100 * sale.residu).toFixed(0)} %`)
      .toBeLessThan(sale.residu / 3);
  });

  it("devine le seuil tout seul quand on ne le lui donne pas", () => {
    const original = sonHarmonique(0.3);
    const abime = ecreter(original, 0.55);
    const r = declipper(abime, { taille: 512, iterations: 20 });
    expect(r.seuil).toBeCloseTo(0.55, 2);
    expect(r.reparees).toBeGreaterThan(100);
  });
});
