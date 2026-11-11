// vues-domaine/lire-canaux.ts — Les deux canaux d'un exécuteur, lus sous la forme de leur famille.
//
// LA SEULE AFFIRMATION QUI RESTE. Le type d'un nœud ne sait des canaux `_affichage` et `_designe` que
// qu'ils existent : chaque exécuteur en choisit la forme. Une vue lit donc la forme de sa famille,
// déclarée une fois dans `plugins/formes-des-canaux.ts` et vérifiée par l'exécuteur qui l'écrit.
// L'affirmation de type est ici, et nulle part ailleurs dans les vues ; `lire-canaux.test.ts` le tient.
import type { DonneesNoeud } from "../ui/noeud-atelier";

/** Ce que l'exécuteur de ce nœud a montré, sous la forme de sa famille, ou rien s'il n'a pas tourné. */
export function affichageDe<Forme extends object>(data: Pick<DonneesNoeud, "_affichage">): Forme | undefined {
  return data._affichage as Forme | undefined;
}

/** Ce que l'exécuteur de ce nœud a désigné de ses entrées, sous la forme de sa famille. */
export function designeDe<Forme extends object>(data: Pick<DonneesNoeud, "_designe">): Forme | undefined {
  return data._designe as Forme | undefined;
}
