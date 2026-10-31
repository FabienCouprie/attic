// @vitest-environment jsdom
// plugins/sans-sortie.test.ts — Un composant sans sortie dit son échec, puisque le moteur ne peut
// pas le deviner.
//
// LA RÈGLE DU MOTEUR, ÉCRITE DANS `estResultatEnErreur` : un composant est en erreur s'il pose
// `erreur`, OU si toutes ses valeurs sont nulles ALORS QU'IL DÉCLARE DES SORTIES. Le second filet a
// donc une maille par où passent ceux qui n'ont aucune sortie — ils écrivent dans un dossier,
// ouvrent une fenêtre, filment l'application — et ceux-là ne peuvent se signaler que par le premier.
//
// CE QUE CETTE MAILLE A LAISSÉ PASSER, mesuré sur le catalogue : VINGT-HUIT chemins d'échec, sur
// onze composants, annonçaient « Terminé ». Absence d'Electron, dossier non configuré, aucun fichier
// trouvé, aucune piste branchée. La même absence d'Electron s'affichait « Erreur » sur « Export
// SVG » — qui déclare une sortie — et « Terminé » sur « Carte sonore », qui n'en déclare pas.
//
// CE CAS LANCE DONC CHAQUE FICHE SANS SORTIE À VIDE, sans aucune entrée et sur ses réglages par
// défaut, et exige qu'elle se déclare en erreur. À vide, aucune ne peut avoir travaillé : celle qui
// annoncerait une réussite mentirait forcément.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";
import { estResultatEnErreur } from "../core/execution";
import { ctxDEssai } from "../core/contexte-essai";

/**
 * Les fiches sans sortie qui ont RAISON de ne pas se déclarer en erreur à vide, avec leur raison.
 *
 * Une fiche déclarée ici n'est pas comptée fautive ; une fiche fautive non déclarée fait tomber le
 * cas. C'est la forme du registre des nomenclatures : ce qui déroge se déclare et porte sa raison.
 */
const ABOUTISSENT_A_VIDE: Record<string, string> = {
  "__sortie-frontiere":
    "Frontière d'un méta-composant, et non un composant du catalogue : elle ne calcule rien et n'a rien à signaler. Le moteur l'aplatit avant l'exécution.",
};

describe("les composants sans sortie", () => {
  it("DISENT LEUR ÉCHEC, puisque le moteur ne peut pas le deviner", async () => {
    const aboutissent: string[] = [];
    let eprouvees = 0;
    for (const f of toutesLesFiches as any[]) {
      if ((f.sorties ?? []).length > 0) continue;
      eprouvees++;
      const entrees = (f.entrees ?? []) as any[];
      const ctx = ctxDEssai(entrees.map(() => null), {}, { id: "n", ficheId: f.id });
      let res: any;
      try {
        res = await f.executer(ctx as any);
      } catch {
        // UNE LEVÉE EST UN REFUS : le moteur la rattrape et marque le nœud.
        continue;
      }
      if (!estResultatEnErreur(f, res)) aboutissent.push(f.id);
    }
    // LE COMPTE EST TENU LUI AUSSI : un banc qui n'éprouverait plus rien passerait en silence.
    expect(eprouvees, "le banc doit éprouver toutes les fiches sans sortie du catalogue")
      .toBeGreaterThanOrEqual(10);
    expect(aboutissent.sort(), [
      "Un composant sans sortie a été lancé à vide, sans entrée ni réglage, et il a annoncé une",
      "réussite. Il ne peut rien avoir fait : il doit poser `erreur: true`, le moteur ne pouvant",
      "pas le déduire d'une valeur nulle faute de sortie déclarée.",
    ].join("\n")).toEqual(Object.keys(ABOUTISSENT_A_VIDE).sort());
  }, 120000);

  it("et chaque aboutissement déclaré porte une raison écrite", () => {
    for (const [id, raison] of Object.entries(ABOUTISSENT_A_VIDE)) {
      expect(raison.length, id).toBeGreaterThan(60);
      expect(raison.trim().endsWith("."), id).toBe(true);
    }
  });
});
