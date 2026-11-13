// src/plugins/ordre-du-catalogue.test.ts — Le catalogue garde ses fiches, et dans leur ordre.
//
// ÉCRIT QUAND `plugins/index.ts` A ÉTÉ COUPÉ EN CATÉGORIES, le 2026-11-13. Ce fichier était un
// baril de deux cent cinquante-quatre imports suivis d'une liste dans un autre ordre, et c'est cet
// ordre-là que le registre suivait. Le recoudre en huit fichiers, c'est reporter deux cent
// cinquante-quatre lignes à la main : en oublier une retire des composants sans que rien ne casse,
// en déplacer une change l'ordre sans que rien ne le dise.
//
// LA RÉFÉRENCE A ÉTÉ ÉCRITE DEPUIS L'ANCIEN BARIL, avant la coupe. C'est ce qui fait de ce cas une
// preuve et non une tautologie : il compare le catalogue recousu à ce que rendait celui d'avant, et
// non à lui-même.
//
// L'ORDRE NE SE VOIT PAS À L'ÉCRAN : la palette, `COMPONENTS.md` et `INTERFACE.md` trient. Il se
// garde quand même, parce qu'un ordre qui bouge sans qu'on l'ait voulu est le signe d'une catégorie
// mal recousue, et c'est exactement ce que la coupe pouvait faire.
//
// UN COMPOSANT AJOUTÉ, RETIRÉ OU DÉPLACÉ change la référence, et c'est voulu : elle se réécrit avec
// le catalogue, par `npm run docs:components`, que l'ajout d'un nœud demande déjà. Le diff de
// `ordre-du-catalogue.txt` dit alors où il s'est posé.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toutesLesFiches } from "./catalogue-pret";

const CHEMIN = join(process.cwd(), "src", "plugins", "ordre-du-catalogue.txt");
const ecrire = process.env.ECRIRE_CATALOGUE === "1";
const ids = () => toutesLesFiches.map((f) => f.id);

it.skipIf(!ecrire)("écrit l'ordre du catalogue", () => {
  writeFileSync(CHEMIN, `${ids().join("\n")}\n`);
  console.log(`ordre-du-catalogue.txt : ${ids().length} fiches.`);
});

describe.skipIf(ecrire)("l'ordre du catalogue", () => {
  it("LES MÊMES FICHES, DANS LE MÊME ORDRE, que la référence", () => {
    expect(existsSync(CHEMIN), "src/plugins/ordre-du-catalogue.txt est absent : lancez « npm run docs:components »")
      .toBe(true);
    const reference = readFileSync(CHEMIN, "utf8").replace(/\r\n/g, "\n").split("\n").filter(Boolean);
    const actuel = ids();
    const k = reference.findIndex((id, i) => actuel[i] !== id);
    const ecart = k >= 0 ? k : actuel.length !== reference.length ? Math.min(actuel.length, reference.length) : -1;
    expect(ecart < 0 ? null : [
      `rang ${ecart} : la référence porte « ${reference[ecart] ?? "(fin)"} », le catalogue « ${actuel[ecart] ?? "(fin)"} »`,
      `${actuel.length} fiches au catalogue, ${reference.length} dans la référence.`,
      `absentes du catalogue : ${reference.filter((id) => !actuel.includes(id)).join(", ") || "aucune"}`,
      `absentes de la référence : ${actuel.filter((id) => !reference.includes(id)).join(", ") || "aucune"}`,
    ].join("\n"), [
      "Le catalogue ne rend plus les fiches de la référence, ou plus dans le même ordre.",
      "Si c'est voulu (un composant ajouté, retiré ou déplacé) : « npm run docs:components », puis relire le diff.",
    ].join("\n")).toBe(null);
  });
});
