// plugins/sequence-assemblage.ts — Mettre des séquences bout à bout, ou les superposer.
//
// LES DEUX MÊMES FAÇONS QUE POUR L'AUDIO ET POUR LES CERCLES. « Jointure audio » met deux pistes
// l'une après l'autre, « Mélangeur » les additionne ; le flux séquence n'avait ni l'une ni l'autre.
// Réunir deux séquences demandait « Maquette », qui pose des boîtes à des instants écrits à la main :
// c'est ce qu'il faut pour une forme, et c'est trop pour mettre deux phrases l'une après l'autre.
//
// CE QUE LA JOINTURE AJOUTE À LA MAQUETTE. La maquette demande où commence chaque boîte ; la
// jointure le calcule, chaque séquence partant là où la précédente finit. On n'a donc rien à tenir à
// jour quand une phrase s'allonge.
//
// LE MÉLANGEUR N'EST PAS LA RÉUNION DES VOIX, IL L'EMPLOIE. `audio/voix.ts` sait déjà réunir
// plusieurs séquences en renumérotant leurs voix, ce qui est exactement une superposition. Ce nœud
// n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { dureeSequence, estSequence, type Sequence } from "../audio/sequence";
import { reunirVoix } from "../audio/voix";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";

const en = () => langueCourante() === "en";

/** Combien de séquences une jointure met bout à bout, le même compte qu'une maquette. */
const ENTREES = 8;

/** Une séquence décalée dans le temps, ses notes et sa durée suivant. */
function decaler(s: Sequence, de: number): Sequence {
  if (de === 0) return s;
  return {
    ...s,
    notes: s.notes.map((n) => ({ ...n, debut: n.debut + de, fin: n.fin + de })),
    duree: (s.duree ?? 0) + de,
  };
}

export const fiches: FicheAudio[] = ([
  {
    id: "sequence-jointure",
    nom: "Jointure de séquences", nomEn: "Sequence Join",
    univers: "Traitement", famille: "Montage",
    resume: "Met des séquences bout à bout, chacune commençant là où la précédente finit.",
    resumeEn: "Puts sequences end to end, each starting where the previous one ends.",
    notice: `Met bout à bout les séquences branchées sur ses entrées, dans l'ordre des entrées, et rend la séquence obtenue. Chaque séquence commence là où la précédente finit, sans qu'aucun instant soit à écrire.\n\nLes boutons « + » et « − » sous les entrées allongent ou raccourcissent le composant, jusqu'à ${ENTREES} séquences. Une entrée branchée ne se cache pas.\n\nLa fin d'une séquence est sa durée déclarée, et non l'instant de sa dernière note : une phrase qui se termine par un silence garde ce silence, et la suivante ne remonte pas dedans.\n\n« Silence » ajoute un temps de repos entre deux séquences, en secondes. À zéro, elles se touchent.\n\n« Une voix par séquence » donne à chaque entrée son propre numéro de voix, ce qui grave autant de portées qu'il y a d'entrées et les distingue par leur couleur sur un rouleau. Sans ce réglage, tout se fond en une seule ligne, ce qui convient à des phrases qui se suivent.\n\nLe tempo est celui de la première séquence qui en déclare un. Le message dit combien de séquences ont été jointes, et combien portaient un tempo différent.\n\nLa sortie « Séquence » porte l'assemblage, silence final compris.`,
    noticeEn: `Puts the sequences connected to its inputs end to end, in the order of the inputs, and returns the sequence obtained. Each sequence starts where the previous one ends, with no instant to write.\n\nThe « + » and « - » buttons under the inputs make the node longer or shorter, up to ${ENTREES} sequences. A connected input is never hidden.\n\nThe end of a sequence is its declared length, not the instant of its last note: a phrase ending in silence keeps that silence, and the next one does not move up into it.\n\n« Silence » adds a rest between two sequences, in seconds. At zero they touch.\n\n« One voice per sequence » gives each input its own voice number, which engraves as many staves as there are inputs and tells them apart by colour on a roll. Without this setting, everything merges into a single line, which suits phrases that follow one another.\n\nThe tempo is that of the first sequence declaring one. The message states how many sequences were joined, and how many carried a different tempo.\n\nThe « Sequence » output carries the assembly, trailing silence included.`,
    entrees: Array.from({ length: ENTREES }, (_, k) => ({
      nom: `Séquence ${k + 1}`, nomEn: `Sequence ${k + 1}`, type: "sequence", requis: false,
    })),
    entreesExtensibles: { min: 2, defaut: 2 },
    sorties: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    parametres: [
      { nom: "Silence", nomEn: "Silence", type: "curseur", plage: [0, 30], pas: 0.05, defaut: 0, unite: "s",
        doc: "Le temps de repos ajouté entre deux séquences. À zéro, elles se touchent.",
        docEn: "The rest added between two sequences. At zero they touch." },
      { nom: "Une voix par séquence", nomEn: "One voice per sequence", type: "choix",
        options: ["Non", "Oui"], optionsEn: ["No", "Yes"], optionIds: ["non", "oui"],
        defaut: "Non", defautEn: "No",
        doc: "Donne à chaque entrée son propre numéro de voix, ce qui grave autant de portées qu'il y a d'entrées.",
        docEn: "Gives each input its own voice number, which engraves as many staves as there are inputs." },
    ],
    async executer(ctx: any) {
      const recues: Sequence[] = [];
      for (let i = 0; i < ENTREES; i++) {
        const v = ctx.entree(i);
        if (estSequence(v)) recues.push(v);
      }
      if (recues.length < 2) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Connect at least two sequences." : "Brancher au moins deux séquences.",
        };
      }
      const silence = ctx.paramNombre("Silence", 0);
      const enVoix = ctx.paramTexte("Une voix par séquence", "non") === "oui";

      const posees: { sequence: Sequence; nom?: string }[] = [];
      let curseur = 0;
      let tempo: number | undefined;
      let divergents = 0;
      for (const [i, s] of recues.entries()) {
        if (tempo === undefined) tempo = s.tempo;
        else if (s.tempo !== undefined && s.tempo !== tempo) divergents++;
        posees.push({ sequence: decaler(s, curseur), nom: s.titre ?? `${en() ? "Sequence" : "Séquence"} ${i + 1}` });
        // LA FIN EST LA DURÉE DÉCLARÉE, non l'instant de la dernière note : une phrase qui se
        // termine par un silence le garde, et la suivante ne remonte pas dedans.
        curseur += dureeSequence(s) + silence;
      }
      const totale = Math.max(0, curseur - (silence > 0 ? silence : 0));

      if (enVoix) {
        const { sequence } = reunirVoix(posees);
        return {
          valeurs: [{ ...sequence, tempo, duree: totale }],
          message: `${recues.length} ${en() ? "joined" : "jointes"} · ${sequence.notes.length} notes · `
            + `${totale.toFixed(2)} s${divergents > 0 ? ` · ${divergents} ${en() ? "other tempos" : "autres tempos"}` : ""}`,
        };
      }
      // Sans voix par entrée, les notes se fondent en une ligne : les numéros de voix qu'elles
      // portaient sont retirés, faute de quoi deux séquences d'une voix chacune se retrouveraient
      // toutes deux en voix zéro et se graveraient sur la même portée sans l'avoir demandé.
      const notes = posees.flatMap((p) => p.sequence.notes.map(({ voix: _voix, ...n }) => n))
        .sort((a, b) => a.debut - b.debut || a.note - b.note);
      return {
        valeurs: [{ notes, tempo, duree: totale }],
        message: `${recues.length} ${en() ? "joined" : "jointes"} · ${notes.length} notes · `
          + `${totale.toFixed(2)} s${divergents > 0 ? ` · ${divergents} ${en() ? "other tempos" : "autres tempos"}` : ""}`,
      };
    },
  },
  {
    id: "sequence-melangeur",
    nom: "Mélangeur de séquences", nomEn: "Sequence Mixer",
    univers: "Traitement", famille: "Montage",
    resume: "Superpose plusieurs séquences en une seule, chacune devenant une voix.",
    resumeEn: "Superimposes several sequences into one, each becoming a voice.",
    notice: `Superpose les séquences reçues en une seule, toutes commençant à zéro, et rend la séquence obtenue. Le port accepte autant de câbles qu'on y tire.\n\nChaque entrée devient une voix, et les voix qu'elle portait déjà se suivent à l'intérieur de la sienne. Les numéros sont refaits : deux séquences arrivant chacune avec ses propres numéros les verraient sinon se confondre, et se graver sur la même portée.\n\nLa durée est celle de la plus longue, silence final compris. Le tempo est celui de la première qui en déclare un ; le message dit combien en portaient un autre, deux tempos ne se gravant pas sur une même partition.\n\nLa sortie « Séquence » porte la superposition.`,
    noticeEn: `Superimposes the received sequences into one, all starting at zero, and returns the sequence obtained. The port accepts as many cables as are drawn into it.\n\nEach input becomes a voice, and the voices it already carried follow one another inside its own. The numbers are remade: two sequences each arriving with their own numbers would otherwise merge, and engrave on the same stave.\n\nThe length is that of the longest, trailing silence included. The tempo is that of the first declaring one; the message states how many carried another, two tempos not engraving on one score.\n\nThe « Sequence » output carries the superimposition.`,
    entrees: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence", dynamique: true }],
    sorties: [{ nom: "Séquence", nomEn: "Sequence", type: "sequence" }],
    parametres: [],
    async executer(ctx: any) {
      const recues = ctx.entrees().filter(estSequence) as Sequence[];
      if (recues.length < 2) {
        return {
          valeurs: [null], erreur: true,
          message: en() ? "Connect at least two sequences." : "Brancher au moins deux séquences.",
        };
      }
      const { sequence, tempoDivergent } = reunirVoix(recues.map((s) => ({ sequence: s, nom: s.titre })));
      const duree = Math.max(...recues.map(dureeSequence));
      return {
        valeurs: [{ ...sequence, duree }],
        message: `${recues.length} ${en() ? "voices" : "voix"} · ${sequence.notes.length} notes · `
          + `${duree.toFixed(2)} s`
          + (tempoDivergent > 0 ? ` · ${tempoDivergent} ${en() ? "other tempos" : "autres tempos"}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
