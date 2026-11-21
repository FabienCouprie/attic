// docs/gammes-tenues-accords.test.ts — Chaque accord qu'un nœud bâtit sur un degré est celui de la gamme.
//
// LE DÉFAUT QUE CE GARDE TIENT, relevé par le banc des gammes le 2026-11-21. La tierce et la quinte se
// cherchaient comme la note de la gamme la plus proche de quatre et de sept demi-tons. Deux notes à
// égale distance, la première gagnait : le v du mineur, du dorien et du mixolydien sortait en sus4,
// si bémol, mi bémol, fa en mi bémol. Et la tierce majeure exacte gagnait quand la gamme l'avait : le
// vii° du mineur harmonique sortait en ré, fa dièse, la bémol. Quatre nœuds, sous huit à onze gammes.
//
// LA RÈGLE EST CELLE DE FABIEN, décidée le même jour : un degré sur deux dans la gamme, k, k+2, k+4,
// sur toute gamme, quelle que soit sa longueur (`audio/triades-gamme.ts`).
//
// IL PASSE PAR `executer`, sous chaque gamme offerte, en mi bémol, à une graine, et juge chaque accord
// plaqué que le nœud rend (`accordsSurLesDegres`). Le Générateur d'accords, qui ne rend que du son, est
// tenu de même dans `gammes-tenues-son.test.ts`, par le MIDI qu'il remet à sa synthèse.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import type { FicheLancable } from "../audio/lancer-fiche";
import { apparier } from "../audio/gamme-banc-lancer";
import type { PortDeSortie } from "../audio/gamme-banc-hauteurs";
import { releverUneGamme } from "../audio/gamme-banc-releve";
import { degresAttendus as degresDe, degresDesAccordsAttendus as degresDesAccords } from "../audio/gamme-banc-proprietes";
import { reglagesANomenclature } from "../plugins/nomenclatures";

/** Les nœuds qui bâtissent des accords sur les degrés de leur gamme, et les rendent en MIDI. */
const NOEUDS = ["generateur-musical", "boite-groove", "sequenceur-accords"];

const paires = apparier(reglagesANomenclature()).paires;

describe("les accords bâtis sur les degrés de la gamme", () => {
  for (const id of NOEUDS) {
    const paire = paires.find((p) => p.fiche === id)!;
    const fiche = registre.trouverDef(id) as unknown as FicheLancable & { sorties: PortDeSortie[] };
    it.each(paire.ids)(`${id} sous « %s » : chaque accord est la triade de la gamme, et aucune note n'en sort`, async (gamme) => {
      const r = await releverUneGamme(fiche, paire, gamme, { ports: fiche.sorties, graines: [1], toniques: [3], degresDe, degresDesAccords });
      expect(r.echecs).toEqual([]);
      expect(r.sorties.some((s) => s.accords > 0), "le nœud a rendu des accords").toBe(true);
      expect(r.sorties.flatMap((s) => s.accordsFautifs)).toEqual([]);
      expect(r.sorties.flatMap((s) => s.exemplesHors)).toEqual([]);
    });
  }
});
