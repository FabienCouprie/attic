// ui/demo/scenario.test.ts — Le scénario d'une démonstration filmée : construction, puis visite.
import { describe, expect, it } from "vitest";
import { DUREES, scenarioDemo, type DescriptionNoeud, type TextesScenario } from "./scenario";

const TEXTES: TextesScenario = {
  ajouter: "ajoute {nom} ({chemin})", relier: "relie {source} -> {cible}", regler: "règle {nom}",
  lancer: "lance", ecouter: "écoute {nom}", fin: "fin",
};

const FICHES: Record<string, DescriptionNoeud> = {
  osc: { nom: "Oscillateur", chemin: "Entrées › Génération", reglable: true },
  filtre: { nom: "Filtre", chemin: "Traitement › Effets", reglable: true },
  melange: { nom: "Mélangeur", chemin: "Traitement › Montage", reglable: false },
};
const decrire = (f: string) => FICHES[f] ?? null;

// Deux sources, chacune filtrée, puis mélangées. Le moteur les rangerait A, B, FA, FB, M.
const noeuds = [
  { id: "A", ficheId: "osc" }, { id: "B", ficheId: "osc", label: "Grave" },
  { id: "FA", ficheId: "filtre" }, { id: "FB", ficheId: "filtre" },
  { id: "M", ficheId: "melange" }, { id: "note", ficheId: "comment" }, { id: "x", ficheId: "inconnu" },
];
const aretes = [
  { id: "a1", source: "A", target: "FA" }, { id: "a2", source: "B", target: "FB" },
  { id: "a3", source: "FA", target: "M" }, { id: "a4", source: "FB", target: "M" },
];

const scenario = (titre = "") => scenarioDemo(noeuds, aretes, decrire, TEXTES, { titre, dureeParNoeud: 5 });

describe("scénario de la démonstration filmée", () => {
  it("construit en suivant les chaînes : chaque nœud, puis ses câbles entrants, puis ses réglages", () => {
    const etapes = scenario().filter((a) => a.genre !== "ecouter" && a.genre !== "fin").map((a) =>
      a.genre === "relier" ? `relier:${a.source}>${a.target}` : a.genre === "lancer" ? "lancer" : `${a.genre}:${(a as { id: string }).id}`);
    expect(etapes).toEqual([
      "ajouter:A", "regler:A", "ajouter:FA", "relier:A>FA", "regler:FA",
      "ajouter:B", "regler:B", "ajouter:FB", "relier:B>FB", "regler:FB",
      "ajouter:M", "relier:FA>M", "relier:FB>M",
      "lancer",
    ]);
  });

  it("un câble n'est tiré que vers un nœud déjà posé, depuis un nœud déjà posé", () => {
    const poses = new Set<string>();
    for (const a of scenario()) {
      if (a.genre === "ajouter") poses.add(a.id);
      if (a.genre === "relier") { expect(poses.has(a.source)).toBe(true); expect(poses.has(a.target)).toBe(true); }
    }
  });

  it("puis lance, visite chaque nœud dans le même ordre, et finit sur le graphe entier", () => {
    const s = scenario();
    const iLancer = s.findIndex((a) => a.genre === "lancer");
    const visites = s.slice(iLancer + 1).filter((a) => a.genre === "ecouter").map((a) => (a as { id: string }).id);
    expect(visites).toEqual(["A", "FA", "B", "FB", "M"]);
    expect(s[s.length - 1].genre).toBe("fin");
    expect(s.filter((a) => a.genre === "ecouter").every((a) => a.duree === 5)).toBe(true);
  });

  it("écarte les commentaires, les cadres et les nœuds inconnus du registre", () => {
    const ids = scenario().flatMap((a) => ("id" in a ? [a.id] : []));
    expect(ids).not.toContain("note");
    expect(ids).not.toContain("x");
  });

  it("les légendes nomment le nœud par son libellé, et disent où le trouver dans la palette", () => {
    const s = scenario();
    expect(s.find((a) => a.genre === "ajouter" && a.id === "B")?.legende).toBe("ajoute Grave (Entrées › Génération)");
    expect(s.find((a) => a.genre === "relier" && a.source === "B")?.legende).toBe("relie Grave -> Filtre");
  });

  it("un titre ouvre le film ; un nœud sans réglage n'ouvre pas l'inspecteur", () => {
    const s = scenario("Deux voix");
    expect(s[0]).toEqual({ genre: "titre", legende: "Deux voix", duree: DUREES.titre });
    expect(s.some((a) => a.genre === "regler" && a.id === "M")).toBe(false);
  });

  it("le rythme accélère la construction sans toucher au temps d'écoute", () => {
    const vite = scenarioDemo(noeuds, aretes, decrire, TEXTES, { dureeParNoeud: 5, rythme: 0.5 });
    expect(vite.find((a) => a.genre === "ajouter")?.duree).toBeCloseTo(DUREES.ajouter / 2, 6);
    expect(vite.find((a) => a.genre === "ecouter")?.duree).toBe(5);
  });
});
