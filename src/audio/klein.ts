// audio/klein.ts — La bouteille de Klein : un glissando sans fin dont chaque voix
// revient en miroir.
//
// LA PROPRIÉTÉ. Une bouteille de Klein se construit comme un tore — un cercle
// de base, et au-dessus de chaque point un cercle « fibre » — à une différence
// près : en faisant le tour de la base, la fibre revient RETOURNÉE, comme dans
// un miroir. Il faut deux tours de base pour qu'elle revienne à l'endroit.
//
// POURQUOI UN MIROIR ET NON UNE ROTATION. Faire tourner la fibre d'un demi-tour
// à chaque tour de base ne suffit pas : une rotation peut se défaire
// continûment, et l'objet obtenu n'est qu'un tore. Seul un MIROIR — qu'aucune
// rotation ne peut défaire — donne une bouteille de Klein. En audio, un miroir
// n'est pas continu : il faut donc un endroit où le poser sans qu'on l'entende.
//
// OÙ LE CACHER. C'est le Glissando de Risset qui le fournit. La base est
// l'étendue des hauteurs, dont le haut est recollé au bas : une voix qui sort
// par le haut réapparaît en bas. Risset rend ce recollement inaudible en le
// plaçant là où la voix est muette — sa cloche d'amplitude y vaut zéro. On pose
// le miroir exactement au même endroit : chaque fois qu'une voix est recollée,
// sa position gauche/droite est retournée. Le saut de position tombe dans le
// silence, comme le saut d'octave.
//
// CE QU'ON ENTEND. Toutes les voix partent du même côté. Le glissando monte (ou
// descend) sans fin ; chaque voix qui renaît en bas renaît de l'autre côté. Le
// son migre donc d'un côté à l'autre PAR LE REGISTRE — les nouvelles voix
// graves d'abord — et il faut que chaque voix ait fait DEUX fois le tour de
// l'étendue pour que tout soit revenu : 2 × octaves × cycle.
//
// La fibre est rendue par sa composante latérale : un angle θ devient un
// panoramique sin θ, et le miroir θ → −θ échange gauche et droite. Chaque voix
// est un point, si bien qu'une entrée stéréo est d'abord ramenée en mono.

import { voixRisset, boucleSansCouture, type OptionsRisset } from "./risset";

export type OptionsKlein = {
  dureeSec: number;
  /** Temps qu'une voix met à parcourir une octave. */
  cycleSec: number;
  octaves: number;
  montant: boolean;
  /** Angle de la fibre en degrés : 90° = tout à droite au départ, 0° = centre (aucun miroir audible). */
  ecartDeg: number;
  fonduBoucleSec: number;
};

/**
 * Nombre de recollements subis par la voix k à l'instant t — donc de miroirs.
 * Même formule que l'octave de `voixRisset`, sans le modulo : c'est la partie
 * entière que le modulo jette qui compte les tours.
 */
export function recollements(k: number, t: number, o: Pick<OptionsKlein, "cycleSec" | "octaves" | "montant">): number {
  const n = Math.max(2, Math.round(o.octaves));
  const sens = o.montant ? 1 : -1;
  return Math.floor((k + (sens * t) / Math.max(1e-6, o.cycleSec)) / n);
}

/** Côté de la voix k à l'instant t : +1 du côté de départ, −1 en miroir. */
export function coteVoix(k: number, t: number, o: Pick<OptionsKlein, "cycleSec" | "octaves" | "montant">): 1 | -1 {
  return (((recollements(k, t, o) % 2) + 2) % 2) === 0 ? 1 : -1;
}

/** Période de retour complet : chaque voix a fait deux fois le tour de l'étendue. */
export const periodeRetourSec = (o: Pick<OptionsKlein, "cycleSec" | "octaves">) =>
  2 * Math.max(2, Math.round(o.octaves)) * o.cycleSec;

/** Mise à jour des voix tous les BLOC échantillons : leur vitesse change d'un cheveu entre deux. */
const BLOC = 32;

export function rendreKlein(buffer: AudioBuffer, o: OptionsKlein): AudioBuffer {
  const sr = buffer.sampleRate;
  // Ramener en mono AVANT de boucler : chaque voix est un point de la fibre.
  const mono = new AudioBuffer({ numberOfChannels: 1, length: buffer.length, sampleRate: sr });
  const m = mono.getChannelData(0);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) m[i] += d[i] / buffer.numberOfChannels;
  }
  const src = boucleSansCouture(mono, o.fonduBoucleSec).getChannelData(0);

  const optionsRisset: OptionsRisset = {
    dureeSec: o.dureeSec, cycleSec: o.cycleSec, octaves: o.octaves, montant: o.montant, mode: "bande",
  };
  const nVoix = Math.max(2, Math.round(o.octaves));
  const nSorties = Math.max(1, Math.round(o.dureeSec * sr));
  const positions = new Float64Array(nVoix);
  for (let k = 0; k < nVoix; k++) positions[k] = (k / nVoix) * src.length;

  const theta = (Math.max(0, Math.min(90, o.ecartDeg)) * Math.PI) / 180;
  const gain = nVoix / 2; // somme constante des cloches, voir `gainTotal` dans risset.ts
  const L = new Float32Array(nSorties), R = new Float32Array(nSorties);

  let voix = voixRisset(0, optionsRisset);
  const gG = new Float64Array(nVoix), gD = new Float64Array(nVoix);
  const lire = (pos: number) => {
    const len = src.length, i = Math.floor(pos), f = pos - i;
    return src[i % len] * (1 - f) + src[(i + 1) % len] * f;
  };

  for (let n = 0; n < nSorties; n++) {
    if (n % BLOC === 0) {
      const t = n / sr;
      voix = voixRisset(t, optionsRisset);
      for (let k = 0; k < nVoix; k++) {
        // Panoramique à puissance constante de la composante latérale sin θ.
        const pan = coteVoix(k, t, o) * Math.sin(theta); // −1 … 1
        const angle = ((pan + 1) * Math.PI) / 4;
        gG[k] = Math.cos(angle) * voix[k].amplitude / gain;
        gD[k] = Math.sin(angle) * voix[k].amplitude / gain;
      }
    }
    for (let k = 0; k < nVoix; k++) {
      if (voix[k].amplitude > 1e-6) {
        const s = lire(positions[k]);
        L[n] += gG[k] * s;
        R[n] += gD[k] * s;
      }
      positions[k] = (positions[k] + voix[k].vitesse) % src.length;
    }
  }

  const out = new AudioBuffer({ numberOfChannels: 2, length: nSorties, sampleRate: sr });
  out.getChannelData(0).set(L);
  out.getChannelData(1).set(R);
  return out;
}
