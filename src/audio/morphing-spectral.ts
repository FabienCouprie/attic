// audio/morphing-spectral.ts — Passer d'un son à un autre par le spectre, et non par le volume.
//
// CE QUE CE N'EST PAS, ET C'EST LA PREMIÈRE CHOSE À DIRE. Un fondu enchaîné fait entendre DEUX
// sons, l'un qui s'en va et l'autre qui arrive ; au milieu, on entend les deux. Un morphing n'en
// fait entendre qu'UN, dont le timbre se déplace : au milieu, ce n'est ni le premier ni le second,
// c'est un son qui n'existait pas.
//
// CE QUE CE N'EST PAS NON PLUS. Le vocodeur du catalogue fait de la synthèse croisée : il prend
// l'enveloppe de l'un et l'applique à l'autre, ce qui est une opération ASYMÉTRIQUE — il y a un
// modulateur et une porteuse, et la porteuse fournit la matière. Ici les deux sons ont le même
// rôle, et le réglage traverse continûment de l'un à l'autre.
//
// L'INTERPOLATION SE FAIT SUR LES LOGARITHMES DES AMPLITUDES, et ce détail est tout le sujet.
// Interpoler les amplitudes linéairement fait dominer le plus fort des deux : à mi-chemin entre un
// partiel à 1 et un partiel à 0,01, la moyenne vaut 0,505 — soit presque le son fort, à un demi-
// décibel près. En logarithme, le même milieu donne 0,1, c'est-à-dire À MI-CHEMIN EN DÉCIBELS, qui
// est la seule façon d'être au milieu pour l'oreille. C'est ce qui fait qu'un morphing à 50 %
// s'entend comme un objet intermédiaire, et non comme le plus fort des deux à peine teinté.
//
// CE QUE LA MÉTHODE NE FAIT PAS, ET IL FAUT L'ÉCRIRE. Elle interpole les amplitudes CASE PAR CASE,
// elle n'apparie pas les partiels pour les faire glisser de l'un à l'autre. Entre un sinus à 200 Hz
// et un sinus à 3000, le milieu ne contient donc pas un sinus à 775 Hz : il contient les deux, à la
// moyenne géométrique de leurs amplitudes. Sur des sons réels — riches, aux partiels nombreux —
// cela s'entend bien comme un timbre intermédiaire, et le centroïde le confirme ; sur deux sinus
// isolés, la limite se voit. Faire glisser les partiels demanderait de les appareiller d'abord,
// c'est-à-dire un modèle sinusoïdal, ce qui est un autre nœud.
//
// LA PHASE VIENT DU SON DOMINANT, celui vers lequel on penche, et non d'une interpolation : deux
// phases moyennées ne donnent pas une phase intermédiaire mais une interférence — le résultat
// s'amincit au lieu de se déplacer. C'est le même raisonnement que pour le bruit de velours : ce
// sont les AMPLITUDES qui portent le timbre, la phase porte le grain.

import { fft } from "./fft";

export interface OptionsMorphing {
  /** 0 rend le premier son, 1 le second. */
  melange: number;
  /** Le mélange échantillon par échantillon, quand une courbe le pilote. */
  melangeCourbe?: Float32Array;
  taille?: number;
}

const TAILLE_DEFAUT = 2048;

/** Le mélange à un instant donné, borné entre zéro et un. */
function melangeEn(o: OptionsMorphing, position: number): number {
  const borne = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const c = o.melangeCourbe;
  if (!c || c.length === 0) return borne(o.melange);
  return borne(c[Math.min(position, c.length - 1)]);
}

/**
 * Le morphing de deux signaux, trame par trame.
 *
 * Les deux sons sont analysés aux mêmes instants : ce qui se passe à la seconde 3 de l'un se mêle
 * à ce qui se passe à la seconde 3 de l'autre. Un son plus court que l'autre est complété par du
 * silence, ce qui veut dire que son spectre devient nul — et qu'à mi-chemin il tire l'autre vers
 * le bas. C'est le comportement attendu d'une interpolation, et non une erreur à corriger : un
 * silence est un son dont toutes les amplitudes valent zéro.
 */
export function morphingSpectral(
  a: Float32Array, b: Float32Array, o: OptionsMorphing,
): Float32Array {
  const taille = o.taille ?? TAILLE_DEFAUT;
  const saut = taille / 4;
  const n = Math.max(a.length, b.length);
  const sortie = new Float32Array(n);
  const poids = new Float32Array(n);
  const fenetre = Float32Array.from({ length: taille }, (_, i) =>
    0.5 * (1 - Math.cos((2 * Math.PI * i) / taille)));

  const reA = new Float64Array(taille), imA = new Float64Array(taille);
  const reB = new Float64Array(taille), imB = new Float64Array(taille);

  for (let debut = 0; debut + taille <= n + saut; debut += saut) {
    const m = melangeEn(o, debut);
    for (let i = 0; i < taille; i++) {
      const j = debut + i;
      reA[i] = (j < a.length ? a[j] : 0) * fenetre[i]; imA[i] = 0;
      reB[i] = (j < b.length ? b[j] : 0) * fenetre[i]; imB[i] = 0;
    }
    fft(reA, imA, false);
    fft(reB, imB, false);

    // LE PLANCHER EST RELATIF À LA TRAME, et non absolu. Un plancher fixe à 1e-9 paraissait
    // inoffensif ; il ne l'était pas. Le rétablissement d'énergie qui suit multiplie toute la
    // trame, y compris les deux mille cases vides posées sur ce plancher, et le gain nécessaire
    // atteignait dix mille : mesuré, un niveau de 173 pour une entrée à 0,35. Quatre-vingts
    // décibels sous le maximum de la trame, le plancher reste négligeable quel que soit le gain.
    let energieA = 0, energieB = 0, maxAmp = 0;
    for (let k = 0; k < taille; k++) {
      const a2 = reA[k] * reA[k] + imA[k] * imA[k];
      const b2 = reB[k] * reB[k] + imB[k] * imB[k];
      energieA += a2; energieB += b2;
      if (a2 > maxAmp) maxAmp = a2;
      if (b2 > maxAmp) maxAmp = b2;
    }
    const PLANCHER = Math.max(1e-12, Math.sqrt(maxAmp) * 1e-4);
    for (let k = 0; k < taille; k++) {
      const ampA = Math.hypot(reA[k], imA[k]);
      const ampB = Math.hypot(reB[k], imB[k]);
      // Le logarithme, borné par le plancher relatif calculé plus haut.
      const logMel = (1 - m) * Math.log(Math.max(PLANCHER, ampA)) + m * Math.log(Math.max(PLANCHER, ampB));
      const amp = Math.exp(logMel);
      // La phase du son dominant : moyenner deux phases ne fait pas une phase intermédiaire.
      const dominant = m < 0.5 ? { re: reA[k], im: imA[k], a: ampA } : { re: reB[k], im: imB[k], a: ampB };
      const phaseRe = dominant.a > PLANCHER ? dominant.re / dominant.a : 1;
      const phaseIm = dominant.a > PLANCHER ? dominant.im / dominant.a : 0;
      reA[k] = amp * phaseRe;
      imA[k] = amp * phaseIm;
    }

    // L'ÉNERGIE DE LA TRAME EST RÉTABLIE, et sans cela le nœud serait inutilisable. La moyenne
    // géométrique d'une case pleine chez l'un et vide chez l'autre vaut la racine de leur produit,
    // c'est-à-dire presque rien : mesuré dans l'application sur deux sinus, le niveau tombait de
    // 0,296 à 0,0071 à mi-parcours, soit trente-deux décibels. On interpole donc la FORME du
    // spectre en logarithme, puis on lui rend l'énergie que la même interpolation logarithmique
    // donne aux deux sons — un morphing à mi-chemin doit s'entendre à mi-chemin, pas disparaître.
    const cibleEnergie = Math.exp((1 - m) * Math.log(Math.max(1e-18, energieA)) + m * Math.log(Math.max(1e-18, energieB)));
    let energieSortie = 0;
    for (let k = 0; k < taille; k++) energieSortie += reA[k] * reA[k] + imA[k] * imA[k];
    const gain = energieSortie > 1e-18 ? Math.sqrt(cibleEnergie / energieSortie) : 0;
    for (let k = 0; k < taille; k++) { reA[k] *= gain; imA[k] *= gain; }

    fft(reA, imA, true);
    for (let i = 0; i < taille; i++) {
      const j = debut + i;
      if (j < 0 || j >= n) continue;
      sortie[j] += reA[i] * fenetre[i];
      poids[j] += fenetre[i] * fenetre[i];
    }
  }
  // LE POIDS EST BORNÉ PAR LE BAS, et c'est ce qui manquait. Aux deux bouts du son, une seule
  // fenêtre contribue et son poids tend vers zéro : diviser par lui multipliait les premiers
  // échantillons par des milliers. Mesuré : un niveau efficace de 143 pour des entrées à 0,35,
  // entièrement dû à quelques échantillons de bord. Le défaut ne se voyait pas sur les mesures de
  // centroïde, qui regardent le milieu du son.
  let poidsPlein = 0;
  for (let i = 0; i < n; i++) if (poids[i] > poidsPlein) poidsPlein = poids[i];
  const minimum = Math.max(1e-9, poidsPlein * 0.05);
  for (let i = 0; i < n; i++) sortie[i] /= Math.max(minimum, poids[i]);
  return sortie;
}

/**
 * Le centroïde spectral d'un signal, en hertz — l'instrument qui dit où en est un morphing.
 *
 * Exporté pour les tests et pour le nœud : le seul moyen de vérifier qu'un morphing à mi-chemin
 * est vraiment à mi-chemin est de mesurer une grandeur qui traverse d'un son à l'autre.
 */
export function centroide(x: Float32Array, frequence: number, taille = TAILLE_DEFAUT): number {
  const re = new Float64Array(taille), im = new Float64Array(taille);
  const debut = Math.max(0, Math.floor((x.length - taille) / 2));
  for (let i = 0; i < taille; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / taille));
    re[i] = (x[debut + i] ?? 0) * w;
    im[i] = 0;
  }
  fft(re, im, false);
  let somme = 0, poids = 0;
  for (let k = 1; k < taille / 2; k++) {
    const amp = Math.hypot(re[k], im[k]);
    somme += ((k * frequence) / taille) * amp;
    poids += amp;
  }
  return poids > 1e-12 ? somme / poids : 0;
}
