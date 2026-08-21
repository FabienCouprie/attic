// ui/recherche-palette.test.ts — Le point vérifié ici est qu'une recherche
// atteint la notice : c'est le seul champ où se trouvent les termes techniques
// par lesquels on cherche un traitement dont on ignore le nom.
import { describe, it, expect } from "vitest";
import type { FicheAudio } from "../audio/types-domaine";
import { filtrerFiches } from "./recherche-palette";

function fiche(p: Partial<FicheAudio> & { id: string }): FicheAudio {
  return {
    nom: p.id, resume: "", famille: "Divers", univers: "Traitement",
    entrees: [], sorties: [], params: [],
    ...p,
  } as FicheAudio;
}

const SANS_TRADUCTION = () => "";

const CATALOGUE = [
  fiche({ id: "reverb", nom: "Réverbération", resume: "Réverbération à convolution" }),
  fiche({
    id: "lucier", nom: "Pièce de Lucier", resume: "Réinjection dans une pièce",
    notice: "Chaque passage renforce les fréquences de résonance de la pièce.",
    noticeEn: "Each pass reinforces the room's resonant frequencies.",
  }),
  fiche({
    id: "dephasage", nom: "Déphasage", resume: "Deux copies désynchronisées",
    notice: "Les deux voix produisent un battement dont la période vaut la longueur de boucle divisée par l'écart.",
  }),
  fiche({
    id: "canon", nom: "Canon de tempo", resume: "Voix à vitesses différentes",
    notice: "Un rapport irrationnel interdit toute réunion des voix.",
  }),
];

describe("filtrerFiches", () => {
  it("rend la liste inchangée sur une requête vide", () => {
    expect(filtrerFiches(CATALOGUE, "", SANS_TRADUCTION)).toBe(CATALOGUE);
    expect(filtrerFiches(CATALOGUE, "   ", SANS_TRADUCTION)).toBe(CATALOGUE);
  });

  it("trouve par le nom et par le résumé, sans distinction de casse", () => {
    expect(filtrerFiches(CATALOGUE, "RÉVERB", SANS_TRADUCTION).map((p) => p.id)).toEqual(["reverb"]);
    expect(filtrerFiches(CATALOGUE, "désynchronisées", SANS_TRADUCTION).map((p) => p.id)).toEqual(["dephasage"]);
  });

  it("trouve un terme qui ne figure que dans la notice", () => {
    // Sans ce champ, ces trois recherches ne rendaient rien : le mot juste
    // n'apparaît ni dans le nom ni dans le résumé.
    expect(filtrerFiches(CATALOGUE, "battement", SANS_TRADUCTION).map((p) => p.id)).toEqual(["dephasage"]);
    expect(filtrerFiches(CATALOGUE, "irrationnel", SANS_TRADUCTION).map((p) => p.id)).toEqual(["canon"]);
    expect(filtrerFiches(CATALOGUE, "résonance", SANS_TRADUCTION).map((p) => p.id)).toEqual(["lucier"]);
  });

  it("trouve aussi par la notice anglaise, quelle que soit la langue affichée", () => {
    expect(filtrerFiches(CATALOGUE, "resonant", SANS_TRADUCTION).map((p) => p.id)).toEqual(["lucier"]);
  });

  it("rend toutes les fiches concernées, pas seulement la première", () => {
    expect(filtrerFiches(CATALOGUE, "voix", SANS_TRADUCTION).map((p) => p.id)).toEqual(["dephasage", "canon"]);
  });

  it("cherche dans la famille traduite quand une traduction est fournie", () => {
    const enAnglais = (f: string) => (f === "Divers" ? "Miscellaneous" : f);
    expect(filtrerFiches(CATALOGUE, "miscellaneous", enAnglais)).toHaveLength(CATALOGUE.length);
    expect(filtrerFiches(CATALOGUE, "miscellaneous", SANS_TRADUCTION)).toHaveLength(0);
  });

  it("ne rend rien sur un terme absent", () => {
    expect(filtrerFiches(CATALOGUE, "zzzz", SANS_TRADUCTION)).toEqual([]);
  });

  it("supporte une fiche sans notice", () => {
    expect(() => filtrerFiches(CATALOGUE, "battement", SANS_TRADUCTION)).not.toThrow();
  });
});
