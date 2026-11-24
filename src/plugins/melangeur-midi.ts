// plugins/melangeur-midi.ts — Plusieurs MIDI en un seul, une piste par entrée.
//
// LES ENTRÉES SONT NUMÉROTÉES, et c'est la leçon de la Maquette : l'ordre d'un port qui prend
// plusieurs câbles est celui dans lequel on les a tirés, qui ne se voit nulle part. Des réglages par
// entrée demandent que l'entrée 3 reste l'entrée 3 quoi qu'on branche ensuite.
//
// LES QUATRE RÉGLAGES PAR ENTRÉE, le plafond de huit entrées, deux montrées au départ, et le canal
// « Automatique » par défaut sont les choix de Fabien du 2026-11-23. Le calcul est dans
// `audio/melange-midi.ts`, qui dit pourquoi le temps se compte en secondes et pourquoi le canal change.
import { fiche, reglagePartage } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { lireMidi } from "../audio/midi";
import { melangerMidis, RefusMelange, type CanalDemande, type EntreeMelange } from "../audio/melange-midi";

const en = () => langueCourante() === "en";

/** Le nombre d'entrées déclarées ; l'interface n'en montre que deux au départ. */
const ENTREES = 8;

/** Les numéros des entrées, un littéral chacun, pour que les noms qu'on en tire se vérifient. */
const NUMEROS = [1, 2, 3, 4, 5, 6, 7, 8] as const satisfies { length: typeof ENTREES };

const SEIZE = Array.from({ length: 16 }, (_, k) => String(k + 1));

/** Le choix lu, en canal du fichier : de 0 à 15, ou l'une des deux règles. */
function canalDemande(valeur: string): CanalDemande {
  if (valeur === "garder") return "garder";
  const n = Number(valeur);
  return Number.isInteger(n) && n >= 1 && n <= 16 ? n - 1 : "auto";
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "melangeur-midi", nom: "Mélangeur MIDI", nomEn: "MIDI Mixer",
    univers: "Traitement", famille: "Montage",
    resume: "Réunit plusieurs fichiers MIDI en un seul, une piste par entrée, chacune avec sa vélocité, son canal et sa transposition.",
    resumeEn: "Joins several MIDI files into one, one track per input, each with its own velocity, channel and transposition.",
    notice: "Réunit plusieurs fichiers MIDI en un seul, une piste par entrée, chacune avec sa vélocité, son canal et sa transposition.\n\nLe composant montre deux entrées au départ ; les boutons « + » et « − », sous ses entrées, l'allongent ou le raccourcissent, jusqu'à huit. Les entrées sont numérotées : l'entrée 3 reste l'entrée 3 quel que soit l'ordre dans lequel les câbles ont été tirés. Chaque entrée a quatre réglages, qui n'apparaissent que pour les entrées branchées.\n\n« Vélocité » multiplie la vélocité de chaque note de l'entrée, en pour cent. Le résultat est borné de 1 à 127 : une note ne devient jamais muette, et aucune ne dépasse le maximum du format.\n\n« Canal » choisit le canal MIDI de l'entrée :\n• « Automatique » place l'entrée sur le canal de son numéro quand toutes ses notes tiennent sur un seul canal. Une entrée jouée sur le canal 10, que le General MIDI réserve aux percussions, y reste. Une entrée dont les notes occupent plusieurs canaux les garde.\n• « Garder » laisse chaque événement sur son canal d'origine.\n• Un numéro de 1 à 16 place toutes les notes de l'entrée sur ce canal.\nUn canal ne porte qu'un instrument pour tout le fichier, et deux notes de même hauteur sur un même canal se referment l'une l'autre : deux entrées laissées sur un même canal sonnent avec un seul instrument. Quand une entrée change de canal, les événements de ses canaux qui ne portent aucune de ses notes sont retirés.\n\n« Transposition » déplace les hauteurs de l'entrée, en demi-tons. Les notes du canal 10 ne sont pas transposées : leur numéro y désigne un instrument de percussion et non une hauteur. Une note qui sortirait de l'étendue MIDI, de 0 à 127, est retirée, et le message en donne le nombre.\n\n« Muet » retire l'entrée du mélange.\n\nLes entrées sont alignées en secondes : chacune garde ses instants tels que son propre tempo les donne. Le fichier rendu porte le tempo, la résolution, la mesure et la tonalité de la première entrée mélangée qui a des notes. Les instants des entrées d'un autre tempo ou d'une autre résolution y sont convertis, chacun arrondi au tick le plus proche ; ceux des entrées de même tempo et de même résolution sont gardés tels quels.\n\nLa sortie « MIDI » porte le fichier, une piste par entrée mélangée, dans l'ordre de leurs numéros. Une entrée muette ou sans note n'a pas de piste.\n\nLe message donne le nombre de pistes, le nombre de notes, la durée et le tempo écrit, puis, pour chaque entrée branchée, ses canaux dans le fichier et son nombre de notes, ou « muette ».",
    noticeEn: "Joins several MIDI files into one, one track per input, each with its own velocity, channel and transposition.\n\nThe node shows two inputs to begin with; the « + » and « - » buttons under its inputs make it longer or shorter, up to eight. Inputs are numbered: input 3 stays input 3 whatever order the cables were drawn in. Each input has four settings, which only appear for connected inputs.\n\n« Velocity » multiplies the velocity of each note of the input, in percent. The result is bounded from 1 to 127: a note never becomes silent, and none exceeds the format's maximum.\n\n« Channel » selects the input's MIDI channel:\n• « Automatic » puts the input on the channel of its number when all its notes fit on one channel. An input played on channel 10, which General MIDI reserves for percussion, stays there. An input whose notes occupy several channels keeps them.\n• « Keep » leaves every event on its original channel.\n• A number from 1 to 16 puts all the input's notes on that channel.\nA channel carries one instrument for the whole file, and two notes of the same pitch on one channel close each other: two inputs left on one channel sound with a single instrument. When an input changes channel, the events of its channels that carry none of its notes are removed.\n\n« Transpose » moves the input's pitches, in semitones. Notes on channel 10 are not transposed: their number there names a percussion instrument and not a pitch. A note that would leave the MIDI range, 0 to 127, is removed, and the message gives their number.\n\n« Mute » takes the input out of the mix.\n\nInputs are aligned in seconds: each keeps its instants as its own tempo gives them. The rendered file carries the tempo, resolution, time signature and key of the first mixed input that has notes. The instants of inputs of another tempo or resolution are converted to it, each rounded to the nearest tick; those of inputs of the same tempo and resolution are kept as they are.\n\nThe « MIDI » output carries the file, one track per mixed input, in the order of their numbers. A muted input or one without notes has no track.\n\nThe message gives the number of tracks, the number of notes, the length and the written tempo, then, for each connected input, its channels in the file and its number of notes, or « muted ».",
    entrees: NUMEROS.map((n) => ({ nom: `MIDI ${n}`, nomEn: `MIDI ${n}`, type: "midi", requis: false })),
    entreesExtensibles: { min: 2, defaut: 2 },
    sorties: [{ nom: "MIDI", nomEn: "MIDI", type: "midi" }],
    parametres: NUMEROS.flatMap((n, k) => [
      reglagePartage({ nom: `Vélocité ${n}`, nomEn: `Velocity ${n}`, type: "curseur", plage: [1, 200], pas: 1, defaut: 100, unite: "%", port: k,
        doc: `Facteur appliqué à la vélocité de chaque note de l'entrée ${n}. Le résultat est borné de 1 à 127.`,
        docEn: `Factor applied to the velocity of each note of input ${n}. The result is bounded from 1 to 127.` }),
      reglagePartage({ nom: `Canal ${n}`, nomEn: `Channel ${n}`, type: "choix", port: k,
        options: ["Automatique", "Garder", ...SEIZE], optionsEn: ["Automatic", "Keep", ...SEIZE],
        optionIds: ["auto", "garder", ...SEIZE], defaut: "Automatique", defautEn: "Automatic",
        doc: `Canal MIDI de l'entrée ${n}. Automatique : le canal ${n} quand ses notes tiennent sur un seul canal, le canal 10 de la batterie gardé, plusieurs canaux gardés. Garder : les canaux d'origine. Un numéro : toutes ses notes sur ce canal.`,
        docEn: `MIDI channel of input ${n}. Automatic: channel ${n} when its notes fit on one channel, the drums' channel 10 kept, several channels kept. Keep: the original channels. A number: all its notes on that channel.` }),
      reglagePartage({ nom: `Transposition ${n}`, nomEn: `Transpose ${n}`, type: "curseur", plage: [-24, 24], pas: 1, defaut: 0, unite: " ½-ton", uniteEn: "st", port: k,
        doc: `Déplacement des hauteurs de l'entrée ${n}, en demi-tons. Une note du canal 10, que l'entrée y soit jouée ou que « Canal ${n} » l'y place, n'est pas transposée ; une note qui sortirait de 0 à 127 est retirée.`,
        docEn: `Shift of input ${n}'s pitches, in semitones. A note on channel 10, whether the input is played there or « Channel ${n} » puts it there, is not transposed; a note that would leave 0 to 127 is removed.` }),
      reglagePartage({ nom: `Muet ${n}`, nomEn: `Mute ${n}`, type: "case", plage: [0, 1], pas: 1, defaut: 0, port: k,
        doc: `Retire l'entrée ${n} du mélange.`,
        docEn: `Takes input ${n} out of the mix.` }),
    ]),
    async executer(ctx) {
      const entrees: EntreeMelange[] = [];
      const muettes: number[] = [];
      for (const [k, n] of NUMEROS.entries()) {
        const recu = ctx.entree(k);
        if (!(recu instanceof File)) continue;
        if (ctx.paramNombre(`Muet ${n}`, 0) !== 0) { muettes.push(k); continue; }
        entrees.push({
          rang: k,
          octets: new Uint8Array(await recu.arrayBuffer()),
          velocite: ctx.paramNombre(`Vélocité ${n}`, 100) / 100,
          transposition: Math.round(ctx.paramNombre(`Transposition ${n}`, 0)),
          canal: canalDemande(ctx.paramTexte(`Canal ${n}`, "auto")),
        });
      }
      if (entrees.length === 0) {
        return {
          valeurs: [null], erreur: true,
          message: muettes.length
            ? (en() ? "Every connected input is muted." : "Toutes les entrées branchées sont muettes.")
            : (en() ? "Connect a MIDI file to an input." : "Branchez un fichier MIDI sur une entrée."),
        };
      }
      let melange;
      try {
        melange = melangerMidis(entrees);
      } catch (e) {
        if (!(e instanceof RefusMelange)) throw e;
        const quoi = e.raison === "illisible"
          ? (en() ? `MIDI ${e.rang! + 1} cannot be read.` : `MIDI ${e.rang! + 1} ne se lit pas.`)
          : e.raison === "smpte"
            ? (en() ? `MIDI ${e.rang! + 1} counts its time in SMPTE frames, which is not read.` : `MIDI ${e.rang! + 1} compte son temps en images SMPTE, qui ne se lisent pas.`)
            : (en() ? "No note is left to mix." : "Aucune note ne reste à mélanger.");
        return { valeurs: [null], erreur: true, message: quoi };
      }
      const fichier = new File([melange.octets as BlobPart], "melange.mid", { type: "audio/midi" });
      const { notes, dureeTotale } = await lireMidi(fichier);

      // LE MESSAGE DIT OÙ EST PASSÉE CHAQUE ENTRÉE, son canal et ses notes : c'est ce qui distingue
      // d'un coup d'œil deux entrées fondues sur un canal de deux entrées séparées, qui sonnent
      // pareil tant qu'un instrument n'a pas été choisi.
      const etiquettes = new Map<number, string>();
      for (const b of melange.bilans) {
        const canaux = b.canaux.length ? `c${b.canaux.map((c) => c + 1).join("+")}` : "—";
        const hors = b.horsClavier ? ` −${b.horsClavier} ${en() ? "out of range" : "hors étendue"}` : "";
        etiquettes.set(b.rang, `${b.rang + 1}:${canaux}·${b.notes}${hors}`);
      }
      for (const k of muettes) etiquettes.set(k, `${k + 1}:${en() ? "muted" : "muette"}`);
      const pistes = melange.bilans.filter((b) => b.piste !== null).length;
      const bpm = Number(melange.tempo.toFixed(1));
      const tete = `${pistes} ${en() ? (pistes > 1 ? "tracks" : "track") : (pistes > 1 ? "pistes" : "piste")} · `
        + `${notes.length} ${notes.length > 1 ? "notes" : "note"} · ${dureeTotale.toFixed(2)} s · ${bpm} BPM`;
      return {
        valeurs: [fichier],
        message: `${tete} · ${[...etiquettes.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t).join(" ")}`,
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
