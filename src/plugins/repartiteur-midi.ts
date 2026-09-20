// plugins/repartiteur-midi.ts — Un arrangement, quatre instruments.
//
// CE QUI MANQUAIT. « Sampler multi-zones » joue un MIDI avec UNE banque. Un arrangement complet, lui,
// tient dans un seul fichier à plusieurs canaux — mélodie, accords, basse, batterie —, et le jouer
// tel quel envoyait les quatre parties dans la même banque : un piano qui joue aussi la grosse
// caisse, deux octaves trop haut. Ce nœud coupe le fichier en parties, une par instrument.
//
// POURQUOI IL COMPTE PLUS QU'IL N'Y PARAÎT : les quatre parties SORTENT DU MÊME FICHIER, elles
// portent donc le même tempo et la même origine des temps. Quatre séquenceurs séparés se décalent
// dès que l'un change de tempo ; ici, rien à synchroniser.
//
// La logique est dans `audio/repartition-midi.ts`, testée — inventaire, règle de répartition,
// découpage par canaux ou par pistes, et la garantie qui compte : la somme des notes des parties
// égale celle du fichier d'origine.
import { parseMidi } from "midi-file";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { filtrerCanauxMidi } from "../audio/midi";
import {
  CANAL_BATTERIE_HUMAIN, analyserListeCanaux, compterNotes, filtrerPistesMidi, inventaireMidi,
  listeCanauxHumaine, repartirCanaux,
} from "../audio/repartition-midi";

/** Les quatre sorties nommées, plus le reste : cinq au total. */
const NB_PARTIES = 4;

/** Une liste de numéros de pistes écrite à la main : mêmes règles que les canaux, sans la borne 16. */
function analyserListePistes(texte: string): number[] {
  const vus = new Set<number>();
  for (const morceau of String(texte ?? "").split(/[,;\s]+/)) {
    if (!morceau) continue;
    const plage = /^(\d+)\s*[-–]\s*(\d+)$/.exec(morceau);
    if (plage) {
      const a = Number(plage[1]), b = Number(plage[2]);
      for (let p = Math.min(a, b); p <= Math.max(a, b); p++) if (p >= 1) vus.add(p);
      continue;
    }
    const n = Number(morceau);
    if (Number.isInteger(n) && n >= 1) vus.add(n);
  }
  return [...vus].sort((a, b) => a - b);
}

export const fiches: FicheAudio[] = ([
  {
    id: "repartiteur-midi", nom: "Répartiteur MIDI", nomEn: "MIDI Splitter",
    univers: "Traitement", famille: "Montage",
    resume: "Coupe un fichier MIDI en parties — une par instrument — pour les jouer avec quatre banques différentes.",
    resumeEn: "Splits a MIDI file into parts — one per instrument — to play them with four different banks.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [
      { nom: "Partie 1", nomEn: "Part 1", type: "midi" },
      { nom: "Partie 2", nomEn: "Part 2", type: "midi" },
      { nom: "Partie 3", nomEn: "Part 3", type: "midi" },
      { nom: "Batterie", nomEn: "Drums", type: "midi" },
      { nom: "Reste", nomEn: "Rest", type: "midi" },
    ],
    parametres: [
      { nom: "Répartition", nomEn: "Split by", type: "choix",
        options: ["Automatique", "Par canaux", "Par pistes"],
        optionsEn: ["Automatic", "By channels", "By tracks"],
        optionIds: ["auto", "canaux", "pistes"], defaut: "Automatique", defautEn: "Automatic",
        doc: "Automatique : le nœud regarde ce que le fichier contient et répartit seul — le canal 10, que le General MIDI réserve aux percussions, part toujours sur la sortie Batterie, et les autres canaux remplissent les parties dans l'ordre de leur numéro. Par canaux : vous écrivez les canaux de chaque partie ci-dessous. Par pistes : les mêmes cases désignent alors des numéros de pistes, ce qu'il faut pour les fichiers dont les voix partagent un canal — un logiciel de notation écrit souvent les quatre voix d'un chœur sur le canal 1, séparées par pistes.",
        docEn: "Automatic: the node looks at what the file holds and splits on its own — channel 10, which General MIDI reserves for percussion, always goes to the Drums output, and the other channels fill the parts in channel order. By channels: you write each part's channels below. By tracks: the same boxes then mean track numbers, which is what files whose voices share a channel need — a notation program often writes a choir's four voices on channel 1, separated by tracks." },
      { nom: "Partie 1", nomEn: "Part 1", type: "texte", defaut: "1",
        doc: "Canaux (ou pistes) de la première partie : « 1 », « 1,2 », « 1-3 ». Les canaux se comptent de 1 à 16, comme sur un appareil. Ignoré en mode automatique.",
        docEn: "Channels (or tracks) of the first part: « 1 », « 1,2 », « 1-3 ». Channels count from 1 to 16, as on a device. Ignored in automatic mode." },
      { nom: "Partie 2", nomEn: "Part 2", type: "texte", defaut: "2",
        doc: "Canaux (ou pistes) de la deuxième partie.", docEn: "Channels (or tracks) of the second part." },
      { nom: "Partie 3", nomEn: "Part 3", type: "texte", defaut: "3",
        doc: "Canaux (ou pistes) de la troisième partie.", docEn: "Channels (or tracks) of the third part." },
      { nom: "Batterie", nomEn: "Drums", type: "texte", defaut: "10",
        doc: "Canaux (ou pistes) de la batterie. 10 par défaut, la convention du General MIDI. Cette sortie demande une banque d'un autre genre — un kit, où une touche est un son et non une hauteur — et c'est pourquoi elle est nommée.",
        docEn: "Channels (or tracks) of the drums. 10 by default, the General MIDI convention. This output needs a different kind of bank — a kit, where a key is a sound and not a pitch — hence its name." },
    ],
    async executer(ctx: any) {
      const fichier = ctx.entree(0);
      if (!(fichier instanceof File)) {
        return { valeurs: [null, null, null, null, null], message: traduire("msg.branchez_un_source_midi") };
      }
      const bytes = new Uint8Array(await fichier.arrayBuffer());
      const inv = inventaireMidi(parseMidi(bytes));
      if (inv.notesTotal === 0) {
        return { valeurs: [null, null, null, null, null], message: traduire("msg.aucune_note_dans_le_midi") };
      }
      const mode = ctx.paramTexte("Répartition", "auto");
      const noms = ["Partie 1", "Partie 2", "Partie 3", "Batterie"];
      const base = (fichier.name || "midi").replace(/\.midi?$/i, "");

      /** Découpe une partie et la rend en fichier, ou null si elle ne contient rien. */
      const decouper = (numeros: number[], suffixe: string, parPiste: boolean): File | null => {
        if (numeros.length === 0) return null;
        const octets = parPiste ? filtrerPistesMidi(bytes, numeros) : filtrerCanauxMidi(bytes, numeros);
        // Une partie sans une seule note ne sort pas : un fichier vide ferait échouer le sampler en
        // aval sur « aucune note », sans dire que c'est la répartition qui est en cause.
        if (compterNotes(octets) === 0) return null;
        return new File([octets as BlobPart], `${base}-${suffixe}.mid`, { type: "audio/midi" });
      };

      let listes: number[][];
      let reste: number[];
      const parPiste = mode === "pistes";
      if (mode === "auto") {
        const r = repartirCanaux(inv, NB_PARTIES);
        listes = r.parties;
        reste = r.reste;
      } else if (parPiste) {
        listes = noms.map((n) => analyserListePistes(ctx.paramTexte(n, "")));
        const assignees = new Set(listes.flat());
        reste = inv.pistes.map((p) => p.numero).filter((p) => !assignees.has(p));
      } else {
        listes = noms.map((n) => analyserListeCanaux(ctx.paramTexte(n, "")));
        const assignees = new Set(listes.flat());
        reste = [...inv.parCanal.keys()].filter((c) => !assignees.has(c)).sort((a, b) => a - b);
      }

      const sorties = listes.map((l, i) => decouper(l, `p${i + 1}`, parPiste));
      const fichierReste = decouper(reste, "reste", parPiste);

      // Le message dit OÙ EST PASSÉ QUOI, avec le compte de notes : c'est la seule façon de voir
      // d'un coup d'œil qu'une partie est vide parce qu'elle n'a rien reçu, et non parce que le
      // sampler qui la joue est mal réglé.
      const etiquette = (i: number): string => {
        const l = listes[i];
        if (l.length === 0) return `${i + 1}:—`;
        const notes = sorties[i] ? compterNotes(parPiste ? filtrerPistesMidi(bytes, l) : filtrerCanauxMidi(bytes, l)) : 0;
        const quoi = parPiste ? `p${l.join("+")}` : `c${listeCanauxHumaine(l).replace(/, /g, "+")}`;
        return `${i + 1}:${quoi}·${notes}`;
      };
      const morceaux = [0, 1, 2].map(etiquette);
      morceaux.push(`bat:${listes[3].length ? etiquette(3).split(":")[1] : "—"}`);
      if (reste.length) morceaux.push(traduire("msg.midi.reste", parPiste ? reste.join("+") : listeCanauxHumaine(reste)));

      return {
        valeurs: [...sorties, fichierReste],
        message: `${traduire("msg.midi.reparti", String(inv.notesTotal), String(inv.parCanal.size), String(inv.pistes.length))} · ${morceaux.join(" ")}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

export { analyserListePistes, CANAL_BATTERIE_HUMAIN };
