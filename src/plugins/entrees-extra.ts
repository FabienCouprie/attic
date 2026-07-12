// plugins/entrees-extra.ts — Nœuds entrees-extra (issus du découpage de complements.ts).
import { enregistrer } from "../core";
import type { PluginDef } from "../core";
import {
  decoderFichier, decoderBlob,
  appliquerEchoPingPong, appliquerReverbeProgressive,
  extraireZone, reinsererZone, melangerPistes, placerSonSurZones,
  fusionnerPistes, bouclerAudio,
  genererMelodieAleatoire, genererMusiqueFractale, genererBoiteRythmes,
  genererAccords, rendreAvecEchantillon,
  bufferVersMp3Blob, analyserMidi, rendreAvecSF2,
} from "../audio";
import { parseMidi } from "midi-file";
import { sf2Chargee } from "./soundfontGlobal";
import { avecDoc } from "./notices";

for (const def of [
  {
    id: "entree-micro", nom: "Entrée micro", nomEn: "Mic input", univers: "Entrées", famille: "Audio",
    resume: "Transmet l'enregistrement micro.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom: "Périphérique", type: "texte", defaut: "" }],
    async executer(ctx: any) {
      const blob = ctx.noeud.data.enregistrementBlob;
      if (!blob) return { valeurs: [null], message: "Aucun enregistrement." };
      return { valeurs: [await decoderBlob(blob, ctx.runtime)] };
    },
  },
  {
    id: "explorateur-musique", nom: "Explorateur musique", nomEn: "Music explorer", univers: "Entrées", famille: "Audio",
    resume: "Charge un fichier audio depuis l'explorateur.",
    resumeEn: "Loads an audio file from the explorer.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom: "Chemin", nomEn: "Path", type: "texte", defaut: "music collection", docEn: "Directory to scan, relative to project folder." }],
    async executer(ctx: any) {
      const f = ctx.noeud.data.audioFichier;
      if (!f) return { valeurs: [null], message: "Aucun fichier." };
      const buf = await decoderFichier(f, ctx.runtime);
      return { valeurs: [buf] };
    },
  },
  {
    id: "chargeur-soundfont", nom: "Chargeur SoundFont", nomEn: "SoundFont Loader", univers: "Entrées", famille: "Audio",
    resume: "Joue un fichier MIDI avec un SoundFont.",
    resumeEn: "Plays a MIDI file using a SoundFont.",
    noticeEn: "Load a MIDI file and play it through the global SoundFont. Select an instrument from the dropdown. The SoundFont is loaded via the top bar.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [{ nom: "Volume", nomEn: "Volume", plage:[0,100], defaut:80, unite:"%", docEn: "Output volume." }],
    async executer(ctx: any) {
      const sf2 = sf2Chargee();
      if (!sf2) return { valeurs:[null], message:"SoundFont non chargé (barre du haut)." };
      const midi = ctx.noeud.data.midiFichier as File|undefined;
      if (!midi) return { valeurs:[null], message:"Chargez un MIDI (.mid)." };
      const vol = ctx.paramNombre("Volume",80);
      const bytes = new Uint8Array(await midi.arrayBuffer());
      const { notes } = analyserMidi(parseMidi(bytes));
      if (!notes.length) return { valeurs:[null], message:"Aucune note dans le MIDI." };
      const adapt = notes.map((n:any)=>({note:n.note,velocite:n.velociete,debut:n.debut,fin:n.fin}));
      const idx = (ctx.noeud.data as any).sf2InstrumentIdx as number|undefined;
      return { valeurs:[rendreAvecSF2(sf2, adapt, vol, idx)], message:`SF2 — ${notes.length} notes` };
    },
  },

  // ── Effets ──
] as PluginDef[]) enregistrer(avecDoc(def));
