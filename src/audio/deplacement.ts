// audio/deplacement.ts — Une ligne à retard variable, et les deux effets qui en sortent.
//
// CE QUE CES DEUX EFFETS ONT EN COMMUN, ET QUI NE SE VOIT PAS. L'effet Doppler et le magnétophone
// n'ont rien à voir l'un avec l'autre — l'un est une ambulance qui passe, l'autre une bande qui
// s'use. Ils sont pourtant le MÊME calcul : lire le signal à une distance qui change. Quand cette
// distance croît, on lit plus lentement et le son baisse ; quand elle décroît, il monte. Une
// ambulance qui approche raccourcit la distance ; un galet de magnétophone qui tourne mal
// l'allonge et la raccourcit tour à tour. Le Doppler lit sa source par l'inverse de ses instants
// d'arrivée, `emissions`, et le magnétophone par `lireAvecRetard` : deux lecteurs, pour la même idée.
//
// POURQUOI LE RETARD PLUTÔT QU'UN RAPPORT DE FRÉQUENCE. On lit souvent l'effet Doppler écrit
// comme `f' = f·c/(c−v)`, et l'on est tenté de transposer le son de ce rapport. C'est faux dès que
// la vitesse radiale change — c'est-à-dire tout le temps, puisqu'une source qui passe voit sa
// composante radiale s'inverser. Poser le retard égal au TEMPS DE PROPAGATION, et laisser le
// décalage de hauteur en sortir tout seul, donne le bon résultat sans qu'on ait à écrire la
// formule : la hauteur mesurée à l'arrivée est celle que la physique impose, y compris pendant le
// passage où elle bascule.

import { creerAleatoire } from "../core/hasard";
import { creerFenetreHann } from "./commun";
import { lireTabule, tableSinc } from "./lecture-sinc";

/**
 * Lecture à retard variable, par le sinus cardinal fenêtré tabulé de `audio/lecture-sinc.ts`.
 *
 * `retards[i]` est le retard, EN ÉCHANTILLONS, à appliquer pour produire la sortie `i`. Un retard
 * fractionnaire est la règle et non l'exception : c'est lui qui porte le changement de hauteur, et
 * l'arrondir rendrait un son granuleux au lieu d'un glissement.
 *
 * L'INTERPOLATION LINÉAIRE QUI ÉTAIT ICI AJOUTAIT UNE ERREUR QUI MONTAIT AVEC LA FRÉQUENCE. Relevé
 * contre la déformation exacte, sur un ton à 0,4 et aux réglages d'ouverture de la bande, à 44,1 kHz :
 * −54,7 dB à 1 kHz, −26,8 dB à 5 kHz, −15,1 dB à 10 kHz et −8,5 dB à 15 kHz. Le même relevé, par ce
 * noyau, donne −86,7, −89,5, −85,2 et −59,6 dB. Ce n'était pas un défaut de bande : l'erreur suivait la
 * partie fractionnaire du retard, et non l'usure d'un oxyde.
 *
 * LA COUPURE EST CELLE DE LA LECTURE LA PLUS RAPIDE, lue sur la pente des retards : un retard qui
 * décroît fait lire la source plus vite. Sans modulation, elle vaut un, et un retard entier rend la
 * source échantillon pour échantillon.
 */
export function lireAvecRetard(x: Float32Array, retards: Float32Array): Float32Array {
  let vitesseMax = 1;
  for (let i = 1; i < retards.length - 1; i++) vitesseMax = Math.max(vitesseMax, 1 - (retards[i + 1] - retards[i - 1]) / 2);
  const noyau = tableSinc(1 / vitesseMax);
  const y = new Float32Array(retards.length);
  for (let i = 0; i < retards.length; i++) y[i] = lireTabule(x, i - retards[i], noyau);
  return y;
}

// ── DOPPLER ────────────────────────────────────────────────────────────────────────────────────

export interface OptionsDoppler {
  /** Vitesse de la source, en mètres par seconde. 30 m/s valent 108 km/h. */
  vitesse: number;
  /** Distance au plus près, en mètres. Zéro ferait passer la source à travers l'auditeur. */
  distance: number;
  /** Célérité du son, en mètres par seconde. 343 à 20 °C au niveau de la mer. */
  celerite: number;
  /** Appliquer l'atténuation en 1/distance. */
  attenuer: boolean;
  frequence: number;
}

/** La distance source-auditeur à chaque instant, pour une trajectoire rectiligne. */
export function distances(n: number, o: OptionsDoppler): Float32Array {
  const d = new Float32Array(n);
  const duree = n / o.frequence;
  for (let i = 0; i < n; i++) {
    // Le passage au plus près est placé au milieu : la source arrive, passe, s'éloigne.
    const t = i / o.frequence - duree / 2;
    const x = o.vitesse * t;
    d[i] = Math.hypot(x, Math.max(0.01, o.distance));
  }
  return d;
}

/** Position latérale, entre -1 (à gauche, avant le passage) et 1 (à droite, après). */
export function lateralite(n: number, o: OptionsDoppler): Float32Array {
  const p = new Float32Array(n);
  const duree = n / o.frequence;
  for (let i = 0; i < n; i++) {
    const t = i / o.frequence - duree / 2;
    const x = o.vitesse * t;
    // L'angle vu par l'auditeur, ramené entre -1 et 1. C'est l'angle qui compte, et non la
    // distance parcourue : une source lointaine traverse le champ lentement, une source proche
    // le balaie d'un coup — et c'est bien ce qu'on entend d'une voiture qui frôle.
    p[i] = Math.atan2(x, Math.max(0.01, o.distance)) / (Math.PI / 2);
  }
  return p;
}

/**
 * Pour chaque échantillon ÉMIS, l'instant où il arrive à l'oreille — en échantillons.
 *
 * C'EST ICI QUE SE JOUE LA JUSTESSE DE L'EFFET, et le premier jet s'y est trompé. Il évaluait la
 * distance à l'instant d'ARRIVÉE, ce qui revient à faire bouger l'auditeur plutôt que la source :
 * on obtient alors `f·(1 + v/c)` au lieu de `f/(1 − v/c)`. Mesuré sur une source à 40 m/s :
 * **491,2 Hz rendus pour 498,1 attendus**, soit vingt-quatre centièmes de demi-ton — de quoi
 * s'entendre sur un son tenu, et sans excuse pour un nœud qui invoque la physique.
 *
 * La suite est CROISSANTE tant que la source est plus lente que le son, ce qui permet de
 * l'inverser d'un seul parcours.
 */
export function arrivees(n: number, d: Float32Array, o: OptionsDoppler): Float32Array {
  return Float32Array.from({ length: n }, (_, j) => j + (d[j] / o.celerite) * o.frequence);
}

/**
 * L'inverse de cette suite : pour chaque instant d'écoute, l'instant d'émission correspondant.
 *
 * Parcours unique, les deux suites étant croissantes. Hors de la plage couverte, on rend -1 :
 * rien n'a encore été émis, ou tout est déjà passé.
 */
export function emissions(arr: Float32Array, n: number): Float32Array {
  const out = new Float32Array(n).fill(-1);
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j + 1 < arr.length && arr[j + 1] <= i) j++;
    if (arr[j] > i) continue;
    // Le tout dernier instant d'arrivée n'a pas de suivant entre lequel interpoler : il vaut
    // exactement sa propre émission. Sans ce cas, le dernier échantillon émis n'était jamais
    // entendu — ce que le test a montré en rendant -1 là où l'on attendait 3.
    if (j + 1 >= arr.length) { out[i] = j; continue; }
    const ecart = arr[j + 1] - arr[j];
    out[i] = ecart > 1e-9 ? j + (i - arr[j]) / ecart : j;
  }
  return out;
}

/** Le son d'une source qui passe : deux canaux, hauteur, niveau et position compris. */
export function doppler(x: Float32Array, o: OptionsDoppler): [Float32Array, Float32Array] {
  const n = x.length;
  const d = distances(n, o);
  const lat = lateralite(n, o);
  const emis = emissions(arrivees(n, d, o), n);
  const gauche = new Float32Array(n);
  const droite = new Float32Array(n);
  const dRef = Math.max(0.01, o.distance);
  for (let i = 0; i < n; i++) {
    const p = emis[i];
    if (p < 0 || p + 1 >= n) continue;
    const j = Math.floor(p), f = p - j;
    const v = x[j] * (1 - f) + x[j + 1] * f;
    // Niveau et direction sont ceux de l'instant d'ÉMISSION : c'est là que la source était quand
    // elle a produit ce qu'on entend maintenant. Les prendre à l'arrivée ferait précéder l'image
    // sonore du son lui-même.
    const dist = d[j] * (1 - f) + d[j + 1] * f;
    const cote = lat[j] * (1 - f) + lat[j + 1] * f;
    const gain = o.attenuer ? dRef / dist : 1;
    // Panoramique à puissance constante : un son qui traverse ne doit pas faiblir au centre.
    const angle = ((cote + 1) / 2) * (Math.PI / 2);
    gauche[i] = v * gain * Math.cos(angle);
    droite[i] = v * gain * Math.sin(angle);
  }
  return [gauche, droite];
}

/** La hauteur qu'une source approchant à `vitesse` fait entendre, pour une hauteur émise `f`. */
export function hauteurApprochee(f: number, vitesse: number, celerite: number): number {
  return (f * celerite) / Math.max(1e-6, celerite - vitesse);
}

/** La hauteur d'une source qui s'éloigne. */
export function hauteurEloignee(f: number, vitesse: number, celerite: number): number {
  return (f * celerite) / (celerite + vitesse);
}

// ── MAGNÉTOPHONE ───────────────────────────────────────────────────────────────────────────────
//
// QUATRE DÉFAUTS, ET AUCUN N'EST DÉCORATIF. Le PLEURAGE vient de l'excentricité de la bobine : une
// oscillation lente, sous deux hertz, qui fait dériver la hauteur. Le SCINTILLEMENT vient du
// cabestan et des galets : la même chose, mais entre cinq et vingt hertz, et l'oreille l'entend
// comme un tremblement plutôt que comme une dérive. La SATURATION vient de l'oxyde, qui cesse de
// répondre linéairement avant de rendre les armes — d'où une compression douce des crêtes, et des
// harmoniques qui n'étaient pas là. Les DÉCROCHAGES viennent des trous dans la couche magnétique :
// le son disparaît un instant, sans prévenir.

export interface OptionsBande {
  /** Écart de hauteur du pleurage, en crête et en pour cent : 0,3 fait monter et descendre de 0,3 %. */
  pleurage: number;
  /** Fréquence du pleurage, en hertz. */
  pleurageHz: number;
  /** Écart de hauteur du scintillement, en crête et en pour cent. */
  scintillement: number;
  /** Fréquence du scintillement, en hertz. */
  scintillementHz: number;
  /** Attaque de la saturation. Zéro : aucune. */
  saturation: number;
  /** Décrochages par seconde. */
  decrochages: number;
  /** Niveau du souffle, entre 0 et 1. */
  souffle: number;
  graine: number;
  frequence: number;
}

/**
 * Le retard, en échantillons, que le pleurage et le scintillement imposent à chaque instant.
 *
 * L'ÉCART SE RÈGLE EN HAUTEUR, ET LE RETARD EN DÉCOULE. La hauteur suit la vitesse de lecture,
 * 1 − r'(t) : pour qu'elle monte et descende de a à la pulsation ω, le retard vaut −(a/ω) sin(ωt).
 * Le réglage était autrefois un pour cent d'un retard de base de 10 ms, que la pulsation multipliait :
 * « 8 % » à 0,6 Hz rendait ±0,30 % de hauteur, et « 3 % » à 9 Hz ±1,70 %, relevé sur un ton pur ; le
 * même réglage pesait quinze fois plus en scintillement qu'en pleurage, et changer le rythme changeait
 * aussi la profondeur.
 *
 * LE RETARD EST CENTRÉ SUR ZÉRO, et la lecture peut prendre de l'avance : le son entier est là, et
 * rien n'oblige à ne lire que le passé. Le retard de base qui le gardait positif décalait tout le son
 * de 10 ms, et ne suffisait plus : un pleurage de 10 % à 0,1 Hz déplace la lecture de 0,16 s.
 */
export function retardsBande(n: number, o: OptionsBande): Float32Array {
  const r = new Float32Array(n);
  const wp = 2 * Math.PI * o.pleurageHz, ws = 2 * Math.PI * o.scintillementHz;
  // Une pulsation nulle ne module rien : sans ce garde, a/ω vaudrait l'infini.
  const kp = wp > 0 ? o.pleurage / 100 / wp : 0, ks = ws > 0 ? o.scintillement / 100 / ws : 0;
  for (let i = 0; i < n; i++) {
    const t = i / o.frequence;
    r[i] = -o.frequence * (kp * Math.sin(wp * t) + ks * Math.sin(ws * t + 1.7));
  }
  return r;
}

/**
 * Saturation douce de la bande : `tanh`, normalisée pour garder le niveau.
 *
 * Sans la normalisation, monter l'attaque ferait BAISSER le son — `tanh(3x)/1` écrase les crêtes
 * et l'on croirait à un défaut. Diviser par `tanh(attaque)` rend l'unité à l'unité, si bien que le
 * réglage ne change que la forme, pas le volume.
 */
export function saturerBande(v: number, attaque: number): number {
  if (attaque <= 0) return v;
  return Math.tanh(attaque * v) / Math.tanh(attaque);
}

export function bande(x: Float32Array, o: OptionsBande): Float32Array {
  const n = x.length;
  const y = lireAvecRetard(x, retardsBande(n, o));
  const alea = creerAleatoire(o.graine);

  // Les décrochages : des creux courts, avec un fondu, sinon on entendrait des clics.
  const creux = new Float32Array(n).fill(1);
  const combien = Math.round((o.decrochages * n) / o.frequence);
  const longueur = Math.max(2, Math.round(0.02 * o.frequence));
  const forme = creerFenetreHann(longueur);
  for (let k = 0; k < combien; k++) {
    const debut = Math.floor(alea() * Math.max(1, n - longueur));
    const profondeur = 0.2 + alea() * 0.75;
    for (let i = 0; i < longueur; i++) {
      creux[debut + i] *= 1 - profondeur * forme[i];
    }
  }

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = saturerBande(y[i], o.saturation) * creux[i] + (alea() * 2 - 1) * o.souffle;
  }
  return out;
}
