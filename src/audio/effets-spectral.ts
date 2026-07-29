// audio/effets-spectral.ts — Effets (issus du découpage de effets.ts).
import { etirerDuree, reechantillonnerVers, creerFenetreHann } from "./commun";

export function changerTempo(buffer: AudioBuffer, vitessePct: number): AudioBuffer {
  const facteur = 100 / Math.max(1, vitessePct);
  return etirerDuree(buffer, facteur);
}



export function changerTonalite(buffer: AudioBuffer, demiTons: number): AudioBuffer {
  const ratio = Math.pow(2, demiTons / 12);
  const etire = etirerDuree(buffer, ratio);
  return reechantillonnerVers(etire, ratio, buffer.length);
}

// Glissando de tonalité : la hauteur évolue continuellement entre deux valeurs
// en demi-tons, tout en conservant la durée totale.
// L'algorithme découpe le signal en segments courts, applique un pitch-shift
// statique par segment (interpolation linéaire en demi-tons), puis recolle les
// segments par overlap-add avec fenêtre de Hann et normalisation d'enveloppe.
// Si les deux hauteurs sont identiques, on retombe sur un pitch-shift statique.
export function glissandoTonalite(buffer: AudioBuffer, debutDemiTons: number, finDemiTons: number, segmentSec = 0.2): AudioBuffer {
  if (Math.abs(finDemiTons - debutDemiTons) < 1e-6) {
    return changerTonalite(buffer, debutDemiTons);
  }

  const sr = buffer.sampleRate;
  const len = buffer.length;
  const segmentLen = Math.max(4096, Math.round(segmentSec * sr));

  // Pour les sons très courts, on utilise un glissando par lecture temporelle
  // variable (normalisé sur la durée) : le pitch moyen reste proche de l'original.
  if (len <= segmentLen) {
    return glissandoTonaliteCourt(buffer, debutDemiTons, finDemiTons);
  }

  const N = Math.max(2, Math.min(50, Math.round(len / (segmentLen / 2)) + 1));
  const overlap = Math.floor((len - segmentLen) / (N - 1));
  const outputLen = (N - 1) * overlap + segmentLen;

  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: outputLen, sampleRate: sr });
  const enveloppe = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: outputLen, sampleRate: sr });
  const fenetre = creerFenetreHann(segmentLen);

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const semi = debutDemiTons + (finDemiTons - debutDemiTons) * t;
    const startSrc = i * overlap;

    const segment = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: segmentLen, sampleRate: sr });
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = segment.getChannelData(c);
      for (let j = 0; j < segmentLen; j++) {
        const idx = startSrc + j;
        dst[j] = idx >= 0 && idx < src.length ? src[idx] : 0;
      }
    }

    const transposed = changerTonalite(segment, semi);
    const startDst = i * overlap;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcT = transposed.getChannelData(c);
      const dst = out.getChannelData(c);
      const env = enveloppe.getChannelData(c);
      for (let j = 0; j < segmentLen; j++) {
        const pos = startDst + j;
        if (pos >= outputLen) break;
        const w = fenetre[j];
        dst[pos] += srcT[j] * w;
        env[pos] += w;
      }
    }
  }

  // Normalisation par l'enveloppe de recouvrement.
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const dst = out.getChannelData(c);
    const env = enveloppe.getChannelData(c);
    for (let i = 0; i < outputLen; i++) {
      dst[i] = env[i] > 1e-6 ? dst[i] / env[i] : 0;
    }
  }

  // Rallonger à la durée originale si le recouvrement a raccourci légèrement.
  if (outputLen === len) return out;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    resultat.copyToChannel(out.getChannelData(c).subarray(0, len), c);
  }
  return resultat;
}

// Fallback pour les sons plus courts qu'une fenêtre : lecture temporelle variable
// normalisée sur la durée originale. La trajectoire de pitch est exacte en forme,
// la hauteur moyenne est ramenée autour de l'original pour conserver la durée.
function glissandoTonaliteCourt(buffer: AudioBuffer, debutDemiTons: number, finDemiTons: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: len, sampleRate: sr });

  const a = debutDemiTons;
  const b = finDemiTons - debutDemiTons;
  const A = Math.pow(2, a / 12);
  const k = (b * Math.LN2) / 12;
  const R1 = (A * (Math.exp(k) - 1)) / k;
  const invR1 = 1 / R1;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const R = (A * (Math.exp(k * t) - 1)) / k;
      const pos = len * R * invR1;
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const p0 = idx - 1 >= 0 ? src[idx - 1] : 0;
      const p1 = idx < src.length ? src[idx] : 0;
      const p2 = idx + 1 < src.length ? src[idx + 1] : 0;
      const p3 = idx + 2 < src.length ? src[idx + 2] : 0;
      const t2 = frac * frac;
      const t3 = t2 * frac;
      dst[i] =
        p1
        + 0.5 * (p2 - p0) * frac
        + (p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3) * t2
        + (-0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3) * t3;
    }
  }

  return out;
}



export async function equaliser(
  buffer: AudioBuffer,
  ...gainsDb: number[]
): Promise<AudioBuffer> {
  const FREQUENCES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  let precedent = source as AudioNode;
  for (let i = 0; i < FREQUENCES.length; i++) {
    const filtre = ctx.createBiquadFilter();
    filtre.type = "peaking";
    filtre.frequency.value = FREQUENCES[i];
    filtre.Q.value = 1.4;
    filtre.gain.value = gainsDb[i] ?? 0;
    precedent.connect(filtre);
    precedent = filtre;
  }
  precedent.connect(ctx.destination);

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

// Spatialisation 3D ambisonique / binaurale via Resonance Audio.
// Le signal est mixé en mono avant spatialisation, puis rendu stéréo.
export async function appliquerResonanceAudio(
  buffer: AudioBuffer,
  sourceX: number,
  sourceY: number,
  sourceZ: number,
  roomWidth: number,
  roomHeight: number,
  roomDepth: number,
  roomMaterial: string,
): Promise<AudioBuffer> {
  const sr = buffer.sampleRate;
  const ctx = new OfflineAudioContext(2, buffer.length, sr);

  // Mixage en mono pour la spatialisation.
  const mono = ctx.createBuffer(1, buffer.length, sr);
  const monoData = mono.getChannelData(0);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      monoData[i] += src[i];
    }
  }
  for (let i = 0; i < buffer.length; i++) {
    monoData[i] /= Math.max(1, buffer.numberOfChannels);
  }

  const mod = (await import("resonance-audio")) as any;
  console.log("[resonance] module import:", mod, "keys:", Object.keys(mod || {}));
  const ResonanceAudio = mod?.ResonanceAudio ?? mod?.default?.ResonanceAudio ?? mod?.default;
  console.log("[resonance] ResonanceAudio class:", ResonanceAudio, "typeof:", typeof ResonanceAudio);
  if (typeof ResonanceAudio !== "function") {
    throw new Error("resonance-audio: ResonanceAudio class not found in module export");
  }
  const scene = new ResonanceAudio(ctx);
  console.log("[resonance] scene created:", scene, "listener:", scene?._listener, "renderer:", scene?._listener?._renderer);
  const source = scene.createSource();
  scene.setRoomProperties(
    { width: roomWidth, height: roomHeight, depth: roomDepth },
    { left: roomMaterial, right: roomMaterial, front: roomMaterial, back: roomMaterial, up: roomMaterial, down: roomMaterial },
  );
  source.setPosition(sourceX, sourceY, sourceZ);

  // Resonance Audio charge les HRIR de façon asynchrone (Omnitone) et ne
  // connecte le graphe de sortie qu'après initialisation. Il faut attendre
  // cette initialisation avant de lancer le rendu, sinon le résultat est
  // silencieux.
  const renderer = scene._listener?._renderer;
  console.log("[resonance] renderer ready:", renderer?._isRendererReady, "has initialize:", typeof renderer?.initialize);
  if (renderer && !renderer._isRendererReady && typeof renderer.initialize === "function") {
    console.log("[resonance] awaiting renderer.initialize()");
    await renderer.initialize();
    console.log("[resonance] renderer initialized, ready:", renderer._isRendererReady);
  }

  const src = ctx.createBufferSource();
  src.buffer = mono;
  src.connect(source.input);
  src.start();
  scene.output.connect(ctx.destination);
  console.log("[resonance] graph connected, rendering", buffer.length, "samples");

  const out = await ctx.startRendering();
  const rms = Math.sqrt((out.getChannelData(0).reduce((s, v) => s + v * v, 0) + out.getChannelData(1).reduce((s, v) => s + v * v, 0)) / (out.length * 2));
  console.log("[resonance] rendered", out.numberOfChannels, "channels RMS", rms);
  return out;
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

// Pan logistique : déplacement mono-directionnel gauche → droite selon une loi logistique.
export function panLogistique(
  buffer: AudioBuffer,
  centre: number,
  pente: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
  const depth = Math.max(0, Math.min(1, mix / 100));
  const centreRel = Math.max(0, Math.min(1, centre / 100));
  const k = Math.max(0.1, pente);
  const n = buffer.length;

  for (let c = 0; c < 2; c++) {
    const src = buffer.numberOfChannels > c ? buffer.getChannelData(c) : buffer.getChannelData(0);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const p = 1 / (1 + Math.exp(-k * (t - centreRel)));
      const gain = c === 0
        ? 1 - depth * p
        : 1 - depth * (1 - p);
      dst[i] = src[i] * gain;
    }
  }
  return resultat;
}

// --- Harmonizer / Octaver : ajoute des voix pitch-shiftées ---------------------
// Crée jusqu'à deux voix décalées en demi-tons et les mixe sous l'original.

export function harmoniser(
  buffer: AudioBuffer,
  interval1: number,
  mix1: number,
  interval2: number,
  mix2: number,
): AudioBuffer {
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    resultat.getChannelData(c).set(buffer.getChannelData(c));
  }

  function ajouterVoix(interval: number, gainRel: number): void {
    if (gainRel <= 0 || interval === 0) return;
    const voix = changerTonalite(buffer, interval);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const dst = resultat.getChannelData(c);
      const src = voix.getChannelData(c);
      const gain = gainRel / 100;
      for (let i = 0; i < buffer.length; i++) dst[i] += src[i] * gain;
    }
  }

  ajouterVoix(interval1, mix1);
  ajouterVoix(interval2, mix2);
  return resultat;
}

// --- Vocoder filterbank : modulateur + porteuse → effet robot -----------------
// Découpe modulateur et porteuse en bandes passe-bande, détecte l'enveloppe du
// modulateur par bande, puis applique cette enveloppe à la porteuse correspondante.

async function filtreBiquadSpectral(
  buffer: AudioBuffer,
  type: BiquadFilterType,
  frequency: number,
  Q = 0.707,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  source.connect(filter);
  filter.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

function detecterEnveloppe(buffer: AudioBuffer, attackMs: number, releaseMs: number): Float32Array[] {
  const sr = buffer.sampleRate;
  const attackCoeff = Math.exp(-1 / (Math.max(0.01, attackMs) / 1000 * sr));
  const releaseCoeff = Math.exp(-1 / (Math.max(0.01, releaseMs) / 1000 * sr));
  const envs: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const env = new Float32Array(buffer.length);
    let e = 0;
    for (let i = 0; i < buffer.length; i++) {
      const target = Math.abs(src[i]);
      e = target > e ? attackCoeff * e + (1 - attackCoeff) * target : releaseCoeff * e + (1 - releaseCoeff) * target;
      env[i] = e;
    }
    envs.push(env);
  }
  return envs;
}

export async function vocoder(
  modulateur: AudioBuffer,
  porteuse: AudioBuffer,
  bands: number,
  fMin: number,
  fMax: number,
  Q: number,
  mix: number,
): Promise<AudioBuffer> {
  const sr = modulateur.sampleRate;
  const length = Math.min(modulateur.length, porteuse.length);
  const nch = modulateur.numberOfChannels;
  const resultat = new AudioBuffer({ numberOfChannels: nch, length, sampleRate: sr });
  for (let c = 0; c < nch; c++) resultat.getChannelData(c).fill(0);

  for (let i = 0; i < bands; i++) {
    const freq = fMin * Math.pow(fMax / fMin, i / Math.max(1, bands - 1));
    const modBand = await filtreBiquadSpectral(modulateur, "bandpass", freq, Q);
    const carBand = await filtreBiquadSpectral(porteuse, "bandpass", freq, Q);
    const envs = detecterEnveloppe(modBand, 1, 20);
    for (let c = 0; c < nch; c++) {
      const dst = resultat.getChannelData(c);
      const car = carBand.getChannelData(c);
      const env = envs[c];
      for (let j = 0; j < length; j++) dst[j] += car[j] * env[j];
    }
  }

  const mixVal = mix / 100;
  const sortie = new AudioBuffer({ numberOfChannels: nch, length, sampleRate: sr });
  for (let c = 0; c < nch; c++) {
    const src = modulateur.getChannelData(c);
    const wet = resultat.getChannelData(c);
    const dst = sortie.getChannelData(c);
    for (let i = 0; i < length; i++) dst[i] = src[i] * (1 - mixVal) + wet[i] * mixVal;
  }
  return sortie;
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
      // Coefficient passe-tout du 1er ordre dont la transition de phase (90°)
      // est à fc : a = (tan−1)/(tan+1), NÉGATIF pour fc ≪ Nyquist. Le signe
      // inverse (1−tan)/(1+tan) place la transition près de Nyquist — le
      // balayage du LFO devenait inaudible (sortie ≈ entrée, mesuré à 1,6 %).
      const a = (tanW0 - 1) / (tanW0 + 1);

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

// Vibrato logistique : le vibrato s'installe progressivement selon une courbe
// logistique. En début de piste l'effet est nul, en fin de piste il atteint la
// profondeur demandée.
export function vibratoLogistique(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  centre: number,
  pente: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const mixWet = Math.max(0, Math.min(1, mix / 100));
  const maxCents = Math.max(0, profondeur * 2);
  const centreRel = Math.max(0, Math.min(1, centre / 100));
  const k = Math.max(0.1, pente);
  const n = buffer.length;
  const delayMax = Math.ceil(sr * 0.02);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    const delayLine = new Float64Array(delayMax);
    let dlyPos = 0;

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const p = 1 / (1 + Math.exp(-k * (t - centreRel)));
      const envelopeCents = maxCents * p;
      const lfo = Math.sin(2 * Math.PI * frequence * i / sr);
      const delaySamples = (delayMax / 2) * (1 + lfo * (envelopeCents / 200));
      const readPos = dlyPos - delaySamples;
      const idx0 = Math.floor(readPos);
      const frac = readPos - idx0;
      const s0 = delayLine[((idx0 % delayMax) + delayMax) % delayMax];
      const s1 = delayLine[(((idx0 + 1) % delayMax) + delayMax) % delayMax];
      const wet = s0 + (s1 - s0) * frac;
      dst[i] = src[i] * (1 - mixWet) + wet * mixWet;
      delayLine[dlyPos] = src[i];
      dlyPos = (dlyPos + 1) % delayMax;
    }
  }
  return resultat;
}

// Tremolo logistique : le tremolo s'installe progressivement selon une courbe
// logistique. En début de piste l'effet est nul, en fin de piste il atteint la
// profondeur demandée.
export function tremoloLogistique(
  buffer: AudioBuffer,
  frequence: number,
  profondeur: number,
  centre: number,
  pente: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: sr });
  const mixWet = Math.max(0, Math.min(1, mix / 100));
  const maxDepth = Math.max(0, Math.min(1, profondeur / 100));
  const centreRel = Math.max(0, Math.min(1, centre / 100));
  const k = Math.max(0.1, pente);
  const n = buffer.length;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const p = 1 / (1 + Math.exp(-k * (t - centreRel)));
      const depth = maxDepth * p;
      const lfo = Math.sin(2 * Math.PI * frequence * i / sr);
      const gain = 1 - depth * (1 - lfo) / 2;
      const wet = src[i] * gain;
      dst[i] = src[i] * (1 - mixWet) + wet * mixWet;
    }
  }
  return resultat;
}

// Octaver : ajoute une voix à l'octave supérieure et/ou inférieure.
// Techniques monophoniques classiques des pédales analogiques :
//  - octave SUP : redressement double alternance (|x| double la fréquence),
//    débarrassé de sa composante continue par un bloqueur DC à un pôle ;
//  - octave INF : polarité inversée une période sur deux (compteur de passages
//    à zéro montants) — le produit x·(±1) contient la fondamentale f/2.
// L'ancienne version était inopérante : la « phase locale » du haut valait
// constamment 0,5 (jamais de retournement) et le bas ajoutait le signal un
// échantillon sur deux — une modulation à Nyquist, pas une octave grave.
export function octaver(
  buffer: AudioBuffer,
  octaveSup: number,
  octaveInf: number,
  mix: number,
): AudioBuffer {
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: buffer.length, sampleRate: buffer.sampleRate });
  const nivSup = Math.max(0, Math.min(100, octaveSup)) / 100;
  const nivInf = Math.max(0, Math.min(100, octaveInf)) / 100;
  const mixVal = Math.max(0, Math.min(100, mix)) / 100;

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let rectPrec = 0;   // bloqueur DC de la voix haute
    let dcEtat = 0;
    let polarite = 1;   // voix basse : ±1, bascule une période sur deux
    let prec = 0;

    for (let i = 0; i < buffer.length; i++) {
      const x = src[i];

      // Voix haute : |x| → bloqueur DC (y = x − x₁ + R·y₁). ×2 compense la
      // perte d'amplitude du redressement (composante 2f d'un |sin| ≈ 0,42).
      const rect = Math.abs(x);
      const hp = rect - rectPrec + 0.995 * dcEtat;
      rectPrec = rect;
      dcEtat = hp;

      // Voix basse : bascule de polarité à chaque passage à zéro montant.
      if (prec <= 0 && x > 0) polarite = -polarite;
      prec = x;

      const voix = hp * 2 * nivSup + x * polarite * nivInf;
      dst[i] = x * (1 - mixVal) + voix * mixVal;
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
