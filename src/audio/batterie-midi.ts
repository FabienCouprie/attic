// audio/batterie-midi.ts — Sortir le RYTHME d'un séquenceur, pour pouvoir changer les sons dessous.
//
// LE PROBLÈME, TEL QU'IL ÉTAIT. Les trois nœuds rythmiques d'Attic — séquenceur de batterie avancé,
// boîte à rythmes, rythme de Cantor — synthétisaient leurs sons en interne et ne rendaient QUE de
// l'audio. La grille restait enfermée dans le nœud, si bien que pour jouer le même rythme avec le kit
// SFZ, un SoundFont, un orchestre Csound ou un modèle physique, il fallait le reprogrammer à la main.
// Le nœud savait dire ce que ça donne, pas QUAND il frappe.
//
// CE MODULE FAIT LE PONT, et il tient en trois décisions.
//
//  1. LES NOTES SONT CELLES DU GENERAL MIDI. Les huit pistes du séquenceur avancé sont exactement les
//     huit voix du kit embarqué, dans le même ordre — le kit a été rendu à partir d'elles —, et la
//     correspondance vit ici, à un seul endroit, que `kit-batterie.ts` importe. Les deux ne peuvent
//     donc plus dériver, et un test le verrouille.
//  2. LE SWING PART DANS LE MIDI. Le rendu audio décale les contretemps ; si le MIDI portait la
//     grille brute, le groove disparaîtrait au changement de sons — même rythme sur le papier, autre
//     musique à l'oreille. L'instant de chaque pas se calcule donc ICI, par la même formule que le
//     rendu, et les deux s'en servent.
//  3. UNE NOTE DURE JUSQU'À LA FRAPPE SUIVANTE de sa piste, plafonnée. C'est un choix, et il se
//     raisonne : un échantillon de kit est un one-shot, qu'un sampler laisse sonner jusqu'à sa fin si
//     la note est plus longue que lui. Une note trop COURTE couperait la cymbale ; une note trop
//     LONGUE ferait s'empiler dix charleys d'une croche à l'autre, dix voix au lieu d'une. Durer
//     jusqu'à la frappe suivante donne les deux comportements justes — le charley se coupe, ce qui
//     est ce qu'on veut d'un charley fermé, et la cymbale isolée sonne entièrement.
import type { NoteEvenement } from "./midi";

/**
 * Les notes de percussion du General MIDI, dans l'ordre des pistes du séquenceur avancé.
 *
 * 36 grosse caisse, 38 caisse claire, 42 charley fermé, 46 charley ouvert, 39 clap, 49 crash,
 * 45 tom grave, 50 tom aigu. Ce sont les numéros de la norme, et c'est ce qui fait qu'un fichier
 * écrit ici joue juste sur n'importe quel kit — le nôtre, un SoundFont, une bibliothèque SFZ.
 */
export const NOTES_PERCUSSION_GM = [36, 38, 42, 46, 39, 49, 45, 50] as const;

/** Le canal de percussion du General MIDI, tel qu'il est écrit dans les octets (10 pour qui le lit). */
export const CANAL_PERCUSSION = 9;

/** La nuance la plus forte d'une grille de vélocité. */
export const NUANCE_MAX = 9;

/** Combien de temps une note tient au plus, quand aucune frappe ne la suit. */
export const DUREE_NOTE_MAX = 1.5;

/**
 * Une nuance de grille, de 1 à 9, en vélocité MIDI.
 *
 * La même conversion que le rendu audio, qui multiplie le niveau par `nuance/9` : sans cela, l'audio
 * et le MIDI ne raconteraient pas la même dynamique.
 */
export const velociteMidiDepuisNuance = (nuance: number): number =>
  Math.max(1, Math.min(127, Math.round((Math.max(0, Math.min(NUANCE_MAX, nuance)) / NUANCE_MAX) * 127)));

/**
 * L'instant d'un pas, swing compris.
 *
 * LA FORMULE EST CELLE DU RENDU, recopiée nulle part ailleurs : les contretemps — les pas de rang
 * impair dans la mesure — sont repoussés de `swing/100 × durée du pas × 0,6`. Ce 0,6 vient du rendu
 * audio, où il a été choisi pour que 60 % de swing donne un triolet reconnaissable sans que le
 * contretemps colle au temps suivant.
 */
export function instantDuPas(
  pasGlobal: number, pasParMesure: number, dureePas: number, swing: number,
): number {
  const p = ((pasGlobal % pasParMesure) + pasParMesure) % pasParMesure;
  const t = pasGlobal * dureePas;
  return p % 2 === 1 ? t + (Math.max(0, swing) / 100) * dureePas * 0.6 : t;
}

/** La durée d'un pas, en secondes, pour un nombre de pas donné par mesure à quatre temps. */
export const dureeDuPas = (tempo: number, pasParMesure: number): number =>
  ((60 / Math.max(1, tempo)) * 4) / Math.max(1, pasParMesure);

export interface OptionsNotes {
  tempo: number;
  /** Pas par mesure — 16 ou 32 pour le séquenceur, 64 pour Cantor. */
  pasParMesure: number;
  mesures: number;
  swing?: number;
  /** Plafond de la durée d'une note, quand aucune frappe ne la suit. */
  dureeMax?: number;
}

/** Une frappe : la piste touchée, le pas, et la nuance de 1 à 9. */
export interface Frappe {
  piste: number;
  pas: number;
  nuance: number;
}

/**
 * Les notes MIDI d'une suite de frappes.
 *
 * Chaque note tient jusqu'à la frappe suivante DE SA PISTE, plafonnée — voir l'en-tête du module pour
 * la raison. Les frappes sont triées par instant, ce qu'un fichier MIDI n'exige pas mais qui rend le
 * résultat lisible et les tests comparables.
 */
export function notesDepuisFrappes(frappes: readonly Frappe[], o: OptionsNotes): NoteEvenement[] {
  const dureePas = dureeDuPas(o.tempo, o.pasParMesure);
  const swing = o.swing ?? 0;
  const plafond = o.dureeMax ?? DUREE_NOTE_MAX;
  const totalPas = Math.max(1, Math.round(o.mesures)) * o.pasParMesure;

  // Les frappes suivantes, piste par piste : c'est ce qui donne la durée de chaque note.
  const parPiste = new Map<number, number[]>();
  for (const f of frappes) {
    if (!parPiste.has(f.piste)) parPiste.set(f.piste, []);
    parPiste.get(f.piste)!.push(f.pas);
  }
  for (const pas of parPiste.values()) pas.sort((a, b) => a - b);

  const notes: NoteEvenement[] = frappes.map((f) => {
    const debut = instantDuPas(f.pas, o.pasParMesure, dureePas, swing);
    const suivants = parPiste.get(f.piste)!;
    const suivant = suivants.find((p) => p > f.pas);
    const fin = suivant !== undefined
      ? instantDuPas(suivant, o.pasParMesure, dureePas, swing)
      : Math.min(debut + plafond, totalPas * dureePas + plafond);
    return {
      note: NOTES_PERCUSSION_GM[f.piste] ?? NOTES_PERCUSSION_GM[0],
      velocite: velociteMidiDepuisNuance(f.nuance),
      debut,
      // Une frappe suivie immédiatement garde au moins de quoi exister.
      fin: Math.max(debut + 0.01, Math.min(fin, debut + plafond)),
    };
  });
  return notes.sort((a, b) => a.debut - b.debut || a.note - b.note);
}

/**
 * Les frappes d'une grille de vélocité — celle du séquenceur de batterie avancé.
 *
 * La grille couvre UNE mesure ; le motif se répète sur `mesures`. C'est ainsi que le rendu audio la
 * lit, et les deux doivent voir la même chose.
 */
export function frappesDeGrilleVelocite(
  grille: readonly number[][], pasParMesure: number, mesures: number,
): Frappe[] {
  const frappes: Frappe[] = [];
  const nb = Math.max(1, Math.round(mesures));
  for (let m = 0; m < nb; m++) {
    for (let piste = 0; piste < grille.length; piste++) {
      const ligne = grille[piste];
      for (let p = 0; p < pasParMesure; p++) {
        const nuance = ligne[p] ?? 0;
        if (nuance > 0) frappes.push({ piste, pas: m * pasParMesure + p, nuance });
      }
    }
  }
  return frappes;
}

/**
 * Les frappes de pistes booléennes déjà dépliées sur toute la durée.
 *
 * La boîte à rythmes construit ses pistes mesure par mesure : elles arrivent donc entières, et non
 * répétées. `nuance` donne leur dynamique — le niveau réglé pour cette piste, ramené de 0–100 à 1–9.
 */
export function frappesDePistesBooleennes(
  pistes: readonly { piste: number; pas: readonly boolean[]; niveau: number }[],
): Frappe[] {
  const frappes: Frappe[] = [];
  for (const { piste, pas, niveau } of pistes) {
    const nuance = Math.max(1, Math.min(NUANCE_MAX, Math.round((niveau / 100) * NUANCE_MAX)));
    pas.forEach((actif, p) => { if (actif) frappes.push({ piste, pas: p, nuance }); });
  }
  return frappes;
}
