// audio/spirale-logarithmique.ts — La spirale qui se superpose à elle-même.
//
// LA PROPRIÉTÉ. Une spirale logarithmique s'écrit r = a·e^(bθ) : avancer d'un angle fixe multiplie
// le rayon par un facteur fixe. C'est la seule courbe dont un agrandissement se confond avec une
// rotation, ce qui lui vaut le nom de spirale équiangle, et ce pour quoi Jacques Bernoulli l'a
// voulue sur sa tombe avec la devise « eadem mutata resurgo », je renais changée et la même.
//
// LA MISE EN SON. Le rayon porte la fréquence, l'angle porte le temps. Un tour de spirale
// multiplie donc toutes les fréquences par un même rapport, et les partiels sont placés à un tour
// les uns des autres : f(k) = f0·ρ^k. Faire tourner la spirale fait glisser le spectre entier, et
// après un tour exactement, ce spectre se superpose à lui-même décalé d'un partiel.
//
// CE QUI LA SÉPARE D'UN GLISSANDO SANS FIN. Un glissando de Shepard emploie ce même spectre à
// rapport 2 et cache ses bords sous une cloche d'amplitude, de sorte qu'on ne sait jamais où l'on
// est. Ici le rapport est libre, ρ = 2 n'étant qu'un cas parmi d'autres, et la spirale ne se
// referme pour aucun ρ : on revient au même angle, jamais au même rayon.
//
// CE MODULE NE PRODUIT PAS DE SON. Il place les partiels et dit leur trajectoire ; le rendu
// appartient au composant.

export const NOMBRE_OR = (1 + Math.sqrt(5)) / 2;

/** Bornes du rapport par tour. En deçà de 1,05 les partiels se confondent, au-delà de 4 ils se perdent. */
export const RAPPORT_MIN = 1.05;
export const RAPPORT_MAX = 4;

export interface OptionsSpirale {
  /** Fréquence du partiel de rang zéro, au départ, en hertz. */
  fondamentale: number;
  /** Le facteur dont le rayon est multiplié en un tour. */
  rapport: number;
  /** Nombre de partiels placés sur la spirale. */
  partiels: number;
  /** Nombre de tours parcourus sur toute la durée. Négatif pour descendre. */
  tours: number;
  /** Durée totale, en secondes. */
  dureeSec: number;
  /** Décroissance de l'amplitude le long de la spirale : a(k) = 1/(k+1)^decroissance. */
  decroissance: number;
}

export interface Partiel {
  rang: number;
  /** La fréquence au départ, en hertz. */
  frequenceDebut: number;
  /** La fréquence à l'arrivée, après tous les tours. */
  frequenceFin: number;
  /** L'amplitude, constante le long du parcours. */
  amplitude: number;
}

const borner = (v: number, bas: number, haut: number) => Math.min(haut, Math.max(bas, v));

/** Le rapport, ramené dans ses bornes et écarté de 1, où la spirale dégénère en cercle. */
export function rapportValide(rapport: number): number {
  return borner(Number.isFinite(rapport) ? rapport : NOMBRE_OR, RAPPORT_MIN, RAPPORT_MAX);
}

/**
 * Les partiels placés sur la spirale, un par tour.
 *
 * Leur amplitude décroît avec le rang : sans cela, le partiel le plus aigu pèserait autant que la
 * fondamentale et le son ne serait qu'un sifflement. La décroissance est en puissance du rang,
 * comme celle d'une série harmonique.
 */
export function partielsDeSpirale(o: OptionsSpirale): Partiel[] {
  const rapport = rapportValide(o.rapport);
  const facteurTotal = Math.pow(rapport, o.tours);
  const out: Partiel[] = [];
  for (let k = 0; k < Math.max(1, Math.floor(o.partiels)); k++) {
    const f0 = o.fondamentale * Math.pow(rapport, k);
    out.push({
      rang: k,
      frequenceDebut: f0,
      frequenceFin: f0 * facteurTotal,
      amplitude: 1 / Math.pow(k + 1, Math.max(0, o.decroissance)),
    });
  }
  return out;
}

/**
 * La fréquence d'un partiel à un instant donné.
 *
 * L'angle avance linéairement dans le temps, et le rayon suit e^(bθ) : la fréquence est donc
 * géométrique dans le temps, ce qui s'entend comme un glissando de vitesse constante en demi-tons.
 */
export function frequenceAuTemps(p: Partiel, o: OptionsSpirale, t: number): number {
  const part = o.dureeSec > 0 ? borner(t / o.dureeSec, 0, 1) : 0;
  return p.frequenceDebut * Math.pow(rapportValide(o.rapport), o.tours * part);
}

/**
 * L'écart, en parts pour mille, entre le spectre à l'instant t et celui à t plus un tour, une fois
 * ce dernier divisé par le rapport.
 *
 * C'EST LA PROPRIÉTÉ QUI DÉFINIT LA SPIRALE : un tour vaut un changement d'échelle. L'écart est
 * calculé sur les partiels qui restent communs aux deux instants, le plus aigu sortant et un
 * nouveau entrant au grave.
 */
export function ecartAutoSimilarite(o: OptionsSpirale): number {
  if (o.tours === 0 || o.dureeSec <= 0) return 0;
  const rapport = rapportValide(o.rapport);
  const partiels = partielsDeSpirale(o);
  const dtUnTour = o.dureeSec / Math.abs(o.tours);
  // L'instant est pris de sorte qu'un tour plus tard on soit encore dans le parcours : sur un seul
  // tour, la comparaison part du début, faute de quoi elle butterait sur la fin et ne mesurerait
  // plus rien.
  const t = Math.max(0, (o.dureeSec - dtUnTour) / 2);
  let pire = 0;
  for (const p of partiels) {
    const avant = frequenceAuTemps(p, o, t);
    const apres = frequenceAuTemps(p, o, t + dtUnTour);
    const attendu = o.tours > 0 ? avant * rapport : avant / rapport;
    pire = Math.max(pire, Math.abs(apres - attendu) / attendu);
  }
  return pire * 1000;
}
