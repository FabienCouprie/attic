// audio/ambisonique.ts — Encoder un champ sonore, le tourner, le redescendre en stéréo.
//
// D'après Michael Gerzon, « Periphony: With-Height Sound Reproduction », Journal of the Audio
// Engineering Society 21(1), 1973, et la convention B-format du système Ambisonic.
//
// CE QUI MANQUAIT, ET CE QUE CE N'EST PAS. Attic sait déjà placer un son dans l'espace — le
// panoramiseur HRTF de « Spatialisation stéréo », la scène de « Resonance Audio ». Les deux
// placent une SOURCE. Aucun ne sait prendre un enregistrement entier et le FAIRE TOURNER autour de
// l'auditeur, ce qui est exactement ce que l'ambisonie apporte : le champ sonore est représenté
// par quatre grandeurs indépendantes de tout haut-parleur, et une rotation y est une simple
// rotation de deux d'entre elles. Faire tourner une scène stéréo autrement demanderait de séparer
// les sources, ce que personne ne sait faire proprement.
//
// LES QUATRE GRANDEURS DU PREMIER ORDRE. `W` est la pression, ce qu'entendrait un microphone
// omnidirectionnel ; `X`, `Y` et `Z` sont les trois composantes du gradient de pression, ce
// qu'entendraient trois microphones en huit orientés vers l'avant, la gauche et le haut. Le
// facteur `1/√2` sur `W` est la convention historique (FuMa) : il égalise les énergies des quatre
// voies, faute de quoi la voie omnidirectionnelle domine tout décodage.
//
// LE DÉCODAGE, ET POURQUOI IL EST SI COURT. Un haut-parleur placé dans la direction `θ` reçoit
// `W/√2 + (X·cos θ + Y·sin θ)/2` — c'est la formule d'un microphone virtuel cardioïde pointé dans
// cette direction. Deux directions, et l'on a une stéréo. Ce n'est pas une approximation : c'est
// la définition même du format, et c'est ce qui fait qu'un enregistrement ambisonique se décode
// pour n'importe quel dispositif sans avoir été refait.

export interface ChampB {
  W: Float32Array;
  X: Float32Array;
  Y: Float32Array;
  Z: Float32Array;
}

const RACINE2 = Math.SQRT2;

/**
 * Encode une source mono placée en `azimut` (radians, positif vers la gauche) et `elevation`.
 *
 * Les tableaux d'angles ont la longueur du signal : c'est ce qui permet à une source de se
 * déplacer, une courbe branchée décidant du parcours.
 */
export function encoder(s: Float32Array, azimut: Float32Array, elevation: Float32Array): ChampB {
  const n = s.length;
  const W = new Float32Array(n), X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const az = azimut[i] ?? azimut[azimut.length - 1] ?? 0;
    const el = elevation[i] ?? elevation[elevation.length - 1] ?? 0;
    const cosEl = Math.cos(el);
    W[i] = s[i] / RACINE2;
    X[i] = s[i] * Math.cos(az) * cosEl;
    Y[i] = s[i] * Math.sin(az) * cosEl;
    Z[i] = s[i] * Math.sin(el);
  }
  return { W, X, Y, Z };
}

/**
 * Tourne le champ autour de l'axe vertical.
 *
 * `W` et `Z` ne bougent pas — l'un n'a pas de direction, l'autre est l'axe de rotation. Seuls `X`
 * et `Y` tournent, par la rotation plane ordinaire. C'est tout, et c'est la raison d'être du
 * format : faire tourner une scène coûte deux multiplications par échantillon.
 */
export function tourner(champ: ChampB, angle: Float32Array): ChampB {
  const n = champ.W.length;
  const X = new Float32Array(n), Y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = angle[i] ?? angle[angle.length - 1] ?? 0;
    const c = Math.cos(a), s = Math.sin(a);
    X[i] = champ.X[i] * c - champ.Y[i] * s;
    Y[i] = champ.X[i] * s + champ.Y[i] * c;
  }
  return { W: champ.W, X, Y, Z: champ.Z };
}

/**
 * La part du champ qu'une rotation peut déplacer, de 0 à 1.
 *
 * LE CHIFFRE QUI MANQUAIT, ET IL A FALLU UNE QUESTION D'UTILISATEUR POUR S'EN APERCEVOIR : « je
 * n'entends pas la différence ». Le nœud tournait bien ce qu'on lui donnait — mais ce qu'on lui
 * donnait n'avait rien à tourner, et il ne le disait pas.
 *
 * `W` est la pression, qui n'a pas de direction ; `X` et `Y` sont ce qui tourne. Leur module
 * rapporté à la pression dit donc exactement ce que la rotation peut faire :
 *
 *   · UNE SOURCE PONCTUELLE donne 1 — tout le champ est directionnel, la rotation la promène.
 *   · UNE PRISE MONO, encodée comme deux sources à ±écart/2, donne cos(écart/2) : les deux `Y`
 *     s'annulent puisque `Y` vaut L−R, et il ne reste que `X`. Mesuré : 0,707 à l'écart de 90°
 *     par défaut, et ZÉRO à 180°, où le cosinus s'annule aussi.
 *   · ZÉRO signifie qu'il n'y a rien à tourner, et la sortie ne dépendra pas de l'angle.
 *
 * Ce que la rotation d'une prise mono fait alors, c'est un PANORAMIQUE et non un tour : mesuré
 * dans l'application, 9,5 dB d'écart entre les canaux à 90° — ce qui s'entend — et strictement
 * rien à 180°, où échanger deux canaux identiques les laisse identiques.
 */
export function partDirectionnelle(champ: ChampB): number {
  const n = champ.W.length;
  if (n === 0) return 0;
  let plan = 0, pression = 0;
  for (let i = 0; i < n; i++) {
    plan += champ.X[i] * champ.X[i] + champ.Y[i] * champ.Y[i];
    pression += champ.W[i] * champ.W[i] * 2; // W porte le facteur 1/√2 de la convention.
  }
  return pression > 1e-18 ? Math.sqrt(plan / pression) : 0;
}

/** Un microphone virtuel cardioïde pointé dans la direction `theta`. */
export function microphoneVirtuel(champ: ChampB, theta: number): Float32Array {
  const n = champ.W.length;
  const out = new Float32Array(n);
  const c = Math.cos(theta), s = Math.sin(theta);
  for (let i = 0; i < n; i++) {
    out[i] = champ.W[i] / RACINE2 + (champ.X[i] * c + champ.Y[i] * s) / 2;
  }
  return out;
}

/**
 * Décode en stéréo : deux cardioïdes ouverts de `ouverture` radians de part et d'autre de l'avant.
 *
 * Une ouverture faible rend une image étroite mais cohérente ; une ouverture large sépare
 * davantage, au prix d'un creux au centre. Quatre-vingt-dix degrés est le compromis habituel.
 */
export function decoderStereo(champ: ChampB, ouverture: number): [Float32Array, Float32Array] {
  return [microphoneVirtuel(champ, ouverture / 2), microphoneVirtuel(champ, -ouverture / 2)];
}

/**
 * Encode une prise stéréo comme deux sources placées à gauche et à droite.
 *
 * C'est ce qui permet de faire tourner un enregistrement existant : on reconstitue une scène
 * plausible — deux sources aux angles d'écoute habituels — puis on la traite comme un champ.
 * Ce n'est pas la scène d'origine, et cela ne prétend pas l'être : c'est une scène qui rend les
 * mêmes deux canaux quand on ne la tourne pas.
 */
export function encoderStereo(
  gauche: Float32Array, droite: Float32Array, ecart: number,
): ChampB {
  const n = Math.max(gauche.length, droite.length);
  const zero = new Float32Array(n);
  const angleG = new Float32Array(n).fill(ecart / 2);
  const angleD = new Float32Array(n).fill(-ecart / 2);
  const g = encoder(gauche.length === n ? gauche : Float32Array.from({ length: n }, (_, i) => gauche[i] ?? 0), angleG, zero);
  const d = encoder(droite.length === n ? droite : Float32Array.from({ length: n }, (_, i) => droite[i] ?? 0), angleD, zero);
  const somme = (a: Float32Array, b: Float32Array) => Float32Array.from({ length: n }, (_, i) => a[i] + b[i]);
  return { W: somme(g.W, d.W), X: somme(g.X, d.X), Y: somme(g.Y, d.Y), Z: somme(g.Z, d.Z) };
}
