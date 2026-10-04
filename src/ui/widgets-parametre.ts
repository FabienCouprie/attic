// ui/widgets-parametre.ts — Les genres de paramètre propres au domaine, et comment on les saisit.
//
// POURQUOI CE REGISTRE. Le cœur énumérait `"sf2instrument"` parmi les genres de paramètre, et
// l'inspecteur portait la branche qui le rend : un préréglage de banque SoundFont, c'est-à-dire du
// domaine audio, nommé à la fois dans le cœur et dans le shell. Un domaine d'images aurait hérité
// d'un genre de paramètre parlant d'instruments, et d'un inspecteur sachant le dessiner.
//
// CE QUE LE CŒUR GARDE, ET POURQUOI. Les genres dont la saisie ne suppose aucun domaine : un choix,
// un curseur, un texte, un chemin, un nombre, une liste de couleurs. Celle-ci n'est pas une
// exception : `ui/SaisieCouleurs.tsx` n'importe que React, et n'importe quel domaine peut vouloir une
// palette. Le critère est donc vérifiable, et non une affaire de goût — le composant de saisie
// importe-t-il quelque chose du domaine ?
//
// OÙ LE DOMAINE DÉCLARE LES SIENS : à la racine de composition, `src/composition.ts`. C'est le seul
// endroit qui connaît les deux côtés, et le même qui dépose le registre de fiches et les liens de la
// barre d'outils.

import type { ReactNode } from "react";

/** Ce qu'un composant de saisie reçoit : la valeur courante, et de quoi la changer. */
export interface ProprietesWidget {
  valeur: unknown;
  /** Le défaut déclaré par le paramètre, quand aucune valeur n'a été saisie. */
  defaut: unknown;
  onChanger: (valeur: string | number) => void;
}

/** Un genre de paramètre déclaré par le domaine. */
export interface GenreDomaine {
  /** Ce qui le rend dans l'inspecteur. */
  rendre: (props: ProprietesWidget) => ReactNode;
  /**
   * Sa valeur se compare-t-elle comme un NOMBRE ?
   *
   * Cela décide si l'inspecteur peut dire « ce réglage a été modifié » en comparant deux nombres, et
   * non deux chaînes. `ui/parametre-modifie.ts` tenait une liste où `"sf2instrument"` figurait en
   * dur : le fait appartient au genre, pas au shell.
   */
  numerique?: boolean;
}

let genres: Readonly<Record<string, GenreDomaine>> = {};

/** Le domaine déclare ses genres de paramètre. Appelé une fois, avant le premier rendu. */
export function declarerGenresParametre(declares: Record<string, GenreDomaine>): void {
  genres = { ...genres, ...declares };
}

/** Le genre déclaré pour ce type, ou rien si le cœur s'en charge. */
export const genreDomaine = (type: string | undefined): GenreDomaine | undefined =>
  (type === undefined ? undefined : genres[type]);

/** Les genres du domaine dont la valeur est un nombre. */
export const genresNumeriques = (): string[] =>
  Object.keys(genres).filter((g) => genres[g].numerique === true);

/** Oublie les déclarations. Pour un test qui veut éprouver le shell seul. */
export function oublierGenresParametre(): void {
  genres = {};
}
