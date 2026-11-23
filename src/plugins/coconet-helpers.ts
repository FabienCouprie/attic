// plugins/coconet-helpers.ts — L'échantillonnage de Coconet, tiré du générateur commun.
//
// Chargé par `workers/magenta-worker.ts` : aucun import de React, de `i18n` ni de `ui/`, ce que
// `workers/graphe-imports.test.ts` vérifie pour tout ce que le worker tire derrière lui.
//
// CE QUI EST REPRIS DE MAGENTA, ET SOUS QUELLE LICENCE. La boucle ci-dessous est une copie de
// `Coconet.gibbs`, de `yaoSchedule`, de `bernoulliMask` et de `samplePredictions`
// (`@magenta/music` 1.23.1, `esm/coconet/model.js`, Copyright 2019 Google LLC, Apache-2.0). Le
// réseau, lui, n'est pas recopié : on appelle `convnet.predictFromPianoroll` du modèle chargé.
// L'algorithme est celui de Huang et al., « Counterpoint by Convolution », ISMIR 2017 : un Gibbs
// par blocs, dont la part des cases rééchantillonnées suit le calendrier de Yao, Durrett et
// Kolmogorov, max(0,1 ; (0,9 − 0,8 i/n) / 0,7). Elle dépasse un à la première itération, donc
// toutes les cases à écrire y sont tirées, puis décroît vers un septième ; le plancher de 0,1
// n'est jamais atteint pour i < n, la formule y valant au moins (0,1 + 0,8/n) / 0,7.
//
// POURQUOI UNE COPIE ET NON L'ORIGINAL, et les trois écarts sont voulus :
//   1. LES TIRAGES VIENNENT DE `creerAleatoire`. L'original appelle `tf.randomUniform` sans graine,
//      ce qui retombe sur `Math.random` : deux lancements à graine égale rendaient deux chorals.
//   2. UNE TEMPÉRATURE NULLE PREND LE PLUS PROBABLE. L'original écrit `config.temperature || 0.99`,
//      donc zéro devenait 0,99 ; et même passé, `pow(p, 1 / 0)` écrase tout à zéro et `argMax`
//      rend la première hauteur, le MIDI 36, partout.
//   3. LA MAIN EST RENDUE PAR `setTimeout`, NON PAR `tf.nextFrame`. Celui-ci attend une image de
//      l'écran par `requestAnimationFrame` quand il existe : trois fois par itération, la boucle
//      aurait été cadencée par l'affichage, et suspendue fenêtre masquée.
//
// LA GRAINE NE TIENT QUE SUR UN MÊME ARRIÈRE-PLAN. Les uniformes sont identiques à graine égale,
// mais le réseau calcule en flottants sur la carte (WebGL) ou le processeur : une différence d'un
// bit peut faire basculer une comparaison `u · masse < cumul`. L'égalité à l'octet est éprouvée
// sur une même machine ; entre deux cartes, elle n'est pas vérifiée.

import * as tf from "@tensorflow/tfjs";
import { creerAleatoire } from "../core";
import { COCONET_GRAVE, COCONET_HAUTEURS, COCONET_VOIX, SILENCE } from "../audio/coconet-grille";
import { baseDuPoint } from "./magenta-helpers";

/** Ce dont la boucle a besoin du modèle : son réseau, rien d'autre. */
export interface ReseauCoconet {
  convnet: { predictFromPianoroll(pianoroll: tf.Tensor4D, masques: tf.Tensor4D): tf.Tensor4D };
}

export interface DemandeCoconet {
  pas: number;
  /** La hauteur de chaque case (t * 4 + v), `SILENCE` si vide. */
  hauteurs: Int16Array;
  /** 1 pour une case à remplir. */
  masque: Uint8Array;
  temperature: number;
  iterations: number;
  graine: number;
}

let modele: ReseauCoconet | null = null;

/** Le modèle, chargé une fois pour la vie du worker, comme les autres points de contrôle Magenta. */
async function chargerCoconet(): Promise<ReseauCoconet> {
  if (modele) return modele;
  const { Coconet } = await import("@magenta/music/esm/coconet/model");
  const m = new Coconet(baseDuPoint("coconet_bach"));
  await m.initialize();
  modele = m as unknown as ReseauCoconet;
  return modele;
}

/** La part des cases rééchantillonnées à l'itération `i` sur `n` (calendrier de Yao). */
export const partReechantillonnee = (i: number, n: number): number =>
  Math.max(0.1, (0.9 - ((0.9 - 0.1) * i) / n) / 0.7);

/** Un tenseur [1, T, 1, 4] d'uniformes tirés du générateur, dans l'ordre (t, v). */
function uniformes(aleatoire: () => number, pas: number): tf.Tensor4D {
  const u = new Float32Array(pas * COCONET_VOIX);
  for (let i = 0; i < u.length; i++) u[i] = aleatoire();
  return tf.tensor4d(u, [1, pas, 1, COCONET_VOIX]);
}

/** La grille en rouleau de piano à une case chaude : [1, T, 46, 4]. */
function rouleau(d: DemandeCoconet): tf.Tensor4D {
  const r = new Float32Array(d.pas * COCONET_HAUTEURS * COCONET_VOIX);
  for (let t = 0; t < d.pas; t++) {
    for (let v = 0; v < COCONET_VOIX; v++) {
      const h = d.hauteurs[t * COCONET_VOIX + v];
      if (h !== SILENCE) r[(t * COCONET_HAUTEURS + (h - COCONET_GRAVE)) * COCONET_VOIX + v] = 1;
    }
  }
  return tf.tensor4d(r, [1, d.pas, COCONET_HAUTEURS, COCONET_VOIX]);
}

/** Le masque extérieur étendu aux 46 hauteurs : [1, T, 46, 4]. */
function masqueEtendu(d: DemandeCoconet): tf.Tensor4D {
  const m = new Float32Array(d.pas * COCONET_VOIX);
  for (let i = 0; i < m.length; i++) m[i] = d.masque[i];
  return tf.tidy(() => tf.tensor4d(m, [1, d.pas, 1, COCONET_VOIX]).tile([1, 1, COCONET_HAUTEURS, 1]) as tf.Tensor4D);
}

/** Une hauteur par (pas, voix), tirée selon les prédictions, ou la plus probable à T = 0. */
function tirer(predictions: tf.Tensor4D, temperature: number, aleatoire: () => number, pas: number): tf.Tensor4D {
  return tf.tidy(() => {
    let indices: tf.Tensor;
    if (temperature <= 0) {
      indices = predictions.argMax(2);
    } else {
      const p = tf.pow(predictions, tf.scalar(1 / temperature, "float32"));
      const cumul = tf.cumsum(p, 2, false, false);
      const masses = cumul.slice([0, 0, COCONET_HAUTEURS - 1, 0], [1, pas, 1, COCONET_VOIX]);
      indices = uniformes(aleatoire, pas).mul(masses).less(cumul).argMax(2);
    }
    // indices : [1, T, 4] → une case chaude sur l'axe des hauteurs.
    return tf.oneHot(indices.flatten() as tf.Tensor1D, COCONET_HAUTEURS, 1, 0)
      .reshape([1, pas, COCONET_VOIX, COCONET_HAUTEURS])
      .transpose([0, 1, 3, 2]) as tf.Tensor4D;
  });
}

/**
 * Le Gibbs par blocs, à graine. Rend la hauteur de chaque case, `SILENCE` là où rien n'est écrit.
 *
 * `reseau` EST UN PARAMÈTRE POUR ÊTRE TENU PAR UN TEST. Le vrai réseau demande le point de contrôle
 * et WebGL ; un réseau de substitution suffit à vérifier la graine, la température nulle et la
 * garde des voix reçues, qui sont tout ce que cette copie ajoute à l'original.
 */
export async function gibbsAGraine(
  reseau: ReseauCoconet,
  d: DemandeCoconet,
  avancement?: (fait: number, total: number) => void,
): Promise<Int16Array> {
  const aleatoire = creerAleatoire(d.graine);
  const exterieur = masqueEtendu(d);
  let courant = rouleau(d);
  for (let s = 0; s < d.iterations; s++) {
    const part = partReechantillonnee(s, d.iterations);
    const interieur = tf.tidy(() =>
      tf.cast(uniformes(aleatoire, d.pas).less(part), "float32").tile([1, 1, COCONET_HAUTEURS, 1]).mul(exterieur) as tf.Tensor4D);
    const predictions = tf.tidy(() => reseau.convnet.predictFromPianoroll(courant, interieur));
    const tires = tirer(predictions, d.temperature, aleatoire, d.pas);
    const suivant = tf.tidy(() => tf.where(tf.cast(interieur, "bool"), tires, courant) as tf.Tensor4D);
    tf.dispose([courant, predictions, interieur, tires]);
    courant = suivant;
    // L'ITÉRATION EST FINIE QUAND SES VALEURS SONT LISIBLES, et pas avant. Sous WebGL, chaque
    // opération ne fait qu'empiler du travail sur la carte : sans cette attente, l'avancement
    // annonçait « 32/32 » au bout de deux secondes, et le calcul durait encore soixante-quinze
    // secondes derrière la dernière lecture. Mesuré le 2026-11-22 sur 160 cases.
    await suivant.data();
    avancement?.(s + 1, d.iterations);
    await new Promise((r) => setTimeout(r, 0));
  }
  const valeurs = (await courant.data()) as Float32Array;
  tf.dispose([courant, exterieur]);
  const ecrites = new Int16Array(d.pas * COCONET_VOIX).fill(SILENCE);
  for (let t = 0; t < d.pas; t++) {
    for (let v = 0; v < COCONET_VOIX; v++) {
      for (let h = 0; h < COCONET_HAUTEURS; h++) {
        if (valeurs[(t * COCONET_HAUTEURS + h) * COCONET_VOIX + v] === 1) {
          ecrites[t * COCONET_VOIX + v] = COCONET_GRAVE + h;
          break;
        }
      }
    }
  }
  return ecrites;
}

/** Le point d'entrée du worker : charge le modèle, puis échantillonne. */
export async function harmoniserCoconet(
  d: DemandeCoconet,
  avancement?: (fait: number, total: number) => void,
): Promise<{ hauteurs: Int16Array; arrierePlan: string }> {
  const reseau = await chargerCoconet();
  const hauteurs = await gibbsAGraine(reseau, d, avancement);
  return { hauteurs, arrierePlan: tf.getBackend() };
}
