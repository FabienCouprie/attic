// plugins/vexflow-notation.ts — De la notation vers une portee, une tablature, une grille.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { Chord } from "tonal";
import { accordsDepuisRomains, modeDepuisTonalite, toniqueDepuisTonalite } from "../audio/theorie-romains";
import { Renderer, Factory, TabStave, TabNote, Voice, Formatter } from "vexflow";

/**
 * Accords d'une progression écrite pour une partition.
 *
 * Le champ « Tonalité » est du texte libre : il reçoit aussi bien « A » que
 * « A minor (90%) », ce dernier venant de la sortie d'« Analyse harmonique ». Il
 * faut donc en extraire la tonique — Tonal ne sait rien faire de la chaîne
 * entière et rendait une grille vide — et en lire le mode s'il y figure, le
 * réglage « Gamme » ne servant que lorsqu'il n'y figure pas.
 */
export function accordsPourPartition(tonalite: string, gammeReglee: string, tokens: string[]): string[] {
  const tonique = toniqueDepuisTonalite(tonalite) ?? "C";
  const mode = modeDepuisTonalite(tonalite) ?? (gammeReglee === "mineur" ? "mineur" : "majeur");
  return accordsDepuisRomains(tonique, tokens, mode);
}

const DUREES: Record<string, string> = {
  w: "w", h: "h", q: "q", "8": "8", "16": "16", "32": "32",
};

function dureeVex(d: string): string {
  return DUREES[d] ?? "q";
}

function noteEasyScore(note: string): string {
  // "C4" / "F#3" / "Bb5" → format VexFlow EasyScore (doit être majuscule).
  // Accords : "C4+E4+G4" ou "(C4 E4 G4)" → "(C4 E4 G4)".
  const n = note.trim();
  const notes = n.includes("+")
    ? n.split("+")
    : n.startsWith("(") && n.endsWith(")")
    ? n.slice(1, -1).split(/\s+/)
    : [n];
  const normalise = (s: string) => {
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(s.trim());
    return m ? `${m[1].toUpperCase()}${m[2]}${m[3]}` : s.trim();
  };
  if (notes.length > 1) {
    return `(${notes.map(normalise).join(" ")})`;
  }
  return normalise(notes[0]);
}

function parseTokenNote(token: string): { notes: string; duree: string; rest: boolean } {
  // Découpe un token de la forme "note/duree" ou "note/duree/r".
  // La partie note peut contenir un accord entre parenthèses (ex: (C4 E4 G4)/q)
  // sans être coupée sur la barre de fraction.
  let profondeur = 0;
  let barre = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "(") profondeur++;
    else if (c === ")") profondeur--;
    else if (c === "/" && profondeur === 0) {
      barre = i;
      break;
    }
  }
  if (barre === -1) return { notes: token, duree: "q", rest: false };
  const notes = token.slice(0, barre);
  const reste = token.slice(barre + 1).split("/");
  const duree = reste[0] || "q";
  return { notes, duree, rest: reste[1] === "r" };
}

function creerRenderer(width: number, height: number): { renderer: InstanceType<typeof Renderer>; div: HTMLDivElement } {
  const div = document.createElement("div");
  const renderer = new Renderer(div, Renderer.Backends.SVG);
  renderer.resize(width, height);
  return { renderer, div };
}

function extraireSvgRendu(div: HTMLDivElement): string {
  // VexFlow produit parfois un premier SVG vide (contexte) avant le SVG réel.
  // On ne garde que les SVG contenant du contenu, ce qui évite un rectangle blanc vide.
  const svgs = Array.from(div.querySelectorAll("svg")).filter((svg) => svg.childElementCount > 0);
  return svgs.map((svg) => svg.outerHTML).join("");
}

function dureeEnQuarts(duree: string): number {
  const map: Record<string, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };
  return map[duree] ?? 1;
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

export const GRILLES_NOTATION: Record<string, number> = {
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

/**
 * Le nom VexFlow d'une hauteur, arrondie au demi-ton.
 *
 * LA HAUTEUR EST ARRONDIE, ET IL FAUT QU'ELLE LE SOIT. Une hauteur peut ne pas tomber sur un
 * demi-ton, la conversion en fréquence étant continue. `NOMS_NOTES[note % 12]` cherchait alors une
 * case qui n'existe pas et rendait `undefined` : le jeton devenait « undefined4/q », que le dessin
 * refuse, et la partition disparaissait sans un mot. La notation employée ici n'a pas de signe pour
 * le quart de ton ; l'arrondi est donc sa limite, et non un oubli.
 */
function noteMidiEnNom(note: number): string {
  const proche = Math.round(note);
  const nom = NOMS_NOTES[((proche % 12) + 12) % 12];
  const octave = Math.floor(proche / 12) - 1;
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

function tokenizeNotation(texte: string): string[] {
  // Découpe par espace sans couper à l'intérieur des parenthèses d'un accord.
  const tokens: string[] = [];
  let courant = "";
  let profondeur = 0;
  for (const c of texte.trim()) {
    if (c === "(") profondeur++;
    else if (c === ")") profondeur--;
    if (/\s/.test(c) && profondeur === 0) {
      if (courant) {
        tokens.push(courant);
        courant = "";
      }
    } else {
      courant += c;
    }
  }
  if (courant) tokens.push(courant);
  return tokens;
}

function notationEasyScore(texte: string): { notes: string; totalQuarts: number } {
  // Convertit notre format "C4/q D4/8 C4+E4+G4/q" en format EasyScore "C4/q, D4/8, (C4 E4 G4)/q"
  // Les silences utilisent la notation EasyScore "B4/q/r".
  const tokens = tokenizeNotation(texte);
  let totalQuarts = 0;
  const parts: string[] = tokens.map((tok) => {
    const { notes: son, duree: dur, rest } = parseTokenNote(tok);
    const duree = dureeVex(dur);
    totalQuarts += dureeEnQuarts(duree);
    const notes = noteEasyScore(son);
    if (rest) return `${notes}/${duree}/r`;
    return `${notes}/${duree}`;
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

export function genererPortee(notation: string, clef: string, largeur: number, hauteur: number): string {
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
  const svg = extraireSvgRendu(div);
  div.remove();
  return svg;
}

export function genererTab(tabText: string, accordage: string, largeur: number, hauteur: number): string {
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
  return extraireSvgRendu(div);
}

export function genererGrille(accords: string[], mesuresParLigne: number, largeur: number, hauteur: number): string {
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
  const svg = extraireSvgRendu(div);
  div.remove();
  return svg;
}

export function genererPartition(progression: string, tonic: string, gamme: string, clef: string, largeur: number, hauteur: number): string {
  const tokens = progression.split(/\s+/).filter(Boolean);
  const romains = /^[IViv]+$/.test(tokens[0] ?? "");
  // `accordsPourPartition` et non Tonal brut : appelé directement, il rendait un
  // accord MAJEUR pour un degré en minuscules (« vi » → La majeur) et résolvait
  // les degrés d'un mode mineur sur la gamme majeure. La partition imprimait
  // donc d'autres accords que ceux joués par les nœuds audio, qui passent tous
  // par la fonction partagée.
  const accords = romains ? accordsPourPartition(tonic, gamme, tokens) : tokens;
  const notation = accords.map((a) => {
    const notes = Chord.get(a).notes.map((n) => noteEasyScore(`${n}4`)).join("+");
    return `${notes}/q`;
  }).join(" ");
  return genererPortee(notation, clef, largeur, hauteur);
}

