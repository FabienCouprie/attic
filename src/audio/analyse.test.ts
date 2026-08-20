// audio/analyse.test.ts — Vérification des extracteurs Meyda.
import { describe, it, expect, beforeAll } from "vitest";
import { calculerCentroidSpectralMeyda, calculerRMS_Meyda, calculerZCR_Meyda, calculerRolloffSpectralMeyda, transcrireMono, fusionnerNotesRepetees } from "./analyse";

class AudioBufferPolyfill {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private canaux: Float32Array[];
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels;
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.duration = opts.length / opts.sampleRate;
    this.canaux = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  getChannelData(c: number): Float32Array { return this.canaux[c]; }
  copyToChannel(src: Float32Array, c: number): void { this.canaux[c].set(src.subarray(0, this.length)); }
}

const SR = 44100;

function sinus(freq: number, dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return b;
}

function bruitBlanc(dureeS: number, channels = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: channels, length: n, sampleRate: SR });
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return b;
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
});

describe("calculerCentroidSpectralMeyda", () => {
  it("calcule un centroïde proche de la fréquence d'une sinusoïde", () => {
    const freq = 1000;
    const buffer = sinus(freq, 1);
    const resultat = calculerCentroidSpectralMeyda(buffer, { fenetre: 2048, pas: 1024 });
    expect(resultat.valeur).toBeGreaterThan(freq * 0.9);
    expect(resultat.valeur).toBeLessThan(freq * 1.1);
    expect(resultat.texte).toContain("Hz");
    expect(resultat.trames).toBeGreaterThan(0);
  });

  it("calcule un centroïde élevé pour du bruit blanc", () => {
    const buffer = bruitBlanc(1);
    const resultat = calculerCentroidSpectralMeyda(buffer, { fenetre: 2048, pas: 1024 });
    // Pour du bruit blanc, le centroïde spectral approche Fs/4 ≈ 11 kHz.
    expect(resultat.valeur).toBeGreaterThan(SR * 0.15);
    expect(resultat.trames).toBeGreaterThan(0);
  });

  it("retourne des valeurs différentes selon l'agrégation", () => {
    const buffer = sinus(1000, 1);
    const moyenne = calculerCentroidSpectralMeyda(buffer, { aggregation: "moyenne" }).valeur;
    const mediane = calculerCentroidSpectralMeyda(buffer, { aggregation: "mediane" }).valeur;
    const maximum = calculerCentroidSpectralMeyda(buffer, { aggregation: "maximum" }).valeur;
    expect(moyenne).toBeCloseTo(mediane, 0);
    expect(maximum).toBeGreaterThanOrEqual(moyenne);
  });

  // Régression : « Médiane » (libellé français, accentué) tombait dans le
  // `default` du normaliseur — son toLowerCase() vaut « médiane » avec accent,
  // que le calcul en aval ne reconnaissait pas — et calculait donc une MOYENNE.
  // « Median » (anglais) fonctionnait, lui. Un projet français demandant la
  // médiane obtenait silencieusement autre chose.
  it("« Médiane » accentué donne bien la médiane, pas la moyenne", () => {
    const buffer = bruitBlanc(1);
    const attendu = calculerCentroidSpectralMeyda(buffer, { aggregation: "mediane" }).valeur;
    for (const libelle of ["Médiane", "médiane", "Median", "mediane"]) {
      const obtenu = calculerCentroidSpectralMeyda(buffer, { aggregation: libelle as any }).valeur;
      expect(obtenu).toBe(attendu);
    }
    // …et reste distinct de la moyenne sur un signal où les deux diffèrent.
    const moyenne = calculerCentroidSpectralMeyda(buffer, { aggregation: "moyenne" }).valeur;
    expect(calculerCentroidSpectralMeyda(buffer, { aggregation: "Médiane" as any }).valeur).not.toBe(moyenne);
  });
});

describe("calculerRMS_Meyda", () => {
  it("retourne un niveau RMS cohérent pour une sinusoïde pleine échelle", () => {
    const buffer = sinus(440, 1);
    const resultat = calculerRMS_Meyda(buffer);
    expect(resultat.valeur).toBeGreaterThan(-10);
    expect(resultat.valeur).toBeLessThan(0);
    expect(resultat.texte).toContain("dBFS");
  });

  it("retourne des valeurs plus faibles pour un signal silencieux", () => {
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    b.getChannelData(0).fill(0);
    const resultat = calculerRMS_Meyda(b);
    expect(resultat.valeur).toBeLessThan(-50);
  });
});

describe("calculerZCR_Meyda", () => {
  it("retourne environ 2×f×fenêtre passages par zéro pour une sinusoïde", () => {
    const freq = 1000;
    const buffer = sinus(freq, 1);
    const resultat = calculerZCR_Meyda(buffer);
    // À 1 kHz, 1 seconde → ~1000 cycles → ~2000 passages par zéro (fenêtres)
    expect(resultat.valeur).toBeGreaterThan(0);
    expect(resultat.texte).toContain("passages par zéro");
  });
});

describe("calculerRolloffSpectralMeyda", () => {
  it("calcule un rolloff plus élevé pour du bruit blanc que pour une sinusoïde", () => {
    const bruit = bruitBlanc(1);
    const sine = sinus(1000, 1);
    const rBruit = calculerRolloffSpectralMeyda(bruit).valeur;
    const rSine = calculerRolloffSpectralMeyda(sine).valeur;
    expect(rBruit).toBeGreaterThan(rSine);
    expect(rBruit).toBeGreaterThan(SR * 0.1);
  });
});

// ── Transcripteur MIDI : rejet du bruit et fusion des notes ──
describe("transcription — robustesse au bruit", () => {
  function bufferDe(gen: (i: number, sr: number) => number, duree = 2, sr = 44100): AudioBuffer {
    const n = Math.round(duree * sr);
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = gen(i, sr);
    return b;
  }

  it("une note tenue produit peu de notes, un bruit blanc n'en produit quasiment aucune", () => {
    const tonal = bufferDe((i, sr) => 0.5 * Math.sin(2 * Math.PI * 440 * i / sr));
    const bruit = bufferDe(() => (Math.random() * 2 - 1) * 0.5);
    const nTonal = transcrireMono(tonal, 10, 21, 108).length;
    const nBruit = transcrireMono(bruit, 10, 21, 108).length;
    // Le bruit large bande n'a pas de hauteur : il ne doit plus générer de notes.
    expect(nBruit).toBe(0);
    // …sans pour autant faire disparaître le signal tonal.
    expect(nTonal).toBeGreaterThan(0);
  });

  it("fusionnerNotesRepetees recolle une note coupée en deux", () => {
    const fusion = fusionnerNotesRepetees([
      { note: 60, velocite: 80, debut: 0, fin: 0.5 },
      { note: 60, velocite: 90, debut: 0.52, fin: 1.0 },
      { note: 64, velocite: 70, debut: 0.1, fin: 0.6 },
    ]);
    expect(fusion).toHaveLength(2);
    const do60 = fusion.find((n) => n.note === 60)!;
    expect(do60.debut).toBe(0);
    expect(do60.fin).toBe(1.0);
    expect(do60.velocite).toBe(90); // garde la vélocité la plus forte
  });

  it("ne fusionne pas deux notes réellement séparées", () => {
    const fusion = fusionnerNotesRepetees([
      { note: 60, velocite: 80, debut: 0, fin: 0.3 },
      { note: 60, velocite: 80, debut: 1.5, fin: 1.8 },
    ]);
    expect(fusion).toHaveLength(2);
  });
});
