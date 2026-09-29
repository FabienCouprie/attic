// plugins/textgen.ts — Trois nodes de génération de texte :
// 1. DistilGPT-2 : génération par IA (anglais, GPT-2 small)
// 2. Réservoir textuel : émergence par réseau de neurones aléatoires
// 3. NLLB Multilingue : génération multilingue (français, espagnol…)

import { hasardDuNoeud } from "../core";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { installerGardeWorker } from "./garde-worker";
import { mulberry32 } from "../audio";

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/textgen-worker.js", import.meta.url), { type: "module" });
    // Le garde-fou transforme la mort du worker en erreur du nœud : sans lui, un worker qui meurt
    // avant de répondre laisse le nœud « en cours » pour toujours. `worker = null` pour que la
    // tentative suivante en reconstruise un, au lieu de reparler à un mort.
    installerGardeWorker(worker, () => { worker = null; });
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
//
// Un réseau de neurones à poids aléatoires, jamais entraîné, dont on lit l'activation pour écrire
// des lettres. C'est le calcul par réservoir (Jaeger, « The echo state approach to analysing and
// training recurrent neural networks », rapport 148 du Centre national allemand de recherche en
// informatique, 2001).
//
// CE QUI A ÉTÉ REFAIT, ET POURQUOI. Quatre choses empêchaient ce composant de rendre ce que son
// intitulé annonce, et chacune a été relevée par la mesure avant d'être touchée.
//
//  1. LA MATRICE ÉTAIT NORMALISÉE EN NORME DE FROBENIUS, à 0,9. Ce n'est pas la grandeur qui règle
//     un réservoir : c'est le RAYON SPECTRAL, la plus grande valeur propre en module, qui décide
//     qu'un état s'éteint ou se prolonge. Normaliser la somme des carrés fait rétrécir chaque poids
//     quand le nombre de neurones grandit — mesuré, de 0,353 à cinq neurones à 0,016 à cinquante —,
//     si bien que le réseau devenait plus FAIBLE à mesure qu'on l'agrandissait, et que le réglage
//     « Neurones » agissait à l'envers de ce que sa documentation promettait.
//
//  2. TOUS LES NEURONES RECEVAIENT LA MÊME ENTRÉE, au même poids. Ils se ressemblaient donc, et le
//     réservoir se comportait comme une seule unité. Chacun a maintenant son poids d'entrée tiré au
//     sort, ce qui est la forme ordinaire d'un réseau à écho d'état.
//
//  3. LA LECTURE NE COUVRAIT PAS SON INTERVALLE. Elle prenait la moyenne des activations en valeur
//     absolue, qui se concentre par la loi des grands nombres : relevée sur quatre réglages, elle
//     ne dépassait jamais 0,494 sur 1. L'espace étant la dernière lettre du tableau, il aurait fallu
//     0,963 pour le tirer : AUCUNE COUPURE DE MOT NE VENAIT DONC DU RÉSERVOIR, et tous les mots
//     sortaient à la longueur de coupure, douze lettres, sans une exception. La moitié de l'alphabet
//     était hors d'atteinte par la même cause. La lecture est maintenant une combinaison tirée au
//     sort, ramenée sur l'étendue qu'elle occupe vraiment, relevée pendant une chauffe.
//
//  4. L'IMPULSION ÉTAIT UN SINUS, de période soixante-trois pas. Il dominait la dynamique, et le
//     texte répétait ses mots : 23 % de mots distincts sur deux cents. Avec une impulsion tirée au
//     sort, 66 %, mesuré à mémoire égale.
//
// ET LA LETTRE NE SE CHOISIT PLUS SUR L'ALPHABET ENTIER. Deux lettres voisines dans l'alphabet
// n'ont aucun rapport phonétique : une lecture continue, qui se déplace lentement, y donnait des
// glissades du genre « bcccbbaaaaaa bdfhjlnpsvyz », et jamais des mots. Consonnes et voyelles
// alternent désormais, et un mot se ferme sur une voyelle. Les mots obtenus se prononcent :
// « ledegosy », « mijago », « qojopu », « lebenu ».

const VOYELLES = "aeiouyàâäéèêëîïôöûùüœ";

interface ReservoirTextuel {
  n: number;
  poidsRes: Float64Array;
  /** Le poids d'entrée de chaque neurone : c'est lui qui les rend différents les uns des autres. */
  poidsEntree: Float64Array;
  /** La combinaison lue à chaque pas, tirée au sort une fois pour toutes. */
  poidsLecture: Float64Array;
  etats: Float64Array;
  leaking: number;
}

/** Le rayon spectral voulu. Sous un, l'état s'éteint ; au-dessus, il s'emballe. */
const RAYON_SPECTRAL = 0.95;

/** L'amplitude du signal d'entrée, assez forte pour que les états occupent leur intervalle. */
const ECHELLE_ENTREE = 1.5;

/** Combien de pas sont joués et jetés avant d'écrire, pour relever l'étendue de la lecture. */
const PAS_DE_CHAUFFE = 300;

/**
 * La plus grande valeur propre en module, estimée par itération de la puissance.
 *
 * Soixante itérations suffisent largement ici : la matrice fait au plus cinquante sur cinquante, et
 * l'on ne cherche pas une valeur propre mais un facteur d'échelle.
 */
function rayonSpectral(poids: Float64Array, n: number, rng: () => number): number {
  let v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = rng() - 0.5;
  let rayon = 0;
  for (let k = 0; k < 60; k++) {
    const suivant = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += poids[i * n + j] * v[j];
      suivant[i] = s;
    }
    let norme = 0;
    for (let i = 0; i < n; i++) norme += suivant[i] * suivant[i];
    norme = Math.sqrt(norme);
    // Une matrice vide ou nilpotente : il n'y a pas de rayon à rendre, et l'appelant ne divise pas.
    if (norme < 1e-12) return 0;
    for (let i = 0; i < n; i++) suivant[i] /= norme;
    v = suivant;
    rayon = norme;
  }
  return rayon;
}

function creerReservoirTexte(n: number, connectivite: number, leaking: number, rng: () => number): ReservoirTextuel {
  const poidsRes = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && rng() < connectivite) poidsRes[i * n + j] = rng() * 2 - 1;
    }
  }
  const rayon = rayonSpectral(poidsRes, n, rng);
  if (rayon > 1e-9) for (let i = 0; i < n * n; i++) poidsRes[i] *= RAYON_SPECTRAL / rayon;

  const poidsEntree = new Float64Array(n);
  const poidsLecture = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    poidsEntree[i] = (rng() * 2 - 1) * ECHELLE_ENTREE;
    // Divisé par la racine du nombre de neurones : sans quoi la lecture saturerait la tangente
    // hyperbolique dès que le réservoir grandit, et ne rendrait plus que zéro ou un.
    poidsLecture[i] = (rng() * 2 - 1) / Math.sqrt(n);
  }
  return { n, poidsRes, poidsEntree, poidsLecture, etats: new Float64Array(n), leaking };
}

function stepReservoirTexte(res: ReservoirTextuel, entree: number): void {
  const n = res.n;
  const nouveaux = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let somme = 0;
    for (let j = 0; j < n; j++) somme += res.poidsRes[i * n + j] * res.etats[j];
    nouveaux[i] = (1 - res.leaking) * res.etats[i] + res.leaking * Math.tanh(somme + res.poidsEntree[i] * entree);
  }
  res.etats = nouveaux;
}

/** La combinaison lue à ce pas, avant normalisation. */
function lireReservoir(res: ReservoirTextuel): number {
  let s = 0;
  for (let i = 0; i < res.n; i++) s += res.poidsLecture[i] * res.etats[i];
  return s;
}

/** La longueur à laquelle un mot est coupé, faute d'avoir trouvé sa fin. */
const LONGUEUR_MOT_MAX = 12;

/** Au-dessus de cette lecture, un mot se ferme, à condition de finir sur une voyelle. */
const SEUIL_FIN_DE_MOT = 0.6;

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
  // « MÉMOIRE » DISAIT L'INVERSE DE CE QU'ELLE FAISAIT, et à zéro elle tuait le réservoir. Le
  // nombre passé ici est le taux de FUITE : à un, l'état est entièrement renouvelé à chaque pas,
  // donc sans mémoire ; à zéro, il ne bouge plus jamais, et comme il part de zéro il y reste.
  // Mesuré à l'ancienne convention, « Mémoire » à zéro rendait deux cent mots de douze lettres
  // tirés de deux lettres en tout. La fuite est donc l'opposé du réglage, et elle garde un
  // plancher : une mémoire longue ralentit le réservoir, elle ne l'arrête pas.
  const fuite = Math.min(1, Math.max(0.05, 1 - memoire / 100));
  const res = creerReservoirTexte(neurones, connectivite, fuite, rng);

  const voyelles = [...alphabet].filter((c) => VOYELLES.includes(c));
  const consonnes = [...alphabet].filter((c) => !VOYELLES.includes(c));
  // Un alphabet privé de l'une des deux classes ne peut pas alterner : on rend l'amorce seule
  // plutôt qu'une suite d'une seule lettre, et le message dira le compte.
  if (voyelles.length === 0 || consonnes.length === 0) return seedWord.trim();

  /** L'impulsion tirée au sort. Un sinus, qui était employé ici, imposait sa période au texte. */
  const impulsion = () => (rng() * 2 - 1) * ECHELLE_ENTREE;

  // LA CHAUFFE SERT À MESURER, non à écrire. La lecture n'occupe pas d'avance un intervalle connu :
  // son étendue dépend du nombre de neurones, de la connectivité et de la mémoire. On la relève sur
  // quelques centaines de pas, puis on s'y ramène, de sorte que toutes les lettres soient à portée
  // quel que soit le réglage. Les centiles extrêmes sont écartés pour qu'une pointe isolée
  // n'écrase pas l'échelle.
  const echantillons: number[] = [];
  for (let k = 0; k < PAS_DE_CHAUFFE; k++) {
    stepReservoirTexte(res, impulsion());
    echantillons.push(lireReservoir(res));
  }
  echantillons.sort((a, b) => a - b);
  const bas = echantillons[Math.floor(echantillons.length * 0.02)];
  const haut = echantillons[Math.floor(echantillons.length * 0.98)];
  const etendue = Math.max(1e-9, haut - bas);

  let texte = seedWord ? seedWord + " " : "";
  let motCourant = "";
  let motsEcrits = 0;
  let iterations = 0;
  // LE COMPTEUR EST CELUI DES MOTS, ET LA BORNE L'ÉTAIT HUIT FOIS TROP HAUT. Il s'appelait
  // `maxPas` et valait `nbMots * 8`, mais il n'est incrémenté qu'à l'écriture d'un mot : demander
  // vingt mots en rendait cent soixante, cinquante en rendaient quatre cents. Mesuré sur quatre
  // valeurs, le facteur était exactement huit à chaque fois.
  const maxMots = Math.max(1, Math.round(nbMots));
  const maxIterations = maxMots * 160; // sécurité anti-boucle-infinie

  let attendVoyelle = false;
  while (motsEcrits < maxMots && iterations < maxIterations) {
    iterations++;
    stepReservoirTexte(res, impulsion());
    const u = Math.min(0.999999, Math.max(0, (lireReservoir(res) - bas) / etendue));

    const classe = attendVoyelle ? voyelles : consonnes;
    motCourant += classe[Math.min(classe.length - 1, Math.floor(u * classe.length))];
    attendVoyelle = !attendVoyelle;

    // UN MOT SE FERME SUR UNE VOYELLE, ce qui est la condition pour qu'il se prononce. La lecture
    // décide quand, au-dessus du seuil ; la longueur maximale tranche quand elle ne décide pas.
    const finissableIci = !attendVoyelle && motCourant.length >= 2 && u >= SEUIL_FIN_DE_MOT;
    if (finissableIci || motCourant.length >= LONGUEUR_MOT_MAX) {
      texte += motCourant + " ";
      motCourant = "";
      motsEcrits++;
      attendVoyelle = false;
    }
  }

  // LE RESTE N'EST AJOUTÉ QU'UNE FOIS. Il l'était deux fois, la même ligne étant écrite deux fois
  // de suite sans que rien ne remette `motCourant` à vide entre les deux.
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
    resume: "Écrit des mots prononçables qui n'existent pas, par un réseau de neurones jamais entraîné.",
    resumeEn: "Writes pronounceable words that do not exist, from a neural network that is never trained.",
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
        doc: "Part de son état que le réseau garde d'un pas au suivant. Haute, il change lentement et les mots voisins se ressemblent ; basse, chaque pas repart de l'entrée et les mots se suivent sans parenté.",
        docEn: "How much of its state the network keeps from one step to the next. High, it changes slowly and neighbouring words resemble each other; low, each step starts again from the input and successive words are unrelated." },
      { nom: "Mots", nomEn: "Words", plage: [5, 100], pas: 1, defaut: 20,
        doc: "Nombre de mots à générer.", docEn: "Number of words to generate." },
      // LE MENU FRANÇAIS MONTRAIT LES CHAÎNES BRUTES. L'anglais avait ses trois libellés, le
      // français affichait « abcdefghijklmnopqrstuvwxyz » dans une liste déroulante : les
      // identifiants, qui sont bien ces chaînes, tenaient lieu de noms. Les deux langues ont
      // maintenant les leurs, et les identifiants ne bougent pas, de sorte qu'un projet enregistré
      // garde son choix.
      // TROIS CHOIX N'EN FAISAIENT QUE DEUX. « Voyelles en tête » portait les mêmes vingt-six
      // lettres que l'alphabet latin, dans un autre ordre ; les voyelles et les consonnes étant
      // désormais séparées avant le tirage, le filtrage préserve l'ordre et les deux listes
      // ressortent identiques, lettre pour lettre. Un choix qui ne change rien vaut moins qu'un
      // choix absent : il reste deux alphabets, qui diffèrent vraiment.
      { nom: "Alphabet", nomEn: "Alphabet", type: "choix",
        options: ["Latin (a-z)", "Français (a-z et accents)"],
        optionsEn: ["Latin (a-z)", "French (a-z and accents)"],
        optionIds: ["abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrstuvwxyzéèêëàâïîôûùç"],
        defaut: "Latin (a-z)", defautEn: "Latin (a-z)",
        doc: "Les lettres dans lesquelles le texte est écrit. Elles sont réparties en voyelles et en consonnes, qui alternent dans chaque mot.",
        docEn: "The letters the text is written in. They are split into vowels and consonants, which alternate within each word." },
      { nom: "Mot amorce", nomEn: "Seed word", type: "texte", defaut: "",
        doc: "Mot de départ (optionnel).", docEn: "Starting word (optional).", defautEn: "" },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine aléatoire (0 = nouveau réseau à chaque exécution).",
        docEn: "Random seed (0 = new network each run)." },
    ],
    async executer(ctx: any) {
      // Graine 0 : tirée une fois ici, passée au calcul et montrée dans le message — la convention
      // du projet, sans laquelle un résultat réussi ne pouvait pas être rejoué.
      const { graine } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const neurones = ctx.paramNombre("Neurones", 15);
      const connectivite = ctx.paramNombre("Connectivité", 30) / 100;
      const memoire = ctx.paramNombre("Mémoire", 30);
      const nbMots = ctx.paramNombre("Mots", 20);
      const alphabet = ctx.paramTexte("Alphabet", "abcdefghijklmnopqrstuvwxyz");
      const seedWord = ctx.paramTexte("Mot amorce", "");
      ctx.onProgress(traduire("progress.g_n_ration_du_r_servoir_textuel"));
      const texte = genererTexteReservoir(graine, neurones, connectivite, memoire, nbMots, alphabet, seedWord);
      const graineUtilisee = graine;
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
      // Worker jetable, créé pour cette seule traduction : pas de cache à vider, mais le même
      // garde-fou — sans lui, un worker mort laisserait la promesse ci-dessous sans réponse.
      const opusW = installerGardeWorker(
        new Worker(new URL("../workers/opus-worker.js", import.meta.url), { type: "module" }));
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
