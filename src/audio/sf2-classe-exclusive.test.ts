// audio/sf2-classe-exclusive.test.ts — Une frappe de charleston fait-elle taire la précédente ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, relevé le 2026-11-28 avec l'enveloppe de volume : le charleston
// ouvert de FluidR3, relâché à la fin de sa touche, sonne 2,69 s, et rien ne l'arrêtait quand un
// charleston fermé le suivait. Le générateur 57, la classe exclusive, le dit : une note plus jeune de
// la même classe étouffe les voix de sa classe. FluidSynth les fait relâcher à −2000 timecents,
// 0,31 s pour cent décibels (`fluid_voice_kill_excl`).
//
// LE KIT A LA FORME DE « Hi Hats Treb » de FluidR3 : maintien de 2786 timecents, palier de mille
// centibels, relâchement de 5830 timecents dans la zone globale, et les charlestons dans une classe.
// Le fermé ne dure que 0,05 s : ce qu'on mesure ensuite est l'ouvert seul.
import { describe, expect, it } from "vitest";
import { rendreAvecSF2 } from "./midi-soundfont";
import { ecrireSF2, plage } from "./sf2-essai";
import { analyserSF2 } from "./soundfont";

const SR = 44100;
const sinus = (secondes: number) => Int16Array.from({ length: Math.round(secondes * SR) }, (_, i) => Math.round(8192 * Math.sin((2 * Math.PI * i) / 100)));
const t = (tc: number) => 2 ** (tc / 1200);

const OUVERT = 46, FERME = 42, CRASH = 49;
const SF2 = analyserSF2(ecrireSF2(
  [
    { nom: "Ouvert", donnees: sinus(0.8), taux: SR, noteOriginale: OUVERT },
    { nom: "Ferme", donnees: sinus(0.05), taux: SR, noteOriginale: FERME },
    { nom: "Crash", donnees: sinus(0.8), taux: SR, noteOriginale: CRASH },
  ],
  [{ nom: "Hi Hats Treb", zones: [
    [[35, 2786], [37, 1000], [38, 5830]],
    [[43, plage(OUVERT, OUVERT)], [57, 1], [53, 0]],
    [[43, plage(FERME, FERME)], [57, 1], [53, 1]],
    [[43, plage(CRASH, CRASH)], [53, 2]],
  ] }],
  [{ nom: "Standard", programme: 0, banque: 128, zones: [[[41, 0]]] }],
));

const frappe = (note: number, debut: number, duree = 0.05) => ({ note, velocite: 100, debut, fin: debut + duree });
const rendre = (...notes: ReturnType<typeof frappe>[]) => rendreAvecSF2(SF2, notes, 100, 0, 128);

/**
 * La puissance entre deux instants, sur un nombre ENTIER de périodes de la sinusoïde : une fenêtre de
 * 441 échantillons en couvre 4,41, et son biais, qui change d'une fenêtre à l'autre, valait 0,09 dB.
 */
function dbEntre(b: AudioBuffer, debut: number, fin: number): number {
  const g = b.getChannelData(0);
  let s = 0;
  const i0 = Math.round((debut * SR) / 100) * 100, i1 = Math.round((fin * SR) / 100) * 100;
  for (let i = i0; i < Math.min(i1, g.length); i++) s += g[i] * g[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-30);
}
/** Le niveau de 0,40 à 0,41 s, contre celui de 0,10 à 0,11 s, que rien n'a encore étouffé. */
const apresLeFerme = (b: AudioBuffer) => dbEntre(b, 0.4, 0.41) - dbEntre(b, 0.1, 0.11);

describe("la classe exclusive", () => {
  it("UN CHARLESTON FERMÉ ÉTOUFFE L'OUVERT QUI SONNE ENCORE, déjà relâché", () => {
    // Relâché à 0,05 s à sa propre raison, étouffé à 0,3 s, mesuré 0,105 s plus tard à 0,31 s par
    // course ; la fenêtre de référence, à 0,105 s, a déjà relâché 0,055 s.
    const attendu = -(100 * 0.25) / t(5830) - (100 * 0.105) / t(-2000) + (100 * 0.055) / t(5830);
    expect(apresLeFerme(rendre(frappe(OUVERT, 0), frappe(FERME, 0.3)))).toBeCloseTo(attendu, 0);
  });

  it("ET L'ÉTOUFFE AUSSI QUAND SA TOUCHE EST ENCORE TENUE", () => {
    const attendu = -(100 * 0.105) / t(-2000);
    expect(apresLeFerme(rendre(frappe(OUVERT, 0, 1), frappe(FERME, 0.3)))).toBeCloseTo(attendu, 0);
  });

  it("UN CRASH, HORS DE LA CLASSE, N'EST PAS ÉTOUFFÉ", () => {
    const attendu = -(100 * 0.3) / t(5830);
    expect(apresLeFerme(rendre(frappe(CRASH, 0), frappe(FERME, 0.3)))).toBeCloseTo(attendu, 1);
  });

  it("DEUX FRAPPES DE LA CLASSE PARTIES ENSEMBLE NE S'ÉTOUFFENT PAS", () => {
    const b = rendre(frappe(OUVERT, 0), frappe(FERME, 0));
    expect(dbEntre(b, 0.4, 0.41) - dbEntre(b, 0.1, 0.11)).toBeCloseTo(-(100 * 0.3) / t(5830), 1);
  });
});
