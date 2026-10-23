// plugins/cloner-voix.ts — Un extrait de voix dit un autre texte.
//
// LE SEUL MODÈLE DE VOIX DU CATALOGUE SANS RÉSERVE. Chatterbox vient de Resemble AI, dont la fiche
// amont déclare MIT ; les cinq synthèses existantes reposent sur des poids en CC-BY-NC ou sur des
// licences propres à leur éditeur. C'est ce qui l'a fait retenir devant XTTS v2, en licence
// non commerciale d'une entreprise fermée, et devant YourTTS, dont le « ND » interdit tout dérivé,
// un export GGUF compris.
//
// IL N'A PAS DE VOIX À LUI, et cela décide de ses ports. Une synthèse sans référence est refusée
// par le moteur : « Chatterbox prepare requires speaker reference audio ». L'entrée « Voix » est
// donc obligatoire, là où les cinq autres synthèses choisissent dans une liste.
//
// MESURÉ SUR UNE RTX 2060, paquet q8 : facteur de temps réel 1,29 à 1,90 selon la longueur, pic de
// 3 668 MiB de mémoire de carte sur 6 144, sortie en 24 kHz mono. L'amont annonçait six gigaoctets
// au minimum ; la quantification ramène la chose dans la carte avec deux gigaoctets de marge.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { octetsWav, PARAMETRE_CALCUL } from "./chanson-aides";
import { LANGUE_AUTO, choixLangues } from "../core/langues";

const CANAL = "chatterbox:cloner";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.chatterboxProgression as unknown as
    ((cb: (e: { ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

/**
 * Les langues que le réglage propose.
 *
 * LA LISTE VIENT DE NOUS, comme pour le chant : le moteur recopie ce qu'on lui passe sans le
 * valider. « Automatique » laisse le modèle décider, ce qu'il fait seul et plutôt bien ; les
 * autres se transmettent telles quelles.
 */
const LANGUES = [LANGUE_AUTO, "fr", "en", "es", "de", "it", "pt"];

export const fiches = ([
  {
    id: "cloner-voix", nom: "Cloner une voix", nomEn: "Clone a Voice",
    univers: "Entrées", famille: "Génération",
    resume: "Fait dire un texte par la voix d'un extrait audio.",
    resumeEn: "Makes an audio excerpt's voice say a text.",
    notice: "Ce composant fait dire un texte par la voix d'un extrait audio. L'entrée « Voix » reçoit "
      + "l'extrait dont le timbre est repris, et l'entrée « Texte » ce qui sera dit ; le réglage du même "
      + "nom sert quand l'entrée n'est pas branchée.\n\n"
      + "L'extrait donne de meilleurs résultats entre cinq et vingt secondes, sur une seule voix, sans "
      + "musique ni bruit de fond.\n\n"
      + "« Langue » dit en quelle langue prononcer. « Automatique » laisse le modèle décider d'après le "
      + "texte ; les autres l'imposent, ce qui change nettement la prononciation et la longueur du rendu.\n\n"
      + "« Transcription de l'extrait » donne le texte que l'extrait prononce. Elle est facultative : le "
      + "modèle s'en passe, et elle ne sert qu'à l'aider quand l'extrait est difficile à lire.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "La sortie « Audio » rend la parole en un canal, à vingt-quatre kilohertz. Le message donne la "
      + "durée obtenue et le facteur de temps réel que le moteur a mesuré.",
    noticeEn: "This component makes an audio excerpt's voice say a text. The « Voice » input receives the "
      + "excerpt whose timbre is taken up, and the « Text » input what will be said; the setting of the "
      + "same name serves when the input is not connected.\n\n"
      + "The excerpt gives better results between five and twenty seconds, on a single voice, with no "
      + "music or background noise.\n\n"
      + "« Language » says which language to pronounce in. « Automatic » lets the model decide from the "
      + "text; the others impose it, which clearly changes the pronunciation and the length of the "
      + "result.\n\n"
      + "« Excerpt transcript » gives the text the excerpt pronounces. It is optional: the model does "
      + "without it, and it only helps when the excerpt is hard to read.\n\n"
      + "« Compute » names the device used.\n\n"
      + "The « Audio » output returns the speech in one channel, at twenty-four kilohertz. The message "
      + "gives the length obtained and the real-time factor the engine measured.",
    entrees: [
      { nom: "Voix", nomEn: "Voice", type: "audio" },
      { nom: "Texte", nomEn: "Text", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "mono" }],
    parametres: [
      { nom: "Texte", nomEn: "Text", type: "texte",
        defaut: "Bonjour, ceci est un essai de clonage de voix.",
        defautEn: "Hello, this is a voice cloning test.",
        doc: "Ce qui sera dit. L'entrée « Texte » le remplace quand elle est branchée.",
        docEn: "What will be said. The « Text » input replaces it when connected." },
      { nom: "Langue", nomEn: "Language", type: "choix",
        ...choixLangues(LANGUES),
        defaut: "Automatique", defautEn: "Automatic",
        doc: "La langue de prononciation. « Automatique » laisse le modèle décider d'après le texte ; imposer une langue change nettement la prononciation et la longueur du rendu.",
        docEn: "The pronunciation language. « Automatic » lets the model decide from the text; imposing a language clearly changes the pronunciation and the length of the result." },
      { nom: "Transcription de l'extrait", nomEn: "Excerpt transcript", type: "texte",
        defaut: "", defautEn: "",
        doc: "Le texte que l'extrait prononce. Facultatif : le modèle s'en passe, et cela n'aide que lorsque l'extrait est difficile à lire.",
        docEn: "The text the excerpt pronounces. Optional: the model does without it, and it only helps when the excerpt is hard to read." },
      PARAMETRE_CALCUL,
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.chatterboxCloner) {
        return { valeurs: [null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const voix = await octetsWav(ctx.entree(0));
      if (!voix) {
        return { valeurs: [null], erreur: true, message: traduire("msg.cloner.aucuneVoix") };
      }
      const entreeTexte = ctx.entree(1);
      const texte = typeof entreeTexte === "string" && entreeTexte.trim()
        ? entreeTexte : ctx.paramTexte("Texte", "");
      if (!texte.trim()) {
        return { valeurs: [null], erreur: true, message: traduire("msg.cloner.aucunTexte") };
      }

      await annoncerModele(ctx, "cloner-voix", traduire("progress.chargement_du_mod_le"));
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; donnees?: Uint8Array; releves?: { rtf: number | null }; journal?: string };
        try {
          r = await pont.chatterboxCloner({
            voix, texte,
            langue: ctx.paramTexte("Langue", "").trim(),
            transcription: ctx.paramTexte("Transcription de l'extrait", "").trim(),
            calcul: ctx.paramTexte("Calcul", "").trim(),
          }) as typeof r;
        } catch (erreur) {
          // Même cas que pour les autres nœuds à moteur : le canal peut manquer au processus
          // principal quand il est plus vieux que le préchargement. Voir `pont-electron.ts`.
          return { valeurs: [null], erreur: true, message: messageEchecPont(erreur, CANAL) };
        }
        if (!r.ok || !r.donnees) {
          return { valeurs: [null], erreur: true, message: (r.journal ?? "").slice(-240) };
        }
        const { decoderBlob } = await import("../audio");
        const audio = await decoderBlob(new Blob([new Uint8Array(r.donnees)]), ctx.runtime);
        return {
          valeurs: [audio],
          message: traduire("msg.cloner.rendu",
            audio.duration.toFixed(1), (r.releves?.rtf ?? 0).toFixed(2)),
        };
      } finally {
        debrancher();
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
