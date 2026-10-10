// audio/creneau.ts — La place que le contexte ménage à un son.
//
// D'OÙ VIENT CET EFFET. Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement :
// répertoire des effets sonores », Parenthèses, 1995 : « Occurrence d'une émission sonore au moment
// où le contexte est le plus favorable et ménage une place particulièrement adaptée à son
// expression. Les créneaux peuvent opérer sur chaque composante du son : intensité, hauteur, timbre,
// rythme. » Le répertoire en fait l'un des instruments-clés de l'action sonore.
//
// CE N'EST PAS UN TROU DE NIVEAU, et c'est tout ce qui distingue ce calcul d'un détecteur de
// silence. Un fond chargé dans le grave laisse la place à un son aigu, même s'il ne faiblit jamais ;
// un fond chargé dans l'aigu laisse la place à un son grave au même niveau. La place se cherche donc
// dans le PLAN temps-fréquence, et le son qu'on veut poser dit lui-même où regarder : son propre
// profil de bandes sert de poids. C'est la différence entre « le fond se tait » et « le fond me
// laisse passer », et un cas de ce dépôt la mesure sur deux fonds de même énergie.
//
// LE PROFIL EST NORMALISÉ, et il le faut : sans cela un son fort trouverait sa place au même endroit
// qu'un son faible de même timbre, le poids total de la somme l'emportant sur sa répartition. Ce
// qu'on cherche est la forme du son, non sa force.

import { valeurA } from "./courbe";

/** Le nombre de bandes où le plan temps-fréquence se découpe. */
export const BANDES = 12;

/** Les fréquences centrales des bandes, réparties en octaves de cinquante hertz vers l'aigu. */
export function centresDeBandes(sampleRate: number, combien = BANDES): number[] {
  const haut = Math.min(sampleRate / 2.2, 16000);
  const bas = 50;
  return Array.from({ length: combien }, (_, k) =>
    bas * Math.pow(haut / bas, k / Math.max(1, combien - 1)));
}

/**
 * Le signal passé dans le passe-bande d'une bande.
 *
 * UN BANC DE FILTRES, ET NON DES SONDES. Mesurer une bande en quelques fréquences isolées la rate :
 * une sinusoïde logée entre deux sondes ne rend presque rien sur l'une comme sur l'autre, et les
 * deux premières versions de ce calcul s'y sont prises ainsi. À douze sondes, un son de deux mille
 * quatre cents hertz rendait un profil NUL partout ; à sept sondes par bande, la bande qui le
 * contient en relevait encore moins que celle d'un son de cent vingt hertz, et la recherche
 * choisissait l'inverse de ce qu'elle devait. Un passe-bande, lui, ne peut rien rater de ce qui
 * passe entre ses bornes.
 *
 * La forme est celle de Robert Bristow-Johnson, « Cookbook formulae for audio EQ biquad filter
 * coefficients ». Sa surtension est posée pour que les bandes se rejoignent à mi-pente.
 */
function passeBande(x: Float32Array, f0: number, q: number, sr: number): Float32Array {
  const w0 = (2 * Math.PI * Math.min(f0, sr / 2.2)) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** La surtension qui fait se rejoindre deux bandes voisines, du rapport de leurs centres. */
function surtension(sampleRate: number, combien = BANDES): number {
  const centres = centresDeBandes(sampleRate, combien);
  const r = Math.sqrt(centres[1] / centres[0]);
  return 1 / (r - 1 / r);
}

/** Le banc entier : un signal filtré par bande, calculé une fois pour toutes. */
function bancDeBandes(x: Float32Array, sampleRate: number): Float32Array[] {
  const q = surtension(sampleRate);
  return centresDeBandes(sampleRate).map((f) => passeBande(x, f, q, sampleRate));
}

/** L'énergie d'une tranche d'un signal filtré. */
function energieDeTranche(x: Float32Array, debut: number, fin: number): number {
  let s = 0;
  for (let i = debut; i < Math.min(fin, x.length); i++) s += x[i] * x[i];
  return s;
}

/** La somme des canaux, ramenée à une seule voie : une place se cherche sur ce qu'on entend. */
export function enUneVoie(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const x = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) x[i] += src[i] / buffer.numberOfChannels;
  }
  return x;
}

/**
 * Le profil de bandes d'un son, normalisé à somme un.
 *
 * C'EST LUI QUI DIT OÙ REGARDER. Un son qui n'occupe que l'aigu rend un profil dont tout le poids
 * est en haut : la recherche ne comptera alors que ce que le fond pose dans l'aigu, et se moquera de
 * ce qu'il fait ailleurs.
 */
export function profilDeBandes(x: Float32Array, sampleRate: number): Float32Array {
  const brut = Float32Array.from(bancDeBandes(x, sampleRate), (b) => energieDeTranche(b, 0, b.length));
  let somme = 0;
  for (const v of brut) somme += v;
  return somme > 0 ? Float32Array.from(brut, (v) => v / somme) : new Float32Array(BANDES).fill(1 / BANDES);
}

export interface Creneau {
  /** L'instant où le son trouve sa place, en secondes. */
  instant: number;
  /** Ce que le fond occupe à cet instant, dans les bandes du son. */
  occupation: number;
  /** Ce qu'il occupe en moyenne, pour dire si la place trouvée en est vraiment une. */
  moyenne: number;
  /** Ce qu'il occupe au pire endroit, pour borner l'écart. */
  pire: number;
}

export interface OptionsCreneau {
  /** La durée d'une trame d'analyse, en secondes. */
  fenetre: number;
  /** L'instant avant lequel on ne cherche pas, en secondes. */
  auPlusTot: number;
  /** Vrai pour peser par le timbre du son, faux pour ne regarder que le niveau. */
  parLeTimbre: boolean;
}

/**
 * Le meilleur créneau : l'instant où le fond laisse le plus de place au son.
 *
 * LA RECHERCHE GLISSE LE SON ENTIER, et ne juge pas trame par trame : un son de deux secondes doit
 * trouver deux secondes de place, et le meilleur instant pour sa première trame n'est pas le
 * meilleur pour lui. On somme donc l'occupation sur toute sa durée, à chaque départ possible.
 */
export function meilleurCreneau(
  fond: Float32Array, son: Float32Array, sampleRate: number, o: OptionsCreneau,
): Creneau {
  const pas = Math.max(1, Math.round(Math.max(0.005, o.fenetre) * sampleRate));
  const poids = o.parLeTimbre
    ? profilDeBandes(son, sampleRate)
    : new Float32Array(BANDES).fill(1 / BANDES);
  // Le fond ne passe qu'UNE FOIS dans le banc, et non une fois par trame : les filtres portent leur
  // état d'une trame à la suivante, et le recommencer à chaque fenêtre poserait un transitoire au
  // début de chacune.
  const banc = bancDeBandes(fond, sampleRate);

  const trames = Math.max(1, Math.floor(fond.length / pas));
  const occupationParTrame = new Float64Array(trames);
  for (let t = 0; t < trames; t++) {
    let s = 0;
    for (let b = 0; b < banc.length; b++) {
      s += poids[b] * energieDeTranche(banc[b], t * pas, (t + 1) * pas);
    }
    occupationParTrame[t] = s;
  }

  const combien = Math.max(1, Math.ceil(son.length / pas));
  const premiere = Math.min(trames - 1, Math.max(0, Math.floor((o.auPlusTot * sampleRate) / pas)));
  const derniere = Math.max(premiere, trames - combien);

  let meilleure = premiere;
  let bas = Infinity;
  let haut = -Infinity;
  let total = 0;
  let comptees = 0;
  for (let t = premiere; t <= derniere; t++) {
    let s = 0;
    for (let k = 0; k < combien && t + k < trames; k++) s += occupationParTrame[t + k];
    if (s < bas) { bas = s; meilleure = t; }
    if (s > haut) haut = s;
    total += s;
    comptees++;
  }
  return {
    instant: (meilleure * pas) / sampleRate,
    occupation: bas,
    moyenne: comptees > 0 ? total / comptees : 0,
    pire: haut === -Infinity ? 0 : haut,
  };
}

/**
 * Le son posé dans son créneau, mêlé au fond.
 *
 * LE FOND N'EST NI COUPÉ NI BAISSÉ. L'effet décrit une place que le contexte MÉNAGE, non une place
 * qu'on lui prend : baisser le fond sous le son serait un autre geste, qui porte un autre nom.
 */
export function poserDansLeCreneau(
  fond: AudioBuffer, son: AudioBuffer, instant: number, niveau: number | Float32Array,
): AudioBuffer {
  const sr = fond.sampleRate;
  const canaux = Math.max(fond.numberOfChannels, son.numberOfChannels);
  const depart = Math.max(0, Math.round(instant * sr));
  const longueur = Math.max(fond.length, depart + son.length);
  const sortie = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: sr });
  // LA COURBE SUIT LE SON POSÉ, NON LA SORTIE, et c'est l'indice `i` qui le dit : il court sur le
  // son, pas sur le mélange. Lue sur la sortie, elle commencerait à l'instant zéro du fond, de
  // sorte que son geste ne coïnciderait pas avec le son qu'elle commande — et le décalage
  // changerait avec le créneau trouvé, qui n'est pas réglé mais cherché.
  //
  // `valeurA` rend un scalaire tel quel : un seul chemin de calcul, modulé ou non.
  const gainA = (i: number) => Math.max(0, valeurA(niveau, i));
  for (let c = 0; c < canaux; c++) {
    const dst = sortie.getChannelData(c);
    const f = fond.getChannelData(Math.min(c, fond.numberOfChannels - 1));
    for (let i = 0; i < fond.length; i++) dst[i] = f[i];
    const s = son.getChannelData(Math.min(c, son.numberOfChannels - 1));
    for (let i = 0; i < son.length; i++) dst[depart + i] += s[i] * gainA(i);
  }
  return sortie;
}
