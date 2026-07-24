// audio/random-slice.ts — Découpe une piste en parts égales et les réarrange.

export type ModeDecoupe = "Random" | "Original" | "Reverse";

const MODES: ModeDecoupe[] = ["Random", "Original", "Reverse"];

export function listeModesDecoupe(): readonly ModeDecoupe[] {
  return MODES;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function ordreDecoupe(mode: string, count: number, rng: () => number): number[] {
  const base = Array.from({ length: count }, (_, i) => i);
  switch (mode) {
    case "Original":
      return base;
    case "Reverse":
      return base.reverse();
    case "Random":
    default:
      return shuffle(base, rng);
  }
}

/**
 * Découpe un buffer audio en `parts` tranches égales, les réarrange selon le
 * mode choisi (Random, Original, Reverse) et les recolle avec un court
 * crossfade aux joints pour éviter les clics.
 */
export function appliquerDecoupeAleatoire(
  buffer: AudioBuffer,
  parts: number,
  crossfadeMs: number,
  mode: string,
  seed: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const partsClamped = Math.max(2, Math.min(64, Math.round(parts)));
  const sliceLength = Math.floor(buffer.length / partsClamped);
  if (sliceLength <= 0 || partsClamped < 2) return buffer;

  const fadeSamples = Math.max(
    0,
    Math.min(
      Math.floor(sliceLength / 2),
      Math.round((crossfadeMs / 1000) * sr),
    ),
  );

  const totalLength =
    partsClamped * sliceLength - (partsClamped - 1) * fadeSamples;
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: totalLength,
    sampleRate: sr,
  });

  const rng = seed > 0 ? mulberry32(seed) : Math.random;
  const order = ordreDecoupe(mode, partsClamped, rng);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.fill(0);

    const slices: Float32Array[] = [];
    for (let i = 0; i < partsClamped; i++) {
      const start = i * sliceLength;
      const slice = new Float32Array(sliceLength);
      for (let j = 0; j < sliceLength; j++) slice[j] = src[start + j] ?? 0;
      slices.push(slice);
    }

    let outPos = 0;
    for (let s = 0; s < partsClamped; s++) {
      const slice = slices[order[s]];
      for (let i = 0; i < sliceLength; i++) {
        let sample = slice[i];
        if (fadeSamples > 0) {
          if (s > 0 && i < fadeSamples) {
            sample *= i / fadeSamples;
          }
          if (s < partsClamped - 1 && i >= sliceLength - fadeSamples) {
            sample *= (sliceLength - 1 - i) / fadeSamples;
          }
        }
        dst[outPos + i] += sample;
      }
      outPos += sliceLength - fadeSamples;
    }
  }

  return out;
}
