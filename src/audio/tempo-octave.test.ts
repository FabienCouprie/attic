// audio/tempo-octave.test.ts — Le tempo détecté, et l'ambiguïté qui va avec.
//
// Deux choses sont testées ici. D'abord la correction d'octave, pure et déterministe.
// Ensuite, et c'est le plus utile, la MESURE de ce que la détection d'Attic sait faire :
// on lui donne des trains de clics dont on connaît le tempo, et l'on constate. Un test
// qui se contenterait de vérifier qu'elle renvoie « un nombre » ne dirait rien.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { analyserAudio } from "./analyse";
import { candidatsOctave, fiabiliteTempo, ramenerDansPlage } from "./tempo-octave";

describe("correction d'octave", () => {
  it("laisse en paix un tempo déjà dans la plage", () => {
    expect(ramenerDansPlage(120)).toBe(120);
    expect(ramenerDansPlage(80)).toBe(80);
    expect(ramenerDansPlage(160)).toBe(160);
  });

  it("double un tempo trop lent, divise un tempo trop rapide", () => {
    expect(ramenerDansPlage(50)).toBe(100);
    expect(ramenerDansPlage(70)).toBe(140);
    expect(ramenerDansPlage(200)).toBe(100);
    expect(ramenerDansPlage(320)).toBe(160);
  });

  it("DOUBLE un vrai tempo lent — la limite du repli, assumée et réglable", () => {
    // Mesuré dans l'application : une boîte à rythmes à 75 BPM est correctement détectée
    // à 75, et le repli par défaut la porte à 150. Aucune plage ne gagne partout, puisque
    // rien ne distingue un 75 vrai d'un 150 mal compté ; l'utilisateur élargit la plage,
    // ou coupe le repli, et le rapport lui montre les deux lectures.
    expect(ramenerDansPlage(75)).toBe(150);
    expect(ramenerDansPlage(75, 60, 180)).toBe(75);
  });

  it("respecte une plage donnée", () => {
    expect(ramenerDansPlage(120, 60, 100)).toBe(60);
    expect(ramenerDansPlage(50, 100, 200)).toBe(100);
  });

  it("ne tourne pas en rond sur une plage impossible ou une entrée absurde", () => {
    expect(ramenerDansPlage(120, 100, 101)).toBeGreaterThan(0);
    expect(ramenerDansPlage(0)).toBe(0);
    expect(ramenerDansPlage(NaN)).toBe(0);
    expect(ramenerDansPlage(-5)).toBe(0);
  });

  it("propose la moitié, la valeur et le double — les lectures également plausibles", () => {
    expect(candidatsOctave(120)).toEqual([60, 120, 240]);
    // Rien d'absurde : on ne propose pas 10 BPM ni 800.
    expect(candidatsOctave(30)).toEqual([30, 60]);
    expect(candidatsOctave(0)).toEqual([]);
  });
});

describe("fiabilité annoncée", () => {
  it("se garde de donner un pourcentage : trois paliers, et « nulle » sans tempo", () => {
    expect(fiabiliteTempo(0.9, 120)).toBe("bonne");
    expect(fiabiliteTempo(0.4, 120)).toBe("moyenne");
    expect(fiabiliteTempo(0.1, 120)).toBe("faible");
    expect(fiabiliteTempo(0.9, 0)).toBe("nulle");
  });
});

// ── Ce que la détection existante sait faire, mesuré ──

const SR = 44100;

/** Un train de clics : la percussion la plus simple qui soit, au tempo exact voulu. */
function clics(bpm: number, dureeS: number): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = buf.getChannelData(0);
  const periode = Math.round((60 / bpm) * SR);
  for (let debut = 0; debut < n; debut += periode) {
    // Un clic court avec une décroissance rapide : une attaque nette, rien d'autre.
    for (let i = 0; i < 0.02 * SR && debut + i < n; i++) {
      d[debut + i] = Math.sin((2 * Math.PI * 1200 * i) / SR) * Math.exp(-i / (0.004 * SR));
    }
  }
  return buf;
}

describe("détection de tempo d'Attic, mesurée sur des tempos connus", () => {
  it("retrouve un train de clics à 120 BPM", () => {
    const r = analyserAudio(clics(120, 8));
    expect(ramenerDansPlage(r.tempo)).toBe(120);
  });

  it("retrouve 90, 100 et 140 BPM à un battement près, après correction d'octave", () => {
    for (const bpm of [90, 100, 140]) {
      const r = analyserAudio(clics(bpm, 8));
      expect(Math.abs(ramenerDansPlage(r.tempo) - bpm), `${bpm} BPM → ${r.tempo}`).toBeLessThanOrEqual(1);
    }
  });

  it("annonce une fiabilité non nulle quand le tempo est franc", () => {
    const r = analyserAudio(clics(120, 8));
    expect(fiabiliteTempo(r.tempoConfiance, r.tempo)).not.toBe("nulle");
  });

  it("n'invente pas de tempo sur du silence", () => {
    const vide = new AudioBuffer({ numberOfChannels: 1, length: SR * 4, sampleRate: SR });
    const r = analyserAudio(vide);
    // Sans attaque, la confiance doit rester basse : c'est ce que le nœud affichera.
    expect(fiabiliteTempo(r.tempoConfiance, r.tempo)).not.toBe("bonne");
  });
});
