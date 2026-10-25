// audio/empreinte-wav.test.ts — Relire un fichier dont on connait deja le contenu.
//
// CE QUE CES CAS EMPECHENT, ET C'EST LE PIRE DEFAUT QU'UN GARDE PUISSE AVOIR. Une empreinte sert a
// detecter un CHANGEMENT. Un analyseur qui ne lirait qu'une partie des donnees — les premieres
// trames, un seul canal, le mauvais morceau du fichier — rendrait un chiffre stable et INSENSIBLE :
// un faux vert parfait, qui ne tomberait jamais et ne prouverait rien. Il ne se voit qu'en relisant
// un fichier dont on connait deja le son.
//
// L'ENCODEUR EST CELUI DU DEPOT, `bufferVersWavBlob` : on encode un tampon connu, on le relit, et
// les chiffres doivent revenir. C'est un aller-retour, donc il eprouve les deux sens a la fois, et
// il eprouve les TROIS profondeurs que l'application exporte — dont les vingt-quatre bits, qui sont
// son defaut et que la plupart des lecteurs ecrits a la va-vite ne savent pas lire.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import { calculerCentroidSpectralMeyda } from "./analyse-descripteurs";
import { bufferVersWavBlob } from "./io";
import { empreinteWav, lireWav, tamponDepuisWav } from "./empreinte-wav";

const SR = 48000;

/** Un tampon dont on connait la crete et la valeur efficace d'avance. */
function sinus(hz: number, secondes = 0.5, gain = 0.5, canaux = 2): AudioBuffer {
  const n = Math.round(SR * secondes);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = gain * Math.sin((2 * Math.PI * hz * i) / SR);
  }
  return b;
}

const octetsDe = async (b: AudioBuffer, bits?: 16 | 24 | 32) =>
  await bufferVersWavBlob(b, undefined, false, bits ? { bits } : {}).arrayBuffer();

describe("relire un WAV ecrit par le depot", () => {
  for (const bits of [16, 24, 32] as const) {
    it(`A ${bits} BITS, la crete et la valeur efficace reviennent`, async () => {
      // Une sinusoide d'amplitude 0,5 : crete 0,5, valeur efficace 0,5/racine de deux.
      const m = lireWav(await octetsDe(sinus(440), bits));
      expect(m.bits).toBe(bits);
      expect(m.canaux).toBe(2);
      expect(m.taux).toBe(SR);
      expect(m.trames).toBe(Math.round(SR * 0.5));
      expect(m.crete).toBeCloseTo(0.5, 2);
      expect(m.rms).toBeCloseTo(0.5 / Math.SQRT2, 3);
    });
  }

  it("TOUTES LES TRAMES SONT LUES, et non les premieres seulement", async () => {
    // LE CAS QUI ATTRAPE UN LECTEUR PARESSEUX. Un son dont la seconde moitie est silencieuse a une
    // valeur efficace DIVISEE PAR RACINE DE DEUX par rapport a sa premiere moitie seule. Un
    // analyseur qui s'arreterait a mi-chemin rendrait le chiffre de la moitie pleine, qui est
    // parfaitement stable — et ne bougerait jamais si la queue changeait.
    const plein = sinus(440, 1.0);
    const moitie = sinus(440, 1.0);
    for (let c = 0; c < 2; c++) {
      const d = moitie.getChannelData(c);
      for (let i = d.length / 2; i < d.length; i++) d[i] = 0;
    }
    const a = lireWav(await octetsDe(plein, 24));
    const b = lireWav(await octetsDe(moitie, 24));
    expect(b.trames).toBe(a.trames);
    expect(b.crete).toBeCloseTo(a.crete, 3);
    expect(b.rms).toBeCloseTo(a.rms / Math.SQRT2, 3);
  });

  it("LES DEUX CANAUX COMPTENT, et non le gauche seul", async () => {
    // Un fichier dont le canal droit est muet a une valeur efficace divisee par racine de deux.
    const stereo = sinus(440, 0.5);
    const droiteMuette = sinus(440, 0.5);
    droiteMuette.getChannelData(1).fill(0);
    const a = lireWav(await octetsDe(stereo, 24));
    const b = lireWav(await octetsDe(droiteMuette, 24));
    expect(b.rms).toBeCloseTo(a.rms / Math.SQRT2, 3);
  });

  it("UN MORCEAU POSE AVANT LES DONNEES NE DECALE PAS LA LECTURE", async () => {
    // Attic embarque le graphe dans un morceau `LIST`/`INFO` qui precede `data`. Un lecteur qui
    // sauterait a quarante-quatre octets lirait ce graphe comme du son : les chiffres seraient
    // differents, et plausibles.
    const b = sinus(440, 0.5);
    const nu = lireWav(await bufferVersWavBlob(b).arrayBuffer());
    const avecGraphe = lireWav(await bufferVersWavBlob(b, JSON.stringify({ nodes: [], edges: [] })).arrayBuffer());
    expect(avecGraphe.trames).toBe(nu.trames);
    expect(avecGraphe.rms).toBeCloseTo(nu.rms, 9);
    expect(avecGraphe.crete).toBeCloseTo(nu.crete, 9);
  });

  it("L'EMPREINTE PORTE LES TRAMES, LES CANAUX ET LE TAUX, non le seul niveau", async () => {
    // Un rendu qui perdrait sa queue garderait a peu pres la meme valeur efficace : c'est pourquoi
    // la longueur en fait partie. Deux sons de meme niveau et de longueurs differentes doivent
    // porter deux empreintes differentes.
    const court = empreinteWav(await octetsDe(sinus(440, 0.5), 24));
    const long = empreinteWav(await octetsDe(sinus(440, 1.0), 24));
    expect(court).toMatch(/^\d\.\d{9}\/\d\.\d{9} · \d+ trames · 2ch · 48000 Hz$/);
    expect(court).not.toBe(long);
    expect(court.split(" · ")[0]).toBe(long.split(" · ")[0]);
  });

  it("LE TAMPON RELU EST LE TAMPON ECRIT, echantillon par echantillon", async () => {
    const avant = sinus(440, 0.2);
    const apres = tamponDepuisWav(await octetsDe(avant, 32));
    expect(apres.sampleRate).toBe(avant.sampleRate);
    expect(apres.numberOfChannels).toBe(avant.numberOfChannels);
    expect(apres.length).toBe(avant.length);
    // En trente-deux bits flottants rien n'est arrondi : l'aller-retour est exact.
    const a = avant.getChannelData(1), b = apres.getChannelData(1);
    let pire = 0;
    for (let i = 0; i < a.length; i++) pire = Math.max(pire, Math.abs(a[i] - b[i]));
    expect(pire).toBeLessThan(1e-7);
  });

  it("LES CANAUX NE SONT PAS ENTRELACES A L'ENVERS", async () => {
    // LE PIEGE : un WAV range ses echantillons G,D,G,D. Un lecteur qui prendrait les N premiers
    // pour le canal gauche rendrait un tampon plausible et faux — chaque canal serait le debut du
    // fichier joue deux fois plus vite. Deux canaux DIFFERENTS le disent, deux canaux identiques
    // ne le diraient pas.
    const b = new AudioBuffer({ numberOfChannels: 2, length: 2048, sampleRate: SR });
    const g = b.getChannelData(0), d = b.getChannelData(1);
    for (let i = 0; i < b.length; i++) { g[i] = 0.5; d[i] = -0.25; }
    const relu = tamponDepuisWav(await octetsDe(b, 32));
    expect(relu.getChannelData(0)[0]).toBeCloseTo(0.5, 6);
    expect(relu.getChannelData(1)[0]).toBeCloseTo(-0.25, 6);
    expect(relu.getChannelData(0)[2047]).toBeCloseTo(0.5, 6);
    expect(relu.getChannelData(1)[2047]).toBeCloseTo(-0.25, 6);
  });

  it("ET LE CENTROIDE RELU SUIT LA HAUTEUR, ce que la valeur efficace ne fait pas", async () => {
    // C'EST TOUTE LA RAISON DE CE TAMPON. Deux sinusoides a l'octave ont la MEME valeur efficace et
    // la MEME crete : une empreinte de niveau ne les distingue pas. Leur centroide, lui, double.
    const grave = tamponDepuisWav(await octetsDe(sinus(440, 1.0), 32));
    const aigu = tamponDepuisWav(await octetsDe(sinus(880, 1.0), 32));
    const mGrave = lireWav(await octetsDe(sinus(440, 1.0), 32));
    const mAigu = lireWav(await octetsDe(sinus(880, 1.0), 32));
    expect(mAigu.rms).toBeCloseTo(mGrave.rms, 3);
    expect(mAigu.crete).toBeCloseTo(mGrave.crete, 3);

    const cGrave = calculerCentroidSpectralMeyda(grave).valeur;
    const cAigu = calculerCentroidSpectralMeyda(aigu).valeur;
    expect(12 * Math.log2(cAigu / cGrave)).toBeGreaterThan(10);
  });

  it("UN FICHIER QUI N'EST PAS UN WAV se refuse au lieu de rendre un chiffre", async () => {
    const faux = new TextEncoder().encode("ceci n'est pas un fichier audio du tout").buffer;
    expect(() => lireWav(faux)).toThrow(/RIFF/);
  });
});
