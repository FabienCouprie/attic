// ui/ports-extensibles.test.ts — La règle du nœud qui s'allonge et se raccourcit.
import { describe, expect, it } from "vitest";
import { etatPorts } from "./ports-extensibles";

const EXT = { min: 2, defaut: 4 };

describe("etatPorts", () => {
  it("un nœud jamais réglé montre le défaut de sa fiche", () => {
    expect(etatPorts(16, EXT, undefined, [])).toEqual({ visibles: 4, peutAjouter: true, peutRetirer: true });
  });

  it("une fiche sans entrées extensibles montre tout, et les boutons ne servent pas", () => {
    expect(etatPorts(3, undefined, 1, [0])).toEqual({ visibles: 3, peutAjouter: false, peutRetirer: false });
  });

  it("ne descend jamais sous la dernière entrée branchée", () => {
    // La piste 6 est câblée : on montre sept pistes, quoi qu'on demande.
    expect(etatPorts(16, EXT, 2, [0, 6]).visibles).toBe(7);
    expect(etatPorts(16, EXT, 2, [0, 6]).peutRetirer).toBe(false);
  });

  it("ni sous le minimum de la fiche, ni au-dessus de ce qu'elle déclare", () => {
    expect(etatPorts(16, EXT, 0, []).visibles).toBe(2);
    expect(etatPorts(16, EXT, 99, []).visibles).toBe(16);
    expect(etatPorts(16, EXT, 16, []).peutAjouter).toBe(false);
  });

  it("un câble sur une entrée qui n'existe pas ne compte pas", () => {
    expect(etatPorts(8, EXT, 4, [42]).visibles).toBe(4);
  });

  it("retirer est possible dès qu'il reste de la place au-dessus du plancher", () => {
    expect(etatPorts(16, EXT, 5, [0, 1])).toEqual({ visibles: 5, peutAjouter: true, peutRetirer: true });
    expect(etatPorts(16, EXT, 2, [])).toEqual({ visibles: 2, peutAjouter: true, peutRetirer: false });
  });
});
