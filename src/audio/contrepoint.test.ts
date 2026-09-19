// audio/contrepoint.test.ts — Un vérificateur se teste par ce qu'il laisse passer.
//
// Deux exigences, et la première est la plus difficile : un contrepoint CORRECT ne doit
// déclencher aucune alerte. Un vérificateur trop zélé est inutilisable, puisqu'on cesse de
// le lire. La seconde est qu'il attrape chaque faute, et l'on construit donc un exemple par
// règle, fautif sur ce point et correct partout ailleurs.
import { describe, expect, it } from "vitest";
import { bilan, verifier } from "./contrepoint";

/**
 * Un exercice juste : do ré mi fa mi ré do au cantus firmus, un contrepoint au-dessus.
 * Quinte au départ, sixte majeure puis octave à la cadence par mouvement contraire, aucune
 * dissonance, aucun parallélisme.
 */
const CANTUS = [60, 62, 64, 65, 64, 62, 60];
const CONTREPOINT = [67, 65, 67, 69, 67, 71, 72];

const regles = (basse: number[], haute: number[]) => verifier(basse, haute).map((i) => i.regle);

describe("un contrepoint correct", () => {
  it("ne déclenche aucune alerte", () => {
    expect(verifier(CANTUS, CONTREPOINT)).toEqual([]);
  });

  it("reste muet quelle que soit l'octave où on le transpose", () => {
    for (const octave of [-24, -12, 12, 24]) {
      expect(verifier(CANTUS.map((n) => n + octave), CONTREPOINT.map((n) => n + octave)), `${octave}`)
        .toEqual([]);
    }
  });

  it("ne rend rien de deux voix vides", () => {
    expect(verifier([], [])).toEqual([]);
  });
});

describe("harmonie", () => {
  it("attrape une dissonance", () => {
    // Une seconde au troisième temps.
    const faux = [...CONTREPOINT];
    faux[2] = 66;
    expect(regles(CANTUS, faux)).toContain("dissonance");
  });

  it("attrape la quarte, qui n'est pas une consonance à deux voix", () => {
    const faux = [...CONTREPOINT];
    faux[2] = 69; // sol → la au-dessus d'un mi : une quarte
    expect(verifier(CANTUS, faux).some((i) => i.regle === "dissonance")).toBe(true);
  });

  it("exige une consonance parfaite au début", () => {
    const faux = [...CONTREPOINT];
    faux[0] = 64; // tierce
    expect(regles(CANTUS, faux)).toContain("debut");
  });

  it("exige l'unisson ou l'octave à la fin, jamais la quinte", () => {
    const faux = [...CONTREPOINT];
    faux[6] = 67;
    const r = regles(CANTUS, faux);
    expect(r).toContain("fin.quinte");
  });

  it("signale un unisson intérieur, mais l'accepte si on le demande", () => {
    const basse = [60, 62, 64, 65, 64, 62, 60];
    const haute = [67, 62, 67, 69, 67, 71, 72];
    expect(regles(basse, haute)).toContain("unisson");
    expect(verifier(basse, haute, { unissonsInterieurs: true }).map((i) => i.regle))
      .not.toContain("unisson");
  });
});

describe("mouvements", () => {
  it("attrape les quintes parallèles", () => {
    // Deux quintes de suite, atteintes par mouvement semblable.
    expect(regles([60, 62], [67, 69])).toContain("quintes.paralleles");
  });

  it("attrape les octaves parallèles", () => {
    expect(regles([60, 62], [72, 74])).toContain("octaves.paralleles");
  });

  it("laisse passer des tierces parallèles, qui sont permises", () => {
    expect(regles([60, 62, 64], [64, 65, 67])).not.toContain("quintes.paralleles");
  });

  it("attrape une quinte directe, atteinte par mouvement semblable", () => {
    // Tierce puis quinte, les deux voix montant ensemble.
    expect(regles([60, 62], [64, 69])).toContain("directe");
  });

  it("accepte la même quinte atteinte par mouvement contraire", () => {
    expect(regles([62, 60], [64, 67])).not.toContain("directe");
  });

  it("signale un croisement de voix", () => {
    const r = verifier([60, 72], [67, 65]);
    expect(r.map((i) => i.regle)).toContain("croisement");
    expect(r.find((i) => i.regle === "croisement")!.gravite).toBe("avis");
  });
});

describe("mélodie", () => {
  it("attrape un intervalle mélodique interdit", () => {
    // Un triton à la voix aiguë.
    expect(regles([60, 62], [67, 73])).toContain("melodique");
  });

  it("attrape un saut de plus d'une octave", () => {
    expect(regles([60, 62], [67, 81])).toContain("saut");
  });

  it("conseille de compenser un grand saut par un mouvement contraire", () => {
    // Une sixte mineure montante suivie d'une nouvelle montée.
    const r = verifier([60, 62, 64], [64, 72, 76]);
    expect(r.map((i) => i.regle)).toContain("saut.compensation");
    expect(r.find((i) => i.regle === "saut.compensation")!.gravite).toBe("avis");
  });

  it("ne dit rien d'un grand saut bien compensé", () => {
    // Une sixte montante, puis un pas conjoint descendant.
    expect(regles([60, 62, 64], [64, 72, 71])).not.toContain("saut.compensation");
  });

  it("signale une ligne qui atteint deux fois son sommet", () => {
    const r = verifier([60, 62, 64, 65, 64, 62, 60], [67, 72, 67, 69, 67, 72, 72]);
    expect(r.map((i) => i.regle)).toContain("sommet");
  });
});

describe("cadence", () => {
  it("exige un mouvement contraire vers l'accord final", () => {
    // Sixte puis octave, mais les deux voix descendent.
    expect(regles([64, 60], [73, 72])).toContain("cadence");
  });

  it("conseille une sixte ou une tierce avant l'octave finale", () => {
    const r = verifier([60, 62, 60], [67, 67, 72]);
    expect(r.map((i) => i.regle)).toContain("cadence.intervalle");
  });
});

describe("bilan", () => {
  it("sépare les erreurs des avis, et liste les règles sans doublon", () => {
    const infractions = verifier([60, 62, 64], [67, 69, 71]);
    const b = bilan(infractions);
    expect(b.erreurs + b.avis).toBe(infractions.length);
    expect(b.regles.length).toBeLessThanOrEqual(infractions.length);
    expect(new Set(b.regles).size).toBe(b.regles.length);
  });

  it("ne compte rien d'un exercice juste", () => {
    expect(bilan(verifier(CANTUS, CONTREPOINT))).toEqual({ erreurs: 0, avis: 0, regles: [] });
  });

  it("signale deux voix de longueurs différentes", () => {
    expect(regles([60, 62, 64], [67, 65])).toContain("longueurs");
  });

  it("range les infractions dans l'ordre du morceau", () => {
    const infractions = verifier([60, 62, 64, 65], [61, 69, 71, 73]);
    for (let i = 1; i < infractions.length; i++) {
      expect(infractions[i].position).toBeGreaterThanOrEqual(infractions[i - 1].position);
    }
  });
});
