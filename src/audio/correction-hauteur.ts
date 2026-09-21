// audio/correction-hauteur.ts — Ramener une note sur le degré le plus proche.
//
// LE CLASSIQUE QUI MANQUAIT, ET DONT ATTIC AVAIT DÉJÀ TOUTES LES PIÈCES : un suiveur de hauteur
// pYIN qui rend une fréquence par trame avec sa confiance, des gammes, des tempéraments, et de
// quoi transposer. Il ne manquait que le nœud qui les relie — ce qui est exactement la forme que
// prennent les oublis d'un catalogue qui grossit par familles.
//
// LES DEUX RÉGLAGES QUI FONT TOUT, ET QU'ON CONFOND SOUVENT. La FORCE dit quelle part de l'écart
// est corrigée : à 100 %, la note tombe pile sur le degré ; à 50 %, on garde la moitié du
// vibrato et des attaques, ce qui est ce qu'on veut presque toujours. La TRANSITION dit en combien
// de temps la correction s'installe : à zéro, la hauteur saute d'un degré à l'autre sans passer
// par les intermédiaires — c'est l'effet rendu célèbre par « Believe » en 1998, et c'est un effet,
// pas un défaut ; à cinquante millisecondes, l'oreille n'entend plus qu'une justesse retrouvée.
//
// CE QUE LA MÉTHODE GARDE, ET C'EST POURQUOI C'EST CELLE-LÀ. Le recollement synchrone des périodes
// (PSOLA) change l'ESPACEMENT des grains sans toucher à leur contenu : les formants restent où ils
// sont, et une voix corrigée ne prend pas l'accent de l'écureuil. Un rééchantillonnage, lui,
// déplacerait le spectre entier — et, sur de petites corrections, ne déplacerait même pas la
// hauteur, ce qu'un test a montré avant que la méthode ne change.
//
// SA LIMITE, PUISQU'ELLE EN A UNE : elle suppose un son PÉRIODIQUE. Sur une voix ou un instrument
// tenu, c'est le cas ; sur un accord, un bruit ou une percussion, il n'y a pas de période à
// recoller, et le seuil de confiance est là pour que ces passages ne soient pas corrigés du tout.
//
// L'ÉCART EST BORNÉ, et ce n'est pas une prudence décorative : un suiveur de hauteur se trompe
// d'octave sur les sons riches, et corriger une erreur d'octave déplacerait la note d'une octave
// entière. Au-delà de la borne, on ne corrige pas — mieux vaut laisser une note juste qu'en
// fabriquer une fausse.

import { suivreHauteur } from "./hauteur";
import type { Courbe } from "./courbe";

export interface OptionsCorrection {
  /** Les classes de hauteur permises, de 0 (do) à 11. */
  degres: number[];
  /** Part de l'écart corrigée, entre 0 et 1. */
  force: number;
  /** Temps d'installation de la correction, en millisecondes. Zéro donne le saut. */
  transitionMs: number;
  /** En deçà de cette confiance, la trame n'est pas corrigée. */
  seuilConfiance: number;
  /** Écart maximal corrigé, en demi-tons. Au-delà, on soupçonne une erreur d'octave. */
  ecartMaxDemiTons: number;
  frequence: number;
  /** Trames par seconde du suivi. */
  cadence?: number;
}

export interface ResultatCorrection {
  audio: Float32Array;
  /** La correction appliquée en demi-tons, trame par trame. */
  demiTons: Float32Array;
  cadence: number;
  /** Écart moyen corrigé, en cents — dit combien de travail a été fait. */
  centsMoyen: number;
  /** Part des trames effectivement corrigées : le reste était trop peu voisé, ou déjà juste. */
  partCorrigee: number;
}

const MIDI = (hz: number) => 69 + 12 * Math.log2(Math.max(1e-6, hz) / 440);

/**
 * Les gammes vers lesquelles on peut corriger.
 *
 * PEU NOMBREUSES, ET C'EST VOULU : corriger vers une gamme étroite déplace beaucoup les notes, et
 * plus une gamme a de degrés, moins la correction fait de travail. La chromatique ne fait que
 * rendre juste ; la pentatonique impose une couleur, et s'entend comme un effet.
 */
export const GAMMES_CORRECTION: { id: string; fr: string; en: string; degres: number[] }[] = [
  { id: "chromatique", fr: "Chromatique", en: "Chromatic", degres: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: "majeure", fr: "Majeure", en: "Major", degres: [0, 2, 4, 5, 7, 9, 11] },
  { id: "mineure", fr: "Mineure naturelle", en: "Natural minor", degres: [0, 2, 3, 5, 7, 8, 10] },
  { id: "mineure-harmonique", fr: "Mineure harmonique", en: "Harmonic minor", degres: [0, 2, 3, 5, 7, 8, 11] },
  { id: "penta-majeure", fr: "Pentatonique majeure", en: "Major pentatonic", degres: [0, 2, 4, 7, 9] },
  { id: "penta-mineure", fr: "Pentatonique mineure", en: "Minor pentatonic", degres: [0, 3, 5, 7, 10] },
  { id: "blues", fr: "Blues", en: "Blues", degres: [0, 3, 5, 6, 7, 10] },
];

/** Les degrés d'une gamme transposés sur une tonique, en classes de hauteur. */
export function degresDe(idGamme: string, tonique: number): number[] {
  const g = GAMMES_CORRECTION.find((x) => x.id === idGamme) ?? GAMMES_CORRECTION[0];
  return g.degres.map((d) => (((d + tonique) % 12) + 12) % 12);
}


/**
 * Le degré permis le plus proche d'une note MIDI, toutes octaves confondues.
 *
 * Rendu en note MIDI et non en classe : c'est l'écart qui nous intéresse, et il doit rester petit.
 */
export function degrePlusProche(midi: number, degres: readonly number[]): number {
  if (degres.length === 0) return midi;
  let meilleur = midi, distance = Infinity;
  const octave = Math.floor(midi / 12);
  for (const d of degres) {
    // Trois octaves candidates : celle du dessous, la sienne, celle du dessus. Une note juste sous
    // un do doit pouvoir remonter au do, et non redescendre au si de l'octave d'en dessous.
    for (const o of [octave - 1, octave, octave + 1]) {
      const cible = o * 12 + ((d % 12) + 12) % 12;
      const ecart = Math.abs(cible - midi);
      if (ecart < distance) { distance = ecart; meilleur = cible; }
    }
  }
  return meilleur;
}

/**
 * Transposition à rapport variable, par recollement synchrone des périodes (TD-PSOLA).
 *
 * POURQUOI PAS UN SIMPLE RÉÉCHANTILLONNAGE DE TRAMES, qui était le premier jet : sur une correction
 * ordinaire — quelques dizaines de cents — le recollement des trames réimpose la périodicité de
 * l'entrée, parce que chaque trame repart à la phase du signal d'origine. Mesuré : un la à 452 Hz
 * corrigé vers 440 ressortait à 452,06. La méthode marchait à l'octave et ne marchait pas du tout
 * là où on en a besoin.
 *
 * CE QUE PSOLA FAIT À LA PLACE. Le signal est découpé en grains de deux périodes, centrés sur les
 * marques de période ; on les recolle à un ESPACEMENT différent. Rapprocher les grains monte la
 * hauteur, les écarter la descend, et le contenu de chaque grain ne bouge pas — d'où la propriété
 * qui fait tout l'intérêt de la méthode ici : LES FORMANTS NE SUIVENT PAS LA NOTE. Une voix
 * corrigée ne prend pas l'accent de l'écureuil, ce qu'un rééchantillonnage lui aurait fait.
 *
 * Les grains restent à leur place dans le temps : la durée est conservée sans rien étirer.
 */
/**
 * LES BORNES DE LA MÉTHODE, MESURÉES ET NON SUPPOSÉES. Le recollement réutilise un même grain
 * quand les marques de sortie se resserrent ; à l'octave, deux copies espacées d'une demi-période
 * s'annulent presque entièrement. Mesuré sur un sinus de 300 Hz : à un rapport de 2, la raie
 * dominante tombe à 1 % du niveau d'entrée. Sur la plage utile, en revanche, la transposition est
 * juste : 0,97 rend 291 Hz, 1,03 rend 307, 1,5 rend 452.
 *
 * Le rapport est donc borné à quatre demi-tons de part et d'autre. Ce n'est pas une infirmité
 * cachée : une correction de justesse dépasse rarement le demi-ton, et au-delà le catalogue a des
 * transposeurs faits pour cela — vocodeur de phase, SoundTouch, harmoniseur.
 */
const RAPPORT_MIN = 0.79;   // quatre demi-tons vers le bas
const RAPPORT_MAX = 1.26;   // quatre demi-tons vers le haut

export function psola(
  x: Float32Array, periodes: Float32Array, rapports: Float32Array,
  cadence: number, frequence: number,
): Float32Array {
  const n = x.length;
  const sortie = new Float32Array(n);
  const parDefaut = Math.max(8, Math.round(frequence / 200));
  const trame = (position: number) =>
    Math.min(Math.max(periodes.length, rapports.length) - 1, Math.floor((position / frequence) * cadence));

  const periodeEn = (position: number, derniere: number) => {
    const p = periodes[Math.min(trame(position), periodes.length - 1)];
    return p > 4 ? p : derniere;
  };

  // LES MARQUES D'ENTRÉE : une par période du signal d'origine.
  const marques: number[] = [];
  {
    let p = 0, derniere = parDefaut;
    while (p < n) {
      marques.push(p);
      derniere = periodeEn(p, derniere);
      p += Math.max(1, derniere);
    }
  }
  if (marques.length === 0) return x.slice();

  // LES MARQUES DE SORTIE : espacées de la période DIVISÉE PAR LE RAPPORT. C'est là, et nulle part
  // ailleurs, que la hauteur change — le contenu des grains, lui, n'est jamais touché.
  let j = 0;               // la marque d'entrée la plus proche, qui avance avec la sortie
  let derniere = parDefaut;
  let q = 0;
  while (q < n) {
    const t = trame(q);
    const periode = periodeEn(q, derniere);
    derniere = periode;
    const r = Math.max(RAPPORT_MIN, Math.min(RAPPORT_MAX, rapports[Math.min(t, rapports.length - 1)] || 1));

    // LE GRAIN EST PRIS À LA MARQUE D'ENTRÉE LA PLUS PROCHE DANS LE TEMPS, et posé sur la marque de
    // sortie. C'est ce décalage entre lecture et écriture qui transpose : avec un rapport supérieur
    // à un, les marques de sortie se resserrent et le même grain sert deux fois ; en deçà, un grain
    // est sauté. Le premier jet lisait et écrivait au même endroit, ce qui était une copie — et un
    // test l'a montré en mesurant 452,06 Hz là où l'on demandait 440.
    while (j + 1 < marques.length && Math.abs(marques[j + 1] - q) <= Math.abs(marques[j] - q)) j++;
    const centre = Math.round(marques[j]);
    const ecrit = Math.round(q);
    const demi = Math.max(2, Math.round(periode));
    // LES GRAINS S'ADDITIONNENT, ILS NE SE MOYENNENT PAS, et c'est tout le sujet. Diviser par la
    // somme des fenêtres — le réflexe de tout recouvrement — détruirait exactement ce qui fait la
    // nouvelle hauteur : la somme de deux copies d'un même grain espacées d'une demi-période
    // annule la fondamentale et renforce l'octave, et c'est ainsi que la période change. Mesuré :
    // avec la moyenne, un rapport de 2 rendait 150 Hz pour une entrée à 300.
    //
    // Le niveau, lui, se tient par le rapport de recouvrement : des grains deux fois plus serrés
    // sonneraient deux fois plus fort, d'où la division par `r` — une constante par grain, qui ne
    // touche pas aux interférences.
    const gain = 1 / r;
    for (let i = -demi; i <= demi; i++) {
      const lecture = centre + i, ecriture = ecrit + i;
      if (lecture < 0 || lecture >= n || ecriture < 0 || ecriture >= n) continue;
      const w = 0.5 * (1 + Math.cos((Math.PI * i) / demi));
      sortie[ecriture] += x[lecture] * w * gain;
    }
    q += Math.max(1, periode / r);
  }
  return sortie;
}

/** Lissage à un pôle, dans les deux sens : la correction s'installe sans décaler le temps. */
function lisser(v: Float32Array, transitionMs: number, cadence: number): Float32Array {
  if (transitionMs <= 0) return v.slice();
  const tau = Math.max(1e-6, (transitionMs / 1000) * cadence);
  const a = Math.exp(-1 / tau);
  const out = v.slice();
  for (let i = 1; i < out.length; i++) out[i] = a * out[i - 1] + (1 - a) * out[i];
  for (let i = out.length - 2; i >= 0; i--) out[i] = a * out[i + 1] + (1 - a) * out[i];
  return out;
}

export function corrigerHauteur(x: Float32Array, o: OptionsCorrection): ResultatCorrection {
  const cadence = Math.max(20, o.cadence ?? 100);
  const suivi = suivreHauteur(x, o.frequence, { cadence });
  const brut = new Float32Array(suivi.hauteurs.length);
  let sommeCents = 0, corrigees = 0;

  for (let t = 0; t < suivi.hauteurs.length; t++) {
    const f = suivi.hauteurs[t];
    if (f <= 0 || suivi.confiances[t] < o.seuilConfiance) continue;
    const midi = MIDI(f);
    const ecart = degrePlusProche(midi, o.degres) - midi;
    // Au-delà de la borne, on soupçonne une erreur d'octave du suiveur : on ne touche à rien.
    if (Math.abs(ecart) > o.ecartMaxDemiTons) continue;
    brut[t] = ecart * Math.min(1, Math.max(0, o.force));
    sommeCents += Math.abs(brut[t]) * 100;
    corrigees++;
  }

  const demiTons = lisser(brut, o.transitionMs, cadence);
  const rapports = Float32Array.from(demiTons, (d) => Math.pow(2, d / 12));
  // Les périodes viennent du même suivi que les hauteurs : PSOLA a besoin de savoir où sont les
  // périodes, et c'est précisément ce qu'un suiveur de hauteur calcule.
  const periodes = Float32Array.from(suivi.hauteurs, (f) => (f > 0 ? o.frequence / f : 0));
  return {
    audio: psola(x, periodes, rapports, cadence, o.frequence),
    demiTons, cadence,
    centsMoyen: corrigees > 0 ? sommeCents / corrigees : 0,
    partCorrigee: suivi.hauteurs.length > 0 ? corrigees / suivi.hauteurs.length : 0,
  };
}

/**
 * La correction en courbe, pour la regarder.
 *
 * UN DEMI vaut « aucune correction », puisqu'une courbe porte des valeurs entre zéro et un et
 * qu'une correction, elle, a un signe. Le haut du tracé tire vers l'aigu, le bas vers le grave.
 */
export function courbeDeCorrection(r: ResultatCorrection, ecartMaxDemiTons: number): Courbe {
  const etendue = Math.max(1e-6, ecartMaxDemiTons);
  return {
    valeurs: Float32Array.from(r.demiTons, (d) => Math.min(1, Math.max(0, 0.5 + d / (2 * etendue)))),
    cadence: r.cadence,
  };
}
