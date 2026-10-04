// plugins/generateurs-sources.ts — Sources elementaires : clavier, bruit, frequence, metronome.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { decoderFichier, decoderBlob, rendreAvecEchantillon, genererBruit, genererAudioFormule, notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi, degresGammeMelodie, GAMMES_MELODIE_FR, GAMMES_MELODIE_EN, GAMMES_MELODIE_IDS, DEMI_TONS_CLE, type NoteEvenement } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";
import { creerAleatoire, hasardDuNoeud } from "../core";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */
import { noteVersFrequence, FORMES_FREQ } from "./generateurs-aides";
import { PARAMETRE_CLE } from "../audio/cles";

export const fiches: FicheAudio[] = ([
  {
    id: "clavier-melodie", nom: "Clavier mélodie", nomEn: "Melody Keyboard", univers: "Entrées", famille: "Génération",
    resume: "Joue une séquence enregistrée au clavier et exporte aussi un fichier MIDI.",
    resumeEn: "Plays a keyboard-recorded sequence and also exports a MIDI file.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { ...PARAMETRE_SYNTHESE,        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom:"Tempo", nomEn:"Tempo", type:"curseur", plage:[40,240], defaut:120, unite:"BPM" },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
    ],
    async executer(ctx: any) {
      console.log("[attic] Clavier mélodie : exécution démarrée");
      const notes = ctx.noeud.data.sequenceNotes as NoteEvenement[] | undefined;
      if (!notes || !Array.isArray(notes)) return { valeurs:[null, null], message:traduire("msg.aucune_s_quence") };
      try {
        const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
        const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
        const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
        console.log(`[attic] Clavier mélodie : mode=${mode}, modeRendu=${modeRendu}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, notes=${notes.length}`);
        const buf = await rendreSequence(notes, modeRendu, ctx.paramNombre("Volume",80), instrument, banque);
        const tempo = ctx.paramNombre("Tempo", 120);
        const midiFile = await appliquerInstrumentMidi(notesVersFichierMidi(notes, tempo), ctx.paramNombre("Instrument", 0));
        console.log(`[attic] Clavier mélodie : buffer rendu, durée=${buf?.duration ?? 0}`);
        return { valeurs: [buf, midiFile] };
      } catch (e: any) {
        console.error("[attic] Clavier mélodie : erreur", e);
        return { valeurs:[null, null], message: traduire("msg.erreur_synth_se_var_0", e?.message ?? e) };
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
      { ...PARAMETRE_CLE },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS, defaut:"Majeur", defautEn: "Major" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:100, unite:"BPM" },
      { nom:"Durée", nomEn:"Duration", plage:[1,60], defaut:4, unite:"s" },
      { nom:"Note référence", nomEn:"Reference note", plage:[21,108], defaut:60, docEn:"MIDI note for the original pitch of the sample." },
      { nom:"Graine", graine: true, nomEn:"Seed", plage:[0,999999], pas:1, defaut:0,
        doc:"Graine de la mélodie. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur rejoue exactement la même mélodie.",
        docEn:"Seed for the melody. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same melody." },
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
      const decalage = DEMI_TONS_CLE[cle] ?? 0;
      const deg = degresGammeMelodie(gamme);
      const dureeNoire = 60 / Math.max(1, tempo);
      const { graine, aleatoire: hasard } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      let t = 0;
      while (t < d) {
        const nb = hasard() < 0.3 ? 2 : 1;
        const len = dureeNoire / nb;
        for (let s = 0; s < nb; s++) {
          if (hasard() > 0.1) {
            const g = deg[Math.floor(hasard() * deg.length)];
            const midi = 60 + decalage + g + Math.floor(hasard() * 2) * 12;
            const debut = t + s * len;
            notes.push({ note: midi, velocite: 80 + Math.floor(hasard() * 40), debut, fin: debut + len * 0.9 });
          }
        }
        t += dureeNoire;
      }
      const noteRef = ctx.paramNombre("Note référence", 60);
      try {
        const buf = rendreAvecEchantillon(notes, sample, 80, noteRef);
        return { valeurs: [buf], message: `${traduire("msg.ok_var_0_notes_var_1_s", notes.length, buf.duration.toFixed(1))} · graine ${graine}` };
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
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Blanc", "Rose", "Brownien"], optionIds: ["Blanc","Rose","Brownien"], defaut: "Blanc",
        doc: "Blanc = toutes les fréquences à niveau égal (spectre plat). Rose = −3 dB/octave (perçu équilibré). Brownien = −6 dB/octave (grave, sourd). Branchez sur l'Analyseur de spectre pour voir la différence.",
        docEn: "White = all frequencies at equal level (flat spectrum). Pink = −3 dB/octave (perceptually balanced). Brownian = −6 dB/octave (dark, muffled). Connect to the Spectrum Analyzer to see the difference.", optionsEn: ["White", "Pink", "Brownian"], defautEn: "White" },
      { nom: "Durée", nomEn: "Duration", plage: [0.2, 10], pas: 0.1, defaut: 2, unite: "s" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du bruit. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur rejoue exactement le même bruit, échantillon par échantillon.",
        docEn: "Seed for the noise. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same noise, sample for sample." },
    ],
    async executer(ctx: any) {
      const type = ctx.paramTexte("Type", "Blanc");
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const buf = genererBruit(type, ctx.paramNombre("Durée", 2), ctx.paramNombre("Volume", 80), aleatoire);
      return { valeurs: [buf], message: `${traduire("msg.bruit_var_0_var_1_s", type.toLowerCase(), buf.duration.toFixed(1))} · graine ${graine}` };
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
      { nom: "Saisie", nomEn: "Input", type: "choix", options: ["Fréquence (Hz)", "Note"], optionsEn: ["Frequency (Hz)", "Note"], optionIds: ["frequency", "note"], defaut: "Fréquence (Hz)",
        doc: "Mode de saisie : en Hz (ex. 440) ou en note musicale (ex. A4, C#5).",
        docEn: "Input mode: in Hz (e.g. 440) or as a musical note (e.g. A4, C#5).", defautEn: "Frequency (Hz)" },
      { nom: "Fréquence", nomEn: "Frequency", plage: [20, 20000], pas: 1, defaut: 440, unite: "Hz",
        doc: "Fréquence en Hertz (utilisé si « Saisie » = Fréquence). 440 = La3 de référence.",
        docEn: "Frequency in Hertz (used when « Input » = Frequency). 440 = reference A4." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A4",
        doc: "Note musicale (utilisé si « Saisie » = Note). Format : lettre + altération + octave, ex. C4, F#5, Bb3.",
        docEn: "Musical note (used when « Input » = Note). Format: letter + accidental + octave, e.g. A4, C#5, Bb3.", defautEn: "A4" },
      { nom: "Forme", nomEn: "Waveform", type: "choix", options: ["Sinus", "Carré", "Scie", "Triangle"], optionsEn: ["Sine", "Square", "Saw", "Triangle"], optionIds: FORMES_FREQ.ids, defaut: "Sinus",
        doc: "Forme d'onde. Sinus = pur (une seule fréquence) ; Carré = harmoniques impaires ; Scie = toutes les harmoniques ; Triangle = harmoniques impaires douces.",
        docEn: "Waveform. Sine = pure (single frequency); Square = odd harmonics; Saw = all harmonics; Triangle = soft odd harmonics.", defautEn: "Sine" },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du signal généré.", docEn: "Duration of the generated signal." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const saisie = ctx.paramTexte("Saisie", "frequency").trim().toLowerCase();
      const enModeNote = saisie === "note" || saisie.startsWith("note");
      let freq: number;
      if (enModeNote) {
        const noteStr = ctx.paramTexte("Note", "A4");
        const parsed = noteVersFrequence(noteStr);
        if (parsed == null) return { valeurs: [null], message: traduire("msg.note_invalide_var_0_format_a4_c_5_bb3", noteStr) };
        freq = parsed;
      } else {
        freq = ctx.paramNombre("Fréquence", 440);
      }
      freq = Math.max(20, Math.min(20000, freq));

      const forme = ctx.paramTexte("Forme", "sine");
      const duree = ctx.paramNombre("Durée", 2);
      const volume = ctx.paramNombre("Volume", 80);
      const sr = 44100;
      const len = Math.max(1, Math.floor(duree * sr));
      const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
      const vol = Math.max(0, Math.min(1, volume / 100)) * 0.7;
      const typeOsc: OscillatorType = forme === "square" ? "square" : forme === "saw" ? "sawtooth" : forme === "triangle" ? "triangle" : "sine";

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

      const noteAff = enModeNote ? ctx.paramTexte("Note", "A4") : `${freq.toFixed(1)} Hz`;
      const labelForme = (langueCourante() === "en" ? FORMES_FREQ.en : FORMES_FREQ.fr)[FORMES_FREQ.ids.indexOf(forme)] ?? forme;
      return { valeurs: [buf], message: traduire("msg.var_0_var_1_var_2_s", noteAff, labelForme, duree.toFixed(1)) };
    },
  },
  {
    id: "generateur-audio-mathematique", nom: "Générateur audio mathématique", nomEn: "Mathematical Audio Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère un signal audio à partir d'une expression mathématique.",
    resumeEn: "Generates an audio signal from a mathematical expression.",
    // L'expression est écrite par l'utilisateur : rien ne borne ce qu'elle rend.
    sortieHorsPlagePossible: true,
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(t * 2 * pi * 440)",
        doc: "Expression mathématique donnant la valeur de l'échantillon. Variables disponibles : t (temps en s), i (index), c (canal), ch (nombre de canaux), sr (fréquence d'échantillonnage).",
        docEn: "Mathematical expression giving the sample value. Available variables: t (time in s), i (index), c (channel), ch (channel count), sr (sample rate).", defautEn: "sin(t * 2 * pi * 440)" },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du signal généré.", docEn: "Duration of the generated signal." },
      { nom: "Canaux", nomEn: "Channels", type: "choix", options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["mono", "stereo"], defaut: "Stéréo",
        doc: "Nombre de canaux de sortie.", docEn: "Number of output channels.", defautEn: "Stereo" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%" },
    ],
    async executer(ctx: any) {
      const formule = ctx.paramTexte("Formule", "sin(t * 2 * pi * 440)");
      const duree = ctx.paramNombre("Durée", 2);
      const channels = ctx.paramTexte("Canaux", "stereo") === "mono" ? 1 : 2;
      const volume = ctx.paramNombre("Volume", 30);
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
        doc: "Signature rythmique. Le premier temps de chaque mesure est accentué.", docEn: "Time signature. The first beat of each bar is accented.", optionsEn: ["4/4", "3/4", "2/4", "6/8", "5/4", "7/8"], defautEn: "4/4" },
      { nom: "Durée", nomEn: "Duration", plage: [1, 60], pas: 1, defaut: 10, unite: "s",
        doc: "Durée totale du métronome.", docEn: "Total duration of the metronome." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix",
        options: ["Clic", "Woodblock", "Bip"], optionsEn: ["Click", "Woodblock", "Beep"], optionIds: ["click", "woodblock", "beep"], defaut: "Clic",
        doc: "Son du clic. Clic = transitoire court ; Woodblock = résonance bois ; Bip = sinus bref.",
        docEn: "Click sound. Click = short transient; Woodblock = woody resonance; Beep = brief sine.", defautEn: "Click" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const sig = ctx.paramTexte("Signature", "4/4");
      const duree = ctx.paramNombre("Durée", 10);
      const timbre = ctx.paramTexte("Timbre", "click");
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
      // Graine fixe plutôt qu'un paramètre : le bruit d'un clic de 8 ms n'a
      // aucune raison de changer d'une exécution à l'autre, et personne ne
      // souhaite le régler.
      const hasardClic = creerAleatoire(1);

      function ecrireClic(pos: number, accent: boolean) {
        const amp = accent ? vol * 0.9 : vol * 0.5;
        if (timbre === "beep") {
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
        } else if (timbre === "woodblock") {
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
            const s = (hasardClic() * 2 - 1) * amp * env;
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
] as FicheAudio[]).map(avecDoc);
