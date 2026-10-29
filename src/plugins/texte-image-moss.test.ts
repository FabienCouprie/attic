// plugins/texte-image-moss.test.ts — Ce que le composant demande au pont, et ce qu'il refuse.
//
// L'IMAGE ELLE-MÊME N'EST PAS ÉPROUVÉE ICI : elle demande stable-diffusion.cpp, une carte et neuf
// gigaoctets de modèle. Ce cas tient ce qui part vers le pont, réglage par réglage, pour qu'aucun ne
// soit lu puis jeté ; l'image se mesure dans l'application.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fiches } from "./texte-image-moss";

const fiche = fiches.find((f) => f.id === "texte-image-moss")!;

function contexte(params: Record<string, string | number> = {}, entree: unknown = null) {
  return {
    entree: () => entree,
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
    onProgress: () => {},
    signal: new AbortController().signal,
  };
}

/** Un faux pont qui garde ce qu'on lui demande et répond un échec, pour s'arrêter avant l'image. */
function poserPont() {
  const demandes: Record<string, unknown>[] = [];
  vi.stubGlobal("api", {
    sdcppMoss: async (o: Record<string, unknown>) => { demandes.push(o); return { ok: false, journal: "arrêt du cas" }; },
    sdcppProgression: () => () => {},
  });
  return demandes;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("le composant Texte → image (MOSS)", () => {
  it("rend une image, et son prompt d'entrée est facultatif", () => {
    expect(fiche.sorties.map((s) => s.type)).toEqual(["image"]);
    expect(fiche.entrees[0].requis).toBe(false);
  });

  it("hors de l'application de bureau, il le dit au lieu de rendre rien", async () => {
    const r = await fiche.executer(contexte() as any);
    expect(r.erreur).toBe(true);
    expect(r.valeurs).toEqual([null]);
  });

  it("CHAQUE RÉGLAGE PART VERS LE PONT, avec la valeur réglée", async () => {
    const demandes = poserPont();
    await fiche.executer(contexte({
      "Prompt": "a poster", "Prompt négatif": "blur", "Largeur": 768, "Hauteur": 512,
      "Étapes": 12, "Guidage": 4.5, "Graine": 77, "Calcul": "Vulkan1",
    }) as any);
    expect(demandes[0]).toEqual({
      prompt: "a poster", negatif: "blur", graine: 77, etapes: 12, guidage: 4.5,
      largeur: 768, hauteur: 512, calcul: "Vulkan1",
    });
  });

  it("S'OUVRE EN 320 × 320 ET 30 ÉTAPES, et c'est ce qui part quand rien n'est réglé", async () => {
    // Réglages fixés par Fabien le 2026-10-28. La fiche et les replis de l'exécuteur doivent dire la
    // même chose : sinon un nœud dont le réglage manque partirait sur une autre taille que celle affichée.
    const defaut = (nom: string) => fiche.parametres.find((p) => p.nom === nom)!.defaut;
    expect([defaut("Largeur"), defaut("Hauteur"), defaut("Étapes")]).toEqual([320, 320, 30]);
    const demandes = poserPont();
    await fiche.executer(contexte() as any);
    expect([demandes[0].largeur, demandes[0].hauteur, demandes[0].etapes]).toEqual([320, 320, 30]);
  });

  it("UNE TAILLE QUI N'EST PAS UN MULTIPLE DE SEIZE Y EST RAMENÉE, le modèle l'exigeant", async () => {
    const demandes = poserPont();
    await fiche.executer(contexte({ "Largeur": 1000, "Hauteur": 700 }) as any);
    expect([demandes[0].largeur, demandes[0].hauteur]).toEqual([1008, 704]);
  });

  it("L'ENTRÉE PROMPT REMPLACE LE RÉGLAGE quand elle porte un texte, et pas quand elle est vide", async () => {
    const demandes = poserPont();
    await fiche.executer(contexte({ "Prompt": "a poster" }, "{\"items\": []}") as any);
    await fiche.executer(contexte({ "Prompt": "a poster" }, "   ") as any);
    expect(demandes.map((d) => d.prompt)).toEqual(["{\"items\": []}", "a poster"]);
  });

  it("UNE GRAINE À MOINS UN EST TIRÉE AU SORT, et c'est la graine tirée qui part", async () => {
    const demandes = poserPont();
    await fiche.executer(contexte({ "Graine": -1 }) as any);
    expect(demandes[0].graine).toBeGreaterThan(0);
  });

  it("refuse un prompt vide plutôt que de dessiner au hasard", async () => {
    const demandes = poserPont();
    const r = await fiche.executer(contexte({ "Prompt": "  " }) as any);
    expect(r.erreur).toBe(true);
    expect(demandes).toHaveLength(0);
  });

  it("un échec du moteur remonte avec la fin de son journal", async () => {
    poserPont();
    const r = await fiche.executer(contexte() as any);
    expect(r.erreur).toBe(true);
    expect(r.message).toContain("arrêt du cas");
  });
});
