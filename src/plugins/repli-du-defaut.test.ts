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
// ET IL N'EXEMPTE QUE LA LECTURE DE MIGRATION DÉCLARÉE. Un appel qui lit un réglage que sa fiche ne
// déclare plus n'a pas de déclaration à comparer : `paramNombre` y retombe sur le littéral, qui est
// alors la valeur de l'ancien réglage, et c'est son seul emploi légitime. Le masque de zones lit
// ainsi « Fondu », qu'il a remplacé par deux fondus nommés.
//
// CE CAS DÉDUISAIT LA MIGRATION D'UNE ABSENCE, jusqu'au 2026-11-11 : tout nom que la fiche ne
// déclarait pas passait pour un ancien réglage, une faute de frappe comprise. La migration est
// désormais un fait déclaré, `anciensReglages` sur la fiche (`plugins/fiche.ts`), et un nom qui n'est
// ni déclaré ni ancien est une faute. Le compilateur la refuse dans les fiches aux noms vérifiés ;
// ce cas la refuse aussi dans celles qui ne le sont pas encore, pour les lectures qu'il voit.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { appelsDeParamNombre } from "../docs/appels-de-reglage";
import { toutesLesFiches } from "./catalogue-pret";

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
    /** Le défaut déclaré de chaque réglage, par fiche ; les réglages déclarés ; les anciens. */
    const defauts = new Map<string, number>();
    const declares = new Set<string>(), anciens = new Set<string>(), connues = new Set<string>();
    for (const f of toutesLesFiches as any[]) {
      connues.add(f.id);
      for (const p of f.parametres ?? []) {
        declares.add(`${f.id}|${p.nom}`);
        if (typeof p.defaut === "number") defauts.set(`${f.id}|${p.nom}`, p.defaut);
      }
      for (const nom of f.anciensReglages ?? []) anciens.add(`${f.id}|${nom}`);
    }

    const ecarts: string[] = [];
    const nonDeclares: string[] = [];
    let examines = 0, migrations = 0;
    for (const a of appelsDeParamNombre(join(process.cwd(), "src"), connues)) {
      const cle = `${a.fiche}|${a.reglage}`;
      // Une fonction d'aide écrite avant toute fiche n'est rattachée à aucune : la pièce 3 du plan.
      if (!a.fiche) continue;
      if (!declares.has(cle)) {
        // Ni déclaré ni ancien : une faute, que le littéral cachait en servant de repli.
        if (anciens.has(cle)) migrations++;
        else nonDeclares.push(`${a.fichier}:${a.ligne} · ${a.fiche} · « ${a.reglage} »`);
        continue;
      }
      const declare = defauts.get(cle);
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
    // « Fondu » du masque de zones et « Instrument » de la boîte à groove, le 2026-11-11.
    expect(migrations, "le cas doit voir les lectures de migration déclarées").toBeGreaterThanOrEqual(2);
    expect(nonDeclares, [
      "Ces appels lisent un réglage que leur fiche ne déclare pas. Une faute de frappe : corrigez le nom.",
      "Un réglage remplacé que l'exécuteur lit encore : nommez-le dans `anciensReglages` sur la fiche.",
    ].join("\n")).toEqual([]);
  });
});
