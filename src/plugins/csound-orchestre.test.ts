// plugins/csound-orchestre.test.ts — Le nœud, et ce que son message annonce.
//
// La composition est éprouvée dans `audio/csound-orchestre.test.ts`. Ici on vérifie le câblage et
// l'aveu : une sélection vide doit le DIRE plutôt que de rendre un orchestre sans instrument — que
// Csound compilerait sans broncher pour ne produire aucun son.
import { describe, expect, it } from "vitest";
import { fiches } from "./csound-orchestre";

const fiche = fiches.find((f) => f.id === "orchestre-csound")!;

function contexte(params: Record<string, string | number> = {}) {
  return {
    noeud: { id: "n1", data: { ficheId: "orchestre-csound", parametres: params } },
    runtime: null,
    entree: () => null,
    entrees: () => [],
    paramTexte: (nom: string, defaut: string) => String(params[nom] ?? defaut),
    paramNombre: (nom: string, defaut: number) => Number(params[nom] ?? defaut),
  };
}

describe("le nœud Orchestre Csound", () => {
  it("rend un orchestre jouable sans qu'on règle rien", async () => {
    const res = await fiche.executer(contexte() as any);
    const orchestre = res.valeurs[0] as string;
    expect(orchestre).toContain("instr 1");
    expect(orchestre).toContain("instr 2");
    expect(orchestre).toContain("endin");
    expect(res.message).toContain("2 instrument(s)");
    expect(res.message).toContain("mono");
  });

  it("le message NOMME la correspondance numéro-instrument", async () => {
    const res = await fiche.executer(contexte({ "Instruments": "mode,gbuzz,pluck" }) as any);
    expect(res.message).toContain("i1 mode");
    expect(res.message).toContain("i2 gbuzz");
    expect(res.message).toContain("i3 pluck");
    expect(res.valeurs[1]).toContain("i3 — Karplus-Strong (pluck)");
  });

  it("DIT qu'aucun instrument n'est coché, au lieu de rendre un orchestre muet", async () => {
    const res = await fiche.executer(contexte({ "Instruments": "" }) as any);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toContain("Aucun instrument");
    // Un identifiant inconnu seul revient au même cas.
    const faux = await fiche.executer(contexte({ "Instruments": "trompette" }) as any);
    expect(faux.valeurs).toEqual([null, null]);
  });

  it("compte les identifiants écartés plutôt que de les taire", async () => {
    const res = await fiche.executer(contexte({ "Instruments": "mode,trompette,gbuzz" }) as any);
    expect(res.message).toContain("2 instrument(s)");
    expect(res.message).toContain("1 identifiant(s) inconnu(s)");
  });

  it("écrit tout le monde en stéréo quand on le demande, et le rappelle", async () => {
    const res = await fiche.executer(contexte({ "Instruments": "mode,gbuzz", "Canaux": "2" }) as any);
    const orchestre = res.valeurs[0] as string;
    expect(orchestre.match(/^\s+outs /gm) ?? []).toHaveLength(2);
    expect(orchestre).not.toMatch(/^\s+out /m);
    expect(res.message).toContain("stéréo");
  });

  it("obéit au numéro de départ et au niveau", async () => {
    const res = await fiche.executer(contexte({
      "Instruments": "foscil", "Premier instrument": 7, "Niveau": 50,
    }) as any);
    expect(res.valeurs[0]).toContain("instr 7");
    expect(res.valeurs[0]).toContain("* 0.5000");
    expect(res.message).toContain("i7 foscil");
  });
});
