// audio/atomes.ts — La poursuite adaptative : garder les N atomes les plus forts d'un son.
//
// D'après Stéphane Mallat et Zhifeng Zhang, « Matching pursuits with time-frequency dictionaries »,
// IEEE Transactions on Signal Processing 41(12), 1993 ; appliquée au son par Bob L. Sturm et
// décrite par Curtis Roads comme la « décomposition atomique » du microson.
//
// CE QUE LA MÉTHODE FAIT, ET QUI N'EXISTE NULLE PART AILLEURS DANS LE CATALOGUE. Une transformée
// de Fourier découpe le son en un nombre FIXE de cases, toutes de même durée : une seule échelle
// pour un claquement de doigts comme pour une note tenue. Ici, le son est décrit par une somme de
// grains de Gabor — des sinusoïdes sous une fenêtre — choisis UN À UN, chacun là où il explique le
// plus de signal restant, et pris dans plusieurs durées à la fois. Une attaque prend un atome
// court, une note tenue un atome long, et l'on peut s'arrêter quand on veut : c'est une esquisse
// du son, dont on règle le nombre de traits.
//
// L'INVARIANT QUI FAIT TOUTE LA MÉTHODE : CHAQUE ATOME RÉDUIT LE RÉSIDU. Comme on retire la
// projection orthogonale du résidu sur l'atome choisi, l'énergie qui reste ne peut que décroître,
// atome après atome. C'est la garantie de Mallat et Zhang, et c'est ce qu'un test vérifie pas à
// pas : si elle tombe, la mise en œuvre est fausse, quelle que soit la beauté du résultat.
//
// LA SÉLECTION PASSE PAR UNE TRANSFORMÉE, LA PROJECTION NON. Chercher le meilleur atome en
// essayant tout le dictionnaire coûterait une éternité ; une transformée par échelle donne le
// candidat en un coup d'œil. Mais son coefficient est APPROCHÉ — les fenêtres se recouvrent, et
// les atomes ne sont pas orthogonaux entre eux. La projection, elle, est calculée exactement dans
// le temps, sur les quelques milliers d'échantillons de l'atome. Prendre le coefficient de la
// transformée pour la projection ferait diverger le résidu, ce qui est le piège classique.

import { fft } from "./fft";
import { fenetreHann } from "./stft";

/** Un atome retenu : une sinusoïde sous une fenêtre, à une place et une durée données. */
export interface Atome {
  /** Longueur de la fenêtre, en échantillons. */
  echelle: number;
  /** Premier échantillon de l'atome. */
  debut: number;
  frequenceHz: number;
  /** Coefficient de projection, signe compris. */
  poids: number;
  phase: number;
}

export interface OptionsDecomposition {
  frequence: number;
  /** Nombre d'atomes à retenir. */
  atomes: number;
  /** Longueurs de fenêtre, en échantillons. Plusieurs échelles font tout l'intérêt. */
  echelles: readonly number[];
}

export interface Decomposition {
  atomes: Atome[];
  /** Le son reconstruit à partir des atomes retenus. */
  esquisse: Float32Array;
  /** Ce qui n'a pas été expliqué. */
  residu: Float32Array;
  /** Part de l'énergie d'origine que l'esquisse porte, en pour-cent. */
  partExpliqueePc: number;
  /** Rapport entre l'énergie du signal et celle du résidu, en décibels. */
  rapportSignalResiduDb: number;
}

const energie = (x: Float32Array, debut = 0, fin = x.length): number => {
  let s = 0;
  for (let i = debut; i < fin; i++) s += x[i] * x[i];
  return s;
};

/** Le nombre de trames d'une échelle, au pas d'un quart de fenêtre. */
const nombreTrames = (longueur: number, echelle: number): number =>
  Math.max(1, Math.floor((longueur - echelle) / (echelle / 4)) + 1);

/**
 * Le meilleur candidat d'une trame : la case de plus forte amplitude, sa fréquence et sa phase.
 *
 * La case zéro est écartée — c'est la composante continue, qui ne décrit aucun son — ainsi que la
 * dernière, dont la phase n'est pas définie.
 */
function meilleureCase(re: Float64Array, im: Float64Array): { bin: number; module: number; phase: number } {
  let bin = 1, meilleur = -1;
  for (let k = 1; k < re.length / 2; k++) {
    const module = re[k] * re[k] + im[k] * im[k];
    if (module > meilleur) { meilleur = module; bin = k; }
  }
  return { bin, module: Math.sqrt(meilleur), phase: Math.atan2(im[bin], re[bin]) };
}

/** Écrit l'atome dans `sortie`, et rend son énergie. */
function poserAtome(
  sortie: Float64Array, echelle: number, debut: number, omega: number, phase: number, fenetre: Float64Array,
): number {
  let norme = 0;
  for (let i = 0; i < echelle; i++) {
    const v = fenetre[i] * Math.cos(omega * i + phase);
    sortie[i] = v;
    norme += v * v;
  }
  return norme;
}

/**
 * La poursuite adaptative, atome par atome.
 *
 * LE COÛT EST BORNÉ PAR LE NOMBRE D'ATOMES, ET C'EST VOLONTAIRE. Chaque atome demande de retrouver
 * le meilleur candidat de chaque échelle, puis de recalculer les trames que l'atome retiré vient
 * de modifier — quelques dizaines de transformées. Le reste du son n'est pas retouché : c'est ce
 * qui rend la méthode tenable sur autre chose qu'une seconde de son.
 */
export function decomposer(x: Float32Array, o: OptionsDecomposition): Decomposition {
  const longueur = x.length;
  const esquisse = new Float32Array(longueur);
  const residu = Float32Array.from(x);
  const atomes: Atome[] = [];
  const energieDepart = energie(residu);
  const echelles = [...o.echelles]
    .map((e) => Math.max(16, 2 ** Math.round(Math.log2(e))))
    .filter((e) => e <= longueur);
  const voulus = Math.max(0, Math.round(o.atomes));

  if (longueur === 0 || echelles.length === 0 || energieDepart <= 0 || voulus === 0) {
    return {
      atomes, esquisse, residu,
      partExpliqueePc: 0,
      rapportSignalResiduDb: 0,
    };
  }

  // Pour chaque échelle : sa fenêtre, ses trames, et le meilleur candidat de chacune.
  const par = echelles.map((echelle) => {
    const pas = echelle / 4;
    const trames = nombreTrames(longueur, echelle);
    return {
      echelle,
      pas,
      fenetre: fenetreHann(echelle),
      candidats: new Array(trames).fill(null) as ({ bin: number; module: number; phase: number } | null)[],
      sale: new Array(trames).fill(true) as boolean[],
    };
  });

  const re = new Float64Array(Math.max(...echelles));
  const im = new Float64Array(Math.max(...echelles));
  const atome = new Float64Array(Math.max(...echelles));

  /** Recalcule les candidats marqués sales d'une échelle. */
  const rafraichir = (e: typeof par[number]) => {
    for (let t = 0; t < e.candidats.length; t++) {
      if (!e.sale[t]) continue;
      const debut = Math.round(t * e.pas);
      const vue = re.subarray(0, e.echelle);
      const vueIm = im.subarray(0, e.echelle);
      for (let i = 0; i < e.echelle; i++) {
        vue[i] = (debut + i < longueur ? residu[debut + i] : 0) * e.fenetre[i];
        vueIm[i] = 0;
      }
      fft(vue, vueIm, false);
      e.candidats[t] = meilleureCase(vue, vueIm);
      e.sale[t] = false;
    }
  };

  for (let n = 0; n < voulus; n++) {
    let meilleur: { e: typeof par[number]; trame: number; module: number } | null = null;
    for (const e of par) {
      rafraichir(e);
      for (let t = 0; t < e.candidats.length; t++) {
        const c = e.candidats[t]!;
        // Les modules de deux échelles se comparent à fenêtre égale : une fenêtre deux fois plus
        // longue accumule deux fois plus d'échantillons, et gagnerait toujours sans cette mise à
        // l'échelle. On compare donc l'amplitude, non la somme.
        const module = c.module / Math.sqrt(e.echelle);
        if (!meilleur || module > meilleur.module) meilleur = { e, trame: t, module };
      }
    }
    if (!meilleur || meilleur.module <= 0) break;

    const e = meilleur.e;
    const c = e.candidats[meilleur.trame]!;
    const debut = Math.round(meilleur.trame * e.pas);
    const omega = (2 * Math.PI * c.bin) / e.echelle;
    const vue = atome.subarray(0, e.echelle);
    const norme = poserAtome(vue, e.echelle, debut, omega, c.phase, e.fenetre);
    if (norme <= 0) break;

    // LA PROJECTION EST EXACTE, calculée dans le temps : le coefficient de la transformée n'est
    // qu'un indice, et s'en servir tel quel ferait remonter le résidu.
    let produit = 0;
    for (let i = 0; i < e.echelle && debut + i < longueur; i++) produit += residu[debut + i] * vue[i];
    const poids = produit / norme;
    if (!Number.isFinite(poids) || poids === 0) break;

    for (let i = 0; i < e.echelle && debut + i < longueur; i++) {
      residu[debut + i] -= poids * vue[i];
      esquisse[debut + i] += poids * vue[i];
    }
    atomes.push({
      echelle: e.echelle,
      debut,
      frequenceHz: (c.bin * o.frequence) / e.echelle,
      poids,
      phase: c.phase,
    });

    // Seules les trames que l'atome touche sont à recalculer, à toutes les échelles.
    const fin = debut + e.echelle;
    for (const autre of par) {
      const premiere = Math.max(0, Math.floor((debut - autre.echelle) / autre.pas));
      const derniere = Math.min(autre.candidats.length - 1, Math.floor(fin / autre.pas));
      for (let t = premiere; t <= derniere; t++) autre.sale[t] = true;
    }
  }

  const energieResidu = energie(residu);
  return {
    atomes,
    esquisse,
    residu,
    partExpliqueePc: 100 * Math.max(0, 1 - energieResidu / energieDepart),
    rapportSignalResiduDb: energieResidu > 1e-20 ? 10 * Math.log10(energieDepart / energieResidu) : 120,
  };
}

/** Les échelles proposées, en millisecondes de fenêtre. */
export const ECHELLES = [
  { id: "courte", fr: "Courtes (5 ms)", en: "Short (5 ms)", ms: [5] },
  { id: "moyenne", fr: "Moyennes (45 ms)", en: "Medium (45 ms)", ms: [45] },
  { id: "longue", fr: "Longues (185 ms)", en: "Long (185 ms)", ms: [185] },
  { id: "trois", fr: "Les trois", en: "All three", ms: [5, 45, 185] },
] as const;

export type ChoixEchelle = (typeof ECHELLES)[number]["id"];

export const EST_ECHELLE = (x: string): x is ChoixEchelle => ECHELLES.some((e) => e.id === x);

/** Les longueurs de fenêtre, en échantillons, arrondies à la puissance de deux la plus proche. */
export function echellesEnEchantillons(choix: ChoixEchelle, frequence: number): number[] {
  const e = ECHELLES.find((x) => x.id === choix) ?? ECHELLES[3];
  return e.ms.map((ms) => 2 ** Math.round(Math.log2((ms / 1000) * frequence)));
}

/** Combien d'atomes chaque échelle a retenus — de quoi juger où le son se décrit le mieux. */
export function repartition(atomes: readonly Atome[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const a of atomes) out.set(a.echelle, (out.get(a.echelle) ?? 0) + 1);
  return out;
}
