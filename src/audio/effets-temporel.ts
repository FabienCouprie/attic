// audio/effets-temporel.ts — Effets (issus du découpage de effets.ts).
import { etirerDuree } from "./commun";
import { fft } from "./fft";
import { normaliser } from "./effets-dynamique";

const FENETRES_PUISSANCE_2 = [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];

function tailleFenetreSuivante(n: number): number {
  for (const taille of FENETRES_PUISSANCE_2) if (taille >= n) return taille;
  return FENETRES_PUISSANCE_2[FENETRES_PUISSANCE_2.length - 1];
}

export function bouclerAudio(
  entree: AudioBuffer,
  dureeSec: number,
  repetitions: number,
  fonduMs: number
): AudioBuffer {
  const sampleRate = entree.sampleRate;
  const longueurSegment = Math.max(1, Math.round(dureeSec * sampleRate));
  const nbRepetitions = Math.max(1, Math.round(repetitions));
  const fonduEch = Math.min(
    Math.floor(longueurSegment / 2),
    Math.max(0, Math.round((fonduMs / 1000) * sampleRate))
  );

  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: longueurSegment * nbRepetitions,
    sampleRate,
  });

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const src = entree.getChannelData(c);
    const segment = new Float32Array(longueurSegment);
    for (let i = 0; i < longueurSegment; i++) segment[i] = i < src.length ? src[i] : 0;

    const dst = resultat.getChannelData(c);
    for (let r = 0; r < nbRepetitions; r++) {
      const offset = r * longueurSegment;
      for (let i = 0; i < longueurSegment; i++) {
        let echantillon = segment[i];
        if (r > 0 && fonduEch > 0 && i < fonduEch) {
          const poids = i / fonduEch;
          const echantillonPrecedent = segment[longueurSegment - fonduEch + i];
          echantillon = echantillonPrecedent * (1 - poids) + segment[i] * poids;
        }
        dst[offset + i] = echantillon;
      }
    }
  }

  return resultat;
}



export async function appliquerDelay(
  entree: AudioBuffer,
  tempsGaucheMs: number,
  tempsDroitMs: number,
  feedbackPct: number,
  mixPct: number
): Promise<AudioBuffer> {
  const tl = Math.max(0.001, tempsGaucheMs) / 1000;
  const tr = Math.max(0.001, tempsDroitMs) / 1000;
  const feedback = Math.max(0, feedbackPct / 100);
  const mix = Math.max(0, Math.min(1, mixPct / 100));
  const dMax = Math.max(tl, tr);
  const rep = feedback > 0.001 && feedback < 0.999 ? Math.ceil(Math.log(1e-4) / Math.log(feedback)) : feedback >= 0.999 ? 40 : 0;
  const coda = Math.max(3, dMax * Math.min(rep, 40));
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * entree.sampleRate), entree.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = entree;

  const dryG = offline.createGain();
  dryG.gain.value = 1 - mix;
  source.connect(dryG).connect(offline.destination);

  const splitter = offline.createChannelSplitter(2);
  const merger = offline.createChannelMerger(2);
  source.connect(splitter);

  function faireCanal(chan: number, dt: number) {
    const delai = offline.createDelay(dMax + 1);
    delai.delayTime.value = dt;
    const fb = offline.createGain(); fb.gain.value = feedback;
    const flt = offline.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 8000;
    const wet = offline.createGain(); wet.gain.value = mix;
    splitter.connect(delai, chan, 0);
    delai.connect(flt).connect(fb).connect(delai);
    flt.connect(wet).connect(merger, 0, chan);
  }

  faireCanal(0, tl);
  faireCanal(1, tr);

  merger.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}



export async function appliquerEchoPingPong(
  entree: AudioBuffer,
  tempsMs: number,
  feedbackPct: number,
  repartitionPct: number
): Promise<AudioBuffer> {
  const delai = Math.max(0.001, tempsMs) / 1000;
  const feedback = Math.max(0, feedbackPct / 100);
  const repetitions = feedback > 0.001 && feedback < 0.99 ? Math.ceil(Math.log(1e-4) / Math.log(feedback)) : feedback >= 0.99 ? 40 : 0;
  const coda = Math.max(5, delai * Math.min(repetitions, 40));
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(2, Math.ceil(duree * entree.sampleRate), entree.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = entree;

  // Dry
  source.connect(offline.destination);

  // Wet : delay → panner → destination + feedback
  const delay = offline.createDelay(5);
  delay.delayTime.value = delai;

  const wetGain = offline.createGain();
  wetGain.gain.value = 0.7;

  const panner = offline.createStereoPanner();
  const pannerGain = offline.createGain();
  pannerGain.gain.value = Math.min(1, Math.max(0, repartitionPct / 100));

  const feedbackGain = offline.createGain();
  feedbackGain.gain.value = feedback;

  // LFO : ondule sinusoïdale pour éviter les clics du carré ; la transition
  // douce entre gauche et droite conserve l'effet ping-pong sans artefact.
  const lfo = offline.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 1 / (2 * delai);

  source.connect(wetGain);
  wetGain.connect(delay);
  delay.connect(panner);
  panner.connect(offline.destination);
  panner.connect(feedbackGain);
  feedbackGain.connect(delay);

  // La sortie du LFO (±1) est multipliée par pannerGain puis connectée à
  // panner.pan (valeur nominale). Avec une onde triangle, la panoramique
  // varie linéairement d'un extrême à l'autre, sans discontinuité.
  lfo.connect(pannerGain);
  pannerGain.connect(panner.pan);

  source.start(0);
  lfo.start(0);
  return offline.startRendering();
}



// Echo inverse (reverse echo / pre-echo) : les répétitions atténuées apparaissent
// AVANT le son principal. Principe : on inverse le signal, on applique un echo
// classique, puis on ré-inverse le résultat.
export function appliquerEchoInverse(
  entree: AudioBuffer,
  tempsMs: number,
  feedbackPct: number,
): AudioBuffer {
  const sr = entree.sampleRate;
  const delay = Math.max(1, Math.round((Math.max(0.001, tempsMs) / 1000) * sr));
  const feedback = Math.max(0, Math.min(0.99, feedbackPct / 100));
  const repetitions =
    feedback > 0.001 && feedback < 0.99
      ? Math.ceil(Math.log(1e-4) / Math.log(feedback))
      : feedback >= 0.99 ? 40 : 0;
  const tail = delay * repetitions;
  const length = entree.length + tail;

  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length,
    sampleRate: sr,
  });

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const src = entree.getChannelData(c);
    const dst = resultat.getChannelData(c);
    let amp = 1;
    for (let r = 0; r <= repetitions; r++) {
      const offset = tail - r * delay;
      for (let i = 0; i < src.length; i++) {
        dst[offset + i] += src[i] * amp;
      }
      amp *= feedback;
    }
  }

  return resultat;
}

export async function appliquerReverberation(
  entree: AudioBuffer,
  taille: number,
  decaySec: number,
  mix: number,
  hasard: () => number = Math.random,
): Promise<AudioBuffer> {
  const dureeImpulsion = 0.2 + (Math.max(0, Math.min(100, taille)) / 100) * 6;
  const facteurDecay = Math.max(0.5, Math.min(8, decaySec));
  const coda = dureeImpulsion + 1;
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(
    entree.numberOfChannels,
    Math.ceil(duree * entree.sampleRate),
    entree.sampleRate
  );

  const impulsion = offline.createBuffer(
    entree.numberOfChannels,
    Math.ceil(dureeImpulsion * entree.sampleRate),
    entree.sampleRate
  );
  for (let c = 0; c < impulsion.numberOfChannels; c++) {
    const donnees = impulsion.getChannelData(c);
    for (let i = 0; i < donnees.length; i++) {
      const t = i / donnees.length;
      donnees[i] = (hasard() * 2 - 1) * Math.pow(1 - t, facteurDecay);
    }
  }

  const source = offline.createBufferSource();
  source.buffer = entree;

  const convolueur = offline.createConvolver();
  convolueur.buffer = impulsion;
  convolueur.normalize = true;

  const mixVal = Math.max(0, Math.min(100, mix)) / 100;
  const gainSec = offline.createGain();
  gainSec.gain.value = 1 - mixVal;
  const gainHumide = offline.createGain();
  gainHumide.gain.value = mixVal;

  source.connect(gainSec);
  gainSec.connect(offline.destination);

  source.connect(convolueur);
  convolueur.connect(gainHumide);
  gainHumide.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
}



export function appliquerFondu(buffer: AudioBuffer, type: string, dureeSec: number): AudioBuffer {
  const dureeEch = Math.max(1, Math.min(buffer.length, Math.round(dureeSec * buffer.sampleRate)));
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    dst.set(src);

    if (type === "Fermeture") {
      const debut = buffer.length - dureeEch;
      for (let i = 0; i < dureeEch; i++) {
        const t = i / Math.max(1, dureeEch - 1);
        const gain = 0.5 * (1 + Math.cos(Math.PI * t));
        dst[debut + i] *= gain;
      }
    } else {
      for (let i = 0; i < dureeEch; i++) {
        const t = i / Math.max(1, dureeEch - 1);
        const gain = 0.5 * (1 - Math.cos(Math.PI * t));
        dst[i] *= gain;
      }
    }
  }

  return resultat;
}

// Amplificateur : gain fixe en dB appliqué uniformément. Les valeurs qui
// dépassent ±1 seront écrêtées à la lecture/export (comme un ampli qui sature).


export async function appliquerFlanger(
  entree: AudioBuffer,
  vitesse: number,
  profondeur: number,
  mix: number
): Promise<AudioBuffer> {
  const coda = 0.1;
  const duree = entree.duration + coda;
  const ctx = new OfflineAudioContext(entree.numberOfChannels, Math.ceil(duree * entree.sampleRate), entree.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = entree;
  const sec = ctx.createGain();
  sec.gain.value = 1 - mix;
  const humide = ctx.createGain();
  humide.gain.value = mix;
  const delai = ctx.createDelay(0.02);
  delai.delayTime.setValueAtTime(0.002, 0);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = vitesse;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = Math.max(0.0001, profondeur / 1000);
  lfo.connect(lfoGain);
  lfoGain.connect(delai.delayTime);
  source.connect(sec);
  sec.connect(ctx.destination);
  source.connect(delai);
  delai.connect(humide);
  humide.connect(ctx.destination);
  source.start();
  lfo.start();
  return ctx.startRendering();
}



export async function appliquerChorus(
  entree: AudioBuffer,
  vitesse: number,
  profondeur: number,
  mix: number,
): Promise<AudioBuffer> {
  const sr = entree.sampleRate;
  const nCh = Math.min(entree.numberOfChannels, 2);
  const duree = entree.duration + 0.2;
  const ctx = new OfflineAudioContext(nCh, Math.ceil(duree * sr), sr);
  const source = ctx.createBufferSource();
  source.buffer = entree;

  const secGain = ctx.createGain();
  secGain.gain.value = 1 - mix;
  source.connect(secGain);
  secGain.connect(ctx.destination);

  const baseDelay = 0.025;
  const profSec = profondeur / 1000;

  for (let ch = 0; ch < nCh; ch++) {
    const delai = ctx.createDelay(0.05);
    delai.delayTime.value = baseDelay + ch * 0.004;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vitesse * (1 + ch * 0.15);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = profSec;
    lfo.connect(lfoGain);
    lfoGain.connect(delai.delayTime);
    const wetGain = ctx.createGain();
    wetGain.gain.value = mix * 0.4;
    source.connect(delai);
    delai.connect(wetGain);
    wetGain.connect(ctx.destination);
    lfo.start();
  }

  source.start();
  return ctx.startRendering();
}



export async function appliquerReverbeProgressive(
  entree: AudioBuffer,
  taillePct: number,
  debutPct: number,
  finPct: number,
  dureeFadeSec: number,
  hasard: () => number = Math.random,
): Promise<AudioBuffer> {
  const dureeImpulsion = 0.5 + (Math.max(0, Math.min(100, taillePct)) / 100) * 3;
  const coda = dureeImpulsion + 1;
  const sr = entree.sampleRate;
  const duree = entree.duration + coda;
  const offline = new OfflineAudioContext(entree.numberOfChannels, Math.ceil(duree * sr), sr);

  const impulsion = offline.createBuffer(entree.numberOfChannels, Math.ceil(dureeImpulsion * sr), sr);
  for (let c = 0; c < impulsion.numberOfChannels; c++) {
    const donnees = impulsion.getChannelData(c);
    for (let i = 0; i < donnees.length; i++) {
      const t = i / donnees.length;
      donnees[i] = (hasard() * 2 - 1) * Math.pow(1 - t, 3);
    }
  }

  const source = offline.createBufferSource();
  source.buffer = entree;

  const convolueur = offline.createConvolver();
  convolueur.buffer = impulsion;
  convolueur.normalize = true;

  const debut = Math.max(0, Math.min(100, debutPct)) / 100;
  const fin = Math.max(0, Math.min(100, finPct)) / 100;
  const fade = Math.max(0.5, Math.min(duree, dureeFadeSec));

  const gainSec = offline.createGain();
  gainSec.gain.setValueAtTime(1 - debut, 0);
  gainSec.gain.linearRampToValueAtTime(1 - fin, fade);

  const gainHumide = offline.createGain();
  gainHumide.gain.setValueAtTime(debut, 0);
  gainHumide.gain.linearRampToValueAtTime(fin, fade);

  source.connect(gainSec);
  gainSec.connect(offline.destination);

  source.connect(convolueur);
  convolueur.connect(gainHumide);
  gainHumide.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
}

// ---------- Classificateur de genre audio ----------

// ---------- Ring modulator ----------

export function ringModulator(
  buffer: AudioBuffer,
  frequence: number,
  mix: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const mixVal = Math.max(0, Math.min(100, mix)) / 100;
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: sr,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = resultat.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      const t = i / sr;
      const porteuse = Math.sin(2 * Math.PI * frequence * t);
      dst[i] = src[i] * (1 - mixVal) + src[i] * porteuse * mixVal;
    }
  }

  return resultat;
}

// Étirement glissant : le facteur d'étirement varie progressivement du début à la fin.
export function etirementGlissant(buffer: AudioBuffer, facteurDebut: number, facteurFin: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const facteurMoyen = (facteurDebut + facteurFin) / 2;
  const longueurSortie = Math.max(256, Math.round(buffer.length * facteurMoyen));
  const resultat = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: longueurSortie, sampleRate: sr });

  const nbSegments = Math.max(2, Math.min(50, Math.round(buffer.duration)));
  const segmentLen = Math.floor(buffer.length / nbSegments);
  const fenetreCrossfade = Math.min(1024, Math.floor(segmentLen / 4));

  let posSrc = 0;
  let posDst = 0;

  for (let s = 0; s < nbSegments; s++) {
    const t = s / (nbSegments - 1);
    const facteur = facteurDebut + (facteurFin - facteurDebut) * t;
    const debut = posSrc;
    const fin = Math.min(buffer.length, debut + segmentLen);
    const segment = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: fin - debut, sampleRate: sr });
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      segment.getChannelData(c).set(buffer.getChannelData(c).subarray(debut, fin));
    }
    const etire = etirerDuree(segment, facteur);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const srcEtire = etire.getChannelData(c);
      const dst = resultat.getChannelData(c);
      if (s === 0) {
        for (let i = 0; i < srcEtire.length && posDst + i < longueurSortie; i++) {
          dst[posDst + i] = srcEtire[i];
        }
      } else {
        for (let i = 0; i < srcEtire.length && posDst + i < longueurSortie; i++) {
          if (i < fenetreCrossfade && posDst + i - fenetreCrossfade >= 0) {
            const fade = i / fenetreCrossfade;
            dst[posDst + i - fenetreCrossfade] = dst[posDst + i - fenetreCrossfade] * (1 - fade) + srcEtire[i] * fade;
          } else if (posDst + i < longueurSortie) {
            dst[posDst + i] = srcEtire[i];
          }
        }
      }
    }
    posSrc = fin;
    posDst += Math.max(0, etire.length - fenetreCrossfade);
  }

  return resultat;
}

// Paulstretch : étirement extrême par STFT avec phases aléatoires.
// Basé sur l'algorithme de Paul Nasca (paulstretch_stereo.py).
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

