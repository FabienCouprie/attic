// plugins/collections.ts — Nœuds collections (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";

export const fiches: FicheAudio[] = ([
  {
    id: "collection-vers-mp3", nom: "Conversion WAV→MP3", nomEn: "WAV→MP3 conversion", univers: "Collections", famille: "Conversion",
    resume: "Convertit un dossier de fichiers audio en MP3.",
    resumeEn: "Converts a folder of audio files to MP3.",
    entrees: [], sorties: [],
    parametres: [
      { nom: "Dossier entrée", nomEn: "Input folder", type: "dossier", defaut: "", defautEn: "" },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "" },
      { nom: "Qualité", nomEn: "Quality", plage: [64,320], defaut: 192, unite: "kbps" },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs:[null], message:traduire("msg.electron_requis") };
      const dIn = ctx.paramTexte("Dossier entrée","");
      const dOut = ctx.paramTexte("Dossier sortie","");
      if (!dIn || !dOut) return { valeurs:[null], message:traduire("msg.configurez_les_dossiers") };
      const fichiers = await (window as any).api.lireDossier(dIn);
      const cibles = (fichiers || []).filter((f:any) => [".wav",".wave",".ogg"].includes(f.chemin.slice(f.chemin.lastIndexOf(".")).toLowerCase()));
      if (!cibles.length) return { valeurs:[null], message:traduire("msg.aucun_wav_ogg_trouv") };
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
      return { valeurs:[null], message:traduire("msg.termin_var_0_converti_s_var_1", ok, err ? `, ${err} erreur(s)${errs.length ? " — " + errs.join(" | ") : ""}` : "") };
    },
  },
  {
    id: "collection-mp3-vers-wav", nom: "Conversion MP3→WAV", nomEn: "MP3→WAV conversion", univers: "Collections", famille: "Conversion",
    resume: "Convertit un dossier de MP3 en WAV.",
    resumeEn: "Converts a folder of MP3 files to WAV.",
    entrees: [], sorties: [],
    parametres: [
      { nom: "Dossier entrée", nomEn: "Input folder", type: "dossier", defaut: "", defautEn: "" },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "" },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs:[null], message:traduire("msg.electron_requis") };
      const dIn = ctx.paramTexte("Dossier entrée","");
      const dOut = ctx.paramTexte("Dossier sortie","");
      if (!dIn || !dOut) return { valeurs:[null], message:traduire("msg.configurez_les_dossiers") };
      const fichiers = await (window as any).api.lireDossier(dIn);
      const cibles = (fichiers || []).filter((f:any) => f.chemin.toLowerCase().endsWith(".mp3"));
      if (!cibles.length) return { valeurs:[null], message:traduire("msg.aucun_mp3_trouv") };
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
      return { valeurs:[null], message:traduire("msg.termin_var_0_converti_s_var_1", ok, err ? `, ${err} erreur(s)${errs.length ? " — " + errs.join(" | ") : ""}` : "") };
    },
  },
  {
    id: "collection-midi-vers-mp3", nom: "Conversion MIDI→MP3", nomEn: "MIDI→MP3 conversion", univers: "Collections", famille: "Conversion",
    resume: "Convertit un dossier de fichiers MIDI en MP3.",
    resumeEn: "Converts a folder of MIDI files to MP3.",
    entrees: [], sorties: [],
    parametres: [
      { nom: "Dossier entrée", nomEn: "Input folder", type: "dossier", defaut: "", defautEn: "" },
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "" },
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
      { nom: "Qualité", nomEn: "Quality", plage: [64,320], defaut: 192, unite: "kbps" },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs:[null], message:traduire("msg.electron_requis") };
      const dIn = ctx.paramTexte("Dossier entrée","");
      const dOut = ctx.paramTexte("Dossier sortie","");
      if (!dIn || !dOut) return { valeurs:[null], message:traduire("msg.configurez_les_dossiers") };
      const fichiers = await (window as any).api.lireDossier(dIn);
      const cibles = (fichiers || []).filter((f:any) => [".mid",".midi"].includes(f.chemin.slice(f.chemin.lastIndexOf(".")).toLowerCase()));
      if (!cibles.length) return { valeurs:[null], message:traduire("msg.aucun_mid_trouv") };
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse","Automatique"));
      const modeRendu: "FM/Oscillateurs"|"SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const vol = ctx.paramNombre("Volume",80);
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
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
          const buf = await rendreMidiDepuisBytes(new Uint8Array(ab), modeRendu, vol, instrument, banque);
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
      return { valeurs:[null], message:traduire("msg.termin_var_0_converti_s_var_1", ok, err ? `, ${err} erreur(s)${errs.length ? " — " + errs.join(" | ") : ""}` : "") };
    },
  },
  {
    id: "collection-lecteur-musique", nom: "Lecteur musique", nomEn: "Music player", univers: "Collections", famille: "Lecture",
    resume: "Lecteur simple pour pré-écouter un dossier de musique (shuffle, boucle, contrôle du volume).",
    resumeEn: "Simple player to preview a music folder (shuffle, loop, volume control).",
    entrees: [], sorties: [],
    affichageAutonome: true,
    jamaisCache: true,
    parametres: [
      { nom: "Chemin", nomEn: "Path", type: "dossier", defaut: "music collection", defautEn: "music collection",
        doc: "Dossier contenant les fichiers WAV/MP3 à écouter.", docEn: "Folder containing WAV/MP3 files to play." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], defaut: 80, unite: "%",
        doc: "Volume du lecteur.", docEn: "Player volume." },
      { nom: "Lecture aléatoire", nomEn: "Shuffle", type: "choix", options: ["Non", "Oui"], optionsEn: ["Off", "On"], defaut: "Non", defautEn: "Off",
        doc: "Joue les pistes dans un ordre aléatoire.", docEn: "Play tracks in random order." },
      { nom: "Lecture en boucle", nomEn: "Loop", type: "choix", options: ["Non", "Oui"], optionsEn: ["Off", "On"], defaut: "Non", defautEn: "Off",
        doc: "Répète la playlist en boucle.", docEn: "Repeat the playlist in a loop." },
      { nom: "Piste", nomEn: "Track", type: "texte", defaut: "", defautEn: "", hidden: true,
        doc: "Nom du fichier actuellement sélectionné (réservé à l'interface).", docEn: "Name of the currently selected file (reserved for the UI)." },
    ],
    async executer(ctx: any) {
      if (!(window as any).api) return { valeurs: [null], message: traduire("msg.electron_requis") };
      const chemin = ctx.paramTexte("Chemin", "music collection").replace(/^[/\\]+|[/\\]+$/g, "");
      if (!chemin) return { valeurs: [null], message: traduire("msg.configurez_les_dossiers") };
      return { valeurs: [null], message: traduire("msg.lecteur_musique") };
    },
  },
] as FicheAudio[]).map(avecDoc);
