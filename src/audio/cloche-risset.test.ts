// audio/cloche-risset.test.ts — Ce timbre repose sur trois choses vérifiables :
// la table de partiels du catalogue, l'inharmonicité, et des décroissances de
// vitesses différentes. Les trois sont testées ici.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { clocheRisset, ratioInharmonique, PARTIELS_CLOCHE_RISSET } from "./cloche-risset";

/** Énergie à une fréquence donnée, sur une fenêtre commençant à `debut`. */
function energie(buf: AudioBuffer, f: number, debut = 0, taille = 16384): number {
  const d = buf.getChannelData(0), sr = buf.sampleRate;
  const N = Math.min(taille, d.length - debut);
  const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) {
    const x = d[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    const s0 = x + c * s1 - s2; s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2)) / N;
}

const BASE = { frequenceHz: 400, dureeSec: 2, sampleRate: 22050 };

describe("table des partiels", () => {
  // Garde-fou : ces valeurs viennent du catalogue de Risset et ont été vérifiées
  // contre deux sources concordantes. Les modifier par inadvertance changerait
  // le timbre sans que rien d'autre ne le signale.
  it("est celle du catalogue, onze partiels", () => {
    expect(PARTIELS_CLOCHE_RISSET).toHaveLength(11);
    expect(PARTIELS_CLOCHE_RISSET.map((p) => p.ratio))
      .toEqual([0.56, 0.56, 0.92, 0.92, 1.19, 1.7, 2, 2.74, 3, 3.76, 4.07]);
    expect(PARTIELS_CLOCHE_RISSET.map((p) => p.amplitude))
      .toEqual([1, 0.67, 1, 1.8, 2.67, 1.67, 1.46, 1.33, 1.33, 1, 1.33]);
    expect(PARTIELS_CLOCHE_RISSET.map((p) => p.duree))
      .toEqual([1, 0.9, 0.65, 0.55, 0.325, 0.35, 0.25, 0.2, 0.15, 0.1, 0.075]);
  });

  it("seuls les partiels doublés sont désaccordés — ce sont eux qui battent", () => {
    const desaccordes = PARTIELS_CLOCHE_RISSET.filter((p) => p.desaccordHz !== 0);
    expect(desaccordes.map((p) => p.desaccordHz)).toEqual([1, 1.7]);
    // Chacun double un partiel de même rapport, resté juste.
    for (const p of desaccordes) {
      expect(PARTIELS_CLOCHE_RISSET.filter((q) => q.ratio === p.ratio && q.desaccordHz === 0)).toHaveLength(1);
    }
  });

  it("les durées décroissent : les aigus s'éteignent avant les graves", () => {
    // C'est là que se joue le caractère « cloche ». Le partiel le plus aigu ne
    // doit pas tenir plus longtemps que le plus grave.
    const d = PARTIELS_CLOCHE_RISSET.map((p) => p.duree);
    expect(d[d.length - 1]).toBeLessThan(d[0] / 10);
  });
});

describe("ratioInharmonique", () => {
  it("laisse les rapports de Risset intacts à 100 %", () => {
    for (const p of PARTIELS_CLOCHE_RISSET) expect(ratioInharmonique(p.ratio, 1)).toBeCloseTo(p.ratio, 12);
  });

  it("ramène chaque partiel sur l'harmonique le plus proche à 0 %", () => {
    expect(PARTIELS_CLOCHE_RISSET.map((p) => ratioInharmonique(p.ratio, 0)))
      .toEqual([1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("interpole entre les deux", () => {
    expect(ratioInharmonique(0.56, 0.5)).toBeCloseTo(0.78, 10);
  });
});

describe("clocheRisset", () => {
  it("produit la durée et la fréquence d'échantillonnage demandées", () => {
    const b = clocheRisset({ ...BASE, dureeSec: 3 });
    expect(b.length).toBe(3 * BASE.sampleRate);
    expect(b.sampleRate).toBe(BASE.sampleRate);
  });

  it("l'énergie se trouve sur les partiels inharmoniques, pas sur la fondamentale", () => {
    // Une cloche n'a pas de hauteur franche justement parce qu'aucun partiel ne
    // tombe sur la fréquence de base.
    const b = clocheRisset(BASE);
    const f = BASE.frequenceHz;
    expect(energie(b, f * 0.56)).toBeGreaterThan(energie(b, f) * 5);
    expect(energie(b, f * 1.19)).toBeGreaterThan(energie(b, f) * 5);
  });

  it("à inharmonicité nulle, les partiels se rangent sur les harmoniques", () => {
    const f = BASE.frequenceHz;
    const cloche = clocheRisset(BASE);
    const orgue = clocheRisset({ ...BASE, inharmonicite: 0 });
    // Le partiel à 0,56 f disparaît…
    expect(energie(orgue, f * 0.56)).toBeLessThan(energie(cloche, f * 0.56) / 5);
    // …au profit de la fondamentale, qui était vide.
    expect(energie(orgue, f)).toBeGreaterThan(energie(cloche, f) * 5);
  });

  it("le son décroît, et les aigus avant les graves", () => {
    const b = clocheRisset({ ...BASE, dureeSec: 2 });
    const f = BASE.frequenceHz, sr = BASE.sampleRate;
    const tot = (debut: number) => {
      const d = b.getChannelData(0);
      let s = 0;
      for (let i = debut; i < Math.min(debut + sr / 4, d.length); i++) s += d[i] * d[i];
      return Math.sqrt(s);
    };
    expect(tot(0)).toBeGreaterThan(tot(sr) * 2);
    // Le partiel le plus aigu (4,07) doit s'être éteint bien avant le plus grave.
    const aigu = energie(b, f * 4.07, Math.round(sr * 0.5), 4096) / (energie(b, f * 4.07, 0, 4096) || 1e-12);
    const grave = energie(b, f * 0.56, Math.round(sr * 0.5), 4096) / (energie(b, f * 0.56, 0, 4096) || 1e-12);
    expect(aigu).toBeLessThan(grave);
  });

  it("les désaccords font battre les paires, et le battement peut être coupé", () => {
    // Deux partiels à 1 Hz d'écart font varier l'enveloppe une fois par seconde.
    const avec = clocheRisset({ ...BASE, dureeSec: 4, partiels: 2 });
    const sans = clocheRisset({ ...BASE, dureeSec: 4, partiels: 2, battement: 0 });
    // Sans battement, deux partiels de même fréquence s'ajoutent en une simple
    // décroissance exponentielle : le LOGARITHME de l'enveloppe est alors une
    // droite. Un battement y ajoute une ondulation. On mesure donc l'écart à la
    // droite des moindres carrés — une première version comparait des
    // différences entre points voisins, bien trop insensible à une ondulation
    // lente de 1 Hz pour séparer les deux cas.
    const ecartALaDroite = (b: AudioBuffer) => {
      const d = b.getChannelData(0), sr = b.sampleRate, pas = Math.round(sr / 40);
      const y: number[] = [];
      for (let i = 0; i + pas <= d.length; i += pas) {
        let s = 0;
        for (let j = 0; j < pas; j++) s += Math.abs(d[i + j]);
        y.push(Math.log((s / pas) + 1e-12));
      }
      const n = y.length;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
      const pente = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const ord = (sy - pente * sx) / n;
      let residu = 0;
      for (let i = 0; i < n; i++) residu += (y[i] - (pente * i + ord)) ** 2;
      return Math.sqrt(residu / n);
    };
    expect(ecartALaDroite(avec)).toBeGreaterThan(ecartALaDroite(sans) * 3);
  });

  it("ne démarre pas sur un clic", () => {
    const b = clocheRisset(BASE);
    const d = b.getChannelData(0);
    expect(Math.abs(d[0])).toBeLessThan(1e-6);
    // Le seuil ne peut pas être choisi au doigt mouillé : une sinusoïde à
    // 4,07 × 400 Hz échantillonnée à 22 kHz progresse déjà de a·2π·f/sr par pas.
    // On compare donc au maximum THÉORIQUE de pente du signal — un vrai clic le
    // dépasserait, la pente normale non. (Un seuil arbitraire de 0,05 échouait
    // ici sur un signal parfaitement sain.)
    const total = PARTIELS_CLOCHE_RISSET.reduce((s, p) => s + p.amplitude, 0);
    let penteMax = 0;
    for (const p of PARTIELS_CLOCHE_RISSET) {
      penteMax += (p.amplitude / total) * ((2 * Math.PI * (BASE.frequenceHz * p.ratio + p.desaccordHz)) / BASE.sampleRate);
    }
    let pire = 0;
    for (let i = 1; i < 2000; i++) pire = Math.max(pire, Math.abs(d[i] - d[i - 1]));
    expect(pire).toBeLessThanOrEqual(penteMax);
  });

  it("réduire le nombre de partiels appauvrit le spectre sans casser le son", () => {
    const trois = clocheRisset({ ...BASE, partiels: 3 });
    const f = BASE.frequenceHz;
    expect(energie(trois, f * 4.07)).toBeLessThan(energie(clocheRisset(BASE), f * 4.07) / 5);
    expect(energie(trois, f * 0.56)).toBeGreaterThan(0);
  });
});
