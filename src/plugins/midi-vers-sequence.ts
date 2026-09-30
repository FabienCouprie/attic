// plugins/midi-vers-sequence.ts — La porte d'entrée du flux de notes.
//
// POURQUOI CE NŒUD EXISTE. Le flux « séquence » avait une sortie et une source : on pouvait en
// produire une par le calcul spectral, et la faire entendre. Rien ne permettait d'en fabriquer une
// à partir de ce que le reste du catalogue produit, c'est-à-dire des fichiers MIDI. Le flux restait
// une impasse à l'envers.
//
// CE QU'IL NE PRÉTEND PAS RENDRE. Un fichier MIDI ne porte pas de cents : les hauteurs qui entrent
// ici sont entières, et le resteront tant qu'un traitement ne les aura pas déplacées. Ce nœud
// n'invente donc aucune finesse ; il ouvre le chemin par lequel « Tempérament », l'harmonie
// spectrale ou l'intonation juste peuvent en ajouter, et la gravure les conserver.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { lireMidiEnSequence } from "../audio/midi-lecture-sequence";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "midi-vers-sequence",
    nom: "MIDI → séquence", nomEn: "MIDI → Sequence",
    univers: "Traitement", famille: "Conversion",
    resume: "Lit les notes d'un fichier MIDI et les rend sur le flux de séquence.",
    resumeEn: "Reads the notes of a MIDI file and returns them on the sequence flow.",
    notice: "Lit les notes d'un fichier MIDI et les rend sur une sortie « Séquence ».\n\nUne séquence porte les notes elles-mêmes, et non un fichier. Sa hauteur peut ne pas tomber sur un demi-ton, ce qu'un numéro de note MIDI ne sait pas faire, son numéro tenant sur un octet. Les hauteurs lues ici sont donc entières ; elles le restent jusqu'à ce qu'un traitement les déplace, et c'est alors que la séquence garde ce que le fichier aurait perdu.\n\n« Canal » choisit ce qui est lu. À moins un, tous les canaux sont pris ensemble. Un numéro de zéro à quinze ne garde que les notes de ce canal.\n\n« Tempo » est inscrit dans la séquence, où il sert à la gravure : les temps d'une séquence sont en secondes, et une valeur de note ne s'en déduit qu'avec un tempo. Le tempo lu dans le fichier a la priorité quand il y en a un.\n\nLa sortie « Séquence » rend les notes, avec leur hauteur, leur nuance, leur début et leur fin en secondes. La sortie « MIDI » rend le fichier reçu tel quel, pour continuer une chaîne existante sans l'interrompre.\n\nLe message donne le nombre de notes, la durée, le nombre de canaux rencontrés et le tempo retenu.",
    noticeEn: "Reads the notes of a MIDI file and returns them on a « Sequence » output.\n\nA sequence carries the notes themselves rather than a file. Its pitch need not fall on a semitone, which a MIDI note number cannot do, its number fitting in one byte. The pitches read here are therefore whole; they stay so until a treatment moves them, and that is when the sequence keeps what the file would have lost.\n\n« Channel » selects what is read. At minus one, every channel is taken together. A number from zero to fifteen keeps only the notes of that channel.\n\n« Tempo » is written into the sequence, where it serves engraving: the times of a sequence are in seconds, and a note value follows from them only with a tempo. The tempo read in the file takes priority when there is one.\n\nThe « Sequence » output returns the notes, with their pitch, velocity, start and end in seconds. The « MIDI » output returns the file received as it is, to continue an existing chain without interrupting it.\n\nThe message gives the number of notes, the duration, the number of channels met and the tempo kept.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
    ],
    parametres: [
      { nom: "Canal", nomEn: "Channel", plage: [-1, 15], pas: 1, defaut: -1,
        doc: "Le canal MIDI retenu. À moins un, tous les canaux sont pris ensemble.",
        docEn: "The MIDI channel kept. At minus one, every channel is taken together." },
      { nom: "Tempo", nomEn: "Tempo", plage: [20, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Le tempo inscrit dans la séquence, employé pour la gravure. Celui du fichier a la priorité.",
        docEn: "The tempo written into the sequence, used for engraving. The one in the file takes priority." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null, null], message: traduire("msg.aucun_fichier_midi_en_entr_e") };
      }
      // LA LECTURE EST DANS `audio/midi-sequence.ts`, et elle y est SEULE : le composant qui joue
      // sur une banque a lui aussi une entrée MIDI, et deux lectures du même format pourraient
      // diverger.
      const canal = Math.round(ctx.paramNombre("Canal", -1));
      const lu = await lireMidiEnSequence(fichier, canal, ctx.paramNombre("Tempo", 120));
      if (!lu.sequence) {
        return {
          valeurs: [null, fichier], erreur: true,
          message: canal < 0
            ? traduire("msg.aucune_note")
            : (en() ? `No note on channel ${canal}.` : `Aucune note sur le canal ${canal}.`),
        };
      }
      return {
        valeurs: [lu.sequence, fichier],
        message: `${lu.sequence.notes.length} notes · ${lu.duree.toFixed(2)} s · `
          + `${lu.canaux} ${en() ? "channels" : "canaux"} · ${lu.tempo} BPM`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
