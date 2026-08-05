// plugins/melangeur-logistique.ts — Mélangeur à transition logistique entre deux pistes.
// La première piste diminue pendant que la seconde augmente, suivant une courbe logistique.

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

async function resamplerVers(
  buffer: AudioBuffer,
  sampleRate: number,
  numberOfChannels: number,
): Promise<AudioBuffer> {
  if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === numberOfChannels) {
    return buffer;
  }
  const offline = new OfflineAudioContext(numberOfChannels, Math.ceil(buffer.duration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

async function melangerLogistique(
  a1: AudioBuffer,
  a2: AudioBuffer,
  centre: number,
  pente: number,
  volumePourcent: number,
): Promise<AudioBuffer> {
  const sr = Math.max(a1.sampleRate, a2.sampleRate);
  const canaux = Math.max(a1.numberOfChannels, a2.numberOfChannels);
  const n1 = await resamplerVers(a1, sr, canaux);
  const n2 = await resamplerVers(a2, sr, canaux);
  const len = Math.max(n1.length, n2.length);
  const out = new AudioBuffer({ numberOfChannels: canaux, length: len, sampleRate: sr });
  const gain = volumePourcent / 100;

  for (let c = 0; c < canaux; c++) {
    const d1 = n1.getChannelData(c);
    const d2 = n2.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = len > 1 ? i / (len - 1) : 0;
      const x = pente * (t - centre);
      const w2 = 1 / (1 + Math.exp(-x));
      const w1 = 1 - w2;
      const v1 = i < n1.length ? d1[i] : 0;
      const v2 = i < n2.length ? d2[i] : 0;
      dst[i] = (v1 * w1 + v2 * w2) * gain;
    }
  }
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "melangeur-logistique",
    nom: "Mélangeur logistique",
    nomEn: "Logistic Mixer",
    univers: "Traitement",
    famille: "Montage",
    resume: "Mélange deux pistes avec une transition logistique : la première diminue pendant que la seconde augmente.",
    resumeEn: "Mixes two tracks with a logistic transition: the first fades out while the second fades in.",
    notice: "Branchez deux pistes audio. Le poids de la première piste diminue selon une courbe logistique pendant que celui de la seconde augmente. Le Centre règle le moment où le mix est 50/50, la Pente contrôle la raideur de la transition (pente faible = fondu très doux, pente élevée = transition brutale).",
    noticeEn: "Connect two audio tracks. The first track's weight decreases along a logistic curve while the second's increases. Center sets the 50/50 mix point, Steepness controls the transition sharpness (low = very smooth fade, high = abrupt switch).",
    entrees: [
      { nom: "Audio 1", nomEn: "Audio 1", type: "audio" },
      { nom: "Audio 2", nomEn: "Audio 2", type: "audio" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Centre", nomEn: "Center", type: "nombre", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Position de la transition 50/50 (0 = début, 100 = fin).", docEn: "50/50 mix position (0 = start, 100 = end).",
      },
      {
        nom: "Pente", nomEn: "Steepness", type: "nombre", plage: [0.1, 50], pas: 0.1, defaut: 10,
        doc: "Raideur de la courbe logistique. Valeur élevée = transition rapide.", docEn: "Steepness of the logistic curve. Higher value = faster transition.",
      },
      {
        nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume.",
      },
    ],
    async executer(ctx: any) {
      const a1 = ctx.entree(0);
      const a2 = ctx.entree(1);
      if (!(a1 instanceof AudioBuffer) || !(a2 instanceof AudioBuffer)) {
        return { valeurs: [null], message: "Branchez deux pistes audio" };
      }
      const centre = ctx.paramNombre("Centre", 50) / 100;
      const pente = ctx.paramNombre("Pente", 10);
      const volume = ctx.paramNombre("Volume", 100);
      const out = await melangerLogistique(a1, a2, centre, pente, volume);
      return { valeurs: [out], message: `Mélangeur logistique · ${out.duration.toFixed(1)} s` };
    },
  },
] as FicheAudio[]).map(avecDoc);
