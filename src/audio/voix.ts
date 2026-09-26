// audio/voix.ts — Une séquence qui porte son écriture.
//
// CE QU'EST UNE VOIX, ET POURQUOI ELLE MANQUAIT. Dans la lignée d'OpenMusic, un `voice` est un
// tempo, un arbre rythmique et des hauteurs tenus ensemble : le régime pulsé, par opposition au
// régime linéaire d'une suite d'événements datés en secondes. Le flux `sequence` portait le second
// et pas le premier. L'arbre voyageait donc sur un port de texte, à côté des notes qu'il décrit.
//
// DEUX CÂBLES QUI DOIVENT RESTER EN PHASE, ET RIEN POUR LE GARANTIR. La gravure reçoit l'arbre d'un
// côté et les hauteurs de l'autre ; une transformation posée au milieu de la chaîne change les
// secondes sans que l'arbre en sache rien, et la partition écrit alors un rythme qui n'est plus
// celui des notes. L'erreur est muette, et c'est ce qui la rend grave : la partition paraît juste.
//
// D'OÙ LA CONCORDANCE, QUI EST TOUT L'INTÉRÊT DE CE MODULE. Un arbre porté par une séquence n'est
// cru que s'il décrit encore ses notes. La vérification est à notre portée et elle est exacte :
// dérouler l'arbre au tempo de la séquence donne les instants qu'il prescrit, et ces instants
// doivent être ceux des attaques. Un arbre qui ne concorde plus est écarté et la raison est dite,
// plutôt que gravé tel quel.
//
// LES ACCORDS SONT COMPTÉS UNE FOIS. Plusieurs notes qui commencent ensemble sont une seule feuille
// de l'arbre ; la comparaison porte donc sur les instants DISTINCTS d'attaque, faute de quoi tout
// accord ferait échouer la concordance.

import { derouler, lireArbre, type Mesure } from "./arbre-rythmique";
import type { Note } from "./note";
import type { InfoVoix, Sequence } from "./sequence";

/** Ce que vaut un arbre porté par une séquence. */
export interface Concordance {
  juste: boolean;
  /** Pourquoi il est écarté, quand il l'est. Vide sinon. */
  raison: string;
  /** Les instants que l'arbre prescrit, et ceux des attaques, quand ils diffèrent. */
  prescrits: number;
  attaques: number;
}

/** Les instants d'attaque distincts, un accord n'en comptant qu'un. */
export function instantsDAttaque(notes: readonly Note[], tolerance = 1e-6): number[] {
  const tries = [...notes].map((n) => n.debut).sort((a, b) => a - b);
  const sortie: number[] = [];
  for (const t of tries) {
    if (sortie.length === 0 || t - sortie[sortie.length - 1] > tolerance) sortie.push(t);
  }
  return sortie;
}

/**
 * L'arbre décrit-il encore ces notes ?
 *
 * LA TOLÉRANCE EST CELLE DU CALCUL, NON CELLE DE L'OREILLE. Un arbre et les notes qu'il a produites
 * donnent les mêmes secondes au millionième près ; un écart plus grand ne vient pas d'un arrondi
 * mais d'une transformation qui a déplacé quelque chose, et c'est précisément ce qu'il faut voir.
 */
export function concorde(
  arbre: string, notes: readonly Note[], tempo: number, tolerance = 1e-6,
): Concordance {
  const rien = { prescrits: 0, attaques: instantsDAttaque(notes, tolerance).length };
  if (!(tempo > 0)) return { juste: false, raison: "tempo inconnu", ...rien };
  let mesures: Mesure[];
  try {
    mesures = lireArbre(arbre);
  } catch (err: any) {
    return { juste: false, raison: String(err?.message ?? err), ...rien };
  }
  if (mesures.length === 0) return { juste: false, raison: "arbre vide", ...rien };

  const prescrits = derouler(mesures, tempo).filter((e) => !e.silence).map((e) => e.debut);
  const attaques = instantsDAttaque(notes, tolerance);
  const compte = { prescrits: prescrits.length, attaques: attaques.length };
  if (prescrits.length !== attaques.length) {
    return { juste: false, raison: "le compte des attaques ne suit plus", ...compte };
  }
  for (let i = 0; i < prescrits.length; i++) {
    if (Math.abs(prescrits[i] - attaques[i]) > tolerance) {
      return { juste: false, raison: "une attaque a bougé", ...compte };
    }
  }
  return { juste: true, raison: "", ...compte };
}

/**
 * Pose une écriture sur une séquence, et seulement si elle la décrit.
 *
 * C'EST LE SEUL CHEMIN PAR LEQUEL UNE SÉQUENCE REÇOIT SON ARBRE. Un nœud qui l'inscrirait
 * directement pourrait y mettre celui d'avant sa propre transformation, ce qui est exactement
 * l'erreur muette qu'on veut rendre impossible.
 */
export function poserArbre(sequence: Sequence, arbre: string | undefined): Sequence {
  if (!arbre || !arbre.trim()) return sequence;
  const tempo = sequence.tempo ?? 0;
  if (!concorde(arbre, sequence.notes, tempo).juste) return sequence;
  return { ...sequence, arbre };
}

/**
 * L'écriture portée par une séquence, quand elle en porte une qui tient encore.
 *
 * Rend les mesures déjà lues, pour que l'appelant n'ait ni à relire le texte ni à refaire la
 * vérification. Rend `null` quand il n'y a pas d'arbre, et quand celui qui s'y trouve ne concorde
 * plus : dans les deux cas la suite se rabat sur les durées, ce qu'elle savait déjà faire.
 */
export function arbreDe(sequence: Sequence): { mesures: Mesure[]; arbre: string } | null {
  if (!sequence.arbre || !sequence.arbre.trim()) return null;
  if (!concorde(sequence.arbre, sequence.notes, sequence.tempo ?? 0).juste) return null;
  try {
    const mesures = lireArbre(sequence.arbre);
    return mesures.length > 0 ? { mesures, arbre: sequence.arbre } : null;
  } catch {
    return null;
  }
}

// ── La polyphonie ──────────────────────────────────────────────────────

/** Une voix telle qu'on la lit : ses notes, et ce qu'elle porte en propre. */
export interface VoixLue extends InfoVoix {
  notes: Note[];
}

/**
 * Les numéros de voix présents, dans l'ordre.
 *
 * UNE NOTE SANS VOIX EST DE LA PREMIÈRE. Tout ce qui existait produit des notes sans ce champ ;
 * les tenir pour une voix zéro laisse ces séquences se comporter exactement comme avant, et une
 * séquence à une seule voix reste une séquence à une seule voix.
 */
export function numerosDeVoix(notes: readonly Note[]): number[] {
  return [...new Set(notes.map((n) => n.voix ?? 0))].sort((a, b) => a - b);
}

/** Combien de voix distinctes une séquence porte. Une, pour tout ce qui n'en déclare pas. */
export const compterVoix = (s: Sequence): number => numerosDeVoix(s.notes).length;

/**
 * Les voix d'une séquence, chacune avec ses notes et son écriture.
 *
 * L'ÉCRITURE DE CHAQUE VOIX EST VÉRIFIÉE SÉPARÉMENT, sur ses seules notes. Un arbre juste pour la
 * main droite ne dit rien de la gauche, et une voix dont l'arbre ne concorde plus le perd sans
 * entraîner les autres : la gravure repart alors des durées pour cette portée-là.
 *
 * QUAND LA SÉQUENCE N'EN DÉCLARE QU'UNE, `arbre` lui sert d'écriture. C'est ce qui fait qu'une
 * séquence écrite du régime pulsé se grave pareil, qu'elle se déclare polyphonique ou non.
 */
export function voixDe(sequence: Sequence): VoixLue[] {
  const numeros = numerosDeVoix(sequence.notes);
  const infos = new Map((sequence.voix ?? []).map((v) => [v.numero, v]));
  return numeros.map((numero) => {
    const notes = sequence.notes.filter((n) => (n.voix ?? 0) === numero);
    const info = infos.get(numero);
    // L'arbre de la séquence entière ne vaut que pour une voix unique ; à plusieurs, chacune a le
    // sien ou n'en a pas, faute de quoi l'écriture d'une portée serait posée sur une autre.
    const brut = info?.arbre ?? (numeros.length === 1 ? sequence.arbre : undefined);
    const arbre = brut && concorde(brut, notes, sequence.tempo ?? 0).juste ? brut : undefined;
    return { numero, nom: info?.nom, arbre, notes };
  });
}

/**
 * Réunit plusieurs séquences en une seule, chacune devenant une voix.
 *
 * LES NOTES SONT RENUMÉROTÉES, ET C'EST NÉCESSAIRE. Deux séquences arrivant chacune avec ses
 * propres numéros de voix les verraient se confondre ; chaque entrée reçoit donc un numéro neuf,
 * dans l'ordre où elle arrive, et les voix qu'elle portait déjà se suivent à l'intérieur du sien.
 *
 * LE TEMPO EST CELUI DE LA PREMIÈRE QUI EN DÉCLARE UN. Deux voix de tempos différents ne se
 * gravent pas sur une même partition, et prendre le premier connu vaut mieux que n'en prendre
 * aucun ; le nombre de voix dont le tempo diffère est rendu, pour que l'appelant le dise.
 */
export function reunirVoix(
  entrees: readonly { sequence: Sequence; nom?: string }[],
): { sequence: Sequence; tempoDivergent: number } {
  const notes: Note[] = [];
  const voix: InfoVoix[] = [];
  let tempo: number | undefined;
  let duree = 0;
  let tempoDivergent = 0;
  let numero = 0;
  for (const { sequence, nom } of entrees) {
    if (tempo === undefined) tempo = sequence.tempo;
    else if (sequence.tempo !== undefined && sequence.tempo !== tempo) tempoDivergent++;
    duree = Math.max(duree, sequence.duree ?? 0, ...sequence.notes.map((n) => n.fin));
    for (const interne of voixDe(sequence)) {
      const mien = numero++;
      for (const n of interne.notes) notes.push({ ...n, voix: mien });
      voix.push({
        numero: mien,
        nom: nom ?? interne.nom ?? sequence.titre,
        arbre: interne.arbre,
      });
    }
  }
  notes.sort((a, b) => a.debut - b.debut || (a.voix ?? 0) - (b.voix ?? 0) || a.note - b.note);
  return { sequence: { notes, tempo, duree, voix }, tempoDivergent };
}

/** Une voix seule, rendue comme une séquence ordinaire que tout sait déjà traiter. */
export function extraireVoix(sequence: Sequence, numero: number): Sequence | null {
  const voix = voixDe(sequence).find((v) => v.numero === numero);
  if (!voix) return null;
  return {
    // La voix extraite redevient une séquence d'une seule voix : son champ perdrait son sens
    // ailleurs, et le garder ferait croire à une polyphonie qui n'y est plus.
    notes: voix.notes.map(({ voix: _, ...n }) => n),
    tempo: sequence.tempo,
    duree: sequence.duree,
    titre: voix.nom,
    arbre: voix.arbre,
  };
}
