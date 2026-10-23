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

const CALCULS = [
  { id: "", fr: "Automatique", en: "Automatic" },
  { id: "CPU", fr: "Processeur", en: "Processor" },
  { id: "Vulkan0", fr: "Vulkan 0", en: "Vulkan 0" },
  { id: "Vulkan1", fr: "Vulkan 1", en: "Vulkan 1" },
  { id: "CUDA0", fr: "CUDA 0", en: "CUDA 0" },
];

const CANAL = "qwen3asr:transcrire";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.qwen3AsrProgression as unknown as
    ((cb: (e: { ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

/** Les mots d'un texte, au sens de ce qui est séparé par des blancs. */
export function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

export const fiches = ([
  {
    id: "transcrire", nom: "Transcrire", nomEn: "Transcribe",
    univers: "Autres", famille: "Speech to Text",
    resume: "Transcrit un enregistrement, avec un moteur plus fidèle sur les extraits courts et nets.",
    resumeEn: "Transcribes a recording, with an engine more faithful on short, clean excerpts.",
    notice: "Ce composant écoute un enregistrement et rend ce qui est dit. La langue est reconnue seule, "
      + "parmi trente et une.\n\n"
      + "Le catalogue en porte un autre, « Dater les mots », et aucun des deux ne vaut mieux partout. "
      + "Celui-ci est plus fidèle sur les extraits courts et nets, et il demande moitié moins de mémoire. "
      + "L'autre est trois fois plus rapide, plus sûr sur les longs enregistrements, et lui seul donne "
      + "l'instant de chaque mot.\n\n"
      + "Pour obtenir des instants avec celui-ci, sa sortie se branche sur l'entrée « Texte » "
      + "d'« Aligner un texte sur la parole », qui les calcule. C'est exactement ce que son moteur ferait "
      + "en interne, pour le même résultat et sans second modèle à prendre.\n\n"
      + "« Calcul » nomme le périphérique employé. C'est le seul réglage : son moteur accepte aussi une "
      + "langue, mais la forcer ne change rien à ce qu'il rend, éprouvé sur deux témoins et trois langues.\n\n"
      + "La sortie « Transcription » rend le texte. « Rapport » donne le nombre de mots, la durée du son "
      + "et le facteur de temps réel que le moteur a mesuré lui-même.",
    noticeEn: "This component listens to a recording and returns what is said. The language is recognized "
      + "by itself, among thirty-one.\n\n"
      + "The catalog holds another one, « Date the words », and neither is better everywhere. This one is "
      + "more faithful on short, clean excerpts, and it asks half the memory. The other is three times "
      + "faster, safer on long recordings, and it alone gives the instant of each word.\n\n"
      + "To obtain instants with this one, its output connects to the « Text » input of « Align text to "
      + "speech », which computes them. That is exactly what its engine would do internally, for the same "
      + "result and without a second model to fetch.\n\n"
      + "« Compute » names the device used. It is the only setting: its engine also accepts a language, but "
      + "forcing one changes nothing in what it returns, tried on two witnesses and three languages.\n\n"
      + "The « Transcript » output returns the text. « Report » gives the number of words, the duration of "
      + "the sound and the real-time factor the engine measured itself.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Transcription", nomEn: "Transcript", type: "texte" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Calcul", nomEn: "Compute", type: "choix",
        options: CALCULS.map((c) => c.fr), optionsEn: CALCULS.map((c) => c.en),
        optionIds: CALCULS.map((c) => c.id), defaut: "Automatique", defautEn: "Automatic",
        doc: "Le périphérique de calcul. Il change le temps de calcul et non le texte rendu. « Automatique » laisse le moteur prendre ce qu'il juge le meilleur, ce qui n'est pas toujours la carte graphique : une machine à deux cartes expose souvent le circuit intégré en premier, et les deux numéros sont là pour les départager. « Processeur » tourne partout, et bien plus lentement.",
        docEn: "The compute device. It changes the compute time and not the returned text. « Automatic » lets the engine take what it deems best, which is not always the graphics card: a machine with two cards often exposes the integrated one first, and the two numbers are there to tell them apart. « Processor » runs everywhere, and far more slowly." },
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
