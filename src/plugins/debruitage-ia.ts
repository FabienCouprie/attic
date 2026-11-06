// plugins/debruitage-ia.ts — Nœud « Débruitage IA (GTCRN) ».
//
// Débruitage appris, par opposition au nœud « Réduction de bruit » existant qui
// fait une soustraction spectrale et exige qu'on lui fournisse un profil capturé
// sur un passage silencieux. Ici, aucun profil : le modèle décide seul ce qui est
// voix et ce qui est bruit, y compris sur un bruit qui varie.
//
// GTCRN — Xiaobin-Rong/gtcrn, MIT, © 2024 Rong Xiaobin — pèse 344 ko et travaille
// à 16 kHz. Le rééchantillonnage aller-retour est donc inévitable, et il faut le
// dire : ce nœud est fait pour la PAROLE, et il plafonne le résultat à 8 kHz de
// bande. Sur de la musique, il retire aussi ce qui n'est pas de la voix.
//
// L'analyse/synthèse et la boucle de trames vivent dans audio/gtcrn.ts, testées.
import type { FicheAudio } from "../audio/types-domaine";
import { reechantillonnerParLeNavigateur } from "../audio/convertir-frequence";
import { traduire } from "../i18n";
import { annoncerModele } from "./message-modele";
import { entreeAudio, sansEntree } from "./lire-entree";
import { avecDoc } from "./notices";
import { planchecherDeBruit, GTCRN_SAMPLE_RATE } from "../audio/gtcrn";
import { lireModeleEmbarque } from "../modele-embarque";
import { fiches as fichesRestauration } from "./restaurer-compresse";
import { fiches as fichesPleurage } from "./correction-pleurage";
import { versDb } from "../audio/decibels";
import { inferer } from "./onnx-hors-fil";

const rmsGlobal = (a: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
};

async function resamplerMono(buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === 1) return buffer;
  return reechantillonnerParLeNavigateur(buffer, sampleRate, { canaux: 1 });
}

export const fiches: FicheAudio[] = ([
  {
    id: "debruitage-ia", nomDicte: "retirer le bruit", nom: "Débruitage IA", nomEn: "AI Denoise",
    univers: "Traitement", famille: "Effets",
    resume: "Débruite la parole avec le modèle GTCRN, sans profil de bruit à fournir.",
    resumeEn: "Denoises speech with the GTCRN model, with no noise profile to provide.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Force", nomEn: "Strength", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Dosage entre le signal débruité et l'original. 100 % = sortie du modèle seule. Descendre en dessous laisse revenir un peu de souffle et de réverbération, ce qui sonne souvent plus naturel sur une voix parlée que le silence total entre les mots.",
        docEn: "Blend between the denoised signal and the original. 100% = model output only. Going lower lets some hiss and reverb back in, which often sounds more natural on speech than total silence between words." },
      { nom: "Sortie", nomEn: "Output", type: "choix",
        options: ["Fréquence d'origine", "16 kHz du modèle"], optionsEn: ["Original rate", "Model 16 kHz"],
        optionIds: ["origine", "modele"], defaut: "Fréquence d'origine", defautEn: "Original rate",
        doc: "Le modèle travaille à 16 kHz. « Fréquence d'origine » rééchantillonne le résultat vers la fréquence d'entrée pour rester raccordable au reste du graphe, sans pour autant restituer les aigus au-dessus de 8 kHz, que le modèle n'a jamais vus. « 16 kHz du modèle » rend le signal tel qu'il sort, sans second rééchantillonnage.",
        docEn: "The model works at 16 kHz. « Original rate » resamples the result back to the input rate so it stays connectable to the rest of the graph, without restoring anything above 8 kHz, which the model never saw. « Model 16 kHz » returns the signal as it comes out, with no second resampling." },
    ],
    async executer(ctx) {
      const entree = entreeAudio(ctx, 0);
      if (sansEntree(entree)) return entree;

      const force = ctx.paramNombre("Force", 100) / 100;
      const rendreOrigine = ctx.paramTexte("Sortie", "origine") !== "modele";

      await annoncerModele(ctx, "debruitage-ia", traduire("progress.debruitage.chargement_modele"));
      // Par le processus principal dans l'app, et non par `fetch` : une fois
      // installée, `fetch("oonx/…")` cherche dans `resources/app/dist/oonx/`, où le
      // modèle n'est pas. C'était le défaut de la 3.2.0 — voir modele-embarque.ts.
      const octets = await lireModeleEmbarque("oonx/gtcrn.onnx");
      if (!octets) {
        return { valeurs: [null], erreur: true, message: traduire("msg.debruitage.modele_absent") };
      }

      ctx.onProgress(traduire("progress.debruitage.reechantillonnage"));
      const mono = await resamplerMono(entree, GTCRN_SAMPLE_RATE);
      const signal = mono.getChannelData(0);

      // HORS DU FIL : la session et la boucle de trames sont dans `audio/inference-onnx.ts`,
      // derrière le worker d'inférence ; le choix du processeur (WASM) y est écrit avec sa mesure.
      const debruite = await inferer<Float32Array>(
        { type: "debruiter-gtcrn", cle: "gtcrn", modele: octets, signal, force },
        {
          signal: ctx.signal,
          surAvancement: (f) => ctx.onProgress(traduire("progress.debruitage.var_0", Math.round(f * 100))),
        },
      );

      const a16 = new AudioBuffer({ numberOfChannels: 1, length: debruite.length, sampleRate: GTCRN_SAMPLE_RATE });
      a16.getChannelData(0).set(debruite);
      const sortie = rendreOrigine && entree.sampleRate !== GTCRN_SAMPLE_RATE
        ? await resamplerMono(a16, entree.sampleRate)
        : a16;

      // Le message chiffre le PLANCHER, pas le niveau global.
      //
      // Le niveau global ne dit rien d'utile ici : il est dominé par la parole,
      // qu'on veut justement préserver, et un débruitage réussi le fait à peine
      // bouger — mesuré sur le signal d'essai, −1,1 dB seulement, alors que le
      // bruit avait baissé d'un facteur 55. C'est le décile inférieur des trames
      // qui mesure ce que le modèle a retiré. Sans ce chiffre, « terminé » ne
      // permet pas de distinguer un modèle qui a agi d'un modèle sans effet — et
      // sur un enregistrement déjà propre, ne rien faire est le bon
      // comportement, pas une panne.
      const planchAvant = planchecherDeBruit(signal);
      const planchApres = planchecherDeBruit(debruite);
      const baisse = planchAvant > 1e-9
        ? versDb(Math.max(1e-9, planchApres) / planchAvant)
        : 0;
      return {
        valeurs: [sortie],
        message: traduire(
          "msg.debruitage.var_0_var_1_var_2",
          baisse.toFixed(1),
          (versDb(Math.max(1e-9, rmsGlobal(debruite)) / Math.max(1e-9, rmsGlobal(signal)))).toFixed(1),
          sortie.sampleRate === GTCRN_SAMPLE_RATE ? "16 kHz" : `${(sortie.sampleRate / 1000).toFixed(1)} kHz`,
        ),
      };
    },
  },
  // « RESTAURER UN SON COMPRESSÉ » EST VERSÉ ICI, et non dans `plugins/index.ts`, parce que la
  // norme de taille l'exige : l'index est en dette — plus de cinq cents lignes pour une liste
  // écrite à la main — et le garde de `generer-compte-lignes.test.ts` refuse qu'un fichier en dette
  // grossisse encore. « Ce qu'on ajoute à un fichier trop gros va ailleurs », dit son message. Le
  // composant est de cette famille, « Traitement → Débruitage », donc c'est ici son ailleurs, et
  // l'index le prend sans une ligne de plus par le `...f_debruitage_ia` qu'il porte déjà.
  ...(fichesRestauration as FicheAudio[]),
  // « CORRECTION DU PLEURAGE » EST VERSÉE ICI pour la même raison, et de la même famille.
  ...(fichesPleurage as FicheAudio[]),
] as FicheAudio[]).map(avecDoc);
