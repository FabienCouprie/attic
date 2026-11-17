// audio/enveloppe-tb303.ts — La coupure de la TB-303 conduite par ses notes : enveloppe, glissé et accent.
//
// ═══ CE QUE LE MODULE REND ═══
//
// Une coupure par échantillon, en hertz, tirée de la coupure de base et des notes reçues, telle que la
// TB-303 la forme avant d'en nourrir son filtre. Le filtre lui-même est dans `filtre-tb303.ts`.
//
// ═══ CE QUI EST MODÉLISÉ ═══
//
// - L'ENVELOPPE PRINCIPALE (la « MEG » des descriptions du circuit). Chaque note qui ne glisse pas la
//   relance : elle monte à un en 3 ms depuis où elle était, puis décroît en exponentielle. Le « Déclin »
//   est le temps qu'elle met à retomber à un dixième, de 200 ms à 2 s ; sur une note accentuée il vaut
//   200 ms, quel que soit le réglage (R. Whittle, « Devil Fish » TB-303 Modifications, 1999, et le
//   manuel de la Devil Fish, 2019). La fin d'une note ne change rien à l'enveloppe, qui n'a pas de
//   maintien.
// - LE GLISSÉ. Une note qui commence avant la fin de la précédente ne relance pas l'enveloppe. C'est
//   aussi ce qui fait qu'un accord ne relance l'enveloppe qu'une fois : l'instrument est monophonique.
// - LA MODULATION D'ENVELOPPE, par la correspondance qu'Open303 (Robin Schmidt) tire de mesures sur
//   l'instrument : l'enveloppe monte la crête ET descend le repos sous la coupure de base, d'autant
//   plus que la modulation est forte, et elle ne s'annule pas à 0 %. À la coupure la plus basse de
//   l'instrument (313,8 Hz), 0 % donne un repos à 0,86 fois la coupure et une crête à 1,43 fois ;
//   100 % donne 0,40 et 9,1 fois.
// - LE BALAYAGE D'ACCENT. Pendant une note accentuée, l'enveloppe traverse le circuit que Whittle décrit :
//   une diode et 47 kΩ mènent à un bout d'un potentiomètre de 100 kΩ, le second étage de celui de la
//   résonance ; l'autre bout porte un condensateur de 1 µF (C13) à la masse, et le curseur rejoint le
//   nœud de sommation de la coupure par 100 kΩ. Ce petit réseau est résolu ici tel quel, la diode
//   comprise. Résonance faible, le curseur est du côté de la diode et la coupure suit presque
//   l'enveloppe ; résonance forte, il est du côté du condensateur, qui lisse le balayage et garde sa
//   charge d'un accent au suivant : des accents rapprochés montent plus haut. Relevé par
//   `audio/enveloppe-tb303.test.ts`, trois accents de 100 ms à 150 ms d'écart, « Accent » à 100 % :
//   2,00, 2,15 et 2,20 octaves à résonance nulle ; 0,70, 0,84 et 0,85 à résonance pleine, la crête
//   venant plus tard.
//
// ═══ CE QUI EST UN CHOIX, ET NON UNE MESURE ═══
//
// - LA PROFONDEUR DE L'ACCENT. Aucune source publiée ne la chiffre. « Accent » à 100 % monte la coupure
//   de deux octaves au plus pour un accent isolé, résonance nulle ; c'est la décision de Fabien, du
//   2026-11-15, sur la proposition qui le disait.
// - LE RETARD DE 4 MS que l'instrument laisse avant l'attaque n'est pas repris : il tient au séquenceur,
//   et le son reçu ici n'a pas ce retard.
// - L'ACCENT N'AGIT QUE SUR LA COUPURE. Sur l'instrument, il monte aussi le volume par l'amplificateur,
//   que ce composant n'a pas.

import { valeurA } from "./courbe";

/** Une note, en secondes, et sa vélocité de 0 à 127. */
export interface NoteTb303 {
  debut: number;
  fin: number;
  velocite: number;
}

export interface OptionsEnveloppeTb303 {
  /** La fréquence d'échantillonnage. */
  frequence: number;
  /** Le nombre d'échantillons à rendre. */
  longueur: number;
  notes: readonly NoteTb303[];
  /** La coupure de base, en hertz, constante ou une valeur par échantillon. */
  coupure: number | Float32Array;
  /** La résonance, de 0 à 1 : elle place le curseur du balayage d'accent. */
  resonance: number | Float32Array;
  /** La modulation d'enveloppe, de 0 à 1. */
  modulation: number;
  /** Le déclin des notes ordinaires, en secondes. */
  declin: number;
  /** La profondeur de l'accent, de 0 à 1. */
  accent: number;
  /** La vélocité à partir de laquelle une note est accentuée. */
  velociteAccent: number;
}

export interface ResultatEnveloppeTb303 {
  /** La coupure par échantillon, en hertz. */
  coupure: Float32Array;
  /** Les notes qui ont relancé l'enveloppe, les accentuées parmi elles, et celles qui ont glissé. */
  jouees: number;
  accentuees: number;
  glissees: number;
}

/** Le déclin d'une note accentuée, en secondes. */
export const DECLIN_ACCENT = 0.2;
/** La durée de l'attaque, en secondes. */
export const ATTAQUE_ENVELOPPE = 0.003;
/** Les octaves que monte un accent isolé à 100 %, résonance nulle. */
export const OCTAVES_ACCENT = 2;

// La correspondance mesurée d'Open303 (`calculateEnvModScalerAndOffset`), telle que la source l'écrit.
const C0 = 313.8152786059267, C1 = 2394.411986817546;
const OF = 0.048292930943553, OC = 0.294391201442418;
const SLOF = 3.773996325111173, SLOC = 0.736965594166206;
const SHIF = 4.194548788411135, SHIC = 0.864344900642434;

/**
 * L'échelle et le décalage de l'enveloppe, en octaves, à une coupure et une modulation données.
 *
 * La coupure de l'instant vaut coupure · 2^(échelle · (enveloppe − décalage)). La position du bouton se
 * lit de la coupure sur l'étendue de l'instrument, 313,8 Hz à 2 394 Hz, et se borne à cette étendue.
 */
export function echelleEnveloppe(coupure: number, modulation: number): { echelle: number; decalage: number } {
  const c = Math.min(1, Math.max(0, Math.log(coupure / C0) / Math.log(C1 / C0)));
  const e = Math.min(1, Math.max(0, modulation));
  return {
    echelle: (1 - c) * (SLOF * e + SLOC) + c * (SHIF * e + SHIC),
    decalage: OF * c + OC,
  };
}

// Le réseau du balayage d'accent, en unités de 100 kΩ et de 1 µF : une constante de temps de 0,1 s.
const R_DIODE = 0.47, R_MELANGE = 1, TAU_UNITE = 0.1;
/** Le plus petit bras du potentiomètre, pour que ses deux bouts restent des résistances. */
const BRAS_MIN = 1e-3;

/**
 * Le courant que le balayage verse au nœud de sommation, comme une fonction affine de la tension du
 * condensateur : vW = alpha + beta · vB. `u` est l'enveloppe à l'entrée de la diode, `p` la position
 * du curseur, de la diode (0) au condensateur (1).
 */
function curseur(u: number, p: number, vB: number): { alpha: number; beta: number; g2: number } {
  const g1 = 1 / Math.max(p, BRAS_MIN), g2 = 1 / Math.max(1 - p, BRAS_MIN);
  const gA = 1 / R_DIODE, gm = 1 / R_MELANGE;
  // Diode passante : deux nœuds, A (après la diode et 47 kΩ) et W (le curseur).
  //   (gA + g1) vA − g1 vW = gA u
  //   −g1 vA + (g1 + g2 + gm) vW = g2 vB
  const d = (gA + g1) * (g1 + g2 + gm) - g1 * g1;
  const alpha = (g1 * gA * u) / d, beta = ((gA + g1) * g2) / d;
  const vW = alpha + beta * vB;
  const vA = (gA * u + g1 * vW) / (gA + g1);
  if (u > vA) return { alpha, beta, g2 };
  // Diode bloquée : rien n'entre en A, qui prend la tension du curseur.
  return { alpha: 0, beta: g2 / (g2 + gm), g2 };
}

interface Enveloppes {
  /** L'enveloppe principale, de 0 à 1. */
  meg: Float32Array;
  /** Ce que le balayage d'accent verse au nœud de sommation, dans l'unité de l'enveloppe. */
  balayage: Float32Array;
  jouees: number;
  accentuees: number;
  glissees: number;
}

/** L'enveloppe principale et le balayage d'accent, échantillon par échantillon. */
function enveloppes(o: Omit<OptionsEnveloppeTb303, "coupure" | "modulation" | "accent">): Enveloppes {
  const { frequence: fe, longueur: n } = o;
  const meg = new Float32Array(n), balayage = new Float32Array(n);
  // Les déclenchements, rangés : une note qui commence avant la fin de la précédente glisse.
  const triees = [...o.notes].filter((x) => Number.isFinite(x.debut) && x.velocite > 0).sort((a, b) => a.debut - b.debut);
  // Chaque départ porte son accent et le rang où sa note finit : le commutateur d'accent n'est fermé
  // que pendant la note accentuée.
  const departs = new Map<number, { accentuee: boolean; fin: number }>();
  let finPrecedente = -Infinity, jouees = 0, accentuees = 0, glissees = 0;
  for (const note of triees) {
    const rang = Math.max(0, Math.round(note.debut * fe));
    const glisse = note.debut < finPrecedente;
    finPrecedente = Math.max(finPrecedente, note.fin);
    if (rang >= n) continue;
    if (glisse) { glissees++; continue; }
    const accentuee = note.velocite >= o.velociteAccent;
    departs.set(rang, { accentuee, fin: Math.max(rang + 1, Math.round(note.fin * fe)) });
    jouees++;
    if (accentuee) accentuees++;
  }

  const attaque = Math.max(1, Math.round(ATTAQUE_ENVELOPPE * fe));
  const facteur = (declin: number) => Math.exp(-Math.log(10) / (Math.max(declin, 1e-3) * fe));
  const facteurOrdinaire = facteur(o.declin), facteurAccent = facteur(DECLIN_ACCENT);
  const dt = 1 / fe;
  let m = 0, depart = 0, restant = 0, accentEnCours = false, finAccent = 0, vB = 0;

  for (let i = 0; i < n; i++) {
    const declenche = departs.get(i);
    if (declenche !== undefined) {
      accentEnCours = declenche.accentuee; finAccent = declenche.fin; depart = m; restant = attaque;
    }
    if (restant > 0) {
      restant--;
      m = 1 - (1 - depart) * (restant / attaque);
    } else {
      m *= accentEnCours ? facteurAccent : facteurOrdinaire;
    }
    meg[i] = m;

    // Le balayage d'accent : le curseur suit la résonance, le condensateur s'intègre exactement sur le pas.
    const r = valeurA(o.resonance, i);
    const p = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0;
    const { alpha, beta, g2 } = curseur(accentEnCours && i < finAccent ? m : 0, p, vB);
    balayage[i] = alpha + beta * vB;
    const fuite = 1 - beta;
    if (fuite > 1e-12) {
      const limite = alpha / fuite;
      vB = limite + (vB - limite) * Math.exp((-g2 * fuite * dt) / TAU_UNITE);
    }
  }
  return { meg, balayage, jouees, accentuees, glissees };
}

/**
 * La crête du balayage pour un accent isolé, résonance nulle : l'unité de la profondeur de l'accent.
 *
 * ELLE SE RELÈVE ET NE SE LIT PAS À L'ATTAQUE : le condensateur se charge pendant l'impulsion et le
 * curseur en reçoit une part, de sorte que le balayage monte encore un peu après l'attaque. Relevée
 * à 48 kHz ; à une autre fréquence d'échantillonnage, l'écart tient à l'attaque de 3 ms, discrétisée.
 */
export const CRETE_ACCENT_SEUL = (() => {
  const fe = 48000;
  const { balayage } = enveloppes({
    frequence: fe, longueur: fe, notes: [{ debut: 0, fin: 1, velocite: 127 }],
    resonance: 0, declin: 0.5, velociteAccent: 100,
  });
  return balayage.reduce((a, b) => Math.max(a, b), 0);
})();

/** La coupure conduite par les notes, échantillon par échantillon. */
export function coupureEnveloppee(o: OptionsEnveloppeTb303): ResultatEnveloppeTb303 {
  const { meg, balayage, jouees, accentuees, glissees } = enveloppes(o);
  const sortie = new Float32Array(o.longueur);
  const constante = typeof o.coupure === "number" ? echelleEnveloppe(o.coupure, o.modulation) : null;
  for (let i = 0; i < sortie.length; i++) {
    const base = valeurA(o.coupure, i);
    const { echelle, decalage } = constante ?? echelleEnveloppe(base, o.modulation);
    const octaves = echelle * (meg[i] - decalage) + (OCTAVES_ACCENT * o.accent * balayage[i]) / CRETE_ACCENT_SEUL;
    sortie[i] = base * 2 ** octaves;
  }
  return { coupure: sortie, jouees, accentuees, glissees };
}
