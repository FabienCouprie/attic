// plugins/matrice-activite.test.ts — Le nœud « Matrice d'activité » : branché sur l'harmonie du nœud
// du lot 1, il rend une matrice que les voix relisent, à la graine près, et dit ce qui bloque.
//
// Ce que la recherche garantit est éprouvé par la loi dans `audio/soundhelix-arrangement.test.ts`. Ici
// on vérifie le CÂBLAGE : une colonne par section de l'harmonie reçue, chaque voix et ses décalages
// recopiés, la graine qui fixe le tirage, la faute dans les deux langues, et la matrice branchée telle
// quelle sur « Voix sur l'accord ».

import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { lireActivite } from "../audio/soundhelix-activite";
import { lireVoix } from "../audio/soundhelix-arrangement";
import { fautesDeVoix } from "../audio/soundhelix-recherche";
import { fiches as fichesHarmonie } from "./harmonie-motifs";
import { fiches as fichesVoix } from "./voix-sur-accord";
import { VOIX_PAR_DEFAUT, VOIX_PAR_DEFAUT_EN, fiches } from "./matrice-activite";

const fiche = fiches.find((f) => f.id === "matrice-activite")!;
const ficheVoix = fichesVoix.find((f) => f.id === "voix-sur-accord")!;
const ficheHarmonie = fichesHarmonie.find((f) => f.id === "harmonie-motifs")!;

/** Seize sections d'une mesure. */
async function harmonie(): Promise<File> {
  return (await lancerFiche(ficheHarmonie, { "Motifs d'accords": "Am/4,+F/4,+C/4,+G/4", Mesures: 16, "Tics par temps": "4" },
    { entrees: [] })).valeurs[0] as File;
}

async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

describe("le nœud Matrice d'activité", () => {
  it("rend une colonne par section, chaque voix tenant ses contraintes, et la graine fixe le tirage", async () => {
    const h = await harmonie();
    const r = await lancerFiche(fiche, { Graine: 11 }, { entrees: [h] });
    expect(r.erreurRendue).toBe(false);
    const voix = lireActivite(r.valeurs[0] as string);
    const contraintes = lireVoix(VOIX_PAR_DEFAUT);
    expect(voix.map((v) => v.nom)).toEqual(contraintes.map((v) => v.nom));
    for (const [i, v] of voix.entries()) {
      expect(v.sections.length).toBe(16);
      expect(fautesDeVoix(contraintes[i], v.sections, 16), v.nom).toEqual([]);
    }
    expect(r.message).toMatch(/^7 voix · 16 sections · exacte en \d+ essais · graine 11$/);
    expect((await lancerFiche(fiche, { Graine: 11 }, { entrees: [h] })).valeurs[0]).toBe(r.valeurs[0]);
    expect((await lancerFiche(fiche, { Graine: 12 }, { entrees: [h] })).valeurs[0]).not.toBe(r.valeurs[0]);
  });

  it("ouvre et referme le morceau aux nombres d'« Entrée » et de « Sortie »", async () => {
    const r = await lancerFiche(fiche, { Graine: 3, "Entrée": "1,2", Sortie: "1" }, { entrees: [await harmonie()] });
    const voix = lireActivite(r.valeurs[0] as string);
    const compte = (s: number) => voix.filter((v) => v.sections[s]).length;
    expect([compte(0), compte(1), compte(15)]).toEqual([1, 2, 1]);
  });

  it("recopie les décalages, et la matrice se branche telle quelle sur une voix", async () => {
    const h = await harmonie();
    const r = await lancerFiche(fiche, { Voix: "v1 debut=-2 fin=3", "Entrée": "1", Sortie: "1",
      "Voix actives min": 0, "Voix actives max": 1, Graine: 5 }, { entrees: [h] });
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.valeurs[0]).toMatch(/debut=-2 fin=3$/);
    const v = await lancerFiche(ficheVoix, { Motif: "0/4" }, { entrees: [h, r.valeurs[0], null] });
    expect(v.erreurRendue).toBe(false);
    expect(v.message).toMatch(/voix « v1 »/);
  });

  it("la recherche gloutonne rend une matrice là où l'exacte dit ce qui bloque, dans les deux langues", async () => {
    const h = await harmonie();
    const impossible = { Voix: "v1 part=100 entree=3-", Essais: 1000 };
    const exacte = await lancerFiche(fiche, impossible, { entrees: [h] });
    expect(exacte.erreurRendue).toBe(true);
    expect(exacte.message).toMatch(/aucune matrice en 1000 essais · le plus souvent bloquée : « (part|entree) » de « v1 »/);
    const anglais = await avecLangue("en", () => lancerFiche(fiche, impossible, { entrees: [h] }));
    expect(anglais.message).toMatch(/no matrix in 1000 tries · most often blocked: « (share|entry) » of « v1 »/);
    const gloutonne = await lancerFiche(fiche, { ...impossible, Recherche: "gloutonne" }, { entrees: [h] });
    expect(gloutonne.erreurRendue).toBe(false);
    expect(gloutonne.message).toMatch(/gloutonne en \d+ essais · \d+ écarts/);
  });

  it("lit les mots-clés anglais, et une voix illisible se dit", async () => {
    expect(lireVoix(VOIX_PAR_DEFAUT_EN).map((v) => [v.part, v.entree, v.sortie, v.longueur, v.muette]))
      .toEqual(lireVoix(VOIX_PAR_DEFAUT).map((v) => [v.part, v.entree, v.sortie, v.longueur, v.muette]));
    const r = await lancerFiche(fiche, { Voix: "v1 vitesse=3" }, { entrees: [await harmonie()] });
    expect(r.erreurRendue).toBe(true);
    expect(r.message).toMatch(/« vitesse=3 » illisible/);
  });
});
