// audio/musicxml-arbre.ts — Graver un arbre rythmique, n-olets compris.
//
// CE QUI MANQUAIT. Le graveur écrivait une partition depuis des durées en SECONDES, qu'il ramenait
// sur une grille de doubles-croches. Un triolet n'y survit pas : trois tiers de temps ne tombent sur
// aucune case d'une grille binaire, et la partition montrait trois durées approchées là où la pièce
// en avait trois exactes. Le son était juste, l'écriture ne l'était pas.
//
// POURQUOI PARTIR DE L'ARBRE ET NON DES NOTES. Une durée en secondes ne dit pas d'où elle vient : un
// tiers de temps peut être un triolet de croches ou une quintolet mal arrondie, et rien ne permet de
// choisir. L'arbre, lui, PORTE la division : il sait que ces trois notes sont un temps en trois, et
// c'est exactement ce que la gravure doit écrire. Ce module part donc de la structure, non du
// résultat.
//
// LES DURÉES SONT DES FRACTIONS EXACTES, et non des nombres à virgule. MusicXML compte en unités
// entières par noire, l'unité étant déclarée par la partition ; un tiers de noire n'a de sens que si
// l'unité est divisible par trois. En travaillant en rationnels, on connaît le dénominateur commun
// et l'on déclare la bonne unité, plutôt que d'arrondir et d'espérer.

import type { Mesure, NoeudRythme } from "./arbre-rythmique";
import { nomMusicXML } from "./musicxml";

// ── Rationnels ─────────────────────────────────────────────────────────

interface Rat { n: number; d: number }

const pgcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : pgcd(b, a % b));
const rat = (n: number, d = 1): Rat => {
  const s = d < 0 ? -1 : 1;
  const g = pgcd(Math.abs(n), Math.abs(d)) || 1;
  return { n: (s * n) / g, d: (s * d) / g };
};
const mul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
const ppcm = (a: number, b: number): number => Math.abs(a * b) / (pgcd(a, b) || 1);

/** La plus grande puissance de deux qui ne dépasse pas n : le « normal » d'un n-olet. */
function puissanceDeDeuxSous(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

const estPuissanceDeDeux = (n: number) => n > 0 && (n & (n - 1)) === 0;

// ── Aplatissement de l'arbre ───────────────────────────────────────────

export interface FeuilleGravee {
  /** Durée réelle, en noires, exacte. */
  duree: Rat;
  /** Durée telle qu'elle S'ÉCRIT : la durée réelle multipliée par le rapport des n-olets. */
  ecrite: Rat;
  silence: boolean;
  liee: boolean;
  /** Le rapport du n-olet qui la porte, accumulé sur tous les étages : 3/2 pour un triolet. */
  rapport: Rat;
  /** Rang du groupe irrégulier le plus proche, ou zéro. */
  groupe: number;
  /** Nombre de parts et de parts « normales » de ce groupe, pour l'écrire. */
  reel: number;
  normal: number;
}

/** Les noires que dure une mesure. */
const noiresDe = (m: Mesure) => rat(m.metrique[0] * 4, m.metrique[1]);

/**
 * Aplatit une mesure en feuilles, chacune sachant sa durée réelle et sa durée écrite.
 *
 * LE RAPPORT S'ACCUMULE EN DESCENDANT, ce qui fait que les n-olets gigognes s'écrivent aussi : un
 * triolet dont une part se divise en cinq porte 3/2 puis 5/4, donc 15/8, et sa durée écrite en
 * découle sans qu'aucun cas particulier n'ait à être prévu.
 */
export function feuillesDeMesure(m: Mesure): FeuilleGravee[] {
  const out: FeuilleGravee[] = [];
  const compteur = { groupe: 0 };
  descendre(m.contenu, noiresDe(m), rat(1), 0, 1, 1, compteur, out);
  return out;
}

function descendre(
  noeuds: readonly NoeudRythme[], duree: Rat, rapport: Rat,
  groupe: number, reel: number, normal: number,
  compteur: { groupe: number }, out: FeuilleGravee[],
): void {
  const somme = noeuds.reduce((s, n) => s + Math.max(0, n.valeur), 0);
  if (somme <= 0) return;
  // LE N-OLET SE COMPTE SUR LA SOMME DES POIDS, ET NON SUR LE NOMBRE DE PARTS. Une division en
  // deux parts de poids 2 et 1 vaut trois unités : c'est un triolet dont une note en prend deux,
  // et compter les parts en ferait un duolet, ce qui n'a pas de sens.
  const irreguliere = !estPuissanceDeDeux(somme);
  const monNormal = irreguliere ? puissanceDeDeuxSous(somme) : normal;
  const monReel = irreguliere ? somme : reel;
  const monRapport = irreguliere ? mul(rapport, rat(somme, monNormal)) : rapport;
  const monGroupe = irreguliere ? ++compteur.groupe : groupe;

  for (const n of noeuds) {
    const part = mul(duree, rat(Math.max(0, n.valeur), somme));
    if (n.enfants && n.enfants.length > 0) {
      descendre(n.enfants, part, monRapport, monGroupe, monReel, monNormal, compteur, out);
    } else {
      out.push({
        duree: part,
        ecrite: mul(part, monRapport),
        silence: !!n.silence,
        liee: !!n.liee,
        rapport: monRapport,
        groupe: irreguliere ? monGroupe : 0,
        reel: monReel,
        normal: monNormal,
      });
    }
  }
}

// ── Valeurs de note ────────────────────────────────────────────────────

/** Les valeurs notables, en noires, de la ronde à la quadruple-croche, points compris. */
const VALEURS: { quarts: Rat; nom: string; points: number }[] = [
  { quarts: rat(4), nom: "whole", points: 0 },
  { quarts: rat(3), nom: "half", points: 1 },
  { quarts: rat(2), nom: "half", points: 0 },
  { quarts: rat(3, 2), nom: "quarter", points: 1 },
  { quarts: rat(1), nom: "quarter", points: 0 },
  { quarts: rat(3, 4), nom: "eighth", points: 1 },
  { quarts: rat(1, 2), nom: "eighth", points: 0 },
  { quarts: rat(3, 8), nom: "16th", points: 1 },
  { quarts: rat(1, 4), nom: "16th", points: 0 },
  { quarts: rat(1, 8), nom: "32nd", points: 0 },
  { quarts: rat(1, 16), nom: "64th", points: 0 },
];

/**
 * Le nom de valeur d'une durée écrite.
 *
 * LA DURÉE ÉCRITE EST DÉJÀ DÉBARRASSÉE DU N-OLET : c'est tout l'intérêt de la calculer. Un tiers de
 * noire dans un triolet s'écrit une croche, et c'est bien « eighth » qu'on cherche ici, pas une
 * valeur exotique. Faute d'une valeur exacte — ce qui arrive sur un arbre tordu —, on prend la plus
 * proche plutôt que de refuser d'écrire.
 */
export function valeurEcrite(d: Rat): { nom: string; points: number } {
  const exacte = VALEURS.find((v) => v.quarts.n === d.n && v.quarts.d === d.d);
  if (exacte) return { nom: exacte.nom, points: exacte.points };
  const cible = d.n / d.d;
  let meilleure = VALEURS[VALEURS.length - 1], ecart = Infinity;
  for (const v of VALEURS) {
    const e = Math.abs(v.quarts.n / v.quarts.d - cible);
    if (e < ecart) { ecart = e; meilleure = v; }
  }
  return { nom: meilleure.nom, points: meilleure.points };
}

// ── Écriture ───────────────────────────────────────────────────────────

export interface OptionsArbreXML {
  titre?: string;
  tempo?: number;
  instrument?: string;
}

const echapper = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Écrit une partition MusicXML depuis des arbres rythmiques et une suite de hauteurs.
 *
 * L'UNITÉ EST CHOISIE POUR QUE TOUTES LES DURÉES SOIENT ENTIÈRES. MusicXML compte en unités par
 * noire ; un tiers de noire n'existe que si l'unité est divisible par trois. On prend donc le plus
 * petit commun multiple des dénominateurs de la pièce, et non une valeur fixée d'avance qui
 * obligerait à arrondir.
 *
 * LES HAUTEURS TOURNENT, les silences n'en consommant aucune : c'est la même règle que le nœud qui
 * fait entendre l'arbre, sans quoi la partition et le son diraient deux choses.
 */
export function arbreVersMusicXML(
  mesures: readonly Mesure[], hauteurs: readonly number[], o: OptionsArbreXML = {},
): string {
  const tempo = Math.round(o.tempo ?? 120);
  const parMesure = mesures.map(feuillesDeMesure);
  const toutes = parMesure.flat();
  const divisions = toutes.reduce((L, f) => ppcm(L, f.duree.d), 1);

  const lignes: string[] = [];
  lignes.push('<?xml version="1.0" encoding="UTF-8"?>');
  lignes.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  lignes.push('<score-partwise version="4.0">');
  lignes.push(`  <work><work-title>${echapper(o.titre ?? "Attic")}</work-title></work>`);
  lignes.push('  <identification><encoding><software>Attic</software></encoding></identification>');
  lignes.push('  <part-list>');
  lignes.push(`    <score-part id="P1"><part-name>${echapper(o.instrument ?? "Music")}</part-name></score-part>`);
  lignes.push('  </part-list>');
  lignes.push('  <part id="P1">');

  let rang = 0;
  mesures.forEach((m, iMesure) => {
    const feuilles = parMesure[iMesure];
    lignes.push(`    <measure number="${iMesure + 1}">`);
    if (iMesure === 0) {
      lignes.push('      <attributes>');
      lignes.push(`        <divisions>${divisions}</divisions>`);
      lignes.push('        <key><fifths>0</fifths></key>');
      lignes.push(`        <time><beats>${m.metrique[0]}</beats><beat-type>${m.metrique[1]}</beat-type></time>`);
      lignes.push('        <clef><sign>G</sign><line>2</line></clef>');
      lignes.push('      </attributes>');
      lignes.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>`);
    } else if (m.metrique[0] !== mesures[iMesure - 1].metrique[0]
      || m.metrique[1] !== mesures[iMesure - 1].metrique[1]) {
      lignes.push(`      <attributes><time><beats>${m.metrique[0]}</beats><beat-type>${m.metrique[1]}</beat-type></time></attributes>`);
    }

    feuilles.forEach((f, i) => {
      const duree = Math.round((f.duree.n * divisions) / f.duree.d);
      const { nom, points } = valeurEcrite(f.ecrite);
      const precedente = feuilles[i - 1];
      const suivante = feuilles[i + 1];
      const debutGroupe = f.groupe > 0 && (!precedente || precedente.groupe !== f.groupe);
      const finGroupe = f.groupe > 0 && (!suivante || suivante.groupe !== f.groupe);

      lignes.push('      <note>');
      if (f.silence) {
        lignes.push('        <rest/>');
      } else {
        const hauteur = hauteurs.length > 0 ? hauteurs[rang % hauteurs.length] : 60;
        rang++;
        const { pas, alter, octave } = nomMusicXML(hauteur);
        lignes.push('        <pitch>');
        lignes.push(`          <step>${pas}</step>`);
        if (alter !== 0) lignes.push(`          <alter>${alter}</alter>`);
        lignes.push(`          <octave>${octave}</octave>`);
        lignes.push('        </pitch>');
      }
      lignes.push(`        <duration>${duree}</duration>`);
      // UNE NOTE LIÉE EST ÉCRITE COMME TELLE, et non fondue dans la précédente : la gravure montre
      // la liaison, là où le son n'entend qu'une durée plus longue.
      if (f.liee) lignes.push('        <tie type="stop"/>');
      if (feuilles[i + 1]?.liee) lignes.push('        <tie type="start"/>');
      lignes.push(`        <type>${nom}</type>`);
      for (let p = 0; p < points; p++) lignes.push('        <dot/>');
      if (f.groupe > 0) {
        lignes.push('        <time-modification>');
        lignes.push(`          <actual-notes>${f.reel}</actual-notes>`);
        lignes.push(`          <normal-notes>${f.normal}</normal-notes>`);
        lignes.push('        </time-modification>');
      }
      const notations: string[] = [];
      if (f.liee) notations.push('<tied type="stop"/>');
      if (feuilles[i + 1]?.liee) notations.push('<tied type="start"/>');
      if (debutGroupe) notations.push(`<tuplet type="start" number="1" bracket="yes"/>`);
      if (finGroupe) notations.push('<tuplet type="stop" number="1"/>');
      if (notations.length > 0) {
        lignes.push(`        <notations>${notations.join("")}</notations>`);
      }
      lignes.push('      </note>');
    });

    lignes.push('    </measure>');
  });

  lignes.push('  </part>');
  lignes.push('</score-partwise>');
  return lignes.join("\n");
}
