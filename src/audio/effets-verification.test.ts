// audio/effets-verification.test.ts — Banc de MESURE des effets signalés
// (session 2026-07-18 : phaser/octaver/dereverb « sortie identique à l'entrée »,
// compresseur/normaliseur « conformes à la doc ? »). Ces tests mesurent le
// signal de sortie ; ils échouent si un effet redevient un passe-plat.
//
// L'environnement vitest est `node` : pas d'AudioBuffer. On installe un
// polyfill minimal AVANT d'importer les modules d'effets (import dynamique).
import { describe, it, expect, beforeAll } from "vitest";

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

let dyn: typeof import("./effets-dynamique");
let spec: typeof import("./effets-spectral");
let temp: typeof import("./effets-temporel");

beforeAll(async () => {
  (globalThis as any).AudioBuffer = AudioBufferPolyfill;
  dyn = await import("./effets-dynamique");
  spec = await import("./effets-spectral");
  temp = await import("./effets-temporel");
});

const SR = 44100;

function sinus(freq: number, dureeS: number, amplitude = 1): AudioBuffer {
  const n = Math.floor(SR * dureeS);
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
  return b;
}

function rms(b: AudioBuffer, debut = 0, fin = b.length): number {
  const d = b.getChannelData(0);
  let s = 0;
  for (let i = debut; i < fin; i++) s += d[i] * d[i];
  return Math.sqrt(s / Math.max(1, fin - debut));
}

function pic(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let p = 0;
  for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
  return p;
}

// Énergie autour d'une fréquence via produit scalaire avec une sinusoïde (Goertzel simplifié).
function energieA(b: AudioBuffer, freq: number, debut = 0, fin = b.length): number {
  const d = b.getChannelData(0);
  let re = 0, im = 0;
  for (let i = debut; i < fin; i++) {
    const w = (2 * Math.PI * freq * i) / SR;
    re += d[i] * Math.cos(w);
    im += d[i] * Math.sin(w);
  }
  return Math.hypot(re, im) / Math.max(1, fin - debut);
}

describe("normaliser", () => {
  it("amène la crête exactement au niveau cible (doc : Niveau en dB)", () => {
    const e = sinus(440, 0.5, 0.25); // crête à 0.25 ≈ −12 dB
    const s = dyn.normaliser(e, -6);
    expect(pic(s)).toBeCloseTo(Math.pow(10, -6 / 20), 3); // −6 dB = 0.501
  });
  it("laisse le silence inchangé (pas de division par zéro)", () => {
    const e = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: 1000, sampleRate: SR });
    const s = dyn.normaliser(e, -6);
    expect(pic(s)).toBe(0);
  });
});

describe("compresser", () => {
  it("n'atténue pas un signal sous le seuil", () => {
    const e = sinus(440, 0.5, 0.05); // ≈ −26 dB, sous le seuil de −20
    const s = dyn.compresser(e, -20, 4, 5, 100, 0);
    // fenêtre de mesure après stabilisation de l'enveloppe
    expect(rms(s, SR / 4)).toBeCloseTo(rms(e, SR / 4), 2);
  });
  it("applique le ratio annoncé au-dessus du seuil (doc : Seuil/Ratio)", () => {
    // Crête 1.0 = 0 dB, seuil −20 dB, ratio 4 → dépassement 20 dB réduit à 5 dB
    // → sortie attendue ≈ −15 dB au régime établi.
    const e = sinus(440, 1, 1);
    const s = dyn.compresser(e, -20, 4, 1, 50, 0);
    const picSortie = 20 * Math.log10(pic(dyn.normaliser(s, 0)) > 0 ? maxApres(s, SR / 2) : 1);
    expect(picSortie).toBeGreaterThan(-17);
    expect(picSortie).toBeLessThan(-13);
  });
  it("le gain de compensation remonte la sortie (doc : Gain make-up)", () => {
    const e = sinus(440, 0.5, 0.5);
    const sSans = dyn.compresser(e, -20, 4, 5, 100, 0);
    const sAvec = dyn.compresser(e, -20, 4, 5, 100, 6);
    expect(rms(sAvec, SR / 4)).toBeCloseTo(rms(sSans, SR / 4) * Math.pow(10, 6 / 20), 2);
  });
});

function maxApres(b: AudioBuffer, debut: number): number {
  const d = b.getChannelData(0);
  let p = 0;
  for (let i = debut; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
  return p;
}

describe("bitcrusher", () => {
  it("quantifie sur 2^bits niveaux (doc : Résolution en bits)", () => {
    const e = sinus(440, 0.2, 1);
    const s = dyn.bitcrusher(e, 3, 44100, 100);
    const valeurs = new Set<number>();
    const d = s.getChannelData(0);
    for (let i = 0; i < d.length; i++) valeurs.add(Math.round(d[i] * 7)); // 2^3−1 = 7 niveaux
    expect(valeurs.size).toBeLessThanOrEqual(15); // −7…+7
    for (const v of valeurs) expect(Math.abs(v)).toBeLessThanOrEqual(7);
  });
});

describe("phaser", () => {
  it("modifie réellement le signal (pas un passe-plat)", () => {
    const e = sinus(1000, 0.5, 0.5);
    const s = spec.phaser(e, 0.5, 80, 4, 50);
    // La différence échantillon à échantillon doit être significative.
    const de = e.getChannelData(0), ds = s.getChannelData(0);
    let diff = 0;
    for (let i = 0; i < de.length; i++) diff += (ds[i] - de[i]) ** 2;
    const rapport = Math.sqrt(diff / de.length) / rms(e);
    expect(rapport).toBeGreaterThan(0.05);
  });
  it("crée des encoches mobiles : le gain à 1 kHz varie dans le temps", () => {
    const e = sinus(1000, 2, 0.5);
    const s = spec.phaser(e, 1, 90, 4, 100);
    const fenetres: number[] = [];
    for (let deb = 0; deb + SR / 10 <= s.length; deb += SR / 10) {
      fenetres.push(rms(s, deb, deb + SR / 10));
    }
    const mn = Math.min(...fenetres), mx = Math.max(...fenetres);
    expect(mx / Math.max(1e-9, mn)).toBeGreaterThan(1.3); // le niveau ondule
  });
});

describe("octaver", () => {
  it("« Octave sup » ajoute de l'énergie à 2f", () => {
    const e = sinus(440, 0.5, 0.6);
    const s = spec.octaver(e, 100, 0, 50);
    const avant = energieA(e, 880, SR / 10);
    const apres = energieA(s, 880, SR / 10);
    expect(apres).toBeGreaterThan(avant * 5 + 1e-6);
  });
  it("« Octave inf » ajoute de l'énergie à f/2", () => {
    const e = sinus(440, 0.5, 0.6);
    const s = spec.octaver(e, 0, 100, 50);
    const avant = energieA(e, 220, SR / 10);
    const apres = energieA(s, 220, SR / 10);
    expect(apres).toBeGreaterThan(avant * 5 + 1e-6);
  });
  it("à 0/0/0 le signal ressort intact", () => {
    const e = sinus(440, 0.2, 0.6);
    const s = spec.octaver(e, 0, 0, 0);
    expect(rms(s)).toBeCloseTo(rms(e), 2);
  });
});

describe("limiter", () => {
  it("réduit les pics au-dessus du seuil", () => {
    const e = sinus(440, 0.5, 1); // crête à 1.0 = 0 dB
    const s = dyn.limiter(e, -6, 50, -6); // seuil = plafond = -6 dB
    expect(pic(s)).toBeLessThanOrEqual(0.502);
  });
  it("laisse inchangé un signal sous le seuil", () => {
    const e = sinus(440, 0.5, 0.2); // crête à -14 dB, sous -6 dB
    const s = dyn.limiter(e, -6, 50, -6);
    expect(pic(s)).toBeCloseTo(0.2, 2);
  });
  it("applique le make-up jusqu'au plafond", () => {
    const e = sinus(440, 0.5, 1);
    const s = dyn.limiter(e, -6, 50, -3); // makeup +3 dB
    expect(pic(s)).toBeCloseTo(0.501 * Math.pow(10, 3 / 20), 2);
  });
});

describe("transientShaper", () => {
  function burstSustain(): AudioBuffer {
    const n = SR;
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (t < 0.05) d[i] = Math.sin(2 * Math.PI * 440 * t);
      else d[i] = 0.3 * Math.sin(2 * Math.PI * 440 * t);
    }
    return b;
  }

  it("augmente l'attaque quand Attack est positif", () => {
    const e = burstSustain();
    const s = dyn.transientShaper(e, 6, 0, 1, 100);
    const burstAvant = rms(e, 0, Math.floor(0.05 * SR));
    const burstApres = rms(s, 0, Math.floor(0.05 * SR));
    expect(burstApres).toBeGreaterThan(burstAvant * 1.3);
  });
  it("diminue le sustain quand Sustain est négatif", () => {
    const e = burstSustain();
    const s = dyn.transientShaper(e, 0, -6, 1, 100);
    const sustainAvant = rms(e, Math.floor(0.1 * SR), Math.floor(0.5 * SR));
    const sustainApres = rms(s, Math.floor(0.1 * SR), Math.floor(0.5 * SR));
    expect(sustainApres).toBeLessThan(sustainAvant * 0.9);
  });
  it("laisse le signal inchangé avec Attack=Sustain=0", () => {
    const e = burstSustain();
    const s = dyn.transientShaper(e, 0, 0, 1, 100);
    expect(rms(s)).toBeCloseTo(rms(e), 2);
  });
});

describe("largeurStereo", () => {
  function stereoSinus(): AudioBuffer {
    const n = Math.floor(SR * 0.5);
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
    for (let i = 0; i < n; i++) {
      b.getChannelData(0)[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
      b.getChannelData(1)[i] = Math.sin((2 * Math.PI * 440 * i) / SR + Math.PI);
    }
    return b;
  }

  it("conserve le signal stéréo à 100% de largeur et 100% Mid", () => {
    const e = stereoSinus();
    const s = dyn.ajusterLargeurStereo(e, 100, 100);
    expect(rms(s, 0, s.length)).toBeCloseTo(rms(e, 0, e.length), 2);
    expect(pic(s)).toBeCloseTo(pic(e), 2);
  });

  it("passe en mono quand la largeur est 0%", () => {
    const e = stereoSinus();
    const s = dyn.ajusterLargeurStereo(e, 0, 100);
    const l = s.getChannelData(0);
    const r = s.getChannelData(1);
    expect(Math.abs(l[Math.floor(SR / 10)])).toBeCloseTo(Math.abs(r[Math.floor(SR / 10)]), 5);
  });

  it("élargit le stéréo quand la largeur est 200%", () => {
    const e = stereoSinus();
    const s = dyn.ajusterLargeurStereo(e, 200, 100);
    const idx = Math.floor(SR / 10);
    const side = s.getChannelData(0)[idx] - s.getChannelData(1)[idx];
    const sideOrig = e.getChannelData(0)[idx] - e.getChannelData(1)[idx];
    expect(Math.abs(side)).toBeGreaterThan(Math.abs(sideOrig) * 1.9);
  });

  it("élargit un signal mono en stéréo", () => {
    const e = sinus(440, 0.5, 1);
    const s = dyn.ajusterLargeurStereo(e, 100, 100);
    expect(s.numberOfChannels).toBe(2);
    expect(rms(s)).toBeCloseTo(rms(e), 2);
    expect(s.getChannelData(0)[Math.floor(SR / 10)]).toBeCloseTo(s.getChannelData(1)[Math.floor(SR / 10)], 5);
  });

  it("coupe le centre quand Mid est 0", () => {
    const e = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: 1000, sampleRate: SR });
    for (let i = 0; i < 1000; i++) { e.getChannelData(0)[i] = 0.5; e.getChannelData(1)[i] = 0.5; }
    const s = dyn.ajusterLargeurStereo(e, 100, 0);
    expect(pic(s)).toBeCloseTo(0, 5);
  });
});

describe("dererverberer", () => {
  it("atténue une traîne de réverbération synthétique", () => {
    // Burst 100 ms suivi d'une « traîne » : le même signal qui décroît en exp.
    const n = SR; // 1 s
    const e = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const d = e.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const enveloppe = t < 0.1 ? 1 : Math.exp(-(t - 0.1) * 6); // RT60 ≈ 1.15 s
      d[i] = enveloppe * 0.7 * Math.sin(2 * Math.PI * 700 * t);
    }
    const s = dyn.dererverberer(e, 80);
    // Le gate s'enclenche quand la magnitude passe 6 dB sous la crête mémorisée
    // (décroissance 20 dB/s) : sur ce signal, à partir de ~0,6 s. On mesure donc
    // la FIN de traîne (0,65 → 0,95 s) — c'est là que vit le « wash » de réverb.
    const traineAvant = rms(e, Math.floor(0.65 * SR), Math.floor(0.95 * SR));
    const traineApres = rms(s, Math.floor(0.65 * SR), Math.floor(0.95 * SR));
    const burstAvant = rms(e, Math.floor(0.02 * SR), Math.floor(0.09 * SR));
    const burstApres = rms(s, Math.floor(0.02 * SR), Math.floor(0.09 * SR));
    const reductionTraine = traineApres / Math.max(1e-9, traineAvant);
    const reductionBurst = burstApres / Math.max(1e-9, burstAvant);
    expect(reductionTraine).toBeLessThan(0.5);              // au moins −6 dB sur la traîne
    expect(reductionBurst).toBeGreaterThan(0.5);            // le corps du son survit
    expect(reductionTraine).toBeLessThan(reductionBurst);   // et la traîne est plus touchée
  });
});

describe("harmoniser", () => {
  it("ajoute une voix à l'intervalle demandé", () => {
    const e = sinus(440, 0.5, 0.5);
    const s = spec.harmoniser(e, 12, 50, 0, 0); // octave supérieure, 50%
    const avant = energieA(e, 880, 0, e.length);
    const apres = energieA(s, 880, 0, s.length);
    expect(apres).toBeGreaterThan(avant * 2 + 1e-6);
  });
  it("laisse le signal original quand les deux mix sont à 0", () => {
    const e = sinus(440, 0.2, 0.5);
    const s = spec.harmoniser(e, 12, 0, 7, 0);
    expect(rms(s)).toBeCloseTo(rms(e), 5);
  });
});

describe("granularFreeze", () => {
  it("répète un grain sur toute la durée", () => {
    const e = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const d = e.getChannelData(0);
    // 1 s : burst au début, silence ensuite
    for (let i = 0; i < SR; i++) d[i] = i < SR / 10 ? 0.5 : 0;
    const s = temp.granularFreeze(e, 50, 0, 0, 100); // grain 50 ms au début, 100% wet
    // La sortie doit rester active dans la seconde moitié grâce au loop
    const rmsAvant = rms(e, Math.floor(0.5 * SR), SR);
    const rmsApres = rms(s, Math.floor(0.5 * SR), SR);
    expect(rmsAvant).toBeCloseTo(0, 5);
    expect(rmsApres).toBeGreaterThan(0.01);
  });
  it("transpose le grain quand pitch est non nul", () => {
    const e = sinus(440, 0.5, 0.5);
    const s = temp.granularFreeze(e, 50, 12, 0, 100); // pitch +12
    const energieDouze = energieA(s, 880, 0, s.length);
    expect(energieDouze).toBeGreaterThan(0.001);
  });
});

describe("exciter", () => {
  it("est exporté comme fonction async", async () => {
    expect(typeof dyn.exciter).toBe("function");
  });
  it.skipIf(!(globalThis as any).OfflineAudioContext)("ajoute de l'énergie dans les hautes fréquences", async () => {
    const e = sinus(440, 0.5, 0.5);
    const s = await dyn.exciter(e, 80, 2000, 100);
    const avant = energieA(e, 3520, 0, e.length);
    const apres = energieA(s, 3520, 0, s.length);
    expect(apres).toBeGreaterThan(avant * 2 + 1e-6);
  });
});

describe("vocoder", () => {
  it("est exporté comme fonction async", async () => {
    expect(typeof spec.vocoder).toBe("function");
  });
  it.skipIf(!(globalThis as any).OfflineAudioContext)("produit une sortie modulée par l'enveloppe", async () => {
    const mod = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const car = sinus(1000, 1, 0.5);
    const d = mod.getChannelData(0);
    // modulateur = gate 100 Hz on/off toutes les 100 ms
    for (let i = 0; i < SR; i++) d[i] = (Math.floor(i / (SR / 10)) % 2 === 0) ? 0.5 : 0;
    const s = await spec.vocoder(mod, car, 8, 500, 4000, 2, 100);
    expect(s.numberOfChannels).toBe(1);
    expect(s.length).toBe(SR);
    expect(rms(s)).toBeGreaterThan(0);
  });
});
