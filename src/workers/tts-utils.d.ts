export declare function splitText(text: string, maxChars?: number): string[];
export declare function trimSilence(
  buffer: Float32Array,
  sampleRate: number,
  options?: { threshold?: number; leadingMs?: number; trailingMs?: number }
): Float32Array;
export declare function mergeAudioBuffers(
  buffers: Float32Array[],
  options?: { crossfadeMs?: number; sampleRate?: number }
): Float32Array | null;
