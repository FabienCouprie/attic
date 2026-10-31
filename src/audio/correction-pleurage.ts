// audio/correction-pleurage.ts — Retrouver la vitesse d'une bande dans un ton de référence, et l'annuler.
//
// D'après Jamie Howarth et Patrick J. Wolfe, « Correction of Wow and Flutter Effects in Analog Tape
// Transfers », 117e convention de l'AES, 2004 ; et Simon Godsill et Peter Rayner, « Digital Audio
// Restoration », Springer, 1998.
//
// LE PRINCIPE. Un ton de fréquence fixe enregistré avec la musique, ronflement du secteur, ton pilote
// ou note tenue, a traversé le défilement avec elle. Au transfert, sa phase vaut 2π f0 τ(t), où τ est
// l'instant de l'enregistrement que le transfert rend à l'instant t. Suivre ce ton donne l'horloge de
// l'enregistrement ; relire le son selon elle annule l'écart de vitesse.
//
// LA FRÉQUENCE INSTANTANÉE, ET NON LA PHASE DÉROULÉE. Dérouler la phase rendrait τ d'un coup, mais un
// passage où la référence faiblit y fait sauter un tour entier, et tout ce qui suit glisse d'une
// période : vingt millisecondes à 50 Hz. L'écart se lit donc pas à pas, borné par l'écart admis ; un
// pas hors de la borne, ou pris sur une référence trop faible, est déclaré incertain et comblé par ses
// voisins. Un passage perdu ne coûte que lui.
//
// LA DÉMODULATION EST À PHASE NULLE. Le ton est ramené à zéro hertz par un oscillateur complexe et
// filtré par un passe-bas à réponse finie et symétrique, évalué seulement tous les D échantillons :
// l'écart mesuré tombe à l'instant où il a lieu. Un filtre récursif le retarderait, et une correction
// appliquée une milliseconde trop tard laisse 16 % d'un scintillement à 25 Hz, soit 2 sin(π·25·0,001).
//
// LES CANAUX SE COMBINENT PAR LEURS PRODUITS DÉCALÉS, et non par leur somme. Un ronflement capté en
// opposition de phase sur deux pistes s'annule dans leur somme ; le produit z(m+1)·z̄(m−1) de chaque
// canal ne porte que l'écart, commun à tous, et leur somme pèse chacun par sa puissance.
//
// LA RELECTURE suit l'horloge retrouvée par une interpolation de Hermite, qui respecte la vitesse en
// chaque point mesuré, et lit le son par le sinus cardinal fenêtré tabulé de `audio/lecture-sinc.ts`.
// Sa coupure est celle de la lecture la plus rapide, pour qu'aucune accélération ne replie l'aigu ;
// sans écart elle vaut un, et une position entière rend l'échantillon tel quel.

import { lireTabule, tableSinc } from "./lecture-sinc";

/** Cadence de la courbe d'écart rendue, en valeurs par seconde : celle des courbes du domaine. */
const CADENCE_ECART = 200;
/** La part de la bande suivie qui reste sous la référence : au-delà, le filtre deviendrait trop long. */
const BANDE_MAX = 0.6;
/** Une référence plus faible que cette part de son amplitude médiane est déclarée incertaine. */
const SEUIL_FAIBLE = 0.2;
/** Au-delà de cette part de pas incertains, la référence est déclarée introuvable. */
const PART_INTROUVABLE = 0.5;

export type ModeVitesse = "garder" | "corriger";

export interface ReglagesPleurage {
  /** La fréquence nominale du ton suivi, en hertz. */
  referenceHz: number;
  /** L'écart de vitesse le plus grand admis, en fraction : 0,03 pour 3 %. */
  ecartMax: number;
  /** Le rythme le plus rapide suivi, en hertz. */
  rythmeMaxHz: number;
  vitesseMoyenne: ModeVitesse;
}

/** Ce qu'un worker reçoit, en un seul objet sérialisable. */
export interface DemandePleurage extends ReglagesPleurage {
  canaux: Float32Array[];
  sr: number;
}

export type Raison = "corrige" | "introuvable" | "trop-court" | "hors-bande";

export interface ResultatPleurage {
  canaux: Float32Array[];
  /** L'écart autour de la vitesse moyenne, entre 0 et 1, un demi valant aucun écart. */
  ecart: Float32Array;
  raison: Raison;
  /** Écart de crête et écart efficace autour de la vitesse moyenne, en fraction. */
  creteEcart: number;
  efficaceEcart: number;
  /** La vitesse moyenne du transfert moins un : positive quand la bande défilait trop vite. */
  vitesseMoyenne: number;
  /** La part des pas où la référence était trop faible ou hors de l'écart admis. */
  partIncertaine: number;
  /** Le rythme réellement suivi, après la borne de la bande. */
  rythmeSuiviHz: number;
}

/** La géométrie du suivi : bande passante, filtre de démodulation et pas de la grille. */
export interface Suivi {
  rythmeHz: number;
  bandeHz: number;
  pas: number;
  demi: number;
  noyauRe: Float64Array;
  noyauIm: Float64Array;
}

/**
 * Le filtre de démodulation, déjà tourné vers la référence.
 *
 * LA BANDE PASSANTE vaut l'écart admis appliqué à la référence, plus le rythme suivi : c'est la
 * largeur de Carson d'un ton modulé en fréquence. LE BORD D'ARRÊT est pris sous 0,9 fois la référence,
 * où tombe le continu du signal une fois ramené à zéro hertz. LA GRILLE est au moins huit fois plus
 * dense que la bande, pour que la vitesse s'y lise sans perte, et assez pour qu'aucun repliement de la
 * décimation ne retombe dans la bande.
 */
export function suiviPour(sr: number, r: ReglagesPleurage): Suivi {
  const f0 = r.referenceHz;
  const rythmeHz = Math.max(0.5, Math.min(r.rythmeMaxHz, BANDE_MAX * f0 - r.ecartMax * f0));
  const bandeHz = r.ecartMax * f0 + rythmeHz;
  const arret = Math.min(3 * bandeHz, 0.9 * f0);
  const longueur = 2 * Math.ceil((5.5 * sr) / (arret - bandeHz) / 2) + 1;
  const demi = (longueur - 1) / 2;
  const coupure = (bandeHz + arret) / 2 / sr;
  const pas = Math.max(1, Math.floor(sr / Math.max(2 * (arret + bandeHz), 8 * bandeHz)));
  const h = new Float64Array(longueur);
  let somme = 0;
  for (let k = 0; k < longueur; k++) {
    const o = k - demi;
    const sinc = o === 0 ? 2 * coupure : Math.sin(2 * Math.PI * coupure * o) / (Math.PI * o);
    const fenetre = 0.42 + 0.5 * Math.cos((Math.PI * o) / (demi + 1)) + 0.08 * Math.cos((2 * Math.PI * o) / (demi + 1));
    h[k] = sinc * fenetre;
    somme += h[k];
  }
  const w = (2 * Math.PI * f0) / sr;
  const noyauRe = new Float64Array(longueur), noyauIm = new Float64Array(longueur);
  for (let k = 0; k < longueur; k++) {
    noyauRe[k] = (h[k] / somme) * Math.cos(-w * (k - demi));
    noyauIm[k] = (h[k] / somme) * Math.sin(-w * (k - demi));
  }
  return { rythmeHz, bandeHz, pas, demi, noyauRe, noyauIm };
}

/** Les centres de la grille : tous les `pas` échantillons, et le dernier échantillon en plus. */
export function centresDeGrille(n: number, pas: number): Float64Array {
  const m = Math.floor((n - 1) / pas);
  const fin = m * pas === n - 1 ? 0 : 1;
  const c = new Float64Array(m + 1 + fin);
  for (let i = 0; i <= m; i++) c[i] = i * pas;
  if (fin) c[m + 1] = n - 1;
  return c;
}

/**
 * Lisse la vitesse sous le rythme suivi : un Butterworth d'ordre quatre, en aller-retour.
 *
 * LA COUPURE EST AU DOUBLE DU RYTHME, ET L'ORDRE À QUATRE, parce qu'un lissage coupé au rythme même
 * ampute ce qu'il doit garder : d'ordre deux et coupé à 20 Hz, il laissait 3 % d'un scintillement à
 * 9 Hz dans le son, mesuré sur le modèle de bande. Ici, mesuré sur l'horloge, un écart planté à 20 Hz
 * perd 0,13 % de son amplitude, et un écart à 9 Hz 0,01 %.
 */
export function lisserVitesse(v: Float64Array, rythme: number, fs: number): Float64Array {
  return lisserAllerRetour(lisserAllerRetour(v, 2 * rythme, fs, 0.5412), 2 * rythme, fs, 1.3066);
}

/** Un étage de Butterworth, en aller-retour à bords réfléchis : il ne décale rien. */
function lisserAllerRetour(v: Float64Array, fc: number, fs: number, q: number): Float64Array {
  const n = v.length;
  if (n < 3 || fc >= 0.4 * fs) return v.slice();
  const w0 = (2 * Math.PI * fc) / fs, cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - alpha) / a0;
  const bord = Math.min(n - 1, Math.ceil((3 * fs) / fc));
  const e = new Float64Array(n + 2 * bord);
  for (let i = 0; i < bord; i++) e[i] = 2 * v[0] - v[bord - i];
  e.set(v, bord);
  for (let i = 0; i < bord; i++) e[bord + n + i] = 2 * v[n - 1] - v[n - 2 - i];
  const passe = (debut: number, fin: number, sens: number) => {
    let x1 = e[debut], x2 = e[debut], y1 = e[debut], y2 = e[debut];
    for (let i = debut; i !== fin; i += sens) {
      const x = e[i];
      const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; e[i] = y;
    }
  };
  passe(0, e.length, 1);
  passe(e.length - 1, -1, -1);
  return e.slice(bord, bord + n);
}

/** Le ton ramené à zéro hertz autour d'un centre, ou `null` quand sa fenêtre sort du son. */
function demoduler(x: Float32Array, centre: number, s: Suivi, w: number): [number, number] | null {
  const debut = centre - s.demi;
  if (debut < 0 || centre + s.demi >= x.length) return null;
  let re = 0, im = 0;
  for (let k = 0; k < s.noyauRe.length; k++) {
    const v = x[debut + k];
    re += s.noyauRe[k] * v;
    im += s.noyauIm[k] * v;
  }
  const c = Math.cos(-w * centre), si = Math.sin(-w * centre);
  return [re * c - im * si, re * si + im * c];
}

/**
 * Comble chaque passage incertain par la vitesse moyenne des pas sûrs qui l'entourent, `rayon` de chaque côté.
 *
 * UNE DROITE ENTRE LES DEUX VOISINS SÛRS FAUSSAIT L'HORLOGE : ces deux vitesses tombent n'importe où dans
 * le scintillement, et un trou de 0,35 s bordé de deux crêtes à +1,1 % et +1,9 % était tenu 1,5 % trop
 * vite, soit 5 ms de décalage. La moyenne alentour efface le scintillement et garde le pleurage lent.
 */
function combler(v: Float64Array, sur: Uint8Array, rayon: number): void {
  let somme = 0, compte = 0;
  for (let i = 0; i < v.length; i++) if (sur[i]) { somme += v[i]; compte++; }
  const globale = compte > 0 ? somme / compte : 1;
  for (let debut = 0; debut < v.length; debut++) {
    if (sur[debut]) continue;
    let fin = debut;
    while (fin < v.length && !sur[fin]) fin++;
    let s = 0, c = 0;
    for (let i = Math.max(0, debut - rayon); i < Math.min(v.length, fin + rayon); i++) if (sur[i]) { s += v[i]; c++; }
    v.fill(c > 0 ? s / c : globale, debut, fin);
    debut = fin;
  }
}

/** La vitesse du transfert relative à l'enregistrement, en chaque centre de la grille. */
export function vitessesDeReference(canaux: Float32Array[], sr: number, r: ReglagesPleurage, s: Suivi, centres: Float64Array) {
  const n = centres.length, w = (2 * Math.PI * r.referenceHz) / sr;
  const z = canaux.map((x) => Array.from(centres, (c) => demoduler(x, c, s, w)));
  const amplitude = new Float64Array(n);
  const dedans = new Uint8Array(n);
  for (let m = 0; m < n; m++) {
    if (z[0][m] === null) continue;
    dedans[m] = 1;
    for (const zc of z) amplitude[m] += zc[m]![0] ** 2 + zc[m]![1] ** 2;
    amplitude[m] = Math.sqrt(amplitude[m]);
  }
  const mesurees = Array.from(amplitude).filter((_, m) => dedans[m]).sort((a, b) => a - b);
  const seuil = SEUIL_FAIBLE * (mesurees[Math.floor(mesurees.length / 2)] ?? 0);
  // UNE VITESSE PAR PAS, celle de tout le pas : l'incrément de phase entre deux centres voisins, et non
  // une différence centrée sur deux pas. Celle-ci moyenne la vitesse sur 11,6 ms, et laissait 1,6 % de
  // l'écart planté dans le son ; la somme des incréments, elle, rend la phase entière, donc l'horloge.
  const v = new Float64Array(n - 1).fill(1);
  const sur = new Uint8Array(n - 1);
  let interieurs = 0, incertains = 0;
  for (let m = 0; m < n - 1; m++) {
    if (!dedans[m] || !dedans[m + 1]) continue;
    interieurs++;
    let pr = 0, pi = 0;
    for (const zc of z) {
      const [ar, ai] = zc[m + 1]!, [br, bi] = zc[m]!;
      pr += ar * br + ai * bi;
      pi += ai * br - ar * bi;
    }
    const ecartHz = (Math.atan2(pi, pr) * sr) / (2 * Math.PI * (centres[m + 1] - centres[m]));
    const faible = Math.min(amplitude[m], amplitude[m + 1]) < seuil || seuil === 0;
    if (faible || Math.abs(ecartHz) > r.ecartMax * r.referenceHz) { incertains++; continue; }
    v[m] = 1 + ecartHz / r.referenceHz;
    sur[m] = 1;
  }
  combler(v, sur, Math.ceil(sr / s.pas));
  return { v, interieurs, partIncertaine: interieurs > 0 ? incertains / interieurs : 1 };
}

/** L'instant de l'enregistrement en chaque centre : la somme des pas, chacun à sa vitesse. */
export function instantsEnregistres(v: Float64Array, centres: Float64Array): Float64Array {
  const tau = new Float64Array(centres.length);
  for (let m = 1; m < centres.length; m++) tau[m] = tau[m - 1] + (centres[m] - centres[m - 1]) * v[m - 1];
  return tau;
}

/**
 * La vitesse en chaque centre, pente de l'horloge, par une différence centrée à quatre points.
 *
 * LA MOYENNE DES DEUX PAS VOISINS NE SUFFIT PAS : elle rend la pente d'un scintillement à 9 Hz amputée
 * de 1,8 %, et la relecture, qui suit cette pente entre deux centres, laissait 1,2 % de l'écart planté
 * dans le son, mesuré sur le modèle de bande. La différence à quatre points,
 * (8 (τ₊₁ − τ₋₁) − (τ₊₂ − τ₋₂)) / 12h, n'en perd que 0,03 %, et il reste 0,07 %. Là où le pas n'est
 * pas régulier, au dernier centre, la moyenne pesée reprend.
 */
export function vitessesAuxCentres(v: Float64Array, centres: Float64Array): Float64Array {
  const n = centres.length, p = new Float64Array(n);
  p[0] = v[0];
  p[n - 1] = v[n - 2];
  for (let m = 1; m < n - 1; m++) {
    const a = centres[m] - centres[m - 1], b = centres[m + 1] - centres[m];
    const regulier = m >= 2 && m + 2 < n && a === b && centres[m + 2] - centres[m + 1] === a && centres[m - 1] - centres[m - 2] === a;
    p[m] = regulier ? (7 * (v[m - 1] + v[m]) - (v[m - 2] + v[m + 1])) / 12 : (a * v[m - 1] + b * v[m]) / (a + b);
  }
  return p;
}

/**
 * Relit chaque canal à l'horloge retrouvée : une sortie par instant entier de l'enregistrement.
 *
 * `v` porte la pente de l'horloge en chaque centre, et `vitesseMin` la plus lente des vitesses de pas :
 * c'est elle qui fait lire la source le plus vite, donc elle qui fixe la coupure.
 */
export function relire(
  canaux: Float32Array[], v: Float64Array, centres: Float64Array, tau: Float64Array, vitesseMin: number,
): Float32Array[] {
  // Le millième d'échantillon absorbe l'arrondi : une horloge sans écart finit à n − 1 en théorie, et
  // un peu dessous en flottant, ce qui retirerait le dernier échantillon.
  const longueur = Math.max(1, Math.floor(tau[tau.length - 1] + 1e-3) + 1);
  let vMin = vitesseMin;
  for (const x of v) vMin = Math.min(vMin, x);
  const noyau = tableSinc(Math.min(1, vMin));
  const sorties = canaux.map(() => new Float32Array(longueur));
  let m = 0;
  for (let k = 0; k < longueur; k++) {
    while (m < tau.length - 2 && tau[m + 1] <= k) m++;
    const d = tau[m + 1] - tau[m], u = d > 0 ? (k - tau[m]) / d : 0;
    const u2 = u * u, u3 = u2 * u;
    const t = (2 * u3 - 3 * u2 + 1) * centres[m] + (u3 - 2 * u2 + u) * (d / v[m])
      + (-2 * u3 + 3 * u2) * centres[m + 1] + (u3 - u2) * (d / v[m + 1]);
    for (let c = 0; c < canaux.length; c++) sorties[c][k] = lireTabule(canaux[c], t, noyau);
  }
  return sorties;
}

/** L'écart autour de la moyenne, à la cadence des courbes, sur la durée reçue. */
function courbeEcart(v: Float64Array, centres: Float64Array, n: number, sr: number, ecartMax: number): Float32Array {
  const points = Math.max(1, Math.round((n / sr) * CADENCE_ECART));
  const courbe = new Float32Array(points);
  let m = 0;
  for (let j = 0; j < points; j++) {
    const t = (j * sr) / CADENCE_ECART;
    while (m < centres.length - 2 && centres[m + 1] <= t) m++;
    const u = Math.min(1, Math.max(0, (t - centres[m]) / (centres[m + 1] - centres[m] || 1)));
    const ecart = v[m] + u * ((v[m + 1] ?? v[m]) - v[m]) - 1;
    courbe[j] = Math.min(1, Math.max(0, 0.5 + ecart / (2 * ecartMax)));
  }
  return courbe;
}

/** La correction entière : suivre la référence, retrouver l'horloge, relire le son. */
export function corrigerPleurage(d: DemandePleurage): ResultatPleurage {
  const n = d.canaux[0]?.length ?? 0;
  const tel = (raison: Raison, partIncertaine = 0, rythmeSuiviHz = 0): ResultatPleurage => ({
    canaux: d.canaux.map((c) => c.slice()), ecart: new Float32Array(Math.max(1, Math.round((n / d.sr) * CADENCE_ECART))).fill(0.5),
    raison, creteEcart: 0, efficaceEcart: 0, vitesseMoyenne: 0, partIncertaine, rythmeSuiviHz,
  });
  if (d.referenceHz >= 0.45 * d.sr) return tel("hors-bande");
  const s = suiviPour(d.sr, d);
  if (n <= 2 * s.demi + 2 * s.pas) return tel("trop-court", 0, s.rythmeHz);
  const centres = centresDeGrille(n, s.pas);
  const mesure = vitessesDeReference(d.canaux, d.sr, d, s, centres);
  if (mesure.partIncertaine > PART_INTROUVABLE) return tel("introuvable", mesure.partIncertaine, s.rythmeHz);
  const v = lisserVitesse(mesure.v, s.rythmeHz, d.sr / s.pas);
  const moyenne = instantsEnregistres(v, centres)[centres.length - 1] / (n - 1);
  let crete = 0, carres = 0;
  for (let m = 0; m < v.length; m++) {
    const e = v[m] / moyenne - 1;
    crete = Math.max(crete, Math.abs(e));
    carres += e * e;
  }
  const relative = Float64Array.from(v, (x) => x / moyenne);
  const horloge = d.vitesseMoyenne === "garder" ? relative : v;
  const pentes = vitessesAuxCentres(horloge, centres);
  return {
    canaux: relire(d.canaux, pentes, centres, instantsEnregistres(horloge, centres), horloge.reduce((a, b) => Math.min(a, b), 1)),
    ecart: courbeEcart(vitessesAuxCentres(relative, centres), centres, n, d.sr, d.ecartMax),
    raison: "corrige", creteEcart: crete, efficaceEcart: Math.sqrt(carres / v.length), vitesseMoyenne: moyenne - 1,
    partIncertaine: mesure.partIncertaine, rythmeSuiviHz: s.rythmeHz,
  };
}
