// plugins/defaut-selon.test.ts — Une liaison de réglages ne nomme que ce que sa fiche porte.
//
// POURQUOI CE GARDE. `defautSelon` (`core/types.ts`) dit qu'un réglage prend un autre défaut selon la
// valeur d'un réglage voisin, et ses clés sont les `optionIds` de ce voisin. Une clé mal écrite,
// `logistic` pour `logistique`, ne serait jamais rencontrée : la liaison se tairait, sans une erreur,
// et la fréquence resterait à la cadence d'un oscillateur. Une clé se vérifie contre la fiche ; c'est
// la raison pour laquelle la liaison est déclarée en données plutôt qu'en fonction.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "./index";

const liaisons = toutesLesFiches.flatMap((f) => f.parametres
  .filter((p) => p.defautSelon)
  .map((p) => ({ fiche: f, reglage: p, lie: p.defautSelon! })));

describe("les réglages dont le défaut dépend d'un autre", () => {
  it("CHAQUE CLÉ EST UN `optionId` DU RÉGLAGE NOMMÉ, et chaque défaut tient dans la plage", () => {
    // L'INSTRUMENT DIT CE QU'IL A LU : sans liaison, ce cas passerait sans rien tenir.
    expect(liaisons.length, "la « Fréquence » de « Courbe » en déclare une le 2026-11-21").toBeGreaterThan(0);
    const fautes = liaisons.flatMap(({ fiche, reglage, lie }) => {
      const voisin = fiche.parametres.find((p) => p.nom === lie.reglage);
      const ici = `${fiche.id} · « ${reglage.nom} »`;
      if (!voisin) return [`${ici} : le réglage « ${lie.reglage} » n'existe pas sur la fiche`];
      if (!voisin.optionIds?.length) return [`${ici} : « ${lie.reglage} » n'a pas d'optionIds`];
      // UN DÉFAUT EST UN NOMBRE OU UN TEXTE, et chaque valeur liée a son type : un texte depuis le
      // 2026-11-21, la progression d'une grille d'accords qui suit sa gamme.
      if (typeof reglage.defaut !== "number" && typeof reglage.defaut !== "string") return [`${ici} : son défaut n'est ni un nombre ni un texte`];
      const [bas, haut] = reglage.plage ?? [-Infinity, Infinity];
      return Object.entries(lie.valeurs).flatMap(([cle, v]) => [
        ...(voisin.optionIds!.includes(cle) ? [] : [`${ici} : « ${cle} » n'est pas un optionId de « ${lie.reglage} »`]),
        ...(typeof v === typeof reglage.defaut ? [] : [`${ici} : ${v} pour « ${cle} » n'est pas du type de son défaut`]),
        ...(typeof v !== "number" || (v >= bas && v <= haut) ? [] : [`${ici} : ${v} pour « ${cle} » sort de la plage [${bas}, ${haut}]`]),
      ]);
    });
    expect(fautes, ["", "UNE LIAISON DE RÉGLAGES NOMME CE QUE SA FICHE NE PORTE PAS :", ...fautes, ""].join("\n")).toEqual([]);
  });
});
