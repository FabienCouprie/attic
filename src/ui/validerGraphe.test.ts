// ui/validerGraphe.test.ts — Tests de la sanitation des arêtes au restore/import.

import { describe, it, expect } from "vitest";
import { filtrerAretesInvalides, validerArete } from "./validerGraphe";
import { validerGraphe } from "../core/validation";
// LE SHELL NE NOMME PLUS SON DOMAINE : il demande le registre actif, qu'une racine de composition
// dépose. Un test qui exerce un module du shell doit donc en déposer un, et c'est un progrès : la
// dépendance au domaine, qui était cachée dans un import, est maintenant écrite dans le test.
import { registre } from "../audio/adaptateur";
import { configurerRegistreUI, type RegistreUI } from "./registre-actif";

configurerRegistreUI(registre as unknown as RegistreUI);

function makeNode(id: string, ficheId: string) {
  return { id, type: "atelier", position: { x: 0, y: 0 }, data: { ficheId, parametres: {} } };
}

function makeEdge(id: string, source: string, target: string, sourceHandle: string, targetHandle: string) {
  return { id, source, target, sourceHandle, targetHandle, type: "arete-personnalisee" };
}

describe("filtrerAretesInvalides", () => {
  it("garde les arêtes dont les handles existent", () => {
    const nodes = [
      makeNode("n1", "entree-audio"),
      makeNode("n2", "amplificateur"),
      makeNode("n3", "sortie-audio"),
    ];
    const edges = [
      makeEdge("e1", "n1", "n2", "out:0", "in:0"),
      makeEdge("e2", "n2", "n3", "out:0", "in:0"),
    ];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("ignore une arête dont la cible n'a pas d'entrée", () => {
    const nodes = [
      makeNode("n1", "amplificateur"),
      makeNode("n2", "entree-audio"),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "out:0", "in:0")];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête dont la source n'a pas de sortie", () => {
    const nodes = [
      makeNode("n1", "galerie-exposition"),
      makeNode("n2", "sortie-audio"),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "out:0", "in:0")];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête dont le handle a un index hors plage", () => {
    const nodes = [
      makeNode("n1", "entree-audio"),
      makeNode("n2", "amplificateur"),
    ];
    const edges = [
      makeEdge("e1", "n1", "n2", "out:0", "in:5"),
      makeEdge("e2", "n1", "n2", "out:9", "in:0"),
    ];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête dont le nœud source ou cible est manquant", () => {
    const nodes = [makeNode("n1", "entree-audio")];
    const edges = [
      makeEdge("e1", "n1", "n2", "out:0", "in:0"),
      makeEdge("e2", "n2", "n1", "out:0", "in:0"),
    ];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });

  it("ignore une arête pointant sur une fiche supprimée (pas de définition)", () => {
    const nodes = [
      makeNode("n1", "entree-audio"),
      makeNode("n2", "whisper-multilingue"),
    ];
    const edges = [makeEdge("e1", "n1", "n2", "out:0", "in:0")];
    const res = filtrerAretesInvalides(nodes, edges);
    expect(res).toEqual([]);
  });
});

// ═══ UN CONTENU DE TEXTE SE REFUSE AU GESTE, ET JAMAIS À LA LECTURE ═══
//
// CE QUE CE CAS TIENT, ET QU'AUCUN AUTRE NE PEUT TENIR. `plugins/sous-types-texte.test.ts` éprouve
// la règle et la table ; il ne dit rien de QUI la consulte. Or toute la sûreté du changement tient
// dans une asymétrie entre deux appelants : la pose d'une arête passe les sous-types, la validation
// d'un graphe ne les passe pas. Déplacer l'un ou l'autre ne ferait tomber aucun cas de la règle, et
// un graphe enregistré se mettrait à perdre ses câbles à l'ouverture.
//
// LA PAIRE ÉPROUVÉE : « MIDI → ABC » rend de l'ABC, « Texte → MIDI » attend une notation. Les deux
// sont du texte, les deux couleurs de port s'accordent, et le résultat vaut zéro note.
describe("un contenu de texte mal branché", () => {
  const abcVersNotation = () => ({
    source: makeNode("n1", "midi-vers-abc"),
    cible: makeNode("n2", "texte-vers-midi"),
    arete: makeEdge("e1", "n1", "n2", "out:0", "in:0"),
  });

  it("SE REFUSE À LA POSE, parce qu'elle passe les sous-types", () => {
    const { source, cible, arete } = abcVersNotation();
    expect(validerArete(source, cible, arete as never)).toBe(false);
  });

  it("ET SURVIT DANS UN GRAPHE DÉJÀ ENREGISTRÉ, parce que sa validation ne les passe pas", () => {
    const { source, cible, arete } = abcVersNotation();
    const res = validerGraphe(
      [source, cible] as never, [arete] as never,
      (ficheId) => registre.trouverDef(ficheId) as never,
      registre.fluxCompatibles,
    );
    expect(res.aretesInvalides, "aucune arête retirée à qui rouvre son travail").toEqual([]);
    // Et la sanitation de l'import ne lui en retire pas non plus.
    expect(filtrerAretesInvalides([source, cible], [arete] as never)).toHaveLength(1);
  });

  it("là où un vrai dépareillement de transport tombe des deux côtés", () => {
    // « Entrée audio » vers « Texte → MIDI » : audio contre texte, et les deux contrôles le disent.
    const source = makeNode("a1", "entree-audio"), cible = makeNode("a2", "texte-vers-midi");
    const arete = makeEdge("e2", "a1", "a2", "out:0", "in:0");
    expect(validerArete(source, cible, arete as never)).toBe(false);
    const res = validerGraphe(
      [source, cible] as never, [arete] as never,
      (ficheId) => registre.trouverDef(ficheId) as never,
      registre.fluxCompatibles,
    );
    expect(res.aretesInvalides).toHaveLength(1);
  });
});
