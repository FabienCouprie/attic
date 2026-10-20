// plugins/decrire-audio.ts — Ce qu'on entend dans un audio, en mots.
//
// CE QUI MANQUAIT POUR BÂTIR UN PLAN DE CHANSON. Le plan qu'écrit « Planifier une chanson » porte
// une `caption` — la description que le débruiteur suit —, et rien dans le catalogue ne savait en
// produire une à partir d'un son. Le tempo avait son détecteur, la tonalité son analyse harmonique,
// les paroles leur reconnaissance de parole ; la description, non.
//
// CED, ET NON AUDIO FLAMINGO, et c'est la mesure qui a tranché. Pour cette tâche, audio.cpp n'offre
// que deux familles d'étiquetage et deux de compréhension. Les Flamingo font huit milliards de
// paramètres : 5 459 592 448 octets pour le plus petit paquet utile, soit 2,54 fois le plafond d'un
// asset de release, 5 206,6 Mio de poids sur une carte de 6 144, et une licence NVIDIA OneWay
// Noncommercial. CED pèse 342 964 768 octets, tourne en mémoire vive et porte Apache-2.0.
//
// CE QU'IL SAIT, MESURÉ SUR QUATRE TÉMOINS DONT TROIS À RÉPONSE CONNUE, sur une RTX 2060 :
//
//   un rendu de guitare acoustique   Music 0,76 · Guitar 0,11 · Acoustic guitar · Strum · Tender music
//   un morceau de blues              Music 0,85 · Guitar · Steel guitar, slide guitar · Piano
//   une ambiance de bar              Speech 0,88 · Conversation · Inside, small room · Dishes, pots and pans
//   une falaise et la mer            Ocean 0,73 · Waves, surf 0,69 · Wind · Wind noise (microphone)
//
// LE TÉMOIN DU BAR EST LE PLUS IMPORTANT DES QUATRE : « Music » y tombe à 0,026, donc l'instrument
// ne répond pas « musique » à tout ce qu'on lui donne. Et sur la falaise il distingue le vent de
// l'artefact de vent dans le micro.
//
// LE GENRE N'EST PAS DE SON RESSORT, et la notice le dit plutôt que de laisser croire le contraire :
// le morceau de blues est sorti « Ambient music » puis « New-age music ». Le genre reste au
// « Classificateur de genre », qui est fait pour ça.
//
// VITESSE RELEVÉE : facteur de temps réel de 0,0057 à 0,0196, soit cinquante et un à cent
// soixante-quatorze fois le temps réel ; les quatre minutes vingt-trois du morceau de blues ont été
// étiquetées en deux secondes, pour un pic de 398 Mo de mémoire vive.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { octetsWav, PARAMETRE_CALCUL } from "./chanson-aides";

const CANAL = "ced:etiqueter";

type Etiquette = { etiquette: string; score: number };

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: { onProgress?: (m: string) => void }) {
  const pont = api()?.cedProgression as unknown as
    ((cb: (e: { ligne: string }) => void) => () => void) | undefined;
  if (!pont) return () => { /* hors application : rien à suivre */ };
  return pont(({ ligne }) => ctx.onProgress?.(ligne));
}

/**
 * La description, faite des étiquettes retenues.
 *
 * LA PREMIÈRE ÉTIQUETTE EST ÉCARTÉE QUAND C'EST « Music », et c'est la mesure qui l'a voulu : sur
 * les deux témoins musicaux elle sortait à 0,76 et 0,85, loin devant tout le reste, et une
 * description qui commence par « music » ne dit rien à un modèle qui engendre de la musique. Les
 * étiquettes suivantes, elles, portent les instruments. Sur un témoin NON musical — l'ambiance de
 * bar — « Music » n'est pas première et rien n'est écarté.
 *
 * LE SÉPARATEUR EST LA VIRGULE, forme que la `caption` d'un plan emploie déjà : la description
 * engendrée par le planificateur est une phrase, mais le moteur reçoit aussi bien une liste.
 */
export function descriptionDepuis(etiquettes: Etiquette[]): string {
  const retenues = etiquettes.length > 0 && /^music$/i.test(etiquettes[0].etiquette)
    ? etiquettes.slice(1) : etiquettes;
  return retenues.map((e) => e.etiquette.toLowerCase()).join(", ");
}

/** Les étiquettes au-dessus du seuil, telles que la vue les montre. */
export function tableauEtiquettes(etiquettes: Etiquette[]): string {
  return etiquettes.map((e) => `${e.etiquette} — ${(e.score * 100).toFixed(1)} %`).join("\n");
}

export const fiches = ([
  {
    id: "decrire-audio", nom: "Décrire un audio", nomEn: "Describe an Audio",
    univers: "Visualisation", famille: "Analyse",
    resume: "Dit en mots ce qu'on entend : instruments, sources, lieu, présence d'une voix.",
    resumeEn: "Says in words what is heard: instruments, sources, place, presence of a voice.",
    notice: "Ce composant écoute un audio et le décrit en mots, parmi cinq cent vingt-sept classes de sons : "
      + "instruments, voix, sources naturelles, machines, lieux.\n\n"
      + "La sortie « Description » rend une liste de mots séparés par des virgules, prête à être branchée "
      + "sur la « Description » d'un plan de chanson. La sortie « Étiquettes » rend le relevé complet, avec "
      + "le score de chacune, qui se lit pour juger de ce que le composant a cru entendre. La sortie "
      + "« Audio » rend le son reçu tel quel, pour continuer la chaîne.\n\n"
      + "« Nombre d'étiquettes » dit combien en demander ; « Seuil » écarte celles dont le score est trop "
      + "faible, et à zéro il n'écarte rien. « Calcul » nomme le périphérique employé.\n\n"
      + "Ce qu'il sait, et ce qu'il ne sait pas. Les instruments, les sources, le lieu et la présence d'une "
      + "voix sont justes à la mesure. Le genre musical ne l'est pas : un morceau de blues est ressorti "
      + "« ambient music » puis « new-age music ». Pour le genre, employer le « Classificateur de genre ».\n\n"
      + "Quand la première étiquette est « Music », elle est retirée de la description : elle domine tout "
      + "sur un morceau et n'apprend rien à un modèle qui engendre de la musique. Elle reste visible dans "
      + "les étiquettes.",
    noticeEn: "This component listens to an audio and describes it in words, among five hundred and twenty-seven "
      + "sound classes: instruments, voices, natural sources, machines, places.\n\n"
      + "The « Description » output returns a comma-separated list of words, ready to be connected to a song "
      + "plan's « Description ». The « Labels » output returns the full reading, with each score, which is "
      + "read to judge what the component believed it heard. The « Audio » output returns the received sound "
      + "as it is, to continue the chain.\n\n"
      + "« Label count » says how many to ask for; « Threshold » discards those whose score is too low, and "
      + "at zero it discards nothing. « Compute » names the device used.\n\n"
      + "What it knows, and what it does not. Instruments, sources, place and the presence of a voice are "
      + "correct when measured. Musical genre is not: a blues track came out as « ambient music » then "
      + "« new-age music ». For genre, use the « Genre Classifier ».\n\n"
      + "When the first label is « Music », it is removed from the description: it dominates everything on a "
      + "music track and teaches nothing to a model that generates music. It stays visible in the labels.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Description", nomEn: "Description", type: "texte" },
      { nom: "Étiquettes", nomEn: "Labels", type: "texte" },
    ],
    parametres: [
      { nom: "Nombre d'étiquettes", nomEn: "Label count", type: "nombre", plage: [1, 20], pas: 1, defaut: 10,
        doc: "Combien d'étiquettes demander au modèle. Vérifié jusqu'à vingt.",
        docEn: "How many labels to ask the model for. Verified up to twenty." },
      { nom: "Seuil", nomEn: "Threshold", type: "nombre", plage: [0, 50], pas: 1, defaut: 0, unite: "%",
        doc: "Score minimal pour qu'une étiquette soit gardée. À zéro, toutes sont gardées. Relevé à la mesure : les étiquettes justes au-delà de la troisième tombent souvent sous un pour cent, de sorte qu'un seuil élevé écarte des mots exacts.",
        docEn: "Minimum score for a label to be kept. At zero, all are kept. Measured: correct labels beyond the third often fall under one per cent, so a high threshold discards exact words." },
      PARAMETRE_CALCUL,
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      const pont = api();
      if (!pont?.cedEtiqueter) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const audio = await octetsWav(buffer);
      if (!audio) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      await annoncerModele(ctx, "decrire-audio", traduire("progress.chargement_du_mod_le"));
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; etiquettes?: Etiquette[]; releves?: { rtf: number | null }; journal?: string };
        try {
          r = await pont.cedEtiqueter({
            audio,
            nombre: ctx.paramNombre("Nombre d'étiquettes", 10),
            calcul: ctx.paramTexte("Calcul", "").trim(),
          }) as typeof r;
        } catch (erreur) {
          return { valeurs: [null, null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
        }
        if (!r.ok || !r.etiquettes) {
          return { valeurs: [null, null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
        }
        // LE SEUIL S'APPLIQUE ICI ET NON DANS LE MOTEUR, qui ne sait qu'un nombre : le relevé des
        // scores doit rester complet pour que le seuil se règle en voyant ce qu'il écarte.
        const seuil = ctx.paramNombre("Seuil", 0) / 100;
        const gardees = r.etiquettes.filter((e) => e.score >= seuil);
        return {
          valeurs: [buffer, descriptionDepuis(gardees), tableauEtiquettes(gardees)],
          message: traduire("msg.decrire.rendu", String(gardees.length), (r.releves?.rtf ?? 0).toFixed(4)),
        };
      } finally {
        debrancher();
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
