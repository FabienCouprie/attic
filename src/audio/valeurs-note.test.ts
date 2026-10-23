// audio/valeurs-note.test.ts — Le triolet s'écrit d'une seule façon, et en français.
//
// CE QUE LE RELEVÉ A TROUVÉ. Onze réglages offrent une valeur de note, sous sept formes. Les
// sous-ensembles diffèrent légitimement, chaque composant ayant sa grille ; le TRIOLET, lui,
// s'écrivait de trois façons : `1/8t` comme identifiant chez deux composants, `1/8 triplet` chez
// un troisième, et le libellé français disait « 1/8 de triolet » chez l'un, « 1/8 triplet » chez
// les deux autres.
//
// ET « TRIPLET » EST UN MOT ANGLAIS DANS UNE LISTE FRANÇAISE. Le dépôt a déjà payé ce défaut-là :
// une table de langues affichait « English » dans sa liste française. Un libellé n'est pas une
// paraphrase de l'anglais, c'est le mot de la langue où il s'affiche.
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import type { ParametreDef } from "../core/types";
import { LIBELLES_HERITES_VALEURS, VALEURS_NOTE, choixValeurs, valeurNote } from "./valeurs-note";

describe("la table des valeurs de note", () => {
  it("chaque valeur porte un identifiant et deux noms, et aucun n'est porté deux fois", () => {
    const ids = new Set<string>();
    for (const v of VALEURS_NOTE) {
      expect(v.fr.length, v.id).toBeGreaterThan(0);
      expect(v.en.length, v.id).toBeGreaterThan(0);
      expect(valeurNote(v.id), v.id).toBe(v);
      expect(ids.has(v.id), `${v.id} est déclaré deux fois`).toBe(false);
      ids.add(v.id);
    }
  });

  it("LE TRIOLET SE DIT EN FRANÇAIS ET EN ANGLAIS, chacun dans sa langue", () => {
    expect(valeurNote("1/8t")!.fr).toBe("1/8 de triolet");
    expect(valeurNote("1/8t")!.en).toBe("1/8 triplet");
    expect(valeurNote("1/16t")!.fr).toBe("1/16 de triolet");
  });

  it("rend les trois listes dans l'ordre demandé, et non dans le sien", () => {
    const c = choixValeurs(["1/32", "1/16", "1/8"]);
    expect(c.optionIds).toEqual(["1/32", "1/16", "1/8"]);
    expect(c.options).toEqual(["1/32", "1/16", "1/8"]);
  });

  it("REFUSE UNE VALEUR QU'ELLE NE PORTE PAS, plutôt que de rendre une liste amputée", () => {
    expect(() => choixValeurs(["1/8", "1/3"])).toThrow(/1\/3/);
    expect(() => choixValeurs(["1/8 triplet"])).toThrow();
  });

  it("les anciennes écritures nommées désignent une valeur de la table", () => {
    // UNE ANCIENNE ÉCRITURE QUI NE DÉSIGNE RIEN NE REND PAS SON PROJET : elle le laisse tomber sur
    // le défaut, ce qu'elle existe précisément pour empêcher.
    for (const [ancienne, id] of Object.entries(LIBELLES_HERITES_VALEURS)) {
      expect(valeurNote(id), `« ${ancienne} » désigne « ${id} », qui n'est pas dans la table`).toBeTruthy();
      expect(valeurNote(ancienne), `« ${ancienne} » est aussi un identifiant`).toBeUndefined();
    }
  });
});

describe("le parc entier", () => {
  it("AUCUNE LISTE FRANÇAISE NE DIT « triplet », qui est le mot anglais", () => {
    // LE GARDE PORTE SUR CE QUI S'AFFICHE, et non sur un nom de constante : il lit les libellés
    // français de tous les réglages à choix du registre. Un composant neuf qui écrirait sa grille
    // à la main, sous n'importe quel nom, tomberait ici.
    const fautifs: string[] = [];
    for (const f of registre.tousLesPlugins() as any[]) {
      for (const p of (f.parametres ?? []) as ParametreDef[]) {
        if (p.type !== "choix") continue;
        for (const libelle of p.options ?? []) {
          if (/triplet/i.test(String(libelle))) fautifs.push(`${f.id}·${p.nom} : « ${libelle} »`);
        }
      }
    }
    expect(
      fautifs,
      `le triolet se dit « de triolet » en français ; « triplet » est le mot anglais, et il a sa place dans \`optionsEn\` :\n${fautifs.join("\n")}`,
    ).toEqual([]);
  });

  it("et la liste anglaise, elle, le dit", () => {
    // SANS CE CAS, LE PRÉCÉDENT SE SATISFERAIT D'UN PARC QUI N'OFFRE PLUS DE TRIOLET DU TOUT.
    const anglais = (registre.tousLesPlugins() as any[])
      .flatMap((f) => (f.parametres ?? []) as ParametreDef[])
      .flatMap((p) => (p.type === "choix" ? p.optionsEn ?? [] : []))
      .filter((x) => /triplet/i.test(String(x)));
    expect(anglais.length, "le triolet doit rester offert, en anglais sous son mot").toBeGreaterThan(1);
  });
});
