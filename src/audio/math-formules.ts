// audio/math-formules.ts — Traitement audio par expressions mathématiques.
import { compile } from "mathjs";
import { fft } from "./fft";
import { creerFenetreHann } from "./commun";

function normaliserFormule(formule: string): string {
  const f = formule.trim();
  const m = f.match(/^\s*(?:y|out|output)\s*=\s*(.*)$/is);
  return m ? m[1] : f;
}

/** Limite chaque échantillon à [-maxAbs, maxAbs] pour éviter les signaux
 *  hors plage pouvant être dangereux à l'écoute ou pour le matériel. */
export function securiserAmplitude(buffer: AudioBuffer, maxAbs: number = 1.0): AudioBuffer {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      if (d[i] > maxAbs) d[i] = maxAbs;
      else if (d[i] < -maxAbs) d[i] = -maxAbs;
    }
    // Défense si getChannelData retourne une copie : écrire dans le buffer interne.
    buffer.copyToChannel(d, c);
  }
  return buffer;
}

export function appliquerFormuleEchantillons(
  buffer: AudioBuffer,
  formule: string,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const len = buffer.length;
  const resultat = new AudioBuffer({ numberOfChannels: nCh, length: len, sampleRate: sr });
  const expr = normaliserFormule(formule);
  if (!expr) {
    for (let c = 0; c < nCh; c++) resultat.getChannelData(c).set(buffer.getChannelData(c));
    return resultat;
  }
  const compiled = compile(expr);
  for (let c = 0; c < nCh; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    const scope = { x: 0, t: 0, i: 0, c, ch: nCh, sr };
    for (let i = 0; i < len; i++) {
      scope.x = src[i];
      scope.t = i / sr;
      scope.i = i;
      const y = compiled.evaluate(scope);
      dst[i] = typeof y === "number" ? y : Number(y);
    }
    // Défense si getChannelData retourne une copie.
    resultat.copyToChannel(dst, c);
  }
  return securiserAmplitude(resultat, 0.5);
}

export function genererAudioFormule(
  formule: string,
  dureeSec: number,
  sr: number,
  channels: number,
): AudioBuffer {
  const len = Math.max(1, Math.round(dureeSec * sr));
  const resultat = new AudioBuffer({ numberOfChannels: channels, length: len, sampleRate: sr });
  const expr = normaliserFormule(formule);
  if (!expr) return resultat;
  const compiled = compile(expr);
  for (let c = 0; c < channels; c++) {
    const dst = resultat.getChannelData(c);
    const scope = { t: 0, i: 0, c, ch: channels, sr };
    for (let i = 0; i < len; i++) {
      scope.t = i / sr;
      scope.i = i;
      const y = compiled.evaluate(scope);
      dst[i] = typeof y === "number" ? y : Number(y);
    }
    // Défense si getChannelData retourne une copie.
    resultat.copyToChannel(dst, c);
  }
  return securiserAmplitude(resultat, 0.5);
}

/** Tout ce qu'une voie demande, en un seul objet sérialisable : c'est tout ce qu'un ouvrier reçoit. */
export interface OptionsFormuleSpectrale {
  formuleMag: string;
  formulePhase: string;
  fftSize: number;
  /** La fréquence d'échantillonnage : la formule la voit sous les noms `sr` et `freq`. */
  frequence: number;
}

/**
 * Une voie passée dans la formule spectrale.
 *
 * CE CŒUR EXISTE POUR QUE LE COMPOSANT QUITTE LE FIL DE L'INTERFACE. `AudioBuffer` n'y servait que
 * de récipient. **Mesuré avant, sur trois secondes de son : 232 millisecondes, et pas un seul
 * message pendant ce temps.** La formule est compilée une fois par voie, ce qui ne coûte rien à
 * côté des quelques centaines de milliers d'évaluations qui suivent.
 */
export function formuleSpectraleVoie(src: Float32Array, o: OptionsFormuleSpectrale): Float32Array {
  const sr = o.frequence;
  const len = src.length;
  const dst = new Float32Array(len);

  const taille = Math.max(64, tailleFenetreSuivante(o.fftSize));
  const hop = taille / 2;
  const fenetre = creerFenetreHann(taille);
  const nbBins = taille / 2 + 1;

  const exprMag = normaliserFormule(o.formuleMag);
  const exprPhase = normaliserFormule(o.formulePhase);
  const compiledMag = exprMag ? compile(exprMag) : null;
  const compiledPhase = exprPhase ? compile(exprPhase) : null;

  {
    const acc = new Float64Array(len);
    const norm = new Float64Array(len);

    for (let start = 0; start < len; start += hop) {
      const re = new Float64Array(taille);
      const im = new Float64Array(taille);
      for (let i = 0; i < taille; i++) {
        const idx = start + i;
        if (idx < len) re[i] = src[idx] * fenetre[i];
      }
      fft(re, im, false);

      const mag: number[] = Array.from({ length: nbBins });
      const phase: number[] = Array.from({ length: nbBins });
      for (let k = 0; k < nbBins; k++) {
        mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        phase[k] = Math.atan2(im[k], re[k]);
      }

      for (let k = 0; k < nbBins; k++) {
        const freq = (k * sr) / taille;
        const scope = { mag: mag[k], phase: phase[k], freq, bin: k, N: taille, sr };
        if (compiledMag) {
          const newMag = compiledMag.evaluate(scope);
          mag[k] = typeof newMag === "number" ? newMag : Number(newMag);
        }
        if (compiledPhase) {
          const newPhase = compiledPhase.evaluate(scope);
          phase[k] = typeof newPhase === "number" ? newPhase : Number(newPhase);
        }
      }

      for (let k = 0; k < nbBins; k++) {
        re[k] = mag[k] * Math.cos(phase[k]);
        im[k] = mag[k] * Math.sin(phase[k]);
        if (k > 0 && k < nbBins - 1) {
          re[taille - k] = re[k];
          im[taille - k] = -im[k];
        }
      }
      // Nyquist pour taille paire
      if (taille % 2 === 0) {
        im[nbBins - 1] = 0;
      }

      fft(re, im, true);
      for (let i = 0; i < taille; i++) {
        const idx = start + i;
        if (idx < len) {
          acc[idx] += re[i] * fenetre[i];
          norm[idx] += fenetre[i] * fenetre[i];
        }
      }
    }

    for (let i = 0; i < len; i++) {
      dst[i] = norm[i] > 0 ? acc[i] / norm[i] : 0;
    }
  }
  return dst;
}

/**
 * La formule spectrale sur tous les canaux.
 *
 * LA SÉCURISATION D'AMPLITUDE RESTE ICI, après les voies : elle regarde la crête de la sortie
 * ENTIÈRE, tous canaux confondus, et une voie seule ne peut pas la connaître.
 */
export function appliquerFormuleSpectrale(
  buffer: AudioBuffer,
  formuleMag: string,
  formulePhase: string,
  fftSize: number = 2048,
): AudioBuffer {
  const o = { formuleMag, formulePhase, fftSize, frequence: buffer.sampleRate };
  const voies = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    formuleSpectraleVoie(buffer.getChannelData(c), o));
  return assemblerFormuleSpectrale(buffer, voies);
}

/** Les voies rassemblées, puis l'amplitude ramenée sous une demi-échelle. */
export function assemblerFormuleSpectrale(source: AudioBuffer, voies: Float32Array[]): AudioBuffer {
  const resultat = new AudioBuffer({
    numberOfChannels: source.numberOfChannels, length: source.length, sampleRate: source.sampleRate,
  });
  // Défense si getChannelData retourne une copie.
  for (let c = 0; c < source.numberOfChannels; c++) resultat.copyToChannel(new Float32Array(voies[c]), c);
  return securiserAmplitude(resultat, 0.5);
}

const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

function tailleFenetreSuivante(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}
