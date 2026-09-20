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

export interface MiseEnForme {
  /** Ce que zéro veut dire, dans l'unité du consommateur. */
  min: number;
  /** Ce que un veut dire. */
  max: number;
  /** Courbure : 1 est linéaire, 2 écrase le bas, 0,5 le dilate. */
  puissance?: number;
  inverser?: boolean;
}

/** Traduit une courbe de 0-1 vers l'unité du consommateur. */
export function mettreEnForme(valeurs: Float32Array, o: MiseEnForme): Float32Array {
  const p = o.puissance ?? 1;
  return Float32Array.from(valeurs, (v) => {
    const borne = Math.min(1, Math.max(0, v));
    const courbe = p === 1 ? borne : borne ** p;
    const u = o.inverser ? 1 - courbe : courbe;
    return o.min + (o.max - o.min) * u;
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

export type FormeCourbe = "sinus" | "triangle" | "carre" | "rampe" | "logistique" | "aleatoire";

export interface OptionsGenerateur {
  dureeSec: number;
  forme: FormeCourbe;
  /** Cycles par seconde, pour les formes périodiques. */
  frequence?: number;
  /** Paramètre r de la suite logistique. Le chaos commence vers 3,57. */
  r?: number;
  graine?: number;
  cadence?: number;
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
  const v = new Float32Array(n);
  const f = o.frequence ?? 0.5;
  let g = ((o.graine ?? 1) | 0) || 1;
  const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
  let x = 0.4;
  const r = o.r ?? 3.9;
  let marche = 0.5;

  for (let i = 0; i < n; i++) {
    const t = i / cadence;
    const phase = (t * f) % 1;
    switch (o.forme) {
      case "sinus": v[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase); break;
      case "triangle": v[i] = phase < 0.5 ? 2 * phase : 2 - 2 * phase; break;
      case "carre": v[i] = phase < 0.5 ? 0 : 1; break;
      case "rampe": v[i] = n > 1 ? i / (n - 1) : 0; break;
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
 * Applique un gain qui varie, échantillon par échantillon.
 *
 * Existe ici, et non dans le nœud, pour que L'INVARIANT SOIT TESTABLE : un gain constant doit
 * rendre exactement ce que rend une multiplication par un scalaire. Si cela ne tient pas, la
 * modulation a changé autre chose que ce qu'elle devait.
 */
export function appliquerGain(x: Float32Array, gains: Float32Array): Float32Array {
  return Float32Array.from(x, (v, i) => v * (gains[i] ?? gains[gains.length - 1] ?? 1));
}
