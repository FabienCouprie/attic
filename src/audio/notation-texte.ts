// audio/notation-texte.ts — La notation texte du dépôt : une ligne par note ou par accord, lue en notes.
//
// LE FORMAT EST CELUI QUE `texte-vers-midi` LIT, et que quatre sorties « Notation » écrivent : la Gamme
// jouée, les Accords joués, Accords vers notation et la Grille d'accords. Une ligne vaut
// « note durée [vélocité] » : « C4 0.5 », « C4+E4+G4 1 » pour un accord, « rest 0.5 » pour un silence ;
// « Tempo 120 » fixe le tempo de ce qui suit. La durée est en temps.
//
// LA REVUE DES NOTATIONS EN TEXTE, décisions de Fabien du 2026-11-22. Le lecteur vivait dans la fiche,
// sans aucun test, et remplaçait ou jetait en silence tout ce qui sortait du cas simple : « BPM 120 »
// donnait une minute de silence, « Bbb4 » disparaissait d'une septième diminuée, « -1 » faisait reculer
// le temps. Désormais :
//  - UN TEXTE QUI PORTE UNE LIGNE FAUTIVE EST REFUSÉ EN ENTIER, et chaque faute se rend avec sa ligne,
//    son texte et sa raison ; rien n'est remplacé ni jeté ;
//  - les doubles altérations (« ## », « x », « bb ») et les durées en fraction (« 1/2 ») se lisent ;
//  - chaque « Tempo » est un changement daté, que le fichier MIDI écrit à son instant.

import type { NoteEvenement } from "./midi-sequence";

const DEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ALTERATION: Record<string, number> = { "": 0, "#": 1, "##": 2, x: 2, b: -1, bb: -2 };
const NOTE = /^([A-Ga-g])(##|#|x|bb|b)?(-?\d+)$/;
const DUREE = /^(?:(\d*\.?\d+)|(\d+)\/(\d+))$/;
const ENTIER = /^\d+$/;

/** Pourquoi une ligne est refusée. */
export type RaisonDeFaute = "note" | "duree" | "velocite" | "tempo" | "mots";

/** Une ligne refusée : son numéro, compté depuis un, son texte, la raison et le mot fautif. */
export interface FauteDeNotation { ligne: number; texte: string; raison: RaisonDeFaute; mot: string }

/** Un changement de tempo, à son instant en secondes. */
export interface ChangementDeTempo { debut: number; bpm: number }

export interface NotationLue { notes: NoteEvenement[]; tempos: ChangementDeTempo[]; fautes: FauteDeNotation[] }

/** Le numéro MIDI d'une note écrite « C4 », « F#3 », « Bbb2 », « Cx4 » ou « 60 », ou null hors du clavier. */
export function noteDeNotation(mot: string): number | null {
  if (ENTIER.test(mot)) { const n = Number(mot); return n <= 127 ? n : null; }
  const m = NOTE.exec(mot);
  if (!m) return null;
  const midi = (Number(m[3]) + 1) * 12 + DEMI[m[1].toUpperCase()] + ALTERATION[m[2] ?? ""];
  return midi >= 0 && midi <= 127 ? midi : null;
}

/** Une durée en temps, décimale ou en fraction, strictement positive ; null sinon. */
function dureeDe(mot: string): number | null {
  const m = DUREE.exec(mot);
  if (!m) return null;
  const v = m[1] !== undefined ? Number(m[1]) : Number(m[2]) / Number(m[3]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Lit une notation texte en notes datées en secondes, en changements de tempo, et en fautes.
 *
 * Une ligne vide est sautée, et un commentaire commence par « # » ou « // », en début de ligne ou après
 * ses mots. Une durée absente vaut un temps, une vélocité absente 80. Un « Tempo » placé avant la
 * première note ou le premier silence remplace `tempoInitial` ; plus loin, il le change à son instant.
 */
export function lireNotationTexte(texte: string, tempoInitial: number): NotationLue {
  const notes: NoteEvenement[] = [];
  const tempos: ChangementDeTempo[] = [{ debut: 0, bpm: tempoInitial > 0 ? tempoInitial : 120 }];
  const fautes: FauteDeNotation[] = [];
  let t = 0, avance = false;
  texte.split(/\r?\n/).forEach((brute, i) => {
    const ligne = brute.trim();
    const mots = ligne.split(/\s+/).filter(Boolean);
    const fin = mots.findIndex((m) => m.startsWith("#") || m.startsWith("//"));
    const utiles = fin < 0 ? mots : mots.slice(0, fin);
    if (!utiles.length) return;
    const faute = (raison: RaisonDeFaute, mot: string) => fautes.push({ ligne: i + 1, texte: ligne, raison, mot });
    const tempo = tempos[tempos.length - 1].bpm;
    if (/^tempo$/i.test(utiles[0])) {
      const bpm = utiles[1] !== undefined ? dureeDe(utiles[1]) : null;
      if (bpm === null) return void faute("tempo", utiles[1] ?? utiles[0]);
      if (utiles.length > 2) return void faute("mots", utiles[2]);
      if (!avance) tempos[0] = { debut: 0, bpm };
      else if (tempos[tempos.length - 1].debut === t) tempos[tempos.length - 1].bpm = bpm;
      else tempos.push({ debut: t, bpm });
      return;
    }
    if (utiles.length > 3) return void faute("mots", utiles[3]);
    const duree = utiles[1] === undefined ? 1 : dureeDe(utiles[1]);
    if (duree === null) faute("duree", utiles[1]);
    const velocite = utiles[2] === undefined ? 80 : ENTIER.test(utiles[2]) ? Number(utiles[2]) : NaN;
    if (!(velocite >= 1 && velocite <= 127)) faute("velocite", utiles[2]);
    const secondes = (duree ?? 1) * (60 / tempo);
    if (!/^(rest|r)$/i.test(utiles[0])) {
      for (const mot of utiles[0].split("+")) {
        const midi = noteDeNotation(mot);
        if (midi === null) faute("note", mot);
        else notes.push({ note: midi, velocite: Math.round(velocite) || 80, debut: t, fin: t + secondes });
      }
    }
    t += secondes;
    avance = true;
  });
  return { notes, tempos, fautes };
}
