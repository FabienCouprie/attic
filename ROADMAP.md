# Attic — Roadmap

Tracking of remaining work, prioritized. See also `ARCHITECTURE.md` (technical spec of
the framework) and `Atelier-Specification.md` (conceptual spec §3).

Continuously verified state: **tsc 0 errors · 26 unit tests · build OK**.

---

## ✅ Done (session 2026-07)

### AI separation
- ✅ **6-stem AI separator** — Demucs 6s (258 MB, `public/oonx/htdemucs_6s.onnx`) added. 6 stems: drums, bass, other, vocals, guitar, piano. Default.
- ✅ **MDX-Net fixed** — `UVR_MDXNET_9482` model (29.7 MB) downloaded and wired. The 3 models are embedded.
- ✅ **`extraResources`** — ONNX models delivered outside asar via `electron-builder` (`process.resourcesPath/oonx/`). No duplication in `dist/`.

### Effects
- ✅ **Convolution reverb (IR)** — `reverbe-convolution`: synthetic IR (5 types: Room/Hall/Plate/Spring/Cathedral, pre-delay, damping, decay, mix) + external IR loading (WAV).
- ✅ **Bitcrusher** — quantization (1-16 bits) + downsampling (1-44 kHz) + mix.
- ✅ **Gate/Expander** — 2 modes, threshold, ratio, attack, release, floor attenuation.
- ✅ **De-esser** — dynamic compression of sibilance (bandpass sidechain 5-9 kHz).
- ✅ **Ring modulator** — multiplication by sinusoidal carrier (1-8000 Hz), sidebands.

### Generators
- ✅ **Melodic sequencer** — piano-roll grid 13 rows × 8/16/32 steps, 5 scales, 4 timbres, key/octave/tempo/swing.
- ✅ **Frequency generator** — Hz or note input (A4, C#5, Bb3), 4 waveforms, anti-click fade.
- ✅ **Metronome** — regular click 40-240 BPM, 6 time signatures, 3 timbres (Click/Woodblock/Beep), accentuation.
- ✅ **VU-meter / LUFS** — RMS, Peak, True Peak (dBTP), LUFS (K-weighting ITU-R BS.1770) bargraphs + crest factor + LRA. Canvas view.
- ✅ **Neural reservoir** — generator via random neural network (Reservoir Computing, inspired by Allendia/EVY). 16 parameters (neurons, connectivity, memory, spectrum, scale, seed, etc.). No training, no model, pure JS.

### MIDI
- ✅ **MIDI arpeggiator** — 5 directions (Up/Down/UpDown/DownUp/Random), intra-chord patterns, 5 speeds, 1-4 octaves, adjustable note duration.
- ✅ **MIDI transposer/quantizer** — transposition ±24 semitones, quantization (1/4 to 1/32 + triplets), fine quantize option.
- ✅ **Chord detector** — windowed chromagram + templates (10 chord types), progression with timestamps. Integrated view.
- ✅ **MIDI player** — added a MIDI output (orange port) to chain to the arpeggiator/transposer.

### Generative AI (Transformers.js + ONNX)
- ✅ **MusicGen** — music generation from a text prompt (`Xenova/musicgen-small`, Web Worker, auto-download HuggingFace).
- ✅ **SpeechT5 TTS** — English speech synthesis, 7 voices (CMU Arctic embeddings).
- ✅ **MMS-TTS Multilingual** — 10 languages (Meta MMS, one model per language).
- ✅ **Whisper (English)** — vocal ASR transcription (`whisper-base.en`, ~75 MB).
- ✅ **Whisper (Multilingual)** — 99 languages + translate-to-English option (`whisper-large-v2`, ~1.5 GB).
- ✅ **Whisper translation** — text → TTS → Whisper translate → English text (internal chain).
- ✅ **OPUS-MT translation** — 18 text→text language pairs (lightweight models ~30 MB).

### Data collections
- ✅ **Musical styles** — 200+ styles across 11 categories (Rock/Metal/Pop/Electronic/Hip-Hop/Jazz/Blues-Soul-Funk/Country-Folk/Reggae-Latin/Classical/World).
- ✅ **Emotions** — 160+ emotions across 8 categories (Joy/Sadness/Anger/Fear/Love/Surprise/Disgust/Mixed).
- ✅ **Voice ranges** — 31 ranges across 3 groups (Men/Women/Children), with note ranges.

### AI tools
- ✅ **AI script generator** — randomly combines instruments + styles + emotions + voice ranges → structured prompt for Suno/Udio.
- ✅ **Color combination** — 1 or 2 colors → musical AI script (color psychology + synesthesia). 11 colors, profile fusion.
- ✅ **Text source** — text input on the node (resizable textarea, min 35 characters), blue port output.

### i18n
- ✅ **`optionsEn`** — added `optionsEn?: string[]` field to `ParametreDef` to translate bilingual dropdowns.
- ✅ **"Text to Speech" / "Speech to Text" family** — added to the i18n dictionary.
- ✅ **Alphabetical sorting** of nodes within each catalog family.

### UI / robustness
- ✅ **Copy/paste nodes** — Ctrl+C / Ctrl+V, new id + callbacks re-created.
- ✅ **Fix: node deletion** — `setSel(null)` when the deleted node was selected (inspector no longer stuck).
- ✅ **Fix: reset `scriptGenere`** — node reset now clears `scriptGenere` (text field).
- ✅ **Fix: CSS overlap** — Group/Ungroup buttons moved to the left under the toolbar.
- ✅ **Palette: alphabetical sorting** of nodes by display name within each family.

---

## Proposals recorded 2026-07-18 (open)

Proposals made during the 2026-07 sessions, decided or discussed with the user,
not yet implemented. Recorded here so they survive the conversation.

### Features
- **Second local LLM node (Qwen 2.5 or similar via Ollama)** — a SEPARATE
  component, not a replacement for the existing DistilGPT-2 lyrics node
  (user decision). Same IPC path as the Ollama node; mostly a fiche + prompt work.
- **Text-export node** — writes a text input to a `.txt` file (counterpart of
  the audio/MIDI export nodes). Small; from the 2026-07-16 punch-list.
- **Black theme reinforcement pass** — audit remaining light-gray surfaces and
  hard-coded colors; from the punch-list, untouched.
- **Extra i18n pass on parameter items** — some parameter names/docs and
  dropdown options still lack `nomEn`/`optionsEn`; from the punch-list.

### Architecture (from the risk-table review, 2026-07-17)
- **UI shell decoupling (“item 3”)** — the 5 files that import `registre` from
  `audio/adaptateur` (App, AtelierNode, useExecutionGraphe, useMetaComposants,
  metasLocaux) switch to a single injection point (`ui/registre-actif.ts`)
  configured by the composition root; includes clearing/namespacing
  `AtelierNode`'s module-global `DEFS_CACHE`. See PORTING-A-DOMAIN.md §6.a.
- **Domain-provided result materialisation** — `useExecutionGraphe` still
  sniffs domain types (`instanceof AudioBuffer/File`, `bufferVersWavBlob`,
  `type === "audio"`) to build node display state. The adapter should provide
  `materialiser(vals, def, data)` / `liberer(data)` instead. See
  PORTING-A-DOMAIN.md §6.b. Prerequisite for a clean second domain in the UI.

### Storage / ops (from the 2026-07-18 model-cache investigation)
- **File-based AI-model cache** — HuggingFace models currently live in
  Chromium Cache Storage, which is (a) split per origin — dev
  (`localhost:5173`) and packaged (`file://`) each download their own 1.5 GB
  copy — and (b) evictable under quota pressure for the unengaged `file://`
  origin (observed 2026-07-18: packaged bucket recreated, 1.1 GB
  re-downloaded, while the dev bucket survived). Durable fix: transformers.js
  `env.useCustomCache` backed by plain files in `userData/modeles-ia` served
  through a custom Electron protocol (`attic-cache://`), shared by both dev
  and packaged. Mitigations already in place: explicit `persistent-storage`
  permission grant + boot-time `persisted()`/`estimate()` logging.
- **Build ops** — `electron-builder` fails intermittently with `EPERM` renaming
  `win-unpacked.tmp` (antivirus scans the freshly extracted Electron binaries
  inside the rename window). Durable fix on the machine: exclude
  `E:\attic\release` from real-time scanning. Workaround: retry after a few
  seconds.

---

## 1. "Educational studio" vision

### 1.1 Interactive guided tours
Embedded pre-built workflows (`presets/`) with educational annotations on the canvas:
- "How does a compressor work?"
- "The mixing chain": EQ → Compressor → Reverb → Limiter
- "Subtractive synthesis" with interactive tutorial
- Exercises ("change the threshold and listen to the difference")

### 1.2 Educational A/B comparator
Enriched version of the A/B comparator: **simultaneous** display of the two waveforms/spectra side by side + **spectral diff** (differing frequencies in red).

### 1.3 Waveform annotator
Textual markers on the waveform ("chorus", "verse", "solo") — persisted with the graph. A tour can pre-annotate an excerpt and ask questions.

---

## 2. "Creative AI workshop" vision

### 2.1 MIDI neural reservoir
MIDI version of the reservoir — generates MIDI files that can be plugged into Transposer/Quantizer, Arpeggiator or MIDI Output. Allows chaining multiple reservoirs.

### 2.2 Multi-reservoir network
A node that connects multiple reservoirs in parallel/series (melody, bass, harmony, rhythm). Each reservoir "listens" to the others via a control input → polyphonic emergence.

### 2.3 Genetic evolution of reservoirs
A meta-node that evolves a population of reservoirs: random mutation of weights/parameters, user selection (like / dislike), crossover. After a few generations, the reservoir adapts to taste. No training — natural selection.

### 2.4 ColorSynth
The inverse of the "Color combination" node: listens to the audio signal and deduces a color palette. Spectrum → color space (bass = warm, treble = cold). Canvas view. Educational: "seeing" the timbre.

### 2.5 Musical prompt → graph
A node that takes a text prompt ("a stereo delay with short feedback over a hall reverb") and generates the corresponding graph by automatically connecting the nodes. Keyword-rules parser → plugins + connections. Magical for discovery.

---

## 3. "Multi-domain laboratory" vision

### 3.1 Image domain (proof of concept)
A minimal image adapter to prove the golden rule:
- Flow types: `image` (red), `mask` (yellow)
- Nodes: Load image, Gaussian blur, Threshold, 3×3 Convolution, Alpha compositing, Image preview
- Views: `<canvas>` inside the node
- Same core, same palette, same inspector, same persistence
- **Goal**: prove that "delivering a new domain = providing an adapter, without modifying core or UI"

### 3.2 Data/ETL domain
- Flow types: `table` (green), `schema` (orange)
- Nodes: Load CSV, Filter, Aggregation, Join, Export
- Views: mini-table inside the node

### 3.3 Cross-domain viewer
A generic node that displays any flow type (audio = waveform, image = pixels, table = rows/columns). Demonstrates the neutrality of the core.

---

## 4. "Collaborative platform" vision

### 4.1 Community presets gallery
A web page or an "Import from gallery" node listing shared graphs. Description, tags, audio preview. One-click import. Storage on HuggingFace or GitHub (JSON files).

### 4.2 Audio export + embedded graph
The graph that produced a WAV/MP3 is embedded in the metadata (WAV `INFO` chunk or MP3 ID3 tag). Importing the audio file into Attic recovers the graph — exact reproduction.

### 4.3 Plugin system (user-defined nodes)
Create your own node without coding: define inputs/outputs/parameters via UI, write `executer` in JS in an integrated editor, registered dynamically (localStorage, exportable as JSON).

### 4.4 Live coding / performance mode
Full-screen mode: collapsed palette, macro controls (knobs), MIDI learn (assign a controller to a parameter), continuous execution. The musician "plays" the graph.

---

## 5. Robustness & refinements (cross-cutting)

| # | Task | Priority |
|---|---|---|
| 1 | **Stable port IDs** (instead of positional indices) — re-indexing breaks edges | High |
| 2 | **`lienExterne?`** in `PluginDef` ("to go further") + rendered in the notice | Medium |
| 3 | **File persistence** as base64 in the JSON | Medium |
| 4 | **Relocate `TypeValeur`** out of the core into the audio domain | Low |
| 5 | **Split** `audio/generation.ts` (889 lines), `audio/analyse.ts` (820 lines) | Low |
| 6 | **Split** `ui/vues.tsx` into `ui/vues/*.tsx` (one file per view) | Low |
| 7 | **`compatible` compatibility** for stereo/mono subtyping | Low |

---

## Suggested order

| # | Task | Effort | Value |
|---|---|---|---|
| 2.1 | MIDI reservoir | Low | High — unlocks chaining |
| 1.1 | Guided tours | Medium | High — educational = mission |
| 3.1 | Image domain | Medium | Strategic — proves the framework |
| 4.3 | User-defined plugin | Medium | High — extensible without coding |
| 2.5 | Prompt → graph | Low | Magical — discovery |
| 2.3 | Genetic evolution | Medium | Unique — no other app does this |
| 4.4 | Live mode | High | High for performance |
| 4.2 | Embedded graph | Low | Elegant — reproducibility |
| 2.2 | Multi-reservoirs | Medium | Unique — polyphonic emergence |
| 2.4 | ColorSynth | Low | Educational — seeing sound |
| 4.1 | Community gallery | High | Long term |
| 1.2 | Educational A/B | Low | Educational |
| 1.3 | Annotator | Low | Educational |
| 3.2 | ETL domain | High | Strategic but less urgent |
| 3.3 | Cross viewer | Medium | Technical |
