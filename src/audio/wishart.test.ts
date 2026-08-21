// audio/wishart.test.ts — Ce qui rend les wavesets utilisables tient à une
// propriété simple : les segments commencent et finissent à zéro, donc on peut
// les répéter, les jeter ou les réordonner sans jamais produire de clic. C'est
// cela, et le comportement de chaque opération, qu'on verrouille ici.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { decouperWavesets, transformerWavesets } from "./wishart";

const SR = 8000;

function sinus(freq: number, dureeSec: number, sr = SR, canaux = 1): AudioBuffer {
  const n = Math.round(dureeSec * sr);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  }
  return b;
}

function energie(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return s;
}

describe("decouperWavesets", () => {
  it("trouve une frontière par période, et pas deux", () => {
    // 100 Hz sur 0,5 s = 50 périodes. Découper à CHAQUE passage par zéro en
    // donnerait 100, c'est-à-dire des demi-lobes : les répéter produirait une
    // composante continue au lieu d'une transposition.
    const f = decouperWavesets(sinus(100, 0.5).getChannelData(0));
    // Frontières = 50 débuts de période + la fin du tampon, à une près selon la
    // phase de départ.
    expect(f.length).toBeGreaterThanOrEqual(50);
    expect(f.length).toBeLessThanOrEqual(52);
  });

  it("place les frontières sur des passages montants", () => {
    const canal = sinus(100, 0.2).getChannelData(0);
    const f = decouperWavesets(canal);
    for (const i of f.slice(1, -1)) {
      expect(canal[i - 1]).toBeLessThanOrEqual(0);
      expect(canal[i]).toBeGreaterThan(0);
    }
  });

  it("suit la hauteur du son : deux fois plus aigu, deux fois plus de segments", () => {
    // C'est ce qui distingue les wavesets d'une granulation à grille fixe.
    const grave = decouperWavesets(sinus(100, 0.5).getChannelData(0)).length;
    const aigu = decouperWavesets(sinus(200, 0.5).getChannelData(0)).length;
    expect(aigu / grave).toBeGreaterThan(1.8);
    expect(aigu / grave).toBeLessThan(2.2);
  });
});

describe("transformerWavesets", () => {
  const src = () => sinus(200, 0.5);

  it("la répétition allonge le son du facteur demandé", () => {
    for (const facteur of [2, 3]) {
      const out = transformerWavesets(src(), { operation: "repetition", facteur });
      expect(out.length / src().length).toBeCloseTo(facteur, 1);
    }
  });

  it("l'omission conserve la durée et retire de l'énergie", () => {
    // Retirer les segments plutôt que les taire raccourcirait le son ET le
    // transposerait vers l'aigu : deux effets pour un seul réglage.
    const avant = src();
    const out = transformerWavesets(avant, { operation: "omission", facteur: 2 });
    expect(out.length).toBe(avant.length);
    const ratio = energie(out) / energie(avant);
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
  });

  it("l'inversion garde durée et énergie, mais change le signal", () => {
    const avant = src();
    const out = transformerWavesets(avant, { operation: "inversion", facteur: 1 });
    expect(out.length).toBe(avant.length);
    expect(energie(out)).toBeCloseTo(energie(avant), 2);
    const a = avant.getChannelData(0), b = out.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - b[i]);
    expect(ecart / a.length).toBeGreaterThan(1e-3);
  });

  it("le mélange est déterministe à graine égale, différent sinon", () => {
    const a = transformerWavesets(src(), { operation: "melange", facteur: 8, graine: 42 });
    const b = transformerWavesets(src(), { operation: "melange", facteur: 8, graine: 42 });
    const c = transformerWavesets(src(), { operation: "melange", facteur: 8, graine: 7 });
    const da = a.getChannelData(0), db = b.getChannelData(0), dc = c.getChannelData(0);
    for (let i = 0; i < da.length; i += 331) expect(db[i]).toBe(da[i]);
    let ecart = 0;
    for (let i = 0; i < da.length; i++) ecart += Math.abs(da[i] - dc[i]);
    expect(ecart / da.length).toBeGreaterThan(1e-4);
  });

  it("l'égalisation aplatit la dynamique sans toucher à la durée", () => {
    // Source dont l'amplitude décroît : après égalisation, la fin doit être
    // aussi forte que le début.
    const n = Math.round(0.5 * SR);
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.exp(-3 * (i / n)) * Math.sin((2 * Math.PI * 200 * i) / SR);
    const out = transformerWavesets(b, { operation: "egalisation", facteur: 1 });
    expect(out.length).toBe(n);
    const pic = (x: Float32Array, a: number, z: number) => {
      let m = 0;
      for (let i = a; i < z; i++) m = Math.max(m, Math.abs(x[i]));
      return m;
    };
    const o = out.getChannelData(0);
    const debut = pic(o, 0, Math.round(n / 5));
    const fin = pic(o, Math.round((4 * n) / 5), n);
    expect(fin / debut).toBeGreaterThan(0.9);
    // …alors que la source, elle, s'était bien éteinte.
    expect(pic(d, Math.round((4 * n) / 5), n) / pic(d, 0, Math.round(n / 5))).toBeLessThan(0.2);
  });

  it("ne produit pas de clic : les jonctions valent zéro", () => {
    // La propriété qui rend toute la famille possible. On la vérifie sur
    // l'opération la plus brutale — le mélange, qui recolle des segments dans un
    // ordre arbitraire.
    const out = transformerWavesets(src(), { operation: "melange", facteur: 6, graine: 3 });
    const d = out.getChannelData(0);
    let pire = 0;
    for (let i = 1; i < d.length; i++) pire = Math.max(pire, Math.abs(d[i] - d[i - 1]));
    // Borne théorique : le passage par zéro tombe ENTRE deux échantillons, donc
    // le dernier point d'un segment et le premier du suivant peuvent chacun se
    // trouver à une pente de zéro, de part et d'autre. Le saut à une jonction
    // est donc majoré par DEUX fois la pente maximale du signal — 2π·200/8000
    // pour une sinusoïde à 200 Hz échantillonnée à 8 kHz. Un vrai clic, lui,
    // ferait un saut sans rapport avec cette borne.
    const penteMax = (2 * Math.PI * 200) / SR;
    expect(pire).toBeLessThanOrEqual(penteMax * 2);
  });

  it("conserve le nombre de canaux, sans désynchroniser la stéréo", () => {
    const out = transformerWavesets(sinus(200, 0.3, SR, 2), { operation: "repetition", facteur: 2 });
    expect(out.numberOfChannels).toBe(2);
    // Le découpage est commun aux deux voies : elles restent alignées.
    const g = out.getChannelData(0), d = out.getChannelData(1);
    for (let i = 0; i < g.length; i += 197) expect(d[i]).toBeCloseTo(g[i], 6);
  });
});
