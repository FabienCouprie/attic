// plugins/micromontage-sources.test.ts — Un numéro de source désigne son port, branché ou non.
//
// LE DÉFAUT RELEVÉ PAR LA LECTURE DU LOT 3e (2026-11-15) : les sources branchées étaient tassées,
// si bien qu'avec les Sources 1 et 3 branchées, « Source » = 2 coupait dans la Source 3, contre la
// notice : « Un numéro sans entrée branchée retombe sur la première. » Le banc de croisement ne le
// voyait pas, qui ne branche que des ports contigus.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { ctxDEssai } from "../core/contexte-essai";
import { empreinteValeurs, sonDEssai } from "../audio/lancer-fiche";
import { sonSecond } from "../audio/croisement-entrees";

describe("le micromontage et ses sources", () => {
  it("UN NUMÉRO SANS ENTRÉE BRANCHÉE RETOMBE SUR LA PREMIÈRE, et non sur la suivante branchée", async () => {
    const fiche = registre.trouverDef("micromontage")!;
    const entrees = [sonDEssai(), null, sonSecond(), null, null, null, null];
    const rendre = async (source: number) => {
      const r = await fiche.executer(ctxDEssai(entrees, { Source: source, "Source, loi": "fixe", Fragments: 40 }) as never);
      return empreinteValeurs([r.valeurs[0]]);
    };
    const [une, deux, trois] = [await rendre(1), await rendre(2), await rendre(3)];
    expect(deux).toBe(une);
    expect(trois).not.toBe(une);
  });
});
