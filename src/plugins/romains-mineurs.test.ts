// plugins/romains-mineurs.test.ts
// Verrouille la correction du degré mineur : Tonal lit la casse d'un chiffre
// romain mais ne la reporte pas sur le type d'accord, si bien que « vi »
// produisait une triade MAJEURE. Le défaut touchait aussi les nœuds
// « Progression » et « Grille d'accords », antérieurs au nœud de conversion.
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { normaliserRomains } from "../audio/theorie-romains";
import { Progression, Chord } from "tonal";

function ctxDe(entree: unknown, params: Record<string, string | number> = {}) {
  return {
    entree: () => entree,
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
    onProgress: () => {},
  } as any;
}

describe("normaliserRomains", () => {
  it("ajoute « m » aux degrés en minuscules sans type explicite", () => {
    expect(normaliserRomains(["I", "V", "vi", "IV"])).toEqual(["I", "V", "vim", "IV"]);
    expect(normaliserRomains(["i", "iv", "v"])).toEqual(["im", "ivm", "vm"]);
  });

  it("laisse intacts les degrés portant déjà une qualité", () => {
    expect(normaliserRomains(["vi7", "IMaj7", "V7"])).toEqual(["vi7", "IMaj7", "V7"]);
  });

  it("produit bien le relatif mineur (le cœur du bug)", () => {
    const avant = Chord.get(Progression.fromRomanNumerals("C", ["vi"])[0]).notes;
    const apres = Chord.get(Progression.fromRomanNumerals("C", normaliserRomains(["vi"]))[0]).notes;
    expect(avant).toEqual(["A", "C#", "E"]);   // comportement brut de Tonal : MAJEUR
    expect(apres).toEqual(["A", "C", "E"]);    // attendu : La mineur
  });
});

describe("nœuds existants corrigés", () => {
  it("« Progression » : I V vi IV donne un vi mineur", async () => {
    const fiche = registre.trouverDef("tonal-progression")!;
    const res = await fiche.executer(ctxDe(null, { "Tonalité": "C", "Progression": "I V vi IV" }));
    // Le 3e symbole doit être un accord mineur, pas « A ».
    const symboles = String(res.valeurs[0]).split(/\s+/);
    expect(symboles[2]).toBe("Am");
    expect(Chord.get(symboles[2]).notes).toEqual(["A", "C", "E"]);
  });

  it("« Grille d'accords » : le vi sort en mineur dans la notation", async () => {
    const fiche = registre.trouverDef("tonal-grille")!;
    const res = await fiche.executer(ctxDe(null, {
      "Tonalité": "C", "Progression": "I V vi IV", "Mode": "Bloc", "Octave": 3, "Tempo": 120,
    }));
    const texte = String(res.valeurs[0]);
    // La ligne du vi doit contenir un do naturel (La mineur), pas un do dièse.
    expect(texte).toContain("A3+C4+E4");
    expect(texte).not.toContain("A3+Db4+E4");
  });
});
