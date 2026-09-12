// audio/tone-synths.ts — Synthetiseurs instrumentaux propulses par Tone.js.
// Rendu offline : aucune sortie haut-parleur, production directe d'AudioBuffer.

import { Note } from "tonal";
import {
  cleEchantillon, echantillonsRequis, placerPercussions, secondesDeclenchement,
  type Echantillon,
} from "./percussions-placement";

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
 * Réglages Tone de chaque voix de percussion.
 *
 * Les valeurs sont celles du rendu d'origine, déplacées ici sans y toucher : ce
 * tableau existe pour qu'une voix puisse être instanciée SEULE, le temps de
 * rendre son son une fois.
 *
 * `queue` est la durée de son qui suit la fin du déclenchement (decay + release,
 * plus une marge) : elle borne la longueur de l'échantillon à rendre.
 */
const VOIX_PERCUSSION: Record<string, {
  type: "membrane" | "metal" | "bruit";
  options: Record<string, unknown>;
  queue: number;
}> = {
  kick: {
    type: "membrane", queue: 1.85,
    options: { pitchDecay: 0.05, octaves: 4, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4, attackCurve: "exponential" } },
  },
  snare: {
    type: "membrane", queue: 0.75,
    options: { pitchDecay: 0.02, octaves: 2, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.01, release: 0.5, attackCurve: "exponential" } },
  },
  snareNoise: {
    type: "bruit", queue: 0.35,
    options: { noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 } },
  },
  clap: {
    type: "bruit", queue: 0.2,
    options: { noise: { type: "brown" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 } },
  },
  hihat: {
    type: "metal", queue: 0.2,
    options: { harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05, attackCurve: "linear" } },
  },
  hihatOpen: {
    type: "metal", queue: 0.55,
    options: { harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1, attackCurve: "linear" } },
  },
  crash: {
    type: "metal", queue: 2.6,
    options: { harmonicity: 4, modulationIndex: 40, resonance: 3000, octaves: 2,
      envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.0, attackCurve: "linear" } },
  },
  lowTom: {
    type: "membrane", queue: 0.75,
    options: { pitchDecay: 0.04, octaves: 3, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4, attackCurve: "exponential" } },
  },
  highTom: {
    type: "membrane", queue: 0.75,
    options: { pitchDecay: 0.03, octaves: 3, oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.4, attackCurve: "exponential" } },
  },
};

/**
 * Rendu d'une piste MIDI batterie avec des synthétiseurs de percussion.
 * Utilise Tone.js MembraneSynth, MetalSynth et NoiseSynth.
 * Les notes General MIDI sont mappées : 36 kick, 38 snare, 39 clap,
 * 42/46 charley, 49 crash, 45/50 toms.
 *
 * CHAQUE SON EST RENDU UNE FOIS, puis recopié à chaque frappe. Poser toutes les
 * frappes sur un même synthé de Tone coûtait un temps quadratique dans leur
 * nombre — 200 frappes sur une seule voix demandaient 78 s de calcul, et le nœud
 * Groove Box 537 s pour 150 s de musique. Voir audio/percussions-placement.ts
 * pour la mesure complète et ce que la recopie suppose.
 */
export async function rendreBatterieMidi(opts: OptionsDrumSynth): Promise<AudioBuffer> {
  const { notes, volume, sampleRate = 44100 } = opts;

  const dureeTotale = notes.length > 0
    ? Math.max(0.5, Math.max(...notes.map((n) => n.fin)) + 0.5)
    : 0.5;
  const gain = Math.max(0, Math.min(1, volume / 100));

  const longueur = Math.ceil(dureeTotale * sampleRate);
  const gauche = new Float32Array(longueur);
  const droite = new Float32Array(longueur);

  if (notes.length > 0) {
    const { MembraneSynth, MetalSynth, NoiseSynth, Offline } = await import("tone");

    const echantillons = new Map<string, Echantillon>();
    for (const d of echantillonsRequis(notes)) {
      const def = VOIX_PERCUSSION[d.voix];
      if (!def) continue;
      // Inutile de rendre une queue plus longue que le morceau : l'ancien rendu
      // coupait les sons au bout du tampon, la recopie fait de même.
      const duree = Math.min(dureeTotale, secondesDeclenchement(d.duree) + def.queue);
      const rendu = await Offline(
        () => {
          // Vélocité 1 et volume 0 dB : les deux sont des gains exacts, la
          // recopie applique le produit. Vérifié dans l'app avant d'y compter.
          const synthe = def.type === "membrane" ? new MembraneSynth(def.options as any)
            : def.type === "metal" ? new MetalSynth(def.options as any)
            : new NoiseSynth(def.options as any);
          synthe.toDestination();
          if (d.hauteur === null) (synthe as any).triggerAttackRelease(d.duree, 0, 1);
          else (synthe as any).triggerAttackRelease(d.hauteur, d.duree, 0, 1);
        },
        duree,
        2,
        sampleRate,
      );
      const buf = audioBufferDepuisTone(rendu);
      // COPIE, et non la vue rendue par `getChannelData` : l'échantillon survit
      // au tampon de Tone, qui est libéré à la sortie de cette itération. Sous
      // node-web-audio-api la mémoire est détenue par Rust, et garder la vue
      // faisait planter le worker de test sur une violation d'accès — un
      // usage-après-libération qui, dans le navigateur, aurait tenu par chance.
      echantillons.set(cleEchantillon(d), {
        gauche: new Float32Array(buf.getChannelData(0)),
        droite: new Float32Array(buf.getChannelData(1)),
      });
    }

    placerPercussions({ frappes: notes, echantillons, sortie: { gauche, droite }, sampleRate, gain });
  }

  const sortie = new AudioBuffer({ numberOfChannels: 2, length: longueur, sampleRate });
  sortie.copyToChannel(gauche, 0);
  sortie.copyToChannel(droite, 1);
  return sortie;
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
