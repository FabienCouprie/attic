// audio/csound-aleatoire.ts — Des partitions tirées au sort, comme à l'origine du langage.
//
// POURQUOI CE N'EST PAS « UNE MÉLODIE ALÉATOIRE PUIS UN TRADUCTEUR ». Un MIDI ne porte que hauteur,
// vélocité et durée ; une partition Csound porte autant de p-fields qu'on veut, et surtout elle n'est
// pas tenue à une grille. C'est même l'usage HISTORIQUE de cette famille de langages : Iannis Xenakis
// a écrit ses pièces stochastiques — la série ST, 1962, sur un IBM 7090 — en tirant les instants
// d'attaque dans une LOI EXPONENTIELLE, c'est-à-dire un processus de Poisson, et les hauteurs et
// durées dans d'autres lois. C'est ce que ce module fait.
//
// LE PROCESSUS DE POISSON, EN UNE PHRASE : les événements y arrivent au hasard, sans mémoire, à une
// densité moyenne donnée — et l'intervalle entre deux voisins suit alors une loi exponentielle. Sa
// signature est mesurable, et le nœud la mesure : l'écart-type des intervalles ÉGALE leur moyenne.
// Une grille régulière, elle, a un écart-type nul. C'est la différence entre un nuage et une pulsation,
// et elle s'entend autant qu'elle se calcule.
//
// CE QUI EST TIRÉ AU SORT ET CE QUI NE L'EST PAS. Les instants, les hauteurs, les durées, les
// vélocités et un champ libre le sont ; la gamme, l'étendue et le nombre d'instruments ne le sont
// pas. Un tirage sans contrainte ne donne pas de la musique mais du bruit — c'est d'ailleurs ce que
// Xenakis contraignait le plus, ses lois étant bornées par des registres et des densités choisis.
import type { Courbe } from "./courbe";
import type { NoteAvecCanal } from "./csound-partition";

/** Comment les instants d'attaque se répartissent. */
export type Repartition = "poisson" | "grille";
/** Les lois disponibles pour les hauteurs et le champ libre. */
export type Loi = "uniforme" | "gaussienne";

/** Un événement tiré : une note, plus la valeur de son champ libre. */
export interface EvenementAleatoire extends NoteAvecCanal {
  /** Valeur du p-field libre, quand il est demandé. */
  libre?: number;
}

export interface OptionsAleatoire {
  duree: number;
  /** Événements par seconde, en moyenne. */
  densite: number;
  repartition: Repartition;
  /** Sur combien d'instruments répartir — les canaux 0 à n−1. */
  instruments: number;
  noteBasse: number;
  noteHaute: number;
  /** Degrés de la gamme, en demi-tons depuis le do : [0,2,4,5,7,9,11] pour majeur. */
  degres: readonly number[];
  loiHauteur: Loi;
  dureeMin: number;
  dureeMax: number;
  velociteMin: number;
  velociteMax: number;
  /** Bornes du champ libre. Absentes, aucun champ libre n'est tiré. */
  libreMin?: number;
  libreMax?: number;
  loiLibre?: Loi;
  /** Courbe de 0 à 1 qui module la densité au fil du temps. */
  courbeDensite?: Courbe | null;
  hasard: () => number;
}

export interface StatsAleatoire {
  evenements: number;
  /** Densité réellement obtenue, événements par seconde. */
  densiteReelle: number;
  /** Moyenne et écart-type des intervalles entre attaques : la signature de la loi. */
  intervalleMoyen: number;
  intervalleEcartType: number;
  hauteurMoyenne: number;
  hauteurEcartType: number;
  /** Combien d'événements par instrument, dans l'ordre. */
  parInstrument: number[];
  duree: number;
}

/** Une valeur gaussienne centrée réduite, par la transformation de Box et Muller (1958). */
export function gaussienne(hasard: () => number): number {
  // `1 − u` plutôt que `u` : `Math.log(0)` vaut −∞, et un générateur qui rend zéro existe.
  const u = 1 - hasard();
  const v = hasard();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** La valeur d'une courbe au temps donné, en secondes, bornée à ses extrémités. */
function valeurCourbe(courbe: Courbe, t: number): number {
  const n = courbe.valeurs.length;
  if (n === 0) return 1;
  return courbe.valeurs[Math.max(0, Math.min(n - 1, Math.round(t * courbe.cadence)))];
}

/**
 * Les instants d'attaque.
 *
 * POISSON : on accumule des intervalles tirés dans une loi exponentielle, `−ln(1−u)/λ`. C'est la
 * définition même du processus, et elle donne gratuitement sa propriété d'absence de mémoire.
 *
 * LA DENSITÉ VARIABLE se fait par AMINCISSEMENT (Lewis et Shedler, 1979) : on tire à la densité
 * MAXIMALE, puis on garde chaque instant avec la probabilité λ(t)/λmax. C'est la façon correcte —
 * faire varier λ dans le tirage lui-même biaiserait la loi, et l'on n'obtiendrait plus un processus
 * de Poisson mais une déformation sans nom.
 *
 * GRILLE : un instant tous les 1/λ. L'écart-type des intervalles y est nul, ce qui est exactement ce
 * qui la distingue du nuage.
 */
export function instantsAleatoires(
  duree: number, densite: number, repartition: Repartition,
  hasard: () => number, courbe?: Courbe | null,
): number[] {
  const lambda = Math.max(0.01, densite);
  const instants: number[] = [];
  if (repartition === "grille") {
    for (let t = 0; t < duree; t += 1 / lambda) {
      if (!courbe || hasard() < valeurCourbe(courbe, t)) instants.push(t);
    }
    return instants;
  }
  let t = 0;
  // Un garde-fou : à très forte densité sur une longue durée, la boucle doit rester bornée.
  const plafond = Math.ceil(duree * lambda * 4) + 100;
  while (t < duree && instants.length < plafond) {
    t += -Math.log(1 - hasard()) / lambda;
    if (t >= duree) break;
    if (!courbe || hasard() < valeurCourbe(courbe, t)) instants.push(t);
  }
  return instants;
}

/**
 * Une hauteur dans l'étendue, restreinte à la gamme.
 *
 * La loi GAUSSIENNE est centrée au milieu de l'étendue, avec un écart-type du quart de celle-ci : les
 * deux tiers des notes tombent alors dans la moitié centrale, et les bords restent atteignables. Les
 * valeurs hors bornes sont REPLIÉES et non écrêtées — écrêter entasserait les notes sur les deux
 * notes extrêmes, ce qui s'entend comme un défaut.
 */
export function tirerHauteur(
  basse: number, haute: number, degres: readonly number[], loi: Loi, hasard: () => number,
): number {
  const bas = Math.min(basse, haute), haut = Math.max(basse, haute);
  let note: number;
  if (loi === "gaussienne") {
    const centre = (bas + haut) / 2;
    const sigma = Math.max(1, (haut - bas) / 4);
    note = centre + gaussienne(hasard) * sigma;
    // Repli : la note qui dépasse revient à l'intérieur par symétrie.
    const etendue = haut - bas;
    if (etendue > 0) {
      while (note < bas || note > haut) {
        note = note < bas ? bas + (bas - note) : haut - (note - haut);
      }
    } else note = bas;
  } else {
    note = bas + hasard() * (haut - bas);
  }
  const entiere = Math.round(note);
  if (degres.length === 0 || degres.length === 12) return Math.max(0, Math.min(127, entiere));
  // La note la plus proche qui appartient à la gamme, en cherchant de part et d'autre.
  const dansLaGamme = (n: number) => degres.includes(((n % 12) + 12) % 12);
  for (let ecart = 0; ecart <= 6; ecart++) {
    if (dansLaGamme(entiere - ecart) && entiere - ecart >= bas) return entiere - ecart;
    if (dansLaGamme(entiere + ecart) && entiere + ecart <= haut) return entiere + ecart;
  }
  return Math.max(0, Math.min(127, entiere));
}

/** Une valeur tirée entre deux bornes, selon la loi demandée. */
export function tirerEntre(min: number, max: number, loi: Loi, hasard: () => number): number {
  const bas = Math.min(min, max), haut = Math.max(min, max);
  if (loi === "gaussienne") {
    const centre = (bas + haut) / 2;
    const sigma = Math.max(1e-9, (haut - bas) / 4);
    return Math.max(bas, Math.min(haut, centre + gaussienne(hasard) * sigma));
  }
  return bas + hasard() * (haut - bas);
}

/** Moyenne et écart-type d'une série. */
function moments(x: readonly number[]): { moyenne: number; ecartType: number } {
  if (x.length === 0) return { moyenne: 0, ecartType: 0 };
  const moyenne = x.reduce((s, v) => s + v, 0) / x.length;
  const variance = x.reduce((s, v) => s + (v - moyenne) ** 2, 0) / x.length;
  return { moyenne, ecartType: Math.sqrt(variance) };
}

/**
 * Compose la partition : des événements, et les statistiques de ce qui a été tiré.
 *
 * LES STATISTIQUES NE SONT PAS DÉCORATIVES. Un tirage se juge sur ce qu'il a produit, pas sur ce
 * qu'on lui a demandé : une densité de quatre par seconde sur huit secondes ne donne pas trente-deux
 * événements mais un nombre qui varie d'un tirage à l'autre, et c'est normal — le nœud annonce donc
 * le nombre RÉEL. Et l'écart-type des intervalles dit quelle loi a servi : égal à la moyenne pour un
 * processus de Poisson, nul pour une grille.
 */
export function composerAleatoire(
  o: OptionsAleatoire,
): { evenements: EvenementAleatoire[]; stats: StatsAleatoire } {
  const instants = instantsAleatoires(o.duree, o.densite, o.repartition, o.hasard, o.courbeDensite);
  const nbInstruments = Math.max(1, Math.round(o.instruments));
  const avecLibre = o.libreMin !== undefined && o.libreMax !== undefined;
  const evenements: EvenementAleatoire[] = instants.map((debut) => {
    const note = tirerHauteur(o.noteBasse, o.noteHaute, o.degres, o.loiHauteur, o.hasard);
    const duree = Math.max(0.01, tirerEntre(o.dureeMin, o.dureeMax, "uniforme", o.hasard));
    const velocite = Math.round(tirerEntre(o.velociteMin, o.velociteMax, "uniforme", o.hasard));
    const canal = Math.min(nbInstruments - 1, Math.floor(o.hasard() * nbInstruments));
    const e: EvenementAleatoire = {
      note, velocite: Math.max(1, Math.min(127, velocite)),
      debut, fin: debut + duree, canal,
    };
    if (avecLibre) {
      e.libre = tirerEntre(o.libreMin!, o.libreMax!, o.loiLibre ?? "uniforme", o.hasard);
    }
    return e;
  });

  const intervalles: number[] = [];
  for (let i = 1; i < instants.length; i++) intervalles.push(instants[i] - instants[i - 1]);
  const mi = moments(intervalles);
  const mh = moments(evenements.map((e) => e.note));
  const parInstrument = new Array(nbInstruments).fill(0);
  for (const e of evenements) parInstrument[e.canal ?? 0]++;

  return {
    evenements,
    stats: {
      evenements: evenements.length,
      densiteReelle: o.duree > 0 ? evenements.length / o.duree : 0,
      intervalleMoyen: mi.moyenne,
      intervalleEcartType: mi.ecartType,
      hauteurMoyenne: mh.moyenne,
      hauteurEcartType: mh.ecartType,
      parInstrument,
      duree: o.duree,
    },
  };
}

/** Les statistiques en texte : ce que le tirage a réellement produit. */
export function statsLisibles(s: StatsAleatoire, repartition: Repartition, en = false): string {
  // Le rapport écart-type / moyenne des intervalles : 1 pour un processus de Poisson, 0 pour une
  // grille. C'est la mesure qui dit si l'on a un nuage ou une pulsation.
  const signature = s.intervalleMoyen > 0 ? s.intervalleEcartType / s.intervalleMoyen : 0;
  const attendu = repartition === "poisson" ? 1 : 0;
  const l = en ? [
    `${s.evenements} events over ${s.duree.toFixed(2)} s — ${s.densiteReelle.toFixed(2)} per second`,
    `intervals: mean ${s.intervalleMoyen.toFixed(3)} s, standard deviation ${s.intervalleEcartType.toFixed(3)} s`,
    `  ratio ${signature.toFixed(2)} (expected ${attendu} for ${repartition === "poisson" ? "a Poisson process" : "a regular grid"})`,
    `pitch: mean ${s.hauteurMoyenne.toFixed(1)}, standard deviation ${s.hauteurEcartType.toFixed(1)} semitones`,
    `per instrument: ${s.parInstrument.map((n, i) => `i${i + 1}=${n}`).join(", ")}`,
  ] : [
    `${s.evenements} événements sur ${s.duree.toFixed(2)} s — ${s.densiteReelle.toFixed(2)} par seconde`,
    `intervalles : moyenne ${s.intervalleMoyen.toFixed(3)} s, écart-type ${s.intervalleEcartType.toFixed(3)} s`,
    `  rapport ${signature.toFixed(2)} (attendu ${attendu} pour ${repartition === "poisson" ? "un processus de Poisson" : "une grille régulière"})`,
    `hauteurs : moyenne ${s.hauteurMoyenne.toFixed(1)}, écart-type ${s.hauteurEcartType.toFixed(1)} demi-tons`,
    `par instrument : ${s.parInstrument.map((n, i) => `i${i + 1}=${n}`).join(", ")}`,
  ];
  return l.join("\n");
}
