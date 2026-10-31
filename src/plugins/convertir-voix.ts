// plugins/convertir-voix.ts — Les mots d'un enregistrement, le timbre d'un autre.
//
// CE QUE CELA FAIT, ET CE QUI LE DISTINGUE DU CLONAGE. « Cloner une voix » part d'un TEXTE et le
// fait dire par une voix donnée en exemple. Celui-ci part d'un ENREGISTREMENT : il en garde les
// mots, le rythme et l'intonation, et lui donne le timbre d'une autre voix. On ne lui écrit rien ;
// on lui donne deux sons.
//
// LE MÊME MODÈLE QUE LE CLONAGE, ET C'EST TOUT L'INTÉRÊT. La fiche de `chatterbox` déclare trois
// tâches — synthèse, clonage, conversion — et son GGUF est déjà livré pour le cloneur. Cette
// fonction n'a donc coûté aucun téléchargement, aucune licence de plus et aucune publication.
//
// LES DEUX SEULES FAMILLES QUI SAVENT CONVERTIR DU CHANT SONT HORS DE PORTÉE, et il faut l'écrire
// pour qu'on ne la cherche pas ici : `seed_vc` pèse 3 120 809 440 octets et `vevo2` 3 242 129 792,
// quand un asset de release est refusé au-delà de 2 147 483 648. C'est le même plafond qui avait
// écarté AudioSR et la variante f16 de ce modèle-ci.
//
// MESURÉ LE 2026-10-23 SUR UN COUPLE DONT JE CONNAISSAIS L'ÉCART, et les deux moitiés de la mesure
// comptent. Deux voix séparées de 0,4357 d'écart de timbre : le rendu tombe à **0,0343 de la
// cible** et reste à 0,3116 de la source, donc il prend le timbre demandé presque entièrement. Et
// les mots sont ceux de la SOURCE, mot pour mot selon la transcription, alors que la voix cible
// prononçait une autre phrase — ce qui rend la mesure sans ambiguïté. Facteur de temps réel 0,566
// sur une RTX 2060, durée conservée.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { octetsWav } from "./chanson-aides";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { parametreCalcul } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";
import type { ContexteDeRelais } from "./progression-pont";

const CANAL = "chatterbox:convertir";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: ContexteDeRelais) {
  return relayerProgression(ctx, api()?.chatterboxConversionProgression);
}

export const fiches = ([
  {
    id: "convertir-voix", nom: "Convertir une voix", nomEn: "Convert a voice",
    univers: "Traitement", famille: "Conversion",
    resume: "Garde les mots et l'intonation d'un enregistrement, et lui donne le timbre d'une autre voix.",
    resumeEn: "Keeps the words and intonation of a recording, and gives it the timbre of another voice.",
    notice: "Ce composant garde ce qui est dit et le fait dire par une autre voix. L'entrée « Audio » porte "
      + "l'enregistrement dont les mots, le rythme et l'intonation sont conservés ; l'entrée « Voix cible » "
      + "porte un extrait de la voix dont le timbre est pris.\n\n"
      + "Ce n'est pas le cloneur de voix, qui part d'un texte écrit et le fait prononcer. Ici on ne donne "
      + "aucun texte : la parole existe déjà, et seul son timbre change.\n\n"
      + "La voix cible n'a pas besoin de dire la même chose, ni quoi que ce soit en particulier : quelques "
      + "secondes de parole claire suffisent, et c'est leur timbre qui est repris. Un extrait bruité ou très "
      + "court donne une imitation plus lâche.\n\n"
      + "« Graine » fixe le tirage : à graine égale et entrées égales, le rendu est le même. La changer donne "
      + "une autre prise de la même conversion.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "La sortie rend la parole convertie, de la même durée que l'entrée. Le composant travaille sur la "
      + "parole et non sur le chant : les deux modèles du catalogue amont qui savent convertir un chant "
      + "dépassent la taille qu'une publication accepte, et ne sont donc pas livrables.",
    noticeEn: "This component keeps what is said and has it said by another voice. The « Audio » input carries "
      + "the recording whose words, rhythm and intonation are kept; the « Target voice » input carries an "
      + "excerpt of the voice whose timbre is taken.\n\n"
      + "This is not the voice cloner, which starts from written text and has it spoken. Here no text is "
      + "given: the speech already exists, and only its timbre changes.\n\n"
      + "The target voice need not say the same thing, nor anything in particular: a few seconds of clear "
      + "speech is enough, and it is their timbre that is taken. A noisy or very short excerpt gives a looser "
      + "imitation.\n\n"
      + "« Seed » fixes the draw: with the same seed and the same inputs, the result is the same. Changing it "
      + "gives another take of the same conversion.\n\n"
      + "« Compute » names the device used.\n\n"
      + "The output returns the converted speech, of the same length as the input. The component works on "
      + "speech and not on singing: the two models of the upstream catalog that can convert singing exceed "
      + "the size a publication accepts, and are therefore not deliverable.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Voix cible", nomEn: "Target voice", type: "audio" },
    ],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 42, graine: true,
        doc: "La graine du tirage. À graine égale et entrées égales, le rendu est le même ; la changer donne une autre prise de la même conversion.",
        docEn: "The seed of the draw. With the same seed and the same inputs, the result is the same; changing it gives another take of the same conversion." },
      parametreCalcul(
        "Il change le temps de calcul.",
        "It changes the compute time."),
    ],
    async executer(ctx) {
      const pont = api();
      if (!pont?.chatterboxConvertir) {
        return { valeurs: [null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const source = entreeAudio(ctx, 0);
      if (sansEntree(source)) return source;
      const cible = ctx.entree(1);
      if (!(cible instanceof AudioBuffer)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.convertirVoix.sansCible") };
      }

      const octetsSource = await octetsWav(source);
      const octetsCible = await octetsWav(cible);
      if (!octetsSource || !octetsCible) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      await annoncerModele(ctx, "convertir-voix", traduire("progress.chargement_du_mod_le"));
      const debrancher = suivre(ctx);
      let r: { ok: boolean; donnees?: Uint8Array; releves?: { rtf: number | null }; journal?: string };
      try {
        r = await pont.chatterboxConvertir({
          source: octetsSource,
          cible: octetsCible,
          graine: ctx.paramNombre("Graine", 42),
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok || !r.donnees) {
        return { valeurs: [null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const { decoderBlob } = await import("../audio");
      const rendu = await decoderBlob(new Blob([new Uint8Array(r.donnees)]), ctx.runtime);
      const rtf = r.releves?.rtf;
      return {
        valeurs: [rendu],
        message: traduire("msg.convertirVoix.fait", rendu.duration.toFixed(1),
          rtf == null ? "—" : rtf.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
