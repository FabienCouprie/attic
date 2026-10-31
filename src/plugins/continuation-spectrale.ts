// plugins/continuation-spectrale.ts — Deux nœuds de prolongation d'une piste
// par prédiction autoregressive sur son spectrogramme (famille Test zone).
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { appliquerContinuationSpectrale, type ContinuationSpectraleResultat } from "../audio/continuation-spectrale";
import { choixFenetre } from "../audio/fenetres-analyse";

const PARAMETRES_COMMUNS = [
  {
    nom: "Durée générée", nomEn: "Generated duration", type: "curseur",
    plage: [1, 60], pas: 1, defaut: 5, unite: "s",
    doc: "Durée de la prolongation à générer, en secondes.",
    docEn: "Duration of the continuation to generate, in seconds.",
  },
  {
    nom: "FFT", nomEn: "FFT", type: "choix",
    ...choixFenetre([512, 1024, 2048, 4096]),
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
    doc: "Nombre maximal d'époques d'entraînement. Avec « Budget » à 0, le nombre d'époques est borné d'après la taille du calcul ; avec un budget positif, l'entraînement s'arrête quand ce temps est écoulé.",
    docEn: "Maximum number of training epochs. With « Budget » at 0, the number of epochs is bounded by the size of the computation; with a positive budget, training stops once that time has elapsed.",
  },
  {
    nom: "Apprentissage", nomEn: "Learning rate", type: "nombre", plage: [0.0001, 0.01], pas: 0.0001, defaut: 0.001, unite: "",
    doc: "Taux d'apprentissage de l'optimiseur Adam.",
    docEn: "Adam optimizer learning rate.",
  },
  {
    nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 1, unite: "",
    doc: "Graine pour l'initialisation des poids. Même piste, mêmes réglages et même graine rendent le même résultat avec « Budget » à 0. Avec un budget positif qui arrête l'entraînement, le point d'arrêt dépend de la machine et deux passes diffèrent ; le message le dit alors.",
    docEn: "Seed for weight initialization. Same track, same settings and same seed give the same result with « Budget » at 0. With a positive budget that stops training, the stopping point depends on the machine and two passes differ; the message says so when that happens.",
  },
  {
    nom: "Budget", nomEn: "Budget", type: "nombre", plage: [0, 300000], pas: 1000, defaut: 0, unite: "ms",
    doc: "Budget temps d'entraînement en millisecondes. 0 = automatique : le nombre d'époques est borné d'après la taille du calcul, et le résultat est reproductible. Un budget positif qui interrompt l'entraînement rend le résultat non reproductible, le point d'arrêt dépendant de la machine ; voir « Graine ».",
    docEn: "Training time budget in milliseconds. 0 = automatic: the number of epochs is bounded by the size of the computation, and the result is reproducible. A positive budget that interrupts training makes the result non reproducible, the stopping point depending on the machine; see « Seed ».",
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
    epochs,
    learningRate,
    seed,
    budgetMs: budget,
    onProgress: ctx.onProgress,
    signal: ctx.signal,
  }).then((result: ContinuationSpectraleResultat) => {
    const dureeTexte = result.dureeGenereeS.toFixed(2);
    const key = mode === "ar" ? "msg.continuation_ar_terminee_var_0_epochs_var_1_s" : "msg.continuation_lstm_terminee_var_0_epochs_var_1_s";
    // LE MESSAGE DIT CE QUI A ÉTÉ FAIT, ET NON CE QUI A ÉTÉ DEMANDÉ. Il affichait le réglage
    // « Époques », si bien qu'un entraînement coupé par le budget au bout de quelques époques
    // s'annonçait « 100 époques » ; et il jetait l'avertissement de divergence que le module
    // composait. La documentation de « Graine » promettait pourtant que le message dirait l'arrêt
    // sur budget. Relevé le 2026-10-27.
    const faites = [...new Set(result.epochsFaites)].join(", ");
    let message = traduire(key, `${faites}/${result.epochs}`, dureeTexte);
    if (result.arreteParBudget) message += traduire("msg.continuation.arret_budget");
    if (result.canauxDiverges.length > 0) {
      message += traduire("msg.continuation.divergence", result.canauxDiverges.map((c) => c + 1).join(", "));
    }
    return { valeurs: [result.audio], message };
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
    id: "continuation-spectrale-lstm", nomDicte: "continuation du spectre",
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
