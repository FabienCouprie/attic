// audio/tonnetz.test.ts — La parcimonie doit tomber du calcul, pas de la déclaration.
//
// Toute la théorie néo-riemannienne tient à un fait : P, L et R ne déplacent qu'UNE voix,
// d'un demi-ton pour les deux premières et d'un ton pour la troisième. Ce fait n'est écrit
// nulle part dans le code — les opérations y sont définies par leur effet sur la
// fondamentale et le mode — et c'est donc un vrai test que de le retrouver. Le reste
// vérifie les exemples que tous les manuels donnent : do majeur devient do mineur par P,
// mi mineur par L, la mineur par R.
import { describe, expect, it } from "vitest";
import {
  appliquer, cheminLePlusCourt, lireOperations, memeTriade, mouvement, nomTriade, notesDe,
  parcourir, reconnaitre, voixParcimonieuses, type Operation, type Triade,
} from "./tonnetz";

const DO: Triade = { fondamentale: 0, type: "majeur" };
const LAm: Triade = { fondamentale: 9, type: "mineur" };

const TOUTES: Triade[] = [];
for (let f = 0; f < 12; f++) {
  TOUTES.push({ fondamentale: f, type: "majeur" }, { fondamentale: f, type: "mineur" });
}

describe("triades", () => {
  it("donne les notes d'un accord majeur et d'un accord mineur", () => {
    expect(notesDe(DO)).toEqual([0, 4, 7]);
    expect(notesDe(LAm)).toEqual([9, 0, 4]);
  });

  it("reconnaît une triade quel que soit son renversement", () => {
    expect(reconnaitre([0, 4, 7])).toEqual(DO);
    expect(reconnaitre([7, 0, 4])).toEqual(DO);
    expect(reconnaitre([60, 64, 67])).toEqual(DO);
    expect(reconnaitre([9, 0, 4])).toEqual(LAm);
  });

  it("refuse ce qui n'est pas une triade", () => {
    expect(reconnaitre([0, 4])).toBeNull();
    expect(reconnaitre([0, 4, 8])).toBeNull();   // augmenté
    expect(reconnaitre([0, 3, 6])).toBeNull();   // diminué
    expect(reconnaitre([0, 4, 7, 10])).toBeNull();
  });

  it("nomme les accords", () => {
    expect(nomTriade(DO)).toBe("C");
    expect(nomTriade(LAm)).toBe("Am");
  });
});

describe("les trois opérations", () => {
  it("donne les exemples des manuels", () => {
    expect(appliquer(DO, "P")).toEqual({ fondamentale: 0, type: "mineur" });
    expect(appliquer(DO, "L")).toEqual({ fondamentale: 4, type: "mineur" });
    expect(appliquer(DO, "R")).toEqual({ fondamentale: 9, type: "mineur" });
    // Et dans l'autre sens : la mineur revient à do majeur par R.
    expect(appliquer(LAm, "R")).toEqual(DO);
    expect(appliquer({ fondamentale: 4, type: "mineur" }, "L")).toEqual(DO);
  });

  it("est sa propre inverse, pour les trois", () => {
    for (const t of TOUTES) {
      for (const op of ["P", "L", "R"] as Operation[]) {
        expect(memeTriade(appliquer(appliquer(t, op), op), t), `${nomTriade(t)} ${op}`).toBe(true);
      }
    }
  });

  it("change toujours de mode", () => {
    for (const t of TOUTES) {
      for (const op of ["P", "L", "R"] as Operation[]) {
        expect(appliquer(t, op).type).not.toBe(t.type);
      }
    }
  });

  it("NE DÉPLACE QU'UNE VOIX — et c'est tout l'intérêt", () => {
    for (const t of TOUTES) {
      const avant = notesDe(t);
      for (const op of ["P", "L", "R"] as Operation[]) {
        const apres = notesDe(appliquer(t, op));
        const communes = avant.filter((n) => apres.includes(n));
        expect(communes.length, `${nomTriade(t)} ${op}`).toBe(2);
      }
    }
  });

  it("déplace cette voix d'un demi-ton pour P et L, d'un ton pour R", () => {
    for (const t of TOUTES) {
      const avant = notesDe(t);
      for (const [op, attendu] of [["P", 1], ["L", 1], ["R", 2]] as [Operation, number][]) {
        const apres = notesDe(appliquer(t, op));
        const partie = avant.find((n) => !apres.includes(n))!;
        const arrivee = apres.find((n) => !avant.includes(n))!;
        const ecart = Math.min(
          Math.abs(arrivee - partie),
          12 - Math.abs(arrivee - partie),
        );
        expect(ecart, `${nomTriade(t)} ${op}`).toBe(attendu);
      }
    }
  });
});

describe("parcours", () => {
  it("rend tous les accords traversés, départ compris", () => {
    const suite = parcourir(DO, lireOperations("P L R"));
    expect(suite.length).toBe(4);
    expect(suite.map(nomTriade)).toEqual(["C", "Cm", "G#", "Fm"]);
  });

  it("lit les opérations collées comme espacées, et ignore le reste", () => {
    expect(lireOperations("PLR")).toEqual(["P", "L", "R"]);
    expect(lireOperations("p l r")).toEqual(["P", "L", "R"]);
    expect(lireOperations("P-X-L")).toEqual(["P", "L"]);
    expect(lireOperations("")).toEqual([]);
  });

  it("revient au départ après le cycle PLPLPL", () => {
    // P et L alternées engendrent le cycle hexatonique : six accords, puis retour.
    const suite = parcourir(DO, lireOperations("PLPLPL"));
    expect(memeTriade(suite[suite.length - 1], DO)).toBe(true);
    expect(new Set(suite.slice(0, 6).map(nomTriade)).size).toBe(6);
  });
});

describe("chemin le plus court", () => {
  it("ne demande aucune opération pour rester sur place", () => {
    expect(cheminLePlusCourt(DO, DO)).toEqual([]);
  });

  it("trouve les voisins immédiats en une opération", () => {
    expect(cheminLePlusCourt(DO, { fondamentale: 0, type: "mineur" })).toEqual(["P"]);
    expect(cheminLePlusCourt(DO, { fondamentale: 4, type: "mineur" })).toEqual(["L"]);
    expect(cheminLePlusCourt(DO, LAm)).toEqual(["R"]);
  });

  it("relie n'importe quelles deux triades, et le chemin reconstruit bien l'arrivée", () => {
    for (const depart of TOUTES) {
      for (const arrivee of TOUTES) {
        const chemin = cheminLePlusCourt(depart, arrivee);
        expect(chemin, `${nomTriade(depart)} → ${nomTriade(arrivee)}`).not.toBeNull();
        const suite = parcourir(depart, chemin!);
        expect(memeTriade(suite[suite.length - 1], arrivee)).toBe(true);
      }
    }
  });

  it("place le pôle hexatonique à trois opérations de distance", () => {
    // Do majeur et la bémol mineur n'ont aucune note commune, et c'est le couple le plus
    // éloigné qu'on puisse atteindre en restant parcimonieux : trois pas.
    const poleHexatonique: Triade = { fondamentale: 8, type: "mineur" };
    expect(notesDe(DO).filter((n) => notesDe(poleHexatonique).includes(n))).toEqual([]);
    expect(cheminLePlusCourt(DO, poleHexatonique)!.length).toBe(3);
  });

  it("relie deux triades quelconques en cinq opérations au plus", () => {
    // C'est le diamètre du graphe : mesuré sur les 576 couples, aucun n'est plus loin que
    // cinq pas, et il en existe qui le sont. L'espace de Riemann est donc minuscule — deux
    // accords quelconques y sont toujours voisins, ce qui est le fond de la théorie.
    let pire = 0;
    for (const depart of TOUTES) {
      for (const arrivee of TOUTES) pire = Math.max(pire, cheminLePlusCourt(depart, arrivee)!.length);
    }
    expect(pire).toBe(5);
  });
});

describe("mise en voix", () => {
  it("part de l'accord demandé, au-dessus de la base", () => {
    const [premier] = voixParcimonieuses([DO], 60);
    expect(premier).toEqual([60, 64, 67]);
  });

  it("garde deux notes sur trois immobiles d'un accord au suivant", () => {
    for (const op of ["P", "L", "R"] as Operation[]) {
      const [a, b] = voixParcimonieuses(parcourir(DO, [op]), 60);
      const immobiles = a.filter((n) => b.includes(n));
      expect(immobiles.length, op).toBe(2);
    }
  });

  it("ne bouge qu'un ou deux demi-tons à chaque pas", () => {
    const suite = voixParcimonieuses(parcourir(DO, lireOperations("PLRLPR")), 60);
    for (let i = 1; i < suite.length; i++) {
      expect(mouvement(suite[i - 1], suite[i]), `pas ${i}`).toBeLessThanOrEqual(2);
    }
  });

  it("ne s'échappe pas du registre sur un long parcours", () => {
    const suite = voixParcimonieuses(parcourir(DO, lireOperations("RLRLRLRLRLRL")), 60);
    for (const accord of suite) {
      for (const note of accord) {
        expect(note).toBeGreaterThan(40);
        expect(note).toBeLessThan(85);
      }
    }
  });

  it("ne rend rien d'une suite vide", () => {
    expect(voixParcimonieuses([])).toEqual([]);
  });
});
