// audio/midi-arpege.ts — L'arpegiateur.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { parseMidi, writeMidi } from "midi-file";
import { comparerEvenementsMidi } from "./midi-ordre";
import { analyserMidi } from "./midi";
import type { NoteEvenement } from "./midi-sequence";

// ─── Arpégiateur MIDI ───

/** Melange uniforme (Fisher-Yates), sans modifier le tableau d'origine. */
function melangerUniformement(arr: number[], hasard: () => number): number[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function arpegerMidi(
  fichier: File,
  motif: string,
  direction: string,
  vitesseNom: string,
  octaves: number,
  dureeNotePct: number,
  hasard: () => number = Math.random,
): Promise<File> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  const midi = parseMidi(bytes);
  const { notes } = analyserMidi(midi);

  if (notes.length === 0) return fichier;

  // Grouper les notes qui sonnent simultanément en "accords".
  // Deux notes sont dans le même accord si elles commencent dans une fenêtre
  // de tolérance (30 ms) l'une de l'autre, ou si l'une commence pendant que
  // l'autre tient encore.
  const tol = 0.03;
  const notesTriees = [...notes].sort((a, b) => a.debut - b.debut);
  const accords: { temps: number; notes: number[]; velocite: number; duree: number }[] = [];

  for (const n of notesTriees) {
    const dernier = accords[accords.length - 1];
    if (dernier && Math.abs(n.debut - dernier.temps) < tol) {
      dernier.notes.push(n.note);
      dernier.velocite = Math.max(dernier.velocite, n.velocite);
      dernier.duree = Math.max(dernier.duree, n.fin - n.debut);
    } else {
      accords.push({ temps: n.debut, notes: [n.note], velocite: n.velocite, duree: n.fin - n.debut });
    }
  }

  // Vitesse : divisions par beat.
  const vitesses: Record<string, number> = {
    "1/8": 2, "1/16": 4, "1/32": 8, "1/8 triplet": 3, "1/16 triplet": 6,
  };
  const divisions = vitesses[vitesseNom] ?? 4;
  const dureeStep = 60 / (divisions * 2); // en secondes (à 120 BPM de référence)

  // Durée de chaque note arpégée
  const dureeNote = dureeStep * (dureeNotePct / 100);

  // Motif : indices dans l'accord trié.
  // "Montant" = 0,1,2,... ; "Descendant" = N-1,...,1,0 ;
  // "UpDown" = 0,1,...,N-1,...,1,0 ; "DownUp" = N-1,...,0,...,N-1 ;
  // "Aléatoire" = ordre random ; "Montant+1" = décale d'une octave
  function ordreArpege(notes: number[], dir: string, oct: number): number[] {
    const trie = [...notes].sort((a, b) => a - b);
    const result: number[] = [];
    for (let o = 0; o < oct; o++) {
      const base = o * 12;
      let sequence: number[];
      switch (dir) {
        case "Descendant":
          sequence = trie.map((n) => n + base).reverse();
          break;
        case "UpDown":
          sequence = [...trie.map((n) => n + base), ...trie.map((n) => n + base).reverse().slice(1, -1)];
          break;
        case "DownUp":
          sequence = [...trie.map((n) => n + base).reverse(), ...trie.map((n) => n + base).slice(1, -1)];
          break;
        case "Aléatoire":
          // Fisher-Yates, et non `sort(() => hasard() - 0.5)` : un comparateur
          // incoherent ne produit pas une permutation uniforme — selon
          // l'algorithme de tri du moteur, certains ordres sortent bien plus
          // souvent que d'autres, et les notes du milieu bougent moins que
          // celles des bords. Le defaut etait invisible parce qu'un arpege
          // « aleatoire » a toujours l'air aleatoire.
          sequence = melangerUniformement(trie, hasard).map((n) => n + base);
          break;
        default: // Montant
          sequence = trie.map((n) => n + base);
      }
      result.push(...sequence);
    }
    return result;
  }

  // Motif : pattern répétitif sur l'accord (ex: "1232" = bas, milieu, haut, milieu)
  function appliquerMotif(ordre: number[], motifStr: string): number[] {
    if (!motifStr || motifStr === "Droit") return ordre;
    const indices = motifStr.split("").map((c) => parseInt(c, 10) - 1);
    const result: number[] = [];
    for (const idx of indices) {
      if (idx >= 0 && idx < ordre.length) result.push(ordre[idx]);
    }
    return result.length > 0 ? result : ordre;
  }

  // Construire les notes arpégées
  const nouvNotes: NoteEvenement[] = [];
  for (const accord of accords) {
    const ordre = ordreArpege(accord.notes, direction, octaves);
    const motifNotes = appliquerMotif(ordre, motif);
    const nbNotes = motifNotes.length;
    if (nbNotes === 0) continue;

    // Durée totale de l'arpège = durée de l'accord original
    const dureeAccord = Math.max(accord.duree, nbNotes * dureeStep);
    const nbCycles = Math.max(1, Math.floor(dureeAccord / (nbNotes * dureeStep)));

    for (let c = 0; c < nbCycles; c++) {
      for (let i = 0; i < nbNotes; i++) {
        const t = accord.temps + (c * nbNotes + i) * dureeStep;
        const note = Math.max(0, Math.min(127, motifNotes[i]));
        nouvNotes.push({
          note,
          velocite: Math.max(1, Math.min(127, Math.round(accord.velocite * 0.9))),
          debut: t,
          fin: t + dureeNote,
        });
      }
    }
  }

  const tpm = 480;
  const tempo = 120;
  const microsecParBeat = (60 / tempo) * 1_000_000;
  function secEnTicks(sec: number): number { return Math.round((sec / 60) * tempo * tpm); }

  const lignes: { tick: number; type: string; [key: string]: any }[] = [
    { tick: 0, type: "setTempo", microsecondsPerBeat: microsecParBeat },
    { tick: 0, type: "timeSignature", numerator: 4, denominator: 4 },
  ];

  for (const n of nouvNotes) {
    const tickDebut = secEnTicks(n.debut);
    const tickFin = secEnTicks(n.fin);
    lignes.push({ tick: tickDebut, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocite });
    lignes.push({ tick: Math.max(tickDebut + 1, tickFin), type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 });
  }

  lignes.sort(comparerEvenementsMidi);
  let tickCourant = 0;
  const events: { deltaTime: number; type: string; [key: string]: any }[] = [];
  for (const l of lignes) {
    const { tick, ...rest } = l;
    events.push({ deltaTime: tick - tickCourant, ...rest });
    tickCourant = tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack" });

  const nouvMidi = { header: { format: 1 as const, numTracks: 1, ticksPerBeat: tpm }, tracks: [events] };
  const nouvBytes = new Uint8Array(writeMidi(nouvMidi as any));
  const nomBase = fichier.name.replace(/\.mid$/i, "");
  return new File([nouvBytes], `${nomBase}_arp.mid`, { type: "audio/midi" });
}


