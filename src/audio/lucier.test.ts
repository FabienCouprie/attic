// audio/lucier.test.ts — L'effet Lucier a une signature objective : la platitude
// spectrale doit décroître à mesure que les modes de la pièce prennent le dessus
// sur la source. C'est cela qu'on vérifie, pas une impression d'écoute.
import { describe, it, expect } from "vitest";
import "node-web-audio-api/polyfill.js";
import { pieceDeLucier, platitudeSpectrale } from "./lucier";
import { genererIR } from "./convolution";

const SR = 16000;

/** Bruit large bande : spectre plat, donc point de départ idéal pour la mesure. */
function bruit(dureeSec: number, sr = SR): AudioBuffer {
  const n = Math.round(dureeSec * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  // Générateur déterministe : un test qui dépend de Math.random() finit par
  // échouer un jour sur un tirage malheureux, sans rien apprendre à personne.
  let graine = 12345;
  for (let i = 0; i < n; i++) {
    graine = (graine * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (graine / 0x3fffffff) - 1;
  }
  return b;
}

function pic(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  return m;
}

describe("platitudeSpectrale", () => {
  it("vaut nettement plus pour du bruit que pour une sinusoïde", () => {
    const sinus = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const d = sinus.getChannelData(0);
    for (let i = 0; i < SR; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
    expect(platitudeSpectrale(bruit(1))).toBeGreaterThan(platitudeSpectrale(sinus) * 10);
  });
});

describe("pieceDeLucier", () => {
  const ir = () => genererIR("Cathédrale", 80, 3, 20, 40, SR);

  it("conserve la durée d'origine, quel que soit le nombre de passages", async () => {
    // Une convolution allonge le signal ; sans troncature, quarante passages
    // donneraient un fichier interminable. Dans l'œuvre, chaque
    // ré-enregistrement dure autant que le précédent.
    const src = bruit(0.5);
    for (const n of [1, 5]) {
      const out = await pieceDeLucier(src, ir(), { iterations: n });
      expect(out.length).toBe(src.length);
      expect(out.sampleRate).toBe(SR);
    }
  });

  it("les résonances de la pièce prennent le dessus : la platitude décroît", async () => {
    // LA signature de l'effet. Sans elle, on n'aurait aucun moyen de distinguer
    // ce nœud d'une réverbération très mouillée.
    const src = bruit(0.5);
    const avant = platitudeSpectrale(src);
    const apres1 = platitudeSpectrale(await pieceDeLucier(src, ir(), { iterations: 1 }));
    const apres8 = platitudeSpectrale(await pieceDeLucier(src, ir(), { iterations: 8 }));
    expect(apres1).toBeLessThan(avant);
    expect(apres8).toBeLessThan(apres1);
  });

  it("le niveau ne dérive pas au fil des passages", async () => {
    // Sans renormalisation, l'écart de gain se cumule géométriquement : le
    // signal saturerait ou deviendrait inaudible avant que le phénomène ne
    // s'installe.
    const src = bruit(0.5);
    const p0 = pic(src);
    for (const n of [1, 4, 10]) {
      const p = pic(await pieceDeLucier(src, ir(), { iterations: n }));
      expect(p).toBeCloseTo(p0, 5);
    }
  });

  it("signale sa progression à chaque passage", async () => {
    const vus: string[] = [];
    await pieceDeLucier(bruit(0.2), ir(), {
      iterations: 3,
      surIteration: (i, total) => vus.push(`${i}/${total}`),
    });
    expect(vus).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("un passage unique n'est pas l'identité — la pièce s'entend déjà", async () => {
    const src = bruit(0.3);
    const out = await pieceDeLucier(src, ir(), { iterations: 1 });
    const a = src.getChannelData(0), b = out.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart += Math.abs(a[i] - b[i]);
    expect(ecart / a.length).toBeGreaterThan(1e-3);
  });
});
