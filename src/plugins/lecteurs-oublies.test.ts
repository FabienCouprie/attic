// plugins/lecteurs-oublies.test.ts — Les lecteurs que le recensement n'avait pas vus lisent ce que disent leurs documentations, et refusent le reste.
//
// LA PASSE DE COMPLÉTUDE DE LA REVUE DES NOTATIONS EN TEXTE, 2026-11-22. Le registre entier a été relu, et ces
// nœuds lisent une notation que le recensement n'avait pas listée. Tout passe par `executer`.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable } from "../audio/lancer-fiche";
import type { Cercle } from "../audio/cercle";

const F = (id: string) => registre.trouverDef(id) as unknown as FicheLancable;

// LE MASQUE DU CERCLE À RETOUCHER, que la vue écrit à chaque clic. Une espace y prenait une place, et un
// caractère qui n'était ni 0 ni 1 éteignait la sienne. C'est la règle des grilles du dixième format, décision
// de Fabien du 2026-11-22, « Refuse it, named » ; un masque trop court ou trop long se complète ou se coupe
// toujours, comme la notice le dit.
describe("LE MASQUE DU CERCLE NE PORTE QUE DES ZÉROS ET DES UNS", () => {
  const CERCLE: Cercle = { positions: 8, sorte: "percussion", sommets: [0, 3, 6].map((position) => ({ position, valeur: 36 })) };
  const RETOUCHER = (masque: string) => lancerFiche(F("cercle-retouche"), { Retouche: masque }, { entrees: [CERCLE] });
  const places = (v: unknown) => (v as Cercle).sommets.map((s) => s.position);

  it.each([
    ["un masque qui éteint une place", "10000010", [0, 6]],
    ["un masque court, complété par le cercle", "1000", [0, 6]],
    ["un masque long, coupé", "100100101111", [0, 3, 6]],
    ["un masque vide, qui laisse passer le cercle", "", [0, 3, 6]],
  ])("lit %s", async (_titre, masque, attendues) => {
    const r = await RETOUCHER(masque);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(places(r.valeurs[0])).toEqual(attendues);
  }, 60_000);

  it.each([["1 0 0 1 0 0 1 0", "« ␣ »", "place 2"], ["x..x..x.", "« x »", "place 1"], ["1002", "« 2 »", "place 4"]])(
    "refuse « %s », et nomme %s", async (masque, cite, place) => {
      const r = await RETOUCHER(masque);
      expect(r.erreurRendue, r.message).toBe(true);
      expect(r.valeurs).toEqual([null]);
      expect(r.message).toContain(cite);
      expect(r.message).toContain(place);
    }, 60_000);
});

// LE CODE DE LA ROUE DE CAMELOT : un nombre de 1 à 12, puis A pour le mineur ou B pour le majeur. Un code
// illisible rendait un nœud vert, « 0 accords · 0 notes ».
describe("LA ROUE DE CAMELOT REFUSE UN CODE QU'ELLE NE LIT PAS", () => {
  const CAMELOT = (depart: string) => lancerFiche(F("camelot"), { "Départ": depart, Pas: 3 }, { entrees: [] });

  it.each([["4B"], ["4b"], ["12A"]])("lit « %s »", async (depart) => {
    const r = await CAMELOT(depart);
    expect(r.erreurRendue, r.message).toBe(false);
    expect(r.message).toContain(depart.toUpperCase());
  }, 60_000);

  it.each([["13A"], ["0B"], ["4C"], ["b4"], [""]])("refuse « %s » en erreur, et le nomme", async (depart) => {
    const r = await CAMELOT(depart);
    expect(r.erreurRendue, r.message).toBe(true);
    expect(r.valeurs).toEqual([null, null, null]);
    expect(r.message).toContain(`« ${depart} »`);
  }, 60_000);
});
