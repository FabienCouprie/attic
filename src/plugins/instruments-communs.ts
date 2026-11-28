// plugins/instruments-communs.ts — Ce que partagent les nœuds d'instruments.
//
// Les modèles physiques et les synthèses exotiques rendent tous un signal mono, acceptent
// tous un MIDI facultatif en entrée, et jouent tous une note quand rien n'est branché.
// Ces fonctions sont ce qui se répétait d'un fichier à l'autre ; `jouerLeMidi` est celle des
// synthétiseurs de Tone.js, qui rendent une note en stéréo.

import { valeurA } from "../audio/courbe";

import { Note as NoteTonal } from "tonal";
import type { Note } from "../audio/note";
import { frequenceDeTravail } from "../audio/frequence-de-travail";
import { frequenceDeNoteMidi, plafonnerCrete } from "../audio/commun";
export const FREQUENCE_ECH = () => frequenceDeTravail();

export type NoteJouee = Note;

export const frequenceDe = (note: number): number => frequenceDeNoteMidi(note);

// `lireNote` VIVAIT ICI, et a disparu le 2026-11-22 avec la revue des notations en texte : sa table
// n'avait ni E#, ni Fb, ni Cb, ni B#, et `?? 9` en faisait un la ; un nom illisible devenait la note
// par défaut, sans un mot. Les instruments lisent désormais leur réglage « Note » par le seul lecteur
// des noms de notes, `hauteurOuRefus` (`audio/noms-de-notes.ts`), qui refuse en nommant.

/** Le nom anglais d'une note MIDI, celui que lisent les synthétiseurs de Tone.js : 60 donne C4. */
export const nomDeNoteMidi = (midi: number): string => NoteTonal.fromMidi(Math.round(midi));

/**
 * Joue chaque note d'un MIDI par le rendu d'une note seule, posé à son début, à sa vélocité.
 *
 * LES SYNTHÉTISEURS DE LA FAMILLE NE SAVAIENT JOUER QU'UNE NOTE, réglée en texte (2026-11-28, demandé
 * par Fabien pour qu'ils prennent tous un MIDI, comme la corde de Karplus-Strong). Le rendu d'une note
 * reste celui de chaque composant ; ce qui est commun est ici : poser chaque tampon à l'instant de sa
 * note, le multiplier par sa vélocité sur 127, additionner.
 *
 * LE MÉLANGE N'EST QUE PLAFONNÉ, et non normalisé : sous 0,99 de crête (`plafonnerCrete`), rien n'est
 * touché, si bien qu'une note jouée à 127 sonne au niveau qu'elle a sans MIDI. Les notes se rendent
 * l'une après l'autre, pour qu'un hasard semé les tire toujours dans le même ordre.
 */
export async function jouerLeMidi(
  notes: readonly Note[], rendre: (n: Note, nom: string) => Promise<AudioBuffer>, sampleRate = FREQUENCE_ECH(),
): Promise<AudioBuffer> {
  const poses: { depart: number; gain: number; tampon: AudioBuffer }[] = [];
  for (const n of notes) {
    poses.push({
      depart: Math.max(0, Math.floor(n.debut * sampleRate)),
      gain: Math.max(0, Math.min(1, n.velocite / 127)),
      tampon: await rendre(n, nomDeNoteMidi(n.note)),
    });
  }
  const longueur = poses.reduce((m, p) => Math.max(m, p.depart + p.tampon.length), 1);
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: longueur, sampleRate });
  for (const p of poses) {
    for (let c = 0; c < 2; c++) {
      const source = p.tampon.getChannelData(Math.min(c, p.tampon.numberOfChannels - 1)), cible = sortie.getChannelData(c);
      for (let i = 0; i < source.length; i++) cible[p.depart + i] += source[i] * p.gain;
    }
  }
  return plafonnerCrete(sortie);
}

/** Ajoute un signal mono dans un mélange, à l'instant demandé. */
export function melanger(cible: Float32Array, source: Float32Array, debut: number): void {
  const depart = Math.max(0, Math.floor(debut * FREQUENCE_ECH()));
  const n = Math.min(source.length, cible.length - depart);
  for (let i = 0; i < n; i++) cible[depart + i] += source[i];
}

/**
 * Range un signal mono dans un buffer stéréo, normalisé puis mis au volume demandé.
 *
 * La normalisation est faite ici et non dans les modèles, parce qu'un mélange de plusieurs
 * notes dépasse forcément l'amplitude d'une seule.
 */
export function versBuffer(mono: Float32Array, volume: number | Float32Array): AudioBuffer {
  let crete = 0;
  for (let i = 0; i < mono.length; i++) crete = Math.max(crete, Math.abs(mono[i]));
  const gNorm = crete > 0.001 ? 0.9 / crete : 1;
  const buffer = new AudioBuffer({
    numberOfChannels: 2, length: Math.max(1, mono.length), sampleRate: FREQUENCE_ECH(),
  });
  const gauche = buffer.getChannelData(0), droite = buffer.getChannelData(1);
  // DEUX BOUCLES, ET C'EST DÉLIBÉRÉ. Le chemin du nombre garde son produit unique `gNorm × volume`,
  // calculé une fois : écrire `mono[i] × gNorm × volume` changerait l'ordre des multiplications, et
  // un flottant n'est pas associatif. La différence serait d'un bit, donc inaudible et invisible, ce
  // qui est exactement ce qui rendrait irreproductible un rendu déjà enregistré.
  if (typeof volume === "number") {
    const g = gNorm * Math.max(0, Math.min(1, volume / 100));
    for (let i = 0; i < mono.length; i++) {
      const x = mono[i] * g;
      gauche[i] = x;
      droite[i] = x;
    }
  } else {
    for (let i = 0; i < mono.length; i++) {
      const x = mono[i] * gNorm * Math.max(0, Math.min(1, valeurA(volume, i) / 100));
      gauche[i] = x;
      droite[i] = x;
    }
  }
  return buffer;
}
