// plugins/ddsp.ts — Nœud de transfert de timbre (tone transfer) via DDSP.
// @magenta/music : Apache 2.0 — ajouté dans THIRD_PARTY.md.
//
// Utilise SPICE pour extraire f0/loudness d’un audio, puis un modèle DDSP
// pré-entraîné pour resynthétiser le signal avec le timbre d’un instrument.

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { withElectronFetch } from "./electronFetch";

export const OUTPUT_SR = 48000;

export const DDSP_CHECKPOINTS: Record<string, string> = {
  "Violon": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/violin",
  "Flûte": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/flute",
  "Saxophone ténor": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/tenor_saxophone",
  "Trompette": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/trumpet",
};

const DDSP_CHECKPOINTS_EN: Record<string, string> = {
  "Violin": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/violin",
  "Flute": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/flute",
  "Tenor saxophone": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/tenor_saxophone",
  "Trumpet": "https://storage.googleapis.com/magentadata/js/checkpoints/ddsp/trumpet",
};

export function resolveDdspCheckpoint(value: string, customUrl: string): string | null {
  if (customUrl.trim()) return customUrl.trim();
  return DDSP_CHECKPOINTS[value] ?? DDSP_CHECKPOINTS_EN[value] ?? null;
}

let spiceInstance: any = null;
const ddspInstances = new Map<string, any>();

export async function getSpice() {
  if (!spiceInstance) {
    try {
      const mm = await import("@magenta/music");
      spiceInstance = await withElectronFetch(async () => {
        const s = new mm.SPICE();
        await s.initialize();
        return s;
      });
    } catch (err: any) {
      throw new Error(`SPICE model failed to load: ${err?.message ?? err}`);
    }
  }
  return spiceInstance;
}

export async function getDdsp(url: string) {
  if (!ddspInstances.has(url)) {
    try {
      const mm = await import("@magenta/music");
      const ddsp = await withElectronFetch(async () => {
        const d = new mm.DDSP(url);
        await d.initialize();
        return d;
      });
      ddspInstances.set(url, ddsp);
    } catch (err: any) {
      throw new Error(`DDSP checkpoint failed to load (${url}): ${err?.message ?? err}`);
    }
  }
  return ddspInstances.get(url);
}

async function appliquerDDSP(buffer: AudioBuffer, instrument: string, customUrl: string): Promise<AudioBuffer> {
  const url = resolveDdspCheckpoint(instrument, customUrl);
  if (!url) throw new Error(`Instrument DDSP inconnu : ${instrument}`);

  const [spice, ddsp] = await Promise.all([getSpice(), getDdsp(url)]);
  const features = await spice.getAudioFeatures(buffer);
  const samples = (await ddsp.synthesize(features)) as Float32Array;

  const out = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate: OUTPUT_SR });
  out.getChannelData(0).set(samples);
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "ddsp-tone-transfer", nom: "DDSP Tone Transfer", nomEn: "DDSP Tone Transfer",
    univers: "Traitement", famille: "Effets",
    resume: "Transfère le timbre d’un audio vers un instrument par modèle DDSP (violon, flûte, saxophone, trompette).",
    resumeEn: "Transfers the timbre of an audio clip to an instrument via a DDSP model (violin, flute, saxophone, trumpet).",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Instrument", nomEn: "Instrument", type: "choix",
        options: ["Violon", "Flûte", "Saxophone ténor", "Trompette"],
        optionsEn: ["Violin", "Flute", "Tenor saxophone", "Trumpet"],
        defaut: "Violon",
        doc: "Instrument cible du transfert de timbre. Le modèle se télécharge au premier usage (~3-4 MB).",
        docEn: "Target instrument for the timbre transfer. The model downloads on first use (~3-4 MB)." },
      { nom: "URL modèle", nomEn: "Model URL", type: "texte", defaut: "",
        doc: "URL personnalisée d’un checkpoint DDSP. Si renseignée, elle remplace l’instrument choisi.",
        docEn: "Custom URL of a DDSP checkpoint. If set, it overrides the selected instrument." },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) return { valeurs: [null], erreur: true, message: "Aucun audio connecté." };
      const instrument = ctx.paramTexte("Instrument", "Violon");
      const customUrl = ctx.paramTexte("URL modèle", "");
      try {
        const out = await appliquerDDSP(buffer, instrument, customUrl);
        return { valeurs: [out], message: `Timbre DDSP · ${instrument} · ${out.duration.toFixed(1)}s · ${OUTPUT_SR} Hz` };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: `Erreur DDSP : ${err.message ?? err}` };
      }
    },
    jamaisCache: true,
  },
] as FicheAudio[]).map(avecDoc);
