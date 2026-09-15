// audio/geometrie-sonore.ts — Briques communes des nœuds géométriques.
//
// « Anneau de Möbius », « Tore », « Bouteille de Klein » et « Ceinture de Dirac »
// font tous TOURNER quelque chose : l'image stéréo, ou la phase du signal. Une
// rotation audio qui ne passe pas par zéro a besoin d'une seconde composante en
// quadrature, et d'une couture pour boucler un son qui ne se boucle pas de
// lui-même. Ce module les réunit, pour qu'aucun nœud n'en réécrive sa copie.

/**
 * Réseau de passe-tout en quadrature (coefficients d'O. Niemitalo).
 *
 * Deux chaînes de quatre cellules du second ordre dont les sorties ont le même
 * gain (1, exactement : ce sont des passe-tout) et 90° d'écart de phase. MESURÉ
 * sur sinus purs : 90° ± 0,7° de 20 Hz à 20 kHz, à 44,1 comme à 48 kHz ; en
 * dessous de 20 Hz l'écart se dégrade (73° à 10 Hz). `q` est en avance de 90° sur
 * `p`. La transformée exacte par FFT demanderait de tenir le morceau entier en
 * mémoire complexe, et son découpage en blocs créerait des raccords.
 *
 * Aucune des deux sorties n'est le signal d'origine : `p` en est une version
 * déphasée, de même spectre d'amplitude. Tout ce qu'on combine avec la sortie
 * doit donc passer par `p` aussi, sans quoi le mélange formerait un filtre en
 * peigne.
 */
const CHAINE_P = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737];
const CHAINE_Q = [0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278];

function chainePasseTout(x: Float32Array, coefs: number[]): Float64Array {
  let entree = Float64Array.from(x);
  for (const a of coefs) {
    const a2 = a * a;
    const sortie = new Float64Array(entree.length);
    for (let n = 0; n < entree.length; n++) {
      const x2 = n >= 2 ? entree[n - 2] : 0;
      const y2 = n >= 2 ? sortie[n - 2] : 0;
      sortie[n] = a2 * (entree[n] + y2) - x2;
    }
    entree = sortie;
  }
  return entree;
}

export type Quadrature = { p: Float32Array; q: Float32Array };

export function quadrature(x: Float32Array): Quadrature {
  const brutP = chainePasseTout(x, CHAINE_P);
  const q = Float32Array.from(chainePasseTout(x, CHAINE_Q));
  // La chaîne P est retardée d'un échantillon : c'est ce qui aligne les deux
  // réponses sur 90° d'écart, et non 90° plus un demi-échantillon.
  const p = new Float32Array(x.length);
  for (let n = 1; n < x.length; n++) p[n] = brutP[n - 1];
  return { p, q };
}

/**
 * Plan d'une boucle de `tours` passages cousus par fondu. Le fondu est borné au
 * quart du son : au-delà, un tour serait plus fondu que son.
 */
export function planBoucle(longueur: number, sampleRate: number, o: { tours: number; fonduSec: number }) {
  const tours = Math.max(1, Math.round(o.tours));
  const fondu = Math.max(0, Math.min(Math.floor(longueur / 4), Math.round(o.fonduSec * sampleRate)));
  // Pas d'un tour au suivant : le tour suivant démarre `fondu` échantillons
  // avant la fin du précédent.
  const pas = longueur - fondu;
  const total = tours * pas + fondu;
  return { tours, fondu, pas, total, dureeSec: total / sampleRate };
}

/**
 * Le son répété `tours` fois, chaque couture en fondu enchaîné à puissance
 * constante. Les cosinus/sinus gardent l'énergie stable pendant le fondu, là où
 * un fondu linéaire creuserait le niveau au milieu sur un son non corrélé.
 */
export function bouclerAvecFondu(x: Float32Array, tours: number, fondu: number): Float32Array {
  const pas = x.length - fondu;
  const sortie = new Float32Array(tours * pas + fondu);
  for (let k = 0; k < tours; k++) {
    const debut = k * pas;
    for (let i = 0; i < x.length; i++) {
      let g = 1;
      if (fondu > 0) {
        if (k > 0 && i < fondu) g = Math.sin((Math.PI / 2) * (i + 0.5) / fondu);
        else if (k < tours - 1 && i >= pas) g = Math.cos((Math.PI / 2) * (i - pas + 0.5) / fondu);
      }
      sortie[debut + i] += g * x[i];
    }
  }
  return sortie;
}

/**
 * Des passages DIFFÉRENTS enchaînés, chaque couture en fondu à puissance
 * constante. Tous les segments ont la même longueur.
 */
export function enchainerAvecFondu(segments: Float32Array[], fondu: number): Float32Array {
  const longueur = segments[0].length;
  const pas = longueur - fondu;
  const sortie = new Float32Array(segments.length * pas + fondu);
  segments.forEach((x, k) => {
    for (let i = 0; i < longueur; i++) {
      let g = 1;
      if (fondu > 0) {
        if (k > 0 && i < fondu) g = Math.sin((Math.PI / 2) * (i + 0.5) / fondu);
        else if (k < segments.length - 1 && i >= pas) g = Math.cos((Math.PI / 2) * (i - pas + 0.5) / fondu);
      }
      sortie[k * pas + i] += g * x[i];
    }
  });
  return sortie;
}

export const rms = (a: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
};

/** Une entrée sans écart gauche/droite ne peut pas pivoter : on la pose sur un bord. */
const SEUIL_SANS_LARGEUR = 1e-3;

/**
 * Mid/Side d'une entrée. Un son centré — mono, ou stéréo aux deux canaux
 * identiques — n'a pas d'écart gauche/droite : S est nul et le faire tourner ne
 * produirait rien. Il est alors posé sur le bord gauche (S = M), d'où il pourra
 * voyager.
 */
export function versMidSide(entree: Float32Array[]): { mid: Float32Array; side: Float32Array; poseeSurLeBord: boolean } {
  const longueur = entree[0].length;
  const gauche = entree[0];
  const droite = entree.length > 1 ? entree[1] : new Float32Array(longueur);
  const mid = new Float32Array(longueur), side = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) {
    mid[i] = (gauche[i] + droite[i]) / 2;
    side[i] = (gauche[i] - droite[i]) / 2;
  }
  const poseeSurLeBord = entree.length === 1 || rms(side) < SEUIL_SANS_LARGEUR * Math.max(rms(mid), 1e-12);
  if (poseeSurLeBord) side.set(mid);
  return { mid, side, poseeSurLeBord };
}

/**
 * Fait tourner la phase du Mid d'un angle et celle du Side d'un autre, puis
 * repasse en gauche/droite.
 *
 * L'angle du Side moins celui du Mid décide de la POSITION stéréo : à π,
 * gauche et droite sont échangées. L'angle du Mid seul fait tourner la phase de
 * tout le son — un décalage de fréquence lent, qui ne s'entend que mélangé à
 * l'original. `melange` dose entre la version non tournée (0) et tournée (1) ;
 * la version non tournée passe elle aussi par `p`, pour ne pas former de peigne.
 */
export function tournerMidSide(
  mid: Quadrature, side: Quadrature,
  angleMid: ((n: number) => number) | null,
  angleSide: (n: number) => number,
  melange: number,
): [Float32Array, Float32Array] {
  const total = mid.p.length;
  const m = Math.max(0, Math.min(1, melange));
  const L = new Float32Array(total), R = new Float32Array(total);
  for (let n = 0; n < total; n++) {
    let M = mid.p[n];
    if (angleMid) {
      const a = angleMid(n);
      M = (1 - m) * M + m * (mid.p[n] * Math.cos(a) + mid.q[n] * Math.sin(a));
    }
    const b = angleSide(n);
    const S = (1 - m) * side.p[n] + m * (side.p[n] * Math.cos(b) + side.q[n] * Math.sin(b));
    L[n] = M + S;
    R[n] = M - S;
  }
  return [L, R];
}

/** Fait tourner la phase d'un signal : x·cos θ + x̂·sin θ, soit −x à θ = π. */
export function tournerPhase(x: Quadrature, angle: (n: number) => number, melange: number): Float32Array {
  const m = Math.max(0, Math.min(1, melange));
  const y = new Float32Array(x.p.length);
  for (let n = 0; n < y.length; n++) {
    const a = angle(n);
    y[n] = (1 - m) * x.p[n] + m * (x.p[n] * Math.cos(a) + x.q[n] * Math.sin(a));
  }
  return y;
}

/** Au-delà, la sortie tiendrait plusieurs Go en mémoire. */
export const DUREE_SORTIE_MAX_SEC = 20 * 60;

export function versAudioBuffer(canaux: Float32Array[], sampleRate: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux.length, length: canaux[0].length, sampleRate });
  canaux.forEach((c, i) => b.getChannelData(i).set(c));
  return b;
}

export const canauxDe = (buffer: AudioBuffer) =>
  Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
