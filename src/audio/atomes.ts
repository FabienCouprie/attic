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
import type { Note } from "./note";

/** Un atome retenu : une sinusoïde sous une fenêtre, à une place et une durée données. */
export interface Atome {
  /** Longueur de la fenêtre, en échantillons. */
  echelle: number;
  /** Premier échantillon de l'atome. */
  debut: number;
  /** La fréquence au DÉBUT de l'atome. Elle n'en est la fréquence entière que si la dérive est nulle. */
  frequenceHz: number;
  /** Coefficient de projection, signe compris. */
  poids: number;
  phase: number;
  /**
   * La dérive de fréquence, en hertz par seconde. Zéro pour un atome de Gabor.
   *
   * C'EST CE QUI FAIT D'UN ATOME UN CHIRPLET, d'après Steve Mann et Simon Haykin, « The chirplet
   * transform : a generalization of Gabor's logon transform », Vision Interface, 1991. Un atome de
   * Gabor tient une fréquence fixe pendant toute sa fenêtre ; un glissando n'en est donc jamais
   * fait d'un seul, mais d'un escalier de petits atomes constants qui l'approchent par paliers.
   * Une dérive le décrit d'un seul atome.
   */
  derive: number;
}

export interface OptionsDecomposition {
  frequence: number;
  /** Nombre d'atomes à retenir. */
  atomes: number;
  /** Longueurs de fenêtre, en échantillons. Plusieurs échelles font tout l'intérêt. */
  echelles: readonly number[];
  /**
   * Les dérives candidates, en hertz par seconde. Par défaut la seule dérive nulle, qui redonne
   * exactement le dictionnaire de Gabor.
   *
   * LE DICTIONNAIRE EST MULTIPLIÉ PAR LEUR NOMBRE, et c'est le prix du chirplet : pour chaque
   * dérive il faut DÉCHIRPER la trame, c'est-à-dire la multiplier par la conjuguée de la dérive,
   * avant de la transformer. Une dérive candidate est donc une transformée de plus par trame et
   * par échelle.
   */
  derives?: readonly number[];
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

/**
 * Écrit l'atome dans `sortie`, et rend son énergie.
 *
 * `beta` est la dérive en radians par échantillon au carré : la phase y gagne un terme en i²,
 * donc la fréquence instantanée un terme linéaire. À zéro, l'atome est celui de Gabor, et le
 * calcul est rigoureusement celui d'avant.
 */
function poserAtome(
  sortie: Float64Array, echelle: number, debut: number, omega: number, phase: number,
  fenetre: Float64Array, beta = 0,
): number {
  let norme = 0;
  for (let i = 0; i < echelle; i++) {
    const v = fenetre[i] * Math.cos(omega * i + (beta / 2) * i * i + phase);
    sortie[i] = v;
    norme += v * v;
  }
  return norme;
}

/**
 * La dérive en hertz par seconde, convertie en radians par échantillon au carré.
 *
 * La fréquence instantanée d'un atome vaut `(omega + beta·i) / 2π · fs`. Pour qu'elle monte de
 * `d` hertz en une seconde, soit en `fs` échantillons, il faut `beta·fs / 2π · fs = d`.
 */
const betaDeDerive = (deriveHzParS: number, frequence: number) =>
  (2 * Math.PI * deriveHzParS) / (frequence * frequence);

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

  // LES DÉRIVES CANDIDATES, ramenées en radians par échantillon au carré une fois pour toutes.
  // La dérive nulle est toujours là : sans elle, un son tenu n'aurait aucun atome qui lui aille.
  const derivesHz = [...new Set([0, ...(o.derives ?? [])])].sort((a, b) => a - b);
  const betas = derivesHz.map((d) => betaDeDerive(d, o.frequence));

  // Pour chaque échelle : sa fenêtre, ses trames, et le meilleur candidat de chacune.
  const par = echelles.map((echelle) => {
    const pas = echelle / 4;
    const trames = nombreTrames(longueur, echelle);
    return {
      echelle,
      pas,
      fenetre: fenetreHann(echelle),
      candidats: new Array(trames).fill(null) as ({ bin: number; module: number; phase: number; rang: number } | null)[],
      sale: new Array(trames).fill(true) as boolean[],
    };
  });

  const re = new Float64Array(Math.max(...echelles));
  const im = new Float64Array(Math.max(...echelles));
  const atome = new Float64Array(Math.max(...echelles));

  /**
   * Recalcule les candidats marqués sales d'une échelle, en essayant chaque dérive.
   *
   * LE DÉCHIRPAGE EST LA SEULE FAÇON DE CHERCHER UNE DÉRIVE PAR UNE TRANSFORMÉE. Une transformée
   * ne sait voir que des fréquences fixes ; on multiplie donc la trame par la conjuguée de la
   * dérive essayée, ce qui redresse un glissando de cette pente en une raie unique, puis on
   * cherche la raie comme avant. À dérive nulle la partie imaginaire reste nulle et le calcul est
   * exactement celui du dictionnaire de Gabor.
   */
  const rafraichir = (e: typeof par[number]) => {
    for (let t = 0; t < e.candidats.length; t++) {
      if (!e.sale[t]) continue;
      const debut = Math.round(t * e.pas);
      const vue = re.subarray(0, e.echelle);
      const vueIm = im.subarray(0, e.echelle);
      let meilleur: { bin: number; module: number; phase: number; rang: number } | null = null;
      for (let r = 0; r < betas.length; r++) {
        const beta = betas[r];
        for (let i = 0; i < e.echelle; i++) {
          const v = (debut + i < longueur ? residu[debut + i] : 0) * e.fenetre[i];
          if (beta === 0) { vue[i] = v; vueIm[i] = 0; continue; }
          const a = -(beta / 2) * i * i;
          vue[i] = v * Math.cos(a);
          vueIm[i] = v * Math.sin(a);
        }
        fft(vue, vueIm, false);
        const c = meilleureCase(vue, vueIm);
        if (!meilleur || c.module > meilleur.module) meilleur = { ...c, rang: r };
      }
      e.candidats[t] = meilleur;
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
    const beta = betas[c.rang];
    const vue = atome.subarray(0, e.echelle);
    const norme = poserAtome(vue, e.echelle, debut, omega, c.phase, e.fenetre, beta);
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
      derive: derivesHz[c.rang],
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

/**
 * Les atomes rendus comme des notes datées.
 *
 * POURQUOI CETTE CONVERSION EXISTE. Relevé en cherchant ce qui va d'un son vers une séquence :
 * AUCUN COMPOSANT DU CATALOGUE NE LE FAISAIT. Or un atome porte déjà tout ce qu'une note demande,
 * un instant, une durée, une hauteur et une amplitude ; la décomposition les calculait, s'en
 * servait pour compter, puis les jetait. Ce seul passage relie l'analyse d'un son à tout ce qui
 * lit une séquence, et notamment au quantifieur, donc à l'arbre rythmique.
 *
 * UN ATOME N'EST PAS UNE NOTE, ET IL FAUT LE DIRE. Une seule note en produit plusieurs : ses
 * partiels en portent chacun un, et une même attaque en reçoit un par échelle. La suite rendue est
 * donc DENSE et ne se lit pas comme une transcription. C'est une description du signal, et c'est
 * à qui la reçoit de la trier.
 *
 * LA HAUTEUR RESTE À VIRGULE. Un atome est placé en hertz par la transformée, et rien ne l'oblige
 * à tomber sur un demi-ton ; une séquence sait porter cet écart, et l'arrondir ici perdrait ce que
 * la méthode a de plus fin.
 *
 * LA VÉLOCITÉ EST RELATIVE AU PLUS FORT ATOME. Le coefficient de projection n'a pas d'échelle
 * absolue : il dépend de l'amplitude du signal, et deux sons de même contenu enregistrés à dix
 * décibels d'écart donneraient des nombres différents pour la même musique. Rapportée au plus fort,
 * elle dit ce qu'elle doit dire, le rang de chaque atome dans l'esquisse.
 *
 * CE QUI SORT DES CENT VINGT-HUIT DEMI-TONS EST ÉCARTÉ. La poursuite adaptative place des atomes
 * partout où il reste de l'énergie, y compris sous vingt hertz et près de la moitié de la fréquence
 * d'échantillonnage. Les replier inventerait des hauteurs que le calcul n'a pas produites.
 */
export function atomesEnNotes(
  atomes: readonly Atome[],
  frequence: number,
): { notes: Note[]; ecartees: number } {
  const sr = Math.max(1, frequence);
  const plusFort = atomes.reduce((m, a) => Math.max(m, Math.abs(a.poids)), 0);
  const notes: Note[] = [];
  let ecartees = 0;
  for (const a of atomes) {
    const hauteur = 69 + 12 * Math.log2(Math.max(1e-6, a.frequenceHz) / 440);
    if (!(hauteur >= 0 && hauteur <= 127)) { ecartees++; continue; }
    const debut = a.debut / sr;
    notes.push({
      note: hauteur,
      velocite: Math.max(1, Math.min(127, Math.round((Math.abs(a.poids) / (plusFort || 1)) * 126) + 1)),
      debut,
      fin: debut + a.echelle / sr,
    });
  }
  notes.sort((x, y) => x.debut - y.debut || x.note - y.note);
  return { notes, ecartees };
}
