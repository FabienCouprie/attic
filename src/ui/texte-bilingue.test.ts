// ui/texte-bilingue.test.ts — Le texte d'une note ou d'un cadre, dans la langue affichée.
import { describe, expect, it } from "vitest";

import { champTexte, texteBilingue } from "./texte-bilingue";

describe("le texte d'une note ou d'un cadre", () => {
  it("UNE NOTE À UN SEUL TEXTE SE COMPORTE COMME AVANT, dans les deux langues", () => {
    // C'est la note qu'un utilisateur écrit sur son canevas : rien ne doit changer pour elle.
    const sienne = { nom: "penser à recaler la coupe" };
    expect(texteBilingue(sienne, "fr")).toBe("penser à recaler la coupe");
    expect(texteBilingue(sienne, "en")).toBe("penser à recaler la coupe");
    expect(champTexte(sienne, "fr")).toBe("nom");
    expect(champTexte(sienne, "en")).toBe("nom");
  });

  it("UNE NOTE À DEUX TEXTES SUIT LA LANGUE", () => {
    const livree = { nom: "Un effet sur un passage", nomEn: "One effect over one passage" };
    expect(texteBilingue(livree, "fr")).toBe("Un effet sur un passage");
    expect(texteBilingue(livree, "en")).toBe("One effect over one passage");
  });

  it("ON MODIFIE LE TEXTE QU'ON LIT : le champ écrit est celui qui est affiché", () => {
    const livree = { nom: "français", nomEn: "english" };
    expect(champTexte(livree, "fr")).toBe("nom");
    expect(champTexte(livree, "en")).toBe("nomEn");
  });

  it("un second texte vidé reste vide, plutôt que de faire revenir le premier", () => {
    // Vider le texte anglais est une décision ; y remettre le français serait la défaire.
    const videe = { nom: "français", nomEn: "" };
    expect(texteBilingue(videe, "en")).toBe("");
    expect(champTexte(videe, "en")).toBe("nomEn");
  });

  // LA VRAIE CAUSE, relevée par Fabien : une note et un cadre naissaient avec leur invite POSÉE
  // DANS LEUR DONNÉE, dans la langue du moment. Ce n'était donc plus une invite mais un texte,
  // figé en français. La création ne pose plus rien, et les graphes déjà enregistrés sont rattrapés.
  it("UNE INVITE POSÉE DANS LA DONNÉE N'EST PAS UN TEXTE, dans les deux langues", () => {
    for (const pose of ["Ajouter une note", "Add a note", "Ajouter un cadre", "Add frame"]) {
      expect(texteBilingue({ nom: pose }, "fr"), pose).toBe("");
      expect(texteBilingue({ nom: pose }, "en"), pose).toBe("");
    }
  });

  it("mais un texte qui ressemble de loin à une invite reste un texte", () => {
    expect(texteBilingue({ nom: "Ajouter une note de bas de page" }, "fr")).toBe("Ajouter une note de bas de page");
  });

  it("des données absentes ou biscornues rendent une chaîne vide, jamais indéfini", () => {
    expect(texteBilingue(undefined, "fr")).toBe("");
    expect(texteBilingue({}, "en")).toBe("");
    expect(texteBilingue({ nom: 42 }, "fr")).toBe("");
    expect(texteBilingue({ nom: "a", nomEn: 7 }, "en")).toBe("a");
  });
});
