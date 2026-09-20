// audio/midi-ordre.ts — L'ordre des événements MIDI dans un même tick.
//
// POURQUOI CETTE FONCTION VIT SEULE, dans un module qui n'importe RIEN. Elle habitait `audio/midi.ts`,
// qui tire `i18n.tsx` et le SoundFont global derrière lui. Or elle sert aussi au worker Magenta, et
// importer `audio/midi.ts` depuis un worker y faisait entrer un module React : en développement, Vite
// injecte dans tout `.tsx` le préambule de Fast Refresh, lequel touche `window` — qui n'existe pas
// dans un worker. Le worker mourait à l'import, ne répondait plus jamais, et les sept nœuds Magenta
// restaient « en cours » pour toujours, sans message.
//
// La règle qui en sort, et qui vaut pour tout module partagé avec un worker : un module appelé depuis
// un worker ne doit atteindre NI React, NI l'interface, NI l'i18n. Une fonction pure de douze lignes
// n'a aucune raison de traîner un dictionnaire de traduction derrière elle.

/**
 * Rang d'un événement à l'intérieur d'un même tick : réglages, puis note-off, puis note-on.
 *
 * L'ordre comptait, et il était inversé. Une note qui se rejoue à la même hauteur sur le
 * même canal — un accord tenu jusqu'au suivant, une basse qui répète sa fondamentale —
 * porte un note-off exactement au tick du note-on qui la relance. Le note-off écrit
 * APRÈS refermait la note qui venait de s'ouvrir : durée nulle, et `rendreAvecSF2`
 * écarte tout ce qui dure moins d'une milliseconde. En blues, dont la progression est
 * I–I–I–I, les huit accords portent les mêmes hauteurs : on n'entendait que le premier,
 * puis plus rien — et la basse suivait le même sort dès qu'un degré se répétait.
 *
 * Le note-off d'abord referme l'ancienne note à sa durée, le note-on relance ensuite :
 * les deux notes existent, et l'attaque se réentend à chaque accord.
 */
function rangEvenement(type: string): number {
  if (type === "noteOn") return 2;
  if (type === "noteOff") return 1;
  return 0; // setTempo, timeSignature, controller, programChange : avant les notes.
}

/** Comparateur d'événements MIDI absolus : par tick, puis par rang dans le tick. */
export function comparerEvenementsMidi(
  a: { tick: number; type: string },
  b: { tick: number; type: string },
): number {
  return a.tick - b.tick || rangEvenement(a.type) - rangEvenement(b.type);
}
