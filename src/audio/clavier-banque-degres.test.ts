// audio/clavier-banque-degres.test.ts — Étaler un son sur un clavier accordé autrement.
//
// CE QUE CETTE VOIE RÉSOUT, ET POURQUOI L'AUTRE NE SUFFIT PAS. Un échantillonneur interpole en
// demi-tons À L'INTÉRIEUR d'une région : `pitch_keytrack` peut déclarer un tempérament ÉGAL en un
// seul nombre — 63,16 cents par touche pour dix-neuf degrés —, mais aucun nombre ne décrit une
// échelle INÉGALE. Or les échelles inégales sont précisément ce que produisent « Courbe de
// dissonance », d'après Sethares, et « Gammes du monde » avec ses maqamat et ses ragas.
//
// LA FORME RETENUE EST CELLE DES INSTRUMENTS MICROTONAUX SÉRIEUX : une région par touche, chacune
// avec son désaccord en cents, plusieurs partageant le même échantillon. À l'écriture cela donne
// `lokey=K hikey=K pitch_keycenter=R tune=…`, ce que les deux lots précédents ont rendu écrivable
// et relisible.
//
// LE CAS QUI COMPTE LE PLUS EST LA NEUTRALITÉ : un accordage à douze degrés égaux doit rendre
// EXACTEMENT les hauteurs du clavier ordinaire. Sans cela, poser un accordage déplacerait le son
// sans qu'on l'ait demandé.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { accordageDepuisCents, accordageEgal, hauteurDuDegre } from "./accordage";
import { construireBanque, versSfz, voixPourNote, type Banque } from "./clavier-banque";

const RACINE = 60;

const sonSource = (): AudioBuffer =>
  new AudioBuffer({ numberOfChannels: 1, length: 2048, sampleRate: 44100 });

/**
 * Une banque montée avec un transpositeur qui NOTE ce qu'on lui demande au lieu de calculer.
 *
 * Les hauteurs se vérifient alors sans dépendre du vocodeur : l'échantillon d'une racine sonne à
 * la hauteur qu'on a demandée pour elle, et le rapport de lecture dit le reste.
 */
function banqueNotee(o: Parameters<typeof construireBanque>[1]): {
  banque: Banque; demandes: number[];
} {
  const demandes: number[] = [];
  // UN TAMPON NEUF À CHAQUE APPEL, et non le même rendu tel quel : avec un transpositeur d'identité,
  // toutes les zones partageraient le même objet et le partage d'échantillons entre touches
  // deviendrait invérifiable. C'est la sonde qui l'aurait caché, pas le code qui l'aurait fait.
  const banque = construireBanque(sonSource(), {
    ...o, transposer: (_a, d) => { demandes.push(d); return sonSource(); },
  });
  return { banque, demandes };
}

/** La hauteur à laquelle une touche sonne, en demi-tons MIDI fractionnaires. */
function hauteurJouee(banque: Banque, touche: number, demandes: number[]): number {
  const voix = voixPourNote(banque, touche);
  if (!voix) throw new Error(`aucune zone pour la touche ${touche}`);
  // L'échantillon de cette zone a été demandé à `RACINE + d`, `d` étant le rang de sa racine dans
  // l'ordre des demandes : les racines sont parcourues dans l'ordre, une demande chacune.
  const racines = [...new Set(banque.zones.map((z) => z.racine))].sort((x, y) => x - y);
  const rang = racines.indexOf(voix.zone.racine);
  return RACINE + demandes[rang] + 12 * Math.log2(voix.ratio);
}

describe("étaler un son sur un clavier accordé", () => {
  it("UN ACCORDAGE À DOUZE DEGRÉS ÉGAUX REND LE CLAVIER ORDINAIRE, et c'est la condition", () => {
    const o = { racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 72 };
    const { banque, demandes } = banqueNotee({ ...o, accordage: accordageEgal(12, 1200, RACINE) });
    for (let touche = 48; touche <= 72; touche++) {
      expect(hauteurJouee(banque, touche, demandes), `touche ${touche}`).toBeCloseTo(touche, 9);
    }
    // Et aucun désaccord n'est posé : en tempérament ordinaire, l'écart à rattraper est nul partout.
    expect(banque.zones.every((z) => z.accord === undefined)).toBe(true);
  });

  it("DIX-NEUF DEGRÉS : dix-neuf touches font l'octave, et douze ne la font plus", () => {
    const a = accordageEgal(19, 1200, RACINE);
    const { banque, demandes } = banqueNotee({
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 90, accordage: a,
    });
    expect(hauteurJouee(banque, 79, demandes)).toBeCloseTo(72, 6);
    expect(hauteurJouee(banque, 72, demandes)).toBeCloseTo(RACINE + (12 * 1200) / 19 / 100, 6);
    // Chaque touche sonne au degré que l'accordage lui donne.
    for (const touche of [61, 65, 70, 84]) {
      expect(hauteurJouee(banque, touche, demandes), `touche ${touche}`)
        .toBeCloseTo(hauteurDuDegre(a, touche - RACINE), 6);
    }
  });

  it("UNE ÉCHELLE INÉGALE EST TENUE, ce qu'aucun `pitch_keytrack` ne saurait dire", () => {
    // Les creux que la notice de « Courbe de dissonance » annonce pour un timbre harmonique :
    // l'intonation juste, dont les degrés ne sont pas également espacés.
    const a = accordageDepuisCents([0, 316, 386, 498, 702, 1200], 1200, RACINE, "harmonique");
    const { banque, demandes } = banqueNotee({
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 55, noteHaute: 70, accordage: a,
    });
    for (let touche = 55; touche <= 70; touche++) {
      expect(hauteurJouee(banque, touche, demandes), `touche ${touche}`)
        .toBeCloseTo(hauteurDuDegre(a, touche - RACINE), 6);
    }
    // La quinte juste, 702 cents, tombe bien sur la touche du quatrième degré.
    expect(hauteurJouee(banque, 64, demandes)).toBeCloseTo(RACINE + 7.02, 6);
  });

  it("UNE RÉGION PAR TOUCHE, ET UN ÉCHANTILLON POUR PLUSIEURS", () => {
    const { banque, demandes } = banqueNotee({
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 72,
      accordage: accordageEgal(19, 1200, RACINE),
    });
    // Une zone par touche, et chacune ne couvre qu'elle.
    expect(banque.zones.length).toBe(72 - 48 + 1);
    expect(banque.zones.every((z) => z.basse === z.haute)).toBe(true);
    // Les échantillons sont partagés : autant de tampons distincts que de racines, pas de touches.
    const tampons = new Set(banque.zones.map((z) => z.audio));
    const racines = new Set(banque.zones.map((z) => z.racine));
    expect(tampons.size).toBe(racines.size);
    expect(demandes.length).toBe(racines.size);
    expect(racines.size).toBeLessThan(banque.zones.length);
  });

  it("LE DÉSACCORD RESTE PETIT, ce qui est le seul rôle de la hauteur donnée à la racine", () => {
    // CE CAS EXISTE PARCE QU'UN DÉFAUT PLANTÉ N'A PAS TIRÉ. Donner à la racine la hauteur de sa
    // TOUCHE au lieu de celle de son DEGRÉ laissait les cinq autres cas verts : le désaccord par
    // touche rattrape l'écart exactement, et la hauteur de la racine s'annule dans le calcul.
    //
    // Elle ne sert donc pas la justesse — elle sert à garder le rééchantillonnage court. Mal
    // choisie, les désaccords enflent avec l'éloignement de la tonique, jusqu'à plus d'une octave
    // au bout du clavier, et l'on rééchantillonne de très loin ce qu'on aurait pu enregistrer près.
    const { banque } = banqueNotee({
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 21, noteHaute: 108,
      accordage: accordageEgal(19, 1200, RACINE),
    });
    const pire = Math.max(...banque.zones.map((z) => Math.abs(z.accord ?? 0)));
    // Deux degrés de part et d'autre d'une racine, à 63,16 cents le degré : l'écart à rattraper ne
    // peut pas dépasser deux fois l'écart entre un degré et un demi-ton, soit moins de 150 cents.
    expect(pire).toBeLessThan(150);
  });

  it("ET L'ÉCRITURE REND UNE RÉGION PAR TOUCHE, avec son désaccord", () => {
    const { banque } = banqueNotee({
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 58, noteHaute: 62,
      accordage: accordageEgal(19, 1200, RACINE),
    });
    const blocs = versSfz(banque, { dossier: "b" }).split("<region>").slice(1);
    expect(blocs.length).toBe(5);
    // Chaque région ne couvre qu'une touche, et celles qui ne tombent pas juste portent un `tune`.
    for (const bloc of blocs) expect(bloc).toMatch(/lokey=(\d+) hikey=\1\b/);
    expect(blocs.filter((b) => /tune=/.test(b)).length).toBeGreaterThan(0);
  });

  it("SANS ACCORDAGE, RIEN NE CHANGE : la zone reste large et sans désaccord", () => {
    const { banque } = banqueNotee({
      racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 72,
    });
    expect(banque.zones.some((z) => z.haute > z.basse)).toBe(true);
    expect(banque.zones.every((z) => z.accord === undefined)).toBe(true);
  });
});
