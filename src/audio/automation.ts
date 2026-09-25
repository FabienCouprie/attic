// audio/automation.ts — Poser une valeur sur un réglage du Web Audio, constante ou variable.
//
// POURQUOI CE MODULE. Un effet qui applique son réglage dans une boucle JavaScript lit la valeur de
// l'échantillon et n'a rien d'autre à faire. Un effet rendu par un graphe Web Audio, lui, n'a pas de
// boucle : son réglage est un `AudioParam`, et le faire varier demande de programmer son parcours à
// l'avance, par `setValueCurveAtTime`. Deux techniques pour un même geste, et celle-ci manquait.
//
// LA RÈGLE QUI PROTÈGE L'EXISTANT. Quand la valeur est un NOMBRE, rien n'est programmé : on pose
// `param.value` exactement comme avant. L'automation n'est employée que pour un tableau, c'est-à-dire
// seulement quand une courbe est branchée. C'est ce qui garantit qu'un composant sans modulation
// rende ce qu'il rendait, au bit près, et les empreintes enregistrées avant l'ajout le vérifient.
//
// LA RÉSOLUTION EST CELLE D'UNE MODULATION, NON CELLE DU SIGNAL. `setValueCurveAtTime` interpole
// linéairement entre les points qu'on lui donne et les répartit sur la durée. Une courbe de
// modulation est lente, quelques dizaines de hertz au plus : deux mille points sur toute la durée
// la décrivent largement, là où un point par échantillon coûterait des mégaoctets pour un gain
// inaudible.

/** Nombre de points programmés sur toute la durée. Une modulation est lente ; ceci la décrit. */
export const POINTS_AUTOMATION = 2048;

/**
 * Pose une valeur sur un `AudioParam`, constante ou pilotée par une courbe.
 *
 * `transformer` porte le passage de l'unité de l'écran à celle du paramètre, par exemple un
 * pourcentage vers un gain. Il est appliqué aussi bien au nombre qu'à chaque point de la courbe,
 * si bien que les deux chemins ne peuvent pas diverger.
 */
export function poserParam(
  param: AudioParam,
  valeur: number | Float32Array,
  dureeSec: number,
  transformer: (x: number) => number = (x) => x,
): void {
  if (typeof valeur === "number") {
    param.value = transformer(valeur);
    return;
  }
  if (valeur.length === 0 || !(dureeSec > 0)) {
    param.value = transformer(0);
    return;
  }
  const points = Math.max(2, Math.min(POINTS_AUTOMATION, valeur.length));
  const courbe = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    // Le dernier point vise exactement la dernière valeur, sans quoi la fin de la modulation serait
    // tronquée d'un pas.
    const k = points === 1 ? 0 : Math.round((i * (valeur.length - 1)) / (points - 1));
    courbe[i] = transformer(valeur[k]);
  }
  param.setValueCurveAtTime(courbe, 0, dureeSec);
}

/**
 * La valeur d'un réglage au début du parcours, pour ce qui ne s'automatise pas.
 *
 * CERTAINS RÉGLAGES NE SONT PAS DES `AudioParam` : la taille d'une réponse impulsionnelle, la table
 * d'un distordeur. Les faire varier demanderait de reconstruire le graphe, ce qui n'est pas une
 * automation. Ces réglages prennent la valeur du début de la courbe, et leur documentation le dit.
 */
export const valeurInitiale = (v: number | Float32Array): number =>
  typeof v === "number" ? v : (v[0] ?? 0);
