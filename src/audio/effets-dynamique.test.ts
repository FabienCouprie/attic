// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { calculerProfilBruit, reduireBruit, reduireBruitNotches } from "./effets-bruit";

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngTest = mulberry32(20260805);

function bruitBlanc(dureeS: number, sr = 44100, channels = 1): AudioBuffer {
  const len = Math.round(dureeS * sr);
  const buf = new AudioBuffer({ numberOfChannels: channels, length: len, sampleRate: sr });
  for (let c = 0; c < channels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = rngTest() * 2 - 1;
  }
  return buf;
}

function signalAvecBruit(signalAmp: number, bruitAmp: number, sr = 44100): AudioBuffer {
  const len = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const signal = signalAmp * Math.sin(2 * Math.PI * 440 * t);
    const bruit = bruitAmp * (rngTest() * 2 - 1);
    ch[i] = signal + bruit;
  }
  return buf;
}

function bruitHum(dureeS: number, fHum: number, sr = 44100): AudioBuffer {
  const len = Math.round(dureeS * sr);
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    ch[i] = Math.sin((2 * Math.PI * fHum * i) / sr);
  }
  return buf;
}

function signalAvecHum(signalAmp: number, humAmp: number, fHum: number, sr = 44100): AudioBuffer {
  const len = 2 * sr;
  const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    ch[i] = signalAmp * Math.sin(2 * Math.PI * 440 * t) + humAmp * Math.sin(2 * Math.PI * fHum * t);
  }
  return buf;
}

function rms(buf: AudioBuffer): number {
  let s = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) { s += ch[i] * ch[i]; n++; }
  }
  return Math.sqrt(s / n);
}

describe("profil de bruit / réduction de bruit", () => {
  it("capture un profil non nul à partir de bruit blanc", () => {
    const bruit = bruitBlanc(1, 44100, 1);
    const profil = calculerProfilBruit(bruit);
    expect(profil).toBeInstanceOf(Float32Array);
    expect(profil.length).toBe(4097); // TAILLE_FFT/2 + 1
    const moyenne = profil.reduce((a, b) => a + b, 0) / profil.length;
    expect(moyenne).toBeGreaterThan(0.01);
  });

  it("réduit l'énergie du bruit sur un signal sinus + bruit", () => {
    // Profil plus long pour stabiliser la moyenne avec une FFT grande (8192)
    const bruit = bruitBlanc(1.5, 44100, 1);
    const profil = calculerProfilBruit(bruit);
    const melange = signalAvecBruit(0.5, 0.2);
    const rmsAvant = rms(melange);
    const reduit = reduireBruit(melange, profil, 0.8);
    const rmsApres = rms(reduit);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
    expect(rmsApres).toBeLessThan(rmsAvant);
  });

  it("fonctionne avec un extrait de bruit plus court qu'une trame FFT", () => {
    const bruitCourt = bruitBlanc(0.01, 44100, 1); // 441 échantillons < 2048
    const profil = calculerProfilBruit(bruitCourt);
    expect(profil).toBeInstanceOf(Float32Array);
    expect(profil.length).toBe(4097);
    const moyenne = profil.reduce((a, b) => a + b, 0) / profil.length;
    expect(moyenne).toBeGreaterThan(0.001);

    const melange = signalAvecBruit(0.5, 0.2);
    const reduit = reduireBruit(melange, profil, 0.8);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
  });

  it("débruit un signal plus court qu'une trame FFT", () => {
    const bruit = bruitBlanc(0.05, 44100, 1);
    const profil = calculerProfilBruit(bruit);
    const melangeCourt = signalAvecBruit(0.5, 0.2);
    const reduit = reduireBruit(melangeCourt, profil, 1.0);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melangeCourt.length);
    const ch = reduit.getChannelData(0);
    expect(ch.some((v) => Number.isNaN(v) || !Number.isFinite(v))).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // CE QUE LES ASSERTIONS CI-DESSUS NE VOIENT PAS, ET QUI A LAISSÉ PASSER LE DÉFAUT.
  //
  // « rmsApres < rmsAvant » est un SUBSTITUT de « le bruit a été retiré » : l'énergie globale
  // baisserait tout autant si la fonction atténuait l'ensemble, signal compris. Elle passait donc
  // au vert pendant que le fond sonore demeurait, relevé par Fabien sur une prise réelle.
  //
  // CE QUI SE MESURE ICI EST LE PLANCHER DANS UN SILENCE. Le signal utile n'occupe que la seconde
  // du milieu ; de part et d'autre il ne reste que du bruit, et c'est là, et seulement là, que la
  // réduction se lit. Le même relevé dit en même temps ce que le signal utile a perdu : une
  // réduction obtenue en mangeant la voix ne vaut rien.
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  /** Le niveau efficace entre deux instants, en décibels. */
  function dbEntre(x: Float32Array, deSec: number, aSec: number, sr = 44100): number {
    const a = Math.round(deSec * sr), b = Math.min(x.length, Math.round(aSec * sr));
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    const rms = Math.sqrt(s / Math.max(1, b - a));
    return rms > 1e-12 ? 20 * Math.log10(rms) : -240;
  }

  /** Trois secondes de bruit, dont la seconde du milieu porte aussi un sinus. */
  function voixAuMilieu(sr = 44100): { melange: AudioBuffer; bruitSeul: AudioBuffer } {
    const n = 3 * sr;
    const bruit = new Float32Array(n);
    for (let i = 0; i < n; i++) bruit[i] = (rngTest() * 2 - 1) * 0.1;
    const melange = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const ch = melange.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ch[i] = (t >= 1 && t < 2 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0) + bruit[i];
    }
    // Le profil se prend sur du bruit SEUL, comme la documentation du composant le demande.
    const bruitSeul = new AudioBuffer({ numberOfChannels: 1, length: Math.round(0.8 * sr), sampleRate: sr });
    bruitSeul.getChannelData(0).set(bruit.subarray(0, bruitSeul.length));
    return { melange, bruitSeul };
  }

  // CE QUE LE PROFIL DIT, AU SENS DE PARSEVAL. Les deux tests de plancher ci-dessous ne
  // distingueraient pas une moyenne de magnitudes d'une moyenne de puissances : les deux descendent,
  // à moins d'un décibel près. Or `reduireBruit` élève le profil au carré pour en faire une
  // puissance, et le carré de la moyenne n'est pas la moyenne des carrés : sur un bruit dont chaque
  // bin suit une loi de Rayleigh, l'écart vaut 4/π, soit un quart de la puissance du bruit laissé en
  // place. Ce test l'attrape par une identité, et non par un seuil : la puissance totale que le
  // profil annonce doit être celle que le signal porte.
  it("LE PROFIL ANNONCE LA PUISSANCE DU BRUIT, et non le carré de sa magnitude moyenne", () => {
    const sr = 44100;
    const n = 4 * sr;
    const amplitude = 0.3;
    const bruit = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
    const ch = bruit.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (rngTest() * 2 - 1) * amplitude;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += ch[i] * ch[i];
    variance /= n;

    const profil = calculerProfilBruit(bruit);
    const N = 2 * (profil.length - 1);
    // Les bins repliés comptent deux fois, sauf le continu et Nyquist.
    let puissanceAnnoncee = profil[0] ** 2 + profil[profil.length - 1] ** 2;
    for (let b = 1; b < profil.length - 1; b++) puissanceAnnoncee += 2 * profil[b] ** 2;

    // Parseval sur une trame fenêtrée : la somme des puissances de bins vaut N fois celle du signal
    // fenêtré. La somme des carrés d'une Hann de taille N vaut 3N/8.
    const attendue = N * variance * (3 * N) / 8;
    const rapport = puissanceAnnoncee / attendue;
    expect(rapport, `le profil annonce ${(rapport * 100).toFixed(1)} % de la puissance du bruit`)
      .toBeGreaterThan(0.9);
    expect(rapport).toBeLessThan(1.1);
  });

  it("LE PLANCHER DE BRUIT DESCEND VRAIMENT dans un silence, au réglage par défaut", () => {
    const { melange, bruitSeul } = voixAuMilieu();
    const profil = calculerProfilBruit(bruitSeul);
    const avant = melange.getChannelData(0);
    // 300 %, le défaut du paramètre « Réduction » ; 1 %, celui de « Plancher ».
    const apres = reduireBruit(melange, profil, 3, 0.01).getChannelData(0);

    const silence = dbEntre(apres, 2.2, 2.9) - dbEntre(avant, 2.2, 2.9);
    const signal = dbEntre(apres, 1.2, 1.8) - dbEntre(avant, 1.2, 1.8);

    expect(silence, `le plancher n'a baissé que de ${silence.toFixed(2)} dB dans le silence`)
      .toBeLessThan(-9);
    expect(signal, `le signal utile a perdu ${signal.toFixed(2)} dB`).toBeGreaterThan(-1.5);
  });

  it("LA RÉDUCTION SUIT LE RÉGLAGE : à 100 % elle ne peut presque rien, et c'est attendu", () => {
    const { melange, bruitSeul } = voixAuMilieu();
    const profil = calculerProfilBruit(bruitSeul);
    const avant = dbEntre(melange.getChannelData(0), 2.2, 2.9);
    const palier = (force: number) =>
      dbEntre(reduireBruit(melange, profil, force, 0.01).getChannelData(0), 2.2, 2.9) - avant;

    const cent = palier(1), troisCents = palier(3), sixCents = palier(6);
    // À 100 %, on retire la puissance MOYENNE du bruit et il en reste e⁻¹, soit 37 % : la réduction
    // ne peut pas dépasser une poignée de décibels, et c'est pour cela que le réglage monte à 600 %.
    expect(cent, `100 % donne ${cent.toFixed(2)} dB`).toBeGreaterThan(-8);
    expect(troisCents).toBeLessThan(cent - 3);
    expect(sixCents).toBeLessThan(troisCents - 3);
  });

  it("LES BORDS NE SONT PLUS PERDUS : ni le premier échantillon, ni la queue", () => {
    const n = 44100;
    const x = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: 44100 });
    const ch = x.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (rngTest() * 2 - 1) * 0.4;
    // Un profil nul ne retire rien : la sortie doit alors être l'entrée, bords compris.
    const y = reduireBruit(x, new Float32Array(4097), 1, 0.01).getChannelData(0);

    let debut = 0;
    while (debut < n && y[debut] === 0) debut++;
    let fin = n - 1;
    while (fin >= 0 && y[fin] === 0) fin--;
    expect(debut, `${debut} échantillons effacés au début`).toBe(0);
    expect(n - 1 - fin, `${n - 1 - fin} échantillons effacés à la fin`).toBe(0);

    // Et le recollement rend bien le signal, aux deux bouts comme au milieu.
    for (const i of [0, 1, 500, n >> 1, n - 500, n - 2, n - 1]) {
      expect(Math.abs(y[i] - ch[i]), `écart à l'échantillon ${i}`).toBeLessThan(1e-3);
    }
  });

  it("les notches suppriment un ronflement sinusoïdal", () => {
    // fréquence alignée sur un bin FFT (129.2 Hz ≈ bin 6) pour que la détection
    // soit exacte et que le filtre coupe-bande cible la bonne fréquence
    const fHum = (44100 / 2048) * 6;
    const hum = bruitHum(1, fHum);
    const profil = calculerProfilBruit(hum);
    const melange = signalAvecHum(0.3, 0.2, fHum);
    const rmsAvant = rms(melange);
    const reduit = reduireBruitNotches(melange, profil, 2, 5, 10);
    const rmsApres = rms(reduit);
    expect(reduit).toBeInstanceOf(AudioBuffer);
    expect(reduit.length).toBe(melange.length);
    expect(rmsApres).toBeLessThan(rmsAvant * 0.9);
  });
});
