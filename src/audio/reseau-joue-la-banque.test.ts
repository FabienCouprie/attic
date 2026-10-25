// audio/reseau-joue-la-banque.test.ts — Le son étalé sur le réseau sonne à la hauteur du degré.
//
// CE QUE CE FICHIER TIENT, ET LE DÉFAUT QU'IL A FALLU RELEVER. « Clavier isomorphe » synthétisait un
// oscillateur et n'acceptait aucun son : l'exemple livré étalait le timbre sur les quatre-vingt-huit
// touches d'un piano pendant que le réseau, à côté, jouait un triangle. Le son et le réseau ne se
// rencontraient jamais, ce qui était pourtant le but.
//
// IL LES REJOINT PAR `voixPourNote`, qui accepte une hauteur FRACTIONNAIRE : son rapport de lecture
// vaut `2^((hauteur − racine)/12)`, et le degré d'un accordage inégal tombe entre deux demi-tons.
//
// LA BANQUE DOIT ÊTRE ÉTALÉE EN DEMI-TONS, ET C'EST LE PIÈGE QUE LE SECOND CAS MESURE. En degrés,
// « Étaler sur le clavier » pose sur chaque touche un désaccord valant l'écart du degré au demi-ton.
// La hauteur demandée par une case le porte DÉJÀ : les deux s'ajoutent, et le son part deux fois
// plus loin. Le mode degrés sert à écrire un instrument SFZ jouable sur un clavier de piano.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { accordageDepuisCents, CENTS_PAR_OCTAVE, hauteurDuDegre } from "./accordage";
import { reseau, sautDeRangee } from "./clavier-isomorphe";
import { construireBanque, voixPourNote, type Banque } from "./clavier-banque";

const RACINE = 60;

const sonSource = (): AudioBuffer =>
  new AudioBuffer({ numberOfChannels: 1, length: 2048, sampleRate: 44100 });

/** Une banque dont chaque zone porte un échantillon distinct, pour que le partage se voie. */
function banque(o: Partial<Parameters<typeof construireBanque>[1]> = {}): Banque {
  return construireBanque(sonSource(), {
    racineSource: RACINE, largeur: 2, suiviTouche: 0, noteBasse: 48, noteHaute: 84,
    transposer: () => sonSource(), ...o,
  } as Parameters<typeof construireBanque>[1]);
}

/** L'écart, en cents, entre la hauteur rendue par la banque et celle demandée. */
function ecartCents(b: Banque, hauteur: number): number {
  const voix = voixPourNote(b, hauteur);
  if (!voix) throw new Error(`aucune zone pour la hauteur ${hauteur}`);
  const jouee = voix.zone.racine + 12 * Math.log2(voix.ratio);
  return (jouee - hauteur) * 100;
}

// Un accordage franchement inégal : aucun de ses degrés ne tombe sur un demi-ton tempéré.
const INEGAL = accordageDepuisCents([0, 137, 241, 386, 547, 684, 815, 1013], CENTS_PAR_OCTAVE, RACINE);

describe("le son étalé sur le réseau", () => {
  it("UNE BANQUE EN DEMI-TONS SONNE À LA HAUTEUR DU DEGRÉ, une seule fois", () => {
    const b = banque();
    const cases = reseau(INEGAL, sautDeRangee(INEGAL, "quinte"));
    for (const c of cases.filter((x) => x.note >= 48 && x.note <= 84)) {
      // La hauteur jouée est celle de la case, au millième de cent près : le rééchantillonnage est
      // continu, et rien ne s'y ajoute.
      expect(Math.abs(ecartCents(b, c.note)), `case ${c.code}, rang ${c.rang}`).toBeLessThan(0.001);
    }
  });

  it("et les degrés demandés ne sont pas des demi-tons, sans quoi ce cas ne prouverait rien", () => {
    const cases = reseau(INEGAL, sautDeRangee(INEGAL, "quinte"));
    const horsTempere = cases.filter((c) => Math.abs(c.note - Math.round(c.note)) > 1e-6);
    expect(horsTempere.length / cases.length).toBeGreaterThan(0.8);
  });

  // ─── Le piège, mesuré plutôt qu'affirmé ───
  it("UNE BANQUE EN DEGRÉS DOUBLERAIT L'ÉCART, et c'est pourquoi la notice la refuse", () => {
    // La même banque, étalée en DEGRÉS : chaque touche porte alors son désaccord en cents.
    const enDegres = banque({ accordage: INEGAL, toniqueTouche: RACINE } as never);
    const avecDesaccord = enDegres.zones.filter((z) => (z.accord ?? 0) !== 0);
    expect(avecDesaccord.length, "le mode degrés doit bien poser des désaccords").toBeGreaterThan(5);

    const cases = reseau(INEGAL, sautDeRangee(INEGAL, "quinte"))
      .filter((c) => c.note >= 48 && c.note <= 84 && Math.abs(c.note - RACINE) > 0.5);
    const ecarts = cases.map((c) => Math.abs(ecartCents(enDegres, c.note)));
    const pire = Math.max(...ecarts);
    // L'écart n'est plus nul : la hauteur fractionnaire et le désaccord de la zone s'ajoutent.
    expect(pire, "le doublement doit se voir, et franchement").toBeGreaterThan(20);
  });
});
