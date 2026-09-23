// audio/motif-crossmodal.ts — D'un point de l'espace des goûts vers un motif qu'on entend.
//
// CE FICHIER EST L'INVERSE DE `gout.ts`. Celui-là mesure cinq dimensions d'un son ; celui-ci part de
// cinq dimensions et fabrique un son qui s'y trouve. Les deux nœuds qui s'en servent — le parfum et
// l'accord mets-musique — deviennent donc vérifiables de la même façon que l'assaisonnement : on
// génère, on remesure avec « Le goût d'un son », et l'on regarde si le point est bien où il devait
// être.
//
// LES QUATRE INVERSIONS CI-DESSOUS SONT EXACTES, au sens où elles défont la normalisation de
// `gout.ts` terme pour terme. C'est ce qui permet de viser un point et non une impression : si
// `gout.ts` lit le registre comme `log2(f/55)/5`, on place le son à `55 · 2^(5h)`. Toute correction
// apportée là-bas doit l'être ici, et un test le vérifie dans les deux sens.
//
// CE QUI S'ATTEINT, ET CE QUI NE S'ATTEINT PAS. Relevé sur le synthétiseur de l'application, avec un
// timbre doux :
//
//   registre     atteint à 0,03 près, grâce à `rendreAuRegistre` qui mesure le rendu et le corrige ;
//   vitesse      atteinte à 0,05 près ;
//   intensité    exacte, sauf sur un motif trop crête pour monter sans écrêter ;
//   articulation approchée : la résonance du synthétiseur remplit un peu les silences, si bien qu'un
//                motif très piqué se mesure autour de 0,28 quand on visait 0,10 ;
//   consonance   LA PLUS FAIBLE DES CINQ. Elle descend de 0,99 à 0,70 environ, et pas en dessous :
//                la rugosité que `gout.ts` mesure sature vers 0,10 avec des notes tenues, là où la
//                région acide en demanderait 0,30. L'âpreté de l'acide est donc APPROCHÉE, jamais
//                atteinte, et les nœuds le disent en donnant le point visé à côté du point mesuré.

import { writeMidi } from "midi-file";
import type { NoteEvenement } from "./midi";
import { mesurer, type DimensionsGout } from "./gout";

const borner = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x));

/** Le registre visé en hertz. Inverse de `hauteur = log2(registre / 55) / 5`. */
export function hertzDepuisHauteur(hauteur: number): number {
  return 55 * Math.pow(2, 5 * borner(hauteur, 0, 1));
}

/** Les attaques par seconde visées. Inverse de `vitesse = (log2(attaques) + 1) / 4`. */
export function attaquesDepuisVitesse(vitesse: number): number {
  return Math.pow(2, 4 * borner(vitesse, 0, 1) - 1);
}

/** Le niveau efficace visé, en dB pleine échelle. Inverse de `intensite = (db + 40) / 40`. */
export function dbDepuisIntensite(intensite: number): number {
  return 40 * borner(intensite, 0, 1) - 40;
}

/**
 * De combien la médiane de l'énergie d'une note synthétisée dépasse sa fondamentale.
 *
 * Un point de départ, non une vérité : le biais dépend du timbre, d'une quinte et demie pour une
 * note presque sinusoïdale à deux octaves pour un timbre brillant. C'est `rendreAuRegistre` qui
 * ramène le registre où il faut, en mesurant le rendu ; ce facteur ne sert qu'à partir assez près
 * pour qu'une seule correction suffise.
 */
export const FACTEUR_TIMBRE = 1.5;

/** Une triade majeure sur deux octaves : tout intervalle y est consonant. */
const CONSONANTS = [-12, -5, 0, 4, 7, 12];
/** Secondes mineures, tritons et septièmes majeures : les intervalles que l'oreille tient pour âpres. */
const DISSONANTS = [-11, -6, 0, 1, 6, 11];

/**
 * Les voix qui sonnent ENSEMBLE sur chaque attaque, en demi-tons au-dessus de la note mélodique.
 *
 * MESURÉ, ET NON CHOISI POUR LA THEORIE. La rugosité que `gout.ts` mesure vient de partiels
 * séparés d'une fraction de bande critique : à 1 200 Hz, un demi-ton y tombe et un triton n'y tombe
 * plus du tout. Les chiffres, relevés sur le synthétiseur : une quinte donne une rugosité de 0,002,
 * un triton seul 0,005 — autant dire rien —, un demi-ton 0,084, et l'amas ci-dessous 0,105. Le
 * triton était donc le pire choix possible pour de l'âpreté, alors qu'il en a la réputation.
 */
const VOIX_CONSONANTES = [0, 7];
const VOIX_APRES = [0, 1, 2, 6, 7];

/** Les noms de notes à l'anglaise, comme partout ailleurs dans le projet. */
const NOMS_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** « F#5 » pour 78 : de quoi lire un registre sans compter les demi-tons. */
export function nomDeNote(midi: number): string {
  const n = Math.round(midi);
  return `${NOMS_NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

export interface Motif {
  notes: NoteEvenement[];
  /** Tempo pour l'écriture MIDI, en noires par minute. */
  tempo: number;
  /** Attaques par seconde visées. */
  attaquesParSeconde: number;
  /** Note MIDI autour de laquelle le motif se tient. */
  noteCentre: number;
  /** Les voix simultanées, en demi-tons au-dessus de la mélodie : c'est là que se joue la rugosité. */
  voix: number[];
  /** Part du temps où le son doit s'entendre, de 0 (piqué) à 1 (lié). */
  partSonnante: number;
  /** Programme General MIDI suggéré. */
  programme: number;
  duree: number;
}

export interface OptionsMotif {
  duree: number;
  hasard: () => number;
  programme?: number;
  facteurTimbre?: number;
}

/**
 * Un motif à plusieurs voix qui se tient au point demandé.
 *
 * POURQUOI PLUSIEURS VOIX. La rugosité — d'où `gout.ts` tire la consonance — naît de partiels voisins
 * qui battent ENSEMBLE. Une mélodie qui enchaîne des intervalles âpres l'un après l'autre ne bat
 * contre rien et se mesure aussi lisse qu'une mélodie douce. Les voix sonnent donc simultanément, et
 * c'est ce qui les sépare qui porte la consonance visée : deux voix à la quinte pour le consonant,
 * un amas de cinq pour l'âpre.
 *
 * La grille est régulière : une attaque par pas. Un tirage au sort sur les instants ferait un motif
 * plus vivant mais une vitesse mesurée flottante, et c'est la vitesse qu'on vise ici. Le hasard
 * choisit les degrés, non les instants.
 */
export function motifDepuisPoint(cible: DimensionsGout, o: OptionsMotif): Motif {
  const attaques = borner(attaquesDepuisVitesse(cible.vitesse), 0.25, 12);
  const pas = 1 / attaques;
  const hz = hertzDepuisHauteur(cible.hauteur) / (o.facteurTimbre ?? FACTEUR_TIMBRE);
  const noteCentre = Math.round(borner(69 + 12 * Math.log2(hz / 440), 24, 100));
  const consonant = cible.consonance >= 0.5;
  const degres = consonant ? CONSONANTS : DISSONANTS;
  // Deux voix à la quinte, ou l'amas âpre : c'est le seul endroit où la consonance visée se joue.
  //
  // POURQUOI PAS L'OCTAVE, qui serait l'autre doublage consonant évident : sa fondamentale tombe
  // exactement sur le deuxième harmonique de la voix du dessous, qu'elle renforce, et le registre
  // mesuré montait alors d'un demi-ton d'octave — mesuré, cinq demi-tons — au-dessus de celui qu'on
  // visait. La quinte ne coïncide avec aucun harmonique proche et ne déplace donc rien.
  const voix = consonant ? VOIX_CONSONANTES : VOIX_APRES;
  const partSonnante = borner(cible.articulation, 0.08, 1);
  // Un léger dépassement au legato : deux notes qui se touchent exactement laissent malgré tout un
  // creux à la jointure, et l'enveloppe y retomberait sous le seuil.
  const longueur = pas * (0.15 + 0.9 * partSonnante);
  const velocite = Math.round(borner(40 + 70 * cible.intensite, 1, 127));

  const notes: NoteEvenement[] = [];
  const nombre = Math.max(1, Math.floor(o.duree * attaques));
  for (let i = 0; i < nombre; i++) {
    const debut = i * pas;
    const fin = Math.min(o.duree, debut + longueur);
    if (fin <= debut) continue;
    const degre = degres[Math.floor(borner(o.hasard(), 0, 0.999) * degres.length)];
    const basse = Math.round(borner(noteCentre + degre, 21, 108));
    // LES VOIX DU DESSUS SONT PLUS FAIBLES, et pas seulement parce qu'un doublage se joue ainsi. Le
    // registre que `gout.ts` mesure est la fréquence MÉDIANE de l'énergie : deux voix de force égale
    // la placent exactement à leur frontière, d'où elle basculait de l'une à l'autre selon
    // l'intervalle — le registre mesuré sautait alors d'un demi-ton d'octave sans que rien de ce
    // qu'on avait demandé ait changé. Les voix du dessus à 60 % laissent la majorité de l'énergie en
    // bas, et la médiane s'y tient.
    let precedente = -1;
    for (const v of voix) {
      const note = Math.round(borner(basse + v, 21, 108));
      if (note === precedente) continue; // écrasées contre le bord du clavier
      precedente = note;
      notes.push({ note, velocite: v === 0 ? velocite : Math.max(1, Math.round(velocite * 0.6)), debut, fin });
    }
  }

  return {
    notes,
    tempo: Math.round(borner(60 * attaques, 40, 240)),
    attaquesParSeconde: attaques,
    noteCentre,
    voix,
    partSonnante,
    programme: o.programme ?? 0,
    duree: o.duree,
  };
}

/**
 * Le motif en octets MIDI, prêts pour le rendu.
 *
 * Le programme est écrit DANS le fichier : le rendu suit les instruments du fichier canal par canal,
 * si bien que le timbre voyage avec le MIDI plutôt que de rester un réglage du nœud.
 */
export function octetsMidi(notes: NoteEvenement[], tempo: number, programme: number, canal = 0): Uint8Array {
  const tpm = 480;
  const secEnTicks = (s: number) => Math.max(0, Math.round((s / 60) * tempo * tpm));
  const pisteTempo = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat: Math.round((60 / tempo) * 1_000_000) },
    { deltaTime: 0, type: "timeSignature", numerator: 4, denominator: 4, channel: 0 },
  ];
  const absolus: { tick: number; ev: Record<string, unknown> }[] = [
    { tick: 0, ev: { type: "programChange", channel: canal, programNumber: Math.max(0, Math.min(127, Math.round(programme))) } },
  ];
  for (const n of notes) {
    const td = secEnTicks(n.debut);
    const tf = Math.max(td + 1, secEnTicks(n.fin));
    absolus.push({ tick: td, ev: { type: "noteOn", channel: canal, noteNumber: n.note, velocity: n.velocite } });
    absolus.push({ tick: tf, ev: { type: "noteOff", channel: canal, noteNumber: n.note, velocity: 0 } });
  }
  absolus.sort((a, b) => a.tick - b.tick);
  let precedent = 0;
  const piste: Record<string, unknown>[] = absolus.map(({ tick, ev }) => {
    const delta = tick - precedent;
    precedent = tick;
    return { ...ev, deltaTime: delta };
  });
  piste.push({ type: "endOfTrack", deltaTime: 0 });
  return new Uint8Array(writeMidi({
    header: { format: 1, numTracks: 2, ticksPerBeat: tpm },
    tracks: [pisteTempo, piste],
  } as never));
}

/** Le même motif, transposé. Les notes qui sortiraient du clavier s'arrêtent à son bord. */
export function transposerMotif(m: Motif, demiTons: number): Motif {
  const d = Math.round(demiTons);
  if (d === 0) return m;
  return {
    ...m,
    noteCentre: Math.round(borner(m.noteCentre + d, 21, 108)),
    notes: m.notes.map((n) => ({ ...n, note: Math.round(borner(n.note + d, 21, 108)) })),
  };
}

/**
 * Rend le motif, mesure le registre obtenu, et le corrige s'il a manqué sa cible.
 *
 * POURQUOI CETTE PASSE DE CORRECTION EXISTE. `FACTEUR_TIMBRE` corrige le biais d'un timbre moyen,
 * mais le biais dépend du timbre : une flûte place presque toute son énergie sur sa fondamentale, un
 * trombone très haut au-dessus. Un facteur unique ne peut donc pas servir les deux — et la faute
 * n'est pas petite : visé au grave de l'amer, un trombone de synthèse se mesurait DEUX OCTAVES
 * au-dessus, si bien qu'une musique demandée pour l'amertume s'analysait comme sucrée à 91 %.
 * Trouvé dans l'application, que les tests unitaires ne pouvaient pas voir : ils rendaient le motif
 * avec un timbre simple, et non avec le synthétiseur du nœud.
 *
 * On mesure donc ce qu'on a produit, et l'on retransposse du manque. Une seule passe : la correction
 * est exacte en octaves, et une deuxième ne gagnerait que le bruit de mesure. La correction appliquée
 * est rendue, pour que le nœud puisse la dire.
 */
export async function rendreAuRegistre(
  motif: Motif,
  hauteurVisee: number,
  rendre: (m: Motif) => Promise<AudioBuffer>,
  passes = 2,
): Promise<{ son: AudioBuffer; motif: Motif; correction: number }> {
  const vise = hertzDepuisHauteur(hauteurVisee);
  let courant = motif;
  let son = await rendre(courant);
  let total = 0;
  for (let i = 0; i < passes; i++) {
    const { registre } = mesurer(son);
    if (!(registre > 0)) break;
    // Trois octaves de rattrapage : le biais d'un timbre très brillant en vaut deux à lui seul.
    const pas = Math.round(borner(12 * Math.log2(vise / registre), -36, 36));
    if (Math.abs(pas) < 1) break;
    const suivant = transposerMotif(courant, pas);
    // Un motif déjà posé sur le bord du clavier ne descendra pas plus bas : insister ferait un
    // rendu de plus pour rien, et le registre visé est alors hors d'atteinte — ce que le nœud dit.
    if (suivant.noteCentre === courant.noteCentre) break;
    courant = suivant;
    son = await rendre(courant);
    total += pas;
  }
  return { son, motif: courant, correction: total };
}

/**
 * Amène le niveau efficace du son au niveau visé, sans jamais écrêter.
 *
 * L'intensité est la seule des cinq dimensions qu'on peut atteindre exactement, et il serait donc
 * dommage de la laisser au hasard du synthétiseur. Quand le gain demandé ferait dépasser la pleine
 * échelle, il est réduit à ce que la crête permet : le rendu reste propre, et l'écart au niveau visé
 * se lit dans le rapport du nœud plutôt que de s'entendre en distorsion.
 */
export function viserNiveau(b: AudioBuffer, dbVise: number): AudioBuffer {
  let somme = 0, echantillons = 0, crete = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) {
      somme += x[i] * x[i];
      echantillons++;
      const a = Math.abs(x[i]);
      if (a > crete) crete = a;
    }
  }
  const rms = Math.sqrt(somme / Math.max(1, echantillons));
  if (rms <= 0 || crete <= 0) return b;
  const voulu = Math.pow(10, dbVise / 20) / rms;
  const gain = Math.min(voulu, 0.99 / crete);
  const sortie = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: b.length, sampleRate: b.sampleRate });
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c), y = sortie.getChannelData(c);
    for (let i = 0; i < x.length; i++) y[i] = x[i] * gain;
  }
  return sortie;
}
