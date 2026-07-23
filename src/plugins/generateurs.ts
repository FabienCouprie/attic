// plugins/generateurs.ts — Nœuds generateurs (issus du découpage de complements.ts).

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import {
  decoderFichier, decoderBlob,
  genererMelodieAleatoire, genererMusiqueFractale, genererBoiteRythmes,
  genererAccords, rendreAvecEchantillon,
  analyserMidi, rendreAvecSF2, genererBruit,
  genererAudioFormule, notesVersFichierMidi, rendreSequence,
  rendreAttracteurImage, rendreAttracteurImageEtAudio, normaliserTypeAttracteur,
  genererRythmeCantor,
  genererMusiqueMandelbrot,
  genererArpegeKoch,
  rendreSpectrogrammeFractal,
} from "../audio";
import { parseMidi } from "midi-file";
import { sf2Chargee, normaliserModeSynthèse } from "./soundfontGlobal";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "generateur-accords", nom: "Générateur d'accords", nomEn: "Chord Generator", univers: "Entrées", famille: "Génération",
    resume: "Génère une progression d'accords.",
    resumeEn: "Generates a chord progression.",
    noticeEn: "Produces a sequence of chords based on the key, scale and genre. Each chord is voiced across 3 octaves with arpeggiation.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C", optionsEn: ["1/4", "1/8", "1/16", "Blues", "Classical", "Electronic", "Hip-hop", "Reggae", "Ambient", "A", "A#", "B"], defautEn: "1/4" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur"], defaut: "majeur", optionsEn: ["Major", "minor"], defautEn: "major" },
      { nom: "Genre", nomEn: "Genre", type: "choix", options: ["pop","rock","jazz","blues","classique","electro","hip-hop","reggae","ambient","personnalisé"], optionsEn: ["Pop","Rock","Jazz","Blues","Classical","Electronic","Hip-hop","Reggae","Ambient","Custom"], defaut: "pop", docEn: "Style determines the chord progression.", defautEn: "pop" },
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I-IV-V-I", docEn: "Custom progression in Roman numerals. I=tonic, IV=subdominant, V=dominant. Ex: I-IV-V-I, ii-V-I, I-V-vi-IV.", defautEn: "I-IV-V-I" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40,240], defaut: 120, unite: "BPM" },
      { nom: "Durée par accord", nomEn: "Chord duration", plage: [1,8], pas: 1, defaut: 2, unite: "temps", docEn: "Duration per chord in beats." },
      { nom: "Nombre d'accords", nomEn: "Chord count", plage: [2,32], pas: 1, defaut: 8, docEn: "Total number of chords." },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const cle = ctx.paramTexte("Clé","C"), gamme = ctx.paramTexte("Gamme","majeur");
      const genre = ctx.paramTexte("Genre","pop"), prog = ctx.paramTexte("Progression","I-IV-V-I");
      const tempo = ctx.paramNombre("Tempo",120), dAcc = ctx.paramNombre("Durée par accord",2);
      const nb = ctx.paramNombre("Nombre d'accords",8), vol = ctx.paramNombre("Volume",80);
      const { midiBytes, description } = genererAccords(cle, gamme, genre, prog, tempo, dAcc, nb);
      const sf2 = sf2Chargee();
      if (sf2) {
        const { notes, canauxInstrument } = analyserMidi(parseMidi(midiBytes));
        const sr = 44100, dTot = notes.reduce((m:number,n:any)=>Math.max(m,n.fin),0)+1;
        const master = new AudioBuffer({numberOfChannels:2,length:Math.ceil(dTot*sr),sampleRate:sr});
        for (const canal of [0,1]) {
          const nc = notes.filter((n:any)=>n.canal===canal);
          if (!nc.length) continue;
          const progGM = canauxInstrument.get(canal)??0;
          const idx = progGM < sf2.instruments.length ? progGM : undefined;
          const an = nc.map((n:any)=>({note:n.note,velocite:n.velociete,debut:n.debut,fin:n.fin}));
          const layer = rendreAvecSF2(sf2, an, vol, idx);
          for (let i=0;i<master.length&&i<layer.length;i++) {
            master.getChannelData(0)[i] += layer.getChannelData(0)[i];
            master.getChannelData(1)[i] += layer.getChannelData(1)[i];
          }
        }
        return { valeurs:[master], message:traduire("msg.var_0_soundfont", description) };
      }
      const { rendreMidiDepuisBytes } = await import("../audio");
      return { valeurs:[await rendreMidiDepuisBytes(midiBytes,"FM/Oscillateurs",vol)], message:traduire("msg.var_0_fm", description) };
    },
  },
  {
    id: "melodie-aleatoire", nom: "Mélodie aléatoire", nomEn: "Random Melody", univers: "Entrées", famille: "Génération",
    resume: "Génère une mélodie aléatoire.",
    resumeEn: "Generates a random melody.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom:"Clé", nomEn:"Key", type:"choix", options:["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], defaut:"Do", optionsEn: ["Rock", "Four-on-the-floor", "Funk", "Hip-hop", "Jazz", "Reggae", "Samba", "House", "Techno", "Drum & Bass", "Trap", "Disco"], defautEn: "C" },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options:["Majeur","Mineur naturel","Mineur harmonique","Pentatonique majeure","Pentatonique mineure"], defaut:"Majeur", optionsEn: ["Major", "Natural minor", "Harmonic minor", "Major pentatonic", "Minor pentatonic"], defautEn: "Major" },
      { nom:"Signature temporelle", nomEn:"Time signature", type:"choix", options:["4/4","3/4","6/8"], defaut:"4/4", optionsEn: ["Click", "Woodblock", "6/8"], defautEn: "4/4" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:100, unite:"BPM" },
      { nom:"Mesures", nomEn:"Bars", plage:[1,32], pas:1, defaut:4 },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
      { nom:"Synthèse", nomEn:"Synthesis", type:"choix", options:["Automatique", "FM/Oscillateurs", "SoundFont"], optionsEn:["Auto", "FM/Oscillators", "SoundFont"], defaut:"Automatique", defautEn:"Auto",
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
    ],
    async executer(ctx: any) {
      console.log("[attic] Mélodie aléatoire : exécution démarrée");
      const tempo = ctx.paramNombre("Tempo",100);
      const { audio, notes } = await genererMelodieAleatoire(ctx.paramTexte("Clé","Do"),ctx.paramTexte("Gamme","Majeur"),ctx.paramTexte("Signature temporelle","4/4"),tempo,ctx.paramNombre("Mesures",4));
      const midiFile = notesVersFichierMidi(notes, tempo);
      const volume = ctx.paramNombre("Volume",80);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const useSf2 = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());
      console.log(`[attic] Mélodie aléatoire : mode=${mode}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, notes=${notes.length}`);
      const audioFinal = useSf2
        ? await rendreSequence(notes, "SoundFont", volume)
        : audio;
      console.log(`[attic] Mélodie aléatoire : audioFinal durée=${audioFinal?.duration ?? 0}`);
      return { valeurs: [audioFinal, midiFile] };
    },
  },
  {
    id: "generateur-fractal", nom: "Musique fractale", nomEn: "Fractal Music", univers: "Entrées", famille: "Génération",
    resume: "Génère de la musique fractale.",
    resumeEn: "Generates fractal music.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom:"Motif", nomEn:"Motif", type:"choix", options:["Triade M","Triade m","Arpège 7","Cantus firmus","Personnalisé"], optionsEn:["Major triad","Minor triad","7th arpeggio","Cantus firmus","Custom"], defaut:"Triade M", defautEn: "Major triad" },
      { nom:"Intervalles", nomEn:"Intervals", type:"texte", defaut:"0,3,7,10", defautEn: "0.3.7.10" },
      { nom:"Profondeur", nomEn:"Depth", plage:[1,6], pas:1, defaut:3 },
      { nom:"Durée", nomEn:"Duration", plage:[2,60], defaut:8, unite:"s" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:80, unite:"BPM" },
      { nom:"Clé", nomEn:"Key", type:"choix", options:["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], defaut:"Do", optionsEn: ["Rock", "Four-on-the-floor", "Funk", "Hip-hop", "Jazz", "Reggae", "Samba", "House", "Techno", "Drum & Bass", "Trap", "Disco"], defautEn: "C" },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options:["Majeur","Mineur naturel","Mineur harmonique","Pentatonique majeure","Pentatonique mineure"], defaut:"Majeur", optionsEn: ["Major", "Natural minor", "Harmonic minor", "Major pentatonic", "Minor pentatonic"], defautEn: "Major" },
      { nom:"Timbre", nomEn:"Timbre", type:"choix", options:["Douce","Brillante","Percutante"], defaut:"Douce", optionsEn: ["Soft", "Bright", "Percussive"], defautEn: "Soft" },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
      { nom:"Synthèse", nomEn:"Synthesis", type:"choix", options:["Automatique", "FM/Oscillateurs", "SoundFont"], optionsEn:["Auto", "FM/Oscillators", "SoundFont"], defaut:"Automatique", defautEn:"Auto",
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
    ],
    async executer(ctx: any) {
      console.log("[attic] Musique fractale : exécution démarrée");
      const tempo = ctx.paramNombre("Tempo",80);
      const { audio, notes } = await genererMusiqueFractale(ctx.paramTexte("Motif","Triade M"),ctx.paramTexte("Intervalles","0,3,7,10"),ctx.paramNombre("Profondeur",3),ctx.paramNombre("Durée",8),tempo,ctx.paramTexte("Clé","Do"),ctx.paramTexte("Gamme","Majeur"),ctx.paramTexte("Timbre","Douce"));
      const midiFile = notesVersFichierMidi(notes, tempo);
      const volume = ctx.paramNombre("Volume",80);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const useSf2 = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());
      console.log(`[attic] Musique fractale : mode=${mode}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, notes=${notes.length}`);
      const audioFinal = useSf2
        ? await rendreSequence(notes, "SoundFont", volume)
        : audio;
      console.log(`[attic] Musique fractale : audioFinal durée=${audioFinal?.duration ?? 0}`);
      return { valeurs: [audioFinal, midiFile] };
    },
  },
  {
    id: "mappeur-mandelbrot", nom: "Mappeur Mandelbrot", nomEn: "Mandelbrot Mapper", univers: "Entrées", famille: "Génération",
    resume: "Génère une mélodie depuis l'ensemble de Mandelbrot.",
    resumeEn: "Generates a melody from the Mandelbrot set.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Centre X", nomEn: "Center X", type: "nombre", plage: [-2.5, 1], pas: 0.01, defaut: -0.5 },
      { nom: "Centre Y", nomEn: "Center Y", type: "nombre", plage: [-1.5, 1.5], pas: 0.01, defaut: 0 },
      { nom: "Zoom", nomEn: "Zoom", type: "nombre", plage: [0.1, 100], pas: 0.1, defaut: 1 },
      { nom: "Itérations max", nomEn: "Max iterations", type: "nombre", plage: [50, 2000], pas: 10, defaut: 200 },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Escape time", "Dwell", "Octave"], optionsEn: ["Escape time", "Dwell", "Octave"], defaut: "Escape time", defautEn: "Escape time" },
      { nom: "Notes", nomEn: "Notes", type: "nombre", plage: [8, 256], pas: 1, defaut: 32, unite: "notes" },
      { nom: "Durée note", nomEn: "Note duration", type: "nombre", plage: [0.05, 1], pas: 0.05, defaut: 0.25, unite: "s" },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 100, unite: "BPM" },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], defaut: "Do", optionsEn: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["Majeur","Mineur naturel","Mineur harmonique","Pentatonique majeure","Pentatonique mineure","Chromatique"], defaut: "Majeur", optionsEn: ["Major","Natural minor","Harmonic minor","Major pentatonic","Minor pentatonic","Chromatic"], defautEn: "Major" },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [1, 6], pas: 1, defaut: 4 },
      { nom: "Sensibilité", nomEn: "Sensitivity", type: "nombre", plage: [0.1, 5], pas: 0.1, defaut: 1 },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Douce","Brillante","Percutante"], defaut: "Douce", optionsEn: ["Soft","Bright","Percussive"], defautEn: "Soft" },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0,100], defaut: 80, unite: "%" },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42 },
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["Automatique", "FM/Oscillateurs", "SoundFont"], optionsEn: ["Auto", "FM/Oscillators", "SoundFont"], defaut: "Automatique", defautEn: "Auto",
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
    ],
    async executer(ctx: any) {
      const cx = ctx.paramNombre("Centre X", -0.5);
      const cy = ctx.paramNombre("Centre Y", 0);
      const zoom = ctx.paramNombre("Zoom", 1);
      const width = 3.5 / Math.max(0.1, zoom);
      const height = 2.5 / Math.max(0.1, zoom);
      const { audio, midiFile } = await genererMusiqueMandelbrot({
        xMin: cx - width / 2,
        xMax: cx + width / 2,
        yMin: cy - height / 2,
        yMax: cy + height / 2,
        maxIter: ctx.paramNombre("Itérations max", 200),
        mode: ctx.paramTexte("Mode", "Escape time").toLowerCase().split(" ")[0] as any,
        nbNotes: ctx.paramNombre("Notes", 32),
        dureeNote: ctx.paramNombre("Durée note", 0.25),
        tempo: ctx.paramNombre("Tempo", 100),
        cle: ctx.paramTexte("Clé", "Do"),
        gamme: ctx.paramTexte("Gamme", "Majeur"),
        octaveBase: ctx.paramNombre("Octave", 4) * 12,
        sensibilite: ctx.paramNombre("Sensibilité", 1),
        timbre: ctx.paramTexte("Timbre", "Douce") as any,
        volume: ctx.paramNombre("Volume", 80),
        graine: ctx.paramNombre("Graine", 42),
      }, ctx.paramTexte("Synthèse", "Automatique") as any);
      return { valeurs: [audio, midiFile], message: `Mandelbrot · ${ctx.paramTexte("Mode", "Escape time")} · ${audio.duration.toFixed(1)} s` };
    },
  },
  {
    id: "arpege-koch", nom: "Arpège flocon de Koch", nomEn: "Koch Snowflake Arpeggiator", univers: "Entrées", famille: "Génération",
    resume: "Génère un arpège polyrythmique depuis le flocon de Koch.",
    resumeEn: "Generates a polyrhythmic arpeggio from the Koch snowflake.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], defaut: "Do", optionsEn: ["C","C#","D","Eb","E","F","F#","G","G#","A","Bb","B"], defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["Majeur","Mineur naturel","Mineur harmonique","Pentatonique majeure","Pentatonique mineure","Chromatique"], defaut: "Majeur", optionsEn: ["Major","Natural minor","Harmonic minor","Major pentatonic","Minor pentatonic","Chromatic"], defautEn: "Major" },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [1, 6], pas: 1, defaut: 4 },
      { nom: "Accord", nomEn: "Chord", type: "choix", options: ["Majeur","Mineur","Augmenté","Diminué","Sus4"], defaut: "Majeur", optionsEn: ["Major","Minor","Augmented","Diminished","Sus4"], defautEn: "Major" },
      { nom: "Profondeur", nomEn: "Depth", type: "nombre", plage: [1, 6], pas: 1, defaut: 3, doc: "Nombre de subdivisions récursives du flocon de Koch.", docEn: "Number of recursive subdivisions of the Koch snowflake." },
      { nom: "Direction", nomEn: "Direction", type: "choix", options: ["alternée","extérieure","intérieure"], defaut: "alternée", optionsEn: ["alternating","outward","inward"], defautEn: "alternating", doc: "Sens des pics de Koch sur chaque voix.", docEn: "Direction of the Koch peaks on each voice." },
      { nom: "Hauteur", nomEn: "Height", type: "nombre", plage: [1, 12], pas: 1, defaut: 3, unite: "demi-tons", docEn: "Height of the Koch bump in semitones.", doc: "Hauteur du pic de Koch en demi-tons." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 100, unite: "BPM" },
      { nom: "Mesures", nomEn: "Bars", type: "nombre", plage: [1, 8], pas: 1, defaut: 2, unite: "mesures" },
      { nom: "Durée note", nomEn: "Note duration", type: "nombre", plage: [0.05, 1], pas: 0.05, defaut: 0.25, unite: "s" },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Douce","Brillante","Percutante"], defaut: "Douce", optionsEn: ["Soft","Bright","Percussive"], defautEn: "Soft" },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0,100], defaut: 80, unite: "%" },
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["Automatique", "FM/Oscillateurs", "SoundFont"], optionsEn: ["Auto", "FM/Oscillators", "SoundFont"], defaut: "Automatique", defautEn: "Auto",
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
    ],
    async executer(ctx: any) {
      const { audio, midiFile } = await genererArpegeKoch({
        cle: ctx.paramTexte("Clé", "Do"),
        gamme: ctx.paramTexte("Gamme", "Majeur"),
        octave: ctx.paramNombre("Octave", 4),
        accord: ctx.paramTexte("Accord", "Majeur") as any,
        profondeur: ctx.paramNombre("Profondeur", 3),
        direction: ctx.paramTexte("Direction", "alternée") as any,
        hauteur: ctx.paramNombre("Hauteur", 3),
        tempo: ctx.paramNombre("Tempo", 100),
        mesures: ctx.paramNombre("Mesures", 2),
        dureeNote: ctx.paramNombre("Durée note", 0.25),
        timbre: ctx.paramTexte("Timbre", "Douce") as any,
        volume: ctx.paramNombre("Volume", 80),
      }, ctx.paramTexte("Synthèse", "Automatique") as any);
      return { valeurs: [audio, midiFile], message: `Koch · ${ctx.paramTexte("Accord", "Majeur")} · ${audio.duration.toFixed(1)} s` };
    },
  },
  {
    id: "spectrogramme-fractal", nom: "Spectrogramme fractal", nomEn: "Fractal Spectrogram", univers: "Entrées", famille: "Génération",
    resume: "Génère un spectrogramme fractal et son audio associé.",
    resumeEn: "Generates a fractal spectrogram and its associated audio.",
    entrees: [], sorties: [{ nom: "Image", type: "image" }, { nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.5, 30], pas: 0.5, defaut: 4, unite: "s" },
      { nom: "FFT", nomEn: "FFT", type: "choix", options: ["512", "1024", "2048", "4096"], defaut: "2048", optionsEn: ["512", "1024", "2048", "4096"], defautEn: "2048" },
      { nom: "Octaves", nomEn: "Octaves", type: "nombre", plage: [1, 8], pas: 1, defaut: 4, doc: "Nombre d'octaves de bruit fractal.", docEn: "Number of fractal noise octaves." },
      { nom: "Rugosité", nomEn: "Roughness", type: "nombre", plage: [0, 1], pas: 0.05, defaut: 0.5, doc: "Influence des hautes fréquences du bruit (0 = lisse, 1 = rugueux).", docEn: "Influence of high-frequency noise (0 = smooth, 1 = rough)." },
      { nom: "Échelle", nomEn: "Scale", type: "choix", options: ["Logarithmique", "Linéaire"], defaut: "Logarithmique", optionsEn: ["Logarithmic", "Linear"], defautEn: "Logarithmic" },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42 },
      { nom: "Format", nomEn: "Format", type: "choix", options: ["PNG", "JPEG"], defaut: "PNG", optionsEn: ["PNG", "JPEG"], defautEn: "PNG" },
    ],
    async executer(ctx: any) {
      const fftSize = parseInt(ctx.paramTexte("FFT", "2048"), 10);
      const { audio, image } = await rendreSpectrogrammeFractal({
        duree: ctx.paramNombre("Durée", 4),
        fftSize,
        octaves: ctx.paramNombre("Octaves", 4),
        roughness: ctx.paramNombre("Rugosité", 0.5),
        forme: ctx.paramTexte("Échelle", "Logarithmique").toLowerCase() as any,
        graine: ctx.paramNombre("Graine", 42),
      });
      const fmt = ctx.paramTexte("Format", "PNG");
      if (image && fmt === "JPEG") {
        // Convert PNG to JPEG by re-encoding via canvas.
        const url = URL.createObjectURL(image);
        const img = new Image();
        img.src = url;
        await new Promise((res) => { img.onload = res; });
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const c = canvas.getContext("2d");
        c?.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
        URL.revokeObjectURL(url);
        const jpeg = blob ? new File([blob], "spectrogramme-fractal.jpg", { type: "image/jpeg" }) : image;
        return { valeurs: [jpeg, audio], message: `Spectrogramme fractal · ${audio.duration.toFixed(1)} s` };
      }
      return { valeurs: [image ?? null, audio], message: `Spectrogramme fractal · ${audio.duration.toFixed(1)} s` };
    },
  },
  {
    id: "attracteur-ifs", nom: "Attracteur / IFS", nomEn: "Attractor / IFS", univers: "Visualisation", famille: "Analyse",
    resume: "Rend un attracteur chaotique ou un IFS en image + audio.",
    resumeEn: "Renders a chaotic attractor or IFS as image + audio.",
    entrees: [], sorties: [{ nom: "Image", type: "image" }, { nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Attracteur", nomEn: "Attractor", type: "choix", options: ["Lorenz", "Rössler", "Hénon", "Ikeda", "Barnsley", "Sierpiński"], optionsEn: ["Lorenz", "Rossler", "Henon", "Ikeda", "Barnsley", "Sierpinski"], defaut: "Lorenz", defautEn: "Lorenz" },
      { nom: "Itérations", nomEn: "Iterations", type: "nombre", plage: [10000, 1000000], pas: 1000, defaut: 200000, unite: "pts" },
      { nom: "Largeur", nomEn: "Width", type: "nombre", plage: [256, 4096], pas: 1, defaut: 1024, unite: "px" },
      { nom: "Hauteur", nomEn: "Height", type: "nombre", plage: [256, 4096], pas: 1, defaut: 1024, unite: "px" },
      { nom: "Palette", nomEn: "Palette", type: "choix", options: ["classic", "magma", "inferno", "viridis", "gray", "claw"], defaut: "classic", optionsEn: ["classic", "magma", "inferno", "viridis", "gray", "claw"], defautEn: "classic" },
      { nom: "Projection", nomEn: "Projection", type: "choix", options: ["XY", "XZ", "YZ", "3D shadow"], optionsEn: ["XY", "XZ", "YZ", "3D shadow"], defaut: "XY", defautEn: "XY" },
      { nom: "Exposition", nomEn: "Exposure", type: "nombre", plage: [0.1, 5], pas: 0.1, defaut: 1.5 },
      { nom: "Gamma", nomEn: "Gamma", type: "nombre", plage: [0.1, 3], pas: 0.1, defaut: 1 },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42 },
      { nom: "Format", nomEn: "Format", type: "choix", options: ["PNG", "JPEG"], optionsEn: ["PNG", "JPEG"], defaut: "PNG", defautEn: "PNG" },
      { nom: "Durée audio", nomEn: "Audio duration", type: "nombre", plage: [1, 30], pas: 0.5, defaut: 4, unite: "s" },
      { nom: "Fréquence base", nomEn: "Base frequency", type: "nombre", plage: [20, 2000], pas: 1, defaut: 220, unite: "Hz" },
      { nom: "Plage hauteur", nomEn: "Pitch range", type: "nombre", plage: [0, 48], pas: 1, defaut: 24, unite: "demi-tons" },
      { nom: "Décimation audio", nomEn: "Audio decimation", type: "nombre", plage: [1, 100], pas: 1, defaut: 1, unite: "pts/éch" },
      { nom: "Volume audio", nomEn: "Audio volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const type = ctx.paramTexte("Attracteur", "Lorenz");
      const typeNormalise = normaliserTypeAttracteur(type);
      if (!typeNormalise) {
        return { valeurs: [null, null], message: `${type}: type d'attracteur inconnu` };
      }
      const projection = ctx.paramTexte("Projection", "XY").toLowerCase().replace(/\s+/g, "-");
      const projectionValide = ["xy", "xz", "yz", "3d-shadow"].includes(projection) ? projection as any : "xy";
      const { image, audio } = await rendreAttracteurImageEtAudio(
        {
          type: typeNormalise,
          iterations: ctx.paramNombre("Itérations", 200000),
          width: Math.round(ctx.paramNombre("Largeur", 1024)),
          height: Math.round(ctx.paramNombre("Hauteur", 1024)),
          palette: ctx.paramTexte("Palette", "classic"),
          projection: projectionValide,
          exposure: ctx.paramNombre("Exposition", 1.5),
          gamma: ctx.paramNombre("Gamma", 1),
          graine: ctx.paramNombre("Graine", 42),
        },
        {
          duree: ctx.paramNombre("Durée audio", 4),
          frequenceBase: ctx.paramNombre("Fréquence base", 220),
          plageDemiTons: ctx.paramNombre("Plage hauteur", 24),
          decimation: Math.max(1, Math.round(ctx.paramNombre("Décimation audio", 1))),
          volume: ctx.paramNombre("Volume audio", 80),
        },
        ctx.paramTexte("Format", "PNG").toLowerCase() as any
      );
      return {
        valeurs: [image, audio],
        message: traduire("msg.attracteur.termine", type, `${image.size.toLocaleString()} o · ${audio.duration.toFixed(1)} s`),
      };
    },
  },
  {
    id: "boite-rythmes", nom: "Boîte à rythmes", nomEn: "Drum Machine", univers: "Entrées", famille: "Génération",
    resume: "Génère une piste rythmique.",
    resumeEn: "Generates a drum pattern.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:120, unite:"BPM" },
      { nom:"Patron", nomEn:"Pattern", type:"choix", options:["Rock","Four-on-the-floor","Funk","Hip-hop","Jazz","Reggae","Samba","House","Techno","Drum & Bass","Trap","Disco","Personnalisé"], optionsEn:["Rock","Four-on-the-floor","Funk","Hip-hop","Jazz","Reggae","Samba","House","Techno","Drum & Bass","Trap","Disco","Custom"], defaut:"Rock", defautEn: "Rock" },
      { nom:"Code personnalisé", nomEn:"Custom code", type:"texte", defaut:"", defautEn: "" },
      { nom:"Mesures", nomEn:"Bars", plage:[1,8], pas:1, defaut:2 },
      { nom:"Kick", nomEn:"Kick", plage:[0,100], defaut:80, unite:"%" },
      { nom:"Caisse claire", nomEn:"Snare", plage:[0,100], defaut:70, unite:"%" },
      { nom:"Charley", nomEn:"Hi-hat", plage:[0,100], defaut:60, unite:"%" },
    ],
    async executer(ctx: any) {
      return { valeurs: [await genererBoiteRythmes(ctx.paramNombre("Tempo",120),ctx.paramTexte("Patron","Rock"),ctx.paramTexte("Code personnalisé",""),ctx.paramNombre("Mesures",2),ctx.paramNombre("Kick",80),ctx.paramNombre("Caisse claire",70),ctx.paramNombre("Charley",60))] };
    },
  },
  {
    id: "rythme-cantor", nom: "Rythme de Cantor", nomEn: "Cantor Rhythm", univers: "Entrées", famille: "Génération",
    resume: "Génère une groove rythmique auto-similaire par récursion sur une grille de pas.",
    resumeEn: "Generates a self-similar rhythmic groove by recursively removing beats from a grid.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 120, unite: "BPM" },
      { nom: "Profondeur", nomEn: "Depth", type: "nombre", plage: [1, 6], pas: 1, defaut: 3 },
      { nom: "Subdivision", nomEn: "Subdivision", type: "choix", options: ["3", "5", "7"], optionsEn: ["3", "5", "7"], defaut: "3", defautEn: "3" },
      { nom: "Partie retirée", nomEn: "Removed part", type: "choix", options: ["Centre", "Gauche", "Droite", "Aléatoire"], optionsEn: ["Center", "Left", "Right", "Random"], defaut: "Centre", defautEn: "Center" },
      { nom: "Instrument", nomEn: "Instrument", type: "choix", options: ["Kick", "Caisse claire", "Charley", "Tous"], optionsEn: ["Kick", "Snare", "Hi-hat", "All"], defaut: "Tous", defautEn: "All" },
      { nom: "Mesures", nomEn: "Bars", type: "nombre", plage: [1, 8], pas: 1, defaut: 2 },
      { nom: "Swing", nomEn: "Swing", type: "nombre", plage: [0, 100], defaut: 0, unite: "%" },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const partie = ctx.paramTexte("Partie retirée", "Centre").toLowerCase() as any;
      const partieValide = ["centre", "gauche", "droite", "aleatoire"].includes(partie) ? partie : "centre";
      const subdivision = parseInt(ctx.paramTexte("Subdivision", "3"), 10);
      const subdivisionValide = [3, 5, 7].includes(subdivision) ? subdivision : 3;
      const buffer = await genererRythmeCantor(
        ctx.paramNombre("Tempo", 120),
        ctx.paramNombre("Profondeur", 3),
        subdivisionValide,
        partieValide,
        ctx.paramNombre("Mesures", 2),
        ctx.paramTexte("Instrument", "Tous") as any,
        ctx.paramNombre("Volume", 80),
        ctx.paramNombre("Swing", 0),
      );
      return { valeurs: [buffer], message: `${buffer.duration.toFixed(1)} s · grille Cantor` };
    },
  },
  {
    id: "clavier-melodie", nom: "Clavier mélodie", nomEn: "Melody Keyboard", univers: "Entrées", famille: "Génération",
    resume: "Joue une séquence enregistrée au clavier.",
    resumeEn: "Plays a keyboard-recorded sequence.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom:"Synthèse", nomEn:"Synthesis", type:"choix", options:["Automatique", "FM/Oscillateurs","SoundFont"], defaut:"Automatique", optionsEn: ["Auto", "FM/Oscillators", "SoundFont"], defautEn: "Auto",
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
    ],
    async executer(ctx: any) {
      console.log("[attic] Clavier mélodie : exécution démarrée");
      const notes = ctx.noeud.data.sequenceNotes;
      if (!notes || !Array.isArray(notes)) return { valeurs:[null], message:traduire("msg.aucune_s_quence") };
      try {
        const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
        const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
        console.log(`[attic] Clavier mélodie : mode=${mode}, modeRendu=${modeRendu}, sf2Chargee=${!!sf2Chargee()}, notes=${notes.length}`);
        const buf = await rendreSequence(notes as any, modeRendu, ctx.paramNombre("Volume",80));
        console.log(`[attic] Clavier mélodie : buffer rendu, durée=${buf?.duration ?? 0}`);
        return { valeurs: [buf] };
      } catch (e: any) {
        console.error("[attic] Clavier mélodie : erreur", e);
        return { valeurs:[null], message: traduire("msg.erreur_synth_se_var_0", e?.message ?? e) };
      }
    },
  },
  {
    id: "sampler-personnalise", nom: "Sampler personnalisé", nomEn: "Custom Sampler", univers: "Entrées", famille: "Génération",
    resume: "Joue un échantillon audio comme un instrument mélodique.",
    resumeEn: "Plays an audio sample as a melodic instrument.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom:"Clé", nomEn:"Key", type:"choix", options:["Do","Do#","Ré","Mi♭","Mi","Fa","Fa#","Sol","Sol#","La","Si♭","Si"], defaut:"Do", optionsEn: ["Rock", "Four-on-the-floor", "Funk", "Hip-hop", "Jazz", "Reggae", "Samba", "House", "Techno", "Drum & Bass", "Trap", "Disco"], defautEn: "C" },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options:["Majeur","Mineur naturel","Mineur harmonique","Pentatonique majeure","Pentatonique mineure"], defaut:"Majeur", optionsEn: ["Major", "Natural minor", "Harmonic minor", "Major pentatonic", "Minor pentatonic"], defautEn: "Major" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:100, unite:"BPM" },
      { nom:"Durée", nomEn:"Duration", plage:[1,60], defaut:4, unite:"s" },
      { nom:"Note référence", nomEn:"Reference note", plage:[21,108], defaut:60, docEn:"MIDI note for the original pitch of the sample." },
    ],
    async executer(ctx: any) {
      const f = ctx.noeud.data.audioFichier as File|undefined;
      let sample: AudioBuffer;
      let dureeAuto: number | null = null;
      if (f) {
        sample = await decoderFichier(f, ctx.runtime);
        dureeAuto = sample.duration;
      } else {
        const rep = await fetch("/soundbank/waterdrop.mp3");
        if (rep.ok) { sample = await decoderBlob(await rep.blob(), ctx.runtime); dureeAuto = sample.duration; }
        else { return { valeurs:[null], message:traduire("msg.glissez_un_fichier_audio_sur_le_node") }; }
      }
      const cle = ctx.paramTexte("Clé","Do");
      const gamme = ctx.paramTexte("Gamme","Majeur");
      const tempo = ctx.paramNombre("Tempo",100);
      const dAuto = dureeAuto ?? sample.duration ?? 4;
      const d = Math.min(dAuto, ctx.paramNombre("Durée", 30));
      const notes: { note: number; velocite: number; debut: number; fin: number }[] = [];
      const decalage = ({Do:0,"Do#":1,Ré:2,"Mi♭":3,Mi:4,Fa:5,"Fa#":6,Sol:7,"Sol#":8,La:9,"Si♭":10,Si:11} as Record<string,number>)[cle]??0;
      const deg = ({Majeur:[0,2,4,5,7,9,11],"Mineur naturel":[0,2,3,5,7,8,10],"Mineur harmonique":[0,2,3,5,7,8,11],"Pentatonique majeure":[0,2,4,7,9],"Pentatonique mineure":[0,3,5,7,10]} as Record<string,number[]>)[gamme]??[0,2,4,5,7,9,11];
      const dureeNoire = 60 / Math.max(1, tempo);
      let t = 0;
      while (t < d) {
        const nb = Math.random() < 0.3 ? 2 : 1;
        const len = dureeNoire / nb;
        for (let s = 0; s < nb; s++) {
          if (Math.random() > 0.1) {
            const g = deg[Math.floor(Math.random() * deg.length)];
            const midi = 60 + decalage + g + Math.floor(Math.random() * 2) * 12;
            const debut = t + s * len;
            notes.push({ note: midi, velocite: 80 + Math.floor(Math.random() * 40), debut, fin: debut + len * 0.9 });
          }
        }
        t += dureeNoire;
      }
      const noteRef = ctx.paramNombre("Note référence", 60);
      try {
        const buf = rendreAvecEchantillon(notes, sample, 80, noteRef);
        return { valeurs: [buf], message: traduire("msg.ok_var_0_notes_var_1_s", notes.length, buf.duration.toFixed(1)) };
      } catch (e: any) {
        return { valeurs:[null], message: traduire("msg.erreur_rendu_var_0", e?.message ?? e) };
      }
    },
  },
  {
    id: "generateur-bruit", nom: "Générateur de bruit", nomEn: "Noise Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère du bruit blanc, rose ou brownien.",
    resumeEn: "Generates white, pink or brownian noise.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Blanc", "Rose", "Brownien"], defaut: "Blanc",
        doc: "Blanc = toutes les fréquences à niveau égal (spectre plat). Rose = −3 dB/octave (perçu équilibré). Brownien = −6 dB/octave (grave, sourd). Branchez sur l'Analyseur de spectre pour voir la différence.",
        docEn: "White = all frequencies at equal level (flat spectrum). Pink = −3 dB/octave (perceptually balanced). Brownian = −6 dB/octave (dark, muffled). Connect to the Spectrum Analyzer to see the difference.", optionsEn: ["White", "Pink", "Brownian"], defautEn: "White" },
      { nom: "Durée", nomEn: "Duration", plage: [0.2, 10], pas: 0.1, defaut: 2, unite: "s" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const type = ctx.paramTexte("Type", "Blanc");
      const buf = genererBruit(type, ctx.paramNombre("Durée", 2), ctx.paramNombre("Volume", 80));
      return { valeurs: [buf], message: traduire("msg.bruit_var_0_var_1_s", type.toLowerCase(), buf.duration.toFixed(1)) };
    },
  },
  {
    id: "generateur-frequence", nom: "Générateur de fréquence", nomEn: "Frequency Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère une tonalité pure à une fréquence (Hz) ou note donnée.",
    resumeEn: "Generates a pure tone at a given frequency (Hz) or note.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Saisie", nomEn: "Input", type: "choix", options: ["Fréquence (Hz)", "Note"], optionsEn: ["Frequency (Hz)", "Note"], defaut: "Fréquence (Hz)",
        doc: "Mode de saisie : en Hz (ex. 440) ou en note musicale (ex. A4, C#5).",
        docEn: "Input mode: in Hz (e.g. 440) or as a musical note (e.g. A4, C#5).", defautEn: "Frequency (Hz)" },
      { nom: "Fréquence", nomEn: "Frequency", plage: [20, 20000], pas: 1, defaut: 440, unite: "Hz",
        doc: "Fréquence en Hertz (utilisé si « Saisie » = Fréquence). 440 = La3 de référence.",
        docEn: "Frequency in Hertz (used when « Input » = Frequency). 440 = reference A4." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A4",
        doc: "Note musicale (utilisé si « Saisie » = Note). Format : lettre + altération + octave, ex. C4, F#5, Bb3.",
        docEn: "Musical note (used when « Input » = Note). Format: letter + accidental + octave, e.g. C4, F#5, Bb3.", defautEn: "A4" },
      { nom: "Forme", nomEn: "Waveform", type: "choix", options: ["Sinus", "Carré", "Scie", "Triangle"], optionsEn: ["Sine", "Square", "Saw", "Triangle"], defaut: "Sinus",
        doc: "Forme d'onde. Sinus = pur (une seule fréquence) ; Carré = harmoniques impaires ; Scie = toutes les harmoniques ; Triangle = harmoniques impaires douces.",
        docEn: "Waveform. Sine = pure (single frequency); Square = odd harmonics; Saw = all harmonics; Triangle = soft odd harmonics.", defautEn: "Sine" },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du signal généré.", docEn: "Duration of the generated signal." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const saisie = ctx.paramTexte("Saisie", "Fréquence (Hz)");
      let freq: number;
      if (saisie === "Note") {
        const noteStr = ctx.paramTexte("Note", "A4");
        const m = noteStr.match(/^([A-G])(#|b)?(-?\d+)$/);
        if (!m) return { valeurs: [null], message: traduire("msg.note_invalide_var_0_format_a4_c_5_bb3", noteStr) };
        const tbl: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        let pc = tbl[m[1]] ?? 9;
        if (m[2] === "#") pc += 1; else if (m[2] === "b") pc -= 1;
        const midi = (parseInt(m[3]) + 1) * 12 + pc;
        freq = 440 * Math.pow(2, (midi - 69) / 12);
      } else {
        freq = ctx.paramNombre("Fréquence", 440);
      }
      freq = Math.max(20, Math.min(20000, freq));

      const forme = ctx.paramTexte("Forme", "Sinus");
      const duree = ctx.paramNombre("Durée", 2);
      const volume = ctx.paramNombre("Volume", 80);
      const sr = 44100;
      const len = Math.max(1, Math.floor(duree * sr));
      const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
      const vol = Math.max(0, Math.min(1, volume / 100)) * 0.7;
      const typeOsc: OscillatorType = forme === "Carré" ? "square" : forme === "Scie" ? "sawtooth" : forme === "Triangle" ? "triangle" : "sine";

      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const phase = 2 * Math.PI * freq * t;
          let echantillon: number;
          switch (typeOsc) {
            case "square": echantillon = Math.sign(Math.sin(phase)); break;
            case "sawtooth": echantillon = 2 * ((freq * t) % 1) - 1; break;
            case "triangle": echantillon = 2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1; break;
            default: echantillon = Math.sin(phase);
          }
          // Fondu entrée/sortie (10ms) pour éviter le clic
          const fondu = Math.min(1, i / (sr * 0.01), (len - i) / (sr * 0.01));
          d[i] = echantillon * vol * fondu;
        }
      }

      const noteAff = saisie === "Note" ? ctx.paramTexte("Note", "A4") : `${freq.toFixed(1)} Hz`;
      return { valeurs: [buf], message: traduire("msg.var_0_var_1_var_2_s", noteAff, forme, duree.toFixed(1)) };
    },
  },
  {
    id: "generateur-audio-mathematique", nom: "Générateur audio mathématique", nomEn: "Mathematical Audio Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère un signal audio à partir d'une expression mathématique.",
    resumeEn: "Generates an audio signal from a mathematical expression.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(t * 2 * pi * 440)",
        doc: "Expression mathématique donnant la valeur de l'échantillon. Variables disponibles : t (temps en s), i (index), c (canal), ch (nombre de canaux), sr (fréquence d'échantillonnage).",
        docEn: "Mathematical expression giving the sample value. Available variables: t (time in s), i (index), c (channel), ch (channel count), sr (sample rate).", defautEn: "sin(t * 2 * ft * 440)" },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du signal généré.", docEn: "Duration of the generated signal." },
      { nom: "Canaux", nomEn: "Channels", type: "choix", options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], defaut: "Stéréo",
        doc: "Nombre de canaux de sortie.", docEn: "Number of output channels.", defautEn: "Stereo" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const formule = ctx.paramTexte("Formule", "sin(t * 2 * pi * 440)");
      const duree = ctx.paramNombre("Durée", 2);
      const channels = ctx.paramTexte("Canaux", "Stéréo") === "Mono" ? 1 : 2;
      const volume = ctx.paramNombre("Volume", 80);
      try {
        const buf = genererAudioFormule(formule, duree, 44100, channels);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (vol !== 1) {
          for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= vol;
          }
        }
        return { valeurs: [buf], message: traduire("msg.var_0_var_1_s", formule, buf.duration.toFixed(1)) };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_var_0", e?.message ?? e) };
      }
    },
  },
  {
    id: "metronome", nom: "Métronome", nomEn: "Metronome",
    univers: "Entrées", famille: "Génération",
    resume: "Génère un clic métronomique régulier à un tempo donné.",
    resumeEn: "Generates a steady metronome click at a given tempo.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Signature", nomEn: "Time signature", type: "choix",
        options: ["4/4", "3/4", "2/4", "6/8", "5/4", "7/8"], defaut: "4/4",
        doc: "Signature rythmique. Le premier temps de chaque mesure est accentué.", docEn: "Time signature. The first beat of each bar is accented.", optionsEn: ["Click", "Woodblock", "Beep", "6/8", "5/4", "7/8"], defautEn: "Click" },
      { nom: "Durée", nomEn: "Duration", plage: [1, 60], pas: 1, defaut: 10, unite: "s",
        doc: "Durée totale du métronome.", docEn: "Total duration of the metronome." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix",
        options: ["Clic", "Woodblock", "Bip"], optionsEn: ["Click", "Woodblock", "Beep"], defaut: "Clic",
        doc: "Son du clic. Clic = transitoire court ; Woodblock = résonance bois ; Bip = sinus bref.",
        docEn: "Click sound. Click = short transient; Woodblock = woody resonance; Beep = brief sine.", defautEn: "Click" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const sig = ctx.paramTexte("Signature", "4/4");
      const duree = ctx.paramNombre("Durée", 10);
      const timbre = ctx.paramTexte("Timbre", "Clic");
      const volume = ctx.paramNombre("Volume", 90);
      const sr = 44100;
      const vol = Math.max(0, Math.min(1, volume / 100));

      const [num, den] = sig.split("/").map((n: string) => parseInt(n, 10));
      const beatSec = 60 / tempo;
      const beatSecUnit = den === 8 ? beatSec / 2 : beatSec;
      const beatsParMesure = den === 8 ? num : num;
      const intervalle = beatSecUnit;

      const len = Math.max(1, Math.floor(duree * sr));
      const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });

      function ecrireClic(pos: number, accent: boolean) {
        const amp = accent ? vol * 0.9 : vol * 0.5;
        if (timbre === "Bip") {
          const freq = accent ? 1500 : 1000;
          const dureeClic = 0.02;
          const n = Math.floor(dureeClic * sr);
          for (let i = 0; i < n && pos + i < len; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 80);
            const s = Math.sin(2 * Math.PI * freq * t) * amp * env;
            buf.getChannelData(0)[pos + i] += s;
            buf.getChannelData(1)[pos + i] += s;
          }
        } else if (timbre === "Woodblock") {
          const freq = accent ? 800 : 600;
          const dureeClic = 0.05;
          const n = Math.floor(dureeClic * sr);
          for (let i = 0; i < n && pos + i < len; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 40);
            const s = (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t)) * amp * env;
            buf.getChannelData(0)[pos + i] += s;
            buf.getChannelData(1)[pos + i] += s;
          }
        } else {
          // Clic = bruit court filtré
          const dureeClic = 0.008;
          const n = Math.floor(dureeClic * sr);
          for (let i = 0; i < n && pos + i < len; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 200);
            const s = (Math.random() * 2 - 1) * amp * env;
            buf.getChannelData(0)[pos + i] += s;
            buf.getChannelData(1)[pos + i] += s;
          }
        }
      }

      let beat = 0;
      for (let t = 0; t < duree; t += intervalle) {
        const pos = Math.floor(t * sr);
        if (pos >= len) break;
        const accent = beat % beatsParMesure === 0;
        ecrireClic(pos, accent);
        beat++;
      }

      const nbBeats = beat;
      const nbMesures = Math.floor(nbBeats / beatsParMesure);
      return { valeurs: [buf], message: traduire("msg.var_0_bpm_var_1_var_2_mesure_s_var_3_temps", tempo, sig, nbMesures, nbBeats) };
    },
  },
  {
    id: "reservoir-musical", nom: "Réservoir neuronal", nomEn: "Neural Reservoir",
    univers: "Entrées", famille: "Génération",
    resume: "Génère une mélodie émergente par réseau de neurones aléatoires (inspiré d'Allendia/EVY).",
    resumeEn: "Generates emergent melody via random neural networks (inspired by Allendia/EVY).",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Neurones", nomEn: "Neurons", plage: [5, 50], pas: 1, defaut: 15,
        doc: "Nombre de neurones dans le réservoir. Peu = motifs courts et répétitifs ; beaucoup = motifs complexes et chaotiques.",
        docEn: "Number of neurons in the reservoir. Few = short repetitive patterns; many = complex chaotic patterns." },
      { nom: "Connectivité", nomEn: "Connectivity", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Probabilité de connexion entre neurones. Faible = motifs simples ; élevée = motifs denses.",
        docEn: "Probability of connection between neurons. Low = simple patterns; high = dense patterns." },
      { nom: "Mémoire", nomEn: "Memory", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Taux de fuite (leaking). Élevé = mémoire longue, motifs qui évoluent lentement ; faible = réactions brèves.",
        docEn: "Leaking rate. High = long memory, slowly evolving patterns; low = brief reactions." },
      { nom: "Spectre", nomEn: "Spectral radius", plage: [50, 150], pas: 1, defaut: 90, unite: "%",
        doc: "Rayon spectral du réseau. <100% = stable (converge) ; >100% = chaotique (diverge). 90% = sweet spot mélodique.",
        docEn: "Network spectral radius. <100% = stable (converges); >100% = chaotic (diverges). 90% = melodic sweet spot." },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C",
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale.", optionsEn: ["1/4", "1/8", "1/16", "Blues", "Classical", "Electronic", "Hip-hop", "Reggae", "Ambient", "A", "A#", "B"], defautEn: "1/4" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues","chromatique"], defaut: "majeur",
        doc: "Gamme utilisée pour mapper les activations du réseau vers des notes.", docEn: "Scale used to map network activations to notes.", optionsEn: ["Major", "minor", "major pentatonic", "minor pentatonic", "blues", "chromatic"], defautEn: "major" },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de départ (les notes peuvent monter sur 2 octaves).", docEn: "Starting octave (notes can span 2 octaves above)." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Résolution", nomEn: "Resolution", type: "choix", options: ["1/4","1/8","1/16"], optionsEn: ["1/4","1/8","1/16"], defaut: "1/8",
        doc: "Division du temps. 1/4 = noires, 1/8 = croches, 1/16 = doubles croches.", docEn: "Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth.", defautEn: "1/8" },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 64], pas: 1, defaut: 4,
        doc: "Nombre de mesures à générer.", docEn: "Number of bars to generate." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Sinus","Carré","Scie","Triangle"], optionsEn: ["Sine","Square","Saw","Triangle"], defaut: "Triangle",
        doc: "Forme d'onde de la synthèse.", docEn: "Synthesis waveform.", defautEn: "Triangle" },
      { nom: "Densité", nomEn: "Density", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Probabilité de produire une note à chaque pas. Élevée = mélodie dense ; faible = mélodie éparse.", docEn: "Probability of producing a note at each step. High = dense melody; low = sparse melody." },
      { nom: "Répétition", nomEn: "Repetition", plage: [0, 100], pas: 1, defaut: 25, unite: "%",
        doc: "Tendance à répéter la note précédente. Élevée = motifs accrocheurs ; faible = variation continue.", docEn: "Tendency to repeat the previous note. High = catchy patterns; low = continuous variation." },
      { nom: "Silence", nomEn: "Silence", plage: [0, 50], pas: 1, defaut: 10, unite: "%",
        doc: "Probabilité de silence à chaque pas. Crée des respirations dans la mélodie.", docEn: "Probability of silence at each step. Creates breathing room in the melody." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouvelle réseau aléatoire à chaque exécution). Même graine = même réseau = même mélodie.", docEn: "Random seed (0 = new random network each run). Same seed = same network = same melody." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 85, unite: "%" },
    ],
    async executer(ctx: any) {
      const { genererReservoirMusical, rendreReservoirAudio } = await import("../audio");
      const resolution = ctx.paramTexte("Résolution", "1/8");
      const pasParBeat = resolution === "1/4" ? 1 : resolution === "1/16" ? 4 : 2;
      const config = {
        taille: ctx.paramNombre("Neurones", 15),
        connectivite: ctx.paramNombre("Connectivité", 30) / 100,
        leaking: ctx.paramNombre("Mémoire", 30) / 100,
        gain: 1.5,
        spectre: ctx.paramNombre("Spectre", 90) / 100,
        cle: ctx.paramTexte("Clé", "C"),
        gamme: ctx.paramTexte("Gamme", "majeur"),
        octave: ctx.paramNombre("Octave", 4),
        tempo: ctx.paramNombre("Tempo", 120),
        pasParBeat,
        mesures: ctx.paramNombre("Mesures", 4),
        volume: ctx.paramNombre("Volume", 85),
        timbre: ctx.paramTexte("Timbre", "Triangle"),
        graine: ctx.paramNombre("Graine", 0),
        probaNote: ctx.paramNombre("Densité", 70) / 100,
        repetition: ctx.paramNombre("Répétition", 25) / 100,
        silence: ctx.paramNombre("Silence", 10) / 100,
      };
      ctx.onProgress(traduire("progress.g_n_ration_du_r_servoir_neuronal"));
      const { notes, graineUtilisee } = genererReservoirMusical(config);
      ctx.onProgress(traduire("progress.rendu_audio"));
      const buf = rendreReservoirAudio(notes, config);
      const nbNotes = notes.filter((n: any) => !n.silence).length;
      return { valeurs: [buf], message: traduire("msg.var_0_neurones_var_1_notes_graine_var_2_var_3_mes", config.taille, nbNotes, graineUtilisee, config.mesures) };
    },
  },
  {
    id: "reservoir-midi", nom: "Réservoir neuronal MIDI", nomEn: "Neural Reservoir MIDI",
    univers: "Entrées", famille: "Génération",
    resume: "Génère un fichier MIDI par réseau de neurones aléatoires (branchable sur Arpégiateur, Transposeur, Sortie MIDI).",
    resumeEn: "Generates a MIDI file via random neural networks (connectable to Arpeggiator, Transposer, MIDI Output).",
    entrees: [],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Neurones", nomEn: "Neurons", plage: [5, 50], pas: 1, defaut: 15,
        doc: "Nombre de neurones dans le réservoir. Peu = motifs courts et répétitifs ; beaucoup = motifs complexes et chaotiques.",
        docEn: "Number of neurons in the reservoir. Few = short repetitive patterns; many = complex chaotic patterns." },
      { nom: "Connectivité", nomEn: "Connectivity", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Probabilité de connexion entre neurones. Faible = motifs simples ; élevée = motifs denses.",
        docEn: "Probability of connection between neurons. Low = simple patterns; high = dense patterns." },
      { nom: "Mémoire", nomEn: "Memory", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Taux de fuite (leaking). Élevé = mémoire longue, motifs qui évoluent lentement ; faible = réactions brèves.",
        docEn: "Leaking rate. High = long memory, slowly evolving patterns; low = brief reactions." },
      { nom: "Spectre", nomEn: "Spectral radius", plage: [50, 150], pas: 1, defaut: 90, unite: "%",
        doc: "Rayon spectral du réseau. <100% = stable (converge) ; >100% = chaotique (diverge). 90% = sweet spot mélodique.",
        docEn: "Network spectral radius. <100% = stable (converges); >100% = chaotic (diverges). 90% = melodic sweet spot." },
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C",
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale.", optionsEn: ["1/4", "1/8", "1/16", "Blues", "Classical", "Electronic", "Hip-hop", "Reggae", "Ambient", "A", "A#", "B"], defautEn: "1/4" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues","chromatique"], defaut: "majeur",
        doc: "Gamme utilisée pour mapper les activations du réseau vers des notes.", docEn: "Scale used to map network activations to notes.", optionsEn: ["Major", "minor", "major pentatonic", "minor pentatonic", "blues", "chromatic"], defautEn: "major" },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de départ (les notes peuvent monter sur 2 octaves).", docEn: "Starting octave (notes can span 2 octaves above)." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Résolution", nomEn: "Resolution", type: "choix", options: ["1/4","1/8","1/16"], optionsEn: ["1/4","1/8","1/16"], defaut: "1/8",
        doc: "Division du temps. 1/4 = noires, 1/8 = croches, 1/16 = doubles croches.", docEn: "Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth.", defautEn: "1/8" },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 64], pas: 1, defaut: 4,
        doc: "Nombre de mesures à générer.", docEn: "Number of bars to generate." },
      { nom: "Densité", nomEn: "Density", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Probabilité de produire une note à chaque pas. Élevée = mélodie dense ; faible = mélodie éparse.", docEn: "Probability of producing a note at each step. High = dense melody; low = sparse melody." },
      { nom: "Répétition", nomEn: "Repetition", plage: [0, 100], pas: 1, defaut: 25, unite: "%",
        doc: "Tendance à répéter la note précédente. Élevée = motifs accrocheurs ; faible = variation continue.", docEn: "Tendency to repeat the previous note. High = catchy patterns; low = continuous variation." },
      { nom: "Silence", nomEn: "Silence", plage: [0, 50], pas: 1, defaut: 10, unite: "%",
        doc: "Probabilité de silence à chaque pas. Crée des respirations dans la mélodie.", docEn: "Probability of silence at each step. Creates breathing room in the melody." },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouveau réseau à chaque exécution). Même graine = même mélodie.", docEn: "Random seed (0 = new random network each run). Same seed = same melody." },
    ],
    async executer(ctx: any) {
      const { genererReservoirMusical } = await import("../audio");
      const { notesVersFichierMidi } = await import("../audio");
      const resolution = ctx.paramTexte("Résolution", "1/8");
      const pasParBeat = resolution === "1/4" ? 1 : resolution === "1/16" ? 4 : 2;
      const config = {
        taille: ctx.paramNombre("Neurones", 15),
        connectivite: ctx.paramNombre("Connectivité", 30) / 100,
        leaking: ctx.paramNombre("Mémoire", 30) / 100,
        gain: 1.5,
        spectre: ctx.paramNombre("Spectre", 90) / 100,
        cle: ctx.paramTexte("Clé", "C"),
        gamme: ctx.paramTexte("Gamme", "majeur"),
        octave: ctx.paramNombre("Octave", 4),
        tempo: ctx.paramNombre("Tempo", 120),
        pasParBeat,
        mesures: ctx.paramNombre("Mesures", 4),
        volume: 85,
        timbre: "Triangle",
        graine: ctx.paramNombre("Graine", 0),
        probaNote: ctx.paramNombre("Densité", 70) / 100,
        repetition: ctx.paramNombre("Répétition", 25) / 100,
        silence: ctx.paramNombre("Silence", 10) / 100,
      };
      ctx.onProgress(traduire("progress.g_n_ration_du_r_servoir_neuronal"));
      const { notes, graineUtilisee } = genererReservoirMusical(config);
      const notesJouees = notes.filter((n: any) => !n.silence);
      if (notesJouees.length === 0) return { valeurs: [null], message: traduire("msg.aucune_note_g_n_r_e") };
      const fichier = notesVersFichierMidi(
        notesJouees.map((n: any) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.debut + n.duree })),
        config.tempo,
      );
      return { valeurs: [fichier], message: traduire("msg.var_0_neurones_var_1_notes_graine_var_2", config.taille, notesJouees.length, graineUtilisee) };
    },
  },
  {
    id: "multi-reservoirs", nom: "Multi-réservoirs", nomEn: "Multi-reservoir",
    univers: "Entrées", famille: "Génération",
    resume: "Plusieurs réservoirs neuronaux en réseau (mélodie, basse, harmonie, rythme) — émergence polyphonique.",
    resumeEn: "Multiple neural reservoirs in network (melody, bass, harmony, rhythm) — polyphonic emergence.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Clé", nomEn: "Key", type: "choix", options: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], defaut: "C",
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale.", optionsEn: ["1/4", "1/8", "1/16", "Blues", "Classical", "Electronic", "Hip-hop", "Reggae", "Ambient", "A", "A#", "B"], defautEn: "1/4" },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues"], defaut: "majeur",
        doc: "Gamme utilisée pour mapper les activations vers des notes.", docEn: "Scale used to map activations to notes.", optionsEn: ["Major", "minor", "major pentatonic", "minor pentatonic", "blues"], defautEn: "major" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Résolution", nomEn: "Resolution", type: "choix", options: ["1/4","1/8","1/16"], optionsEn: ["1/4","1/8","1/16"], defaut: "1/8",
        doc: "Division du temps. 1/4 = noires, 1/8 = croches, 1/16 = doubles croches.", docEn: "Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth.", defautEn: "1/8" },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 64], pas: 1, defaut: 4,
        doc: "Nombre de mesures à générer.", docEn: "Number of bars to generate." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Sinus","Carré","Scie","Triangle"], optionsEn: ["Sine","Square","Saw","Triangle"], defaut: "Triangle",
        doc: "Forme d'onde de la synthèse.", docEn: "Synthesis waveform.", defautEn: "Triangle" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouveau réseau à chaque exécution).", docEn: "Random seed (0 = new network each run)." },
      // Mélodie
      { nom: "Mél. neurones", nomEn: "Mel. neurons", plage: [5, 40], pas: 1, defaut: 15,
        doc: "Neurones du réservoir mélodie.", docEn: "Melody reservoir neurons." },
      { nom: "Mél. connectivité", nomEn: "Mel. connectivity", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Connectivité du réservoir mélodie.", docEn: "Melody reservoir connectivity." },
      { nom: "Mél. mémoire", nomEn: "Mel. memory", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Mémoire du réservoir mélodie.", docEn: "Melody reservoir memory." },
      // Basse
      { nom: "Basse neurones", nomEn: "Bass neurons", plage: [5, 30], pas: 1, defaut: 10,
        doc: "Neurones du réservoir basse.", docEn: "Bass reservoir neurons." },
      { nom: "Basse connectivité", nomEn: "Bass connectivity", plage: [0, 100], pas: 1, defaut: 25, unite: "%",
        doc: "Connectivité du réservoir basse.", docEn: "Bass reservoir connectivity." },
      { nom: "Basse octave", nomEn: "Bass octave", plage: [1, 4], pas: 1, defaut: 2,
        doc: "Octave de la basse.", docEn: "Bass octave." },
      // Harmonie
      { nom: "Harm. neurones", nomEn: "Harm. neurons", plage: [5, 30], pas: 1, defaut: 8,
        doc: "Neurones du réservoir harmonie (notes tenues).", docEn: "Harmony reservoir neurons (held notes)." },
      { nom: "Harm. connectivité", nomEn: "Harm. connectivity", plage: [0, 100], pas: 1, defaut: 20, unite: "%",
        doc: "Connectivité du réservoir harmonie.", docEn: "Harmony reservoir connectivity." },
      // Rythme
      { nom: "Rythme neurones", nomEn: "Rhythm neurons", plage: [5, 30], pas: 1, defaut: 12,
        doc: "Neurones du réservoir rythme (détermine quand les autres jouent).", docEn: "Rhythm reservoir neurons (determines when others play)." },
      { nom: "Rythme densité", nomEn: "Rhythm density", plage: [10, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Densité du pattern rythmique.", docEn: "Rhythm pattern density." },
      // Influence
      { nom: "Influence", nomEn: "Influence", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Influence croisée du rythme sur les autres voix. 0 = indépendantes, 100% = les autres ne jouent que sur les pas rythmiques.",
        docEn: "Cross-influence of rhythm on other voices. 0 = independent, 100% = others only play on rhythmic steps." },
    ],
    async executer(ctx: any) {
      const { genererMultiReservoir } = await import("../audio");
      const resolution = ctx.paramTexte("Résolution", "1/8");
      const pasParBeat = resolution === "1/4" ? 1 : resolution === "1/16" ? 4 : 2;
      const config = {
        cle: ctx.paramTexte("Clé", "C"),
        gamme: ctx.paramTexte("Gamme", "majeur"),
        tempo: ctx.paramNombre("Tempo", 120),
        pasParBeat,
        mesures: ctx.paramNombre("Mesures", 4),
        volume: ctx.paramNombre("Volume", 80),
        timbre: ctx.paramTexte("Timbre", "Triangle"),
        graine: ctx.paramNombre("Graine", 0),
        melodieNeurones: ctx.paramNombre("Mél. neurones", 15),
        melodieConnectivite: ctx.paramNombre("Mél. connectivité", 30),
        melodieMemoire: ctx.paramNombre("Mél. mémoire", 30),
        basseNeurones: ctx.paramNombre("Basse neurones", 10),
        basseConnectivite: ctx.paramNombre("Basse connectivité", 25),
        basseOctave: ctx.paramNombre("Basse octave", 2),
        harmonieNeurones: ctx.paramNombre("Harm. neurones", 8),
        harmonieConnectivite: ctx.paramNombre("Harm. connectivité", 20),
        rythmeNeurones: ctx.paramNombre("Rythme neurones", 12),
        rythmeDensite: ctx.paramNombre("Rythme densité", 50),
        influence: ctx.paramNombre("Influence", 50) / 100,
      };
      ctx.onProgress(traduire("progress.g_n_ration_multi_r_servoirs"));
      const { buffer, details } = genererMultiReservoir(config);
      return { valeurs: [buffer], message: traduire("msg.var_0_graine_var_1", details, config.graine > 0 ? config.graine : "auto") };
    },
  },
  {
    id: "sampler-midi", nom: "Sampler MIDI", nomEn: "MIDI Sampler", univers: "Traitement", famille: "Effets",
    resume: "Joue les notes MIDI entrantes avec un échantillon audio chargé dans l'inspecteur.",
    resumeEn: "Plays incoming MIDI notes with an audio sample loaded from the inspector.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Note référence", nomEn: "Reference note", plage: [21, 108], pas: 1, defaut: 60,
        doc: "Note MIDI correspondant à la hauteur d'origine de l'échantillon (60 = Do central).", docEn: "MIDI note matching the original pitch of the sample (60 = middle C)." },
    ],
    async executer(ctx: any) {
      const midiFile = ctx.entree(0);
      if (!(midiFile instanceof File)) return { valeurs: [null, null], message: traduire("msg.branchez_un_source_midi") };
      const audioFichier = ctx.noeud.data.audioFichier as File | undefined;
      if (!audioFichier) return { valeurs: [null, midiFile], message: traduire("msg.chargez_un_chantillon_audio_dans_l_inspecteur") };
      const sample = await decoderFichier(audioFichier, ctx.runtime);
      const bytes = new Uint8Array(await midiFile.arrayBuffer());
      const { notes } = analyserMidi(parseMidi(bytes));
      if (!notes.length) return { valeurs: [null, midiFile], message: traduire("msg.aucune_note_dans_le_midi") };
      const vol = ctx.paramNombre("Volume", 80);
      const noteRef = ctx.paramNombre("Note référence", 60);
      const adapt = notes.map((n: any) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));
      const buf = rendreAvecEchantillon(adapt, sample, vol, noteRef);
      return { valeurs: [buf, midiFile], message: traduire("msg.var_0_notes_chantillon_var_1", notes.length, audioFichier.name) };
    },
  },
] as FicheAudio[]).map(avecDoc);
