// audio/effets-grains.ts — Les etirements par grains, et la repetition de mesure.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { fft } from "./fft";
import { normaliser } from "./effets-dynamique";
import { tailleFenetreSuivante } from "./effets-temporel";

export async function appliquerPaulstretch(
  buffer: AudioBuffer,
  stretch: number,
  windowSizeSeconds: number,
  options: { onProgress?: (msg: string) => void; signal?: AbortSignal; hasard?: () => number } = {}
): Promise<AudioBuffer> {
  const { onProgress, signal } = options;
  const hasard = options.hasard ?? Math.random;
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const len = buffer.length;
  const stretchFactor = Math.max(1, stretch);
  let windowSize = Math.max(16, Math.round(windowSizeSeconds * sr));
  windowSize = Math.floor(windowSize / 2) * 2;
  windowSize = tailleFenetreSuivante(windowSize);
  const half = windowSize / 2;
  const displace = half / stretchFactor;

  // Fondu de sortie sur les 50 derniers ms pour éviter un coup de queue abrupt.
  const fadeEnd = Math.min(len, Math.max(16, Math.round(0.05 * sr)));

  const outputFrames = Math.max(1, Math.ceil(len / displace));
  const outputLength = outputFrames * half;
  const resultat = new AudioBuffer({ numberOfChannels: nCh, length: outputLength, sampleRate: sr });

  // Fenêtre type "pow" utilisée par paulstretch_stereo.py.
  const fenetre = new Float64Array(windowSize);
  for (let i = 0; i < windowSize; i++) {
    const x = (2 * i) / (windowSize - 1) - 1;
    fenetre[i] = Math.pow(1 - x * x, 1.25);
  }

  const totalFrames = outputFrames * nCh;
  const reportInterval = Math.max(1, Math.floor(totalFrames / 20));

  for (let c = 0; c < nCh; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    const srcCopy = new Float32Array(src);
    for (let i = 0; i < fadeEnd; i++) {
      srcCopy[len - fadeEnd + i] *= (fadeEnd - i) / fadeEnd;
    }

    const oldBuf = new Float64Array(windowSize);
    let startPos = 0;
    let frame = 0;

    while (startPos < len) {
      if (signal?.aborted) throw new Error("aborted");

      const istart = Math.floor(startPos);
      const buf = new Float64Array(windowSize);
      for (let i = 0; i < windowSize; i++) {
        const idx = istart + i;
        if (idx < len) buf[i] = srcCopy[idx] * fenetre[i];
      }

      const re = buf;
      const im = new Float64Array(windowSize);
      fft(re, im, false);

      // Randomisation des phases tout en conservant la symétrie hermitienne
      // (sinon la sortie n'est pas réelle).
      const mags: number[] = Array.from({ length: half + 1 }, (_, k) => Math.sqrt(re[k] * re[k] + im[k] * im[k]));
      re[0] = mags[0];
      im[0] = 0;
      re[half] = mags[half] * (hasard() > 0.5 ? 1 : -1);
      im[half] = 0;
      for (let k = 1; k < half; k++) {
        const theta = hasard() * 2 * Math.PI;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const mag = mags[k];
        re[k] = mag * cos;
        im[k] = mag * sin;
        re[windowSize - k] = mag * cos;
        im[windowSize - k] = -mag * sin;
      }

      fft(re, im, true);
      for (let i = 0; i < windowSize; i++) {
        re[i] *= fenetre[i];
      }

      const offset = frame * half;
      for (let i = 0; i < half && offset + i < outputLength; i++) {
        dst[offset + i] = re[i] + oldBuf[half + i];
      }
      oldBuf.set(re);

      startPos += displace;
      frame++;
      const frameIndex = c * outputFrames + frame;
      if (frameIndex % reportInterval === 0) {
        const pct = Math.min(100, Math.round((frameIndex / totalFrames) * 100));
        onProgress?.(`Paulstretch · ${pct}%`);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  onProgress?.("Paulstretch · 100%");
  // Normalisation douce pour éviter les dépassements sans monter artificiellement le bruit.
  return normaliser(resultat, -3);
}

// Paulstretch logistique : l'étirement extrême s'installe progressivement selon
// une courbe logistique. En début de piste le signal est intact, en fin de piste
// il atteint le facteur d'étirement maximal.
export async function paulstretchLogistique(
  buffer: AudioBuffer,
  stretch: number,
  windowSizeSeconds: number,
  centre: number,
  pente: number,
  mix: number,
  options: { onProgress?: (msg: string) => void; signal?: AbortSignal; hasard?: () => number } = {}
): Promise<AudioBuffer> {
  const { onProgress, signal } = options;
  const sr = buffer.sampleRate;
  const maxStretch = Math.max(1, stretch);
  const mixWet = Math.max(0, Math.min(1, mix / 100));
  if (mixWet <= 0 || maxStretch <= 1) return buffer;
  const stretched = await appliquerPaulstretch(buffer, maxStretch, windowSizeSeconds, { onProgress, signal, hasard: options.hasard });
  const n = stretched.length;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: n, sampleRate: sr });
  const centreRel = Math.max(0, Math.min(1, centre / 100));
  const k = Math.max(0.1, pente);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    if (signal?.aborted) throw new Error("aborted");
    const src = buffer.getChannelData(c);
    const wet = stretched.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const p = 1 / (1 + Math.exp(-k * (t - centreRel)));
      const dry = i < src.length ? src[i] : 0;
      const wetScaled = dry * (1 - p) + wet[i] * p;
      dst[i] = dry * (1 - mixWet) + wetScaled * mixWet;
    }
  }
  return resultat;
}

// --- Granular freeze : boucle de grains avec contrôle de taille et hauteur ----
// Extrait un grain à la position choisie et le répète sur toute la durée. Le
// pitch décale la vitesse de lecture dans le grain (pas de conservation de la
// durée originale). Le mix permet de doser l'effet avec le signal original.

export function granularFreeze(
  buffer: AudioBuffer,
  grainSizeMs: number,
  pitch: number,
  position: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const grainSize = Math.max(1, Math.round(grainSizeMs / 1000 * sr));
  const start = Math.floor(position * Math.max(0, buffer.length - grainSize));
  const ratio = Math.pow(2, pitch / 12);
  const mixVal = mix / 100;

  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let phase = 0;
    for (let i = 0; i < buffer.length; i++) {
      const idx = start + (Math.floor(phase) % grainSize);
      const wet = src[idx];
      dst[i] = src[i] * (1 - mixVal) + wet * mixVal;
      phase += ratio;
      while (phase >= grainSize) phase -= grainSize;
    }
  }
  return resultat;
}

// Beat repeat / stutter : capture un court segment à intervalles réguliers
// synchronisés sur le tempo et le répète un nombre de fois avec décroissance.
// Parfait pour les effets stutter, glitch et répétitions rythmiques.
export function beatRepeat(
  buffer: AudioBuffer,
  bpm: number,
  intervalDiv: number,
  segmentDiv: number,
  repetitions: number,
  feedback: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
  const beatDuration = 60 / Math.max(1, bpm);
  const intervalSamples = Math.max(1, Math.round(beatDuration * 4 / intervalDiv * sr));
  const segmentSamples = Math.max(1, Math.round(beatDuration * 4 / segmentDiv * sr));
  const maxRepeatSamples = Math.min(intervalSamples, Math.max(1, repetitions * segmentSamples));
  const decay = Math.max(0, Math.min(1, feedback / 100));
  const mixWet = Math.max(0, Math.min(1, mix / 100));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const posInInterval = i % intervalSamples;
      const intervalStart = i - posInInterval;
      let out: number;
      if (posInInterval < maxRepeatSamples) {
        const repeatIndex = Math.floor(posInInterval / segmentSamples);
        const segPos = posInInterval % segmentSamples;
        const srcIdx = Math.min(len - 1, Math.max(0, intervalStart + segPos));
        const gain = Math.pow(decay, repeatIndex);
        const wet = src[srcIdx] * gain;
        out = src[i] * (1 - mixWet) + wet * mixWet;
      } else {
        out = src[i] * (1 - mixWet) + src[i] * mixWet;
      }
      dst[i] = out;
    }
  }
  return resultat;
}


