// plugins/prompt-graphe.test.ts — Vérifie la robustesse du chemin Ollama de
// prompt-vers-graphe : la sortie d'un LLM n'est jamais du JSON de confiance
// (texte parasite, code fence, id halluciné) et le point d'insertion sur le
// canevas (App.tsx:onGrapheGenere) ne valide RIEN — cette couche est la seule
// ligne de défense contre un nœud orphelin/cassé.
import { describe, it, expect } from "vitest";
import { extraireJson, validerSpec } from "./prompt-graphe";

describe("extraireJson", () => {
  it("parse un objet JSON nu", () => {
    expect(extraireJson('{"nodes":[],"edges":[]}')).toEqual({ nodes: [], edges: [] });
  });

  it("extrait le JSON d'un bloc de code markdown ```json ... ```", () => {
    const texte = "Voici le graphe :\n```json\n{\"nodes\":[{\"ficheId\":\"a\",\"label\":\"A\"}],\"edges\":[]}\n```\nVoilà !";
    expect(extraireJson(texte)).toEqual({ nodes: [{ ficheId: "a", label: "A" }], edges: [] });
  });

  it("extrait le JSON entouré de texte parasite sans fence", () => {
    const texte = "Bien sûr, voici : {\"nodes\":[],\"edges\":[]} — j'espère que ça aide.";
    expect(extraireJson(texte)).toEqual({ nodes: [], edges: [] });
  });

  it("retourne null pour du texte sans JSON", () => {
    expect(extraireJson("Je ne peux pas générer de graphe pour cette demande.")).toBeNull();
  });

  it("retourne null pour du JSON malformé", () => {
    expect(extraireJson("{\"nodes\": [oops}")).toBeNull();
  });
});

describe("validerSpec", () => {
  const idsValides = new Set(["entree-audio", "reverb", "sortie-audio"]);

  it("accepte une spec valide", () => {
    const brut = { nodes: [{ ficheId: "entree-audio", label: "Entrée" }, { ficheId: "sortie-audio", label: "Sortie" }], edges: [{ source: 0, target: 1 }] };
    expect(validerSpec(brut, idsValides)).toEqual({
      nodes: [{ ficheId: "entree-audio", label: "Entrée" }, { ficheId: "sortie-audio", label: "Sortie" }],
      edges: [{ source: 0, target: 1 }],
    });
  });

  it("écarte un ficheId halluciné et réindexe les arêtes autour du trou", () => {
    // Le LLM invente "reverb-magique" entre deux nœuds réels : il doit
    // disparaître SANS casser la connexion source→sortie qui l'entourait.
    const brut = {
      nodes: [{ ficheId: "entree-audio", label: "E" }, { ficheId: "reverb-magique", label: "?" }, { ficheId: "sortie-audio", label: "S" }],
      edges: [{ source: 0, target: 1 }, { source: 1, target: 2 }],
    };
    const resultat = validerSpec(brut, idsValides);
    expect(resultat?.nodes).toEqual([{ ficheId: "entree-audio", label: "E" }, { ficheId: "sortie-audio", label: "S" }]);
    // Les deux arêtes référençaient le nœud halluciné (index 1) : aucune ne survit.
    expect(resultat?.edges).toEqual([]);
  });

  it("retourne null si tous les ficheId sont invalides (aucun nœud exploitable)", () => {
    const brut = { nodes: [{ ficheId: "n-existe-pas", label: "?" }], edges: [] };
    expect(validerSpec(brut, idsValides)).toBeNull();
  });

  it("retourne null si nodes n'est pas un tableau", () => {
    expect(validerSpec({ nodes: "pas un tableau" }, idsValides)).toBeNull();
  });

  it("retourne null pour une valeur non-objet", () => {
    expect(validerSpec(null, idsValides)).toBeNull();
    expect(validerSpec("texte", idsValides)).toBeNull();
    expect(validerSpec(42, idsValides)).toBeNull();
  });

  it("tolère l'absence du champ edges (nœuds sans connexion)", () => {
    const brut = { nodes: [{ ficheId: "entree-audio", label: "E" }] };
    expect(validerSpec(brut, idsValides)).toEqual({ nodes: [{ ficheId: "entree-audio", label: "E" }], edges: [] });
  });

  it("écarte une arête auto-référencée (source === target)", () => {
    const brut = { nodes: [{ ficheId: "entree-audio", label: "E" }, { ficheId: "sortie-audio", label: "S" }], edges: [{ source: 0, target: 0 }] };
    expect(validerSpec(brut, idsValides)?.edges).toEqual([]);
  });

  it("retombe sur ficheId comme label si le label est absent ou vide", () => {
    const brut = { nodes: [{ ficheId: "entree-audio" }, { ficheId: "sortie-audio", label: "  " }] };
    expect(validerSpec(brut, idsValides)?.nodes).toEqual([
      { ficheId: "entree-audio", label: "entree-audio" },
      { ficheId: "sortie-audio", label: "sortie-audio" },
    ]);
  });
});
