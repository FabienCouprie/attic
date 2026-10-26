// ui/tailles-noeuds.test.ts — La taille de naissance suit ce qui sera DESSINÉ.
//
// ═══ LE DÉFAUT MESURÉ, ET IL SE VOYAIT DANS UNE TABLE GÉNÉRÉE ═══
//
// La hauteur se déduisait du nombre de ports que la FICHE déclare. Or un nœud extensible n'en
// dessine qu'une partie : le séparateur de canaux déclare les seize canaux de la plus grande
// disposition de ce dépôt et n'en montre deux. Il naissait donc haut de 448 pixels pour montrer
// quatorze ports vides, ce qu'`INTERFACE.md` imprimait noir sur blanc.
//
// TROIS AUTRES NŒUDS LE PAYAIENT DÉJÀ, du côté des entrées : « Jointure de cercles », « Rendu de
// cercles » et « Jointure de séquences » naissaient à 272 pixels pour en montrer deux, soit 140.
import { describe, expect, it } from "vitest";
import { tailleDefaut } from "./tailles-noeuds";
import type { FicheUI } from "./registre-actif";

const fiche = (o: Partial<FicheUI>): FicheUI => ({
  id: "essai", nom: "Essai", univers: "Traitement", famille: "Effets",
  entrees: [], sorties: [], parametres: [], ...o,
} as FicheUI);

const port = (n: number) => Array.from({ length: n }, (_, i) => ({ nom: `P${i}`, type: "audio" }));

describe("la taille de naissance d'un nœud", () => {
  it("SUIT LE DÉFAUT D'UN CÔTÉ EXTENSIBLE, ET NON CE QUE LA FICHE DÉCLARE", () => {
    // Seize sorties déclarées, deux dessinées : la hauteur est celle de deux.
    const seize = fiche({ sorties: port(16), sortiesExtensibles: { min: 1, defaut: 2 } });
    expect(tailleDefaut(seize), [
      "",
      "UN NŒUD EXTENSIBLE NAÎT À LA TAILLE DE CE QU'IL NE MONTRE PAS.",
      "",
      "La hauteur doit suivre le `defaut` déclaré, qui est le nombre de ports réellement dessinés.",
      "Sans cela le séparateur de canaux naît haut de 448 pixels pour en montrer deux, et quatorze",
      "ports vides occupent le canevas. Voir `ui/ports-extensibles.ts`.",
      "",
    ].join("\n")).toEqual({ width: 240, height: 2 * 22 + 96 });
    // Et sans extension, c'est bien le compte déclaré qui décide.
    expect(tailleDefaut(fiche({ sorties: port(16) })).height).toBe(16 * 22 + 96);
  });

  it("et la règle vaut des deux côtés du nœud", () => {
    const entrees = fiche({ entrees: port(8), entreesExtensibles: { min: 2, defaut: 2 } });
    expect(tailleDefaut(entrees).height).toBe(2 * 22 + 96);
  });

  it("le côté le plus fourni décide, extension comprise", () => {
    // Deux entrées dessinées, six sorties déclarées sans extension : ce sont les six qui comptent.
    const mixte = fiche({
      entrees: port(8), entreesExtensibles: { min: 2, defaut: 2 }, sorties: port(6),
    });
    expect(tailleDefaut(mixte).height).toBe(6 * 22 + 96);
  });

  it("un nœud sans aucun port garde une hauteur d'une rangée", () => {
    // `Math.max(..., 1)` : sans ce plancher, un générateur sans entrée naîtrait plat.
    expect(tailleDefaut(fiche({})).height).toBe(1 * 22 + 96);
  });
});
