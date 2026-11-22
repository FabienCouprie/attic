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

describe("le crible lit « ^ », la différence symétrique d'Ariza", () => {
  // `music21.sieve` lit « ^ » comme Python : les degrés d'un côté ou de l'autre, pas des deux. Et
  // comme Python, le complément passe avant « & », qui passe avant « ^ », qui passe avant « | ».
  const cribler = (crible: string) => lancerFiche(F("crible-xenakis"), { Crible: crible, "Étendue": 12 }, { entrees: [] });
  const retenus = (message: string) => Number(/(\d+) degrés retenus/.exec(message)?.[1]);

  it("3@0 ^ 4@0, de 0 à 11 : 3, 4, 6, 8 et 9, sans le 0 que retiennent les deux", async () => {
    const r = await cribler("3@0^4@0");
    expect(r.erreurRendue).toBe(false);
    expect(retenus(r.message)).toBe(5);
  });

  it("« & » passe avant « ^ » : 3@0^4@0&2@0 vaut 3@0 ^ (4@0 & 2@0)", async () => {
    expect(retenus((await cribler("3@0^4@0&2@0")).message)).toBe(5);
  });

  it("« ^ » passe avant « | » : 2@0|3@0^4@0&6@0 vaut 2@0 | (3@0 ^ (4@0 & 6@0)), huit degrés", async () => {
    expect(retenus((await cribler("2@0|3@0^4@0&6@0")).message)).toBe(8);
  });

  it("ce que le message écrit se relit tel quel, différence symétrique comprise", async () => {
    const ecrit = /Crible (.+?) · /.exec((await cribler("3@0^4@0")).message)![1];
    expect(retenus((await cribler(ecrit)).message)).toBe(5);
  });
});

describe("les rangées d'un séquenceur", () => {
  // UNE RANGÉE DE TROP SE JETAIT SANS UN MOT : douze rangées sur les huit voix de la batterie, quatre
  // perdues. Décision de Fabien : « Refuse it, named ». Une rangée qui manque reste une rangée vide.
  const rangee = "1000100010001000";
  it.each([
    ["sequenceur-batterie-avance", 8, "9000900090009000"],
    ["sequenceur-melodique", 13, rangee],
    ["sequenceur-accords", 21, rangee],
  ])("%s refuse une rangée de plus que ses %i, et le dit", async (id, rangees, ligne) => {
    const r = await lancerFiche(F(id), { Motif: Array(rangees + 1).fill(ligne).join("|"), Mesures: 1 }, { entrees: [] });
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain(String(rangees + 1));
    expect(r.message).toContain(String(rangees));
  });

  it.each([["sequenceur-batterie-avance", 8], ["sequenceur-melodique", 13], ["sequenceur-accords", 21]])(
    "%s joue ses %i rangées, et une seule rangée, sans refus", async (id, rangees) => {
      for (const n of [rangees, 1]) {
        const r = await lancerFiche(F(id), { Motif: Array(n).fill("1000000000000000").join("|"), Mesures: 1 }, { entrees: [] });
        expect(r.erreurRendue, `${n} rangée(s) : ${r.message}`).toBe(false);
      }
    });
});

describe("le motif d'un Cercle rythmique ou mélodique", () => {
  // La notice promet qu'une adresse collée se lit : ses séparateurs, espaces, tirets, points et barres,
  // s'écartent. Tout autre caractère faisait une place de moins, sans un mot : « 1002 » donnait trois
  // places. Décision de Fabien : « Clean separators only ».
  const cercle = (id: string, motif: string) =>
    lancerFiche(F(id), { Rythme: "libre", Motif: motif }, { entrees: [] });

  it.each(["cercle-rythmique", "cercle-melodique"])("%s refuse « 1002 », et nomme le 2 et sa place", async (id) => {
    const r = await cercle(id, "1002");
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.message).toContain("« 2 »");
    expect(r.message).toContain("4");
  });

  it.each(["cercle-rythmique", "cercle-melodique"])("%s écarte les séparateurs d'une adresse collée", async (id) => {
    const r = await cercle(id, "1 0-0.1|0/0");
    expect(r.erreurRendue, r.message).toBe(false);
    expect((r.valeurs[0] as { positions: number }).positions).toBe(6);
  });

  it.each(["cercle-rythmique", "cercle-melodique"])("%s lit l'adresse après son dernier « # », sans ses autres chiffres", async (id) => {
    // Décision de Fabien : « Read after the # ». Nettoyer l'adresse entière y prenait « 10 » de « 120 ».
    const r = await cercle(id, "https://exemple.org/?tempo=120#1001");
    expect(r.erreurRendue, r.message).toBe(false);
    expect((r.valeurs[0] as { positions: number }).positions).toBe(4);
  });
});
