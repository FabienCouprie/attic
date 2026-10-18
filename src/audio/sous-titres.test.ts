// Des mots datés deviennent des sous-titres : ce qui est éprouvé ici est le découpage et le
// format, pas la reconnaissance.
import { describe, expect, it } from "vitest";
import {
  analyserSrt, decouperEnSousTitres, instantSrt, replierEnLignes, sousTitreA, versSrt,
  type MotDate, type ReglagesSousTitres,
} from "./sous-titres";

const REGLAGES: ReglagesSousTitres = {
  largeurLigne: 42, lignesMax: 2, dureeMax: 6, silenceCoupe: 0.6, dureeMin: 1,
};

/** Des mots d'une demi-seconde, collés les uns aux autres depuis un instant donné. */
const suite = (debut: number, mots: string[], pas = 0.5): MotDate[] =>
  mots.map((mot, i) => ({ mot, debut: debut + i * pas, fin: debut + i * pas + pas }));

describe("un instant SRT", () => {
  it("s'écrit en heures, minutes, secondes et millisecondes après une virgule", () => {
    expect(instantSrt(0)).toBe("00:00:00,000");
    expect(instantSrt(1.234)).toBe("00:00:01,234");
    expect(instantSrt(3661.5)).toBe("01:01:01,500");
    expect(instantSrt(59.9999)).toBe("00:01:00,000");
  });

  it("ne descend pas sous zéro", () => {
    expect(instantSrt(-3)).toBe("00:00:00,000");
  });
});

describe("le repli en lignes", () => {
  it("coupe à la fin d'un mot, jamais dans un mot", () => {
    const lignes = replierEnLignes(["aaa", "bbb", "ccc"], 7, 2);
    expect(lignes).toEqual(["aaa bbb", "ccc"]);
  });

  it("donne sa ligne entière à un mot plus long que la largeur", () => {
    const lignes = replierEnLignes(["court", "anticonstitutionnellement"], 10, 2);
    expect(lignes).toEqual(["court", "anticonstitutionnellement"]);
  });

  // LE CAS QUI TIENT LA DÉCISION DU DÉBORDEMENT : rien ne disparaît.
  it("ramène les lignes en trop sur la dernière plutôt que de les jeter", () => {
    const lignes = replierEnLignes(["aa", "bb", "cc", "dd"], 2, 2);
    expect(lignes).toEqual(["aa", "bb cc dd"]);
    expect(lignes.join(" ")).toContain("dd");
  });
});

describe("le découpage", () => {
  it("coupe sur un silence plus long que le seuil", () => {
    const mots = [...suite(0, ["un", "deux"]), ...suite(2.5, ["trois", "quatre"])];
    const sous = decouperEnSousTitres(mots, REGLAGES);
    expect(sous).toHaveLength(2);
    expect(sous[0].lignes.join(" ")).toBe("un deux");
    expect(sous[1].lignes.join(" ")).toBe("trois quatre");
  });

  it("ne coupe pas sur un silence plus court que le seuil", () => {
    const mots = [...suite(0, ["un", "deux"]), ...suite(1.4, ["trois"])];
    expect(decouperEnSousTitres(mots, REGLAGES)).toHaveLength(1);
  });

  it("coupe quand la place des lignes est épuisée", () => {
    const mots = suite(0, ["aaaa", "bbbb", "cccc", "dddd"]);
    const sous = decouperEnSousTitres(mots, { ...REGLAGES, largeurLigne: 4, lignesMax: 2 });
    expect(sous.map((s) => s.lignes.join(" "))).toEqual(["aaaa bbbb", "cccc dddd"]);
  });

  it("coupe quand la durée maximale est dépassée", () => {
    const mots = suite(0, ["a", "b", "c", "d", "e", "f"], 1);
    const sous = decouperEnSousTitres(mots, { ...REGLAGES, dureeMax: 3, silenceCoupe: 5 });
    expect(sous).toHaveLength(2);
    expect(sous[0].lignes.join(" ")).toBe("a b c");
  });

  // LE CAS QUI TIENT LA DÉCISION 2 : la durée minimale s'arrête au suivant.
  it("allonge un sous-titre trop bref, mais jamais sur le suivant", () => {
    const mots = [
      { mot: "bref", debut: 0, fin: 0.2 },
      { mot: "suivant", debut: 0.9, fin: 1.6 },
    ];
    const sous = decouperEnSousTitres(mots, { ...REGLAGES, dureeMin: 2, silenceCoupe: 0.5 });
    expect(sous).toHaveLength(2);
    expect(sous[0].fin).toBeCloseTo(0.9, 6);
    expect(sous[0].fin).toBeLessThanOrEqual(sous[1].debut);
    expect(sous[1].fin).toBeCloseTo(2.9, 6);
  });

  it("prend les instants des mots, sans rien arrondir", () => {
    const sous = decouperEnSousTitres([{ mot: "mot", debut: 1.237, fin: 3.891 }], REGLAGES);
    expect(sous[0].debut).toBeCloseTo(1.237, 6);
    expect(sous[0].fin).toBeCloseTo(3.891, 6);
  });

  it("remet les mots dans l'ordre du temps", () => {
    const mots = [
      { mot: "second", debut: 2, fin: 2.5 },
      { mot: "premier", debut: 0, fin: 0.5 },
    ];
    const sous = decouperEnSousTitres(mots, REGLAGES);
    expect(sous[0].lignes.join(" ")).toBe("premier");
    expect(sous[0].debut).toBeCloseTo(0, 6);
  });

  it("écarte ce qui n'est pas un mot daté", () => {
    const mots = [
      { mot: "   ", debut: 0, fin: 1 },
      { mot: "vrai", debut: 1, fin: 2 },
      { mot: "envers", debut: 5, fin: 4 },
      { mot: "nan", debut: Number.NaN, fin: 9 },
    ];
    const sous = decouperEnSousTitres(mots, REGLAGES);
    expect(sous).toHaveLength(1);
    expect(sous[0].lignes.join(" ")).toBe("vrai");
  });

  it("rend une liste vide quand aucun mot n'est reconnu", () => {
    expect(decouperEnSousTitres([], REGLAGES)).toEqual([]);
    expect(versSrt([])).toBe("");
  });
});

describe("relire un SRT", () => {
  it("refait les sous-titres qu'il avait écrits", () => {
    const mots = [...suite(0, ["un", "deux"]), ...suite(2.5, ["trois"])];
    const ecrits = decouperEnSousTitres(mots, REGLAGES);
    const relus = analyserSrt(versSrt(ecrits));
    expect(relus).toEqual(ecrits);
  });

  // LE CAS QUI TIENT LA DÉCISION DE LA LIGNE DE TEMPS : un fichier corrigé à la main perd sa
  // numérotation, et reste lisible.
  it("se fie à la ligne de temps, et non au numéro", () => {
    const relus = analyserSrt("7\n00:00:01,000 --> 00:00:02,000\nsept\n\n7\n00:00:03,000 --> 00:00:04,000\nencore");
    expect(relus.map((s) => s.lignes[0])).toEqual(["sept", "encore"]);
  });

  it("accepte le point à la place de la virgule, que beaucoup d'outils écrivent", () => {
    const relus = analyserSrt("1\n00:00:01.500 --> 00:00:02.250\npoint");
    expect(relus[0].debut).toBeCloseTo(1.5, 6);
    expect(relus[0].fin).toBeCloseTo(2.25, 6);
  });

  it("garde les deux lignes d'un sous-titre", () => {
    const relus = analyserSrt("1\n00:00:00,000 --> 00:00:01,000\nhaut\nbas\n");
    expect(relus[0].lignes).toEqual(["haut", "bas"]);
  });

  it("écarte un sous-titre sans texte, et un texte sans instants", () => {
    expect(analyserSrt("1\n00:00:00,000 --> 00:00:01,000\n\n2\nrien du tout\n")).toEqual([]);
  });

  it("remet les sous-titres dans l'ordre du temps", () => {
    const relus = analyserSrt("1\n00:00:05,000 --> 00:00:06,000\ntard\n\n2\n00:00:01,000 --> 00:00:02,000\ntôt");
    expect(relus.map((s) => s.lignes[0])).toEqual(["tôt", "tard"]);
  });
});

describe("le sous-titre d'un instant", () => {
  const sous = analyserSrt(
    "1\n00:00:01,000 --> 00:00:03,000\npremier\n\n2\n00:00:05,000 --> 00:00:06,000\nsecond");

  it("rend null avant, entre et après", () => {
    expect(sousTitreA(sous, 0.5)).toBeNull();
    expect(sousTitreA(sous, 4)).toBeNull();
    expect(sousTitreA(sous, 99)).toBeNull();
  });

  it("rend celui qui court, bornes comprises au début et exclues à la fin", () => {
    expect(sousTitreA(sous, 1)?.lignes[0]).toBe("premier");
    expect(sousTitreA(sous, 2.999)?.lignes[0]).toBe("premier");
    expect(sousTitreA(sous, 3)).toBeNull();
    expect(sousTitreA(sous, 5.5)?.lignes[0]).toBe("second");
  });

  // LE CAS DU RECOUVREMENT : il vient d'un fichier écrit ailleurs, pas du découpage d'ici.
  it("montre le dernier commencé quand deux se recouvrent", () => {
    const deux = analyserSrt(
      "1\n00:00:00,000 --> 00:00:10,000\nlong\n\n2\n00:00:02,000 --> 00:00:03,000\ncourt");
    expect(sousTitreA(deux, 2.5)?.lignes[0]).toBe("court");
    expect(sousTitreA(deux, 5)?.lignes[0]).toBe("long");
  });
});

describe("le format SRT", () => {
  it("numérote à partir de un, pose la flèche et sépare par une ligne vide", () => {
    const mots = [...suite(0, ["un", "deux"]), ...suite(2.5, ["trois"])];
    const srt = versSrt(decouperEnSousTitres(mots, REGLAGES));
    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:01,000\nun deux\n"
      + "\n"
      + "2\n00:00:02,500 --> 00:00:03,500\ntrois\n",
    );
  });

  it("met chaque ligne du sous-titre sur sa propre ligne", () => {
    const srt = versSrt([{ debut: 0, fin: 1, lignes: ["haut", "bas"] }]);
    expect(srt).toContain("\nhaut\nbas\n");
  });
});
