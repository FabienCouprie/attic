// audio/melange-frequences.test.ts — Mélanger des pistes qui n'ont pas la même fréquence.
//
// LA QUESTION POSÉE : quatre instruments joués par quatre banques d'origines différentes finissent
// dans le mélangeur. Celui-ci ouvre un contexte à la fréquence de la PREMIÈRE piste — un choix qui
// pourrait faire jouer les autres trop lentement, exactement comme la banque aux zones mélangées le
// faisait (147 cents trop bas, mesuré dans `clavier-banque.test.ts`).
//
// CE TEST RÉPOND PAR LA MESURE, et non par la lecture de la spécification : on mélange un la3 rendu à
// 48 kHz avec un la3 rendu à 44,1 kHz, et l'on regarde à quelle hauteur sort le résultat. Web Audio
// convertit les tampons qu'on lui confie — le test le VÉRIFIE, plutôt que de s'y fier, parce que le
// jour où ce ne serait plus vrai, quatre parties sur cinq sonneraient faux sans que rien ne le dise.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { melangerPistes } from "./effets-montage";
import { hauteurMediane, suivreHauteur } from "./hauteur";

const ton = (hz: number, sr: number, duree = 0.6): AudioBuffer => {
  const n = Math.round(duree * sr);
  const a = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = a.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = 0.4 * Math.sin((2 * Math.PI * hz * i) / sr);
  return a;
};

const hauteurDe = (b: AudioBuffer) =>
  hauteurMediane(suivreHauteur(b.getChannelData(0), b.sampleRate, { cadence: 100 }));
const cents = (mesure: number, attendu: number) => 1200 * Math.log2(mesure / attendu);

describe("le mélangeur, face à deux fréquences d'échantillonnage", () => {
  it("garde la hauteur d'une piste à 48 kHz mélangée dans une séance à 44,1 kHz", async () => {
    // Seule la piste à 48 kHz est mise, pour que la mesure ne porte que sur elle. Le contexte prend
    // la fréquence de la première piste : c'est bien 48 kHz ici.
    const seule = await melangerPistes([ton(440, 48000)], 0);
    expect(Math.abs(cents(hauteurDe(seule), 440))).toBeLessThan(20);
    // ═══ LE RENDU SE FAIT À LA PLUS HAUTE, ET NON À CELLE DE LA PREMIÈRE PISTE ═══
    //
    // CETTE ASSERTION DISAIT 44 100, et c'était le mécanisme d'avant : le mélangeur prenait
    // `entrees[0].sampleRate`. Relevé au point 5 d'une revue du dépôt, le 2026-10-25, et le
    // mécanisme était pire que l'énoncé — les ports de ce composant sont DYNAMIQUES, de sorte que le
    // premier port est le premier câble posé. Débrancher deux entrées et les rebrancher dans l'autre
    // ordre changeait le fichier rendu.
    //
    // CE QUE CE CAS GARDE N'A PAS CHANGÉ POUR AUTANT, et c'est pourquoi il reste ici : son objet est
    // que les pistes de l'autre fréquence soient CONVERTIES JUSTE, quelle que soit celle du rendu.
    // C'est maintenant la piste à 44,1 kHz qui est convertie, et le relevé porte sur elle.
    const melange = await melangerPistes([ton(440, 44100), ton(880, 48000)], 0);
    expect(melange.sampleRate, "la plus haute des entrées, et non l'ordre des câbles").toBe(48000);
    // Deux hauteurs sonnent en même temps : un suiveur de hauteur n'en rendrait qu'une. On mesure
    // donc l'énergie aux fréquences attendues, par Goertzel.
    const energie = (hz: number) => {
      const d = melange.getChannelData(0), sr = melange.sampleRate;
      const w = (2 * Math.PI * hz) / sr, coef = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + coef * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coef * s1 * s2)) / d.length;
    };
    // 440 Hz DOIT DOMINER 404,25 Hz — la hauteur qu'aurait la piste à 44,1 kHz si ses échantillons
    // étaient lus tels quels à 48 kHz (440 × 44100/48000), soit 147 cents trop bas. C'est exactement
    // le défaut mesuré dans la banque aux zones mélangées, et le témoin a changé de côté avec la
    // règle : avant, c'était la piste à 48 kHz qu'on convertissait, et on guettait 808,5 Hz.
    expect(energie(440)).toBeGreaterThan(energie(404.25) * 4);
    // Et la piste déjà à la fréquence du rendu traverse sans être touchée.
    expect(energie(880)).toBeGreaterThan(energie(808.5) * 4);
  }, 30000);

  it("rend la durée de la piste la plus longue, quelles que soient les fréquences", async () => {
    const melange = await melangerPistes([ton(440, 44100, 0.3), ton(440, 48000, 0.8)], 0);
    expect(melange.duration).toBeGreaterThan(0.75);
  }, 30000);
});
