// plugins/tone-synths-fm.ts — FM, corde pincee, et kit de batterie.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { genererModulationSynth, genererPluckSynth, rendreBatterieMidi } from "../audio/tone-synths";
import { analyserMidi } from "../audio/midi";
import { parseMidi } from "midi-file";
import { avecDoc } from "./notices";


export const fiches: FicheAudio[] = ([
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
        uniteEn: "level",
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
    univers: "Traitement",
    famille: "Effets",
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
        // LE CANAL CHOISI VIDE, ON JOUE TOUS LES CANAUX, et on le dit. Un MIDI mélodique sur le canal
        // 1 donnait un silence sans un mot : « 0 coups », sans savoir que le fichier jouait ailleurs.
        const surCanal = notes.filter((n) => n.canal === canal - 1);
        const repli = surCanal.length === 0 && notes.length > 0;
        const canaux = [...new Set(notes.map((n) => n.canal + 1))].sort((a, b) => a - b);
        const notesFiltrees = (repli ? notes : surCanal)
          .map((n) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.fin }));
        const buffer = await rendreBatterieMidi({
          notes: notesFiltrees,
          volume,
          sampleRate: ctx.runtime?.sampleRate ?? 44100,
        });
        return {
          valeurs: [buffer, fichier],
          message: traduire("msg.batterie_var_0_coups_var_1_s", notesFiltrees.length, buffer.duration.toFixed(2))
            + (repli ? (langueCourante() === "en"
              ? ` · channel ${canal} empty, all channels played (the file uses ${canaux.join(", ")})`
              : ` · canal ${canal} vide, tous les canaux joués (le fichier utilise ${canaux.join(", ")})`) : ""),
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
