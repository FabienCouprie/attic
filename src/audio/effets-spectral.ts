// audio/effets-spectral.ts — Effets (issus du découpage de effets.ts).
import { fft } from "./fft";
import { parseMidi, writeMidi } from "midi-file";
import type { StructureSF2 } from "./soundfont";
import { chercherZoneInstrument } from "./soundfont";
import { Mp3Encoder } from "lamejs";
import { DEMI_TONS_CLE, frequenceDeNoteMidi, type PositionZone, TAILLE_FFT, SAUT_FFT, creerFenetreHann, etirerDuree, reechantillonnerVers, type TrameFFT, tramesDepuisBuffer, TAILLE_FFT_HAUTEUR, SAUT_ANALYSE_HAUTEUR } from "./commun";

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


