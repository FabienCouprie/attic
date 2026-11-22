// audio/musicxml.ts — Export MusicXML, le format d'échange des partitions.
//
// Attic sait écrire de l'ABC et dessiner avec VexFlow, mais rien de ce qu'il produit
// n'entre dans MuseScore, Finale ou Sibelius. MusicXML est le format que tous lisent ;
// c'est par lui qu'une mélodie engendrée ici devient une partition qu'on édite ailleurs.
//
// Ce module écrit du MusicXML 4.0 « partwise », la forme la plus largement acceptée. Il
// ne prétend pas tout couvrir : une transcription automatique depuis du MIDI ne connaît
// ni les liaisons d'expression, ni les nuances, ni l'enharmonie voulue par le compositeur. Elle donne
// les hauteurs, les durées et les mesures — ce qu'on attend d'un point de départ.
import { valeursSelonLesTemps } from "./musicxml-temps";

/**
 * La clé d'une portée, choisie sur les hauteurs qu'elle porte.
 *
 * Une voix de basse gravée en clé de sol se lit sur quatre lignes supplémentaires sous la portée, ce
 * qu'aucune partition n'écrit. La médiane décide, et non la note la plus grave : une seule note basse
 * dans une ligne aiguë ne doit pas faire changer de clé toute la portée. Sous le do central, 60, la clé
 * de fa. Le chemin du MIDI écrivait toujours la clé de sol ; il choisit la sienne depuis la décision de
 * Fabien du 2026-11-22, « Choose by register ».
 */
export function cleDe(hauteurs: readonly number[]): string {
  if (hauteurs.length === 0) return "<sign>G</sign><line>2</line>";
  const triees = [...hauteurs].sort((a, b) => a - b);
  return triees[Math.floor(triees.length / 2)] < 60 ? "<sign>F</sign><line>4</line>" : "<sign>G</sign><line>2</line>";
}

export interface NoteXML {
  note: number;
  debut: number;
  fin: number;
  velocite?: number;
}

export interface OptionsMusicXML {
  titre?: string;
  tempo?: number;
  /** Numérateur et dénominateur de la métrique : [4, 4], [3, 4], [6, 8]. */
  metrique?: [number, number];
  /** Plus petite valeur représentée : 4 = noire, 8 = croche, 16 = double-croche. */
  quantification?: number;
  instrument?: string;
}

/** Un degré chromatique en nom de note, avec son altération. */
const DEGRES: { pas: string; alter: number }[] = [
  { pas: "C", alter: 0 }, { pas: "C", alter: 1 }, { pas: "D", alter: 0 }, { pas: "E", alter: -1 },
  { pas: "E", alter: 0 }, { pas: "F", alter: 0 }, { pas: "F", alter: 1 }, { pas: "G", alter: 0 },
  { pas: "G", alter: 1 }, { pas: "A", alter: 0 }, { pas: "B", alter: -1 }, { pas: "B", alter: 0 },
];

/**
 * Le degré, l'altération et l'octave d'une hauteur, pour une partition MusicXML.
 *
 * L'ALTÉRATION ACCEPTE LES FRACTIONS, ET LE MICROTON PASSE. Le champ `alter` compte en demi-tons,
 * et la spécification prévoit qu'il ne soit pas entier : 0,5 est un quart de ton haut. La fonction
 * arrondissait à la note la plus proche, ce qui jetait en silence ce que le format savait garder.
 *
 * L'ÉCART SE COMPTE DEPUIS LE DEGRÉ RETENU, et non depuis la note ronde. Le si bémol s'écrit
 * « B » avec une altération de moins un ; un quart de ton au-dessus de lui vaut donc moins un
 * demi, et non plus un demi, sans quoi la partition dirait une autre note.
 */
export function nomMusicXML(noteMidi: number): { pas: string; alter: number; octave: number } {
  const borne = Math.max(0, Math.min(127, noteMidi));
  const n = Math.round(borne);
  const d = DEGRES[n % 12];
  // Arrondi au centième de demi-ton : un cent près, ce qui est la finesse de l'oreille, et ce qui
  // évite d'écrire 0,49999999999 dans une partition.
  const ecart = Math.round((borne - n) * 100) / 100;
  return { pas: d.pas, alter: d.alter + ecart, octave: Math.floor(n / 12) - 1 };
}

/** Le signe que MusicXML nomme pour une altération dessinée, de deux demi-tons sous la note à deux au-dessus. */
const SIGNES: Record<string, string> = {
  "-2": "flat-flat", "-1.5": "three-quarters-flat", "-1": "flat", "-0.5": "quarter-flat", "0": "natural",
  "0.5": "quarter-sharp", "1": "sharp", "1.5": "three-quarters-sharp", "2": "double-sharp",
};

/**
 * L'altération que l'on dessine : celle du quart de ton le plus proche. Un écart qu'aucun signe ne nomme
 * prend le signe le plus proche, et `<alter>` garde sa valeur exacte pour le son. Décision de Fabien du
 * 2026-11-22, « Nearest quarter-tone sign ».
 */
const alterationDessinee = (alter: number) => Math.max(-2, Math.min(2, Math.round(alter * 2) / 2)) || 0;

/** Une tête de note dans une mesure, telle que le signe se décide. */
export interface TeteDeMesure { pas: string; alter: number; octave: number; liee?: boolean }

/**
 * LES SIGNES D'UNE MESURE, ses têtes données dans l'ordre du temps.
 *
 * `<alter>` dit la hauteur et `<accidental>` le signe dessiné, et le référentiel MusicXML 4.0 les sépare :
 * un graveur qui suit la norme ne dessine que le second. Les écrivains n'écrivaient que le premier, et fa
 * dièse se gravait fa. La règle est celle de l'usage, la même que suit le lecteur de la gravure : un signe
 * à la première tête d'une ligne qui change d'altération dans la mesure, valable jusqu'à la barre, et rien
 * sur la suite d'une note liée, qui garde le signe de son départ sans le donner aux suivantes. L'armure est
 * celle de do. Revue des notations en texte, 2026-11-22.
 */
export function signesDeLaMesure(tetes: readonly TeteDeMesure[]): (string | null)[] {
  const etat = new Map<string, number>();
  return tetes.map((t) => {
    if (t.liee) return null;
    const vue = alterationDessinee(t.alter);
    const ligne = `${t.pas}${t.octave}`;
    if ((etat.get(ligne) ?? 0) === vue) return null;
    etat.set(ligne, vue);
    return SIGNES[String(vue)];
  });
}

/** Les valeurs de note que MusicXML nomme, de la ronde à la quadruple-croche. */
const VALEURS: { divisions: number; nom: string; points: number }[] = [
  { divisions: 16, nom: "whole", points: 0 },
  { divisions: 12, nom: "half", points: 1 },
  { divisions: 8, nom: "half", points: 0 },
  { divisions: 6, nom: "quarter", points: 1 },
  { divisions: 4, nom: "quarter", points: 0 },
  { divisions: 3, nom: "eighth", points: 1 },
  { divisions: 2, nom: "eighth", points: 0 },
  { divisions: 1, nom: "16th", points: 0 },
];

/**
 * Le nom de valeur le plus proche pour une durée donnée, en unités de division.
 *
 * LA TABLE CI-DESSUS EST ÉCRITE EN DOUBLES-CROCHES, quatre par noire, et c'est pourquoi la grille
 * réelle doit être dite. Elle ne l'était pas : `<divisions>` suit le réglage de quantification et
 * vaut quatre, deux ou une, de sorte qu'à la croche une noire s'appelait « eighth » et à la noire
 * « 16th ». La durée restait juste par rapport aux divisions, donc la mesure se remplissait et rien
 * ne criait ; c'est le NOM, c'est-à-dire la tête de note affichée par le logiciel qui lit, qui
 * était faux.
 */
export function valeurNote(dureeUnites: number, unitesParNoire = 4): { nom: string; points: number } {
  const d = Math.max(1, Math.round((dureeUnites * 4) / Math.max(1, unitesParNoire)));
  const exacte = VALEURS.find((v) => v.divisions === d);
  if (exacte) return { nom: exacte.nom, points: exacte.points };
  // Pas de valeur exacte : on prend la plus grande qui tienne, le reste étant déjà
  // découpé en notes séparées par `decouperEnMesures`.
  const approchee = VALEURS.find((v) => v.divisions <= d) ?? VALEURS[VALEURS.length - 1];
  return { nom: approchee.nom, points: approchee.points };
}

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Une voix : des événements qui se suivent sans se chevaucher, un accord étant un seul événement. Les temps sont en unités. */
export type Voix = { debut: number; fin: number; notes: number[] }[];

/**
 * LES VOIX D'UNE SUITE DE NOTES, posées sur la grille.
 *
 * La quantification est indispensable — une note jouée à 0,503 s n'a pas de valeur notable — et c'est elle
 * qui décide de ce que la partition dira. Une note plus courte qu'une unité en occupe une quand même : une
 * partition n'a pas de silence de durée nulle.
 *
 * CHAQUE NOTE VA DANS LA PREMIÈRE VOIX LIBRE, les plus aiguës d'abord, pour que la première voix porte le
 * dessus comme le veut l'usage ; des notes de même attaque et de même fin y forment un accord. Les notes
 * étaient groupées par attaque : un accord prenait la plus longue de ses durées, et une note qui commençait
 * pendant une autre était perdue, de sorte qu'une basse ronde sous quatre noires donnait deux notes sur cinq.
 * Décision de Fabien du 2026-11-22, « Write voices », revue des notations en texte.
 */
export function voixDepuisNotes(notes: NoteXML[], tempo: number, quantification: number): Voix[] {
  const unitesParNoire = Math.max(1, Math.round(quantification / 4));
  const secondesParUnite = 60 / Math.max(1, tempo) / unitesParNoire;
  const posees = notes.map((n) => {
    const debut = Math.max(0, Math.round(n.debut / secondesParUnite));
    return { note: n.note, debut, fin: debut + Math.max(1, Math.round((n.fin - n.debut) / secondesParUnite)) };
  }).sort((a, b) => a.debut - b.debut || b.note - a.note);
  const voix: Voix[] = [];
  for (const n of posees) {
    const derniere = (v: Voix) => v[v.length - 1];
    const accord = voix.find((v) => derniere(v).debut === n.debut && derniere(v).fin === n.fin);
    if (accord) { if (!derniere(accord).notes.includes(n.note)) derniere(accord).notes.push(n.note); continue; }
    const libre = voix.find((v) => derniere(v).fin <= n.debut);
    if (libre) libre.push({ debut: n.debut, fin: n.fin, notes: [n.note] });
    else voix.push([{ debut: n.debut, fin: n.fin, notes: [n.note] }]);
  }
  for (const v of voix) for (const e of v) e.notes.sort((a, b) => a - b);
  return voix.length > 0 ? voix : [[]];
}

/** Écrit la partition complète. */
export function notesVersMusicXML(notes: NoteXML[], options: OptionsMusicXML = {}): string {
  const tempo = options.tempo ?? 120;
  const quantification = options.quantification ?? 16;
  const [numerateur, denominateur] = options.metrique ?? [4, 4];
  // LA MÉTRIQUE AFFINE LA GRILLE QUAND IL LE FAUT, et c'est la réparation d'un arrondi. Une mesure
  // doit tomber sur un nombre ENTIER d'unités : 3/8 vaut une noire et demie, donc à la noire la
  // longueur de mesure valait 1,5 et s'arrondissait à 2, ce qui déplaçait les barres sans que rien
  // ne le dise. La grille descend donc au moins à l'unité du dénominateur, et le réglage de
  // quantification ne fait que la demander plus fine encore.
  const grille = Math.max(quantification, denominateur);
  const unitesParNoire = Math.max(1, Math.round(grille / 4));
  // MusicXML compte les durées en « divisions » par noire : c'est notre unité.
  const divisions = unitesParNoire;
  const unitesParMesure = ((numerateur * 4) / denominateur) * unitesParNoire;

  const voix = voixDepuisNotes(notes, tempo, grille);
  const fin = voix.flat().reduce((m, e) => Math.max(m, e.fin), 0);
  const nbMesures = Math.max(1, Math.ceil(fin / unitesParMesure));

  const lignes: string[] = [];
  lignes.push('<?xml version="1.0" encoding="UTF-8"?>');
  lignes.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  lignes.push('<score-partwise version="4.0">');
  lignes.push(`  <work><work-title>${echapper(options.titre ?? "Attic")}</work-title></work>`);
  lignes.push('  <identification><encoding><software>Attic</software></encoding></identification>');
  lignes.push('  <part-list>');
  lignes.push(`    <score-part id="P1"><part-name>${echapper(options.instrument ?? "Music")}</part-name></score-part>`);
  lignes.push('  </part-list>');
  lignes.push('  <part id="P1">');

  for (let m = 0; m < nbMesures; m++) {
    const debutMesure = m * unitesParMesure;
    lignes.push(`    <measure number="${m + 1}">`);
    if (m === 0) {
      lignes.push('      <attributes>');
      lignes.push(`        <divisions>${divisions}</divisions>`);
      lignes.push('        <key><fifths>0</fifths></key>');
      lignes.push(`        <time><beats>${numerateur}</beats><beat-type>${denominateur}</beat-type></time>`);
      lignes.push(`        <clef>${cleDe(notes.map((n) => n.note))}</clef>`);
      lignes.push('      </attributes>');
      lignes.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(tempo)}</per-minute></metronome></direction-type><sound tempo="${Math.round(tempo)}"/></direction>`);
    }

    // Chaque voix, dans la mesure, en morceaux : une première voix toujours, pour que la mesure soit pleine,
    // et les autres là seulement où elles jouent.
    const parVoix = voix
      .map((v) => morceauxDeLaMesure(v, debutMesure, debutMesure + unitesParMesure, unitesParNoire, [numerateur, denominateur]))
      .filter((morceaux, i) => i === 0 || morceaux.some((p) => p.notes.length > 0));
    // Les signes se décident dans l'ordre du temps, toutes voix confondues : ils valent pour la portée.
    const tetes = parVoix.flatMap((morceaux, v) => morceaux.flatMap((p) =>
      p.notes.map((n, k) => ({ v, p, k, debut: p.debut, ...nomMusicXML(n), liee: p.lieeAvant }))));
    const ordre = [...tetes].sort((a, b) => a.debut - b.debut);
    const signes = new Map(signesDeLaMesure(ordre).map((s, i) => [ordre[i], s]));
    parVoix.forEach((morceaux, v) => {
      if (v > 0) lignes.push(`      <backup><duration>${unitesParMesure}</duration></backup>`);
      for (const p of morceaux) {
        if (p.notes.length === 0) { lignes.push(...ecrireSilence(p.duree, unitesParNoire, v + 1)); continue; }
        p.notes.forEach((n, k) => {
          const tete = tetes.find((t) => t.p === p && t.k === k)!;
          lignes.push(...ecrireNote(n, p, k > 0, unitesParNoire, v + 1, signes.get(tete) ?? null));
        });
      }
    });
    lignes.push('    </measure>');
  }

  lignes.push('  </part>');
  lignes.push('</score-partwise>');
  return lignes.join("\n");
}

/**
 * Les valeurs qu'une durée prend une fois écrite, en unités, selon les temps de la mesure où elle
 * commence à `position` unités du début. La plus grande valeur d'abord, sans égard aux temps, cachait
 * le milieu de la mesure : voir `audio/musicxml-temps.ts`.
 */
function decomposer(position: number, duree: number, unitesParNoire: number, metrique: readonly [number, number], sonne: boolean): number[] {
  const parDouble = 4 / Math.max(1, unitesParNoire);
  return valeursSelonLesTemps(position * parDouble, duree * parDouble, metrique, sonne).map((v) => v / parDouble);
}

/** Un morceau d'une voix dans une mesure : une note ou un accord d'une seule valeur, ou un silence. */
interface Morceau { debut: number; duree: number; notes: number[]; lieeAvant: boolean; lieeApres: boolean }

/**
 * LES MORCEAUX D'UNE VOIX DANS UNE MESURE, silences compris.
 *
 * `<duration>` est la durée voulue et `<type>` la valeur dessinée, que le référentiel MusicXML 4.0 sépare.
 * Une note qui passait la barre était tronquée, « faute de pouvoir la lier », et une durée qu'aucune valeur
 * ne nomme se dessinait sous la plus proche, ce qui décalait tout ce qui suivait : cinq doubles croches en
 * noire. L'une et l'autre s'écrivent maintenant en notes liées, `<tie>` pour le son et `<tied>` pour la
 * gravure, et un silence en silences successifs. Revue des notations en texte, 2026-11-22.
 */
function morceauxDeLaMesure(
  voix: Voix, debutMesure: number, finMesure: number, unitesParNoire: number, metrique: readonly [number, number],
): Morceau[] {
  const morceaux: Morceau[] = [];
  const poser = (debut: number, fin: number, notes: number[], lieeAvant: boolean, lieeApres: boolean) => {
    const valeurs = decomposer(debut - debutMesure, fin - debut, unitesParNoire, metrique, notes.length > 0);
    let t = debut;
    valeurs.forEach((duree, k) => {
      const sonne = notes.length > 0;
      morceaux.push({ debut: t, duree, notes, lieeAvant: sonne && (k > 0 || lieeAvant), lieeApres: sonne && (k < valeurs.length - 1 || lieeApres) });
      t += duree;
    });
  };
  let t = debutMesure;
  for (const e of voix) {
    if (e.fin <= debutMesure || e.debut >= finMesure) continue;
    const debut = Math.max(e.debut, debutMesure), fin = Math.min(e.fin, finMesure);
    if (debut > t) poser(t, debut, [], false, false);
    poser(debut, fin, e.notes, e.debut < debutMesure, e.fin > finMesure);
    t = fin;
  }
  if (t < finMesure) poser(t, finMesure, [], false, false);
  return morceaux;
}

function ecrireNote(noteMidi: number, p: Morceau, estAccord: boolean, unitesParNoire: number, voix: number, signe: string | null): string[] {
  const { pas, alter, octave } = nomMusicXML(noteMidi);
  const { nom, points } = valeurNote(p.duree, unitesParNoire);
  const out = ["      <note>"];
  if (estAccord) out.push("        <chord/>");
  out.push("        <pitch>");
  out.push(`          <step>${pas}</step>`);
  if (alter !== 0) out.push(`          <alter>${alter}</alter>`);
  out.push(`          <octave>${octave}</octave>`);
  out.push("        </pitch>");
  out.push(`        <duration>${p.duree}</duration>`);
  if (p.lieeAvant) out.push('        <tie type="stop"/>');
  if (p.lieeApres) out.push('        <tie type="start"/>');
  out.push(`        <voice>${voix}</voice>`);
  out.push(`        <type>${nom}</type>`);
  for (let i = 0; i < points; i++) out.push("        <dot/>");
  if (signe) out.push(`        <accidental>${signe}</accidental>`);
  if (p.lieeAvant || p.lieeApres) {
    out.push(`        <notations>${p.lieeAvant ? '<tied type="stop"/>' : ""}${p.lieeApres ? '<tied type="start"/>' : ""}</notations>`);
  }
  out.push("      </note>");
  return out;
}

function ecrireSilence(duree: number, unitesParNoire: number, voix: number): string[] {
  const { nom, points } = valeurNote(duree, unitesParNoire);
  const out = ["      <note>", "        <rest/>", `        <duration>${duree}</duration>`, `        <voice>${voix}</voice>`, `        <type>${nom}</type>`];
  for (let i = 0; i < points; i++) out.push("        <dot/>");
  out.push("      </note>");
  return out;
}
