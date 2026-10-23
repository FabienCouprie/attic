// plugins/generateurs-aides.ts — Ce dont les fiches de ce groupe se servent en commun.
//
// POURQUOI UN MODULE A PART plutot que de les laisser dans l'un des fichiers de fiches : celui-la
// deviendrait le maitre des autres, alors qu'une aide partagee est un sujet a elle seule.


import { frequenceDeNoteMidi, GAMMES_ACCORDS } from "../audio";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */

export function noteVersFrequence(note: string): number | null {
  const n = note.trim().replace(/\s+/g, "");
  const m = n.match(/^([A-Ga-g])([#♯]|[b♭])?(-?\d+)$/);
  if (!m) return null;
  const tbl: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = tbl[m[1].toUpperCase()] ?? 9;
  const alt = m[2] ?? "";
  if (alt === "#" || alt === "♯") pc += 1;
  else if (alt === "b" || alt === "♭") pc -= 1;
  const midi = (parseInt(m[3]) + 1) * 12 + pc;
  return frequenceDeNoteMidi(midi);
}

export const FORMES_FREQ = { ids: ["sine", "square", "saw", "triangle"], fr: ["Sinus", "Carré", "Scie", "Triangle"], en: ["Sine", "Square", "Saw", "Triangle"] };

/**
 * Le genre, avec ses libellés : identifiants canoniques, français, anglais.
 *
 * LES IDENTIFIANTS SONT EXACTEMENT LES CLÉS DE `PROGRESSIONS_GENRE` (`audio/generation.ts`), plus
 * « custom » pour la progression personnalisée. Un identifiant qui n'y est pas tombe sur le repli
 * « pop » SANS QUE RIEN NE LE DISE, et c'est arrivé : « Générateur musical » écrivait ses neuf
 * identifiants à la main avec « hip-hop » quand la clé de la table est « hiphop », de sorte que ce
 * genre rendait la progression de pop, fichier identique à l'octet près.
 *
 * LES LIBELLÉS SONT ICI POUR LA MÊME RAISON. Trois orthographes du même genre coexistaient :
 * « hip-hop » dans un composant, « hiphop » dans un autre, « hip hop » en anglais dans le
 * troisième. Un libellé se voit, et il s'enregistre aussi dès qu'un composant n'a pas d'`optionIds`.
 */
export const GENRES_ACCORDS = {
  ids: ["pop", "rock", "jazz", "blues", "classique", "electro", "hiphop", "reggae", "ambient", "custom"],
  fr: ["pop", "rock", "jazz", "blues", "classique", "electro", "hip-hop", "reggae", "ambient", "personnalisé"],
  en: ["Pop", "Rock", "Jazz", "Blues", "Classical", "Electronic", "Hip-hop", "Reggae", "Ambient", "Custom"],
};

/** Les mêmes identifiants seuls, pour qui n'a pas besoin des libellés. */
export const GENRES_ACCORDS_IDS = GENRES_ACCORDS.ids;

/**
 * Les libellés que les listes de genres ont portés avant cette table, et ce qu'ils désignaient.
 *
 * « GÉNÉRATEUR MUSICAL » LES ÉCRIVAIT À LA MAIN, en minuscules et autrement que ses deux voisins :
 * « classic » là où les autres disaient « Classical », « hip hop » en deux mots là où les autres
 * disaient « Hip-hop ». Et son identifiant même était « hip-hop », qui ne nommait aucune
 * progression. Rien de cela ne se devine : c'est déclaré, pour qu'un projet enregistré retrouve
 * son genre au lieu de retomber sur pop.
 */
export const LIBELLES_HERITES_GENRES: Record<string, string> = {
  "classic": "classique",
  "hip hop": "hiphop",
  "hip-hop": "hiphop",
};

/**
 * Le genre sans la progression personnalisée.
 *
 * « CUSTOM » EST EN DERNIER DANS LA TABLE POUR QUE CETTE COUPE SOIT POSSIBLE : un composant qui
 * n'a pas de champ « Progression » n'a rien à faire de cette valeur, et l'offrir le ferait tomber
 * sur une progression vide.
 */
export const GENRES_SANS_PERSONNALISE = {
  ids: GENRES_ACCORDS.ids.slice(0, -1),
  fr: GENRES_ACCORDS.fr.slice(0, -1),
  en: GENRES_ACCORDS.en.slice(0, -1),
};

// Ids canoniques du paramètre "Gamme" des mêmes nœuds — dérivés de
// GAMMES_ACCORDS (audio/generation.ts), seule source de vérité pour les
// intervalles réellement utilisés lors de la génération.
export const GAMMES_ACCORDS_IDS = GAMMES_ACCORDS.map((g) => g.id);


