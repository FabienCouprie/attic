// plugins/tone-synths.ts — Nœuds instruments pilotés par Tone.js.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import {
  genererMembraneSynth,
  genererMetalSynth,
  genererModulationSynth,
  genererPluckSynth,
  genererPolySynth,
  rendreBatterieMidi,
} from "../audio/tone-synths";
import { analyserMidi } from "../audio/midi";
import { parseMidi } from "midi-file";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "membrane-synth",
    nom: "Membrane Synth",
    nomEn: "Membrane Synth",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère un coup de grosse caisse synthétique avec Tone.js.",
    resumeEn: "Generates a synthetic kick drum with Tone.js.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Note",
        nomEn: "Note",
        type: "texte",
        defaut: "C2",
        doc: "Note de base du kick (ex. C2, A1). Plus la note est grave, plus le kick est gros.",
        docEn: "Base note of the kick (e.g. C2, A1). Lower notes produce a bigger kick.", defautEn: "C2",
      },
      {
        nom: "Durée",
        nomEn: "Duration",
        type: "nombre",
        plage: [0.1, 5],
        pas: 0.1,
        defaut: 1.5,
        unite: "s",
        doc: "Durée totale du buffer généré. Le son est rallongé si l'enveloppe dépasse cette valeur.",
        docEn: "Total duration of the generated buffer. The sound is extended if the envelope exceeds this value.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Niveau de sortie du son.",
        docEn: "Output level of the sound.",
      },
      {
        nom: "Pitch decay",
        nomEn: "Pitch decay",
        type: "nombre",
        plage: [0.001, 1],
        pas: 0.001,
        defaut: 0.05,
        unite: "s",
        doc: "Temps de chute de la hauteur (pitch envelope).",
        docEn: "Pitch envelope decay time.",
      },
      {
        nom: "Octaves",
        nomEn: "Octaves",
        type: "nombre",
        plage: [0, 10],
        pas: 0.1,
        defaut: 4,
        unite: "oct",
        doc: "Amplitude de la chute de hauteur en octaves.",
        docEn: "Pitch drop range in octaves.",
      },
      {
        nom: "Decay",
        nomEn: "Decay",
        type: "nombre",
        plage: [0.01, 2],
        pas: 0.01,
        defaut: 0.4,
        unite: "s",
        doc: "Temps de déclin de l'enveloppe d'amplitude.",
        docEn: "Amplitude envelope decay time.",
      },
      {
        nom: "Release",
        nomEn: "Release",
        type: "nombre",
        plage: [0.01, 3],
        pas: 0.01,
        defaut: 1.4,
        unite: "s",
        doc: "Temps de relâchement de l'enveloppe.",
        docEn: "Amplitude envelope release time.",
      },
    ],
    async executer(ctx: any) {
      const note = ctx.paramTexte("Note", "C2");
      const duree = ctx.paramNombre("Durée", 1.5);
      const volume = ctx.paramNombre("Volume", 80);
      const pitchDecay = ctx.paramNombre("Pitch decay", 0.05);
      const octaves = ctx.paramNombre("Octaves", 4);
      const decay = ctx.paramNombre("Decay", 0.4);
      const release = ctx.paramNombre("Release", 1.4);
      try {
        const buffer = await genererMembraneSynth({
          note,
          duree,
          volume,
          pitchDecay,
          octaves,
          decay,
          release,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer],
          message: traduire("msg.kick_var_0_var_1_s", note, buffer.duration.toFixed(2)),
        };
      } catch (e: any) {
        return {
          valeurs: [null],
          erreur: true,
          message: traduire("msg.erreur_membranesynth_var_0", e?.message ?? e),
        };
      }
    },
  },
  {
    id: "metal-synth",
    nom: "Metal Synth",
    nomEn: "Metal Synth",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère un son métallique (hi-hat, cloche, cymbale) avec Tone.js.",
    resumeEn: "Generates a metallic sound (hi-hat, bell, cymbal) with Tone.js.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Note",
        nomEn: "Note",
        type: "texte",
        defaut: "C5",
        doc: "Note de base (ex. C5, G5). Une note aiguë donne un hi-hat ; une note plus grave sonne comme une cloche.",
        docEn: "Base note (e.g. C5, G5). A high note sounds like a hi-hat; a lower note sounds like a bell.", defautEn: "C5",
      },
      {
        nom: "Durée",
        nomEn: "Duration",
        type: "nombre",
        plage: [0.1, 5],
        pas: 0.1,
        defaut: 2,
        unite: "s",
        doc: "Durée totale du buffer généré.",
        docEn: "Total duration of the generated buffer.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Niveau de sortie du son.",
        docEn: "Output level of the sound.",
      },
      {
        nom: "Harmonicity",
        nomEn: "Harmonicity",
        type: "nombre",
        plage: [0.1, 10],
        pas: 0.1,
        defaut: 5.1,
        doc: "Rapport de fréquence entre modulateur et porteuse.",
        docEn: "Frequency ratio between modulator and carrier.",
      },
      {
        nom: "Modulation index",
        nomEn: "Modulation index",
        type: "nombre",
        plage: [1, 100],
        pas: 1,
        defaut: 32,
        doc: "Intensité de la modulation de fréquence.",
        docEn: "Intensity of frequency modulation.",
      },
      {
        nom: "Resonance",
        nomEn: "Resonance",
        type: "nombre",
        plage: [100, 7000],
        pas: 10,
        defaut: 4000,
        unite: "Hz",
        doc: "Fréquence de coupure de base du filtre passe-haut.",
        docEn: "Base cutoff frequency of the highpass filter.",
      },
      {
        nom: "Octaves",
        nomEn: "Octaves",
        type: "nombre",
        plage: [0, 8],
        pas: 0.1,
        defaut: 1.5,
        unite: "oct",
        doc: "Etendue de la montée du filtre pendant l'enveloppe.",
        docEn: "Filter sweep range during the envelope.",
      },
      {
        nom: "Attack",
        nomEn: "Attack",
        type: "nombre",
        plage: [0.001, 0.5],
        pas: 0.001,
        defaut: 0.001,
        unite: "s",
        doc: "Temps de montée de l'enveloppe (0 = instantané).",
        docEn: "Envelope attack time (0 = instantaneous).",
      },
      {
        nom: "Decay",
        nomEn: "Decay",
        type: "nombre",
        plage: [0.01, 3],
        pas: 0.01,
        defaut: 1.4,
        unite: "s",
        doc: "Temps de déclin de l'enveloppe jusqu'au niveau de sustain.",
        docEn: "Envelope decay time to the sustain level.",
      },
      {
        nom: "Release",
        nomEn: "Release",
        type: "nombre",
        plage: [0.01, 3],
        pas: 0.01,
        defaut: 0.2,
        unite: "s",
        doc: "Temps de retour au silence après la fin de la note.",
        docEn: "Envelope release time after the note ends.",
      },
    ],
    async executer(ctx: any) {
      const note = ctx.paramTexte("Note", "C5");
      const duree = ctx.paramNombre("Durée", 2);
      const volume = ctx.paramNombre("Volume", 80);
      const harmonicity = ctx.paramNombre("Harmonicity", 5.1);
      const modulationIndex = ctx.paramNombre("Modulation index", 32);
      const resonance = ctx.paramNombre("Resonance", 4000);
      const octaves = ctx.paramNombre("Octaves", 1.5);
      const attack = ctx.paramNombre("Attack", 0.001);
      const decay = ctx.paramNombre("Decay", 1.4);
      const release = ctx.paramNombre("Release", 0.2);
      try {
        const buffer = await genererMetalSynth({
          note,
          duree,
          volume,
          harmonicity,
          modulationIndex,
          resonance,
          octaves,
          attack,
          decay,
          release,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer],
          message: traduire("msg.metal_var_0_var_1_s", note, buffer.duration.toFixed(2)),
        };
      } catch (e: any) {
        return {
          valeurs: [null],
          erreur: true,
          message: traduire("msg.erreur_metalsynth_var_0", e?.message ?? e),
        };
      }
    },
  },
  {
    id: "poly-synth",
    nom: "Poly Synth",
    nomEn: "Poly Synth",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère un accord polyphonique avec enveloppe ADSR.",
    resumeEn: "Generates a polyphonic chord with an ADSR envelope.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Notes",
        nomEn: "Notes",
        type: "texte",
        defaut: "C4,E4,G4",
        doc: "Notes de l'accord, séparées par des virgules (ex. C4,E4,G4).",
        docEn: "Chord notes, comma-separated (e.g. C4,E4,G4).", defautEn: "C4,E4,G4",
      },
      {
        nom: "Durée par note",
        nomEn: "Note duration",
        type: "nombre",
        plage: [0.05, 5],
        pas: 0.05,
        defaut: 0.5,
        unite: "s",
        doc: "Durée de tenue de chaque note avant le relâchement.",
        docEn: "Duration each note is held before release.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Niveau de sortie du son.",
        docEn: "Output level of the sound.",
      },
      {
        nom: "Forme d'onde",
        nomEn: "Waveform",
        type: "choix",
        options: ["sine", "square", "sawtooth", "triangle"],
        optionsEn: ["sine", "square", "sawtooth", "triangle"],
        defaut: "triangle",
        doc: "Forme d'onde des oscillateurs.",
        docEn: "Oscillator waveform.", defautEn: "triangle",
      },
      {
        nom: "Attack",
        nomEn: "Attack",
        type: "nombre",
        plage: [0, 1],
        pas: 0.001,
        defaut: 0.01,
        unite: "s",
        doc: "Temps de montée de l'enveloppe (0 = instantané).",
        docEn: "Envelope attack time (0 = instantaneous).",
      },
      {
        nom: "Decay",
        nomEn: "Decay",
        type: "nombre",
        plage: [0, 2],
        pas: 0.01,
        defaut: 0.1,
        unite: "s",
        doc: "Temps de déclin de l'enveloppe jusqu'au niveau de sustain.",
        docEn: "Envelope decay time to the sustain level.",
      },
      {
        nom: "Sustain",
        nomEn: "Sustain",
        type: "nombre",
        plage: [0, 1],
        pas: 0.01,
        defaut: 0.3,
        unite: "niveau",
        doc: "Niveau de maintien de l'enveloppe (0 = silence, 1 = maximum).",
        docEn: "Envelope sustain level (0 = silence, 1 = maximum).",
      },
      {
        nom: "Release",
        nomEn: "Release",
        type: "nombre",
        plage: [0, 3],
        pas: 0.01,
        defaut: 1,
        unite: "s",
        doc: "Temps de retour au silence après la fin de la note.",
        docEn: "Envelope release time after the note ends.",
      },
    ],
    async executer(ctx: any) {
      const notesBrutes = ctx.paramTexte("Notes", "C4,E4,G4");
      const notes = notesBrutes.split(",").map((n: string) => n.trim()).filter(Boolean);
      const dureeNote = ctx.paramNombre("Durée par note", 0.5);
      const volume = ctx.paramNombre("Volume", 80);
      const waveform = ctx.paramTexte("Forme d'onde", "triangle");
      const attack = ctx.paramNombre("Attack", 0.01);
      const decay = ctx.paramNombre("Decay", 0.1);
      const sustain = ctx.paramNombre("Sustain", 0.3);
      const release = ctx.paramNombre("Release", 1);
      try {
        const buffer = await genererPolySynth({
          notes,
          dureeNote,
          volume,
          waveform,
          attack,
          decay,
          sustain,
          release,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer],
          message: traduire("msg.accord_var_0_var_1_s", notes.join("+"), buffer.duration.toFixed(2)),
        };
      } catch (e: any) {
        return {
          valeurs: [null],
          erreur: true,
          message: traduire("msg.erreur_polysynth_var_0", e?.message ?? e),
        };
      }
    },
  },
  {
    id: "fm-synth",
    nom: "FM / AM Synth",
    nomEn: "FM / AM Synth",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère une note avec modulation de fréquence (FM) ou d'amplitude (AM).",
    resumeEn: "Generates a note with frequency modulation (FM) or amplitude modulation (AM).",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Mode",
        nomEn: "Mode",
        type: "choix",
        options: ["FM", "AM"],
        optionsEn: ["FM", "AM"],
        defaut: "FM", defautEn: "FM",
        doc: "Type de modulation : FM (fréquence) ou AM (amplitude).",
        docEn: "Modulation type: FM (frequency) or AM (amplitude).",
      },
      {
        nom: "Note",
        nomEn: "Note",
        type: "texte",
        defaut: "C4", defautEn: "C4",
        doc: "Note à jouer (ex. C4, G5).",
        docEn: "Note to play (e.g. C4, G5).",
      },
      {
        nom: "Durée",
        nomEn: "Duration",
        type: "nombre",
        plage: [0.1, 5],
        pas: 0.1,
        defaut: 1.5,
        unite: "s",
        doc: "Durée totale du buffer généré.",
        docEn: "Total duration of the generated buffer.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Niveau de sortie du son.",
        docEn: "Output level of the sound.",
      },
      {
        nom: "Harmonicity",
        nomEn: "Harmonicity",
        type: "nombre",
        plage: [0.1, 10],
        pas: 0.1,
        defaut: 3,
        doc: "Rapport de fréquence entre porteuse et modulateur.",
        docEn: "Frequency ratio between carrier and modulator.",
      },
      {
        nom: "Modulation index",
        nomEn: "Modulation index",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 10,
        doc: "Profondeur de la modulation (FM uniquement).",
        docEn: "Modulation depth (FM only).",
      },
      {
        nom: "Attack",
        nomEn: "Attack",
        type: "nombre",
        plage: [0, 1],
        pas: 0.001,
        defaut: 0.01,
        unite: "s",
        doc: "Temps de montée de l'enveloppe (0 = instantané).",
        docEn: "Envelope attack time (0 = instantaneous).",
      },
      {
        nom: "Decay",
        nomEn: "Decay",
        type: "nombre",
        plage: [0, 2],
        pas: 0.01,
        defaut: 0.1,
        unite: "s",
        doc: "Temps de déclin de l'enveloppe jusqu'au niveau de sustain.",
        docEn: "Envelope decay time to the sustain level.",
      },
      {
        nom: "Sustain",
        nomEn: "Sustain",
        type: "nombre",
        plage: [0, 1],
        pas: 0.01,
        defaut: 0.3,
        unite: "niveau",
        doc: "Niveau de maintien de l'enveloppe (0 = silence, 1 = maximum).",
        docEn: "Envelope sustain level (0 = silence, 1 = maximum).",
      },
      {
        nom: "Release",
        nomEn: "Release",
        type: "nombre",
        plage: [0, 3],
        pas: 0.01,
        defaut: 0.5,
        unite: "s",
        doc: "Temps de retour au silence après la fin de la note.",
        docEn: "Envelope release time after the note ends.",
      },
    ],
    async executer(ctx: any) {
      const mode = ctx.paramTexte("Mode", "FM") as "FM" | "AM";
      const note = ctx.paramTexte("Note", "C4");
      const duree = ctx.paramNombre("Durée", 1.5);
      const volume = ctx.paramNombre("Volume", 80);
      const harmonicity = ctx.paramNombre("Harmonicity", 3);
      const modulationIndex = ctx.paramNombre("Modulation index", 10);
      const attack = ctx.paramNombre("Attack", 0.01);
      const decay = ctx.paramNombre("Decay", 0.1);
      const sustain = ctx.paramNombre("Sustain", 0.3);
      const release = ctx.paramNombre("Release", 0.5);
      try {
        const buffer = await genererModulationSynth({
          note,
          duree,
          volume,
          mode,
          harmonicity,
          modulationIndex,
          attack,
          decay,
          sustain,
          release,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer],
          message: traduire("msg.var_0_var_1_var_2_s_2", mode, note, buffer.duration.toFixed(2)),
        };
      } catch (e: any) {
        return {
          valeurs: [null],
          erreur: true,
          message: traduire("msg.erreur_var_0_synth_var_1", mode, e?.message ?? e),
        };
      }
    },
  },
  {
    id: "pluck-synth",
    nom: "Pluck Synth",
    nomEn: "Pluck Synth",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère une note de corde pincée par synthèse Karplus-Strong.",
    resumeEn: "Generates a plucked string note using Karplus-Strong synthesis.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Note",
        nomEn: "Note",
        type: "texte",
        defaut: "C4",
        doc: "Note de corde pincée (ex. C4, G3).",
        docEn: "Plucked string note (e.g. C4, G3).", defautEn: "C4",
      },
      {
        nom: "Durée",
        nomEn: "Duration",
        type: "nombre",
        plage: [0.1, 5],
        pas: 0.1,
        defaut: 2,
        unite: "s",
        doc: "Durée totale du buffer généré.",
        docEn: "Total duration of the generated buffer.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Niveau de sortie du son.",
        docEn: "Output level of the sound.",
      },
      {
        nom: "Attack noise",
        nomEn: "Attack noise",
        type: "nombre",
        plage: [0.1, 20],
        pas: 0.1,
        defaut: 1,
        doc: "Quantité de bruit à l'attaque.",
        docEn: "Amount of noise at the attack.",
      },
      {
        nom: "Dampening",
        nomEn: "Dampening",
        type: "nombre",
        plage: [100, 7000],
        pas: 10,
        defaut: 4000,
        unite: "Hz",
        doc: "Fréquence de coupure du filtre passe-bas du peigne.",
        docEn: "Cutoff frequency of the comb filter's lowpass.",
      },
      {
        nom: "Resonance",
        nomEn: "Resonance",
        type: "nombre",
        plage: [0, 1],
        pas: 0.01,
        defaut: 0.7,
        doc: "Résonance / durée de sustain.",
        docEn: "Resonance / sustain duration.",
      },
      {
        nom: "Release",
        nomEn: "Release",
        type: "nombre",
        plage: [0, 3],
        pas: 0.01,
        defaut: 1,
        unite: "s",
        doc: "Temps de descente de la résonance à zéro.",
        docEn: "Time for the resonance to ramp down to zero.",
      },
    ],
    async executer(ctx: any) {
      const note = ctx.paramTexte("Note", "C4");
      const duree = ctx.paramNombre("Durée", 2);
      const volume = ctx.paramNombre("Volume", 80);
      const attackNoise = ctx.paramNombre("Attack noise", 1);
      const dampening = ctx.paramNombre("Dampening", 4000);
      const resonance = ctx.paramNombre("Resonance", 0.7);
      const release = ctx.paramNombre("Release", 1);
      try {
        const buffer = await genererPluckSynth({
          note,
          duree,
          volume,
          attackNoise,
          dampening,
          resonance,
          release,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer],
          message: traduire("msg.pluck_var_0_var_1_s", note, buffer.duration.toFixed(2)),
        };
      } catch (e: any) {
        return {
          valeurs: [null],
          erreur: true,
          message: traduire("msg.erreur_plucksynth_var_0", e?.message ?? e),
        };
      }
    },
  },
  {
    id: "drum-synth",
    nom: "Batterie synthétique",
    nomEn: "Drum Synth",
    univers: "Entrées",
    famille: "Génération",
    resume: "Reçoit un MIDI et le joue avec des synthétiseurs de percussion (sans SoundFont).",
    resumeEn: "Receives MIDI and plays it with percussion synthesizers (no SoundFont).",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      {
        nom: "Canal MIDI",
        nomEn: "MIDI channel",
        type: "nombre",
        plage: [1, 16],
        pas: 1,
        defaut: 10,
        doc: "Canal MIDI contenant les notes de batterie (10 = canal GM batterie).",
        docEn: "MIDI channel containing the drum notes (10 = GM drum channel).",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Niveau de sortie de la batterie.",
        docEn: "Output level of the drum kit.",
      },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null, null], message: traduire("msg.aucun_midi") };
      const canal = ctx.paramNombre("Canal MIDI", 10);
      const volume = ctx.paramNombre("Volume", 80);
      try {
        const data = new Uint8Array(await fichier.arrayBuffer());
        const midi = parseMidi(data);
        const { notes } = analyserMidi(midi);
        const notesFiltrees = notes
          .filter((n) => n.canal === canal - 1)
          .map((n) => ({ note: n.note, velocite: n.velociete, debut: n.debut, fin: n.fin }));
        const buffer = await rendreBatterieMidi({
          notes: notesFiltrees,
          volume,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer, fichier],
          message: traduire("msg.batterie_var_0_coups_var_1_s", notesFiltrees.length, buffer.duration.toFixed(2)),
        };
      } catch (e: any) {
        return {
          valeurs: [null, null],
          erreur: true,
          message: traduire("msg.erreur_drumsynth_var_0", e?.message ?? e),
        };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
