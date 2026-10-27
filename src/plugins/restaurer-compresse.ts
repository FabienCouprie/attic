// plugins/restaurer-compresse.ts — Réparer ce qu'un encodage à bas débit a abîmé.
//
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS. Mesuré le 2026-10-22, et les deux moitiés comptent
// autant l'une que l'autre.
//
//   IL RÉPARE DES ARTEFACTS. Sur un dommage de codec fabriqué — les magnitudes d'une transformée
//   à court terme quantifiées bande par bande, le budget se resserrant vers l'aigu comme dans un
//   vrai codec —, la distance log-spectrale à l'original passe de 0,4329 à 0,3389.
//
//   IL N'ÉTEND PAS LA BANDE. Sur une coupe franche à 8 kHz, il remet 0,0092 % de l'énergie là où
//   1,0837 % manquent, soit moins d'un pour cent du trou. Ce n'est pas un extenseur de bande, et
//   la notice le dit plutôt que de laisser l'espérer.
//
// LE TÉMOIN DE CONTRÔLE EST CE QUI REND LE PREMIER CHIFFRE LISIBLE, et il faut le garder en tête
// pour comprendre le réglage « Dosage ». Passer l'ORIGINAL par Apollo donne une distance de 0,3233 :
// il imprime donc sa propre couleur à n'importe quel signal, abîmé ou non. Du dommage au-dessus de
// ce plancher il efface 86 %, mais il ne rend jamais le son d'avant exactement. D'où le dosage,
// qui mélange le rendu au son reçu : il permet de prendre la réparation sans prendre toute la
// couleur.
//
// QUARANTE-QUATRE MILLE CENT HERTZ, ET RIEN D'AUTRE : le moteur refuse toute autre cadence. Le
// composant descend donc le son et le ramène à la cadence reçue, par la même pièce que « Isoler la
// voix », qui porte la même contrainte.
import { plafonnerCrete } from "../audio/commun";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { octetsWav } from "./chanson-aides";
import { aLaFrequence, FREQUENCE_MODELE } from "./isoler-voix";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { messageEchecPont } from "./pont-electron";
import { parametreCalcul } from "./parametre-calcul";
import { relayerProgression } from "./progression-pont";
import type { ContexteDeRelais } from "./progression-pont";

const CANAL = "apollo:restaurer";

const api = () => (globalThis as unknown as { api?: Record<string, (...a: unknown[]) => Promise<unknown>> }).api;

/** Branche l'avancement du moteur sur celui du nœud, et rend de quoi se débrancher. */
function suivre(ctx: ContexteDeRelais) {
  return relayerProgression(ctx, api()?.apolloProgression);
}

/** Le mélange du rendu et du son reçu, canal par canal, à la longueur commune la plus courte. */
export function doser(recu: AudioBuffer, rendu: AudioBuffer, part: number): AudioBuffer {
  // UN DOSAGE NON FINI VAUT LE DÉFAUT DU RÉGLAGE, et non NaN. `Math.min` et `Math.max` propagent
  // NaN, de sorte qu'un borne naïf rendait un tampon entier d'échantillons non finis — ce que le
  // banc multicanal cherche précisément, et ce que le cas de ce fichier a attrapé. Le repli est un
  // parce que c'est ce que `paramNombre("Dosage", 100)` rend déjà quand le réglage manque.
  const p = Number.isFinite(part) ? Math.max(0, Math.min(1, part)) : 1;
  const canaux = Math.max(recu.numberOfChannels, rendu.numberOfChannels);
  const longueur = Math.min(recu.length, rendu.length);
  const sortie = new AudioBuffer({
    numberOfChannels: canaux, length: Math.max(1, longueur), sampleRate: recu.sampleRate });
  for (let c = 0; c < canaux; c++) {
    // UN CANAL QUE LE MOTEUR N'A PAS RENDU PREND LE SIEN : il rend du mono pour du mono et du
    // stéréo pour du stéréo, mais rien ne garantit qu'il en sera toujours ainsi, et un canal
    // manquant doit laisser passer le son reçu plutôt que du silence.
    const a = recu.getChannelData(Math.min(c, recu.numberOfChannels - 1));
    const b = rendu.getChannelData(Math.min(c, rendu.numberOfChannels - 1));
    const dst = sortie.getChannelData(c);
    for (let i = 0; i < longueur; i++) dst[i] = a[i] * (1 - p) + b[i] * p;
  }
  return sortie;
}

export const fiches = ([
  {
    id: "restaurer-compresse", nom: "Restaurer un son compressé", nomEn: "Restore compressed audio",
    univers: "Traitement", famille: "Débruitage",
    resume: "Répare les artefacts qu'un encodage à bas débit laisse dans un enregistrement.",
    resumeEn: "Repairs the artifacts a low-bitrate encoding leaves in a recording.",
    notice: "Ce composant répare ce qu'un encodage à bas débit a abîmé : le grain, le sifflement et "
      + "le flou que laisse un fichier très compressé.\n\n"
      + "Il ne rend pas la bande qui manque. Mesuré sur une piste coupée net à 8 kHz, il y remet moins "
      + "d'un pour cent de l'énergie absente : un son dont l'aigu a disparu ne le retrouvera pas ici. "
      + "Ce qu'il répare, ce sont les artefacts de la bande qui reste.\n\n"
      + "« Dosage » mélange le rendu au son reçu. À cent pour cent, le son est entièrement celui du "
      + "moteur, qui imprime sa propre couleur même à un son sain ; plus bas, on prend une part de la "
      + "réparation en gardant le reste du son d'origine. C'est le réglage à baisser quand le résultat "
      + "paraît lissé.\n\n"
      + "« Tranche » découpe les longs fichiers. À zéro, le fichier passe d'un seul coup, ce qui donne "
      + "le meilleur résultat et demande le plus de mémoire. Une tranche de quelques dizaines de "
      + "secondes permet de traiter une pièce entière sur une petite carte ; les tranches se recouvrent "
      + "et se fondent, de sorte que les coutures ne s'entendent pas.\n\n"
      + "« Calcul » nomme le périphérique employé.\n\n"
      + "Le moteur travaille à 44 100 Hz et n'accepte rien d'autre : le son y est amené puis ramené à "
      + "sa cadence d'origine, dont la durée ne change pas.",
    noticeEn: "This component repairs what a low-bitrate encoding has damaged: the grain, the hiss and "
      + "the blur a heavily compressed file leaves behind.\n\n"
      + "It does not give back the missing band. Measured on a track cut sharply at 8 kHz, it puts back "
      + "less than one percent of the absent energy: a sound whose treble has gone will not find it "
      + "here. What it repairs are the artifacts of the band that remains.\n\n"
      + "« Amount » blends the result with the received sound. At one hundred percent the sound is "
      + "entirely the engine's, which imprints its own colour even on a healthy sound; lower, one takes "
      + "part of the repair while keeping the rest of the original. This is the setting to lower when "
      + "the result seems smoothed.\n\n"
      + "« Chunk » splits long files. At zero the file goes through in one pass, which gives the best "
      + "result and asks the most memory. A chunk of a few tens of seconds allows a whole piece to be "
      + "processed on a small card; chunks overlap and crossfade, so the seams are not heard.\n\n"
      + "« Compute » names the device used.\n\n"
      + "The engine works at 44 100 Hz and accepts nothing else: the sound is brought there and "
      + "returned to its original rate, with its duration unchanged.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Dosage", nomEn: "Amount", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "La part du rendu dans le son final. À cent, le son est entièrement celui du moteur, qui imprime sa couleur même à un son sain. À zéro, le son reçu ressort inchangé et le moteur tourne pour rien.",
        docEn: "The share of the result in the final sound. At one hundred, the sound is entirely the engine's, which imprints its colour even on a healthy sound. At zero, the received sound comes out unchanged and the engine runs for nothing." },
      { nom: "Tranche", nomEn: "Chunk", type: "nombre", plage: [0, 120], pas: 1, defaut: 0, unite: "s",
        doc: "La durée des tranches traitées séparément. À zéro, le fichier passe d'un seul coup : meilleur résultat, plus de mémoire. Les tranches se recouvrent d'une seconde et se fondent.",
        docEn: "The duration of the chunks processed separately. At zero, the file goes through in one pass: better result, more memory. Chunks overlap by one second and crossfade." },
      parametreCalcul(
        "Il change le temps de calcul et non le son rendu, mesuré identique à la quatrième décimale entre le processeur et la carte.",
        "It changes the compute time and not the returned sound, measured identical to the fourth decimal between processor and card."),
    ],
    async executer(ctx: any) {
      const pont = api();
      if (!pont?.apolloRestaurer) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.n_cessite_electron") };
      }
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      const frequenceDOrigine = buffer.sampleRate;
      const audio = await octetsWav(await aLaFrequence(buffer, FREQUENCE_MODELE));
      if (!audio) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.aucune_entr_e_audio") };
      }

      await annoncerModele(ctx, "restaurer-compresse", traduire("progress.apollo.modele"));
      const debrancher = suivre(ctx);
      let r: { ok: boolean; audio?: Uint8Array; releves?: { rtf: number | null }; journal?: string };
      try {
        r = await pont.apolloRestaurer({
          audio,
          tranche: ctx.paramNombre("Tranche", 0),
          calcul: ctx.paramTexte("Calcul", "").trim(),
        }) as typeof r;
      } catch (erreur) {
        return { valeurs: [null, null], erreur: true, message: messageEchecPont(erreur, CANAL) };
      } finally {
        debrancher();
      }
      if (!r.ok || !r.audio) {
        return { valeurs: [null, null], erreur: true, message: (r.journal ?? "").slice(-240) };
      }

      const { decoderBlob } = await import("../audio");
      const rendu = await decoderBlob(new Blob([new Uint8Array(r.audio)]), ctx.runtime);
      const part = ctx.paramNombre("Dosage", 100) / 100;
      const aLaBonneCadence = await aLaFrequence(rendu, frequenceDOrigine);
      const sortie = plafonnerCrete(doser(buffer, aLaBonneCadence, part));

      const rtf = r.releves?.rtf;
      const rapport = [
        traduire("msg.apollo.dosage", String(Math.round(part * 100))),
        traduire("msg.apollo.cadence", String(FREQUENCE_MODELE), String(frequenceDOrigine)),
        rtf == null ? "" : traduire("msg.apollo.vitesse", rtf.toFixed(3)),
      ].filter(Boolean).join("\n");

      return {
        valeurs: [sortie, rapport],
        message: `${Math.round(part * 100)} %${rtf == null ? "" : ` · RTF ${rtf.toFixed(2)}`}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
