// audio/choral-energie.test.ts — Ce que l'énergie de l'harmoniseur doit au mode, éprouvé coût par coût.
//
// LES CAS SONT DES DIFFÉRENCES DE COÛT, et non des coûts : deux colonnes ou deux passages qui ne
// diffèrent que par ce que le mode change, l'accord avant-dernier ou celui qui précède la
// sous-dominante. L'harmonisation entière est jugée dans `choral-harmoniser.test.ts`.

import { describe, expect, it } from "vitest";
import { accordsPossibles, dispositions, type AccordCandidat } from "./choral-candidats";
import { coutDuDegre, energieColonne, energiePassage, POIDS, type ColonneChoisie } from "./choral-energie";
import { MODES_CHORAL, type ModeChoral } from "./choral-regles";

const accord = (note: number, tonique: number, mode: ModeChoral, nom: string): AccordCandidat => {
  const a = accordsPossibles(note, tonique, mode, "aucune").find((x) => x.nom === nom);
  if (!a) throw new Error(`${nom} absent sous ${note} en ${mode}`);
  return a;
};
const colonne = (note: number, tonique: number, mode: ModeChoral, nom: string): ColonneChoisie => {
  const a = accord(note, tonique, mode, nom);
  return { accord: a, voix: dispositions(a, note, true)[0] };
};
/** Ce que coûte de plus une colonne placée avant-dernière. */
const surcout = (c: ColonneChoisie, tonique: number, mode: ModeChoral) =>
  energieColonne(c, { tonique, mode }, "avant-derniere") - energieColonne(c, { tonique, mode }, "autre");

describe("l'énergie suit le mode", () => {
  it("avant la finale du phrygien, le iv, le ♭vii, le ♭II et le v° ne coûtent rien de plus", () => {
    // En mi : la mineur, ré mineur, fa majeur, si diminué.
    for (const [note, nom] of [[69, "iv"], [69, "vii"], [69, "II"], [71, "v°"]] as const) {
      expect(surcout(colonne(note, 4, "phrygien", nom), 4, "phrygien"), nom).toBeCloseTo(0, 9);
    }
    expect(surcout(colonne(71, 4, "phrygien", "III"), 4, "phrygien")).toBeCloseTo(POIDS.avantDerniere, 9);
  });

  it("avant la finale du dorien, la dominante à sensible ne coûte rien de plus, le v sans elle coûte", () => {
    expect(surcout(colonne(69, 2, "dorien", "V"), 2, "dorien")).toBeCloseTo(0, 9);
    expect(surcout(colonne(69, 2, "dorien", "v"), 2, "dorien")).toBeCloseTo(POIDS.avantDerniere, 9);
  });

  it("la rétrogradation ne se compte que depuis la dominante à sensible : V puis IV, et non v puis IV", () => {
    // En sol mixolydien, ré majeur et ré mineur sous les mêmes voix, puis do majeur.
    const voix: [number, number, number, number] = [74, 69, 62, 50];
    const apres: ColonneChoisie = { accord: accord(72, 7, "mixolydien", "IV"), voix: [72, 67, 64, 48] };
    const ctx = { tonique: 7, mode: "mixolydien" as const };
    const depuis = (nom: string) => energiePassage({ accord: accord(74, 7, "mixolydien", nom), voix }, apres, ctx);
    expect(depuis("V") - depuis("v")).toBeCloseTo(POIDS.retrogradation, 9);
  });

  it("une septième tenue quand l'accord change coûte comme une septième qui ne descend pas, et non une septième résolue", () => {
    // En do majeur : sol septième, le fa au ténor ; puis fa majeur, où le ténor tient le fa, ou do majeur,
    // où il descend au mi. Le même accord sans septième fait l'étalon : l'écart est la règle seule.
    const ctx = { tonique: 0, mode: "majeur" as const };
    const v7 = accordsPossibles(74, 0, "majeur", "dominante").find((a) => a.nom === "V7");
    if (!v7) throw new Error("V7 absent sous ré en do majeur");
    const voix: [number, number, number, number] = [74, 71, 65, 55];
    const ecart = (suite: ColonneChoisie) =>
      energiePassage({ accord: v7, voix }, suite, ctx) - energiePassage({ accord: { ...v7, septieme: null }, voix }, suite, ctx);
    expect(ecart({ accord: accord(72, 0, "majeur", "IV"), voix: [72, 69, 65, 53] })).toBeCloseTo(POIDS.septieme, 9);
    expect(ecart({ accord: accord(72, 0, "majeur", "I"), voix: [72, 67, 64, 48] })).toBeCloseTo(0, 9);
  });

  it("chaque mode a les fréquences de ses chorals : la tonique est le degré le moins coûteux, sauf le iv du phrygien", () => {
    const moinsCouteux = (m: ModeChoral) => [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => (coutDuDegre(m, d) < coutDuDegre(m, a) ? d : a), 0);
    expect(Object.fromEntries(MODES_CHORAL.map((m) => [m, moinsCouteux(m)])))
      .toEqual({ majeur: 0, mineur: 0, dorien: 0, phrygien: 3, mixolydien: 0 });
    // Le si diminué de mi est le plus rare du phrygien de Bach, 4,2 % des temps.
    expect(Math.max(...[0, 1, 2, 3, 5, 6].map((d) => coutDuDegre("phrygien", d)))).toBeLessThan(coutDuDegre("phrygien", 4));
  });

  it("une seule dominante secondaire par fondamentale, quand le mode a deux accords sur le même degré", () => {
    // Sol dièse en ré dorien : mi majeur, dominante du v comme du V, une seule fois.
    const replis = accordsPossibles(68, 2, "dorien", "aucune");
    const cles = replis.map((a) => `${a.racine} ${a.tierce} ${a.quinte} ${a.septieme}`);
    expect(new Set(cles).size).toBe(cles.length);
    expect(replis.map((a) => a.nom)).toContain("V/v");
  });
});
