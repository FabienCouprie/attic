# Changelog

All notable changes to Attic. Format based on [Keep a Changelog](https://keepachangelog.com/).

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
