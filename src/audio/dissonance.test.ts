// audio/dissonance.test.ts — Le test qui compte : la gamme sort du spectre, et non du code.
//
// SI CE MODULE EST JUSTE, ALORS la courbe de dissonance d'un timbre HARMONIQUE doit retrouver
// l'intonation juste — octave, quinte, quarte, tierces — sans qu'aucun de ces intervalles ne soit
// écrit nulle part. C'est le résultat de Sethares, et c'est un test qu'on ne peut pas satisfaire
// par accident : les creux tombent aux bons endroits ou le modèle est faux.
//
// ET RÉCIPROQUEMENT : un timbre ÉTIRÉ doit donner une autre gamme, dont l'octave n'est plus à
// 1200 cents. Si les creux ne bougeaient pas, c'est que la courbe ne dépendrait pas du spectre —
// et tout l'intérêt du procédé tomberait.
import { describe, expect, it } from "vitest";
import {
  courbeDissonance, creux, dissonanceIntervalle, dissonancePaire, dissonanceSpectre,
  partielsDepuisModules, rapportProche, rugositeParTrame, timbreEtire, timbreHarmonique,
} from "./dissonance";

describe("la dissonance de deux partiels", () => {
  it("est nulle à l'unisson : deux sons identiques ne battent pas", () => {
    expect(dissonancePaire(440, 1, 440, 1)).toBeCloseTo(0, 12);
  });

  it("monte puis redescend quand on écarte les deux sons", () => {
    const profil = [0, 5, 10, 20, 30, 50, 100, 200, 400].map((d) => dissonancePaire(440, 1, 440 + d, 1));
    const sommet = profil.indexOf(Math.max(...profil));
    expect(sommet).toBeGreaterThan(0);                 // pas à l'unisson
    expect(sommet).toBeLessThan(profil.length - 1);    // pas à l'infini
    expect(profil[profil.length - 1]).toBeLessThan(profil[sommet] * 0.3);
  });

  it("le maximum tombe vers un quart de la bande critique", () => {
    // À 440 Hz, la bande critique vaut une centaine de hertz : le maximum est attendu vers 25 Hz.
    let meilleur = 0, ecartMax = 0;
    for (let d = 1; d < 120; d++) {
      const v = dissonancePaire(440, 1, 440 + d, 1);
      if (v > ecartMax) { ecartMax = v; meilleur = d; }
    }
    expect(meilleur).toBeGreaterThan(10);
    expect(meilleur).toBeLessThan(45);
  });

  it("elle est symétrique : l'ordre des deux sons ne compte pas", () => {
    expect(dissonancePaire(300, 0.8, 340, 0.4)).toBeCloseTo(dissonancePaire(340, 0.4, 300, 0.8), 12);
  });

  it("c'est le partiel LE PLUS FAIBLE qui borne le battement", () => {
    expect(dissonancePaire(440, 1, 465, 0.1)).toBeCloseTo(dissonancePaire(440, 0.1, 465, 0.1), 12);
  });

  it("deux sons graves voisins sont plus rugueux que deux sons aigus au même écart", () => {
    // La bande critique s'élargit avec la fréquence : vingt hertz d'écart comptent moins dans
    // l'aigu. C'est ce qui fait qu'une tierce grave sonne trouble et la même tierce aiguë non.
    expect(dissonancePaire(200, 1, 220, 1)).toBeGreaterThan(dissonancePaire(2000, 1, 2020, 1));
  });

  it("une fréquence nulle ou négative ne casse rien", () => {
    expect(dissonancePaire(0, 1, 440, 1)).toBe(0);
    expect(dissonancePaire(-100, 1, 440, 1)).toBe(0);
  });
});

describe("la dissonance d'un spectre", () => {
  it("un seul partiel n'a aucune paire, donc aucune dissonance", () => {
    expect(dissonanceSpectre([{ frequence: 440, amplitude: 1 }])).toBe(0);
    expect(dissonanceSpectre([])).toBe(0);
  });

  it("un timbre harmonique a une dissonance propre non nulle", () => {
    expect(dissonanceSpectre(timbreHarmonique(440, 6))).toBeGreaterThan(0);
  });

  it("un timbre à partiels serrés est plus rugueux qu'un timbre harmonique", () => {
    const serre = Array.from({ length: 6 }, (_, k) => ({ frequence: 440 + k * 12, amplitude: 1 }));
    expect(dissonanceSpectre(serre)).toBeGreaterThan(dissonanceSpectre(timbreHarmonique(440, 6, 0)));
  });
});

describe("LA COURBE D'UN TIMBRE HARMONIQUE RETROUVE L'INTONATION JUSTE", () => {
  // Sept partiels, décroissance en 1/k : le timbre de la figure de Sethares.
  // JUSQU'À 1300 ET NON 1200 : les deux bouts d'une courbe ne peuvent pas être détectés comme
  // creux, faute d'un voisin de chaque côté. Calculée pile jusqu'à l'octave, elle ne rendait donc
  // pas l'octave — son creux le plus profond.
  const points = courbeDissonance(timbreHarmonique(250, 7), 1300, 1);
  const cs = creux(points, 0.005).map((p) => p.cents);

  it("elle trouve plusieurs creux, et pas des dizaines", () => {
    expect(cs.length).toBeGreaterThanOrEqual(4);
    expect(cs.length).toBeLessThan(15);
  });

  it("l'octave est un creux, et c'est le plus profond", () => {
    const octave = cs.find((c) => Math.abs(c - 1200) <= 10);
    expect(octave).toBeDefined();
    const dissoOctave = points[octave!].dissonance;
    for (const c of cs) if (Math.abs(c - 1200) > 10) expect(points[c].dissonance).toBeGreaterThan(dissoOctave);
  });

  it("la quinte juste est un creux — 702 cents, qu'aucune ligne du code n'écrit", () => {
    expect(cs.some((c) => Math.abs(c - 702) <= 12)).toBe(true);
  });

  it("la quarte juste aussi — 498 cents", () => {
    expect(cs.some((c) => Math.abs(c - 498) <= 12)).toBe(true);
  });

  it("les deux tierces y sont : majeure à 386, mineure à 316", () => {
    expect(cs.some((c) => Math.abs(c - 386) <= 15)).toBe(true);
    expect(cs.some((c) => Math.abs(c - 316) <= 15)).toBe(true);
  });

  it("chaque creux porte le nom d'un rapport simple", () => {
    const nommes = cs.map((c) => rapportProche(c, 18)).filter((n) => n !== null);
    expect(nommes.length).toBeGreaterThanOrEqual(cs.length - 1);
  });
});

describe("UN TIMBRE ÉTIRÉ APPELLE UNE AUTRE GAMME", () => {
  it("l'octave se déplace avec l'étirement du spectre", () => {
    // Étirement 2,1 : l'« octave » de ce timbre est à 1200·log₂(2,1) ≈ 1249 cents.
    const cs = creux(courbeDissonance(timbreEtire(250, 7, 2.1), 1400, 1), 0.005).map((p) => p.cents);
    const attendu = 1200 * Math.log2(2.1);
    expect(cs.some((c) => Math.abs(c - attendu) <= 25)).toBe(true);
    // Et il n'y a plus de creux franc à l'octave ordinaire.
    expect(cs.some((c) => Math.abs(c - 1200) <= 8)).toBe(false);
  });

  it("un étirement de 2 rend exactement le timbre harmonique", () => {
    const a = timbreEtire(250, 6, 2).map((p) => Math.round(p.frequence));
    const b = timbreHarmonique(250, 6).map((p) => Math.round(p.frequence));
    expect(a).toEqual(b);
  });

  it("comprimé au lieu d'étiré, les creux descendent sous l'octave", () => {
    const cs = creux(courbeDissonance(timbreEtire(250, 7, 1.9), 1300, 1), 0.005).map((p) => p.cents);
    const attendu = 1200 * Math.log2(1.9);
    expect(cs.some((c) => Math.abs(c - attendu) <= 25)).toBe(true);
  });
});

describe("la courbe elle-même", () => {
  it("elle est échantillonnée en cents, à pas régulier", () => {
    const points = courbeDissonance(timbreHarmonique(440, 4), 1200, 100);
    expect(points.length).toBe(13);
    expect(points.map((p) => p.cents)).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
    expect(points[12].alpha).toBeCloseTo(2, 10);
  });

  it("elle ne descend jamais à zéro : un timbre garde sa dissonance propre", () => {
    const points = courbeDissonance(timbreHarmonique(250, 7), 1200, 5);
    expect(Math.min(...points.map((p) => p.dissonance))).toBeGreaterThan(0);
  });

  it("à l'unisson, elle vaut quatre fois la dissonance propre du timbre", () => {
    // Deux copies superposées : les paires internes comptent deux fois, les croisées s'ajoutent
    // et valent autant, l'unisson ne battant pas avec lui-même.
    const t = timbreHarmonique(250, 5);
    expect(dissonanceIntervalle(t, 1)).toBeCloseTo(4 * dissonanceSpectre(t), 6);
  });

  it("un spectre vide donne une courbe plate et nulle, sans creux", () => {
    expect(creux(courbeDissonance([], 1200, 50))).toEqual([]);
  });
});

describe("lire les partiels d'un spectre mesuré", () => {
  /** Un spectre où trois cases sont des sommets nets. */
  const modules = (sommets: number[]) => {
    const m = new Float64Array(512);
    for (const s of sommets) { m[s - 1] = 0.3; m[s] = 1; m[s + 1] = 0.3; }
    return m;
  };

  it("retrouve les sommets, et les rend triés par fréquence", () => {
    const p = partielsDepuisModules(modules([20, 40, 60]), 44100, 1024, 12);
    expect(p.length).toBe(3);
    expect(p.map((x) => Math.round(x.frequence))).toEqual([861, 1723, 2584]);
  });

  it("normalise les amplitudes sur le partiel le plus fort", () => {
    const p = partielsDepuisModules(modules([20, 40]), 44100, 1024, 12);
    expect(Math.max(...p.map((x) => x.amplitude))).toBeCloseTo(1, 6);
  });

  it("ne garde que le nombre demandé, les plus forts d'abord", () => {
    expect(partielsDepuisModules(modules([20, 40, 60, 80]), 44100, 1024, 2).length).toBe(2);
  });

  it("un sommet entre deux cases est interpolé, pas arrondi", () => {
    const m = new Float64Array(512);
    m[19] = 0.5; m[20] = 1; m[21] = 0.9; // le vrai sommet penche vers 21
    const p = partielsDepuisModules(m, 44100, 1024, 1);
    expect(p[0].frequence).toBeGreaterThan((20 * 44100) / 1024);
  });

  it("un spectre plat ne donne aucun partiel", () => {
    expect(partielsDepuisModules(new Float64Array(512).fill(0.5), 44100, 1024, 12)).toEqual([]);
  });
});

describe("la rugosité au fil du temps", () => {
  /** Un spectre de deux partiels, l'un fixe, l'autre à `ecart` cases du premier. */
  const deuxPartiels = (base: number, ecart: number, niveau = 1) => {
    const m = new Float64Array(512);
    for (const s of [base, base + ecart]) { m[s - 1] = 0.3 * niveau; m[s] = niveau; m[s + 1] = 0.3 * niveau; }
    return m;
  };

  it("deux partiels voisins sont plus rugueux que deux partiels éloignés", () => {
    const r = rugositeParTrame([deuxPartiels(20, 2), deuxPartiels(20, 40)], 44100, 1024);
    expect(r[0]).toBeGreaterThan(r[1]);
  });

  it("ELLE NE DÉPEND PAS DU VOLUME : le même accord joué deux fois plus fort est aussi rugueux", () => {
    const r = rugositeParTrame([deuxPartiels(20, 3, 1), deuxPartiels(20, 3, 0.25)], 44100, 1024);
    expect(r[0]).toBeCloseTo(r[1], 6);
  });

  it("une trame à un seul partiel n'a pas de rugosité", () => {
    const m = new Float64Array(512);
    m[19] = 0.3; m[20] = 1; m[21] = 0.3;
    expect(rugositeParTrame([m], 44100, 1024)[0]).toBe(0);
  });

  it("une trame vide non plus, et rien n'échoue", () => {
    expect(rugositeParTrame([new Float64Array(512)], 44100, 1024)).toEqual([0]);
  });

  it("elle rend une valeur par trame, dans l'ordre", () => {
    expect(rugositeParTrame([deuxPartiels(20, 2), deuxPartiels(20, 30), deuxPartiels(20, 3)], 44100, 1024).length).toBe(3);
  });
});

describe("nommer un intervalle", () => {
  it("reconnaît les rapports simples", () => {
    expect(rapportProche(0)).toBe("1/1");
    expect(rapportProche(702)).toBe("3/2");
    expect(rapportProche(1200)).toBe("2/1");
    expect(rapportProche(386)).toBe("5/4");
  });

  it("ne nomme pas ce qui est trop loin", () => {
    expect(rapportProche(650, 10)).toBe(null);
  });

  it("choisit le plus proche quand deux rapports sont voisins", () => {
    expect(rapportProche(316)).toBe("6/5");
  });
});
