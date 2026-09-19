// audio/classes-hauteurs.test.ts — Les résultats que les manuels donnent déjà.
//
// Cette analyse est enseignée depuis cinquante ans, ce qui est une chance : les réponses
// sont publiées et vérifiables ailleurs qu'ici. Vecteur de la gamme diatonique 254361,
// vecteur de la septième diminuée 004002, les deux tétracordes tous-intervalles, le
// complément de la gamme diatonique qui est la pentatonique, la forme normale de l'accord
// de septième majeure qui se résout par la comparaison des écarts internes — chacun de ces
// tests a une source hors du code.
import { describe, expect, it } from "vitest";
import {
  analyser, classes, complementaire, formeNormale, formePremiere, nomEnsemble,
  symetries, vecteurIntervalles,
} from "./classes-hauteurs";

const DIATONIQUE = [0, 2, 4, 5, 7, 9, 11];
const PAR_TONS = [0, 2, 4, 6, 8, 10];

describe("classes employées", () => {
  it("retire les doublons d'octave : un accord large n'a pas plus de classes", () => {
    expect(classes([60, 64, 67, 72, 76])).toEqual([0, 4, 7]);
  });

  it("range en ordre croissant et ramène tout dans le tour", () => {
    expect(classes([7, 0, 4, -5])).toEqual([0, 4, 7]);
  });
});

describe("forme normale", () => {
  it("laisse un accord déjà compact tel quel", () => {
    expect(formeNormale([0, 4, 7])).toEqual([0, 4, 7]);
  });

  it("tourne l'accord pour le resserrer", () => {
    // Do-mi-sol renversé : sol-do-mi s'écrit normalement do-mi-sol.
    expect(formeNormale([7, 0, 4])).toEqual([0, 4, 7]);
    // Fa-la-do, où l'étendue la plus courte part du fa.
    expect(formeNormale([0, 5, 9])).toEqual([5, 9, 0]);
  });

  it("tranche une égalité d'étendue par les écarts internes", () => {
    // Septième majeure do-mi-sol-si : deux rotations ont une étendue de 8, et c'est
    // l'écart interne qui décide — si-do-mi-sol, réponse des manuels.
    expect(formeNormale([0, 4, 7, 11])).toEqual([11, 0, 4, 7]);
  });

  it("part de la classe la plus basse quand toutes les rotations se valent", () => {
    expect(formeNormale([0, 4, 8])).toEqual([0, 4, 8]);
    expect(formeNormale([0, 3, 6, 9])).toEqual([0, 3, 6, 9]);
    expect(formeNormale([0, 1, 6, 7])).toEqual([0, 1, 6, 7]);
  });

  it("supporte l'ensemble vide et la note seule", () => {
    expect(formeNormale([])).toEqual([]);
    expect(formeNormale([60])).toEqual([0]);
  });
});

describe("forme première", () => {
  it("donne la même famille à un accord majeur et à son relatif mineur", () => {
    expect(formePremiere([0, 4, 7])).toEqual([0, 3, 7]);
    expect(formePremiere([9, 0, 4])).toEqual([0, 3, 7]);
  });

  it("ne change pas par transposition ni par renversement", () => {
    const attendu = formePremiere([0, 4, 7, 10]);
    for (let t = 0; t < 12; t++) {
      expect(formePremiere([0, 4, 7, 10].map((n) => (n + t) % 12)), `T${t}`).toEqual(attendu);
    }
    expect(formePremiere([0, 4, 7, 10].map((n) => (12 - n) % 12))).toEqual(attendu);
  });

  it("rend les formes premières publiées des accords courants", () => {
    expect(formePremiere([0, 4, 7])).toEqual([0, 3, 7]);         // 3-11
    expect(formePremiere([0, 3, 6])).toEqual([0, 3, 6]);         // 3-10
    expect(formePremiere([0, 4, 8])).toEqual([0, 4, 8]);         // 3-12
    expect(formePremiere([0, 4, 7, 10])).toEqual([0, 2, 5, 8]);  // 4-27
    expect(formePremiere([0, 3, 7, 10])).toEqual([0, 3, 5, 8]);  // 4-26
    expect(formePremiere([0, 4, 7, 11])).toEqual([0, 1, 5, 8]);  // 4-20
    expect(formePremiere(DIATONIQUE)).toEqual([0, 1, 3, 5, 6, 8, 10]); // 7-35
  });

  it("garde distincts les deux tétracordes tous-intervalles", () => {
    expect(formePremiere([0, 1, 4, 6])).toEqual([0, 1, 4, 6]);
    expect(formePremiere([0, 1, 3, 7])).toEqual([0, 1, 3, 7]);
  });
});

describe("vecteur d'intervalles", () => {
  it("compte toutes les paires, et rien de plus", () => {
    for (const ens of [[0, 4, 7], [0, 3, 6, 9], DIATONIQUE, PAR_TONS]) {
      const n = ens.length;
      const somme = vecteurIntervalles(ens).reduce((a, b) => a + b, 0);
      expect(somme, `${n} notes`).toBe((n * (n - 1)) / 2);
    }
  });

  it("donne les vecteurs publiés", () => {
    expect(vecteurIntervalles([0, 4, 7])).toEqual([0, 0, 1, 1, 1, 0]);
    expect(vecteurIntervalles([0, 3, 6, 9])).toEqual([0, 0, 4, 0, 0, 2]);
    expect(vecteurIntervalles(PAR_TONS)).toEqual([0, 6, 0, 6, 0, 3]);
    expect(vecteurIntervalles(DIATONIQUE)).toEqual([2, 5, 4, 3, 6, 1]);
  });

  it("compte l'intervalle complémentaire au-delà du triton", () => {
    // Une septième mineure s'entend comme une seconde majeure.
    expect(vecteurIntervalles([0, 10])).toEqual([0, 1, 0, 0, 0, 0]);
    expect(vecteurIntervalles([0, 6])).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it("ne distingue pas les deux tétracordes tous-intervalles — la relation Z", () => {
    const tous = [1, 1, 1, 1, 1, 1];
    expect(vecteurIntervalles([0, 1, 4, 6])).toEqual(tous);
    expect(vecteurIntervalles([0, 1, 3, 7])).toEqual(tous);
    // Même vecteur, formes premières différentes : le vecteur ne suffit pas à nommer.
    expect(formePremiere([0, 1, 4, 6])).not.toEqual(formePremiere([0, 1, 3, 7]));
  });
});

describe("complément et symétries", () => {
  it("donne la pentatonique pour complément de la gamme diatonique", () => {
    expect(complementaire(DIATONIQUE)).toEqual([1, 3, 6, 8, 10]);
    expect(formePremiere(complementaire(DIATONIQUE))).toEqual([0, 2, 4, 7, 9]);
  });

  it("trouve les transpositions qui laissent l'ensemble identique à lui-même", () => {
    expect(symetries([0, 3, 6, 9]).transpositions).toEqual([3, 6, 9]);
    expect(symetries(PAR_TONS).transpositions).toEqual([2, 4, 6, 8, 10]);
    // La gamme diatonique, elle, n'est identique à aucune de ses transpositions.
    expect(symetries(DIATONIQUE).transpositions).toEqual([]);
  });

  it("trouve les inversions qui le laissent identique", () => {
    // L'accord majeur n'est pas symétrique par inversion ; le diminué l'est.
    expect(symetries([0, 4, 7]).inversions).toEqual([]);
    expect(symetries([0, 3, 6, 9]).inversions.length).toBeGreaterThan(0);
  });
});

describe("noms d'usage", () => {
  it("nomme les douze trichordes", () => {
    const trichordes = [
      [0, 1, 2], [0, 1, 3], [0, 1, 4], [0, 1, 5], [0, 1, 6], [0, 2, 4],
      [0, 2, 5], [0, 2, 6], [0, 2, 7], [0, 3, 6], [0, 3, 7], [0, 4, 8],
    ];
    trichordes.forEach((t, i) => {
      expect(nomEnsemble(t)?.forte, t.join(",")).toBe(`3-${i + 1}`);
    });
  });

  it("nomme un accord quelle que soit sa transposition et son renversement", () => {
    expect(nomEnsemble([0, 4, 7])?.forte).toBe("3-11");
    expect(nomEnsemble([64, 67, 72])?.forte).toBe("3-11"); // mi-sol-do
    expect(nomEnsemble([2, 5, 9])?.forte).toBe("3-11");    // ré mineur
  });

  it("nomme les gammes courantes", () => {
    expect(nomEnsemble(PAR_TONS)?.forte).toBe("6-35");
    expect(nomEnsemble(DIATONIQUE)?.forte).toBe("7-35");
    expect(nomEnsemble([0, 2, 4, 7, 9])?.forte).toBe("5-35");
    expect(nomEnsemble([0, 1, 3, 4, 6, 7, 9, 10])?.forte).toBe("8-28");
  });

  it("ne nomme pas ce qu'il ne connaît pas, au lieu d'étiqueter faux", () => {
    expect(nomEnsemble([0, 1, 4, 6])).toBeNull();
    expect(nomEnsemble([0, 1, 2, 3, 4])).toBeNull();
  });
});

describe("analyse complète", () => {
  it("rend les sept mesures d'un coup, cohérentes entre elles", () => {
    const a = analyser([60, 64, 67, 71]);
    expect(a.classes).toEqual([0, 4, 7, 11]);
    expect(a.normale).toEqual([11, 0, 4, 7]);
    expect(a.premiere).toEqual([0, 1, 5, 8]);
    expect(a.nom?.forte).toBe("4-20");
    expect(a.complementaire.length).toBe(8);
    expect(a.vecteur.reduce((x, y) => x + y, 0)).toBe(6);
  });
});
