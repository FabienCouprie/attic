// audio/musicxml.ts — Export MusicXML, le format d'échange des partitions.
//
// Attic sait écrire de l'ABC et dessiner avec VexFlow, mais rien de ce qu'il produit
// n'entre dans MuseScore, Finale ou Sibelius. MusicXML est le format que tous lisent ;
// c'est par lui qu'une mélodie engendrée ici devient une partition qu'on édite ailleurs.
//
// Ce module écrit du MusicXML 4.0 « partwise », la forme la plus largement acceptée. Il
// ne prétend pas tout couvrir : une transcription automatique depuis du MIDI ne connaît
// ni les liaisons, ni les nuances, ni l'enharmonie voulue par le compositeur. Elle donne
// les hauteurs, les durées et les mesures — ce qu'on attend d'un point de départ.

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
 * `divisionsParNoire` vaut 4 dans cette écriture : l'unité est la double-croche.
 */
export function valeurNote(dureeUnites: number): { nom: string; points: number } {
  const d = Math.max(1, Math.round(dureeUnites));
  const exacte = VALEURS.find((v) => v.divisions === d);
  if (exacte) return { nom: exacte.nom, points: exacte.points };
  // Pas de valeur exacte : on prend la plus grande qui tienne, le reste étant déjà
  // découpé en notes séparées par `decouperEnMesures`.
  const approchee = VALEURS.find((v) => v.divisions <= d) ?? VALEURS[VALEURS.length - 1];
  return { nom: approchee.nom, points: approchee.points };
}

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Evenement {
  /** Position en unités (double-croches) depuis le début. */
  debut: number;
  duree: number;
  notes: number[];
}

/**
 * Regroupe les notes en événements : celles qui commencent ensemble forment un accord.
 *
 * La quantification est indispensable — une note jouée à 0,503 s n'a pas de valeur
 * notable — et c'est elle qui décide de ce que la partition dira. Une note plus courte
 * qu'une unité en occupe une quand même : une partition n'a pas de silence de durée nulle.
 */
export function evenementsDepuisNotes(
  notes: NoteXML[],
  tempo: number,
  quantification: number,
): Evenement[] {
  const unitesParNoire = Math.max(1, Math.round(quantification / 4));
  const secondesParUnite = 60 / Math.max(1, tempo) / unitesParNoire;
  const parDebut = new Map<number, { duree: number; notes: number[] }>();
  for (const n of notes) {
    const debut = Math.max(0, Math.round(n.debut / secondesParUnite));
    const duree = Math.max(1, Math.round((n.fin - n.debut) / secondesParUnite));
    const e = parDebut.get(debut);
    if (e) {
      e.notes.push(n.note);
      e.duree = Math.max(e.duree, duree);
    } else {
      parDebut.set(debut, { duree, notes: [n.note] });
    }
  }
  return [...parDebut.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([debut, e]) => ({ debut, duree: e.duree, notes: [...e.notes].sort((x, y) => x - y) }));
}

/** Écrit la partition complète. */
export function notesVersMusicXML(notes: NoteXML[], options: OptionsMusicXML = {}): string {
  const tempo = options.tempo ?? 120;
  const quantification = options.quantification ?? 16;
  const [numerateur, denominateur] = options.metrique ?? [4, 4];
  const unitesParNoire = Math.max(1, Math.round(quantification / 4));
  // MusicXML compte les durées en « divisions » par noire : c'est notre unité.
  const divisions = unitesParNoire;
  const unitesParMesure = Math.max(1, Math.round((numerateur * 4 / denominateur) * unitesParNoire));

  const evenements = evenementsDepuisNotes(notes, tempo, quantification);
  const fin = evenements.reduce((m, e) => Math.max(m, e.debut + e.duree), 0);
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
      lignes.push('        <clef><sign>G</sign><line>2</line></clef>');
      lignes.push('      </attributes>');
      lignes.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(tempo)}</per-minute></metronome></direction-type><sound tempo="${Math.round(tempo)}"/></direction>`);
    }

    // Ce que la mesure contient, dans l'ordre, silences compris.
    let curseur = debutMesure;
    const dansLaMesure = evenements.filter((e) => e.debut >= debutMesure && e.debut < debutMesure + unitesParMesure);
    for (const e of dansLaMesure) {
      if (e.debut > curseur) {
        lignes.push(...ecrireSilence(e.debut - curseur));
        curseur = e.debut;
      }
      // Une note ne déborde pas de la mesure : on la tronque, faute de pouvoir la lier.
      const duree = Math.min(e.duree, debutMesure + unitesParMesure - curseur);
      if (duree <= 0) continue;
      e.notes.forEach((n, i) => lignes.push(...ecrireNote(n, duree, i > 0)));
      curseur += duree;
    }
    if (curseur < debutMesure + unitesParMesure) {
      lignes.push(...ecrireSilence(debutMesure + unitesParMesure - curseur));
    }
    lignes.push('    </measure>');
  }

  lignes.push('  </part>');
  lignes.push('</score-partwise>');
  return lignes.join("\n");
}

function ecrireNote(noteMidi: number, duree: number, estAccord: boolean): string[] {
  const { pas, alter, octave } = nomMusicXML(noteMidi);
  const { nom, points } = valeurNote(duree);
  const out = ["      <note>"];
  if (estAccord) out.push("        <chord/>");
  out.push("        <pitch>");
  out.push(`          <step>${pas}</step>`);
  if (alter !== 0) out.push(`          <alter>${alter}</alter>`);
  out.push(`          <octave>${octave}</octave>`);
  out.push("        </pitch>");
  out.push(`        <duration>${duree}</duration>`);
  out.push(`        <type>${nom}</type>`);
  for (let i = 0; i < points; i++) out.push("        <dot/>");
  out.push("      </note>");
  return out;
}

function ecrireSilence(duree: number): string[] {
  const { nom, points } = valeurNote(duree);
  const out = ["      <note>", "        <rest/>", `        <duration>${duree}</duration>`, `        <type>${nom}</type>`];
  for (let i = 0; i < points; i++) out.push("        <dot/>");
  out.push("      </note>");
  return out;
}
