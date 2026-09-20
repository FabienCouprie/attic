// audio/quadrafuzz.test.ts — Une distorsion qui ne touche qu'à la bande qu'on lui désigne.
//
// L'intérêt du quadrafuzz n'est pas de saturer : c'est de saturer UNE bande sans les
// autres. Ces tests le vérifient sur des signaux dont on connaît le contenu spectral —
// un grave pur, un aigu pur — et chiffrent ce que la séparation vaut réellement : saturer
// les aigus à fond ne déplace un 80 Hz que de six millièmes, tandis que saturer les graves
// multiplie son harmonique par soixante-dix.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { appliquerCourbe, courbeFuzz, quadrafuzz, separerEnBandes } from "./quadrafuzz";

const SR = 44100;

function sinus(freq: number, dureeS = 0.5, amplitude = 0.5): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
  return buf;
}

const REGLAGES = { graves: 0, basMediums: 0, hautsMediums: 0, aigus: 0, f1: 160, f2: 1000, f3: 4000, mix: 100, sortie: 0 };

/** Énergie autour d'une fréquence, par produit scalaire avec un sinus et un cosinus. */
function energieA(buffer: AudioBuffer, freq: number): number {
  const d = buffer.getChannelData(0);
  const debut = Math.floor(0.1 * SR), n = 8192;
  let re = 0, im = 0;
  for (let i = 0; i < n && debut + i < d.length; i++) {
    const phase = (2 * Math.PI * freq * i) / SR;
    re += d[debut + i] * Math.cos(phase);
    im += d[debut + i] * Math.sin(phase);
  }
  return Math.sqrt(re * re + im * im) / n;
}

describe("courbe de saturation", () => {
  it("est l'identité quand on ne demande rien", () => {
    const c = courbeFuzz(0);
    expect(appliquerCourbe(c, 0)).toBeCloseTo(0, 6);
    expect(appliquerCourbe(c, 0.5)).toBeCloseTo(0.5, 4);
    expect(appliquerCourbe(c, -0.75)).toBeCloseTo(-0.75, 4);
  });

  it("garde la symétrie impaire : une saturation ne déplace pas le zéro", () => {
    const c = courbeFuzz(60);
    for (const x of [0.1, 0.35, 0.8, 1]) {
      expect(appliquerCourbe(c, -x)).toBeCloseTo(-appliquerCourbe(c, x), 5);
    }
  });

  it("reste bornée à ±1 et croissante", () => {
    for (const s of [0, 25, 50, 100]) {
      const c = courbeFuzz(s);
      expect(Math.max(...c)).toBeLessThanOrEqual(1.0001);
      expect(Math.min(...c)).toBeGreaterThanOrEqual(-1.0001);
      for (let i = 1; i < c.length; i++) expect(c[i], `saturation ${s}`).toBeGreaterThanOrEqual(c[i - 1]);
    }
  });

  it("remonte les niveaux faibles : c'est ce qu'on entend comme du grain", () => {
    // À saturation, un demi devient nettement plus qu'un demi.
    expect(appliquerCourbe(courbeFuzz(80), 0.5)).toBeGreaterThan(0.8);
    expect(appliquerCourbe(courbeFuzz(80), 1)).toBeCloseTo(1, 3);
  });
});

describe("découpage en bandes", () => {
  it("met chaque son dans SA bande, et de loin", async () => {
    // Mesuré : un 500 Hz donne 0,024 / 0,245 / 0,092 / 0,004 sur les quatre bandes.
    const cas: [number, number][] = [[80, 0], [500, 1], [2000, 2], [8000, 3]];
    for (const [freq, attendue] of cas) {
      const bandes = await separerEnBandes(sinus(freq), 160, 1000, 4000);
      expect(bandes.length).toBe(4);
      const energies = bandes.map((b) => energieA(b, freq));
      const dominante = energies.indexOf(Math.max(...energies));
      expect(dominante, `${freq} Hz`).toBe(attendue);
      const autres = energies.filter((_, i) => i !== dominante);
      expect(energies[dominante], `${freq} Hz`).toBeGreaterThan(Math.max(...autres) * 2);
    }
  });

  it("ne reconstruit PAS le signal à l'identique — c'est le prix de la séparation", async () => {
    // Des filtres réels ne se recollent pas exactement : la somme des bandes s'écarte de
    // quelques décibels du signal d'origine, selon la fréquence. Un découpage par
    // soustraction reconstruirait parfaitement, mais séparerait mal — et la séparation est
    // tout l'intérêt du nœud. L'écart reste modéré, et c'est ce qu'on vérifie ici.
    const src = sinus(440);
    const bandes = await separerEnBandes(src, 160, 1000, 4000);
    const sommeBande = new AudioBuffer({ numberOfChannels: 1, length: src.length, sampleRate: SR });
    const dst = sommeBande.getChannelData(0);
    for (let i = 0; i < src.length; i++) dst[i] = bandes.reduce((s, b) => s + b.getChannelData(0)[i], 0);
    const rapport = energieA(sommeBande, 440) / energieA(src, 440);
    expect(rapport).toBeGreaterThan(0.5);
    expect(rapport).toBeLessThan(2);
  });

  it("remet les fréquences dans l'ordre si on les croise", async () => {
    const a = await separerEnBandes(sinus(440), 4000, 160, 1000);
    const b = await separerEnBandes(sinus(440), 160, 1000, 4000);
    expect(energieA(a[1], 440)).toBeCloseTo(energieA(b[1], 440), 4);
  });
});

describe("saturation par bande", () => {
  it("n'ajoute aucune harmonique quand toutes les saturations sont à zéro", async () => {
    // La courbe est alors l'identité : il ne reste que le passage par les filtres.
    const src = sinus(80, 0.5, 0.6);
    const out = await quadrafuzz(src, REGLAGES);
    expect(energieA(out, 240)).toBeLessThan(energieA(out, 80) * 0.02);
  });

  it("ajoute des harmoniques quand on sature la bande où vit le son", async () => {
    const src = sinus(80, 0.5, 0.6);
    const propre = await quadrafuzz(src, REGLAGES);
    const sature = await quadrafuzz(src, { ...REGLAGES, graves: 90 });
    // La troisième harmonique — celle qu'une saturation symétrique engendre — apparaît.
    const avant = energieA(propre, 240), apres = energieA(sature, 240);
    expect(apres).toBeGreaterThan(avant * 10);
  });

  it("laisse le son intact quand on sature une AUTRE bande — tout l'intérêt du nœud", async () => {
    const src = sinus(80, 0.5, 0.6);
    const propre = await quadrafuzz(src, REGLAGES);
    const aigusSatures = await quadrafuzz(src, { ...REGLAGES, aigus: 100 });
    // Mesuré : 0,3421 contre 0,3443, soit six millièmes d'écart — et l'harmonique reste
    // exactement là où elle était.
    expect(energieA(aigusSatures, 80) / energieA(propre, 80)).toBeCloseTo(1, 1);
    expect(energieA(aigusSatures, 240)).toBeCloseTo(energieA(propre, 240), 3);
  });

  it("respecte le mélange : à 0 %, la sortie est le signal d'origine", async () => {
    const src = sinus(80, 0.3, 0.6);
    const out = await quadrafuzz(src, { ...REGLAGES, graves: 100, mix: 0 });
    let ecartMax = 0;
    for (let i = 0; i < src.length; i++) {
      ecartMax = Math.max(ecartMax, Math.abs(out.getChannelData(0)[i] - src.getChannelData(0)[i]));
    }
    expect(ecartMax).toBeLessThan(1e-6);
  });

  it("applique le gain de sortie en décibels", async () => {
    const src = sinus(440, 0.3, 0.4);
    const plein = await quadrafuzz(src, REGLAGES);
    const moitie = await quadrafuzz(src, { ...REGLAGES, sortie: -6 });
    expect(energieA(moitie, 440) / energieA(plein, 440)).toBeCloseTo(0.5, 2);
  });

  it("garde le nombre de canaux et la durée", async () => {
    const stereo = new AudioBuffer({ numberOfChannels: 2, length: SR / 4, sampleRate: SR });
    const out = await quadrafuzz(stereo, { ...REGLAGES, graves: 50 });
    expect(out.numberOfChannels).toBe(2);
    expect(out.length).toBe(stereo.length);
    expect(out.sampleRate).toBe(SR);
  });
});
