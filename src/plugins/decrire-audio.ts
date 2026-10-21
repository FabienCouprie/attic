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
    notice: "Ce composant nomme les sons présents dans un audio, parmi cinq cent vingt-sept classes : "
      + "instruments, voix, sources naturelles, machines, lieux.\n\n"
      + "« Nombre d'étiquettes » dit combien de classes demander. « Seuil » écarte les étiquettes dont le "
      + "score est inférieur ; à zéro, aucune n'est écartée. « Calcul » nomme le périphérique employé.\n\n"
      + "La sortie « Audio » rend le son reçu. La sortie « Description » rend les étiquettes retenues en "
      + "minuscules, séparées par des virgules ; l'étiquette « Music » en est retirée lorsqu'elle vient en "
      + "tête, celle-ci dominant alors toutes les autres sur un morceau. La sortie « Étiquettes » rend le "
      + "relevé complet, une par ligne, avec son score en pour cent.\n\n"
      + "Les étiquettes portent sur les instruments, les sources sonores, le lieu et la présence d'une voix. "
      + "Le genre musical n'en fait pas partie.",
    noticeEn: "This component names the sounds present in an audio, among five hundred and twenty-seven "
      + "classes: instruments, voices, natural sources, machines, places.\n\n"
      + "« Label count » says how many classes to ask for. « Threshold » discards the labels whose score is "
      + "lower; at zero, none is discarded. « Compute » names the device used.\n\n"
      + "The « Audio » output returns the received sound. The « Description » output returns the kept labels "
      + "in lower case, separated by commas; the « Music » label is removed from it when it comes first, as "
      + "it then dominates all the others on a music track. The « Labels » output returns the full reading, "
      + "one per line, with its score as a percentage.\n\n"
      + "The labels cover instruments, sound sources, place and the presence of a voice. Musical genre is "
      + "not among them.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Description", nomEn: "Description", type: "texte" },
      { nom: "Étiquettes", nomEn: "Labels", type: "texte" },
    ],
    parametres: [
      { nom: "Nombre d'étiquettes", nomEn: "Label count", type: "nombre", plage: [1, 20], pas: 1, defaut: 10,
        doc: "Combien d'étiquettes demander au modèle, de la mieux notée à la moins bien notée.",
        docEn: "How many labels to ask the model for, from the best scored to the least well scored." },
      { nom: "Seuil", nomEn: "Threshold", type: "nombre", plage: [0, 50], pas: 1, defaut: 0, unite: "%",
        doc: "Score minimal pour qu'une étiquette soit gardée. À zéro, toutes sont gardées. Les scores décroissent vite : au-delà de la troisième étiquette ils passent souvent sous un pour cent, de sorte qu'un seuil élevé écarte aussi des étiquettes justes.",
        docEn: "Minimum score for a label to be kept. At zero, all are kept. Scores fall quickly: beyond the third label they often go under one per cent, so a high threshold also discards correct labels." },
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
