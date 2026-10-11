// plugins/repli-du-defaut.test.ts — Le littéral d'un appel est le défaut déclaré du réglage.
//
// CE QUE `paramNombre` FAIT DÉSORMAIS, et c'est la racine d'une famille de défauts. Il rend la
// valeur enregistrée sur le nœud ; à défaut, le `defaut` DÉCLARÉ du réglage ; à défaut encore, le
// littéral de l'appel. Avant, le second maillon consultait `defautEn`, le champ du défaut textuel
// traduit, typé sur une chaîne : aucun des réglages numériques du catalogue n'en déclare un qui soit
// un nombre, de sorte que la condition était toujours fausse et que le littéral décidait seul.
//
// CE QUE CELA COÛTAIT. Un nœud créé reçoit chaque réglage déclaré ; un graphe enregistré AVANT qu'un
// réglage existe ne le porte pas. Le littéral décidait donc du sort de ces nœuds, et il pouvait
// différer du défaut que l'inspecteur affiche : le kit de batterie d'un projet ancien sortait sur un
// preset mélodique, et la largeur de l'oscillateur analogique sur un créneau symétrique.
//
// CE QUE CE CONTRAT GARDE. Le littéral n'est plus qu'une redondance, et une redondance qui dérive
// est trompeuse : elle annonce une valeur que le run n'emploie plus. Ce cas exige donc qu'elle dise
// la même chose que la déclaration.
//
// ET IL TOLÈRE, PAR SA FORME, LA LECTURE DE MIGRATION. Un appel qui lit un réglage que sa fiche NE
// DÉCLARE PLUS n'a pas de déclaration à comparer : `paramNombre` y retombe sur le littéral, qui est
// alors la valeur de l'ancien réglage, et c'est son seul emploi légitime. Le masque de zones lit
// ainsi « Fondu », qu'il a remplacé par deux fondus nommés. Aucun nom n'est inscrit ici : c'est
// l'absence de déclaration qui exempte.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { appelsDeParamNombre } from "../docs/appels-de-reglage";
import { toutesLesFiches } from "./index";

describe("le repli d'un réglage absent du nœud", () => {
  it("TOUT RÉGLAGE NUMÉRIQUE DÉCLARE UN DÉFAUT NUMÉRIQUE, sans quoi le repli n'existe pas", () => {
    // C'est la condition du maillon : sans `defaut` numérique sur la déclaration, `paramNombre`
    // retombe sur le littéral et l'on est revenu au point de départ.
    const sans: string[] = [];
    for (const f of toutesLesFiches as any[]) {
      for (const p of f.parametres ?? []) {
        if (p.type === "choix" || p.type === "texte" || p.type === "booleen") continue;
        if (typeof p.plage === "undefined") continue;
        if (typeof p.defaut !== "number") sans.push(`${f.id} · ${p.nom}`);
      }
    }
    expect(sans, sans.length === 0 ? "" :
      `${sans.length} réglage(s) à curseur sans défaut numérique :\n  ${sans.join("\n  ")}`)
      .toEqual([]);
  });

  it("LE LITTÉRAL D'UN APPEL DIT LA MÊME CHOSE QUE LA DÉCLARATION", () => {
    /** Le défaut déclaré de chaque réglage, par fiche. */
    const defauts = new Map<string, number>();
    for (const f of toutesLesFiches as any[]) {
      for (const p of f.parametres ?? []) {
        if (typeof p.defaut === "number") defauts.set(`${f.id}|${p.nom}`, p.defaut);
      }
    }

    const ecarts: string[] = [];
    let examines = 0;
    for (const a of appelsDeParamNombre(join(process.cwd(), "src"))) {
      const declare = defauts.get(`${a.fiche}|${a.reglage}`);
      // Pas de déclaration : lecture de migration, le littéral est sa seule source.
      if (typeof declare !== "number") continue;
      examines++;
      if (a.litteral === declare) continue;
      ecarts.push(`${a.fichier}:${a.ligne} · ${a.fiche} · « ${a.reglage} » :`
        + ` appel ${a.litteral}, déclaré ${declare}`);
    }

    // Le contrôle n'a de sens que s'il voit les appels : plus de mille en novembre 2026.
    expect(examines, "aucun appel de `paramNombre` rattaché à une déclaration")
      .toBeGreaterThan(500);
    expect(ecarts, ecarts.length === 0 ? "" :
      `${ecarts.length} littéral(aux) diffèrent du défaut déclaré :\n  ${ecarts.join("\n  ")}`)
      .toEqual([]);
  });
});
