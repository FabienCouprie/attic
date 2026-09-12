// audio/accords-sequencer.ts — Séquenceur d'accords pas-à-pas.
// Grille : 21 rangées (7 degrés × 3 extensions : triade, 7e, 6e) × N pas.
// Chaque colonne active joue l'accord de la rangée sélectionnée, construit
// diatoniquement sur la gamme choisie. Les extensions sont donc des lignes à
// part entière (ex. C, Cmaj7, C6) plutôt qu'un réglage global.

import type { NoteEvenement } from "./midi";
import { notesVersFichierMidi, rendreSequence } from "./midi";
import { degresGammeAccords, degreAccordProche, degreSeptiemeProche, traduireCle } from "./generation";

export const NB_DEGRES_ACCORDS = 7;
export const EXTENSIONS_ACCORDS = ["aucune", "septieme", "sixte"] as const;
export const NB_EXTENSIONS_PAR_DEGRE = EXTENSIONS_ACCORDS.length;
export const NB_LIGNES_ACCORDS = NB_DEGRES_ACCORDS * NB_EXTENSIONS_PAR_DEGRE;

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function decoderMotifAccords(motif: string, nbPas: number): boolean[][] {
  const lignes = (motif || "").split("|");
  const g: boolean[][] = [];
  for (let r = 0; r < NB_LIGNES_ACCORDS; r++) {
    const s = lignes[r] ?? "";
    const row: boolean[] = [];
    for (let c = 0; c < nbPas; c++) row.push(s[c] === "1");
    g.push(row);
  }
  return g;
}

export function encoderMotifAccords(grille: boolean[][]): string {
  return grille.map((row) => row.map((b) => (b ? "1" : "0")).join("")).join("|");
}

export function degreeEtExtensionPourLigne(r: number): { degree: number; extension: "aucune" | "septieme" | "sixte" } {
  const degree = Math.floor(r / NB_EXTENSIONS_PAR_DEGRE);
  const extension = EXTENSIONS_ACCORDS[r % NB_EXTENSIONS_PAR_DEGRE];
  return { degree, extension };
}

export function nomNotePourPitchClass(pc: number): string {
  return NOTES[((pc % 12) + 12) % 12];
}

export function qualiteTriade(degres: number[], degre: number): string {
  const racinePc = degres[degre % degres.length];
  const tierce = degreAccordProche(degres, racinePc, 4);
  const quinte = degreAccordProche(degres, racinePc, 7);
  if (tierce === 4 && quinte === 7) return "";
  if (tierce === 3 && quinte === 6) return "dim";
  if (tierce === 3 && quinte === 7) return "m";
  if (tierce === 4 && quinte === 8) return "aug";
  if (tierce === 3) return "m";
  if (tierce === 4) return "";
  return "";
}

export function qualiteSeptieme(degres: number[], degre: number): string {
  const racinePc = degres[degre % degres.length];
  const tierce = degreAccordProche(degres, racinePc, 4);
  const quinte = degreAccordProche(degres, racinePc, 7);
  const septieme = degreSeptiemeProche(degres, racinePc);
  if (tierce === 4 && quinte === 7 && septieme === 11) return "maj7";
  if (tierce === 4 && quinte === 7 && septieme === 10) return "7";
  if (tierce === 3 && quinte === 7 && septieme === 10) return "m7";
  if (tierce === 3 && quinte === 7 && septieme === 11) return "mmaj7";
  if (tierce === 3 && quinte === 6 && septieme === 10) return "ø7";
  if (tierce === 3 && quinte === 6 && septieme === 9) return "dim7";
  if (tierce === 4 && quinte === 8 && septieme === 10) return "aug7";
  if (tierce === 4 && quinte === 8 && septieme === 11) return "maj7#5";
  return "7";
}

export function qualiteSixte(degres: number[], degre: number): string {
  const triade = qualiteTriade(degres, degre);
  if (triade === "") return "6";
  if (triade === "m") return "m6";
  if (triade === "dim") return "dim6";
  if (triade === "aug") return "aug6";
  return "6";
}

export function suffixePourExtension(
  degres: number[],
  degre: number,
  extension: "aucune" | "septieme" | "sixte",
): string {
  if (extension === "aucune") return qualiteTriade(degres, degre);
  if (extension === "septieme") return qualiteSeptieme(degres, degre);
  return qualiteSixte(degres, degre);
}

export function nomAccordPourLigne(r: number, cle: string, gamme: string): string {
  const { degree, extension } = degreeEtExtensionPourLigne(r);
  const degres = degresGammeAccords(gamme);
  const cleIdx = NOTES.indexOf(cle) >= 0 ? NOTES.indexOf(cle) : traduireCle(cle);
  const rootPc = (cleIdx + degres[degree % degres.length]) % 12;
  const nomNote = nomNotePourPitchClass(rootPc);
  const suffixe = suffixePourExtension(degres, degree, extension);
  return `${nomNote}${suffixe}`;
}

function noteFondamentalePourDegre(degre: number, cle: string, gamme: string, octave: number): number {
  const degres = degresGammeAccords(gamme);
  const idx = degre % degres.length;
  const octDecal = Math.floor(degre / degres.length);
  const cleIdx = NOTES.indexOf(cle);
  return (octave + 1) * 12 + (cleIdx >= 0 ? cleIdx : traduireCle(cle)) + degres[idx] + octDecal * 12;
}

/**
 * Voix d'un accord, à partir de sa fondamentale.
 *
 * @param root fondamentale ABSOLUE, en note MIDI : elle place l'accord.
 * @param racineRelative même fondamentale mais RELATIVE À LA TONIQUE, en
 *        demi-tons — c'est-à-dire une valeur de `degresGammeAccords`. C'est ce
 *        que `degreAccordProche` attend, puisqu'il mesure des distances *dans*
 *        ce tableau.
 *
 * Les deux étaient confondues : la fonction faisait `root % 12`, une classe de
 * hauteur absolue, et la passait à `degreAccordProche`. Les deux ne coïncident
 * qu'en do, la tonique valant alors 0 — d'où un défaut invisible dans la clé par
 * défaut et faux dans les onze autres. En la mineur, l'accord de tonique sortait
 * **A–C–D♯**, un accord diminué, et en mi mineur **E–G♯–C**, un augmenté, alors
 * que la grille affichait « Am » et « Em » : le nom de l'accord, lui, était
 * calculé depuis le degré relatif, donc juste. On jouait autre chose que ce qui
 * était écrit.
 */
function construireVoixAccord(
  root: number,
  racineRelative: number,
  gamme: string,
  extension: "aucune" | "septieme" | "sixte",
): { note: number; vel: number }[] {
  const degres = degresGammeAccords(gamme);
  const racinePc = racineRelative;
  const tierce = degreAccordProche(degres, racinePc, 4);
  const quinte = degreAccordProche(degres, racinePc, 7);
  const voix: { note: number; vel: number }[] = [
    { note: root - 12, vel: 90 },        // basse
    { note: root + quinte, vel: 65 },    // quinte médium
    { note: root + 12 + tierce, vel: 60 }, // tierce aiguë
    { note: root + 12 + quinte, vel: 55 }, // quinte aiguë
    { note: root + 24, vel: 50 },         // octave haute
  ];
  if (extension === "septieme") {
    voix.push({ note: root + 12 + degreSeptiemeProche(degres, racinePc), vel: 50 });
  } else if (extension === "sixte") {
    voix.push({ note: root + 12 + degreAccordProche(degres, racinePc, 9), vel: 50 });
  }
  return voix;
}

export function genererNotesSequenceurAccords(
  grille: boolean[][],
  cle: string,
  gamme: string,
  mode: "harmonie" | "arpege",
  tempo: number,
  nbPas: number,
  swing: number,
  mesures: number,
  octave: number,
): NoteEvenement[] {
  const stepDur = ((60 / Math.max(1, tempo)) * 4) / Math.max(1, nbPas);
  const totalPas = Math.max(1, mesures) * nbPas;
  const notes: NoteEvenement[] = [];

  for (let pas = 0; pas < totalPas; pas++) {
    const s = pas % nbPas;
    let t = pas * stepDur;
    if (s % 2 === 1) t += (swing / 100) * stepDur * 0.6;

    for (let r = 0; r < NB_LIGNES_ACCORDS; r++) {
      if (grille[r]?.[s]) {
        const { degree, extension } = degreeEtExtensionPourLigne(r);
        const root = noteFondamentalePourDegre(degree, cle, gamme, octave);
        // La fondamentale relative à la tonique — la même valeur que
        // `qualiteTriade` emploie pour nommer l'accord, pour que le nom et les
        // notes ne puissent plus diverger.
        const degres = degresGammeAccords(gamme);
        const racineRelative = degres[degree % degres.length];
        const voix = construireVoixAccord(root, racineRelative, gamme, extension);
        const arpOffset = mode === "arpege" ? Math.min(0.025, stepDur * 0.15) : 0;
        for (let i = 0; i < voix.length; i++) {
          const debut = t + i * arpOffset;
          const fin = t + stepDur * 0.9;
          notes.push({ note: voix[i].note, velocite: voix[i].vel, debut, fin });
        }
        break; // un seul accord par pas
      }
    }
  }

  return notes;
}

export async function rendreSequenceurAccords(
  grille: boolean[][],
  cle: string,
  gamme: string,
  mode: "harmonie" | "arpege",
  tempo: number,
  nbPas: number,
  swing: number,
  mesures: number,
  volume: number,
  octave: number,
  modeAudio: "FM/Oscillateurs" | "SoundFont",
  instrument?: number,
  banque?: number,
): Promise<{ audio: AudioBuffer; notes: NoteEvenement[] }> {
  const notes = genererNotesSequenceurAccords(grille, cle, gamme, mode, tempo, nbPas, swing, mesures, octave);
  const audioBrut = await rendreSequence(notes, modeAudio, volume, instrument, banque);
  const sr = 44100;
  const stepDur = ((60 / Math.max(1, tempo)) * 4) / Math.max(1, nbPas);
  const totalPas = Math.max(1, mesures) * nbPas;
  const barLen = Math.round(totalPas * stepDur * sr);
  const finalLen = Math.max(barLen, audioBrut.length);
  const audio = new AudioBuffer({ numberOfChannels: audioBrut.numberOfChannels, length: finalLen, sampleRate: sr });
  for (let c = 0; c < audioBrut.numberOfChannels; c++) {
    audio.getChannelData(c).set(audioBrut.getChannelData(c));
  }
  return { audio, notes };
}

export function midiSequenceurAccords(notes: NoteEvenement[], tempo: number): File {
  return notesVersFichierMidi(notes, tempo);
}
