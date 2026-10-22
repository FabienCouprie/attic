// audio/appariement-reference.test.ts — La cible prend-elle vraiment la couleur de la référence ?
//
// COMMENT CES CAS SONT BÂTIS. Chaque propriété est éprouvée sur un couple dont on CONNAÎT la
// réponse : une cible et une référence qui ne diffèrent que par la chose à apparier. Un bruit rose
// contre le même bruit filtré dit ce que vaut la correction spectrale ; le même son à deux niveaux
// dit ce que vaut l'appariement de niveau. Mesurer sur deux morceaux réels ne distinguerait pas ce
// qui a été corrigé de ce qui se ressemblait déjà.
//
// ET LE CAS QUI COMPTE LE PLUS EST CELUI DE LA BORNE. Une cible qui s'arrête à six kilohertz,
// comparée à une référence qui monte jusqu'en haut, demande un gain sans fin dans l'aigu. La borne
// l'arrête, et le relevé dit combien de bandes ont buté : c'est ce chiffre qui annonce que la
// référence est hors de portée, et non une sortie qui paraîtrait réussie.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import {
  apparierSurReference, largeurStereo, lisserParOctave, spectreMoyen,
} from "./appariement-reference";

const SR = 48000;
const N = SR * 2;

/** Un bruit à la même graine des deux côtés : seule la couleur doit les distinguer. */
function bruit(canaux: number, gain = 0.2, graine = 7): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: N, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    let e = (graine + c * 1000) >>> 0 || 1;
    const x = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      e = (Math.imul(e, 1664525) + 1013904223) >>> 0;
      x[i] = gain * (e / 4294967296 - 0.5) * 2;
    }
    b.getChannelData(c).set(x);
  }
  return b;
}

/** Un passe-bas d'un pôle, pour fabriquer une cible terne à partir d'un bruit plat. */
function assombrir(b: AudioBuffer, coupureHz: number): AudioBuffer {
  const out = new AudioBuffer({
    numberOfChannels: b.numberOfChannels, length: b.length, sampleRate: b.sampleRate,
  });
  const a = Math.exp((-2 * Math.PI * coupureHz) / b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = new Float32Array(b.length);
    let etat = 0;
    for (let i = 0; i < b.length; i++) { etat = (1 - a) * x[i] + a * etat; y[i] = etat; }
    out.copyToChannel(y, c);
  }
  return out;
}

const efficace = (b: AudioBuffer) => {
  const x = b.getChannelData(0);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
};

/** L'énergie d'une tranche du spectre moyen, pour comparer deux couleurs. */
function energieBande(b: AudioBuffer, bas: number, haut: number): number {
  const spec = spectreMoyen(b.getChannelData(0), 4096);
  const pas = SR / 4096;
  let somme = 0;
  for (let k = Math.ceil(bas / pas); k < Math.min(spec.length, Math.ceil(haut / pas)); k++) {
    somme += spec[k] * spec[k];
  }
  return somme;
}

describe("l'appariement sur une référence", () => {
  it("DONNE À LA CIBLE LE NIVEAU DE LA RÉFÉRENCE", () => {
    const cible = bruit(2, 0.05);
    const reference = bruit(2, 0.30);
    const { audio, releve } = apparierSurReference(cible, reference,
      { spectre: false, largeur: false, crete: false });
    expect(efficace(audio) / efficace(reference)).toBeCloseTo(1, 1);
    expect(releve.gainNiveauDb).toBeGreaterThan(10);
  });

  it("ET RAPPROCHE SA COULEUR : une cible terne prend l'aigu de la référence", () => {
    const clair = bruit(2, 0.2);
    const terne = assombrir(clair, 2000);
    const avant = energieBande(terne, 8000, 16000) / energieBande(terne, 100, 1000);
    const { audio, releve } = apparierSurReference(terne, clair, { largeur: false, crete: false });
    const apres = energieBande(audio, 8000, 16000) / energieBande(audio, 100, 1000);
    const vise = energieBande(clair, 8000, 16000) / energieBande(clair, 100, 1000);
    expect(apres, `avant ${avant.toExponential(2)}, après ${apres.toExponential(2)}, visé ${vise.toExponential(2)}`)
      .toBeGreaterThan(avant * 4);
    expect(releve.correctionHauteDb).toBeGreaterThan(5);
  });

  it("LA BORNE ARRÊTE CE QUI NE PEUT PAS ÊTRE RENDU, et le relevé le dit", () => {
    // Une cible coupée très bas contre une référence plate : le rapport demande des dizaines de
    // décibels dans l'aigu, qui ne feraient qu'amplifier le plancher.
    const clair = bruit(2, 0.2);
    const tresTerne = assombrir(clair, 300);
    const { releve } = apparierSurReference(tresTerne, clair, { correctionMaxDb: 6, largeur: false });
    expect(releve.correctionHauteDb).toBeLessThanOrEqual(6.0001);
    expect(releve.bandesBornees, "des bandes doivent buter sur la borne").toBeGreaterThan(0);
    expect(releve.partBorneePct).toBeGreaterThan(10);
  });

  it("et une référence à portée ne fait buter personne", () => {
    const clair = bruit(2, 0.2);
    const presque = assombrir(clair, 18000);
    const { releve } = apparierSurReference(presque, clair, { correctionMaxDb: 12, largeur: false });
    expect(releve.bandesBornees).toBe(0);
  });

  it("DONNE À LA CIBLE LA LARGEUR DE LA RÉFÉRENCE", () => {
    const large = bruit(2, 0.2, 7);
    const etroite = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR });
    // Deux canaux presque identiques : une image resserrée.
    const g = large.getChannelData(0), d = large.getChannelData(1);
    etroite.copyToChannel(Float32Array.from(g, (v, i) => v * 0.9 + d[i] * 0.1), 0);
    etroite.copyToChannel(Float32Array.from(d, (v, i) => v * 0.9 + g[i] * 0.1), 1);
    const { audio, releve } = apparierSurReference(etroite, large,
      { spectre: false, niveau: false, crete: false });
    expect(releve.largeurApres / largeurStereo(large)).toBeCloseTo(1, 1);
    expect(largeurStereo(audio)).toBeGreaterThan(releve.largeurAvant);
  });

  it("et une cible MONO ne s'élargit pas, ce qui est dit plutôt que feint", () => {
    const mono = new AudioBuffer({ numberOfChannels: 2, length: N, sampleRate: SR });
    const source = bruit(1, 0.2).getChannelData(0);
    mono.copyToChannel(source, 0);
    mono.copyToChannel(source, 1);
    const { releve } = apparierSurReference(mono, bruit(2, 0.2),
      { spectre: false, niveau: false, crete: false });
    expect(releve.largeurAvant).toBeLessThan(1e-6);
    expect(releve.largeurApres).toBeLessThan(1e-6);
  });

  it("DONNE À LA CIBLE LA CRÊTE DE LA RÉFÉRENCE", () => {
    const { audio } = apparierSurReference(bruit(2, 0.05), bruit(2, 0.30),
      { spectre: false, largeur: false });
    const creteRef = Math.max(...Array.from(bruit(2, 0.30).getChannelData(0), Math.abs));
    const creteSortie = Math.max(...Array.from(audio.getChannelData(0), Math.abs));
    expect(creteSortie / creteRef).toBeCloseTo(1, 1);
  });

  it("REFUSE DEUX FRÉQUENCES D'ÉCHANTILLONNAGE DIFFÉRENTES, en le disant", () => {
    const autre = new AudioBuffer({ numberOfChannels: 2, length: 1000, sampleRate: 44100 });
    expect(() => apparierSurReference(bruit(2), autre)).toThrow(/fréquence d'échantillonnage/);
  });

  it("le lissage en octaves élargit sa fenêtre avec la fréquence", () => {
    // Une seule case à dix décibels : lissée, elle s'étale d'autant plus qu'elle est haute.
    const etale = (indice: number) => {
      const brut = new Float64Array(2049);
      brut[indice] = 10;
      const lisse = lisserParOctave(brut, 3);
      return lisse.filter((v) => v > 0.01).length;
    };
    expect(etale(1000)).toBeGreaterThan(etale(100));
    expect(etale(100)).toBeGreaterThan(etale(10));
  });
});
