// @vitest-environment jsdom
//
// plugins/modifier-texte.test.ts — Le câblage du nœud.
//
// CE QUI SE VÉRIFIE ICI EST CE QUI CASSE EN SILENCE : un nom de paramètre mal orthographié fait
// rendre sa valeur par défaut à `paramTexte`, le nœud tourne, ne signale rien, et la zone de texte
// reste sans effet sur ce qui sort.
//
// La règle qui compte est celle du vide : une zone vide laisse passer l'entrée, une zone écrite la
// remplace. C'est elle qui permet de brancher d'abord et de corriger ensuite.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(entree: unknown, params: Record<string, string> = {}, data: Record<string, unknown> = {}) {
  return {
    entree: () => entree,
    entrees: () => [entree],
    paramTexte: (nom: string, def: string) => params[nom] ?? def,
    paramNombre: (_n: string, def: number) => def,
    onProgress: () => {},
    noeud: { id: "n1", data },
    runtime: null,
    repertoireTravail: "",
  };
}

async function executer(entree: unknown, params: Record<string, string> = {}, data: Record<string, unknown> = {}) {
  const f = registre.trouverDef("modifier-texte")!;
  const r = await f.executer(ctx(entree, params, data) as any);
  return { texte: r.valeurs[0] as string | null, message: r.message ?? "", data };
}

describe("nœud « Modifier le texte »", () => {
  it("est enregistré dans le catalogue, avec une entrée et une sortie texte", () => {
    const def = registre.trouverDef("modifier-texte")!;
    expect(def, "nœud absent du registre").toBeTruthy();
    expect(def.entrees.map((p) => p.type)).toEqual(["texte"]);
    expect(def.sorties.map((p) => p.type)).toEqual(["texte"]);
  });

  it("chaque paramètre déclaré est réellement lu par l'exécuteur", () => {
    const def = registre.trouverDef("modifier-texte")!;
    const source = def.executer.toString();
    for (const p of def.parametres) {
      expect(source.includes(`"${p.nom}"`), `paramètre « ${p.nom} » jamais lu`).toBe(true);
    }
  });

  it("zone vide : le texte d'entrée passe sans changement", async () => {
    const r = await executer("bonjour");
    expect(r.texte).toBe("bonjour");
    expect(r.message).toMatch(/inchangé/);
  });

  it("zone écrite : c'est elle qui sort, et le message le dit", async () => {
    const r = await executer("bonjour", { Texte: "bonsoir" });
    expect(r.texte).toBe("bonsoir");
    expect(r.message).toMatch(/corrigé/);
  });

  it("le texte reçu est déposé sur le nœud, pour que la zone le montre", async () => {
    // Sans ce dépôt, la zone resterait vide et l'on corrigerait un texte qu'on ne voit pas.
    const r = await executer("ce qui arrive");
    expect(r.data._texteRecu).toBe("ce qui arrive");
  });

  it("la zone écrite sort même sans entrée branchée", async () => {
    // Le composant peut alors servir de texte à lui seul, ce qui est cohérent avec ce qu'il montre.
    const r = await executer(null, { Texte: "écrit à la main" });
    expect(r.texte).toBe("écrit à la main");
  });

  it("signale une entrée qui n'est pas du texte, zone vide", async () => {
    const r = await executer(null);
    expect(r.texte).toBeNull();
    expect(r.message).toBeTruthy();
  });

  it("laisse passer une chaîne vide sans la confondre avec une entrée absente", async () => {
    // `""` est une valeur légitime — un nœud amont qui n'a rien transcrit.
    const r = await executer("");
    expect(r.texte).toBe("");
  });

  it("le nombre de caractères annoncé est celui du texte rendu", async () => {
    const r = await executer("court", { Texte: "un texte bien plus long" });
    expect(r.message).toMatch(/23/);
  });
});
