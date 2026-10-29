// audio/limiteur-crete-vraie.ts — Un limiteur qui voit venir les crêtes, y compris entre les échantillons.
//
// ═══ POURQUOI IL EXISTE À CÔTÉ DU LIMITEUR ═══
//
// `limiter` de `effets-mastering.ts` attaque à l'instant et ne regarde que les échantillons. Deux
// conséquences, qu'un plafond de diffusion ne tolère pas : une crête ENTRE deux échantillons passe
// au-dessus du plafond, jusqu'à 3 dB pour un sinus à fs/4 ; et le gain, qui saute d'un échantillon
// à l'autre, module le son qu'il réduit, ce qui s'entend d'abord dans le grave. Il reste tel quel :
// des graphes l'emploient, et changer leur son est une décision qui n'a pas été prise.
//
// LE BESOIN EST NÉ D'UNE MESURE, le 2026-10-28 : une chanson rendue par ACE-Step dépasse 0 dBFS de
// 0,5 dB, là où une diffusion demande −1 dBTP au plus.
//
// ═══ CE QU'IL CALCULE, DANS CET ORDRE ═══
//
// 1. LE GAIN D'ENTRÉE pousse le son vers le plafond : c'est par lui qu'on gagne en sonie.
// 2. LE GAIN REQUIS, échantillon par échantillon, est celui qui ramène sous le plafond la crête
//    vraie des deux intervalles qui le touchent, sur tous les canaux à la fois : un seul gain pour
//    tous, sans quoi l'image stéréo se déplacerait à chaque crête d'un seul côté.
// 3. L'ANTICIPATION, de longueur L : chaque gain devient le plus petit de ceux qui sont requis dans
//    les L échantillons à venir, puis la moyenne glissante des L derniers. La moyenne, à l'instant
//    d'une crête, ne porte que sur des valeurs qui l'ont toutes vue venir : elle reste sous le gain
//    que la crête requiert, et la descente prend la forme d'une rampe de L échantillons au lieu d'un
//    saut. Le calcul se fait sur le son entier déjà connu : il n'y a ni retard ni latence à rendre.
//    LE MAINTIEN prolonge cette fenêtre vers le passé : le gain reste au plus bas qu'il ait atteint
//    pendant ce temps avant de remonter. Sans lui, sur un grave, le gain remonte entre deux
//    alternances et redescend en rampe avant chacune, ce qui déforme le haut de l'onde. Relevé sur
//    une basse à 50 Hz réduite de 6 dB, relâchement de 100 ms : sans maintien, un gain ondulant de
//    0,501 à 0,516 et 0,93 % de distorsion harmonique ; dès 10 ms de maintien, un gain fixe à 0,501
//    et moins de 0,001 %. Le limiteur à attaque instantanée en rend 1,65 % dans le même cas.
// 4. LE RELÂCHEMENT remonte le gain vers l'unité à la vitesse d'un filtre du premier ordre, et ne
//    descend jamais moins vite que l'étape précédente : il ne peut donc qu'ajouter de la réduction.
// 5. LA VÉRIFICATION mesure la crête vraie de la sortie par `crete-vraie.ts`. Les étapes 2 à 4
//    garantissent le plafond aux instants des échantillons et, à très peu près, entre eux ; le gain
//    variant d'un échantillon à l'autre sous le filtre d'interpolation, un reste minime peut passer.
//    Il est alors retiré par un gain fixe, que le résultat rend pour qu'on sache s'il a servi.
//    Relevé sur un morceau masterisé de 214 s poussé de 4 et 8 dB : 0,0005 et 0,0007 dB.
//
// IL COÛTE 1,3 S POUR CES 214 S DE STÉRÉO, dont 0,44 pour l'enveloppe de crête vraie et 0,21 pour
// la vérification. La première version en coûtait 5,1, dont 3,7 pour la seule copie de l'entrée par
// `Float32Array.from` avec une fonction appelée à chaque échantillon. Le composant le fait calculer
// hors du fil de l'interface, par `workers/limiteur-crete-vraie-worker.ts` : ce module ne touche à
// aucun objet Web Audio, et c'est ce qui le rend possible.

import { creteVraie, enveloppeCreteVraie } from "./crete-vraie";

export interface ReglagesLimiteur {
  gainDb: number;
  plafondDbtp: number;
  anticipationMs: number;
  maintienMs: number;
  relachementMs: number;
}

export interface ResultatLimiteur {
  canaux: Float32Array[];
  /** La plus forte réduction appliquée, en dB, négative ou nulle. */
  reductionMaxDb: number;
  /** La crête vraie de la sortie, en dBTP. */
  creteVraieDb: number;
  /** Le gain fixe de la vérification finale, en dB : zéro quand elle n'a pas servi. */
  correctionDb: number;
}

/** Ce que le worker reçoit : les canaux, leur cadence et les réglages, en un seul objet clonable. */
export interface DemandeLimiteur extends ReglagesLimiteur {
  canaux: Float32Array[];
  sr: number;
}

/** Le même calcul sous un seul argument, la forme que `servirUneFois` et `parUneFois` transmettent. */
export function limiterDemande(d: DemandeLimiteur): ResultatLimiteur {
  return limiterCreteVraie(d.canaux, d.sr, d);
}

const versLineaire = (db: number) => Math.pow(10, db / 20);
const versDb = (v: number) => (v > 1e-9 ? 20 * Math.log10(v) : -120);

/** Pour chaque e, le plus petit de v[e − largeur + 1] à v[e] : une file monotone, en un seul passage. */
function minimumGlissant(v: Float32Array, largeur: number): Float32Array {
  const n = v.length, sortie = new Float32Array(n), file = new Int32Array(n);
  let tete = 0, queue = 0;
  for (let e = 0; e < n; e++) {
    while (queue > tete && v[file[queue - 1]] >= v[e]) queue--;
    file[queue++] = e;
    while (file[tete] <= e - largeur) tete++;
    sortie[e] = v[file[tete]];
  }
  return sortie;
}

/**
 * Le gain lissé de chaque échantillon : le plus petit gain requis de `maintien` échantillons avant à
 * `anticipation` après, puis la moyenne des `anticipation` dernières valeurs ainsi tenues.
 *
 * LE CALCUL SE PROLONGE AVANT LE DÉBUT DU SON, et c'est un défaut payé. Une première version
 * supposait un gain de un avant le premier échantillon : la moyenne d'une crête arrivée moins d'une
 * anticipation après le début portait sur des uns qui ne l'avaient pas vue, et la crête passait.
 * Relevé sur une basse à 50 Hz, première crête à 5 ms, anticipation de 10 ms : la vérification
 * finale devait rabattre tout le son de 3,7 dB. Les valeurs d'avant le début sont désormais les
 * plus petits gains qu'elles auraient vus, comme pour tout autre échantillon.
 */
function gainLisse(requis: Float32Array, anticipation: number, maintien: number): Float32Array {
  const n = requis.length, avant = anticipation - 1 + maintien;
  const etendu = new Float32Array(avant + n + anticipation - 1).fill(1);
  etendu.set(requis, avant);
  const tenu = minimumGlissant(etendu, maintien + anticipation);
  const sortie = new Float32Array(n);
  let somme = 0;
  for (let e = avant; e < avant + anticipation; e++) somme += tenu[e];
  for (let i = 0; i < n; i++) {
    sortie[i] = somme / anticipation;
    if (i + 1 < n) somme += tenu[avant + i + anticipation] - tenu[avant + i];
  }
  return sortie;
}

export function limiterCreteVraie(entree: Float32Array[], sr: number, r: ReglagesLimiteur): ResultatLimiteur {
  const n = entree[0]?.length ?? 0;
  const gainEntree = versLineaire(r.gainDb), plafond = versLineaire(r.plafondDbtp);
  // UNE BOUCLE ET NON `Float32Array.from(c, fonction)` : relevé sur 214 s de stéréo, la forme avec
  // une fonction appelée à chaque échantillon prenait 3,7 s des 5,1 que coûtait tout le limiteur.
  const canaux = entree.map((c) => {
    const copie = new Float32Array(n);
    for (let i = 0; i < n; i++) copie[i] = c[i] * gainEntree;
    return copie;
  });

  // 2. Le gain requis : chaque échantillon touche l'intervalle qui le précède et celui qui le suit.
  const env = enveloppeCreteVraie(canaux, plafond);
  const requis = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const crete = Math.max(env[i], i > 0 ? env[i - 1] : 0);
    requis[i] = crete > plafond ? plafond / crete : 1;
  }

  // 3. L'anticipation et le maintien, puis 4. le relâchement.
  const anticipation = Math.max(1, Math.round(r.anticipationMs * sr / 1000));
  const maintien = Math.max(0, Math.round(r.maintienMs * sr / 1000));
  const lisse = gainLisse(requis, anticipation, maintien);
  const k = Math.exp(-1 / Math.max(1, r.relachementMs * sr / 1000));
  let gain = 1, plusBas = 1;
  for (let i = 0; i < n; i++) {
    const cible = lisse[i];
    gain = cible < gain ? cible : gain + (cible - gain) * (1 - k);
    if (gain < plusBas) plusBas = gain;
    for (const c of canaux) c[i] *= gain;
  }

  // 5. La vérification.
  let crete = creteVraie(canaux), correctionDb = 0;
  if (crete > plafond) {
    const g = plafond / crete;
    for (const c of canaux) for (let i = 0; i < n; i++) c[i] *= g;
    correctionDb = versDb(g);
    crete = creteVraie(canaux);
  }
  return { canaux, reductionMaxDb: versDb(plusBas), creteVraieDb: versDb(crete), correctionDb };
}
