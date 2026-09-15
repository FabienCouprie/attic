// audio/dirac.ts — La ceinture de Dirac : un tour autour de l'auditeur ne suffit
// pas à revenir, il en faut deux.
//
// LA PROPRIÉTÉ. Tenez un objet attaché à une ceinture et faites-le tourner d'un
// tour complet sur lui-même : il est revenu à sa place, mais la ceinture reste
// tordue, et aucun mouvement ne la dénoue sans refaire tourner l'objet. Au bout
// de DEUX tours, elle se dénoue. C'est la propriété des rotations dans l'espace
// que portent les spineurs en physique : un tour de 360° change leur signe, 720°
// le rétablit.
//
// EN AUDIO. Le son fait le tour de l'auditeur — devant, droite, derrière,
// gauche — pendant qu'on fait tourner sa phase deux fois moins vite, comme un
// spineur. Au bout d'un tour, il est revenu devant, mais inversé ; au bout de
// deux, intact.
//
// LE TÉMOIN. Un signal inversé ne se distingue pas de l'original à l'oreille :
// seul, le changement de signe est inaudible. Le nœud place donc devant
// l'auditeur une copie FIXE du son, le témoin. Quand le son qui tourne revient
// devant après un tour, il est l'opposé du témoin et s'annule contre lui : le
// silence tombe exactement au moment où il « est revenu ». Au second tour, les
// deux s'additionnent de nouveau. C'est la ceinture tordue rendue audible.
//
// LA LIMITE DE LA STÉRÉO. Deux haut-parleurs ne savent pas placer un son
// derrière soi. La position latérale est rendue par un panoramique (sin θ) ;
// l'arrière est simulé par un son plus faible et plus sourd. Sans fonctions de
// transfert de tête (HRTF), qui ne sont pas dans le projet, c'est une
// approximation, et elle est dite comme telle.

import { quadrature, planBoucle, bouclerAvecFondu, versAudioBuffer, canauxDe } from "./geometrie-sonore";

export { DUREE_SORTIE_MAX_SEC } from "./geometrie-sonore";

export type OptionsDirac = {
  tours: number;
  fonduSec: number;
  /** 0 = pas de témoin (le signe est inaudible) ; 1 = témoin au même niveau (annulation complète). */
  temoin: number;
  /** Atténuation à l'arrière, en dB (positive). */
  arriereDb: number;
  /** Fréquence de coupure du son à l'arrière, en Hz. */
  coupureHz: number;
};

/** Passe-bas du premier ordre : l'indice d'arrière le plus simple, et sans résonance. */
function passeBas(x: Float32Array, coupureHz: number, sampleRate: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * coupureHz) / sampleRate);
  const y = new Float32Array(x.length);
  let etat = 0;
  for (let n = 0; n < x.length; n++) {
    etat = (1 - a) * x[n] + a * etat;
    y[n] = etat;
  }
  return y;
}

export function tournerDirac(entree: Float32Array[], sampleRate: number, o: OptionsDirac) {
  const longueur = entree[0].length;
  const plan = planBoucle(longueur, sampleRate, o);

  // Le son qui tourne est un point : l'entrée est ramenée en mono.
  const mono = new Float32Array(longueur);
  for (const c of entree) for (let i = 0; i < longueur; i++) mono[i] += c[i] / entree.length;

  const boucle = bouclerAvecFondu(mono, plan.tours, plan.fondu);
  const X = quadrature(boucle);
  const B = quadrature(passeBas(boucle, o.coupureHz, sampleRate));

  const t = Math.max(0, Math.min(1, o.temoin));
  // Témoin et source tournante au même poids à 100 % : c'est la condition de
  // l'annulation complète. La somme des deux poids vaut 1, pour que le niveau
  // au départ ne dépende pas du réglage.
  const poidsTemoin = t / 2, poidsSource = 1 - t / 2;
  const gainArriere = 10 ** (-Math.max(0, o.arriereDb) / 20);
  const centre = Math.SQRT1_2;

  const L = new Float32Array(plan.total), R = new Float32Array(plan.total);
  for (let n = 0; n < plan.total; n++) {
    const theta = (2 * Math.PI * n) / plan.pas; // azimut : un tour par tour
    const psi = theta / 2; // phase du spineur : deux fois moins vite
    const c = Math.cos(psi), s = Math.sin(psi);
    // Poids de l'arrière, nul devant : l'annulation contre le témoin se fait donc
    // sur le son d'origine, sans que le passe-bas ne s'en mêle.
    const w = (1 - Math.cos(theta)) / 2;
    const direct = X.p[n] * c + X.q[n] * s;
    const sourd = B.p[n] * c + B.q[n] * s;
    const source = ((1 - w) * direct + w * gainArriere * sourd) * poidsSource;

    const pan = Math.sin(theta);
    const angle = ((pan + 1) * Math.PI) / 4;
    const temoin = poidsTemoin * X.p[n] * centre;
    L[n] = source * Math.cos(angle) + temoin;
    R[n] = source * Math.sin(angle) + temoin;
  }
  return { canaux: [L, R] as [Float32Array, Float32Array], plan };
}

export function rendreDirac(buffer: AudioBuffer, o: OptionsDirac) {
  const r = tournerDirac(canauxDe(buffer), buffer.sampleRate, o);
  return { sortie: versAudioBuffer(r.canaux, buffer.sampleRate), resultat: r };
}
