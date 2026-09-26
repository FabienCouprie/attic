import type { Note } from "./note";
// audio/motifs-midi.ts — Quatre transformations de motifs, prises au live-coding.
//
// Attic traite le MIDI par jointure, boucle, arpège et transposition ; il lui manquait
// l'algèbre de motifs que TidalCycles et Strudel ont rendue courante. Ces quatre
// opérations se composent entre elles et avec ce qui existe déjà — un rythme euclidien
// devient la grille d'une suite d'accords, une ligne devient sa propre contrepartie
// décalée, une trame trop dense s'éclaircit sans qu'on choisisse les notes à la main.
//
// Toutes sont DÉTERMINISTES, y compris l'éclaircissement, qui tire au sort à partir d'une
// graine : un motif retrouvé plaisant doit pouvoir se rejouer à l'identique.

export type NoteMotif = Note;

const trier = (notes: NoteMotif[]): NoteMotif[] =>
  [...notes].sort((a, b) => a.debut - b.debut || a.note - b.note);

/**
 * Regroupe les notes qui commencent ensemble : un accord est un événement, pas trois.
 * Le seuil est large — vingt millisecondes — pour qu'un plaqué joué à la main reste un
 * accord et non trois événements d'affilée.
 */
export function evenements(notes: NoteMotif[], seuil = 0.02): NoteMotif[][] {
  const groupes: NoteMotif[][] = [];
  for (const n of trier(notes)) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && Math.abs(n.debut - dernier[0].debut) <= seuil) dernier.push(n);
    else groupes.push([n]);
  }
  return groupes;
}

/**
 * IMPOSER UN RYTHME — les hauteurs d'un côté, la grille de l'autre.
 *
 * Chaque frappe de la grille reçoit l'événement suivant de la suite de hauteurs, qui
 * tourne en boucle quand la grille est plus longue. C'est le `struct` de Strudel, et c'est
 * ce qui rend le Rythme euclidien composable : un tresillo devient la grille d'une
 * progression d'accords.
 *
 * La VÉLOCITÉ vient de la grille — c'est elle qui porte l'accentuation — et la DURÉE
 * aussi. Les hauteurs n'apportent que les hauteurs.
 */
export function imposerRythme(hauteurs: NoteMotif[], grille: NoteMotif[]): NoteMotif[] {
  const source = evenements(hauteurs);
  const frappes = evenements(grille);
  if (source.length === 0 || frappes.length === 0) return [];
  const sortie: NoteMotif[] = [];
  frappes.forEach((frappe, i) => {
    const accord = source[i % source.length];
    const debut = frappe[0].debut;
    const fin = frappe[0].fin;
    for (const h of accord) {
      sortie.push({ note: h.note, velocite: frappe[0].velocite, debut, fin, canal: h.canal });
    }
  });
  return sortie;
}

export interface OptionsEcho {
  repetitions: number;
  /** Décalage entre deux échos, en secondes. */
  decalage: number;
  /** Ce que chaque écho garde de la vélocité du précédent, de 0 à 1. */
  attenuation: number;
  /** Transposition cumulée de chaque écho, en demi-tons. */
  transposition: number;
}

/**
 * ÉCHO DE NOTES — un délai qui se compose au lieu de se mixer.
 *
 * Les copies sont des NOTES, non un signal retardé : elles s'écrivent dans le MIDI, se
 * transposent, se quantifient et se rejouent avec un autre instrument. C'est la
 * différence avec un délai audio, et c'est tout l'intérêt.
 */
export function echoNotes(notes: NoteMotif[], o: OptionsEcho): NoteMotif[] {
  const repetitions = Math.max(0, Math.min(16, Math.floor(o.repetitions)));
  const sortie = [...notes];
  for (const n of notes) {
    let velocite = n.velocite;
    for (let k = 1; k <= repetitions; k++) {
      velocite = velocite * Math.max(0, Math.min(1, o.attenuation));
      const v = Math.round(velocite);
      // Un écho descendu sous la vélocité 1 ne s'entendrait pas : on l'omet plutôt que
      // d'écrire une note muette dans le fichier.
      if (v < 1) break;
      const note = n.note + Math.round(o.transposition) * k;
      if (note < 0 || note > 127) break;
      sortie.push({
        note,
        velocite: v,
        debut: n.debut + o.decalage * k,
        fin: n.fin + o.decalage * k,
        canal: n.canal,
      });
    }
  }
  return trier(sortie);
}

/**
 * ÉCLAIRCIR — retirer une part des notes, au hasard mais de façon reproductible.
 *
 * `preserverPremierTemps` garde les événements qui tombent sur un temps fort : une trame
 * éclaircie au hasard perd sa pulsation, et l'on veut souvent l'alléger sans la dissoudre.
 */
export function eclaircir(
  notes: NoteMotif[],
  proportion: number,
  hasard: () => number,
  options: { preserverPremierTemps?: boolean; dureeTemps?: number } = {},
): NoteMotif[] {
  const part = Math.max(0, Math.min(1, proportion));
  const duree = options.dureeTemps ?? 0.5;
  const garde: NoteMotif[] = [];
  for (const groupe of evenements(notes)) {
    const surLeTemps = options.preserverPremierTemps
      && Math.abs(groupe[0].debut / duree - Math.round(groupe[0].debut / duree)) < 1e-6;
    // Un tirage par ÉVÉNEMENT et non par note : éclaircir ne doit pas défaire les accords.
    if (surLeTemps || hasard() >= part) garde.push(...groupe);
  }
  return trier(garde);
}

/** L'étendue d'un motif : du premier départ à la dernière fin. */
function etendue(notes: NoteMotif[]): [number, number] {
  let t0 = Infinity, t1 = -Infinity;
  for (const n of notes) {
    if (n.debut < t0) t0 = n.debut;
    if (n.fin > t1) t1 = n.fin;
  }
  return [t0, t1];
}

/**
 * RÉTROGRADE — le motif joué à l'envers.
 *
 * Le temps est retourné autour de l'étendue du motif : une note qui finissait juste avant
 * la fin commence juste après le début. Les DURÉES sont conservées exactement, ce qui est
 * la définition du rétrograde en contrepoint — on ne renverse pas les notes, on renverse
 * leur ordre. La conséquence s'entend : une figure qui finissait sur une longue tenue
 * commence maintenant par elle.
 */
export function retrograderMotif(notes: NoteMotif[]): NoteMotif[] {
  if (notes.length === 0) return [];
  const [t0, t1] = etendue(notes);
  return trier(notes.map((n) => ({ ...n, debut: t0 + (t1 - n.fin), fin: t0 + (t1 - n.debut) })));
}

export type SensMotif = "retrograde" | "aller-retour" | "retour-aller";

/** Décale un motif pour qu'il commence à l'instant demandé. */
function poserA(notes: NoteMotif[], instant: number): NoteMotif[] {
  if (notes.length === 0) return [];
  const [t0] = etendue(notes);
  const d = instant - t0;
  return notes.map((n) => ({ ...n, debut: n.debut + d, fin: n.fin + d }));
}

/**
 * ALLER-RETOUR — le motif, puis son rétrograde à la suite.
 *
 * `repeterPivot` décide du sort de l'événement charnière. Do-ré-mi suivi de son rétrograde
 * donne do-ré-mi-mi-ré-do, où le mi est joué deux fois ; le palindrome qu'on écrit en
 * musique est do-ré-mi-ré-do, avec un seul mi au sommet. Les deux se défendent — la
 * répétition marque le retournement, son absence le rend fluide —, et c'est pourquoi le
 * choix est offert au lieu d'être tranché ici.
 */
export function palindrome(
  notes: NoteMotif[], sens: SensMotif, repeterPivot: boolean,
): NoteMotif[] {
  if (notes.length === 0) return [];
  const aller = trier(notes);
  const retour = retrograderMotif(aller);
  if (sens === "retrograde") return retour;

  const premier = sens === "aller-retour" ? aller : retour;
  const second = sens === "aller-retour" ? retour : aller;
  const [, finPremier] = etendue(premier);

  let suite = second;
  if (!repeterPivot) {
    // Le premier événement du second morceau est la charnière, déjà jouée : on l'enlève,
    // et c'est le suivant qui vient se poser à la fin du premier morceau.
    const groupes = evenements(second);
    if (groupes.length <= 1) return premier;
    suite = groupes.slice(1).flat();
  }
  return trier([...premier, ...poserA(suite, finPremier)]);
}

/**
 * RÉPÉTER CHAQUE NOTE et TOURNER LE MOTIF.
 *
 * Répéter subdivise la durée de chaque événement en `repetitions` parts égales — le `ply`
 * de Strudel : la grille rythmique ne bouge pas, elle se remplit. Tourner décale la suite
 * des HAUTEURS sur la même grille : le rythme reste, la mélodie glisse. Les deux
 * s'appliquent dans cet ordre, ce qui permet de tourner un motif déjà densifié.
 */
export function repeterEtTourner(
  notes: NoteMotif[],
  repetitions: number,
  rotation: number,
): NoteMotif[] {
  const groupes = evenements(notes);
  if (groupes.length === 0) return [];
  const n = Math.max(1, Math.min(16, Math.floor(repetitions)));

  const densifies: NoteMotif[][] = [];
  for (const groupe of groupes) {
    const debut = groupe[0].debut;
    const duree = Math.max(0.001, groupe[0].fin - debut);
    const pas = duree / n;
    for (let k = 0; k < n; k++) {
      densifies.push(groupe.map((x) => ({
        ...x,
        debut: debut + k * pas,
        fin: debut + (k + 1) * pas - Math.min(0.01, pas * 0.05),
      })));
    }
  }

  const r = ((Math.floor(rotation) % densifies.length) + densifies.length) % densifies.length;
  const sortie: NoteMotif[] = [];
  densifies.forEach((groupe, i) => {
    // La grille du groupe i, les hauteurs du groupe i+r : le rythme reste en place.
    const hauteurs = densifies[(i + r) % densifies.length];
    const debut = groupe[0].debut, fin = groupe[0].fin;
    for (const h of hauteurs) sortie.push({ ...h, debut, fin });
  });
  return trier(sortie);
}
