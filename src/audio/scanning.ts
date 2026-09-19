// audio/scanning.ts — Synthèse par scanning (Verplank, Mathews, Shaw, CCRMA 2000).
//
// L'idée est étrange et tient en deux phrases. On simule un objet mécanique — ici une
// chaîne de masses reliées par des ressorts, fermée en anneau — à une cadence LENTE, de
// quelques centaines de pas par seconde, si bien que son mouvement est à l'échelle du
// geste : quelques hertz, comme une corde de contrebasse qu'on regarderait au ralenti.
// Puis on lit la FORME de cet objet, masse par masse, comme une table d'onde, à la
// fréquence audio qu'on veut entendre.
//
// La conséquence est ce qui fait tout l'intérêt du procédé : la HAUTEUR et le TIMBRE sont
// entièrement séparés. La hauteur ne dépend que de la vitesse de lecture, la forme d'onde
// ne dépend que de la mécanique — tension, amortissement, force de rappel — et elle évolue
// donc continûment, sans jamais se répéter, pendant que la note reste juste. Aucun
// oscillateur à table d'onde ordinaire ne fait cela : sa table est figée.
//
// Max Mathews, qui avait écrit le premier programme de synthèse en 1957, considérait le
// scanning comme l'aboutissement de sa recherche d'un timbre « vivant » sans échantillon.

export interface ConfigScanning {
  /** Fréquence lue, en hertz : elle ne dépend que de la vitesse de balayage. */
  frequence: number;
  duree: number;
  frequenceEch: number;
  /** Nombre de masses de la chaîne, donc de points de la table. */
  masses: number;
  /** Cadence de simulation mécanique, en pas par seconde. */
  cadence: number;
  /** Tension des ressorts entre voisins, de 0 à 1 : la vitesse des ondes dans la chaîne. */
  tension: number;
  /** Force de rappel vers la position de repos, de 0 à 1. */
  rappel: number;
  /** Amortissement, de 0 à 1 : à 1 le mouvement meurt tout de suite. */
  amortissement: number;
  /** Forme de l'excitation initiale. */
  excitation: "pincee" | "frappee" | "bruit" | "deux-bosses";
  /** Amplitude de l'excitation. */
  force: number;
}

export interface EtatChaine {
  position: Float64Array;
  vitesse: Float64Array;
}

/**
 * L'excitation initiale : on déplace les masses, puis on lâche.
 *
 * Une chaîne partie du repos ne bouge jamais — rien ne l'entretient. C'est donc la forme
 * qu'on lui donne au départ qui décide de tout le son, comme la façon de pincer une corde.
 */
export function exciter(
  masses: number, forme: ConfigScanning["excitation"], force: number, aleatoire: () => number,
): EtatChaine {
  const position = new Float64Array(masses);
  const vitesse = new Float64Array(masses);
  for (let i = 0; i < masses; i++) {
    const x = i / masses;
    if (forme === "pincee") {
      // Un triangle : la corde tirée en un point.
      position[i] = force * (x < 0.5 ? 2 * x : 2 * (1 - x));
    } else if (forme === "frappee") {
      // Une vitesse donnée au centre, sans déplacement : le marteau.
      vitesse[i] = force * Math.exp(-((x - 0.5) ** 2) / 0.005) * 20;
    } else if (forme === "bruit") {
      position[i] = force * (2 * aleatoire() - 1);
    } else {
      position[i] = force * (Math.sin(2 * Math.PI * x) + 0.5 * Math.sin(4 * Math.PI * x));
    }
  }
  // On CENTRE la forme et les vitesses. Un triangle positif a une composante continue, et
  // la table lue en porterait une aussi : le signal ne serait pas centré, on perdrait de la
  // dynamique, et la mesure de hauteur par autocorrélation se ferait piéger par la moyenne.
  // C'est aussi ce que dit la mécanique — le centre de masse d'un anneau libre ne se
  // déplace pas tout seul.
  centrer(position);
  centrer(vitesse);
  return { position, vitesse };
}

function centrer(x: Float64Array): void {
  let somme = 0;
  for (let i = 0; i < x.length; i++) somme += x[i];
  const moyenne = somme / x.length;
  for (let i = 0; i < x.length; i++) x[i] -= moyenne;
}

/**
 * Un pas de la mécanique.
 *
 * Chaque masse est tirée par ses deux voisines — c'est la tension, qui fait voyager les
 * ondes le long de la chaîne — et rappelée vers zéro. L'amortissement mange la vitesse. Ce
 * sont les équations de Newton, intégrées par la méthode la plus simple qui soit, ce qui
 * suffit largement : on ne cherche pas la précision d'une simulation, on cherche une forme
 * qui bouge de façon crédible.
 */
export function avancerChaine(etat: EtatChaine, tension: number, rappel: number, amortissement: number): void {
  const { position: p, vitesse: v } = etat;
  const n = p.length;
  const k = Math.max(0, Math.min(1, tension)) * 0.5;
  const c = Math.max(0, Math.min(1, rappel)) * 0.05;
  const d = 1 - Math.max(0, Math.min(1, amortissement)) * 0.05;
  for (let i = 0; i < n; i++) {
    const gauche = p[(i - 1 + n) % n];
    const droite = p[(i + 1) % n];
    const force = k * (gauche + droite - 2 * p[i]) - c * p[i];
    v[i] = (v[i] + force) * d;
  }
  for (let i = 0; i < n; i++) p[i] += v[i];
}

export interface ResultatScanning {
  signal: Float32Array;
  /** La forme de la chaîne à la fin, pour montrer qu'elle a bougé. */
  formeFinale: Float64Array;
  /** Nombre de pas de mécanique effectués. */
  pas: number;
}

export function synthetiserScanning(
  config: ConfigScanning, aleatoire: () => number,
): ResultatScanning {
  const fs = config.frequenceEch;
  const longueur = Math.max(1, Math.ceil(config.duree * fs));
  const signal = new Float32Array(longueur);
  const n = Math.max(4, Math.min(1024, Math.floor(config.masses)));
  const etat = exciter(n, config.excitation, config.force, aleatoire);

  // La table est lue à la fréquence voulue : un tour complet par période.
  const avance = (Math.max(1, config.frequence) * n) / fs;
  const echantillonsParPas = Math.max(1, Math.floor(fs / Math.max(1, config.cadence)));
  let phase = 0, pas = 0;
  // L'état précédent, pour passer de l'un à l'autre en fondu. Sans cela, la table change
  // d'un coup à chaque pas de mécanique et l'on entend une raie à la cadence de simulation
  // — mesuré, un 110 Hz demandé se faisait dominer par une composante à 1 kHz, qui était
  // l'artefact de mise à jour et non la note.
  const precedent = new Float64Array(etat.position);

  for (let i = 0; i < longueur; i++) {
    const dansLePas = i % echantillonsParPas;
    if (dansLePas === 0) {
      precedent.set(etat.position);
      avancerChaine(etat, config.tension, config.rappel, config.amortissement);
      pas++;
    }
    const melange = dansLePas / echantillonsParPas;
    // Lecture interpolée de la forme, dans l'espace ET dans le temps : c'est cela, le « scan ».
    const a = Math.floor(phase) % n;
    const b = (a + 1) % n;
    const f = phase - Math.floor(phase);
    const avant = precedent[a] * (1 - f) + precedent[b] * f;
    const apres = etat.position[a] * (1 - f) + etat.position[b] * f;
    signal[i] = avant * (1 - melange) + apres * melange;
    phase += avance;
    if (phase >= n) phase -= n;
  }

  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
  if (crete > 1e-9) {
    const g = 0.9 / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return { signal, formeFinale: etat.position, pas };
}
