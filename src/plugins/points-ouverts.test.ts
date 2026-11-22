// plugins/points-ouverts.test.ts — Les points que la revue des notations en texte avait laissés ouverts.
//
// LA REVUE A PASSÉ TOUS LES FORMATS LE 2026-11-22, et chaque relevé gardait des points « à
// soumettre » ou « vus en passant ». Fabien les a tranchés le même jour ; ce fichier tient ce qui en
// est sorti, cas par cas, et tout passe par `executer`. Les attendus viennent de la règle du chantier
// ou de la référence du format, que chaque cas cite : jamais du code.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;
/** Lance un nœud sans rien sur ses entrées : seul ce qui est écrit dans ses réglages compte. */
const sansEntree = (id: string, reglages: Record<string, string | number>) =>
  lancerFiche(F(id), reglages, { entrees: (F(id).entrees ?? []).map(() => null) });

describe("un refus porte le drapeau d'erreur", () => {
  // LA RÈGLE DU CHANTIER : ce qu'un nœud refuse, il le refuse en erreur. Ces quatre nœuds disaient
  // leur refus et restaient verts, si bien qu'un graphe passait sur une sortie vide.
  it.each([
    ["serie-dodecaphonique", { "Série": "" }],
    ["classes-hauteurs", { Notes: "" }],
    ["contrepoint-especes", { "Voix grave": "", "Voix aiguë": "" }],
    ["voicings-accords", {}],
  ])("%s, sans rien à lire", async (id, reglages) => {
    const r = await sansEntree(id, reglages);
    expect(r.message).not.toBe("");
    expect(r.erreurRendue).toBe(true);
  });
});
