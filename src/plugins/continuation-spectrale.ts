// plugins/continuation-spectrale.ts — Deux nœuds de prolongation d'une piste
// par prédiction autoregressive sur son spectrogramme (famille Test zone).
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { appliquerContinuationSpectrale, type ContinuationSpectraleResultat } from "../audio/continuation-spectrale";

const PARAMETRES_COMMUNS = [
  {
    nom: "Durée générée", nomEn: "Generated duration", type: "curseur",
    plage: [1, 60], pas: 1, defaut: 5, unite: "s",
    doc: "Durée de la prolongation à générer, en secondes.",
    docEn: "Duration of the continuation to generate, in seconds.",
  },
  {
    nom: "FFT", nomEn: "FFT", type: "choix",
    options: ["512", "1024", "2048", "4096"],
    optionsEn: ["512", "1024", "2048", "4096"],
    optionIds: ["512", "1024", "2048", "4096"],
    defaut: "2048", defautEn: "2048",
    doc: "Taille de la fenêtre FFT. Détermine la résolution fréquentielle et le nombre de bins.",
    docEn: "FFT window size. Determines frequency resolution and number of bins.",
  },
  {
    nom: "Hop", nomEn: "Hop", type: "nombre", plage: [10, 100], pas: 1, defaut: 25, unite: "%",
    doc: "Saut entre deux fenêtres consécutives, en pourcentage de la taille FFT. 25 % = 75 % de recouvrement.",
    docEn: "Hop size between consecutive windows, as a percentage of FFT size. 25% = 75% overlap.",
  },
  {
    nom: "Historique", nomEn: "History", type: "nombre", plage: [1, 32], pas: 1, defaut: 4, unite: "frames",
    doc: "Nombre de frames passées utilisées pour prédire la frame suivante. Plus c'est grand, plus le contexte est long (mais plus lourd à entraîner).",
    docEn: "Number of past frames used to predict the next frame. Larger = more context (but heavier to train).",
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
    doc: "Budget temps d'entraînement en millisecondes. 0 = automatique.",
    docEn: "Training time budget in milliseconds. 0 = automatic.",
  },
] as const;

const PARAMETRES_LSTM = [
  {
    nom: "Unités cachées", nomEn: "Hidden units", type: "nombre", plage: [16, 512], pas: 16, defaut: 128, unite: "",
    doc: "Nombre d'unités cachées de la couche LSTM. Plus c'est grand, plus le modèle peut mémoriser de contexte (mais plus lent).",
    docEn: "Number of hidden units in the LSTM layer. Larger = more context memory (but slower).",
  },
] as const;

function executerContinuation(mode: "ar" | "lstm", ctx: any) {
  const audio = ctx.entree(0);
  if (!(audio instanceof AudioBuffer)) {
    return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
  }
  const fftSize = parseInt(ctx.paramTexte("FFT", "2048"), 10);
  const hopPercent = ctx.paramNombre("Hop", 25);
  const dureeGenereS = ctx.paramNombre("Durée générée", 5);
  const history = ctx.paramNombre("Historique", 4);
  const epochs = ctx.paramNombre("Époques", 100);
  const learningRate = ctx.paramNombre("Apprentissage", 0.001);
  const seed = ctx.paramNombre("Graine", 1);
  const budget = ctx.paramNombre("Budget", 0);

  return appliquerContinuationSpectrale(audio, {
    mode,
    fftSize,
    hopPercent,
    dureeGenereS,
    history,
    hiddenUnits: mode === "lstm" ? ctx.paramNombre("Unités cachées", 128) : 0,
    activation: "relu",
    epochs,
    learningRate,
    seed,
    budgetMs: budget,
    onProgress: ctx.onProgress,
    signal: ctx.signal,
  }).then((result: ContinuationSpectraleResultat) => {
    const dureeTexte = result.dureeGenereeS.toFixed(2);
    const key = mode === "ar" ? "msg.continuation_ar_terminee_var_0_epochs_var_1_s" : "msg.continuation_lstm_terminee_var_0_epochs_var_1_s";
    return { valeurs: [result.audio], message: traduire(key, String(result.epochs), dureeTexte) };
  });
}

export const fiches: FicheAudio[] = ([
  {
    id: "continuation-spectrale-ar",
    nom: "Continuation AR",
    nomEn: "AR Continuation",
    univers: "Autres",
    famille: "Test zone",
    resume: "Prolonge une piste en prédissant chaque frame spectrale à partir des frames précédentes par un modèle autoregressif linéaire.",
    resumeEn: "Extends a track by predicting each spectral frame from previous frames using a linear autoregressive model.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: PARAMETRES_COMMUNS,
    async executer(ctx: any) {
      return executerContinuation("ar", ctx);
    },
  },
  {
    id: "continuation-spectrale-lstm",
    nom: "Continuation LSTM",
    nomEn: "LSTM Continuation",
    univers: "Autres",
    famille: "Test zone",
    resume: "Prolonge une piste par un petit réseau récurrent (LSTM) entraîné à la volée sur les frames de son spectrogramme.",
    resumeEn: "Extends a track by a small recurrent network (LSTM) trained on the fly on its spectrogram frames.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [...PARAMETRES_COMMUNS, ...PARAMETRES_LSTM],
    async executer(ctx: any) {
      return executerContinuation("lstm", ctx);
    },
  },
] as FicheAudio[]).map(avecDoc);
