// audio/courbe.ts — Une valeur qui varie dans le temps, et de quoi la fabriquer.
//
// D'après Vincent Verfaille, Udo Zölzer et Daniel Arfib, « Adaptive Digital Audio Effects
// (A-DAFx): A New Class of Sound Transformations », IEEE Transactions on Audio, Speech and
// Language Processing 14(5), 2006 ; et « Implementation Strategies for Adaptive Digital Audio
// Effects », DAFx-02 — https://www.dafx.de/paper-archive/2002/DAFX02_Verfaille_Arfib_adaptive_DAFx.pdf
//
// CE QUI MANQUAIT À ATTIC, et qui se chiffrait : seize effets sur cent dix-huit n'existaient que
// parce qu'un paramètre y variait selon une règle CÂBLÉE EN DUR — sept « logistiques », quatre
// progressifs, cinq pilotés par un oscillateur intégré. « Écho logistique » est l'écho, avec un
// paramètre qui suit une courbe ; ajouter « Wah-wah logistique » aurait été un copier-coller de
// plus, et le catalogue aurait grossi sans gagner un pouce d'expressivité.
//
// Le type de flux `controle` existait déjà, mais il transporte des STRUCTURES — des zones, un
// profil de bruit, un tempo —, jamais un signal qui varie. D'où un type distinct : sans quoi on
// pourrait brancher une liste de zones sur une fréquence de coupure, et le graphe l'accepterait.
//
// L'IDÉE DE L'ARTICLE va plus loin qu'un oscillateur : le pilote peut être une CARACTÉRISTIQUE
// DU SON LUI-MÊME. La brillance qui ouvre son propre filtre, l'énergie qui allonge son propre
// délai. C'est ce qu'aucun nœud d'Attic ne savait faire, et c'est ce que `suivre*` rend possible.
//
// LA CONVENTION, et elle est ce qui permet de brancher n'importe quelle source sur n'importe
// quel effet : une courbe porte des valeurs entre ZÉRO ET UN. Le producteur décide de la forme,
// le CONSOMMATEUR décide de ce que zéro et un veulent dire chez lui — une fréquence, un gain,
// une position. C'est l'étage de mise en correspondance de l'article, placé du côté qui connaît
// ses propres unités.

import { fft } from "./fft";

/** Cadence par défaut des courbes, en valeurs par seconde. */
export const CADENCE = 200;

export interface Courbe {
  /** Valeurs entre 0 et 1. */
  valeurs: Float32Array;
  /** Valeurs par seconde. */
  cadence: number;
}

/**
 * Un croquis d'une courbe, pour l'affichage.
 *
 * ON PREND LE PIRE DE CHAQUE TRANCHE, ET NON LA MOYENNE. Une courbe qui saute à chaque attaque —
 * celle d'un suiveur d'énergie, typiquement — a des pointes d'une poignée de valeurs. Moyenner les
 * aplatirait, et le croquis montrerait une ligne calme là où le paramètre sursaute : exactement
 * l'information qu'on vient chercher. On garde donc la valeur la plus éloignée du milieu, celle qui
 * dit l'amplitude réelle du mouvement.
 */
export function echantillonnerPourApercu(valeurs: Float32Array, points: number): number[] {
  const n = Math.max(1, Math.round(points));
  if (valeurs.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * valeurs.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * valeurs.length) / n));
    let pire = valeurs[a];
    for (let k = a; k < b && k < valeurs.length; k++) {
      if (Math.abs(valeurs[k] - 0.5) > Math.abs(pire - 0.5)) pire = valeurs[k];
    }
    out.push(Math.round(Math.min(1, Math.max(0, pire)) * 1000) / 1000);
  }
  return out;
}

export const estCourbe = (v: unknown): v is Courbe =>
  !!v && typeof v === "object" && ArrayBuffer.isView((v as Courbe).valeurs)
  && typeof (v as Courbe).cadence === "number";

/** Une courbe plate. Sert de témoin : un effet modulé par elle doit rendre l'effet ordinaire. */
export function constante(valeur: number, dureeSec: number, cadence = CADENCE): Courbe {
  const n = Math.max(1, Math.round(dureeSec * cadence));
  return { valeurs: new Float32Array(n).fill(valeur), cadence };
}

/**
 * Rééchantillonne une courbe sur `n` points, par interpolation linéaire.
 *
 * C'est ce qui permet à un effet de lire une valeur PAR ÉCHANTILLON quelle que soit la cadence
 * de la courbe : une courbe à deux cents valeurs par seconde pilote un traitement à quarante-
 * quatre mille sans que ni l'un ni l'autre n'ait à connaître la cadence de l'autre.
 */
export function reechantillonner(c: Courbe, n: number): Float32Array {
  const y = new Float32Array(n);
  const v = c.valeurs;
  if (v.length === 0 || n === 0) return y;
  if (v.length === 1) { y.fill(v[0]); return y; }
  const echelle = (v.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * echelle;
    const k = Math.min(v.length - 2, Math.floor(x));
    const f = x - k;
    y[i] = v[k] * (1 - f) + v[k + 1] * f;
  }
  return y;
}

/**
 * Comment la course de zéro à un se répartit dans l'unité du consommateur.
 *
 * LE LINÉAIRE EST LE MAUVAIS DÉFAUT POUR UNE FRÉQUENCE, ET CELA S'ENTENDAIT. Un balayage de 200 à
 * 6000 Hz réparti linéairement met la moitié de sa course au-dessus de 3 100 Hz : l'octave
 * 200-400 Hz, qui est la plus audible du trajet, occupe trois pour-cent de la courbe, et le
 * balayage semble se précipiter puis s'arrêter. L'oreille entend des RAPPORTS — une octave est un
 * doublement, pas une différence —, et une fréquence doit donc progresser en multipliant.
 */
export type Echelle = "lineaire" | "logarithmique";

export interface MiseEnForme {
  /** Ce que zéro veut dire, dans l'unité du consommateur. */
  min: number;
  /** Ce que un veut dire. */
  max: number;
  /** Courbure : 1 est linéaire, 2 écrase le bas, 0,5 le dilate. */
  puissance?: number;
  inverser?: boolean;
  /** Répartition de la course. Absente : linéaire, le comportement d'avant. */
  echelle?: Echelle;
  /** Pas de quantification, pour un réglage qui n'accepte que des crans. */
  pas?: number;
}

/**
 * Traduit une courbe de 0-1 vers l'unité du consommateur.
 *
 * L'ÉCHELLE LOGARITHMIQUE RETOMBE SUR LE LINÉAIRE QUAND ELLE N'A PAS DE SENS. Elle multiplie, et
 * l'on ne multiplie pas à partir de zéro ni à travers zéro : un balayage de 0 à 20 000 Hz, ou de
 * −12 à +12, n'a pas de forme logarithmique. Le faire quand même rendrait des `NaN` sur toute la
 * course, et un fichier silencieux là où l'on attendait un balayage.
 */
export function mettreEnForme(valeurs: Float32Array, o: MiseEnForme): Float32Array {
  const p = o.puissance ?? 1;
  const log = o.echelle === "logarithmique" && o.min > 0 && o.max > 0;
  const rapport = log ? o.max / o.min : 1;
  const pas = o.pas && o.pas > 0 ? o.pas : 0;
  return Float32Array.from(valeurs, (v) => {
    const borne = Math.min(1, Math.max(0, v));
    const courbe = p === 1 ? borne : borne ** p;
    const u = o.inverser ? 1 - courbe : courbe;
    const brut = log ? o.min * rapport ** u : o.min + (o.max - o.min) * u;
    // Le cran s'applique EN DERNIER, après la mise à l'échelle : quantifier la course de 0 à 1
    // donnerait des crans dont la taille dépendrait de la plage, ce qui n'est pas ce qu'un pas veut
    // dire — un demi-ton est un demi-ton quelle que soit l'étendue du balayage.
    return pas ? Math.round(brut / pas) * pas : brut;
  });
}

/** Ramène des valeurs quelconques entre 0 et 1. Une suite constante devient un demi. */
export function normaliser(valeurs: Float32Array): Float32Array {
  let min = Infinity, max = -Infinity;
  for (const v of valeurs) { if (v < min) min = v; if (v > max) max = v; }
  if (!Number.isFinite(min) || max - min < 1e-12) return new Float32Array(valeurs.length).fill(0.5);
  return Float32Array.from(valeurs, (v) => (v - min) / (max - min));
}

/**
 * Inertie : un passe-bas d'ordre un, en aller-retour.
 *
 * C'est l'étage que l'article place entre la caractéristique et le contrôle, et sans lequel une
 * courbe d'énergie fait sauter le paramètre à chaque attaque. L'aller-retour évite le retard :
 * un lissage à sens unique décalerait la courbe par rapport au son qui l'a produite, et le
 * filtre s'ouvrirait après la note.
 */
export function lisser(valeurs: Float32Array, inertie: number): Float32Array {
  const a = Math.min(0.999, Math.max(0, inertie));
  if (a === 0) return Float32Array.from(valeurs);
  const n = valeurs.length;
  const y = new Float32Array(n);
  let etat = valeurs[0] ?? 0;
  for (let i = 0; i < n; i++) { etat += (1 - a) * (valeurs[i] - etat); y[i] = etat; }
  etat = y[n - 1] ?? 0;
  for (let i = n - 1; i >= 0; i--) { etat += (1 - a) * (y[i] - etat); y[i] = etat; }
  return y;
}

// ── Suivre une caractéristique du son ───────────────────────────────────────────

export type Caracteristique = "energie" | "brillance" | "platitude" | "variation";

/** Taille d'analyse : assez longue pour un spectre, assez courte pour suivre un geste. */
const TAILLE = 1024;

/**
 * Extrait une caractéristique du son, à la cadence demandée.
 *
 * Les quatre sont celles qui pilotent le mieux, et elles disent des choses différentes :
 * l'ÉNERGIE suit le geste de l'interprète ; la BRILLANCE — le centroïde du spectre — suit le
 * timbre et monte quand le son devient dur ; la PLATITUDE distingue une note d'un bruit ; la
 * VARIATION — le flux spectral — marque les attaques et retombe pendant les tenues.
 */
export function suivre(
  x: Float32Array, sampleRate: number, quoi: Caracteristique, cadence = CADENCE,
): Courbe {
  const saut = Math.max(1, Math.round(sampleRate / cadence));
  const n = Math.max(1, Math.ceil(x.length / saut));
  const brut = new Float32Array(n);
  const re = new Float64Array(TAILLE), im = new Float64Array(TAILLE);
  let precedent: Float64Array | null = null;

  for (let t = 0; t < n; t++) {
    const debut = t * saut;
    if (quoi === "energie") {
      let s = 0;
      for (let i = debut; i < Math.min(x.length, debut + saut); i++) s += x[i] * x[i];
      brut[t] = Math.sqrt(s / Math.max(1, Math.min(saut, x.length - debut)));
      continue;
    }
    re.fill(0); im.fill(0);
    for (let i = 0; i < TAILLE; i++) {
      const j = debut + i - TAILLE / 2;
      // Fenêtre de Hann, pour que le spectre ne soit pas celui d'un signal coupé net.
      re[i] = (j >= 0 && j < x.length ? x[j] : 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / TAILLE));
    }
    fft(re, im, false);
    const moitie = TAILLE / 2;
    const mod = new Float64Array(moitie);
    for (let k = 0; k < moitie; k++) mod[k] = Math.hypot(re[k], im[k]);

    if (quoi === "brillance") {
      let num = 0, den = 0;
      for (let k = 1; k < moitie; k++) { num += (k * sampleRate / TAILLE) * mod[k]; den += mod[k]; }
      brut[t] = den > 1e-12 ? num / den : 0;
    } else if (quoi === "platitude") {
      // Moyenne géométrique sur moyenne arithmétique : un pour du bruit blanc, zéro pour une
      // sinusoïde. Le logarithme évite que le produit ne s'annule sur mille termes.
      let logSomme = 0, somme = 0, compte = 0;
      for (let k = 1; k < moitie; k++) { logSomme += Math.log(mod[k] + 1e-12); somme += mod[k]; compte++; }
      const geo = Math.exp(logSomme / compte), arith = somme / compte;
      brut[t] = arith > 1e-12 ? geo / arith : 0;
    } else {
      let flux = 0;
      if (precedent) for (let k = 1; k < moitie; k++) flux += Math.max(0, mod[k] - precedent[k]);
      brut[t] = flux;
      precedent = mod;
    }
  }
  return { valeurs: normaliser(brut), cadence };
}

// ── Fabriquer une courbe de toutes pièces ───────────────────────────────────────

/**
 * Les formes disponibles.
 *
 * DEUX OBJETS DIFFÉRENTS PORTENT LE NOM « LOGISTIQUE », et les confondre a été une faute :
 *
 *   `sigmoide`    la FONCTION logistique, 1/(1+e^(−k(t−t₀))), une courbe en S qui monte de zéro à
 *                 un. C'est ce que le mot désigne pour qui trace une courbe, et c'est la forme qui
 *                 manquait à côté de la rampe.
 *   `logistique`  la SUITE logistique, la récurrence x → r·x·(1−x), qui n'a pas de forme mais une
 *                 succession de valeurs, chaotique au-delà de r ≈ 3,57.
 *
 * L'identifiant `logistique` reste attaché à la suite : le changer ferait basculer en silence les
 * graphes enregistrés qui l'emploient, d'une récurrence chaotique vers une courbe en S. Seule
 * l'étiquette affichée est corrigée, et elle dit désormais « Chaos logistique ».
 */
export type FormeCourbe =
  "sinus" | "triangle" | "carre" | "rampe" | "sigmoide" | "logistique" | "aleatoire"
  | "gaussienne" | "poisson" | "gamma" | "khi2" | "weibull" | "ln" | "log10";

export interface OptionsGenerateur {
  dureeSec: number;
  forme: FormeCourbe;
  /** Cycles par seconde, pour les formes périodiques. */
  frequence?: number;
  /** Paramètre r de la suite logistique. Le chaos commence vers 3,57. */
  r?: number;
  /** Où la sigmoïde passe par un demi, en part de la durée, de 0 à 1. Sommet de la gaussienne. */
  centre?: number;
  /** Raideur de la sigmoïde. Basse, elle monte doucement ; haute, elle approche une marche. */
  pente?: number;
  /** Écart type de la gaussienne, en part de la durée. */
  largeur?: number;
  /** Le λ de la loi de Poisson : son espérance, et l'endroit de son sommet. */
  moyenne?: number;
  /** L'ordre k de la loi gamma. */
  ordre?: number;
  /** Les degrés de liberté de la loi du khi-deux. */
  degres?: number;
  /** L'exposant k de la loi de Weibull. */
  exposant?: number;
  graine?: number;
  cadence?: number;
}

// ── Les lois de probabilité, tracées comme des courbes ──────────────────────────
//
// POURQUOI UNE LOI FAIT UNE BONNE COURBE DE MODULATION. Les formes d'un oscillateur disent toutes
// la même chose : un aller-retour régulier, symétrique, sans mémoire. Une densité de probabilité
// dit autre chose, et c'est ce qui manquait à la liste : une montée brusque suivie d'une retombée
// lente, ou l'inverse, avec un seul réglage pour passer continûment de l'une à l'autre. La loi
// gamma d'ordre un est la décroissance exponentielle, celle d'ordre vingt une cloche presque
// symétrique, et tous les intermédiaires existent.
//
// DEUX ENTRÉES DE LA LISTE SE REJOIGNENT, et il vaut mieux l'écrire que de le laisser découvrir :
// la loi du khi-deux à d degrés EST la loi gamma d'ordre d/2. Les deux sont là parce qu'on ne les
// cherche pas sous le même nom.
//
// LE LOGARITHME, LUI, POSAIT UN PIÈGE. Changer la base d'un logarithme le multiplie par une
// constante, et une courbe ramenée entre zéro et un ne montre pas les constantes : `ln` et `log10`
// tracés sur le même intervalle seraient donc le MÊME dessin, à la valeur près. Chacun parcourt
// donc l'intervalle de sa propre base, de 1 à e pour l'un et de 1 à 10 pour l'autre ; ce sont deux
// dessins distincts, et l'écart vient des bornes, non de la base.

/**
 * Coefficients de Lanczos pour g = 7, la variante à neuf termes.
 *
 * D'après Cornelius Lanczos, « A Precision Approximation of the Gamma Function », Journal of the
 * SIAM: Series B, Numerical Analysis 1, 1964.
 */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/**
 * Le logarithme de la fonction gamma.
 *
 * POURQUOI LE LOGARITHME, ET NON Γ LUI-MÊME. Γ croît plus vite que tout : 170! est le dernier
 * factoriel représentable en double précision. Une densité qui s'écrit x^(k−1)·e^(−x)/Γ(k) se
 * calcule donc en additionnant des logarithmes, ce qui la garde juste quelles que soient les bornes
 * des réglages, et évite de diviser un nombre immense par un autre.
 *
 * La formule de réflexion Γ(x)·Γ(1−x) = π/sin(πx) prolonge la série en dessous d'un demi, où elle
 * ne converge pas.
 */
export function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let somme = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) somme += LANCZOS[i] / (z + i);
  // 7,5 est g + 1/2 : la série n'approche Γ que pour ce décalage.
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(somme);
}

/** La cloche, sommet à un en `centre`, d'écart type `largeur`. Les deux sont en part de la durée. */
export function densiteGaussienne(u: number, centre: number, largeur: number): number {
  const z = (u - centre) / Math.max(1e-6, largeur);
  return Math.exp(-0.5 * z * z);
}

/** La masse de la loi de Poisson en `k`, pour une espérance `moyenne`. */
export function masseDePoisson(k: number, moyenne: number): number {
  if (k < 0) return 0;
  const l = Math.max(1e-9, moyenne);
  return Math.exp(k * Math.log(l) - l - logGamma(k + 1));
}

/**
 * La densité de la loi gamma d'ordre `ordre`, d'échelle un.
 *
 * L'ÉCHELLE N'EST PAS UN RÉGLAGE, parce qu'elle ne se verrait pas : elle étire l'axe des x, et le
 * tracé couvre justement l'étendue utile de la loi quelle qu'elle soit. Seul l'ordre change la
 * forme. L'ordre est tenu au-dessus de un : en dessous, la densité part à l'infini en zéro, et le
 * tracé serait une pointe suivie d'une ligne plate.
 */
export function densiteGamma(x: number, ordre: number): number {
  const k = Math.max(1, ordre);
  if (x <= 0) return k === 1 ? 1 : 0;
  return Math.exp((k - 1) * Math.log(x) - x - logGamma(k));
}

/** La densité de la loi du khi-deux à `degres` degrés de liberté, tenus au-dessus de deux. */
export function densiteKhi2(x: number, degres: number): number {
  const d = Math.max(2, Math.round(degres));
  if (x <= 0) return d === 2 ? 0.5 : 0;
  return Math.exp((d / 2 - 1) * Math.log(x) - x / 2 - (d / 2) * Math.LN2 - logGamma(d / 2));
}

/** La densité de la loi de Weibull d'exposant `exposant`, d'échelle un. */
export function densiteWeibull(x: number, exposant: number): number {
  const k = Math.max(1, exposant);
  if (x <= 0) return k === 1 ? 1 : 0;
  return Math.exp(Math.log(k) + (k - 1) * Math.log(x) - x ** k);
}

/** Une loi prête à tracer : sa densité, et jusqu'où la variable va. */
interface Loi {
  /** La densité au point demandé, ou la masse s'il s'agit d'une loi discrète. */
  densite: (x: number) => number;
  /** Jusqu'où va la variable, pour une loi continue. */
  etendue?: number;
  /** Combien de valeurs entières se succèdent, pour une loi discrète. */
  paliers?: number;
}

/**
 * L'étendue à tracer : l'espérance, plus quatre écarts types.
 *
 * QUATRE, PARCE QUE LA QUEUE DOIT ÊTRE RETOMBÉE AVANT LA FIN DU TRACÉ. Une courbe qui se coupe en
 * pleine descente rendrait une modulation qui saute à sa valeur de départ en fin de course.
 */
const etendueUtile = (esperance: number, ecartType: number) => esperance + 4 * ecartType;

/** La loi que la forme demande, ou `null` si la forme n'en est pas une. */
function loiDe(o: OptionsGenerateur): Loi | null {
  switch (o.forme) {
    case "gaussienne": {
      const centre = Math.min(1, Math.max(0, o.centre ?? 0.5));
      const largeur = Math.max(0.005, o.largeur ?? 0.15);
      return { etendue: 1, densite: (u) => densiteGaussienne(u, centre, largeur) };
    }
    case "poisson": {
      const moyenne = Math.max(0.1, o.moyenne ?? 4);
      // Un palier par valeur entière, plus deux : sans eux, une espérance d'un demi ne laisserait
      // que deux paliers, et la forme de la loi ne se lirait pas.
      const paliers = Math.ceil(etendueUtile(moyenne, Math.sqrt(moyenne))) + 3;
      return { paliers, densite: (k) => masseDePoisson(k, moyenne) };
    }
    case "gamma": {
      const ordre = Math.max(1, o.ordre ?? 2);
      return {
        etendue: etendueUtile(ordre, Math.sqrt(ordre)),
        densite: (x) => densiteGamma(x, ordre),
      };
    }
    case "khi2": {
      const degres = Math.max(2, Math.round(o.degres ?? 3));
      return {
        etendue: etendueUtile(degres, Math.sqrt(2 * degres)),
        densite: (x) => densiteKhi2(x, degres),
      };
    }
    case "weibull": {
      const k = Math.max(1, o.exposant ?? 1.5);
      const esperance = Math.exp(logGamma(1 + 1 / k));
      const carre = Math.exp(logGamma(1 + 2 / k));
      return {
        etendue: etendueUtile(esperance, Math.sqrt(Math.max(0, carre - esperance * esperance))),
        densite: (x) => densiteWeibull(x, k),
      };
    }
    default: return null;
  }
}

/**
 * Une loi tracée sur `n` valeurs, son sommet ramené à un.
 *
 * LE SOMMET EST RAMENÉ À UN, LE PIED RESTE OÙ IL EST. Une densité n'a pas de maximum naturel :
 * celle de la loi gamma d'ordre deux culmine à 0,368, et sans division la modulation ne couvrirait
 * que le tiers bas de la plage. Ramener aussi le pied à zéro, en revanche, changerait la forme,
 * puisque le rapport entre le sommet et les épaules en dépend.
 */
function tracerLoi(n: number, loi: Loi): Float32Array {
  const v = new Float32Array(n);
  let sommet = 0;
  for (let i = 0; i < n; i++) {
    const x = loi.paliers
      ? Math.min(loi.paliers - 1, Math.floor((i / n) * loi.paliers))
      : (n > 1 ? i / (n - 1) : 0) * (loi.etendue ?? 1);
    const d = loi.densite(x);
    v[i] = Number.isFinite(d) && d > 0 ? d : 0;
    if (v[i] > sommet) sommet = v[i];
  }
  if (sommet > 0) for (let i = 0; i < n; i++) v[i] /= sommet;
  return v;
}

/**
 * Une courbe fabriquée : oscillateur, rampe, suite logistique ou marche aléatoire.
 *
 * La suite logistique est là pour une raison précise : sept nœuds d'Attic l'ont chacun
 * réimplémentée dans leur coin. Une source unique branchée sur n'importe quel effet fait le même
 * travail, et sur les cent dix-huit plutôt que sur sept.
 */
export function engendrer(o: OptionsGenerateur): Courbe {
  const cadence = o.cadence ?? CADENCE;
  const n = Math.max(1, Math.round(o.dureeSec * cadence));
  // Une loi se trace d'un bloc, et non valeur par valeur : son sommet n'est connu qu'une fois
  // toutes ses valeurs calculées.
  const loi = loiDe(o);
  if (loi) return { valeurs: tracerLoi(n, loi), cadence };
  const v = new Float32Array(n);
  const f = o.frequence ?? 0.5;
  let g = ((o.graine ?? 1) | 0) || 1;
  const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
  let x = 0.4;
  const r = o.r ?? 3.9;
  let marche = 0.5;
  // La sigmoïde, et de quoi la ramener exactement de zéro à un sur la durée demandée.
  const centre = Math.min(1, Math.max(0, o.centre ?? 0.5));
  const pente = Math.max(0.1, o.pente ?? 10);
  const bas = 1 / (1 + Math.exp(pente * centre));
  const haut = 1 / (1 + Math.exp(-pente * (1 - centre)));
  const etendue = haut - bas > 1e-9 ? haut - bas : 1;

  for (let i = 0; i < n; i++) {
    const t = i / cadence;
    const phase = (t * f) % 1;
    switch (o.forme) {
      case "sinus": v[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase); break;
      case "triangle": v[i] = phase < 0.5 ? 2 * phase : 2 - 2 * phase; break;
      case "carre": v[i] = phase < 0.5 ? 0 : 1; break;
      case "rampe": v[i] = n > 1 ? i / (n - 1) : 0; break;
      // Les deux logarithmes montent de zéro à un sur toute la durée, chacun sur l'intervalle de sa
      // base : de 1 à e, et de 1 à 10. Comme la rampe, ils n'ont qu'un seul passage.
      case "ln": v[i] = Math.log(1 + (Math.E - 1) * (n > 1 ? i / (n - 1) : 0)); break;
      case "log10": v[i] = Math.log10(1 + 9 * (n > 1 ? i / (n - 1) : 0)); break;
      case "sigmoide": {
        // La FONCTION logistique, 1/(1+e^(−k(u−u₀))), parcourue une fois sur toute la durée. Elle
        // ne consomme pas la fréquence : comme la rampe, elle n'a qu'un seul passage.
        const u = n > 1 ? i / (n - 1) : 0;
        const brut = 1 / (1 + Math.exp(-pente * (u - centre)));
        // Les bords sont ramenés à zéro et un : à pente faible, la courbe ne partirait pas de zéro
        // et n'atteindrait pas un, et la modulation ne couvrirait pas la plage demandée.
        v[i] = (brut - bas) / etendue;
        break;
      }
      case "logistique":
        // Un pas de la suite par cycle demandé, et non un par valeur : à deux cents valeurs par
        // seconde, la suite défilerait bien trop vite pour s'entendre.
        if (i % Math.max(1, Math.round(cadence / Math.max(0.01, f))) === 0) x = r * x * (1 - x);
        v[i] = Math.min(1, Math.max(0, x));
        break;
      default:
        if (i % Math.max(1, Math.round(cadence / Math.max(0.01, f))) === 0) {
          marche = Math.min(1, Math.max(0, marche + (alea() - 0.5) * 0.6));
        }
        v[i] = marche;
    }
  }
  return { valeurs: v, cadence };
}

/**
 * Les unités qui se parcourent en multipliant, et non en ajoutant.
 *
 * ELLES SE LISENT SUR LE REGISTRE, ce qui évite d'avoir à le décider nœud par nœud. Chaque
 * paramètre du catalogue déclare son unité ; il suffit de savoir lesquelles sont des rapports.
 * Le hertz en est un — doubler, c'est monter d'une octave —, le battement par minute aussi.
 * Le décibel et le demi-ton n'en sont PAS, bien qu'ils décrivent des rapports : ils sont déjà
 * le logarithme d'un rapport, et les traiter à nouveau logarithmiquement les courberait deux fois.
 */
const UNITES_MULTIPLICATIVES = new Set(["Hz", "kHz", "BPM"]);

/**
 * Cette unité se parcourt-elle en multipliant ?
 *
 * EXPORTÉE PARCE QUE DEUX ENDROITS EN DÉCIDAIENT SÉPARÉMENT. L'inspecteur traçait déjà un curseur
 * logarithmique, mais sur la seule comparaison à « Hz » — un réglage en kilohertz ou en battements
 * par minute y gardait donc un curseur linéaire, pendant que la modulation du même paramètre, elle,
 * le parcourait logarithmiquement. Deux réponses à la même question, et rien pour les tenir
 * d'accord à la prochaine unité ajoutée.
 */
export const estUniteMultiplicative = (unite?: string): boolean =>
  UNITES_MULTIPLICATIVES.has((unite ?? "").trim());

/**
 * La progression qu'un paramètre appelle, déduite de ce qu'il déclare.
 *
 * C'EST LE POINT OÙ L'INFORMATION EXISTAIT DÉJÀ SANS SERVIR. Le registre porte pour chaque réglage
 * son unité, sa plage et son pas ; la bonne répartition d'un balayage s'en déduit, et n'a donc pas
 * à être choisie à la main sur chaque effet — où elle finirait par être oubliée sur la moitié
 * d'entre eux.
 *
 * Le pas n'est repris que s'il vaut un ou plus. En dessous, c'est une finesse d'affichage du
 * curseur — un dixième de décibel — et non un cran que le son devrait respecter ; l'imposer
 * hacherait une modulation continue en escalier pour rien.
 */
export function progressionPour(
  p: { unite?: string; pas?: number } | undefined,
): { echelle: Echelle; pas?: number } {
  const unite = (p?.unite ?? "").trim();
  return {
    echelle: estUniteMultiplicative(unite) ? "logarithmique" : "lineaire",
    pas: p?.pas && p.pas >= 1 ? p.pas : undefined,
  };
}

/**
 * Les valeurs d'un paramètre, échantillon par échantillon — modulé ou non.
 *
 * C'EST LA FONCTION QUI REND L'INVARIANT VRAI PAR CONSTRUCTION. Un effet qui l'appelle n'a pas
 * deux chemins de calcul, un « modulé » et un « ordinaire » qui pourraient diverger : il en a
 * un seul, et l'absence de courbe est simplement une courbe constante à la valeur du réglage.
 * Une ligne par effet, et rien à faire dériver.
 */
export function valeursParametre(
  courbe: unknown, n: number, scalaire: number, plage: MiseEnForme,
): Float32Array {
  if (!estCourbe(courbe)) return new Float32Array(n).fill(scalaire);
  return mettreEnForme(reechantillonner(courbe, n), plage);
}

/**
 * La valeur d'un réglage à l'échantillon `i`, qu'il soit constant ou piloté par une courbe.
 *
 * POURQUOI UN SEUL CHEMIN. Un effet qui accepte une modulation garde toujours son réglage fixe :
 * sans courbe branchée, il doit rendre EXACTEMENT ce qu'il rendait. Écrire deux branches, une pour
 * le scalaire et une pour le tableau, c'est accepter qu'elles divergent un jour. Le cœur de l'effet
 * lit donc toujours par cette fonction, et le scalaire est le cas dégénéré du tableau.
 *
 * Au-delà de la fin du tableau, la dernière valeur est tenue : une courbe plus courte que le son ne
 * doit pas le faire retomber à zéro.
 */
export const valeurA = (v: number | Float32Array, i: number): number =>
  typeof v === "number" ? v : (v[i] ?? v[v.length - 1] ?? 0);

/**
 * Applique un gain qui varie, échantillon par échantillon.
 *
 * Existe ici, et non dans le nœud, pour que L'INVARIANT SOIT TESTABLE : un gain constant doit
 * rendre exactement ce que rend une multiplication par un scalaire. Si cela ne tient pas, la
 * modulation a changé autre chose que ce qu'elle devait.
 */
export function appliquerGain(x: Float32Array, gains: Float32Array): Float32Array {
  return Float32Array.from(x, (v, i) => v * (gains[i] ?? gains[gains.length - 1] ?? 1));
}
