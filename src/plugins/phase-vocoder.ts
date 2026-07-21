// plugins/phase-vocoder.ts — Nœuds de time-stretch / pitch-shift via phase vocoder.
// time-stretch : MIT — ajouté dans THIRD_PARTY.md.
//
// Fournit une alternative fréquentielle de haute qualité aux algorithmes
// temporels (WSOLA) et aux nœuds natifs de changement de tempo / tonalité.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { vocoder, pitchShift } from "time-stretch";

function appliquerVocoder(buffer: AudioBuffer, factor: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const outLen = Math.ceil(buffer.length * factor);
  const out = new AudioBuffer({ numberOfChannels: channels, length: outLen, sampleRate: sr });
  for (let ch = 0; ch < channels; ch++) {
    const raw = buffer.getChannelData(ch);
    const src = new Float32Array(raw.buffer as ArrayBuffer, raw.byteOffset, raw.length);
    const res = vocoder(src, { factor, transients: true });
    out.copyToChannel(new Float32Array(res.subarray(0, outLen)), ch);
  }
  return out;
}

function appliquerPitchShift(buffer: AudioBuffer, semitones: number): AudioBuffer {
  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const out = new AudioBuffer({ numberOfChannels: channels, length: buffer.length, sampleRate: sr });
  for (let ch = 0; ch < channels; ch++) {
    const raw = buffer.getChannelData(ch);
    const src = new Float32Array(raw.buffer as ArrayBuffer, raw.byteOffset, raw.length);
    const res = pitchShift(src, { semitones });
    out.copyToChannel(new Float32Array(res.subarray(0, buffer.length)), ch);
  }
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "phase-vocoder-tempo", nom: "Phase Vocoder Tempo", nomEn: "Phase Vocoder Tempo",
    univers: "Traitement", famille: "Effets",
    resume: "Change le tempo par phase vocoder (fréquentiel), avec détection de transitoires.",
    resumeEn: "Changes tempo via phase vocoder (frequency-domain), with transient detection.",
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
      const factor = 1 / tempo;
      const out = appliquerVocoder(buffer, factor);
      return { valeurs: [out], message: traduire("msg.tempo_x_var_0_var_1_s", tempo.toFixed(2), out.duration.toFixed(1)) };
    },
  },
  {
    id: "phase-vocoder-tonalite", nom: "Phase Vocoder Tonalité", nomEn: "Phase Vocoder Pitch",
    univers: "Traitement", famille: "Effets",
    resume: "Transpose la hauteur par phase vocoder (fréquentiel), sans modifier la durée.",
    resumeEn: "Transposes pitch via phase vocoder (frequency-domain), without changing duration.",
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
      const out = appliquerPitchShift(buffer, semi);
      const signe = semi >= 0 ? "+" : "";
      return { valeurs: [out], message: traduire("msg.tonalit_var_0_var_1_st_var_2_s", signe, semi.toFixed(1), out.duration.toFixed(1)) };
    },
  },
] as FicheAudio[]).map(avecDoc);
