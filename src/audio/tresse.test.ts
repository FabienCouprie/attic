// audio/tresse.test.ts — La tresse : ses mots, ses permutations, son découpage
// exact, et des bandes qui changent réellement de place dans le son.
import { describe, it, expect } from "vitest";
import {
  lireMotTresse, permutationMotif, ordrePermutation, masqueBande, decouperEnBandes, tresserCanaux, etatBrins,
} from "./tresse";

const SR = 44100;

describe("le mot et sa permutation", () => {
  it("lit les croisements dessus et dessous, et refuse une place hors des brins", () => {
    expect(lireMotTresse("1 -2", 3)).toEqual({ mot: [{ place: 0, dessus: true }, { place: 1, dessus: false }] });
    expect(lireMotTresse("1, −2", 3)).toEqual({ mot: [{ place: 0, dessus: true }, { place: 1, dessus: false }] });
    expect(lireMotTresse("3", 3)).toEqual({ erreur: "3" });
    expect(lireMotTresse("0", 3)).toEqual({ erreur: "0" });
    expect(lireMotTresse("   ", 3)).toEqual({ erreur: "vide" });
  });

  it.each([
    ["1 -2", 3, 3], // la natte : retour au bout de 3 motifs
    ["1", 3, 2],
    ["1 2", 3, 3],
    ["1 3", 4, 2],
    ["1 2 3", 4, 4],
    ["1 -1", 3, 1], // un brin qui passe dessus puis dessous revient à sa place
  ] as const)("« %s » sur %i brins revient au bout de %i motif(s)", (texte, brins, ordre) => {
    const r = lireMotTresse(texte, brins);
    if (!("mot" in r)) throw new Error("mot invalide");
    expect(ordrePermutation(permutationMotif(r.mot, brins))).toBe(ordre);
  });
});

describe("le découpage en bandes", () => {
  it.each([3, 4])("forme sur %i bandes des masques positifs dont la somme vaut 1 partout", (brins) => {
    for (let f = 5; f < 22000; f *= 1.01) {
      let somme = 0;
      for (let b = 0; b < brins; b++) {
        const m = masqueBande(b, f, brins);
        expect(m).toBeGreaterThanOrEqual(-1e-12);
        somme += m;
      }
      expect(somme).toBeCloseTo(1, 10);
    }
  });

  it("redonne le son quand on additionne les bandes", () => {
    const x = new Float32Array(20000);
    let g = 41;
    for (let i = 0; i < x.length; i++) { g = (g * 1103515245 + 12345) & 0x7fffffff; x[i] = 0.5 * (g / 0x3fffffff - 1); }
    const bandes = decouperEnBandes(x, 3, SR);
    let ecart = 0;
    for (let i = 0; i < x.length; i++) ecart = Math.max(ecart, Math.abs(bandes[0][i] + bandes[1][i] + bandes[2][i] - x[i]));
    expect(ecart).toBeLessThan(1e-5);
  });
});

describe("les brins dans le son", () => {
  // Trois sinus, un par bande : 100 Hz (graves), 1000 Hz (médiums), 8000 Hz (aigus).
  const duree = SR * 6;
  const x = new Float32Array(duree);
  for (let i = 0; i < duree; i++) {
    x[i] = 0.3 * (Math.sin((2 * Math.PI * 100 * i) / SR) + Math.sin((2 * Math.PI * 1000 * i) / SR) + Math.sin((2 * Math.PI * 8000 * i) / SR));
  }
  const mot = [{ place: 0, dessus: true }, { place: 1, dessus: false }]; // la natte « 1 −2 »
  const o = { brins: 3 as const, mot, repetitions: 3, relief: 1, largeur: 0.9 };
  const r = tresserCanaux([x], SR, o);
  const [L, R] = r.canaux;

  const amplitude = (a: Float32Array, f: number, c: number, d = 2048) => {
    let s = 0, co = 0, n = 0;
    for (let i = c - d; i < c + d; i++) { const w = (2 * Math.PI * f * i) / SR; s += a[i] * Math.sin(w); co += a[i] * Math.cos(w); n++; }
    return (2 * Math.hypot(s, co)) / n;
  };
  /** Côté d'une fréquence : >0 à droite, <0 à gauche. */
  const cote = (f: number, c: number) => 20 * Math.log10(amplitude(R, f, c) / amplitude(L, f, c));
  // Six croisements sur 6 s : un par seconde. Frontière de croisement k à k secondes.
  const t = (sec: number) => Math.round(sec * SR);

  it("place les graves à gauche, les médiums au centre, les aigus à droite au départ", () => {
    expect(cote(100, t(0.1))).toBeLessThan(-15);
    expect(Math.abs(cote(1000, t(0.1)))).toBeLessThan(1);
    expect(cote(8000, t(0.1))).toBeGreaterThan(15);
  });

  it("échange graves et médiums au premier croisement", () => {
    expect(Math.abs(cote(100, t(1.0)))).toBeLessThan(1); // graves au centre
    expect(cote(1000, t(1.0))).toBeLessThan(-15); // médiums à gauche
  });

  it("fait passer dessus le brin désigné : plus fort au milieu du croisement", () => {
    // Premier croisement « 1 » : la bande de la place 1 (graves) passe dessus.
    // Référence : la même tresse sans relief, au même instant. Le niveau
    // total d'une bande ne dépend pas de sa position (panoramique à puissance
    // constante), si bien que seul le relief peut expliquer l'écart.
    const plat = tresserCanaux([x], SR, { ...o, relief: 0 }).canaux;
    const milieu = t(0.5);
    const niveau = (c: [Float32Array, Float32Array], f: number) => amplitude(c[0], f, milieu) ** 2 + amplitude(c[1], f, milieu) ** 2;
    expect(10 * Math.log10(niveau(r.canaux, 100) / niveau(plat, 100))).toBeCloseTo(3, 0);
    expect(10 * Math.log10(niveau(r.canaux, 1000) / niveau(plat, 1000))).toBeCloseTo(-6, 0);
  });

  it("ramène chaque bande à sa place au bout de 3 motifs, l'ordre de la natte", () => {
    expect(r.ordre).toBe(3);
    expect(r.revenus).toBe(true);
    // 5,95 s : à 95 % du dernier croisement, les positions sont à 99 % arrivées,
    // et la fenêtre de mesure tient encore dans le signal.
    const fin = t(5.95);
    expect(cote(100, fin)).toBeLessThan(-15);
    expect(Math.abs(cote(1000, fin))).toBeLessThan(1);
    expect(cote(8000, fin)).toBeGreaterThan(15);
  });

  it("ne les ramène pas au bout d'un seul motif", () => {
    // Après « 1 −2 » (2 s) : « 1 » échange les places 1 et 2 → [médiums, graves,
    // aigus] ; « −2 » échange les places 2 et 3 → [médiums, aigus, graves]. Soit
    // graves à droite, médiums à gauche, aigus au centre.
    const e = etatBrins(t(2.0), duree, o);
    expect(e.pan[0]).toBeCloseTo(0.9, 5);
    expect(e.pan[1]).toBeCloseTo(-0.9, 5);
    expect(e.pan[2]).toBeCloseTo(0, 5);
  });
});
