// plugins/champs-ecrits.test.ts — Un champ écrit à la main se lit des trois façons que disent les notices, et ce qui ne se lit pas est refusé.
//
// LA REVUE DES NOTATIONS EN TEXTE, onzième format, 2026-11-22, premier lot. Tout passe par `executer`. Un
// champ s'écrit d'un nombre, d'une suite de nombres, ou d'une rampe « de:à » : la structure du class-array
// d'OMChroma, que lisent la Matrice de paramètres, le Début de boucle par créneau, et quatre
// transformations du cercle par la passe. Un seul lecteur, `lireChamp`, pour les sept.
//
// CE QUI SE PASSAIT : un jeton illisible était jeté, « 200 abc 300 » se lisant « 200 300 » ; un champ
// illisible était pris pour un champ vide, « x » mettant tous les départs à zéro ; « 0x10 » se lisait 16 ;
// et « 200~2000 », forme qu'aucune notice ne nomme, rendait 1100 pour chaque événement.
//
// DÉCISIONS DE FABIEN DU 2026-11-22 : ce qui ne se lit pas est refusé et nommé, et la forme « de~à » est
// refusée et nommée, puisqu'aucun de ces nœuds ne tire au sort.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import type { Cercle } from "../audio/cercle";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
const MATRICE = (r: Record<string, unknown>) =>
  lancerFiche(F("matrice-parametres"), { Départs: "0 1", Durées: "1", p4: "", p5: "", ...r }, { entrees: [null] });
/** Les lignes `i` de la partition, sans ses commentaires. */
const lignes = (v: unknown) => String(v ?? "").split("\n").filter((l) => l.startsWith("i"));

describe("LA MATRICE LIT SES CHAMPS DES TROIS FAÇONS QUE DIT SA NOTICE", () => {
  it.each([
    ["un nombre seul", { p4: "440" }, ["i1 0.0000 1.0000 440.0000", "i1 1.0000 1.0000 440.0000"]],
    ["une suite, que la dernière valeur complète", { p4: "1, 2; 3", Événements: 4 },
      ["i1 0.0000 1.0000 1.0000", "i1 1.0000 1.0000 2.0000", "i1 1.0000 1.0000 3.0000", "i1 1.0000 1.0000 3.0000"]],
    ["une rampe, bornes comprises", { p4: "100:300", Événements: 3 },
      ["i1 0.0000 1.0000 100.0000", "i1 1.0000 1.0000 200.0000", "i1 1.0000 1.0000 300.0000"]],
    ["un nombre en écriture scientifique", { p4: "1e3" }, ["i1 0.0000 1.0000 1000.0000", "i1 1.0000 1.0000 1000.0000"]],
  ])("%s", async (_titre, reglages, attendues) => {
    const r = await MATRICE(reglages);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(lignes(r.valeurs[0])).toEqual(attendues);
  }, 60_000);

  it.each([
    ["un jeton illisible dans une suite", { p4: "200 abc 300" }, "p4", "« abc »"],
    ["un champ illisible", { Départs: "x" }, "Départs", "« x »"],
    ["un nombre à deux points décimaux", { Durées: "1.2.3" }, "Durées", "« 1.2.3 »"],
    ["un nombre hexadécimal", { p5: "0x10" }, "p5", "« 0x10 »"],
    ["une rampe à trois bornes", { p4: "1:2:3" }, "p4", "« 1:2:3 »"],
    ["une rampe à borne illisible", { p6: "1:y" }, "p6", "« y »"],
    ["la forme « de~à », qu'aucune notice ne nomme", { p4: "200~2000" }, "p4", "« 200~2000 »"],
  ])("refuse %s, et nomme le réglage", async (_titre, reglages, reglage, cite) => {
    const r = await MATRICE(reglages);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain(reglage);
    expect(r.message).toContain(cite);
  }, 60_000);
});

describe("LES AUTRES LECTEURS DU MÊME CHAMP REFUSENT DE MÊME", () => {
  const cercle: Cercle = { positions: 8, sorte: "hauteur", sommets: [{ position: 0, valeur: 60 }, { position: 3, valeur: 64 }] };

  it.each([
    ["boucle-creneau-debut", { Départs: "0 x 4" }, [], "Départs", "« x »"],
    ["boucle-creneau-debut", { Durées: "2~4" }, [], "Durées", "« 2~4 »"],
    ["cercle-tourner", { Pas: "abc" }, [cercle], "Pas", "« abc »"],
    ["cercle-miroir", { Axe: "0x2" }, [cercle], "Axe", "« 0x2 »"],
    ["cercle-inverser", { Inversion: "intervalles", Axe: "60 do" }, [cercle], "Axe", "« do »"],
    ["cercle-permuter", { Graine: "1:" }, [cercle], "Graine", "« 1: »"],
  ])("%s refuse %j", async (id, reglages, entrees, reglage, cite) => {
    const r = await lancerFiche(F(id), reglages, { entrees });
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null]);
    expect(r.message).toContain(reglage);
    expect(r.message).toContain(cite);
  }, 60_000);

  it("et lit toujours une rampe sur les passes, hors d'une boucle sa première valeur", async () => {
    const r = await lancerFiche(F("cercle-tourner"), { Pas: "2:5" }, { entrees: [cercle] });
    expect(r.erreurRendue, r.message).toBe(false);
    expect((r.valeurs[0] as Cercle).sommets.map((s) => s.position).sort((a, b) => a - b)).toEqual([2, 5]);
  }, 60_000);
});
