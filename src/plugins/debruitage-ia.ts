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
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import {
  debruiterParTrames, planchecherDeBruit, GTCRN_BINS, GTCRN_SAMPLE_RATE,
} from "../audio/gtcrn";

const rmsGlobal = (a: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
};

/** Formes des trois caches, relevées sur la signature de l'ONNX. */
const FORMES_CACHE = {
  conv_cache: [2, 1, 16, 16, 33],
  tra_cache: [2, 3, 1, 1, 16],
  inter_cache: [2, 1, 33, 16],
} as const;

const tailleCache = (forme: readonly number[]) => forme.reduce((a, b) => a * b, 1);

async function resamplerMono(buffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === 1) return buffer;
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

export const fiches: FicheAudio[] = ([
  {
    id: "debruitage-ia", nom: "Débruitage IA", nomEn: "AI Denoise",
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
        doc: "Le modèle travaille à 16 kHz. « Fréquence d'origine » rééchantillonne le résultat vers la fréquence d'entrée pour rester raccordable au reste du graphe — sans pour autant restituer les aigus au-dessus de 8 kHz, que le modèle n'a jamais vus. « 16 kHz du modèle » rend le signal tel qu'il sort, sans second rééchantillonnage.",
        docEn: "The model works at 16 kHz. « Original rate » resamples the result back to the input rate so it stays connectable to the rest of the graph — without restoring anything above 8 kHz, which the model never saw. « Model 16 kHz » returns the signal as it comes out, with no second resampling." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucun_audio_connect") };
      }

      const force = ctx.paramNombre("Force", 100) / 100;
      const rendreOrigine = ctx.paramTexte("Sortie", "origine") !== "modele";

      ctx.onProgress(traduire("progress.debruitage.chargement_modele"));
      const { preparerSession } = await import("../ia");
      const reponse = await fetch("oonx/gtcrn.onnx");
      if (!reponse.ok) {
        return { valeurs: [null], erreur: true, message: traduire("msg.debruitage.modele_absent") };
      }
      // CPU (WASM) explicitement, et non « Auto ».
      //
      // « Auto » essaie WebGPU d'abord. Mesuré ici sur 3 s d'audio, avec le même
      // modèle et le même signal : WASM prend 0,58 s et rend un gain de 7,8 dB de
      // rapport signal/bruit ; WebGPU prend 41,4 s — 71 fois plus — et rend un
      // signal ENTIÈREMENT NUL, sans lever d'erreur. Deux raisons de ne pas lui
      // laisser la main : le résultat est faux, et le profil de calcul lui est
      // hostile. GTCRN pèse 344 ko et se déroule image par image ; on l'appelle
      // 62 fois par seconde d'audio, sur des tenseurs minuscules. Le coût est
      // alors celui des allers-retours vers le GPU, pas celui du calcul.
      const session = await preparerSession(await reponse.arrayBuffer(), "CPU (WASM)", "gtcrn");
      const ort = await import("onnxruntime-web");

      ctx.onProgress(traduire("progress.debruitage.reechantillonnage"));
      const mono = await resamplerMono(entree, GTCRN_SAMPLE_RATE);
      const signal = mono.getChannelData(0);

      // Les caches sont l'état récurrent du modèle : ils se passent d'une trame à
      // la suivante, et repartent de zéro pour chaque piste. Les oublier ferait un
      // débruitage sans mémoire, donc sans la moindre tenue temporelle.
      let convCache = new ort.Tensor("float32", new Float32Array(tailleCache(FORMES_CACHE.conv_cache)), FORMES_CACHE.conv_cache as unknown as number[]);
      let traCache = new ort.Tensor("float32", new Float32Array(tailleCache(FORMES_CACHE.tra_cache)), FORMES_CACHE.tra_cache as unknown as number[]);
      let interCache = new ort.Tensor("float32", new Float32Array(tailleCache(FORMES_CACHE.inter_cache)), FORMES_CACHE.inter_cache as unknown as number[]);

      const debruite = await debruiterParTrames(
        signal,
        async (spectre) => {
          const r = await session.run({
            mix: new ort.Tensor("float32", spectre, [1, GTCRN_BINS, 1, 2]),
            conv_cache: convCache, tra_cache: traCache, inter_cache: interCache,
          });
          convCache = r.conv_cache_out as any;
          traCache = r.tra_cache_out as any;
          interCache = r.inter_cache_out as any;
          return r.enh.data as Float32Array;
        },
        {
          force,
          surProgres: (f) => ctx.onProgress(traduire("progress.debruitage.var_0", Math.round(f * 100))),
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
        ? 20 * Math.log10(Math.max(1e-9, planchApres) / planchAvant)
        : 0;
      return {
        valeurs: [sortie],
        message: traduire(
          "msg.debruitage.var_0_var_1_var_2",
          baisse.toFixed(1),
          (20 * Math.log10(Math.max(1e-9, rmsGlobal(debruite)) / Math.max(1e-9, rmsGlobal(signal)))).toFixed(1),
          sortie.sampleRate === GTCRN_SAMPLE_RATE ? "16 kHz" : `${(sortie.sampleRate / 1000).toFixed(1)} kHz`,
        ),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
