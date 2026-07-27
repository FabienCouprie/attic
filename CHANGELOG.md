# Changelog

All notable changes to Attic. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] — 2026-07-27

### Security
- Patched Dependabot alerts by overriding transitive dependencies: `uuid` to `^11.1.1` (missing buffer bounds check in v3/v5/v6) and `brace-expansion` to `^5.0.8` (DoS via unbounded expansion length causing OOM). `npm audit` now reports `0 vulnerabilities`.

### Removed
- **Whisper (Multilingual)** and **Whisper Translation** nodes removed from the catalog. The English-only Whisper model (`Whisper (Anglais)`) and Sherpa-ONNX ASR remain available. This avoids shipping a ~1.5 GB model and a heavy TTS+ASR translation pipeline.
- Related catalog notices, prompt-graph aliases, and unused i18n keys were cleaned up.

### Fixed
- **Resonance Audio** — added a Playwright isolation test and diagnostic logs inside `appliquerResonanceAudio`; the node now produces a non-silent stereo buffer both in the isolation test and in the app.

### Changed
- **Version bump to 2.0.0** — local Windows installer rebuilt and tagged as `Attic Setup 2.0.0.exe`.
- **GitHub release v2.0** updated with the latest installer and release notes.

## [1.6.3] — 2026-07-26

### Added
- **Cellular automaton music generator** node (`automate-cellulaire`) — generates audio + MIDI from 1D Wolfram rules (18, 22, 26, 30, 45, 54, 60, 62, 73, 90, 102, 105, 110, 122, 126, 150, 160, 184, 204, 225, 232, 240, 250) plus custom 0-255 rules, and 2D topologies (Conway's Game of Life, Highlife). Supports Polyphony / Melody / Arpeggio voice modes and Pitch / Velocity / Duration / Pitch+velocity mappings. Configurable scale, key, width, height, generations, seed, density and mutation probability.
- **Sherpa-ONNX ASR runtime hardening** — worker `global` alias, high-quality Web Audio resampling with linear fallback, offline model cache control (auto / clear & re-download), and worker download progress messages.
- **Local Windows installer build** — production packaging path using a stripped dependency set to avoid electron-builder out-of-memory issues.

### Fixed
- **Inconsistent node reset** when editing parameters — all parameter changes now trigger the same cascade reset (`reinitialiserNoeud`) instead of partial ad-hoc cleanup.
- **Input nodes losing loaded file paths** after save/restart — `entree-image` now persists the file path via the hidden `Chemin` parameter; localStorage restore reloads audio, MIDI, SVG and image files from disk.
- **Chord detector result displayed twice** — the generic node message is now hidden when a custom view already renders it.
- **Export filename** (`nomFichier`) is now saved and restored.
- **Wrong English `optionsEn`/`defautEn` for "Key" / "Clé" and other parameters** in `reservoir-musical`, `reservoir-midi`, `multi-reservoirs`, `generateur-accords`, `generateur-musical`, `sequenceur`, `vexflow`, `tonal` and related nodes. The UI was showing resolution/style values instead of keys (e.g. "1/4") because of copy-pasted i18n metadata.
- **Additional copy-paste fixes** in `Mélodie aléatoire`, `Musique fractale`, `Sampler personnalisé`, `Métronome`, `Générateur musical`, `Générateur de paroles`, `Générateur de pochette` and `Visualisation Songsee` (time signatures, keys, scales, format, style default).
- **Cellular automaton node size** — removed its oversized 320×260 fixed size so it now uses the standard node sizing (240×140) like other non-visual nodes.
- **Node audio player aesthetic test** — added an inverted/sepia style for players inside nodes: background matches the node's `--bg-surface`, sepia inverted controls/icons.
- **Piper TTS loading** — replaced the default HuggingFace-only provider with a custom caching provider: tries local bundled voices first, then IndexedDB cache, then downloads with a 10-minute timeout and live progress reporting (MB + percentage). Prevents the "loading for hours" hang.
- **Execution cache** — cache key now includes a stable hash of the actual input values (not just the upstream node IDs). This fixes upstream nodes being re-executed when a downstream node is launched and makes cache invalidation correct for all nodes (text, audio, file, objects, arrays, typed arrays). Added diagnostic console logs temporarily to trace any remaining cache misses.
- **Piper TTS WASM MIME type** — Vite dev server now serves `.wasm` files with `application/wasm` so WebAssembly streaming compilation works in the worker. In the packaged app, Piper TTS runtime files are unpacked from `app.asar` to ensure Chromium fetches them with correct MIME types.
- **Piper TTS voice loading** — reverted to the original Piper TTS setup: the runtime WASM/data is bundled (from `node_modules/piper-tts-web/dist` into `public/piper-tts`), but the ONNX voice models are downloaded from HuggingFace on first use and cached. This keeps the installer small; no ~376 MB voice bundle is included.
- **OCR language string** — `createWorker` now receives a `+`-joined string of language codes instead of an array, which avoids corrupted/empty language values (`'\x01'`) that caused `Failed loading language` and `Error opening data file ./ .traineddata` in Tesseract.js v7.0.0.
- **Automate cellulaire documentation** — added missing parameter docs for `Octave`, `Vélocité`, `Clé`, `Gamme` and `Synthèse`.

### Changed
- **Equalizer** node upgraded to a **9-band graphic EQ** (32 Hz, 64 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz) with independent ±24 dB gain controls, replacing the previous 3-band EQ.
- **Speech-to-Text nodes** (`Whisper (Anglais)`, `Whisper (Multilingue)`, `Sherpa ASR`) moved from **Sorties** to **Autres** so they sit alongside other text-generation/analysis utilities instead of output nodes.
- **Limiter** node — peak limiter with instant attack, release and output ceiling, ideal for mastering loudness without clipping.
- **Transient Shaper** node — independent attack/sustain control via fast/slow envelope detectors, perfect for adding drum punch or shortening tails.
- **Stereo Width / MS** node — adjusts stereo width (0% mono → 200% widened) and independent Mid level via Mid/Side decoding.
- **Multiband Compressor** node — 3-band compressor (low/mid/high) with independent thresholds and ratios per band.
- **Harmonizer / Octaver** node — adds up to two pitch-shifted voices (semitone intervals) under the original signal.
- **Exciter / Aural enhancer** node — adds high-mid presence via asymmetrical distortion and high-pass filtering.
- **Granular Freeze** node — loops a grain with size, pitch and position control.
- **Vocoder (filterbank)** node — two-audio-input vocoder (modulator + carrier) with configurable band count, frequency range and Q.
- **COMPONENTS.md** generator script (`scripts/generate-components-md.ts`) and regenerated catalog (194 components).
- Version bumped to `1.6.3`.

## [1.2.6] — 2026-07-25

### Security
- **Added `SECURITY.md`** — supported versions, reporting channels (GitHub Security Advisories + `atticofsound@free.fr`), disclosure policy and acknowledgments.
- **Added CI workflow** (`Lint, build and test`) and set it as a required status check on the `master` branch.
- **Added automated release workflow** that builds and publishes the Windows installer using the native `GITHUB_TOKEN`.
- **Removed the placeholder SLSA workflow** that did not perform actual provenance generation.
- **Enabled Dependabot alerts and automated security fixes** on the repository.
- **Enabled secret scanning push protection** to block accidental secret commits.
- **Enforced branch protection on `master`** — pull requests required, CI status check required, admin rules enforced, no force pushes or deletions.

### Changed
- **Audio players in nodes now use a light beige tint** instead of the default white controls.

### Fixed
- **Electron IPC handlers are now registered once globally** (`capture:systeme-audio`, permission handler, CSP header) so opening a second window no longer throws a duplicate-handler error.
- **Added missing documentation for the `Chemin` parameter** in `entree-audio` and `lecteur-midi`.

## [1.2.5] — 2026-07-25

### Changed
- **Renamed text-generation AI nodes** — `DistilGPT-2 Lyrics` / `DistilGPT-2 Paroles` → `DistilGPT-2` and `Qwen2.5-0.5B Lyrics` → `Qwen2.5-0.5B`. The default prompts, system prompt, and notices were updated to describe generic text generation instead of lyrics, since these nodes do not generate lyrics.
- **Default theme is now dark purple** — the previous pale green "light" theme was replaced with a dark purple theme. The toggle switches between dark purple (default) and black. The internal theme name changed from `clair` to `violet`.

### Fixed
- **Magenta nodes are now cached** — they no longer force the whole downstream chain to re-run when an unrelated node is added or changed. The `jamaisCache: true` flag has been removed from all Magenta nodes so the execution cache can skip them when inputs and parameters are unchanged.

## [1.2.4] — 2026-07-24

### Security
- Patched dependency vulnerabilities: `electron`, `adm-zip`, `sharp`, `protobufjs`, `minimist`, `static-eval`.
- Fixed CodeQL Zip Slip alert in `node:importer-zip`.

### Changed
- Windows installer is a **standalone NSIS installer** (~1.4 GB) containing the full application.
- Updated NSIS toolset to **3.12**.
- Removed duplicate `dist/oonx` and `dist/sf2` files from the packaged app to bring the installer under the 2 GB GitHub asset limit.

## [1.2.3] — 2026-07-24

### Added
- **Sound Map city redesign** — denser buildings, districts, parks, water, street labels and a legend.
- **Voice Changer** node with Chipmunk, Monster, Robot, Phone, Alien, Helium and Ghost presets.
- **Random Slice** node for rearranging audio fragments.
- **Echo** node with ping-pong delay (Time, Feedback, Spread).

### Changed
- **Documentation** is now hosted on the GitHub wiki: `https://github.com/FabienCouprie/attic/wiki`. The top toolbar icon opens the wiki instead of the bundled docs.
- Removed bundled `doc/` folder from packaged resources.
- **Sound Map** map size increased to 1400×900 and points limit raised to 200.

## [1.1.1] — 2026-07-18

### Fixed
- **A failed branch now fails the workflow.** A workflow could report "terminé"
  while one of its parallel branches had never actually run. The root cause was
  not the execution order (verified correct) but plugins returning
  `{ valeurs: [null], message }` **without** `erreur: true` — the engine read
  that as a success and the false "terminé" cascaded downstream. Fixed in four
  layers: errors propagate transitively to descendants; an all-null output from
  a node that *has* output ports is treated as a failure; source nodes declare
  failure when nothing is loaded; and a meta node is marked failed as soon as
  one of its inner nodes fails, instead of running on "as if nothing happened".
  Distinct from the 1.1.0 parallel-branch fix, which was about cache
  invalidation, not error propagation.
- **Python and Julia code editing moved to an overlay window.** Two in-node
  attempts failed: a controlled textarea let canvas re-renders scramble
  keystrokes, and an uncontrolled transparent textarea layered over the
  highlighted `<pre>` depended on pixel-perfect layer alignment inside the
  zoomed (`transform: scale`) canvas — caret one step ahead, wrong mouse
  selection, letters landing before the last letter. The node now shows a
  read-only syntax-highlighted preview; clicking it opens a plain, visible
  textarea in a fixed overlay outside the canvas (no transformed ancestor —
  the whole bug class is gone by construction). Native caret, selection,
  undo, copy/paste. Verified: click-to-caret exact (index 12/12), typed text
  inserted at the click point, double-click selects the right word, sync back
  to the node on close/blur/400 ms debounce, Escape closes.
- **Python and Julia processors actually produce output.** `obtenirRepertoireTravail()`
  returns a Promise and was used without `await`: every I/O path was
  `[object Promise]/…`, so scripts ran but their outputs were unreadable — the
  node then showed "Python exécuté · <stdout>" while transmitting nothing.
  Fixed the `await`, made the packaged work dir fall back to `userData/work`
  (creating it under `C:\Program Files` silently failed), and a run that
  produces no readable output is now reported as an **error** naming the
  expected `ATTIC_OUTPUT_*` variables and the work directory.
- **Phaser was inaudible** (measured: output ≈ input, 1.6% deviation). The
  all-pass coefficient had an inverted sign, placing the phase transition near
  20 kHz instead of the swept 200–2000 Hz band. Now produces moving notches
  (measured).
- **Octaver was inoperative.** The "octave up" phase trick never triggered
  (constant 0.5) and "octave down" added the signal every other sample
  (Nyquist modulation). Rewritten with classic analog-pedal techniques:
  full-wave rectification + DC blocker (up), polarity flip every other period
  (down). Energy at 2f and f/2 verified by measurement; docs now explain the
  two sliders (one per added voice).
- **Dereverb was an exact pass-through** (measured tail reduction: none). Its
  peak memory decayed at 60 dB/s — faster than any real reverb tail — so the
  gate never engaged. Recalibrated (20 dB/s, −6 dB knee): tails are now
  attenuated while sustained notes survive (measured).
- **Bookmark downloads in the packaged app** — sound-bank links opened inside
  an Electron window with no download handling; they now open in the system
  browser (`setWindowOpenHandler` + `shell.openExternal`).
- **Ollama "Délai dépassé"** — the node passed no timeout (120 s default),
  which a cold-loading large model (Qwen 3.6 = 24 GB) always exceeded. New
  "Délai max" parameter (default 600 s) and an error message explaining the
  first-call model load.
- **Inspector number fields are clamped** to the parameter's range and step on
  blur — it was possible to type nonsense values (0 bits, out-of-range dB)
  that the DSP silently corrected while the UI displayed them.
- **AI-model cache resilience** — the packaged app (`file://` origin) had its
  Cache Storage bucket evicted under quota pressure, forcing model
  re-downloads after an update. `persistent-storage` is now granted explicitly
  and the boot log reports `persisted()` state and cache usage/quota. (The
  durable file-based cache is recorded in ROADMAP.)
- **Effects measurement bench** (`audio/effets-verification.test.ts`) —
  normalizer, compressor, bitcrusher, phaser, octaver and dereverb are now
  locked by 12 signal-level assertions (an effect regressing to a pass-through
  fails the suite). Compressor and normalizer were verified conform to their
  documented behavior (threshold/ratio/makeup, exact peak target).

### Changed
- **The engine no longer tests plugin ids.** `useExecutionGraphe` special-cased
  `galerie-exposition` and `entree-audio` by id. Two optional `PluginDef`
  properties replace them — `jamaisCache` (never reuse a cached result) and
  `affichageAutonome` (the node drives its own display from `data`) — so the
  behaviour is declared by the sheet and available to any node, in any domain.
- **Core contracts have no default generic.** `PluginDef`, `ContexteExecution`
  and `FonctionPlugin` now require `<TValeur, TRuntime>` explicitly, so a new
  domain cannot silently bind to the audio union. The audio domain declares its
  aliases once in `audio/types-domaine.ts` (`FicheAudio`, `ContexteAudio`, …).

### Added
- **`PORTING-A-DOMAIN.md`** — step-by-step guide to reuse the core, the
  execution engine, the metanodes and the UI shell for a non-audio domain,
  including an honest map of where the UI is still coupled to audio.

## [1.1.0] — 2026-07-16

### Added
- **LLM Ollama node** — text generation via a local Ollama server (Llama, Qwen, Mistral, Phi…). The call runs in the Electron main process, so no CORS/CSP issues; Ollama manages model download/cache/execution outside the renderer, avoiding the WASM memory ceiling. Clear errors when the server is down or the model isn't installed.
- **Text → MIDI node** — renders a simple text notation to a MIDI file **and** synthesized audio. One line per note: `C4 0.5`, chords via `C4+E4+G4 1`, `rest 0.5`, optional leading `TEMPO 120`. Accepts a text input or a parameter.
- **"Compositeur IA (Ollama)" meta-example** — a built-in, pre-wired `Ollama → Text→MIDI` chain (Audio + MIDI outputs) with the composer prompt already set. One drag from the palette; double-click to edit the prompt/model.
- **Exact numeric entry in the Inspector** — a number field beside every slider, so precise values (0, 3.0 s, −37 dB) are reachable instead of fighting the slider.
- **Copy button** on the Color→Sound generated script (like the text output).

### Changed
- **Palette: drag-and-drop only** — clicking a catalog item no longer drops a node at a random spot; only dragging adds a node, at the drop location.
- **Compressor & Normalizer parameter ranges** — Threshold −60→0, Ratio 1→20, Gain −12→24 dB, Level −40→0 dB, etc. (negative-dB params were previously unreachable on a broken 0–100 slider).
- **Loop node** shows `reps × input = total` so an unexpected input length is visible at a glance.
- **AI model memory** is released after each node (worker terminated), keeping only one model resident at a time; and the app requests persistent storage so the on-disk HuggingFace model cache isn't evicted.

### Fixed
- **Sequencers loop seamlessly** — the drum and melodic sequencers now output exactly one bar length (was +0.4/0.5 s of trailing silence), with the decay tail folded onto the start: no gap or click when looped.
- **Meta branch status** — a branch (meta) that produces no result now shows **erreur** and names the failing internal node, instead of staying stuck on "en cours" while the downstream node reads "terminé".
- **Per-node runs are scoped** — running a single node no longer marks disconnected branches as running; running a meta node now actually runs its branch; a following global run is no longer left filtered.
- **Parallel branches** no longer re-execute needlessly when a sibling branch is re-run (over-eager cache invalidation removed).
- **Text-output copy** worked around Electron's clipboard permission (async Clipboard API + `execCommand` fallback) — it was silently failing.
- **Canvas data loss** on save/export — the root graph is captured even from inside a meta, and empty saves/exports are guarded; imports with metas but no canvas nodes now warn instead of silently showing a blank canvas.
- **Plugin errors are logged** (spec §6.5) with node context instead of being swallowed.
- Ollama errors surface the server's message (e.g. `model "X" not found, try pulling it first`).
- Dead-code cleanup: 305 → 28 lint warnings.

## [1.0.5] and earlier

See git history.
