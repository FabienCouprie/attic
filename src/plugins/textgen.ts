// plugins/textgen.ts — Trois nodes de génération de texte :
// 1. DistilGPT-2 : génération par IA (anglais, GPT-2 small)
// 2. Réservoir textuel : émergence par réseau de neurones aléatoires
// 3. NLLB Multilingue : génération multilingue (français, espagnol…)

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { mulberry32 } from "../audio";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/textgen-worker.js", import.meta.url), { type: "module" });
  }
  return worker;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Réservoir textuel ───
// Un réseau de neurones aléatoires génère du texte par émergence :
// les activations sont mappées vers des lettres/mots. Aucun entraînement.

interface ReservoirTextuel {
  n: number;
  poidsRes: Float32Array;
  etats: Float32Array;
  leaking: number;
}

function creerReservoirTexte(n: number, connectivite: number, leaking: number, rng: () => number): ReservoirTextuel {
  const poidsRes = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && rng() < connectivite) poidsRes[i * n + j] = rng() * 2 - 1;
    }
  }
  // Normaliser
  let norm = 0;
  for (let i = 0; i < n * n; i++) norm += poidsRes[i] * poidsRes[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < n * n; i++) poidsRes[i] *= 0.9 / norm;
  return { n, poidsRes, etats: new Float32Array(n), leaking };
}

function stepReservoirTexte(res: ReservoirTextuel, entree: number): void {
  const n = res.n;
  const nouveaux = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let somme = 0;
    for (let j = 0; j < n; j++) somme += res.poidsRes[i * n + j] * res.etats[j];
    nouveaux[i] = (1 - res.leaking) * res.etats[i] + res.leaking * Math.tanh(somme + entree);
  }
  res.etats = nouveaux;
}

function genererTexteReservoir(
  graine: number,
  neurones: number,
  connectivite: number,
  memoire: number,
  nbMots: number,
  alphabet: string,
  seedWord: string,
): string {
  const rng = mulberry32(graine > 0 ? graine : Math.floor(Math.random() * 99999) + 1);
  const res = creerReservoirTexte(neurones, connectivite, memoire / 100, rng);

  let texte = seedWord ? seedWord + " " : "";
  let motCourant = "";
  let pasTotal = 0;
  let iterations = 0;
  const maxPas = nbMots * 8;
  const maxIterations = maxPas * 20; // sécurité anti-boucle-infinie

  // Lettres disponibles + espace
  const lettres = (alphabet + " ").split("");

  while (pasTotal < maxPas && iterations < maxIterations) {
    iterations++;
    // Impulsion variable
    const impulsion = Math.sin(pasTotal * 0.1) * 0.5 + (rng() - 0.5) * 0.3;
    stepReservoirTexte(res, impulsion);

    // Mapper les états vers une lettre
    let somme = 0;
    for (let i = 0; i < res.n; i++) somme += Math.abs(res.etats[i]);
    const moyenne = somme / res.n; // 0-1
    const idx = Math.floor(Math.abs(moyenne) * lettres.length) % lettres.length;
    const lettre = lettres[idx];

    if (lettre === " ") {
      if (motCourant.length > 0) {
        texte += motCourant + " ";
        motCourant = "";
        pasTotal++;
      }
    } else {
      // Limiter la longueur des mots
      if (motCourant.length < 12) motCourant += lettre;
    }

    // Forcer un espace tous les 15 caractères si le mot est trop long
    if (motCourant.length >= 12) {
      texte += motCourant + " ";
      motCourant = "";
      pasTotal++;
    }
  }

  // Si on a un mot en cours, l'ajouter
  if (motCourant.length > 0) texte += motCourant;

  if (motCourant.length > 0) texte += motCourant;

  return texte.trim();
}

export const fiches: FicheAudio[] = ([
  {
    id: "gpt2-paroles", nom: "DistilGPT-2", nomEn: "DistilGPT-2",
    univers: "Autres", famille: "Texte",
    resume: "Génère du texte par IA (DistilGPT-2, anglais).",
    resumeEn: "Generates text via AI (DistilGPT-2, English).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "Write a creative text about love and rain:\n",
        doc: "Prompt d'amorçage (en anglais pour de meilleurs résultats). Ex : « Write a creative text about the ocean: »",
        docEn: "Seed prompt (English for best results). E.g. « Write a creative text about the ocean: »", defautEn: "Write a creative text about love and rain:\n" },
      { nom: "Longueur", nomEn: "Length", plage: [30, 300], pas: 10, defaut: 100, unite: " tokens",
        doc: "Nombre maximum de tokens générés (~0.75 mot/token).",
        docEn: "Maximum number of generated tokens (~0.75 word/token)." },
      { nom: "Créativité", nomEn: "Temperature", plage: [0.1, 1.5], pas: 0.1, defaut: 0.9,
        doc: "Température. Élevée = plus créatif/aléatoire ; basse = plus prévisible.",
        docEn: "Temperature. High = more creative/random; low = more predictable." },
      { nom: "Anti-répétition", nomEn: "Repetition penalty", plage: [1.0, 2.0], pas: 0.1, defaut: 1.3,
        doc: "Pénalité de répétition. Élevée = évite de répéter les mêmes mots.",
        docEn: "Repetition penalty. High = avoids repeating the same words." },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "Write a song about love and rain:\n");
      const maxTokens = ctx.paramNombre("Longueur", 100);
      const temperature = ctx.paramNombre("Créativité", 0.9);
      const repPenalty = ctx.paramNombre("Anti-répétition", 1.3);
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [msg.text], message: traduire("msg.gpt_2_var_0_caract_res", msg.text.length) });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_gpt_2_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ prompt, modelId: "Xenova/distilgpt2", task: "text-generation", maxTokens, temperature, repetitionPenalty: repPenalty, requestId });
      });
   },
  },
  {
    id: "reservoir-textuel", nom: "Réservoir textuel", nomEn: "Text Reservoir",
    univers: "Autres", famille: "Texte",
    resume: "Génère du texte par réseau de neurones aléatoires (émergence, aucun entraînement).",
    resumeEn: "Generates text via random neural networks (emergence, no training).",
    entrees: [],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Neurones", nomEn: "Neurons", plage: [5, 50], pas: 1, defaut: 15,
        doc: "Nombre de neurones. Peu = mots courts/répétitifs ; beaucoup = mots complexes.",
        docEn: "Number of neurons. Few = short/repetitive words; many = complex words." },
      { nom: "Connectivité", nomEn: "Connectivity", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Probabilité de connexion entre neurones. Faible = mots simples ; élevée = mots denses.",
        docEn: "Probability of connection between neurons. Low = simple words; high = dense words." },
      { nom: "Mémoire", nomEn: "Memory", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Taux de fuite (leaking). Élevé = mémoire longue, mots qui évoluent lentement ; faible = réactions brèves.",
        docEn: "Leaking rate. High = long memory, slowly evolving words; low = brief reactions." },
      { nom: "Mots", nomEn: "Words", plage: [5, 100], pas: 1, defaut: 20,
        doc: "Nombre de mots à générer.", docEn: "Number of words to generate." },
      { nom: "Alphabet", nomEn: "Alphabet", type: "choix",
        options: ["abcdefghijklmnopqrstuvwxyz", "aeioubcdfghjklmnpqrstvwxyz", "abcdefghijklmnopqrstuvwxyzéèêëàâïîôûùç"], optionIds: ["abcdefghijklmnopqrstuvwxyz","aeioubcdfghjklmnpqrstvwxyz","abcdefghijklmnopqrstuvwxyzéèêëàâïîôûùç"],
        optionsEn: ["Full (a-z)", "Vowels-first", "French (a-z + accents)"],
        defaut: "abcdefghijklmnopqrstuvwxyz",
        doc: "Alphabet utilisé pour la génération.", docEn: "Alphabet used for generation.", defautEn: "Full (a-z)" },
      { nom: "Mot amorce", nomEn: "Seed word", type: "texte", defaut: "",
        doc: "Mot de départ (optionnel).", docEn: "Starting word (optional).", defautEn: "" },
      { nom: "Graine", nomEn: "Seed", plage: [0, 99999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouveau réseau à chaque exécution).",
        docEn: "Random seed (0 = new network each run)." },
    ],
    async executer(ctx: any) {
      const graine = ctx.paramNombre("Graine", 0);
      const neurones = ctx.paramNombre("Neurones", 15);
      const connectivite = ctx.paramNombre("Connectivité", 30) / 100;
      const memoire = ctx.paramNombre("Mémoire", 30);
      const nbMots = ctx.paramNombre("Mots", 20);
      const alphabet = ctx.paramTexte("Alphabet", "abcdefghijklmnopqrstuvwxyz");
      const seedWord = ctx.paramTexte("Mot amorce", "");
      ctx.onProgress(traduire("progress.g_n_ration_du_r_servoir_textuel"));
      const texte = genererTexteReservoir(graine, neurones, connectivite, memoire, nbMots, alphabet, seedWord);
      const graineUtilisee = graine > 0 ? graine : "auto";
      return { valeurs: [texte], message: traduire("msg.var_0_mots_graine_var_1", texte.split(" ").length, graineUtilisee) };
   },
 },
  {
    id: "qwen2.5-lyrics", nom: "Qwen2.5-0.5B", nomEn: "Qwen2.5-0.5B",
    univers: "Autres", famille: "Texte",
    resume: "Génère du texte par IA avec le modèle Qwen2.5-0.5B (multilingue).",
    resumeEn: "Generates text via AI using the Qwen2.5-0.5B model (multilingual).",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "Write a creative text about love and rain:",
        doc: "Prompt d'amorçage. L'anglais donne les meilleurs résultats, mais le modèle supporte plusieurs langues.",
        docEn: "Seed prompt. English works best, but the model supports several languages.", defautEn: "Write a creative text about love and rain:" },
      { nom: "Longueur", nomEn: "Length", plage: [30, 300], pas: 10, defaut: 120, unite: " tokens",
        doc: "Nombre maximum de tokens générés.", docEn: "Maximum number of generated tokens." },
      { nom: "Créativité", nomEn: "Temperature", plage: [0.1, 1.5], pas: 0.1, defaut: 0.9,
        doc: "Température. Élevée = plus créatif ; basse = plus prévisible.", docEn: "Temperature. High = more creative; low = more predictable." },
      { nom: "Anti-répétition", nomEn: "Repetition penalty", plage: [1.0, 2.0], pas: 0.1, defaut: 1.3,
        doc: "Pénalité de répétition. Élevée = évite de répéter les mêmes phrases.", docEn: "Repetition penalty. High = avoids repeating the same phrases." },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "Write a song about love and rain:");
      const maxTokens = ctx.paramNombre("Longueur", 120);
      const temperature = ctx.paramNombre("Créativité", 0.9);
      const repPenalty = ctx.paramNombre("Anti-répétition", 1.3);
      const w = getWorker();
      return new Promise((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [msg.text], message: traduire("msg.qwen2_5_var_0_caract_res", msg.text.length) });
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve({ valeurs: [null], erreur: true, message: traduire("msg.erreur_qwen2_5_var_0", msg.msg) });
          }
        };
        w.addEventListener("message", onMessage);
        const messages = [
          { role: "system", content: "You are a creative writer. Write original, evocative text based on the user's request." },
          { role: "user", content: prompt },
        ];
        w.postMessage({ messages, modelId: "onnx-community/Qwen2.5-0.5B", task: "text-generation", maxTokens, temperature, repetitionPenalty: repPenalty, requestId });
      });
   },
  },
  {
    id: "nllb-paroles", nom: "Paroles multilingues (IA)", nomEn: "Multilingual Lyrics (AI)",
    univers: "Autres", famille: "Texte",
    resume: "Génère des paroles en anglais via DistilGPT-2 puis les traduit dans la langue choisie.",
    resumeEn: "Generates lyrics in English via DistilGPT-2 then translates them to the chosen language.",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "Write a song about the sea and freedom:\n",
        doc: "Prompt d'amorçage (en anglais pour de meilleurs résultats).", docEn: "Seed prompt (English for best results).", defautEn: "Write a song about the sea and freedom:\n" },
      { nom: "Langue cible", nomEn: "Target language", type: "choix",
        options: ["Français", "Espagnol", "Allemand", "Italien", "Portugais", "Russe", "Japonais", "Chinois", "Arabe", "Hindi"],
        optionIds: ["fr", "es", "de", "it", "pt", "ru", "ja", "zh", "ar", "hi"],
        optionsEn: ["French", "Spanish", "German", "Italian", "Portuguese", "Russian", "Japanese", "Chinese", "Arabic", "Hindi"],
        defaut: "Français",
        doc: "Langue de traduction. Les paroles sont générées en anglais puis traduites.", docEn: "Translation language. Lyrics are generated in English then translated.", defautEn: "French" },
      { nom: "Longueur", nomEn: "Length", plage: [30, 200], pas: 10, defaut: 80, unite: " tokens",
        doc: "Nombre maximum de tokens générés.", docEn: "Maximum number of generated tokens." },
      { nom: "Créativité", nomEn: "Temperature", plage: [0.1, 1.5], pas: 0.1, defaut: 0.9,
        doc: "Température. Élevée = plus créatif ; basse = plus prévisible.", docEn: "Temperature. High = more creative; low = more predictable." },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "Write a song about the sea and freedom:\n");
      const langueCible = ctx.paramTexte("Langue cible", "fr");
      // Libellé lisible pour les messages : `langueCible` vaut désormais un code
      // ISO (« fr »), qu'il n'y a pas de sens à afficher tel quel.
      const LABELS_LANGUES: Record<string, string> = {
        fr: "Français", es: "Espagnol", de: "Allemand", it: "Italien", pt: "Portugais",
        ru: "Russe", ja: "Japonais", zh: "Chinois", ar: "Arabe", hi: "Hindi",
      };
      const langueLabel = LABELS_LANGUES[langueCible] ?? langueCible;
      const maxTokens = ctx.paramNombre("Longueur", 80);
      const temperature = ctx.paramNombre("Créativité", 0.9);
      const w = getWorker();

      // Étape 1 : générer en anglais via DistilGPT-2
      ctx.onProgress(traduire("progress.g_n_ration_des_paroles_anglais"));
      const texteEn = await new Promise<string | null>((resolve) => {
        const requestId = makeRequestId();
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.requestId !== requestId) return;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            w.removeEventListener("message", onMessage);
            resolve(msg.text);
          } else if (msg.type === "error") {
            w.removeEventListener("message", onMessage);
            resolve(null);
          }
        };
        w.addEventListener("message", onMessage);
        w.postMessage({ prompt, modelId: "Xenova/distilgpt2", task: "text-generation", maxTokens, temperature, repetitionPenalty: 1.3, requestId });
      });

      if (!texteEn || texteEn.length < 10) {
        return { valeurs: [null], erreur: true, message: traduire("msg.chec_g_n_ration_distilgpt_2") };
      }

      // Étape 2 : traduire via OPUS-MT (worker opus-worker)
      // Indexé par code ISO 639-1 (l'id canonique du paramètre) ; les anciens
      // libellés français sont acceptés en repli pour les projets existants.
      const pairesEn: Record<string, string> = {
        fr: "Xenova/opus-mt-en-fr", es: "Xenova/opus-mt-en-es", de: "Xenova/opus-mt-en-de",
        it: "Xenova/opus-mt-en-it", pt: "Xenova/opus-mt-en-pt", ru: "Xenova/opus-mt-en-ru",
        ja: "Xenova/opus-mt-en-ja", zh: "Xenova/opus-mt-en-zh", ar: "Xenova/opus-mt-en-ar",
        hi: "Xenova/opus-mt-en-hi",
      };
      const LEGACY_LANGUES: Record<string, string> = {
        "français": "fr", "espagnol": "es", "allemand": "de", "italien": "it", "portugais": "pt",
        "russe": "ru", "japonais": "ja", "chinois": "zh", "arabe": "ar", "hindi": "hi",
      };
      const codeCible = pairesEn[langueCible] ? langueCible : (LEGACY_LANGUES[langueCible.toLowerCase()] ?? langueCible);
      const modelTrad = pairesEn[codeCible];
      if (!modelTrad) {
        return { valeurs: [texteEn], message: traduire("msg.paroles_anglais_pas_de_traduction_disponible_pour_var_0", langueLabel) };
      }

      ctx.onProgress(traduire("progress.traduction_vers_var_0", langueLabel));
      const opusW = new Worker(new URL("../workers/opus-worker.js", import.meta.url), { type: "module" });
      const texteTraduit = await new Promise<string | null>((resolve) => {
        const onMessage = (e: MessageEvent) => {
          const msg = e.data;
          if (msg.type === "progress") ctx.onProgress(msg.msg);
          else if (msg.type === "done") {
            opusW.removeEventListener("message", onMessage);
            opusW.terminate();
            resolve(msg.text);
          } else if (msg.type === "error") {
            opusW.removeEventListener("message", onMessage);
            opusW.terminate();
            resolve(null);
          }
        };
        opusW.addEventListener("message", onMessage);
        opusW.postMessage({ text: texteEn, modelId: modelTrad });
      });

      if (!texteTraduit) {
        return { valeurs: [texteEn], message: traduire("msg.paroles_anglais_traduction_chou_e") };
      }

      return {
        valeurs: [texteTraduit],
        message: traduire("msg.paroles_en_var_0_var_1_caract_res", langueLabel, texteTraduit.length),
      };
   },
 },
] as FicheAudio[]).map(avecDoc);
