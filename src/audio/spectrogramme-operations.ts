// audio/spectrogramme-operations.ts — Ce qu'on fait à un spectrogramme en mels sans repasser par le son.
//
// POURQUOI CES OPÉRATIONS-LÀ, ET PAS LES AUTRES. La famille « Spectre » en compte déjà dix-neuf,
// qui travaillent sur la transformée linéaire et refont chacune son analyse et sa resynthèse. Les
// refaire ici n'apporterait rien. Ce qui est écrit ici est ce que l'échelle des mels rend DIFFÉRENT :
//
//   UN FLOU EN FRÉQUENCE À LARGEUR PERCEPTIVE CONSTANTE. Une bande de mels couvre d'autant plus de
//   hertz qu'elle est haute : moyenner six bandes voisines revient donc à moyenner quelques hertz
//   dans le grave et des centaines dans l'aigu. Sur une transformée linéaire, il faudrait un noyau
//   dont la largeur grandit avec la hauteur ; ici c'est un simple voisinage.
//
//   UN DÉCALAGE DES BANDES, qui n'est NI une transposition NI un décalage de fréquence. Monter de
//   douze bandes multiplie une fréquence de cent hertz par 1,53 et une de cinq mille par 1,075 :
//   en hertz l'aigu bouge beaucoup plus, en intervalle c'est le grave. Rien d'autre au catalogue ne
//   déforme ainsi.
//
// AUCUNE OPÉRATION NE MODIFIE SON ENTRÉE. Une valeur circule sur plusieurs câbles à la fois : la
// retoucher sur place ferait changer ce qu'un autre composant a déjà reçu, et le défaut ne se
// verrait que sur les graphes qui partagent une sortie.

import { memeParametres, type SpectrogrammeMel } from "./spectrogramme-mel";

/** Les poids d'une gaussienne tronquée à trois écarts-types, somme ramenée à un. */
export function noyauGaussien(ecartType: number): Float64Array {
  if (!(ecartType > 0)) return Float64Array.from([1]);
  const rayon = Math.max(1, Math.ceil(3 * ecartType));
  const n = new Float64Array(2 * rayon + 1);
  let somme = 0;
  for (let i = -rayon; i <= rayon; i++) {
    const v = Math.exp(-(i * i) / (2 * ecartType * ecartType));
    n[i + rayon] = v;
    somme += v;
  }
  for (let i = 0; i < n.length; i++) n[i] /= somme;
  return n;
}

/**
 * Une convolution à une dimension, les bords prolongés par leur dernière valeur.
 *
 * LE BORD SE PROLONGE PLUTÔT QUE DE S'ANNULER. Border de zéros creuserait un fondu aux deux
 * extrémités : au début et à la fin du son dans le sens du temps, et dans les bandes extrêmes dans
 * celui de la fréquence, où il effacerait justement le grave que l'échelle des mels étale.
 */
function convoluer(entree: Float64Array, noyau: Float64Array, sortie: Float64Array): void {
  const rayon = (noyau.length - 1) / 2;
  const n = entree.length;
  for (let i = 0; i < n; i++) {
    let somme = 0;
    for (let k = -rayon; k <= rayon; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      somme += entree[j] * noyau[k + rayon];
    }
    sortie[i] = somme;
  }
}

/**
 * Le flou, séparable : une passe dans le temps, une passe dans la fréquence.
 *
 * SÉPARABLE PARCE QUE LA GAUSSIENNE L'EST, et ce n'est pas un raccourci : deux passes à une
 * dimension donnent exactement le même résultat qu'un noyau à deux dimensions, pour un coût qui
 * croît comme la somme des rayons au lieu de leur produit.
 */
export function flouterSpectrogramme(
  s: SpectrogrammeMel, ecartTemps: number, ecartBandes: number,
): SpectrogrammeMel {
  const noyauT = noyauGaussien(ecartTemps);
  const noyauF = noyauGaussien(ecartBandes);
  if (noyauT.length === 1 && noyauF.length === 1) return s;
  const canaux = s.canaux.map((trames) => {
    const nT = trames.length, nB = trames[0]?.length ?? 0;
    const sortie = trames.map(() => new Float32Array(nB));

    if (noyauF.length > 1) {
      const col = new Float64Array(nB), res = new Float64Array(nB);
      for (let t = 0; t < nT; t++) {
        for (let b = 0; b < nB; b++) col[b] = trames[t][b];
        convoluer(col, noyauF, res);
        for (let b = 0; b < nB; b++) sortie[t][b] = res[b];
      }
    } else {
      for (let t = 0; t < nT; t++) sortie[t].set(trames[t]);
    }

    if (noyauT.length > 1) {
      const ligne = new Float64Array(nT), res = new Float64Array(nT);
      for (let b = 0; b < nB; b++) {
        for (let t = 0; t < nT; t++) ligne[t] = sortie[t][b];
        convoluer(ligne, noyauT, res);
        for (let t = 0; t < nT; t++) sortie[t][b] = res[t];
      }
    }
    return sortie;
  });
  return memeParametres(s, canaux);
}

/**
 * Les bandes déplacées de `decalage` rangs, le silence entrant par le bord.
 *
 * LE SILENCE ENTRE PAR LE BORD plutôt que le contenu ne s'enroule : un son qui remonte doit laisser
 * son grave vide, non y faire réapparaître ses aigus. Ce qui sort par l'autre bord est perdu, comme
 * un aigu poussé au-delà de la dernière bande.
 */
export function decalerBandes(s: SpectrogrammeMel, decalage: number): SpectrogrammeMel {
  const d = Math.round(decalage);
  if (d === 0) return s;
  const canaux = s.canaux.map((trames) => trames.map((trame) => {
    const nB = trame.length;
    const sortie = new Float32Array(nB);
    for (let b = 0; b < nB; b++) {
      const source = b - d;
      if (source >= 0 && source < nB) sortie[b] = trame[source];
    }
    return sortie;
  }));
  return memeParametres(s, canaux);
}
