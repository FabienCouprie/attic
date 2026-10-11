// plugins/echelle-des-bornes.test.ts — Une course en hertz se parcourt en multipliant.
//
// LA RÈGLE EST CELLE DU DÉPÔT, et sa mécanique est déjà éprouvée par
// `audio/courbe-progression.test.ts` : « le hertz et le battement par minute se parcourent en
// multipliant », et « chaque tranche égale de courbe couvre le même nombre d'octaves ». Une course
// de mille à seize mille hertz parcourue en AJOUTANT passe les deux tiers de son temps au-dessus de
// six mille, là où l'oreille entend des intervalles.
//
// CE QU'AUCUN GARDE NE TENAIT ÉTAIT QU'UN APPEL LA DEMANDE. L'échelle n'est pas un champ de la
// fiche : c'est un argument, et le banc de câblage ne peut pas la voir, ses deux bornes partant de
// zéro, ce qui désactive l'échelle multiplicative par construction. Quatre bornes en hertz ont donc
// balayé en ajoutant sans que rien ne le dise.
//
// DEUX CHEMINS, ET CE CAS NE REGARDE QUE LE SECOND. Les fiches bâties par `effet()` déduisent
// désormais l'échelle de l'unité par `progressionPour`, de sorte qu'il n'y a rien à y demander.
// Les fiches écrites à la main appellent `reglageModule`, qui ne connaît pas l'unité : elles
// doivent la dire, et c'est cela qu'on vérifie.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { estUniteMultiplicative } from "../audio/courbe";
import { appelsDeReglage } from "../docs/appels-de-reglage";
import { toutesLesFiches } from "./index";

describe("l'échelle des bornes d'un réglage modulé", () => {
  it("UNE BORNE EN UNITÉ MULTIPLICATIVE LUE PAR `reglageModule` DEMANDE SON ÉCHELLE", () => {
    /** L'unité de chaque paire de bornes, par fiche et par réglage borné. */
    const unites = new Map<string, string>();
    for (const f of toutesLesFiches as any[]) {
      for (const b of f.parametres ?? []) {
        if (!b.modulationDe || !b.unite) continue;
        unites.set(`${f.id}|${b.modulationDe}`, b.unite);
      }
    }

    const muettes: string[] = [];
    let examines = 0;
    for (const a of appelsDeReglage(join(process.cwd(), "src"))) {
      const unite = unites.get(`${a.fiche}|${a.reglage}`);
      if (!unite || !estUniteMultiplicative(unite)) continue;
      examines++;
      if (/echelle:/.test(a.bloc)) continue;
      muettes.push(`${a.fichier}:${a.ligne} · ${a.fiche} · « ${a.reglage} » :`
        + ` unité « ${unite} », échelle non demandée`);
    }

    // Le contrôle n'a de sens que s'il voit des appels : un en novembre 2026.
    expect(examines, "aucune borne en unité multiplicative lue par `reglageModule`")
      .toBeGreaterThan(0);
    expect(muettes, muettes.length === 0 ? "" :
      `${muettes.length} appel(s) laissent une course multiplicative se parcourir en ajoutant :`
      + `\n  ${muettes.join("\n  ")}`).toEqual([]);
  });
});
