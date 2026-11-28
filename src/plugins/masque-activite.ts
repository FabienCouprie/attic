// plugins/masque-activite.ts — La fiche de « Masque d'activité » : une voix de la matrice d'activité
// de SoundHelix posée sur n'importe quel fichier MIDI.
//
// DÉCISION D5 DE FABIEN, 2026-11-28 : les voix du chantier lisent la matrice elles-mêmes, et ce nœud
// la prête au reste du catalogue. Le calcul est dans `audio/soundhelix-masque.ts` ; la matrice se lit
// par `audio/soundhelix-activite.ts`, la même lecture que celle des voix.
//
// L'HARMONIE EST UNE ENTRÉE, choix pris dans le lot sur la consigne de Fabien d'avancer seul : la
// matrice est un texte sans indication de temps, une colonne par section d'accords, et ce sont les
// sections de l'harmonie, à son tempo, qui la posent dans le temps.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { FauteActivite, lireActivite, segmentsDeVoix } from "../audio/soundhelix-activite";
import { lireHarmonie } from "../audio/soundhelix-midi";
import { masquerMidi, segmentsEnSecondes } from "../audio/soundhelix-masque";
import { temposDuFichier } from "../audio/midi-lecture-sequence";

const NOTICE = "Garde les notes d'un fichier MIDI qui partent pendant qu'une voix de la matrice d'activité joue. Le modèle est celui du découpage par l'activité du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\nL'entrée « Activité » porte la matrice : une ligne par voix, son nom, puis un signe par section d'accords, x quand la voix joue, . quand elle se tait. debut= et fin=, facultatifs, déplacent en tics chaque entrée et chaque sortie de la voix, négatifs pour avancer, positifs pour retarder, sans sortir du morceau. Une ligne qui commence par # est un commentaire. La matrice compte autant de sections que l'harmonie reçue sur l'entrée « Harmonie », dont les marqueurs de section, la grille et le tempo posent les signes dans le temps.\n\n« Voix » désigne la ligne lue. Une note est gardée quand la voix joue à l'instant où elle part, retirée sinon. « Couper aux bords » arrête une note gardée qui dure au-delà de l'activité à l'instant où la voix se tait ; décoché, elle garde sa durée.\n\nLe fichier reçu sur l'entrée « MIDI » garde ses pistes, ses canaux, ses programmes, sa résolution et ses tempos ; seules ses notes changent. Les instants se comptent en secondes, si bien qu'un fichier écrit à une autre résolution ou à un autre tempo que l'harmonie se masque aussi.\n\nLa sortie « MIDI » porte le fichier masqué.\n\nLe message donne le nombre de notes gardées, retirées et coupées, et la voix lue.";

const NOTICE_EN = "Keeps the notes of a MIDI file that start while a voice of the activity matrix plays. The model is that of the activity slicing of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\nThe « Activity » input carries the matrix: one line per voice, its name, then one sign per chord section, x when the voice plays, . when it is silent. debut= and fin=, optional, move each entry and each exit of the voice in ticks, negative to bring it forward, positive to delay it, without leaving the piece. A line starting with # is a comment. The matrix has as many sections as the harmony received on the « Harmony » input, whose section markers, grid and tempo place the signs in time.\n\n« Voice » names the line read. A note is kept when the voice plays at the instant it starts, removed otherwise. « Cut at the edges » stops a kept note that lasts beyond the activity at the instant the voice falls silent; unchecked, it keeps its length.\n\nThe file received on the « MIDI » input keeps its tracks, channels, programs, resolution and tempos; only its notes change. Instants are counted in seconds, so a file written at another resolution or tempo than the harmony is masked as well.\n\nThe « MIDI » output carries the masked file.\n\nThe message gives the number of notes kept, removed and cut, and the voice read.";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "masque-activite", nom: "Masque d'activité", nomEn: "Activity Mask",
    univers: "Entrées", famille: "Génération",
    resume: "Garde les notes d'un fichier MIDI qui partent pendant qu'une voix de la matrice d'activité joue.",
    resumeEn: "Keeps the notes of a MIDI file that start while a voice of the activity matrix plays.",
    notice: NOTICE, noticeEn: NOTICE_EN,
    entrees: [
      { nom: "MIDI", type: "midi" },
      { nom: "Harmonie", nomEn: "Harmony", type: "midi" },
      { nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite" },
    ],
    sorties: [{ nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Voix", nomEn: "Voice", type: "texte", defaut: "v1", defautEn: "v1",
        doc: "Le nom de la ligne de la matrice d'activité qui gouverne le fichier.",
        docEn: "The name of the activity matrix line that governs the file." },
      { nom: "Couper aux bords", nomEn: "Cut at the edges", type: "case", defaut: 0,
        doc: "Coché, une note gardée qui dure au-delà de l'activité s'arrête à l'instant où la voix se tait. Décoché, elle garde sa durée.",
        docEn: "Checked, a kept note that lasts beyond the activity stops at the instant the voice falls silent. Unchecked, it keeps its length." },
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const fichier = ctx.entree(0);
      const harmonie = ctx.entree(1);
      const activite = ctx.entree(2);
      if (!(fichier instanceof File) || !(harmonie instanceof File) || typeof activite !== "string") {
        return { valeurs: [null], erreur: true,
          message: en ? "a MIDI file, a harmony and a matrix are needed" : "il faut un fichier MIDI, une harmonie et une matrice" };
      }
      try {
        const h = lireHarmonie(new Uint8Array(await harmonie.arrayBuffer()));
        const nomVoix = ctx.paramTexte("Voix", "v1").trim();
        const v = lireActivite(activite).find((x) => x.nom === nomVoix);
        if (!v) {
          return { valeurs: [null], erreur: true,
            message: en ? `the matrix has no voice « ${nomVoix} »` : `la matrice n'a pas de voix « ${nomVoix} »` };
        }
        const segments = segmentsEnSecondes(segmentsDeVoix(v, h.sections, h.tics), h.ticsParTemps, h.tempo);
        const r = masquerMidi(new Uint8Array(await fichier.arrayBuffer()), await temposDuFichier(fichier), segments,
          ctx.paramNombre("Couper aux bords", 0) >= 0.5);
        const message = en
          ? `${r.gardees} notes kept, ${r.retirees} removed${r.coupees ? `, ${r.coupees} cut` : ""} · voice « ${nomVoix} »`
          : `${r.gardees} notes gardées, ${r.retirees} retirées${r.coupees ? `, ${r.coupees} coupées` : ""} · voix « ${nomVoix} »`;
        return { valeurs: [new File([r.octets], fichier.name, { type: "audio/midi" })], message };
      } catch (e) {
        if (e instanceof FauteActivite) return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
        throw e;
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
