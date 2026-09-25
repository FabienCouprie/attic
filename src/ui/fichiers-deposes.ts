// ui/fichiers-deposes.ts — Ce qu'on fait d'un fichier lâché sur le canevas.
//
// UN FICHIER LÂCHÉ SUR LE CANEVAS DEVIENT LE COMPOSANT QUI SAIT LE LIRE, déjà rempli. Le geste
// remplace trois actions : poser le composant, ouvrir son sélecteur, retrouver le fichier. Un son
// donne une « Entrée audio », un MIDI donne un « Lecteur MIDI ». Demandé par Fabien.
//
// LA RECONNAISSANCE PASSE PAR L'EXTENSION AUTANT QUE PAR LE TYPE. Un fichier lâché depuis
// l'explorateur de Windows arrive souvent avec un type vide, et toujours pour les formats que le
// système ne connaît pas — le FLAC et l'AIFF en premier, et le MIDI presque toujours. Se fier au
// seul `type` ferait échouer le geste sur les formats les plus soignés, ce qui est exactement
// l'inverse de ce qu'on veut.

/** Les extensions qu'un nœud « Entrée audio » sait décoder, en minuscules et avec leur point. */
export const EXTENSIONS_AUDIO = [
  ".wav", ".mp3", ".flac", ".ogg", ".oga", ".m4a", ".aac", ".aif", ".aiff", ".opus", ".webm",
] as const;

/** Les extensions d'un fichier MIDI. */
export const EXTENSIONS_MIDI = [".mid", ".midi", ".rmi"] as const;

/** Le composant qui sait lire un fichier lâché, ou `null` si aucun ne le sait. */
export type SorteDeposee = "audio" | "midi";

/**
 * Ce fichier est-il un son ?
 *
 * L'extension d'abord, le type ensuite : le premier est toujours là, le second manque souvent.
 */
export function estFichierAudio(nom: string, type = ""): boolean {
  const bas = String(nom ?? "").toLowerCase();
  if (EXTENSIONS_MIDI.some((e) => bas.endsWith(e))) return false;
  if (EXTENSIONS_AUDIO.some((e) => bas.endsWith(e))) return true;
  return String(type ?? "").toLowerCase().startsWith("audio/");
}

/**
 * Ce fichier est-il un MIDI ?
 *
 * LE TYPE NE SUFFIT PAS, ET IL TROMPE. Les systèmes annoncent le MIDI sous `audio/midi`, parfois
 * `audio/x-midi`, souvent rien du tout : un fichier `.mid` pris pour un son irait au décodeur audio,
 * qui échouerait sur un format qu'il ne connaît pas. L'extension tranche donc en premier, dans les
 * deux sens.
 */
export function estFichierMidi(nom: string, type = ""): boolean {
  const bas = String(nom ?? "").toLowerCase();
  if (EXTENSIONS_MIDI.some((e) => bas.endsWith(e))) return true;
  const t = String(type ?? "").toLowerCase();
  return t.includes("midi");
}

/** Ce qu'il faut poser pour ce fichier, ou `null` si le canevas ne sait pas encore quoi en faire. */
export function sorteDeposee(nom: string, type = ""): SorteDeposee | null {
  if (estFichierMidi(nom, type)) return "midi";
  if (estFichierAudio(nom, type)) return "audio";
  return null;
}

/**
 * Les emplacements de plusieurs fichiers lâchés ensemble.
 *
 * EN ESCALIER, ET NON EMPILÉS. Lâcher quatre sons pose quatre nœuds ; au même point, le dernier
 * cacherait les trois autres et l'on croirait n'en avoir qu'un. Le décalage suit la diagonale, de
 * quoi voir chaque en-tête dépasser du précédent.
 */
export function positionsEnCascade(
  depart: { x: number; y: number },
  nombre: number,
  pas = 28,
): { x: number; y: number }[] {
  return Array.from({ length: Math.max(0, nombre) }, (_, i) => ({
    x: depart.x + i * pas,
    y: depart.y + i * pas,
  }));
}
