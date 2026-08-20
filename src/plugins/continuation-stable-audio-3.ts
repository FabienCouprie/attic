// plugins/continuation-stable-audio-3.ts — Nœud de continuation audio via Stable Audio 3 small-music.
// Le pipeline (encodeur + T5 + DiT + décodeur) tourne dans le process principal Electron
// (onnxruntime-node) pour pouvoir charger les gros modèles ONNX depuis le disque.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

const SAMPLE_RATE = 44100;

async function resamplerVers(buffer: AudioBuffer, sampleRate: number, numberOfChannels: number): Promise<AudioBuffer> {
  if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === numberOfChannels) {
    return buffer;
  }
  const offline = new OfflineAudioContext(numberOfChannels, Math.ceil(buffer.duration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

export const fiches: FicheAudio[] = ([
  {
    id: "continuation-stable-audio-3",
    nom: "Continuation Stable Audio 3",
    nomEn: "Stable Audio 3 Continuation",
    univers: "Autres",
    famille: "Test zone",
    resume:
      "[EXPÉRIMENTAL] Prolonge une piste audio en conditionnant Stable Audio 3 small-music par son latent. Qualité limitée : l'encodeur int4 n'est pas parfaitement aligné avec le DiT. Le modèle ONNX (~640 Mo + encodeur) tourne dans le process principal.",
    resumeEn:
      "[EXPERIMENTAL] Extends an audio track by conditioning Stable Audio 3 small-music on its latent. Quality is limited: the int4 encoder is not perfectly aligned with the DiT. The ONNX model (~640 MB + encoder) runs in the main process.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Prompt", nomEn: "Prompt", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      {
        nom: "Durée générée",
        nomEn: "Generated duration",
        type: "curseur",
        plage: [1, 30],
        pas: 1,
        defaut: 5,
        unite: "s",
        doc: "Durée de la prolongation à générer, en secondes. La durée totale sera celle de l'entrée + cette valeur.",
        docEn: "Duration of the continuation to generate, in seconds. Total duration will be input + this value.",
      },
      {
        nom: "Étapes",
        nomEn: "Steps",
        type: "curseur",
        plage: [1, 20],
        pas: 1,
        defaut: 8,
        doc: "Nombre d'étapes du sampler ping-pong. 8 = compromis qualité/vitesse.",
        docEn: "Number of ping-pong sampler steps. 8 = quality/speed sweet spot.",
      },
      {
        nom: "Graine",
        nomEn: "Seed",
        type: "curseur",
        plage: [-1, 999999],
        pas: 1,
        defaut: -1,
        doc: "Graine aléatoire. -1 = aléatoire.",
        docEn: "Random seed. -1 = random.",
      },
      {
        nom: "Chemin modèle",
        nomEn: "Model path",
        type: "dossier",
        defaut: "",
        defautEn: "",
        doc: "Chemin absolu ou relatif du bundle Stable Audio 3 (vide = modèle embarqué public/oonx/stable-audio-3-small-music). L'encodeur audio (encoder_q4.onnx) doit aussi être présent.",
        docEn: "Absolute or relative path of the Stable Audio 3 bundle (empty = bundled public/oonx/stable-audio-3-small-music). The audio encoder (encoder_q4.onnx) must also be present.",
      },
    ],
    async executer(ctx: any) {
      const api = typeof window !== "undefined" ? (window as any).api : null;
      if (!api?.continuerStableAudio3) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.stable_audio_3_n_cessite_l_application_de_bureau") };
      }

      const audioEntree = ctx.entree(0);
      if (!(audioEntree instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e_audio") };
      }

      const promptEntree = ctx.entree(1);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "");
      const generatedSeconds = ctx.paramNombre("Durée générée", 5);
      const steps = ctx.paramNombre("Étapes", 8);
      let seed = ctx.paramNombre("Graine", -1);
      if (seed < 0) seed = Math.floor(Math.random() * 1_000_000);
      const modelPath = ctx.paramTexte("Chemin modèle", "");

      ctx.onProgress(traduire("progress.continuation_stable_audio_3_en_cours"));

      try {
        const audio441 = await resamplerVers(audioEntree, SAMPLE_RATE, 2);
        const left = audio441.getChannelData(0);
        const right = audio441.getChannelData(1);

        const rep = await api.continuerStableAudio3({
          audio: { channels: [left, right], sampleRate: SAMPLE_RATE },
          prompt,
          generatedSeconds,
          steps,
          seed,
          modelPath,
        });

        if (!rep?.ok) {
          return { valeurs: [null, null], erreur: true, message: traduire("msg.erreur_stable_audio_3_var_0", rep?.erreur ?? "inconnue") };
        }
        const length = rep.left?.length ?? 0;
        if (length === 0) {
          return { valeurs: [null, null], erreur: true, message: traduire("msg.stable_audio_3_a_retourn_un_audio_vide") };
        }
        const buf = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: rep.sampleRate });
        buf.copyToChannel(new Float32Array(rep.left), 0);
        buf.copyToChannel(new Float32Array(rep.right), 1);
        return {
          valeurs: [buf],
          message: traduire("msg.continuation_stable_audio_3_var_0_s_var_1_tapes_seed_var_2", generatedSeconds, steps, seed),
        };
      } catch (err: any) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.erreur_stable_audio_3_var_0", err?.message ?? err) };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
