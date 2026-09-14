// audio/tresse.ts — Le son tressé : des bandes de fréquence qui se croisent
// dessus-dessous dans l'espace stéréo.
//
// LA PROPRIÉTÉ. Une tresse est faite de brins qui échangent leurs places deux à
// deux, l'un passant DESSUS, l'autre DESSOUS. On la décrit par un mot : « 1 »
// fait passer le brin de la place 1 par-dessus celui de la place 2, « −1 » le
// fait passer dessous, « 2 » concerne les places 2 et 3, etc. Répété, un motif
// ramène chaque brin à sa place d'origine au bout d'un nombre de répétitions
// fixé par la permutation qu'il produit : son ORDRE. La natte classique à trois
// brins, « 1 −2 », revient au bout de 3 motifs. Mais la tresse elle-même ne se
// défait jamais : les places reviennent, les croisements restent.
//
// EN AUDIO. Le son est découpé en 3 ou 4 bandes — graves, médiums, aigus — et
// chaque bande est un brin, placé à une position stéréo. À chaque croisement,
// deux bandes échangent leurs positions en glissant l'une vers l'autre ; celle
// qui passe dessus monte de 3 dB au milieu du croisement, celle qui passe
// dessous descend de 6 dB. On entend le spectre se tisser dans l'espace, avec
// une période qu'on peut compter.
//
// LE DÉCOUPAGE. Des masques spectraux dont la somme vaut exactement 1 à chaque
// fréquence : sans croisement, les bandes additionnées redonnent le son
// d'origine. Les transitions s'étalent sur une demi-octave autour de chaque
// fréquence de coupure, et les coupures sont assez espacées pour que deux
// transitions ne se recouvrent jamais.

import { analyseSynthese, frequenceBin } from "./stft";

export type Croisement = { place: number; dessus: boolean };

/**
 * Lit un mot de tresse : des entiers non nuls séparés par des espaces ou des
 * virgules. `null` et la raison si le mot est invalide pour ce nombre de brins.
 */
export function lireMotTresse(texte: string, brins: number): { mot: Croisement[] } | { erreur: string } {
  const jetons = texte.split(/[\s,;]+/).filter(Boolean);
  if (jetons.length === 0) return { erreur: "vide" };
  const mot: Croisement[] = [];
  for (const j of jetons) {
    const v = Number(j.replace("−", "-"));
    if (!Number.isInteger(v) || v === 0 || Math.abs(v) > brins - 1) return { erreur: j };
    mot.push({ place: Math.abs(v) - 1, dessus: v > 0 });
  }
  return { mot };
}

/** Permutation produite par un motif : `resultat[place] = brin` après le motif, partant de l'identité. */
export function permutationMotif(mot: Croisement[], brins: number): number[] {
  const places = Array.from({ length: brins }, (_, i) => i);
  for (const { place } of mot) [places[place], places[place + 1]] = [places[place + 1], places[place]];
  return places;
}

/** Nombre de répétitions du motif au bout duquel chaque brin a retrouvé sa place. */
export function ordrePermutation(perm: number[]): number {
  const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b));
  const vu = new Array(perm.length).fill(false);
  let ordre = 1;
  for (let i = 0; i < perm.length; i++) {
    if (vu[i]) continue;
    let longueur = 0;
    for (let j = i; !vu[j]; j = perm[j]) { vu[j] = true; longueur++; }
    ordre = (ordre * longueur) / pgcd(ordre, longueur);
  }
  return ordre;
}

/** Fréquences de coupure entre bandes. Espacées de plus de deux octaves : les transitions ne se recouvrent pas. */
export const COUPURES: Record<number, number[]> = { 3: [250, 2500], 4: [180, 900, 4500] };

/** Transition de 0 à 1 sur une demi-octave centrée sur `fc`. */
function transition(f: number, fc: number): number {
  if (f <= 0) return 0;
  const u = Math.log2(f / fc);
  if (u <= -0.25) return 0;
  if (u >= 0.25) return 1;
  return 0.5 - 0.5 * Math.cos((Math.PI * (u + 0.25)) / 0.5);
}

/**
 * Masque de la bande b à la fréquence f. m_b = s_b − s_{b+1}, avec s_0 = 1 et
 * s_N = 0 : la somme se télescope et vaut exactement 1, et chaque masque reste
 * positif parce que les transitions sont ordonnées et disjointes.
 */
export function masqueBande(b: number, f: number, brins: number): number {
  const c = COUPURES[brins];
  const s = (i: number) => (i === 0 ? 1 : i === brins ? 0 : transition(f, c[i - 1]));
  return s(b) - s(b + 1);
}

export type OptionsTresse = {
  brins: 3 | 4;
  mot: Croisement[];
  repetitions: number;
  /** 0 = pas de dessus/dessous ; 1 = +3 dB dessus, −6 dB dessous au milieu du croisement. */
  relief: number;
  /** Écart maximal des positions extrêmes, 0…1. */
  largeur: number;
};

const TAILLE_TRAME = 2048;

/** Découpe un signal mono en bandes dont la somme redonne le signal. */
export function decouperEnBandes(x: Float32Array, brins: number, sampleRate: number): Float32Array[] {
  const masques: Float64Array[] = Array.from({ length: brins }, (_, b) => {
    const m = new Float64Array(TAILLE_TRAME);
    for (let k = 0; k < TAILLE_TRAME; k++) {
      // Bins négatifs : même masque que leur miroir positif, pour un signal réel.
      const kk = k <= TAILLE_TRAME / 2 ? k : TAILLE_TRAME - k;
      m[k] = masqueBande(b, frequenceBin(kk, TAILLE_TRAME, sampleRate), brins);
    }
    return m;
  });
  return analyseSynthese(x, TAILLE_TRAME, brins, (re, im, sRe, sIm) => {
    for (let b = 0; b < brins; b++) {
      const m = masques[b];
      for (let k = 0; k < TAILLE_TRAME; k++) { sRe[b][k] = re[k] * m[k]; sIm[b][k] = im[k] * m[k]; }
    }
  });
}

const lisse = (s: number) => s * s * (3 - 2 * s);

/**
 * Position (−1…1) et gain de chaque bande à l'échantillon n.
 *
 * Les croisements se partagent la durée à parts égales. Pendant le sien, chaque
 * brin concerné glisse d'une place à l'autre selon une courbe dont la vitesse
 * s'annule aux deux bouts : deux croisements successifs du même brin
 * s'enchaînent sans à-coup.
 */
export function etatBrins(n: number, longueur: number, o: OptionsTresse): { pan: number[]; gain: number[] } {
  const K = o.mot.length * Math.max(1, o.repetitions);
  const positionPlace = (p: number) => o.largeur * (-1 + (2 * p) / (o.brins - 1));
  const u = Math.min(K - 1e-9, (n / longueur) * K);
  const j = Math.floor(u);
  const s = u - j;

  // Places avant le croisement j : on rejoue les croisements précédents.
  const places = Array.from({ length: o.brins }, (_, i) => i); // places[p] = bande
  for (let c = 0; c < j; c++) {
    const { place } = o.mot[c % o.mot.length];
    [places[place], places[place + 1]] = [places[place + 1], places[place]];
  }
  const pan = new Array(o.brins).fill(0), gain = new Array(o.brins).fill(1);
  places.forEach((bande, p) => { pan[bande] = positionPlace(p); });

  const { place, dessus } = o.mot[j % o.mot.length];
  const gauche = places[place], droite = places[place + 1];
  const e = lisse(s);
  pan[gauche] = positionPlace(place) + e * (positionPlace(place + 1) - positionPlace(place));
  pan[droite] = positionPlace(place + 1) + e * (positionPlace(place) - positionPlace(place + 1));
  const bosse = Math.sin(Math.PI * s) * Math.max(0, Math.min(1, o.relief));
  const haut = 1 + (Math.SQRT2 - 1) * bosse; // +3 dB au sommet
  const bas = 1 - 0.5 * bosse; // −6 dB au creux
  gain[dessus ? gauche : droite] = haut;
  gain[dessus ? droite : gauche] = bas;
  return { pan, gain };
}

/** Mise à jour de l'état tous les BLOC échantillons : un croisement dure des centaines de millisecondes. */
const BLOC = 64;

export function tresserCanaux(entree: Float32Array[], sampleRate: number, o: OptionsTresse) {
  const longueur = entree[0].length;
  const mono = new Float32Array(longueur);
  for (const c of entree) for (let i = 0; i < longueur; i++) mono[i] += c[i] / entree.length;
  const bandes = decouperEnBandes(mono, o.brins, sampleRate);

  const L = new Float32Array(longueur), R = new Float32Array(longueur);
  const gL = new Float64Array(o.brins), gR = new Float64Array(o.brins);
  for (let n = 0; n < longueur; n++) {
    if (n % BLOC === 0) {
      const { pan, gain } = etatBrins(n, longueur, o);
      for (let b = 0; b < o.brins; b++) {
        const angle = ((pan[b] + 1) * Math.PI) / 4;
        // Au centre, cos = sin = 1/√2 : on multiplie par √2 pour qu'une bande
        // centrée garde son niveau, et que la somme sans croisement redonne le son.
        gL[b] = Math.SQRT2 * Math.cos(angle) * gain[b];
        gR[b] = Math.SQRT2 * Math.sin(angle) * gain[b];
      }
    }
    for (let b = 0; b < o.brins; b++) {
      L[n] += gL[b] * bandes[b][n];
      R[n] += gR[b] * bandes[b][n];
    }
  }
  const perm = permutationMotif(o.mot, o.brins);
  const ordre = ordrePermutation(perm);
  return { canaux: [L, R] as [Float32Array, Float32Array], ordre, revenus: o.repetitions % ordre === 0, croisements: o.mot.length * o.repetitions };
}
