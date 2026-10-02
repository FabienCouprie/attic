// audio/vague.ts — L'effet de vague, et son ressac.
//
// D'OÙ VIENT CET EFFET. Jean-François Augoyard et Henry Torgue, « À l'écoute de l'environnement :
// répertoire des effets sonores », Parenthèses, 1995. Un son, ou un groupe de sons, s'entend suivant
// une courbe d'intensité qui a la forme de la vague et de son ressac : crescendo, point maximal,
// rupture du son rapide ou progressive, decrescendo. Les cycles se succèdent à plusieurs secondes
// d'intervalle, régulièrement ou non. Le répertoire le donne pour un effet COMPOSÉ, fait de phase et
// de filtrage.
//
// CE QUI LE SÉPARE D'UN TRÉMOLO EST L'ASYMÉTRIE, et c'est la seule chose qui compte ici. Un trémolo
// monte et descend du même pas : sa courbe est une sinusoïde, et l'on n'y entend aucun sens. Une
// vague met longtemps à se former et se brise vite ; c'est ce rapport entre la montée et la chute
// qui fait qu'on reconnaît une vague et non un battement. Un cas de ce dépôt le mesure sur le son
// rendu, parce qu'une courbe symétrique rendue par erreur sonnerait parfaitement plausible.
//
// ET LE TIMBRE SUIT L'INTENSITÉ, ce qui est la part de filtrage que le répertoire signale. Une vague
// qui se forme s'éclaircit en montant et s'assourdit en se retirant : moduler le seul niveau rendrait
// un son qui va et vient sans jamais s'approcher.

/** Les deux façons dont une vague se brise. */
export type Rupture = "deferlante" | "progressive";

export interface OptionsVague {
  /** La durée d'un cycle, en secondes. */
  periode: number;
  /** L'irrégularité de la période d'un cycle au suivant, de 0 à 1. */
  variation: number;
  /** La part du cycle passée à monter, de 0 à 1. Au-dessus d'un demi, la vague se brise. */
  montee: number;
  /** La façon dont la vague se brise. */
  rupture: Rupture;
  /** La part du niveau que le creux emporte, de 0 à 1. */
  profondeur: number;
  /** La part du timbre qui suit l'intensité, de 0 à 1. */
  ouverture: number;
  /** La graine de l'irrégularité, pour qu'une écoute se refasse. */
  graine: number;
}

/**
 * La courbe d'un cycle, de son creux à son creux suivant.
 *
 * LA MONTÉE EST UN DEMI-COSINUS, et la chute dépend de la rupture. Progressive, elle est le même
 * demi-cosinus à l'envers, simplement plus court ; déferlante, elle tombe en puissance, ce qui
 * laisse au sommet une arête et donne au retrait sa traîne.
 */
export function formeDeLaVague(u: number, montee: number, rupture: Rupture): number {
  const m = Math.max(0.05, Math.min(0.95, montee));
  const t = Math.max(0, Math.min(1, u));
  if (t < m) return 0.5 - 0.5 * Math.cos(Math.PI * (t / m));
  const apres = (t - m) / (1 - m);
  return rupture === "deferlante" ? Math.pow(1 - apres, 3) : 0.5 + 0.5 * Math.cos(Math.PI * apres);
}

/** Le tirage de l'irrégularité : reproductible, sans quoi deux rendus ne se compareraient pas. */
function tirage(graine: number): () => number {
  let g = Math.max(1, Math.floor(graine)) >>> 0;
  return () => {
    g = (Math.imul(g, 1664525) + 1013904223) >>> 0;
    return g / 4294967296;
  };
}

/**
 * Les durées successives des cycles, en secondes.
 *
 * ELLES SE TIRENT D'AVANCE, ET NON AU FIL DE L'EAU : la position dans un cycle se calcule à partir
 * de l'instant où il a commencé, et il faut donc savoir où chacun commence avant de rendre le
 * premier échantillon. Une variation nulle rend des durées toutes égales, au bit près.
 */
export function dureesDesCycles(o: OptionsVague, duree: number): number[] {
  const base = Math.max(0.1, o.periode);
  const v = Math.max(0, Math.min(1, o.variation));
  const suivant = tirage(o.graine);
  const out: number[] = [];
  let total = 0;
  while (total < duree + base) {
    const d = v === 0 ? base : base * (1 + (suivant() * 2 - 1) * v * 0.8);
    out.push(d);
    total += d;
  }
  return out;
}

/**
 * La vague appliquée à un son.
 *
 * LE FILTRE EST UN PÔLE UNIQUE dont la coupure suit la courbe : au sommet il laisse tout passer, au
 * creux il ne garde que le grave. C'est assez pour que le son paraisse s'approcher et se retirer,
 * et un filtre plus raide ferait entendre son propre balayage plutôt que la vague.
 */
export function vague(buffer: AudioBuffer, o: OptionsVague): AudioBuffer {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const durees = dureesDesCycles(o, n / sr);
  const profondeur = Math.max(0, Math.min(1, o.profondeur));
  const ouverture = Math.max(0, Math.min(1, o.ouverture));

  // La courbe est calculée une fois pour tous les canaux : une vague qui ne tomberait pas au même
  // instant à gauche et à droite ne serait plus une vague mais deux.
  const forme = new Float32Array(n);
  let cycle = 0;
  let debut = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    while (cycle < durees.length - 1 && t >= debut + durees[cycle]) { debut += durees[cycle]; cycle++; }
    forme[i] = formeDeLaVague((t - debut) / durees[cycle], o.montee, o.rupture);
  }

  const sortie = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: n, sampleRate: sr });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = sortie.getChannelData(c);
    let bas = 0;
    for (let i = 0; i < n; i++) {
      const f = forme[i];
      // La coupure va de trois cents hertz au creux à la moitié de la fréquence d'échantillonnage au
      // sommet, et l'ouverture dit quelle part de ce trajet est parcourue.
      const coupure = 300 + (sr / 2 - 300) * (1 - ouverture + ouverture * f);
      const a = Math.exp((-2 * Math.PI * Math.min(coupure, sr / 2.2)) / sr);
      bas = a * bas + (1 - a) * src[i];
      dst[i] = bas * (1 - profondeur + profondeur * f);
    }
  }
  return sortie;
}
