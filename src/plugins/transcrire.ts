// plugins/transcrire.ts — Un second moteur de transcription, et pourquoi le premier ne suffit pas.
//
// LE DÉPÔT EN A DÉJÀ TROIS — Vosk, Sherpa, Whisper — plus « Dater les mots » depuis peu. Celui-ci
// est le cinquième, et il est là parce qu'aucun des deux derniers ne domine l'autre : la mesure du
// 2026-10-23, sur des témoins dont j'avais écrit le texte, les sépare proprement.
//
//   CE COMPOSANT GAGNE SUR LE COURT ET LE NET. Sur une phrase française il rend le texte
//   EXACTEMENT tel que je l'avais écrit, là où « Dater les mots » ajoute une virgule ; sur
//   l'anglais il garde « river bank » en deux mots quand l'autre les soude. Et son empreinte est
//   moitié moindre : 2 821 Mo contre 6 434 sur un extrait court, 3 946 contre 8 335 sur 178 s.
//
//   L'AUTRE GAGNE SUR LE LONG ET LE RAPIDE. Celui-ci est TROIS FOIS plus lent — facteur de temps
//   réel 0,059 contre 0,018 — et sur un témoin de 178 s il laisse tomber une occurrence de phrase
//   sur soixante-quatre, trente et un « salle vide » au lieu de trente-deux, là où l'autre est
//   exact.
//
// IL NE REND PAS D'INSTANTS PAR MOT, ET C'EST MESURÉ PLUTÔT QUE SUBI. Sa fiche annonce la
// capacité, mais elle passe par l'aligneur Qwen3 lancé après la transcription — celui que le dépôt
// livre déjà. Ses instants et ceux de l'aligneur sont identiques À L'ÉCHANTILLON : écart exactement
// nul sur quinze mots. Les demander coûterait un second modèle d'un giga-octet pour un résultat que
// l'on obtient en branchant la sortie de ce composant sur « Aligner un texte sur la parole ».
//
// UN SEUL RÉGLAGE, ET LE SECOND A ÉTÉ ÉCARTÉ PAR LA MESURE. Sa fiche accepte une langue, et c'est
// tentant puisqu'il en annonce trente et une. Mais forcer `fr` ou `ru` sur un témoin ANGLAIS rend
// le même anglais, et forcer `en` ou `de` sur un témoin français rend le même français : trois
// valeurs, deux témoins, sorties identiques. Le réglage est inerte, et le contrat de composant
// interdit de déclarer ce qui ne peut rien changer.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { octetsWav } from "./chanson-aides";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { parametreCalcul } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";
import type { ContexteDeRelais } from "./progression-pont";

const CANAL = "qwen3asr:transcrire";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: ContexteDeRelais) {
  return relayerProgression(ctx, api()?.qwen3AsrProgression);
}

/** Les mots d'un texte, au sens de ce qui est séparé par des blancs. */
export function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

export const fiches = ([
  {
    id: "transcrire", nom: "Transcrire", nomEn: "Transcribe",
    univers: "Autres", famille: "Speech to Text",
    resume: "Transcrit la parole d'un enregistrement, en reconnaissant seul sa langue.",
    resumeEn: "Transcribes the speech of a recording, recognizing its language by itself.",
    notice: "Ce composant transcrit la parole de l'enregistrement reçu sur l'entrée « Audio ». La langue "
      + "est reconnue seule, parmi trente et une, sans réglage.\n\n"
      + "« Calcul » choisit le périphérique sur lequel le moteur tourne. Il change le temps de calcul et "
      + "non le texte rendu.\n\n"
      + "La sortie « Transcription » rend le texte, sans l'instant de chaque mot. « Rapport » donne le "
      + "nombre de mots transcrits, la durée du son en secondes et, quand le moteur le fournit, le facteur "
      + "de temps réel : la durée du calcul divisée par celle du son.",
    noticeEn: "This component transcribes the speech of the recording received on the « Audio » input. The "
      + "language is recognized by itself, among thirty-one, without a setting.\n\n"
      + "« Compute » chooses the device the engine runs on. It changes the compute time and not the "
      + "returned text.\n\n"
      + "The « Transcript » output returns the text, without the instant of each word. « Report » gives the "
      + "number of words transcribed, the duration of the sound in seconds and, when the engine provides "
      + "it, the real-time factor: the compute time divided by the duration of the sound.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Transcription", nomEn: "Transcript", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      parametreCalcul(
        "Il change le temps de calcul et non le texte rendu.",
        "It changes the compute time and not the returned text."),
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.qwen3AsrTranscrire) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }
      const audio = await octetsWav(buffer);
      if (!audio) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      await annoncerModele(ctx, "transcrire", traduire("progress.parakeet.modele"));
      const debrancher = suivre(ctx);
      let r: { ok: boolean; texte?: string; releves?: { rtf: number | null }; journal?: string };
      try {
        r = await pont.qwen3AsrTranscrire({
          audio,
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok) {
        return { valeurs: [null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const texte = (r.texte ?? "").trim();
      if (!texte) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.dater.rienEntendu") };
      }

      const mots = compterMots(texte);
      const rtf = r.releves?.rtf;
      const rapport = [
        traduire("msg.transcrire.mots", String(mots)),
        traduire("msg.transcrire.duree", buffer.duration.toFixed(2)),
        rtf == null ? "" : traduire("msg.apollo.vitesse", rtf.toFixed(3)),
      ].filter(Boolean).join("\n");

      return {
        valeurs: [texte, rapport],
        message: `${mots} ${traduire("msg.dater.mot_court")}`
          + (rtf == null ? "" : ` · RTF ${rtf.toFixed(2)}`),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
