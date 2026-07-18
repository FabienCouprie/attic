// plugins/sorties.ts — Nœuds de sortie

import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { rendreMidi } from "../audio";

export const fiches: FicheAudio[] = ([
  {
    id: "sortie-audio", nom: "Sortie audio", nomEn: "Audio output", univers: "Sorties", famille: "Écoute",
    resume: "Point d'écoute final. Joue le signal reçu et permet l'export.",
    resumeEn: "Final output. Plays the received signal and enables export.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Durée", type: "controle" }],
    parametres: [
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 100, unite: "%" },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null, null], message: "Aucune entrée." };
      const vol = ctx.paramNombre("Volume", 100);
      if (vol >= 100) return { valeurs: [audio, { debut: 0, duree: audio.duration }] };
      const buf = new AudioBuffer({ numberOfChannels: audio.numberOfChannels, length: audio.length, sampleRate: audio.sampleRate });
      const g = vol / 100;
      for (let c = 0; c < audio.numberOfChannels; c++) {
        const src = audio.getChannelData(c), dst = buf.getChannelData(c);
        for (let i = 0; i < audio.length; i++) dst[i] = src[i] * g;
      }
      return { valeurs: [buf, { debut: 0, duree: buf.duration }] };
    },
  },
  {
    id: "sortie-midi", nom: "Sortie MIDI", nomEn: "MIDI output", univers: "Sorties", famille: "Écoute",
    resume: "Reçoit un fichier MIDI, le synthétise en audio et le transmet.",
    resumeEn: "Receives a MIDI file, synthesizes it to audio and passes it along.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }, { nom: "Durée", type: "controle" }],
    parametres: [
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["FM/Oscillateurs","SoundFont"], defaut: "FM/Oscillateurs" },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null, null], message: "Aucun fichier MIDI." };
      const mode = ctx.paramTexte("Synthèse", "FM/Oscillateurs") as "FM/Oscillateurs" | "SoundFont";
      const volume = ctx.paramNombre("Volume", 80);
      const buffer = await rendreMidi(fichier, mode, volume);
      return { valeurs: [buffer, fichier, { debut: 0, duree: buffer.duration }] };
    },
  },
  {
    id: "lecteur-midi", nom: "Lecteur MIDI", nomEn: "MIDI Player", univers: "Entrées", famille: "Audio",
    resume: "Lit un fichier MIDI depuis l'inspecteur et le synthétise + transmet le MIDI.",
    resumeEn: "Loads a MIDI file from the inspector, synthesizes it and passes the MIDI along.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["FM/Oscillateurs","SoundFont"], defaut: "FM/Oscillateurs", docEn: "Synthesis engine. FM = local, SoundFont = remote." },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const midi = ctx.noeud.data.midiFichier as File | undefined;
      if (!midi) return { valeurs: [null, null], message: "Chargez un fichier MIDI." };
      const mode = ctx.paramTexte("Synthèse", "FM/Oscillateurs") as "FM/Oscillateurs" | "SoundFont";
      const volume = ctx.paramNombre("Volume", 80);
      const buffer = await rendreMidi(midi, mode, volume);
      return { valeurs: [buffer, midi] };
    },
  },
  {
    id: "point-ecoute-midi", nom: "Point d'écoute MIDI", nomEn: "MIDI Listening Point", univers: "Sorties", famille: "Écoute",
    resume: "Auditionne le MIDI sans interrompre la chaîne.",
    resumeEn: "Auditions the MIDI without interrupting the chain.",
    entrees: [{ nom: "MIDI", type: "midi", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["FM/Oscillateurs","SoundFont"], defaut: "FM/Oscillateurs", docEn: "Synthesis engine." },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const midi = ctx.entree(0);
      if (!(midi instanceof File)) return { valeurs: [null, null], message: "Aucun MIDI." };
      const mode = ctx.paramTexte("Synthèse", "FM/Oscillateurs") as "FM/Oscillateurs" | "SoundFont";
      const volume = ctx.paramNombre("Volume", 80);
      const buffer = await rendreMidi(midi, mode, volume);
      return { valeurs: [buffer, midi] };
    },
  },
] as FicheAudio[]).map(avecDoc);
