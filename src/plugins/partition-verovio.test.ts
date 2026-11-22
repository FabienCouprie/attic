// plugins/partition-verovio.test.ts — Une partition gravée ne garde rien de la précédente.
//
// LA REVUE DES NOTATIONS EN TEXTE, 2026-11-22. Verovio garde l'armure d'une partition ABC à la suivante,
// dans son module WebAssembly : la 6.3.0 comme la 6.4.1, éprouvée le même jour. Le nœud chargeait un seul
// toolkit pour toute la vie de l'application, si bien qu'après un air en do bémol, l'air en do se
// gravait avec huit altérations, une par note. Ni un toolkit neuf sur le même module, ni
// `resetOptions`, ni un MEI chargé entre deux airs ne réparaient la fuite ; un module neuf la répare.
// Décision de Fabien : un module neuf à chaque gravure.
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const fiche = registre.trouverDef("partition-verovio") as unknown as FicheLancable;
const AIR_DO = "X:1\nT:Do\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |";
const graver = async (abc: string) => String((await lancerFiche(fiche, { Notation: abc }, { entrees: [null] })).valeurs[0] ?? "");
const accidentelles = (svg: string) => (svg.match(/class="accid/g) ?? []).length;
/** La gravure sans les identifiants que Verovio tire à chaque chargement, partout où ils sont cités. */
function sansIdentifiants(svg: string): string {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).sort((a, b) => b.length - a.length);
  return ids.reduce((s, id) => s.split(id).join("#"), svg);
}

describe("une partition gravée ne garde rien de la précédente", () => {
  it.each([["sol", "G"], ["fa", "F"], ["do bémol", "Cb"], ["do dièse", "C#"]])("l'air en do, gravé après un air en %s, est celui qu'on grave seul", async (_nom, k) => {
    const seul = await graver(AIR_DO);
    expect(accidentelles(seul)).toBe(0);
    await graver(`X:1\nT:Autre\nM:4/4\nL:1/4\nK:${k}\nC D E F |`);
    const apres = await graver(AIR_DO);
    expect(accidentelles(apres)).toBe(0);
    expect(sansIdentifiants(apres)).toBe(sansIdentifiants(seul));
  }, 60_000);
});
