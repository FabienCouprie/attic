// audio/sms.ts — Modèle « sinusoïdes + bruit » : suivre les partiels, garder le reste à part.
//
// D'après Xavier Serra et Julius O. Smith III, « Spectral Modeling Synthesis: A Sound
// Analysis/Synthesis System Based on a Deterministic plus Stochastic Decomposition »,
// Computer Music Journal 14(4), 1990 — et la thèse de Serra, Stanford, 1989.
// https://quod.lib.umich.edu/i/icmc/bbp2372.1989.068/--spectral-modeling-synthesis
// Le suivi de partiels et la resynthèse additive reprennent Robert McAulay et Thomas Quatieri,
// « Speech Analysis/Synthesis Based on a Sinusoidal Representation », IEEE TASSP 34(4), 1986.
//
// L'IDÉE : un son se compose d'une partie DÉTERMINISTE — des partiels, chacun avec sa fréquence
// et son amplitude qui évoluent — et d'une partie STOCHASTIQUE, le reste : le souffle d'une
// flûte, l'archet d'un violon, le bruit d'attaque d'un piano. Les séparer permet de les
// transformer SÉPARÉMENT, et c'est là tout l'intérêt : transposer les partiels sans toucher au
// souffle, rendre un instrument plus soufflé sans le désaccorder, ôter le bruit sans ternir
// l'harmonie. Aucun vocodeur de phase ne le permet, parce qu'il ne sait pas ce qu'est un
// partiel — il ne connaît que des bins.
//
// CE QU'ATTIC AVAIT, ET CE QUI MANQUAIT. Le vocodeur de phase transpose et étire en aveugle ;
// Griffin-Lim reconstruit une phase perdue ; la séparation harmonique/percussive sépare ce qui
// dure de ce qui claque. Aucun ne SUIT une partielle dans le temps, et c'est ce que ce module
// ajoute : une liste de trajectoires, chacune avec son histoire.
//
// DEUX VOIES DE RESYNTHÈSE, et elles ne servent pas à la même chose :
//
//   1. PAR MASQUE, quand on ne transforme pas les partiels. Les bins autour des pics vont au
//      déterministe, tout le reste au résidu. Les deux masques étant complémentaires, les deux
//      sorties remises bout à bout redonnent le son EXACTEMENT — comme pour la séparation
//      harmonique/percussive, et c'est testé.
//   2. PAR ADDITION, dès qu'on transpose ou qu'on filtre les partiels. Chaque trajectoire
//      devient un oscillateur dont la fréquence et l'amplitude sont interpolées entre trames.
//      Le résidu, lui, reste celui du masque : on ne le refabrique pas, on le garde.

import { analyseSynthese } from "./stft";

export const TAILLE_TRAME = 2048;

export interface Pic {
  /** Fréquence en hertz, affinée par interpolation parabolique entre les bins. */
  frequence: number;
  amplitude: number;
  /** Indice du bin entier le plus proche, pour le masque. */
  bin: number;
}

export interface OptionsPics {
  /** Seuil relatif au plus fort pic de la trame, en décibels sous lui. */
  seuilDb?: number;
  /** Nombre maximal de pics gardés par trame, les plus forts d'abord. */
  maxPics?: number;
  /**
   * SAILLIE minimale au-dessus du voisinage, en décibels.
   *
   * C'est ce qui sépare un partiel d'une bosse de bruit, et il en faut un : la persistance ne
   * suffit pas. Avec un recouvrement de trois quarts, deux trames voisines partagent 75 % de
   * leurs échantillons, donc leurs spectres se ressemblent — et une bosse de bruit « persiste »
   * elle aussi d'une trame à l'autre. Mesuré avant ce critère : 55 % d'un bruit blanc passait
   * pour déterministe. Un vrai partiel dépasse son voisinage de vingt décibels ou plus ; une
   * bosse de bruit, de quelques-uns.
   */
  saillieDb?: number;
}

/**
 * Les pics spectraux d'une trame.
 *
 * Un pic est un maximum local du module. Sa fréquence est ensuite AFFINÉE par interpolation
 * parabolique sur trois bins en décibels : sans cela, la résolution serait celle des bins —
 * vingt et un hertz à 2048 points — et un la 440 se lirait à 431 ou 452. Avec elle, l'erreur
 * tombe sous le hertz, ce qui est ce qu'il faut pour transposer proprement.
 */
export function picsDeTrame(
  re: Float64Array, im: Float64Array, sampleRate: number, o: OptionsPics = {},
): Pic[] {
  const taille = re.length;
  const moitie = taille / 2;
  const seuilDb = o.seuilDb ?? 60;
  const maxPics = o.maxPics ?? 60;
  const saillieDb = o.saillieDb ?? 12;
  const VOISINAGE = 12;
  const mod = new Float64Array(moitie);
  let maxi = 0;
  for (let k = 0; k < moitie; k++) {
    mod[k] = Math.hypot(re[k], im[k]);
    if (mod[k] > maxi) maxi = mod[k];
  }
  if (maxi <= 1e-12) return [];
  const plancher = maxi * 10 ** (-seuilDb / 20);

  const pics: Pic[] = [];
  const voisinage = new Float64Array(2 * VOISINAGE + 1);
  for (let k = 1; k < moitie - 1; k++) {
    if (mod[k] <= plancher || mod[k] <= mod[k - 1] || mod[k] < mod[k + 1]) continue;
    // La saillie : hauteur du pic au-dessus de la MÉDIANE de son voisinage. La médiane, et non
    // la moyenne, parce que le pic lui-même tirerait la moyenne vers le haut et se justifierait
    // tout seul.
    let compte = 0;
    for (let j = -VOISINAGE; j <= VOISINAGE; j++) {
      const i = k + j;
      if (i > 0 && i < moitie) voisinage[compte++] = mod[i];
    }
    const tri = Array.prototype.slice.call(voisinage, 0, compte).sort((u: number, v: number) => u - v);
    const fond = tri[compte >> 1];
    if (fond > 1e-12 && 20 * Math.log10(mod[k] / fond) < saillieDb) continue;
    // Interpolation parabolique en décibels : c'est la forme d'un lobe de fenêtre de Hann au
    // voisinage de son sommet, et c'est pourquoi on interpole là plutôt que sur l'amplitude.
    const a = 20 * Math.log10(Math.max(1e-12, mod[k - 1]));
    const b = 20 * Math.log10(Math.max(1e-12, mod[k]));
    const c = 20 * Math.log10(Math.max(1e-12, mod[k + 1]));
    const d = (a - c) / (2 * (a - 2 * b + c));
    const decalage = Number.isFinite(d) ? Math.max(-0.5, Math.min(0.5, d)) : 0;
    pics.push({
      frequence: ((k + decalage) * sampleRate) / taille,
      amplitude: mod[k] * 10 ** ((-(a - 2 * b + c) * decalage * decalage) / 80),
      bin: k,
    });
  }
  pics.sort((x, y) => y.amplitude - x.amplitude);
  return pics.slice(0, maxPics).sort((x, y) => x.frequence - y.frequence);
}

export interface PointPiste {
  trame: number;
  frequence: number;
  amplitude: number;
  /** Bin d'où vient ce point : c'est lui qui sera versé au déterministe. */
  bin: number;
}

export interface Piste {
  points: PointPiste[];
}

export interface OptionsSuivi {
  /** Écart maximal, en demi-tons, entre deux trames pour qu'un pic prolonge une piste. */
  tolerance?: number;
  /** Une piste plus courte que cela est du bruit qui a eu de la chance : elle est jetée. */
  minTrames?: number;
}

/**
 * Relie les pics d'une trame à l'autre pour en faire des trajectoires.
 *
 * L'appariement est glouton, du pic le plus fort au plus faible, chacun cherchant la piste
 * vivante dont la fréquence est la plus proche. C'est la méthode de McAulay et Quatieri, et sa
 * vertu est d'être stable : une partielle forte ne se fait pas voler sa piste par une faible.
 *
 * La TOLÉRANCE est en demi-tons et non en hertz, parce qu'un écart d'un hertz est énorme dans le
 * grave et négligeable dans l'aigu — en hertz, on perdrait les basses ou on relierait n'importe
 * quoi dans les aigus.
 */
export function suivrePistes(picsParTrame: Pic[][], o: OptionsSuivi = {}): Piste[] {
  const tolerance = o.tolerance ?? 1;
  const minTrames = o.minTrames ?? 3;
  const rapportMax = 2 ** (tolerance / 12);
  const pistes: Piste[] = [];
  let vivantes: { piste: Piste; derniere: number }[] = [];

  picsParTrame.forEach((pics, t) => {
    const prochaines: { piste: Piste; derniere: number }[] = [];
    const prises = new Set<Piste>();
    for (const pic of [...pics].sort((a, b) => b.amplitude - a.amplitude)) {
      let meilleure: { piste: Piste; derniere: number } | null = null;
      let meilleurEcart = Infinity;
      for (const v of vivantes) {
        if (prises.has(v.piste)) continue;
        const rapport = pic.frequence > v.derniere ? pic.frequence / v.derniere : v.derniere / pic.frequence;
        if (rapport > rapportMax) continue;
        if (rapport < meilleurEcart) { meilleurEcart = rapport; meilleure = v; }
      }
      if (meilleure) {
        meilleure.piste.points.push({ trame: t, frequence: pic.frequence, amplitude: pic.amplitude, bin: pic.bin });
        prises.add(meilleure.piste);
        prochaines.push({ piste: meilleure.piste, derniere: pic.frequence });
      } else {
        // Naissance : une partielle qui n'était pas là avant.
        const piste: Piste = { points: [{ trame: t, frequence: pic.frequence, amplitude: pic.amplitude, bin: pic.bin }] };
        pistes.push(piste);
        prochaines.push({ piste, derniere: pic.frequence });
      }
    }
    vivantes = prochaines;
  });

  return pistes.filter((p) => p.points.length >= minTrames);
}

export interface OptionsSynthese {
  /** Transposition des partiels, en demi-tons. Le résidu n'en sait rien. */
  transposition?: number;
  /** Gain appliqué aux partiels. */
  gain?: number;
}

/**
 * Resynthèse additive des pistes.
 *
 * Un oscillateur par trajectoire, dont la fréquence et l'amplitude sont interpolées linéairement
 * entre deux trames et dont la PHASE EST INTÉGRÉE : c'est la seule façon d'obtenir une sinusoïde
 * continue quand sa fréquence bouge. Reprendre la phase mesurée à chaque trame ferait claquer le
 * son à chaque saut de trame.
 */
export function synthetiserPistes(
  pistes: Piste[], longueur: number, sampleRate: number, saut: number, o: OptionsSynthese = {},
): Float32Array {
  const facteur = 2 ** ((o.transposition ?? 0) / 12);
  const gain = o.gain ?? 1;
  const y = new Float32Array(longueur);
  for (const piste of pistes) {
    let phase = 0;
    for (let i = 0; i + 1 < piste.points.length; i++) {
      const a = piste.points[i], b = piste.points[i + 1];
      const debut = a.trame * saut, fin = b.trame * saut;
      if (fin <= debut) continue;
      const n = fin - debut;
      for (let k = 0; k < n; k++) {
        const indice = debut + k;
        if (indice < 0 || indice >= longueur) continue;
        const u = k / n;
        const f = (a.frequence * (1 - u) + b.frequence * u) * facteur;
        const amp = a.amplitude * (1 - u) + b.amplitude * u;
        phase += (2 * Math.PI * f) / sampleRate;
        y[indice] += gain * amp * Math.sin(phase);
      }
    }
  }
  return y;
}

export interface ResultatSms {
  pistes: Piste[];
  /** La partie déterministe telle que le masque la rend : les partiels du son d'origine. */
  deterministe: Float32Array;
  /** Tout le reste — souffle, archet, bruit d'attaque. */
  residu: Float32Array;
  saut: number;
}

export interface OptionsSms extends OptionsPics, OptionsSuivi {
  taille?: number;
  /** Demi-largeur, en bins, de la zone attribuée à chaque pic. */
  largeurPic?: number;
}

/**
 * Analyse complète : les pistes, la partie déterministe et le résidu.
 *
 * Le partage se fait par MASQUES COMPLÉMENTAIRES — les bins autour des pics d'un côté, tout le
 * reste de l'autre —, si bien que déterministe + résidu redonne le son d'origine échantillon
 * pour échantillon. C'est ce qui permet d'affirmer qu'on a décomposé et non transformé, et c'est
 * testé. La resynthèse additive, elle, ne sert qu'aux transformations.
 */
export function analyserSms(x: Float32Array, sampleRate: number, o: OptionsSms = {}): ResultatSms {
  const taille = o.taille ?? TAILLE_TRAME;
  const largeur = o.largeurPic ?? 3;
  const saut = taille / 4;

  // PREMIÈRE PASSE : relever les pics, et seulement eux.
  const picsParTrame: Pic[][] = [];
  analyseSynthese(x, taille, 0, (re, im, _sRe, _sIm, t) => {
    picsParTrame[t] = picsDeTrame(re, im, sampleRate, o);
  });
  const pistes = suivrePistes(picsParTrame, o);

  // CE QUI FAIT LA DIFFÉRENCE ENTRE UN PARTIEL ET UNE BOSSE DE BRUIT : la persistance. Seuls
  // les pics qui appartiennent à une piste RETENUE — assez longue pour ne pas être un hasard —
  // sont versés au déterministe. Construire le masque sur les pics bruts de chaque trame
  // donnait 55 % de « déterministe » sur du bruit blanc, ce qui ne veut rien dire ; c'est aussi
  // la logique de Serra, chez qui la partie déterministe EST ce que le suivi a retenu.
  const binsRetenus: Set<number>[] = [];
  for (const piste of pistes) {
    for (const point of piste.points) {
      (binsRetenus[point.trame] ??= new Set()).add(point.bin);
    }
  }

  // SECONDE PASSE : les masques, sur ces bins-là seulement.
  const [deterministe, residu] = analyseSynthese(x, taille, 2, (re, im, sRe, sIm, t) => {
    // Tout au résidu d'abord, puis on DÉPLACE les bins retenus vers le déterministe : ainsi
    // aucun bin n'est compté deux fois ni oublié, quelles que soient les largeurs choisies.
    sRe[1].set(re); sIm[1].set(im);
    const bins = binsRetenus[t];
    if (!bins) return;
    for (const centre of bins) {
      for (let d = -largeur; d <= largeur; d++) {
        for (const k of [centre + d, taille - (centre + d)]) {
          if (k <= 0 || k >= taille) continue;
          sRe[0][k] = re[k]; sIm[0][k] = im[k];
          sRe[1][k] = 0; sIm[1][k] = 0;
        }
      }
    }
  });

  return { pistes, deterministe, residu, saut };
}

/**
 * Recale un signal sur l'énergie d'un autre.
 *
 * Les amplitudes des pics sont celles du spectre FENÊTRÉ : une resynthèse additive qui les
 * reprend telles quelles ne sonne pas au même niveau que la partie déterministe du masque, et le
 * facteur exact dépend de la fenêtre, du recouvrement et du nombre de partiels. Plutôt que de le
 * calculer à partir d'hypothèses, on le MESURE sur le son lui-même : c'est juste par
 * construction, et cela reste juste si la fenêtre change.
 */
export function recalerEnergie(y: Float32Array, reference: Float32Array): Float32Array {
  let ey = 0, er = 0;
  for (let i = 0; i < y.length; i++) ey += y[i] * y[i];
  for (let i = 0; i < reference.length; i++) er += reference[i] * reference[i];
  if (ey <= 1e-20 || er <= 1e-20) return y;
  const g = Math.sqrt(er / ey);
  return Float32Array.from(y, (v) => v * g);
}
