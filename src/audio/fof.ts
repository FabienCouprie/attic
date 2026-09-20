// audio/fof.ts — Synthèse de formants par FOF (CHANT, Rodet, IRCAM).
//
// Une voyelle n'est pas une forme d'onde, c'est une CONFIGURATION DE RÉSONANCES. Le conduit
// vocal est un tuyau dont la langue et les lèvres changent la géométrie, et cette géométrie
// place trois ou quatre bosses dans le spectre — les formants. Ce sont eux, et eux seuls,
// qui distinguent un « a » d'un « i » : la hauteur de la voix n'y est pour rien, ce qui est
// précisément pourquoi on reconnaît la même voyelle chantée grave ou aiguë.
//
// Xavier Rodet a proposé en 1984, avec le programme CHANT, de synthétiser cela directement :
// au lieu de filtrer une source, on ADDITIONNE les réponses impulsionnelles des formants.
// Chaque formant produit une bouffée — une sinusoïde à sa fréquence, sous une enveloppe qui
// monte vite et décroît selon sa largeur de bande —, et l'on redéclenche toutes ces bouffées
// à chaque période de la fondamentale. C'est la FOF, « Fonction d'Onde Formantique ».
//
// La conséquence est celle qu'on veut : la fondamentale décide de la hauteur, les formants
// décident du timbre, et les deux ne se touchent pas. Transposer un échantillon de voix
// déplace ses formants et donne le fameux effet « Chipmunk » ; ici, changer la fondamentale
// laisse les formants exactement où ils sont.
//
// Les fréquences de formants employées sont celles de Peterson et Barney (1952), la table
// la plus citée de la phonétique — moyennes mesurées sur des voix d'hommes.

export interface Formant {
  /** Fréquence centrale, en hertz. */
  frequence: number;
  /** Amplitude relative. */
  amplitude: number;
  /** Largeur de bande, en hertz : elle décide de la vitesse de décroissance. */
  largeur: number;
}

export interface Voyelle {
  id: string;
  fr: string;
  en: string;
  formants: Formant[];
}

/** Les largeurs de bande et amplitudes usuelles des cinq formants d'une voix chantée. */
const LARGEURS = [60, 90, 120, 150, 200];
const AMPLITUDES = [1, 0.5, 0.25, 0.1, 0.05];
/** Les deux formants supérieurs bougent peu d'une voyelle à l'autre. */
const HAUTS = [3500, 4500];

function voyelle(id: string, fr: string, en: string, trois: number[]): Voyelle {
  const freqs = [...trois, ...HAUTS];
  return {
    id, fr, en,
    formants: freqs.map((frequence, i) => ({
      frequence, amplitude: AMPLITUDES[i], largeur: LARGEURS[i],
    })),
  };
}

export const VOYELLES: Voyelle[] = [
  voyelle("a", "A (patte)", "A (father)", [730, 1090, 2440]),
  voyelle("e", "È (père)", "E (bed)", [530, 1840, 2480]),
  voyelle("i", "I (lit)", "I (beet)", [270, 2290, 3010]),
  voyelle("o", "O (mort)", "O (bought)", [570, 840, 2410]),
  voyelle("ou", "OU (loup)", "U (boot)", [300, 870, 2240]),
  voyelle("ae", "A antérieur (chat)", "AE (bat)", [660, 1720, 2410]),
  voyelle("eu", "EU (peur)", "ER (bird)", [490, 1350, 1690]),
];

export const laVoyelle = (id: string): Voyelle =>
  VOYELLES.find((v) => v.id === id) ?? VOYELLES[0];

/**
 * Une bouffée formantique.
 *
 * L'enveloppe monte en un demi-cosinus — c'est l'attaque, dont la durée fixe l'étalement du
 * formant vers les aigus — puis décroît exponentiellement à une vitesse donnée par la
 * largeur de bande : un formant large décroît vite. C'est la réponse impulsionnelle d'un
 * résonateur, écrite directement au lieu d'être obtenue par filtrage.
 */
export function bouffee(
  formant: Formant, frequenceEch: number, attaqueSecondes: number,
): Float32Array {
  const alpha = Math.PI * Math.max(1, formant.largeur);
  // On coupe la bouffée là où elle est descendue de 60 dB : au-delà, elle ne s'entend plus.
  const longueur = Math.max(4, Math.ceil((Math.log(1000) / alpha) * frequenceEch));
  const attaque = Math.max(1, attaqueSecondes * frequenceEch);
  const sortie = new Float32Array(longueur);
  for (let i = 0; i < longueur; i++) {
    const t = i / frequenceEch;
    const montee = i < attaque ? 0.5 * (1 - Math.cos((Math.PI * i) / attaque)) : 1;
    sortie[i] = formant.amplitude * montee * Math.exp(-alpha * t)
      * Math.sin(2 * Math.PI * formant.frequence * t);
  }
  return sortie;
}

export interface ConfigFof {
  voyelle: Voyelle;
  /** Fréquence fondamentale, en hertz : la hauteur de la voix. */
  frequence: number;
  duree: number;
  frequenceEch: number;
  /** Durée d'attaque des bouffées, en secondes : elle étale les formants. */
  attaque: number;
  /** Facteur appliqué aux largeurs de bande : ouvre ou resserre les formants. */
  facteurLargeur: number;
  /** Décalage des formants en demi-tons : change la taille du conduit vocal. */
  decalageFormants: number;
  /** Profondeur du vibrato de hauteur, de 0 à 1. */
  vibrato: number;
  frequenceVibrato: number;
  /** Instabilité de hauteur, de 0 à 1 : ce qui distingue une voix d'un orgue. */
  jitter: number;
}

export interface ResultatFof {
  signal: Float32Array;
  /** Nombre de bouffées déclenchées, toutes formants confondus. */
  bouffees: number;
}

/**
 * Synthétise une voyelle tenue.
 *
 * Les bouffées de chaque formant sont précalculées une fois, puis additionnées à chaque
 * période de la fondamentale. Elles se CHEVAUCHENT — une bouffée dure souvent plus qu'une
 * période —, et c'est ce chevauchement qui fait la résonance continue.
 */
export function synthetiserFof(config: ConfigFof, aleatoire: () => number): ResultatFof {
  const fs = config.frequenceEch;
  const longueur = Math.max(1, Math.ceil(config.duree * fs));
  const signal = new Float32Array(longueur);
  const transposition = 2 ** (config.decalageFormants / 12);
  const formants = config.voyelle.formants.map((f) => ({
    frequence: Math.min(fs / 2.2, f.frequence * transposition),
    amplitude: f.amplitude,
    largeur: Math.max(10, f.largeur * Math.max(0.1, config.facteurLargeur)),
  }));
  const bouffees = formants.map((f) => bouffee(f, fs, config.attaque));

  let position = 0, compte = 0;
  while (position < longueur) {
    const t = position / fs;
    const vib = 1 + config.vibrato * 0.04
      * Math.sin(2 * Math.PI * config.frequenceVibrato * t);
    // Le jitter est ce qui empêche une voix de sonner comme un orgue : d'une période à
    // l'autre, la fondamentale d'une vraie voix varie de quelques millièmes.
    const gigue = 1 + config.jitter * 0.03 * (2 * aleatoire() - 1);
    const periode = Math.max(2, Math.round(fs / Math.max(20, config.frequence * vib * gigue)));
    for (const b of bouffees) {
      const n = Math.min(b.length, longueur - position);
      for (let i = 0; i < n; i++) signal[position + i] += b[i];
      compte++;
    }
    position += periode;
  }

  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
  if (crete > 1e-9) {
    const g = 0.9 / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return { signal, bouffees: compte };
}
