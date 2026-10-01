// audio/paulstretch-module.test.ts — L'étirement suit-il la courbe, et sans rien changer d'autre ?
//
// CE QUE CE FICHIER DOIT PROUVER. Deux choses, et la première est la plus importante des deux.
//
//   — UN FACTEUR CONSTANT REND EXACTEMENT CE QU'IL RENDAIT. Ouvrir un effet à la modulation, c'est
//     toucher à son cœur ; si le chemin sans courbe change d'un échantillon, tous les graphes déjà
//     enregistrés rendent autre chose qu'avant, et personne ne s'en apercevra avant de réécouter.
//   — LA COURBE AGIT OÙ ELLE EST LUE. Un étirement qui monte du début à la fin doit consacrer PLUS
//     DE SORTIE à la fin de la source qu'à son début. Une mise en œuvre qui lirait la courbe sur la
//     sortie, ou qui ne l'appliquerait qu'en moyenne, rendrait la bonne durée totale et la mauvaise
//     répartition — et la durée est tout ce qu'on regarde d'ordinaire.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { appliquerPaulstretch } from "./effets-grains";

const SR = 8000;

/** Un tirage reproductible : deux rendus du même réglage doivent être comparables. */
function tirageSeme(graine: number): () => number {
  let g = graine >>> 0;
  return () => {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    return g / 4294967296;
  };
}

/** Un son d'entrée : une sinusoïde qui monte, pour qu'on sache où l'on est dedans. */
function source(secondes: number): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * (200 + (600 * i) / n) * (i / SR)) * 0.5;
  return b;
}

const rendre = (b: AudioBuffer, facteur: number | Float32Array) =>
  appliquerPaulstretch(b, facteur, 0.05, { hasard: tirageSeme(1) });

describe("le facteur constant", () => {
  it("REND EXACTEMENT CE QU'IL RENDAIT, qu'il soit donné en nombre ou en tableau plat", async () => {
    // LA PREUVE QUI PROTÈGE L'EXISTANT. Le nombre est le chemin d'avant ; le tableau constant est
    // celui que prend un composant dont l'entrée Modulation n'est pas branchée. Les deux doivent
    // rendre le même son, échantillon par échantillon, sans quoi brancher puis débrancher une
    // courbe ne rendrait pas le graphe à son état d'origine.
    const b = source(0.5);
    const enNombre = await rendre(b, 6);
    const enTableau = await rendre(b, new Float32Array(b.length).fill(6));
    expect(enTableau.length).toBe(enNombre.length);
    const a = enNombre.getChannelData(0);
    const c = enTableau.getChannelData(0);
    for (let i = 0; i < a.length; i += 17) expect(c[i], `échantillon ${i}`).toBe(a[i]);
  });

  it("ET SA DURÉE SUIT LE FACTEUR, ce qui est la mesure la plus simple de l'effet", async () => {
    const b = source(0.5);
    const court = await rendre(b, 2);
    const long = await rendre(b, 8);
    // MESURÉ : 3,906 pour un rapport de 4 demandé. La sortie se compte en trames entières d'une
    // demi-fenêtre, donc le rapport ne tombe juste que par hasard ; c'est la troncature d'une
    // trame sur quarante, et non un étirement inexact.
    expect(long.length / court.length).toBeGreaterThan(3.8);
    expect(long.length / court.length).toBeLessThan(4.2);
  });

  it("ET UN FACTEUR SOUS UN NE COMPRIME PAS : Paulstretch étire, il ne raccourcit pas", async () => {
    const b = source(0.3);
    const aUn = await rendre(b, 1);
    const aZero = await rendre(b, 0.25);
    expect(aZero.length).toBe(aUn.length);
  });
});

describe("le facteur qui varie", () => {
  it("DONNE UNE DURÉE ENTRE CELLE DE SES DEUX BOUTS", async () => {
    // Une rampe de 2 à 8 ne peut pas rendre plus court qu'un 2 constant ni plus long qu'un 8.
    const b = source(0.5);
    const rampe = Float32Array.from({ length: b.length }, (_, i) => 2 + (6 * i) / (b.length - 1));
    const variable = await rendre(b, rampe);
    const bas = await rendre(b, 2);
    const haut = await rendre(b, 8);
    expect(variable.length).toBeGreaterThan(bas.length);
    expect(variable.length).toBeLessThan(haut.length);
  });

  it("ET LA COURBE AGIT LÀ OÙ ELLE EST LUE : sur la source, non sur la sortie", async () => {
    // LE CAS QUI TRANCHE, et il ne se laisse pas remplacer par une mesure de durée. Une rampe
    // montante et la même rampe retournée occupent la MÊME durée totale, à l'arrondi près : la
    // somme des pas ne dépend pas de leur ordre. Ce qui les distingue est la répartition — la
    // moitié de la source qui est étirée le plus fort doit occuper la plus grande part de la
    // sortie. On la mesure en étirant une source dont la seconde moitié est SILENCIEUSE : le son
    // ne peut alors se trouver que là où sa moitié bruyante a été dépliée.
    const n = Math.round(0.5 * SR);
    const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const d = b.getChannelData(0);
    for (let i = 0; i < n / 2; i++) d[i] = Math.sin(2 * Math.PI * 300 * (i / SR)) * 0.5;

    const montante = Float32Array.from({ length: n }, (_, i) => 1 + (11 * i) / (n - 1));
    const descendante = Float32Array.from({ length: n }, (_, i) => 12 - (11 * i) / (n - 1));

    const partSonore = async (facteurs: Float32Array) => {
      const out = await rendre(b, facteurs);
      const x = out.getChannelData(0);
      let energie = 0;
      let pondere = 0;
      for (let i = 0; i < x.length; i++) { energie += x[i] * x[i]; pondere += (x[i] * x[i] * i) / x.length; }
      return pondere / (energie || 1);
    };

    // La moitié bruyante est la PREMIÈRE. Étirée peu (rampe montante), elle occupe une petite part
    // du début ; étirée beaucoup (rampe descendante), elle en occupe une grande.
    const avecMontante = await partSonore(montante);
    const avecDescendante = await partSonore(descendante);
    expect(avecDescendante).toBeGreaterThan(avecMontante * 1.5);
  });

  it("ET DEUX RAMPES INVERSES DURENT AUTANT, ce qui prouve que le cas d'avant mesure autre chose", async () => {
    // Sans ce témoin, on pourrait croire que la durée suffisait à distinguer les deux sens.
    const b = source(0.5);
    const n = b.length;
    const montante = Float32Array.from({ length: n }, (_, i) => 1 + (11 * i) / (n - 1));
    const descendante = Float32Array.from({ length: n }, (_, i) => 12 - (11 * i) / (n - 1));
    const a = await rendre(b, montante);
    const c = await rendre(b, descendante);
    expect(Math.abs(a.length - c.length) / a.length).toBeLessThan(0.05);
  });

  it("ET UNE COURBE PLUS COURTE QUE LE SON TIENT SA DERNIÈRE VALEUR", async () => {
    // La règle du dépôt pour toute modulation : au-delà de la fin du tableau, la dernière valeur
    // est tenue, faute de quoi la fin du son retomberait à zéro.
    const b = source(0.4);
    const courte = new Float32Array(10).fill(4);
    const pleine = new Float32Array(b.length).fill(4);
    const a = await rendre(b, courte);
    const c = await rendre(b, pleine);
    expect(a.length).toBe(c.length);
  });
});
