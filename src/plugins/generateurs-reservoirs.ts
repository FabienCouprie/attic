// plugins/generateurs-reservoirs.ts — Reseaux a reservoir.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi, rendreMidiDepuisBytes } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, PARAMETRE_INSTRUMENT_SF2_SUIVI, decoderInstrumentSF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import { PARAMETRE_CLE } from "../audio/cles";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */

export const fiches: FicheAudio[] = ([
  {
    id: "reservoir-musical", nom: "Réservoir neuronal", nomEn: "Neural Reservoir",
    univers: "Entrées", famille: "Génération",
    resume: "Génère une mélodie émergente par réseau de neurones aléatoires (inspiré d'Allendia/EVY). Sortie audio + sortie MIDI.",
    resumeEn: "Generates emergent melody via random neural networks (inspired by Allendia/EVY). Audio output + MIDI output.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
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
      { ...PARAMETRE_CLE,
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues","chromatique"], defaut: "majeur",
        optionIds: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues","chromatique"],
        doc: "Gamme utilisée pour mapper les activations du réseau vers des notes.", docEn: "Scale used to map network activations to notes.", optionsEn: ["major", "minor", "major pentatonic", "minor pentatonic", "blues", "chromatic"], defautEn: "major" },
      { nom: "Octave", nomEn: "Octave", plage: [2, 6], pas: 1, defaut: 4,
        doc: "Octave de départ (les notes peuvent monter sur 2 octaves).", docEn: "Starting octave (notes can span 2 octaves above)." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Résolution", nomEn: "Resolution", type: "choix", options: ["1/4","1/8","1/16"], optionsEn: ["1/4","1/8","1/16"], defaut: "1/8",
        doc: "Division du temps. 1/4 = noires, 1/8 = croches, 1/16 = doubles croches.", docEn: "Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth.", defautEn: "1/8" },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 64], pas: 1, defaut: 4,
        doc: "Nombre de mesures à générer.", docEn: "Number of bars to generate." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Sinus","Carré","Scie","Triangle"], optionIds: ["sine","square","sawtooth","triangle"], optionsEn: ["Sine","Square","Saw","Triangle"], defaut: "Triangle",
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
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      const { genererReservoirMusical, rendreReservoirAudio, rendreSequence, notesVersFichierMidi, appliquerInstrumentMidi } = await import("../audio");
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
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      ctx.onProgress(traduire("progress.g_n_ration_du_r_servoir_neuronal"));
      const { notes, graineUtilisee } = genererReservoirMusical(config);
      const notesJouees = notes.filter((n: any) => !n.silence);
      ctx.onProgress(traduire("progress.rendu_audio"));
      let buf: AudioBuffer;
      if (modeRendu === "SoundFont") {
        const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
        buf = await rendreSequence(
          notesJouees.map((n: any) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.debut + n.duree })),
          "SoundFont",
          config.volume,
          programme,
          banque,
        );
      } else {
        buf = rendreReservoirAudio(notes, config);
      }
      const midiFile = notesJouees.length === 0
        ? null
        : await appliquerInstrumentMidi(
            notesVersFichierMidi(
              notesJouees.map((n: any) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.debut + n.duree })),
              config.tempo,
            ),
            ctx.paramNombre("Instrument", 0),
          );
      const nbNotes = notesJouees.length;
      return { valeurs: [buf, midiFile], message: traduire("msg.var_0_neurones_var_1_notes_graine_var_2_var_3_mes", config.taille, nbNotes, graineUtilisee, config.mesures) };
    },
  },
  {
    id: "multi-reservoirs", nom: "Multi-réservoirs", nomEn: "Multi-reservoir",
    univers: "Entrées", famille: "Génération",
    resume: "Plusieurs réservoirs neuronaux en réseau (mélodie, basse, harmonie, rythme), émergence polyphonique.",
    resumeEn: "Multiple neural reservoirs in network (melody, bass, harmony, rhythm), polyphonic emergence.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Mélodie MIDI", nomEn: "Melody MIDI", type: "midi" },
      { nom: "Basse MIDI", nomEn: "Bass MIDI", type: "midi" },
      { nom: "Harmonie MIDI", nomEn: "Harmony MIDI", type: "midi" },
      { nom: "Rythme MIDI", nomEn: "Rhythm MIDI", type: "midi" },
    ],
    parametres: [
      { ...PARAMETRE_CLE,
        doc: "Note fondamentale (tonique) de la gamme.", docEn: "Root note (tonic) of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix", options: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues"], defaut: "majeur",
        optionIds: ["majeur","mineur","pentatonique majeur","pentatonique mineur","blues"],
        doc: "Gamme utilisée pour mapper les activations vers des notes.", docEn: "Scale used to map activations to notes.", optionsEn: ["major", "minor", "major pentatonic", "minor pentatonic", "blues"], defautEn: "major" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Résolution", nomEn: "Resolution", type: "choix", options: ["1/4","1/8","1/16"], optionsEn: ["1/4","1/8","1/16"], defaut: "1/8",
        doc: "Division du temps. 1/4 = noires, 1/8 = croches, 1/16 = doubles croches.", docEn: "Time division. 1/4 = quarter, 1/8 = eighth, 1/16 = sixteenth.", defautEn: "1/8" },
      { nom: "Mesures", nomEn: "Bars", plage: [1, 64], pas: 1, defaut: 4,
        doc: "Nombre de mesures à générer.", docEn: "Number of bars to generate." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix", options: ["Sinus","Carré","Scie","Triangle"], optionIds: ["sine","square","sawtooth","triangle"], optionsEn: ["Sine","Square","Saw","Triangle"], defaut: "Triangle",
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
      { ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon la synthèse interne. Le SoundFont joue les instruments choisis ci-dessous ; la synthèse interne, elle, garde ses timbres d'oscillateur et ignore ces choix.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, otherwise the built-in synthesis. The SoundFont plays the instruments chosen below; the built-in synthesis keeps its oscillator timbres and ignores those choices." },
      { ...PARAMETRE_INSTRUMENT_SF2_SUIVI, nom: "Instrument mélodie", nomEn: "Melody instrument",
        doc: "Preset du SoundFont global écrit dans la sortie « Mélodie MIDI », pour que l'instrument voyage avec le fichier : un composant qui rend ce MIDI en aval suivra ce choix. « Suivre le MIDI » n'écrit rien. Au SoundFont, c'est aussi ce qu'on entend dans la sortie audio ; en synthèse interne, le composant garde ses timbres d'oscillateur.", docEn: "Preset of the global SoundFont written into the « Melody MIDI » output, so the instrument travels with the file: a node rendering this MIDI downstream will follow it. « Follow MIDI » writes nothing. With the SoundFont, it is also what the audio output plays; with the built-in synthesis, the node keeps its oscillator timbres." },
      { ...PARAMETRE_INSTRUMENT_SF2_SUIVI, nom: "Instrument basse", nomEn: "Bass instrument",
        doc: "Preset du SoundFont global écrit dans la sortie « Basse MIDI », pour que l'instrument voyage avec le fichier : un composant qui rend ce MIDI en aval suivra ce choix. « Suivre le MIDI » n'écrit rien. Au SoundFont, c'est aussi ce qu'on entend dans la sortie audio ; en synthèse interne, le composant garde ses timbres d'oscillateur.", docEn: "Preset of the global SoundFont written into the « Bass MIDI » output, so the instrument travels with the file: a node rendering this MIDI downstream will follow it. « Follow MIDI » writes nothing. With the SoundFont, it is also what the audio output plays; with the built-in synthesis, the node keeps its oscillator timbres." },
      { ...PARAMETRE_INSTRUMENT_SF2_SUIVI, nom: "Instrument harmonie", nomEn: "Harmony instrument",
        doc: "Preset du SoundFont global écrit dans la sortie « Harmonie MIDI », pour que l'instrument voyage avec le fichier : un composant qui rend ce MIDI en aval suivra ce choix. « Suivre le MIDI » n'écrit rien. Au SoundFont, c'est aussi ce qu'on entend dans la sortie audio ; en synthèse interne, le composant garde ses timbres d'oscillateur.", docEn: "Preset of the global SoundFont written into the « Harmony MIDI » output, so the instrument travels with the file: a node rendering this MIDI downstream will follow it. « Follow MIDI » writes nothing. With the SoundFont, it is also what the audio output plays; with the built-in synthesis, the node keeps its oscillator timbres." },
      { ...PARAMETRE_INSTRUMENT_SF2, nom: "Kit de batterie", nomEn: "Drum kit", defaut: 16384,
        doc: "Preset du SoundFont global à utiliser pour la piste rythme MIDI. Réglages : un kit de percussion (banque 128).", docEn: "Preset of the loaded global SoundFont to use for the rhythm MIDI track. A percussion kit (bank 128) is chosen the same way." },
      { nom: "Transpose batterie", nomEn: "Drum transpose", plage: [-36, 36], pas: 1, defaut: 0, unite: "demi-tons", uniteEn: "semitones",
        doc: "Transposition des notes de batterie MIDI si le kit de batterie du SoundFont n'est pas mappé sur les notes General MIDI.", docEn: "Transpose the drum MIDI notes if the SoundFont drum kit is not mapped to General MIDI notes." },
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
        // Graine 0 : tirée une fois ici et montrée dans le message, pour qu'un réseau réussi se rejoue.
        graine: hasardDuNoeud(ctx.paramNombre("Graine", 0)).graine,
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
        melodieInstrument: ctx.paramNombre("Instrument mélodie", -1),
        basseInstrument: ctx.paramNombre("Instrument basse", -1),
        harmonieInstrument: ctx.paramNombre("Instrument harmonie", -1),
        rythmeInstrument: ctx.paramNombre("Kit de batterie", 0),
        rythmeTranspose: ctx.paramNombre("Transpose batterie", 0),
        influence: ctx.paramNombre("Influence", 50) / 100,
      };
      ctx.onProgress(traduire("progress.g_n_ration_multi_r_servoirs"));
      const { buffer, details, midis } = genererMultiReservoir(config);

      // Le nœud rendait TOUJOURS son audio avec sa synthèse interne — oscillateurs et
      // enveloppe maison —, si bien que les instruments choisis ne s'entendaient nulle
      // part : ils ne partaient que dans les fichiers MIDI, pour un nœud en aval. Au
      // SoundFont, on joue maintenant les quatre parties réunies, chacune sur son canal
      // avec son programme, exactement comme la Groove Box.
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const auSoundFont = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());
      let audio = buffer;
      if (auSoundFont) {
        const { fusionnerMidis, rendreMidiDepuisBytes } = await import("../audio");
        const parties = await Promise.all([midis.melody, midis.bass, midis.harmony, midis.rhythm]
          .map(async (f) => new Uint8Array(await f.arrayBuffer())));
        audio = await rendreMidiDepuisBytes(fusionnerMidis(parties), "SoundFont", config.volume);
      }
      return {
        valeurs: [audio, midis.melody, midis.bass, midis.harmony, midis.rhythm],
        message: traduire("msg.var_0_graine_var_1", details, config.graine),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
