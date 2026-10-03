// ui/favoris.test.ts — Le registre des liens de la barre d'outils.
//
// CE QUE CE TEST TIENT, ET POURQUOI IL EXISTE. La barre d'outils portait en dur une vingtaine de
// bibliothèques de SONS : du domaine logé dans le shell générique, qu'un domaine « données
// tabulaires » aurait hérité tel quel. La liste est partie du côté du domaine, et ce qui reste ici
// est un registre vide par défaut. **Le défaut vide est la moitié qui compte** : sans lui, un
// domaine qui ne déclare rien afficherait un bouton ouvrant un menu sans contenu.
import { beforeEach, describe, expect, it } from "vitest";
import { configurerFavoris, favoris } from "./favoris";

describe("le registre des favoris", () => {
  beforeEach(() => { configurerFavoris([]); });

  it("EST VIDE TANT QUE PERSONNE N'A DÉCLARÉ : la barre n'affiche alors aucun bouton", () => {
    expect(favoris()).toEqual([]);
  });

  it("rend ce que le domaine y dépose, dans l'ordre", () => {
    configurerFavoris([
      { cle: "un", url: "https://exemple.test/un" },
      { cle: "deux", url: "https://exemple.test/deux" },
    ]);
    expect(favoris().map((f) => f.cle)).toEqual(["un", "deux"]);
    expect(favoris()[1].url).toBe("https://exemple.test/deux");
  });

  it("LE DOMAINE AUDIO DÉCLARE SES BIBLIOTHÈQUES, et chacune porte une clé et une adresse", async () => {
    const { FAVORIS_SON } = await import("../audio/favoris");
    expect(FAVORIS_SON.length).toBeGreaterThan(10);
    for (const f of FAVORIS_SON) {
      expect(f.cle, "une clé de traduction `favs.<cle>` est attendue").toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(f.url).toMatch(/^https:\/\//);
    }
    // Les clés sont uniques : deux entrées de même clé afficheraient deux fois le même libellé.
    expect(new Set(FAVORIS_SON.map((f) => f.cle)).size).toBe(FAVORIS_SON.length);
  });
});
