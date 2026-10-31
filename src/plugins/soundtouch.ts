// plugins/soundtouch.ts — Nœuds de time-stretch / pitch-shift via SoundTouchJS.
// SoundTouchJS : LGPL-2.1 — ajouté dans THIRD_PARTY.md.
//
// Fournit une alternative de haute qualité aux nœuds natifs de changement de
// tempo et de tonalité, en utilisant l'algorithme SoundTouch (phase vocoder
// avancé).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from "soundtouchjs";

interface SoundTouchParams {
  tempo?: number;
  pitch?: number;
  pitchSemitones?: number;
  rate?: number;
}

// Exportée pour le nœud « Tonalité progressive », qui en a besoin palier par
// palier. Gardée ici plutôt que déplacée dans audio/ : la fonction est le
// pont vers SoundTouchJS, et les trois nœuds de ce fichier en sont les
// premiers usagers.
/**
 * AU-DELÀ DE DEUX CANAUX, LE SON PASSE PAR PAIRES, et c'est une réparation.
 *
 * SoundTouchJS est stéréo de bout en bout : sa source ne lit que les canaux 0 et 1, et son
 * extracteur rend des trames entrelacées à deux voies. L'ancien code allouait pourtant un tampon
 * du nombre de canaux reçu et n'en remplissait que deux : un 5.1 ressortait avec QUATRE CANAUX
 * MUETS, et rien ne le disait — le tampon avait le bon nombre de canaux, donc la suite de la
 * chaîne ne pouvait pas s'en apercevoir.
 *
 * Les paires sont traitées séparément, ce qui a un coût mesuré : les décisions de recouvrement de
 * l'algorithme dépendent du contenu, donc deux paires ne tombent pas sur le même découpage et un
 * décalage relatif apparaît. Il est BORNÉ par la fenêtre de recherche et il NE DÉRIVE PAS : même
 * écart à une seconde et à sept. Une référence commune au canal gauche a été essayée pour l'éviter,
 * sans effet : la corrélation lit les deux canaux de la paire.
 *
 * Un canal seul en fin de liste se double lui-même, et c'est son canal gauche qui ressort.
 */
export function appliquerSoundTouch(buffer: AudioBuffer, params: SoundTouchParams): AudioBuffer {
  const canaux = buffer.numberOfChannels;
  if (canaux <= 2) return passeStereo(buffer, params);

  const sr = buffer.sampleRate;
  const paires: AudioBuffer[] = [];
  for (let c = 0; c < canaux; c += 2) {
    const d = Math.min(c + 1, canaux - 1);
    const p = new AudioBuffer({ numberOfChannels: 2, length: buffer.length, sampleRate: sr });
    p.copyToChannel(buffer.getChannelData(c), 0);
    p.copyToChannel(buffer.getChannelData(d), 1);
    paires.push(passeStereo(p, params));
  }

  // LA LONGUEUR COMMUNE EST LA PLUS COURTE : les paires rendent la même longueur dans les cas
  // mesurés, mais rien ne le garantit, et un canal plus long que les autres les désaligne tous.
  const longueur = Math.min(...paires.map((p) => p.length));
  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: sr });
  for (let c = 0; c < canaux; c++) {
    const source = paires[c >> 1].getChannelData(c % 2);
    sortie.copyToChannel(source.slice(0, longueur), c);
  }
  return sortie;
}

function passeStereo(buffer: AudioBuffer, params: SoundTouchParams): AudioBuffer {
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

  // UN SON TROP COURT NE REND AUCUNE TRAME, et il faut le DIRE. L'extracteur travaille par blocs de
  // 4 096 trames et n'en rend aucune tant qu'il n'en a pas assez : mesuré, rien ne sort en dessous
  // de 8 192 échantillons d'entrée, quel que soit le tempo — 7 168 ne rend rien, 8 192 rend tout.
  // Le tampon de sortie était alors construit avec une longueur nulle, et c'est le constructeur qui
  // levait, en anglais et sans rapport : « Invalid length: 0 is less than or equal to minimum bound ».
  // Quatre composants faisaient remonter cette phrase à l'usager.
  const finalLen = Math.min(totalFrames, targetFrames);
  if (finalLen <= 0) {
    throw new Error(
      `Le son est trop court pour cette transformation : ${buffer.length} échantillons reçus, `
      + `et l'algorithme n'en rend aucun en dessous de 8192, soit 0,17 seconde à 48 kHz.`);
  }
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
    id: "soundtouch-tempo", nomDicte: "changer le tempo", nom: "SoundTouch Tempo", nomEn: "SoundTouch Tempo",
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
    async executer(ctx) {
      const buffer = entreeAudio(ctx, 0);
      if (sansEntree(buffer)) return buffer;
      const tempo = ctx.paramNombre("Tempo", 1);
      if (tempo <= 0) return { valeurs: [null], erreur: true, message: traduire("msg.le_tempo_doit_tre_positif") };
      const out = appliquerSoundTouch(buffer, { tempo });
      return { valeurs: [out], message: traduire("msg.tempo_x_var_0_var_1_s", tempo.toFixed(2), out.duration.toFixed(1)) };
    },
  },
  {
    id: "soundtouch-tonalite", nomDicte: "changer la tonalité", nom: "SoundTouch Tonalité", nomEn: "SoundTouch Pitch",
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
    async executer(ctx) {
      const buffer = entreeAudio(ctx, 0);
      if (sansEntree(buffer)) return buffer;
      const semi = ctx.paramNombre("Tonalité", 0);
      const out = appliquerSoundTouch(buffer, { pitchSemitones: semi });
      const signe = semi >= 0 ? "+" : "";
      return { valeurs: [out], message: traduire("msg.tonalit_var_0_var_1_st_var_2_s", signe, semi.toFixed(1), out.duration.toFixed(1)) };
    },
  },
  {
    id: "soundtouch-rate", nomDicte: "changer la vitesse", nom: "SoundTouch Vitesse", nomEn: "SoundTouch Rate",
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
    async executer(ctx) {
      const buffer = entreeAudio(ctx, 0);
      if (sansEntree(buffer)) return buffer;
      const rate = ctx.paramNombre("Vitesse", 1);
      if (rate <= 0) return { valeurs: [null], erreur: true, message: traduire("msg.la_vitesse_doit_tre_positive") };
      const out = appliquerSoundTouch(buffer, { rate });
      return { valeurs: [out], message: traduire("msg.vitesse_x_var_0_var_1_s", rate.toFixed(2), out.duration.toFixed(1)) };
    },
  },
] as FicheAudio[]).map(avecDoc);
