# Attic

> **A visual node-editor for AI-powered music & sound design.**  
> 403 nodes · local ML models · bilingual FR/EN · one-click workflows.

[![GitHub release](https://img.shields.io/github/v/release/FabienCouprie/attic)](https://github.com/FabienCouprie/attic/releases)
[![License](https://img.shields.io/github/license/FabienCouprie/attic)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/FabienCouprie/attic?style=social)](https://github.com/FabienCouprie/attic/stargazers)

Build audio processing graphs by connecting plugin nodes on a canvas, then execute the DAG to produce sound, stems, MIDI, lyrics, or even poetic sound maps.

> ⚠️ **Heads-up:** Attic is a hardcore “vibe coding” experiment — a stress-test of AI-assisted development and a creativity assistant. It intentionally blends serious audio tools with whimsical features to test the flexibility of the underlying framework.

## Features

- **403 plugin nodes** — effects, generators, AI models, collections, separation, visualization, color↔sound, math-formula synthesis (see [`COMPONENTS.md`](COMPONENTS.md), regenerate with `npm run docs:components`)
- **AI integration** (Transformers.js / ONNX Runtime Web):
  - MusicGen — text-to-music generation
  - Whisper (English) — speech-to-text; Sherpa-ONNX ASR — lighter multilingual speech-to-text (99 languages, Whisper tiny). The heavier multilingual Whisper (~1.5 GB) and Whisper-translate nodes were removed in v2.0.0 in favor of Sherpa-ONNX.
  - SpeechT5 / MMS-TTS — text-to-speech (7 voices, 10 languages)
  - DistilGPT-2 / Qwen2.5-0.5B — two separate local lyrics-generation nodes (Qwen2.5 is newer and multilingual)
  - OPUS-MT — translation (18 language pairs)
  - Demucs 6-stem / MDX-Net — AI source separation (drums, bass, vocals, guitar, piano, other)
  - Ollama — local LLMs (Qwen3, Llama, Mistral…) for text/lyrics generation via a local Ollama server
- **Csound wrapper** — five nodes running Csound (WebAssembly): free orchestra and score, MIDI-driven instrument, audio effect, physical-model instruments (wgbow, wgclar, wgflute, wgbrass, wgpluck2, fof2) and spectral processing (pvscross, pvsvoc, mincer)
- **Python Processor** and **Julia Processor** nodes — custom audio/MIDI/text processing in Python or Julia
- **Bilingual UI** (FR/EN) with React 19 + @xyflow/react
- **Node import/export** — package custom nodes as `.zip`, share between installations
- **Metacomponents** — encapsulate sub-graphs as reusable nodes
- **Save/load** — serializes graph + metacomponents to JSON
- **Per-node seeds** — a node that draws at random carries a `Graine` / `Seed` parameter, set where the effect happens and saved with the node like any other parameter. `0` means "draw one each run", and the node then reports the seed it used so a run worth keeping can be reproduced by copying that value back. Where randomness is an implementation detail rather than the effect — reverb tails, phase randomization, palette extraction — the default is a fixed value instead, because a render that changes on every run is a defect. `src/core/hasard-couverture.test.ts` inventories every file still calling `Math.random()` directly, checks structurally that each is either a seed draw or a unique-id generator, and fails both when a new one appears and when a migrated one is left behind
- **Prompt-to-graph** — type a keyword, get a pre-wired graph (55+ keywords)
- **Auto-update** via electron-updater (GitHub Releases) — manual check, no auto-download
- **System audio capture** — record audio from other applications
- **Embedded subtractive synthesizer** meta-component example
- **10 effects** left in the catch-all family; the rest are sorted into fifteen families — reverberation, echo, stretching, spectrum, topology, denoising, tempo, pitch, logistic, equalisation and filters, stereo, distortion and modulation, order and inversions, instruments, MIDI patterns — including: spectrum stretch, spectral arpeggio, window shuffle, harmonic sieve and filtering by a spectrum (after the Composers' Desktop Project), tuned comb filters, varispeed under a curve, two-sound convolution, tuned resonators excited by any sound, self-regulating granular ecosystem (after Di Scipio), wavelet transform with Donoho thresholding, atomic decomposition (matching pursuit on a Gabor dictionary), particle synthesis (Brandtsegg's unified model: grains, pulsars, glissons, trainlets, granulation), spectral tracing, spectral blur, spectral freeze, inner glissando, brassage and envelope transfer (after Wishart), Doppler, tape machine, ducking, ambisonic rotation, MIDI pattern transformations (impose rhythm, note echo, thin out, ply and rotate, retrograde and palindrome), physical models (shakers, wind instruments, modal bars), scanned synthesis, wave terrain, FOF vowels, serial operations, negative harmony, voicings, Tonnetz, Markov chains, historical temperaments, tremolo, phaser, vibrato, octaver, chopper, wah-wah, polarity inversion, pitch correction, bass mono, spectral morphing, gated reverb, shimmer, stereo spatialization, auto-pan, slide stretch, bitcrusher, ring modulator, de-esser, gate/expander, spaciousness (velvet-noise early reflections), convolution reverb, formant shifter, logistic-map echo/chopper/paulstretch, beat repeat
- **Multichannel family** — a spatialiser writing trajectories into concert rings (VBAP), 5.1 to 7.1.4 (ITU-R BS.2051) or AmbiX ambisonics up to order 3; an ambisonic decoder (max-rE); sound objects rendered to any layout chosen at render time; binaural monitoring through virtual speakers; the layout travels with the audio through ordinary effects, and multichannel WAV files carry their channel mask
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
npm test     # Vitest — the full unit test suite
npm run lint # oxlint
```

## ONNX Models

AI models (Demucs, MDX-Net, Stable Audio 3) are distributed via `extraResources` (outside asar). They are excluded from git (too large) and downloaded separately as part of the release build (`assets.zip`, see Releasing below). See `public/oonx/` for model storage.

The Sherpa-ONNX ASR node needs five browser WASM files in `public/sherpa-onnx-wasm/`. They are fetched from the `assets` release by `scripts/download-sherpa-wasm.cjs`, run from `postinstall`, and each is checked against a SHA-256 pinned in that script — this is executable WebAssembly, so a file that does not match is refused rather than installed. They used to come from the `@siteed/sherpa-onnx.rn` npm package: 864 MB installed for 12.8 MB actually used, none of its JavaScript ever imported, dragging a React Native toolchain (Metro, Expo) that this Electron app never loads and that carried four unfixable advisories. No upstream replacement exists — the official `sherpa-onnx` package ships only a Node build, and k2-fsa publishes no WASM release assets — so the files are pinned at the version that package shipped.

SDXS-512 (`texte-image` node) is now part of the build-time asset pipeline and bundled with the installer (~680 MB, see the `assets` release). The node still accepts a custom model folder via the "Chemin modèle" / "Model path" parameter.

**Important**: All Transformers.js models must use `dtype: "fp32"` + `device: "wasm"` + `env.backends.onnx.wasm.proxy = true`. Quantized models (`q8`) cause `DequantizeLinear` errors with onnxruntime-web 1.26+.

## Project Structure

```
src/
  core/          # Framework (registry, DAG, types, metacomponents)
  audio/         # Audio domain (DSP, effects, generators, MIDI, FFT)
  plugins/       # Plugin node definitions (403 nodes)
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
- [`COMPONENTS.md`](COMPONENTS.md) — Generated catalog of every node, with its ports and parameters (regenerate with `npm run docs:components`; a test fails when it no longer matches the registry)
- [`LINE-COUNT.md`](LINE-COUNT.md) — Generated per-file line counts of `src/`
- [`APP-BREAKDOWN.md`](APP-BREAKDOWN.md) — Historical record of the `App.tsx` → hooks extraction (a completed milestone; `App.tsx` has since grown again as features were added)
- [`EXERCISE-WORKBOOK.md`](EXERCISE-WORKBOOK.md) — Guided exercises for learning the app
- [`SECURITY.md`](SECURITY.md) — Vulnerability reporting policy
- [`TERMS_OF_USE.md`](TERMS_OF_USE.md) — Terms of use

## Releasing

Pushing a `v*.*.*` tag triggers the `Release Electron` workflow (`.github/workflows/release.yml`), which builds and publishes the Windows installer.

The bundled AI models (`public/oonx`) and SoundFont (`public/sf2`) are **not stored in Git**. They are packaged as `assets.zip` on the dedicated [`assets`](https://github.com/FabienCouprie/attic/releases/tag/assets) release. The workflow downloads and extracts this archive before building.

If you update the models or SoundFont, recreate `assets.zip` and re-upload it to the `assets` release. **Nothing checks this**: the workflow extracts whatever `assets.zip` currently holds, so a forgotten upload silently ships an installer with stale models — no warning, no build failure.

The **Audiobox Aesthetics** model used by the Aesthetic Score and Aesthetic Comparison nodes (`audiobox-aesthetics.onnx`, 420 MB) is published on its own on the same release and fetched by `npm run download:audiobox-aesthetics`, which checks its size and SHA-256 before installing it into `public/oonx`. To regenerate it, see `scripts/export-audiobox-aesthetics.py`; a new file means a new expected SHA-256 in the download script.

The demo **`music collection`** — opened by default by the Music player, Sound Map and Music explorer, and used by the training exercises — is not in Git either. It is published as `music-collection.zip` on the same release, and `scripts/music-collection.manifest.json` (versioned) lists the name, size and SHA-256 of every file. `npm run download:music-collection` fetches what is missing and refuses an archive that does not match the manifest; it never overwrites a local file that differs. **If you change the collection**, run `node scripts/download-music-collection.cjs --pack <path>.zip`, which rewrites the manifest and builds the archive, upload the archive with `gh release upload assets <path>.zip --clobber`, and commit the manifest.

**Every `build.extraResources` entry is checked twice** by `scripts/verify-bundled-resources.cjs`: before packaging (the source exists and is not empty) and after (`--paquet release/win-unpacked/resources`: same file count and size inside the built app). electron-builder only *warns* when a source is missing, and packages without it — this is how the 3.x installers built by the workflow shipped without `music collection`. Both checks fail the job.

> **Do not build and upload the installer by hand.** It looks equivalent and is not. `electron-builder` emits `latest.yml` alongside the `.exe`, and `electron-updater` fetches that file *first*: without it, every installed client fails its update check with `Cannot find latest.yml in the latest release artifacts`, while the release page still looks complete. Releases 3.1.0 and 3.1.1 shipped that way and had no working auto-update until 3.1.3. A hand-made build also skips what the workflow does on purpose — disabling asar (packaging this app's bundled assets into a single archive exhausts memory) and pruning `dependencies` to the four modules the main process actually loads.
>
> Push the tag and let the workflow publish. If its output is wrong, fix the workflow rather than working around it.

## License

MIT — see [LICENSE](LICENSE)

Powered by Stability AI — the "Text to music" node runs Stable Audio 3 small-music, licensed under
the [Stability AI Community License](https://stability.ai/community-license-agreement). Model
licences and required attributions are listed in [THIRD_PARTY.md](THIRD_PARTY.md); note that the
Demucs weights are provided for scientific, non-commercial use only
