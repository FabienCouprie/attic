// plugins/tonal.ts — Nœuds de théorie musicale via la bibliothèque Tonal.
// Tonal : MIT licence — ajouté dans THIRD_PARTY.md.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { Chord, Scale, Note, Progression } from "tonal";
import { estimerTonalite, detecterAccords } from "../audio/accords";

function parserNotes(texte: string): string[] {
  return texte
    .split(/[\s,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

// Renvoie les notes d'un symbole d'accord Tonal réparties de manière ascendante
// à partir de l'octave de base (ex. "C3 E3 G3" pour C majeur en octave 3).
function notesAccordAscendantes(accord: string, octave: number): string[] {
  const c = Chord.get(accord);
  if (!c || !c.notes.length) return [];
  const notes: string[] = [];
  let lastMidi = -Infinity;
  for (const n of c.notes) {
    let midi = Note.midi(`${n}${octave}`) ?? 0;
    while (midi < lastMidi) midi += 12;
    const nom = Note.fromMidi(midi);
    if (nom) notes.push(nom);
    lastMidi = midi;
  }
  return notes;
}

// Convertit un symbole d'accord en notation texte-vers-midi (ex. "C4+E4+G4+B4 1").
function accordVersNotation(accord: string, octave: number, duree: number): string {
  const notes = notesAccordAscendantes(accord, octave);
  return notes.length ? `${notes.join("+")} ${duree}` : "";
}

// Suggère une progression classique adaptée à la tonalité détectée.
function progressionSuggest(type: "major" | "minor"): string {
  if (type === "minor") return "i VI III VII";
  return "I V vi IV";
}

export const fiches: FicheAudio[] = ([
  {
    id: "tonal-accord", nom: "Accord", nomEn: "Chord",
    univers: "Autres", famille: "Théorie",
    resume: "Détecte le nom d'un accord à partir de ses notes.",
    resumeEn: "Detects the chord name from its notes.",
    entrees: [{ nom: "Notes", nomEn: "Notes", type: "texte", requis: false }],
    sorties: [{ nom: "Nom", nomEn: "Name", type: "texte" }],
    parametres: [
      { nom: "Notes", nomEn: "Notes", type: "texte", defaut: "C E G",
        doc: "Notes de l'accord séparées par des espaces (ex : C E G, F A C E).",
        docEn: "Chord notes separated by spaces (e.g. C E G, F A C E).", defautEn: "C E G" },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const notesTexte = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Notes", "C E G");
      const notes = parserNotes(notesTexte);
      if (notes.length === 0) return { valeurs: [null], message: traduire("msg.aucune_note_fournie") };
      const detectes = Chord.detect(notes);
      const symbole = detectes.length > 0 ? detectes[0] : null;
      const resultat = symbole ? (Chord.get(symbole).name || symbole) : "Accord inconnu";
      return { valeurs: [resultat], message: resultat };
   },
 },
  {
    id: "tonal-gamme", nom: "Gamme", nomEn: "Scale",
    univers: "Autres", famille: "Théorie",
    resume: "Liste les notes d'une gamme à partir d'une tonalité et d'un type.",
    resumeEn: "Lists the notes of a scale from a tonic and a scale type.",
    entrees: [{ nom: "Tonalité", nomEn: "Tonic", type: "texte", requis: false }],
    sorties: [{ nom: "Notes", nomEn: "Notes", type: "texte" }],
    parametres: [
      { nom: "Tonalité", nomEn: "Tonic", type: "texte", defaut: "C",
        doc: "Tonalité de départ (ex : C, D#, F#).",
        docEn: "Starting tonic (e.g. C, D#, F#).", defautEn: "C" },
      { nom: "Type", nomEn: "Type", type: "choix", options: ["major", "minor", "dorian", "mixolydian", "lydian", "phrygian", "locrian"], defaut: "major",
        doc: "Type de gamme.",
        docEn: "Scale type.", optionsEn: ["major", "minor", "dorian", "mixolydian", "lydian", "phrygian", "locrian"], defautEn: "major" },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const tonic = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tonalité", "C");
      const type = ctx.paramTexte("Type", "major");
      const gamme = Scale.get(`${tonic} ${type}`);
      if (!gamme.notes.length) return { valeurs: [null], message: traduire("msg.tonalit_invalide") };
      const resultat = gamme.notes.join(" ");
      return { valeurs: [resultat], message: resultat };
   },
 },
  {
    id: "tonal-transposer", nom: "Transposer", nomEn: "Transpose",
    univers: "Autres", famille: "Théorie",
    resume: "Transpose une note ou un accord d'un intervalle donné.",
    resumeEn: "Transposes a note or chord by a given interval.",
    entrees: [{ nom: "Note", type: "texte", requis: false }],
    sorties: [{ nom: "Transposé", nomEn: "Transposed", type: "texte" }],
    parametres: [
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "C4",
        doc: "Note à transposer (ex : C4, D#3, F#5).",
        docEn: "Note to transpose (e.g. C4, D#3, F#5).", defautEn: "C4" },
      { nom: "Intervalle", nomEn: "Interval", type: "choix", options: ["1P", "2m", "2M", "3m", "3M", "4P", "4A", "5P", "6m", "6M", "7m", "7M", "8P"], defaut: "2M",
        doc: "Intervalle de transposition (2M = ton, 3m = tierce mineure, 3M = tierce majeure, etc.).",
        docEn: "Transposition interval (2M = whole tone, 3m = minor third, 3M = major third, etc.).", optionsEn: ["1P", "2m", "2M", "3m", "3M", "4P", "4A", "5P", "6m", "6M", "7m", "7M", "8P"], defautEn: "2M" },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const note = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Note", "C4");
      const intervalle = ctx.paramTexte("Intervalle", "2M");
      const transposee = Note.transpose(note, intervalle);
      if (!transposee) return { valeurs: [null], message: traduire("msg.transposition_impossible") };
      return { valeurs: [transposee], message: transposee };
   },
 },
  {
    id: "tonal-progression", nom: "Progression", nomEn: "Progression",
    univers: "Autres", famille: "Théorie",
    resume: "Génère une progression d'accords à partir d'une tonalité et de chiffres romains.",
    resumeEn: "Generates a chord progression from a key and roman numerals.",
    entrees: [{ nom: "Tonalité", nomEn: "Tonic", type: "texte", requis: false }],
    sorties: [{ nom: "Accords", nomEn: "Chords", type: "texte" }],
    parametres: [
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité de la progression (ex : C, G, Dm, F#).",
        docEn: "Progression key (e.g. C, G, Dm, F#).", defautEn: "C" },
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        doc: "Progression en chiffres romains (ex : I V vi IV, ii V I).",
        docEn: "Roman numeral progression (e.g. I V vi IV, ii V I).", defautEn: "I V vi IV" },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const tonic = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tonalité", "C");
      const progTexte = ctx.paramTexte("Progression", "I V vi IV");
      const numerals = progTexte.split(/\s+/).filter((n: string) => n.length > 0);
      const accords = Progression.fromRomanNumerals(tonic, numerals);
      const resultat = accords.join(" ");
      return { valeurs: [resultat], message: resultat };
   },
 },
  {
    id: "tonal-grille", nom: "Grille d'accords", nomEn: "Chord Grid",
    univers: "Traitement", famille: "Génération",
    resume: "Génère un accompagnement complet au format texte-vers-midi.",
    resumeEn: "Generates a full accompaniment in text-to-MIDI format.",
    entrees: [{ nom: "Progression", type: "texte", requis: false }],
    sorties: [{ nom: "Notation", type: "texte" }, { nom: "Accords", nomEn: "Chords", type: "texte" }],
    parametres: [
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité de la grille (ex : C, G, Dm, F#).",
        docEn: "Grid key (e.g. C, G, Dm, F#).", defautEn: "C" },
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        doc: "Progression en chiffres romains. Accepte aussi une liste de symboles séparés par des espaces (ex : C Am F G).",
        docEn: "Roman numeral progression. Also accepts a space-separated list of chord symbols (e.g. C Am F G).", defautEn: "I V vi IV" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo de l'accompagnement.", docEn: "Accompaniment tempo." },
      { nom: "Durée", nomEn: "Duration", plage: [0.25, 4], pas: 0.25, defaut: 1, unite: "t",
        doc: "Durée de chaque accord en temps.", docEn: "Duration of each chord in beats." },
      { nom: "Octave", nomEn: "Octave", plage: [2, 5], pas: 1, defaut: 3,
        doc: "Octave de base des accords.", docEn: "Base octave for chords." },
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Bloc", "Arpège"], optionsEn: ["Block", "Arpeggio"], optionIds: ["block", "arpeggio"], defaut: "Bloc",
        doc: "Bloc joue toutes les notes simultanément, Arpège les décline en croches.",
        docEn: "Block plays all notes at once, Arpeggio plays them as eighth notes.", defautEn: "Block" },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const tonic = ctx.paramTexte("Tonalité", "C");
      const progEntree = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Progression", "I V vi IV");
      const tempo = ctx.paramNombre("Tempo", 120);
      const duree = ctx.paramNombre("Durée", 1);
      const octave = Math.round(ctx.paramNombre("Octave", 3));
      const mode = ctx.paramTexte("Mode", "Bloc");

      const tokens = progEntree.split(/\s+/).filter((t: string) => t.length > 0);
      const romains = /^[IViv]+$/.test(tokens[0] ?? "");
      const accords = romains ? Progression.fromRomanNumerals(tonic, tokens) : tokens;

      if (accords.length === 0 || accords.some((a: string) => !a)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.progression_invalide") };
      }

      const lignes: string[] = [`TEMPO ${tempo}`];
      if (mode === "arpeggio") {
        const dureeNote = 0.5;
        for (const accord of accords) {
          for (const n of notesAccordAscendantes(accord, octave + 1)) {
            lignes.push(`${n} ${dureeNote}`);
          }
        }
      } else {
        for (const accord of accords) {
          const ligne = accordVersNotation(accord, octave, duree);
          if (ligne) lignes.push(ligne);
        }
      }

      const notation = lignes.join("\n");
      const listeAccords = accords.join(" ");
      return { valeurs: [notation, listeAccords], message: traduire("msg.var_0_accords_var_1_var_2_bpm", accords.length, mode, tempo) };
   },
 },
  {
    id: "tonal-analyse", nom: "Analyse harmonique", nomEn: "Harmonic Analysis",
    univers: "Traitement", famille: "Analyse",
    resume: "Détecte la tonalité d'un morceau et suggère une progression.",
    resumeEn: "Detects the key of a song and suggests a chord progression.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Tonalité", nomEn: "Key", type: "texte" }, { nom: "Progression", type: "texte" }, { nom: "Accords détectés", nomEn: "Detected chords", type: "texte" }],
    parametres: [
      { nom: "Style", nomEn: "Style", type: "choix", options: ["Pop", "Jazz", "Blues"], optionsEn: ["Pop", "Jazz", "Blues"], defaut: "Pop",
        doc: "Style de la progression suggérée.", docEn: "Suggested progression style.", defautEn: "Pop" },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!buffer || !(buffer instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      }
      const tonalite = estimerTonalite(buffer);
      const accords = detecterAccords(buffer, 0.5);
      const style = ctx.paramTexte("Style", "Pop");
      let prog = progressionSuggest(tonalite.type);
      if (style === "Jazz") prog = "ii V I";
      if (style === "Blues") prog = "I I I I IV IV I I V IV I V";
      const accordsTexte = accords.map((a) => `${a.nomEn} (${a.duree.toFixed(1)}s)`).join("\n");
      return {
        valeurs: [`${tonalite.nom} (${Math.round(tonalite.confiance * 100)}%)`, prog, accordsTexte],
        message: traduire("msg.tonalit_var_0_var_1_accord_s_d_tect_s", tonalite.nom, accords.length),
      };
   },
 },
] as FicheAudio[]).map(avecDoc);
