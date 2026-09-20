// audio/gammes-monde.test.ts — Les gammes que le tempérament égal ne sait pas écrire.
//
// CE QUE CES TESTS TIENNENT. Non pas que le code calcule juste — il n'y a presque rien à calculer —
// mais que les CHIFFRES soient les bons, et surtout qu'ils soient cohérents avec ce que les
// notices en disent. Une gamme dont la notice annonce une tierce neutre et dont le tableau porte
// une tierce majeure serait pire qu'une gamme absente : elle mentirait avec assurance.
import { describe, expect, it } from "vitest";
import {
  GAMMES, degresInjouables, ecartAuTempere, frequences, gammeParId, intervalles,
} from "./gammes-monde";

describe("le catalogue", () => {
  it("contient les trois familles annoncées", () => {
    const familles = new Set(GAMMES.map((g) => g.famille));
    expect(familles.has("maqam")).toBe(true);
    expect(familles.has("raga")).toBe(true);
    expect(familles.has("gamelan")).toBe(true);
  });

  it("chaque gamme a un identifiant unique", () => {
    expect(new Set(GAMMES.map((g) => g.id)).size).toBe(GAMMES.length);
  });

  it("chaque gamme part de la tonique et monte sans reculer", () => {
    for (const g of GAMMES) {
      expect(g.cents[0], g.id).toBe(0);
      for (let i = 1; i < g.cents.length; i++) expect(g.cents[i], g.id).toBeGreaterThan(g.cents[i - 1]);
    }
  });

  it("chacune porte une note bilingue, et pas une note vide", () => {
    for (const g of GAMMES) {
      expect(g.note.length, g.id).toBeGreaterThan(40);
      expect(g.noteEn.length, g.id).toBeGreaterThan(40);
    }
  });

  it("on retrouve une gamme par son identifiant, et rien par un identifiant inconnu", () => {
    expect(gammeParId("rast")?.nom).toBe("Maqam Rast");
    expect(gammeParId("inexistant")).toBeUndefined();
  });
});

describe("les maqamat et leurs quarts de ton", () => {
  it("LE RAST A BIEN UNE TIERCE NEUTRE, comme sa notice l'annonce", () => {
    // 350 cents : à mi-chemin exact entre la tierce mineure (300) et la majeure (400).
    expect(gammeParId("rast")!.cents[2]).toBe(350);
  });

  it("le bayati a bien une seconde de trois quarts de ton", () => {
    expect(gammeParId("bayati")!.cents[1]).toBe(150);
  });

  it("LE HIJAZ N'A AUCUN QUART DE TON — c'est ce que sa notice dit, et c'est vérifiable", () => {
    expect(degresInjouables(gammeParId("hijaz")!)).toEqual([]);
  });

  it("les trois autres en ont, eux", () => {
    for (const id of ["rast", "bayati", "saba"]) {
      expect(degresInjouables(gammeParId(id)!).length, id).toBeGreaterThan(0);
    }
  });

  it("le hijaz a bien sa seconde augmentée de trois cents cents", () => {
    const i = intervalles(gammeParId("hijaz")!);
    expect(i[1]).toBe(300);
  });
});

describe("les ragas en intonation juste", () => {
  it("LA TIERCE DU BHAIRAV EST LA TIERCE PURE, et non celle du piano", () => {
    expect(gammeParId("bhairav")!.cents[2]).toBe(386);   // 5/4 juste
    expect(gammeParId("bhairav")!.cents[2]).not.toBe(400); // et non le tempéré
  });

  it("la quinte des ragas est la quinte juste", () => {
    for (const id of ["bhairav", "yaman", "todi"]) {
      expect(gammeParId(id)!.cents.includes(702), id).toBe(true);
    }
  });

  it("le yaman a sa quarte augmentée à 590 et non à 600, comme sa notice l'annonce", () => {
    expect(gammeParId("yaman")!.cents[3]).toBe(590);
  });

  it("les vingt-deux shrutis en comptent bien vingt-deux, plus l'octave", () => {
    expect(gammeParId("shruti22")!.cents.length).toBe(23);
    expect(gammeParId("shruti22")!.cents[22]).toBe(1200);
  });

  it("les degrés des ragas se trouvent tous parmi les shrutis", () => {
    const shrutis = new Set(gammeParId("shruti22")!.cents);
    for (const id of ["bhairav", "yaman", "todi"]) {
      for (const c of gammeParId(id)!.cents) expect(shrutis.has(c), `${id} : ${c}`).toBe(true);
    }
  });
});

describe("le gamelan", () => {
  it("LE SLENDRO A UNE OCTAVE ÉTIRÉE : 1208 cents et non 1200", () => {
    expect(gammeParId("slendro")!.cents.at(-1)).toBe(1208);
  });

  it("le pelog aussi, et sa notice le dit", () => {
    expect(gammeParId("pelog")!.cents.at(-1)).toBeGreaterThan(1200);
  });

  it("le slendro a cinq degrés, presque également espacés", () => {
    const g = gammeParId("slendro")!;
    expect(g.cents.length - 1).toBe(5);
    const i = intervalles(g);
    expect(Math.min(...i)).toBeGreaterThan(225);
    expect(Math.max(...i)).toBeLessThan(255);
  });

  it("le pelog est franchement inégal, lui", () => {
    const i = intervalles(gammeParId("pelog")!);
    expect(Math.max(...i)).toBeGreaterThan(Math.min(...i) * 2);
  });

  it("aucun des deux ne tombe sur un clavier", () => {
    expect(degresInjouables(gammeParId("slendro")!).length).toBeGreaterThan(2);
    expect(degresInjouables(gammeParId("pelog")!).length).toBeGreaterThan(2);
  });
});

describe("les fréquences", () => {
  it("la tonique est rendue telle quelle", () => {
    expect(frequences(gammeParId("rast")!, 440)[0]).toBeCloseTo(440, 10);
  });

  it("une octave juste double la fréquence", () => {
    const f = frequences(gammeParId("bhairav")!, 220);
    expect(f.at(-1)).toBeCloseTo(440, 6);
  });

  it("L'OCTAVE ÉTIRÉE DU SLENDRO NE DOUBLE PAS TOUT À FAIT", () => {
    const f = frequences(gammeParId("slendro")!, 220);
    expect(f.at(-1)).toBeGreaterThan(440);
    expect(f.at(-1)).toBeLessThan(443);
  });

  it("la tierce neutre du rast tombe entre les deux tierces du piano", () => {
    const f = frequences(gammeParId("rast")!, 440);
    expect(f[2]).toBeGreaterThan(440 * Math.pow(2, 3 / 12));  // au-dessus de la mineure
    expect(f[2]).toBeLessThan(440 * Math.pow(2, 4 / 12));     // en dessous de la majeure
  });
});

describe("l'écart au clavier", () => {
  it("il est nul là où la touche existe", () => {
    expect(ecartAuTempere(gammeParId("hijaz")!).every((e) => e === 0)).toBe(true);
  });

  it("il vaut cinquante cents sur une tierce neutre : exactement entre deux touches", () => {
    expect(Math.abs(ecartAuTempere(gammeParId("rast")!)[2])).toBe(50);
  });

  it("la tolérance décide de ce qu'on appelle injouable", () => {
    const g = gammeParId("bhairav")!;
    expect(degresInjouables(g, 5).length).toBeGreaterThan(degresInjouables(g, 20).length);
  });
});
