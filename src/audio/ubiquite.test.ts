// audio/ubiquite.test.ts — La provenance se disperse-t-elle sans que le son s'abîme ?
//
// CE QUE CE FICHIER DOIT PROUVER. Décorréler deux canaux est facile ; le faire sans creuser le repli
// en mono ne l'est pas, et c'est là que presque toutes les mises en œuvre fautives se rangent.
//
//   — OPPOSER UN CANAL décorrèle parfaitement : la corrélation tombe à moins un. Mais la somme des
//     deux s'annule, et la pièce diffusée sur un seul haut-parleur disparaît.
//   — RETARDER UN CANAL décorrèle aussi. La somme devient alors un peigne, et le grave s'y creuse.
//
// Les deux passeraient un cas qui ne regarderait que la corrélation. Le cas du repli en mono est
// donc celui qu'il faut garder : il mesure ce que la décorrélation COÛTE, et c'est la seule chose
// qu'une oreille ne peut pas juger sur une écoute au casque.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { correlationDesCanaux, ubiquite } from "./ubiquite";

const SR = 16000;

/** Un bruit stéréo cohérent : les deux canaux portent la même onde, donc une source unique. */
function sourceCoherente(secondes: number): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  let g = 5;
  const x = b.getChannelData(0);
  const d = b.getChannelData(1);
  for (let i = 0; i < n; i++) {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    const v = g / 4294967296 - 0.5;
    x[i] = v;
    d[i] = v;
  }
  return b;
}

/** La valeur efficace du repli en mono : ce que rend un seul haut-parleur. */
function rmsDuMono(b: AudioBuffer): number {
  const g = b.getChannelData(0);
  const d = b.getChannelData(1);
  let s = 0;
  for (let i = 0; i < g.length; i++) { const m = (g[i] + d[i]) / 2; s += m * m; }
  return Math.sqrt(s / g.length);
}

/** La valeur efficace d'un canal, pour voir si le traitement a changé le niveau. */
function rmsCanal(b: AudioBuffer, c: number): number {
  const x = b.getChannelData(c);
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}

const BASE = { dispersion: 1, etages: 6, graine: 3 };

describe("l'ubiquité", () => {
  it("FAIT TOMBER LA CORRÉLATION DES DEUX CANAUX, ce qui est la définition de l'effet", () => {
    const entree = sourceCoherente(1);
    expect(correlationDesCanaux(entree)).toBeCloseTo(1, 6);
    expect(correlationDesCanaux(ubiquite(entree, BASE))).toBeLessThan(0.3);
  });

  it("ET ELLE TOMBE D'AUTANT PLUS QUE LA DISPERSION MONTE", () => {
    const entree = sourceCoherente(1);
    const suite = [0, 0.25, 0.5, 0.75, 1].map((dispersion) =>
      correlationDesCanaux(ubiquite(entree, { ...BASE, dispersion })));
    for (let k = 1; k < suite.length; k++) {
      expect(suite[k], `dispersion ${k}`).toBeLessThan(suite[k - 1]);
    }
    expect(suite[0]).toBeCloseTo(1, 6);
  });

  it("ET LE REPLI EN MONO NE PERD QUE LES TROIS DÉCIBELS INÉVITABLES", () => {
    // TROIS DÉCIBELS SONT DUS, et ma première version de ce cas l'ignorait : additionner deux
    // signaux décorrélés ajoute leurs ÉNERGIES et non leurs amplitudes, donc la somme vaut la
    // racine de deux fois moins. Demander que le mono garde son niveau revenait à demander que la
    // décorrélation n'ait pas lieu. MESURÉ : 0,643 du niveau d'origine, pour 0,707 attendus.
    const entree = sourceCoherente(2);
    const rapport = rmsDuMono(ubiquite(entree, BASE)) / rmsDuMono(entree);
    expect(rapport).toBeGreaterThan(0.55);
    expect(rapport).toBeLessThan(0.9);
  });

  it("ET SON SPECTRE RESTE ENTIER, ce qui est la preuve qui compte", () => {
    // LE CAS QUI SÉPARE UNE VRAIE DÉCORRÉLATION D'UN TRUC, et il ne pouvait pas être le niveau.
    // Opposer un canal décorrèle parfaitement et rend un mono SILENCIEUX ; en retarder un décorrèle
    // aussi et rend un mono en peigne, creusé de trous. L'un et l'autre passeraient les cas
    // précédents. Ce qu'un passe-tout garde, et qu'eux perdent, c'est la forme du spectre : aucune
    // bande ne s'effondre, toutes descendent ensemble des trois décibels dus.
    const entree = sourceCoherente(2);
    const sortie = ubiquite(entree, BASE);
    const mono = (b: AudioBuffer) => {
      const g = b.getChannelData(0);
      const d = b.getChannelData(1);
      return Float32Array.from(g, (v, i) => (v + d[i]) / 2);
    };
    const bande = (x: Float32Array, hz: number) => {
      const w = (2 * Math.PI * hz) / SR;
      const c = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < x.length; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
    };
    const avant = mono(entree);
    const apres = mono(sortie);
    for (const hz of [120, 300, 800, 2000, 5000]) {
      const rapport = bande(apres, hz) / bande(avant, hz);
      expect(rapport, `${hz} Hz`).toBeGreaterThan(0.35);
      expect(rapport, `${hz} Hz`).toBeLessThan(1.6);
    }
  });

  it("ET SANS TOUCHER AU NIVEAU DE CHAQUE CANAL, le passe-tout ne changeant que la phase", () => {
    const entree = sourceCoherente(2);
    const sortie = ubiquite(entree, BASE);
    for (const c of [0, 1]) {
      expect(rmsCanal(sortie, c), `canal ${c}`).toBeCloseTo(rmsCanal(entree, c), 2);
    }
  });

  it("ET DEUX RENDUS DE MÊME GRAINE SONT LE MÊME SON, deux graines deux sons", () => {
    const entree = sourceCoherente(0.3);
    const a = ubiquite(entree, BASE).getChannelData(0);
    const b = ubiquite(entree, BASE).getChannelData(0);
    const c = ubiquite(entree, { ...BASE, graine: 99 }).getChannelData(0);
    for (let i = 0; i < a.length; i += 11) expect(b[i], `échantillon ${i}`).toBe(a[i]);
    let differe = false;
    for (let i = 0; i < a.length; i += 11) if (Math.abs(c[i] - a[i]) > 1e-6) { differe = true; break; }
    expect(differe).toBe(true);
  });
});

describe("l'hyperlocalisation", () => {
  it("RAMÈNE LES DEUX CANAUX À CE QU'ILS ONT EN COMMUN", () => {
    // Une source franchement décentrée se recentre : à moins un, les deux canaux sont le même
    // signal, et la provenance ne laisse plus de doute.
    const n = Math.round(0.5 * SR);
    const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
    let g = 11;
    for (let i = 0; i < n; i++) {
      g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
      b.getChannelData(0)[i] = g / 4294967296 - 0.5;
      g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
      b.getChannelData(1)[i] = g / 4294967296 - 0.5;
    }
    expect(Math.abs(correlationDesCanaux(b))).toBeLessThan(0.1);
    const serre = ubiquite(b, { ...BASE, dispersion: -1 });
    expect(correlationDesCanaux(serre)).toBeCloseTo(1, 6);
    for (let i = 0; i < n; i += 13) {
      expect(serre.getChannelData(0)[i], `échantillon ${i}`).toBe(serre.getChannelData(1)[i]);
    }
  });

  it("ET À ZÉRO LE SON SORT TEL QU'IL EST ENTRÉ, au bit près", () => {
    const entree = sourceCoherente(0.3);
    const sortie = ubiquite(entree, { ...BASE, dispersion: 0 });
    for (const c of [0, 1]) {
      for (let i = 0; i < entree.length; i += 7) {
        expect(sortie.getChannelData(c)[i], `canal ${c}, échantillon ${i}`)
          .toBe(entree.getChannelData(c)[i]);
      }
    }
  });
});
