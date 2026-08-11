// plugins/coherence-choix.test.ts
// Garde-fou sur les paramètres de type "choix" de TOUS les nœuds.
//
// Contexte : sans `optionIds`, l'identité canonique d'une option EST sa chaîne
// française — l'Inspector rend `<option value={options[i]}>{libellé traduit}</option>`,
// donc seul le LIBELLÉ est traduit et la valeur stockée reste le terme français.
// C'est fonctionnel, mais fragile : toute confusion entre « libellé affiché » et
// « valeur canonique » réintroduit la classe de bugs déjà rencontrée plusieurs
// fois (défaut anglais stocké tel quel → absent du menu → repli silencieux sur
// la 1ʳᵉ option, ou nœud qui échoue à l'exécution).
//
// Ces tests ne forcent pas la migration vers `optionIds` (chantier à part) ;
// ils verrouillent les invariants qui rendent le schéma actuel sûr.
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import type { ParametreDef } from "../core/types";

interface Cas { fiche: string; param: ParametreDef; ref: string }

const CHOIX: Cas[] = [];
for (const f of registre.tousLesPlugins() as any[]) {
  for (const p of (f.parametres ?? []) as ParametreDef[]) {
    if (p.type === "choix") CHOIX.push({ fiche: f.id, param: p, ref: `${f.id} :: ${p.nom}` });
  }
}

const estNumerique = (s: unknown) => /^\d+([.,]\d+)?$/.test(String(s).trim());

describe("cohérence des paramètres « choix »", () => {
  it("il y a bien des paramètres à vérifier (garde anti-test-vide)", () => {
    expect(CHOIX.length).toBeGreaterThan(100);
  });

  it("optionsEn, quand présent, a la même longueur que options", () => {
    const fautifs = CHOIX
      .filter((c) => c.param.optionsEn?.length && c.param.optionsEn.length !== (c.param.options?.length ?? 0))
      .map((c) => `${c.ref} : optionsEn=${c.param.optionsEn!.length} vs options=${c.param.options?.length}`);
    expect(fautifs).toEqual([]);
  });

  it("`defaut` fait partie des options (ou des optionIds)", () => {
    const fautifs = CHOIX.filter((c) => {
      const { options = [], optionIds = [], defaut } = c.param;
      return !options.includes(String(defaut)) && !optionIds.includes(String(defaut));
    }).map((c) => `${c.ref} : defaut="${c.param.defaut}"`);
    // gestion-nodes « Node à exporter » est peuplé dynamiquement (options vides
    // au démarrage) : son défaut "" est volontaire, pas une incohérence.
    expect(fautifs.filter((f) => !f.startsWith("gestion-nodes :: Node à exporter"))).toEqual([]);
  });

  // Le cœur du garde-fou : une valeur qui ne se traduit pas (taille de fenêtre,
  // fréquence…) ne doit PAS avoir de pendant anglais différent. C'est ce qui a
  // fait afficher « Sine / Square / Sawtooth » à la place de « 1024 / 2048 /
  // 4096 » sur Analyseur de spectre et Spectrogramme (formes d'onde
  // copiées-collées depuis un paramètre d'oscillateur).
  it("une option numérique n'est jamais « traduite » en libellé non numérique", () => {
    const fautifs: string[] = [];
    for (const c of CHOIX) {
      const { options = [], optionsEn = [] } = c.param;
      if (!optionsEn.length) continue;
      options.forEach((v, i) => {
        const en = optionsEn[i];
        if (en !== undefined && estNumerique(v) !== estNumerique(en)) {
          fautifs.push(`${c.ref} : "${v}" (FR) vs "${en}" (EN)`);
        }
      });
    }
    expect(fautifs).toEqual([]);
  });

  it("`defautEn`, quand présent, fait partie de optionsEn (ou des optionIds)", () => {
    const fautifs = CHOIX.filter((c) => {
      const { optionsEn = [], optionIds = [], defautEn } = c.param;
      if (defautEn === undefined || !optionsEn.length) return false;
      return !optionsEn.includes(String(defautEn)) && !optionIds.includes(String(defautEn));
    }).map((c) => `${c.ref} : defautEn="${c.param.defautEn}"`);
    expect(fautifs).toEqual([]);
  });
});
