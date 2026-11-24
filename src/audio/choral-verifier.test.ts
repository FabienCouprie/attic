// audio/choral-verifier.test.ts — Le vérificateur de choral : Bach d'abord, puis une faute plantée par règle.
//
// LE CAS DONT LA RÉPONSE EST CONNUE VIENT EN PREMIER : sur le choral 175 de Bach, dont les hauteurs
// sont celles de Sapp à la note près, le vérificateur ne relève aucune erreur, et chaque règle y est
// jugée au moins une fois. Un juge qui condamnerait Bach, ou qui ne jugerait rien, ne prouverait rien.
//
// PUIS CHAQUE RÈGLE EST VUE ROUGE, sur une faute plantée dont on connaît la place : dans le choral de
// Bach quand une note suffit à la planter, dans une cadence I IV V I écrite pour être propre quand la
// règle demande un accord précis. La faute doit être trouvée à sa mesure, à son temps, sur ses voix.

import { describe, expect, it } from "vitest";
import { lireTableDcml } from "./dcml-tsv";
import { TABLE_175 } from "./choral-175-dcml";
import { estRefusChoral, verifierChoral, type OptionsChoral, type RegleChoral, type VerdictChoral } from "./choral-verifier";
import type { Sequence } from "./sequence";
import { accordsDeLaTonalite, lireAccord, MODES_CHORAL, sautFautif, type ModeChoral } from "./choral-regles";

const C_MAJEUR: OptionsChoral = { tonique: 0, mode: "majeur", tempo: 60, tempsParMesure: 4 };

const verdict = (seq: Sequence, o: OptionsChoral = C_MAJEUR): VerdictChoral => {
  const v = verifierChoral(seq, o);
  if (estRefusChoral(v)) throw new Error("refus inattendu");
  return v;
};
const fautes = (v: VerdictChoral, regle: RegleChoral) => v.infractions.filter((i) => i.regle === regle);
const ou = (v: VerdictChoral, regle: RegleChoral) => fautes(v, regle).map((i) => [`${i.mesure}.${i.temps}`, i.gravite, i.voix]);

/** Le choral 175 de Bach, à 60 à la noire : une seconde par noire. */
const bach = () => lireTableDcml(TABLE_175, 60).sequence;
/** Change la hauteur de la note de la voix `v` qui commence à `noire`. */
function changer(seq: Sequence, v: number, noire: number, hauteur: number): Sequence {
  const notes = seq.notes.map((n) => ((n.voix ?? 0) === v && Math.abs(n.debut - noire) < 1e-9 ? { ...n, note: hauteur } : n));
  expect(notes.filter((n, i) => n !== seq.notes[i]).length, `aucune note de la voix ${v} à ${noire}`).toBe(1);
  return { ...seq, notes };
}

/** Un choral en noires, une colonne par temps, chaque colonne soprano, alto, ténor, basse. */
const choral = (colonnes: number[][]): Sequence => ({
  notes: colonnes.flatMap((c, t) => c.map((note, voix) => ({ note, velocite: 80, debut: t, fin: t + 1, voix }))),
  tempo: 60,
});
/**
 * I IV V I en do majeur, écrit pour ne rien enfreindre. La basse descend de do 3 à fa 2 : un premier
 * jet la menait à fa 3, puis de fa 3 à sol 2, et le vérificateur y a relevé un saut de septième.
 */
const CADENCE = [[72, 64, 55, 48], [72, 65, 57, 41], [71, 62, 55, 43], [72, 64, 55, 48]];
/** i iv V i en do mineur, la dominante sur la sensible. */
const CADENCE_MINEURE = [[72, 63, 55, 48], [72, 65, 56, 41], [71, 62, 55, 43], [72, 63, 55, 48]];
/** i IV V i en do dorien : le IV majeur du mode, la dominante qui prend la sensible. */
const CADENCE_DORIENNE = [[72, 63, 55, 48], [72, 65, 57, 41], [71, 62, 55, 43], [72, 63, 55, 48]];
/** I ♭VII IV I en do mixolydien : le si bémol du mode, et la sous-dominante avant la fin. */
const CADENCE_MIXOLYDIENNE = [[72, 64, 55, 48], [74, 65, 58, 46], [72, 65, 57, 41], [72, 64, 55, 48]];
/**
 * i iv ♭vii I en do phrygien : la finale atteinte d'en haut par le ré bémol du soprano, l'accord
 * majeur de la tonique pour finir, aucune sensible.
 */
const CADENCE_PHRYGIENNE = [[72, 63, 55, 48], [72, 65, 56, 41], [73, 65, 58, 46], [72, 64, 55, 48]];
const avec = (base: number[][], col: number, voix: number, h: number) => base.map((c, i) => (i === col ? c.map((x, v) => (v === voix ? h : x)) : c));

describe("sur Bach, le choral 175", () => {
  it("ne relève aucune erreur, seulement des avis", () => {
    const v = verdict(bach());
    expect(v.infractions.filter((i) => i.gravite === "erreur")).toEqual([]);
  });

  it("juge chaque règle au moins une fois", () => {
    const v = verdict(bach());
    const jamais = Object.entries(v.jugees).filter(([, n]) => n === 0).map(([r]) => r);
    expect(jamais).toEqual([]);
  });
});

describe("une faute plantée dans Bach, trouvée à sa place", () => {
  it("octaves parallèles soprano-ténor : le ténor en la 3 au troisième temps", () => {
    expect(ou(verdict(bach()), "octaves")).toEqual([]);
    expect(ou(verdict(changer(bach(), 2, 2, 57)), "octaves")).toEqual([["1.4", "erreur", [0, 2]]]);
  });

  it("quintes parallèles ténor-basse : mi 3 puis ré dièse 3 sur la basse la 2 puis sol dièse 2", () => {
    const s = changer(changer(bach(), 2, 2, 52), 2, 3, 51);
    expect(ou(verdict(s), "quintes")).toEqual([["1.4", "erreur", [2, 3]]]);
  });

  it("croisement : l'alto au-dessus du soprano au premier temps", () => {
    expect(ou(verdict(changer(bach(), 1, 0, 69)), "croisement")).toEqual([["1.1", "erreur", [0, 1]]]);
  });

  it("écart : le soprano à plus d'une octave de l'alto", () => {
    expect(ou(verdict(changer(bach(), 0, 0, 79)), "ecart")).toEqual([["1.1", "erreur", [0, 1]]]);
  });

  it("tessiture : une basse sous la plus grave de Bach", () => {
    expect(ou(verdict(changer(bach(), 3, 0, 34)), "tessiture")).toContainEqual(["1.1", "erreur", [3]]);
  });

  it("saut de plus d'une octave : le ténor de sol 2 au la 4", () => {
    expect(ou(verdict(changer(bach(), 2, 2, 69)), "saut")).toContainEqual(["1.3", "erreur", [2]]);
  });
});

describe("une faute plantée dans une cadence propre", () => {
  it("la cadence de référence ne relève rien", () => {
    expect(verdict(choral(CADENCE)).infractions).toEqual([]);
    expect(verdict(choral(CADENCE_MINEURE), { ...C_MAJEUR, mode: "mineur" }).infractions).toEqual([]);
  });

  it("sensible doublée : l'alto sur le si de la dominante", () => {
    expect(ou(verdict(choral(avec(CADENCE, 2, 1, 59))), "sensible-doublee")).toEqual([["1.3", "erreur", [0, 1]]]);
  });

  it("sensible non résolue au soprano : si 4 vers sol 4", () => {
    expect(ou(verdict(choral(avec(CADENCE, 3, 0, 67))), "sensible-non-resolue")).toEqual([["1.3", "erreur", [0]]]);
  });

  it("septième non résolue : le fa de V7 qui monte au sol, et non celui qui descend au mi", () => {
    const v7 = avec(CADENCE, 2, 1, 65);
    expect(ou(verdict(choral(v7)), "septieme-non-resolue")).toEqual([]);
    expect(ou(verdict(choral(avec(v7, 3, 1, 67))), "septieme-non-resolue")).toEqual([["1.3", "erreur", [1]]]);
  });

  it("cadence : le dernier accord sur sa tierce à la basse", () => {
    expect(ou(verdict(choral(avec(CADENCE, 3, 3, 52))), "cadence")).toEqual([["1.4", "erreur", []]]);
  });

  it("accord sans tierce : le premier accord sans son mi", () => {
    expect(ou(verdict(choral(avec(CADENCE, 0, 1, 67))), "accord-sans-tierce")).toEqual([["1.1", "avis", []]]);
  });

  it("hors de la tonalité : un fa dièse dans l'accord de sous-dominante", () => {
    expect(ou(verdict(choral(avec(CADENCE, 1, 1, 66))), "hors-tonalite")).toEqual([["1.2", "avis", []]]);
  });

  it("octave directe aux voix extrêmes : le soprano saute au fa 5 sur la basse fa 3", () => {
    const s = avec(avec(avec(CADENCE, 0, 3, 52), 1, 0, 77), 1, 3, 53);
    expect(ou(verdict(choral(s)), "directes")).toEqual([["1.2", "avis", [0, 3]]]);
  });

  it("quintes par mouvement contraire : soprano sol 4 puis do 5, basse do 3 puis fa 2", () => {
    const s = avec(CADENCE, 0, 0, 67);
    expect(ou(verdict(choral(s)), "consecutives")).toEqual([["1.2", "avis", [0, 3]]]);
  });

  it("dépassement : le ténor monte au-dessus du mi que l'alto tenait", () => {
    expect(ou(verdict(choral(avec(CADENCE, 1, 2, 65))), "depassement")).toContainEqual(["1.2", "avis", [2, 1]]);
  });

  it("seconde augmentée en la mineur : fa 5 vers sol dièse 5", () => {
    const la = [[77, 69, 62, 50], [80, 71, 64, 52], [81, 72, 64, 45]];
    const v = verdict(choral(la), { ...C_MAJEUR, tonique: 9, mode: "mineur" });
    expect(ou(v, "saut")).toEqual([["1.2", "erreur", [0]]]);
  });
});

describe("les modes du choral : chaque cadence de référence est propre dans son mode, et le dit hors de lui", () => {
  const en = (mode: ModeChoral): OptionsChoral => ({ ...C_MAJEUR, mode });

  it("i IV V i en dorien ne relève rien, et son la naturel sort du mineur", () => {
    expect(verdict(choral(CADENCE_DORIENNE), en("dorien")).infractions).toEqual([]);
    expect(ou(verdict(choral(CADENCE_DORIENNE), en("mineur")), "hors-tonalite")).toEqual([["1.2", "avis", []]]);
  });

  it("I ♭VII IV I en mixolydien ne relève rien, et son si bémol sort du majeur", () => {
    expect(verdict(choral(CADENCE_MIXOLYDIENNE), en("mixolydien")).infractions).toEqual([]);
    expect(ou(verdict(choral(CADENCE_MIXOLYDIENNE), en("majeur")), "hors-tonalite")).toEqual([["1.2", "avis", []]]);
  });

  it("I IV V I se lit en mixolydien comme en majeur : le V y prend la sensible", () => {
    expect(verdict(choral(CADENCE), en("mixolydien")).infractions).toEqual([]);
  });

  it("i iv ♭vii I en phrygien ne relève rien, et son ré bémol sort du mineur", () => {
    expect(verdict(choral(CADENCE_PHRYGIENNE), en("phrygien")).infractions).toEqual([]);
    expect(ou(verdict(choral(CADENCE_PHRYGIENNE), en("mineur")), "hors-tonalite")).toEqual([["1.3", "avis", []]]);
  });

  it("en mixolydien, le ♭VII à l'avant-dernier temps est un avis", () => {
    const septiemeAvant = [CADENCE_MIXOLYDIENNE[0], CADENCE_MIXOLYDIENNE[2], CADENCE_MIXOLYDIENNE[1], CADENCE_MIXOLYDIENNE[3]];
    expect(fautes(verdict(choral(septiemeAvant), en("mixolydien")), "cadence").map((i) => [i.gravite, i.fr]))
      .toEqual([["avis", "l'avant-dernier temps n'est ni la dominante avec sa sensible ni la sous-dominante"]]);
  });

  it("en dorien, le v sans sensible à l'avant-dernier temps est un avis, et son si bémol doublé n'est pas une sensible doublée", () => {
    const v = [CADENCE_DORIENNE[0], CADENCE_DORIENNE[1], [70, 58, 55, 43], CADENCE_DORIENNE[3]];
    const juge = verdict(choral(v), en("dorien"));
    expect(ou(juge, "sensible-doublee")).toEqual([]);
    // Aucun accord de ce choral ne porte la sensible : la règle n'y a rien eu à juger.
    expect(juge.jugees["sensible-doublee"]).toBe(0);
    // Et sol, si bémol, ré s'y lit comme le v du mode, non comme un III7 privé de sa fondamentale.
    expect(lireAccord([43, 55, 58, 70], 0, "dorien")).toMatchObject({ degre: 4, sensible: false });
    expect(ou(juge, "hors-tonalite")).toEqual([]);
    expect(fautes(juge, "cadence").map((i) => [i.gravite, i.fr]))
      .toEqual([["avis", "l'avant-dernier temps n'est ni la dominante avec sa sensible ni la sous-dominante"]]);
  });

  it("la fin sur la dominante est un avis en dorien comme en mineur, une erreur en mixolydien", () => {
    expect(ou(verdict(choral(CADENCE_DORIENNE.slice(0, 3)), en("dorien")), "cadence")).toEqual([["1.3", "avis", []]]);
    expect(ou(verdict(choral(CADENCE.slice(0, 3)), en("mixolydien")), "cadence")).toEqual([["1.3", "erreur", []]]);
  });

  it("la tierce picarde finit un dorien sans faute", () => {
    const picarde = [...CADENCE_DORIENNE.slice(0, 3), [72, 64, 55, 48]];
    expect(verdict(choral(picarde), en("dorien")).infractions).toEqual([]);
  });
});

describe("la seconde augmentée de chaque mode", () => {
  // Trois demi-tons entre deux degrés voisins d'une gamme du mode, en do.
  const cas: [ModeChoral, number, number, boolean][] = [
    ["mineur", 68, 71, true], ["mineur", 61, 64, false],
    ["dorien", 68, 71, true], ["dorien", 61, 64, false],
    ["phrygien", 61, 64, true], ["phrygien", 68, 71, true],
    ["majeur", 68, 71, false], ["mixolydien", 68, 71, false], ["mixolydien", 61, 64, false],
  ];
  for (const [mode, de, vers, attendue] of cas) {
    it(`${mode}, ${de} vers ${vers} : ${attendue ? "seconde augmentée" : "rien"}`, () => {
      expect(sautFautif(de, vers, 0, mode) === "seconde-augmentee").toBe(attendue);
      expect(sautFautif(vers, de, 0, mode) === "seconde-augmentee").toBe(attendue);
    });
  }
});

describe("les accords que chaque mode bâtit, en do", () => {
  const notes = (mode: ModeChoral) => accordsDeLaTonalite(0, mode).map((a) => [a.degre, a.racine, a.tierce, a.quinte, a.sensible]);
  it("le majeur et le mineur en bâtissent sept, la dominante du mineur sur la sensible", () => {
    expect(notes("majeur")).toEqual([[0, 0, 4, 7, false], [1, 2, 5, 9, false], [2, 4, 7, 11, true], [3, 5, 9, 0, false], [4, 7, 11, 2, true], [5, 9, 0, 4, false], [6, 11, 2, 5, true]]);
    expect(notes("mineur")).toEqual([[0, 0, 3, 7, false], [1, 2, 5, 8, false], [2, 3, 7, 10, false], [3, 5, 8, 0, false], [4, 7, 11, 2, true], [5, 8, 0, 3, false], [6, 11, 2, 5, true]]);
  });
  it("le dorien et le mixolydien ajoutent la dominante et le septième degré à sensible", () => {
    expect(notes("dorien").slice(4)).toEqual([[4, 7, 10, 2, false], [5, 9, 0, 3, false], [6, 10, 2, 5, false], [4, 7, 11, 2, true], [6, 11, 2, 5, true]]);
    expect(notes("mixolydien").slice(4)).toEqual([[4, 7, 10, 2, false], [5, 9, 0, 4, false], [6, 10, 2, 5, false], [4, 7, 11, 2, true], [6, 11, 2, 5, true]]);
  });
  it("le phrygien ajoute l'accord majeur de sa tonique, et aucun accord n'y porte la sensible", () => {
    expect(notes("phrygien")).toEqual([[0, 0, 3, 7, false], [1, 1, 5, 8, false], [2, 3, 7, 10, false], [3, 5, 8, 0, false], [4, 7, 10, 1, false], [5, 8, 0, 3, false], [6, 10, 1, 5, false], [0, 0, 4, 7, false]]);
  });
});

describe("la sensible doublée, sous les douze toniques et les cinq modes", () => {
  // LE GARDE DÉCLARÉ DANS `gamme-banc-inscriptions.ts`, pour le réglage « Gamme » du nœud : le banc des
  // gammes ne lit pas un rapport, ce test lit ce que la gamme et la tonique changent au jugement. Le
  // phrygien n'a pas de sensible : sa faute plantée est la seconde augmentée de sa tonique, ré bémol
  // puis mi naturel à l'alto en do.
  const transposer = (c: number[][], t: number) => c.map((col) => col.map((h) => h + t - (t >= 6 ? 12 : 0)));
  const BASES: Record<ModeChoral, number[][]> = {
    majeur: CADENCE, mineur: CADENCE_MINEURE, dorien: CADENCE_DORIENNE, mixolydien: CADENCE, phrygien: CADENCE_PHRYGIENNE,
  };
  for (const mode of MODES_CHORAL) {
    for (let t = 0; t < 12; t++) {
      it(`${mode}, tonique ${t}`, () => {
        const base = transposer(BASES[mode], t);
        const o = { ...C_MAJEUR, tonique: t, mode };
        if (mode === "phrygien") {
          expect(ou(verdict(choral(base), o), "saut")).toEqual([]);
          const seconde = base.map((col, i) => (i === 2 ? col.map((h, v) => (v === 1 ? h - 4 : h)) : col));
          expect(ou(verdict(choral(seconde), o), "saut")).toEqual([["1.4", "erreur", [1]]]);
          expect(ou(verdict(choral(seconde), { ...o, tonique: (t + 1) % 12 }), "saut")).toEqual([]);
          // Le phrygien n'a pas de sensible : une dominante majeure à la sensible doublée, si 4 et si 3
          // en do, n'est pas un accord du mode, et la doublure n'y est pas jugée.
          const doublee = base.map((col, i) => (i === 2 ? [71, 59, 55, 43].map((h) => h + t - (t >= 6 ? 12 : 0)) : col));
          expect(ou(verdict(choral(doublee), o), "sensible-doublee")).toEqual([]);
          expect(ou(verdict(choral(doublee), o), "hors-tonalite")).toEqual([["1.3", "avis", []]]);
          return;
        }
        expect(ou(verdict(choral(base), o), "sensible-doublee")).toEqual([]);
        const doublee = base.map((col, i) => (i === 2 ? col.map((h, v) => (v === 1 ? col[0] - 12 : h)) : col));
        expect(ou(verdict(choral(doublee), o), "sensible-doublee")).toEqual([["1.3", "erreur", [0, 1]]]);
        // Et sous la mauvaise tonique, la même dominante n'est plus une dominante : rien n'est relevé.
        expect(ou(verdict(choral(doublee), { ...o, tonique: (t + 1) % 12 }), "sensible-doublee")).toEqual([]);
      });
    }
  }
});

describe("refus et places", () => {
  it("refuse un choral à trois voix en nommant celle qui manque", () => {
    const trois = choral(CADENCE.map((c) => c.slice(0, 3)));
    expect(verifierChoral(trois, C_MAJEUR)).toEqual({ voixEnTrop: [], voixAbsentes: [3] });
  });

  it("compte l'anacrouse comme la fin d'une mesure zéro", () => {
    const v = verdict(choral(avec(CADENCE, 2, 1, 59)), { ...C_MAJEUR, anacrouse: 1 });
    expect(ou(v, "sensible-doublee")).toEqual([["1.2", "erreur", [0, 1]]]);
  });
});
