// plugins/dater-les-mots.ts — Ce qui est dit, et quand chaque mot est dit.
//
// CE QU'IL APPORTE QUE LES AUTRES N'APPORTENT PAS. Le dépôt savait reconnaître de la parole —
// Vosk, Sherpa, Whisper — et savait DATER des mots qu'on lui donne, par « Aligner un texte sur la
// parole ». Il ne savait pas dater des mots qu'il découvre. C'est ce que fait celui-ci : on lui
// donne un son, il rend le texte ET l'instant de chaque mot, sans qu'on écrive rien.
//
// IL SE BRANCHE SUR SON VOISIN, et c'est pour cela que celui-ci ne découpe pas. Sa sortie
// « Transcription » va sur l'entrée « Texte » d'« Aligner un texte sur la parole », qui sait
// découper une suite de mots. Deux composants qui se composent valent mieux qu'un seul qui refait
// le travail de l'autre.
//
// MESURÉ CONTRE UN SECOND MOTEUR, ce qui vaut mieux qu'un seuil que j'aurais choisi. Sur un témoin
// dont j'avais écrit le texte, ses quinze mots et ceux de l'aligneur Qwen3 s'accordent quinze sur
// quinze, dans le même ordre, avec un écart de début moyen de 0,075 s — et TOUS les écarts sont des
// multiples de 0,080 s, les deux moteurs quantifiant sur la même horloge de quatre-vingts
// millisecondes. Ils ne divergent donc jamais de plus de deux tics de leur propre résolution.
//
// IL DÉTECTE LA LANGUE SEUL, sur vingt-cinq, et ne permet pas de la dire : son moteur refuse
// l'option. Vérifié sur un témoin anglais dont je connaissais le texte, transcrit mot pour mot sans
// qu'on lui dise la langue.
//
// UN SEUL RÉGLAGE, ET C'EST UNE CONCLUSION DE MESURE, non un oubli. Quatre options de sa fiche ont
// été essayées et écartées : la langue est refusée, `keep_language_tags` ne change rien à la
// sortie, `audio_chunk_mode=vad` réclame un modèle de détection d'activité que le binaire ne livre
// pas, et `hotwords` réclame un paquet Phonon-2 qu'aucun paquet de cette famille ne fournit. Quant
// au découpage `fixed`, il est strictement pire : sur 178,4 s il rend 465 mots au lieu de 480 — il
// en perd quinze aux coutures — et il est sept fois plus lent. Un réglage dont la seule autre
// valeur dégrade est un piège, donc il n'est pas offert.
import type { FicheAudio } from "../audio/types-domaine";
import { formaterMots, type Mot } from "../audio/parole-datee";
import { traduire } from "../i18n";
import { octetsWav } from "./chanson-aides";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { parametreCalcul } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";
import type { ContexteDeRelais } from "./progression-pont";

const CANAL = "parakeet:transcrire";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: ContexteDeRelais) {
  return relayerProgression(ctx, api()?.parakeetProgression);
}

/** Le débit de parole, en mots par minute, ou `null` si la mesure n'a pas de sens. */
export function motsParMinute(mots: readonly Mot[]): number | null {
  if (mots.length < 2) return null;
  const duree = mots[mots.length - 1].fin - mots[0].debut;
  return duree > 0 ? (mots.length / duree) * 60 : null;
}

export const fiches = ([
  {
    id: "dater-les-mots", nom: "Dater les mots", nomEn: "Date the words",
    univers: "Autres", famille: "Speech to Text",
    resume: "Transcrit un enregistrement et donne l'instant de chaque mot, sans qu'on donne le texte.",
    resumeEn: "Transcribes a recording and gives the instant of each word, without being given the text.",
    notice: "Ce composant écoute un enregistrement et rend deux choses : ce qui est dit, et quand chaque mot "
      + "est dit. On ne lui donne aucun texte.\n\n"
      + "C'est ce qui le distingue d'« Aligner un texte sur la parole », qui place des mots qu'on lui fournit. "
      + "Les deux se complètent : la sortie « Transcription » de celui-ci se branche sur l'entrée « Texte » de "
      + "l'autre, qui sait alors découper la suite de mots voulue.\n\n"
      + "La langue est reconnue seule, parmi vingt-cinq. Il n'y a donc pas de réglage de langue, et un "
      + "enregistrement qui change de langue en cours de route est transcrit tel qu'il est dit.\n\n"
      + "« Calcul » nomme le périphérique employé. C'est le seul réglage : les autres options du moteur ont été "
      + "essayées et écartées, soit parce qu'elles réclament un paquet qu'il ne livre pas, soit parce qu'elles "
      + "ne changent rien, soit parce qu'elles perdent des mots.\n\n"
      + "La sortie « Transcription » rend le texte. « Mots » donne une ligne par mot, avec son rang et son "
      + "intervalle. « Rapport » donne le nombre de mots, la durée couverte et le débit en mots par minute.\n\n"
      + "La résolution est de quatre-vingts millisecondes : les instants rendus en sont tous des multiples, et "
      + "rien de plus fin n'en est obtenu. C'est la même que celle de l'aligneur, et les deux moteurs ont été "
      + "confrontés sur un même son sans jamais s'écarter de plus de deux de ces pas.",
    noticeEn: "This component listens to a recording and returns two things: what is said, and when each word "
      + "is said. No text is given to it.\n\n"
      + "That is what distinguishes it from « Align text to speech », which places words supplied to it. The "
      + "two complement each other: this one's « Transcript » output connects to the other's « Text » input, "
      + "which can then cut out the desired word range.\n\n"
      + "The language is recognized by itself, among twenty-five. There is therefore no language setting, and "
      + "a recording that changes language along the way is transcribed as it is spoken.\n\n"
      + "« Compute » names the device used. It is the only setting: the engine's other options were tried and "
      + "set aside, either because they require a package it does not ship, or because they change nothing, or "
      + "because they lose words.\n\n"
      + "The « Transcript » output returns the text. « Words » gives one line per word, with its rank and its "
      + "interval. « Report » gives the number of words, the duration covered and the rate in words per minute.\n\n"
      + "The resolution is eighty milliseconds: the returned instants are all multiples of it, and nothing "
      + "finer is obtained. It is the same as the aligner's, and the two engines were compared on one sound "
      + "without ever differing by more than two of those steps.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Transcription", nomEn: "Transcript", type: "texte" },
      { nom: "Mots", nomEn: "Words", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      parametreCalcul(
        "Il change le temps de calcul et non les mots trouvés.",
        "It changes the compute time and not the words found."),
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.parakeetTranscrire) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }
      // LE MOTEUR ACCEPTE N'IMPORTE QUELLE CADENCE, mesuré : le son part tel qu'il est reçu, sans
      // le détour par 16 ou 44,1 kHz que ses deux voisins de cette famille d'outils imposent.
      const audio = await octetsWav(buffer);
      if (!audio) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      await annoncerModele(ctx, "dater-les-mots", traduire("progress.parakeet.modele"));
      const debrancher = suivre(ctx);
      let r: { ok: boolean; texte?: string; mots?: Mot[]; releves?: { rtf: number | null }; journal?: string };
      try {
        r = await pont.parakeetTranscrire({
          audio,
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null, null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok) {
        return { valeurs: [null, null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const mots = r.mots ?? [];
      const texte = r.texte ?? "";
      if (mots.length === 0 && !texte) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.dater.rienEntendu") };
      }

      const couverte = mots.length > 0 ? mots[mots.length - 1].fin - mots[0].debut : 0;
      const debit = motsParMinute(mots);
      const rapport = [
        traduire("msg.dater.mots", String(mots.length)),
        traduire("msg.dater.couverte", couverte.toFixed(2), buffer.duration.toFixed(2)),
        debit == null ? "" : traduire("msg.dater.debit", String(Math.round(debit))),
      ].filter(Boolean).join("\n");

      return {
        valeurs: [texte, formaterMots(mots), rapport],
        message: `${mots.length} ${traduire("msg.dater.mot_court")}`
          + (debit == null ? "" : ` · ${Math.round(debit)} ${traduire("msg.dater.parMinute")}`),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
