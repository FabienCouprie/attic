// audio/corpus-midi.ts — Une pièce à voix en MIDI : une piste par voix à l'écriture, une voix par piste
// à la lecture.
//
// POURQUOI UN LECTEUR À CÔTÉ D'`analyserMidi`. Celui de `audio/midi.ts` rend les notes d'un fichier
// sans dire de quelle piste chacune vient, ce qui suffit à jouer un fichier et ne suffit pas à
// apprendre une harmonie : quatre voix d'un choral y deviennent un seul flot. Ce lecteur-ci garde
// l'indice de piste, et ne touche pas au partagé, dont trente composants dépendent.
//
// UNE VOIX EST UNE PISTE QUI PORTE DES NOTES, numérotées dans l'ordre du fichier. Une piste de tempo
// sans notes, la piste 0 d'un fichier de format 1, ne compte pas.

import { parseMidi } from "midi-file";
import { fusionnerMidis, notesVersFichierMidi } from "./midi-ecriture";
import type { InfoVoix, Sequence } from "./sequence";
import type { Note } from "./note";

/** Le canal d'une voix : le dixième, celui des percussions, est sauté. */
const canalDe = (rang: number) => (rang >= 9 ? rang + 1 : rang) % 16;

/** Écrit une séquence à voix, une piste par voix, chacune sur son canal. */
export async function sequenceVersMidiParVoix(s: Sequence): Promise<Uint8Array> {
  const tempo = s.tempo && s.tempo > 0 ? s.tempo : 120;
  const voix = [...new Set(s.notes.map((n) => n.voix ?? 0))].sort((a, b) => a - b);
  if (voix.length === 0) throw new Error("une pièce sans note ne s'écrit pas en MIDI");
  const fichiers: Uint8Array[] = [];
  for (const [rang, v] of voix.entries()) {
    const notes = s.notes.filter((n) => (n.voix ?? 0) === v).map((n) => ({ ...n, canal: canalDe(rang) }));
    fichiers.push(new Uint8Array(await notesVersFichierMidi(notes, tempo, canalDe(rang)).arrayBuffer()));
  }
  return fusionnerMidis(fichiers);
}

/** Ce que la lecture rend : la séquence, et ce qu'elle n'a pas su lire. */
export interface MidiParPiste {
  sequence: Sequence;
  /** Les fins de note sans début, et les débuts jamais refermés. */
  orphelines: number;
}

/** Lit un fichier MIDI, une voix par piste qui porte des notes. Les changements de tempo sont suivis. */
export function sequenceDepuisMidiParPiste(octets: Uint8Array): MidiParPiste {
  const midi = parseMidi(octets);
  const tpm = midi.header.ticksPerBeat ?? 480;
  // LA CARTE DES TEMPOS, prise dans toutes les pistes : un fichier de format 1 la met dans la
  // première, un fichier de format 0 dans l'unique.
  const tempos: { tick: number; uspq: number }[] = [];
  for (const piste of midi.tracks) {
    let tick = 0;
    for (const e of piste as any[]) {
      tick += e.deltaTime ?? 0;
      if (e.type === "setTempo") tempos.push({ tick, uspq: e.microsecondsPerBeat });
    }
  }
  tempos.sort((a, b) => a.tick - b.tick);
  // UN TEMPO PAR TICK : un fichier écrit piste par piste répète le sien au tick zéro dans chacune,
  // et deux entrées au même tick faisaient un segment vide qui arrêtait le calcul, toutes les notes
  // tombant alors à zéro seconde. Le dernier lu l'emporte, comme à la lecture d'un séquenceur.
  for (let k = tempos.length - 1; k > 0; k--) if (tempos[k - 1].tick === tempos[k].tick) tempos.splice(k - 1, 1);
  if (tempos.length === 0 || tempos[0].tick > 0) tempos.unshift({ tick: 0, uspq: 500000 });
  const secondes = (tick: number): number => {
    let t = 0;
    for (let k = 0; k < tempos.length; k++) {
      const fin = k + 1 < tempos.length ? Math.min(tick, tempos[k + 1].tick) : tick;
      if (fin <= tempos[k].tick) break;
      t += ((fin - tempos[k].tick) / tpm) * (tempos[k].uspq / 1e6);
    }
    return t;
  };

  const notes: Note[] = [];
  const voix: InfoVoix[] = [];
  let orphelines = 0;
  for (const piste of midi.tracks) {
    let tick = 0;
    let nom: string | undefined;
    const ouvertes = new Map<number, { tick: number; velocite: number }[]>();
    const lues: Note[] = [];
    for (const e of piste as any[]) {
      tick += e.deltaTime ?? 0;
      if (e.type === "trackName" && typeof e.text === "string" && e.text.trim()) nom = e.text.trim();
      const cle = (e.channel ?? 0) * 128 + (e.noteNumber ?? 0);
      if (e.type === "noteOn" && e.velocity > 0) {
        const pile = ouvertes.get(cle) ?? [];
        pile.push({ tick, velocite: e.velocity });
        ouvertes.set(cle, pile);
      } else if (e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0)) {
        const debut = ouvertes.get(cle)?.shift();
        if (!debut) { orphelines++; continue; }
        lues.push({ note: e.noteNumber, velocite: debut.velocite, debut: secondes(debut.tick), fin: secondes(tick), voix: voix.length });
      }
    }
    for (const pile of ouvertes.values()) orphelines += pile.length;
    if (lues.length === 0) continue;
    voix.push({ numero: voix.length, ...(nom ? { nom } : {}) });
    notes.push(...lues);
  }
  notes.sort((a, b) => a.debut - b.debut || (a.voix ?? 0) - (b.voix ?? 0));
  return { sequence: { notes, tempo: Math.round(6e7 / tempos[0].uspq), voix }, orphelines };
}
