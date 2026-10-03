// audio/platine.ts — Les défauts d'une platine tourne-disques.
//
// D'OÙ VIENT CET EFFET. Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement :
// répertoire des effets sonores », Parenthèses, 1995, y donnent le RUMBLE : « le ronflement
// intempestif du moteur d'une platine tourne-disques capté par la cellule de lecture, et mélangé au
// signal musical ». Les trois autres défauts rendus ici l'accompagnent toujours dans l'écoute d'un
// disque, et viennent du même geste : une pointe posée dans un sillon qui tourne.
//
// TOUT EST ACCROCHÉ À LA VITESSE DE ROTATION, et c'est ce qui fait la signature d'une platine plutôt
// que celle d'une bande. Un disque de trente-trois tours fait un tour en 1,8 seconde : le trou
// n'étant jamais exactement au centre, la vitesse de lecture monte et descend UNE FOIS PAR TOUR, et
// la hauteur du son avec elle. À quarante-cinq tours le cycle dure 1,33 seconde, à soixante-dix-huit
// 0,77. C'est le même défaut à trois rythmes, et c'est à ce rythme qu'on reconnaît la vitesse.
//
// LE RONFLEMENT EST MESURÉ PAR UNE NORME, et c'est elle qui donne l'ordre de grandeur des réglages.
// La DIN 45 539, reprise par la CEI 98, le relève sous le niveau de référence : une bonne platine
// des années soixante-dix tient −70 décibels non pondérés, une platine de salon −55. C'est la plage
// que le réglage parcourt.

/** Les trois vitesses, en tours par minute. */
export const VITESSES = [33 + 1 / 3, 45, 78];

/** La fréquence de rotation, en hertz : un tour de disque. */
export const frequenceDeRotation = (toursParMinute: number): number =>
  Math.max(1, toursParMinute) / 60;

export interface OptionsPlatine {
  /** La vitesse, en tours par minute. */
  vitesse: number;
  /** Le niveau du ronflement, en décibels sous la pleine échelle. */
  ronflement: number;
  /** Le niveau du bruit de surface, en décibels sous la pleine échelle. */
  surface: number;
  /** Le nombre de clics par seconde. */
  clics: number;
  /** L'excentricité du trou, de 0 à 1, qui fait varier la hauteur une fois par tour. */
  excentricite: number;
  /** La graine du tirage, pour qu'une écoute se refasse. */
  graine: number;
}

/** Le tirage : reproductible, un disque devant sonner deux fois de la même façon. */
function tirage(graine: number): () => number {
  let g = Math.max(1, Math.floor(graine)) >>> 0;
  return () => {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    return g / 4294967296;
  };
}

/** La coupure du ronflement, en hertz : le moteur et le palier ne montent pas au-dessus. */
const COUPURE_RONFLEMENT = 50;

/**
 * Le ronflement d'une platine, en échantillons.
 *
 * TROIS PÔLES, ET NON UN : un seul laisserait monter assez d'aigu pour qu'on entende un souffle là
 * où il faut un grondement. Et son niveau respire une fois par tour, le palier n'offrant pas la même
 * résistance sur toute sa révolution.
 */
export function ronflement(
  n: number, sampleRate: number, o: { vitesse: number; niveau: number; graine: number },
): Float32Array {
  const suivant = tirage(o.graine);
  const a = Math.exp((-2 * Math.PI * COUPURE_RONFLEMENT) / sampleRate);
  const etats = [0, 0, 0];
  const rot = frequenceDeRotation(o.vitesse);
  const gain = Math.pow(10, o.niveau / 20);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = suivant() * 2 - 1;
    for (let k = 0; k < 3; k++) { etats[k] = a * etats[k] + (1 - a) * v; v = etats[k]; }
    const respire = 1 + 0.35 * Math.sin(2 * Math.PI * rot * (i / sampleRate));
    // Les trois pôles rabotent beaucoup d'énergie : on la rend, pour que le réglage se lise en
    // décibels sous la pleine échelle et non comme un chiffre sans rapport avec ce qu'on entend.
    x[i] = v * 40 * gain * respire;
  }
  return x;
}

/**
 * Le bruit de surface et les clics, en échantillons.
 *
 * LES CLICS NE SONT PAS DU BRUIT, et c'est pourquoi ils sont tirés à part : un sillon rayé rend une
 * impulsion brève et forte, de facteur de crête élevé, là où la poussière rend un fond continu.
 * Les confondre donnerait un souffle là où l'on attend un craquement.
 */
export function surfaceEtClics(
  n: number, sampleRate: number, o: { surface: number; clics: number; graine: number },
): Float32Array {
  const suivant = tirage(o.graine ^ 0x5bf0);
  const gainFond = Math.pow(10, o.surface / 20);
  const x = new Float32Array(n);
  // Le fond : un bruit passé dans un passe-haut d'ordre un, la poussière n'ayant pas de grave.
  let precedent = 0;
  let sortie = 0;
  const a = Math.exp((-2 * Math.PI * 2000) / sampleRate);
  for (let i = 0; i < n; i++) {
    const v = suivant() * 2 - 1;
    sortie = a * (sortie + v - precedent);
    precedent = v;
    x[i] = sortie * gainFond;
  }
  // Les clics : une impulsion amortie, posée à des instants tirés au hasard.
  const combien = Math.round((Math.max(0, o.clics) * n) / sampleRate);
  const longueur = Math.max(2, Math.round(0.0015 * sampleRate));
  for (let k = 0; k < combien; k++) {
    const ou = Math.floor(suivant() * Math.max(1, n - longueur));
    const force = (0.3 + suivant() * 0.7) * (suivant() < 0.5 ? -1 : 1);
    for (let j = 0; j < longueur; j++) {
      x[ou + j] += force * Math.exp((-5 * j) / longueur) * Math.cos((Math.PI * j) / 2);
    }
  }
  return x;
}

/**
 * Le disque joué : la lecture ondule une fois par tour, et les défauts s'ajoutent.
 *
 * L'ONDULATION EST UNE LECTURE DÉCALÉE, et non une transposition : un trou décentré ne change pas la
 * hauteur du sillon, il change la vitesse à laquelle la pointe le parcourt. Le décalage s'intègre
 * donc, et la hauteur suit sa dérivée.
 */
export function platine(buffer: AudioBuffer, o: OptionsPlatine): AudioBuffer {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const rot = frequenceDeRotation(o.vitesse);
  const profondeur = Math.max(0, Math.min(1, o.excentricite));
  // Un pour cent de variation de vitesse à excentricité pleine : c'est l'ordre de grandeur d'un
  // disque dont le trou est décentré d'un demi-millimètre.
  const amplitude = (0.01 * profondeur * sr) / (2 * Math.PI * rot);

  const sortie = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: n, sampleRate: sr });
  const ronfle = ronflement(n, sr, { vitesse: o.vitesse, niveau: o.ronflement, graine: o.graine });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = sortie.getChannelData(c);
    const bruit = surfaceEtClics(n, sr, { surface: o.surface, clics: o.clics, graine: o.graine + c * 7 });
    for (let i = 0; i < n; i++) {
      const decalage = amplitude * Math.sin(2 * Math.PI * rot * (i / sr));
      const ou = i + decalage;
      const i0 = Math.floor(ou);
      const frac = ou - i0;
      const a = i0 >= 0 && i0 < n ? src[i0] : 0;
      const b = i0 + 1 >= 0 && i0 + 1 < n ? src[i0 + 1] : 0;
      dst[i] = a + (b - a) * frac + ronfle[i] + bruit[i];
    }
  }
  return sortie;
}
