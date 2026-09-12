// ui/lecteur-onde.ts — Qui décide de lancer ou d'arrêter la lecture.
//
// Un élément `<audio>` dont on remplace le `src` passe en PAUSE **sans émettre
// d'événement `pause`** : l'algorithme de chargement du HTML pose `paused` à
// vrai directement. Un état React alimenté par les seuls `onPause`/`onEnded`
// reste donc sur « en lecture » alors que l'élément est arrêté.
//
// Le bouton du sélecteur multi-zones décidait depuis cet état. Après un
// changement de fichier en amont suivi d'un run, il appelait donc `pause()` sur
// un élément déjà en pause : aucun effet, et aucun événement pour corriger
// l'état. Le bouton restait figé sur « ❚❚ » et plus aucun clic ne relançait la
// lecture. Mesuré dans l'app : trois clics de suite laissaient `paused: true`.
//
// La règle : c'est l'ÉLÉMENT qui dit s'il joue, jamais l'interface. L'icône peut
// se tromper le temps d'un rendu — l'action, non — et le `onPlay`/`onPause`
// qu'elle déclenche remet l'icône d'accord. Ce n'est pas une invention pour
// l'occasion : `FormeOnde`, l'autre lecteur de forme d'onde, délègue déjà à
// `wavesurfer.playPause()`, qui interroge le média. Le sélecteur multi-zones
// était le seul à décider depuis son propre affichage.

/** Ce que le bouton lecture/pause doit faire, une fois cliqué. */
export type ActionLecture = "lire" | "pause" | "rien";

/**
 * @param elementEnPause état RÉEL de l'élément `<audio>` (`el.paused`), ou
 *        `undefined` s'il n'y a pas encore d'élément monté.
 * @param etatAffiche ce que l'interface croyait — volontairement ignoré : c'est
 *        justement sa désynchronisation qui bloquait le bouton.
 */
export function actionBoutonLecture(
  elementEnPause: boolean | undefined,
  etatAffiche: boolean,
): ActionLecture {
  void etatAffiche;
  if (elementEnPause === undefined) return "rien";
  return elementEnPause ? "lire" : "pause";
}
