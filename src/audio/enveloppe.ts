// audio/enveloppe.ts — Enveloppe ADSR appliquée à tout un clip (one-shot).
// A/D/R sont des durées (ms), S un niveau (%). Sur un clip de durée D :
// attaque 0→1, déclin 1→S, maintien à S, puis relâchement S→0 sur les R
// dernières millisecondes. Robuste aux clips courts (points d'ancrage bornés).

export function appliquerADSR(
  buffer: AudioBuffer,
  attaqueMs: number, declinMs: number, maintienPct: number, relachementMs: number,
): AudioBuffer {
  const sr = buffer.sampleRate, len = buffer.length, D = len / sr;
  const A = Math.max(0, attaqueMs / 1000);
  const De = Math.max(0, declinMs / 1000);
  const S = Math.max(0, Math.min(1, maintienPct / 100));
  const R = Math.max(0, relachementMs / 1000);

  // Points d'ancrage (temps, niveau), bornés à [0,D] et non décroissants en temps.
  const x1 = Math.min(A, D);
  const x2 = Math.min(A + De, D);
  const relStart = Math.max(0, D - R);
  const x3 = Math.min(D, Math.max(x2, relStart));
  const pts: [number, number][] = [[0, 0], [x1, 1], [x2, S], [x3, S], [D, 0]];

  const gainAt = (t: number): number => {
    for (let i = 1; i < pts.length; i++) {
      const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
      if (t <= t1) { if (t1 <= t0) return v1; return v0 + (v1 - v0) * ((t - t0) / (t1 - t0)); }
    }
    return 0;
  };

  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c), dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[i] * gainAt(i / sr);
  }
  return out;
}
