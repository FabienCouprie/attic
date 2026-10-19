// ui/texte-en-cours.test.ts — Ce qu'un champ de texte ignore, et ce qu'il adopte.
//
// CE QUE CE TEST TIENT. La regle a deux moities, et n'en garder qu'une donne un defaut chacune.
//
//   Sans la premiere, le champ adopte ce qui lui revient pendant qu'on tape : c'est le defaut
//   d'origine, le curseur qui saute a la fin des la premiere correction.
//
//   Sans la seconde, le champ n'adopte plus rien : une remise a zero, une annulation ou un
//   changement de langue laisseraient a l'ecran un texte que le magasin ne porte plus.
//
// ET LE CAS QUI A DECIDE DE LA FORME DE LA REGLE est celui de l'echo en retard : apres deux
// frappes, un rendu qui reporte encore la valeur intermediaire. Une regle qui se contenterait de
// comparer a la derniere frappe l'adopterait, et le defaut reviendrait sous une autre forme. C'est
// pourquoi le focus entre dans la decision, et le cas est tenu ci-dessous.
import { describe, expect, it } from "vitest";
import { creerSuiviTexte } from "./texte-en-cours";

describe("le suivi d'un texte en cours de frappe", () => {
  it("ignore l'echo de ce qu'on vient d'envoyer", () => {
    const s = creerSuiviTexte("Bonjur le monde");
    expect(s.frappe("Bonjour le monde")).toBe("Bonjour le monde");
    expect(s.recu("Bonjour le monde", true)).toBeNull();
  });

  it("IGNORE UN ECHO EN RETARD, le cas qui faisait sauter le curseur", () => {
    const s = creerSuiviTexte("");
    s.frappe("a");
    s.frappe("ab");
    // Le rendu qui reporte encore « a » arrive apres la seconde frappe. Pendant la frappe, il ne
    // doit rien changer : l'adopter effacerait le « b » et poserait le curseur a la fin.
    expect(s.recu("a", true)).toBeNull();
    expect(s.recu("ab", true)).toBeNull();
    expect(s.dernier).toBe("ab");
  });

  it("ignore meme une valeur etrangere pendant la frappe : le champ est le proprietaire", () => {
    const s = creerSuiviTexte("mon texte");
    s.frappe("mon texte corrige");
    expect(s.recu("", true)).toBeNull();
    expect(s.dernier).toBe("mon texte corrige");
  });

  it("adopte une remise a zero des que le champ est quitte", () => {
    const s = creerSuiviTexte("mon texte");
    s.frappe("mon texte corrige");
    expect(s.recu("", false)).toBe("");
    expect(s.dernier).toBe("");
  });

  it("adopte le texte de l'autre langue quand une note change de champ", () => {
    const s = creerSuiviTexte("Le texte francais");
    expect(s.recu("The English text", false)).toBe("The English text");
    expect(s.recu("The English text", false)).toBeNull();
  });

  it("adopte une annulation qui ramene exactement le texte d'avant la frappe", () => {
    const s = creerSuiviTexte("Bonjur");
    s.frappe("Bonjour");
    expect(s.recu("Bonjur", false)).toBe("Bonjur");
  });

  it("n'adopte pas, hors frappe, ce qu'il porte deja", () => {
    const s = creerSuiviTexte("depart");
    expect(s.dernier).toBe("depart");
    expect(s.recu("depart", false)).toBeNull();
  });

  it("reprend la main apres avoir adopte, et ignore de nouveau l'echo", () => {
    const s = creerSuiviTexte("un");
    expect(s.recu("deux", false)).toBe("deux");
    s.frappe("deux trois");
    expect(s.recu("deux", true)).toBeNull();
    expect(s.recu("deux trois", true)).toBeNull();
  });
});
