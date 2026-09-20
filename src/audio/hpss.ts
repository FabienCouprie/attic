// audio/hpss.ts — Séparer l'harmonique du percussif, par filtre médian.
//
// D'après Derry Fitzgerald, « Harmonic/Percussive Separation using Median Filtering »,
// 13e conférence internationale sur les effets audionumériques (DAFx-10), Graz, 2010.
// https://arrow.tudublin.ie/argcon/67/
//
// L'idée tient en deux phrases, et c'est ce qui la rend belle. Sur un spectrogramme, une note
// tenue est une LIGNE HORIZONTALE — même bin, beaucoup de trames — et une percussion une LIGNE
// VERTICALE — même trame, tous les bins. Un filtre médian le long du temps efface donc ce qui
// est bref et garde ce qui dure ; le même filtre le long des fréquences fait exactement
// l'inverse. Deux passages, deux masques, deux sons.
//
// CE QUE CELA APPORTE À ATTIC, qui a déjà un séparateur. Le séparateur par IA cherche des
// INSTRUMENTS — voix, batterie, basse — avec un modèle de plusieurs dizaines de mégaoctets.
// Celui-ci ne cherche rien : il sépare ce qui TIENT de ce qui CLAQUE, en quelques
// millisecondes, sans modèle, sur n'importe quelle matière. Ce sont deux outils différents, et
// le second sert là où le premier n'a rien à dire : réverbérer les tenues sans noyer les
// attaques, compresser les attaques sans pomper sur les tenues, ou simplement regarder de quoi
// un son est fait.
//
// LA PROPRIÉTÉ QU'ON TIENT À GARDER : les deux masques sont COMPLÉMENTAIRES, leur somme vaut un
// exactement. Les deux sorties rendues bout à bout redonnent donc le son de départ, échantillon
// pour échantillon — rien ne se perd et rien ne s'invente entre elles. C'est ce qu'un masque
// permet et qu'une resynthèse ne permettrait pas, et c'est testé.

import { analyseSynthese } from "./stft";

export interface ReglagesHpss {
  /** Longueur du filtre médian le long du TEMPS, en trames. Impair. */
  medianeTemps?: number;
  /** Longueur du filtre médian le long des FRÉQUENCES, en bins. Impair. */
  medianeFrequence?: number;
  /**
   * Fermeté du partage.
   *
   * Deux masques doux à la Wiener pour p = 2, qui partagent l'énergie ambiguë entre les deux
   * sorties. Au-delà, le partage se durcit ; à l'infini, il devient binaire — chaque point va
   * entièrement d'un côté, ce que Fitzgerald emploie et qui sonne plus tranché, au prix
   * d'artefacts sur la matière qui n'est franchement ni l'un ni l'autre.
   */
  fermete?: number;
}

/** Médiane d'un échantillonnage. Copie avant de trier : l'appelant garde ses données. */
export function mediane(valeurs: ArrayLike<number>): number {
  if (valeurs.length === 0) return 0;
  const t = Array.from(valeurs).sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/**
 * La même, par tri par insertion dans un tampon réutilisé.
 *
 * `mediane` alloue un tableau et appelle `sort` ; sur un spectrogramme, elle est appelée un
 * million de fois et ces deux gestes dominent tout le reste. Le tri par insertion est le plus
 * rapide sur une poignée de valeurs, et le tampon est fourni par l'appelant : aucune allocation
 * dans la boucle. La fonction publique reste, pour qui n'a qu'une médiane à prendre.
 */
function medianeRapide(tampon: Float64Array, n: number): number {
  for (let i = 1; i < n; i++) {
    const v = tampon[i];
    let j = i - 1;
    while (j >= 0 && tampon[j] > v) { tampon[j + 1] = tampon[j]; j--; }
    tampon[j + 1] = v;
  }
  const m = n >> 1;
  return n % 2 ? tampon[m] : (tampon[m - 1] + tampon[m]) / 2;
}

/** Rend une longueur impaire : un filtre médian pair n'a pas de centre. */
export const impair = (n: number) => {
  const k = Math.max(1, Math.round(n));
  return k % 2 === 1 ? k : k + 1;
};

/**
 * Filtre médian le long du TEMPS, bin par bin.
 *
 * Efface ce qui ne dure pas : une percussion, brève par définition, disparaît ; une note tenue
 * survit. Les bords sont traités par répétition de la trame extrême, faute de quoi le début et
 * la fin du morceau seraient tirés vers zéro — un fondu qu'on n'a pas demandé.
 */
export function medianeTemporelle(trames: ArrayLike<number>[], longueur: number, bins?: number): Float32Array[] {
  const L = impair(longueur), demi = (L - 1) >> 1;
  const n = trames.length;
  if (n === 0) return [];
  const largeur = bins ?? trames[0].length;
  const fenetre = new Float64Array(L);
  return trames.map((_, t) => {
    const sortie = new Float32Array(largeur);
    for (let k = 0; k < largeur; k++) {
      for (let j = 0; j < L; j++) {
        const i = Math.min(n - 1, Math.max(0, t - demi + j));
        fenetre[j] = trames[i][k];
      }
      sortie[k] = medianeRapide(fenetre, L);
    }
    return sortie;
  });
}

/**
 * Filtre médian le long des FRÉQUENCES, trame par trame.
 *
 * Efface ce qui est étroit en fréquence — une partielle — et garde ce qui est large : le bruit
 * d'une attaque, qui couvre tout le spectre d'un coup.
 */
export function medianeFrequentielle(trames: ArrayLike<number>[], longueur: number, bins?: number): Float32Array[] {
  const L = impair(longueur), demi = (L - 1) >> 1;
  const fenetre = new Float64Array(L);
  return trames.map((trame) => {
    const largeur = bins ?? trame.length;
    const sortie = new Float32Array(largeur);
    for (let k = 0; k < largeur; k++) {
      for (let j = 0; j < L; j++) {
        const i = Math.min(largeur - 1, Math.max(0, k - demi + j));
        fenetre[j] = trame[i];
      }
      sortie[k] = medianeRapide(fenetre, L);
    }
    return sortie;
  });
}

export interface MasquesHpss {
  harmonique: Float32Array[];
  percussif: Float32Array[];
}

/**
 * Les deux masques, à partir des modules du spectrogramme.
 *
 * Leur somme vaut un en tout point, y compris là où les deux médianes sont nulles — le silence
 * est alors partagé en deux moitiés, ce qui ne s'entend pas mais évite une division par zéro et
 * garde la complémentarité vraie partout.
 */
export function masquesHarmoniquePercussif(
  mods: ArrayLike<number>[], o: ReglagesHpss = {},
): MasquesHpss {
  const p = o.fermete ?? 2;
  // Les modules reçus sont un DEMI-spectre : le filtre fréquentiel ne traverse donc jamais la
  // couture entre les deux moitiés du spectre, où il mélangerait des voisins qui n'en sont pas.
  const N = mods.length > 0 ? mods[0].length : 0;
  const H = medianeTemporelle(mods, o.medianeTemps ?? 17);
  const P = medianeFrequentielle(mods, o.medianeFrequence ?? 17);
  const harmonique: Float32Array[] = [], percussif: Float32Array[] = [];
  for (let t = 0; t < mods.length; t++) {
    const mh = new Float32Array(N), mp = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const h = H[t][k], q = P[t][k];
      // Le tout ou rien d'abord, et l'égalité tranchée en faveur de l'harmonique : sans cela le
      // silence, où les deux médianes sont nulles, sortait à un demi de chaque côté — un masque
      // binaire qui ne l'est pas. Le choix est inaudible et rend la promesse vraie.
      if (!Number.isFinite(p)) { const gagne = h >= q; mh[k] = gagne ? 1 : 0; mp[k] = gagne ? 0 : 1; continue; }
      if (h === 0 && q === 0) { mh[k] = 0.5; mp[k] = 0.5; continue; }
      const a = h ** p, b = q ** p;
      mh[k] = a / (a + b);
      mp[k] = b / (a + b);
    }
    harmonique.push(mh); percussif.push(mp);
  }
  return { harmonique, percussif };
}

export interface ResultatHpss {
  harmonique: Float32Array;
  percussif: Float32Array;
  /** Part de l'énergie partie du côté percussif, de 0 à 1 : de quoi le son est fait. */
  partPercussive: number;
}

/**
 * Le spectrogramme des MODULES, demi-spectre seulement.
 *
 * Première des deux passes. On ne garde que les modules et que la moitié utile du spectre :
 * l'analyse-synthèse d'Attic prévient qu'un spectrogramme complet de cinq minutes tiendrait près
 * d'un gigaoctet, et les masques n'ont besoin de rien d'autre. En Float32, une minute de son à
 * 2048 points coûte une vingtaine de mégaoctets.
 */
export function spectrogrammeModules(x: Float32Array, taille: number): Float32Array[] {
  const moitie = taille / 2 + 1;
  const trames: Float32Array[] = [];
  // `nSorties: 0` : on ne veut que l'aller, pas le retour.
  analyseSynthese(x, taille, 0, (re, im) => {
    const m = new Float32Array(moitie);
    for (let k = 0; k < moitie; k++) m[k] = Math.hypot(re[k], im[k]);
    trames.push(m);
  });
  return trames;
}

/**
 * La chaîne entière, d'un signal aux deux signaux.
 *
 * Deux passes : la première relève les modules, la seconde applique les masques trame par
 * trame. Le spectre n'est donc jamais gardé en entier, et la seconde passe emploie
 * `analyseSynthese` exactement comme elle est prévue — plusieurs sorties d'un même signal, ce
 * que le nœud « Tresse » fait déjà avec ses brins.
 */
export function separerHarmoniquePercussif(
  signal: Float32Array, taille = 2048, o: ReglagesHpss = {},
): ResultatHpss {
  const mods = spectrogrammeModules(signal, taille);
  const { harmonique: mh, percussif: mp } = masquesHarmoniquePercussif(mods, o);
  const moitie = taille / 2 + 1;
  const [h, p] = analyseSynthese(signal, taille, 2, (re, im, sRe, sIm, t) => {
    const a = mh[t], b = mp[t];
    if (!a) return;
    for (let k = 0; k < taille; k++) {
      // Bin négatif : même masque que son miroir positif, pour un signal réel.
      const kk = k < moitie ? k : taille - k;
      sRe[0][k] = re[k] * a[kk]; sIm[0][k] = im[k] * a[kk];
      sRe[1][k] = re[k] * b[kk]; sIm[1][k] = im[k] * b[kk];
    }
  });
  let eh = 0, ep = 0;
  for (let i = 0; i < h.length; i++) { eh += h[i] * h[i]; ep += p[i] * p[i]; }
  return { harmonique: h, percussif: p, partPercussive: eh + ep > 0 ? ep / (eh + ep) : 0 };
}
