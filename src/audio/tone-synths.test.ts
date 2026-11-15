// audio/tone-synths.test.ts — Test de rendu offline Tone.js (MembraneSynth, MetalSynth, PolySynth, FM/AM, PluckSynth).
// Le polyfill Web Audio pour Node.js doit etre charge avant Tone.js.
//
// CES TESTS RENDENT VRAIMENT DU SON, et c'est ce qui les rend lents : Tone.js construit une chaîne
// complète dans un contexte hors ligne, et le polyfill Web Audio de Node n'a pas la vitesse d'un
// navigateur. Mesuré : sept secondes pour ce seul fichier, quand la suite entière en prend
// cinquante. C'est pour eux que le délai global de la suite est à soixante secondes plutôt qu'aux
// quinze par défaut (cf. `vite.config.ts`) : sous charge, ce fichier les dépassait.

// @ts-ignore
if (typeof globalThis.isSecureContext === "undefined") globalThis.isSecureContext = true;
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";

describe("genererMembraneSynth", () => {
  it("rend un buffer stéréo non silencieux pour un kick C2", async () => {
    const { genererMembraneSynth } = await import("./tone-synths");
    const buffer = await genererMembraneSynth({
      note: "C2",
      duree: 1,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(0.5);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    const maxG = Math.max(...gauche);
    const maxD = Math.max(...droite);
    expect(maxG).toBeGreaterThan(0);
    expect(maxD).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });

  it("respecte la duree demandee quand elle depasse l'enveloppe", async () => {
    const { genererMembraneSynth } = await import("./tone-synths");
    const buffer = await genererMembraneSynth({
      note: "A1",
      duree: 0.2,
      volume: 60,
      decay: 0.01,
      release: 0.05,
      sampleRate: 44100,
    });
    expect(buffer.duration).toBeLessThan(0.5);
  });
});

describe("genererMetalSynth", () => {
  it("rend un buffer stéréo non silencieux pour un hi-hat C5", async () => {
    const { genererMetalSynth } = await import("./tone-synths");
    const buffer = await genererMetalSynth({
      note: "C5",
      duree: 2,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(1);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    const maxG = Math.max(...gauche);
    const maxD = Math.max(...droite);
    expect(maxG).toBeGreaterThan(0);
    expect(maxD).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });

  it("produit un son plus long avec un decay étendu", async () => {
    const { genererMetalSynth } = await import("./tone-synths");
    const buffer = await genererMetalSynth({
      note: "G4",
      duree: 0.5,
      volume: 70,
      decay: 0.05,
      release: 0.05,
      sampleRate: 44100,
    });
    expect(buffer.duration).toBeLessThan(0.8);
  });
});

describe("genererPolySynth", () => {
  it("rend un accord C major stéréo non silencieux", async () => {
    const { genererPolySynth } = await import("./tone-synths");
    const buffer = await genererPolySynth({
      notes: ["C4", "E4", "G4"],
      dureeNote: 0.5,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(0.5);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    expect(Math.max(...gauche)).toBeGreaterThan(0);
    expect(Math.max(...droite)).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });
});

describe("genererModulationSynth", () => {
  it("rend FM et AM stéréo non silencieux", async () => {
    const { genererModulationSynth } = await import("./tone-synths");
    for (const mode of ["FM", "AM"] as const) {
      const buffer = await genererModulationSynth({
        note: "C4",
        duree: 1,
        volume: 80,
        mode,
        sampleRate: 44100,
      });

      expect(buffer.numberOfChannels).toBe(2);
      expect(Math.max(...buffer.getChannelData(0))).toBeGreaterThan(0);
      expect(Math.max(...buffer.getChannelData(1))).toBeGreaterThan(0);
    }
  });

  it("LE RELÂCHEMENT S'ENTEND DANS LA DURÉE DU TAMPON, et la durée reste celle demandée", async () => {
    // LE DÉFAUT RELEVÉ PAR LA PASSE DE CROISEMENT (lot 3e, 2026-11-15) : la note se relâchait à la
    // fin du tampon, et le « Release » ne s'entendait jamais tant que la durée dépassait l'enveloppe,
    // ce qui est le cas aux défauts (1,5 s contre 0,66 s).
    const { genererModulationSynth } = await import("./tone-synths");
    const rendre = (release: number) => genererModulationSynth({ note: "C4", duree: 1.5, volume: 80, mode: "FM", release, sampleRate: 44100 });
    const [sec, long] = [await rendre(0), await rendre(1)];
    expect(long.duration).toBeCloseTo(1.5, 2);
    expect(rmsDeLaFin(long, 0.2)).toBeLessThan(0.5 * rmsDeLaFin(sec, 0.2));
  });
});

/** Le niveau efficace des `secondes` dernières du canal gauche. */
function rmsDeLaFin(b: AudioBuffer, secondes: number): number {
  const d = b.getChannelData(0), n = Math.round(secondes * b.sampleRate);
  let s = 0;
  for (let i = d.length - n; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / n);
}

describe("rendreBatterieMidi", () => {
  it("rend une piste rythmique stéréo non silencieuse", async () => {
    const { rendreBatterieMidi } = await import("./tone-synths");
    const buffer = await rendreBatterieMidi({
      notes: [
        { note: 36, velocite: 100, debut: 0, fin: 0.2 },
        { note: 38, velocite: 100, debut: 0.25, fin: 0.45 },
        { note: 42, velocite: 80, debut: 0.5, fin: 0.6 },
        { note: 46, velocite: 80, debut: 0.75, fin: 0.9 },
      ],
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(0.5);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    expect(Math.max(...gauche)).toBeGreaterThan(0);
    expect(Math.max(...droite)).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });
});

describe("genererPluckSynth", () => {
  it("rend une corde pincée C4 stéréo non silencieux", async () => {
    const { genererPluckSynth } = await import("./tone-synths");
    const buffer = await genererPluckSynth({
      note: "C4",
      duree: 2,
      volume: 80,
      sampleRate: 44100,
    });

    expect(buffer).toBeDefined();
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.duration).toBeGreaterThan(1);

    const gauche = buffer.getChannelData(0);
    const droite = buffer.getChannelData(1);
    expect(Math.max(...gauche)).toBeGreaterThan(0);
    expect(Math.max(...droite)).toBeGreaterThan(0);

    for (let i = 0; i < gauche.length; i++) {
      expect(Number.isFinite(gauche[i])).toBe(true);
      expect(Number.isFinite(droite[i])).toBe(true);
    }
  });

  it("LA CORDE NE DIVERGE À AUCUNE RÉSONANCE DE SA PLAGE", async () => {
    // LE DÉFAUT (2026-11-15) : le passe-bas de la boucle avait le Q par défaut de Tone.js, 1 dB, dont
    // la bosse à la coupure dépasse l'unité. Dès une « Resonance » de 0,85, bien en deçà de la borne
    // de 1 que le réglage offre, le gain de la boucle la dépassait et la corde montait jusqu'à NaN.
    const { genererPluckSynth } = await import("./tone-synths");
    for (const note of ["A2", "C4", "C6"]) {
      for (const resonance of [0.85, 0.95, 1]) {
        const b = await genererPluckSynth({ note, duree: 1, volume: 80, resonance, release: 0, sampleRate: 44100 });
        let crete = 0;
        for (const x of b.getChannelData(0)) crete = Math.max(crete, Math.abs(x));
        expect(crete, `${note} à ${resonance}`).toBeLessThan(1);
      }
    }
  });

  it("LE RELÂCHEMENT ÉTEINT LA CORDE DANS LA DURÉE DU TAMPON", async () => {
    // LE DÉFAUT (2026-11-15) : le « Release » ne descendait rien ; il n'allongeait le tampon que
    // s'il dépassait la durée. À une résonance de 1, la corde tient : sans relâchement elle sonne
    // encore à la fin, et un relâchement d'une seconde doit l'y avoir éteinte.
    const { genererPluckSynth } = await import("./tone-synths");
    const rendre = (release: number) => genererPluckSynth({ note: "C4", duree: 2, volume: 80, resonance: 1, release, sampleRate: 44100 });
    const [sec, long] = [await rendre(0), await rendre(1)];
    expect(long.duration).toBeCloseTo(2, 2);
    expect(rmsDeLaFin(sec, 0.2)).toBeGreaterThan(1e-3);
    expect(rmsDeLaFin(long, 0.2)).toBeLessThan(0.1 * rmsDeLaFin(sec, 0.2));
  });

  it("LA CORDE JOUE SA NOTE, À TROIS CENTS PRÈS, DU GRAVE À L'AIGU ET À DEUX FRÉQUENCES DE TRAVAIL", async () => {
    // LE DÉFAUT (2026-11-15) : la boucle passait par le graphe Web Audio, où un retard ne descend
    // pas sous une tranche de rendu, 128 échantillons. Sous Node, toute note au-dessus du fa♯4
    // sortait à 366 Hz ; dans Chromium, la tranche s'ajoutait à chaque période, et le do4 sortait à
    // 147,5 Hz. La mesure est la raie la plus forte à un demi-ton près autour de la note : une note
    // jouée plus loin la pose au bord de la fenêtre, et le cas tombe. La coupure est au plus haut :
    // à celle par défaut, le do7 s'éteint avant que la fenêtre de mesure ne s'ouvre.
    const { genererPluckSynth } = await import("./tone-synths");
    for (const sampleRate of [44100, 48000]) {
      for (const [note, attendue] of [["A2", 110], ["C4", 261.626], ["A4", 440], ["C6", 1046.502], ["C7", 2093.005]] as const) {
        const b = await genererPluckSynth({ note, duree: 1, volume: 80, dampening: 7000, resonance: 1, release: 0, sampleRate });
        const jouee = raieLaPlusForte(b, 0.2, 0.7, attendue / 2 ** (1 / 12), attendue * 2 ** (1 / 12));
        expect(Math.abs(1200 * Math.log2(jouee / attendue)), `${note} à ${sampleRate} Hz : ${jouee.toFixed(2)} Hz`).toBeLessThan(3);
      }
    }
  });
});

/**
 * La fréquence de la raie la plus forte entre `fMin` et `fMax`, par une transformée de Fourier
 * directe sous fenêtre de Hann, sur `[debut, fin]` du canal gauche, au demi-cent près.
 */
function raieLaPlusForte(b: AudioBuffer, debut: number, fin: number, fMin: number, fMax: number): number {
  const d = b.getChannelData(0), sr = b.sampleRate;
  const i0 = Math.round(debut * sr), n = Math.round((fin - debut) * sr);
  const fenetre = Float64Array.from({ length: n }, (_, k) => d[i0 + k] * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1))));
  let meilleure = fMin, plusHaute = -1;
  for (let f = fMin; f <= fMax; f *= 2 ** (1 / 2400)) {
    const w = (2 * Math.PI * f) / sr;
    let re = 0, im = 0;
    for (let k = 0; k < n; k++) { re += fenetre[k] * Math.cos(w * k); im -= fenetre[k] * Math.sin(w * k); }
    const m = re * re + im * im;
    if (m > plusHaute) { plusHaute = m; meilleure = f; }
  }
  return meilleure;
}
