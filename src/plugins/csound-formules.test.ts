// plugins/csound-formules.test.ts — Le nœud : la formule choisie, et ses deux sorties.
//
// La cohérence des formules est éprouvée dans `audio/csound-formules.test.ts`. Ici on vérifie que le
// nœud rend bien LES DEUX textes — l'orchestre et sa partition —, qu'ils se correspondent, et que le
// message dit ce qu'il faut savoir avant de brancher : les canaux et les p-fields.
import { describe, expect, it } from "vitest";
import { fiches } from "./csound-formules";
import { FORMULES } from "../audio/csound-formules";

const fiche = fiches.find((f) => f.id === "formules-csound")!;

function contexte(params: Record<string, string | number> = {}) {
  return {
    noeud: { id: "n1", data: { ficheId: "formules-csound", parametres: params } },
    runtime: null,
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  };
}

describe("le nœud Formules Csound", () => {
  it("propose autant de choix que la bibliothèque a de formules", () => {
    const p = fiche.parametres.find((x) => x.nom === "Formule")!;
    expect(p.optionIds).toEqual(FORMULES.map((f) => f.id));
    expect(p.options).toHaveLength(FORMULES.length);
  });

  it("rend l'orchestre ET sa partition, sans rien régler", async () => {
    const res = await fiche.executer(contexte() as any);
    const orchestre = res.valeurs[0] as string;
    const partition = res.valeurs[1] as string;
    expect(orchestre).toContain("instr 1");
    expect(orchestre).toContain("endin");
    expect(partition.trim().endsWith("e")).toBe(true);
    expect(res.message).toContain("mono");
    expect(res.message).toContain("p4, p5");
  });

  it("chaque formule de la liste rend un orchestre et une partition qui se correspondent", async () => {
    for (const f of FORMULES) {
      const res = await fiche.executer(contexte({ "Formule": f.id }) as any);
      const orchestre = res.valeurs[0] as string;
      const partition = res.valeurs[1] as string;
      const definis = new Set((orchestre.match(/^instr (\d+)/gm) ?? []).map((l) => l.replace("instr ", "")));
      for (const ligne of partition.split("\n").filter((l) => /^i\d/.test(l.trim()))) {
        expect(definis, `${f.id} : ${ligne}`).toContain(/^i(\d+)/.exec(ligne.trim())![1]);
      }
      expect(res.message, f.id).toContain(f.canaux === 2 ? "stéréo" : "mono");
    }
  });

  it("le niveau se retrouve dans l'orchestre, en clair", async () => {
    const res = await fiche.executer(contexte({ "Niveau": 40 }) as any);
    expect(res.valeurs[0]).toContain("gkNiveau init 0.4000");
  });

  it("retombe sur la première formule si l'identifiant est inconnu", async () => {
    const res = await fiche.executer(contexte({ "Formule": "chimere" }) as any);
    expect(res.valeurs[0]).toContain("instr 1");
    expect(res.message).toContain(FORMULES[0].fr);
  });

  it("annonce la stéréo du bus de réverbération — sans quoi la moitié du rendu se perd", async () => {
    const res = await fiche.executer(contexte({ "Formule": "reverbe-bus" }) as any);
    expect(res.message).toContain("stéréo");
    expect(res.valeurs[0]).toContain("outs");
    // Et sa partition lance bien la réverbération.
    expect(res.valeurs[1]).toContain("i99 0 ");
  });
});
