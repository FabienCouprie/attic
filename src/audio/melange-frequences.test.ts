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
    // Et maintenant l'inverse : la première piste est à 44,1 kHz, la seconde à 48 kHz. Le rendu se
    // fait donc à 44,1 kHz, et c'est la seconde qui doit être convertie.
    const melange = await melangerPistes([ton(440, 44100), ton(880, 48000)], 0);
    expect(melange.sampleRate).toBe(44100);
    // Deux hauteurs sonnent en même temps : un suiveur de hauteur n'en rendrait qu'une. On mesure
    // donc l'énergie aux fréquences attendues, par Goertzel.
    const energie = (hz: number) => {
      const d = melange.getChannelData(0), sr = melange.sampleRate;
      const w = (2 * Math.PI * hz) / sr, coef = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < d.length; i++) { const s0 = d[i] + coef * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coef * s1 * s2)) / d.length;
    };
    // 880 Hz doit dominer 808,5 Hz — la hauteur qu'aurait la piste si elle n'était PAS convertie
    // (880 × 44100/48000). C'est exactement le défaut mesuré dans la banque aux zones mélangées.
    expect(energie(880)).toBeGreaterThan(energie(808.5) * 4);
    expect(energie(440)).toBeGreaterThan(energie(808.5) * 4);
  }, 30000);

  it("rend la durée de la piste la plus longue, quelles que soient les fréquences", async () => {
    const melange = await melangerPistes([ton(440, 44100, 0.3), ton(440, 48000, 0.8)], 0);
    expect(melange.duration).toBeGreaterThan(0.75);
  }, 30000);
});
