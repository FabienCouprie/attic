// audio/csound-partition.ts — Écrire une partition Csound depuis ce qu'Attic sait déjà noter.
//
// POURQUOI UN SEUL TRADUCTEUR SUFFIT. Attic note la musique de six façons — ABC, tablature,
// séquenceur de batterie, de mélodie, d'accords, texte vers MIDI —, et toutes convergent déjà sur le
// MIDI. Traduire le MIDI vers la partition les traduit donc toutes ; écrire six traducteurs aurait
// été écrire six fois la même chose, avec six occasions de se tromper.
//
// CE QU'UNE PARTITION CSOUND A DE PLUS QU'UN MIDI, et c'est tout l'enjeu de ce module : une note y
// est une ligne `i1 0 1 440 0.5 60`, où chaque nombre après la durée est un P-FIELD que
// l'orchestre lit comme il veut. Un MIDI n'a que hauteur, vélocité et durée ; une partition en a
// autant qu'on veut. On choisit donc ce qui va dans chaque champ.
//
// LE PIÈGE QUI REND LES RENDUS MUETS : LA CONVENTION DE HAUTEUR. Csound en a quatre, et un orchestre
// écrit pour l'une ne fonctionne pas avec une autre.
//
//   · CPS (ou Hz) : 440 pour le la3. La plus directe, celle qu'attendent `oscili` et les modèles
//     physiques de Perry Cook.
//   · PCH : octave point classe de hauteur — 8.00 est le do central, 8.09 le la au-dessus, 9.00
//     l'octave suivante. C'est la notation de MUSIC V, et `cpspch()` la convertit.
//   · OCT : octave en décimal — 8.0 le do central, 8.75 le la au-dessus (neuf demi-tons sur douze).
//     `cpsoct()` la convertit, et elle est commode pour transposer par simple addition.
//   · MIDI : le numéro de note, 60 pour le do central. `cpsmidinn()` la convertit.
//
// Un orchestre qui attend du `pch` nourri en Hz reçoit 440 là où il attend 8.09 : `cpspch(440)`
// donne une fréquence absurde, et l'on n'entend rien ou un craquement. Aucune erreur, aucun
// message — d'où ce réglage, explicite, plutôt qu'une valeur en dur.
import type { NoteCsound } from "./csound";
import type { Courbe } from "./courbe";

/** Les quatre conventions de hauteur de Csound. */
export type Convention = "cps" | "pch" | "oct" | "midi";

/** Fréquence en hertz, la convention `cps`. */
export const hzDepuisNote = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/**
 * Octave en décimal, la convention `oct` : 8,0 pour le do central.
 *
 * Douze demi-tons par octave, donc un demi-ton vaut un douzième — 8,75 est le la du do central.
 */
export const octDepuisNote = (note: number): number => 8 + (note - 60) / 12;

/**
 * Octave point classe de hauteur, la convention `pch` : 8.00 pour le do central, 8.09 pour le la.
 *
 * Les centièmes portent la classe de hauteur, de 00 à 11 — ce n'est donc PAS un nombre décimal
 * ordinaire : 8.11 est suivi de 9.00, et 8.12 n'existe pas. C'est la notation de MUSIC V, héritée
 * telle quelle.
 */
export function pchDepuisNote(note: number): number {
  const octave = 8 + Math.floor((note - 60) / 12);
  const classe = ((note - 60) % 12 + 12) % 12;
  return octave + classe / 100;
}

/** La hauteur d'une note dans la convention demandée. */
export function valeurHauteur(note: number, convention: Convention): number {
  switch (convention) {
    case "pch": return pchDepuisNote(note);
    case "oct": return octDepuisNote(note);
    case "midi": return note;
    default: return hzDepuisNote(note);
  }
}

/** Ce qu'on peut mettre dans un p-field. */
export type ChampP =
  | "hauteur" | "amplitude" | "velocite" | "note" | "duree" | "canal"
  | "constante" | "courbe" | "libre" | "rien";

/** Une note du MIDI, avec son canal — que `NoteCsound` ne porte pas. */
export interface NoteAvecCanal extends NoteCsound {
  canal?: number;
  /**
   * Valeur d'un p-field LIBRE, portée par la note elle-même.
   *
   * Un MIDI n'en a pas : ce champ sert aux notes engendrées, où chaque événement peut porter une
   * valeur tirée dans une loi — la matière même d'une partition stochastique, qu'aucune note MIDI ne
   * saurait transporter.
   */
  libre?: number;
}

export interface OptionsPartition {
  convention?: Convention;
  /** Numéro du premier instrument. */
  instrument?: number;
  /** Vrai : un instrument par canal MIDI présent, numéroté à partir de `instrument`. */
  parCanal?: boolean;
  /** Ce que portent p4, p5, p6… dans l'ordre. */
  champs?: ChampP[];
  /** Valeur du champ « constante ». */
  constante?: number;
  /** Courbe lue au début de chaque note, pour le champ « courbe ». */
  courbe?: Courbe | null;
  /** Secondes ajoutées après la dernière note, écrites en `f0` — le temps que les queues sonnent. */
  margeFinale?: number;
}

export interface LigneInstrument {
  numero: number;
  /** Canal MIDI, en numérotation humaine (1 à 16). */
  canal: number;
  notes: number;
}

export interface RapportPartition {
  evenements: number;
  /** Quel numéro d'instrument joue quel canal : sans cela, on ne peut pas écrire l'orchestre. */
  instruments: LigneInstrument[];
  /** Fin de la dernière note, en secondes. */
  duree: number;
  convention: Convention;
}

/** La valeur d'une courbe au temps donné, en secondes. */
export function valeurCourbeAuTemps(courbe: Courbe, t: number): number {
  const n = courbe.valeurs.length;
  if (n === 0) return 0;
  const i = Math.max(0, Math.min(n - 1, Math.round(t * courbe.cadence)));
  return courbe.valeurs[i];
}

/**
 * Quel instrument joue quel canal.
 *
 * Les canaux PRÉSENTS seulement, et dans l'ordre : un MIDI qui n'emploie que les canaux 1, 2 et 10
 * donne les instruments 1, 2 et 3, et non 1, 2 et 10. C'est ce qu'on veut face à un orchestre dont
 * les instruments sont numérotés à la suite — et le rapport dit la correspondance, faute de quoi elle
 * serait à deviner par essais.
 */
export function instrumentsParCanal(notes: readonly NoteAvecCanal[], base = 1): Map<number, number> {
  const canaux = [...new Set(notes.map((n) => n.canal ?? 0))].sort((a, b) => a - b);
  return new Map(canaux.map((c, i) => [c, base + i]));
}

/** Écrit un nombre avec le nombre de décimales qui convient à ce qu'il représente. */
function formater(valeur: number, champ: ChampP, convention: Convention): string {
  if (champ === "note" || champ === "velocite" || champ === "canal") return String(Math.round(valeur));
  if (champ === "hauteur") {
    // `pch` se lit à deux décimales — 8.09, et non 8.0900 : les centièmes y sont une classe de
    // hauteur, pas une fraction, et des zéros de plus rendraient le nombre trompeur.
    if (convention === "pch") return valeur.toFixed(2);
    if (convention === "midi") return String(Math.round(valeur));
    if (convention === "oct") return valeur.toFixed(4);
    return valeur.toFixed(3);
  }
  return valeur.toFixed(4);
}

/**
 * La partition, et le rapport de ce qu'elle contient.
 *
 * LES TEMPS SONT EN SECONDES, et il n'y a pas de réglage de tempo : la partition Csound bat à
 * soixante par défaut, où un temps vaut une seconde, si bien que des secondes s'écrivent
 * directement. Ajouter un `t` de tempo REINTERPRÉTERAIT ces nombres — un morceau à 96 s'écoulerait
 * alors 1,6 fois trop vite — et il vaut mieux ne pas offrir un réglage qui casse ce qu'il promet.
 */
export function construirePartition(
  notes: readonly NoteAvecCanal[], o: OptionsPartition = {},
): { texte: string; rapport: RapportPartition } {
  const convention = o.convention ?? "cps";
  const base = Math.max(1, Math.round(o.instrument ?? 1));
  const champs = o.champs ?? ["hauteur", "amplitude", "note"];
  const constante = o.constante ?? 0;
  const marge = Math.max(0, o.margeFinale ?? 0.5);
  const parCanal = o.parCanal ?? false;
  const attribution = instrumentsParCanal(notes, base);

  const triees = [...notes].sort((a, b) => a.debut - b.debut || a.note - b.note);
  const comptes = new Map<number, number>();
  const lignes: string[] = [];
  let fin = 0;
  for (const n of triees) {
    const canal = n.canal ?? 0;
    const numero = parCanal ? (attribution.get(canal) ?? base) : base;
    comptes.set(numero, (comptes.get(numero) ?? 0) + 1);
    const duree = Math.max(0.001, n.fin - n.debut);
    fin = Math.max(fin, n.fin);
    const valeurs = champs
      .filter((c) => c !== "rien")
      .map((c) => {
        const brut = c === "hauteur" ? valeurHauteur(n.note, convention)
          : c === "amplitude" ? Math.min(1, Math.max(0, n.velocite / 127))
          : c === "velocite" ? n.velocite
          : c === "note" ? n.note
          : c === "duree" ? duree
          : c === "canal" ? canal + 1
          : c === "courbe" ? (o.courbe ? valeurCourbeAuTemps(o.courbe, n.debut) : 0)
          : c === "libre" ? (n.libre ?? 0)
          : constante;
        return formater(brut, c, convention);
      });
    lignes.push(`i${numero} ${n.debut.toFixed(4)} ${duree.toFixed(4)}${valeurs.length ? " " + valeurs.join(" ") : ""}`);
  }

  // `f0` fixe la durée de la partition : sans lui, Csound s'arrête à la dernière note et coupe les
  // queues de réverbération ou de résonance, ce qui s'entend comme un clic.
  if (lignes.length > 0) lignes.push(`f0 ${(fin + marge).toFixed(4)}`);
  lignes.push("e");

  const instruments: LigneInstrument[] = [...attribution.entries()]
    .map(([canal, numero]) => ({ numero, canal: canal + 1, notes: comptes.get(numero) ?? 0 }))
    .filter((l) => l.notes > 0)
    .sort((a, b) => a.numero - b.numero);
  // Sans « un instrument par canal », tout part sur le même numéro : le rapport ne doit pas faire
  // croire le contraire.
  const resume = parCanal ? instruments
    : [{ numero: base, canal: instruments[0]?.canal ?? 1, notes: triees.length }].filter((l) => l.notes > 0);

  return {
    texte: lignes.join("\n"),
    rapport: { evenements: triees.length, instruments: resume, duree: fin, convention },
  };
}

/** Le rapport, en texte lisible — c'est la sortie qui dit quel instrument écrire. */
export function rapportLisible(r: RapportPartition, en = false): string {
  const nomConvention = { cps: "cps (Hz)", pch: "pch (8.09)", oct: "oct (8.75)", midi: "midi (69)" }[r.convention];
  const lignes = en
    ? [`${r.evenements} events · ${r.duree.toFixed(2)} s · pitch as ${nomConvention}`, "", "instrument | MIDI channel | notes"]
    : [`${r.evenements} événements · ${r.duree.toFixed(2)} s · hauteur en ${nomConvention}`, "", "instrument | canal MIDI | notes"];
  for (const i of r.instruments) lignes.push(`i${i.numero} | ${i.canal} | ${i.notes}`);
  return lignes.join("\n");
}
