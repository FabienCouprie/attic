// audio/temperaments.test.ts — Les tempéraments, vérifiés sur des faits musicaux.
//
// Un tempérament n'est pas une préférence : ses intervalles sont des nombres publiés
// depuis trois siècles. Une quinte pythagoricienne fait 702 centièmes, une tierce
// mésotonique 386,3, et le comma pythagoricien vaut 23,46. Ces tests vérifient ces
// nombres-là, et non ce que le code produit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  TEMPERAMENTS, centsDeRapport, ecartsAuTemperamentEgal, noteTemperee, tableEcarts, temperament,
} from "./temperaments";

const t = (id: string) => temperament(id);

describe("table des tempéraments", () => {
  it("donne douze degrés à chacun, partant de la tonique", () => {
    for (const temp of TEMPERAMENTS) {
      expect(temp.cents.length, temp.id).toBe(12);
      expect(temp.cents[0], temp.id).toBeCloseTo(0, 6);
    }
  });

  it("garde les degrés strictement croissants : une gamme ne revient pas en arrière", () => {
    for (const temp of TEMPERAMENTS) {
      for (let i = 1; i < 12; i++) {
        expect(temp.cents[i], `${temp.id} degré ${i}`).toBeGreaterThan(temp.cents[i - 1]);
      }
      expect(temp.cents[11], temp.id).toBeLessThan(1200);
    }
  });

  it("nomme et documente chacun dans les deux langues", () => {
    for (const temp of TEMPERAMENTS) {
      expect(temp.fr && temp.en && temp.noteFr && temp.noteEn, temp.id).toBeTruthy();
    }
  });
});

describe("intervalles publiés", () => {
  it("la quinte pythagoricienne est pure : 702 centièmes", () => {
    expect(t("pythagoricien").cents[7]).toBeCloseTo(701.955, 2);
    expect(centsDeRapport(3 / 2)).toBeCloseTo(701.955, 2);
  });

  it("la tierce pythagoricienne est mordante : 408, soit 22 de plus que la naturelle", () => {
    expect(t("pythagoricien").cents[4]).toBeCloseTo(407.82, 1);
    expect(t("pythagoricien").cents[4] - centsDeRapport(5 / 4)).toBeCloseTo(21.5, 0);
  });

  it("l'intonation juste donne la tierce 5/4 et la quinte 3/2 exactes", () => {
    expect(t("juste").cents[4]).toBeCloseTo(386.314, 2);
    expect(t("juste").cents[7]).toBeCloseTo(701.955, 2);
  });

  it("le mésotonique 1/4 de comma a une tierce EXACTEMENT pure", () => {
    // C'est sa définition même : on rétrécit la quinte jusqu'à ce que la tierce le soit.
    expect(t("mesotonique").cents[4]).toBeCloseTo(centsDeRapport(5 / 4), 1);
    // Et sa quinte est donc plus courte que la pure.
    expect(t("mesotonique").cents[7]).toBeLessThan(701.955);
  });

  it("Werckmeister III rend toutes les tonalités jouables, sans les rendre identiques", () => {
    const e = ecartsAuTemperamentEgal(t("werckmeister3"));
    // Aucun degré ne s'écarte assez pour devenir un loup : moins de 12 centièmes.
    expect(Math.max(...e.map(Math.abs))).toBeLessThan(12);
    // Mais les écarts ne sont pas tous nuls : les tonalités gardent leur couleur.
    expect(e.some((v) => Math.abs(v) > 3)).toBe(true);
  });

  it("le tempérament égal n'a, par définition, aucun écart", () => {
    expect(ecartsAuTemperamentEgal(t("egal")).every((v) => Math.abs(v) < 1e-9)).toBe(true);
  });
});

describe("note jouée", () => {
  const juste = t("juste");

  it("laisse la tonique intacte, quel que soit le tempérament", () => {
    for (const temp of TEMPERAMENTS) {
      expect(noteTemperee(60, 60, temp), temp.id).toBeCloseTo(60, 6);
      expect(noteTemperee(72, 60, temp), temp.id).toBeCloseTo(72, 6);
    }
  });

  it("baisse la tierce majeure de 14 centièmes en intonation juste", () => {
    // 386,3 au lieu de 400 : c'est l'écart qu'on entend battre sur un piano accordé égal.
    expect(noteTemperee(64, 60, juste)).toBeCloseTo(64 - 0.137, 3);
  });

  it("rend une note FRACTIONNAIRE : c'est l'écart qui s'entend", () => {
    expect(Number.isInteger(noteTemperee(64, 60, juste))).toBe(false);
    expect(Number.isInteger(noteTemperee(64, 60, t("egal")))).toBe(true);
  });

  it("suit la tonique : transposer le tempérament déplace les couleurs", () => {
    // En ré, c'est le ré qui devient pur, et le do qui s'écarte.
    expect(noteTemperee(62, 62, juste)).toBeCloseTo(62, 6);
    expect(noteTemperee(60, 62, juste)).not.toBeCloseTo(60, 3);
  });

  it("traite les octaves comme la tonique, en haut comme en bas", () => {
    for (const note of [36, 48, 84, 96]) {
      expect(noteTemperee(note, 60, juste), String(note)).toBeCloseTo(note, 6);
    }
  });
});

describe("table lisible", () => {
  it("écrit les douze écarts avec leur signe", () => {
    const ligne = tableEcarts(t("juste"));
    expect(ligne).toContain("3 -13.7");
    expect(ligne.split("  ").length).toBe(12);
  });

  it("n'écrit que des zéros pour le tempérament égal — douze fois « +0.0 »", () => {
    expect(tableEcarts(t("egal")).match(/\+0\.0\b/g)?.length).toBe(12);
  });
});

// ── Ce que l'oreille entendra : la fréquence réellement rendue ──
//
// Une table de centièmes ne prouve rien si le rendu ignore les hauteurs fractionnaires.
// Ce test rend une vraie note par le moteur d'Attic et mesure sa fréquence.

describe("fréquence rendue", () => {
  const SR = 44100;

  /**
   * Fréquence fondamentale d'un buffer, par autocorrélation à sommet INTERPOLÉ.
   *
   * Sans interpolation, le retard est un nombre entier d'échantillons : à 330 Hz, un pas
   * vaut déjà treize centièmes, soit l'écart même qu'on cherche à mesurer. La parabole
   * passant par les trois points du sommet descend bien en dessous du centième.
   */
  function f0(buffer: AudioBuffer): number {
    const d = buffer.getChannelData(0);
    const debut = Math.floor(0.2 * SR), N = 16384;
    const seg = d.slice(debut, debut + N);
    const lagMin = Math.floor(SR / 1000), lagMax = Math.floor(SR / 100);
    const correl = new Float64Array(lagMax + 2);
    let meilleur = -Infinity, lagRetenu = 0;
    for (let lag = lagMin; lag <= lagMax; lag++) {
      let c = 0;
      for (let i = 0; i + lag < N; i++) c += seg[i] * seg[i + lag];
      correl[lag] = c;
      if (c > meilleur) { meilleur = c; lagRetenu = lag; }
    }
    if (lagRetenu <= lagMin || lagRetenu >= lagMax) return lagRetenu > 0 ? SR / lagRetenu : 0;
    const g = correl[lagRetenu - 1], m = correl[lagRetenu], dr = correl[lagRetenu + 1];
    const denom = g - 2 * m + dr;
    const delta = denom === 0 ? 0 : (0.5 * (g - dr)) / denom;
    return SR / (lagRetenu + delta);
  }

  it("joue la tierce 14 centièmes plus bas en intonation juste — mesuré sur l'audio", async () => {
    const { rendreSequence } = await import("./midi");
    const note = (n: number) => [{ note: n, velocite: 100, debut: 0, fin: 1.2 }];
    const egale = await rendreSequence(note(64), "FM/Oscillateurs", 90);
    const juste = await rendreSequence(note(noteTemperee(64, 60, temperament("juste"))), "FM/Oscillateurs", 90);

    const fEgale = f0(egale), fJuste = f0(juste);
    expect(fEgale).toBeGreaterThan(300);
    // 329,63 Hz en égal ; la tierce juste est 13,7 centièmes plus bas.
    const ecartCents = 1200 * Math.log2(fJuste / fEgale);
    expect(ecartCents).toBeCloseTo(-13.7, 0);
  });

  it("ne change rien à la tonique : même fréquence dans les deux accords", async () => {
    const { rendreSequence } = await import("./midi");
    const note = (n: number) => [{ note: n, velocite: 100, debut: 0, fin: 1.2 }];
    const a = await rendreSequence(note(60), "FM/Oscillateurs", 90);
    const b = await rendreSequence(note(noteTemperee(60, 60, temperament("juste"))), "FM/Oscillateurs", 90);
    expect(f0(a)).toBeCloseTo(f0(b), 1);
  });
});
