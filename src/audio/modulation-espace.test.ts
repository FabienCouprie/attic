// audio/modulation-espace.test.ts — Ce qui place un son dans l'espace, ouvert à une courbe.
//
// LA FAMILLE « ESPACE », RÉDUITE À DEUX APRÈS LE RELEVÉ. La Vague porte deux réglages, l'Ubiquité
// un, et le Brassage a été écarté sur décision de Fabien : ses deux réglages sont lus une fois par
// SEGMENT, à la cadence que fixe « Densité », de 1 à 400 par seconde.
//
// LES DEUX INVARIANTS NE CHANGENT PAS : sans courbe, pas un bit ne bouge ; et la courbe doit
// commander vraiment.
//
// CE QUE CETTE FAMILLE AJOUTE AUX AUTRES, ET QUI N'ÉTAIT JAMAIS ARRIVÉ : un réglage dont le SIGNE
// choisit entre deux calculs. La dispersion de l'Ubiquité va de −100 à +100 ; au négatif les deux
// canaux glissent vers leur moyenne, au positif une chaîne de passe-tout brouille la phase. Un
// scalaire négatif saute donc entièrement cette chaîne, et il doit continuer de le faire. Une
// courbe, elle, peut FRANCHIR zéro, et c'est le cas qu'il faut tenir.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { ubiquite, correlationDesCanaux } from "./ubiquite";
import { vague } from "./vague";

const SR = 44100;

function bruit(longueur: number, graine = 5): Float32Array<ArrayBuffer> {
  const n = Math.round(longueur);
  let e = graine >>> 0;
  const x = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
  return x;
}

/** Un tampon dont les deux canaux DIFFÈRENT : sans cela, il n'y a rien à disperser. */
function stereo(longueur: number, g = 3, d = 11): AudioBuffer {
  const n = Math.round(longueur);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  b.copyToChannel(bruit(n, g), 0);
  b.copyToChannel(bruit(n, d), 1);
  return b;
}

/** Une copie possédée du canal : une vue ne survit pas au tampon natif dont elle vient. */
const canal = (b: AudioBuffer, c = 0): Float32Array => Float32Array.from(b.getChannelData(c));

const memes = (x: Float32Array, y: Float32Array): boolean => {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

const tenue = (valeur: number, n: number) => new Float32Array(n).fill(valeur);

describe("l'ubiquité ouverte à une courbe", () => {
  const x = stereo(SR / 4);
  const n = x.length;
  const o = { etages: 6, graine: 3 };
  const applique = (dispersion: number | Float32Array) => ubiquite(x, { ...o, dispersion });

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS, du côté positif", () => {
    const fixe = applique(0.5), tenu = applique(tenue(0.5, n));
    expect(memes(canal(fixe, 0), canal(tenu, 0))).toBe(true);
    expect(memes(canal(fixe, 1), canal(tenu, 1))).toBe(true);
  });

  it("ET DU CÔTÉ NÉGATIF AUSSI, là où le calcul des passe-tout est sauté", () => {
    const fixe = applique(-0.5), tenu = applique(tenue(-0.5, n));
    expect(memes(canal(fixe, 0), canal(tenu, 0))).toBe(true);
    expect(memes(canal(fixe, 1), canal(tenu, 1))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    const sec = applique(tenue(0, n));
    expect(memes(canal(sec, 0), canal(x, 0))).toBe(true);
    expect(memes(canal(sec, 1), canal(x, 1))).toBe(true);
  });

  it("UNE COURBE QUI FRANCHIT ZÉRO donne les deux calculs dans le même son", () => {
    // LE CAS QUE CETTE FAMILLE A APPORTÉ. La première moitié est hyperlocalisée, donc les deux
    // canaux s'y rapprochent ; la seconde est dispersée, donc ils s'y éloignent. Aucun réglage fixe
    // ne peut rendre cela, et c'est ce que les deux comparaisons vérifient.
    const franchit = new Float32Array(n);
    for (let i = 0; i < n; i++) franchit[i] = i < n / 2 ? -1 : 1;
    const y = applique(franchit);
    expect(memes(canal(y, 0), canal(applique(tenue(-1, n)), 0)), "coïncide avec l'hyperlocalisation").toBe(false);
    expect(memes(canal(y, 0), canal(applique(tenue(1, n)), 0)), "coïncide avec l'ubiquité").toBe(false);

    // Et la mesure le dit : la première moitié est plus corrélée que la seconde.
    const moitie = (b: AudioBuffer, debut: number, fin: number) => {
      const m = new AudioBuffer({ numberOfChannels: 2, length: fin - debut, sampleRate: SR });
      m.copyToChannel(Float32Array.from(canal(b, 0).subarray(debut, fin)), 0);
      m.copyToChannel(Float32Array.from(canal(b, 1).subarray(debut, fin)), 1);
      return correlationDesCanaux(m);
    };
    const avant = moitie(y, 0, Math.floor(n / 2));
    const apres = moitie(y, Math.floor(n / 2), n);
    expect(avant, "la première moitié n'est pas resserrée").toBeGreaterThan(apres + 0.3);
  });
});

describe("la vague ouverte à deux courbes", () => {
  const x = stereo(SR / 4, 17, 19);
  const n = x.length;
  const o = { periode: 2, variation: 0.2, montee: 0.7, rupture: "deferlante" as const, graine: 5 };
  const applique = (profondeur: number | Float32Array, ouverture: number | Float32Array) =>
    canal(vague(x, { ...o, profondeur, ouverture }));

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(0.75, 0.5), applique(tenue(0.75, n), tenue(0.5, n)))).toBe(true);
  });

  it("ET CHAQUE PORT SÉPARÉMENT, l'autre restant un nombre", () => {
    expect(memes(applique(0.75, 0.5), applique(tenue(0.75, n), 0.5)), "profondeur seule").toBe(true);
    expect(memes(applique(0.75, 0.5), applique(0.75, tenue(0.5, n))), "ouverture seule").toBe(true);
  });

  it("ET UNE PROFONDEUR TENUE À ZÉRO LAISSE LE NIVEAU TRANQUILLE", () => {
    // À profondeur nulle, le gain vaut un partout : il ne reste que le filtrage de l'ouverture.
    const sans = applique(tenue(0, n), 0);
    const filtreSeul = applique(0, 0);
    expect(memes(sans, filtreSeul)).toBe(true);
  });

  it("deux profondeurs opposées donnent deux sons, donc le port commande", () => {
    expect(memes(applique(tenue(0, n), 0.5), applique(tenue(1, n), 0.5))).toBe(false);
  });

  it("une courbe qui monte ne rend NI l'un NI l'autre", () => {
    // Le cas qui attrape une lecture faite une seule fois, hors de la boucle.
    const rampe = new Float32Array(n);
    for (let i = 0; i < n; i++) rampe[i] = i / n;
    const y = applique(rampe, 0.5);
    expect(memes(y, applique(0, 0.5))).toBe(false);
    expect(memes(y, applique(1, 0.5))).toBe(false);
  });

  it("et l'ouverture commande aussi, elle qui entre dans la coupure", () => {
    expect(memes(applique(0.9, tenue(0, n)), applique(0.9, tenue(1, n)))).toBe(false);
  });
});
