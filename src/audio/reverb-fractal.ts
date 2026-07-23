// audio/reverb-fractal.ts — Réverbération à convolution avec réponse impulsionnelle
// générée par un motif fractal (poussière de Cantor). Chaque réflexion est
// placée selon une subdivision auto-similaire, créant une texture réverbérante
// irrégulière et dense.

export interface OptionsReverbFractal {
  decay: number; // secondes
  preDelay: number; // ms
  densite: number; // 1..8, profondeur de récursion
  gainDecay: number; // 0..1, atténuation par niveau
  damping: number; // 0..100%
  diffusion: number; // 0..100%, étalement stéréo
  graine: number;
  sampleRate?: number;
  channels?: number; // 1 ou 2
}

interface Reflexion {
  sample: number;
  gain: number;
  pan: number; // 0 = gauche, 1 = droite
}

function creerRng(graine: number) {
  let s = graine >>> 0;
  if (s === 0) s = 123456789;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function poussiereCantor(
  debut: number,
  fin: number,
  profondeur: number,
  amplitude: number,
  gainDecay: number,
  diffusion: number,
  rng: () => number,
  reflexions: Reflexion[],
) {
  if (profondeur <= 0) {
    const mid = Math.round((debut + fin) / 2);
    if (mid >= 0) {
      reflexions.push({
        sample: mid,
        gain: amplitude,
        pan: 0.5 + (rng() - 0.5) * diffusion,
      });
    }
    return;
  }
  const tierce = (fin - debut) / 3;
  const gaucheFin = debut + tierce;
  const droiteDebut = fin - tierce;
  const ampSuivant = amplitude * gainDecay;
  poussiereCantor(debut, gaucheFin, profondeur - 1, ampSuivant, gainDecay, diffusion, rng, reflexions);
  poussiereCantor(droiteDebut, fin, profondeur - 1, ampSuivant, gainDecay, diffusion, rng, reflexions);
}

export function genererIRFractal(options: OptionsReverbFractal): AudioBuffer {
  const sr = options.sampleRate ?? 44100;
  const channels = Math.max(1, Math.min(2, options.channels ?? 2));
  const decay = Math.max(0.1, Math.min(20, options.decay));
  const preDelay = Math.max(0, Math.round((options.preDelay / 1000) * sr));
  const profondeur = Math.max(1, Math.min(8, Math.round(options.densite)));
  const gainDecay = Math.max(0.1, Math.min(0.95, options.gainDecay));
  const damping = Math.max(0, Math.min(1, options.damping / 100));
  const diffusion = Math.max(0, Math.min(1, options.diffusion / 100));
  const rng = creerRng(options.graine ?? 42);

  const longueur = Math.max(1, Math.ceil((preDelay / sr + decay) * sr));
  const buf = new AudioBuffer({ numberOfChannels: channels, length: longueur, sampleRate: sr });

  const reflexions: Reflexion[] = [];
  const dureeSamples = Math.ceil(decay * sr);
  poussiereCantor(0, dureeSamples, profondeur, 1.0, gainDecay, diffusion, rng, reflexions);

  // Direct sound at preDelay.
  reflexions.push({ sample: 0, gain: 1.0, pan: 0.5 });

  // Build IR from reflections.
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    for (const ref of reflexions) {
      const pos = preDelay + ref.sample;
      if (pos >= 0 && pos < longueur) {
        const pan = channels === 1 ? 0.5 : (ch === 0 ? 1 - ref.pan : ref.pan);
        d[pos] += ref.gain * pan;
      }
    }
  }

  // Apply damping (low-pass 1-pole) to simulate air/material absorption.
  const freqCut = 20000 - damping * 17000;
  const alpha = Math.exp(-2 * Math.PI * freqCut / sr);
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    let precedent = 0;
    for (let i = preDelay; i < longueur; i++) {
      precedent = precedent + alpha * (d[i] - precedent);
      d[i] = precedent;
    }
  }

  // Normalize.
  let pic = 1e-9;
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < longueur; i++) {
      const v = Math.abs(d[i]);
      if (v > pic) pic = v;
    }
  }
  const g = 0.95 / pic;
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < longueur; i++) d[i] *= g;
  }

  return buf;
}

export async function reverberationFractale(
  entree: AudioBuffer,
  options: OptionsReverbFractal,
  mixPct: number,
): Promise<AudioBuffer> {
  const sr = entree.sampleRate;
  const nCh = Math.min(entree.numberOfChannels, 2);
  const ir = genererIRFractal({ ...options, sampleRate: sr, channels: nCh });
  const mix = Math.max(0, Math.min(100, mixPct)) / 100;
  const coda = ir.duration + 0.5;
  const duree = entree.duration + coda;

  const offline = new OfflineAudioContext(nCh, Math.ceil(duree * sr), sr);
  const source = offline.createBufferSource();
  source.buffer = entree;

  const convolueur = offline.createConvolver();
  convolueur.buffer = ir;
  convolueur.normalize = true;

  const gainSec = offline.createGain();
  gainSec.gain.value = 1 - mix;

  const gainHumide = offline.createGain();
  gainHumide.gain.value = mix;

  source.connect(gainSec);
  gainSec.connect(offline.destination);

  source.connect(convolueur);
  convolueur.connect(gainHumide);
  gainHumide.connect(offline.destination);

  source.start(0);
  return offline.startRendering();
}
