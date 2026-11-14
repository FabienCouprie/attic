// audio/lancer-fiche.test.ts — Le lanceur du banc de node a les sémantiques du moteur.
//
// CHAQUE CAS OPPOSE LE LANCEUR À CE QUE FAISAIENT LES CONTEXTES RECOPIÉS : une valeur d'avant
// relue, un réglage absent pris à son défaut déclaré, une graine fixée par son rôle et non par son
// nom, des entrées venues par des arêtes. Sans ces quatre-là, une passe sur le catalogue mesure un
// autre programme que celui qu'on lance.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import type { ParametreDef } from "../core/types";
import { ctxDEssai } from "../core/contexte-essai";
import { registre } from "./adaptateur";
import { GRAINE_FIXE, empreinteValeurs, entreesDEssai, lancerFiche, sonDEssai, valeursDEssai, type FicheLancable } from "./lancer-fiche";

/** Une fiche minimale, dont l'exécuteur rend ce qu'il lit. */
const ficheQuiLit = (parametres: ParametreDef[], lire: (ctx: any) => unknown[], entrees: FicheLancable["entrees"] = []): FicheLancable => ({
  id: "essai-lecture", entrees, parametres, executer: async (ctx: any) => ({ valeurs: lire(ctx) }),
});

describe("le lanceur lit les réglages comme le moteur", () => {
  it("UNE VALEUR D'AVANT SE RELIT, ce que le contexte d'essai ne fait pas", async () => {
    // « pop » est l'identifiant d'avant de « Rock », déclaré dans `optionsHeritees` de « Reprise ABC ».
    const fiche = registre.trouverDef("reprise-abc")! as unknown as FicheLancable;
    const abc = `X:1\nM:4/4\nL:1/8\nQ:1/4=100\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|]`;
    const r = await lancerFiche(fiche, { Style: "pop", "Synthèse": "FM/Oscillateurs" }, { entrees: [abc] });
    expect(r.message).toMatch(/^Reprise « Rock »/);
    const brut = await (fiche.executer as (c: unknown) => Promise<{ message?: string }>)(ctxDEssai([abc], { Style: "pop", "Synthèse": "FM/Oscillateurs" }));
    expect(brut.message, "le contexte d'essai ne relit pas la valeur d'avant").not.toMatch(/« Rock »/);
  }, 30_000);

  it("UN RÉGLAGE ABSENT PREND SON DÉFAUT DÉCLARÉ, et non le littéral de l'appel", async () => {
    const fiche = ficheQuiLit([{ nom: "Taille", plage: [0, 10], defaut: 5 } as ParametreDef], (ctx) => [ctx.paramNombre("Taille", 999)]);
    expect((await lancerFiche(fiche)).valeurs).toEqual([5]);
  });

  it("LA GRAINE EST FIXÉE PAR SON RÔLE, et non par son nom", async () => {
    const fiche = ficheQuiLit([
      { nom: "Semence", graine: true, plage: [0, 999999], defaut: 0 } as ParametreDef,
      { nom: "Graine", plage: [0, 10], defaut: 0 } as ParametreDef,
    ], (ctx) => [ctx.paramNombre("Semence", 0), ctx.paramNombre("Graine", 0)]);
    expect((await lancerFiche(fiche)).valeurs).toEqual([GRAINE_FIXE, 0]);
    expect((await lancerFiche(fiche, { Semence: 17 })).valeurs).toEqual([17, 0]);
  });

  it("les entrées arrivent par des arêtes, une par port, et une entrée nulle reste débranchée", async () => {
    const fiche = ficheQuiLit([], (ctx) => [ctx.entree(0) instanceof AudioBuffer, ctx.entree(1) instanceof File, typeof ctx.entree(2), ctx.entrees().length],
      [{ type: "audio" }, { type: "midi" }, { type: "texte" }]);
    expect((await lancerFiche(fiche)).valeurs).toEqual([true, true, "string", 3]);
    expect((await lancerFiche(fiche, {}, { entrees: [null, null, "x"] })).valeurs).toEqual([false, false, "string", 1]);
  });

  it("une fiche qui lève est rendue comme telle, et la passe continue", async () => {
    const fiche: FicheLancable = { id: "leve", parametres: [], executer: async () => { throw new Error("modèle absent"); } };
    const r = await lancerFiche(fiche);
    expect(r.levee).toBe("modèle absent");
    expect(r.valeurs).toEqual([]);
  });
});

describe("l'empreinte lit tout", () => {
  it("UN SEUL ÉCHANTILLON CHANGÉ CHANGE L'EMPREINTE, où qu'il soit", async () => {
    // L'empreinte échantillonnée du garde des effets MIDI ne lit qu'un échantillon sur 97 : un
    // changement entre deux lectures y passait inaperçu.
    const a = sonDEssai(0.5), b = sonDEssai(0.5);
    expect(await empreinteValeurs([a])).toBe(await empreinteValeurs([b]));
    b.getChannelData(1)[1001] += 1e-6;
    expect(await empreinteValeurs([a])).not.toBe(await empreinteValeurs([b]));
  });

  it("un fichier se lit par ses octets, un texte par ses caractères", async () => {
    const f = (o: number[]) => new File([new Uint8Array(o)], "x.mid");
    expect(await empreinteValeurs([f([1, 2, 3])])).toBe(await empreinteValeurs([f([1, 2, 3])]));
    expect(await empreinteValeurs([f([1, 2, 3])])).not.toBe(await empreinteValeurs([f([1, 2, 4])]));
    expect(await empreinteValeurs(["do mi sol"])).not.toBe(await empreinteValeurs(["do mi la"]));
  });
});

describe("les valeurs d'essai d'un réglage", () => {
  it("UN RÉGLAGE NUMÉRIQUE SANS TYPE EN A, comme « Octaves » de l'arpégiateur", () => {
    expect(valeursDEssai({ nom: "Octaves", plage: [1, 4], pas: 1, defaut: 1 } as ParametreDef)).toEqual([4, 2, 3]);
  });

  it("un choix rend ses autres valeurs, une case son autre état, un texte rien", () => {
    expect(valeursDEssai({ nom: "S", type: "choix", options: ["A", "B", "C"], optionIds: ["a", "b", "c"], defaut: "B" } as ParametreDef)).toEqual(["a", "c"]);
    expect(valeursDEssai({ nom: "I", type: "case", defaut: 0 } as ParametreDef)).toEqual([1]);
    expect(valeursDEssai({ nom: "T", type: "texte", defaut: "x" } as ParametreDef)).toEqual([]);
  });

  it("les entrées d'essai d'une fiche suivent ses ports", () => {
    const e = entreesDEssai({ id: "x", parametres: [], executer: async () => ({}), entrees: [{ type: "audio" }, { type: "texte", sousType: "abc" }] });
    expect(e[0]).toBeInstanceOf(AudioBuffer);
    expect(typeof e[1]).toBe("string");
  });
});
