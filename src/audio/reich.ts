// audio/reich.ts — Le déphasage de Steve Reich.
//
// Découvert par accident en 1965 : Reich fait tourner deux copies d'une même
// bande (« It's Gonna Rain ») sur deux magnétophones dont les moteurs ne
// tournent pas exactement à la même vitesse. Les copies, d'abord à l'unisson,
// se décalent lentement — et ce décalage produit des motifs que personne n'a
// composés. Il transposera le procédé aux instruments avec « Piano Phase »
// (1967), où deux pianistes jouent le même motif, l'un accélérant
// imperceptiblement.
//
// Ce qui rend le procédé fascinant tient à sa gratuité : aucune note n'est
// ajoutée, aucun traitement appliqué. Tout ce qu'on entend — les motifs
// composites, les accents qui se déplacent, la pseudo-polyrythmie — n'est que la
// conséquence d'un écart de vitesse minuscule. La musique est déjà entièrement
// contenue dans le matériau ; il suffit de le décaler d'avec lui-même.
//
// Le cycle est calculable, et c'est ce qui distingue le déphasage d'une simple
// dérive : quand le décalage atteint une longueur de boucle entière, les voix
// se retrouvent à l'unisson. Pour un écart relatif e et une boucle de L
// secondes, cela survient au bout de L/e secondes — et le motif entier
// recommence.

import { boucleSansCouture } from "./risset";

export interface OptionsDephasage {
  /** Durée du son produit. */
  dureeSec: number;
  /** Écart de vitesse entre deux voix consécutives, en fraction (0,005 = 0,5 %). */
  ecart: number;
  /** Nombre de voix. Deux suffisent au procédé ; davantage épaissit la texture. */
  voix: number;
  /** Étalement des voix dans l'image stéréo, de 0 (superposées) à 1 (aux extrêmes). */
  stereo?: number;
  fonduBoucleSec?: number;
}

/**
 * Longueur RÉELLE de la boucle, en secondes, une fois le fondu de raccord
 * appliqué.
 *
 * `boucleSansCouture` raccourcit la source de la durée du fondu — sans quoi le
 * raccord ne serait pas possible. Calculer la période de réunion à partir de la
 * longueur d'origine donne donc une valeur fausse : sur une boucle de 0,5 s avec
 * 50 ms de fondu, la boucle effective vaut 0,45 s et la réunion survient au bout
 * de 9 s et non de 10. Exposé pour que l'appelant ne puisse pas se tromper.
 */
export function longueurBoucleEffectiveSec(buffer: AudioBuffer, fonduSec = 0.05): number {
  return boucleSansCouture(buffer, fonduSec).length / buffer.sampleRate;
}

/**
 * Écart de vitesse produisant une période de réunion donnée. C'est ainsi qu'on
 * règle le procédé musicalement : on choisit la durée du cycle, pas une
 * différence de vitesse en pourcentage, qui ne dit rien à l'oreille.
 */
export function ecartPourPeriode(buffer: AudioBuffer, periodeSec: number, fonduSec = 0.05): number {
  const boucle = longueurBoucleEffectiveSec(buffer, fonduSec);
  if (periodeSec <= 0) return 0;
  return boucle / periodeSec;
}

/**
 * Temps au bout duquel les voix reviennent à l'unisson, en secondes.
 *
 * La voix k avance `k·e` fois plus vite ; son décalage par rapport à la première
 * croît donc linéairement, et l'unisson se reproduit quand ce décalage vaut une
 * boucle entière. Exposé parce que c'est LA grandeur qui permet de régler le
 * nœud musicalement : on choisit la durée du cycle, pas l'écart de vitesse.
 */
export function periodeReunion(longueurBoucleSec: number, ecart: number): number {
  if (ecart <= 0) return Infinity;
  return longueurBoucleSec / ecart;
}

/** Lecture interpolée linéairement, rebouclée sur la source. */
function lire(canal: Float32Array, pos: number): number {
  const len = canal.length;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = canal[((i % len) + len) % len];
  const b = canal[(((i + 1) % len) + len) % len];
  return a * (1 - f) + b * f;
}

export function dephasage(buffer: AudioBuffer, options: OptionsDephasage): AudioBuffer {
  const sr = buffer.sampleRate;
  const nSorties = Math.max(1, Math.round(options.dureeSec * sr));
  const nVoix = Math.max(2, Math.round(options.voix));
  const stereo = Math.max(0, Math.min(1, options.stereo ?? 0.8));

  // La source doit boucler proprement : c'est une bande sans fin qu'on imite,
  // et un clic à chaque tour se retrouverait à un endroit différent dans chaque
  // voix — donc audible en permanence plutôt qu'une fois par tour.
  const src = boucleSansCouture(buffer, options.fonduBoucleSec ?? 0.05);
  const canalSrc = src.getChannelData(0);

  // Toujours stéréo : le déphasage s'entend surtout quand les voix occupent des
  // places différentes. En mono, les motifs composites restent audibles mais la
  // séparation des voix disparaît.
  const out = new AudioBuffer({ numberOfChannels: 2, length: nSorties, sampleRate: sr });
  const gauche = out.getChannelData(0);
  const droite = out.getChannelData(1);

  for (let k = 0; k < nVoix; k++) {
    // Voix 0 à vitesse nominale, les suivantes de plus en plus vite. C'est bien
    // un écart de VITESSE et non un décalage fixe : un décalage constant ne
    // produirait qu'un canon figé, jamais les motifs mouvants du procédé.
    const vitesse = 1 + k * options.ecart;
    // Répartition régulière de gauche à droite, resserrée par `stereo`.
    const position = nVoix === 1 ? 0.5 : k / (nVoix - 1);
    const pan = 0.5 + (position - 0.5) * stereo;
    const gG = Math.cos((pan * Math.PI) / 2);
    const gD = Math.sin((pan * Math.PI) / 2);
    let pos = 0;
    for (let i = 0; i < nSorties; i++) {
      const v = lire(canalSrc, pos) / nVoix;
      gauche[i] += v * gG;
      droite[i] += v * gD;
      pos += vitesse;
    }
  }
  return out;
}
