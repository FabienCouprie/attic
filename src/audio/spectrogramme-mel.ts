// audio/spectrogramme-mel.ts — Le spectrogramme en mels d'un signal, et le signal qu'on en retire.
//
// LA CHAÎNE EST CELLE DE RIFFUSION, étape par étape : transformée à court terme sur fenêtre de
// Hann, module et non puissance, regroupement en bandes de mels sans normalisation, puis au retour
// un étalement des bandes sur les cases et Griffin-Lim pour la phase. Référence :
// `riffusion/spectrogram_converter.py` de riffusion/riffusion-hobby, sous licence MIT.
//
// TROIS ÉCARTS AVEC LA RÉFÉRENCE, ÉCRITS ICI PARCE QU'ILS SE VOIENT À LA MESURE ET NON AU CODE.
//
//   La taille de la transformée est une puissance de deux, et `mel.ts` dit pourquoi.
//
//   L'INVERSE DE L'ÉCHELLE DES MELS EST UN ÉTALEMENT, et non la descente de gradient de torchaudio.
//   `InverseMelScale` résout un système par deux cents pas de gradient stochastique ; ici chaque
//   bande rend son module aux cases que son triangle couvrait, chaque case divisant par le poids
//   total qu'elle a reçu. C'est une passe au lieu de deux cents, et l'erreur se mesure sur
//   l'aller-retour plutôt que de se supposer : voir `spectrogramme-mel.test.ts`.
//
//   GRIFFIN-LIM EST SANS INERTIE, là où la référence emploie 0,99. L'inertie demande de garder le
//   spectre complexe du tour précédent, soit cinq cent douze trames de huit mille nombres
//   complexes : quatre-vingt-dix-huit mégaoctets pour trente secondes de son, et le double pendant
//   l'échange. Le calcul écrit ici ne garde que deux signaux, vingt et un mégaoctets pour la même
//   durée, parce qu'il réanalyse trame par trame au lieu de stocker une matrice.

import { creerAleatoire } from "../core/hasard";
import { fft } from "./fft";
import { fenetreHann } from "./stft";
import {
  bancMel, casesDe, fenetreDe, sautDe, tailleTransformee,
  type BandeMel, type ParametresMel,
} from "./mel";

/**
 * Ce qui circule sur un câble « spectrogramme » : la matrice, et ce qui permet de la relire.
 *
 * LE PARAMÉTRAGE VOYAGE AVEC LA MATRICE, et c'est tout l'intérêt du type. Sans lui, chaque
 * composant d'une chaîne devrait porter les sept mêmes réglages et l'on devrait les accorder à la
 * main d'un bout à l'autre ; une seule valeur fausse quelque part et les hauteurs se déplacent sans
 * que rien ne le dise. Ici le composant qui analyse les pose une fois, et tous les suivants les
 * lisent.
 */
export interface SpectrogrammeMel {
  /** Un canal, ou deux. Chaque canal porte une trame par colonne, chaque trame une bande par ligne. */
  canaux: Float32Array[][];
  parametres: ParametresMel;
}

/** Les mêmes trames, dans un spectrogramme neuf : une opération ne modifie jamais son entrée. */
export const memeParametres = (s: SpectrogrammeMel, canaux: Float32Array[][]): SpectrogrammeMel =>
  ({ canaux, parametres: s.parametres });

/** Le nombre de bandes d'un spectrogramme, pris sur la matière plutôt que sur les réglages. */
export const bandesDe = (s: SpectrogrammeMel) => s.canaux[0]?.[0]?.length ?? 0;

/** Le nombre de trames. */
export const colonnesDe = (s: SpectrogrammeMel) => s.canaux[0]?.length ?? 0;

/**
 * La fenêtre de Hann, posée au centre d'une trame complétée de zéros.
 *
 * C'est ce que fait `torch.stft` quand la fenêtre est plus courte que la transformée, et ce
 * centrage n'est pas indifférent : décalée, la fenêtre ajouterait au spectre un terme de phase
 * linéaire en fréquence, que Griffin-Lim intégrerait ensuite comme s'il décrivait le son.
 */
export function fenetreAnalyse(p: ParametresMel): Float64Array {
  const taille = tailleTransformee(p);
  const large = Math.min(fenetreDe(p), taille);
  const fenetre = new Float64Array(taille);
  fenetre.set(fenetreHann(large), Math.floor((taille - large) / 2));
  return fenetre;
}

/** Le nombre de trames, comme `center=True` : une de plus que la division du signal par le saut. */
export const tramesDe = (longueur: number, p: ParametresMel) => 1 + Math.floor(Math.max(0, longueur) / sautDe(p));

/**
 * Le signal bordé par réflexion, sans répéter l'échantillon du bord.
 *
 * `pad_mode="reflect"` de torch : les trames sont centrées sur leur instant, donc la première
 * déborde d'une demi-transformée avant le début. Border de zéros y creuserait un fondu que
 * l'analyse prendrait pour une attaque.
 */
export function reflechir(x: Float32Array, marge: number): Float64Array {
  const n = x.length;
  const out = new Float64Array(n + 2 * marge);
  if (n === 0) return out;
  const periode = Math.max(1, 2 * (n - 1));
  for (let i = 0; i < out.length; i++) {
    const brut = i - marge;
    const j = ((brut % periode) + periode) % periode;
    out[i] = x[j < n ? j : periode - j];
  }
  return out;
}

/** Les modules d'une trame, repliés sur les bandes de mels. */
function replierSurMels(module: Float64Array, banque: readonly BandeMel[]): Float32Array {
  const mel = new Float32Array(banque.length);
  for (let m = 0; m < banque.length; m++) {
    const b = banque[m];
    let somme = 0;
    for (let i = 0; i < b.poids.length; i++) somme += b.poids[i] * module[b.debut + i];
    mel[m] = somme;
  }
  return mel;
}

/**
 * Les deux diviseurs de l'étalement : par case, et par bande.
 *
 * CELUI DES BANDES EST CELUI QU'ON OUBLIE, et son absence se mesure. Une bande rend la SOMME des
 * modules qu'elle couvre : l'étaler telle quelle sur ses cases y écrit la somme à chaque case, donc
 * multiplie par la largeur de la bande. Relevé sur un sinus : la convergence spectrale montait à
 * +3,2 dB et EMPIRAIT à chaque tour de Griffin-Lim, les modules visés étant inatteignables.
 * Divisée d'abord par son propre poids, la bande rend la moyenne, et un spectre plat se retrouve
 * plat.
 */
function diviseurs(banque: readonly BandeMel[], cases: number): { parCase: Float64Array; parBande: Float64Array } {
  const parCase = new Float64Array(cases);
  const parBande = new Float64Array(banque.length);
  for (let m = 0; m < banque.length; m++) {
    const b = banque[m];
    for (let i = 0; i < b.poids.length; i++) {
      parCase[b.debut + i] += b.poids[i];
      parBande[m] += b.poids[i];
    }
  }
  return { parCase, parBande };
}

/** Les modules d'une trame, étalés depuis ses bandes de mels. */
function etalerDepuisMels(
  mel: Float32Array, banque: readonly BandeMel[],
  d: { parCase: Float64Array; parBande: Float64Array }, module: Float64Array,
): void {
  module.fill(0);
  for (let m = 0; m < banque.length; m++) {
    const b = banque[m];
    if (mel[m] === 0 || d.parBande[m] <= 1e-9) continue;
    const v = mel[m] / d.parBande[m];
    for (let i = 0; i < b.poids.length; i++) module[b.debut + i] += b.poids[i] * v;
  }
  for (let k = 0; k < module.length; k++) {
    if (d.parCase[k] > 1e-9) module[k] /= d.parCase[k];
    else module[k] = 0;
  }
}

/** Le spectrogramme en mels d'un canal : une trame par colonne de l'image à venir. */
export function melDepuisSignal(x: Float32Array, p: ParametresMel): Float32Array[] {
  const taille = tailleTransformee(p);
  const saut = sautDe(p);
  const fenetre = fenetreAnalyse(p);
  const banque = bancMel(p, taille);
  const borde = reflechir(x, taille / 2);
  const cases = casesDe(taille);
  const re = new Float64Array(taille), im = new Float64Array(taille);
  const module = new Float64Array(cases);
  const trames: Float32Array[] = [];
  for (let t = 0; t < tramesDe(x.length, p); t++) {
    const debut = t * saut;
    im.fill(0);
    for (let i = 0; i < taille; i++) re[i] = borde[debut + i] * fenetre[i];
    fft(re, im, false);
    for (let k = 0; k < cases; k++) module[k] = Math.hypot(re[k], im[k]);
    trames.push(replierSurMels(module, banque));
  }
  return trames;
}

/** Les poids de recouvrement, somme des carrés de la fenêtre à chaque échantillon. */
function recouvrement(nTrames: number, taille: number, saut: number, fenetre: Float64Array, total: number): Float64Array {
  const norme = new Float64Array(total);
  for (let t = 0; t < nTrames; t++) {
    const debut = t * saut;
    for (let i = 0; i < taille; i++) {
      const j = debut + i;
      if (j < total) norme[j] += fenetre[i] * fenetre[i];
    }
  }
  return norme;
}

/** Une trame posée dans le signal : spectre complexe, transformée inverse, addition pondérée. */
function poserTrame(
  module: Float64Array, cos: Float64Array, sin: Float64Array, taille: number,
  re: Float64Array, im: Float64Array, sortie: Float64Array, debut: number, fenetre: Float64Array,
): void {
  const cases = casesDe(taille);
  re.fill(0); im.fill(0);
  for (let k = 0; k < cases; k++) {
    re[k] = module[k] * cos[k];
    im[k] = module[k] * sin[k];
    if (k > 0 && k < cases - 1) { re[taille - k] = re[k]; im[taille - k] = -im[k]; }
  }
  im[cases - 1] = 0;
  fft(re, im, true);
  for (let i = 0; i < taille; i++) {
    const j = debut + i;
    if (j < sortie.length) sortie[j] += re[i] * fenetre[i];
  }
}

/**
 * Le signal que rend un spectrogramme en mels, la phase estimée par Griffin-Lim.
 *
 * `iterations` à zéro rend la première synthèse, sur phase tirée au sort : c'est le bruit coloré
 * par le spectrogramme, et il s'entend comme tel. Chaque tour réanalyse ce qu'il a produit, garde
 * la phase trouvée, y remet les modules voulus, et resynthétise.
 */
export function signalDepuisMel(
  mel: readonly Float32Array[], p: ParametresMel, longueur: number,
  iterations: number, aleatoire: () => number,
): Float32Array {
  const taille = tailleTransformee(p);
  const saut = sautDe(p);
  const marge = taille / 2;
  const fenetre = fenetreAnalyse(p);
  const banque = bancMel(p, taille);
  const cases = casesDe(taille);
  const diviseur = diviseurs(banque, cases);
  const borde = longueur + 2 * marge;
  const norme = recouvrement(mel.length, taille, saut, fenetre, borde);

  const re = new Float64Array(taille), im = new Float64Array(taille);
  const module = new Float64Array(cases);
  const cos = new Float64Array(cases), sin = new Float64Array(cases);
  let y = new Float64Array(borde);

  // Première synthèse : phase tirée au sort, comme `rand_init=True` de la référence.
  for (let t = 0; t < mel.length; t++) {
    etalerDepuisMels(mel[t], banque, diviseur, module);
    for (let k = 0; k < cases; k++) {
      const phase = aleatoire() * 2 * Math.PI;
      cos[k] = Math.cos(phase); sin[k] = Math.sin(phase);
    }
    poserTrame(module, cos, sin, taille, re, im, y, t * saut, fenetre);
  }
  for (let i = 0; i < borde; i++) y[i] = norme[i] > 1e-12 ? y[i] / norme[i] : 0;

  for (let tour = 0; tour < iterations; tour++) {
    const suivant = new Float64Array(borde);
    for (let t = 0; t < mel.length; t++) {
      const debut = t * saut;
      im.fill(0);
      for (let i = 0; i < taille; i++) re[i] = (debut + i < borde ? y[debut + i] : 0) * fenetre[i];
      fft(re, im, false);
      // La phase trouvée est gardée, les modules voulus y sont remis : c'est tout Griffin-Lim.
      for (let k = 0; k < cases; k++) {
        const r = Math.hypot(re[k], im[k]);
        cos[k] = r > 1e-20 ? re[k] / r : 1;
        sin[k] = r > 1e-20 ? im[k] / r : 0;
      }
      etalerDepuisMels(mel[t], banque, diviseur, module);
      poserTrame(module, cos, sin, taille, re, im, suivant, debut, fenetre);
    }
    for (let i = 0; i < borde; i++) suivant[i] = norme[i] > 1e-12 ? suivant[i] / norme[i] : 0;
    y = suivant;
  }

  const sortie = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) sortie[i] = y[marge + i];
  return sortie;
}

/** Ce qu'il faut pour synthétiser une voie, tout entier sérialisable : un worker ne reçoit rien d'autre. */
export interface OptionsSynthese {
  parametres: ParametresMel;
  bandes: number;
  longueur: number;
  iterations: number;
  graine: number;
}

export interface Synthese {
  signal: Float32Array;
}

/**
 * Une voie, de son spectrogramme aplati à son signal : tout ce qu'un canal demande, en un appel.
 *
 * POURQUOI APLATI. Le dialogue commun des workers passe `Float32Array[]`, un tableau par canal ; un
 * spectrogramme, lui, est un tableau de trames. Les mettre bout à bout donne un seul tampon par
 * canal, que le navigateur TRANSFÈRE au lieu de le recopier, là où deux mille petits tableaux
 * auraient été sérialisés un par un.
 *
 * LA GRAINE SE DÉCALE DU NUMÉRO DE CANAL. Deux canaux partant de la même phase tirée au sort se
 * ressembleraient plus que leurs spectrogrammes ne le demandent, et une stéréo s'en trouverait
 * resserrée vers le milieu.
 */
export function synthetiserVoie(plat: Float32Array, o: OptionsSynthese, canal = 0): Synthese {
  const aleatoire = creerAleatoire(o.graine + canal);
  return {
    signal: signalDepuisMel(deplierCanal(plat, o.bandes), o.parametres, o.longueur, o.iterations, aleatoire),
  };
}

/** Un spectrogramme d'un canal, mis bout à bout pour le voyage. */
export function aplatirCanal(trames: readonly Float32Array[]): Float32Array {
  const bandes = trames[0]?.length ?? 0;
  const plat = new Float32Array(trames.length * bandes);
  for (let t = 0; t < trames.length; t++) plat.set(trames[t], t * bandes);
  return plat;
}

/** Le chemin inverse : les trames d'un canal, reprises dans ce qui a voyagé. */
export function deplierCanal(plat: Float32Array, bandes: number): Float32Array[] {
  const trames: Float32Array[] = [];
  for (let t = 0; t + bandes <= plat.length; t += bandes) trames.push(plat.subarray(t, t + bandes));
  return trames;
}

/** Ce qu'il faut pour analyser une voie : le paramétrage, et rien d'autre. */
export interface OptionsAnalyse {
  parametres: ParametresMel;
}

export interface Analyse {
  /** Les trames mises bout à bout, pour la même raison que `synthetiserVoie` les y met. */
  plat: Float32Array;
  bandes: number;
}

/**
 * Une voie, de son signal à son spectrogramme aplati.
 *
 * MESURÉ : 873 MILLISECONDES POUR CINQ SECONDES DE SON, au paramétrage par défaut. C'était tout le
 * gel qui restait une fois la synthèse sortie du fil, et c'est pourquoi l'analyse en sort aussi.
 */
export function analyserVoie(voie: Float32Array, o: OptionsAnalyse): Analyse {
  const trames = melDepuisSignal(voie, o.parametres);
  return { plat: aplatirCanal(trames), bandes: o.parametres.bandes };
}
