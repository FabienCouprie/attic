// audio/sf2-filtre-rendu.test.ts — Le rendu SoundFont filtre-t-il une zone comme le fichier le décrit ?
//
// LE DÉFAUT QUE CE FICHIER GARDE, relevé le 2026-11-28 : `rendreAvecSF2` ne lisait aucun filtre.
// « Synth Bass 1 » de FluidR3, qui coupe à 120 Hz et que son enveloppe de modulation ouvre puis
// referme, gardait un centroïde de 2 690 Hz du début à la fin.
//
// LE FICHIER EST ÉCRIT PUIS RELU PAR `analyserSF2`. Son échantillon porte deux partiels de même
// amplitude, 441 et 4 410 Hz, joués à leur hauteur d'origine : le rapport des deux à la sortie est la
// réponse du filtre, et la réponse attendue est celle du passe-bas de Bristow-Johnson que FluidSynth
// emploie, calculée ici à part, sur ses coefficients écrits en clair, au gain près : √(Q₀ / Q), qui
// vaut un sans résonance (voir l'en-tête de `sf2-filtre.ts`).
import { describe, expect, it } from "vitest";
import { rendreAvecSF2 } from "./midi-soundfont";
import { ecrireSF2 } from "./sf2-essai";
import { analyserSF2 } from "./soundfont";

const SR = 44100;
const deuxPartiels = (secondes: number) => Int16Array.from({ length: Math.round(secondes * SR) },
  (_, i) => Math.round(4000 * Math.sin((2 * Math.PI * i) / 100) + 4000 * Math.sin((2 * Math.PI * i) / 10)));

const SF2 = analyserSF2(ecrireSF2(
  [{ nom: "Deux partiels", donnees: deuxPartiels(0.5), taux: SR, noteOriginale: 69, boucle: [10000, 22000] }],
  [
    { nom: "Ouvert", zones: [[[54, 1], [53, 0]]] },
    { nom: "Sombre", zones: [[[8, 6900], [54, 1], [53, 0]]] },
    { nom: "Résonant", zones: [[[8, 6900], [9, 120], [54, 1], [53, 0]]] },
    // Coupure à 4 800 cents, ouverte de 6 000 par l'enveloppe de modulation, qui retombe de un à zéro en
    // deux secondes (chute de 1 200 timecents, palier de mille millièmes) : 10 800 − 3 000 × t cents.
    { nom: "Balayé", zones: [[[8, 4800], [11, 6000], [28, 1200], [29, 1000], [54, 1], [53, 0]]] },
  ],
  [0, 1, 2, 3].map((k) => ({ nom: `p${k}`, programme: k, banque: 0, zones: [[[41, k]]] as Array<[number, number]>[] })),
));

/** L'amplitude d'un partiel de `periode` échantillons, sur 4 400 échantillons centrés sur `t`. */
function amplitude(x: Float32Array, periode: number, t: number): number {
  const n = 4400, debut = Math.round(t * SR) - n / 2;
  let s = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const w = (2 * Math.PI * (debut + i)) / periode;
    s += x[debut + i] * Math.sin(w);
    c += x[debut + i] * Math.cos(w);
  }
  return (2 / n) * Math.hypot(s, c);
}

/** La réponse en décibels, à `f` hertz, du passe-bas de FluidSynth réglé à `cents` et `resonanceCb`. */
function reponseDb(f: number, cents: number, resonanceCb: number): number {
  const q = 10 ** ((resonanceCb / 10 - 3.01) / 20), gain = Math.sqrt(10 ** (-3.01 / 20) / q);
  const w0 = (2 * Math.PI * 8.176 * 2 ** (cents / 1200)) / SR, alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
  const b1 = ((1 - Math.cos(w0)) / a0) * gain, b0 = b1 / 2, a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alpha) / a0;
  const w = (2 * Math.PI * f) / SR;
  const re = (k: number[]) => k[0] + k[1] * Math.cos(w) + k[2] * Math.cos(2 * w);
  const im = (k: number[]) => -(k[1] * Math.sin(w) + k[2] * Math.sin(2 * w));
  const num = [b0, b1, b0], den = [1, a1, a2];
  return 20 * Math.log10(Math.hypot(re(num), im(num)) / Math.hypot(re(den), im(den)));
}

const rendre = (programme: number) =>
  rendreAvecSF2(SF2, [{ note: 69, velocite: 127, debut: 0, fin: 2 }], 100, programme).getChannelData(0);
const db = (x: number) => 20 * Math.log10(x);
const ouvert = rendre(0);

describe("le filtre d'une zone", () => {
  it("UNE ZONE QUI COUPE À 440 HZ ÉTEINT SON PARTIEL DE 4 410 HZ comme le passe-bas de la norme", () => {
    const sombre = rendre(1);
    for (const f of [441, 4410]) {
      const mesure = db(amplitude(sombre, SR / f, 1) / amplitude(ouvert, SR / f, 1));
      expect(mesure, `${f} Hz`).toBeCloseTo(reponseDb(f, 6900, 0), 0);
    }
  });

  it("SA RÉSONANCE MONTE LA COUPURE au-dessus du gain continu, de la moitié de la bosse chacun", () => {
    const resonant = rendre(2);
    expect(db(amplitude(resonant, 100, 1) / amplitude(ouvert, 100, 1))).toBeCloseTo(reponseDb(441, 6900, 120), 0);
    // Et la bosse est là : à la coupure, la résonance rend plus que le filtre sans résonance.
    expect(reponseDb(441, 6900, 120) - reponseDb(441, 6900, 0)).toBeGreaterThan(5);
  });

  it("L'ENVELOPPE DE MODULATION FERME LA COUPURE à mesure qu'elle retombe", () => {
    const balaye = rendre(3);
    for (const t of [0.5, 1.5]) {
      const mesure = db(amplitude(balaye, 10, t) / amplitude(ouvert, 10, t));
      expect(mesure, `à ${t} s`).toBeCloseTo(reponseDb(4410, 10800 - 3000 * t, 0), 0);
    }
  });

  it("UNE ZONE SANS FILTRE REND SES DEUX PARTIELS INTACTS", () => {
    expect(amplitude(ouvert, 10, 1) / amplitude(ouvert, 100, 1)).toBeCloseTo(1, 3);
  });
});
