// audio/effets-spectral.ts — Effets (issus du découpage de effets.ts).
import { etirerDuree, reechantillonnerVers } from "./commun";

export function changerTempo(buffer: AudioBuffer, vitessePct: number): AudioBuffer {
  const facteur = 100 / Math.max(1, vitessePct);
  return etirerDuree(buffer, facteur);
}



export function changerTonalite(buffer: AudioBuffer, demiTons: number): AudioBuffer {
  const ratio = Math.pow(2, demiTons / 12);
  const etire = etirerDuree(buffer, ratio);
  return reechantillonnerVers(etire, ratio, buffer.length);
}



export async function equaliser(
  buffer: AudioBuffer,
  graveDb: number,
  mediumDb: number,
  aiguDb: number
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const grave = ctx.createBiquadFilter();
  grave.type = "lowshelf";
  grave.frequency.value = 200;
  grave.gain.value = graveDb;

  const medium = ctx.createBiquadFilter();
  medium.type = "peaking";
  medium.frequency.value = 2000;
  medium.Q.value = 1;
  medium.gain.value = mediumDb;

  const aigu = ctx.createBiquadFilter();
  aigu.type = "highshelf";
  aigu.frequency.value = 8000;
  aigu.gain.value = aiguDb;

  source.connect(grave);
  grave.connect(medium);
  medium.connect(aigu);
  aigu.connect(ctx.destination);

  source.start();
  return ctx.startRendering();
}



export async function appliquerDistorsion(entree: AudioBuffer, gain: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(entree.numberOfChannels, entree.length, entree.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = entree;
  const shaper = ctx.createWaveShaper();
  const n = 2048;
  const courbe = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    courbe[i] = Math.atan(gain * x) / Math.atan(gain);
  }
  shaper.curve = courbe;
  source.connect(shaper);
  shaper.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}



export async function appliquerFiltre(
  entree: AudioBuffer,
  type: BiquadFilterType,
  frequence: number,
  q: number
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(entree.numberOfChannels, entree.length, entree.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = entree;
  const filtre = ctx.createBiquadFilter();
  filtre.type = type;
  filtre.frequency.value = frequence;
  filtre.Q.value = q;
  source.connect(filtre);
  filtre.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

// Spatialisation stéréo : positionne le son dans l'espace (gauche/droite).
export async function spatialiserStereo(
  buffer: AudioBuffer,
  positionX: number,
  largeur: number,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const ctx = new OfflineAudioContext(2, buffer.length, sr);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const panner = ctx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 10000;
  panner.rolloffFactor = 0;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 0;
  panner.coneOuterGain = 0;

  if (panner.positionX) {
    panner.positionX.value = positionX * largeur * 5;
  } else {
    (panner as any).setPosition?.(positionX * largeur * 5, 0, -1);
  }
  if (panner.positionZ) {
    panner.positionZ.value = -1;
  }

  if (buffer.numberOfChannels === 1) {
    const stereo = ctx.createBuffer(2, buffer.length, sr);
    const mono = buffer.getChannelData(0);
    stereo.getChannelData(0).set(mono);
    stereo.getChannelData(1).set(mono);
    source.buffer = stereo;
  }

  source.connect(panner);
  panner.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

// Auto-pan : déplacement automatique du son entre gauche et droite.
export async function autoPan(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  const depth = profondeur / 100;

  for (let c = 0; c < 2; c++) {
    const src = buffer.numberOfChannels > c ? buffer.getChannelData(c) : buffer.getChannelData(0);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const lfo = Math.sin(2 * Math.PI * frequence * t);
      const gain = c === 0
        ? 1 - depth * (lfo + 1) / 2
        : 1 - depth * (1 - lfo) / 2;
      dst[i] = src[i] * gain;
    }
  }
  return resultat;
}

// Wah-wah : filtre passe-bande modulé par un LFO.
// La fréquence centrale oscille entre freqMin et freqMax à la fréquence du LFO.
export function wahwah(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  q: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const depth = profondeur / 100;
  const mixVal = mix / 100;
  // Fréquences centrale min/max (wah-wah classique : 200Hz à 2kHz)
  const freqMin = 200;
  const freqMax = 2500;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    // État du biquad passe-bande (cookbook RBJ)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      // LFO sinus : -1 à 1
      const lfo = Math.sin(2 * Math.PI * frequence * t);
      // Fréquence centrale interpolée
      const fc = freqMin + (freqMax - freqMin) * (1 + lfo * depth) / 2;
      const w0 = 2 * Math.PI * fc / sr;
      const cosW0 = Math.cos(w0);
      const sinW0 = Math.sin(w0);
      const alpha = sinW0 / (2 * q);

      // Coefficients passe-bande (constant 0 dB peak gain)
      const b0 = alpha;
      const b1 = 0;
      const b2 = -alpha;
      const a0 = 1 + alpha;
      const a1 = -2 * cosW0;
      const a2 = 1 - alpha;

      // Normaliser
      const nb0 = b0 / a0;
      const nb1 = b1 / a0;
      const nb2 = b2 / a0;
      const na1 = a1 / a0;
      const na2 = a2 / a0;

      // Appliquer le filtre
      const x0 = src[i];
      const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;

      // Mix entre signal filtré et signal original
      dst[i] = src[i] * (1 - mixVal) + y0 * mixVal;
    }
  }
  return resultat;
}

// Phaser : filtres passe-tout en cascade avec déphasage modulé par LFO.
export function phaser(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  etages: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const depth = profondeur / 100;
  const mixVal = mix / 100;
  const nbEtages = Math.max(1, Math.min(8, Math.round(etages)));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    const apStates: { x1: number; y1: number }[] = Array.from({ length: nbEtages }, () => ({ x1: 0, y1: 0 }));

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const lfo = Math.sin(2 * Math.PI * frequence * t);
      const fc = 200 + 1800 * (1 + lfo * depth) / 2;
      const w0 = 2 * Math.PI * fc / sr;
      const tanW0 = Math.tan(w0 / 2);
      const a = (1 - tanW0) / (1 + tanW0);

      let signal = src[i];
      for (let s = 0; s < nbEtages; s++) {
        const st = apStates[s];
        const y = a * signal + st.x1 - a * st.y1;
        st.x1 = signal;
        st.y1 = y;
        signal = y;
      }
      dst[i] = src[i] * (1 - mixVal) + (src[i] + signal) * mixVal * 0.5;
    }
  }
  return resultat;
}

// Vibrato : modulation de hauteur par LFO (delay modulé).
export function vibrato(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const maxCents = profondeur * 2;
  const delayMax = Math.ceil(sr * 0.02);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    const delayLine = new Float64Array(delayMax);
    let dlyPos = 0;

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const lfo = Math.sin(2 * Math.PI * frequence * t);
      const delaySamples = (delayMax / 2) * (1 + lfo * (maxCents / 200));
      const readPos = dlyPos - delaySamples;
      const idx0 = Math.floor(readPos);
      const frac = readPos - idx0;
      const s0 = delayLine[((idx0 % delayMax) + delayMax) % delayMax];
      const s1 = delayLine[(((idx0 + 1) % delayMax) + delayMax) % delayMax];
      dst[i] = s0 + (s1 - s0) * frac;
      delayLine[dlyPos] = src[i];
      dlyPos = (dlyPos + 1) % delayMax;
    }
  }
  return resultat;
}

// Octaver : ajoute une octave supérieure et/ou inférieure.
export function octaver(
  buffer: AudioBuffer,
  octaveSup: number,
  octaveInf: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const mixSup = Math.max(0, Math.min(100, octaveSup)) / 100;
  const mixInf = Math.max(0, Math.min(100, octaveInf)) / 100;
  const mixDry = 1 - Math.max(0, Math.min(1, mix / 100));

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let lastZero = 0;
    let infCount = 0;

    for (let i = 0; i < buffer.length; i++) {
      let output = src[i] * mixDry;

      if (mixSup > 0) {
        if (i > 0 && src[i - 1] <= 0 && src[i] > 0) {
          lastZero = i;
        }
        const halfPeriod = i - lastZero;
        const periodEstimate = halfPeriod * 2;
        if (periodEstimate > 0) {
          const localPhase = ((i - lastZero) % periodEstimate) / periodEstimate;
          output += src[i] * mixSup * (localPhase > 0.5 ? -1 : 1);
        }
      }

      if (mixInf > 0) {
        if (infCount % 2 === 0) {
          output += src[i] * mixInf;
        }
        infCount++;
      }

      dst[i] = output;
    }
  }
  return resultat;
}

// Chopper : gate rythmique qui coupe le son périodiquement.
export function chopper(
  buffer: AudioBuffer,
  frequence: number,
  duree: number,
  type: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const ratioOn = Math.max(1, Math.min(99, duree)) / 100;
  const fadeSamples = type === 1 ? Math.min(256, Math.floor(sr / frequence / 8)) : 1;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sr;
      const cyclePos = (t * frequence) % 1;
      let gain: number;
      if (cyclePos < ratioOn) {
        gain = 1;
        if (type === 1) {
          const fadePos = cyclePos / ratioOn;
          const fadeRatio = fadeSamples / (sr / frequence);
          if (fadePos < fadeRatio) gain = fadePos / fadeRatio;
        }
      } else {
        gain = 0;
        if (type === 1) {
          const offPos = (cyclePos - ratioOn) / (1 - ratioOn);
          const fadeRatio = fadeSamples / (sr / frequence);
          if (offPos < fadeRatio) gain = 1 - offPos / fadeRatio;
        }
      }
      dst[i] = src[i] * gain;
    }
  }
  return resultat;
}
