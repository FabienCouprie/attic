// core/bruit-rose.ts — Le bruit rose de Paul Kellet, écrit une seule fois.
//
// SEPT ÉTATS, SIX FILTRES PASSE-BAS DU PREMIER ORDRE de fréquences échelonnées et un retard d'un
// échantillon : leur somme approche la pente de trois décibels par octave d'un bruit en un sur f, à
// moins d'un demi-décibel près sur la bande utile. Le terme `blanc · 0,5362`, non filtré, rend l'aigu.
// Les coefficients sont ceux de la version raffinée du filtre de Paul Kellet, pour 44,1 kHz ; ce sont
// aussi ceux du bruit rose de Tone.js (`source/Noise.js`).
//
// QUATRE MODULES EN TENAIENT CHACUN SA COPIE (2026-11-27) : le générateur de bruit, la corde pincée,
// le son d'essai de l'écart à la référence et le frottement du pointeur. Rien ne les tenait ensemble,
// et un coefficient retouché dans l'une n'aurait pas bougé les trois autres. Chacun appelle désormais
// celle-ci, au bit près de ce qu'il rendait : même ordre des opérations, même gain appliqué au double
// avant l'arrondi en 32 bits.
//
// IL VIT DANS LE CŒUR, À CÔTÉ DU GÉNÉRATEUR COMMUN, et non dans `audio/`. Le frottement du pointeur
// est du shell : l'importer de `audio/` couplait `ui/friction-pointeur.ts` au domaine, ce que
// `docs/frontiere-domaine.test.ts` refuse. C'est un hasard coloré, comme `hasard.ts` est un hasard
// blanc : il n'importe rien, ne nomme aucun type du domaine, et un autre domaine peut s'en servir.

export interface OptionsBruitRose {
  /** Le gain appliqué à la somme des filtres, avant l'arrondi. 0,11 par défaut, celui de Kellet. */
  gain?: number;
  /**
   * Le nombre d'échantillons tirés et jetés avant le premier gardé, pour que les filtres soient en
   * régime : leur départ à froid porte une pente que le bruit établi n'a pas. Zéro par défaut.
   */
  regime?: number;
}

/**
 * `n` échantillons de bruit rose, tirés de la source blanche `blanc`.
 *
 * LA SOURCE EST DONNÉE PAR L'APPELANT, et c'est ce qui permet de n'en écrire qu'un : un tirage
 * uniforme sur [−1 ; 1] du générateur commun pour un son à graine, un tirage gaussien pour le son
 * d'essai d'un banc de mesure, `Math.random` pour une texture d'interface.
 */
export function bruitRoseKellet(n: number, blanc: () => number, o: OptionsBruitRose = {}): Float32Array<ArrayBuffer> {
  const gain = o.gain ?? 0.11;
  const regime = Math.max(0, Math.round(o.regime ?? 0));
  const sortie = new Float32Array(Math.max(0, Math.round(n)));
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = -regime; i < sortie.length; i++) {
    const w = blanc();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    if (i >= 0) sortie[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * gain;
    b6 = w * 0.115926;
  }
  return sortie;
}
