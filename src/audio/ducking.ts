// audio/ducking.ts — Un son qui s'efface devant un autre.
//
// CE QUI MANQUAIT, ET LA DIFFÉRENCE AVEC LE COMPRESSEUR. Attic a un compresseur, un limiteur, un
// multibande, une porte. Tous écoutent LE SIGNAL QU'ILS TRAITENT : ils baissent un son quand ce
// son est fort. Aucun ne sait baisser un son quand UN AUTRE est fort. C'est pourtant le geste le
// plus courant du mixage — la musique qui s'efface sous une voix, la nappe qui recule à chaque
// coup de grosse caisse — et il ne s'obtient par aucune combinaison des quatre.
//
// LE NOM. « Ducking » chez les ingénieurs anglophones, « chaîne latérale » en français quand on
// parle du câblage : le signal qui commande entre par le côté, et ne sort jamais.
//
// LE MAINTIEN, ET POURQUOI IL EXISTE. Sans lui, une voix qui hésite laisse la musique remonter
// entre deux mots, et l'on entend un halètement. Le maintien garde l'atténuation un moment après
// que le déclencheur est retombé, si bien qu'une phrase parlée creuse un seul trou plutôt que
// douze.

export interface OptionsDucking {
  /** Niveau du déclencheur, en dB, au-dessus duquel l'atténuation s'engage. */
  seuilDb: number;
  /** Atténuation maximale, en dB. */
  reductionDb: number;
  /** Temps de descente, en secondes. */
  attaqueSec: number;
  /** Temps de remontée, en secondes. */
  relachementSec: number;
  /** Temps pendant lequel l'atténuation est gardée après le retour sous le seuil, en secondes. */
  maintienSec: number;
  frequence: number;
}

/** L'enveloppe du déclencheur : sa valeur absolue, lissée en montée rapide et descente lente. */
export function enveloppeDeclencheur(d: Float32Array, frequence: number, tempsSec = 0.005): Float32Array {
  const coeff = Math.exp(-1 / Math.max(1, tempsSec * frequence));
  const env = new Float32Array(d.length);
  let e = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    e = a > e ? a : coeff * e + (1 - coeff) * a;
    env[i] = e;
  }
  return env;
}

/**
 * Le gain à appliquer, instant par instant.
 *
 * Isolé de l'application pour être lisible en clair : c'est une courbe entre 0 et 1, qu'un test
 * peut lire comme un dessin plutôt qu'en devinant ce que le son est devenu.
 */
export function gainsDucking(declencheur: Float32Array, n: number, o: OptionsDucking): Float32Array {
  const env = enveloppeDeclencheur(declencheur, o.frequence);
  const seuil = Math.pow(10, o.seuilDb / 20);
  const plancher = Math.pow(10, -Math.abs(o.reductionDb) / 20);
  const cA = Math.exp(-1 / Math.max(1, o.attaqueSec * o.frequence));
  const cR = Math.exp(-1 / Math.max(1, o.relachementSec * o.frequence));
  const maintien = Math.max(0, Math.round(o.maintienSec * o.frequence));

  const gains = new Float32Array(n);
  let gain = 1;
  let reste = 0;
  for (let i = 0; i < n; i++) {
    // Le déclencheur peut être plus court que la cible : au-delà, il est tenu pour silencieux.
    const niveau = i < env.length ? env[i] : 0;
    if (niveau > seuil) reste = maintien;
    else if (reste > 0) reste--;
    const cible = niveau > seuil || reste > 0 ? plancher : 1;
    const c = cible < gain ? cA : cR;
    gain = c * gain + (1 - c) * cible;
    gains[i] = gain;
  }
  return gains;
}

export function ducking(cible: Float32Array, declencheur: Float32Array, o: OptionsDucking): Float32Array {
  const gains = gainsDucking(declencheur, cible.length, o);
  return Float32Array.from(cible, (v, i) => v * gains[i]);
}
