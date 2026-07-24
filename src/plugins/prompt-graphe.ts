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
import { registre } from "../audio/adaptateur";

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
  { ficheId: "enregistreur-audio", mots: ["enregistreur", "micro", "recorder", "microphone"], category: "source" },
  { ficheId: "capture-systeme-audio", mots: ["capture système", "system audio", "capture audio", "what you hear", "loopback"], category: "source" },
  { ficheId: "generateur-bruit", mots: ["bruit", "noise"], category: "source" },
  { ficheId: "generateur-frequence", mots: ["oscillateur", "sinus", "sine", "tone", "tonalité", "fréquence pure", "générateur de fréquence"], category: "source" },
  { ficheId: "metronome", mots: ["métronome", "metronome", "click track"], category: "source" },
  { ficheId: "sequenceur-batterie", mots: ["séquenceur batterie", "drum sequencer", "boîte à rythmes", "drum machine"], category: "source" },
  { ficheId: "sequenceur-melodique", mots: ["séquenceur mélodique", "melodic sequencer", "piano-roll"], category: "source" },
  { ficheId: "reservoir-musical", mots: ["réservoir", "reservoir", "neural", "neuronal"], category: "source" },
  { ficheId: "reservoir-midi", mots: ["réservoir midi", "reservoir midi", "neural midi"], category: "source" },
  { ficheId: "multi-reservoirs", mots: ["multi-réservoir", "multi reservoir", "polyphonique"], category: "source" },
  { ficheId: "sampler-midi", mots: ["sampler midi", "midi sampler", "échantillon midi", "sample midi"], category: "effet" },
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
  { ficheId: "formule-echantillons", mots: ["formule", "math", "sample formula", "expression mathématique", "y ="], category: "effet" },
  { ficheId: "formule-spectrale", mots: ["spectral formula", "formule spectrale", "spectral shaping", "magnitude", "phase"], category: "effet" },
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
  { ficheId: "auto-pan", mots: ["auto-pan", "auto pan", "autopan", "balayage stéréo", "stereo sweep", "pan animé"], category: "effet" },
  { ficheId: "wahwah", mots: ["wah-wah", "wahwah", "wah", "crybaby", "pédale wah"], category: "effet" },
  { ficheId: "phaser", mots: ["phaser", "phase shifter", "déphaseur"], category: "effet" },
  { ficheId: "vibrato", mots: ["vibrato", "vibration hauteur", "pitch wobble"], category: "effet" },
  { ficheId: "octaver", mots: ["octaver", "octave", "octave sup", "octave inf", "sub octave", "harmonizer"], category: "effet" },
  { ficheId: "chopper", mots: ["chopper", "chop", "stutter", "gate rythmique", "rhythmic gate", "tremolo extrême"], category: "effet" },
  { ficheId: "echo", mots: ["echo", "delay", "répétition", "ping pong", "ping-pong"], category: "effet" },
  { ficheId: "voice-changer", mots: ["voice changer", "changer voix", "modifier voix", "chipmunk", "robot voice", "monster voice"], category: "effet" },
  { ficheId: "simple-boucle", mots: ["boucle", "loop", "répéter"], category: "effet" },
  { ficheId: "pure-data", mots: ["pure data", "pd", "patch", "libpd"], category: "effet" },
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
  { ficheId: "whisper-en", mots: ["whisper", "transcription", "speech to text", "asr"], category: "texte" },
  { ficheId: "whisper-multilingue", mots: ["whisper multilingue", "whisper multilingual"], category: "texte" },
  { ficheId: "traduction-opus", mots: ["traduction", "translate", "opus", "translator"], category: "texte" },
  { ficheId: "couleur-suno-ia", mots: ["couleur suno", "color suno", "couleur ia"], category: "texte" },
  { ficheId: "generateur-pochette", mots: ["pochette", "cover", "album cover"], category: "texte" },
  { ficheId: "galerie-exposition", mots: ["galerie", "gallery", "exposition"], category: "texte" },
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
function construireDictionnaire(): EntreeDictionnaire[] {
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

function parserPrompt(prompt: string): { nodes: SpecNode[]; edges: SpecEdge[] } {
  // Normaliser les accents pour le matching (séquenceur = séquenceur)
  const texte = prompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const dictionnaire = construireDictionnaire();
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

export const fiches: FicheAudio[] = ([
  {
    id: "prompt-vers-graphe", nom: "Prompt → graphe", nomEn: "Prompt → graph",
    univers: "Autres", famille: "Texte",
    resume: "Génère un graphe de nodes depuis un prompt texte en langage naturel.",
    resumeEn: "Generates a node graph from a natural language text prompt.",
    entrees: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "delay stéréo avec feedback sur une réverbération hall, puis compresseur et sortie audio",
        doc: "Description en langage naturel du graphe à générer. Le parser reconnaît automatiquement tous les nodes installés (noms, synonymes, alias). Les nouveaux nodes (installés via .zip ou méta-composants) sont reconnus sans redémarrage.",
        docEn: "Natural language description of the graph to generate. The parser automatically recognizes all installed nodes (names, synonyms, aliases). Newly installed nodes (.zip or meta-components) are recognized without restart.", defautEn: "stereo delay with feedback on hall reverberation, then compressor and audio output" },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "delay stéréo avec feedback sur une réverbération hall, puis compresseur et sortie audio");

      const { nodes, edges } = parserPrompt(prompt);

      const spec = { nodes, edges, prompt };
      (ctx.noeud.data as any)._grapheGenere = spec;

      const labels = nodes.map((n) => n.label);
      const chainDesc = labels.join(" → ");
      return { valeurs: [chainDesc], message: traduire("msg.var_0_nodes_var_1_connexions_var_2", nodes.length, edges.length, chainDesc) };
   },
 },
] as FicheAudio[]).map(avecDoc);
