// plugins/collections.ts — Nœuds collections (issus du découpage de complements.ts).

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

export const fiches: PluginDef[] = ([
  {
    id: "collection-vers-mp3", nom: "Conversion WAV→MP3", nomEn: "WAV→MP3 conversion", univers: "Collections", famille: "Conversion",
    resume: "Convertit un dossier de fichiers audio en MP3.",
    resumeEn: "Converts a folder of audio files to MP3.",
    entrees: [], sorties: [],
    parametres: [
      { nom: "Dossier entrée", nomEn: "Input folder", type: "dossier", defaut: "" },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "" },
      { nom: "Qualité", nomEn: "Quality", plage: [64,320], defaut: 192, unite: "kbps" },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs:[null], message:"Electron requis." };
      const dIn = ctx.paramTexte("Dossier entrée","");
      const dOut = ctx.paramTexte("Dossier sortie","");
      if (!dIn || !dOut) return { valeurs:[null], message:"Configurez les dossiers." };
      const fichiers = await (window as any).api.lireDossier(dIn);
      const cibles = (fichiers || []).filter((f:any) => [".wav",".wave",".ogg"].includes(f.chemin.slice(f.chemin.lastIndexOf(".")).toLowerCase()));
      if (!cibles.length) return { valeurs:[null], message:"Aucun .wav/.ogg trouvé." };
      const qualite = ctx.paramNombre("Qualité",192);
      let ok = 0, err = 0;
      const errs: string[] = [];
      for (const f of cibles) {
        try {
          const lu = await (window as any).api.lireFichierAudio(f.chemin);
          if (!lu || !lu.url) { err++; errs.push(f.nom + ": pas de données IPC"); continue; }
          const rep = await fetch(lu.url);
          const ab = await rep.arrayBuffer();
          const actx = new AudioContext();
          const buf = await actx.decodeAudioData(ab);
          actx.close();
          const { bufferVersMp3Blob } = await import("../audio");
          const blob = await bufferVersMp3Blob(buf, qualite);
          const arr = await blob.arrayBuffer();
          await (window as any).api.ecrireFichier(dOut.replace(/\\$/,"")+"\\"+f.nom.replace(/\.[^.]+$/,"")+".mp3", arr);
          ok++;
        } catch (e: any) {
          err++;
          errs.push(f.nom + ": " + (e?.message ?? String(e)));
        }
      }
      return { valeurs:[null], message:`Terminé : ${ok} converti(s)${err ? `, ${err} erreur(s)${errs.length ? " — " + errs.join(" | ") : ""}` : ""}.` };
    },
  },
  {
    id: "collection-mp3-vers-wav", nom: "Conversion MP3→WAV", nomEn: "MP3→WAV conversion", univers: "Collections", famille: "Conversion",
    resume: "Convertit un dossier de MP3 en WAV.",
    resumeEn: "Converts a folder of MP3 files to WAV.",
    entrees: [], sorties: [],
    parametres: [
      { nom: "Dossier entrée", nomEn: "Input folder", type: "dossier", defaut: "" },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "" },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs:[null], message:"Electron requis." };
      const dIn = ctx.paramTexte("Dossier entrée","");
      const dOut = ctx.paramTexte("Dossier sortie","");
      if (!dIn || !dOut) return { valeurs:[null], message:"Configurez les dossiers." };
      const fichiers = await (window as any).api.lireDossier(dIn);
      const cibles = (fichiers || []).filter((f:any) => f.chemin.toLowerCase().endsWith(".mp3"));
      if (!cibles.length) return { valeurs:[null], message:"Aucun .mp3 trouvé." };
      let ok = 0, err = 0;
      const errs: string[] = [];
      for (const f of cibles) {
        try {
          const lu = await (window as any).api.lireFichierAudio(f.chemin);
          if (!lu || !lu.url) { err++; errs.push(f.nom + ": pas de données IPC"); continue; }
          const rep = await fetch(lu.url);
          const ab = await rep.arrayBuffer();
          const actx = new AudioContext();
          const buf = await actx.decodeAudioData(ab);
          actx.close();
          const { bufferVersWavBlob } = await import("../audio");
          const blob = bufferVersWavBlob(buf);
          const arr = await blob.arrayBuffer();
          await (window as any).api.ecrireFichier(dOut.replace(/\\$/,"")+"\\"+f.nom.replace(/\.mp3$/,"")+".wav", arr);
          ok++;
        } catch (e: any) {
          err++;
          ctx.onProgress?.(f.nom + " > " + (e?.message ?? String(e)));
        }
      }
      return { valeurs:[null], message:`Terminé : ${ok} converti(s)${err ? `, ${err} erreur(s)${errs.length ? " — " + errs.join(" | ") : ""}` : ""}.` };
    },
  },
  {
    id: "collection-midi-vers-mp3", nom: "Conversion MIDI→MP3", nomEn: "MIDI→MP3 conversion", univers: "Collections", famille: "Conversion",
    resume: "Convertit un dossier de fichiers MIDI en MP3.",
    resumeEn: "Converts a folder of MIDI files to MP3.",
    entrees: [], sorties: [],
    parametres: [
      { nom: "Dossier entrée", nomEn: "Input folder", type: "dossier", defaut: "" },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "" },
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["FM/Oscillateurs","SoundFont"], defaut: "FM/Oscillateurs" },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
      { nom: "Qualité", nomEn: "Quality", plage: [64,320], defaut: 192, unite: "kbps" },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs:[null], message:"Electron requis." };
      const dIn = ctx.paramTexte("Dossier entrée","");
      const dOut = ctx.paramTexte("Dossier sortie","");
      if (!dIn || !dOut) return { valeurs:[null], message:"Configurez les dossiers." };
      const fichiers = await (window as any).api.lireDossier(dIn);
      const cibles = (fichiers || []).filter((f:any) => [".mid",".midi"].includes(f.chemin.slice(f.chemin.lastIndexOf(".")).toLowerCase()));
      if (!cibles.length) return { valeurs:[null], message:"Aucun .mid trouvé." };
      const mode = ctx.paramTexte("Synthèse","FM/Oscillateurs") as "FM/Oscillateurs"|"SoundFont";
      const vol = ctx.paramNombre("Volume",80);
      const qualite = ctx.paramNombre("Qualité",192);
      let ok = 0, err = 0;
      const errs: string[] = [];
      for (const f of cibles) {
        try {
          const lu = await (window as any).api.lireFichierAudio(f.chemin);
          if (!lu || !lu.url) { err++; errs.push(f.nom + ": pas de données"); continue; }
          const rep = await fetch(lu.url);
          const ab = await rep.arrayBuffer();
          const { rendreMidiDepuisBytes } = await import("../audio");
          const buf = await rendreMidiDepuisBytes(new Uint8Array(ab), mode, vol);
          const { bufferVersMp3Blob } = await import("../audio");
          const blob = await bufferVersMp3Blob(buf, qualite);
          const arr = await blob.arrayBuffer();
          await (window as any).api.ecrireFichier(dOut.replace(/\\$/,"")+"\\"+f.nom.replace(/\.[^.]+$/,"")+".mp3", arr);
          ok++;
        } catch (e: any) {
          err++;
          errs.push(f.nom + ": " + (e?.message ?? String(e)));
        }
      }
      return { valeurs:[null], message:`Terminé : ${ok} converti(s)${err ? `, ${err} erreur(s)${errs.length ? " — " + errs.join(" | ") : ""}` : ""}.` };
    },
  },
] as PluginDef[]).map(avecDoc);
