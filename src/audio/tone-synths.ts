// audio/tone-synths.ts — Synthetiseurs instrumentaux propulses par Tone.js.
// Rendu offline : aucune sortie haut-parleur, production directe d'AudioBuffer.

import { Note } from "tonal";

export interface OptionsMembraneSynth {
  note: string;
  duree: number;
  volume: number;
  pitchDecay?: number;
  octaves?: number;
  decay?: number;
  release?: number;
  sampleRate?: number;
}

export interface OptionsMetalSynth {
  note: string;
  duree: number;
  volume: number;
  harmonicity?: number;
  modulationIndex?: number;
  resonance?: number;
  octaves?: number;
  attack?: number;
  decay?: number;
  release?: number;
  sampleRate?: number;
}

function audioBufferDepuisTone(toneBuffer: unknown): AudioBuffer {
  const buffer = (toneBuffer as any).get?.() as AudioBuffer | undefined;
  return buffer ?? (toneBuffer as AudioBuffer);
}

/**
 * Genere un coup de grosse caisse synthetique avec Tone.MembraneSynth.
 * Le rendu est fait en offline pour obtenir un AudioBuffer directement.
 */
export async function genererMembraneSynth(opts: OptionsMembraneSynth): Promise<AudioBuffer> {
  const {
    note,
    duree,
    volume,
    pitchDecay = 0.05,
    octaves = 4,
    decay = 0.4,
    release = 1.4,
    sampleRate = 44100,
  } = opts;

  const { MembraneSynth, Offline } = await import("tone");

  const dureeTotale = Math.max(0.1, duree, decay + release + 0.05);
  const velocity = Math.max(0, Math.min(1, volume / 100));

  const toneBuffer = await Offline(
    () => {
      const synth = new MembraneSynth({
        pitchDecay,
        octaves,
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.001,
          decay,
          sustain: 0.01,
          release,
          attackCurve: "exponential",
        },
      }).toDestination();
      synth.volume.value = 0;
      synth.triggerAttackRelease(note, "8n", 0, velocity);
    },
    dureeTotale,
    2,
    sampleRate,
  );

  return audioBufferDepuisTone(toneBuffer);
}

export interface OptionsPolySynth {
  notes: string[];
  dureeNote: number;
  volume: number;
  waveform?: string;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  sampleRate?: number;
}

/**
 * Genere un accord polyphonique avec Tone.PolySynth (Synth + ADSR).
 * Le rendu est fait en offline pour obtenir un AudioBuffer directement.
 */
export async function genererPolySynth(opts: OptionsPolySynth): Promise<AudioBuffer> {
  const {
    notes,
    dureeNote,
    volume,
    waveform = "triangle",
    attack = 0.01,
    decay = 0.1,
    sustain = 0.3,
    release = 1,
    sampleRate = 44100,
  } = opts;

  const { PolySynth, Synth, Offline } = await import("tone");

  const dureeTotale = Math.max(0.1, dureeNote + release + 0.05);
  const velocity = Math.max(0, Math.min(1, volume / 100));

  const toneBuffer = await Offline(
    () => {
      const synth = new PolySynth(Synth, {
        oscillator: { type: waveform as any },
        envelope: { attack, decay, sustain, release },
      }).toDestination();
      synth.volume.value = 0;
      synth.triggerAttackRelease(notes, dureeNote, 0, velocity);
    },
    dureeTotale,
    2,
    sampleRate,
  );

  return audioBufferDepuisTone(toneBuffer);
}

export interface OptionsModulationSynth {
  note: string;
  duree: number;
  volume: number;
  mode: "FM" | "AM";
  harmonicity?: number;
  modulationIndex?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  sampleRate?: number;
}

/**
 * Genere une note avec modulation de frequence (FM) ou d'amplitude (AM).
 * Le rendu est fait en offline pour obtenir un AudioBuffer directement.
 */
export async function genererModulationSynth(opts: OptionsModulationSynth): Promise<AudioBuffer> {
  const {
    note,
    duree,
    volume,
    mode,
    harmonicity = 3,
    modulationIndex = 10,
    attack = 0.01,
    decay = 0.1,
    sustain = 0.3,
    release = 0.5,
    sampleRate = 44100,
  } = opts;

  const { FMSynth, AMSynth, Offline } = await import("tone");

  const dureeTotale = Math.max(0.1, duree, attack + decay + release + 0.05);
  const velocity = Math.max(0, Math.min(1, volume / 100));

  const toneBuffer = await Offline(
    () => {
      const SynthClass = mode === "AM" ? AMSynth : FMSynth;
      const synth = new SynthClass({
        harmonicity,
        modulationIndex,
        envelope: { attack, decay, sustain, release },
      }).toDestination();
      synth.volume.value = 0;
      synth.triggerAttackRelease(note, duree, 0, velocity);
    },
    dureeTotale,
    2,
    sampleRate,
  );

  return audioBufferDepuisTone(toneBuffer);
}

export interface OptionsPluckSynth {
  note: string;
  duree: number;
  volume: number;
  attackNoise?: number;
  dampening?: number;
  resonance?: number;
  release?: number;
  sampleRate?: number;
}

/**
 * Genere une note de corde pincee par synthese Karplus-Strong avec Tone.PluckSynth.
 * Le rendu est fait en offline pour obtenir un AudioBuffer directement.
 */
export async function genererPluckSynth(opts: OptionsPluckSynth): Promise<AudioBuffer> {
  const {
    note,
    duree,
    volume,
    attackNoise = 1,
    dampening = 4000,
    resonance = 0.7,
    release = 1,
    sampleRate = 44100,
  } = opts;

  const { Offline, Noise, Delay, Filter, Gain } = await import("tone");

  const dureeTotale = Math.max(0.1, duree, release + 0.05);
  const velocity = Math.max(0, Math.min(1, volume / 100));
  const freq = Note.freq(note);
  if (freq === null) throw new Error(`Note invalide : ${note}`);
  const noiseDur = Math.max(attackNoise / freq, 0.001);

  const toneBuffer = await Offline(
    () => {
      const noise = new Noise({ type: "pink" }).start(0).stop(noiseDur);
      const delay = new Delay(1 / freq);
      const filter = new Filter(dampening, "lowpass");
      const feedback = new Gain(resonance);
      const outGain = new Gain(velocity).toDestination();

      noise.connect(delay);
      delay.connect(filter);
      delay.connect(outGain);
      filter.connect(feedback);
      feedback.connect(delay);
    },
    dureeTotale,
    2,
    sampleRate,
  );

  return audioBufferDepuisTone(toneBuffer);
}

export interface OptionsDrumSynth {
  notes: { note: number; velocite: number; debut: number; fin: number }[];
  volume: number;
  sampleRate?: number;
}

/**
 * Rendu d'une piste MIDI batterie avec des synthétiseurs de percussion.
 * Utilise Tone.js MembraneSynth, MetalSynth et NoiseSynth.
 * Les notes General MIDI sont mappées : 36 kick, 38 snare, 39 clap,
 * 42/46 charley, 49 crash, 45/50 toms.
 */
export async function rendreBatterieMidi(opts: OptionsDrumSynth): Promise<AudioBuffer> {
  const { notes, volume, sampleRate = 44100 } = opts;
  const { MembraneSynth, MetalSynth, NoiseSynth, Offline } = await import("tone");

  const dureeTotale = notes.length > 0
    ? Math.max(0.5, Math.max(...notes.map((n) => n.fin)) + 0.5)
    : 0.5;
  const velocity = Math.max(0, Math.min(1, volume / 100));

  const toneBuffer = await Offline(
    () => {
      const gain = 20 * Math.log10(Math.max(0.01, velocity));

      const kick = new MembraneSynth({
        pitchDecay: 0.05,
        octaves: 4,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" },
      }).toDestination();
      kick.volume.value = gain;

      const snare = new MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.5, attackCurve: "exponential" },
      }).toDestination();
      snare.volume.value = gain;

      const snareNoise = new NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
      }).toDestination();
      snareNoise.volume.value = gain;

      const clap = new NoiseSynth({
        noise: { type: "brown" },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      }).toDestination();
      clap.volume.value = gain;

      const hihat = new MetalSynth({
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05, attackCurve: "linear" },
      }).toDestination();
      hihat.volume.value = gain;

      const hihatOpen = new MetalSynth({
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1, attackCurve: "linear" },
      }).toDestination();
      hihatOpen.volume.value = gain;

      const crash = new MetalSynth({
        harmonicity: 4,
        modulationIndex: 40,
        resonance: 3000,
        octaves: 2,
        envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.0, attackCurve: "linear" },
      }).toDestination();
      crash.volume.value = gain;

      const lowTom = new MembraneSynth({
        pitchDecay: 0.04,
        octaves: 3,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4, attackCurve: "exponential" },
      }).toDestination();
      lowTom.volume.value = gain;

      const highTom = new MembraneSynth({
        pitchDecay: 0.03,
        octaves: 3,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4, attackCurve: "exponential" },
      }).toDestination();
      highTom.volume.value = gain;

      for (const n of notes) {
        const v = Math.max(0, Math.min(1, n.velocite / 127));
        const t = n.debut;
        switch (n.note) {
          case 36:
            kick.triggerAttackRelease("C2", "8n", t, v);
            break;
          case 38:
            snare.triggerAttackRelease("D2", "8n", t, v);
            snareNoise.triggerAttackRelease("16n", t, v);
            break;
          case 39:
            clap.triggerAttackRelease("16n", t, v);
            break;
          case 42:
          case 44:
            hihat.triggerAttackRelease("C5", "32n", t, v);
            break;
          case 46:
            hihatOpen.triggerAttackRelease("C5", "16n", t, v);
            break;
          case 45:
            lowTom.triggerAttackRelease("A1", "8n", t, v);
            break;
          case 47:
            lowTom.triggerAttackRelease("C2", "8n", t, v);
            break;
          case 48:
            highTom.triggerAttackRelease("E2", "8n", t, v);
            break;
          case 49:
            crash.triggerAttackRelease("C5", "4n", t, v);
            break;
          case 50:
            highTom.triggerAttackRelease("F2", "8n", t, v);
            break;
          default:
            kick.triggerAttackRelease("C2", "8n", t, v);
            break;
        }
      }
    },
    dureeTotale,
    2,
    sampleRate,
  );

  return audioBufferDepuisTone(toneBuffer);
}

/**
 * Genere un son metallique synthetique avec Tone.MetalSynth.
 * Le rendu est fait en offline pour obtenir un AudioBuffer directement.
 */
export async function genererMetalSynth(opts: OptionsMetalSynth): Promise<AudioBuffer> {
  const {
    note,
    duree,
    volume,
    harmonicity = 5.1,
    modulationIndex = 32,
    resonance = 4000,
    octaves = 1.5,
    attack = 0.001,
    decay = 1.4,
    release = 0.2,
    sampleRate = 44100,
  } = opts;

  const { MetalSynth, Offline } = await import("tone");

  const dureeTotale = Math.max(0.1, duree, decay + release + 0.05);
  const velocity = Math.max(0, Math.min(1, volume / 100));

  const toneBuffer = await Offline(
    () => {
      const synth = new MetalSynth({
        harmonicity,
        modulationIndex,
        resonance,
        octaves,
        envelope: {
          attack,
          decay,
          sustain: 0,
          release,
          attackCurve: "linear",
        },
      }).toDestination();
      synth.volume.value = 0;
      synth.triggerAttackRelease(note, "16n", 0, velocity);
    },
    dureeTotale,
    2,
    sampleRate,
  );

  return audioBufferDepuisTone(toneBuffer);
}
