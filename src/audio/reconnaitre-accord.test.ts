// audio/reconnaitre-accord.test.ts — Nomme-t-elle juste, et sait-elle se taire ?
//
// LE CAS QUI PORTE TOUT LE RESTE est le premier : les trente-trois qualités, sur les douze
// fondamentales, doivent se reconnaître elles-mêmes. Trois cent quatre-vingt-seize accords, et la
// comparaison se fait sur les CLASSES rendues et non sur l'identifiant : deux qualités peuvent
// décrire le même son sous deux noms, et refuser l'une des deux serait juger la table plutôt que la
// reconnaissance.
import { describe, expect, it } from "vitest";

import { accordsDeSequence, nomDeLaccord, reconnaitreAccord } from "./reconnaitre-accord";
import { QUALITES, qualiteDe } from "./qualites-accords";

const classes = (xs: readonly number[]) => new Set(xs.map((x) => ((Math.round(x) % 12) + 12) % 12));
const sonDe = (a: { fondamentale: number; qualite: string }) =>
  classes(qualiteDe(a.qualite)!.intervalles.map((i) => a.fondamentale + i));

describe("reconnaître un accord dans des notes", () => {
  it("CHAQUE QUALITÉ SE RECONNAÎT ELLE-MÊME, sur les douze fondamentales", () => {
    const rates: string[] = [];
    for (const q of QUALITES) {
      for (let f = 0; f < 12; f++) {
        const r = reconnaitreAccord(q.intervalles.map((i) => 60 + f + i));
        if (!r) { rates.push(`${q.id} sur ${f} : rien`); continue; }
        const attendu = classes(q.intervalles.map((i) => f + i));
        const rendu = sonDe(r);
        const identique = rendu.size === attendu.size && [...attendu].every((c) => rendu.has(c));
        if (!identique) rates.push(`${q.id} sur ${f} rendu ${r.qualite} sur ${r.fondamentale}`);
      }
    }
    expect(rates).toEqual([]);
  });

  it("et elle les déclare exactes, n'ayant ni note étrangère ni note omise", () => {
    for (const q of QUALITES) {
      const r = reconnaitreAccord(q.intervalles.map((i) => 60 + i))!;
      expect(r.exact, `${q.id}`).toBe(true);
      expect(r.etrangeres).toEqual([]);
      expect(r.omises).toEqual([]);
    }
  });

  it("DEUX NOTES NE FONT PAS UN ACCORD, et elle se tait plutôt que d'inventer la tierce", () => {
    expect(reconnaitreAccord([60, 67])).toBeUndefined();
    expect(reconnaitreAccord([60])).toBeUndefined();
    expect(reconnaitreAccord([])).toBeUndefined();
    // Une octave doublée ne fait pas trois classes, et ne suffit donc pas davantage.
    expect(reconnaitreAccord([60, 67, 72, 79])).toBeUndefined();
  });

  it("UNE QUINTE OMISE EST UNE OMISSION, non une autre qualité", () => {
    // Le cas le plus courant de la pratique : un sol septième sans sa quinte reste un sol septième.
    const r = reconnaitreAccord([67, 71, 77])!;
    expect(r.qualite).toBe("7");
    expect(r.fondamentale).toBe(7);
    expect(r.exact).toBe(false);
    expect(r.omises).toEqual([2]);
    expect(r.etrangeres).toEqual([]);
  });

  it("LA BASSE TRANCHE LES SYMÉTRIES, seul moyen quand les classes ne disent rien", () => {
    // Un diminué de septième rend les mêmes quatre classes pour quatre fondamentales : aucun calcul
    // sur les classes ne peut les départager, puisqu'il n'y a rien à départager.
    expect(reconnaitreAccord([60, 63, 66, 69])!.fondamentale).toBe(0);
    expect(reconnaitreAccord([63, 66, 69, 72])!.fondamentale).toBe(3);
    expect(reconnaitreAccord([66, 69, 72, 75])!.fondamentale).toBe(6);
    // Et l'augmenté de même, sur trois.
    expect(reconnaitreAccord([60, 64, 68])!.fondamentale).toBe(0);
    expect(reconnaitreAccord([64, 68, 72])!.fondamentale).toBe(4);
  });

  it("MAIS ELLE NE L'EMPORTE PAS SUR UNE NOTE ÉTRANGÈRE : un renversement garde sa fondamentale", () => {
    // Mi-sol-do a le mi à la basse, et reste un do majeur : nommer un accord de mi demanderait une
    // qualité que la table n'a pas, donc des notes étrangères, ce qui coûte plus cher que la basse.
    const r = reconnaitreAccord([64, 67, 72])!;
    expect(r.qualite).toBe("maj");
    expect(r.fondamentale).toBe(0);
    expect(r.exact).toBe(true);
  });

  it("une note ajoutée est expliquée quand la table a une qualité pour elle", () => {
    const r = reconnaitreAccord([60, 64, 67, 74])!;
    expect(r.qualite).toBe("add9");
    expect(r.exact).toBe(true);
  });

  it("le nom écrit porte la fondamentale, le symbole, et dit s'il est approché", () => {
    expect(nomDeLaccord(reconnaitreAccord([60, 64, 67])!, false)).toBe("C");
    expect(nomDeLaccord(reconnaitreAccord([62, 65, 69, 72])!, false)).toBe("Dm7");
    expect(nomDeLaccord(reconnaitreAccord([67, 71, 77])!, false)).toContain("approché");
    expect(nomDeLaccord(reconnaitreAccord([67, 71, 77])!, true)).toContain("approx.");
  });
});

describe("les accords d'une séquence", () => {
  const note = (n: number, debut: number, fin: number) => ({ note: n, debut, fin });

  it("CE QUI COMMENCE ENSEMBLE FAIT UN ACCORD, à la tolérance près", () => {
    // Deux notes écrites pour sonner ensemble ne commencent jamais au même millionième dans un
    // fichier joué : grouper sur l'égalité stricte rendrait un accord par note.
    const suite = [
      note(60, 0, 1), note(64, 0.003, 1), note(67, 0.008, 1),
      note(62, 1, 2), note(65, 1, 2), note(69, 1, 2),
    ];
    const r = accordsDeSequence(suite);
    expect(r.length).toBe(2);
    expect(r[0].accord?.qualite).toBe("maj");
    expect(r[1].accord?.qualite).toBe("m");
    expect(r[1].accord?.fondamentale).toBe(2);
  });

  it("et une tolérance trop courte les sépare, ce qui montre que le groupement agit", () => {
    const suite = [note(60, 0, 1), note(64, 0.003, 1), note(67, 0.008, 1)];
    expect(accordsDeSequence(suite, 0.0001).length).toBe(3);
  });

  it("le groupe porte la fin la plus tardive : un accord dure autant que sa note la plus longue", () => {
    const r = accordsDeSequence([note(60, 0, 1), note(64, 0, 2.5), note(67, 0, 1)]);
    expect(r[0].fin).toBe(2.5);
    expect(r[0].debut).toBe(0);
  });

  it("un groupe de moins de trois classes ne porte pas d'accord, et ne fait pas échouer la lecture", () => {
    const r = accordsDeSequence([note(60, 0, 1), note(67, 0, 1), note(62, 2, 3), note(66, 2, 3), note(69, 2, 3)]);
    expect(r.length).toBe(2);
    expect(r[0].accord).toBeUndefined();
    expect(r[1].accord?.qualite).toBe("maj");
  });

  it("une séquence vide ne rend rien", () => {
    expect(accordsDeSequence([])).toEqual([]);
  });

  it("les notes arrivent dans le désordre sans que cela change le résultat", () => {
    const desordre = [note(67, 1, 2), note(60, 0, 1), note(64, 0, 1), note(62, 1, 2), note(67, 0, 1), note(59, 1, 2)];
    const r = accordsDeSequence(desordre);
    expect(r.map((g) => g.debut)).toEqual([0, 1]);
    expect(r[0].accord?.qualite).toBe("maj");
  });
});
