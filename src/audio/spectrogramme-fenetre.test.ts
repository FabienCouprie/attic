// audio/spectrogramme-fenetre.test.ts — Les trois synthèses par trames rendent, au bit près, ce que
// rendaient les trois copies qu'elles remplacent.
//
// LES TÉMOINS SONT LES ANCIENNES COPIES, recopiées telles quelles : celle de `pca-neuronale` (trame
// finale remplie, diviseur plafonné à un dixième du maximum), celle de `griffin-lim` (trame finale
// remplie, division dès que le poids est positif) et l'ancienne version de ce module (dernière trame
// entière, seuil absolu). Si l'une des options rendait un bit différent, un composant aurait changé
// de son sans qu'une empreinte le dise forcément : ce cas le dirait.
import { describe, expect, it } from "vitest";
import { fft } from "./fft";
import { creerFenetreHann } from "./commun";
import {
  analyserSpectrogramme, synthetiserSpectrogramme, type FrameSpectrale,
} from "./spectrogramme-fenetre";

type Trame = { start: number; mag: Float64Array; phase: Float64Array };

/** L'analyse de `pca-neuronale` et de `griffin-lim`, qui remplissent la dernière trame. */
function analyseRemplie(signal: Float32Array, fftSize: number, hop: number, fenetre: Float64Array): Trame[] {
  const nbBins = Math.floor(fftSize / 2) + 1;
  const frames: Trame[] = [];
  for (let start = 0; start < signal.length; start += hop) {
    const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) { const idx = start + i; if (idx < signal.length) re[i] = signal[idx] * fenetre[i]; }
    fft(re, im, false);
    const mag = new Float64Array(nbBins), phase = new Float64Array(nbBins);
    for (let k = 0; k < nbBins; k++) { mag[k] = Math.hypot(re[k], im[k]); phase[k] = Math.atan2(im[k], re[k]); }
    frames.push({ start, mag, phase });
  }
  return frames;
}

/** L'ancienne analyse de ce module : dernière trame entière seulement. */
function analyseEntiere(signal: Float32Array, fftSize: number, hop: number, fenetre: Float64Array): Trame[] {
  const nbBins = Math.floor(fftSize / 2) + 1;
  const frames: Trame[] = [];
  for (let start = 0; start + fftSize <= signal.length; start += hop) {
    const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) re[i] = signal[start + i] * fenetre[i];
    fft(re, im, false);
    const mag = new Float64Array(nbBins), phase = new Float64Array(nbBins);
    for (let k = 0; k < nbBins; k++) { mag[k] = Math.hypot(re[k], im[k]); phase[k] = Math.atan2(im[k], re[k]); }
    frames.push({ start, mag, phase });
  }
  return frames;
}

/** Le recollement commun aux trois copies, puis la normalisation propre à chacune. */
function recoller(frames: Trame[], fftSize: number, fenetre: Float64Array, length: number): [Float64Array, Float64Array] {
  const out = new Float64Array(length), norm = new Float64Array(length);
  const nbBins = Math.floor(fftSize / 2) + 1;
  for (const frame of frames) {
    const re = new Float64Array(fftSize), im = new Float64Array(fftSize);
    for (let k = 0; k < nbBins; k++) {
      const mag = frame.mag[k], phase = frame.phase[k];
      re[k] = mag * Math.cos(phase); im[k] = mag * Math.sin(phase);
      if (k > 0 && k < nbBins - 1) { re[fftSize - k] = re[k]; im[fftSize - k] = -im[k]; }
    }
    if (fftSize % 2 === 0) im[nbBins - 1] = 0;
    fft(re, im, true);
    for (let i = 0; i < fftSize; i++) {
      const idx = frame.start + i;
      if (idx < length) { out[idx] += re[i] * fenetre[i]; norm[idx] += fenetre[i] * fenetre[i]; }
    }
  }
  return [out, norm];
}
function synthesePca(frames: Trame[], fftSize: number, fenetre: Float64Array, length: number): Float64Array {
  const [out, norm] = recoller(frames, fftSize, fenetre, length);
  let normMax = 0;
  for (let i = 0; i < length; i++) normMax = Math.max(normMax, norm[i]);
  const plancher = 0.1 * normMax;
  for (let i = 0; i < length; i++) if (norm[i] > 0) out[i] /= Math.max(norm[i], plancher);
  return out;
}
function syntheseGriffinLim(frames: Trame[], fftSize: number, fenetre: Float64Array, length: number): Float64Array {
  const [out, norm] = recoller(frames, fftSize, fenetre, length);
  for (let i = 0; i < length; i++) out[i] = norm[i] > 0 ? out[i] / norm[i] : 0;
  return out;
}
function syntheseSeuil(frames: Trame[], fftSize: number, fenetre: Float64Array, length: number): Float64Array {
  const [out, norm] = recoller(frames, fftSize, fenetre, length);
  for (let i = 0; i < length; i++) { if (norm[i] > 1e-6) out[i] /= norm[i]; else out[i] = 0; }
  return out;
}

/** Un signal qui n'est pas un multiple du saut, pour que la dernière trame déborde vraiment. */
function signal(n = 3001): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.031) * 0.6 + Math.sin(i * i * 1e-4) * 0.3 + ((i * 7919) % 97) / 970 - 0.05;
  return x;
}

/** Les spectres déformés qu'un réseau rendrait : le module d'une trame remplacé par celui d'une autre. */
function deformer(frames: FrameSpectrale[]): FrameSpectrale[] {
  return frames.map((f, i) => ({ ...f, mag: frames[(i * 7 + 3) % frames.length].mag }));
}

describe("analyse et synthèse par trames : les trois copies, au bit près", () => {
  const fftSize = 256, hop = 64;
  const fenetre = creerFenetreHann(fftSize);
  const x = signal();

  it("sans option, l'analyse s'arrête à la dernière trame entière et la synthèse coupe sous 1e-6", () => {
    const sp = analyserSpectrogramme(x, fftSize, hop, fenetre);
    expect(sp.frames).toEqual(analyseEntiere(x, fftSize, hop, fenetre));
    const trames = deformer(sp.frames);
    expect(synthetiserSpectrogramme(trames, fftSize, hop, fenetre, x.length)).toEqual(syntheseSeuil(trames, fftSize, fenetre, x.length));
  });

  it("remplirFin et plancherRelatif rendent ce que rendait pca-neuronale", () => {
    const sp = analyserSpectrogramme(x, fftSize, hop, fenetre, { remplirFin: true });
    const temoin = analyseRemplie(x, fftSize, hop, fenetre);
    expect(sp.frames.length).toBeGreaterThan(analyseEntiere(x, fftSize, hop, fenetre).length);
    expect(sp.frames).toEqual(temoin);
    const trames = deformer(sp.frames);
    expect(synthetiserSpectrogramme(trames, fftSize, hop, fenetre, x.length, { normalisation: { plancherRelatif: 0.1 } }))
      .toEqual(synthesePca(trames, fftSize, fenetre, x.length));
  });

  it("remplirFin et seuil zéro rendent ce que rendait griffin-lim", () => {
    const sp = analyserSpectrogramme(x, fftSize, hop, fenetre, { remplirFin: true });
    const trames = deformer(sp.frames);
    expect(synthetiserSpectrogramme(trames, fftSize, hop, fenetre, x.length, { normalisation: { seuil: 0 } }))
      .toEqual(syntheseGriffinLim(trames, fftSize, fenetre, x.length));
  });

  it("les trois normalisations diffèrent entre elles sur ce signal, ce qui justifie l'option", () => {
    const trames = deformer(analyserSpectrogramme(x, fftSize, hop, fenetre, { remplirFin: true }).frames);
    const a = synthetiserSpectrogramme(trames, fftSize, hop, fenetre, x.length, { normalisation: { plancherRelatif: 0.1 } });
    const b = synthetiserSpectrogramme(trames, fftSize, hop, fenetre, x.length, { normalisation: { seuil: 0 } });
    expect(a).not.toEqual(b);
  });
});
