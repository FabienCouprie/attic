// audio/cercle.test.ts — Les opérations laissent-elles intact ce qu'elles doivent laisser intact ?
//
// CE QUI SE VÉRIFIE ICI, ET QU'UN ESSAI À L'OREILLE NE DIRAIT PAS. Les opérations se répartissent en
// deux familles dont tout le reste dépend : celles qui touchent les positions, donc le rythme et
// tous les scores, et celles qui touchent les étiquettes, qui ne doivent en changer aucun. Une
// permutation qui déplacerait un sommet d'une place passerait inaperçue à l'écoute et fausserait
// toutes les mesures.
//
// ET UNE VÉRIFICATION CHIFFRÉE. Le complémentaire mélodique puise ses notes dans une chaîne de
// quintes repliée, dont on a calculé qu'elle plafonne vers cinquante-trois notes avant que la
// tolérance ne rejette tout. Ce plafond est ce qui fixe `POSITIONS_MAX` : il est mesuré ici, et non
// pas cru sur parole.
import { describe, expect, it } from "vitest";

import {
  FONDAMENTALES, POSITIONS_MAX, QUINTE_JUSTE_CENTS, cercleAleatoire, chaineDeHauteurs, complementaire,
  estCercle, hauteursDuCercle, inverserIntervalles, inverserOrdre, joindre, normaliser,
  permuterEtiquettes, placesLibres, reflechir, tourner, type Cercle,
} from "./cercle";
import { mesurer } from "./cercle-mesures";

const perc = (positions: number, places: number[], valeur = 38): Cercle => ({
  positions, sorte: "percussion", sommets: places.map((position) => ({ position, valeur })),
});

const melo = (positions: number, paires: [number, number][]): Cercle => ({
  positions, sorte: "hauteur", sommets: paires.map(([position, valeur]) => ({ position, valeur })),
});

const places = (c: Cercle) => c.sommets.map((s) => s.position);
const valeurs = (c: Cercle) => c.sommets.map((s) => s.valeur);

describe("reconnaître un cercle", () => {
  it("accepte un cercle bien formé des deux sortes", () => {
    expect(estCercle(perc(16, [0, 3, 6]))).toBe(true);
    expect(estCercle(melo(12, [[0, 60], [4, 64.5]]))).toBe(true);
  });

  it("REFUSE CE QUI CASSERAIT AU PREMIER CALCUL D'ANGLE", () => {
    expect(estCercle(null)).toBe(false);
    expect(estCercle([])).toBe(false);
    expect(estCercle({ positions: 0, sorte: "percussion", sommets: [] })).toBe(false);
    expect(estCercle({ positions: 16, sorte: "autre", sommets: [] })).toBe(false);
    expect(estCercle({ positions: 16, sorte: "percussion", sommets: [{ position: 16, valeur: 38 }] })).toBe(false);
    expect(estCercle({ positions: 16, sorte: "percussion", sommets: [{ position: 2, valeur: NaN }] })).toBe(false);
  });
});

describe("normaliser", () => {
  it("range les places, écarte les doublons, ramène dans le cycle", () => {
    const c: Cercle = {
      positions: 8, sorte: "percussion",
      sommets: [{ position: 6, valeur: 1 }, { position: 0, valeur: 2 }, { position: 6, valeur: 3 }, { position: 9, valeur: 4 }],
    };
    const n = normaliser(c);
    expect(places(n)).toEqual([0, 1, 6]);
  });

  it("EST STABLE : la rejouer ne change plus rien", () => {
    const une = normaliser(perc(8, [5, 2, 2, 7]));
    expect(normaliser(une)).toEqual(une);
  });

  it("garde la première valeur d'une place doublée, et non la dernière", () => {
    const c: Cercle = { positions: 8, sorte: "hauteur", sommets: [{ position: 3, valeur: 60 }, { position: 3, valeur: 72 }] };
    expect(valeurs(normaliser(c))).toEqual([60]);
  });
});

describe("les opérations sur les positions", () => {
  const son = perc(16, [0, 3, 6, 10, 12]);

  it("la rotation déplace les places et emporte les étiquettes", () => {
    const c = melo(8, [[0, 60], [3, 64]]);
    const t = tourner(c, 2);
    expect(places(t)).toEqual([2, 5]);
    expect(t.sommets.find((s) => s.position === 2)!.valeur).toBe(60);
  });

  it("une rotation d'un tour entier ne change rien", () => {
    expect(tourner(son, 16)).toEqual(normaliser(son));
  });

  it("LA ROTATION LAISSE LES MESURES INTACTES, SAUF LES CONTRETEMPS", () => {
    // Les contretemps se comptent sur les places premières avec le cycle : ils dépendent donc de
    // l'endroit où le cycle commence, là où la régularité, l'équilibre et l'aire n'en dépendent pas.
    const a = mesurer(son), b = mesurer(tourner(son, 3));
    expect(b.regularite).toBeCloseTo(a.regularite, 12);
    expect(b.equilibre).toBeCloseTo(a.equilibre, 12);
    expect(b.aire).toBeCloseTo(a.aire, 12);
    expect(b.imparite).toBe(a.imparite);
    expect(b.periode).toBe(a.periode);
  });

  it("la réflexion est sa propre réciproque", () => {
    expect(reflechir(reflechir(son, 5), 5)).toEqual(normaliser(son));
  });

  it("la réflexion laisse la régularité, l'équilibre et l'aire", () => {
    const a = mesurer(son), b = mesurer(reflechir(son, 0));
    expect(b.regularite).toBeCloseTo(a.regularite, 12);
    expect(b.equilibre).toBeCloseTo(a.equilibre, 12);
    expect(b.aire).toBeCloseTo(a.aire, 12);
  });

  it("le tirage rend EXACTEMENT le nombre demandé, sans doublon", () => {
    for (const k of [0, 1, 5, 16]) {
      const c = cercleAleatoire(16, k, "percussion", 38, 7);
      expect(c.sommets, `${k} demandées`).toHaveLength(k);
      expect(new Set(places(c)).size).toBe(k);
    }
  });

  it("la même graine rend le même tirage, deux graines en rendent deux", () => {
    expect(cercleAleatoire(16, 5, "percussion", 38, 3)).toEqual(cercleAleatoire(16, 5, "percussion", 38, 3));
    expect(cercleAleatoire(16, 5, "percussion", 38, 3)).not.toEqual(cercleAleatoire(16, 5, "percussion", 38, 4));
  });

  it("on ne demande pas plus de places qu'il n'y en a", () => {
    expect(cercleAleatoire(8, 99, "percussion", 38, 1).sommets).toHaveLength(8);
  });
});

describe("les opérations sur les étiquettes", () => {
  const chant = melo(12, [[0, 60], [2, 64], [5, 67], [7, 71], [9, 72]]);

  it("AUCUNE NE CHANGE UNE SEULE MESURE : c'est ce qui les définit", () => {
    const attendu = mesurer(chant);
    for (const autre of [inverserOrdre(chant), permuterEtiquettes(chant, 12), inverserIntervalles(chant)]) {
      expect(mesurer(autre)).toEqual(attendu);
    }
  });

  it("inverser l'ordre lit les sons à rebours, les places ne bougeant pas", () => {
    const i = inverserOrdre(chant);
    expect(places(i)).toEqual(places(normaliser(chant)));
    expect(valeurs(i)).toEqual([72, 71, 67, 64, 60]);
  });

  it("l'inverser deux fois rend le motif de départ", () => {
    expect(inverserOrdre(inverserOrdre(chant))).toEqual(normaliser(chant));
  });

  it("la permutation garde le même multiensemble de sons", () => {
    const p = permuterEtiquettes(chant, 99);
    expect([...valeurs(p)].sort((a, b) => a - b)).toEqual([...valeurs(normaliser(chant))].sort((a, b) => a - b));
  });

  it("INVERSER LES INTERVALLES N'EST PAS INVERSER L'ORDRE, et les deux s'appellent inversion", () => {
    const ordre = inverserOrdre(chant), intervalles = inverserIntervalles(chant);
    expect(valeurs(intervalles)).not.toEqual(valeurs(ordre));
    // Autour de la note la plus grave par défaut : 60 reste, 64 descend à 56.
    expect(valeurs(intervalles)).toEqual([60, 56, 53, 49, 48]);
  });

  it("l'inversion des intervalles autour d'un axe donné respecte cet axe", () => {
    expect(valeurs(inverserIntervalles(melo(4, [[0, 60], [1, 67]]), 60))).toEqual([60, 53]);
  });
});

describe("le complémentaire", () => {
  it("prend les places libres, et rien d'autre", () => {
    const c = perc(8, [0, 3, 6]);
    expect(placesLibres(c)).toEqual([1, 2, 4, 5, 7]);
    expect(places(complementaire(c)!)).toEqual([1, 2, 4, 5, 7]);
  });

  it("SUR UNE PERCUSSION IL REÇOIT LE SON QU'ON LUI DONNE : c'est le hoquet", () => {
    const k = complementaire(perc(8, [0, 3, 6]), { son: 42 })!;
    expect(new Set(valeurs(k))).toEqual(new Set([42]));
  });

  it("SUR UNE MÉLODIE IL TIRE SES NOTES DE LA PLUS GRAVE, et n'en répète aucune", () => {
    const chant = melo(8, [[0, 62], [3, 67], [6, 71]]);
    const k = complementaire(chant)!;
    expect(k.sorte).toBe("hauteur");
    expect(k.sommets).toHaveLength(5);
    // Toutes dans l'octave de la fondamentale, qui est la note la plus grave du motif.
    for (const v of valeurs(k)) {
      expect(v).toBeGreaterThanOrEqual(62);
      expect(v).toBeLessThan(74);
    }
    expect(new Set(valeurs(k)).size).toBe(5);
  });

  it("IL N'EMPLOIE AUCUNE NOTE DÉJÀ DANS LE MOTIF, à la tolérance près", () => {
    const chant = melo(8, [[0, 60], [3, 67], [6, 64]]);
    for (const v of valeurs(complementaire(chant)!)) {
      for (const u of [60, 67, 64]) expect(Math.abs(v - u) * 100).toBeGreaterThanOrEqual(20);
    }
  });

  it("IL NE CHANGE PAS SOUS ROTATION NI SOUS PERMUTATION, les hauteurs restant les mêmes", () => {
    const chant = melo(12, [[0, 60], [4, 64], [7, 67]]);
    const attendu = [...valeurs(complementaire(chant)!)].sort((a, b) => a - b);
    for (const autre of [tourner(chant, 5), permuterEtiquettes(chant, 8)]) {
      expect([...valeurs(complementaire(autre)!)].sort((a, b) => a - b)).toEqual(attendu);
    }
  });

  it("UN CERCLE MÉLODIQUE VIDE N'A PAS DE FONDAMENTALE, et son complémentaire est refusé", () => {
    expect(complementaire(melo(8, []))).toBeNull();
  });

  it("un cercle de percussion vide rend un complémentaire plein", () => {
    expect(complementaire(perc(4, []), { son: 36 })!.sommets).toHaveLength(4);
  });

  it("un cercle plein rend un complémentaire vide", () => {
    expect(complementaire(perc(4, [0, 1, 2, 3]))!.sommets).toHaveLength(0);
  });
});

describe("la chaîne de hauteurs", () => {
  it("LE RÉSERVOIR REND CINQUANTE-TROIS NOTES — mesuré, non supposé", () => {
    // C'EST CE PLAFOND QUI FIXE `POSITIONS_MAX`. Si la chaîne rendait moins de notes que le plus
    // grand cercle ne compte de places, un complémentaire pourrait ne pas être étiquetable.
    //
    // Relevé en demandant cinq cents notes et en comptant ce qui sort, à divers seuils :
    //   quinte juste, 5 cents  → 159      quinte juste, 30 cents → 30
    //   quinte juste, 10 cents →  95      quinte juste, 50 cents → 18
    //   quinte juste, 20 cents →  53      tempéré 700, 20 cents  → 12
    //
    // Et le mécanisme se voit sur l'écart le plus serré de la chaîne : 90,22 cents après douze pas,
    // 23,46 après treize et jusqu'à quarante-deux, 19,84 après cinquante-trois — c'est là que la
    // tolérance commence à mordre —, puis 3,62 après cinquante-quatre, et tout est rejeté ensuite.
    //
    // Le chiffre est figé plutôt qu'encadré : si quelqu'un change la tolérance par défaut, ce test
    // doit tomber et le lui faire regarder.
    const tirees = chaineDeHauteurs(60, 500);
    expect(tirees).toHaveLength(53);
    expect(tirees.length).toBeGreaterThan(POSITIONS_MAX);
  });

  it("toutes ses notes tiennent dans l'octave de la fondamentale", () => {
    for (const v of chaineDeHauteurs(60, 40)) {
      expect(v).toBeGreaterThanOrEqual(60);
      expect(v).toBeLessThan(72);
    }
  });

  it("deux de ses notes ne sont jamais plus proches que la tolérance", () => {
    const t = chaineDeHauteurs(60, 40).sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) expect((t[i] - t[i - 1]) * 100).toBeGreaterThanOrEqual(20);
  });

  it("SEPT CENTS EXACTEMENT REFERMENT LA CHAÎNE AU DOUZIÈME PAS, et l'on retrouve le tempéré", () => {
    const tempere = chaineDeHauteurs(60, 500, { generateurCents: 700 });
    expect(tempere).toHaveLength(12);
    expect([...tempere].sort((a, b) => a - b)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);
  });

  it("la quinte juste ne referme pas la chaîne : elle rend plus de douze notes", () => {
    expect(chaineDeHauteurs(60, 500, { generateurCents: QUINTE_JUSTE_CENTS }).length).toBeGreaterThan(12);
  });

  it("elle écarte ce qu'on lui dit déjà employé", () => {
    const t = chaineDeHauteurs(60, 5, { deja: [60, 67] });
    for (const v of t) for (const u of [60, 67]) expect(Math.abs(v - u) * 100).toBeGreaterThanOrEqual(20);
  });
});

describe("joindre", () => {
  it("met les cycles bout à bout et décale le second", () => {
    const j = joindre(perc(8, [0, 3]), perc(4, [1]))!;
    expect(j.positions).toBe(12);
    expect(places(j)).toEqual([0, 3, 9]);
  });

  it("REFUSE DEUX SORTES DIFFÉRENTES : on ne saurait plus lire les valeurs", () => {
    expect(joindre(perc(8, [0]), melo(4, [[1, 60]]))).toBeNull();
  });
});

describe("les hauteurs déduites de la fondamentale", () => {
  it("LA PLACE ZÉRO EST LA FONDAMENTALE, dans les trois répartitions", () => {
    for (const r of ["octave", "demi-tons", "quintes"] as const) {
      expect(hauteursDuCercle(12, [0, 3, 7], 60, r)[0], r).toBe(60);
    }
  });

  it("« octave » : LE TOUR ENTIER VAUT UNE OCTAVE, quel que soit le nombre de places", () => {
    // Douze places rendent la gamme chromatique, et rien d'autre.
    expect(hauteursDuCercle(12, [0, 1, 2, 3, 11], 60, "octave")).toEqual([60, 61, 62, 63, 71]);
    // Seize places rendent seize divisions égales : le microton vient tout seul.
    expect(hauteursDuCercle(16, [0, 1, 8], 60, "octave")).toEqual([60, 60.75, 66]);
    // Et la dernière place reste sous l'octave, quelle que soit la taille du cercle.
    for (const n of [3, 5, 12, 16, 48]) {
      const derniere = hauteursDuCercle(n, [n - 1], 60, "octave")[0];
      expect(derniere, `${n} places`).toBeLessThan(72);
      expect(derniere, `${n} places`).toBeGreaterThan(60);
    }
  });

  it("« octave » : TOURNER LE MOTIF LE TRANSPOSE, puisque l'angle est la hauteur", () => {
    const avant = hauteursDuCercle(12, [0, 4, 7], 60, "octave");
    const apres = hauteursDuCercle(12, [2, 6, 9], 60, "octave");
    expect(apres).toEqual(avant.map((h) => h + 2));
  });

  it("« demi-tons » : un demi-ton tempéré par place, et rien entre deux touches", () => {
    expect(hauteursDuCercle(16, [0, 1, 8, 15], 60, "demi-tons")).toEqual([60, 61, 68, 75]);
    for (const h of hauteursDuCercle(48, [...Array(48).keys()], 36, "demi-tons")) {
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it("« demi-tons » : LE HAUT DU TOUR BUTE CONTRE 127 et ne le dépasse pas", () => {
    const h = hauteursDuCercle(48, [40, 44, 47], 84, "demi-tons");
    expect(Math.max(...h)).toBe(127);
    expect(h).toEqual([124, 127, 127]);
  });

  it("« quintes » : LE RANG DÉCIDE ET NON LA PLACE, deux motifs de même compte donnant les mêmes notes", () => {
    const a = hauteursDuCercle(12, [0, 1, 2], 60, "quintes");
    const b = hauteursDuCercle(16, [0, 5, 11], 60, "quintes");
    expect(b).toEqual(a);
    expect(a).toEqual(chaineDeHauteurs(60, 3));
  });

  it("« quintes » : tout reste dans l'octave de la fondamentale", () => {
    for (const h of hauteursDuCercle(48, [...Array(24).keys()], 48, "quintes")) {
      expect(h).toBeGreaterThanOrEqual(48);
      expect(h).toBeLessThan(60);
    }
  });

  it("un cercle sans attaque ne rend aucune hauteur", () => {
    for (const r of ["octave", "demi-tons", "quintes"] as const) {
      expect(hauteursDuCercle(12, [], 60, r), r).toEqual([]);
    }
  });
});

describe("les fondamentales offertes au choix", () => {
  it("elles vont de do 1 à do 6, une par demi-ton", () => {
    expect(FONDAMENTALES).toHaveLength(61);
    expect(FONDAMENTALES[0]).toMatchObject({ note: 24, nom: "C1" });
    expect(FONDAMENTALES[FONDAMENTALES.length - 1]).toMatchObject({ note: 84, nom: "C6" });
  });

  it("LA FRÉQUENCE EST CELLE DU DIAPASON, et le la 3 vaut bien 440 hertz", () => {
    expect(FONDAMENTALES.find((f) => f.nom === "A4")!.hertz).toBeCloseTo(440, 9);
    expect(FONDAMENTALES.find((f) => f.nom === "C4")!.hertz).toBeCloseTo(261.6255653, 6);
  });

  it("aucun nom ne paraît deux fois, et les numéros se suivent", () => {
    expect(new Set(FONDAMENTALES.map((f) => f.nom)).size).toBe(FONDAMENTALES.length);
    FONDAMENTALES.forEach((f, i) => expect(f.note).toBe(24 + i));
  });
});
