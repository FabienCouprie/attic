// @vitest-environment jsdom
//
// plugins/modifier-texte.test.ts — Le câblage du nœud.
//
// Les transformations elles-mêmes sont testées dans audio/texte.test.ts. Ce qui
// se vérifie ici est ce qui casse en silence : un nom de paramètre mal
// orthographié fait rendre sa valeur par défaut à `paramNombre`/`paramTexte`,
// le nœud tourne, ne signale rien, et le réglage reste sans effet.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctx(entree: unknown, params: Record<string, string> = {}) {
  return {
    entree: () => entree,
    entrees: () => [entree],
    paramTexte: (nom: string, def: string) => params[nom] ?? def,
    paramNombre: (_n: string, def: number) => def,
    onProgress: () => {},
    noeud: { id: "n1", data: {} },
    runtime: null,
    repertoireTravail: "",
  };
}

async function executer(entree: unknown, params: Record<string, string> = {}) {
  const f = registre.trouverDef("modifier-texte")!;
  const r = await f.executer(ctx(entree, params) as any);
  return { texte: r.valeurs[0] as string | null, message: r.message ?? "" };
}

describe("nœud « Modifier le texte »", () => {
  it("est enregistré dans le catalogue, avec une entrée et une sortie texte", () => {
    const def = registre.trouverDef("modifier-texte")!;
    expect(def, "nœud absent du registre").toBeTruthy();
    expect(def.entrees.map((p) => p.type)).toEqual(["texte"]);
    expect(def.sorties.map((p) => p.type)).toEqual(["texte"]);
  });

  it("chaque paramètre déclaré est réellement lu par l'exécuteur", () => {
    // Le garde-fou contre la faute de frappe : un paramètre déclaré dans la
    // fiche mais lu sous un autre nom resterait affiché dans l'inspecteur sans
    // rien piloter.
    const def = registre.trouverDef("modifier-texte")!;
    const source = def.executer.toString();
    for (const p of def.parametres) {
      expect(source.includes(`"${p.nom}"`), `paramètre « ${p.nom} » jamais lu`).toBe(true);
    }
  });

  it("transmet le texte transformé sur sa sortie", async () => {
    const r = await executer("la la la", { "Opération": "remplacer", Chercher: "la", "Remplacer par": "ré" });
    expect(r.texte).toBe("ré ré ré");
  });

  it("le message rend compte de ce qui a changé", async () => {
    // « 0 remplacement » est l'information utile quand un remplacement semble
    // ne pas marcher — davantage que « terminé ».
    const rien = await executer("bonjour", { "Opération": "remplacer", Chercher: "absent", "Remplacer par": "X" });
    expect(rien.message).toMatch(/0 remplacement/);
    const trois = await executer("la la la", { "Opération": "remplacer", Chercher: "la", "Remplacer par": "ré" });
    expect(trois.message).toMatch(/3 remplacement/);
  });

  it("une expression régulière invalide ne fait pas échouer le nœud", async () => {
    // Le texte continue de circuler : le graphe en aval n'est pas interrompu
    // pour une parenthèse oubliée.
    const r = await executer("bonjour", { "Opération": "regex", Chercher: "(non fermée", "Remplacer par": "X" });
    expect(r.texte).toBe("bonjour");
    expect(r.message).toMatch(/invalide/i);
  });

  it("signale une entrée qui n'est pas du texte", async () => {
    const r = await executer(null);
    expect(r.texte).toBeNull();
    expect(r.message).toBeTruthy();
  });

  it("laisse passer une chaîne vide sans la confondre avec une entrée absente", async () => {
    // `""` est une valeur légitime — un nœud amont qui n'a rien transcrit.
    // La confondre avec « non connecté » arrêterait la chaîne à tort.
    const r = await executer("", { "Opération": "majuscules" });
    expect(r.texte).toBe("");
  });

  it("retombe sur « Remplacer » si l'opération enregistrée n'existe plus", async () => {
    const r = await executer("intact", { "Opération": "operation-retiree" });
    expect(r.texte).toBe("intact");
  });
});
