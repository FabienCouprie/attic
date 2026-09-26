// plugins/voix.ts — Mener plusieurs voix de front.
//
// CE QUE LA POLYPHONIE DEMANDE, ET QUI N'ÉTAIT PAS LÀ. Une séquence portait une ligne, puis son
// écriture mesurée. Deux lignes menées ensemble, c'est-à-dire ce qu'on grave sur deux portées,
// n'avaient pas de représentation : le canal MIDI en tenait lieu, ce qui suffit pour jouer et non
// pour écrire, un canal désignant un instrument et non une portée. Les deux mains d'un piano
// partagent un canal et font deux portées.
//
// DEUX NŒUDS, ET C'EST LE VA-ET-VIENT QUI COMPTE. Réunir des lignes en une partition, puis en
// ressortir une pour la retoucher et la réunir de nouveau : c'est la façon dont on travaille une
// polyphonie, et une seule des deux directions ne servirait à rien.
//
// L'APPARTENANCE EST PORTÉE PAR LA NOTE, et la logique est dans `audio/voix.ts`, éprouvée ; ce
// fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { dureeSequence, estSequence, type Sequence } from "../audio/sequence";
import { compterVoix, extraireVoix, reunirVoix, voixDe } from "../audio/voix";
import { nomNote } from "../audio/nom-note";

const en = () => langueCourante() === "en";

/** Le relevé d'une polyphonie, voix par voix. */
function tableDesVoix(sequence: Sequence): string {
  const voix = voixDe(sequence);
  const entete = `${voix.length} ${en() ? "voices" : "voix"} · ${sequence.notes.length} notes · `
    + `${dureeSequence(sequence).toFixed(2)} s${sequence.tempo ? ` · ${sequence.tempo} BPM` : ""}`;
  const lignes = voix.map((v) => {
    const hauteurs = v.notes.map((n) => n.note);
    const etendue = hauteurs.length > 0
      ? `${nomNote(Math.min(...hauteurs))} ${en() ? "to" : "à"} ${nomNote(Math.max(...hauteurs))}`
      : (en() ? "empty" : "vide");
    const ecrite = v.arbre ?? (en() ? "no written rhythm" : "pas de rythme écrit");
    return `${v.numero}  ${v.nom ?? (en() ? "unnamed" : "sans nom")}  ${v.notes.length} notes  ${etendue}\n     ${ecrite}`;
  });
  return [entete, "", ...lignes].join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "reunir-voix",
    nom: "Réunir des voix", nomEn: "Merge Voices",
    univers: "Traitement", famille: "Conversion",
    resume: "Réunit plusieurs séquences en une seule, chacune devenant une voix.",
    resumeEn: "Merges several sequences into one, each becoming a voice.",
    notice: "Réunit les séquences reçues en une seule, chacune devenant une voix, et rend la polyphonie obtenue.\n\nUne voix est une ligne, c'est-à-dire ce qui se grave sur une portée et se lit d'un seul tenant. Elle ne se confond pas avec le canal MIDI, qui désigne un instrument : les deux mains d'un piano partagent un canal et forment deux portées.\n\nL'entrée « Séquence » accepte plusieurs branchements. Chaque séquence reçue devient une voix, dans l'ordre où elle arrive ; une séquence qui portait déjà plusieurs voix les garde toutes, renumérotées à la suite des précédentes.\n\nL'écriture mesurée de chaque voix la suit, quand elle en porte une. Elle est vérifiée sur les seules notes de cette voix : une voix dont l'écriture ne décrit plus ses notes la perd sans entraîner les autres.\n\nLe tempo retenu est celui de la première voix qui en déclare un, deux tempos différents ne se gravant pas sur une même partition. Le message dit combien de voix en déclaraient un autre.\n\nLa durée est la plus longue des durées reçues : une voix qui s'arrête avant les autres est suivie d'un silence, et non de la fin de la pièce.\n\nLa sortie « Séquence » porte toutes les notes, chacune sachant à quelle voix elle appartient. La sortie « Analyse » liste les voix avec leur nom, leur nombre de notes, leur étendue et leur écriture.\n\nLe message donne le nombre de voix, le nombre de notes et la durée.",
    noticeEn: "Merges the sequences received into one, each becoming a voice, and returns the polyphony obtained.\n\nA voice is a line, that is, what is engraved on one staff and read as a single strand. It is not the same as the MIDI channel, which designates an instrument: the two hands of a piano share a channel and form two staves.\n\nThe « Sequence » input accepts several connections. Each sequence received becomes a voice, in the order it arrives; a sequence that already carried several voices keeps them all, renumbered after the previous ones.\n\nThe written rhythm of each voice follows it, when it carries one. It is checked against that voice's notes alone: a voice whose writing no longer describes its notes loses it without affecting the others.\n\nThe tempo retained is that of the first voice to declare one, two different tempos not being engravable on a single score. The message gives how many voices declared another.\n\nThe duration is the longest of those received: a voice that stops before the others is followed by a rest, not by the end of the piece.\n\nThe « Sequence » output carries every note, each knowing which voice it belongs to. The « Analysis » output lists the voices with their name, their note count, their range and their writing.\n\nThe message gives the number of voices, the number of notes and the duration.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence", dynamique: true }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [],
    async executer(ctx: any) {
      const recues = (ctx.entrees() as unknown[]).filter(estSequence)
        .filter((s) => s.notes.length > 0);
      if (recues.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }
      const { sequence, tempoDivergent } = reunirVoix(recues.map((s) => ({ sequence: s })));
      const nbVoix = compterVoix(sequence);
      return {
        valeurs: [sequence, tableDesVoix(sequence)],
        message: `${nbVoix} ${en() ? "voices" : "voix"} · ${sequence.notes.length} notes · `
          + `${dureeSequence(sequence).toFixed(2)} s`
          + (tempoDivergent > 0
            ? ` · ${tempoDivergent} ${en() ? "voices at another tempo" : "voix à un autre tempo"}`
            : ""),
      };
    },
  },
  {
    id: "extraire-voix",
    nom: "Extraire une voix", nomEn: "Extract Voice",
    univers: "Traitement", famille: "Conversion",
    resume: "Rend une seule voix d'une polyphonie, comme une séquence ordinaire.",
    resumeEn: "Returns a single voice of a polyphony, as an ordinary sequence.",
    notice: "Rend une seule voix de la séquence reçue, sous la forme d'une séquence ordinaire que tout traitement sait recevoir.\n\n« Voix » désigne celle qui est rendue, par son numéro, zéro étant la première. Au-delà de la dernière, le compte reprend à la première.\n\nLa voix extraite redevient une séquence d'une seule voix : ses notes perdent leur numéro, qui n'aurait plus de sens hors de la polyphonie d'où elles viennent. Son écriture mesurée la suit quand elle en porte une, et son nom devient le titre de la séquence.\n\nUne séquence qui ne déclare aucune voix en compte une, et le numéro zéro la rend telle quelle.\n\nLa sortie « Séquence » porte la voix demandée. La sortie « Analyse » liste toutes les voix de l'entrée avec leur nom, leur nombre de notes, leur étendue et leur écriture.\n\nLe message donne le numéro rendu, le nombre de voix disponibles et le nombre de notes.",
    noticeEn: "Returns a single voice of the received sequence, as an ordinary sequence that any treatment can take.\n\n« Voice » designates the one returned, by its number, zero being the first. Beyond the last, the count starts again at the first.\n\nThe extracted voice becomes a single-voice sequence again: its notes lose their number, which would no longer mean anything outside the polyphony they come from. Its written rhythm follows it when it carries one, and its name becomes the sequence title.\n\nA sequence that declares no voice counts as one, and number zero returns it as it stands.\n\nThe « Sequence » output carries the requested voice. The « Analysis » output lists every voice of the input with its name, its note count, its range and its writing.\n\nThe message gives the number returned, how many voices are available and the number of notes.",
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Analyse", nomEn: "Analysis", type: "texte" },
    ],
    parametres: [
      { nom: "Voix", nomEn: "Voice", plage: [0, 15], pas: 1, defaut: 0,
        doc: "La voix rendue, zéro étant la première. Au-delà de la dernière, le compte reprend à la première.",
        docEn: "The voice returned, zero being the first. Beyond the last, the count starts again at the first." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!estSequence(entree) || entree.notes.length === 0) {
        return {
          valeurs: [null, null], erreur: true,
          message: en() ? "No usable sequence." : "Aucune séquence exploitable.",
        };
      }
      const voix = voixDe(entree);
      // LE COMPTE REPREND À LA PREMIÈRE plutôt que de rendre une sortie vide : un réglage laissé sur
      // un numéro qui n'existe plus rendrait un nœud muet dont la cause se chercherait ailleurs.
      const demande = Math.round(ctx.paramNombre("Voix", 0));
      const rang = ((demande % voix.length) + voix.length) % voix.length;
      const seule = extraireVoix(entree, voix[rang].numero);
      if (!seule) {
        return {
          valeurs: [null, tableDesVoix(entree)], erreur: true,
          message: en() ? "Voice not found." : "Voix introuvable.",
        };
      }
      return {
        valeurs: [seule, tableDesVoix(entree)],
        message: `${en() ? "voice" : "voix"} ${voix[rang].numero}/${voix.length - 1}`
          + `${seule.titre ? ` · ${seule.titre}` : ""} · ${seule.notes.length} notes`
          + (seule.arbre ? ` · ${en() ? "written" : "écrite"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
