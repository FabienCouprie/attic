// audio/declipper.ts — Rendre à un son écrêté les sommets qu'on lui a coupés.
//
// D'après Srđan Kitić, Nancy Bertin et Rémi Gribonval, « Sparsity and cosparsity for audio
// declipping: a flexible non-convex approach », LVA/ICA 2015 — https://arxiv.org/abs/1506.01830 —
// l'algorithme A-SPADE ; et le panorama de Pavel Záviška, Pavel Rajmic, Alexey Ozerov et Lucas
// Rencker, « Sparsity-Based Audio Declipping Methods: Selected Overview, New Algorithms, and
// Large-Scale Evaluation », IEEE/ACM TASLP, 2021, qui en fixe les mesures.
//
// CE QUI MANQUAIT. Attic sait enlever des clics, réduire un bruit, déréverbérer, mais AUCUN nœud
// ne répare un son écrêté — le Normaliseur ne fait que le gain, et baisser le niveau d'un son
// écrêté ne fait qu'obtenir un son écrêté plus bas. Or l'écrêtage est le défaut le plus courant
// des enregistrements amateurs, et Attic vient d'en fabriquer un lui-même : « Fin de boucle C »
// dépasse 1 dès qu'on empile trois tours du même son.
//
// L'IDÉE. Un échantillon écrêté n'est pas inconnu : on sait qu'il valait AU MOINS le seuil, et
// on sait que les échantillons voisins non écrêtés sont justes. Le problème est donc un problème
// inverse sous contraintes — trouver un signal qui (1) laisse les échantillons fiables tels
// quels, (2) dépasse le seuil là où ça écrêtait, et (3) soit PARCIMONIEUX en temps-fréquence,
// c'est-à-dire ressemble à un son. Sans cette troisième condition le problème aurait une infinité
// de solutions, toutes plus laides les unes que les autres.
//
// COMMENT (A-SPADE). On alterne deux gestes, comme dans tout algorithme de ce genre :
//   1. rendre le spectre parcimonieux — garder les `s` plus fortes raies, jeter le reste ;
//   2. remettre le signal dans les contraintes — réimposer les échantillons fiables et repousser
//      les écrêtés au-dessus du seuil.
// Aucun des deux ne suffit seul : le premier abîme les contraintes, le second détruit la
// parcimonie. La suite converge vers un signal qui satisfait les deux. La parcimonie DÉMARRE
// SERRÉE et se desserre d'une raie tous les `r` tours : on cherche d'abord l'explication la plus
// simple, et on ne l'autorise à se compliquer que si elle ne rend pas compte des contraintes.
//
// CE QUE ÇA DONNE, ET OÙ ÇA S'ARRÊTE. Mesuré au rapport signal sur distorsion calculé SUR LES
// ÉCHANTILLONS ÉCRÊTÉS, la mesure du panorama de Záviška et al., sur deux sons de même crête
// écrêtés à divers seuils — à gauche un son à cinq harmoniques, à droite une dent de scie à cent :
//
//     seuil        0,8    0,6    0,5    0,4    0,3    0,2
//     5 harm.     +25    +14    +13     +3     +5     +4   dB
//     100 harm.    +2    −10     −5     +1     +6     +4   dB
//
// LA MÉTHODE EST FIABLE SUR UN SON PARCIMONIEUX ET ERRATIQUE SUR UN SON DENSE, et il vaut mieux
// l'écrire que le laisser découvrir. La raison n'est pas la densité d'énergie — une dent de scie
// concentre la sienne dans ses premières raies, en 1/h, et passe pour parcimonieuse à toutes les
// mesures d'énergie que j'ai essayées. C'est que la reconstruction a un PLANCHER propre à chaque
// son : reconstruire l'angle d'une dent de scie à partir de quelques dizaines de raies demande des
// phases exactes, et le modèle n'y arrive pas. Quand le dégât de l'écrêtage est plus léger que ce
// plancher, réparer ABÎME. C'est cohérent avec la littérature, qui évalue des gains MOYENS sur des
// corpus de musique et non une garantie par signal.
//
// D'où deux garde-fous qui ne sont pas dans l'article, et qui sont dits comme tels : un PLAFOND
// sur les échantillons reconstruits — l'erreur d'un modèle qui n'explique rien se réfugie dans les
// échantillons libres, et la crête montait à trois fois le seuil ; et le RÉSIDU de l'algorithme,
// rendu au nœud, qui dit à quel point le modèle a rendu compte du son.

import { fft } from "./fft";
import { fenetreHann } from "./stft";

export interface OptionsDeclip {
  /** Seuil d'écrêtage, entre 0 et 1. Absent : deviné depuis le signal. */
  seuil?: number;
  /** Longueur des trames. */
  taille?: number;
  /** Tours maximum par trame. */
  iterations?: number;
  /** Nombre de raies gardées au départ. */
  sparsiteInitiale?: number;
  /** Une raie de plus tous les `pas` tours. */
  pas?: number;
  /** Arrêt quand l'écart entre le signal et sa version parcimonieuse tombe sous ce seuil. */
  epsilon?: number;
  /**
   * Plafond des échantillons reconstruits, en multiple du seuil.
   *
   * Filet de sécurité, et non partie de l'algorithme : quand l'hypothèse de parcimonie est
   * fausse, le modèle ne rend plus compte du son et l'erreur se réfugie dans les échantillons
   * LIBRES, c'est-à-dire justement ceux qu'on reconstruit — mesuré, la crête montait à trois fois
   * le seuil. Le plafond borne les dégâts sans rien changer quand la méthode fonctionne : sur un
   * son à cinq harmoniques, la crête reconstruite vaut 1,48 fois le seuil, donc sous le plafond.
   */
  depassementMax?: number;
}

export interface ResultatDeclip {
  signal: Float32Array;
  /** Nombre d'échantillons qui étaient écrêtés, et qu'on a donc reconstruits. */
  reparees: number;
  /** Seuil employé, deviné ou donné. */
  seuil: number;
  /** Tours effectués en moyenne par trame : dit si l'algorithme a convergé ou buté sur la borne. */
  toursMoyens: number;
  /**
   * Résidu final de l'algorithme, relatif, moyenné sur les trames traitées.
   *
   * C'EST L'AUTO-ÉVALUATION DE LA MÉTHODE, et elle ne coûte rien : c'est l'écart qui sert déjà de
   * critère d'arrêt. Il dit à quel point le modèle parcimonieux rend compte de la trame. Petit,
   * la reconstruction s'appuie sur un modèle qui explique le son. Grand, le modèle n'explique
   * rien et ce qu'il met dans les échantillons reconstruits est une invention — le nœud peut
   * alors EMPIRER le son, et il vaut mieux le dire que le laisser découvrir.
   *
   * Une première tentative d'indicateur mesurait la part des raies portant 90 % de l'énergie.
   * Elle ne prédisait rien : une dent de scie à cent harmoniques la passe haut la main — son
   * énergie est concentrée dans ses premières raies, en 1/h — et échoue pourtant lamentablement.
   */
  residu: number;
}

/**
 * Tolérance de comparaison au seuil.
 *
 * Elle n'est pas un confort : un son est rangé en Float32, où 0,45 devient 0,44999998807907104.
 * Écrêter à 0,45 produit donc des plateaux JUSTE EN DESSOUS du seuil demandé, et une comparaison
 * stricte n'y voyait aucun échantillon écrêté — le nœud rendait le son tel quel en annonçant
 * n'avoir rien trouvé. Le défaut ne se voyait qu'à certains seuils : 0,5 et 0,15 s'arrondissent
 * vers le haut, 0,45 et 0,6 selon le cas. C'est exactement le genre de bogue qui passe les tests
 * neuf fois sur dix.
 */
const TOLERANCE = 1e-6;

/** Cet échantillon était-il écrêté ? Une seule définition, pour que tout le module s'accorde. */
export const estEcrete = (valeur: number, seuil: number): boolean =>
  Math.abs(valeur) >= seuil - TOLERANCE;

/**
 * Devine le seuil d'écrêtage.
 *
 * Un son écrêté a un PLATEAU : des échantillons CONSÉCUTIFS à la même valeur, la plus grande.
 * Compter les échantillons proches de la crête ne suffit pas — mesuré : un son périodique intact
 * en a cinquante-quatre, parce qu'il repasse par son maximum à chaque période, et le détecteur
 * l'aurait déclaré écrêté. C'est la LONGUEUR DES SUITES qui distingue les deux : une sinusoïde
 * effleure son sommet pendant un échantillon, un plateau d'écrêtage en dure des dizaines.
 *
 * Sans plateau, on rend un seuil légèrement AU-DESSUS de la crête : rien ne compte alors comme
 * écrêté, et le nœud peut dire qu'il n'a rien trouvé plutôt que d'aller réparer un échantillon.
 */
export function devinerSeuil(x: Float32Array): number {
  let crete = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > crete) crete = v; }
  if (crete <= 0) return 1;
  // Le plateau n'est jamais parfaitement plat : un fichier 16 bits quantifie, et un traitement
  // en virgule flottante laisse des écarts d'un millième.
  const marge = crete * 0.999;
  let suite = 0, pluslongue = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) >= marge) { suite++; if (suite > pluslongue) pluslongue = suite; }
    else suite = 0;
  }
  return pluslongue >= 3 ? marge : crete * 1.001;
}

/** Les échantillons écrêtés, par le haut et par le bas. */
export function compterEcretes(x: Float32Array, seuil: number): number {
  let n = 0;
  for (let i = 0; i < x.length; i++) if (estEcrete(x[i], seuil)) n++;
  return n;
}

/**
 * Garde les `s` raies les plus fortes d'un spectre, et met le reste à zéro.
 *
 * Les raies vont par PAIRES CONJUGUÉES — le bin k et le bin N−k — et on les garde ou les jette
 * ensemble : c'est ce qui fait que le signal reconstruit reste réel. Les traiter séparément
 * produirait une partie imaginaire, qu'il faudrait jeter ensuite, et le seuillage ne serait plus
 * celui qu'on croit.
 */
export function seuilDur(re: Float64Array, im: Float64Array, s: number): void {
  const N = re.length;
  const moitie = N >> 1;
  const modules: { k: number; m: number }[] = [];
  for (let k = 0; k <= moitie; k++) modules.push({ k, m: re[k] * re[k] + im[k] * im[k] });
  modules.sort((a, b) => b.m - a.m);
  const garder = new Uint8Array(moitie + 1);
  for (let i = 0; i < Math.min(s, modules.length); i++) garder[modules[i].k] = 1;
  for (let k = 0; k <= moitie; k++) {
    if (garder[k]) continue;
    re[k] = 0; im[k] = 0;
    const miroir = k === 0 || k === moitie ? -1 : N - k;
    if (miroir > 0) { re[miroir] = 0; im[miroir] = 0; }
  }
}

/**
 * A-SPADE sur une trame, fenêtrée.
 *
 * `cible` est la trame fenêtrée du signal écrêté ; `etat` dit, échantillon par échantillon, s'il
 * est fiable (0), écrêté par le haut (1) ou par le bas (−1). La contrainte est posée sur la trame
 * FENÊTRÉE, ce qui est licite parce que la fenêtre de Hann est positive : un échantillon écrêté
 * vers le haut valait au moins le seuil, donc sa version fenêtrée vaut au moins `w[i] × seuil`.
 */
function aspadeTrame(
  cible: Float64Array, etat: Int8Array, seuilFenetre: Float64Array,
  o: Required<Pick<OptionsDeclip, "iterations" | "sparsiteInitiale" | "pas" | "epsilon">>,
): { trame: Float64Array; tours: number; residu: number } {
  const N = cible.length;
  const z = Float64Array.from(cible);
  const uRe = new Float64Array(N), uIm = new Float64Array(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const barRe = new Float64Array(N), barIm = new Float64Array(N);
  let s = Math.max(1, o.sparsiteInitiale);
  let tours = 0, residu = 0;

  for (let k = 1; k <= o.iterations; k++) {
    tours = k;
    // 1. Parcimonie : on seuille durement A·z + u.
    re.set(z); im.fill(0);
    fft(re, im, false);
    for (let i = 0; i < N; i++) { barRe[i] = re[i] + uRe[i]; barIm[i] = im[i] + uIm[i]; }
    seuilDur(barRe, barIm, s);

    // 2. Contraintes : z = projection de A⁻¹(z̄ − u) sur l'ensemble compatible. La transformée
    //    étant unitaire, le moindre carré se résout par la transformée inverse, sans itération.
    for (let i = 0; i < N; i++) { re[i] = barRe[i] - uRe[i]; im[i] = barIm[i] - uIm[i]; }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      if (etat[i] === 0) z[i] = cible[i];
      else if (etat[i] > 0) z[i] = Math.max(re[i], seuilFenetre[i]);
      else z[i] = Math.min(re[i], -seuilFenetre[i]);
    }

    // 3. Écart entre le signal contraint et sa version parcimonieuse : c'est lui qui décide de
    //    l'arrêt, et c'est lui qu'on accumule dans u.
    re.set(z); im.fill(0);
    fft(re, im, false);
    let ecart = 0, norme = 0;
    for (let i = 0; i < N; i++) {
      const dRe = re[i] - barRe[i], dIm = im[i] - barIm[i];
      ecart += dRe * dRe + dIm * dIm;
      norme += barRe[i] * barRe[i] + barIm[i] * barIm[i];
      uRe[i] += dRe; uIm[i] += dIm;
    }
    residu = Math.sqrt(ecart) / Math.max(1e-12, Math.sqrt(norme));
    if (residu <= o.epsilon) break;
    if (k % Math.max(1, o.pas) === 0) s++;
  }
  return { trame: z, tours, residu };
}

/**
 * La chaîne entière : un signal écrêté, un signal réparé.
 *
 * Trames de Hann à recouvrement de trois quarts, chacune traitée pour elle-même puis remise par
 * addition pondérée. Un dernier geste après le recollement : réimposer les contraintes sur le
 * signal entier. Le recollement mélange des trames voisines, si bien qu'un échantillon fiable
 * pourrait en ressortir légèrement modifié — ici il ressort EXACTEMENT ce qu'il était, et un
 * échantillon écrêté ressort toujours au-dessus du seuil. La promesse est alors vraie sans
 * dépendre de la convergence.
 */
export function declipper(x: Float32Array, o: OptionsDeclip = {}): ResultatDeclip {
  const seuil = o.seuil ?? devinerSeuil(x);
  const reparees = compterEcretes(x, seuil);
  if (reparees === 0 || x.length === 0) {
    return { signal: Float32Array.from(x), reparees: 0, seuil, toursMoyens: 0, residu: 0 };
  }
  const N = o.taille ?? 1024;
  const hop = N / 4;
  const reglages = {
    // Valeurs choisies par MESURE et non par recopie : sur un son écrêté à 24 %, la marche à
    // 0,01 rend 16,8 dB là où 0,1 en rend 8,5 — l'arrêt anticipé coupait la convergence bien trop
    // tôt. Soixante tours suffisent, la parcimonie se desserrant d'une raie par tour.
    iterations: o.iterations ?? 60,
    sparsiteInitiale: o.sparsiteInitiale ?? 1,
    pas: o.pas ?? 1,
    epsilon: o.epsilon ?? 0.01,
  };
  const w = fenetreHann(N);
  const longueur = x.length + 2 * N;
  const somme = new Float64Array(longueur);
  const poids = new Float64Array(longueur);
  const cible = new Float64Array(N), seuilFenetre = new Float64Array(N);
  const etat = new Int8Array(N);
  let toursTotal = 0, residuTotal = 0, nTrames = 0;

  for (let debut = 0; debut + N <= longueur; debut += hop) {
    let aTraiter = false;
    for (let i = 0; i < N; i++) {
      const j = debut + i - N;
      const v = j >= 0 && j < x.length ? x[j] : 0;
      cible[i] = v * w[i];
      seuilFenetre[i] = seuil * w[i];
      etat[i] = estEcrete(v, seuil) ? (v > 0 ? 1 : -1) : 0;
      if (etat[i] !== 0) aTraiter = true;
    }
    // Une trame sans aucun échantillon écrêté n'a rien à reconstruire : on la recopie. C'est la
    // moitié du temps de calcul économisée sur un son où l'écrêtage est local.
    const { trame, tours, residu } = aTraiter
      ? aspadeTrame(cible, etat, seuilFenetre, reglages)
      : { trame: cible, tours: 0, residu: 0 };
    if (aTraiter) { toursTotal += tours; residuTotal += residu; nTrames++; }
    for (let i = 0; i < N; i++) { somme[debut + i] += trame[i] * w[i]; poids[debut + i] += w[i] * w[i]; }
  }

  const plafond = seuil * (o.depassementMax ?? 2);
  const sortie = new Float32Array(x.length);
  for (let j = 0; j < x.length; j++) {
    const i = j + N;
    const p = poids[i];
    let v = p > 1e-12 ? somme[i] / p : x[j];
    // Les contraintes, réimposées après recollement : c'est ce qui rend les deux promesses vraies
    // quoi qu'il arrive — un échantillon fiable est intact, un écrêté dépasse le seuil.
    const original = x[j];
    if (!estEcrete(original, seuil)) v = original;
    else if (original > 0) v = Math.min(plafond, Math.max(v, seuil));
    else v = Math.max(-plafond, Math.min(v, -seuil));
    sortie[j] = v;
  }
  return {
    signal: sortie, reparees, seuil,
    toursMoyens: nTrames > 0 ? toursTotal / nTrames : 0,
    residu: nTrames > 0 ? residuTotal / nTrames : 0,
  };
}

/**
 * Rapport signal sur distorsion sur les échantillons ÉCRÊTÉS seulement, en décibels.
 *
 * C'est la mesure du panorama de Záviška et al., et elle est la seule honnête ici : un son écrêté
 * à 0,8 est juste à 95 % de ses échantillons, si bien qu'un rapport calculé sur tout le signal
 * afficherait 25 dB avant même d'avoir rien réparé, et bougerait à peine ensuite.
 */
export function sdrEcretes(original: Float32Array, essai: Float32Array, ecrete: Float32Array, seuil: number): number {
  let signal = 0, bruit = 0;
  for (let i = 0; i < original.length; i++) {
    if (!estEcrete(ecrete[i], seuil)) continue;
    signal += original[i] * original[i];
    const d = original[i] - essai[i];
    bruit += d * d;
  }
  if (signal <= 0) return 0;
  return 10 * Math.log10(signal / Math.max(1e-20, bruit));
}
