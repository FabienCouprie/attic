// plugins/texte-vers-midi.ts — Nœud « Texte → MIDI » : convertit une notation
// texte simple (une note/accord par ligne) en fichier MIDI + audio synthétisé.
// Débloque le workflow « LLM compositeur » : un nœud IA (Ollama, GPT-2…) produit
// la notation, ce nœud la rend. Marche aussi avec n'importe quelle source texte.
//
// Format (documenté dans la notice, à donner tel quel au LLM) :
//   TEMPO 120           ← optionnel, une fois ; sinon le paramètre Tempo s'applique
//   C4 0.5              ← note octave  durée-en-temps  [vélocité]
//   E4 0.5 100
//   rest 0.5            ← silence
//   C4+E4+G4 1          ← accord (notes séparées par +)
// Les lignes vides et celles commençant par # ou // sont ignorées.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { notesVersFichierMidi, rendreMidi, type NoteEvenement } from "../audio";

const DEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// "C4" / "F#3" / "Bb5" / "60" → numéro MIDI (C4 = 60), ou null si invalide.
function noteVersMidi(tok: string): number | null {
  const t = tok.trim();
  if (/^\d+$/.test(t)) { const n = parseInt(t, 10); return n >= 0 && n <= 127 ? n : null; }
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(t);
  if (!m) return null;
  let semi = DEMI[m[1].toUpperCase()];
  if (m[2] === "#") semi++; else if (m[2] === "b") semi--;
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return midi >= 0 && midi <= 127 ? midi : null;
}

function parserNotation(texte: string, tempoInitial: number): { notes: NoteEvenement[]; tempo: number } {
  let tempo = tempoInitial > 0 ? tempoInitial : 120;
  let t = 0; // curseur temporel en secondes
  const notes: NoteEvenement[] = [];
  for (const raw of texte.split(/\r?\n/)) {
    const ligne = raw.trim();
    if (!ligne || ligne.startsWith("#") || ligne.startsWith("//")) continue;
    const parts = ligne.split(/\s+/);
    if (parts[0].toUpperCase() === "TEMPO") {
      const v = parseFloat(parts[1]); if (v > 0) tempo = v; continue;
    }
    const dureeBeats = parseFloat(parts[1] ?? "1") || 1;
    const dureeSec = dureeBeats * (60 / tempo);
    const vel = Math.max(1, Math.min(127, Math.round(parseFloat(parts[2] ?? "80")) || 80));
    if (/^(rest|r)$/i.test(parts[0])) { t += dureeSec; continue; }
    for (const p of parts[0].split("+")) {
      const midi = noteVersMidi(p);
      if (midi != null) notes.push({ note: midi, velocite: vel, debut: t, fin: t + dureeSec });
    }
    t += dureeSec;
  }
  return { notes, tempo };
}

const EXEMPLE = "TEMPO 120\nC4 0.5\nE4 0.5\nG4 0.5\nC5 1\nrest 0.5\nA4+C5+E5 1";

export const fiches: FicheAudio[] = ([
  {
    id: "texte-vers-midi", nom: "Texte → MIDI", nomEn: "Text → MIDI",
    univers: "Entrées", famille: "Génération",
    resume: "Convertit une notation texte (note/accord par ligne) en MIDI + audio.",
    resumeEn: "Converts a text notation (one note/chord per line) into MIDI + audio.",
    notice: "Rend une notation texte simple en fichier MIDI et en audio synthétisé. Une ligne = « note octave durée [vélocité] », ex. « C4 0.5 » ou « C4+E4+G4 1 » (accord), « rest 0.5 » pour un silence, « TEMPO 120 » en tête. Le texte vient de l'entrée (port bleu) ou du paramètre. Idéal branché après un nœud IA (Ollama, GPT-2) à qui l'on demande ce format.",
    noticeEn: "Renders a simple text notation into a MIDI file and synthesized audio. One line = « note octave duration [velocity] », e.g. « C4 0.5 » or « C4+E4+G4 1 » (chord), « rest 0.5 » for a rest, « TEMPO 120 » at the top. Text comes from the input (blue port) or the parameter. Ideal after an AI node (Ollama, GPT-2) prompted to output this format.",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte", requis: false }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: EXEMPLE,
        doc: "Notation à convertir, utilisée si aucune entrée texte n'est connectée. Une note/accord par ligne.",
        docEn: "Notation to convert, used when no text input is connected. One note/chord per line." },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo par défaut (temps → secondes). Une ligne « TEMPO n » dans le texte le remplace.",
        docEn: "Default tempo (beats → seconds). A « TEMPO n » line in the text overrides it." },
      { nom: "Synthèse", nomEn: "Synthesis", type: "choix", options: ["FM/Oscillateurs", "SoundFont"],
        optionsEn: ["FM/Oscillators", "SoundFont"], defaut: "FM/Oscillateurs",
        doc: "Moteur de rendu audio du MIDI.", docEn: "Audio rendering engine for the MIDI.", defautEn: "FM/Oscillators" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de l'audio synthétisé.", docEn: "Synthesized audio volume." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim()) ? entree : ctx.paramTexte("Notation", EXEMPLE);
      const { notes, tempo } = parserNotation(texte, ctx.paramNombre("Tempo", 120));
      if (notes.length === 0) return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_note_reconnue_format_attendu_c4_0_5_par_ligne") };
      const midiFichier = notesVersFichierMidi(notes, tempo);
      const mode = ctx.paramTexte("Synthèse", "FM/Oscillateurs") === "SoundFont" ? "SoundFont" : "FM/Oscillateurs";
      const audio = await rendreMidi(midiFichier, mode, ctx.paramNombre("Volume", 80));
      return { valeurs: [audio, midiFichier], message: traduire("msg.var_0_note_s_var_1_bpm_var_2_s", notes.length, tempo, audio.duration.toFixed(1)) };
   },
 },
] as FicheAudio[]).map(avecDoc);
