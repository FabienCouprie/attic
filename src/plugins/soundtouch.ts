// plugins/soundtouch.ts — Nœuds de time-stretch / pitch-shift via SoundTouchJS.
// SoundTouchJS : LGPL-2.1 — ajouté dans THIRD_PARTY.md.
//
// Fournit une alternative de haute qualité aux nœuds natifs de changement de
// tempo et de tonalité, en utilisant l'algorithme SoundTouch (phase vocoder
// avancé).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from "soundtouchjs";

interface SoundTouchParams {
  tempo?: number;
  pitch?: number;
  pitchSemitones?: number;
  rate?: number;
}

function appliquerSoundTouch(buffer: AudioBuffer, params: SoundTouchParams): AudioBuffer {
  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const factor = params.tempo ?? params.rate ?? 1.0;
  const targetFrames = Math.ceil(buffer.length / factor);
  // Padding de zéros pour permettre à l'algorithme de flusher la queue complète
  // (utile surtout quand on ralentit / abaisse le tempo).
  const padFrames = Math.max(4096, Math.min(buffer.length, sr * 2));
  const paddedLen = buffer.length + padFrames;
  const padded = new AudioBuffer({ numberOfChannels: channels, length: paddedLen, sampleRate: sr });
  for (let ch = 0; ch < channels; ch++) {
    padded.copyToChannel(buffer.getChannelData(ch), ch);
  }

  const source = new WebAudioBufferSource(padded);
  const soundTouch = new SoundTouch();
  if (params.tempo != null) soundTouch.tempo = params.tempo;
  if (params.pitch != null) soundTouch.pitch = params.pitch;
  if (params.pitchSemitones != null) soundTouch.pitchSemitones = params.pitchSemitones;
  if (params.rate != null) soundTouch.rate = params.rate;

  const filter = new SimpleFilter(source, soundTouch);
  const samples = new Float32Array(4096 * 2);
  const blocks: Float32Array[] = [];
  let totalFrames = 0;

  while (true) {
    const frames = filter.extract(samples, 4096);
    if (frames === 0) break;
    blocks.push(samples.slice(0, frames * 2));
    totalFrames += frames;
  }

  const finalLen = Math.min(totalFrames, targetFrames);
  const out = new AudioBuffer({ numberOfChannels: channels, length: finalLen, sampleRate: sr });
  const left = new Float32Array(finalLen);
  const right = new Float32Array(finalLen);
  let offset = 0;
  for (const block of blocks) {
    const frames = block.length / 2;
    const remaining = finalLen - offset;
    if (remaining <= 0) break;
    const copyFrames = Math.min(frames, remaining);
    for (let i = 0; i < copyFrames; i++) {
      left[offset + i] = block[i * 2];
      right[offset + i] = block[i * 2 + 1];
    }
    offset += copyFrames;
  }
  out.copyToChannel(left, 0);
  if (channels > 1) {
    out.copyToChannel(right, 1);
  }
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "soundtouch-tempo", nom: "SoundTouch Tempo", nomEn: "SoundTouch Tempo",
    univers: "Traitement", famille: "Effets",
    resume: "Change le tempo en préservant la hauteur (time-stretch de qualité).",
    resumeEn: "Changes tempo while preserving pitch (quality time-stretch).",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [0.25, 4], pas: 0.01, defaut: 1, unite: "x",
        doc: "Facteur de tempo. 1 = original, 2 = 2x plus vite, 0.5 = 2x plus lent.",
        docEn: "Tempo factor. 1 = original, 2 = 2x faster, 0.5 = 2x slower." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const tempo = ctx.paramNombre("Tempo", 1);
      if (tempo <= 0) return { valeurs: [null], erreur: true, message: traduire("msg.le_tempo_doit_tre_positif") };
      const out = appliquerSoundTouch(buffer, { tempo });
      return { valeurs: [out], message: traduire("msg.tempo_x_var_0_var_1_s", tempo.toFixed(2), out.duration.toFixed(1)) };
    },
  },
  {
    id: "soundtouch-tonalite", nom: "SoundTouch Tonalité", nomEn: "SoundTouch Pitch",
    univers: "Traitement", famille: "Effets",
    resume: "Change la hauteur en préservant la durée (pitch-shift de qualité).",
    resumeEn: "Changes pitch while preserving duration (quality pitch-shift).",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tonalité", nomEn: "Pitch", plage: [-12, 12], pas: 0.5, defaut: 0, unite: "st",
        doc: "Transposition en demi-tons. 0 = original, +12 = une octave plus haut, -12 = une octave plus bas.",
        docEn: "Pitch shift in semitones. 0 = original, +12 = one octave up, -12 = one octave down." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const semi = ctx.paramNombre("Tonalité", 0);
      const out = appliquerSoundTouch(buffer, { pitchSemitones: semi });
      const signe = semi >= 0 ? "+" : "";
      return { valeurs: [out], message: traduire("msg.tonalit_var_0_var_1_st_var_2_s", signe, semi.toFixed(1), out.duration.toFixed(1)) };
    },
  },
  {
    id: "soundtouch-rate", nom: "SoundTouch Vitesse", nomEn: "SoundTouch Rate",
    univers: "Traitement", famille: "Effets",
    resume: "Change la vitesse de lecture (tempo + hauteur), comme un lecteur.",
    resumeEn: "Changes playback rate (tempo + pitch together), like a tape player.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Vitesse", nomEn: "Rate", plage: [0.25, 4], pas: 0.01, defaut: 1, unite: "x",
        doc: "Facteur de vitesse global. 1 = original, 2 = 2x plus vite et plus aigu, 0.5 = 2x plus lent et plus grave.",
        docEn: "Overall playback rate. 1 = original, 2 = 2x faster and higher, 0.5 = 2x slower and lower." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      const rate = ctx.paramNombre("Vitesse", 1);
      if (rate <= 0) return { valeurs: [null], erreur: true, message: traduire("msg.la_vitesse_doit_tre_positive") };
      const out = appliquerSoundTouch(buffer, { rate });
      return { valeurs: [out], message: traduire("msg.vitesse_x_var_0_var_1_s", rate.toFixed(2), out.duration.toFixed(1)) };
    },
  },
] as FicheAudio[]).map(avecDoc);
