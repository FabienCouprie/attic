// plugins/abc-contraintes.test.ts — Les nœuds « Contraintes ABC » et « Édition ABC
// par LLM » par le registre. L'éditeur passe par ollamaGenerer, simulé ici par
// le preload ; le vrai modèle est vérifié dans l'app.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect, afterEach } from "vitest";
import { registre } from "../audio/adaptateur";
import { lireMorceau } from "../audio/abc";

const ctx = (entrees: unknown[], params: Record<string, string | number>) => ({
  entree: (i: number) => entrees[i] ?? null,
  entrees: () => entrees,
  paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
  paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
  onProgress: () => {},
  noeud: { data: {} },
  runtime: null,
});
const noeud = (id: string) => registre.trouverDef(id)!;

const AIR = `X:1\nT:Essai\nM:4/4\nL:1/8\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`;

afterEach(() => { delete (globalThis as any).window; });

describe("nœud Contraintes ABC", () => {
  it("est documenté dans les deux langues", () => {
    for (const id of ["contraintes-abc", "edition-abc-llm"]) {
      const f = noeud(id);
      expect(f.notice!.length).toBeGreaterThan(300);
      for (const p of f.parametres ?? []) { expect(p.doc, `${id} ${p.nom}`).toBeTruthy(); expect(p.docEn, `${id} ${p.nom}`).toBeTruthy(); }
    }
  });

  it("transmet une retouche conforme et la dit conforme", async () => {
    const juste = AIR.replace('"C"cBcd', '"Am7"cBcd');
    const r = await noeud("contraintes-abc").executer(ctx([AIR, juste], {}) as any);
    expect(r.erreur).toBeFalsy();
    expect(r.valeurs[0]).toBe(juste);
    expect(r.valeurs[1]).toMatch(/^Conforme/);
  });

  it("bloque une retouche fautive et nomme la faute", async () => {
    const faute = AIR.replace('"G"BGAF "D"G4', '"G"BGF "D"G4');
    const r = await noeud("contraintes-abc").executer(ctx([AIR, faute], {}) as any);
    expect(r.erreur).toBe(true);
    expect(r.valeurs[0]).toBeNull();
    expect(r.valeurs[1]).toMatch(/mesure 4 : 3.5 temps au lieu de 4/);
  });

  it("applique la liste personnalisée, et refuse un invariant inconnu", async () => {
    const hauteurs = AIR.replace("GABG DGBG", "EFGE BEGE");
    const perso = await noeud("contraintes-abc").executer(ctx([AIR, hauteurs], { "Contrôle": "personnalise", Invariants: "mesures, rythme" }) as any);
    expect(perso.erreur).toBeFalsy();
    const inconnu = await noeud("contraintes-abc").executer(ctx([AIR, hauteurs], { "Contrôle": "personnalise", Invariants: "mesures, harmonie" }) as any);
    expect(inconnu.message).toMatch(/Invariants inconnus : harmonie/);
  });
});

describe("nœud Édition ABC par LLM", () => {
  const simulerOllama = (reponses: string[]) => {
    const appels: any[] = [];
    (globalThis as any).window = { api: { ollamaGenerer: async (o: any) => { appels.push(o); return { reponse: reponses.shift() ?? "" }; } } };
    return appels;
  };

  it("réharmonise en passant le format JSON et le modèle à Ollama", async () => {
    const appels = simulerOllama([JSON.stringify({ bars: [["Em7"], ["Am7", "D7"], ["Bm7"], ["C", "D7"]] })]);
    const r = await noeud("edition-abc-llm").executer(ctx([AIR], { "Modèle": "qwen3:4b" }) as any);
    expect(r.erreur, r.message).toBeFalsy();
    expect(appels[0].model).toBe("qwen3:4b");
    expect(appels[0].format).toMatchObject({ required: ["bars"] });
    expect(lireMorceau(r.valeurs[0] as string).accords.map((a) => a.symbole)).toEqual(["Em7", "Am7", "D7", "Bm7", "C", "D7"]);
    expect(r.valeurs[1]).toMatch(/essai 1 accepté/);
    expect(r.message).toMatch(/temps forts dans l'accord/);
  });

  it("préfère la consigne connectée au paramètre", async () => {
    const appels = simulerOllama([JSON.stringify({ bars: [["Em"], ["Am"], ["Bm"], ["D"]] })]);
    await noeud("edition-abc-llm").executer(ctx([AIR, "Use only minor chords."], {}) as any);
    expect(appels[0].prompt).toMatch(/Instruction: Use only minor chords\./);
  });

  it("rend le rapport des essais refusés quand tous échouent", async () => {
    simulerOllama(["pas du json", "toujours pas"]);
    const r = await noeud("edition-abc-llm").executer(ctx([AIR], { Essais: 2 }) as any);
    expect(r.erreur).toBe(true);
    expect(r.valeurs[0]).toBeNull();
    expect(r.valeurs[1]).toMatch(/essai 1 refusé : the answer is not valid JSON\n- essai 2 refusé/);
  });
});
