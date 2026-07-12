// plugins/prompt-graphe.ts — Nœud « Prompt → graphe » : parse un prompt texte
// en langage naturel et génère un graphe de nodes correspondant sur le canevas.
// Utilise un parser de règles par mots-clés (pas d'IA lourde).
import { enregistrer } from "../core";
import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { tousLesPlugins } from "../core";

interface SpecNode {
  ficheId: string;
  label: string;
}

interface SpecEdge {
  source: number;  // index dans SpecNode[]
  target: number;
  sourceHandle?: string;
  targetHandle?: string;
}

// Dictionnaire mots-clés → ficheId. Chaque entrée a des mots-clés (FR + EN)
// et un label d'affichage. Le parser cherche les mots-clés dans le prompt.
const DICTIONNAIRE: { mots: string[]; ficheId: string; label: string; category: "source" | "effet" | "sortie" | "analyse" | "texte" }[] = [
  // Sources
  { mots: ["entrée audio", "audio input", "fichier audio", "load audio", "charger audio"], ficheId: "entree-audio", label: "Entrée audio", category: "source" },
  { mots: ["enregistreur", "micro", "recorder", "microphone"], ficheId: "enregistreur-audio", label: "Enregistreur", category: "source" },
  { mots: ["bruit", "noise"], ficheId: "generateur-bruit", label: "Bruit", category: "source" },
  { mots: ["oscillateur", "sinus", "sine", "tone", "tonalité", "fréquence pure", "générateur de fréquence"], ficheId: "generateur-frequence", label: "Fréquence", category: "source" },
  { mots: ["métronome", "metronome", "click track"], ficheId: "metronome", label: "Métronome", category: "source" },
  { mots: ["séquenceur batterie", "drum sequencer", "boîte à rythmes", "drum machine"], ficheId: "sequenceur-batterie", label: "Séq. batterie", category: "source" },
  { mots: ["séquenceur mélodique", "melodic sequencer", "piano-roll"], ficheId: "sequenceur-melodique", label: "Séq. mélodique", category: "source" },
  { mots: ["réservoir", "reservoir", "neural", "neuronal"], ficheId: "reservoir-musical", label: "Réservoir", category: "source" },
  { mots: ["réservoir midi", "reservoir midi", "neural midi"], ficheId: "reservoir-midi", label: "Réservoir MIDI", category: "source" },
  { mots: ["multi-réservoir", "multi reservoir", "polyphonique"], ficheId: "multi-reservoirs", label: "Multi-réservoirs", category: "source" },
  { mots: ["musicgen", "ia music", "ai music", "text to music"], ficheId: "musicgen", label: "MusicGen", category: "source" },
  { mots: ["entrée texte", "text input", "source texte", "text source"], ficheId: "source-texte", label: "Entrée texte", category: "source" },
  { mots: ["générateur de paroles", "lyrics generator", "paroles", "lyrics"], ficheId: "generateur-paroles", label: "Paroles", category: "source" },

  // Effets
  { mots: ["delay", "echo", "écho", "répétition"], ficheId: "delay-stereo", label: "Delay", category: "effet" },
  { mots: ["ping pong", "ping-pong"], ficheId: "echo-ping-pong", label: "Echo ping-pong", category: "effet" },
  { mots: ["réverbération", "reverb", "reverbe", "hall", "room", "pièce"], ficheId: "reverberation", label: "Réverbération", category: "effet" },
  { mots: ["convolution", "ir", "impulsion"], ficheId: "reverbe-convolution", label: "Conv. IR", category: "effet" },
  { mots: ["distorsion", "distortion", "overdrive", "saturation"], ficheId: "distorsion", label: "Distorsion", category: "effet" },
  { mots: ["compresseur", "compressor", "compression"], ficheId: "compresseur", label: "Compresseur", category: "effet" },
  { mots: ["gate", "expandeur", "expander"], ficheId: "gate-expandeur", label: "Gate/Expandeur", category: "effet" },
  { mots: ["égaliseur", "equalizer", "eq"], ficheId: "equaliseur", label: "Égaliseur", category: "effet" },
  { mots: ["filtre", "filter", "passe-bas", "lowpass", "passe-haut", "highpass", "réponse filtre", "filter response"], ficheId: "reponse-filtre", label: "Filtre + réponse", category: "effet" },
  { mots: ["flanger", "flange"], ficheId: "flanger", label: "Flanger", category: "effet" },
  { mots: ["chorus"], ficheId: "chorus", label: "Chorus", category: "effet" },
  { mots: ["bitcrusher", "8-bit", "lo-fi", "lofi"], ficheId: "bitcrusher", label: "Bitcrusher", category: "effet" },
  { mots: ["ring mod", "ring modulator", "modulation anneau"], ficheId: "ring-modulator", label: "Ring mod", category: "effet" },
  { mots: ["de-esser", "deesser", "sibilance"], ficheId: "de-esser", label: "De-esser", category: "effet" },
  { mots: ["pitch", "tonalité", "transpose", "hauteur"], ficheId: "changement-tonalite", label: "Pitch shift", category: "effet" },
  { mots: ["tempo", "time stretch", "vitesse", "ralentir", "accélérer"], ficheId: "changement-tempo", label: "Tempo", category: "effet" },
  { mots: ["inverse", "reverse", "retourner"], ficheId: "inverseur-audio", label: "Inverseur", category: "effet" },
  { mots: ["fondu", "fade", "fade in", "fade out"], ficheId: "fondu", label: "Fondu", category: "effet" },
  { mots: ["normalize", "normaliser", "gain"], ficheId: "amplificateur", label: "Amplificateur", category: "effet" },
  { mots: ["formant", "formant shift", "conversion vocale", "voice conversion", "homme femme"], ficheId: "shift-formants", label: "Shift formants", category: "effet" },
  { mots: ["silence", "ajouter silence", "add silence"], ficheId: "ajouter-silence", label: "Ajouter silence", category: "effet" },
  { mots: ["boucle", "loop", "répéter"], ficheId: "simple-boucle", label: "Boucle", category: "effet" },
  { mots: ["aligner", "align", "aligneur"], ficheId: "aligneur-piste", label: "Aligneur", category: "effet" },

  // Analyse
  { mots: ["spectre", "spectrum", "fft", "analyseur"], ficheId: "analyseur-spectre", label: "Spectre", category: "analyse" },
  { mots: ["spectrogramme", "spectrogram"], ficheId: "spectrogramme", label: "Spectrogramme", category: "analyse" },
  { mots: ["forme d'onde", "waveform", "visualiseur"], ficheId: "visualiseur-forme-onde", label: "Forme d'onde", category: "analyse" },
  { mots: ["vu-mètre", "vu meter", "lufs", "loudness", "niveau"], ficheId: "vu-metre", label: "VU-mètre", category: "analyse" },
  { mots: ["accords", "chord", "détection accords", "chord detector"], ficheId: "detecteur-accords", label: "Accords", category: "analyse" },
  { mots: ["colorsynth", "couleur spectre", "color spectrum"], ficheId: "colorsynth", label: "ColorSynth", category: "analyse" },
  { mots: ["comparateur", "a/b", "ab compare"], ficheId: "comparateur-ab", label: "Comparateur A/B", category: "analyse" },
  { mots: ["sélecteur zones", "multi zones", "zone selector"], ficheId: "selecteur-multi-zones", label: "Sélecteur zones", category: "analyse" },
  { mots: ["oscillateur pédagogique", "harmoniques", "timbre"], ficheId: "oscillateur", label: "Oscillateur", category: "analyse" },

  // Sortie
  { mots: ["sortie audio", "audio output", "output", "écouter", "listen"], ficheId: "sortie-audio", label: "Sortie audio", category: "sortie" },
  { mots: ["sortie texte", "text output", "texte sortie"], ficheId: "sortie-texte", label: "Sortie texte", category: "sortie" },
  { mots: ["mp3", "convertir mp3"], ficheId: "convertisseur-audio", label: "MP3", category: "sortie" },
  { mots: ["wav", "convertir wav"], ficheId: "convertisseur-mp3-wav", label: "WAV", category: "sortie" },
  { mots: ["point d'écoute", "listening point", "monitor"], ficheId: "point-ecoute", label: "Point d'écoute", category: "sortie" },

  // Texte / IA
  { mots: ["gpt-2", "distilgpt", "paroles ia", "ai lyrics", "gpt paroles"], ficheId: "gpt2-paroles", label: "DistilGPT-2", category: "texte" },
  { mots: ["nllb", "paroles multilingue", "multilingual lyrics"], ficheId: "nllb-paroles", label: "NLLB", category: "texte" },
  { mots: ["réservoir textuel", "text reservoir", "texte aléatoire"], ficheId: "reservoir-textuel", label: "Réservoir texte", category: "texte" },
  { mots: ["speecht5", "tts", "synthèse vocale", "text to speech"], ficheId: "tts-speecht5", label: "SpeechT5 TTS", category: "texte" },
  { mots: ["mms", "mms tts", "multilingue tts"], ficheId: "tts-mms", label: "MMS TTS", category: "texte" },
  { mots: ["whisper", "transcription", "speech to text", "asr"], ficheId: "whisper-en", label: "Whisper", category: "texte" },
  { mots: ["whisper multilingue", "whisper multilingual"], ficheId: "whisper-multilingue", label: "Whisper multilingue", category: "texte" },
  { mots: ["traduction", "translate", "opus", "translator"], ficheId: "traduction-opus", label: "Traduction", category: "texte" },
  { mots: ["couleur suno", "color suno", "couleur ia"], ficheId: "couleur-suno-ia", label: "Couleur→Suno", category: "texte" },
  { mots: ["pochette", "cover", "album cover"], ficheId: "generateur-pochette", label: "Pochette", category: "texte" },
  { mots: ["galerie", "gallery", "exposition"], ficheId: "galerie-exposition", label: "Galerie", category: "texte" },
];

function parserPrompt(prompt: string): { nodes: SpecNode[]; edges: SpecEdge[] } {
  const texte = prompt.toLowerCase();
  const nodes: SpecNode[] = [];
  const edges: SpecEdge[] = [];
  const vus = new Set<string>();

  // 1. Trouver tous les nodes mentionnés (dans l'ordre du prompt)
  for (const entry of DICTIONNAIRE) {
    for (const mot of entry.mots) {
      if (texte.includes(mot) && !vus.has(entry.ficheId)) {
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
  const aSource = nodes.some((n) => DICTIONNAIRE.find((d) => d.ficheId === n.ficheId)?.category === "source");
  const aSortie = nodes.some((n) => DICTIONNAIRE.find((d) => d.ficheId === n.ficheId)?.category === "sortie");
  if (!aSource) nodes.unshift({ ficheId: "entree-audio", label: "Entrée audio" });
  if (!aSortie) nodes.push({ ficheId: "sortie-audio", label: "Sortie audio" });

  // 3. Connecter en chaîne : source → effets (dans l'ordre) → analyse → sortie
  const parCategory = {
    source: [] as number[],
    effet: [] as number[],
    analyse: [] as number[],
    texte: [] as number[],
    sortie: [] as number[],
  };
  nodes.forEach((n, i) => {
    const cat = DICTIONNAIRE.find((d) => d.ficheId === n.ficheId)?.category ?? "effet";
    parCategory[cat].push(i);
  });

  const ordre = [...parCategory.source, ...parCategory.effet, ...parCategory.analyse, ...parCategory.texte, ...parCategory.sortie];
  for (let i = 0; i < ordre.length - 1; i++) {
    edges.push({ source: ordre[i], target: ordre[i + 1] });
  }

  return { nodes, edges };
}

for (const def of [
  {
    id: "prompt-vers-graphe", nom: "Prompt → graphe", nomEn: "Prompt → graph",
    univers: "Autres", famille: "Texte",
    resume: "Génère un graphe de nodes depuis un prompt texte en langage naturel.",
    resumeEn: "Generates a node graph from a natural language text prompt.",
    entrees: [{ nom: "Texte", type: "texte" }],
    sorties: [{ nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Prompt", nomEn: "Prompt", type: "texte", defaut: "delay stéréo avec feedback sur une réverbération hall, puis compresseur et sortie audio",
        doc: "Description en langage naturel du graphe à générer. Ex : « delay avec feedback court sur une réverbération hall puis sortie ». Le parser reconnaît ~40 mots-clés (effets, sources, sorties, analyse) en FR et EN.",
        docEn: "Natural language description of the graph to generate. E.g. « delay with short feedback on a hall reverb then output ». The parser recognizes ~40 keywords (effects, sources, outputs, analysis) in FR and EN." },
    ],
    async executer(ctx: any) {
      const promptEntree = ctx.entree(0);
      const prompt = typeof promptEntree === "string" && promptEntree.trim()
        ? promptEntree
        : ctx.paramTexte("Prompt", "delay stéréo avec feedback sur une réverbération hall, puis compresseur et sortie audio");

      const { nodes, edges } = parserPrompt(prompt);

      // Stocker la spec dans data pour que l'App la lise via un callback
      const spec = { nodes, edges, prompt };
      (ctx.noeud.data as any)._grapheGenere = spec;

      // Générer un texte descriptif
      const labels = nodes.map((n) => n.label);
      const chainDesc = labels.join(" → ");
      return { valeurs: [chainDesc], message: `${nodes.length} nodes · ${edges.length} connexions\n${chainDesc}` };
    },
  },
] as PluginDef[]) enregistrer(avecDoc(def));
