# Attic

Nodal audio processing framework with AI integration. Build audio processing graphs by connecting plugin nodes on a canvas, then execute the DAG to produce results.

"This is not a professional piece of software; it is a pure, hardcore 'vibe coding' test, born out of self-training. The goal is twofold:

  1 - To get a clear sense of the capabilities and limitations of extreme vibe coding (where the pilot hasn't typed a single line of code, nor referred to any documentation other than this single paragraph).

  2 - To obtain a reusable framework (UI + core) for other use cases.

It was built by dialing the whimsicality up to eleven, intentionally blending serious features with utterly improbable ones to stress-test the robustness and flexibility of the underlying framework. It is designed to be a creativity assistant, allowing you to chain together elements that would normally be highly difficult to connect."

## Features

- **70+ plugin nodes** — effects, generators, AI models, collections, separation, visualization
- **AI integration** (Transformers.js / ONNX Runtime Web):
  - MusicGen — text-to-music generation
  - Whisper — speech-to-text (English + multilingual, 99 languages)
  - SpeechT5 / MMS-TTS — text-to-speech (7 voices, 10 languages)
  - GPT-2 / OPUS-MT — lyrics generation + translation (18 language pairs)
  - Demucs 6-stem / MDX-Net — AI source separation (drums, bass, vocals, guitar, piano, other)
- **Python Processor node** — write custom audio/MIDI/text processing in Python (numpy + wave), executed via detected Python installation
- **Bilingual UI** (FR/EN) with React 19 + @xyflow/react
- **Node import/export** — package custom nodes as `.zip` (manifest + executer + notice + dependencies), persisted in localStorage
- **Metacomponents** — encapsulate sub-graphs as reusable nodes
- **Save/load** — serializes graph + metacomponents to JSON
- **Prompt-to-graph** — type a keyword, get a pre-wired graph (55 keywords)
- **Auto-update** via electron-updater (GitHub Releases)
- **176 exercises** in 22 categories (`CAHIER-EXERCICES.md`)

## Architecture

Three-layer architecture with a strict separation rule: **never touch `core/`** — plugins define nodes, UI is generic, audio is the domain layer.

| Layer | Role | Domain-specific? |
|---|---|---|
| `core/` | Registry, DAG engine, metacomponents, validation, i18n | No |
| Domain adapter | Flux types, plugins, views, audio processing | Yes |
| `ui/` (shell) | Palette, canvas, inspector, generic node renderer | No (registry-driven) |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full technical spec.

## Tech Stack

- **Electron** 35 + **Vite** 8 + **React** 19 + **TypeScript** 6
- **@xyflow/react** — nodal canvas
- **@huggingface/transformers** 4.2 + **onnxruntime-web** — AI inference (WASM, fp32)
- **electron-updater** — automatic updates
- **Vitest** — unit tests

## Getting Started

### Prerequisites

- Node.js 18+ (tested with v24.18.0)
- Python 3.x (optional, for the Python Processor node)

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

### Publish a release

```bash
GH_TOKEN=your_token npm run publish:electron
```

This builds the app and uploads the installer + `latest.yml` to GitHub Releases. Users with the app installed will receive the update automatically.

### Tests & Lint

```bash
npm test     # Vitest (26 unit tests)
npm run lint # oxlint
```

## ONNX Models

AI models (Demucs, MDX-Net) are distributed via `extraResources` (outside asar). They are excluded from git (too large) and downloaded separately. See `public/oonx/` for model storage.

**Important**: All Transformers.js models must use `dtype: "fp32"` + `device: "wasm"` + `env.backends.onnx.wasm.proxy = true`. Quantized models (`q8`) cause `DequantizeLinear` errors with onnxruntime-web 1.26+.

## Project Structure

```
src/
  core/          # Framework (registry, DAG, types, metacomponents)
  audio/         # Audio domain (DSP, effects, generators, MIDI, FFT)
  plugins/       # Plugin node definitions (70+ nodes)
  ui/            # React UI (canvas, inspector, views, hooks)
  workers/       # Web Workers (AI inference: ASR, TTS, MusicGen, OPUS-MT)
  i18n.tsx       # Bilingual FR/EN
electron/
  main.cjs       # Main process (IPC, Python detection, CSP, auto-updater)
  preload.cjs    # Context bridge
  demucs.cjs     # Demucs separation handler
```

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Technical framework spec
- [`ROADMAP.md`](ROADMAP.md) — Project roadmap (4 visions)
- [`EXERCISE-WORKBOOK.md`](EXERCISE-WORKBOOK.md) — 176 exercises in 22 categories
- [`ADDING-A-NODE.md`](ADDING-A-NODE.md) — How to add a new plugin node
- [`APP-BREAKDOWN.md`](APP-BREAKDOWN.md) — App.tsx decomposition report

## License

MIT — see [LICENSE](LICENSE)
