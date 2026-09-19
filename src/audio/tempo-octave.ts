// audio/tempo-octave.ts — L'erreur d'octave, faiblesse classique de toute détection de tempo.
//
// Une autocorrélation sur l'enveloppe d'attaques ne distingue pas un morceau à 80 BPM
// d'un morceau à 160 BPM dont on ne compterait qu'un temps sur deux : les deux périodes
// expliquent aussi bien le signal. Le repli d'usage consiste à ramener la valeur dans la
// plage où vit la plupart de la musique, en doublant ou en divisant par deux — ce qui ne
// change pas le rythme entendu, seulement la façon de le compter.
//
// Attic estime déjà le tempo dans `analyserAudio` ; ce module ne refait pas cette mesure,
// il en corrige l'ambiguïté et la présente.

/**
 * Ramène un tempo dans [min, max] en le doublant ou en le divisant par deux.
 *
 * Le compromis, mesuré dans l'application sur des motifs de boîte à rythmes — la détection
 * brute divise volontiers par deux sur du percussif :
 *
 *     réglé   brut   replié [80,160]   replié [60,180]
 *     100      50        100 ✓             100 ✓
 *     140      70        140 ✓              70 ✗
 *      75      75        150 ✗              75 ✓
 *
 * Aucune plage ne gagne partout : c'est l'ambiguïté d'octave elle-même, pas un réglage à
 * trouver. La valeur par défaut retient 80–160, qui redresse les deux erreurs de division
 * au prix d'un vrai tempo lent doublé — le nœud affiche de toute façon la valeur brute et
 * les autres lectures, et laisse le réglage ouvert.
 */
export function ramenerDansPlage(bpm: number, min = 80, max = 160): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  if (min <= 0 || max <= min) return Math.round(bpm);
  let v = bpm;
  // Bornes de sécurité : sans elles, une plage trop étroite pour qu'un facteur 2 y tombe
  // ferait tourner la boucle indéfiniment.
  for (let i = 0; i < 12 && v < min; i++) v *= 2;
  for (let i = 0; i < 12 && v > max; i++) v /= 2;
  return Math.round(v);
}

/** Les lectures également plausibles d'un même tempo : moitié, valeur, double. */
export function candidatsOctave(bpm: number): number[] {
  if (!Number.isFinite(bpm) || bpm <= 0) return [];
  return [Math.round(bpm / 2), Math.round(bpm), Math.round(bpm * 2)].filter((v) => v >= 20 && v <= 400);
}

/**
 * Ce qu'on peut dire de la confiance sans mentir.
 *
 * La confiance rendue par l'autocorrélation n'est pas une probabilité : c'est un pic
 * normalisé, que l'on traduit ici en trois paliers plutôt qu'en pourcentage, pour ne pas
 * donner à l'utilisateur une précision qui n'existe pas.
 */
export type FiabiliteTempo = "nulle" | "faible" | "moyenne" | "bonne";

export function fiabiliteTempo(confiance: number, bpm: number): FiabiliteTempo {
  if (!Number.isFinite(bpm) || bpm <= 0) return "nulle";
  if (confiance >= 0.6) return "bonne";
  if (confiance >= 0.3) return "moyenne";
  return "faible";
}
