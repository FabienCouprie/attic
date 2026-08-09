// plugins/pca-neuronale.ts — Nœud PCA neuronale (Autres → Test zone).
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { appliquerPcaNeuronale } from "../audio/pca-neuronale";

export const fiches: FicheAudio[] = ([
  {
    id: "pca-neuronale",
    nom: "PCA neuronale",
    nomEn: "Neural PCA",
    univers: "Autres",
    famille: "Test zone",
    resume: "Entraîne un autoencodeur non linéaire sur le spectrogramme d'une piste pour en filtrer la texture et la resynthétiser.",
    resumeEn: "Trains a non-linear autoencoder on a track's spectrogram to filter its texture and resynthesize it.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "FFT", nomEn: "FFT", type: "choix",
        options: ["512", "1024", "2048", "4096"],
        optionsEn: ["512", "1024", "2048", "4096"],
        optionIds: ["512", "1024", "2048", "4096"],
        defaut: "2048", defautEn: "2048",
        doc: "Taille de la fenêtre FFT (puissance de 2). Détermine le nombre de bins fréquentiels.",
        docEn: "FFT window size (power of 2). Determines the number of frequency bins.",
      },
      {
        nom: "Hop", nomEn: "Hop", type: "nombre", plage: [10, 100], pas: 1, defaut: 25, unite: "%",
        doc: "Saut entre deux fenêtres consécutives, en pourcentage de la taille FFT. 25 % = 75 % de recouvrement.",
        docEn: "Hop size between consecutive windows, as a percentage of FFT size. 25% = 75% overlap.",
      },
      {
        nom: "Axes", nomEn: "Axes", type: "nombre", plage: [1, 1024], pas: 1, defaut: 64, unite: "",
        doc: "Nombre d'axes de l'espace latent (goulot de l'autoencodeur).",
        docEn: "Number of axes in the latent space (autoencoder bottleneck).",
      },
      {
        nom: "Couches", nomEn: "Layers", type: "nombre", plage: [1, 6], pas: 1, defaut: 2, unite: "",
        doc: "Nombre de couches cachées entre l'entrée et l'espace latent. Les tailles sont déduites par interpolation géométrique.",
        docEn: "Number of hidden layers between input and latent space. Sizes are derived by geometric interpolation.",
      },
      {
        nom: "Activation", nomEn: "Activation", type: "choix",
        options: ["ReLU", "Tanh"],
        optionsEn: ["ReLU", "Tanh"],
        optionIds: ["relu", "tanh"],
        defaut: "ReLU", defautEn: "ReLU",
        doc: "Fonction d'activation des couches cachées.",
        docEn: "Hidden layer activation function.",
      },
      {
        nom: "Époques", nomEn: "Epochs", type: "nombre", plage: [1, 1000], pas: 1, defaut: 100, unite: "",
        doc: "Nombre maximal d'époques d'entraînement. Le budget-temps peut arrêter plus tôt.",
        docEn: "Maximum number of training epochs. Time budget may stop earlier.",
      },
      {
        nom: "Apprentissage", nomEn: "Learning rate", type: "nombre", plage: [0.0001, 0.01], pas: 0.0001, defaut: 0.001, unite: "",
        doc: "Taux d'apprentissage de l'optimiseur Adam.",
        docEn: "Adam optimizer learning rate.",
      },
      {
        nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 99999], pas: 1, defaut: 1, unite: "",
        doc: "Graine pour l'initialisation des poids. Même piste + mêmes réglages + même graine = même résultat.",
        docEn: "Seed for weight initialization. Same track + same settings + same seed = same result.",
      },
      {
        nom: "Budget", nomEn: "Budget", type: "nombre", plage: [0, 300000], pas: 1000, defaut: 0, unite: "ms",
        doc: "Budget temps d'entraînement en millisecondes. 0 = automatique (dépend de n_frames × n_bins).",
        docEn: "Training time budget in milliseconds. 0 = automatic (depends on n_frames × n_bins).",
      },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const fftSize = parseInt(ctx.paramTexte("FFT", "2048"), 10);
      const hopPercent = ctx.paramNombre("Hop", 25);
      const latentDim = ctx.paramNombre("Axes", 64);
      const hiddenLayers = ctx.paramNombre("Couches", 2);
      const activation = ctx.paramTexte("Activation", "relu") as "relu" | "tanh";
      const epochs = ctx.paramNombre("Époques", 100);
      const learningRate = ctx.paramNombre("Apprentissage", 0.001);
      const seed = ctx.paramNombre("Graine", 1);
      const budget = ctx.paramNombre("Budget", 0);

      const { audio: out, message } = await appliquerPcaNeuronale(audio, {
        fftSize,
        hopPercent,
        latentDim,
        hiddenLayers,
        activation,
        epochs,
        learningRate,
        seed,
        budgetMs: budget,
        onProgress: ctx.onProgress,
        signal: ctx.signal,
      });
      return { valeurs: [out], message };
    },
  },
] as FicheAudio[]).map(avecDoc);
