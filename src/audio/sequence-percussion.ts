// audio/sequence-percussion.ts — La batterie d'une séquence, séparée de ses hauteurs.
//
// POURQUOI CE MODULE EXISTE. Une séquence porte le canal de chacune de ses notes, et le dixième est
// celui de la batterie depuis le General MIDI. Le rendu l'ignorait : chaque note devenait une
// hauteur, canal compris, si bien qu'une grosse caisse écrite en 36 s'entendait en sinusoïde de
// trente-trois hertz. Le fichier MIDI produit à côté, lui, gardait le canal et sonnait juste dans
// un séquenceur : le même objet s'entendait donc de deux façons selon la sortie qu'on prenait.
//
// LE PARTAGE ET LE MÉLANGE SONT ICI, LA SYNTHÈSE AILLEURS. Ce qui décide du sort d'une note et ce
// qui additionne deux tampons se vérifient sans rendre un seul son ; les deux synthèses restent
// chez elles, l'une dans `midi.ts`, l'autre dans `tone-synths.ts`.

import { CANAL_PERCUSSION } from "./batterie-midi";
import type { Note } from "./note";

/**
 * La réserve appliquée à la batterie d'une séquence, la même que la synthèse des hauteurs se garde.
 *
 * POURQUOI ELLE EXISTE, MESURÉ ET NON SUPPOSÉ. Les deux voies n'étaient pas étalonnées pour être
 * mêlées : la synthèse des hauteurs se garde ce facteur depuis toujours, parce qu'une séquence peut
 * porter beaucoup de notes simultanées ; le synthétiseur de percussions, lui, sort au niveau plein,
 * ses voix ayant été réglées pour qu'une frappe seule frôle un. Additionnées, elles dépassaient.
 * Relevé sur trois cercles, deux de percussion et un de mélodie, quatre variations : **+2,5 dB de
 * crête**, c'est-à-dire de l'écrêtage à la lecture. Sans elle, la batterie était aussi huit
 * décibels au-dessus de la mélodie, ce qui n'est pas un mélange mais une batterie avec du fond.
 */
export const RESERVE_BATTERIE = 0.4;

/**
 * Cette note est-elle une frappe de batterie ?
 *
 * LE CANAL EST FACULTATIF SUR UNE NOTE, et son absence vaut zéro : une séquence qui ne s'est jamais
 * souciée des canaux reste entièrement mélodique, et rien de ce qui existe ne change de son.
 */
export function estFrappe(note: Note): boolean {
  return (note.canal ?? 0) === CANAL_PERCUSSION;
}

/** Les frappes d'un côté, les hauteurs de l'autre, dans leur ordre d'origine. */
export function separerPercussions(notes: readonly Note[]): { frappes: Note[]; hauteurs: Note[] } {
  const frappes: Note[] = [];
  const hauteurs: Note[] = [];
  for (const n of notes) (estFrappe(n) ? frappes : hauteurs).push(n);
  return { frappes, hauteurs };
}

/**
 * Deux tampons additionnés dans un troisième, de la durée voulue.
 *
 * LA DURÉE VOULUE L'EMPORTE, comme partout ailleurs dans le rendu d'une séquence. La batterie est
 * rendue avec une queue d'une demi-seconde après sa dernière frappe, ce qui laisse sonner une
 * cymbale ; cette queue est coupée si elle dépasse, exactement comme l'est une note tenue trop
 * longue. Sans cela, une mesure de deux secondes en aurait rendu deux et demie dès qu'une frappe
 * tombait à la fin, et deux cercles de tailles différentes n'auraient plus fini ensemble.
 *
 * AUCUNE LIMITATION ICI. Deux sons qui s'additionnent peuvent dépasser un, et c'est au niveau de
 * chaque voie d'y veiller : un écrêtage posé là masquerait un déséquilibre au lieu de le montrer.
 */
export function melangerTampons(a: AudioBuffer, b: AudioBuffer, duree: number): AudioBuffer {
  const sampleRate = a.sampleRate;
  const longueur = Math.ceil(duree * sampleRate);
  const canaux = Math.max(a.numberOfChannels, b.numberOfChannels);
  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate });
  for (let c = 0; c < canaux; c++) {
    const cible = sortie.getChannelData(c);
    for (const source of [a, b]) {
      // Un tampon mono nourrit les deux voies : c'est ce qu'on attend d'une source qui n'a qu'un
      // canal, plutôt qu'un silence à droite.
      const donnees = source.getChannelData(Math.min(c, source.numberOfChannels - 1));
      const n = Math.min(longueur, donnees.length);
      for (let i = 0; i < n; i++) cible[i] += donnees[i];
    }
  }
  return sortie;
}

/** Un silence de la durée voulue, quand une séquence n'a que de la batterie. */
export function tamponSilencieux(duree: number, sampleRate = 44100): AudioBuffer {
  return new AudioBuffer({
    numberOfChannels: 2, length: Math.ceil(duree * sampleRate), sampleRate,
  });
}
