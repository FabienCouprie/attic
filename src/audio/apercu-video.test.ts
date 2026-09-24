// audio/apercu-video.test.ts — Un aperçu qui tombe à côté ferait régler au son d'un mensonge.
import { describe, it, expect } from "vitest";
import { calerSource, courbeDeGain, gainLineaire } from "./apercu-video";

describe("calage d'un son sur le film", () => {
  it("un son à venir attend son heure", () => {
    expect(calerSource(10, 3, 4)).toEqual({ quand: 6, decalage: 0, duree: 3 });
  });

  it("un son commencé est entamé là où le film en est", () => {
    expect(calerSource(10, 6, 12)).toEqual({ quand: 0, decalage: 2, duree: 4 });
  });

  it("un son déjà passé ne joue pas", () => {
    // Sans ce cas, un saut vers la fin du film ferait repartir toutes les pistes ensemble.
    expect(calerSource(10, 3, 13)).toBeNull();
    expect(calerSource(10, 3, 40)).toBeNull();
  });

  it("le film pile sur le début : le son part tout de suite et entier", () => {
    expect(calerSource(10, 3, 10)).toEqual({ quand: 0, decalage: 0, duree: 3 });
  });

  it("un son de durée nulle ne joue pas", () => {
    expect(calerSource(10, 0, 0)).toBeNull();
  });

  it("un début négatif est ramené à zéro", () => {
    expect(calerSource(-5, 3, 0)).toEqual({ quand: 0, decalage: 0, duree: 3 });
  });
});

describe("niveau", () => {
  it("0 dB ne change rien, −6 dB vaut la moitié en amplitude", () => {
    expect(gainLineaire(0)).toBeCloseTo(1, 10);
    expect(gainLineaire(-6.020599913)).toBeCloseTo(0.5, 6);
  });

  it("à −60 dB, le silence et non un murmure", () => {
    expect(gainLineaire(-60)).toBe(0);
    expect(gainLineaire(-80)).toBe(0);
  });
});

describe("courbe de gain", () => {
  it("sans fondu, c'est le niveau, du début à la fin", () => {
    const c = courbeDeGain({ gainDb: 0, fonduEntreeMs: 0, fonduSortieMs: 0 }, 4, 0, 5);
    expect([...c]).toEqual([1, 1, 1, 1, 1]);
  });

  it("le fondu d'entrée part de zéro, celui de sortie y revient", () => {
    const c = courbeDeGain({ gainDb: 0, fonduEntreeMs: 1000, fonduSortieMs: 1000 }, 4, 0, 5);
    expect(c[0]).toBeCloseTo(0, 6);
    expect(c[c.length - 1]).toBeCloseTo(0, 6);
    expect(c[2]).toBeCloseTo(1, 6);
  });

  it("un son repris en son milieu ne refait pas son fondu d'entrée", () => {
    // Le fondu d'entrée dure une seconde ; on reprend à deux secondes : il est passé.
    const c = courbeDeGain({ gainDb: 0, fonduEntreeMs: 1000, fonduSortieMs: 0 }, 4, 2, 5);
    expect(c[0]).toBeCloseTo(1, 6);
  });

  it("le niveau multiplie la courbe entière", () => {
    const c = courbeDeGain({ gainDb: -6.020599913, fonduEntreeMs: 0, fonduSortieMs: 0 }, 2, 0, 3);
    for (const v of c) expect(v).toBeCloseTo(0.5, 6);
  });

  it("le fondu à puissance constante passe par 0,707 à la moitié de sa course", () => {
    const c = courbeDeGain({ gainDb: 0, fonduEntreeMs: 2000, fonduSortieMs: 0 }, 4, 0, 5);
    // Le deuxième point tombe à une seconde, soit la moitié d'un fondu de deux secondes.
    expect(c[1]).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
