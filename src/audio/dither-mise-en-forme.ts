// audio/dither-mise-en-forme.ts — Réduire la profondeur d'un son : dither, puis mise en forme du bruit.
//
// CE QUE CE MODULE FAIT. Il ramène chaque échantillon sur la grille d'une profondeur de 2 à 24 bits,
// en ajoutant avant l'arrondi un bruit de dither, et en renvoyant l'erreur commise sur les
// échantillons suivants par un filtre : la rétroaction de l'erreur (« error feedback »). Le son rendu
// reste en virgule flottante, mais chacune de ses valeurs est un code de la profondeur visée divisé
// par la pleine échelle.
//
// LA GRILLE EST CELLE DE `audio/dither.ts`, et c'est voulu : pleine échelle symétrique 2^(b−1) − 1,
// arrondi à l'écart de zéro sur les demis. Une sortie à seize bits tombe donc exactement sur les
// codes que l'écriture d'un WAV seize bits produit. La borne est symétrique, ±(2^(b−1) − 1) : le
// dernier code négatif n'est pas fabriqué, si bien que la sortie reste dans [−1 ; 1].
//
// LA BOUCLE, en unités de LSB (x l'entrée multipliée par la pleine échelle, d le dither) :
//
//     v[n] = x[n] − Σ hₖ e[n−k]        y[n] = arrondi(v[n] + d[n])        e[n] = y[n] − v[n]
//
// d'où y[n] − x[n] = e[n] − Σ hₖ e[n−k] : l'erreur totale de la sortie est e passée par
// N(z) = 1 − Σ hₖ z⁻ᵏ, la fonction de transfert du bruit. L'erreur renvoyée COMPREND LE DITHER, comme
// dans la littérature et dans SoX ou FFmpeg : sous dither triangulaire, e est blanche, de variance
// Δ²/4, et indépendante du signal en moyenne et en variance (S. P. Lipshitz, R. A. Wannamaker et
// J. Vanderkooy, « Quantization and Dither: A Theoretical Survey », J. Audio Eng. Soc. 40(5), 1992,
// p. 355-375). Le spectre de l'erreur rendue est donc (Δ²/4)·|N|², et sa puissance (Δ²/4)·Σ nₖ².
//
// CE QUE LA MISE EN FORME NE PEUT PAS FAIRE. Pour une fonction de transfert à phase minimale de
// premier coefficient 1, la moyenne de log|N|² sur la bande est nulle (M. A. Gerzon et P. G. Craven,
// « Optimal Noise Shaping and Dither of Digital Signals », 87e convention de l'AES, prépublication
// 2822, 1989) : le bruit retiré d'une région, en décibels, se retrouve ailleurs. Les quatre filtres
// non triviaux ci-dessous sont à phase minimale, les deux d'ordre fixe ayant leurs zéros sur le
// cercle unité ; le test le vérifie sur les coefficients des deux courbes pondérées.
//
// LES FILTRES, ET D'OÙ VIENNENT LEURS COEFFICIENTS.
//   · Premier et second ordre : (1 − z⁻¹) et (1 − z⁻¹)², le bruit chassé du grave vers l'aigu, de
//     forme indépendante de la fréquence d'échantillonnage.
//   · « E 5 coef. » : la courbe pondérée E à cinq coefficients de S. P. Lipshitz, J. Vanderkooy et
//     R. A. Wannamaker, « Minimally Audible Noise Shaping », J. Audio Eng. Soc. 39(11), 1991,
//     p. 836-852, calculée pour 44,1 kHz.
//   · « F 9 coef. » : la courbe pondérée F à neuf coefficients de R. A. Wannamaker,
//     « Psychoacoustically Optimal Noise Shaping », J. Audio Eng. Soc. 40(7/8), 1992, p. 611-620,
//     calculée pour 44,1 kHz.
//   LES ARTICLES N'ONT PAS ÉTÉ LUS, et il faut le dire : ils sont payants à l'AES. Les coefficients
//   sont ceux que transcrit SoX (`dither.c`, 2008-9, tables `lip44` et `fwe44`), et pour `lip44`
//   FFmpeg (`libswresample/noise_shaping_data.c`), qui ne citent pas leurs sources ; l'attribution
//   est celle de leurs noms. UN RECOUPEMENT INDÉPENDANT TIENT : J. Dunn et M. Sandler (J. Audio Eng. Soc.
//   45(4), 1997, p. 212-223) écrivent que le filtre F d'ordre neuf de Wannamaker coûte 18 dB de
//   bruit non pondéré, et ces neuf coefficients en donnent 18,40.
//
// L'ÉCRÊTAGE NE DÉSTABILISE PAS LA BOUCLE. L'erreur renvoyée est prise AVANT la borne : elle reste
// donc sous 1,5 LSB quoi qu'il arrive (un LSB de dither, un demi d'arrondi), et la rétroaction, un
// filtre fini nourri d'une suite bornée, reste bornée. Prise après la borne, un son au plein
// calibre renverrait des erreurs de mille LSB et le filtre F, dont les coefficients somment à 21 en
// valeur absolue, entrerait en oscillation. Ce qui est borné se compte, et sort comme distorsion.
//
// LE CALCUL NE CONNAÎT PAS L'AUDIO : il reçoit des canaux et les rend. Il est pur, et peut quitter le
// fil sans changer.
import { creerAleatoire } from "../core/hasard";
import { pleineEchelle } from "./dither";

/** Le bruit ajouté avant l'arrondi. */
export type FormeDither = "aucun" | "rectangulaire" | "triangulaire" | "triangulaire-passe-haut";

/** Le filtre qui renvoie l'erreur sur les échantillons suivants. */
export type MiseEnForme = "aucune" | "premier-ordre" | "second-ordre" | "e-5" | "f-9";

export interface FiltreMiseEnForme {
  /** Les coefficients h₁ … h_N : la fonction de transfert du bruit est 1 − Σ hₖ z⁻ᵏ. */
  readonly h: readonly number[];
  /** La fréquence d'échantillonnage pour laquelle la courbe est calculée ; nulle si sa forme n'en dépend pas. */
  readonly frequenceConception: number | null;
}

export const FILTRES: Readonly<Record<MiseEnForme, FiltreMiseEnForme>> = {
  "aucune": { h: [], frequenceConception: null },
  "premier-ordre": { h: [1], frequenceConception: null },
  "second-ordre": { h: [2, -1], frequenceConception: null },
  "e-5": { h: [2.033, -2.165, 1.959, -1.590, 0.6149], frequenceConception: 44100 },
  "f-9": { h: [2.412, -3.370, 3.937, -4.174, 3.353, -2.205, 1.281, -0.569, 0.0847], frequenceConception: 44100 },
};

/** Les profondeurs admises. Sous deux bits la grille symétrique n'a plus de code non nul ; au-delà de
 * vingt-quatre, un tampon en virgule flottante simple ne la porte plus. */
export const BITS_MIN = 2;
export const BITS_MAX = 24;

/** L'écart relatif de fréquence au-delà duquel une courbe est dite hors de sa conception : 5 %, celui de SoX. */
export const TOLERANCE_CONCEPTION = 0.05;

export interface OptionsDither {
  bits: number;
  forme: FormeDither;
  miseEnForme: MiseEnForme;
  /** Graine du dither, déjà résolue par le moteur. Même graine, mêmes échantillons. */
  graine: number;
}

export interface ResultatDither {
  canaux: Float32Array<ArrayBuffer>[];
  /** La profondeur employée, ramenée dans [BITS_MIN ; BITS_MAX]. */
  bits: number;
  /** Le nombre d'échantillons ramenés dans la pleine échelle. */
  bornes: number;
  /** La valeur efficace de l'erreur rendue (sortie − entrée), hors échantillons bornés, en pleine échelle. */
  erreurEfficace: number;
}

/** Les coefficients de la fonction de transfert du bruit : 1, −h₁, …, −h_N. */
export const transfertDuBruit = (f: FiltreMiseEnForme): number[] => [1, ...f.h.map((v) => -v)];

/** Ce que la mise en forme multiplie la puissance d'un bruit blanc : Σ nₖ². */
export const gainDePuissance = (f: FiltreMiseEnForme): number =>
  transfertDuBruit(f).reduce((s, v) => s + v * v, 0);

/** |N(e^{jω})|², le gain de puissance du bruit à `frequence` hertz pour `fe` échantillons par seconde. */
export function moduleAuCarre(f: FiltreMiseEnForme, frequence: number, fe: number): number {
  const w = (2 * Math.PI * frequence) / fe;
  let re = 0, im = 0;
  transfertDuBruit(f).forEach((n, k) => { re += n * Math.cos(w * k); im -= n * Math.sin(w * k); });
  return re * re + im * im;
}

/** Vrai quand `fe` s'écarte de plus de 5 % de la fréquence pour laquelle la courbe est calculée. */
export const horsConception = (f: FiltreMiseEnForme, fe: number): boolean =>
  f.frequenceConception !== null
  && Math.abs(fe - f.frequenceConception) / f.frequenceConception > TOLERANCE_CONCEPTION;

/**
 * Un tireur de dither, en LSB, pour un canal.
 *
 * RECTANGULAIRE : un tirage uniforme sur ±½ LSB. La moyenne de l'erreur ne dépend plus du signal, sa
 * variance si. TRIANGULAIRE : la différence de deux tirages, densité triangulaire sur ±1 LSB ; la
 * moyenne et la variance de l'erreur cessent toutes deux d'en dépendre. PASSE-HAUT : la différence
 * de deux tirages SUCCESSIFS, u[n] − u[n−1], de même densité triangulaire et de spectre
 * (1/12)·|1 − z⁻¹|², nul au continu et maximal à la fréquence de Nyquist.
 */
function tireur(forme: FormeDither, alea: () => number): () => number {
  switch (forme) {
    case "rectangulaire": return () => alea() - 0.5;
    case "triangulaire": return () => alea() - alea();
    case "triangulaire-passe-haut": {
      let avant = alea();
      return () => { const u = alea(); const d = u - avant; avant = u; return d; };
    }
    default: return () => 0;
  }
}

/**
 * Quantifie chaque canal à `bits` bits, avec le dither et la mise en forme demandés.
 *
 * LES CANAUX REÇOIVENT DES BRUITS INDÉPENDANTS : un seul générateur les sert l'un après l'autre, si
 * bien que deux canaux identiques ne rendent pas le même bruit, et que la même graine rend les mêmes
 * échantillons.
 *
 * L'ERREUR ANNONCÉE EST MESURÉE SUR LE TAMPON RENDU, et non sur le code entier : la division par la
 * pleine échelle s'arrondit en virgule flottante simple, à un millième de LSB près à seize bits et à
 * un quart à vingt-quatre. C'est ce que le son porte, donc ce qui se dit.
 */
export function ditherer(canaux: readonly Float32Array[], o: OptionsDither): ResultatDither {
  const bits = Math.max(BITS_MIN, Math.min(BITS_MAX, Math.round(Number.isFinite(o.bits) ? o.bits : 16)));
  const haut = pleineEchelle(bits);
  const h = Float64Array.from((FILTRES[o.miseEnForme] ?? FILTRES.aucune).h);
  const alea = creerAleatoire(o.graine);
  const bilan = { bornes: 0, somme: 0, compte: 0 };
  const sorties = canaux.map((src) => quantifierCanal(src, h, haut, tireur(o.forme, alea), bilan));
  const erreurEfficace = bilan.compte > 0 ? Math.sqrt(bilan.somme / bilan.compte) : 0;
  return { canaux: sorties, bits, bornes: bilan.bornes, erreurEfficace };
}

/**
 * La boucle d'un canal.
 *
 * UNE FONCTION À PART, AUX VARIABLES LOCALES, et c'est pour la durée : écrite dans la fermeture de
 * `map`, elle modifiait trois compteurs capturés à chaque échantillon. Le bilan ne s'écrit qu'à la fin.
 */
function quantifierCanal(
  src: Float32Array, h: Float64Array, haut: number, bruit: () => number,
  bilan: { bornes: number; somme: number; compte: number },
): Float32Array<ArrayBuffer> {
  const ordre = h.length;
  const dst = new Float32Array(src.length);
  // L'HISTORIQUE EST UN TAMPON DOUBLÉ, la technique de SoX : chaque erreur s'écrit à deux places,
  // `pos` et `pos + ordre`, si bien que passe[pos + k] vaut e[n − 1 − k] pour tout k, sans modulo
  // ni décalage des valeurs à chaque échantillon.
  const passe = new Float64Array(2 * ordre);
  let pos = 0, bornes = 0, somme = 0, compte = 0;
  for (let i = 0; i < src.length; i++) {
    const entree = Number.isFinite(src[i]) ? src[i] : 0;
    let v = entree * haut;
    for (let k = 0; k < ordre; k++) v -= h[k] * passe[pos + k];
    const w = v + bruit();
    // L'arrondi à l'écart de zéro sur les demis, celui de `audio/dither.ts`, sans `Math.sign`.
    const code = w >= 0 ? Math.floor(w + 0.5) : -Math.floor(0.5 - w);
    if (ordre > 0) {
      pos = pos === 0 ? ordre - 1 : pos - 1;
      passe[pos] = passe[pos + ordre] = code - v;
    }
    const borne = code > haut ? haut : code < -haut ? -haut : code;
    dst[i] = borne / haut;
    if (borne !== code) bornes++;
    else { const ecart = dst[i] - entree; somme += ecart * ecart; compte++; }
  }
  bilan.bornes += bornes; bilan.somme += somme; bilan.compte += compte;
  return dst;
}
