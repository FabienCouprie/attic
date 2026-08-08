// plugins/prompt-graphe.ts — Nœud « Prompt → graphe » : parse un prompt texte
// en langage naturel et génère un graphe de nodes correspondant sur le canevas.
//
// Le dictionnaire mots-clés est construit DYNAMIQUEMENT depuis le registre au
// runtime : tout nouveau node (installé via .zip, méta-composant) est
// automatiquement reconnu. Les mots-clés sont extraits du nom, nomEn, resume
// et resumeEn de chaque fiche. Les entrées manuelles ci-dessous fournissent
// des alias supplémentaires (synonymes, abréviations) que le registre ne porte
// pas.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
// Import DYNAMIQUE (pas d'`import … from` statique) : audio/adaptateur importe
// plugins/index qui importe CE fichier (pour enregistrer sa propre fiche) —
// un import statique créerait un cycle. Il ne mordait jamais en pratique tant
// que ce fichier n'était atteint qu'EN PASSANT par le cycle (App normale,
// autres tests) ; y entrer directement (ex. un test qui n'importe que ce
// module) expose le cycle et casse l'initialisation (`fiches` pas encore
// assigné au moment où plugins/index le lit). L'import dynamique, résolu au
// premier APPEL de construireDictionnaire() plutôt qu'à l'évaluation du
// module, élimine l'arête statique du cycle.
async function obtenirRegistre() {
  const { registre } = await import("../audio/adaptateur");
  return registre;
}

interface SpecNode {
  ficheId: string;
  label: string;
}

interface SpecEdge {
  source: number;
  target: number;
  sourceHandle?: string;
  targetHandle?: string;
}

type Category = "source" | "effet" | "sortie" | "analyse" | "texte";

interface EntreeDictionnaire {
  mots: string[];
  ficheId: string;
  label: string;
  category: Category;
}

// Alias manuels : synonymes, abréviations, mots-clés en langage naturel
// que le nom/resume de la fiche ne contient pas. Le reste (nom, nomEn, resume,
// resumeEn) est indexé automatiquement depuis le registre.
const ALIAS_MANUELS: { ficheId: string; mots: string[]; category: Category }[] = [
  { ficheId: "entree-audio", mots: ["entrée audio", "audio input", "fichier audio", "load audio", "charger audio"], category: "source" },
  { ficheId: "entree-image", mots: ["entrée image", "image input", "fichier image", "load image", "charger image", "image file"], category: "source" },
  { ficheId: "palette-harmonique", mots: ["palette harmonique", "harmonic palette", "couleurs en musique", "image en notes", "palette midi", "color music", "image to music", "couleurs dominantes"], category: "source" },
  { ficheId: "dessin-sonore", mots: ["dessin sonore", "sound drawing", "kandinsky", "formes colorées", "dessin en musique", "drawing to music", "formes musique", "couleurs formes"], category: "source" },
  { ficheId: "couleur-rgb", mots: ["couleur rgb", "rgb color", "oscillateurs rgb", "rgb oscillators", "couleur en son", "couleur oscillateur", "color oscillator", "rgb sound"], category: "source" },
  { ficheId: "spectre-visible", mots: ["spectre visible", "visible spectrum", "longueur d'onde", "wavelength", "lumière en son", "couleur en fréquence", "light frequency", "color frequency"], category: "source" },
  { ficheId: "color-looper", mots: ["color looper", "séquenceur couleur", "couleur pas à pas", "color sequencer", "loop couleur", "color step", "séquenceur couleurs", "couleur note"], category: "source" },
  { ficheId: "camelot", mots: ["camelot", "roue de camelot", "camelot wheel", "harmonic mixing", "mix harmonique", "transitions tonalités", "dj key", "roue des tonalités"], category: "source" },
  { ficheId: "enregistreur-audio", mots: ["enregistreur", "micro", "recorder", "microphone"], category: "source" },
  { ficheId: "capture-systeme-audio", mots: ["capture système", "system audio", "capture audio", "what you hear", "loopback"], category: "source" },
  { ficheId: "generateur-bruit", mots: ["bruit", "noise"], category: "source" },
  { ficheId: "generateur-frequence", mots: ["oscillateur", "sinus", "sine", "tone", "tonalité", "fréquence pure", "générateur de fréquence"], category: "source" },
  { ficheId: "metronome", mots: ["métronome", "metronome", "click track"], category: "source" },
  { ficheId: "sequenceur-batterie", mots: ["séquenceur batterie", "drum sequencer", "boîte à rythmes", "drum machine"], category: "source" },
  { ficheId: "sequenceur-batterie-avance", mots: ["séquenceur batterie avancé", "advanced drum sequencer", "drum machine avancée", "grille velocity batterie"], category: "source" },
  { ficheId: "sequenceur-melodique", mots: ["séquenceur mélodique", "melodic sequencer", "piano-roll"], category: "source" },
  { ficheId: "reservoir-musical", mots: ["réservoir", "reservoir", "neural", "neuronal", "réservoir midi", "reservoir midi", "neural midi"], category: "source" },
  { ficheId: "multi-reservoirs", mots: ["multi-réservoir", "multi reservoir", "polyphonique"], category: "source" },
  { ficheId: "sampler-midi", mots: ["sampler midi", "midi sampler", "échantillon midi", "sample midi"], category: "effet" },
  { ficheId: "jointure-midi", mots: ["jointure midi", "midi join", "concaténer midi", "concatenate midi", "joindre midi", "join midi"], category: "effet" },
  { ficheId: "boucle-midi", mots: ["boucle midi", "midi loop", "répéter midi", "repeat midi", "loop midi"], category: "effet" },
  { ficheId: "point-ecoute-midi", mots: ["point écoute midi", "midi listening", "écoute midi"], category: "sortie" },
  { ficheId: "musicgen", mots: ["musicgen", "ia music", "ai music", "text to music"], category: "source" },
  { ficheId: "source-texte", mots: ["entrée texte", "text input", "source texte", "text source"], category: "source" },
  { ficheId: "generateur-paroles", mots: ["générateur de paroles", "lyrics generator", "paroles", "lyrics"], category: "source" },
  { ficheId: "delay-stereo", mots: ["delay", "echo", "écho", "répétition"], category: "effet" },
  { ficheId: "echo-ping-pong", mots: ["ping pong", "ping-pong"], category: "effet" },
  { ficheId: "reverberation", mots: ["réverbération", "reverb", "reverbe", "hall", "room", "pièce"], category: "effet" },
  { ficheId: "reverbe-convolution", mots: ["convolution", "ir", "impulsion"], category: "effet" },
  { ficheId: "distorsion", mots: ["distorsion", "distortion", "overdrive", "saturation"], category: "effet" },
  { ficheId: "compresseur", mots: ["compresseur", "compressor", "compression"], category: "effet" },
  { ficheId: "gate-expandeur", mots: ["gate", "expandeur", "expander"], category: "effet" },
  { ficheId: "equaliseur", mots: ["égaliseur", "equalizer", "eq"], category: "effet" },
  { ficheId: "reponse-filtre", mots: ["filtre", "filter", "passe-bas", "lowpass", "passe-haut", "highpass", "réponse filtre", "filter response"], category: "effet" },
  { ficheId: "flanger", mots: ["flanger", "flange"], category: "effet" },
  { ficheId: "chorus", mots: ["chorus"], category: "effet" },
  { ficheId: "bitcrusher", mots: ["bitcrusher", "8-bit", "lo-fi", "lofi"], category: "effet" },
  { ficheId: "ring-modulator", mots: ["ring mod", "ring modulator", "modulation anneau"], category: "effet" },
  { ficheId: "de-esser", mots: ["de-esser", "deesser", "sibilance"], category: "effet" },
  { ficheId: "changement-tonalite", mots: ["pitch", "tonalité", "transpose", "hauteur"], category: "effet" },
  { ficheId: "glissando-tonalite", mots: ["glissando", "pitch glide", "glisser", "bend", "glissando tonalité", "pitch ramp"], category: "effet" },
  { ficheId: "paulstretch", mots: ["paulstretch", "extreme stretch", "stretch extrême", "drone", "phase randomization", "texture"], category: "effet" },
  { ficheId: "paulstretch-logistique", mots: ["paulstretch logistique", "logistic paulstretch", "stretch progressif", "progressive stretch", "drone progressif", "progressive drone"], category: "effet" },
  { ficheId: "formule-echantillons", mots: ["formule", "math", "sample formula", "expression mathématique", "y ="], category: "effet" },
  { ficheId: "beat-repeat", mots: ["beat repeat", "stutter", "glitch", "répétition rythmique", "rhythmic repeat", "repeater", "stutter effect", "beat repeater"], category: "effet" },
  { ficheId: "formule-spectrale", mots: ["spectral formula", "formule spectrale", "spectral shaping", "magnitude", "phase"], category: "effet" },
  { ficheId: "griffin-lim", mots: ["griffin-lim", "griffin lim", "phase reconstruction", "reconstruction magnitude", "spectral texture", "magnitude spectrogram"], category: "effet" },
  { ficheId: "generateur-audio-mathematique", mots: ["générateur mathématique", "math audio", "oscillateur math", "formula generator", "sinus"], category: "source" },
  { ficheId: "changement-tempo", mots: ["tempo", "time stretch", "vitesse", "ralentir", "accélérer"], category: "effet" },
  { ficheId: "inverseur-audio", mots: ["inverse", "reverse", "retourner"], category: "effet" },
  { ficheId: "fondu", mots: ["fondu", "fade", "fade in", "fade out"], category: "effet" },
  { ficheId: "amplificateur", mots: ["normalize", "normaliser", "gain"], category: "effet" },
  { ficheId: "shift-formants", mots: ["formant", "formant shift", "conversion vocale", "voice conversion", "homme femme"], category: "effet" },
  { ficheId: "ajouter-silence", mots: ["silence", "ajouter silence", "add silence"], category: "effet" },
  { ficheId: "tremolo", mots: ["tremolo"], category: "effet" },
  { ficheId: "etirement-glissant", mots: ["étirement glissant", "slide stretch", "glissant", "ralenti progressif", "accélération progressive"], category: "effet" },
  { ficheId: "spatialisation-stereo", mots: ["spatialisation", "spatialization", "panoramique", "panner", "position stéréo", "stereo position"], category: "effet" },
  { ficheId: "separateur-canaux", mots: ["séparateur canaux", "channel splitter", "split stereo", "séparer stéréo", "mono gauche droite"], category: "effet" },
  { ficheId: "hard-panner", mots: ["hard panner", "hard pan", "bascule gauche", "bascule droite", "panoramique total", "full left", "full right", "mute droite", "mute gauche"], category: "effet" },
  { ficheId: "auto-pan", mots: ["auto-pan", "auto pan", "autopan", "balayage stéréo", "stereo sweep", "pan animé"], category: "effet" },
  { ficheId: "auto-pan-logistique", mots: ["auto-pan logistique", "logistic auto-pan", "balayage logistique", "pan progressif", "progressive pan"], category: "effet" },
  { ficheId: "wahwah", mots: ["wah-wah", "wahwah", "wah", "crybaby", "pédale wah"], category: "effet" },
  { ficheId: "phaser", mots: ["phaser", "phase shifter", "déphaseur"], category: "effet" },
  { ficheId: "vibrato", mots: ["vibrato", "vibration hauteur", "pitch wobble"], category: "effet" },
  { ficheId: "vibrato-logistique", mots: ["vibrato logistique", "logistic vibrato", "vibrato progressif", "progressive vibrato"], category: "effet" },
  { ficheId: "tremolo", mots: ["tremolo"], category: "effet" },
  { ficheId: "tremolo-logistique", mots: ["tremolo logistique", "logistic tremolo", "tremolo progressif", "progressive tremolo"], category: "effet" },
  { ficheId: "echo-logistique", mots: ["echo logistique", "logistic echo", "écho logistique", "echo progressif", "progressive echo", "delay logistique"], category: "effet" },
  { ficheId: "octaver", mots: ["octaver", "octave", "octave sup", "octave inf", "sub octave", "harmonizer"], category: "effet" },
  { ficheId: "chopper", mots: ["chopper", "chop", "stutter", "gate rythmique", "rhythmic gate", "tremolo extrême"], category: "effet" },
  { ficheId: "chopper-logistique", mots: ["chopper logistique", "logistic chopper", "chopper progressif", "progressive chopper", "gate logistique", "logistic gate", "stutter progressif", "progressive stutter"], category: "effet" },
  { ficheId: "echo", mots: ["echo", "delay", "répétition", "ping pong", "ping-pong"], category: "effet" },
  { ficheId: "voice-changer", mots: ["voice changer", "changer voix", "modifier voix", "chipmunk", "robot voice", "monster voice"], category: "effet" },
  { ficheId: "decoupe-aleatoire", mots: ["découpe aléatoire", "random slice", "slice", "rearrange", "réarranger", "découper", "tranches", "remix slices"], category: "effet" },
  { ficheId: "simple-boucle", mots: ["boucle", "loop", "répéter"], category: "effet" },
  { ficheId: "pure-data", mots: ["pure data", "pd", "patch", "libpd"], category: "source" },
  { ficheId: "aligneur-piste", mots: ["aligner", "align", "aligneur"], category: "effet" },
  { ficheId: "analyseur-spectre", mots: ["spectre", "spectrum", "fft", "analyseur"], category: "analyse" },
  { ficheId: "spectrogramme", mots: ["spectrogramme", "spectrogram"], category: "analyse" },
  { ficheId: "visualiseur-forme-onde", mots: ["forme d'onde", "waveform", "visualiseur"], category: "analyse" },
  { ficheId: "vu-metre", mots: ["vu-mètre", "vu meter", "lufs", "loudness", "niveau"], category: "analyse" },
  { ficheId: "detecteur-accords", mots: ["accords", "chord", "détection accords", "chord detector"], category: "analyse" },
  { ficheId: "centroide-spectral", mots: ["centroïde spectral", "spectral centroid", "meyda", "centroid", "brillance spectre"], category: "analyse" },
  { ficheId: "rms-meyda", mots: ["rms", "niveau rms", "meyda rms", "dbfs", "niveau moyen"], category: "analyse" },
  { ficheId: "zcr-meyda", mots: ["zcr", "zero crossing", "passages par zéro", "brillance zcr", "meyda zcr"], category: "analyse" },
  { ficheId: "rolloff-spectral-meyda", mots: ["rolloff spectral", "spectral rolloff", "meyda rolloff", "fréquence rolloff"], category: "analyse" },
  { ficheId: "colorsynth", mots: ["colorsynth", "couleur spectre", "color spectrum"], category: "analyse" },
  { ficheId: "comparateur-ab", mots: ["comparateur", "a/b", "ab compare"], category: "analyse" },
  { ficheId: "selecteur-multi-zones", mots: ["sélecteur zones", "multi zones", "zone selector"], category: "analyse" },
  { ficheId: "oscillateur", mots: ["oscillateur pédagogique", "harmoniques", "timbre"], category: "analyse" },
  { ficheId: "sortie-audio", mots: ["sortie audio", "audio output", "output", "écouter", "listen"], category: "sortie" },
  { ficheId: "sortie-texte", mots: ["sortie texte", "text output", "texte sortie"], category: "sortie" },
  { ficheId: "convertisseur-audio", mots: ["mp3", "convertir mp3"], category: "sortie" },
  { ficheId: "convertisseur-mp3-wav", mots: ["wav", "convertir wav"], category: "sortie" },
  { ficheId: "point-ecoute", mots: ["point d'écoute", "listening point", "monitor"], category: "sortie" },
  { ficheId: "gpt2-paroles", mots: ["gpt-2", "distilgpt", "paroles ia", "ai lyrics", "gpt paroles"], category: "texte" },
  { ficheId: "qwen2.5-lyrics", mots: ["qwen2.5", "qwen 2.5", "qwen paroles", "qwen lyrics", "qwen2.5-0.5b"], category: "texte" },
  { ficheId: "nllb-paroles", mots: ["nllb", "paroles multilingue", "multilingual lyrics"], category: "texte" },
  { ficheId: "reservoir-textuel", mots: ["réservoir textuel", "text reservoir", "texte aléatoire"], category: "texte" },
  { ficheId: "tts-speecht5", mots: ["speecht5", "tts", "synthèse vocale", "text to speech"], category: "texte" },
  { ficheId: "tts-mms", mots: ["mms", "mms tts", "multilingue tts"], category: "texte" },
  { ficheId: "tts-kokoro", mots: ["kokoro", "kokoro tts", "text to speech"], category: "texte" },
  { ficheId: "tts-francais", mots: ["voix française", "français tts", "french tts", "kokoro français", "kokoro french", "siwis"], category: "texte" },
  { ficheId: "whisper-en", mots: ["whisper", "transcription", "speech to text", "asr"], category: "texte" },
  { ficheId: "sherpa-asr", mots: ["sherpa", "sherpa asr", "speech to text", "asr", "transcription"], category: "texte" },
  { ficheId: "traduction-opus", mots: ["traduction", "translate", "opus", "translator"], category: "texte" },
  { ficheId: "couleur-suno-ia", mots: ["couleur suno", "color suno", "couleur ia"], category: "texte" },
  { ficheId: "generateur-pochette", mots: ["pochette", "cover", "album cover"], category: "texte" },
  { ficheId: "galerie-exposition", mots: ["galerie", "gallery", "exposition"], category: "texte" },
  { ficheId: "carte-sonore", mots: ["carte sonore", "sound map", "carte ville", "city map", "sons sur carte", "carte interactive"], category: "texte" },
  { ficheId: "collection-lecteur-musique", mots: ["lecteur musique", "music player", "lecteur", "playlist", "écouter", "listen", "jukebox", "shuffle", "boucle"], category: "texte" },
];

// Map des catégories par univers (pour les nodes non présents dans ALIAS_MANUELS)
const CATEGORIE_PAR_UNIVERS: Record<string, Category> = {
  "Entrées": "source",
  "Traitement": "effet",
  "Sorties": "sortie",
  "Visualisation": "analyse",
  "Autres": "texte",
  "Collections": "texte",
  "Nouvelles fonctionnalités": "texte",
  "Méta-composants": "effet",
};

// Construit le dictionnaire dynamiquement : alias manuels + noms des fiches du registre.
async function construireDictionnaire(): Promise<EntreeDictionnaire[]> {
  const registre = await obtenirRegistre();
  const parId = new Map<string, EntreeDictionnaire>();

  // 1. Alias manuels (synonymes, abréviations — curated)
  for (const alias of ALIAS_MANUELS) {
    const def = registre.trouverDef(alias.ficheId);
    if (!def) continue;
    parId.set(alias.ficheId, {
      mots: [...alias.mots],
      ficheId: alias.ficheId,
      label: def.nom,
      category: alias.category,
    });
  }

  // 2. Indexer les fiches du registre non présents dans les alias manuels.
  //    On n'indexe que le nom COMPLET (pas les mots individuels du resume,
  //    qui sont trop génériques et matchent en substring partout).
  for (const def of registre.tousLesPlugins()) {
    if (def.id.startsWith("__") || def.id.startsWith("frontiere")) continue;
    if (parId.has(def.id)) continue; // déjà dans les alias manuels
    const category = CATEGORIE_PAR_UNIVERS[def.univers] ?? "effet";
    const mots: string[] = [
      def.nom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    ];
    if (def.nomEn) mots.push(def.nomEn.toLowerCase());
    parId.set(def.id, { mots, ficheId: def.id, label: def.nom, category });
  }

  return [...parId.values()];
}

// Match un mot-clé dans le prompt. Pour les mots-clés d'un seul mot (<=3 chars),
// on exige une correspondance de mot entier (boundary). Pour les mots-clés longs,
// le substring suffit (ex: "réverbération" dans "une réverbération hall").
function matchMot(texte: string, mot: string): boolean {
  if (mot.length <= 4) {
    // Mot court : boundary requis (ex: "eq" ne matche pas "sequenceur")
    return new RegExp(`\\b${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(texte);
  }
  return texte.includes(mot);
}

async function parserPrompt(prompt: string): Promise<{ nodes: SpecNode[]; edges: SpecEdge[] }> {
  // Normaliser les accents pour le matching (séquenceur = séquenceur)
  const texte = prompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const dictionnaire = await construireDictionnaire();
  const nodes: SpecNode[] = [];
  const edges: SpecEdge[] = [];
  const vus = new Set<string>();

  // 1. Trouver tous les nodes mentionnés (dans l'ordre du dictionnaire)
  for (const entry of dictionnaire) {
    for (const mot of entry.mots) {
      const motNorm = mot.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (matchMot(texte, motNorm) && !vus.has(entry.ficheId)) {
        vus.add(entry.ficheId);
        nodes.push({ ficheId: entry.ficheId, label: entry.label });
        break;
      }
    }
  }

  // Si rien trouvé, on met au moins une source + une sortie
  if (nodes.length === 0) {
    nodes.push({ ficheId: "entree-audio", label: "Entrée audio" });
    nodes.push({ ficheId: "sortie-audio", label: "Sortie audio" });
  }

  // 2. S'assurer qu'il y a une source et une sortie
  const aSource = nodes.some((n) => dictionnaire.find((d) => d.ficheId === n.ficheId)?.category === "source");
  const aSortie = nodes.some((n) => dictionnaire.find((d) => d.ficheId === n.ficheId)?.category === "sortie");
  if (!aSource) nodes.unshift({ ficheId: "entree-audio", label: "Entrée audio" });
  if (!aSortie) nodes.push({ ficheId: "sortie-audio", label: "Sortie audio" });

  // 3. Connecter en chaîne : source → effets → analyse → texte → sortie
  const parCategory: Record<Category, number[]> = {
    source: [], effet: [], analyse: [], texte: [], sortie: [],
  };
  nodes.forEach((n, i) => {
    const cat = dictionnaire.find((d) => d.ficheId === n.ficheId)?.category ?? "effet";
    parCategory[cat].push(i);
  });

  const ordre = [...parCategory.source, ...parCategory.effet, ...parCategory.analyse, ...parCategory.texte, ...parCategory.sortie];
  for (let i = 0; i < ordre.length - 1; i++) {
    edges.push({ source: ordre[i], target: ordre[i + 1] });
  }

  return { nodes, edges };
}

// ── Génération pilotée par Ollama (complément du parser mots-clés ci-dessus) ──
// Le parser mots-clés reste le mode PAR DÉFAUT (rapide, hors-ligne, sans
// dépendance) ; Ollama est un mode optionnel pour les prompts que le matching
// littéral ne peut pas comprendre (tournures libres, intentions implicites).

// Un modèle local peut enrober sa réponse JSON dans un bloc ```json … ``` ou
// ajouter une phrase avant/après malgré la consigne « rien d'autre » — on
// extrait le premier objet JSON plausible plutôt que d'exiger une réponse nue.
export function extraireJson(texte: string): unknown | null {
  const nettoye = texte.replace(/```(?:json)?/gi, "").trim();
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut === -1 || fin === -1 || fin <= debut) return null;
  try {
    return JSON.parse(nettoye.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

// Un LLM peut halluciner un ficheId qui n'existe pas dans le registre — le
// point d'insertion sur le canevas (App.tsx:onGrapheGenere) ne valide RIEN,
// il créerait un nœud orphelin/cassé. On filtre ici les nœuds invalides et on
// réindexe les arêtes en conséquence, plutôt que de propager un id fantôme.
export function validerSpec(brut: unknown, idsValides: Set<string>): { nodes: SpecNode[]; edges: SpecEdge[] } | null {
  if (!brut || typeof brut !== "object") return null;
  const objet = brut as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(objet.nodes)) return null;

  const indexOriginalVersNouveau = new Map<number, number>();
  const nodes: SpecNode[] = [];
  (objet.nodes as unknown[]).forEach((n, i) => {
    if (!n || typeof n !== "object") return;
    const ficheId = (n as any).ficheId;
    if (typeof ficheId !== "string" || !idsValides.has(ficheId)) return; // id halluciné : on l'écarte
    const label = typeof (n as any).label === "string" && (n as any).label.trim() ? (n as any).label : ficheId;
    indexOriginalVersNouveau.set(i, nodes.length);
    nodes.push({ ficheId, label });
  });
  if (nodes.length === 0) return null;

  const edges: SpecEdge[] = [];
  if (Array.isArray(objet.edges)) {
    for (const e of objet.edges as unknown[]) {
      if (!e || typeof e !== "object") continue;
      const source = indexOriginalVersNouveau.get((e as any).source);
      const target = indexOriginalVersNouveau.get((e as any).target);
      if (source === undefined || target === undefined || source === target) continue;
      edges.push({ source, target });
    }
  }
  return { nodes, edges };
}

function construireCatalogue(dictionnaire: EntreeDictionnaire[]): string {
  // ficheId + label seulement : le prompt système reste compact même avec
  // ~200 nœuds (le catalogue complet, pas un sous-ensemble arbitraire — un
  // prompt sur les paroles doit pouvoir atteindre les nœuds "texte").
  const vus = new Set<string>();
  const lignes: string[] = [];
  for (const e of dictionnaire) {
    if (vus.has(e.ficheId)) continue;
    vus.add(e.ficheId);
    lignes.push(`${e.ficheId} — ${e.label}`);
  }
  return lignes.join("\n");
}

async function genererViaOllama(prompt: string, model: string, timeoutMs: number): Promise<{ nodes: SpecNode[]; edges: SpecEdge[] } | null> {
  const { ollamaGenerer } = await import("./ollama");
  const dictionnaire = await construireDictionnaire();
  const catalogue = construireCatalogue(dictionnaire);
  // Vérifié contre un vrai serveur Ollama (qwen3:4b, 2026-08-04) : sans garde-
  // fous, le modèle RAISONNE correctement (choisit les bons blocs) mais le
  // fait en texte libre avant le JSON — malgré la consigne « UNIQUEMENT du
  // JSON » — et sans limite de tokens explicite, la réponse est tronquée en
  // PLEIN raisonnement, jamais assez loin pour atteindre le JSON. Trois
  // garde-fous : `/no_think` (convention Qwen3 pour couper son canal de
  // raisonnement interne — ignoré sans effet par les modèles qui ne le
  // connaissent pas), un exemple concret (ancre le format mieux qu'une
  // description abstraite), et num_predict généreux pour ne jamais tronquer
  // avant le JSON même si le modèle raisonne quand même un peu.
  const instructions = `/no_think\nTu es un générateur de graphe de traitement audio nodal. Voici le catalogue des blocs disponibles (un par ligne, "identifiant — nom") :\n${catalogue}\n\nÀ partir de la description utilisateur ci-dessous, choisis les blocs pertinents et l'ordre de connexion (source → effets → sortie). Réponds UNIQUEMENT par l'objet JSON demandé — aucune explication, aucun raisonnement, aucun texte avant ou après.\n\nExemple de réponse attendue pour "un delay avec une réverbération puis la sortie" :\n{"nodes":[{"ficheId":"entree-audio","label":"Entrée"},{"ficheId":"delay-stereo","label":"Delay"},{"ficheId":"reverberation","label":"Réverbération"},{"ficheId":"sortie-audio","label":"Sortie"}],"edges":[{"source":0,"target":1},{"source":1,"target":2},{"source":2,"target":3}]}\n\n"ficheId" DOIT être copié tel quel depuis la colonne identifiant du catalogue ci-dessus — n'invente aucun identifiant. "source"/"target" sont les index (0-based) dans le tableau "nodes". Inclus toujours au moins un bloc source et un bloc de sortie.\n\nDescription utilisateur : ${prompt}`;

  const res = await ollamaGenerer({ model, prompt: instructions, options: { temperature: 0.2, num_predict: 2000 }, timeout: timeoutMs, format: "json" });
  if (res.erreur || !res.reponse) return null;
  const brut = extraireJson(res.reponse);
  if (!brut) return null;
  const idsValides = new Set(dictionnaire.map((e) => e.ficheId));
  return validerSpec(brut, idsValides);
}

export const fiches: FicheAudio[] = ([
  {
    id: "prompt-vers-graphe", nom: "Prompt → graphe", nomEn: "Prompt → graph",
    univers: "Autres", famille: "Texte",
    resume: "Génère un graphe de nodes depuis un prompt texte en langage naturel.",
    resumeEn: "Generates a node graph from a natural language text prompt.",
    // Port optionnel : `executer` retombe sur le paramètre Prompt si rien
    // n'est branché (voir plus bas). Sans `requis: false`, validerGraphe
    // bloquait l'exécution du nœud utilisé seul — cassant précisément l'usage
    // que le paramètre Prompt existe pour permettre. Bug préexistant, non lié
    // à l'ajout du mode Ollama, mais découvert et corrigé en le vérifiant.
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte", requis: false }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "delay stéréo avec feedback sur une réverbération hall, puis compresseur et sortie audio",
        doc: "Description en langage naturel du graphe à générer. Le parser reconnaît automatiquement tous les nodes installés (noms, synonymes, alias). Les nouveaux nodes (installés via .zip ou méta-composants) sont reconnus sans redémarrage.",
        docEn: "Natural language description of the graph to generate. The parser automatically recognizes all installed nodes (names, synonyms, aliases). Newly installed nodes (.zip or meta-components) are recognized without restart.", defautEn: "stereo delay with feedback on hall reverberation, then compressor and audio output" },
      { nom: "Méthode", nomEn: "Method", type: "choix", options: ["Mots-clés", "Ollama (IA)"], optionsEn: ["Keywords", "Ollama (AI)"], optionIds: ["mots-cles", "ollama"], defaut: "mots-cles",
        doc: "Mots-clés = rapide, hors-ligne, correspondance littérale (~40 mots-clés). Ollama = comprend des tournures libres via un modèle local, mais nécessite « ollama serve ». En cas d'échec Ollama (serveur injoignable, réponse invalide), on retombe automatiquement sur Mots-clés.",
        docEn: "Keywords = fast, offline, literal matching (~40 keywords). Ollama = understands free-form phrasing via a local model, but requires « ollama serve ». On Ollama failure (unreachable server, invalid reply), automatically falls back to Keywords." },
      { nom: "Modèle", nomEn: "Model", type: "texte", defaut: "qwen3:4b",
        doc: "Modèle Ollama à utiliser (mode Ollama uniquement). Voir « ollama list ».",
        docEn: "Ollama model to use (Ollama mode only). See « ollama list »." },
      { nom: "Délai max", nomEn: "Timeout", plage: [30, 1800], pas: 30, defaut: 600, unite: "s",
        doc: "Délai avant abandon (mode Ollama uniquement). Le premier appel à un modèle doit le charger en mémoire.",
        docEn: "Timeout before aborting (Ollama mode only). The first call to a model must load it into memory." },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "delay stéréo avec feedback sur une réverbération hall, puis compresseur et sortie audio");
      const methode = ctx.paramTexte("Méthode", "mots-cles");

      let resultat: { nodes: SpecNode[]; edges: SpecEdge[] } | null = null;
      let viaOllama = false;
      if (methode === "ollama") {
        ctx.onProgress(traduire("progress.ollama_var_0", ctx.paramTexte("Modèle", "qwen3:4b")));
        resultat = await genererViaOllama(prompt, ctx.paramTexte("Modèle", "qwen3:4b"), ctx.paramNombre("Délai max", 600) * 1000);
        viaOllama = resultat !== null;
      }
      const { nodes, edges } = resultat ?? await parserPrompt(prompt);

      const spec = { nodes, edges, prompt };
      (ctx.noeud.data as any)._grapheGenere = spec;

      const labels = nodes.map((n) => n.label);
      const chainDesc = labels.join(" → ");
      const prefixe = methode === "ollama" && !viaOllama ? `${traduire("msg.ollamaGraphRepli")} ` : "";
      return { valeurs: [chainDesc], message: prefixe + traduire("msg.var_0_nodes_var_1_connexions_var_2", nodes.length, edges.length, chainDesc) };
   },
 },
] as FicheAudio[]).map(avecDoc);
