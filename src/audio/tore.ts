// audio/tore.ts — Le son parcourt un tore : deux cercles, et un retour qui se
// fait attendre.
//
// LA PROPRIÉTÉ. Un tore est le produit de deux cercles. On y avance sur les deux
// à la fois, chacun à sa vitesse. Si les vitesses sont dans un rapport p:q
// (irréductible), la trajectoire ne se referme qu'après q tours du premier
// cercle ; si le rapport est irrationnel, elle ne se referme JAMAIS — elle finit
// par passer aussi près qu'on veut de chaque point, sans repasser par aucun.
// C'est cette attente du retour que le nœud rend audible.
//
// LES DEUX CERCLES EN AUDIO.
//
// Cercle α — la POSITION. L'image stéréo fait un tour complet par tour (la
// durée du son) : gauche, centre, droite, centre, gauche. Même rotation Mid/Side
// en quadrature que l'anneau de Möbius, mais sur 2π au lieu de π : ici, pas de
// torsion, chaque tour ramène la position.
//
// Cercle β — le NIVEAU. La phase du son entier tourne à la vitesse p/q tour par
// tour, et se mêle à sa version non tournée. L'écart de phase étant le même à
// toutes les fréquences (les deux passent par le même déphaseur), c'est le
// niveau entier qui suit 2·|cos(β/2)| : plein à β = 0, éteint à β = π à
// profondeur maximale. Mesurer ce cercle-là n'a rien de subjectif : c'est un
// niveau.
//
// On entend donc un son qui tourne autour de la tête pendant que son niveau
// respire à une autre période. Les deux ne retombent ensemble en phase qu'au
// tour q — ou jamais, pour le nombre d'or.

import {
  quadrature, planBoucle, bouclerAvecFondu, versMidSide, versAudioBuffer, canauxDe,
} from "./geometrie-sonore";

export { DUREE_SORTIE_MAX_SEC } from "./geometrie-sonore";

export const NOMBRE_OR = (1 + Math.sqrt(5)) / 2;

export type RapportTore = "1:1" | "1:2" | "2:3" | "3:5" | "5:8" | "or";

/**
 * Vitesse du cercle β en tours par tour du cercle α, et nombre de tours au bout
 * duquel la trajectoire se referme (null : jamais).
 *
 * Pour le nombre d'or, β va à 1/φ ≈ 0,618 tour par tour : c'est l'inverse, et
 * non φ lui-même, pour que le niveau respire plus lentement que la position —
 * les deux sont irrationnels, le choix ne change que la lisibilité.
 */
export function vitesseEtFermeture(r: RapportTore): { vitesseBeta: number; fermeture: number | null } {
  switch (r) {
    case "1:1": return { vitesseBeta: 1, fermeture: 1 };
    case "1:2": return { vitesseBeta: 1 / 2, fermeture: 2 };
    case "2:3": return { vitesseBeta: 2 / 3, fermeture: 3 };
    case "3:5": return { vitesseBeta: 3 / 5, fermeture: 5 };
    case "5:8": return { vitesseBeta: 5 / 8, fermeture: 8 };
    case "or": return { vitesseBeta: 1 / NOMBRE_OR, fermeture: null };
  }
}

/**
 * Le tour, parmi 1…tours, où le cercle β est passé le plus près de son départ,
 * et l'écart en degrés. Le cercle α, lui, est revenu à chaque tour entier.
 * C'est ce que le message annonce pour un rapport irrationnel : la trajectoire
 * ne se referme pas, mais elle frôle son départ aux termes de Fibonacci.
 */
export function plusProcheRetour(vitesseBeta: number, tours: number): { tour: number; ecartDeg: number } {
  let meilleur = { tour: 1, ecartDeg: 360 };
  for (let u = 1; u <= tours; u++) {
    const frac = (u * vitesseBeta) % 1;
    const ecart = Math.min(frac, 1 - frac) * 360;
    if (ecart < meilleur.ecartDeg - 1e-9) meilleur = { tour: u, ecartDeg: ecart };
  }
  return meilleur;
}

export type OptionsTore = {
  rapport: RapportTore;
  tours: number;
  fonduSec: number;
  /** 0 = le cercle du niveau est immobile ; 1 = extinction complète à β = π. */
  profondeur: number;
};

export type ResultatTore = {
  canaux: [Float32Array, Float32Array];
  poseeSurLeBord: boolean;
  plan: ReturnType<typeof planBoucle>;
  vitesseBeta: number;
  fermeture: number | null;
  refermee: boolean;
  /** Pour un rapport irrationnel : le retour le plus proche dans les tours joués. */
  plusProche: { tour: number; ecartDeg: number } | null;
};

export function tordreTore(entree: Float32Array[], sampleRate: number, o: OptionsTore): ResultatTore {
  const plan = planBoucle(entree[0].length, sampleRate, o);
  const { vitesseBeta, fermeture } = vitesseEtFermeture(o.rapport);
  const { mid, side, poseeSurLeBord } = versMidSide(entree);
  const M = quadrature(bouclerAvecFondu(mid, plan.tours, plan.fondu));
  const S = quadrature(bouclerAvecFondu(side, plan.tours, plan.fondu));

  // Profondeur 1 ↔ mélange à parts égales, le seul qui éteigne entièrement le
  // son à β = π. Au-delà de 1/2, le niveau ne s'annulerait plus.
  const m = Math.max(0, Math.min(1, o.profondeur)) / 2;
  const deuxPi = 2 * Math.PI;
  const L = new Float32Array(plan.total), R = new Float32Array(plan.total);
  const rot = (x: typeof M, n: number, a: number) => x.p[n] * Math.cos(a) + x.q[n] * Math.sin(a);

  for (let n = 0; n < plan.total; n++) {
    const u = n / plan.pas; // tours écoulés
    const alpha = deuxPi * u;
    const beta = deuxPi * vitesseBeta * u;
    // La position α s'applique aux DEUX termes du mélange : sans quoi, à β = π,
    // le mélange annulerait aussi l'écart gauche/droite et l'image s'écraserait.
    const Mn = (1 - m) * M.p[n] + m * rot(M, n, beta);
    const Sn = (1 - m) * rot(S, n, alpha) + m * rot(S, n, alpha + beta);
    L[n] = Mn + Sn;
    R[n] = Mn - Sn;
  }

  const refermee = fermeture !== null && plan.tours % fermeture === 0;
  return {
    canaux: [L, R], poseeSurLeBord, plan, vitesseBeta, fermeture, refermee,
    plusProche: fermeture === null ? plusProcheRetour(vitesseBeta, plan.tours) : null,
  };
}

export function rendreTore(buffer: AudioBuffer, o: OptionsTore) {
  const resultat = tordreTore(canauxDe(buffer), buffer.sampleRate, o);
  return { sortie: versAudioBuffer(resultat.canaux, buffer.sampleRate), resultat };
}
