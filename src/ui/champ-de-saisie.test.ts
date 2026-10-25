// @vitest-environment jsdom
// ui/champ-de-saisie.test.ts — Un champ se reconnait, et on sait en sortir.
//
// CE QUE CES CAS TIENNENT. La regle « ne pas intercepter un raccourci quand on tape dans un champ »
// vivait en TROIS exemplaires, dans `App.tsx`, `BarreOutils.tsx` et `LigneDeTemps.tsx`. Ils etaient
// encore identiques au mot pres ; il suffisait qu'un seul oublie `isContentEditable` pour qu'un
// editeur de code voie ses frappes detournees vers le canevas.
//
// ET LA SORTIE DU CHAMP EST LE DEFAUT SIGNALE : le focus restait dans le champ de recherche de la
// palette apres qu'on y ait tape, et les quatre raccourcis du canevas — copier, couper, coller,
// annuler — etaient alors morts. Mesure dans l'application : Ctrl+V et Ctrl+Z ne changeaient RIEN.
import { describe, expect, it } from "vitest";

import { estUnChampDeSaisie, quitterLeChamp } from "./champ-de-saisie";

describe("reconnaitre un champ de saisie", () => {
  it("LES TROIS BALISES QUI SE TAPENT en sont", () => {
    for (const balise of ["input", "textarea", "select"]) {
      expect(estUnChampDeSaisie(document.createElement(balise)), balise).toBe(true);
    }
  });

  it("ET UN CONTENU EDITABLE AUSSI, ce qu'un exemplaire aurait pu oublier", () => {
    const d = document.createElement("div");
    expect(estUnChampDeSaisie(d), "un div ordinaire n'en est pas").toBe(false);
    // jsdom ne calcule pas `isContentEditable` depuis l'attribut : on pose la propriete, qui est ce
    // que la regle lit dans un navigateur.
    Object.defineProperty(d, "isContentEditable", { value: true });
    expect(estUnChampDeSaisie(d)).toBe(true);
  });

  it("un bouton, un div, le canevas : aucun n'en est", () => {
    for (const balise of ["button", "div", "canvas", "span", "a"]) {
      expect(estUnChampDeSaisie(document.createElement(balise)), balise).toBe(false);
    }
  });

  it("ET CE QUI N'EST PAS UN ELEMENT NE LEVE PAS : un evenement porte ce qu'il veut", () => {
    // La regle prend un `EventTarget`, qui peut etre le document, la fenetre, ou rien du tout. Les
    // trois exemplaires precedents transtypaient chacun de leur cote.
    expect(estUnChampDeSaisie(null)).toBe(false);
    expect(estUnChampDeSaisie(undefined)).toBe(false);
    expect(estUnChampDeSaisie(document)).toBe(false);
    expect(estUnChampDeSaisie(window)).toBe(false);
  });
});

describe("quitter le champ", () => {
  it("RELACHE LE CHAMP QUI A LE FOCUS, et dit que c'en etait un", () => {
    const i = document.createElement("input");
    document.body.appendChild(i);
    i.focus();
    expect(document.activeElement).toBe(i);
    expect(quitterLeChamp()).toBe(true);
    expect(document.activeElement, "le corps reprend le focus, la ou le canevas ecoute")
      .toBe(document.body);
    i.remove();
  });

  it("ET NE TOUCHE A RIEN QUAND LE FOCUS N'EST PAS DANS UN CHAMP", () => {
    const b = document.createElement("button");
    document.body.appendChild(b);
    b.focus();
    expect(quitterLeChamp()).toBe(false);
    expect(document.activeElement, "un bouton garde son focus").toBe(b);
    b.remove();
  });

  it("et l'element se passe en argument, pour qu'un appelant puisse viser", () => {
    const i = document.createElement("input");
    document.body.appendChild(i);
    i.focus();
    expect(quitterLeChamp(document.createElement("div")), "ce div n'est pas un champ").toBe(false);
    expect(document.activeElement, "et le champ garde donc son focus").toBe(i);
    expect(quitterLeChamp(i)).toBe(true);
    i.remove();
  });
});
