// audio/sequence.ts — Des notes qui passent d'un nœud à l'autre sans traverser un octet.
//
// POURQUOI CE TYPE DE FLUX EXISTE. Entre deux nœuds, des notes ne voyageaient que sous la forme
// d'un fichier `.mid`. Le numéro de note y est un octet : une hauteur qui ne tombe pas sur un
// demi-ton n'y entre pas. Mesuré dans `audio/microtons.test.ts` : 69,9 ressort à 69. Le calcul
// interne d'un nœud, lui, est continu de bout en bout, de la conversion en fréquence jusqu'au
// rendu. Le microton vivait donc à l'intérieur d'un nœud et mourait au premier câble.
//
// C'EST CE QUI EMPÊCHAIT D'HÉBERGER L'HARMONIE SPECTRALE, l'intonation juste et les profils
// mélodiques : chacune de ces fonctions rend des hauteurs qui ne sont pas des demi-tons, et deux
// d'entre elles mises à la suite ne composeraient pas. Voir `COMPOSITION-ASSISTEE.md`.
//
// CE N'EST PAS UN PASSAGE AUX MIDICENTS. La convention d'OpenMusic, où le do central vaut 6000,
// supposerait de multiplier par cent toute hauteur du dépôt. Elle est inutile ici : le champ est
// déjà un nombre à virgule, et `440 × 2^((n − 69) / 12)` accepte 69,5 sans rien changer. Ce qui
// manquait n'était pas une unité, c'était un tuyau.
//
// CE N'EST PAS NON PLUS UNE NOTATION, ET LE NOM LE DIT. Une première version appelait ce flux
// « partition », ce que Fabien a relevé : le mot désignait déjà quatre ports Csound portant un
// texte au format `sco`, et deux ports homonymes de couleurs différentes se seraient côtoyés dans
// la palette. Il promettait en outre ce que l'objet ne tient pas. Rien n'est écrit ni dessiné ici :
// la notation est ce que font MusicXML, ABC et la gravure, au bord de la chaîne. Ce qui circule est
// un convoi d'événements.
//
// CE QU'IL NE LIBÈRE PAS ENCORE. La hauteur est continue et le temps aussi, mais l'objet reste une
// suite d'événements DISCRETS : une note a un début, une fin, et une hauteur fixe pendant toute sa
// durée. Ni glissando, ni trajectoire, ni portamento. Une hauteur qui bouge pendant la note
// demanderait une courbe par note, et c'est un autre chantier.
//
// POURQUOI UN ENREGISTREMENT ET NON UN SIMPLE TABLEAU. Le tempo ne se déduit pas de notes dont les
// temps sont en secondes, et il faut le connaître pour graver. Un enregistrement laisse en outre la
// place aux arbres rythmiques, qui viendront à côté des notes et non à leur place.

import type { Note } from "./note";

export interface Sequence {
  /** Les notes, hauteurs en demi-tons, fractions comprises, temps en secondes. */
  notes: Note[];
  /**
   * Le tempo, en noires par minute, quand il est connu.
   *
   * Il ne sert pas à jouer — les temps sont absolus — mais à écrire : sans lui, une gravure ne
   * sait pas si une note d'une seconde est une noire ou une blanche.
   */
  tempo?: number;
  /**
   * La durée voulue, en secondes, quand elle dépasse la fin de la dernière note.
   *
   * UNE PIÈCE NE FINIT PAS FORCÉMENT SUR UNE NOTE, et c'est ce que la séquence ne savait pas dire.
   * Un rythme qui se termine par un silence — `(4/4 (1 1 1 -1))` — a quatre temps, dont le dernier
   * muet ; sa dernière note s'arrête pourtant au troisième. Le rendu, qui calculait sa longueur sur
   * elle, produisait **1,5 seconde au lieu de 2**, mesuré sur quatre arbres. Le silence final
   * disparaissait du son sans que rien ne le signale, ce qui casse un enchaînement et une boucle.
   *
   * ABSENTE, LA DURÉE RESTE CELLE DE LA DERNIÈRE NOTE : le champ est facultatif, et tout ce qui
   * produisait des séquences avant lui continue de se comporter comme avant.
   */
  duree?: number;
  /** Un titre, quand le nœud qui l'a produite en connaît un. */
  titre?: string;
}

/**
 * Reconnaît une séquence à l'entrée d'un nœud.
 *
 * UN PORT REND `unknown`, ET IL FAUT VÉRIFIER. Les autres types se reconnaissent par leur classe,
 * `AudioBuffer` ou `File` ; un enregistrement ordinaire n'en a pas. La vérification porte donc sur
 * la forme, et elle est stricte sur ce dont la suite dépend : un tableau, et des notes dont les
 * quatre champs sont des nombres. Une note dont la hauteur serait `NaN` passerait ce contrôle et
 * casserait plus loin, d'où le refus explicite.
 */
export function estSequence(valeur: unknown): valeur is Sequence {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return false;
  const s = valeur as Sequence;
  if (!Array.isArray(s.notes)) return false;
  if (s.tempo !== undefined && !Number.isFinite(s.tempo)) return false;
  return s.notes.every((n) =>
    n !== null && typeof n === "object"
    && Number.isFinite(n.note) && Number.isFinite(n.velocite)
    && Number.isFinite(n.debut) && Number.isFinite(n.fin));
}

/**
 * La durée qu'il faut pour tout entendre, silence final compris.
 *
 * C'est la fin de la dernière note, OU la durée voulue si elle va plus loin. Prendre la seule
 * dernière note perdait le silence sur lequel une pièce se termine.
 */
export function dureeSequence(s: Sequence): number {
  return Math.max(s.duree ?? 0, s.notes.reduce((m, n) => Math.max(m, n.fin), 0));
}

/**
 * Combien de notes ne tombent pas sur un demi-ton.
 *
 * Sert à le DIRE là où l'on va les perdre : une sortie MIDI arrondit, et le message du nœud doit
 * annoncer combien de hauteurs y laissent leur écart plutôt que de le taire.
 */
export function compterMicrotons(s: Sequence): number {
  return s.notes.filter((n) => !Number.isInteger(n.note)).length;
}
