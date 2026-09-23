// audio/motif-regions.test.ts — Les quatre régions, rendues par le VRAI synthétiseur, s'y mesurent-elles ?
//
// C'EST LE TEST QUI COMPTE POUR LES DEUX GÉNÉRATEURS, et le seul qui pouvait voir la faute trouvée
// dans l'application : les autres tests rendent le motif avec un timbre simple, écrit pour le test,
// et ne disent donc rien de ce que le synthétiseur du nœud produit vraiment. Or c'est là que tout se
// jouait — visé au grave de l'amer, un timbre brillant plaçait la médiane de son énergie deux
// octaves plus haut, et une musique demandée pour l'amertume s'analysait comme sucrée à 91 %.
//
// On demande donc chacune des quatre régions, on la rend comme le nœud la rend, on la remesure avec
// `gout.ts`, et l'on exige que le goût demandé arrive PREMIER. Si ce fichier tombe, les deux nœuds
// ont cessé de tenir ce que leur notice annonce.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { dbDepuisIntensite, motifDepuisPoint, rendreAuRegistre, viserNiveau } from "./motif-crossmodal";
import { mesurer, profil, REGIONS, type Gout } from "./gout";
import { rendreSequence } from "./midi";
import { creerAleatoire } from "../core/hasard";

/** Exactement la chaîne des deux nœuds : motif, rendu doux corrigé au registre, mise au niveau. */
async function rendreRegion(gout: Gout, programme: number) {
  const cible = { ...REGIONS[gout], intensite: 0.4 };
  const premier = motifDepuisPoint(cible, { duree: 6, hasard: creerAleatoire(42), programme });
  const { son, correction } = await rendreAuRegistre(premier, cible.hauteur, (m) =>
    rendreSequence(m.notes, "FM/Oscillateurs", 80, m.programme, 0, "douce"));
  const mesure = mesurer(viserNiveau(son, dbDepuisIntensite(cible.intensite)));
  return { cible, mesure, parts: profil(mesure.dimensions), correction };
}

describe("les quatre régions passées par le synthétiseur", () => {
  // Le piano pour le sucré, le trombone pour l'amer et l'acide : ce que la littérature donne, et ce
  // que le nœud « Accord mets-musique » choisit.
  const PROGRAMMES: Record<Gout, number> = { "sucré": 0, acide: 57, amer: 57, "salé": 0 };

  for (const gout of ["sucré", "acide", "amer", "salé"] as Gout[]) {
    it(`« ${gout} » se mesure d'abord comme « ${gout} »`, async () => {
      const { parts } = await rendreRegion(gout, PROGRAMMES[gout]);
      const lisible = parts.map((p) => `${p.gout} ${Math.round(p.part * 100)} %`).join(" · ");
      expect(parts[0].gout, lisible).toBe(gout);
    }, 120000);
  }

  it("le registre visé est atteint à 0,05 près, sur les quatre", async () => {
    for (const gout of ["sucré", "acide", "amer", "salé"] as Gout[]) {
      const { cible, mesure } = await rendreRegion(gout, PROGRAMMES[gout]);
      expect(mesure.dimensions.hauteur, `${gout} : ${Math.round(mesure.registre)} Hz`)
        .toBeCloseTo(cible.hauteur, 1);
    }
  }, 240000);

  it("la consonance de l'acide est approchée sans être atteinte — la limite est dite, non cachée", async () => {
    // La rugosité mesurable sature : la notice annonce une descente de 0,99 à 0,70 environ, et non
    // jusqu'au 0,15 de la région acide. Le test fige cette limite, de sorte qu'un progrès sur ce
    // point se voie, et qu'une régression aussi.
    const acide = await rendreRegion("acide", 57);
    expect(acide.mesure.dimensions.consonance).toBeGreaterThan(REGIONS["acide"].consonance);
    expect(acide.mesure.dimensions.consonance).toBeLessThan(0.8);
    // Et l'âpreté demandée s'entend malgré tout : plus rugueux que le sucré, qui vise l'inverse.
    const sucre = await rendreRegion("sucré", 0);
    expect(acide.mesure.rugosite).toBeGreaterThan(sucre.mesure.rugosite * 5);
  }, 240000);
});
