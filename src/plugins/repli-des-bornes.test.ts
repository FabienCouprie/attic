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
import { readFileSync, readdirSync } from "node:fs";
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
    const racine = join(process.cwd(), "src", "plugins");
    const exposes: string[] = [];
    let examines = 0;

    for (const nom of readdirSync(racine)) {
      if (!/\.ts$/.test(nom) || /\.test\./.test(nom)) continue;
      const lignes = readFileSync(join(racine, nom), "utf-8").split(/\r?\n/);
      let fiche = "";
      for (let i = 0; i < lignes.length; i++) {
        const mId = /id: "([a-z0-9-]+)"/.exec(lignes[i]) ?? /effet\("([a-z0-9-]+)"/.exec(lignes[i]);
        if (mId) fiche = mId[1];
        if (!/reglageModule\(/.test(lignes[i])) continue;
        // L'objet d'options tient sur l'appel et les quelques lignes qui le suivent.
        const bloc = lignes.slice(i, i + 6).join(" ");
        const r = /reglage: "([^"]+)"/.exec(bloc);
        if (!r) continue;
        examines++;
        if (/bornes:/.test(bloc)) continue;
        const course = courses.get(`${fiche}|${r[1]}`);
        if (!course) continue;
        if (course[0] === 0 && course[1] === 100) continue;
        exposes.push(`${nom}:${i + 1} · ${fiche} · « ${r[1]} » : borne de ${course[0]}`
          + ` à ${course[1]}, repli laissé à 0-100`);
      }
    }

    // Le contrôle n'a de sens que s'il voit les appels : trente-huit en novembre 2026.
    expect(examines, "aucun appel de `reglageModule` trouvé dans la source")
      .toBeGreaterThan(30);
    expect(exposes, exposes.length === 0 ? "" :
      `${exposes.length} appel(s) laissent le repli de zéro à cent sur une borne qui n'est pas`
      + ` en pour cent :\n  ${exposes.join("\n  ")}`).toEqual([]);
  });
});
