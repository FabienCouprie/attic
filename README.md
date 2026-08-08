# Attic

Nodal audio processing framework with AI integration. Build audio processing graphs by connecting plugin nodes on a canvas, then execute the DAG to produce results.

"This is not a professional piece of software; it is a pure, hardcore 'vibe coding' test, born out of self-training. The goal is twofold:

  1 - To get a clear sense of the capabilities and limitations of extreme vibe coding (where the pilot hasn't typed a single line of code, nor referred to any documentation other than this single paragraph).

  2 - To obtain a reusable framework (UI + core) for other use cases.

It was built by dialing the whimsicality up to eleven, intentionally blending serious features with utterly improbable ones to stress-test the robustness and flexibility of the underlying framework. It is designed to be a creativity assistant, allowing you to chain together elements in two clicks that would normally be difficult to connect."

## Features

- **213 plugin nodes** — effects, generators, AI models, collections, separation, visualization, color↔sound, math-formula synthesis (see [`COMPONENTS.md`](COMPONENTS.md), regenerate with `npx tsx scripts/generate-components-md.ts`)
- **AI integration** (Transformers.js / ONNX Runtime Web):
  - MusicGen — text-to-music generation
  - Whisper (English) — speech-to-text; Sherpa-ONNX ASR — lighter multilingual speech-to-text (99 languages, Whisper tiny). The heavier multilingual Whisper (~1.5 GB) and Whisper-translate nodes were removed in v2.0.0 in favor of Sherpa-ONNX.
  - SpeechT5 / MMS-TTS — text-to-speech (7 voices, 10 languages)
  - DistilGPT-2 / Qwen2.5-0.5B — two separate local lyrics-generation nodes (Qwen2.5 is newer and multilingual)
  - OPUS-MT — translation (18 language pairs)
  - Demucs 6-stem / MDX-Net — AI source separation (drums, bass, vocals, guitar, piano, other)
  - Ollama — local LLMs (Qwen3, Llama, Mistral…) for text/lyrics generation via a local Ollama server
- **Python Processor** and **Julia Processor** nodes — custom audio/MIDI/text processing in Python or Julia
- **Bilingual UI** (FR/EN) with React 19 + @xyflow/react
- **Node import/export** — package custom nodes as `.zip`, share between installations
- **Metacomponents** — encapsulate sub-graphs as reusable nodes
- **Save/load** — serializes graph + metacomponents to JSON
- **Prompt-to-graph** — type a keyword, get a pre-wired graph (55+ keywords)
- **Auto-update** via electron-updater (GitHub Releases) — manual check, no auto-download
- **System audio capture** — record audio from other applications
- **Embedded subtractive synthesizer** meta-component example
- **48 effects** including: tremolo, phaser, vibrato, octaver, chopper, wah-wah, stereo spatialization, auto-pan, slide stretch, bitcrusher, ring modulator, de-esser, gate/expander, convolution reverb, formant shifter, logistic-map echo/chopper/paulstretch, beat repeat
- **Text → MIDI node** — render a simple text notation (or an LLM's output) to MIDI + synthesized audio, powering the "LLM composer" workflow (Ollama → Text→MIDI)

## Architecture

Three-layer architecture with a strict separation rule: **never touch `core/`** — plugins define nodes, UI is generic, audio is the domain layer.

| Layer | Role | Domain-specific? |
|---|---|---|
| `core/` | Registry, DAG engine, metacomponents, validation, i18n | No |
| Domain adapter | Flux types, plugins, views, audio processing | Yes |
| `ui/` (shell) | Palette, canvas, inspector, generic node renderer | No (registry-driven) |

See [`PORTING-A-DOMAIN.md`](PORTING-A-DOMAIN.md) for the concrete plugin/UI contract
(with the two places it still leaks domain knowledge into the generic layers), and
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the ongoing architecture cleanup plan.

## Tech Stack

- **Electron** 43 + **Vite** 8 + **React** 19 + **TypeScript** 6
- **@xyflow/react** — nodal canvas
- **@huggingface/transformers** 4.2 + **onnxruntime-web** — AI inference (WASM, fp32)
- **electron-updater** — automatic updates
- **Vitest** — unit tests

## Getting Started

### Prerequisites

- Node.js 18+ (tested with v24.18.0)
- Python 3.x (optional, for the Python Processor node)
- Julia (optional, for the Julia Processor node)
- Ollama (optional, for the LLM Ollama node)

### Install

```bash
npm install
```

### Development

```bash
npm run dev          # Vite dev server only
npm run dev:electron # Vite + Electron (full app)
```

### Build

```bash
npm run build           # TypeScript + Vite (renderer only)
npm run build:electron  # Full Electron app (NSIS installer for Windows)
```

`npm run build:electron` runs `scripts/build-electron.cjs`. This script temporarily sets `"packageManager": "traversal"` in `package.json` so electron-builder uses manual node_modules traversal instead of `npm list`, which exhausts memory on this app's large dependency tree. It also sets `NODE_OPTIONS=--max-old-space-size=32000`, cleans the `release/` directory before packaging, and copies the local Electron distribution aside to `electron-dist/` (passed to electron-builder via `electronDist`) so packaging doesn't re-extract and rename Electron's zip in place — a step that used to race with antivirus real-time scanning and fail intermittently with `EPERM`. The original `package.json` is restored when the build finishes.

### Publish a release

The recommended way is to push a semver tag; the GitHub Actions workflow handles the build and upload automatically:

```bash
git checkout master
git pull origin master
npm version patch   # or minor / major — updates package.json and creates a tag
git push origin master --follow-tags
```

The workflow `.github/workflows/release.yml` uses the native `GITHUB_TOKEN` (no personal token needed) and uploads the installer + `latest.yml` to GitHub Releases.

For local testing only (not recommended for production releases):

```bash
npm run build:electron
```

If you still have an old `GH_TOKEN` classic personal access token used for previous releases, revoke it at https://github.com/settings/tokens.

### Tests & Lint

```bash
npm test     # Vitest (418 tests across 61 files)
npm run lint # oxlint
```

## ONNX Models

AI models (Demucs, MDX-Net, Stable Audio 3) are distributed via `extraResources` (outside asar). They are excluded from git (too large) and downloaded separately as part of the release build (`assets.zip`, see Releasing below). See `public/oonx/` for model storage.

SDXS-512 (`texte-image` node) is now part of the build-time asset pipeline and bundled with the installer (~680 MB, see the `assets` release). The node still accepts a custom model folder via the "Chemin modèle" / "Model path" parameter.

**Important**: All Transformers.js models must use `dtype: "fp32"` + `device: "wasm"` + `env.backends.onnx.wasm.proxy = true`. Quantized models (`q8`) cause `DequantizeLinear` errors with onnxruntime-web 1.26+.

## Project Structure

```
src/
  core/          # Framework (registry, DAG, types, metacomponents)
  audio/         # Audio domain (DSP, effects, generators, MIDI, FFT)
  plugins/       # Plugin node definitions (213 nodes)
  ui/            # React UI (canvas, inspector, views, hooks)
  workers/       # Web Workers (AI inference: ASR, TTS, MusicGen, OPUS-MT)
  i18n.tsx       # Bilingual FR/EN
electron/
  main.cjs       # Main process (IPC, Python detection, CSP, auto-updater)
  preload.cjs    # Context bridge
  demucs.cjs     # Demucs separation handler
```

## Documentation

- [`CHANGELOG.md`](CHANGELOG.md) — Release notes per version
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Diagnostic and architecture cleanup plan
- [`ROADMAP.md`](ROADMAP.md) — Project roadmap (4 visions), re-verified against the code periodically
- [`PORTING-A-DOMAIN.md`](PORTING-A-DOMAIN.md) — How to plug a second domain (e.g. image, ETL) into the existing core/UI, and exactly where that isn't clean yet
- [`ADDING-A-NODE.md`](ADDING-A-NODE.md) — How to add a new plugin node
- [`REMOVING-A-NODE.md`](REMOVING-A-NODE.md) — How to safely remove one
- [`COMPONENTS.md`](COMPONENTS.md) — Generated dictionary of every catalog node (not versioned — regenerate with `npx tsx scripts/generate-components-md.ts`)
- [`LINE-COUNT.md`](LINE-COUNT.md) — Generated per-file line counts of `src/`
- [`APP-BREAKDOWN.md`](APP-BREAKDOWN.md) — Historical record of the `App.tsx` → hooks extraction (a completed milestone; `App.tsx` has since grown again as features were added)
- [`EXERCISE-WORKBOOK.md`](EXERCISE-WORKBOOK.md) — Guided exercises for learning the app
- [`SECURITY.md`](SECURITY.md) — Vulnerability reporting policy
- [`TERMS_OF_USE.md`](TERMS_OF_USE.md) — Terms of use

## Releasing

Pushing a `v*.*.*` tag triggers the `Release Electron` workflow (`.github/workflows/release.yml`), which builds and publishes the Windows installer.

The bundled AI models (`public/oonx`) and SoundFont (`public/sf2`) are **not stored in Git**. They are packaged as `assets.zip` on the dedicated [`assets`](https://github.com/FabienCouprie/attic/releases/tag/assets) release. The workflow downloads and extracts this archive before building.

If you update the models or SoundFont, recreate `assets.zip` and re-upload it to the `assets` release.

## License

MIT — see [LICENSE](LICENSE)
