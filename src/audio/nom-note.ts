// audio/nom-note.ts — Le nom d'une hauteur, écrit une fois.
//
// POURQUOI CE MODULE EXISTE. Le même calcul de quatre lignes était recopié dans trois fichiers
// — le clavier, la table de Markov, l'éditeur ABC par modèle de langue —, chacun avec sa table des
// douze noms. Les trois prenaient `note % 12` pour rang dans cette table, ce qui suppose un entier
// sans le dire : sur 69,5 le rang vaut 9,5, une case qui n'existe pas, et la fonction rendait `NaN`
// ou le mot « undefined » selon qu'elle concaténait un nombre ou un gabarit de texte. Une copie
// réparée laisse les autres cassées, et rien ne dit qu'elles existent.
//
// LA HAUTEUR PEUT NE PAS TOMBER SUR UN DEMI-TON. La conversion en fréquence est continue, la lecture
// d'un échantillon aussi : rien n'empêche une note de valoir 69,5, et c'est ce qui permettra
// l'harmonie spectrale et l'intonation juste. `audio/microtons.test.ts` sonde ce que chaque chemin
// en fait.
//
// AUCUN IMPORT ICI, comme dans `note.ts` : ce calcul est réclamé par l'interface comme par l'audio,
// et il ne doit rien faire venir derrière lui.

const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Le nom de la voisine la plus proche, sans rien dire de l'écart : « A#4 ».
 *
 * C'est la forme qu'attend un format qui se relit — l'éditeur ABC par modèle de langue rend les
 * noms à un modèle, puis les relit avec une expression régulière qui n'accepte qu'une lettre, une
 * altération et un chiffre. Un écart y serait rejeté.
 */
export function nomNoteRond(note: number): string {
  const proche = Math.round(note);
  return NOMS[((proche % 12) + 12) % 12] + (Math.floor(proche / 12) - 1);
}

/**
 * Le nom, et l'écart en cents s'il y en a un : « A4+40 », « A#4−50 », « C4 ».
 *
 * L'ÉCART EST DIT, ET NON TU. C'est la forme pour l'œil. Arrondir en silence afficherait « A4 »
 * pour un quart de ton, ce qui est le contraire de ce qu'on cherche à voir ; pire, deux hauteurs
 * distinctes porteraient le même nom dans une table qui existe pour être lue. Un demi-ton entier
 * ne porte aucun écart, et son nom ne change pas d'un caractère.
 *
 * UN QUART DE TON EXACT EST À ÉGALE DISTANCE DE SES DEUX VOISINES, et les deux noms le décrivent
 * aussi bien. L'arrondi va vers le haut : 69,5 se dit « A#4−50 » et non « A4+50 ».
 */
export function nomNote(note: number): string {
  const proche = Math.round(note);
  const ecart = Math.round((note - proche) * 100);
  const nom = nomNoteRond(note);
  return ecart === 0 ? nom : `${nom}${ecart > 0 ? "+" : "−"}${Math.abs(ecart)}`;
}
