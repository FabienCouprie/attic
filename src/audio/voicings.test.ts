// audio/voicings.test.ts — Ce qu'un renversement ne doit jamais changer.
//
// Toutes ces opérations déplacent des notes d'une octave, donc aucune ne doit changer les
// CLASSES de hauteur : un renversement, un drop, un écartement rendent le même accord,
// autrement réparti. C'est l'invariant que ces tests tiennent partout, avant de vérifier
// les dispositions nommées — le drop 2 de la guitare, le drop 3 des quatre cuivres — et la
// conduite des voix, dont on mesure qu'elle bouge effectivement moins.
import { describe, expect, it } from "vitest";
import {
  accords, conduireVoix, dispositions, mouvementTotal, remplacerHauteurs, renverser, voicing,
} from "./voicings";

const DO = [60, 64, 67];
const DO7 = [60, 64, 67, 70];
const classes = (accord: number[]) => [...accord.map((n) => n % 12)].sort((a, b) => a - b);

describe("renversement", () => {
  it("fait passer la basse au-dessus", () => {
    expect(renverser(DO, 1)).toEqual([64, 67, 72]);
    expect(renverser(DO, 2)).toEqual([67, 72, 76]);
  });

  it("garde les mêmes classes de hauteur", () => {
    for (let n = 0; n < 5; n++) expect(classes(renverser(DO7, n))).toEqual(classes(DO7));
  });

  it("rend l'accord tel quel au tour complet, plutôt que de monter sans fin", () => {
    expect(renverser(DO, 3)).toEqual(DO);
    expect(renverser(DO7, 4)).toEqual(DO7);
  });

  it("accepte un accord donné en désordre et une valeur négative", () => {
    expect(renverser([67, 60, 64], 1)).toEqual([64, 67, 72]);
    expect(renverser(DO, -1)).toEqual(renverser(DO, 2));
  });

  it("ne bouge pas une note seule ni un accord vide", () => {
    expect(renverser([60], 3)).toEqual([60]);
    expect(renverser([], 2)).toEqual([]);
  });
});

describe("voicings", () => {
  it("descend d'une octave la deuxième voix en partant du haut — le drop 2", () => {
    // Do-mi-sol-si♭ : le sol descend, l'accord se creuse au milieu.
    expect(voicing(DO7, "drop2")).toEqual([55, 60, 64, 70]);
  });

  it("descend la troisième voix en partant du haut — le drop 3", () => {
    expect(voicing(DO7, "drop3")).toEqual([52, 60, 67, 70]);
  });

  it("descend les deuxième et quatrième voix — le drop 2 et 4", () => {
    expect(voicing(DO7, "drop24")).toEqual([48, 55, 64, 70]);
  });

  it("écarte une note sur deux pour ouvrir l'accord", () => {
    expect(voicing(DO, "ouvert")).toEqual([60, 67, 76]);
  });

  it("garde les mêmes classes de hauteur dans tous les cas", () => {
    for (const type of ["serre", "ouvert", "drop2", "drop3", "drop24"] as const) {
      expect(classes(voicing(DO7, type)), type).toEqual(classes(DO7));
    }
  });

  it("laisse l'accord intact quand il n'a pas assez de voix pour la disposition", () => {
    expect(voicing(DO, "drop3")).toEqual(DO);
    expect(voicing(DO, "drop24")).toEqual(DO);
    expect(voicing([60, 64], "drop2")).toEqual([60, 64]);
    expect(voicing([60], "ouvert")).toEqual([60]);
  });

  it("ne change rien en position serrée", () => {
    expect(voicing(DO7, "serre")).toEqual(DO7);
  });
});

describe("mesure du mouvement", () => {
  it("ne compte rien entre un accord et lui-même", () => {
    expect(mouvementTotal(DO, DO)).toBe(0);
  });

  it("additionne les déplacements voix par voix", () => {
    expect(mouvementTotal([60, 64, 67], [60, 65, 69])).toBe(3);
  });

  it("compte une voix ajoutée comme un déplacement, pour ne pas la croire gratuite", () => {
    expect(mouvementTotal(DO, DO7)).toBe(12);
  });
});

describe("dispositions candidates", () => {
  it("propose tous les renversements, à plusieurs octaves", () => {
    const d = dispositions(DO);
    expect(d.length).toBeGreaterThan(3);
    for (const c of d) expect(classes(c)).toEqual(classes(DO));
  });

  it("reste dans les bornes demandées", () => {
    for (const c of dispositions(DO7, 48, 84)) {
      expect(c[0]).toBeGreaterThanOrEqual(48);
      expect(c[c.length - 1]).toBeLessThanOrEqual(84);
    }
  });

  it("ne propose rien d'un accord plus large que les bornes", () => {
    expect(dispositions([36, 96], 50, 60)).toEqual([]);
  });
});

describe("conduite des voix", () => {
  it("laisse le premier accord où il est", () => {
    expect(conduireVoix([DO, [65, 69, 72]])[0]).toEqual(DO);
  });

  it("choisit la disposition la plus proche : do vers fa donne do-fa-la", () => {
    const [, fa] = conduireVoix([DO, [65, 69, 72]]);
    expect(fa).toEqual([60, 65, 69]);
    expect(mouvementTotal(DO, fa)).toBe(3);
  });

  it("bouge moins que l'empilement de fondamentales", () => {
    const progression = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [57, 60, 64]];
    const conduite = conduireVoix(progression);
    const total = (suite: number[][]) =>
      suite.slice(1).reduce((s, a, i) => s + mouvementTotal(suite[i], a), 0);
    expect(total(conduite)).toBeLessThan(total(progression));
    // Et chaque accord garde bien son harmonie.
    conduite.forEach((a, i) => expect(classes(a)).toEqual(classes(progression[i])));
  });

  it("garde la disposition intacte quand on lui interdit les renversements", () => {
    // Un drop 2 conduit ne doit pas se refermer en position serrée : seul le registre bouge.
    const drop = voicing(DO7, "drop2");                 // [55, 60, 64, 70]
    const suivant = voicing([65, 69, 72, 75], "drop2"); // fa septième, même forme
    const [, conduit] = conduireVoix([drop, suivant], 36, 96, false);
    const ecarts = (a: number[]) => a.slice(1).map((n, i) => n - a[i]);
    expect(ecarts(conduit)).toEqual(ecarts(suivant));
    expect(mouvementTotal(drop, conduit)).toBeLessThanOrEqual(mouvementTotal(drop, suivant));
  });

  it("ne laisse aucun accord sortir des bornes", () => {
    const progression = [[60, 64, 67], [70, 74, 77], [48, 52, 55], [62, 65, 69]];
    for (const a of conduireVoix(progression, 48, 84)) {
      expect(a[0]).toBeGreaterThanOrEqual(48);
      expect(a[a.length - 1]).toBeLessThanOrEqual(84);
    }
  });

  it("supporte une suite vide et un accord d'une seule note", () => {
    expect(conduireVoix([])).toEqual([]);
    // Une note seule suit la même règle : le sol du dessous est à cinq demi-tons de do,
    // celui du dessus à sept, et c'est donc le grave qui est choisi.
    expect(conduireVoix([[60], [67]])).toEqual([[60], [55]]);
  });
});

describe("retour aux notes", () => {
  const groupe = [
    { note: 60, velocite: 100, debut: 0, fin: 1 },
    { note: 64, velocite: 80, debut: 0, fin: 1 },
    { note: 67, velocite: 60, debut: 0, fin: 1 },
  ];

  it("groupe les notes simultanées en accords", () => {
    const g = accords([...groupe, { note: 65, velocite: 90, debut: 1, fin: 2 }]);
    expect(g.length).toBe(2);
    expect(g[0].length).toBe(3);
  });

  it("change les hauteurs sans toucher au reste", () => {
    const sortie = remplacerHauteurs(groupe, [64, 67, 72]);
    expect(sortie.map((n) => n.note)).toEqual([64, 67, 72]);
    expect(sortie.map((n) => n.velocite)).toEqual([100, 80, 60]);
    expect(sortie.every((n) => n.debut === 0 && n.fin === 1)).toBe(true);
  });

  it("supporte une disposition qui a plus de notes que l'accord d'origine", () => {
    expect(remplacerHauteurs(groupe, [60, 64, 67, 72]).length).toBe(4);
  });
});
