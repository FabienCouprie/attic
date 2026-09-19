// audio/retard-spectral.ts — Retarder le grave plus que l'aigu, continûment.
//
// D'après Vesa Välimäki, Jonathan S. Abel et Julius O. Smith III, « Spectral Delay Filters »,
// Journal of the Audio Engineering Society 57(7-8), 2009, p. 521-531 ; et la suite à coefficients
// variables : Jussi Pekonen et Vesa Välimäki, « Spectral Delay Filters with Feedback and
// Time-Varying Coefficients », DAFx-09.
//
// CE QUI MANQUAIT, et c'est ce qui a fait choisir cet effet : sur cent vingt et un effets, aucun
// ne retarde une FRÉQUENCE plus qu'une autre. Le flanger, le phaser, l'écho, le délai stéréo
// retardent tout le signal du même temps — ils ne font varier que le montant, jamais sa
// répartition dans le spectre. Ici le grave peut arriver cent millisecondes après l'aigu, sans
// qu'aucun filtre ne coupe quoi que ce soit : le son n'est pas filtré, il est ÉTALÉ.
//
// COMMENT. Un passe-tout du premier ordre, `H(z) = (a + z⁻¹)/(1 + a·z⁻¹)`, ne change aucune
// amplitude — d'où son nom — mais retarde chaque fréquence d'un temps différent :
//
//     τ(ω) = (1 − a²) / (1 + 2a·cos ω + a²)   échantillons
//
// À coefficient positif, ce temps vaut `(1−a)/(1+a)` au grave et `(1+a)/(1−a)` à l'aigu : pour
// a = 0,9, dix-neuf échantillons à l'aigu contre un vingtième au grave. Le SIGNE du coefficient
// décide donc du sens, et il n'y a rien d'autre à régler pour l'inverser. Une section ne fait
// presque rien ; on en met des centaines, et les retards s'additionnent.
//
// CE QUE LA RÉACTION AJOUTE (DAFx-09) : renvoyer la sortie dans la cascade donne une suite
// d'échos dont chacun est PLUS dispersé que le précédent — le premier est un son, le dixième une
// traînée. Le rebouclage passe par un retard d'un échantillon, sans quoi la boucle n'aurait pas
// d'ordre de calcul : la cascade a beau retarder, son premier terme, `a^M·x[n]`, est instantané.
//
// CE QUE LES COEFFICIENTS VARIABLES AJOUTENT : c'est le second article, et c'est ce que le type
// `courbe` d'Attic permet sans rien écrire de plus — la dispersion devient elle-même un geste.
import { estCourbe, valeursParametre, type MiseEnForme } from "./courbe";

/** Retard de groupe d'UNE section, en échantillons, à la pulsation ω. */
export function retardDeGroupe(a: number, omega: number): number {
  const den = 1 + 2 * a * Math.cos(omega) + a * a;
  return Math.abs(den) < 1e-12 ? Infinity : (1 - a * a) / den;
}

export interface OptionsRetardSpectral {
  /** Nombre de sections en cascade. C'est lui qui fait l'ampleur du retard. */
  sections: number;
  /** Force de la dispersion, entre 0 et 1 (exclus). Zéro : aucune, la cascade devient un retard. */
  dispersion: number;
  /** Vrai : le GRAVE est retardé (coefficient négatif). Faux : l'aigu. */
  versLeGrave: boolean;
  /** Gain de rebouclage, entre 0 et 1 (exclus). */
  reaction?: number;
  /** Proportion de son traité, entre 0 et 1. */
  melange?: number;
  /**
   * Dispersion variable dans le temps, une valeur par échantillon (article de 2009 suivi de
   * DAFx-09). Absente, la dispersion est constante — et le résultat est alors exactement celui
   * d'une courbe constante, par construction : il n'y a qu'un seul chemin de calcul.
   */
  courbe?: unknown;
  /** Ce que zéro et un de la courbe veulent dire, en dispersion. */
  plage?: MiseEnForme;
  /**
   * Borne de la traîne, en échantillons.
   *
   * Elle n'est pas un garde-fou de confort : la traîne croît comme `(1+a)/(1−a)`, donc sans
   * limite quand la dispersion approche un. À 0,999 et quatre cents sections, elle vaut huit
   * cent mille échantillons — dix-huit secondes à 44,1 kHz — et le rebouclage la répète. Sans
   * borne, un réglage poussé demande des milliards d'opérations et l'application paraît figée.
   */
  traineMax?: number;
}

/** Combien de temps la traîne dure au plus, pour ne pas la couper : le retard du bout le plus lent. */
export function longueurTraine(sections: number, dispersion: number): number {
  const a = Math.min(0.999, Math.abs(dispersion));
  return Math.ceil(sections * ((1 + a) / (1 - a)));
}

/**
 * La cascade, échantillon par échantillon.
 *
 * Le calcul est direct et il n'y a pas mieux : chaque section a besoin de l'état de la précédente
 * à l'échantillon courant, si bien que la boucle est intrinsèquement séquentielle. Le coût est
 * donc `sections × échantillons`, et c'est le réglage « Sections » qui décide du temps de calcul.
 *
 * La sortie est PLUS LONGUE que l'entrée : la traîne du bout le plus lent du spectre continue
 * après la fin du son, et la couper reviendrait à jeter l'effet même qu'on cherche.
 */
export function retardSpectral(x: Float32Array, o: OptionsRetardSpectral): Float32Array {
  const M = Math.max(1, Math.round(o.sections));
  const signe = o.versLeGrave ? -1 : 1;
  const dispersionFixe = Math.min(0.999, Math.max(0, o.dispersion));
  const reaction = Math.min(0.99, Math.max(0, o.reaction ?? 0));
  const melange = Math.min(1, Math.max(0, o.melange ?? 1));

  const plage = o.plage ?? { min: 0, max: 0.99 };
  // La traîne se mesure sur la dispersion la PLUS FORTE que le rendu atteindra. Avec une courbe
  // branchée, c'est le haut de la plage et non le réglage — lequel ne sert alors à rien : calculer
  // la traîne sur lui donnerait deux longueurs différentes pour un même effet, et l'invariant de
  // la courbe plate tomberait sur cette seule différence.
  const dispersionMax = estCourbe(o.courbe)
    ? Math.min(0.999, Math.max(Math.abs(plage.min), Math.abs(plage.max)))
    : dispersionFixe;
  const traine = longueurTraine(M, dispersionMax);
  // Avec réaction, la traîne se répète tant que le gain n'a pas décru sous l'audible.
  const tours = reaction > 0 ? Math.min(40, Math.ceil(Math.log(1e-4) / Math.log(reaction))) : 1;
  const n = x.length + Math.min(o.traineMax ?? 8 * x.length, traine * tours);

  // Un seul chemin de calcul : sans courbe branchée, `valeursParametre` rend une constante à la
  // valeur du réglage. L'effet modulé et l'effet ordinaire ne peuvent donc pas diverger.
  const dispersions = valeursParametre(o.courbe, n, dispersionFixe, plage);

  const etatX = new Float64Array(M); // entrée précédente de chaque section
  const etatY = new Float64Array(M); // sortie précédente de chaque section
  const sortie = new Float32Array(n);
  let retour = 0; // la sortie de la cascade au pas précédent — le retard d'un échantillon

  for (let i = 0; i < n; i++) {
    const a = signe * Math.min(0.999, Math.max(0, dispersions[i]));
    let v = (i < x.length ? x[i] : 0) + reaction * retour;
    for (let m = 0; m < M; m++) {
      const u = v;
      // y[n] = a·x[n] + x[n−1] − a·y[n−1]
      v = a * u + etatX[m] - a * etatY[m];
      etatX[m] = u;
      etatY[m] = v;
    }
    retour = v;
    const sec = i < x.length ? x[i] : 0;
    sortie[i] = melange * v + (1 - melange) * sec;
  }
  return sortie;
}
