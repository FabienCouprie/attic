// audio/effets-grains.ts — Les etirements par grains, et la repetition de mesure.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { valeurA } from "./courbe";
import { fft } from "./fft";
import { normaliser } from "./effets-dynamique";
import { tailleFenetreSuivante } from "./effets-temporel";

/**
 * Paulstretch, dont le facteur d'étirement peut varier au fil du son.
 *
 * L'ÉTIREMENT EST UN PAS DE LECTURE, et c'est ce qui rend sa modulation possible. La sortie avance
 * d'une demi-fenêtre par trame, toujours ; ce qui change avec le facteur, c'est de combien la
 * LECTURE avance dans la source pendant ce temps. Étirer huit fois, c'est n'avancer que d'un
 * huitième de demi-fenêtre. Un facteur qui varie ne demande donc rien de plus qu'un pas recalculé à
 * chaque trame.
 *
 * LA COURBE SE LIT SUR LA SOURCE ET NON SUR LA SORTIE, et c'est le seul sens qui se tienne. La
 * longueur de sortie est la SOMME des pas, donc inconnue tant qu'on n'a pas parcouru la courbe :
 * la lire sur la sortie demanderait de connaître d'avance ce qu'on cherche à calculer. Lue sur la
 * source, elle dit « ce moment-ci du son est étiré tant », ce qui est aussi ce qu'on veut dire.
 *
 * ET LE NOMBRE DE TRAMES SE COMPTE D'ABORD, À VIDE. Le pas changeant à chaque trame, la longueur
 * n'est plus une division mais une somme, et il faut l'avoir avant d'allouer la sortie. Le compte
 * parcourt exactement la même récurrence que la boucle de calcul, sans quoi les deux divergeraient
 * d'une trame sur un arrondi.
 */
export async function appliquerPaulstretch(
  buffer: AudioBuffer,
  stretch: number | Float32Array,
  windowSizeSeconds: number,
  options: { onProgress?: (msg: string) => void; signal?: AbortSignal; hasard?: () => number } = {}
): Promise<AudioBuffer> {
  const { onProgress, signal } = options;
  const hasard = options.hasard ?? Math.random;
  const sr = buffer.sampleRate;
  const nCh = buffer.numberOfChannels;
  const len = buffer.length;
  let windowSize = Math.max(16, Math.round(windowSizeSeconds * sr));
  windowSize = Math.floor(windowSize / 2) * 2;
  windowSize = tailleFenetreSuivante(windowSize);
  const half = windowSize / 2;
  // Le pas de lecture à la position `p` de la source. Un facteur sous un n'existe pas : Paulstretch
  // étire, il ne comprime pas, et le pas dépasserait la demi-fenêtre.
  const pasEn = (p: number) =>
    half / Math.max(1, valeurA(stretch, Math.min(len - 1, Math.max(0, Math.floor(p)))));

  // Fondu de sortie sur les 50 derniers ms pour éviter un coup de queue abrupt.
  const fadeEnd = Math.min(len, Math.max(16, Math.round(0.05 * sr)));

  let outputFrames = 0;
  for (let p = 0; p < len; p += pasEn(p)) outputFrames++;
  outputFrames = Math.max(1, outputFrames);
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

      startPos += pasEn(startPos);
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

// --- Granular freeze : boucle de grains avec contrôle de taille et hauteur ----
// Extrait un grain à la position choisie et le répète sur toute la durée. Le
// pitch décale la vitesse de lecture dans le grain (pas de conservation de la
// durée originale). Le mix permet de doser l'effet avec le signal original.

export function granularFreeze(
  buffer: AudioBuffer,
  grainSizeMs: number,
  pitch: number,
  position: number,
  // LE MÉLANGE PEUT VARIER AU FIL DU SON. `valeurA` rend un scalaire tel quel : il n'y a donc pas
  // deux chemins de calcul, un « modulé » et un « ordinaire », qui pourraient diverger un jour.
  mix: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const grainSize = Math.max(1, Math.round(grainSizeMs / 1000 * sr));
  const start = Math.floor(position * Math.max(0, buffer.length - grainSize));
  const ratio = Math.pow(2, pitch / 12);

  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let phase = 0;
    for (let i = 0; i < buffer.length; i++) {
      const idx = start + (Math.floor(phase) % grainSize);
      const wet = src[idx];
      const m = valeurA(mix, i) / 100;
      dst[i] = src[i] * (1 - m) + wet * m;
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
  mix: number | Float32Array,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
  const beatDuration = 60 / Math.max(1, bpm);
  const intervalSamples = Math.max(1, Math.round(beatDuration * 4 / intervalDiv * sr));
  const segmentSamples = Math.max(1, Math.round(beatDuration * 4 / segmentDiv * sr));
  const maxRepeatSamples = Math.min(intervalSamples, Math.max(1, repetitions * segmentSamples));
  const decay = Math.max(0, Math.min(1, feedback / 100));
  // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
  const mixA = (i: number) => Math.max(0, Math.min(1, valeurA(mix, i) / 100));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const mixWet = mixA(i);
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


