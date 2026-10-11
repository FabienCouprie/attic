// plugins/repli-des-bornes.test.ts — Ce qu'une borne vaut sur un nœud qui ne la porte pas encore.
//
// LA FAUTE QUE CE CONTRAT ARRÊTE. `reglageModule` lit les deux bornes par `paramNombre`, qui rend
// la valeur enregistrée sur le nœud ; à défaut, le repli donné par l'appel. Un nœud CRÉÉ reçoit
// chaque réglage déclaré, bornes comprises, mais un graphe ENREGISTRÉ AVANT que la borne existe ne
// la porte pas : ni le chargeur ni la sérialisation ne complètent les réglages manquants.
//
// LE REPLI PAR DÉFAUT DE L'AIDE EST ZÉRO ET CENT, ce qui est juste pour un pour cent et faux pour
// tout le reste. Sur un seuil en décibels ou un temps en secondes, une courbe branchée sur un tel
// nœud balaierait zéro à cent dans la mauvaise unité, sans qu'aucune erreur ne soit levée : le son
// sortirait, simplement faux.
//
// POURQUOI LA SOURCE EST LUE, ET NON SEULEMENT LE REGISTRE. Le repli n'est pas un champ de la
// fiche : c'est un argument d'appel, qui ne laisse aucune trace dans la définition. Le registre dit
// quelle est la course d'une borne, la source dit si l'appel la donne ; il faut les deux, et c'est
// la jointure qui fait ce contrat. La fiche d'un appel est celle qui le précède le plus près dans
// le fichier.
//
// LES FICHES BÂTIES PAR `effet()` NE SONT PAS CONCERNÉES : ce socle lit les bornes lui-même, et
// passe déjà `m.defauts ?? m.bornes` en repli.
import { appelsDeReglage } from "../docs/appels-de-reglage";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";

/** La course déclarée de chaque paire de bornes, par fiche et par réglage borné. */
function coursesDesBornes(): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const f of toutesLesFiches as any[]) {
    for (const b of f.parametres ?? []) {
      if (!b.modulationDe || !b.plage) continue;
      out.set(`${f.id}|${b.modulationDe}`, b.plage);
    }
  }
  return out;
}

describe("le repli des bornes d'un réglage modulé", () => {
  it("UN APPEL SUR UNE BORNE QUI N'EST PAS DE ZÉRO À CENT DONNE SON REPLI", () => {
    const courses = coursesDesBornes();
    // LE BLOC D'UN APPEL SE LIT JUSQU'À SA FERMETURE, et non sur un nombre de lignes. Ce contrôle
    // lisait une fenêtre de six lignes : un appel qui porte trois lignes de commentaire la dépasse,
    // et le garde annonçait alors un argument manquant qui était écrit deux lignes plus bas.
    // `docs/appels-de-reglage.ts` compte les accolades, et les deux contrats y passent.
    const exposes: string[] = [];
    let examines = 0;
    for (const a of appelsDeReglage(join(process.cwd(), "src"))) {
      examines++;
      if (/bornes:/.test(a.bloc)) continue;
      const course = courses.get(`${a.fiche}|${a.reglage}`);
      if (!course) continue;
      if (course[0] === 0 && course[1] === 100) continue;
      exposes.push(`${a.fichier}:${a.ligne} · ${a.fiche} · « ${a.reglage} » :`
        + ` borne de ${course[0]} à ${course[1]}, repli laissé à 0-100`);
    }

    // Le contrôle n'a de sens que s'il voit les appels : trente-huit en novembre 2026.
    expect(examines, "aucun appel de `reglageModule` trouvé dans la source")
      .toBeGreaterThan(30);
    expect(exposes, exposes.length === 0 ? "" :
      `${exposes.length} appel(s) laissent le repli de zéro à cent sur une borne qui n'est pas`
      + ` en pour cent :\n  ${exposes.join("\n  ")}`).toEqual([]);
  });
});
