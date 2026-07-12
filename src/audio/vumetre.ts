// audio/vumetre.ts — Mesures de niveau audio : RMS, peak, LUFS (ITBS-R 128),
// crest factor, plage dynamique. Calculs en domaines temporel et fréquentiel
// (poids K pour LUFS).

export interface MesuresNiveau {
  rmsDb: number;        // RMS moyen en dBFS
  peakDb: number;       // crête (peak) en dBFS
  lufs: number;         // loudness intégrée en LUFS (poids K)
  lufsMax: number;      // loudness maximale momentanée (400 ms)
  lufsMin: number;      // loudness minimale momentanée
  crestFactorDb: number; // différence peak - RMS (facteur de crête)
  plageDynamiqueDb: number; // différence LRA (loudness range approximation)
  vraiPicDb: number;    // true peak (interpolé 4×) en dBTP
}

// Filtre "K-weighting" pour LUFS : filtre high-shelf + high-pass (simulation ITU-R BS.1770).
// On utilise une approximation par biquads en temps discret.
function prefilterK(samples: Float32Array, sr: number): Float32Array {
  // Stage 1: high-shelf (+4 dB) ~ 1500 Hz
  const f1 = 1500, g1 = 4;
  const a1 = Math.pow(10, g1 / 40);
  const w1 = 2 * Math.PI * f1 / sr;
  const tan1 = Math.sin(w1) / (2 * a1);
  const b10 = (1 + a1 * tan1) / (1 + tan1);
  const b11 = -2 * Math.cos(w1) / (1 + tan1);
  const b12 = (1 - a1 * tan1) / (1 + tan1);
  const a10 = 1, a11 = b11, a12 = (1 - tan1) / (1 + tan1);

  // Stage 2: high-pass ~ 38 Hz
  const f2 = 38;
  const w2 = 2 * Math.PI * f2 / sr;
  const tan2 = Math.sin(w2) / (2 * 0.5);
  const b20 = 1 / (1 + tan2);
  const b21 = -2 * b20;
  const b22 = b20;
  const a20 = 1, a21 = -2 * Math.cos(w2) / (1 + tan2), a22 = (1 - tan2) / (1 + tan2);

  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // stage 1
  let x3 = 0, x4 = 0, y3 = 0, y4 = 0; // stage 2
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    // Stage 1
    const s1 = b10 * x + b11 * x1 + b12 * x2 - a11 * y1 - a12 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = s1;
    // Stage 2
    const s2 = b20 * s1 + b21 * x3 + b22 * x4 - a21 * y3 - a22 * y4;
    x4 = x3; x3 = s1; y4 = y3; y3 = s2;
    out[i] = s2;
  }
  return out;
}

export function mesurerNiveau(buffer: AudioBuffer): MesuresNiveau {
  const sr = buffer.sampleRate;
  const nch = buffer.numberOfChannels;
  const length = buffer.length;

  // Mix to mono for RMS/peak, but compute LUFS with channel weights
  let sumSq = 0;
  let peak = 0;
  const mono = new Float32Array(length);
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += d[i] / nch;
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sumSq += d[i] * d[i];
    }
  }
  const rms = Math.sqrt(sumSq / (length * nch));
  const rmsDb = rms > 1e-9 ? 20 * Math.log10(rms) : -120;
  const peakDb = peak > 1e-9 ? 20 * Math.log10(peak) : -120;
  const crestFactorDb = peakDb - rmsDb;

  // LUFS: K-weighted mean square, 400 ms blocks (momentary), 3 s (short-term)
  // Integrated = average over whole signal
  let lufsSum = 0;
  let lufsCount = 0;
  let lufsMax = -120;
  let lufsMin = 0;

  const blockSize = Math.floor(0.4 * sr); // 400 ms momentary
  const hop = blockSize;

  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    const filtered = prefilterK(d, sr);
    const channelWeight = c === 0 ? 1.0 : 1.0; // equal weight (simplified, no 1.41 for surround)
    for (let start = 0; start + blockSize <= length; start += hop) {
      let blockSum = 0;
      for (let i = 0; i < blockSize; i++) blockSum += filtered[start + i] * filtered[start + i];
      const meanSq = blockSum / blockSize * channelWeight;
      const blockLufs = meanSq > 1e-12 ? -0.691 + 10 * Math.log10(meanSq) : -120;
      if (c === 0) {
        lufsSum += blockLufs;
        lufsCount++;
        if (blockLufs > lufsMax) lufsMax = blockLufs;
        if (lufsMin === 0 || blockLufs < lufsMin) lufsMin = blockLufs;
      }
    }
  }

  const lufs = lufsCount > 0 ? lufsSum / lufsCount : -120;
  const plageDynamiqueDb = lufsMax - lufsMin;

  // True peak: 4× interpolation linéaire
  let vraiPic = 0;
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < length - 1; i++) {
      for (let j = 0; j < 4; j++) {
        const frac = j / 4;
        const v = Math.abs(d[i] * (1 - frac) + d[i + 1] * frac);
        if (v > vraiPic) vraiPic = v;
      }
    }
  }
  const vraiPicDb = vraiPic > 1e-9 ? 20 * Math.log10(vraiPic) : -120;

  return {
    rmsDb,
    peakDb,
    lufs: Math.max(-120, lufs),
    lufsMax: Math.max(-120, lufsMax),
    lufsMin: Math.max(-120, lufsMin),
    crestFactorDb,
    plageDynamiqueDb: Math.max(0, plageDynamiqueDb),
    vraiPicDb,
  };
}
