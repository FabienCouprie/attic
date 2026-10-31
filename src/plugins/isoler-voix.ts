// plugins/isoler-voix.ts — La voix d'un morceau, et tout le reste.
//
// UN SECOND SÉPARATEUR, ET NON UN REMPLAÇANT. Celui du catalogue rend six pistes : batterie, basse,
// voix, guitare, piano et le reste. Celui-ci n'en rend que deux, et il est bien meilleur à ce seul
// travail. Les remplacer l'un par l'autre perdrait quatre sorties.
//
// MESURÉ SUR UN TÉMOIN CONSTRUIT, dont les deux sources sont connues : vingt secondes
// d'instrumental à −17,45 dB et une voix parlée à −27, soit neuf décibels et demi plus bas,
// mélangées en stéréo à 44,1 kHz. Les trois lectures sont faites contre la voix VRAIE.
//
//   la voix retrouvée ici          corrélation 0,4985   signal sur distorsion 1,24 dB
//   celle du séparateur à six      corrélation 0,2594   signal sur distorsion 0,30 dB
//   le mélange brut, sans rien     corrélation 0,3913   signal sur distorsion 0,72 dB
//
// CE QUI SE LIT DANS CES TROIS LIGNES : celui-ci BAT le fait de ne rien faire, l'autre tombe en
// dessous. Quatre fois mieux, pour sept fois le temps de calcul, facteur de temps réel 0,78 contre
// 0,11.
//
// L'ÉCART DE NEUF DÉCIBELS N'EST PAS UN DÉTAIL DU BANC, C'EN EST LE RÉGLAGE DÉCISIF. Un premier
// témoin posait les deux sources au MÊME niveau, et les deux séparateurs y tombaient sous la ligne
// du mélange brut, ce qui est impossible pour une séparation qui fonctionne. La cause est
// arithmétique : deux sources décorrélées mélangées à niveau égal laissent au seul mélange, remis à
// l'échelle, environ trois décibels contre chacune. Vérifié sur deux couples de sources
// indépendants, 3,84 et 1,24 dB pour l'un, 3,15 et 2,76 pour l'autre. Dans un morceau, une voix
// soliste se tient sous le mélange, et c'est là que la séparation a quelque chose à gagner.
//
// QUARANTE-QUATRE MILLE CENT HERTZ SONT EXIGÉS par le modèle, qui refuse net les 48 kHz où
// travaille le reste du dépôt. Le rééchantillonnage se fait ici, à l'aller et au retour, parce que
// la plateforme en porte un bon : un `OfflineAudioContext` rend ce travail au décodeur du
// navigateur. L'adaptateur, lui, refuse plutôt que de rééchantillonner mal en silence.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { octetsWav } from "./chanson-aides";
import { PARAMETRE_CALCUL } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";
import type { ContexteDeRelais } from "./progression-pont";
import { entreeAudio, sansEntree } from "./lire-entree";

const CANAL = "roformer:separer";

/** La fréquence que le modèle exige, et la seule qu'il accepte. */
export const FREQUENCE_MODELE = 44100;

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

function suivre(ctx: ContexteDeRelais) {
  return relayerProgression(ctx, api()?.roformerProgression);
}

/**
 * Le même son à une autre fréquence d'échantillonnage, de même durée.
 *
 * CE N'EST PAS `reechantillonnerVoie` DU DOMAINE, et la distinction compte : celui-là change la
 * LONGUEUR en gardant la fréquence, ce qui change la durée et donc la hauteur. Ici la durée doit
 * être gardée et c'est la fréquence qui change.
 */
export async function aLaFrequence(buffer: AudioBuffer, frequence: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === frequence) return buffer;
  const hors = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.max(1, Math.round(buffer.duration * frequence)),
    frequence,
  );
  const source = hors.createBufferSource();
  source.buffer = buffer;
  source.connect(hors.destination);
  source.start();
  return hors.startRendering();
}

export const fiches = ([
  {
    id: "isoler-voix", nom: "Isoler la voix", nomEn: "Isolate the Voice",
    univers: "Traitement", famille: "Effets",
    resume: "Sépare un morceau en deux pistes : la voix et tout le reste.",
    resumeEn: "Separates a track into two: the voice and everything else.",
    notice: "Ce composant sépare un morceau en deux pistes : la voix d'un côté, l'accompagnement de "
      + "l'autre. Les deux gardent la durée et le nombre de canaux reçus.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "La sortie « Voix » rend ce qui a été reconnu comme chanté ou parlé. La sortie "
      + "« Accompagnement » rend le reste. Le message donne le facteur de temps réel que le moteur a "
      + "mesuré.\n\n"
      + "Le modèle travaille à quarante-quatre mille cent hertz. Un son reçu à une autre fréquence "
      + "est rééchantillonné à l'aller, et les deux pistes le sont au retour vers la fréquence "
      + "d'origine.\n\n"
      + "Le calcul prend environ huit dixièmes de la durée du morceau sur une carte graphique.",
    noticeEn: "This component separates a track into two: the voice on one side, the backing on the "
      + "other. Both keep the length and channel count received.\n\n"
      + "« Compute » names the device used.\n\n"
      + "The « Voice » output returns what was recognised as sung or spoken. The « Backing » output "
      + "returns the rest. The message gives the real-time factor the engine measured.\n\n"
      + "The model works at forty-four thousand one hundred hertz. A sound received at another rate "
      + "is resampled on the way in, and both tracks are resampled back to the original rate.\n\n"
      + "The computation takes about eight tenths of the track's length on a graphics card.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [
      { nom: "Voix", nomEn: "Voice", type: "audio" },
      { nom: "Accompagnement", nomEn: "Backing", type: "audio" },
    ],
    parametres: [PARAMETRE_CALCUL],
    async executer(ctx) {
      const buffer = entreeAudio(ctx, 0, { sorties: 2 });
      const pont = api();
      if (!pont?.roformerSeparer) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      if (sansEntree(buffer)) return buffer;

      const frequenceDOrigine = buffer.sampleRate;
      const audio = await octetsWav(await aLaFrequence(buffer, FREQUENCE_MODELE));
      if (!audio) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      await annoncerModele(ctx, "isoler-voix", traduire("progress.chargement_du_mod_le"));
      const debrancher = suivre(ctx);
      try {
        let r: { ok: boolean; pistes?: Record<string, Uint8Array>; releves?: { rtf: number | null }; journal?: string };
        try {
          r = await pont.roformerSeparer({ audio, calcul: ctx.paramTexte("Calcul", "").trim() }) as typeof r;
        } catch (erreur) {
          return { valeurs: [null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
        }
        if (!r.ok || !r.pistes) {
          return { valeurs: [null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
        }

        const { decoderBlob } = await import("../audio");
        const rendre = async (octets: Uint8Array) => aLaFrequence(
          await decoderBlob(new Blob([new Uint8Array(octets)]), ctx.runtime), frequenceDOrigine,
        );
        return {
          valeurs: [await rendre(r.pistes.vocals), await rendre(r.pistes.instrumental)],
          message: traduire("msg.separerVoix.rendu", (r.releves?.rtf ?? 0).toFixed(2)),
        };
      } finally {
        debrancher();
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
