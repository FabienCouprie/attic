// ui/clavier-physique.test.ts — Quand le clavier de l'ordinateur a le droit de faire du son.
//
// Ce défaut ne se voit pas sur un graphe d'essai à un seul clavier : il faut deux claviers pour
// entendre qu'ils sonnent ensemble, et il faut taper dans un champ de texte pour découvrir que la
// lettre « z » joue un do. C'est exactement ce qu'un test attrape et qu'un coup d'œil manque.
import { describe, expect, it } from "vitest";
import { clavierDoitJouer, estChampDeSaisie } from "./clavier-physique";

/** Un faux élément du document : juste ce que la fonction regarde. */
const el = (tagName: string, parent: unknown = null, contentEditable = false) =>
  ({ tagName, parentElement: parent, isContentEditable: contentEditable });

describe("reconnaître un champ de saisie", () => {
  it("voit les trois balises où l'on écrit", () => {
    for (const balise of ["INPUT", "TEXTAREA", "SELECT", "input", "textarea"]) {
      expect(estChampDeSaisie(el(balise)), balise).toBe(true);
    }
  });

  it("voit un élément rendu modifiable", () => {
    expect(estChampDeSaisie(el("DIV", null, true))).toBe(true);
  });

  it("remonte les ascendants : la cible peut être un nœud interne du champ", () => {
    const interne = el("SPAN", el("DIV", el("TEXTAREA")));
    expect(estChampDeSaisie(interne)).toBe(true);
  });

  it("ne prend pas le canevas pour un champ", () => {
    expect(estChampDeSaisie(el("DIV", el("BODY")))).toBe(false);
    expect(estChampDeSaisie(el("BUTTON"))).toBe(false);
  });

  it("supporte une cible absente, ce qu'un événement synthétique peut donner", () => {
    expect(estChampDeSaisie(null)).toBe(false);
    expect(estChampDeSaisie(undefined)).toBe(false);
  });

  it("ne tourne pas indéfiniment sur une chaîne d'ascendants circulaire", () => {
    const a: any = { tagName: "DIV" };
    a.parentElement = a;
    expect(estChampDeSaisie(a)).toBe(false);
  });
});

describe("le droit de jouer", () => {
  it("est refusé à un nœud qui n'est pas sélectionné — c'était tout le défaut", () => {
    // Un clavier posé ailleurs dans le graphe sonnait pendant qu'on travaillait autre part, et
    // deux claviers sonnaient ensemble à chaque touche.
    expect(clavierDoitJouer({ selectionne: false })).toBe(false);
    expect(clavierDoitJouer({ selectionne: false, cible: el("DIV") })).toBe(false);
  });

  it("est accordé au nœud sélectionné", () => {
    expect(clavierDoitJouer({ selectionne: true, cible: el("DIV") })).toBe(true);
  });

  it("est refusé quand on écrit, même sur le nœud sélectionné", () => {
    // Taper un motif dans l'inspecteur du clavier lui-même ne doit pas jouer les lettres.
    expect(clavierDoitJouer({ selectionne: true, cible: el("INPUT") })).toBe(false);
    expect(clavierDoitJouer({ selectionne: true, cible: el("TEXTAREA") })).toBe(false);
  });
});
