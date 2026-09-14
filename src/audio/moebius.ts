// audio/moebius.ts — Le son parcourt un anneau de Möbius.
//
// LA GÉOMÉTRIE, ET CE QU'ELLE DEVIENT EN AUDIO.
//
// Le son est posé le long de la bande : un tour d'anneau, c'est la durée du son.
// En avançant, la section de la bande pivote d'un demi-tour. Après un tour, on
// revient au point de départ… mais sur l'autre face, gauche et droite échangées.
// Il faut un DEUXIÈME tour pour retrouver sa position d'origine. C'est toute la
// propriété de l'anneau, et c'est elle que le nœud rend audible : un angle φ qui
// croît de π par tour, une transformation R(φ) continue avec R(0) = identité,
// R(π) = « l'autre face », R(2π) = identité.
//
// Deux lectures de « l'autre face » sont proposées.
//
// STÉRÉO. La largeur de la bande est la largeur stéréo. En Mid/Side, M = (L+R)/2
// porte le centre et S = (L−R)/2 l'écart gauche/droite. La section qui pivote,
// c'est S qui tourne : S' = S·cos φ + Ŝ·sin φ, où Ŝ est S déphasé de 90°. À
// φ = π, S' = −S : gauche et droite sont échangées. Le déphasage n'est pas un
// raffinement. Une rotation « plate », S·cos φ, ferait passer la bande par la
// tranche à mi-tour — le son deviendrait mono, puis s'élargirait de nouveau. Le
// terme en quadrature garde l'énergie de S constante : l'image pivote sans
// jamais s'écraser au centre, l'axe perpendiculaire à la stéréo étant porté par
// la phase.
//
// PHASE. La face est le signe du signal : y = x·cos φ + x̂·sin φ, soit −x à mi-
// parcours. Faire tourner la phase du signal analytique à vitesse constante,
// c'est le décaler en fréquence de φ'/2π — ici d'un demi-hertz divisé par la
// durée d'un tour. C'est un décaleur de fréquence de Bode très lent. Seul, il
// s'entend à peine. Mélangé à parts égales au son d'origine, il ne produit PAS
// le balayage de creux d'un phaser : l'original passe par le même déphaseur, si
// bien que l'écart de phase entre les deux est le même à toutes les fréquences.
// C'est le son ENTIER qui s'éteint au bout d'un tour — les deux faces
// s'annulent — et revient au bout de deux. Mesuré : −3 dB à mi-tour, −33 dB à
// un tour, 0 dB à deux. Une première version de cette documentation promettait
// un balayage de peigne ; la mesure l'a démentie.
//
// LA COUTURE. Un son n'est pas une boucle : sa fin ne rejoint pas son début. On
// la coud par un fondu enchaîné, le tour suivant démarrant avant la fin du
// précédent. La rotation, elle, dépend du temps de sortie et reste continue à
// travers la couture.
//
// Les briques — quadrature, couture, rotations — vivent dans geometrie-sonore.ts,
// partagées avec le tore, la bouteille de Klein et la ceinture de Dirac.
import {
  quadrature, planBoucle, bouclerAvecFondu, versMidSide, tournerMidSide, tournerPhase,
  versAudioBuffer, canauxDe,
} from "./geometrie-sonore";

export { DUREE_SORTIE_MAX_SEC } from "./geometrie-sonore";

export type FaceMoebius = "stereo" | "phase";

export type OptionsMoebius = {
  face: FaceMoebius;
  /** Nombre de tours d'anneau. Deux referment l'anneau ; un nombre impair finit sur l'autre face. */
  tours: number;
  /** Durée du fondu à chaque couture, en secondes. */
  fonduSec: number;
  /** 0 = son d'origine, 1 = son transformé seul. */
  melange: number;
};

export const planMoebius = planBoucle;

export type ResultatMoebius = {
  canaux: Float32Array[];
  /** L'entrée n'avait pas de largeur et a été posée sur le bord gauche de la bande. */
  poseeSurLeBord: boolean;
  /** Décalage de fréquence équivalent, en Hz (face « phase »). */
  decalageHz: number;
  plan: ReturnType<typeof planBoucle>;
};

/**
 * Le cœur, sur des tableaux : testable sans AudioBuffer.
 *
 * φ(t) = π · t / pas : un demi-tour de bande par tour d'anneau, compté sur le
 * temps de SORTIE. La rotation est donc continue à travers les coutures, qui ne
 * concernent que le son.
 */
export function tordre(entree: Float32Array[], sampleRate: number, o: OptionsMoebius): ResultatMoebius {
  const plan = planBoucle(entree[0].length, sampleRate, o);
  const vitesse = Math.PI / plan.pas;
  const angle = (n: number) => vitesse * n;

  if (o.face === "phase") {
    const canaux = entree.map((c) => tournerPhase(quadrature(bouclerAvecFondu(c, plan.tours, plan.fondu)), angle, o.melange));
    return { canaux, poseeSurLeBord: false, decalageHz: sampleRate / (2 * plan.pas), plan };
  }

  const { mid, side, poseeSurLeBord } = versMidSide(entree);
  const M = quadrature(bouclerAvecFondu(mid, plan.tours, plan.fondu));
  const S = quadrature(bouclerAvecFondu(side, plan.tours, plan.fondu));
  return { canaux: tournerMidSide(M, S, null, angle, o.melange), poseeSurLeBord, decalageHz: 0, plan };
}

export function rendreMoebius(buffer: AudioBuffer, o: OptionsMoebius): { sortie: AudioBuffer; resultat: ResultatMoebius } {
  const resultat = tordre(canauxDe(buffer), buffer.sampleRate, o);
  return { sortie: versAudioBuffer(resultat.canaux, buffer.sampleRate), resultat };
}
