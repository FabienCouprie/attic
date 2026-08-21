// audio/pulsars.test.ts — Le procédé se résume à une propriété : fondamentale et
// formant sont INDÉPENDANTS. On la vérifie donc en bougeant l'un et en montrant
// que l'autre ne suit pas — deux mesures séparées, pas une impression globale.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { pulsars, dureePulsaret, cycleDeService } from "./pulsars";

const SR = 22050;
const BASE = { dureeSec: 1, sampleRate: SR, fondamentaleHz: 110, formantHz: 1100 };

/** Énergie à une fréquence donnée (Goertzel sur trames courtes, agrégées). */
function energie(buf: AudioBuffer, f: number, trame = 2048): number {
  const d = buf.getChannelData(0), sr = buf.sampleRate;
  const n = Math.min(trame, d.length);
  const w = (2 * Math.PI * f) / sr, c = 2 * Math.cos(w);
  let total = 0, trames = 0;
  for (let debut = 0; debut + n <= d.length; debut += n) {
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) {
      const x = d[debut + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
      const s0 = x + c * s1 - s2; s2 = s1; s1 = s0;
    }
    total += Math.sqrt(Math.abs(s1 * s1 + s2 * s2 - c * s1 * s2)) / n;
    trames++;
  }
  return trames ? total / trames : 0;
}

/** Fréquence, parmi celles proposées, où l'énergie est maximale. */
function picParmi(buf: AudioBuffer, frequences: number[]): number {
  let meilleure = frequences[0], max = -1;
  for (const f of frequences) {
    const e = energie(buf, f);
    if (e > max) { max = e; meilleure = f; }
  }
  return meilleure;
}

describe("dureePulsaret et cycleDeService", () => {
  it("la durée du pulsaret est l'inverse du formant", () => {
    expect(dureePulsaret(1000)).toBeCloseTo(0.001, 12);
    expect(dureePulsaret(500)).toBeCloseTo(0.002, 12);
  });

  it("le cycle de service est le rapport des deux durées, plafonné à 1", () => {
    // Formant dix fois plus aigu que la fondamentale : le pulsaret occupe un
    // dixième de la période, le reste est silence.
    expect(cycleDeService(100, 1000)).toBeCloseTo(0.1, 9);
    // Formant sous la fondamentale : le pulsaret déborderait, on plafonne.
    expect(cycleDeService(1000, 100)).toBe(1);
  });
});

describe("pulsars", () => {
  it("produit la durée et la fréquence d'échantillonnage demandées", () => {
    const b = pulsars({ ...BASE, dureeSec: 2 });
    expect(b.length).toBe(2 * SR);
    expect(b.sampleRate).toBe(SR);
  });

  it("le formant se déplace quand on le demande, la fondamentale ne bouge pas", () => {
    // Première moitié de la démonstration.
    const bas = pulsars({ ...BASE, formantHz: 660 });
    const haut = pulsars({ ...BASE, formantHz: 2200 });
    const candidats = [440, 660, 1100, 1650, 2200, 3300];
    expect(picParmi(bas, candidats)).toBeLessThan(picParmi(haut, candidats));
  });

  it("la fondamentale se déplace quand on le demande, le formant ne bouge pas", () => {
    // Seconde moitié : à formant fixe, changer la fondamentale ne déplace pas la
    // région du spectre où l'énergie se concentre. C'est cela qu'aucune
    // granulation à grille fixe ne sait faire.
    const grave = pulsars({ ...BASE, fondamentaleHz: 55, formantHz: 1100 });
    const aigu = pulsars({ ...BASE, fondamentaleHz: 220, formantHz: 1100 });
    const candidats = [275, 550, 1100, 2200, 4400];
    expect(picParmi(grave, candidats)).toBe(1100);
    expect(picParmi(aigu, candidats)).toBe(1100);
  });

  it("la période de répétition est bien celle de la fondamentale", () => {
    // Mesure directe sur le signal : les pulsars sont séparés par du silence,
    // l'espacement des paquets d'énergie donne la fondamentale.
    const b = pulsars({ ...BASE, fondamentaleHz: 100, formantHz: 2000 });
    const d = b.getChannelData(0);
    const debuts: number[] = [];
    let dansPulsar = false;
    for (let i = 0; i < d.length; i++) {
      const actif = Math.abs(d[i]) > 1e-4;
      if (actif && !dansPulsar) debuts.push(i);
      dansPulsar = actif;
    }
    expect(debuts.length).toBeGreaterThan(50);
    const ecarts = debuts.slice(1).map((v, i) => v - debuts[i]);
    const moyen = ecarts.reduce((a, b2) => a + b2, 0) / ecarts.length;
    expect(moyen).toBeCloseTo(SR / 100, -1);   // 220,5 échantillons
  });

  it("le silence entre pulsars existe réellement", () => {
    // Sans lui, ce ne serait plus une synthèse par pulsars mais une forme d'onde
    // continue : c'est le silence qui rend les deux durées indépendantes.
    const d = pulsars({ ...BASE, fondamentaleHz: 100, formantHz: 2000 }).getChannelData(0);
    let muets = 0;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) < 1e-9) muets++;
    // Cycle de service de 0,05 : environ 95 % de silence.
    expect(muets / d.length).toBeGreaterThan(0.85);
  });

  it("un formant sous la fondamentale sature le cycle sans casser le son", () => {
    const b = pulsars({ ...BASE, fondamentaleHz: 400, formantHz: 100 });
    const d = b.getChannelData(0);
    let pic = 0;
    for (let i = 0; i < d.length; i++) pic = Math.max(pic, Math.abs(d[i]));
    expect(pic).toBeGreaterThan(0.1);
    expect(pic).toBeLessThanOrEqual(1);
  });

  it("les trois formes de pulsaret donnent des sons distincts", () => {
    const formes = ["sinus", "carre", "dents-de-scie"] as const;
    const rendus = formes.map((forme) => pulsars({ ...BASE, forme }).getChannelData(0));
    for (let a = 0; a < rendus.length; a++) {
      for (let b = a + 1; b < rendus.length; b++) {
        let ecart = 0;
        for (let i = 0; i < rendus[a].length; i++) ecart += Math.abs(rendus[a][i] - rendus[b][i]);
        expect(ecart / rendus[a].length, `${formes[a]} vs ${formes[b]}`).toBeGreaterThan(1e-4);
      }
    }
  });

  it("ne démarre pas sur un clic : le pulsaret est fenêtré", () => {
    const d = pulsars(BASE).getChannelData(0);
    expect(Math.abs(d[0])).toBeLessThan(1e-9);
  });
});
