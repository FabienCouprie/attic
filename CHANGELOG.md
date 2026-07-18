# Changelog

All notable changes to Attic. Format based on [Keep a Changelog](https://keepachangelog.com/).

## [1.1.1] — unreleased

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
- **Python and Julia processors are writable again.** Typed text no longer lands
  away from the caret and mouse selection now selects what you point at: the
  editors debounce their global sync and are isolated from React Flow's
  pointer/key handling. Copy, cut, paste and Ctrl+Z work.

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
