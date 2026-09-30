// audio/paradoxe-triton.ts — Le paradoxe du triton de Diana Deutsch.
//
// D'OÙ VIENT CE CALCUL. Diana Deutsch, « A musical paradox », Music Perception 3(3), 1986,
// p. 275-280. Deux sons séparés d'un demi-octave sont joués l'un après l'autre ; certains auditeurs
// les entendent monter, d'autres descendre, et chacun reste d'accord avec lui-même d'une écoute à
// l'autre. Diana Deutsch, « The tritone paradox : an influence of language on music perception »,
// Music Perception 8(4), 1991, p. 335-347, relie cette orientation à la langue et à la région
// d'origine de l'auditeur.
//
// CE QUI REND LE SENS INDÉCIDABLE, ET C'EST TOUT L'ART DU STIMULUS. Un son est fait de composantes
// espacées d'une OCTAVE, dont les amplitudes suivent une enveloppe FIXE en fréquence. La classe de
// hauteur est donc nette, mais la hauteur absolue ne l'est pas : le son n'a pas d'octave. Le triton
// étant la moitié exacte d'une octave, monter de six demi-tons et descendre de six mènent à la même
// classe. Rien dans le signal ne tranche, et ce que l'auditeur entend vient de lui.
//
// L'ENVELOPPE NE SUIT PAS LA CLASSE DE HAUTEUR, ET C'EST LA CONDITION. Si elle se déplaçait avec
// elle, la seconde note serait spectralement plus haute ou plus basse que la première, et le sens
// serait donné par le timbre : il n'y aurait plus de paradoxe, seulement un intervalle. C'est ce
// qu'un test de ce dépôt vérifie. Deutsch a elle-même déplacé le sommet de l'enveloppe pour montrer
// que l'effet n'en dépend pas, ce que le réglage « Centre » permet de refaire.

/** Une composante d'un son à octaves : sa fréquence et son amplitude. */
export interface Composante {
  frequence: number;
  amplitude: number;
}

export interface OptionsTon {
  /** La classe de hauteur, de 0 pour do à 11 pour si. Les fractions sont permises. */
  classe: number;
  /** Le nombre de composantes espacées d'une octave. */
  composantes: number;
  /** Le sommet de l'enveloppe, en hertz. Il ne bouge pas avec la classe. */
  centre: number;
  /** La largeur de l'enveloppe, en octaves, au sens de l'écart-type de la gaussienne. */
  largeur: number;
}

/** Le do de référence, dont toutes les classes se déduisent. */
const DO_GRAVE = 16.3516; // do0, soit le numéro MIDI 12

/**
 * Les composantes d'un son à octaves, avec leurs amplitudes sous l'enveloppe fixe.
 *
 * LES AMPLITUDES SONT NORMALISÉES, faute de quoi une classe dont les composantes tomberaient près du
 * sommet sonnerait plus fort que sa voisine, et le niveau désignerait le sens du mouvement aussi
 * sûrement qu'un timbre.
 */
export function composantesDuTon(o: OptionsTon): Composante[] {
  const n = Math.max(1, Math.round(o.composantes));
  const centre = Math.max(20, o.centre);
  const largeur = Math.max(0.1, o.largeur);
  const classe = ((o.classe % 12) + 12) % 12;
  const base = DO_GRAVE * Math.pow(2, classe / 12);

  // LES COMPOSANTES ENTOURENT LE SOMMET DE L'ENVELOPPE, elles ne partent pas d'en dessous. La
  // première version les empilait depuis le do le plus grave : les six tombaient toutes au-dessous
  // du sommet, le son était bien plus sombre qu'annoncé, et son barycentre dérivait d'un TIERS
  // D'OCTAVE d'une classe à l'autre, ce qui aurait suffi à désigner le sens du mouvement. Mesuré par
  // le cas qui garde cette propriété. Le rang de départ place donc l'empilement à cheval sur le
  // sommet, et l'arrondi le tient sur la grille des octaves de cette classe.
  const rang0 = Math.round(Math.log2(centre / base) - (n - 1) / 2);

  const brutes = Array.from({ length: n }, (_, k) => {
    const frequence = base * Math.pow(2, rang0 + k);
    // La gaussienne se mesure en OCTAVES, c'est-à-dire en logarithme de base deux : c'est l'échelle
    // sur laquelle l'oreille juge une distance de hauteur.
    const octaves = Math.log2(frequence / centre);
    return { frequence, amplitude: Math.exp(-(octaves * octaves) / (2 * largeur * largeur)) };
  });
  const somme = brutes.reduce((s, c) => s + c.amplitude, 0);
  return brutes.map((c) => ({ ...c, amplitude: somme > 0 ? c.amplitude / somme : 0 }));
}

/**
 * La classe qui suit à un triton, c'est-à-dire à un demi-octave.
 *
 * ELLE EST LA MÊME DANS LES DEUX SENS, et c'est le paradoxe tout entier : monter de six demi-tons
 * et en descendre six mènent à la même classe de hauteur.
 */
export const classeAuTriton = (classe: number): number => (((classe + 6) % 12) + 12) % 12;

export interface OptionsPaire {
  /** La classe du premier son. Le second est à un triton. */
  classe: number;
  composantes: number;
  centre: number;
  largeur: number;
  /** La durée d'un son, en secondes. */
  duree: number;
  /** Le silence entre les deux sons, en secondes. */
  silence: number;
  /** Le niveau, de 0 à 1. */
  niveau: number;
  sampleRate: number;
}

/** Le fondu aux deux bouts d'un son : sans lui, l'attaque est un clic, qui a sa propre hauteur. */
const FONDU = 0.02;

/** Un son à octaves rendu en échantillons. */
export function echantillonsDuTon(
  composantes: readonly Composante[], duree: number, niveau: number, sampleRate: number,
): Float32Array {
  const n = Math.max(1, Math.round(Math.max(0, duree) * sampleRate));
  const x = new Float32Array(n);
  const fondu = Math.max(1, Math.round(FONDU * sampleRate));
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (const c of composantes) v += Math.sin(2 * Math.PI * c.frequence * t) * c.amplitude;
    const montee = Math.min(1, i / fondu);
    const descente = Math.min(1, (n - i) / fondu);
    x[i] = v * niveau * Math.max(0, Math.min(montee, descente));
  }
  return x;
}

/** Une paire : un son, un silence, le son au triton. */
export function echantillonsDeLaPaire(o: OptionsPaire): Float32Array {
  const commun = { composantes: o.composantes, centre: o.centre, largeur: o.largeur };
  const premier = echantillonsDuTon(
    composantesDuTon({ ...commun, classe: o.classe }), o.duree, o.niveau, o.sampleRate,
  );
  const second = echantillonsDuTon(
    composantesDuTon({ ...commun, classe: classeAuTriton(o.classe) }), o.duree, o.niveau, o.sampleRate,
  );
  const creux = Math.max(0, Math.round(Math.max(0, o.silence) * o.sampleRate));
  const x = new Float32Array(premier.length + creux + second.length);
  x.set(premier, 0);
  x.set(second, premier.length + creux);
  return x;
}

/** Les noms des douze classes, dans l'ordre où on les compte. */
export const NOMS_DE_CLASSE = ["Do", "Do♯", "Ré", "Ré♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
export const NOMS_DE_CLASSE_EN = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
