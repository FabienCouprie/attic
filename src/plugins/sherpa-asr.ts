// plugins/sherpa-asr.ts — Nœud « Sherpa ASR » : reconnaissance vocale locale
// via Sherpa-ONNX (Whisper tiny multilingue) dans un Web Worker classique.
// Le worker charge les modèles ONNX depuis HuggingFace au premier usage.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

const MODEL_BASE_URL = "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main";
const MODEL_DIR = "/sherpa-asr-model";

const LANGUES: Record<string, string> = {
  "Auto": "",
  "Anglais": "en",
  "Français": "fr",
  "Espagnol": "es",
  "Allemand": "de",
  "Italien": "it",
  "Portugais": "pt",
  "Néerlandais": "nl",
  "Russe": "ru",
  "Japonais": "ja",
  "Chinois": "zh",
  "Arabe": "ar",
  "Hindi": "hi",
  "Coréen": "ko",
};

let worker: Worker | null = null;
let currentConfigHash: string | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker("/sherpa-asr-worker.js", { type: "classic" });
  }
  return worker;
}

function makeRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function bufferVersMono(buffer: AudioBuffer): Float32Array {
  const nch = buffer.numberOfChannels;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < nch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / nch;
  }
  return mono;
}

const RESAMPLE_OPTIONS_FR = ["Haute (Web Audio)", "Standard (linéaire)"] as const;
const RESAMPLE_OPTIONS_EN = ["High (Web Audio)", "Standard (linear)"] as const;

const CACHE_OPTIONS_FR = ["Auto (conservé entre sessions)", "Vider et re-télécharger"] as const;
const CACHE_OPTIONS_EN = ["Auto (kept across sessions)", "Clear and re-download"] as const;

export function resamplerLineaireVers16k(mono: Float32Array, sr: number): Float32Array {
  if (sr === 16000) return mono;
  const ratio = 16000 / sr;
  const nb = Math.floor(mono.length * ratio);
  const out = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = idx + 1 < mono.length ? mono[idx] * (1 - frac) + mono[idx + 1] * frac : mono[Math.min(idx, mono.length - 1)];
  }
  return out;
}

async function resamplerWebAudioVers16k(mono: Float32Array, sr: number): Promise<Float32Array> {
  if (sr === 16000) return mono;
  if (typeof AudioBuffer === "undefined" || typeof OfflineAudioContext === "undefined") {
    throw new Error("OfflineAudioContext unavailable");
  }
  const sourceBuffer = new AudioBuffer({ numberOfChannels: 1, length: mono.length, sampleRate: sr });
  sourceBuffer.getChannelData(0).set(mono);
  const targetLength = Math.max(1, Math.ceil(mono.length * 16000 / sr));
  const ctx = new OfflineAudioContext(1, targetLength, 16000);
  const source = ctx.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

export async function resamplerVers16k(mono: Float32Array, sr: number, mode: string): Promise<Float32Array> {
  if (mode === RESAMPLE_OPTIONS_FR[1] || mode === RESAMPLE_OPTIONS_EN[1]) {
    return resamplerLineaireVers16k(mono, sr);
  }
  try {
    return await resamplerWebAudioVers16k(mono, sr);
  } catch (e) {
    console.warn("[sherpa-asr] Web Audio resampling failed, falling back to linear", e);
    return resamplerLineaireVers16k(mono, sr);
  }
}

interface SherpaFileRef { url: string; fsPath: string; }
interface SherpaRecognizerConfig {
  featConfig: { sampleRate: number; featureDim: number };
  modelConfig: {
    numThreads: number;
    debug: number;
    provider: string;
    tokens: string;
    whisper: {
      encoder: string;
      decoder: string;
      language: string;
      task: string;
      tailPaddings: number;
      enableTokenTimestamps: number;
      enableSegmentTimestamps: number;
    };
  };
  lmConfig: { model: string; scale: number };
  decodingMethod: string;
  maxActivePaths: number;
}

interface SherpaWorkerConfig {
  modelDir: string;
  debug: number;
  files: SherpaFileRef[];
  recognizerConfig: SherpaRecognizerConfig;
}

function buildConfig(langCode: string): SherpaWorkerConfig {
  const files: SherpaFileRef[] = [
    { url: `${MODEL_BASE_URL}/tiny-encoder.int8.onnx`, fsPath: `${MODEL_DIR}/tiny-encoder.int8.onnx` },
    { url: `${MODEL_BASE_URL}/tiny-decoder.int8.onnx`, fsPath: `${MODEL_DIR}/tiny-decoder.int8.onnx` },
    { url: `${MODEL_BASE_URL}/tiny-tokens.txt`, fsPath: `${MODEL_DIR}/tiny-tokens.txt` },
  ];
  return {
    modelDir: MODEL_DIR,
    debug: 0,
    files,
    recognizerConfig: {
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        numThreads: 1,
        debug: 0,
        provider: "cpu",
        tokens: `${MODEL_DIR}/tiny-tokens.txt`,
        whisper: {
          encoder: `${MODEL_DIR}/tiny-encoder.int8.onnx`,
          decoder: `${MODEL_DIR}/tiny-decoder.int8.onnx`,
          language: langCode,
          task: "transcribe",
          tailPaddings: -1,
          enableTokenTimestamps: 0,
          enableSegmentTimestamps: 0,
        },
      },
      lmConfig: { model: "", scale: 0 },
      decodingMethod: "greedy_search",
      maxActivePaths: 4,
    },
  };
}

function hashConfig(config: SherpaWorkerConfig): string {
  return JSON.stringify(config);
}

function sendInit(w: Worker, config: SherpaWorkerConfig, onProgress?: (detail: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = makeRequestId();
    const timer = setTimeout(() => reject(new Error(traduire("msg.sherpa_asr.init_timeout"))), 120000);
    const onMsg = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.requestId !== requestId) return;
      if (msg.type === "ready") {
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        resolve();
      } else if (msg.type === "error") {
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        reject(new Error(msg.error));
      } else if (msg.type === "progress" && onProgress) {
        onProgress(`${msg.filename}: ${msg.percent}%`);
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "init", config, requestId });
  });
}

function sendClearCache(w: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = makeRequestId();
    const timer = setTimeout(() => reject(new Error(traduire("msg.sherpa_asr.clear_cache_timeout"))), 30000);
    const onMsg = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.requestId !== requestId) return;
      if (msg.type === "cacheCleared") {
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        resolve();
      } else if (msg.type === "error") {
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        reject(new Error(msg.error));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "clearCache", requestId });
  });
}

function sendTranscribe(w: Worker, sampleRate: number, samples: Float32Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = makeRequestId();
    const timer = setTimeout(() => reject(new Error(traduire("msg.sherpa_asr.transcribe_timeout"))), 180000);
    const onMsg = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.requestId !== requestId) return;
      if (msg.type === "done") {
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        resolve(msg.text || "");
      } else if (msg.type === "error") {
        clearTimeout(timer);
        w.removeEventListener("message", onMsg);
        reject(new Error(msg.error));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "transcribe", requestId, sampleRate, samples: samples.buffer }, [samples.buffer]);
  });
}

export const fiches: FicheAudio[] = ([
  {
    id: "sherpa-asr",
    nom: "Sherpa ASR",
    nomEn: "Sherpa ASR",
    univers: "Autres",
    famille: "Speech to Text",
    resume: "Reconnaissance vocale locale via Sherpa-ONNX (Whisper tiny multilingue).",
    resumeEn: "Local speech recognition via Sherpa-ONNX (multilingual Whisper tiny).",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [{ nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      {
        nom: "Langue",
        nomEn: "Language",
        type: "choix",
        options: Object.keys(LANGUES),
        // Ids canoniques = codes ISO 639-1, c'est-à-dire les valeurs mêmes de
        // LANGUES (« auto » pour l'entrée sans code). Le libellé français n'est
        // donc plus l'identité du paramètre.
        optionIds: Object.values(LANGUES).map((c) => c || "auto"),
        optionsEn: ["Auto", "English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Russian", "Japanese", "Chinese", "Arabic", "Hindi", "Korean"],
        defaut: "Auto",
        defautEn: "Auto",
        doc: "Langue du discours à transcrire. « Auto » laisse Whisper détecter la langue. Le modèle est multilingue (99 langues).",
        docEn: "Language of the speech to transcribe. « Auto » lets Whisper detect the language. The model is multilingual (99 languages).",
      },
      {
        nom: "Qualité resampling",
        nomEn: "Resampling quality",
        type: "choix",
        options: [...RESAMPLE_OPTIONS_FR],
        optionsEn: [...RESAMPLE_OPTIONS_EN],
        defaut: RESAMPLE_OPTIONS_FR[0],
        defautEn: RESAMPLE_OPTIONS_EN[0],
        doc: "Choix de la qualité du resampling vers 16 kHz. « Haute » utilise Web Audio API (meilleure qualité) avec retour automatique à l'interpolation linéaire si nécessaire. « Standard » conserve l'interpolation linéaire rapide d'origine.",
        docEn: "Choose the resampling quality to 16 kHz. « High » uses Web Audio API (better quality) with automatic fallback to linear interpolation if needed. « Standard » keeps the original fast linear interpolation.",
      },
      {
        nom: "Cache modèle",
        nomEn: "Model cache",
        type: "choix",
        options: [...CACHE_OPTIONS_FR],
        optionsEn: [...CACHE_OPTIONS_EN],
        defaut: CACHE_OPTIONS_FR[0],
        defautEn: CACHE_OPTIONS_EN[0],
        doc: "Gestion du cache offline du modèle ONNX. « Auto » conserve le modèle téléchargé entre les sessions (IndexedDB). « Vider et re-télécharger » supprime le cache et force un nouveau téléchargement.",
        docEn: "Manage the offline cache of the ONNX model. « Auto » keeps the downloaded model across sessions (IndexedDB). « Clear and re-download » deletes the cache and forces a fresh download.",
      },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      }
      // `paramTexte` renvoie désormais l'id canonique, qui EST le code ISO
      // (« auto » = pas de code). Le repli sur LANGUES couvre les projets
      // enregistrés avant la migration, qui stockent encore le libellé.
      const langue = ctx.paramTexte("Langue", "auto");
      const langCode = langue === "auto" ? "" : (LANGUES[langue] ?? langue);
      const qualiteResampling = ctx.paramTexte("Qualité resampling", RESAMPLE_OPTIONS_FR[0]);
      const modeCache = ctx.paramTexte("Cache modèle", CACHE_OPTIONS_FR[0]);
      const mono = bufferVersMono(audio);
      const mono16k = await resamplerVers16k(mono, audio.sampleRate, qualiteResampling);
      const config = buildConfig(langCode);
      const configHash = hashConfig(config);
      const w = getWorker();
      try {
        if (modeCache === CACHE_OPTIONS_FR[1] || modeCache === CACHE_OPTIONS_EN[1]) {
          ctx.onProgress(traduire("progress.sherpa_asr.clear_cache"));
          await sendClearCache(w);
          currentConfigHash = null;
        }
        if (configHash !== currentConfigHash) {
          ctx.onProgress(traduire("progress.sherpa_asr.load_model"));
          await sendInit(w, config, (detail) => ctx.onProgress(`${traduire("progress.sherpa_asr.load_model")} ${detail}`));
          currentConfigHash = configHash;
        }
        ctx.onProgress(traduire("progress.sherpa_asr.transcribe"));
        const text = await sendTranscribe(w, 16000, mono16k);
        return {
          valeurs: [text],
          message: text ? `${text.slice(0, 60)}${text.length > 60 ? "…" : ""}` : traduire("msg.sherpa_asr.vide"),
        };
      } catch (e: any) {
        console.error("[sherpa-asr]", e);
        return {
          valeurs: [null],
          erreur: true,
          message: `${traduire("msg.erreur_sherpa_asr")} ${e?.message || String(e)}`,
        };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);

// Note : le worker est volontairement gardé en vie entre les exécutions pour
// éviter de re-télécharger le modèle ~100 MB à chaque run. Il est recréé si la
// langue change (reconnaissance d'une langue différente nécessite une nouvelle
// config Whisper).
