// audio/barre-modale.ts — Percussions à sons définis, par synthèse modale.
//
// Une barre de marimba, une lame de vibraphone ou une cloche ne vibrent pas comme une
// corde. Une corde a des partiels entiers — 1, 2, 3, 4 — parce qu'elle vibre en une
// dimension sous tension ; une barre libre vibre en FLEXION, et ses modes propres tombent
// sur des rapports qui ne sont pas entiers du tout : 1, puis 2,756, puis 5,404, puis 8,933.
// C'est ce qui donne au glockenspiel sa couleur métallique, et c'est un résultat
// d'acoustique publié, pas un réglage.
//
// Les facteurs d'instruments corrigent ces rapports exprès. Creuser une arche sous une
// barre de marimba abaisse son deuxième mode jusqu'à QUATRE fois le premier, et le
// troisième vers dix : la barre devient harmonique, donc musicale. Une cloche tubulaire va
// plus loin encore — ses partiels sont vers 2, 3, 4,2 et 5,4, si bien que la note qu'on
// entend, elle, n'existe PAS dans le son : c'est une fondamentale absente, que l'oreille
// reconstruit. On peut le vérifier sur le spectre, et c'est le test le plus surprenant de
// ce module.
//
// La synthèse est donc directe : un banc de résonateurs aux bons rapports, frappé par une
// impulsion courte. C'est peu de code pour beaucoup d'instruments.

export interface Mode {
  /** Rapport à la fréquence fondamentale. */
  rapport: number;
  gain: number;
  /** Durée de décroissance de 60 dB, en secondes. */
  duree: number;
}

export interface Barre {
  id: string;
  fr: string;
  en: string;
  modes: Mode[];
  /** Dureté du maillet : durée de l'impulsion, en secondes. */
  maillet: number;
  /** Note de référence conseillée, pour que l'instrument sonne dans sa tessiture. */
  noteConseillee: number;
}

export const BARRES: Barre[] = [
  {
    // Les modes de flexion d'une barre libre, tels que l'acoustique les donne.
    id: "glockenspiel", fr: "Glockenspiel (barre libre)", en: "Glockenspiel (free bar)",
    maillet: 0.0006, noteConseillee: 84,
    modes: [
      { rapport: 1, gain: 1, duree: 1.6 },
      { rapport: 2.756, gain: 0.5, duree: 0.9 },
      { rapport: 5.404, gain: 0.25, duree: 0.5 },
      { rapport: 8.933, gain: 0.12, duree: 0.3 },
    ],
  },
  {
    // L'arche creusée sous la barre ramène le deuxième mode à quatre fois le premier.
    id: "marimba", fr: "Marimba", en: "Marimba",
    maillet: 0.0025, noteConseillee: 60,
    modes: [
      { rapport: 1, gain: 1, duree: 0.9 },
      { rapport: 4, gain: 0.35, duree: 0.5 },
      { rapport: 10, gain: 0.12, duree: 0.25 },
    ],
  },
  {
    // Même accord modal, mais l'aluminium amortit beaucoup moins que le bois.
    id: "vibraphone", fr: "Vibraphone", en: "Vibraphone",
    maillet: 0.0018, noteConseillee: 60,
    modes: [
      { rapport: 1, gain: 1, duree: 4 },
      { rapport: 4, gain: 0.3, duree: 2.5 },
      { rapport: 10, gain: 0.1, duree: 1.2 },
    ],
  },
  {
    // Cloche tubulaire : la note entendue n'est dans aucun partiel.
    id: "cloche", fr: "Cloche tubulaire", en: "Tubular bell",
    maillet: 0.0008, noteConseillee: 72,
    modes: [
      { rapport: 2, gain: 1, duree: 5 },
      { rapport: 3, gain: 0.8, duree: 4 },
      { rapport: 4.16, gain: 0.6, duree: 3 },
      { rapport: 5.43, gain: 0.4, duree: 2 },
    ],
  },
  {
    // Deux modes presque confondus : leur battement est la voix du bol.
    id: "bol", fr: "Bol tibétain", en: "Tibetan bowl",
    maillet: 0.004, noteConseillee: 60,
    modes: [
      { rapport: 1, gain: 1, duree: 9 },
      { rapport: 1.02, gain: 0.95, duree: 9 },
      { rapport: 2.71, gain: 0.3, duree: 5 },
      { rapport: 5.18, gain: 0.15, duree: 3 },
    ],
  },
  {
    id: "bloc", fr: "Bloc de bois", en: "Wood block",
    maillet: 0.0004, noteConseillee: 84,
    modes: [
      { rapport: 1, gain: 1, duree: 0.09 },
      { rapport: 2.41, gain: 0.5, duree: 0.06 },
      { rapport: 3.83, gain: 0.3, duree: 0.04 },
    ],
  },
];

export const barre = (id: string): Barre => BARRES.find((b) => b.id === id) ?? BARRES[0];

export interface ConfigBarre {
  barre: Barre;
  frequence: number;
  duree: number;
  frequenceEch: number;
  /**
   * Dureté du maillet, de 0 à 1. Un maillet dur excite les modes hauts, un maillet mou ne
   * réveille que le premier — c'est le réglage qui change le plus le timbre.
   */
  durete: number;
  /** Amortissement supplémentaire, de 0 à 1 : la main posée sur la barre. */
  amortissement: number;
  /** Profondeur du trémolo du vibraphone, de 0 à 1. */
  tremolo: number;
  frequenceTremolo: number;
}

export function synthetiserBarre(config: ConfigBarre): Float32Array {
  const fs = config.frequenceEch;
  const longueur = Math.max(1, Math.ceil(config.duree * fs));
  const signal = new Float32Array(longueur);
  const f0 = Math.max(20, config.frequence);
  const durete = Math.max(0, Math.min(1, config.durete));
  const amorti = 1 - 0.9 * Math.max(0, Math.min(1, config.amortissement));

  // L'impulsion du maillet : plus elle est courte, plus elle porte d'aigus. C'est la
  // raison physique pour laquelle un maillet dur réveille les modes hauts.
  const dureeImpulsion = Math.max(2, config.barre.maillet * fs * (1.6 - 1.2 * durete));
  const impulsion = (i: number): number =>
    i < dureeImpulsion ? Math.sin((Math.PI * i) / dureeImpulsion) : 0;

  for (const mode of config.barre.modes) {
    const f = f0 * mode.rapport;
    if (f >= fs / 2) continue; // un mode au-delà de Nyquist ne s'écrit pas
    const duree = mode.duree * amorti;
    // Un résonateur amorti : rayon donné par la durée de décroissance de 60 dB.
    const r = Math.exp(Math.log(0.001) / Math.max(1, duree * fs));
    const w = (2 * Math.PI * f) / fs;
    const a1 = -2 * r * Math.cos(w), a2 = r * r;
    const b0 = (1 - a2) * mode.gain;
    let y1 = 0, y2 = 0;
    for (let i = 0; i < longueur; i++) {
      const y = b0 * impulsion(i) - a1 * y1 - a2 * y2;
      y2 = y1;
      y1 = y;
      signal[i] += y;
    }
  }

  if (config.tremolo > 0) {
    for (let i = 0; i < longueur; i++) {
      const t = 1 - config.tremolo * 0.5
        * (0.5 - 0.5 * Math.cos((2 * Math.PI * config.frequenceTremolo * i) / fs));
      signal[i] *= t;
    }
  }

  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
  if (crete > 1e-9) {
    const g = 0.9 / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return signal;
}
