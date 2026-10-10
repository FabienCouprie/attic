// audio/ubiquite.ts — L'ubiquité et l'hyperlocalisation.
//
// D'OÙ VIENNENT CES DEUX EFFETS. Jean-François Augoyard et Henry Torgue, « À l'écoute de
// l'environnement : répertoire des effets sonores », Parenthèses, 1995. L'ubiquité est l'effet par
// lequel une source devient impossible à situer : le son paraît venir de partout à la fois.
// L'hyperlocalisation est son contraire, un son dont la provenance se désigne avec une précision
// inhabituelle. Les deux sont les deux bouts d'une même grandeur, et c'est pourquoi un seul réglage
// les porte.
//
// CE QUE L'OREILLE EMPLOIE POUR SITUER UN SON, et donc ce qu'il faut toucher. Lord Rayleigh, « On
// our perception of sound direction », Philosophical Magazine 13, 1907, p. 214-232, en nomme deux :
// l'écart de temps entre les deux oreilles sous mille cinq cents hertz environ, et l'écart de niveau
// au-dessus. Il en est un troisième, que la théorie duplex laisse de côté et qui décide ici : la
// COHÉRENCE des deux signaux. Deux oreilles qui reçoivent la même onde concluent à une source ; deux
// oreilles qui reçoivent des ondes sans rapport ne concluent à rien, et le son se répand.
//
// LA DÉCORRÉLATION SE FAIT PAR LA PHASE, ET NON PAR LE NIVEAU, et c'est la seule façon qui tienne.
// Opposer les canaux, ou en retarder un, décorrèle aussi, mais le repli en mono s'y creuse : les
// deux canaux s'annulent, et la pièce diffusée sur un seul haut-parleur perd son grave. Un
// passe-tout ne change que la phase : il laisse à chaque canal son spectre entier, donc son niveau,
// et la somme des deux garde le sien. C'est la méthode de Gerzon et de Kendall, et c'est ce qu'un
// cas de ce dépôt mesure.
//
// LES DEUX CANAUX REÇOIVENT DES PHASES OPPOSÉES, ce qui double l'effet à moitié du travail : chaque
// bande est tournée d'un angle sur la gauche et du même angle à l'envers sur la droite. La
// différence entre les deux voies vaut alors deux fois l'écart, et le son reste centré.

/**
 * Un passe-tout d'ordre deux, dont le coefficient règle la fréquence où la phase tourne d'un demi-tour.
 *
 * SA RÉPONSE EN AMPLITUDE VAUT UN PARTOUT, exactement, et c'est toute sa raison d'être ici : le
 * signal en ressort avec le même spectre et le même niveau, décalé en phase et rien d'autre.
 */
function passeTout(x: Float32Array, coefficient: number, sortie: Float32Array): void {
  const a = Math.max(-0.98, Math.min(0.98, coefficient));
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    // H(z) = (a² + a·(1+a²)·z⁻¹ + z⁻²) / (1 + a·(1+a²)·z⁻¹ + a²·z⁻²), de module un sur tout l'axe.
    const b = a * (1 + a * a);
    const y = a * a * x[i] + b * x1 + x2 - b * y1 - a * a * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    sortie[i] = y;
  }
}

import { valeurA } from "./courbe";

export interface OptionsUbiquite {
  /**
   * De −1 pour l'hyperlocalisation à +1 pour l'ubiquité. À zéro, le son sort tel qu'il est entré.
   *
   * Un tableau la fait varier au fil du son, et il peut franchir zéro : le calcul passe alors d'un
   * bord à l'autre échantillon par échantillon.
   */
  dispersion: number | Float32Array;
  /** Le nombre de passe-tout en cascade. Plus il y en a, plus la phase se brouille finement. */
  etages: number;
  /** La graine du tirage des coefficients, pour qu'une écoute se refasse à l'identique. */
  graine: number;
}

/** Le tirage des coefficients : reproductible, sans quoi deux rendus ne se compareraient pas. */
function tirage(graine: number): () => number {
  let g = Math.max(1, Math.floor(graine)) >>> 0;
  return () => {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    return g / 4294967296;
  };
}

/**
 * Disperse ou resserre la provenance d'un son.
 *
 * L'HYPERLOCALISATION N'EST PAS LA DÉCORRÉLATION À L'ENVERS : on ne peut pas remonter une phase
 * qu'on n'a pas brouillée. Ce qu'elle fait est de RAPPROCHER les deux canaux de leur partie commune,
 * jusqu'à ne plus laisser qu'elle : à dispersion pleinement négative, les deux canaux sont le même
 * signal, et la source se désigne d'un point unique. C'est ce que l'effet décrit, un son dont la
 * provenance ne laisse aucun doute.
 */
export function ubiquite(buffer: AudioBuffer, o: OptionsUbiquite): AudioBuffer {
  const n = buffer.length;
  const sortie = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: buffer.sampleRate });
  const g = buffer.getChannelData(0);
  const d = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : g;
  // LE SIGNE CHOISIT ENTRE DEUX CALCULS, et c'est ce qui rend ce réglage particulier. Au négatif,
  // les deux canaux glissent vers leur moyenne ; au positif, une chaîne de passe-tout brouille la
  // phase. Un SCALAIRE négatif saute donc entièrement cette chaîne, et il doit continuer de le
  // faire : c'est son coût et ce sont ses bits. Une COURBE, elle, peut franchir zéro, et il faut
  // alors tenir les deux calculs prêts — ce qui n'est payé que lorsqu'elle va vraiment au positif.
  const dispersionA = (i: number) => Math.max(-1, Math.min(1, valeurA(o.dispersion, i)));
  const dispersion = dispersionA(0);
  const jamaisPositif = typeof o.dispersion === "number"
    ? dispersion <= 0
    : !o.dispersion.some((v) => v > 0);

  if (jamaisPositif) {
    // Vers l'hyperlocalisation : les deux canaux glissent vers leur moyenne, qui est ce qu'ils ont
    // en commun. À moins un, il ne reste qu'elle.
    const sg = sortie.getChannelData(0);
    const sd = sortie.getChannelData(1);
    for (let i = 0; i < n; i++) {
      const part = -dispersionA(i);
      const commun = (g[i] + d[i]) / 2;
      sg[i] = g[i] * (1 - part) + commun * part;
      sd[i] = d[i] * (1 - part) + commun * part;
    }
    return sortie;
  }

  const suivant = tirage(o.graine);
  const etages = Math.max(1, Math.round(o.etages));
  // LES COEFFICIENTS SONT TENUS LOIN DE ZÉRO, et c'est ce qui fait la différence entre un effet et
  // une intention. Un passe-tout de coefficient nul laisse passer le signal sans rien tourner : un
  // tirage uniforme en masse donc la moitié autour de l'inefficace, et six étages tirés ainsi ne
  // faisaient tomber la corrélation qu'à 0,335. Le module reste entre trois dixièmes et quatre-vingt
  // -cinq centièmes, et le signe se tire à part.
  const coefficients = Array.from({ length: etages }, () =>
    (0.3 + suivant() * 0.55) * (suivant() < 0.5 ? -1 : 1));

  const tourner = (x: Float32Array, sens: number): Float32Array => {
    let courant = Float32Array.from(x);
    const tampon = new Float32Array(n);
    for (const c of coefficients) {
      passeTout(courant, c * sens, tampon);
      courant = Float32Array.from(tampon);
    }
    return courant;
  };

  // Les deux voies reçoivent des coefficients OPPOSÉS : l'écart entre elles vaut ainsi deux fois le
  // tour appliqué, sans que l'image se déporte d'un côté.
  const tourneG = tourner(g, 1);
  const tourneD = tourner(d, -1);
  const sg = sortie.getChannelData(0);
  const sd = sortie.getChannelData(1);
  for (let i = 0; i < n; i++) {
    const v = dispersionA(i);
    if (v <= 0) {
      // La courbe est passée du côté négatif : c'est le glissement vers le commun qui s'applique,
      // avec la même arithmétique que la branche ci-dessus.
      const part = -v;
      const commun = (g[i] + d[i]) / 2;
      sg[i] = g[i] * (1 - part) + commun * part;
      sd[i] = d[i] * (1 - part) + commun * part;
    } else {
      sg[i] = g[i] * (1 - v) + tourneG[i] * v;
      sd[i] = d[i] * (1 - v) + tourneD[i] * v;
    }
  }
  return sortie;
}

/**
 * La corrélation des deux canaux, de −1 à +1.
 *
 * C'EST LA GRANDEUR QUE L'EFFET DÉPLACE, et le rapport la donne : un auditeur n'a aucun moyen de
 * juger à l'oreille si une image s'est élargie ou si elle s'est simplement déphasée.
 */
export function correlationDesCanaux(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels < 2) return 1;
  const g = buffer.getChannelData(0);
  const d = buffer.getChannelData(1);
  let sgd = 0;
  let sgg = 0;
  let sdd = 0;
  for (let i = 0; i < g.length; i++) { sgd += g[i] * d[i]; sgg += g[i] * g[i]; sdd += d[i] * d[i]; }
  const bas = Math.sqrt(sgg * sdd);
  return bas > 0 ? sgd / bas : 1;
}
