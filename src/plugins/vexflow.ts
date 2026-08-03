// plugins/vexflow.ts — Nœuds de notation musicale via VexFlow.
// VexFlow : MIT licence — ajouté dans THIRD_PARTY.md.
//
// Les nœuds génèrent un SVG de notation (portée, tablature, grille d'accords)
// à partir d'une notation texte simple. Le SVG est retourné dans le message du
// résultat pour être affiché par la vue VexFlow dans le canevas.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { Chord, Progression } from "tonal";
import { Renderer, Factory, TabStave, TabNote, Voice, Formatter } from "vexflow";
import { parseMidi } from "midi-file";
import { analyserMidi } from "../audio/midi";

const DUREES: Record<string, string> = {
  w: "w", h: "h", q: "q", "8": "8", "16": "16", "32": "32",
};

function dureeVex(d: string): string {
  return DUREES[d] ?? "q";
}

function noteEasyScore(note: string): string {
  // "C4" / "F#3" / "Bb5" restent tels quels pour EasyScore (format VexFlow).
  // Accepte aussi les accords : "C4+E4+G4" → "C4+E4+G4".
  return note.split("+").map((n) => {
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(n.trim());
    if (!m) return n;
    return `${m[1].toUpperCase()}${m[2]}${m[3]}`;
  }).join("+");
}

function creerRenderer(width: number, height: number): { renderer: InstanceType<typeof Renderer>; div: HTMLDivElement } {
  const div = document.createElement("div");
  const renderer = new Renderer(div, Renderer.Backends.SVG);
  renderer.resize(width, height);
  return { renderer, div };
}

function dureeEnQuarts(duree: string): number {
  const map: Record<string, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };
  return map[duree] ?? 1;
}

function dureeDepuisQuarts(quarts: number): string {
  if (quarts >= 4) return "w";
  if (quarts >= 2) return "h";
  if (quarts >= 1) return "q";
  if (quarts >= 0.5) return "8";
  if (quarts >= 0.25) return "16";
  return "32";
}

// ── MIDI → notation VexFlow ──

const NOMS_NOTES: string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const DUREES_VEX: { q: number; v: string }[] = [
  { q: 0.125, v: "32" },
  { q: 0.25, v: "16" },
  { q: 0.5, v: "8" },
  { q: 1, v: "q" },
  { q: 2, v: "h" },
  { q: 4, v: "w" },
];

const GRILLES_NOTATION: Record<string, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/32": 0.125,
};

function dureeStandardVex(quarts: number): string {
  const clamped = Math.max(0.125, Math.min(4, quarts));
  let meilleur = DUREES_VEX[0];
  let best = Infinity;
  for (const d of DUREES_VEX) {
    const diff = Math.abs(clamped - d.q);
    if (diff < best) {
      best = diff;
      meilleur = d;
    }
  }
  return meilleur.v;
}

function noteMidiEnNom(note: number): string {
  const nom = NOMS_NOTES[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${nom}${octave}`;
}

function quantifier(quarts: number, grille: number): number {
  return Math.max(0, Math.round(quarts / grille) * grille);
}

export function midiVersNotationEasyScore(
  notes: { note: number; debut: number; fin: number; canal?: number }[],
  bpm: number,
  grilleQuarts: number,
): string {
  if (notes.length === 0) return "";
  const secEnQuarts = (sec: number) => (sec * bpm) / 60;

  // Rassembler les notes par instant de début quantifié pour former des accords
  const groupes = new Map<number, { notes: number[]; fin: number }>();
  for (const n of notes) {
    const debut = quantifier(secEnQuarts(n.debut), grilleQuarts);
    const fin = quantifier(secEnQuarts(n.fin), grilleQuarts);
    if (fin <= debut) continue;
    const g = groupes.get(debut);
    if (g) {
      g.notes.push(n.note);
      g.fin = Math.min(g.fin, fin); // accord = durée la plus courte
    } else {
      groupes.set(debut, { notes: [n.note], fin });
    }
  }

  const sorted = Array.from(groupes.entries()).sort((a, b) => a[0] - b[0]);
  let position = 0;
  const parts: string[] = [];

  for (const [debut, groupe] of sorted) {
    if (debut > position) {
      const reste = quantifier(debut - position, grilleQuarts);
      if (reste > 0) {
        const duree = dureeStandardVex(reste);
        parts.push(`B4/${duree}/r`);
        position += DUREES_VEX.find((d) => d.v === duree)?.q ?? reste;
      }
    }
    const dureeQuarts = quantifier(groupe.fin - debut, grilleQuarts);
    if (dureeQuarts <= 0) continue;
    const duree = dureeStandardVex(dureeQuarts);
    const noms = Array.from(new Set(groupe.notes)).sort((a, b) => a - b).map(noteMidiEnNom);
    const token = noms.length > 1 ? `(${noms.join(" ")})/${duree}` : `${noms[0]}/${duree}`;
    parts.push(token);
    position = debut + (DUREES_VEX.find((d) => d.v === duree)?.q ?? dureeQuarts);
  }

  return parts.join(" ");
}

function notationEasyScore(texte: string): { notes: string; totalQuarts: number } {
  // Convertit notre format "C4/q D4/8 E4+E4+G4/q" en format EasyScore "C4/q, D4/8, (C4 E4 G4)/q"
  // Les silences utilisent la notation EasyScore "B4/q/r".
  const tokens = texte.split(/\s+/).filter(Boolean);
  let totalQuarts = 0;
  const parts: string[] = tokens.map((tok) => {
    const [son, dur, rest] = tok.split("/");
    const duree = dureeVex(dur ?? "q");
    totalQuarts += dureeEnQuarts(duree);
    const notes = noteEasyScore(son);
    if (rest === "r") return `${notes}/${duree}/r`;
    return notes.includes("+") ? `(${notes.replace(/\+/g, " ")})/${duree}` : `${notes}/${duree}`;
  });
  // Complète la mesure (jusqu'au prochain multiple de 4) avec des silences
  let reste = 4 - (totalQuarts % 4 || 4);
  const eps = 0.001;
  if (reste > eps && reste < 4 - eps) {
    for (const { q, v } of DUREES_VEX.slice().reverse()) {
      while (reste > eps) {
        const max = Math.max(q, eps);
        if (reste + eps < max) break;
        parts.push(`B4/${v}/r`);
        totalQuarts += q;
        reste -= q;
        if (reste <= eps) break;
      }
    }
  }
  return { notes: parts.join(", "), totalQuarts };
}

function genererPortee(notation: string, clef: string, largeur: number, hauteur: number): string {
  const { div } = creerRenderer(largeur, hauteur);
  div.id = "vex-" + Math.random().toString(36).slice(2);
  document.body.appendChild(div);
  const vf = new Factory({ renderer: { elementId: div.id, width: largeur, height: hauteur } });
  const score = vf.EasyScore();
  const { notes: notesStr, totalQuarts } = notationEasyScore(notation);
  if (!notesStr) return "";
  const beats = Math.max(4, Math.ceil(totalQuarts / 4) * 4);
  score.set({ time: `${beats}/4` });
  const system = vf.System();
  system.addStave({
    voices: [score.voice(score.notes(notesStr, { stem: "up" }))],
  }).addClef(clef).addTimeSignature(`${beats}/4`);
  vf.draw();
  const svg = div.innerHTML;
  div.remove();
  return svg;
}

function genererTab(tabText: string, accordage: string, largeur: number, hauteur: number): string {
  const { renderer, div } = creerRenderer(largeur, hauteur);
  const ctx = renderer.getContext();
  const stave = new TabStave(10, 20, largeur - 20);
  stave.setText(accordage, 2);
  stave.setContext(ctx).draw();
  const tabNotes: InstanceType<typeof TabNote>[] = [];
  let totalQuarts = 0;
  for (const tok of tabText.split(/\s+/).filter(Boolean)) {
    const [pos, dur] = tok.split("/");
    const [corde, fret] = pos.split("-");
    const duree = dureeVex(dur ?? "q");
    totalQuarts += dureeEnQuarts(duree);
    tabNotes.push(new TabNote({ positions: [{ str: parseInt(corde, 10), fret: parseInt(fret, 10) }], duration: duree }));
  }
  if (tabNotes.length === 0) return "";
  const beats = Math.max(4, totalQuarts);
  const voice = new Voice({ num_beats: beats, beat_value: 4 });
  voice.addTickables(tabNotes);
  new Formatter().joinVoices([voice]).format([voice], largeur - 40);
  voice.draw(ctx, stave);
  return div.innerHTML;
}

function genererGrille(accords: string[], mesuresParLigne: number, largeur: number, hauteur: number): string {
  const { div } = creerRenderer(largeur, hauteur);
  div.id = "vex-" + Math.random().toString(36).slice(2);
  document.body.appendChild(div);
  const vf = new Factory({ renderer: { elementId: div.id, width: largeur, height: hauteur } });
  const staveWidth = (largeur - 20) / mesuresParLigne - 10;
  const lineHeight = hauteur / Math.max(1, Math.ceil(accords.length / mesuresParLigne));
  for (let i = 0; i < accords.length; i++) {
    const col = i % mesuresParLigne;
    const row = Math.floor(i / mesuresParLigne);
    const x = 10 + col * (staveWidth + 10);
    const y = 20 + row * lineHeight;
    const stave = vf.Stave({ x, y, width: staveWidth });
    stave.setContext(vf.getContext()).draw();
    const sym = Chord.get(accords[i]).symbol ?? accords[i];
    const textNote = vf.TextNote({ text: sym, duration: "w" });
    const voice = vf.Voice({ time: "4/4" }).addTickables([textNote]);
    vf.Formatter().joinVoices([voice]).format([voice], staveWidth - 20);
    voice.draw(vf.getContext(), stave);
  }
  vf.draw();
  const svg = div.innerHTML;
  div.remove();
  return svg;
}

function genererPartition(progression: string, tonic: string, clef: string, largeur: number, hauteur: number): string {
  const tokens = progression.split(/\s+/).filter(Boolean);
  const romains = /^[IViv]+$/.test(tokens[0] ?? "");
  const accords = romains ? Progression.fromRomanNumerals(tonic, tokens) : tokens;
  const notation = accords.map((a) => {
    const notes = Chord.get(a).notes.map((n) => noteEasyScore(`${n}4`)).join("+");
    return `${notes}/q`;
  }).join(" ");
  return genererPortee(notation, clef, largeur, hauteur);
}

export const fiches: FicheAudio[] = ([
  {
    id: "vexflow-portee", nom: "Portée VexFlow", nomEn: "VexFlow Staff",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une portée de notation musicale à partir d'une notation texte.",
    resumeEn: "Displays a musical staff from a text notation.",
    entrees: [{ nom: "Notation", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Notation", nomEn: "Notation", type: "texte", defaut: "C4/q D4/8 E4/8 F4/q G4/q",
        doc: "Notes à afficher. Format : note/octave/durée (ex : C4/q, D4/8, F#4/q, C4+E4+G4/q).",
        docEn: "Notes to display. Format: note/octave/duration (e.g. C4/q, D4/8, F#4/q, C4+E4+G4/q).", defautEn: "C4/q D4/8 E4/8 F4/q G4/q" },
      { nom: "Clé", nomEn: "Clef", type: "choix", options: ["treble", "bass", "alto", "tenor"], optionsEn: ["treble", "bass", "alto", "tenor"], defaut: "treble",
        doc: "Clé de la portée.", docEn: "Staff clef.", defautEn: "treble" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const notation = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Notation", "C4/q D4/8 E4/8 F4/q G4/q");
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      const svg = genererPortee(notation, clef, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      return { valeurs: [null], message: svg };
   },
 },
  {
    id: "vexflow-tab", nom: "Tablature VexFlow", nomEn: "VexFlow Tab",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une tablature à partir d'une notation texte.",
    resumeEn: "Displays a tablature from a text notation.",
    entrees: [{ nom: "Tablature", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Tablature", nomEn: "Tablature", type: "texte", defaut: "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q",
        doc: "Tablature à afficher. Format : corde-fret/durée (ex : 6-3/q = corde 6, fret 3, noire).",
        docEn: "Tablature to display. Format: string-fret/duration (e.g. 6-3/q = 6th string, 3rd fret, quarter note).", defautEn: "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q" },
      { nom: "Accordage", nomEn: "Tuning", type: "choix", options: ["Guitare standard", "Ukulélé", "Basse"], optionsEn: ["Standard guitar", "Ukulele", "Bass"], defaut: "Guitare standard",
        doc: "Accordage affiché en titre (la notation reste en corde-fret).", docEn: "Tuning displayed in title (notation remains string-fret).", defautEn: "Standard guitar" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const tabText = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tablature", "6-3/q 5-0/q 5-2/q 4-0/q 5-3/q");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      const svg = genererTab(tabText, ctx.paramTexte("Accordage", "Guitare standard"), w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      return { valeurs: [null], message: svg };
   },
 },
  {
    id: "vexflow-grille", nom: "Grille d'accords VexFlow", nomEn: "VexFlow Chord Chart",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une grille d'accords à partir d'une liste de symboles.",
    resumeEn: "Displays a chord chart from a list of symbols.",
    entrees: [{ nom: "Accords", nomEn: "Chords", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Accords", nomEn: "Chords", type: "texte", defaut: "C Am F G",
        doc: "Accords à afficher, séparés par des espaces. Accepte aussi une progression en chiffres romains si une tonalité est renseignée.",
        docEn: "Chords to display, separated by spaces. Also accepts a roman numeral progression if a key is set.", defautEn: "C Am F G" },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité pour interpréter une progression en chiffres romains.", docEn: "Key to interpret a roman numeral progression.", defautEn: "C" },
      { nom: "Mesures par ligne", nomEn: "Measures per line", plage: [1, 8], pas: 1, defaut: 4,
        doc: "Nombre de mesures par ligne.", docEn: "Number of measures per line." },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 600], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const texte = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Accords", "C Am F G");
      const tokens = texte.split(/\s+/).filter(Boolean);
      const romains = /^[IViv]+$/.test(tokens[0] ?? "");
      const tonic = ctx.paramTexte("Tonalité", "C");
      const accords = romains ? Progression.fromRomanNumerals(tonic, tokens) : tokens;
      const mpl = Math.round(ctx.paramNombre("Mesures par ligne", 4));
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 200);
      const svg = genererGrille(accords, mpl, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_accord_valide") };
      return { valeurs: [null], message: svg };
   },
 },
  {
    id: "vexflow-partition", nom: "Partition VexFlow", nomEn: "VexFlow Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une partition simple à partir d'une progression d'accords.",
    resumeEn: "Displays a simple score from a chord progression.",
    entrees: [{ nom: "Progression", type: "texte", requis: false }],
    sorties: [{ nom: "SVG", type: "texte" }],
    parametres: [
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        doc: "Progression en chiffres romains ou en symboles d'accords (ex : C Am F G).",
        docEn: "Roman numeral progression or chord symbols (e.g. C Am F G).", defautEn: "I V vi IV" },
      { nom: "Tonalité", nomEn: "Key", type: "texte", defaut: "C",
        doc: "Tonalité de la progression.", docEn: "Progression key.", defautEn: "C" },
      { nom: "Clé", nomEn: "Clef", type: "choix", options: ["treble", "bass", "alto", "tenor"], optionsEn: ["treble", "bass", "alto", "tenor"], defaut: "treble",
        doc: "Clé de la portée.", docEn: "Staff clef.", defautEn: "treble" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 1000], pas: 10, defaut: 500, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 400], pas: 10, defaut: 160, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      const progression = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Progression", "I V vi IV");
      const tonic = ctx.paramTexte("Tonalité", "C");
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 500);
      const h = ctx.paramNombre("Hauteur", 160);
      const svg = genererPartition(progression, tonic, clef, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_progression_valide") };
      return { valeurs: [null], message: svg };
    },
  },
  {
    id: "vexflow-midi", nom: "Partition MIDI", nomEn: "MIDI Score",
    univers: "Visualisation", famille: "Notation",
    resume: "Affiche une portée de notation musicale à partir d'un fichier MIDI.",
    resumeEn: "Displays a musical staff from a MIDI file.",
    entrees: [{ nom: "MIDI", type: "midi", requis: true }],
    sorties: [{ nom: "SVG", type: "image" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [0, 300], pas: 1, defaut: 0, unite: "BPM",
        doc: "Tempo utilisé pour convertir les durées MIDI en notation. 0 = détecter depuis le fichier MIDI.", docEn: "Tempo used to convert MIDI durations to notation. 0 = detect from MIDI file." },
      { nom: "Canal", nomEn: "Channel", type: "nombre", plage: [-1, 15], pas: 1, defaut: -1, unite: "-1 = tous",
        doc: "Canal MIDI à afficher (-1 pour tous les canaux).", docEn: "MIDI channel to display (-1 for all channels)." },
      { nom: "Quantification", nomEn: "Quantization", type: "choix", options: ["1/4", "1/8", "1/16", "1/32"], defaut: "1/16",
        doc: "Résolution de la grille de quantification.", docEn: "Quantization grid resolution.", optionsEn: ["1/4", "1/8", "1/16", "1/32"], defautEn: "1/16" },
      { nom: "Clé", nomEn: "Clef", type: "choix", options: ["treble", "bass", "alto", "tenor"], optionsEn: ["treble", "bass", "alto", "tenor"], defaut: "treble",
        doc: "Clé de la portée.", docEn: "Staff clef.", defautEn: "treble" },
      { nom: "Largeur", nomEn: "Width", plage: [200, 2000], pas: 10, defaut: 800, unite: "px",
        doc: "Largeur du SVG.", docEn: "SVG width." },
      { nom: "Hauteur", nomEn: "Height", plage: [100, 800], pas: 10, defaut: 200, unite: "px",
        doc: "Hauteur du SVG.", docEn: "SVG height." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) return { valeurs: [null], erreur: true, message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      const midi = parseMidi(new Uint8Array(await fichier.arrayBuffer()));
      let bpm = ctx.paramNombre("Tempo", 0);
      if (bpm <= 0) {
        bpm = 120;
        for (const piste of midi.tracks) {
          for (const evt of piste) {
            if (evt.type === "setTempo") {
              bpm = Math.round(60 / (evt.microsecondsPerBeat / 1_000_000));
              break;
            }
          }
          if (bpm !== 120) break;
        }
      }
      const canal = ctx.paramNombre("Canal", -1);
      const grilleNom = ctx.paramTexte("Quantification", "1/16");
      const grille = GRILLES_NOTATION[grilleNom] ?? 0.25;
      const { notes } = analyserMidi(midi);
      const notesFiltrees = canal >= 0 ? notes.filter((n) => n.canal === canal) : notes;
      const notation = midiVersNotationEasyScore(notesFiltrees, bpm, grille);
      if (!notation) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      const clef = ctx.paramTexte("Clé", "treble");
      const w = ctx.paramNombre("Largeur", 800);
      const h = ctx.paramNombre("Hauteur", 200);
      const svg = genererPortee(notation, clef, w, h);
      if (!svg) return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_valide") };
      const svgFile = new File([svg], "partition.svg", { type: "image/svg+xml" });
      return { valeurs: [svgFile], message: svg };
    },
  },
] as FicheAudio[]).map(avecDoc);
