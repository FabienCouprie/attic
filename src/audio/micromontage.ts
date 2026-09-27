// audio/micromontage.ts — Un son fait de milliers de fragments posés un par un.
//
// CE QUE C'EST, ET CE QUI LE SÉPARE D'UNE GRANULATION. Curtis Roads, « Microsound » (2001), chapitre
// 6 : le micromontage assemble un son à partir de centaines ou de milliers de fragments courts,
// chacun DÉCOUPÉ à un endroit choisi et POSÉ à un instant choisi. Horacio Vaggione en est le
// praticien, de « Schall » à « Agon ». Une granulation, elle, lit une source avec une tête qui
// avance et un flux périodique ou stochastique : l'instant de prise et l'instant de pose y sont
// liés l'un à l'autre. Ici ils sont indépendants, et c'est tout l'objet.
//
// LA DIFFICULTÉ EST LE CONTRÔLE, NON LE CALCUL. Poser un fragment est une dizaine de lignes ; en
// écrire mille à la main est impossible. La partition se donne donc comme une matrice de
// paramètres, un champ par grandeur, chacun valant pour tous les fragments : un nombre seul, une
// suite, une rampe « de:à », ou un tirage « de~à ». C'est le `class-array` d'OMChroma, que
// `matrice-parametres.ts` porte déjà, et le tirage y a été ajouté pour celui-ci.
//
// TOUT EST DÉTERMINISTE À GRAINE ÉGALE. Une partition stochastique qui ne se rejouerait pas à
// l'identique ne se travaillerait pas : on l'écoute, on change un champ, on réécoute, et il faut
// que seul ce champ ait bougé.

import { mulberry32 } from "./reservoir";

/** Ce qu'un fragment porte. Les instants sont en secondes, la prise en part de la source. */
export interface Fragment {
  /** Quelle source, à partir de zéro. */
  source: number;
  /** Où le fragment est découpé, de 0 au début de la source à 1 à sa fin. */
  prise: number;
  /** Où il est posé dans le résultat, en secondes. */
  pose: number;
  /** Sa durée dans le résultat, en secondes. */
  duree: number;
  /** Son niveau, de 0 à 1. */
  nuance: number;
  /** Sa place dans l'image, de moins un à gauche à un à droite. */
  pan: number;
  /** Son écart de hauteur, en demi-tons. */
  transposition: number;
}

/**
 * Les fenêtres de Roads, nommées comme il les nomme.
 *
 * ELLES NE SONT PAS DÉCORATIVES. Un fragment de quelques millisecondes coupé net claque : la
 * fenêtre est ce qui fait qu'on entend le grain et non le couteau. La gaussienne est la référence
 * du livre ; le trapèze garde un plateau, donc du corps ; les deux exponentielles donnent une
 * attaque ou une chute, c'est-à-dire un sens au temps à l'intérieur du grain.
 */
export const FENETRES = ["gaussienne", "trapeze", "expodec", "rexpodec"] as const;
export type Fenetre = (typeof FENETRES)[number];

/** La valeur de la fenêtre à la position `t`, de zéro à un. */
export function fenetre(forme: Fenetre, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  switch (forme) {
    // Gaussienne tronquée à trois écarts-types de part et d'autre, et ramenée à zéro aux bords :
    // sans ce retrait, elle vaudrait encore un centième aux extrémités, ce qui suffit à claquer.
    case "gaussienne": {
      const x = (u - 0.5) * 6;
      const bord = Math.exp(-0.5 * 9);
      return Math.max(0, (Math.exp(-0.5 * x * x) - bord) / (1 - bord));
    }
    // Un plateau de huit dixièmes entre deux flancs d'un dixième : c'est la quasi-gaussienne du
    // livre, celle qui garde de la matière là où la gaussienne n'en laisse qu'au centre.
    case "trapeze":
      return u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1;
    // Décroissance exponentielle après une attaque brève : le grain percussif. LA QUEUE EST RETIRÉE
    // ET LA COURBE RENORMALISÉE, sans quoi elle s'arrêterait à moins cinquante-deux décibels au lieu
    // de zéro : petit, mais c'est une discontinuité à la fin de chaque grain, donc le claquement
    // même que la fenêtre existe pour éviter. La gaussienne se retire de la même façon.
    case "expodec":
      return u < 0.02 ? u / 0.02 : exponentielle((u - 0.02) / 0.98);
    // La même à l'envers : une montée, puis une coupure. Le temps y va dans l'autre sens.
    case "rexpodec":
      return u > 0.98 ? (1 - u) / 0.02 : exponentielle((0.98 - u) / 0.98);
  }
}

/** La décroissance des deux fenêtres exponentielles : un à l'origine, zéro au bout. */
function exponentielle(v: number): number {
  const queue = Math.exp(-6);
  return Math.max(0, (Math.exp(-6 * v) - queue) / (1 - queue));
}

/** Ce qu'on dit d'une partition, de quoi la juger avant de l'écouter. */
export interface RapportMicromontage {
  poses: number;
  ignores: number;
  duree: number;
  /** Fragments par seconde, en moyenne sur la durée rendue. */
  densite: number;
  /** Combien de fragments sonnent en même temps, au plus. */
  recouvrementMax: number;
  /** Combien en moyenne, sur toute la durée : c'est lui qui gouverne le niveau. */
  recouvrementMoyen: number;
  dureeMoyenneMs: number;
  /** Le facteur appliqué à la somme pour que la densité ne soit pas un second bouton de volume. */
  compensation: number;
}

/**
 * Le facteur qui empêche la densité de faire aussi office de volume.
 *
 * POURQUOI LA RACINE, ET NON LE RECOUVREMENT LUI-MÊME. Des fragments pris à des endroits différents
 * d'une source et posés à des instants tirés au sort s'additionnent sans rapport de phase : leur
 * somme croît comme la racine de leur nombre, non comme leur nombre. Diviser par le recouvrement
 * rendrait un nuage dense plus faible qu'un nuage clairsemé, ce qui est l'erreur inverse.
 *
 * ET POURQUOI IL EXISTE. Sans lui, quatre cents fragments au réglage d'origine rendent une crête à
 * **+2,9 dB**, c'est-à-dire de l'écrêtage à la lecture, et tourner le bouton de densité revient à
 * tourner un bouton de volume. Le relevé est dans l'application, sur une sinusoïde à 220 Hz.
 */
export function compensationDeDensite(recouvrementMoyen: number): number {
  return 1 / Math.sqrt(Math.max(1, recouvrementMoyen));
}

/** Le plus grand nombre de fragments qui se recouvrent, lu sur les bornes. */
export function recouvrementMaximal(fragments: readonly Fragment[]): number {
  const bornes: { t: number; d: number }[] = [];
  for (const f of fragments) {
    if (f.duree <= 0) continue;
    bornes.push({ t: f.pose, d: 1 }, { t: f.pose + f.duree, d: -1 });
  }
  // À instant égal, une fin compte avant un début : deux fragments qui se touchent sans se
  // recouvrir ne doivent pas être comptés comme simultanés.
  bornes.sort((a, b) => a.t - b.t || a.d - b.d);
  let courant = 0, pire = 0;
  for (const b of bornes) { courant += b.d; pire = Math.max(pire, courant); }
  return pire;
}

/**
 * La partition déduite des champs déjà déployés, un tableau par grandeur.
 *
 * ELLE NE TIRE RIEN ELLE-MÊME : le hasard est dans le déploiement des champs, en amont, où la graine
 * le gouverne. Cette fonction ne fait qu'assembler, ce qui la rend vérifiable à la valeur près.
 */
export function partition(champs: {
  source: readonly number[]; prise: readonly number[]; pose: readonly number[];
  duree: readonly number[]; nuance: readonly number[]; pan: readonly number[];
  transposition: readonly number[];
}, combien: number): Fragment[] {
  const lire = (t: readonly number[], i: number, defaut: number) => t[i] ?? t[t.length - 1] ?? defaut;
  return Array.from({ length: Math.max(0, Math.round(combien)) }, (_, i) => ({
    source: Math.max(0, Math.round(lire(champs.source, i, 0))),
    prise: Math.min(1, Math.max(0, lire(champs.prise, i, 0))),
    pose: Math.max(0, lire(champs.pose, i, 0)),
    duree: Math.max(0, lire(champs.duree, i, 0)),
    nuance: Math.min(1, Math.max(0, lire(champs.nuance, i, 1))),
    pan: Math.min(1, Math.max(-1, lire(champs.pan, i, 0))),
    transposition: lire(champs.transposition, i, 0),
  }));
}

/** Un générateur reproductible, pour que la même graine rende la même partition. */
export const tirage = (graine: number) => mulberry32(Math.max(1, Math.round(graine)));

/**
 * Les fragments posés, en deux voies.
 *
 * LA SORTIE EST TOUJOURS STÉRÉO, parce que chaque fragment porte sa place dans l'image : disperser
 * mille fragments et les rendre au centre reviendrait à jeter la moitié de la partition.
 *
 * LA TRANSPOSITION LIT PLUS OU MOINS DE SOURCE, elle ne change pas la durée posée. Un fragment de
 * cinquante millisecondes transposé d'une octave en lit cent dans la source et en occupe toujours
 * cinquante : c'est ce qu'on attend d'une partition, où la durée est écrite.
 *
 * LES BORNES SONT GARDÉES SANS RIEN INVENTER. Un fragment dont la lecture sortirait de la source est
 * posé jusqu'où la source va, et pas plus ; un fragment entièrement hors de la source est compté
 * ignoré plutôt que rendu en silence, de sorte que le rapport le dise.
 */
export function poserFragments(
  sources: readonly (readonly Float32Array[])[],
  fragments: readonly Fragment[],
  o: { forme: Fenetre; sampleRate: number; dureeMin?: number },
): { canaux: Float32Array[]; rapport: RapportMicromontage } {
  const sr = o.sampleRate;
  const finLaPlusLoin = fragments.reduce((m, f) => Math.max(m, f.pose + f.duree), 0);
  const duree = Math.max(o.dureeMin ?? 0, finLaPlusLoin);
  const longueur = Math.max(1, Math.ceil(duree * sr));
  const gauche = new Float32Array(longueur);
  const droite = new Float32Array(longueur);

  let poses = 0, ignores = 0, sommeDurees = 0;
  for (const f of fragments) {
    const src = sources[f.source] ?? sources[0];
    if (!src || src.length === 0 || src[0].length === 0 || f.duree <= 0 || f.nuance <= 0) {
      ignores++;
      continue;
    }
    const echantillons = Math.round(f.duree * sr);
    const depart = Math.round(f.pose * sr);
    if (echantillons <= 0 || depart >= longueur) { ignores++; continue; }
    // LE RAPPORT DE LECTURE : un demi-ton vers l'aigu lit la source un peu plus vite.
    const pas = 2 ** (f.transposition / 12);
    const debutSource = f.prise * (src[0].length - 1);
    // Puissance constante : au centre les deux voies reçoivent 0,707, et non un chacune, sans quoi
    // un fragment centré serait plus fort de trois décibels qu'un fragment à gauche.
    const angle = ((f.pan + 1) / 2) * (Math.PI / 2);
    const gG = Math.cos(angle) * f.nuance;
    const gD = Math.sin(angle) * f.nuance;
    let ecrits = 0;
    for (let j = 0; j < echantillons; j++) {
      const sortieIdx = depart + j;
      if (sortieIdx >= longueur) break;
      const lu = debutSource + j * pas;
      if (lu < 0 || lu >= src[0].length - 1) break;
      const i0 = Math.floor(lu);
      const frac = lu - i0;
      const enveloppe = fenetre(o.forme, j / echantillons);
      // Une source mono nourrit les deux voies ; une source stéréo garde ses deux voies, le
      // panoramique s'appliquant par-dessus.
      const a = src[0][i0] + (src[0][i0 + 1] - src[0][i0]) * frac;
      const b = src.length > 1
        ? src[1][i0] + (src[1][i0 + 1] - src[1][i0]) * frac
        : a;
      gauche[sortieIdx] += a * enveloppe * gG;
      droite[sortieIdx] += b * enveloppe * gD;
      ecrits++;
    }
    if (ecrits === 0) { ignores++; continue; }
    poses++;
    sommeDurees += (ecrits / sr) * 1000;
  }

  // LA COMPENSATION EST APPLIQUÉE APRÈS COUP, sur la somme : l'appliquer fragment par fragment
  // reviendrait au même, et coûterait une multiplication par échantillon au lieu d'une par sortie.
  const dureeRendue = longueur / sr;
  const recouvrementMoyen = sommeDurees / 1000 / Math.max(1e-9, dureeRendue);
  const compensation = compensationDeDensite(recouvrementMoyen);
  if (compensation !== 1) {
    for (let i = 0; i < longueur; i++) { gauche[i] *= compensation; droite[i] *= compensation; }
  }

  return {
    canaux: [gauche, droite],
    rapport: {
      poses, ignores, duree: dureeRendue,
      densite: poses / Math.max(1e-9, dureeRendue),
      recouvrementMax: recouvrementMaximal(fragments),
      recouvrementMoyen,
      dureeMoyenneMs: poses > 0 ? sommeDurees / poses : 0,
      compensation,
    },
  };
}
