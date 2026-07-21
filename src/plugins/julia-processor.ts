// plugins/julia-processor.ts — Nœud « Julia Processor » :
// éditeur de code Julia pour traiter l'audio, MIDI et texte.
// Même architecture que le Python Processor.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { bufferVersWavBlob } from "../audio";

const JULIA_KEYWORDS = new Set([
  "function", "return", "if", "elseif", "else", "for", "while", "in", "!", "&&", "||",
  "import", "using", "module", "try", "catch", "finally", "begin", "end", "do",
  "true", "false", "nothing", "abstract", "struct", "mutable", "const", "global",
  "local", "println", "print", "include", "export", "where", "throw",
]);

export function tokenizeJulia(code: string): { text: string; type: string }[] {
  const tokens: { text: string; type: string }[] = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === "#") {
      let end = code.indexOf("\n", i);
      if (end === -1) end = code.length;
      tokens.push({ text: code.slice(i, end), type: "comment" });
      i = end;
      continue;
    }
    if (code[i] === '"' || (code[i] === '"' && code[i + 1] === '"' && code[i + 2] === '"')) {
      let end = -1;
      if (code[i + 1] === '"' && code[i + 2] === '"') {
        end = code.indexOf('"""', i + 3);
        if (end !== -1) end += 3;
      } else {
        end = i + 1;
        while (end < code.length && code[end] !== '"') {
          if (code[end] === "\\") end++;
          end++;
        }
        end++;
      }
      if (end === -1) end = code.length;
      tokens.push({ text: code.slice(i, end), type: "string" });
      i = end;
      continue;
    }
    if (/[a-zA-Z_!]/.test(code[i])) {
      let end = i + 1;
      while (end < code.length && /[a-zA-Z0-9_!?]/.test(code[end])) end++;
      const word = code.slice(i, end);
      if (JULIA_KEYWORDS.has(word)) tokens.push({ text: word, type: "keyword" });
      else if (/^[A-Z]/.test(word)) tokens.push({ text: word, type: "type" });
      else tokens.push({ text: word, type: "ident" });
      i = end;
      continue;
    }
    if (/[0-9]/.test(code[i])) {
      let end = i + 1;
      while (end < code.length && /[0-9.eE+\-xXa-fA-F]/.test(code[end])) end++;
      tokens.push({ text: code.slice(i, end), type: "number" });
      i = end;
      continue;
    }
    let end = i + 1;
    while (end < code.length && !/[a-zA-Z0-9_"#\s]/.test(code[end])) end++;
    tokens.push({ text: code.slice(i, end), type: "op" });
    i = end;
  }
  return tokens;
}

const CODE_DEFAUT = `# Julia Processor — traitement audio
# Variables d'environnement :
# - ATTIC_OUTPUT_PATH : chemin du WAV de sortie
# - ATTIC_SAMPLE_RATE : fréquence d'échantillonnage (default: 44100)
# - ATTIC_CHANNELS : nombre de canaux (1=mono, 2=stereo)
# - ATTIC_TEXT_INPUT : texte d'entrée (si connecté)
# sys.argv[2] : chemin du WAV d'entrée (si connecté)

using WAV

input_path = length(ARGS) >= 2 ? ARGS[2] : nothing
output_path = get(ENV, "ATTIC_OUTPUT_PATH", "output.wav")
sample_rate = parse(Int, get(ENV, "ATTIC_SAMPLE_RATE", "44100"))
channels = parse(Int, get(ENV, "ATTIC_CHANNELS", "2"))

if input_path !== nothing
    audio, sr = wavread(input_path)
    audio = Float32.(audio)
else
    # Pas d'entrée — générer 2s de silence
    audio = zeros(Float32, sample_rate * 2, channels)
end

# === TRAITEMENT ===
# Exemple : doubler le volume
audio = audio .* 2.0
# Éviter l'écrêtage
audio = clamp.(audio, -1.0, 1.0)

# Écrire le WAV de sortie
wavwrite(audio, sample_rate, output_path)

println("Traité: $(size(audio, 1)) samples, $channels canaux")
`;

export const fiches: FicheAudio[] = ([
  {
    id: "julia-processor", nom: "Julia Processor", nomEn: "Julia Processor",
    univers: "Autres", famille: "Génération",
    resume: "Éditeur de code Julia avec coloration syntaxique pour traiter l'audio.",
    resumeEn: "Julia code editor with syntax highlighting for audio processing.",
    entrees: [
      { nom: "Audio", type: "audio", requis: false },
      { nom: "MIDI", type: "midi", requis: false },
      { nom: "Texte", nomEn: "Text", type: "texte", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }, { nom: "Texte", nomEn: "Text", type: "texte" }],
    parametres: [
      { nom: "Code", nomEn: "Code", type: "texte", defaut: CODE_DEFAUT,
        doc: "Code Julia à exécuter. Variables : ARGS[2] = WAV d'entrée, ENV[\"ATTIC_OUTPUT_PATH\"] = WAV de sortie, ENV[\"ATTIC_SAMPLE_RATE\"], ENV[\"ATTIC_CHANNELS\"]. Nécessite le package WAV.jl.",
        docEn: "Julia code to execute. Variables: ARGS[2] = input WAV, ENV[\"ATTIC_OUTPUT_PATH\"] = output WAV, ENV[\"ATTIC_SAMPLE_RATE\"], ENV[\"ATTIC_CHANNELS\"]. Requires WAV.jl package." },
      { nom: "Timeout", nomEn: "Timeout", plage: [5, 120], pas: 5, defaut: 30, unite: "s",
        doc: "Durée maximale d'exécution du script (en secondes).",
        docEn: "Maximum script execution time (in seconds)." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.juliaInfo) return { valeurs: [null, null, null], message: traduire("msg.n_cessite_electron") };

      const info = await api.juliaInfo();
      if (!info.disponible) {
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.julia_non_trouv_cliquez_sur_configurer_dans_le_node") };
      }

      const audio = ctx.entree(0);
      const midi = ctx.entree(1);
      const texte = ctx.entree(2);
      const code = ctx.paramTexte("Code", CODE_DEFAUT);
      const timeout = ctx.paramNombre("Timeout", 30);

      // Le contexte porte déjà le répertoire de travail (configurable par
      // l'utilisateur) : l'honorer d'abord, ne re-demander le défaut au main
      // que s'il est vide. Voir python-processor pour l'await obligatoire.
      const tmpDir = (typeof ctx.repertoireTravail === "string" && ctx.repertoireTravail.trim())
        || await (window as any).api?.obtenirRepertoireTravail?.();
      if (!tmpDir) return { valeurs: [null, null, null], erreur: true, message: traduire("msg.aucun_r_pertoire_de_travail_inscriptible_droits_insuffisants") };

      let inputPath: string | null = null;
      if (audio instanceof AudioBuffer) {
        const blob = bufferVersWavBlob(audio);
        const arrayBuf = await blob.arrayBuffer();
        inputPath = `${tmpDir}/julia_input_${Date.now()}.wav`;
        await api.ecrireFichier(inputPath, new Uint8Array(arrayBuf));
      }

      let midiPath: string | null = null;
      if (midi instanceof File) {
        midiPath = `${tmpDir}/julia_input_${Date.now()}.mid`;
        const midiBuf = new Uint8Array(await midi.arrayBuffer());
        await api.ecrireFichier(midiPath, midiBuf);
      }

      let inputText: string | null = null;
      if (typeof texte === "string" && texte.trim()) {
        inputText = texte;
      }

      const outputPath = `${tmpDir}/julia_output_${Date.now()}.wav`;
      const outputMidiPath = `${tmpDir}/julia_output_${Date.now()}.mid`;
      const outputTextPath = `${tmpDir}/julia_output_${Date.now()}.txt`;

      const result = await api.juliaExecuter({
        code,
        // Ne JAMAIS pousser un chemin null : main.cjs fait args.push(inp.path)
        // et execFile lève ERR_INVALID_ARG_TYPE sur un argument non-string —
        // un run MIDI/texte seul (sans audio) plantait ici.
        inputs: [...(inputPath ? [{ path: inputPath }] : []), ...(midiPath ? [{ path: midiPath }] : [])],
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

      if (inputPath) { try { await api.supprimerFichier(inputPath); } catch {} }
      if (midiPath) { try { await api.supprimerFichier(midiPath); } catch {} }

      if (!result.ok) {
        const pyInfo = result.python ? `\nJulia: ${result.python}` : "";
        return { valeurs: [null, null, null], erreur: true, message: traduire("msg.erreur_julia_var_0_var_1", result.erreur || result.stderr || "inconnue", pyInfo) };
      }

      const sorties: [AudioBuffer | null, File | null, string | null] = [null, null, null];

      try {
        const rep = await api.lireBinaire(outputPath);
        if (rep?.donnees) {
          const ab = rep.donnees.buffer.slice(rep.donnees.byteOffset, rep.donnees.byteOffset + rep.donnees.byteLength);
          const ctx2 = new AudioContext();
          const decoded = await ctx2.decodeAudioData(ab);
          sorties[0] = decoded;
          ctx2.close();
        }
      } catch {}
      try {
        const rep = await api.lireBinaire(outputMidiPath);
        if (rep?.donnees) {
          sorties[1] = new File([rep.donnees], "julia_output.mid", { type: "audio/midi" });
        }
      } catch {}
      try {
        const txt = await api.lireTexte(outputTextPath);
        if (txt) sorties[2] = txt;
      } catch {}

      try { await api.supprimerFichier(outputPath); } catch {}
      try { await api.supprimerFichier(outputMidiPath); } catch {}
      try { await api.supprimerFichier(outputTextPath); } catch {}

      // Même contrat que python-processor : le script a pu tourner sans écrire
      // aucune sortie lisible — c'est un échec, pas un succès silencieux.
      const stdout = result.stdout?.trim() ? ` · ${result.stdout.trim().slice(0, 80)}` : "";
      const parts: string[] = [];
      if (sorties[0]) parts.push("audio OK");
      if (sorties[1]) parts.push("MIDI OK");
      if (sorties[2]) parts.push("texte OK");
      if (!parts.length) {
        return {
          valeurs: [null, null, null], erreur: true,
          message: traduire("msg.julia_a_tourn_mais_n_a_crit_aucune_sortie_lisible_le_script_", tmpDir, stdout),
        };
      }

      return { valeurs: sorties, message: traduire("msg.julia_var_0_var_1", parts.join(" · "), stdout) };
   },
 },
] as FicheAudio[]).map(avecDoc);
