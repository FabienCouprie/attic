// plugins/python-processor.ts — Nœud « Python Processor » :
// éditeur de code Python avec coloration syntaxique légère.
// L'audio d'entrée est converti en WAV temporaire, le script Python
// le traite et produit un WAV de sortie.

import type { PluginDef } from "../core";
import { avecDoc } from "./notices";
import { bufferVersWavBlob } from "../audio";

// Coloration syntaxique Python (highlight simple par tokens)
const PYTHON_KEYWORDS = new Set([
  "def", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or",
  "import", "from", "as", "class", "try", "except", "finally", "with", "lambda",
  "None", "True", "False", "is", "pass", "break", "continue", "global", "nonlocal",
  "yield", "async", "await", "raise", "assert", "del", "print",
]);

export function tokenizePython(code: string): { text: string; type: string }[] {
  const tokens: { text: string; type: string }[] = [];
  let i = 0;
  while (i < code.length) {
    // Commentaires
    if (code[i] === "#") {
      let end = code.indexOf("\n", i);
      if (end === -1) end = code.length;
      tokens.push({ text: code.slice(i, end), type: "comment" });
      i = end;
      continue;
    }
    // Strings (triple quote)
    if (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") {
      const q = code.slice(i, i + 3);
      let end = code.indexOf(q, i + 3);
      if (end === -1) end = code.length;
      else end += 3;
      tokens.push({ text: code.slice(i, end), type: "string" });
      i = end;
      continue;
    }
    // Strings (simple)
    if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q) {
        if (code[j] === "\\") j++;
        j++;
      }
      j++;
      tokens.push({ text: code.slice(i, j), type: "string" });
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[0-9._eExa-fA-F]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), type: "number" });
      i = j;
      continue;
    }
    // Identifiers / keywords
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);
      tokens.push({ text: word, type: PYTHON_KEYWORDS.has(word) ? "keyword" : "ident" });
      i = j;
      continue;
    }
    // Tout le reste
    let j = i;
    while (j < code.length && !/[a-zA-Z0-9_#"']/.test(code[j])) j++;
    if (j === i) j++;
    tokens.push({ text: code.slice(i, j), type: "plain" });
    i = j;
  }
  return tokens;
}

const CODE_DEFAUT = `import numpy as np
import wave
import os
import sys

# input_path = sys.argv[1]  (WAV d'entrée)
# output_path = os.environ["ATTIC_OUTPUT_PATH"]  (WAV à produire)
# sample_rate = int(os.environ.get("ATTIC_SAMPLE_RATE", 44100))

input_path = sys.argv[1] if len(sys.argv) > 1 else None
output_path = os.environ.get("ATTIC_OUTPUT_PATH", "output.wav")
sample_rate = int(os.environ.get("ATTIC_SAMPLE_RATE", 44100))

# Lire le WAV d'entrée
if input_path:
    with wave.open(input_path, 'rb') as w:
        channels = w.getnchannels()
        sr = w.getframerate()
        frames = w.readframes(w.getnframes())
    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        audio = audio.reshape(-1, channels)
else:
    # Pas d'entrée — générer 2s de silence
    audio = np.zeros(sample_rate * 2, dtype=np.float32)
    channels = 1
    sr = sample_rate

# === TRAITEMENT ===
# Exemple : doubler le volume
audio = audio * 2.0
# Éviter l'écrêtage
audio = np.clip(audio, -1.0, 1.0)

# Écrire le WAV de sortie
if audio.ndim == 1:
    channels = 1
    audio_int = (audio * 32767).astype(np.int16)
else:
    channels = audio.shape[1]
    audio_int = (audio * 32767).astype(np.int16)

with wave.open(output_path, 'wb') as w:
    w.setnchannels(channels)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    w.writeframes(audio_int.tobytes())

print(f"Traité: {len(audio)} samples, {channels} canaux")
`;

export const fiches: PluginDef[] = ([
  {
    id: "python-processor", nom: "Python Processor", nomEn: "Python Processor",
    univers: "Nouvelles fonctionnalités", famille: "Génération",
    resume: "Éditeur de code Python avec coloration syntaxique pour traiter l'audio.",
    resumeEn: "Python code editor with syntax highlighting for audio processing.",
    entrees: [
      { nom: "Audio", type: "audio", requis: false },
      { nom: "MIDI", type: "midi", requis: false },
      { nom: "Texte", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }, { nom: "Texte", type: "texte" }],
    parametres: [
      { nom: "Code", nomEn: "Code", type: "texte", defaut: CODE_DEFAUT,
        doc: "Code Python à exécuter. Variables : sys.argv[1] = WAV d'entrée, ATTIC_OUTPUT_PATH = WAV de sortie, ATTIC_SAMPLE_RATE, ATTIC_CHANNELS. Nécessite numpy + wave.",
        docEn: "Python code to execute. Variables: sys.argv[1] = input WAV, ATTIC_OUTPUT_PATH = output WAV, ATTIC_SAMPLE_RATE, ATTIC_CHANNELS. Requires numpy + wave." },
      { nom: "Timeout", nomEn: "Timeout", plage: [5, 120], pas: 5, defaut: 30, unite: "s",
        doc: "Durée maximale d'exécution du script (en secondes).",
        docEn: "Maximum script execution time (in seconds)." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.pythonInfo) return { valeurs: [null, null, null], message: "Nécessite Electron." };

      const info = await api.pythonInfo();
      if (!info.disponible) {
        return { valeurs: [null, null, null], erreur: true, message: `Python non trouvé. Cliquez sur ⚙ Configurer dans le node.` };
      }

      const audio = ctx.entree(0);
      const midi = ctx.entree(1);
      const texte = ctx.entree(2);
      const code = ctx.paramTexte("Code", CODE_DEFAUT);
      const timeout = ctx.paramNombre("Timeout", 30);

      const tmpDir = (window as any).api?.obtenirRepertoireTravail?.() || "work";

      // Préparer le WAV d'entrée (argv[1])
      let inputPath: string | null = null;
      if (audio instanceof AudioBuffer) {
        const blob = bufferVersWavBlob(audio);
        const arrayBuf = await blob.arrayBuffer();
        inputPath = `${tmpDir}/python_input_${Date.now()}.wav`;
        await api.ecrireFichier(inputPath, new Uint8Array(arrayBuf));
      }

      // Préparer le MIDI d'entrée (argv[2])
      let midiPath: string | null = null;
      if (midi instanceof File) {
        midiPath = `${tmpDir}/python_input_${Date.now()}.mid`;
        const midiBuf = new Uint8Array(await midi.arrayBuffer());
        await api.ecrireFichier(midiPath, midiBuf);
      }

      // Préparer le texte d'entrée (argv[3] + env ATTIC_TEXT_INPUT)
      let inputText: string | null = null;
      if (typeof texte === "string" && texte.trim()) {
        inputText = texte;
      }

      // Chemins de sortie
      const outputPath = `${tmpDir}/python_output_${Date.now()}.wav`;
      const outputMidiPath = `${tmpDir}/python_output_${Date.now()}.mid`;
      const outputTextPath = `${tmpDir}/python_output_${Date.now()}.txt`;

      ctx.onProgress("Exécution du script Python…");
      const inputs: { path: string }[] = [];
      if (inputPath) inputs.push({ path: inputPath });
      if (midiPath) inputs.push({ path: midiPath });

      const result = await api.pythonExecuter({
        code,
        inputs,
        outputPath,
        sampleRate: audio instanceof AudioBuffer ? audio.sampleRate : 44100,
        channels: audio instanceof AudioBuffer ? audio.numberOfChannels : 2,
        timeout: timeout * 1000,
        env: {
          ATTIC_OUTPUT_PATH: outputPath,
          ATTIC_OUTPUT_MIDI: outputMidiPath,
          ATTIC_OUTPUT_TEXT: outputTextPath,
          ATTIC_TEXT_INPUT: inputText || "",
          ATTIC_SAMPLE_RATE: String(audio instanceof AudioBuffer ? audio.sampleRate : 44100),
          ATTIC_CHANNELS: String(audio instanceof AudioBuffer ? audio.numberOfChannels : 2),
        },
      });

      // Nettoyer les fichiers d'entrée
      if (inputPath) { try { await api.supprimerFichier(inputPath); } catch {} }
      if (midiPath) { try { await api.supprimerFichier(midiPath); } catch {} }

      if (!result.ok) {
        const pyInfo = result.python ? `\nPython: ${result.python}` : "";
        return { valeurs: [null, null, null], erreur: true, message: `Erreur Python:\n${result.erreur || result.stderr || "inconnue"}${pyInfo}` };
      }

      // Lire les sorties (via IPC — fetch file:// est bloqué par Electron)
      const sorties: [AudioBuffer | null, File | null, string | null] = [null, null, null];

      // Audio (WAV)
      try {
        const rep = await api.lireBinaire(outputPath);
        if (rep?.donnees) {
          const ab = rep.donnees.buffer.slice(rep.donnees.byteOffset, rep.donnees.byteOffset + rep.donnees.byteLength);
          const ac = new AudioContext();
          sorties[0] = await ac.decodeAudioData(ab);
          ac.close();
        }
      } catch {}

      // MIDI (.mid)
      try {
        const rep = await api.lireBinaire(outputMidiPath);
        if (rep?.donnees) {
          sorties[1] = new File([rep.donnees], "python_output.mid", { type: "audio/midi" });
        }
      } catch {}

      // Texte (.txt)
      try {
        const txt = await api.lireTexte(outputTextPath);
        if (txt) sorties[2] = txt;
      } catch {}

      // Nettoyer les fichiers de sortie
      for (const p of [outputPath, outputMidiPath, outputTextPath]) {
        try { await api.supprimerFichier(p); } catch {}
      }

      const parts: string[] = [];
      if (sorties[0]) parts.push("audio OK");
      if (sorties[1]) parts.push("MIDI OK");
      if (sorties[2]) parts.push("texte OK");
      const msg = `Python ${parts.join(" · ") || "exécuté"}${result.stdout?.trim() ? ` · ${result.stdout.trim().slice(0, 80)}` : ""}`;

      return { valeurs: [sorties[0], sorties[1], sorties[2]], message: msg };
    },
  },
] as PluginDef[]).map(avecDoc);
