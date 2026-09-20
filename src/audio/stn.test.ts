// audio/stn.test.ts — Trois matières, et rien qui se perde entre elles.
//
// La promesse centrale de l'article n'est pas que la séparation soit belle — cela s'écoute — mais
// qu'elle soit COMPLÈTE : les trois sorties remises ensemble doivent redonner le son de départ,
// échantillon pour échantillon. C'est le premier test, et c'est celui qui permet tous les autres,
// puisqu'il garantit qu'aucune matière n'a été inventée ni perdue en route.
import { describe, expect, it } from "vitest";
import { masqueFlou, rapportTonal, separerStn } from "./stn";
import { spectrogrammeModules } from "./hpss";

const SR = 8000;
const REGLAGES = { tailleSinus: 1024, tailleTransitoires: 256, medianeTemps: 11, medianeFrequence: 11 };

function ton(hertz: number, dureeSec: number, amplitude = 0.5): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hertz * i) / SR);
  return x;
}

/** Des clics : ce qu'il y a de plus bref, donc de plus transitoire. */
function clics(dureeSec: number, parSeconde = 4, amplitude = 0.9): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  const pas = Math.round(SR / parSeconde);
  for (let i = pas; i < n; i += pas) {
    // Une attaque courte et non un seul échantillon : plus proche d'un son réel, et cela donne au
    // filtre médian quelque chose à voir.
    for (let j = 0; j < 24; j++) x[i + j] = amplitude * Math.exp(-j / 6) * (j % 2 ? -1 : 1);
  }
  return x;
}

function bruitBlanc(dureeSec: number, amplitude = 0.3, graine = 5): Float32Array {
  const n = Math.round(dureeSec * SR);
  const x = new Float32Array(n);
  let g = graine;
  for (let i = 0; i < n; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; x[i] = amplitude * (g / 0x3fffffff - 1); }
  return x;
}

const additionner = (...sig: Float32Array[]): Float32Array => {
  const n = Math.max(...sig.map((s) => s.length));
  const x = new Float32Array(n);
  for (const s of sig) for (let i = 0; i < s.length; i++) x[i] += s[i];
  return x;
};

const energie = (x: Float32Array) => { let e = 0; for (const v of x) e += v * v; return e; };

describe("la rampe floue", () => {
  it("ne laisse rien passer sous la borne basse, et tout au-dessus de la haute", () => {
    expect(masqueFlou(0.3, 0.6, 0.8)).toBe(0);
    expect(masqueFlou(0.6, 0.6, 0.8)).toBe(0);
    expect(masqueFlou(0.9, 0.6, 0.8)).toBe(1);
  });

  it("passe par un demi au milieu, et monte sans jamais redescendre", () => {
    expect(masqueFlou(0.7, 0.6, 0.8)).toBeCloseTo(0.5, 6);
    let precedent = -1;
    for (let r = 0; r <= 1.0001; r += 0.01) {
      const v = masqueFlou(r, 0.6, 0.8);
      expect(v).toBeGreaterThanOrEqual(precedent);
      precedent = v;
    }
  });

  it("se referme en marche quand on lui retire sa largeur", () => {
    expect(masqueFlou(0.69, 0.7, 0.7)).toBe(0);
    expect(masqueFlou(0.71, 0.7, 0.7)).toBe(1);
  });
});

describe("le rapport tonal", () => {
  it("vaut presque un sur une note tenue, et presque zéro sur une attaque", () => {
    const mods = spectrogrammeModules(additionner(ton(500, 1)), 1024);
    const r = rapportTonal(mods, 11, 11);
    // Le bin de 500 Hz à 8 kHz sur 1024 points : 500/(8000/1024) = 64.
    const milieu = Math.floor(r.length / 2);
    expect(r[milieu][64]).toBeGreaterThan(0.8);

    const modsC = spectrogrammeModules(clics(1, 4), 256);
    const rc = rapportTonal(modsC, 11, 11);
    // Sur la trame d'un clic, l'énergie est large en fréquence : le rapport y est bas. L'indice
    // de trame tient compte du BOURRAGE d'une fenêtre entière que fait l'analyse-synthèse —
    // l'oublier désigne une trame quatre rangs trop tôt, où il ne se passe rien.
    const hop = 256 / 4;
    const trameClic = Math.round((0.25 * SR + 256) / hop);
    let bas = 0;
    for (let k = 20; k < 100; k++) if (rc[trameClic][k] < 0.5) bas++;
    expect(bas, `trame ${trameClic} : ${bas} bins sur 80 sous un demi`).toBeGreaterThan(40);
  });

  it("rend un demi là où il n'y a rien, plutôt que de diviser par zéro", () => {
    const mods = spectrogrammeModules(new Float32Array(SR / 2), 1024);
    const r = rapportTonal(mods, 11, 11);
    expect(r[2][10]).toBe(0.5);
    expect([...r[2]].every(Number.isFinite)).toBe(true);
  });
});

describe("la décomposition", () => {
  it("RECONSTRUIT PARFAITEMENT : les trois sorties redonnent le son de départ", () => {
    const x = additionner(ton(440, 1), clics(1, 5), bruitBlanc(1, 0.15));
    const { sinus, transitoires, bruit } = separerStn(x, REGLAGES);
    let ecartMax = 0;
    for (let i = 0; i < x.length; i++) {
      ecartMax = Math.max(ecartMax, Math.abs(sinus[i] + transitoires[i] + bruit[i] - x[i]));
    }
    // Ce n'est pas une tolérance de confort : les masques sommant à un par construction, seul
    // l'arrondi du calcul en virgule flottante sépare la somme de l'original.
    expect(ecartMax).toBeLessThan(1e-5);
  });

  it("reconstruit tout aussi parfaitement avec des masques tranchés", () => {
    const x = additionner(ton(440, 1), clics(1, 5), bruitBlanc(1, 0.15));
    const { sinus, transitoires, bruit } = separerStn(x, { ...REGLAGES, flou: 0 });
    let ecartMax = 0;
    for (let i = 0; i < x.length; i++) {
      ecartMax = Math.max(ecartMax, Math.abs(sinus[i] + transitoires[i] + bruit[i] - x[i]));
    }
    expect(ecartMax).toBeLessThan(1e-5);
  });

  it("met une note tenue du côté des sinus", () => {
    const r = separerStn(ton(440, 1), REGLAGES);
    expect(r.parts.sinus).toBeGreaterThan(0.8);
  });

  it("met du bruit blanc du côté du bruit", () => {
    const r = separerStn(bruitBlanc(1, 0.3), REGLAGES);
    expect(r.parts.bruit).toBeGreaterThan(0.7);
    expect(r.parts.sinus).toBeLessThan(0.2);
  });

  it("met des clics du côté des transitoires plutôt que des sinus", () => {
    const r = separerStn(clics(1, 5, 0.9), REGLAGES);
    expect(r.parts.transitoires).toBeGreaterThan(r.parts.sinus);
  });

  it("SÉPARE VRAIMENT : ajouter des attaques gonfle la voie des transitoires, et elle seule", () => {
    // Le bon test n'est pas la part absolue — trois sinusoïdes à pleine amplitude écrasent tout
    // le reste et 90 % de sinus est alors une réponse juste. C'est le MÊME son, avec et sans
    // attaques, qu'il faut comparer.
    const base = additionner(ton(440, 1.2), bruitBlanc(1.2, 0.1));
    const avec = additionner(base, clics(1.2, 6, 0.8));
    const sans = separerStn(base, REGLAGES);
    const plus = separerStn(avec, REGLAGES);
    const gainT = energie(plus.transitoires) / Math.max(1e-12, energie(sans.transitoires));
    const gainS = energie(plus.sinus) / Math.max(1e-12, energie(sans.sinus));
    expect(gainT, `transitoires ×${gainT.toFixed(1)}, sinus ×${gainS.toFixed(2)}`).toBeGreaterThan(5);
    expect(gainS).toBeLessThan(1.5);
  });

  it("SÉPARE VRAIMENT : ajouter du souffle gonfle la voie du bruit, et elle seule", () => {
    const base = ton(440, 1.2);
    const avec = additionner(base, bruitBlanc(1.2, 0.25));
    const sans = separerStn(base, REGLAGES);
    const plus = separerStn(avec, REGLAGES);
    const gainN = energie(plus.bruit) / Math.max(1e-12, energie(sans.bruit));
    const gainS = energie(plus.sinus) / Math.max(1e-12, energie(sans.sinus));
    expect(gainN, `bruit ×${gainN.toFixed(1)}, sinus ×${gainS.toFixed(2)}`).toBeGreaterThan(5);
    expect(gainS).toBeLessThan(1.5);
  });

  it("rend trois signaux de la longueur du son, et des parts qui somment à un", () => {
    const x = additionner(ton(300, 0.8), bruitBlanc(0.8, 0.2));
    const r = separerStn(x, REGLAGES);
    expect(r.sinus.length).toBe(x.length);
    expect(r.transitoires.length).toBe(x.length);
    expect(r.bruit.length).toBe(x.length);
    expect(r.parts.sinus + r.parts.transitoires + r.parts.bruit).toBeCloseTo(1, 5);
  });

  it("ne rend ni NaN ni infini sur du silence", () => {
    const r = separerStn(new Float32Array(SR / 2), REGLAGES);
    expect([...r.sinus].every(Number.isFinite)).toBe(true);
    expect([...r.transitoires].every(Number.isFinite)).toBe(true);
    expect([...r.bruit].every(Number.isFinite)).toBe(true);
  });
});
