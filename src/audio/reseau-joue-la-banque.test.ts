// audio/reseau-joue-la-banque.test.ts — Le son étalé sur le réseau sonne à la hauteur du degré.
//
// CE QUE CE FICHIER TIENT, ET LE DÉFAUT QU'IL A FALLU RELEVER DEUX FOIS.
//
// D'abord, « Clavier isomorphe » synthétisait un oscillateur et n'acceptait aucun son : l'exemple
// livré étalait le timbre sur les quatre-vingt-huit touches d'un piano pendant que le réseau, à
// côté, faisait sonner un triangle. Le son et le réseau ne se rencontraient jamais.
//
// Ensuite, et c'est Fabien qui l'a vu, LE RÉGLAGE DEMANDAIT L'INVERSE DE CE QU'IL FAISAIT : pour
// obtenir un réseau en degrés il fallait régler « Compter en » sur demi-tons, et faire le geste
// naturel — le basculer en degrés, brancher l'accordage que le refus réclame — rendait un son faux
// de quarante-cinq à quatre-vingt-seize cents, tous les nœuds annonçant « Terminé ».
//
// LA CAUSE : UNE BANQUE NE DÉCLARAIT PAS SI ELLE ÉTAIT DÉJÀ ACCORDÉE. Celle du mode degrés porte un
// désaccord par touche ; le réseau, qui calcule lui-même la hauteur d'un degré, l'ajoutait une
// seconde fois. Elle le déclare maintenant, et l'adresse suit :
//
//   banque accordée      on demande sa TOUCHE, `tonique + rang`, son désaccord fait le reste
//   banque en demi-tons  on demande la HAUTEUR, qu'elle rééchantillonne
//
// Les deux rendent la même hauteur, au millième de cent près, et c'est ce que les deux premiers cas
// mesurent. Le troisième mesure ce qui arrivait avant : la mauvaise adresse, et son écart.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { accordageDepuisCents, CENTS_PAR_OCTAVE, hauteurDuDegre } from "./accordage";
import { reseau, sautDeRangee } from "./clavier-isomorphe";
import { construireBanque, voixPourNote, type Banque } from "./clavier-banque";

const RACINE = 60;

const sonSource = (): AudioBuffer =>
  new AudioBuffer({ numberOfChannels: 1, length: 2048, sampleRate: 44100 });

/**
 * Une banque montée avec un transpositeur qui NOTE ce qu'on lui demande.
 *
 * LA RACINE D'UNE ZONE N'EST PAS LA HAUTEUR DE SON ÉCHANTILLON, et un premier jet de ce fichier l'a
 * oublié : il lisait `zone.racine` comme la hauteur du son, ce qui n'est vrai qu'en demi-tons. En
 * degrés, l'échantillon d'une racine a été rendu à la HAUTEUR DU DEGRÉ de cette racine. Mon
 * instrument annonçait alors cent quatre-vingt-quatre cents d'écart sur du code juste.
 */
function banqueNotee(o: Record<string, unknown> = {}): { banque: Banque; demandes: number[] } {
  const demandes: number[] = [];
  const banque = construireBanque(sonSource(), {
    racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 96,
    transposer: (_a: AudioBuffer, d: number) => { demandes.push(d); return sonSource(); },
    ...o,
  } as Parameters<typeof construireBanque>[1]);
  return { banque, demandes };
}

/** L'écart, en cents, entre la hauteur qu'une banque fait SONNER et celle attendue. */
function ecartCents(b: Banque, demandes: number[], adresse: number, attendue: number): number {
  const voix = voixPourNote(b, adresse);
  if (!voix) throw new Error(`aucune zone pour l'adresse ${adresse}`);
  // La hauteur de l'échantillon de cette zone : `RACINE + ce qu'on a demandé au transpositeur`,
  // les racines étant parcourues dans l'ordre, une demande chacune.
  const racines = [...new Set(b.zones.map((z) => z.racine))].sort((x, y) => x - y);
  const hauteurEchantillon = RACINE + demandes[racines.indexOf(voix.zone.racine)];
  return (hauteurEchantillon + 12 * Math.log2(voix.ratio) - attendue) * 100;
}

// Un accordage franchement inégal : aucun de ses degrés ne tombe sur un demi-ton tempéré.
const INEGAL = accordageDepuisCents([0, 137, 241, 386, 547, 684, 815, 1013], CENTS_PAR_OCTAVE, RACINE);
const CASES = reseau(INEGAL, sautDeRangee(INEGAL, "quinte"));

describe("le son étalé sur le réseau", () => {
  it("UNE BANQUE EN DEMI-TONS, ADRESSÉE PAR LA HAUTEUR, sonne juste", () => {
    const { banque: b, demandes } = banqueNotee();
    expect(b.accordee, "elle ne sait rien d'une échelle, elle ne déclare rien").toBeUndefined();
    for (const c of CASES.filter((x) => x.note >= 48 && x.note <= 96)) {
      expect(Math.abs(ecartCents(b, demandes, c.note, c.note)), `case ${c.code}, rang ${c.rang}`)
        .toBeLessThan(0.001);
    }
  });

  it("UNE BANQUE ACCORDÉE, ADRESSÉE PAR LA TOUCHE, sonne juste elle aussi", () => {
    const { banque: b, demandes } = banqueNotee({ accordage: INEGAL, toniqueTouche: RACINE });
    // ELLE LE DÉCLARE, et c'est ce qui permet à son destinataire de l'adresser comme il faut.
    expect(b.accordee).toEqual({ tonique: RACINE, degres: INEGAL.degres.length });
    for (const c of CASES.filter((x) => RACINE + x.rang >= 48 && RACINE + x.rang <= 96)) {
      // La touche porte le degré, et la hauteur attendue est celle que le réseau affiche.
      expect(Math.abs(ecartCents(b, demandes, b.accordee!.tonique + c.rang, c.note)), `case ${c.code}`)
        .toBeLessThan(0.001);
    }
  });

  it("et les degrés demandés ne sont pas des demi-tons, sans quoi rien ne serait prouvé", () => {
    const horsTempere = CASES.filter((c) => Math.abs(c.note - Math.round(c.note)) > 1e-6);
    expect(horsTempere.length / CASES.length).toBeGreaterThan(0.8);
  });

  // ─── Ce qui arrivait avant, mesuré plutôt qu'affirmé ───
  it("LA MAUVAISE ADRESSE DOUBLE L'ÉCART, et c'est pourquoi la banque le déclare", () => {
    const { banque: b, demandes } = banqueNotee({ accordage: INEGAL, toniqueTouche: RACINE });
    const ecarts = CASES
      .filter((c) => c.note >= 48 && c.note <= 96 && Math.abs(c.note - RACINE) > 0.5)
      // L'erreur d'hier : demander la HAUTEUR à une banque qui attend une TOUCHE.
      .map((c) => Math.abs(ecartCents(b, demandes, c.note, c.note)));
    expect(Math.max(...ecarts), "le doublement doit se voir, et franchement").toBeGreaterThan(20);
  });

  it("la hauteur d'une touche accordée est bien celle de son degré, et non celle du demi-ton", () => {
    const { banque: b, demandes } = banqueNotee({ accordage: INEGAL, toniqueTouche: RACINE });
    // Le degré 3 de cet accordage vaut 386 cents : la touche 63 doit sonner là, non à 63 juste.
    const attendue = hauteurDuDegre(INEGAL, 3);
    expect(attendue).toBeCloseTo(RACINE + 3.86, 6);
    expect(Math.abs(ecartCents(b, demandes, RACINE + 3, attendue))).toBeLessThan(0.001);
  });
});
