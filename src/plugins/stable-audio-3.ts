// plugins/stable-audio-3.ts — Nœud de génération musicale texte→audio via
// Stable Audio 3 small-music (ONNX Runtime). Le pipeline lourd (T5 + DiT +
// décodeur) tourne dans le process principal pour éviter les limites mémoire
// du WASM et charger les fichiers depuis le disque.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "stable-audio-3",
    nom: "Stable Audio 3",
    nomEn: "Stable Audio 3",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère de la musique stéréo à partir d’un prompt texte via Stable Audio 3 (ONNX).",
    resumeEn: "Generates stereo music from a text prompt using Stable Audio 3 (ONNX).",
    entrees: [{ nom: "Prompt", nomEn: "Prompt", type: "texte", requis: false }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      {
        nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "A rhythmic electronic loop with deep bass and crisp drums",
        doc: "Description textuelle de la musique à générer (en anglais pour de meilleurs résultats).",
        docEn: "Text description of the music to generate (English for best results).", defautEn: "A rhythmic electronic loop with deep bass and crisp drums",
     },
      {
        nom: "Durée", nomEn: "Duration", type: "curseur", plage: [3, 30], pas: 1, defaut: 10, unite: "s",
        doc: "Durée de l’audio généré (secondes). Le modèle ajoute 6 s de marge interne.",
        docEn: "Duration of the generated audio (seconds). The model adds 6 s of internal headroom.",
     },
      {
        nom: "Étapes", nomEn: "Steps", type: "curseur", plage: [1, 20], pas: 1, defaut: 8,
        doc: "Nombre d’étapes du sampler ping-pong. 8 = compromis qualité/vitesse.",
        docEn: "Number of ping-pong sampler steps. 8 = quality/speed sweet spot.",
     },
      {
        nom: "Graine", nomEn: "Seed", type: "curseur", plage: [-1, 999999], pas: 1, defaut: -1,
        doc: "Graine aléatoire. -1 = aléatoire.",
        docEn: "Random seed. -1 = random.",
     },
      {
        nom: "Chemin modèle", nomEn: "Model path", type: "dossier", defaut: "", defautEn: "",
        doc: "Chemin absolu ou relatif du bundle Stable Audio 3 (vide = modèle embarqué public/oonx/stable-audio-3-small-music).",
        docEn: "Absolute or relative path of the Stable Audio 3 bundle (empty = bundled public/oonx/stable-audio-3-small-music).",
      },
    ],
    async executer(ctx: any) {
      const api = typeof window !== "undefined" ? (window as any).api : null;
      if (!api?.genererStableAudio3) {
        return { valeurs: [null], erreur: true, message: traduire("msg.stable_audio_3_n_cessite_l_application_de_bureau") };
      }

      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "A rhythmic electronic loop with deep bass and crisp drums");
      const seconds = ctx.paramNombre("Durée", 10);
      const steps = ctx.paramNombre("Étapes", 8);
      let seed = ctx.paramNombre("Graine", -1);
      if (seed < 0) seed = Math.floor(Math.random() * 1_000_000);
      const modelPath = ctx.paramTexte("Chemin modèle", "");

      ctx.onProgress(traduire("progress.g_n_ration_stable_audio_3_en_cours_cela_peut_prendre_plusieu"));

      try {
        const rep = await api.genererStableAudio3({ prompt, seconds, steps, seed, modelPath });
        if (!rep?.ok) {
          return { valeurs: [null], erreur: true, message: traduire("msg.erreur_stable_audio_3_var_0", rep?.erreur ?? "inconnue") };
        }
        const length = rep.left?.length ?? 0;
        if (length === 0) {
          return { valeurs: [null], erreur: true, message: traduire("msg.stable_audio_3_a_retourn_un_audio_vide") };
        }
        const buf = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: rep.sampleRate });
        buf.copyToChannel(new Float32Array(rep.left), 0);
        buf.copyToChannel(new Float32Array(rep.right), 1);
        return {
          valeurs: [buf],
          message: traduire("msg.stable_audio_3_var_0_s_var_1_tapes_seed_var_2", seconds, steps, seed),
        };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: traduire("msg.erreur_stable_audio_3_var_0", err?.message ?? err) };
      }
   },
 },
] as FicheAudio[]).map(avecDoc);
