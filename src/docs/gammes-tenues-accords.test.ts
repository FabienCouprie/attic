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
import type { HauteurRendue, PortDeSortie } from "../audio/gamme-banc-hauteurs";
import { releverUneGamme } from "../audio/gamme-banc-releve";
import {
  accordsSurLesDegres, degresAttendus as degresDe, degresDesAccordsAttendus as degresDesAccords, horsDeLaGamme,
} from "../audio/gamme-banc-proprietes";
import { couleursVersNotes, type CouleurExtraite } from "../audio/palette-harmonique";
import { formesVersNotes } from "../audio/dessin-sonore";
import { reglagesANomenclature } from "../plugins/nomenclatures";

/** Les nœuds qui bâtissent des accords sur les degrés de leur gamme, et les rendent en MIDI. */
const NOEUDS = ["generateur-musical", "boite-groove", "sequenceur-accords"];

const paires = apparier(reglagesANomenclature()).paires;

describe("les accords bâtis sur les degrés de la gamme", () => {
  // LE COLOR LOOPER JOUE SES ACCORDS EN « PLAQUÉ », et non sous son défaut, « Mélodie », qui
  // cachait sa triade parallèle : la triade de la tonique posée sur chaque degré.
  const AUTRES: Record<string, Record<string, string>> = { "color-looper": { Mode: "plaque" } };
  for (const id of [...NOEUDS, "color-looper"]) {
    const paire = paires.find((p) => p.fiche === id)!;
    const fiche = registre.trouverDef(id) as unknown as FicheLancable & { sorties: PortDeSortie[] };
    it.each(paire.ids)(`${id} sous « %s » : chaque accord est la triade de la gamme, et aucune note n'en sort`, async (gamme) => {
      const r = await releverUneGamme(fiche, paire, gamme, {
        ports: fiche.sorties, graines: [1], toniques: [3], degresDe, degresDesAccords, ...(AUTRES[id] ? { autres: AUTRES[id] } : {}),
      });
      expect(r.echecs).toEqual([]);
      expect(r.sorties.some((s) => s.accords > 0), "le nœud a rendu des accords").toBe(true);
      expect(r.sorties.flatMap((s) => s.accordsFautifs)).toEqual([]);
      expect(r.sorties.flatMap((s) => s.exemplesHors)).toEqual([]);
    });
  }
});

/**
 * LA PALETTE HARMONIQUE ET LE DESSIN SONORE lisent une image par le DOM, que le banc ne sait pas
 * lancer hors du navigateur ; leur calcul des notes est pur, et c'est lui qui bâtit l'accord. Vingt-
 * quatre couleurs font le tour du cercle des teintes, chacune à sa place sur l'axe du temps : chaque
 * degré y prend un accord.
 */
const couleurs = (): CouleurExtraite[] =>
  Array.from({ length: 24 }, (_, k) => ({ r: 0, g: 0, b: 0, h: k * 15, s: 80, l: 50, x: k * 10, y: 5, count: 100 }));
const OPTIONS = { cle: "Eb", mode: "harmonie" as const, octave: 4, portee: 1, duree: 12, nbCouleurs: 24,
  modeRendu: "FM/Oscillateurs" as const, instrument: 0, volume: 0.8, tempo: 120 };

describe("les accords des deux nœuds à image, par leur calcul pur", () => {
  const rendus: [string, (gamme: string) => HauteurRendue[]][] = [
    ["palette-harmonique", (gamme) => couleursVersNotes(couleurs(), { ...OPTIONS, gamme, ordre: "horizontal" })],
    ["dessin-sonore", (gamme) => formesVersNotes(
      couleurs().map((couleur) => ({ couleur, x: couleur.x, y: couleur.y, area: 100, largeur: 10, hauteur: 10 })),
      { ...OPTIONS, gamme, tailleMin: 0 },
    )],
  ];
  for (const [id, rendre] of rendus) {
    const paire = paires.find((p) => p.fiche === id)!;
    it.each(paire.ids)(`${id} sous « %s » : chaque accord est la triade de la gamme`, (gamme) => {
      const notes = rendre(gamme);
      const a = accordsSurLesDegres(notes, degresDesAccords(gamme)!, 3);
      expect(a.accords).toBe(24);
      expect(a.fautifs).toEqual([]);
      expect(horsDeLaGamme(notes, degresDe(gamme)!, 3)).toEqual([]);
    });
  }
});
