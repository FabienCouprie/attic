// audio/formes-onde.test.ts — Aucun réglage n'offre un alias comme identifiant.
//
// CINQ ORTHOGRAPHES DES QUATRE MÊMES ONDES COEXISTAIENT, sur onze composants : l'identifiant `saw`
// chez l'un et `sawtooth` chez les autres, le même jeu dans un ORDRE différent chez un troisième,
// les libellés français capitalisés EN GUISE D'IDENTIFIANTS chez un quatrième, et
// `sinus/carre/dents-de-scie` chez un cinquième. Un composant montrait même ses libellés anglais à
// un lecteur français.
//
// LA PROPRIÉTÉ GARDÉE EST CELLE QUI ÉTAIT FAUSSE. La table d'alias reconnaît tout cela, donc rien
// ne tombait en panne ; ce qui était faux, c'est que le MÊME projet enregistrait quatre valeurs
// différentes pour la même onde, selon le composant. Un réglage peut donc offrir ce qu'il veut,
// mais s'il offre une onde, il l'offre sous son identifiant canonique et jamais sous un alias.
import { describe, expect, it } from "vitest";

import { toutesLesFiches } from "../plugins/index";
import { FORMES_ONDE_CHOIX, LIBELLES_HERITES_FORMES, formeOndeDepuisTimbre } from "./timbres";

describe("la table des formes d'onde et son lecteur", () => {
  it("tout identifiant offert est déjà canonique", () => {
    for (const id of FORMES_ONDE_CHOIX.ids) {
      expect(formeOndeDepuisTimbre(id), id).toBe(id);
    }
  });

  it("les trois colonnes ont la même longueur", () => {
    expect(FORMES_ONDE_CHOIX.fr).toHaveLength(FORMES_ONDE_CHOIX.ids.length);
    expect(FORMES_ONDE_CHOIX.en).toHaveLength(FORMES_ONDE_CHOIX.ids.length);
  });

  it("CHAQUE LIBELLÉ D'AUTREFOIS MÈNE À UNE ONDE OFFERTE", () => {
    // Un libellé hérité qui ne désignerait rien laisserait un projet enregistré sur sa valeur
    // d'avant, c'est-à-dire sur le défaut, sans que rien ne le dise.
    for (const [ancien, vise] of Object.entries(LIBELLES_HERITES_FORMES)) {
      expect(FORMES_ONDE_CHOIX.ids as string[], `« ${ancien} »`).toContain(vise);
    }
  });

  it("et la table d'alias les reconnaît aussi, à la casse près", () => {
    for (const [ancien, vise] of Object.entries(LIBELLES_HERITES_FORMES)) {
      expect(formeOndeDepuisTimbre(ancien), `« ${ancien} »`).toBe(vise);
    }
  });
});

describe("ce que les composants offrent", () => {
  /** Les réglages à choix dont au moins trois identifiants désignent une onde. */
  function reglagesDOnde(): { ou: string; ids: string[] }[] {
    const out: { ou: string; ids: string[] }[] = [];
    for (const f of toutesLesFiches as { id: string; parametres?: unknown[] }[]) {
      for (const p of (f.parametres ?? []) as {
        nom: string; type?: string; options?: unknown[]; optionIds?: string[];
      }[]) {
        const ids = (p.optionIds ?? (p.type === "choix" ? p.options : undefined) ?? []).map(String);
        if (ids.filter((x) => formeOndeDepuisTimbre(x)).length < 3) continue;
        out.push({ ou: `${f.id}·${p.nom}`, ids });
      }
    }
    return out;
  }

  /**
   * Le seul réglage exempté, et sa raison.
   *
   * « GÉNÉRATEUR DE COURBE » N'OFFRE PAS DES ONDES D'OSCILLATEUR, mais des COURBES DE MODULATION :
   * quatorze valeurs dont onze n'ont rien d'une onde, parmi lesquelles une rampe, un tirage
   * aléatoire et cinq lois de probabilité. Ses identifiants sont français de bout en bout —
   * `rampe`, `aleatoire`, `gaussienne`, `khi2` — et son consommateur a son propre type,
   * `FormeCourbe`. Canoniser trois des quatorze rendrait sa liste bilingue sans rien unifier,
   * puisqu'une courbe de modulation ne se branche pas là où une onde se branche.
   */
  const EXEMPTES = ["generateur-courbe·Forme"];

  it("ils sont dix au moins, et le garde les trouve tous", () => {
    expect(reglagesDOnde().length).toBeGreaterThanOrEqual(10);
  });

  it("AUCUN N'OFFRE UN ALIAS COMME IDENTIFIANT", () => {
    // C'est ici que tombent `saw`, « Sinus », « Carré », `scie` et `dents-de-scie` : la table
    // d'alias les reconnaît, mais ce ne sont pas les identifiants sous lesquels une onde
    // s'enregistre, et le même projet en gardait quatre pour la même onde.
    const fautifs: string[] = [];
    for (const r of reglagesDOnde()) {
      if (EXEMPTES.includes(r.ou)) continue;
      for (const id of r.ids) {
        const canonique = formeOndeDepuisTimbre(id);
        if (!canonique) continue; // ce qui n'est pas une onde ne regarde pas ce garde
        if (canonique !== id) fautifs.push(`${r.ou} : « ${id} » est un alias de « ${canonique} »`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("UN SURENSEMBLE RESTE PERMIS, et il ne porte pas que des ondes", () => {
    // Trois composants offrent les quatre ondes PLUS ce que leur moteur sait faire d'autre : une
    // impulsion, un bruit, une phase, des lois de probabilité. Le garde ci-dessus ne les touche pas,
    // puisqu'il ne juge que les identifiants qui désignent une onde. Ce cas le dit, pour qu'on ne
    // vienne pas « unifier » leurs listes en leur retirant ce qui leur est propre.
    const surensembles = reglagesDOnde().filter((r) => r.ids.length > FORMES_ONDE_CHOIX.ids.length);
    expect(surensembles.length).toBeGreaterThanOrEqual(1);
    for (const r of surensembles) {
      const enPlus = r.ids.filter((x) => !formeOndeDepuisTimbre(x));
      expect(enPlus.length, `${r.ou} doit porter autre chose que des ondes`).toBeGreaterThan(0);
    }
  });
});
