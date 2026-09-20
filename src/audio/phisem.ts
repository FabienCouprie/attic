// audio/phisem.ts — Percussions secouées, par modèle stochastique de particules.
//
// Perry Cook a posé le problème à l'envers de la synthèse ordinaire. Pour une maraca, on
// pourrait résoudre numériquement le mouvement de chaque grain dans la calebasse — c'est
// ce qu'il a fait —, mais le résultat est trop lourd et, surtout, inutile : l'oreille
// n'entend pas les trajectoires, elle entend une STATISTIQUE. Il n'a donc gardé des
// simulations que deux nombres : la probabilité qu'une collision se produise à un instant
// donné, et la vitesse à laquelle l'énergie du système retombe. C'est le PhISEM
// (« Physically Informed Stochastic Event Modeling », 1996-97), et il tient en quinze
// lignes tout en donnant des maracas, une cabasa ou un tambourin reconnaissables.
//
// Le modèle a trois étages. L'ÉNERGIE DU SYSTÈME monte à chaque secousse et retombe
// exponentiellement. À chaque échantillon, une collision se produit avec une probabilité
// proportionnelle à cette énergie et au nombre de particules ; elle dépose une bouffée de
// bruit qui décroît beaucoup plus vite. Ce bruit passe enfin dans un ou plusieurs
// RÉSONATEURS, qui sont la seule chose qui distingue vraiment un instrument d'un autre :
// une maraca résonne vers 3 kHz, un grelot ajoute des modes métalliques vers 5 et 6 kHz.
//
// Tout est déterministe à graine fixée : deux exécutions donnent le même son, ce qui n'est
// pas vrai d'un vrai tambourin mais est indispensable ici.

export interface Resonance {
  /** Fréquence centrale, en hertz. */
  frequence: number;
  /** Rayon du pôle, de 0 à 1 : plus il est proche de 1, plus la résonance est longue. */
  rayon: number;
  gain: number;
}

export interface Secoueur {
  id: string;
  fr: string;
  en: string;
  /** Nombre d'objets dans le récipient : c'est lui qui fait la densité de grains. */
  particules: number;
  /** Temps de retombée de l'énergie d'une secousse, en secondes. */
  dureeEnergie: number;
  /** Durée d'une collision, en secondes — quelques millisecondes. */
  dureeCollision: number;
  resonances: Resonance[];
}

/**
 * Les instruments.
 *
 * Les fréquences sont de l'ordre de celles que Cook donne pour ses modèles, et le nombre
 * de particules suit la même logique : quelques dizaines de graines dans une maraca, des
 * centaines de billes sur une cabasa, d'où le passage d'un crépitement compté à un
 * chuintement continu. Ce ne sont pas des mesures d'instruments réels, et aucune ne
 * prétend l'être — ce sont les réglages qui rendent le geste reconnaissable.
 */
export const SECOUEURS: Secoueur[] = [
  {
    id: "maracas", fr: "Maracas", en: "Maracas",
    particules: 25, dureeEnergie: 0.3, dureeCollision: 0.006,
    resonances: [{ frequence: 3200, rayon: 0.96, gain: 1 }],
  },
  {
    id: "cabasa", fr: "Cabasa", en: "Cabasa",
    particules: 512, dureeEnergie: 0.25, dureeCollision: 0.004,
    resonances: [{ frequence: 3000, rayon: 0.7, gain: 1 }],
  },
  {
    id: "sekere", fr: "Chékéré", en: "Shekere",
    particules: 64, dureeEnergie: 0.35, dureeCollision: 0.005,
    resonances: [{ frequence: 5500, rayon: 0.6, gain: 1 }],
  },
  {
    id: "tambourin", fr: "Tambourin", en: "Tambourine",
    particules: 32, dureeEnergie: 0.4, dureeCollision: 0.008,
    // La peau, puis les cymbalettes : ce sont elles qu'on reconnaît.
    resonances: [
      { frequence: 2300, rayon: 0.96, gain: 0.8 },
      { frequence: 5600, rayon: 0.99, gain: 1 },
      { frequence: 8100, rayon: 0.99, gain: 0.7 },
    ],
  },
  {
    id: "grelots", fr: "Grelots", en: "Sleigh bells",
    particules: 32, dureeEnergie: 0.4, dureeCollision: 0.01,
    resonances: [
      { frequence: 2500, rayon: 0.99, gain: 0.8 },
      { frequence: 5300, rayon: 0.99, gain: 1 },
      { frequence: 6500, rayon: 0.99, gain: 0.8 },
    ],
  },
  {
    id: "gouttes", fr: "Gouttes d'eau", en: "Water drops",
    particules: 10, dureeEnergie: 0.5, dureeCollision: 0.05,
    resonances: [
      { frequence: 450, rayon: 0.9995, gain: 1 },
      { frequence: 600, rayon: 0.9995, gain: 0.9 },
      { frequence: 750, rayon: 0.9995, gain: 0.8 },
    ],
  },
];

export const secoueur = (id: string): Secoueur =>
  SECOUEURS.find((s) => s.id === id) ?? SECOUEURS[0];

/**
 * Coefficient d'une décroissance de 60 dB en `duree` secondes.
 *
 * Exprimer les décroissances en SECONDES plutôt qu'en coefficient par échantillon rend le
 * modèle indépendant de la fréquence d'échantillonnage — les valeurs publiées, elles,
 * étaient réglées pour 22 050 Hz et changeaient de sens à 44 100.
 */
export function coefficientDecroissance(duree: number, frequenceEch: number): number {
  const n = Math.max(1, duree * frequenceEch);
  return Math.exp(Math.log(0.001) / n);
}

export interface Secousse {
  /** Instant de la secousse, en secondes. */
  instant: number;
  /** Énergie déposée, de 0 à 1. */
  energie: number;
}

/** Des secousses régulières, quand aucun rythme n'est fourni. */
export function secoussesRegulieres(duree: number, parSeconde: number, energie: number): Secousse[] {
  const secousses: Secousse[] = [];
  const pas = 1 / Math.max(0.01, parSeconde);
  for (let t = 0; t < duree; t += pas) secousses.push({ instant: t, energie });
  return secousses;
}

export interface ConfigSecoueur {
  secoueur: Secoueur;
  duree: number;
  secousses: Secousse[];
  frequenceEch: number;
  /** Remplace le nombre de particules de l'instrument, quand on veut le régler. */
  particules?: number;
}

export interface ResultatSecoueur {
  signal: Float32Array;
  /** Nombre de collisions engendrées : c'est la densité de grains, et elle s'entend. */
  collisions: number;
}

/** Un résonateur à deux pôles, celui du modèle d'origine. */
function resonateur(r: Resonance, frequenceEch: number) {
  const a1 = -2 * r.rayon * Math.cos((2 * Math.PI * r.frequence) / frequenceEch);
  const a2 = r.rayon * r.rayon;
  // Normalisation du gain crête, sans quoi un pôle proche de 1 sature tout.
  const b0 = (0.5 - 0.5 * a2) * r.gain;
  let y1 = 0, y2 = 0;
  return (x: number): number => {
    const y = b0 * x - a1 * y1 - a2 * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/**
 * Le modèle, échantillon par échantillon.
 *
 * `aleatoire` sert deux fois : pour le tirage de collision et pour le bruit déposé. Les
 * deux viennent du même générateur, donc d'une seule graine.
 */
export function synthetiserSecoueur(
  config: ConfigSecoueur, aleatoire: () => number,
): ResultatSecoueur {
  const { secoueur: s, frequenceEch: fs } = config;
  const longueur = Math.max(1, Math.ceil(config.duree * fs));
  const signal = new Float32Array(longueur);
  const particules = Math.max(0, config.particules ?? s.particules);
  const decroissanceEnergie = coefficientDecroissance(s.dureeEnergie, fs);
  const decroissanceSon = coefficientDecroissance(s.dureeCollision, fs);
  const filtres = s.resonances.map((r) => resonateur(r, fs));

  // Les secousses rangées par instant, pour n'avoir qu'un index à avancer.
  const secousses = [...config.secousses].sort((a, b) => a.instant - b.instant);
  let prochaine = 0;
  let energie = 0, niveau = 0, collisions = 0;

  for (let i = 0; i < longueur; i++) {
    while (prochaine < secousses.length && secousses[prochaine].instant * fs <= i) {
      energie += Math.max(0, Math.min(1, secousses[prochaine].energie));
      prochaine++;
    }
    energie *= decroissanceEnergie;
    // La collision est un TIRAGE : sa probabilité monte avec l'énergie et le nombre de
    // particules. C'est tout ce qui reste de la simulation newtonienne d'origine.
    if (aleatoire() < particules * energie * 0.0005) {
      niveau += energie;
      collisions++;
    }
    niveau *= decroissanceSon;
    const bruit = niveau * (2 * aleatoire() - 1);
    let sortie = 0;
    for (const f of filtres) sortie += f(bruit);
    signal[i] = sortie;
  }

  // Normalisation : le gain dépend trop des résonances pour être laissé à l'utilisateur.
  let crete = 0;
  for (let i = 0; i < longueur; i++) crete = Math.max(crete, Math.abs(signal[i]));
  if (crete > 0) {
    const g = 0.9 / crete;
    for (let i = 0; i < longueur; i++) signal[i] *= g;
  }
  return { signal, collisions };
}
