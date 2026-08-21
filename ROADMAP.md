# Attic — Roadmap

Tracking of remaining work, prioritized. See also `ARCHITECTURE.md` (diagnostic +
architecture cleanup plan) and `PORTING-A-DOMAIN.md` (how a second domain would
plug into the current core/UI, and exactly where it can't yet).

Continuously verified state (2026-08-21, branch `release-3.0.8` — v3.1.4 plus the unreleased Risset nodes): **tsc 0 errors · 237 catalog components · 100 test files / 1140 tests · build OK**.

> **Note on staleness**: this file has lagged behind releases before (it was
> last rewritten around v2.4.3). Only the status line above was re-measured on
> 2026-08-21 against v3.1.4 — the sections below have **not** been re-verified
> since 2026-08-03 and may list as pending things that have since shipped
> (see `CHANGELOG.md`, which is authoritative). Re-check before trusting a
> status.

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
- ✅ **Text-to-image (`texte-image`, SDXS-512-0.9)** — revisited after the pause below turned up a genuinely small option: SDXS-512 (0.3B-param 1-step distilled UNet + TAESD decoder) instead of LCM Dreamshaper. Converted to ONNX by hand (`torch.onnx.export`, no ready-made export existed), quantized to int8 (text_encoder/unet ~340/330 MB each, TAESD decoder ~5 MB fp32) — runs natively via `onnxruntime-node` in the Electron main process (same pattern as Demucs/Stable Audio 3), ~8-11 s/image on CPU, no GPU. **Bundled with the app** via the `assets` release (~680 MB, licensing provenance caveat accepted — see below): the model is included in `public/oonx/sdxs-512-texte-image` and packaged into the installer. The node's "Chemin modèle" parameter (folder picker) still allows a user-provided local copy. License note: SDXS-512 is distilled from SD-Turbo (Stability AI Community License, more restrictive than openrail++); the base model's own authors withheld newer versions "to avoid possible commercial and copyright risks" — a residual, unresolved provenance caveat, accepted knowingly rather than blocking on it.
  - Superseded finding from the initial investigation (2026-08-04): LCM Dreamshaper v7 was the first candidate considered and rejected — ~4.28 GB ONNX, no clean pre-quantized export, and CPU/WASM diffusion inference confirmed unreliable by reference implementations (`lacerbi/web-txt2img`). SDXS-512's far smaller UNet (0.3B vs ~0.86B) and single-step distillation made hand-conversion + quantization actually worth doing.
- ✅ **Image captioning (`legende-image`, Mozilla/distilvit)** — describes an image's content as an English sentence. Unlike text-to-image, this fits the existing Transformers.js pattern exactly: one `pipeline("image-to-text", ...)` call in a Web Worker, downloaded/cached on first use like Whisper/MusicGen (no custom Electron pipeline, no manual ONNX export, no hosting). ~0.2B params, Apache 2.0 (clean license, no caveats). fp32 only (~730 MB) per the app-wide constraint below — quantized variants exist upstream but aren't used here.

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

## Proposals recorded 2026-07-18 — status re-checked 2026-08-03

Proposals made during the 2026-07 sessions. Re-verified against the current
code; most of the concrete, small-scope ones shipped. The two structural
architecture items did not.

### Features
- ✅ **Second local LLM node** — shipped as `qwen2.5-lyrics` (`src/plugins/textgen.ts`
  / `notices.ts`): Qwen2.5-0.5B via Transformers.js, a SEPARATE node from
  DistilGPT-2 as decided, not a replacement.
- **Text-export node** — no dedicated `.txt`-export node exists, but
  `sortie-texte` ("Text Output") already offers copy **and download** of the
  received text, which covers the original ask in practice. Leaving open only
  if a real file on disk (vs. a browser download) turns out to matter.
- **Black theme reinforcement pass** — status unverified either way; nobody
  has audited remaining light-gray surfaces / hard-coded colors since this was
  written. Still open.
- **Extra i18n pass on parameter items** — status unverified either way.
  Still open.

### Architecture (from the risk-table review, 2026-07-17) — still open
Neither item below has moved. Both are prerequisites for a clean second
domain in the UI (see `PORTING-A-DOMAIN.md`).
- **UI shell decoupling ("item 3")** — `App.tsx`, `AtelierNode.tsx`,
  `useExecutionGraphe.ts`, `useMetaComposants.ts` and `metasLocaux.ts` still
  import `registre` directly from `audio/adaptateur` (verified 2026-08-03,
  same 5 files). No `ui/registre-actif.ts` injection point exists yet. See
  PORTING-A-DOMAIN.md §6.a.
- **Domain-provided result materialisation** — `useExecutionGraphe.ts` still
  does `instanceof AudioBuffer` / `instanceof File` and calls
  `bufferVersWavBlob` directly to build node display state (verified
  2026-08-03, same lines). See PORTING-A-DOMAIN.md §6.b.

### Storage / ops (from the 2026-07-18 model-cache investigation)
- **File-based AI-model cache** — still open. HuggingFace models still live in
  Chromium Cache Storage (no `env.useCustomCache` / `attic-cache://` protocol
  found in the code). The mitigations from 2026-07-18 (explicit
  `persistent-storage` permission grant, single consolidated
  `setPermissionRequestHandler` in `electron/main.cjs`, boot-time
  `persisted()`/`estimate()` logging in `main.tsx`) are in place and appear to
  have held — no further eviction reports since.
- ✅ **Build ops (EPERM)** — fixed, and further hardened.
  `scripts/build-electron.cjs` now copies the local Electron dist to
  `electron-dist/` and points `electron-builder` at it via `electronDist`
  before packaging, removing the extract-then-rename race with antivirus
  scanning entirely (not just working around it).

---

## Proposal recorded 2026-08-03: hardware MIDI input

The app could only read/write MIDI *files*; no node received a live MIDI
keyboard/controller (`navigator.requestMIDIAccess` was absent from the code).
Scoped into three independent tiers by how much of the current — fully
offline/batch — rendering engine each one touches (every effect is a pure
`(buffer, params) → AudioBuffer` run once inside an `OfflineAudioContext`;
there is no live Web Audio graph anywhere):

- ✅ **Tier 1 — capture node.** Done, this session. See the `capture-midi`
  entry in `CHANGELOG.md` (Unreleased). Mirrors the microphone recorder
  exactly: no core/engine changes.
- **Tier 2 — MIDI Learn onto Inspector parameters** (map a hardware
  knob/fader to a node parameter for the *next* Lancer, not live during
  playback). Not started. Low-medium risk, touches only `Inspector.tsx` +
  a small persisted CC→parameter mapping table — no execution-engine changes.
- **Tier 3 — live modulation during playback** (turn a knob, hear it change
  in real time). Not started, and not recommended as a first step: would
  require rewriting affected effects as real-time `AudioWorkletNode`s and
  giving the DAG a "currently playing" concept it doesn't have today — a
  second engine alongside the current one, not a feature.

---

## Proposal recorded 2026-08-04: Ollama-driven graph generation

✅ **Done, verified against a real local server** (qwen3:4b via `ollama serve`,
2026-08-04). "Prompt → graphe" (`src/plugins/prompt-graphe.ts`) already had an
offline keyword parser; Ollama is now an additional `Méthode` option, not a
replacement — the LLM reads the full installed catalog and picks blocks
itself for phrasing the keyword matcher can't parse, with automatic fallback
to keywords on any Ollama failure. See the CHANGELOG (Unreleased) for the
untrusted-output hardening (hallucinated `ficheId` filtering) and the real
before/after numbers on the `format: "json"` fix below.

**Real-server finding that changed the design**: the first live test (prompt
engineering only — a "respond with JSON only" instruction, `/no_think`, a
one-shot example) failed every time. Network capture showed why: the model
reasons correctly (it picked Réverbération + Paulstretch for a cave/stretch
description with zero literal keyword overlap — genuinely the right answer)
but does so as plain-text rambling the decoder is free to emit regardless of
what the prompt asks for, and `done_reason: "length"` showed it burning its
*entire* token budget (2000 tokens, 38.8 s) on that reasoning without ever
reaching JSON. Fix was **not** a better prompt — it was Ollama's `format:
"json"` request field, a decoder-level grammar constraint the model cannot
violate. Same model, same prompt, format added: `done_reason: "stop"`, 90
tokens, 1.7 s, clean JSON on the first token. `ollamaGenerer` (both the
browser-fetch and Electron-IPC code paths) now forwards `format`.

**Found and fixed while verifying it** — two bugs, both pre-existing and
unrelated to this addition, both blocking verification until fixed:
- The node's Text input lacked `requis: false`, so it couldn't run standalone
  despite having a `Prompt` parameter specifically for that.
- The generated graph never actually appeared on the canvas — confirmed on
  the *unmodified* code. `useExecutionGraphe`'s post-run check read node data
  from `noeudsRef.current`, which is a different object than the one the
  plugin mutated by the time it runs (`definirStatut` replaces the node's
  `data` via spread before the plugin is even called). This affected the two
  sibling mechanisms too (embedded-graph import, `.zip` node install) — none
  of the three could have been working. See CHANGELOG for the fix.

**Also found, not fixed (flagged as a separate background task)**: re-running
the *same* "Prompt → graphe" node more than once generates edge ids that
collide with the previous run's (`e-prompt-${nodeId}-${i}`, not globally
unique) — React logs a duplicate-key warning. Unrelated to Ollama; out of
scope for this change.

---

## 1. "Educational studio" vision

### 1.1 Interactive guided tours
**Partially done.** `presets/synthe-soustractif.json` exists and matches the
"Subtractive synthesis" example (also listed in the README as "Embedded
subtractive synthesizer meta-component example"). Still missing: the other
tour topics (compressor, mixing chain), the educational annotations layer on
the canvas, and the guided exercises.
Embedded pre-built workflows (`presets/`) with educational annotations on the canvas:
- "How does a compressor work?"
- "The mixing chain": EQ → Compressor → Reverb → Limiter
- "Subtractive synthesis" with interactive tutorial — ✅ example graph exists
- Exercises ("change the threshold and listen to the difference")

### 1.2 Educational A/B comparator
Enriched version of the A/B comparator: **simultaneous** display of the two waveforms/spectra side by side + **spectral diff** (differing frequencies in red).

### 1.3 Waveform annotator
Textual markers on the waveform ("chorus", "verse", "solo") — persisted with the graph. A tour can pre-annotate an excerpt and ask questions.

---

## 2. "Creative AI workshop" vision

### 2.1 MIDI neural reservoir
✅ **Done — my 2026-08-03 verification of this file was wrong.** `reservoir-musical`
(`src/plugins/generateurs.ts`) already exposes a second output port typed
`midi` alongside `Audio` (`sorties: [{Audio}, {MIDI, type:"midi"}]`); it
chains directly into Transposer/Quantizer/Arpeggiator/MIDI Output like any
other MIDI source. No separate node was ever needed. (My earlier grep only
searched for a literal `id: "reservoir-midi"` and missed the port.)
MIDI version of the reservoir — generates MIDI files that can be plugged into Transposer/Quantizer, Arpeggiator or MIDI Output. Allows chaining multiple reservoirs.

### 2.2 Multi-reservoir network
✅ **Done.** Shipped as the `multi-reservoirs` node (`src/plugins/generateurs.ts`).
A node that connects multiple reservoirs in parallel/series (melody, bass, harmony, rhythm). Each reservoir "listens" to the others via a control input → polyphonic emergence.

### 2.3 Genetic evolution of reservoirs
**Half done, deprioritized by owner decision (2026-08-03).** `src/audio/evolution.ts`
implements exactly this algorithm (population, mutation, user like/dislike
selection, crossover, no training — the file's own header even says so almost
verbatim) — but it is **not wired to any plugin or UI**: no fiche imports it,
no view renders it. The engine exists; the node doesn't. Judged not valuable
enough to prioritize wiring it up — left here for the record, not on the
active queue.
A meta-node that evolves a population of reservoirs: random mutation of weights/parameters, user selection (like / dislike), crossover. After a few generations, the reservoir adapts to taste. No training — natural selection.

### 2.4 ColorSynth
✅ **Done.** Shipped in v2.3.0 as the `colorsynth` node
(`src/plugins/visualisation.ts`) — 6-band spectrum (Sub/Bass/Low-Mid/Mid/High/Air)
mapped to warm→cool HSL colors, exactly as proposed here.
The inverse of the "Color combination" node: listens to the audio signal and deduces a color palette. Spectrum → color space (bass = warm, treble = cold). Canvas view. Educational: "seeing" the timbre.

### 2.5 Musical prompt → graph
✅ **Done.** Shipped as `src/plugins/prompt-graphe.ts`, already listed in the
README ("Prompt-to-graph — type a keyword, get a pre-wired graph, 55+ keywords").
A node that takes a text prompt ("a stereo delay with short feedback over a hall reverb") and generates the corresponding graph by automatically connecting the nodes. Keyword-rules parser → plugins + connections. Magical for discovery.

---

## 3. "Multi-domain laboratory" vision

Still open — 3.1, 3.2 and 3.3 all unverified/absent as of 2026-08-03. Note
that 3.1 is blocked on the "UI shell decoupling" architecture item above:
without it, a second domain can't reach the UI cleanly (see
PORTING-A-DOMAIN.md).

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
Still open. `galerie-exposition` (an MP3-folder → HTML gallery generator with
procedural cover art) exists but solves a different problem — it's not a
shared-graph gallery.
A web page or an "Import from gallery" node listing shared graphs. Description, tags, audio preview. One-click import. Storage on HuggingFace or GitHub (JSON files).

### 4.2 Audio export + embedded graph
✅ **Done.** `src/audio/graphe-embarque.ts` + `_grapheEmbarque` wired into
`useExecutionGraphe.ts` — the producing graph is embedded when exporting audio.

### 4.3 Plugin system (user-defined nodes)
Still open, deprioritized by owner decision (2026-08-03): redundant with the
existing Python and Julia processor nodes, which already let you extend
Attic with custom code without touching core. A related, smaller feature
shipped: `gestion-nodes` lets you **export/import an existing node as a
`.zip`** (packaging, not authoring). Writing a brand-new node's `executer` in
JS from an in-app editor is not implemented, and isn't planned.
Create your own node without coding: define inputs/outputs/parameters via UI, write `executer` in JS in an integrated editor, registered dynamically (localStorage, exportable as JSON).

### 4.4 Live coding / performance mode
Still open — no full-screen/performance mode, macro knobs, or MIDI-learn found.
Full-screen mode: collapsed palette, macro controls (knobs), MIDI learn (assign a controller to a parameter), continuous execution. The musician "plays" the graph.

---

## 5. Robustness & refinements (cross-cutting)

| # | Task | Priority |
|---|---|---|
| 1 | **Stable port IDs** (instead of positional indices) — re-indexing breaks edges | High |
| 2 | **`lienExterne?`** in `PluginDef` ("to go further") + rendered in the notice | Medium |
| 3 | **File persistence** as base64 in the JSON | Medium |
| 4 | **Relocate `TypeValeur`** out of the core into the audio domain — still there as of 2026-08-03; now explicitly documented as accepted debt in `PORTING-A-DOMAIN.md` rather than an oversight | Low |
| 5 | **Split** `audio/generation.ts` (983 lines, up from 889), `audio/analyse.ts` (980 lines, up from 820) — grew, not shrunk | Low |
| 6 | **Split** `ui/vues.tsx` into `ui/vues/*.tsx` (one file per view) — now 1,426 lines (up from 952) | Low |
| 7 | **`compatible` compatibility** for stereo/mono subtyping | Low |

---

## Suggested order

Shipped items (2.1, 2.2, 2.4, 2.5, 4.2) removed from the queue below — see
their ✅ notes in the sections above. **Owner decision, 2026-08-03**: 2.3
(genetic evolution) and 4.3 (user-defined JS plugin editor) are deprioritized
— 2.3 was judged not valuable enough to justify wiring `evolution.ts` to a
node, and 4.3 is redundant with the existing Python/Julia processor nodes,
which already cover "extend without touching core". Both left in the vision
sections above for the record, dropped from the active queue.

| # | Task | Effort | Value |
|---|---|---|---|
| 1.1 | Guided tours (remaining topics + annotations + exercises) | Medium | High — educational = mission |
| 3.1 | Image domain | Medium | Strategic — proves the framework |
| 4.4 | Live mode | High | High for performance |
| 4.1 | Community gallery | High | Long term |
| 1.2 | Educational A/B | Low | Educational |
| 1.3 | Annotator | Low | Educational |
| 3.2 | ETL domain | High | Strategic but less urgent |
| 3.3 | Cross viewer | Medium | Technical |
